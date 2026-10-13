// Verificazione periodica (visita fiscale), sul modello della procedura di EpsonFpWizard.
// Un solo pulsante esegue in automatico tutti i passi (controlli, orologio, rete, diagnostica,
// documenti di prova, chiusura, registrazione intervento, MPD, MPR, data prossima VP, riepilogo)
// e al termine mostra un'unica finestra con tutti gli esiti. I singoli passi restano ripetibili.

import { $, $$, esc, toast, confirmBox, openSheet, task, saveFile, fresh, copyText, store } from '../ui.js';
import { current, cache, saveCache, call, ensureDayClosed } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

const STEPS = [
  ['dati', 'Dati dell\'intervento'],
  ['pre', 'Controlli preliminari'],
  ['visiva', 'Verifica visiva e funzionale'],
  ['orologio', 'Orologio'],
  ['rete', 'Rete e server Agenzia Entrate'],
  ['diag', 'Stampa diagnostica'],
  ['prep', 'Preparazione stampante'],
  ['doc', 'Documenti di prova'],
  ['z', 'Chiusura giornaliera'],
  ['reg', 'Registrazione intervento (Agenzia Entrate)'],
  ['mpd', 'Stampa giornale elettronico (MPD)'],
  ['mpr', 'Stampa memoria fiscale (MPR)'],
  ['data', 'Data prossima verificazione'],
  ['print', 'Stampa riepilogo'],
];
const titleOf = (id) => STEPS.find((x) => x[0] === id)?.[1] || id;
/** Passi che, se falliscono, fermano la procedura automatica prima delle operazioni fiscali. */
const BLOCKING = ['dati', 'pre', 'prep', 'doc'];

const VIS_CHECKS = [
  ['sigilli', 'Sigilli integri e targhetta con la matricola coincidente con quella del libretto'],
  ['display', 'Visori: tutte le cifre e i segmenti si accendono correttamente'],
  ['tastiera', 'Tastiera: tutti i tasti funzionano'],
  ['stampa', 'Stampa leggibile, taglio carta regolare'],
];
const END_CHECKS = [
  ['bollino', 'Applicato il contrassegno / bollino della verificazione periodica'],
  ['libretto', 'Intervento registrato nel libretto elettronico (portale Agenzia delle Entrate)'],
];

const eur = (v) => Number(v).toFixed(2).replace('.', ',');
const pad = (v, n) => String(v ?? '').padStart(n, '0');
const ddmmyyyy = (s) => String(s || '').replace(/\D/g, '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '—');
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const deviceName = () => (/iPhone/i.test(navigator.userAgent) ? 'iPhone' : /iPad/i.test(navigator.userAgent) ? 'iPad' : 'dispositivo');
const baseUrl = (p) => fp.printerUrl(p, 1).replace(/\/cgi-bin.*$/, '');
const validAmount = (v) => Number(v) >= 1.01 && Math.round(Number(v) * 100) % 100 !== 0;

/** Spezza le righe per la stampa (40 colonne, compatibile con entrambe le larghezze). */
function wrapLines(rows, width = 40) {
  const out = [];
  for (const row of rows) {
    let t = C.toPrinterText(row);
    while (t.length > width) {
      let cut = t.lastIndexOf(' ', width);
      if (cut < width / 2) cut = width;
      out.push(t.slice(0, cut).trimEnd());
      t = '  ' + t.slice(cut).trimStart();
    }
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sessione e dati ricordati
// ---------------------------------------------------------------------------

/** Dati del tecnico memorizzati sul dispositivo («Ricorda i miei dati»). */
const REMEMBER_KEYS = ['tecnico', 'cf', 'piva', 'sigillo', 'reparto', 'prezzo1', 'prezzo2', 'sim', 'password'];
const remembered = () => store.get('tecnico', null);

function defaultVpTarget() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 24, 1);
}

function newSession(p) {
  const t = defaultVpTarget();
  return {
    started: new Date().toISOString(),
    printer: { name: p.name, host: p.host },
    form: {
      tecnico: '', cf: '', piva: '', sigillo: '', sim: true, reparto: 1, prezzo1: 1.23, prezzo2: 2.34, lotteria: '', password: '12345',
      vpMonth: t.getMonth() + 1, vpYear: t.getFullYear(),
      ...(remembered() || {}),
    },
    steps: {}, info: {}, restore: {}, docs: [],
    // controlli visivi già spuntati: il tecnico toglie la spunta solo se trova un problema
    checks: Object.fromEntries(VIS_CHECKS.map(([k]) => [k, true])),
  };
}

function validateForm(fm) {
  const err = [];
  if (!fm.tecnico) err.push('nome del tecnico');
  if (fm.cf && !C.isValidCF(fm.cf)) err.push('codice fiscale del tecnico (non valido)');
  if (fm.piva && !(/^IT\d{11}$/i.test(fm.piva) && C.isValidPIva(String(fm.piva).slice(2)))) err.push('partita IVA laboratorio (IT + 11 cifre valide)');
  if (!(fm.reparto >= 1 && fm.reparto <= 99)) err.push('reparto (1–99)');
  if (!validAmount(fm.prezzo1) || !validAmount(fm.prezzo2)) err.push('importi (min 1,01 € con centesimi diversi da zero)');
  if (fm.lotteria && !/^[A-Z0-9]{8}$/i.test(fm.lotteria)) err.push('codice lotteria (8 caratteri)');
  if (!(fm.vpMonth >= 1 && fm.vpMonth <= 12 && fm.vpYear >= 2024 && fm.vpYear <= 2099)) err.push('data prossima verificazione');
  return err;
}

function setStep(s, id, status, lines = [], note = '') {
  s.steps[id] = { status, lines, note, at: new Date().toISOString() };
  saveCache();
}
const worst = (lines) => (lines.some((l) => l[2] === 'err') ? 'ko' : lines.some((l) => l[2] === 'warn') ? 'warn' : 'ok');
const isDone = (s, id) => ['ok', 'warn', 'skip'].includes(s.steps[id]?.status);

// ---------------------------------------------------------------------------
// Utilità stampante
// ---------------------------------------------------------------------------

async function readFlag(p, n) {
  const r = await fp.directIO(p, C.CMD.READ_FLAG, C.num(n, 2), { allowFail: true, label: `Lettura flag ${n}` });
  const d = r.response.success ? C.decodeFlag(n, r.data) : { ok: false };
  return d.ok ? d.value : null;
}
async function setFlag(p, n, v) {
  await fp.directIO(p, C.CMD.SET_FLAG, C.encodeFlag(n, v), { label: `Flag ${n} = ${v}` });
}
async function restoreFlags(p, s, list) {
  const errors = [];
  for (const n of list) {
    try { await setFlag(p, Number(n), s.restore[n]); delete s.restore[n]; } catch (e) { errors.push(`flag ${n}: ${e.message}`); }
  }
  saveCache();
  if (errors.length) throw new Error(`Ripristino non completo (${errors.join('; ')})`);
}
const itemXml = (s, tag, price) => fp.el(tag, { operator: '1', description: 'VERIFICAZIONE PERIODICA', quantity: '1', unitPrice: eur(price), department: String(s.form.reparto), justification: '1' });
const ref = (d, serial) => `${pad(d.z, 4)} ${pad(d.n, 4)} ${ddmmyyyy(d.date)} ${serial}`;

// ---------------------------------------------------------------------------
// Passi (senza interfaccia: usati sia dalla procedura automatica sia dai singoli pulsanti)
// ---------------------------------------------------------------------------

const STEP = {
  async dati(p, s) {
    const fm = s.form;
    const err = validateForm(fm);
    if (err.length) throw new Error(`Controlla i dati: ${err.join(', ')}`);
    fm.cf = String(fm.cf || '').toUpperCase(); fm.piva = String(fm.piva || '').toUpperCase(); fm.lotteria = String(fm.lotteria || '').toUpperCase();
    setStep(s, 'dati', 'ok', [['Tecnico', fm.tecnico], ['Sigillo / marchio', fm.sigillo || '—'], ['Simulazione', fm.sim ? 'Sì' : 'No']]);
  },

  async pre(p, s, ctx) {
    const lines = [];
    const st = await call((pr) => fp.queryStatus(pr, 0));
    ctx.text('Stato RT…');
    let rt = null;
    try { rt = await fp.queryStatus(p, 1); } catch { /* stampante non RT */ }
    ctx.text('Matricola…');
    const ser = C.decodeSerial((await fp.directIO(p, C.CMD.READ_SERIAL, '01', { allowFail: true, label: 'Lettura matricola' })).data);
    const flags = {};
    for (const n of [58, 59, 61, 62, 63, 68]) { ctx.text(`Flag ${n}…`); flags[n] = await readFlag(p, n); }
    const serial11 = C.rtSerial(ser, rt?.rtType);
    Object.assign(s.info, { cpuRel: st.cpuRel, mfRel: st.mfRel, fpStatus: st.fpStatus, serial: ser.ok ? ser : null, serial11, model: ser.model, modelName: ser.modelName, rtType: rt?.rtType, flags, rtMain: rt?.rtMainStatus, dailyOpen: rt?.rtDailyOpen === '1' });

    lines.push(['Modello', ser.ok ? ser.modelName : 'non letto', ser.ok ? '' : 'warn']);
    lines.push(['Matricola', serial11 || (ser.ok ? ser.extended : 'non letta'), serial11 ? '' : 'err']);
    lines.push(['Firmware / MPR', `${st.cpuRel || '?'} / ${st.mfRel || '?'}`]);
    const [pr, ej, , doc, mode] = String(st.fpStatus || '').split('');
    lines.push(['Stampante', C.decodeFpStatus(st.fpStatus)[0]?.[1] || '?', pr === '0' ? 'ok' : pr === '2' ? 'warn' : 'err']);
    lines.push(['Giornale elettronico (MPD)', C.decodeFpStatus(st.fpStatus)[1]?.[1] || '?', ej === '0' ? 'ok' : ej === '1' ? 'warn' : 'err']);
    lines.push(['Documento', doc === '1' ? 'Nessun documento aperto' : 'Documento aperto: chiuderlo o fare reset', doc === '1' ? 'ok' : 'err']);
    lines.push(['Stato operativo', mode === '0' ? 'Registrazione' : 'Stampante in stato X, Z o SET: uscire dal menu', mode === '0' ? 'ok' : 'err']);
    if (rt) {
      lines.push(['Stato RT', `${C.RT_MAIN[rt.rtMainStatus] || rt.rtMainStatus} / ${rt.rtSubStatus}`, rt.rtMainStatus === '02' ? 'ok' : 'warn']);
      lines.push(['Giornata aperta', rt.rtDailyOpen === '1' ? 'Sì – verrà proposta la chiusura' : 'No', rt.rtDailyOpen === '1' ? 'warn' : 'ok']);
      if (rt.rtFileRejected && rt.rtFileRejected !== '0') lines.push(['File rifiutati', rt.rtFileRejected, 'warn']);
    } else lines.push(['Stato RT', 'non disponibile', 'warn']);
    if (flags[63] === 1) lines.push(['Modalità Demo RT', 'Attiva: la verificazione non è consentita', 'err']);
    if (flags[62] === 1) lines.push(['Modalità simulazione', 'Già attiva', 'warn']);
    if (ser.model === 'EA') lines.push(['Server RT', 'La procedura non è valida per il Server RT', 'err']);
    setStep(s, 'pre', worst(lines), lines);
  },

  async visiva(p, s) {
    // mostra tutti gli 8 sul visore per il controllo dei segmenti (facoltativo)
    try { await fp.displayText(p, '8'.repeat(40)); } catch { /* visore assente */ }
    const miss = VIS_CHECKS.filter(([k]) => !s.checks[k]);
    setStep(s, 'visiva', miss.length ? 'ko' : 'ok', VIS_CHECKS.map(([k, t]) => [t, s.checks[k] ? 'Verificato' : 'Non verificato', s.checks[k] ? 'ok' : 'err']),
      miss.length ? 'Se sigilli o targhetta non sono integri la verificazione non può essere completata.' : '');
  },

  async orologio(p, s, ctx, { auto = false } = {}) {
    let d = await call((pr) => fp.getDate(pr));
    let diff = Math.round((d - new Date()) / 60000);
    let aligned = false;
    if (Math.abs(diff) > 2 && auto) {
      ctx.text('Allineamento orologio…');
      if (await ensureDayClosed(p, 'allineare l\'orologio')) {
        await fp.setDate(p, new Date());
        d = await fp.getDate(p);
        diff = Math.round((d - new Date()) / 60000);
        aligned = true;
      }
    }
    const ok = Math.abs(diff) <= 2;
    setStep(s, 'orologio', ok ? 'ok' : 'ko', [
      ['Stampante', d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })],
      ['Telefono', new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })],
      ['Differenza', `${diff} minuti${aligned ? ' (allineato)' : ''}`, ok ? 'ok' : 'err'],
    ], ok ? '' : 'Orologio disallineato: allinealo (richiede la giornata chiusa).');
  },

  async rete(p, s, ctx) {
    const tests = [[1, 'Ping gateway', 20000], [2, 'Ping DNS', 25000], [3, 'Server Agenzia Entrate', 60000]];
    const lines = [];
    for (const [t, label, tmo] of tests) {
      ctx.text(`${label}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD_VP.NET_TEST, String(t), { timeout: tmo, allowFail: true, label }));
      lines.push([label, r.response.success ? 'OK' : fp.errorMessage(r.response), r.response.success ? 'ok' : 'err']);
    }
    s.info.net = lines.map(([k, v]) => `${k}: ${v}`);
    setStep(s, 'rete', worst(lines), lines, 'L\'esito compare anche sul visore della stampante (RESULT = OK).');
  },

  async diag(p, s) {
    const i = s.info;
    const st = await call((pr) => fp.queryStatus(pr, 0));
    let dt = '';
    try { dt = (await fp.getDate(p)).toLocaleString('it-IT'); } catch { /* opzionale */ }
    const rows = [
      'CONTROLLO DIAGNOSTICO', `MODELLO ${i.modelName || '?'}`, `MATRICOLA ${i.serial11 || '?'}`,
      `FIRMWARE FISCALE ${st.cpuRel || '?'}`, `FIRMWARE MPR ${st.mfRel || '?'} STATO ${st.mfStatus ?? '?'}`,
      ...C.decodeFpStatus(st.fpStatus).map(([k, v]) => `${k}: ${v}`.toUpperCase()),
      `OROLOGIO STAMPANTE ${dt}`, `OROLOGIO TELEFONO  ${new Date().toLocaleString('it-IT')}`,
      ...(i.net || []).map((x) => x.toUpperCase()),
      'CIFRE E CARATTERI', '1 2 3 4 5 6 7 8 9 0 , . - `', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'CONTROLLO STAMPANTE FISCALE ........... OK',
    ];
    await fp.printNonFiscal(p, wrapLines(rows));
    setStep(s, 'diag', 'ok', [['Documento gestionale', 'Stampato']]);
  },

  async prep(p, s, ctx) {
    if (s.info.flags?.[63] === 1) throw new Error('Modalità Demo RT attiva: la verificazione non è consentita');
    if (!await ensureDayClosed(p, 'iniziare le prove')) throw new Error('Chiusura giornaliera non eseguita: prove annullate');
    const lines = [];
    const want = { 61: 0, 68: 0 };
    if (s.form.sim) want[62] = 1;
    for (const [n, v] of Object.entries(want)) {
      ctx.text(`Flag ${n}…`);
      const cur = await readFlag(p, Number(n));
      if (cur === v) { lines.push([`Flag ${n}`, `già ${v}`, 'ok']); continue; }
      await call((pr) => setFlag(pr, Number(n), v));
      if (cur != null && !(n in s.restore)) s.restore[n] = cur;
      lines.push([`Flag ${n}`, `impostato a ${v} (era ${cur ?? '?'})`, 'ok']);
    }
    s.info.flags = { ...s.info.flags, 58: await readFlag(p, 58), 59: await readFlag(p, 59) };
    setStep(s, 'prep', 'ok', lines);
  },

  async doc(p, s, ctx) {
    const serial = s.info.serial11;
    if (!serial) throw new Error('Matricola RT non disponibile: ripeti i controlli preliminari');
    const fm = s.form;
    const has = (kind) => s.docs.find((d) => d.kind === kind);
    const save = (kind, info) => {
      const d = { kind, n: Number(info.fiscalReceiptNumber), z: Number(info.zRepNumber), date: info.fiscalReceiptDate, time: info.fiscalReceiptTime, amount: info.fiscalReceiptAmount };
      if (!d.n || !d.z || !d.date) throw new Error(`La stampante non ha restituito numero/data del documento (${kind})`);
      s.docs.push(d); saveCache();
      return d;
    };
    const refundTag = (flag) => (flag === 1 ? 'printRecRefund' : 'printRecItem');
    if (!has('Vendita 1')) {
      ctx.text('Documento 1: vendita in contanti…');
      save('Vendita 1', await call((pr) => fp.fiscalReceipt(pr, [
        fp.el('beginFiscalReceipt', { operator: '1' }),
        itemXml(s, 'printRecItem', fm.prezzo1),
        fp.el('printRecTotal', { operator: '1', description: 'CONTANTI', payment: eur(fm.prezzo1), paymentType: '0', index: '1', justification: '1' }),
        fp.el('endFiscalReceipt', { operator: '1' }),
      ].join(''), { label: 'VP documento 1' })));
    }
    if (!has('Annullo doc. 1')) {
      ctx.text('Documento 2: annullo…');
      const info = await fp.fiscalReceipt(p, fp.el('printRecMessage', { operator: '1', messageType: '4', message: `VOID ${ref(has('Vendita 1'), serial)}` }), { label: 'VP annullo documento 1' });
      let res = info;
      if (String(info.printerStatus || '')[3] !== '1') {
        // documento non trovato o annullo semi-manuale: replica della vendita e chiusura
        res = await fp.fiscalReceipt(p, [
          itemXml(s, refundTag(s.info.flags?.[59]), fm.prezzo1),
          fp.el('printRecTotal', { operator: '1', description: 'CONTANTI', payment: eur(fm.prezzo1), paymentType: '0', index: '1', justification: '1' }),
          fp.el('endFiscalReceipt', { operator: '1' }),
        ].join(''), { label: 'VP chiusura annullo' });
      }
      save('Annullo doc. 1', res);
    }
    if (!has('Vendita 2')) {
      ctx.text('Documento 3: vendita con pagamento elettronico…');
      save('Vendita 2', await fp.fiscalReceipt(p, [
        fp.el('beginFiscalReceipt', { operator: '1' }),
        itemXml(s, 'printRecItem', fm.prezzo2),
        fm.lotteria ? fp.el('printRecLotteryID', { operator: '1', code: fm.lotteria }) : '',
        fp.el('printRecTotal', { operator: '1', description: 'PAGAMENTO ELETTRONICO', payment: eur(fm.prezzo2), paymentType: '2', index: '1', justification: '1' }),
        fp.el('endFiscalReceipt', { operator: '1' }),
      ].join(''), { label: 'VP documento 3' }));
    }
    if (!has('Reso doc. 3')) {
      ctx.text('Documento 4: reso…');
      save('Reso doc. 3', await fp.fiscalReceipt(p, [
        fp.el('printRecMessage', { operator: '1', messageType: '4', message: `REFUND ${ref(has('Vendita 2'), serial)}` }),
        itemXml(s, refundTag(s.info.flags?.[58]), fm.prezzo2),
        fp.el('printRecTotal', { operator: '1', description: 'PAGAMENTO ELETTRONICO', payment: eur(fm.prezzo2), paymentType: '2', index: '1', justification: '1' }),
        fp.el('endFiscalReceipt', { operator: '1' }),
      ].join(''), { label: 'VP reso documento 3' }));
    }
    setStep(s, 'doc', 'ok', s.docs.map((d) => [d.kind, `${pad(d.z, 4)}-${pad(d.n, 4)} · ${d.amount ?? ''} €`]));
  },

  async z(p, s, ctx) {
    ctx.text('Chiusura giornaliera e trasmissione…');
    const r = await call((pr) => fp.printReport(pr, 'Z'));
    s.z = { number: Number(r.info.zRepNumber) || null, amount: r.info.dailyAmount || '' };
    const amount = Number(String(s.z.amount).replace(/\./g, '').replace(',', '.'));
    const lines = [['Chiusura n.', s.z.number ?? '?'], ['Totale giornaliero', `${s.z.amount || '?'} €`, amount === 0 ? 'ok' : 'warn']];
    if (s.restore[62] != null) {
      ctx.text('Uscita dalla modalità simulazione…');
      try { await restoreFlags(p, s, [62]); lines.push(['Simulazione', 'disattivata', 'ok']); } catch (e) { lines.push(['Simulazione', e.message, 'err']); }
    }
    if (s.restore[68] != null) { try { await restoreFlags(p, s, [68]); } catch { /* resta nel banner */ } }
    setStep(s, 'z', worst(lines), lines, amount === 0 ? '' : 'Il totale non è zero: verifica sul rapporto stampato che vendite, annulli e resi corrispondano alle prove.');
  },

  async reg(p, s, ctx) {
    const yes = await confirmBox('Registrazione intervento', 'Vuoi registrare l\'intervento mediante FP Wizard piuttosto del Libretto Elettronico?', { okText: 'Sì', cancelText: 'No' });
    if (!yes) {
      s.reg = { mode: 'libretto' };
      setStep(s, 'reg', 'warn', [['Modalità', 'Libretto elettronico (portale Agenzia Entrate)']], 'Registra l\'intervento sul libretto elettronico nel portale dell\'Agenzia delle Entrate.');
      return;
    }
    let pivaEs = C.findPIva(cache().header?.lines);
    if (!pivaEs) {
      ctx.text('Lettura partita IVA esercente…');
      const lines = [];
      for (let n = 1; n <= C.HEADER_LINES && !pivaEs; n++) {
        const r = await fp.directIO(p, C.CMD.READ_HEADER_LINE, C.num(n, 2), { allowFail: true, label: `Lettura riga ${n}` });
        if (!r.response.success) break;
        const d = C.decodeHeaderLine(n, r.data);
        if (d.ok) lines.push(d.text);
        pivaEs = C.findPIva(lines);
      }
    }
    const enabled = p.simulator || !!C.SERVICE_EVENT.command;
    const form = await regFormPromise(s, pivaEs || '', enabled);
    if (!form) {
      s.reg = { mode: 'libretto' };
      setStep(s, 'reg', 'warn', [['Modalità', 'Libretto elettronico (registrazione annullata)']], 'Registra l\'intervento sul libretto elettronico nel portale dell\'Agenzia delle Entrate.');
      return;
    }
    const { events, cf, piva, pivaE } = form;
    const who = [['Tecnico', cf], ['Laboratorio', piva], ['Esercente', pivaE]];
    if (!enabled) {
      s.reg = { mode: 'pending', events };
      setStep(s, 'reg', 'warn', [...events.map((ev) => [`Intervento ${ev.code}`, ev.label]), ...who],
        'Dati pronti ma non inviati: registra l\'intervento sul libretto elettronico (portale AdE). L\'invio automatico richiede il comando Epson riservato.');
      return;
    }
    for (const ev of events) {
      ctx.text(`Registrazione intervento ${ev.code}…`);
      if (!p.simulator) await call((pr) => fp.directIO(pr, C.SERVICE_EVENT.command, C.SERVICE_EVENT.encode({ ...ev, date: new Date(ev.date) }), { label: `Intervento ${ev.code}` }));
    }
    ctx.text('Chiusura VP e trasmissione…');
    const r = await call((pr) => fp.printReport(pr, 'Z'));
    s.reg = { mode: 'rt', sent: true, events, z: r.info.zRepNumber || '', at: new Date().toISOString(), simulated: !!p.simulator };
    setStep(s, 'reg', 'ok', [...events.map((ev) => [`Intervento ${ev.code}`, ev.label, 'ok']), ['Chiusura VP', r.info.zRepNumber ? `n. ${r.info.zRepNumber}` : 'eseguita'], ...who],
      p.simulator ? 'Simulatore: invio simulato, nessun dato trasmesso.' : 'Intervento memorizzato e trasmesso con la chiusura.');
  },

  async mpd(p, s, ctx) {
    if (!s.docs.length) throw new Error('Nessun documento di prova da ristampare');
    ctx.text('Login…');
    await call((pr) => fp.directIO(pr, C.CMD_VP.LOGIN, C.encodeLogin(s.form.password || '12345'), { label: 'Login gestione accesso' }));
    const [dd, mm, yyyy] = String(s.docs[0].date).split('/');
    const from = Math.min(...s.docs.map((d) => d.n)); const to = Math.max(...s.docs.map((d) => d.n));
    ctx.text('Ristampa dal giornale elettronico…');
    await fp.printContentByNumbers(p, { dataType: 1, day: Number(dd), month: Number(mm), year: yyyy, from, to });
    setStep(s, 'mpd', 'ok', [['Documenti ristampati', `${from}–${to} del ${s.docs[0].date}`]]);
  },

  async mpr(p, s, ctx) {
    const last = s.z?.number;
    if (!last) throw new Error('Numero dell\'ultima chiusura non disponibile');
    const from = Math.max(1, last - 14);
    ctx.text('Stampa memoria fiscale…');
    await call((pr) => fp.directIO(pr, C.CMD_VP.MPR_BY_Z, C.encodeMprByZ(from, last), { timeout: 120000, label: 'Stampa MPR per numeri Z' }));
    if (s.restore[61] != null) { try { await restoreFlags(p, s, [61]); } catch { /* resta nel banner */ } }
    setStep(s, 'mpr', 'ok', [['Chiusure stampate', `${from}–${last}`]]);
  },

  async data(p, s) {
    const target = new Date(s.form.vpYear, s.form.vpMonth - 1, 1);
    if (target <= new Date()) throw new Error('La data della prossima verificazione deve essere futura');
    const before = await call((pr) => fp.directIO(pr, C.CMD_VP.READ_DATE, '', { label: 'Lettura data VP' }));
    if (!C.decodeVpDate(before.data).ok) throw new Error(`Formato data VP non riconosciuto: programmala da tastiera (3333 + CHIAVE + 28, codice 1959)`);
    await fp.directIO(p, C.CMD_VP.SET_DATE, C.encodeVpDate(target), { label: 'Programmazione data VP' });
    const after = C.decodeVpDate((await fp.directIO(p, C.CMD_VP.READ_DATE, '', { label: 'Verifica data VP' })).data);
    const ok = after.date && after.date.getMonth() === target.getMonth() && after.date.getFullYear() === target.getFullYear();
    s.info.nextVp = target.toISOString();
    setStep(s, 'data', ok ? 'ok' : 'ko', [['Data programmata', fmtDate(after.date)]], ok ? '' : 'La data riletta non corrisponde: programmala da tastiera (3333 + CHIAVE + 28, codice 1959).');
  },

  async print(p, s) {
    await call((pr) => fp.printNonFiscal(pr, wrapLines(summaryLines(s))));
    setStep(s, 'print', 'ok', [['Riepilogo', 'Stampato']]);
  },
};

// ---------------------------------------------------------------------------
// Procedura automatica
// ---------------------------------------------------------------------------

async function runAll(p, s, rerender) {
  const err = validateForm(s.form);
  if (err.length) { toast(`Controlla i dati: ${err.join(', ')}`, 'warn'); return; }
  const todo = STEPS.filter(([id]) => !isDone(s, id) || id === 'dati');
  const fiscal = ['doc', 'z', 'reg'].some((id) => !isDone(s, id));
  const ok = await confirmBox('Verifica completa',
    `<p>Verranno eseguiti in automatico ${todo.length} passi${fiscal ? `, compresi <b>4 documenti di prova${s.form.sim ? ' in modalità simulazione' : ''}</b> e la <b>chiusura giornaliera</b> con trasmissione` : ''}.
    Alla fine trovi tutti gli esiti in un'unica finestra.</p>
    <p class="muted" style="font-size:.85rem">Controlli visivi: ${VIS_CHECKS.every(([k]) => s.checks[k]) ? 'tutti confermati' : 'alcuni NON confermati'}. Prossima verificazione: ${pad(s.form.vpMonth, 2)}/${s.form.vpYear}.</p>`,
    { okText: 'Avvia verifica', danger: fiscal, html: true });
  if (!ok) return;
  await task('Verificazione periodica…', async (ctx) => {
    try {
      for (let i = 0; i < todo.length; i++) {
        const [id, title] = todo[i];
        ctx.check();
        ctx.progress(i, todo.length, `${i + 1}/${todo.length} · ${title}…`);
        try {
          await STEP[id](p, s, ctx, { auto: true });
        } catch (e) {
          if (e.name === 'Cancelled') throw e;
          setStep(s, id, 'ko', [], e.message);
        }
        if (BLOCKING.includes(id) && s.steps[id]?.status === 'ko') {
          toast(`Procedura fermata: ${title} non superato`, 'error');
          break;
        }
      }
      ctx.progress(todo.length, todo.length);
    } finally {
      // in ogni caso prova a rimettere i flag modificati temporaneamente
      if (Object.keys(s.restore).length) {
        ctx.text('Ripristino impostazioni…');
        try { await restoreFlags(p, s, Object.keys(s.restore)); } catch { /* segnalato nel banner */ }
      }
      saveCache();
    }
  }, { cancellable: true });
  rerender();
  showResults(p, s);
}

function showResults(p, s) {
  const ran = STEPS.filter(([id]) => s.steps[id]);
  if (!ran.length) return;
  const ko = ran.filter(([id]) => s.steps[id].status === 'ko').length;
  const badge = (st) => (st === 'ok' ? '<span class="badge ok">OK</span>' : st === 'warn' ? '<span class="badge warn">avviso</span>' : st === 'skip' ? '<span class="badge">saltato</span>' : '<span class="badge err">KO</span>');
  openSheet(`
    <h2>Esiti della verificazione</h2>
    <div class="notice ${ko ? 'err' : 'ok'}">${ko ? `<b>${ko} passi non superati.</b> Puoi ripeterli singolarmente dal dettaglio.` : '<b>Verificazione completata con esito positivo.</b>'}</div>
    ${ran.map(([id, title]) => {
      const st = s.steps[id];
      return `<details class="log-entry" ${st.status === 'ko' ? 'open' : ''}><summary>${badge(st.status)}<span style="flex:1">${esc(title)}</span></summary>
        ${st.lines?.length ? `<dl class="kv" style="margin:.5rem 0">${st.lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${st.note ? `<p class="muted" style="font-size:.85rem">${esc(st.note)}</p>` : ''}</details>`;
    }).join('')}
    <div class="actions">
      <button class="btn secondary" data-save>Salva rapporto</button>
      <button class="btn" data-close>Chiudi</button>
    </div>`, {
    onMount(sh, close) {
      sh.querySelector('[data-close]').onclick = close;
      sh.querySelector('[data-save]').onclick = () => saveFile(reportName(s), reportText(s), 'text/plain');
    },
  });
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

export function vp(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  if (!c.vp) c.vp = newSession(p);
  const s = c.vp;
  s.form.vpMonth ??= defaultVpTarget().getMonth() + 1;
  s.form.vpYear ??= defaultVpTarget().getFullYear();
  const rerender = () => vp(main);
  const done = STEPS.filter(([id]) => isDone(s, id)).length;
  const pending = Object.keys(s.restore);
  const fm = s.form;
  const ran = STEPS.filter(([id]) => s.steps[id]);

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="row between">
        <div><h2 style="margin:0">Verificazione periodica</h2>
          <small class="muted">Iniziata il ${esc(new Date(s.started).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))} · ${done}/${STEPS.length} passi completati</small></div>
        <button class="btn small ghost" id="vpReset">Nuova verifica</button>
      </div>
      <div class="progress" style="margin-top:.7rem"><div style="width:${Math.round((done / STEPS.length) * 100)}%"></div></div>
      ${pending.length ? `<div class="notice warn">Impostazioni modificate temporaneamente non ancora ripristinate (${pending.map((n) => `flag ${n}`).join(', ')}).
        <button class="btn small secondary" id="vpRestore" style="margin-left:.4rem">Ripristina ora</button></div>` : ''}
    </section>

    <section class="card">
      <h2>Dati dell'intervento</h2>
      <div class="form-grid">
        <label class="field"><span>Tecnico</span><input type="text" data-f="tecnico" value="${esc(fm.tecnico)}" autocapitalize="words"></label>
        <label class="field"><span>Codice fiscale tecnico</span><input type="text" data-f="cf" maxlength="16" value="${esc(fm.cf)}" autocapitalize="characters" spellcheck="false"></label>
        <label class="field"><span>Partita IVA laboratorio</span><input type="text" data-f="piva" maxlength="13" value="${esc(fm.piva)}" placeholder="IT01234567890" autocapitalize="characters" spellcheck="false"></label>
        <label class="field"><span>N. sigillo / marchio tecnico</span><input type="text" data-f="sigillo" maxlength="20" value="${esc(fm.sigillo)}" autocapitalize="characters"></label>
      </div>
      <details style="margin-top:.6rem"><summary class="muted" style="cursor:pointer">Opzioni prove (reparto, importi, lotteria, password, prossima VP)</summary>
        <div class="form-grid" style="margin-top:.6rem">
          <label class="field"><span>Reparto</span><input type="number" data-f="reparto" min="1" max="99" inputmode="numeric" value="${esc(fm.reparto)}"></label>
          <label class="field"><span>Importo documento 1 €</span><input type="number" data-f="prezzo1" step="0.01" min="1.01" inputmode="decimal" value="${esc(fm.prezzo1)}"></label>
          <label class="field"><span>Importo documento 2 €</span><input type="number" data-f="prezzo2" step="0.01" min="1.01" inputmode="decimal" value="${esc(fm.prezzo2)}"></label>
          <label class="field"><span>Codice lotteria (facoltativo)</span><input type="text" data-f="lotteria" maxlength="8" value="${esc(fm.lotteria)}" autocapitalize="characters" placeholder="es. ABCDEFGN"></label>
          <label class="field"><span>Password gestione accesso</span><input type="password" data-f="password" value="${esc(fm.password)}" placeholder="12345"></label>
          <label class="field"><span>Prossima VP: mese</span><input type="number" data-f="vpMonth" min="1" max="12" inputmode="numeric" value="${esc(fm.vpMonth)}"></label>
          <label class="field"><span>Prossima VP: anno</span><input type="number" data-f="vpYear" min="2024" max="2099" inputmode="numeric" value="${esc(fm.vpYear)}"></label>
        </div>
      </details>
      <label class="check"><input type="checkbox" data-f="sim" ${fm.sim ? 'checked' : ''}> Prove in <b>modalità simulazione</b> (consigliato)</label>

      <h3>Controlli visivi</h3>
      ${VIS_CHECKS.map(([k, t]) => `<label class="check"><input type="checkbox" data-chk="${k}" ${s.checks[k] ? 'checked' : ''}> ${esc(t)}</label>`).join('')}

      <div class="actions">
        <button class="btn" id="vpRunAll" style="flex:1 1 100%">${done ? 'Continua la verifica in automatico' : 'Esegui verifica completa'}</button>
        <button class="btn secondary" data-run="ricorda">${remembered() ? 'Aggiorna i miei dati' : 'Ricorda i miei dati'}</button>
        ${remembered() ? '<button class="btn ghost" data-run="dimentica">Dimentica</button>' : ''}
      </div>
      ${remembered() ? `<p class="muted" style="font-size:.82rem">I tuoi dati sono salvati su questo ${deviceName()} e vengono compilati in automatico a ogni nuova verifica.</p>` : ''}
      ${isIos() && !isStandalone() ? '<div class="notice warn" style="font-size:.85rem">Su iPhone aggiungi l\'app alla schermata Home (Condividi › Aggiungi alla schermata Home) e salva i dati da lì: aperta solo in Safari, iOS può cancellare i dati salvati dopo alcuni giorni di inutilizzo.</div>' : ''}
    </section>

    ${ran.length ? `<section class="card">
      <div class="row between"><h2 style="margin:0">Esiti</h2><button class="btn small secondary" id="vpShow">Mostra tutti gli esiti</button></div>
      <ul class="list" style="margin-top:.4rem">${ran.map(([id, title]) => {
        const st = s.steps[id];
        const cls = st.status === 'ok' ? 'ok' : st.status === 'warn' ? 'warn' : st.status === 'skip' ? '' : 'err';
        return `<li><span class="badge ${cls}">${st.status === 'ok' ? 'OK' : st.status === 'warn' ? 'avviso' : st.status === 'skip' ? 'saltato' : 'KO'}</span><div class="grow"><div>${esc(title)}</div>${st.status === 'ko' && st.note ? `<div class="sub">${esc(st.note)}</div>` : ''}</div>
          <button class="btn small ghost" data-step="${id}">Ripeti</button></li>`;
      }).join('')}</ul>
      ${s.reg?.events && !s.reg.sent ? '<div class="actions"><button class="btn small secondary" data-run="copyreg">Copia dati per il libretto</button></div>' : ''}
    </section>` : ''}

    <section class="card">
      <h2>Chiusura</h2>
      ${END_CHECKS.map(([k, t]) => (k === 'libretto' && s.reg?.sent
    ? `<label class="check"><input type="checkbox" checked disabled> Intervento registrato e trasmesso tramite RT${s.reg.z ? ` (chiusura n. ${esc(s.reg.z)})` : ''}</label>`
    : `<label class="check"><input type="checkbox" data-chk="${k}" ${s.checks[k] ? 'checked' : ''}> ${esc(t)}</label>`)).join('')}
      <div class="actions">
        <button class="btn secondary" data-run="savesum">Salva rapporto</button>
        <button class="btn" data-run="fine">Concludi verifica</button>
      </div>
      ${!p.simulator ? `<p class="muted" style="font-size:.85rem">File dei corrispettivi sulla stampante:
        <a href="${esc(baseUrl(p))}/www/dati-rt/" target="_blank" rel="noopener">dati-rt</a> ·
        <a href="${esc(baseUrl(p))}/www/dati-rt/simulazione/" target="_blank" rel="noopener">simulazione</a> ·
        <a href="${esc(baseUrl(p))}/www/dati-rt/lotteria/" target="_blank" rel="noopener">lotteria</a></p>` : ''}
    </section>`;

  // dati del form
  $$('[data-f]', main).forEach((inp) => inp.addEventListener('change', () => {
    const k = inp.dataset.f;
    s.form[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Number(inp.value) : inp.value.trim();
    if (s.steps.dati) delete s.steps.dati; // i dati cambiati vanno ricontrollati
    saveCache();
  }));
  $$('[data-chk]', main).forEach((cb) => cb.addEventListener('change', () => {
    s.checks[cb.dataset.chk] = cb.checked;
    if (VIS_CHECKS.some(([k]) => k === cb.dataset.chk)) delete s.steps.visiva;
    saveCache();
  }));

  $('#vpRunAll', main).onclick = () => runAll(p, s, rerender);
  $('#vpShow', main)?.addEventListener('click', () => showResults(p, s));
  $('#vpReset', main).onclick = async () => {
    const msg = pending.length ? 'Ci sono flag modificati temporaneamente non ancora ripristinati: ripristinali prima, oppure continua comunque.' : 'Azzerare gli esiti e iniziare una nuova verificazione periodica?';
    if (!await confirmBox('Nuova verifica', msg, { okText: pending.length ? 'Continua comunque' : 'Nuova verifica', danger: pending.length > 0 })) return;
    c.vp = newSession(p); saveCache(); rerender();
  };
  $('#vpRestore', main)?.addEventListener('click', () => task('Ripristino impostazioni…', async () => {
    await restoreFlags(p, s, Object.keys(s.restore)); toast('Impostazioni ripristinate', 'ok');
  }).finally(rerender));
  $$('[data-step]', main).forEach((b) => b.addEventListener('click', () => runOne(p, s, b.dataset.step, rerender)));
  $$('[data-run]', main).forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.run](p, s, rerender)));
}

/** Ripete un singolo passo (con conferma per le operazioni fiscali). */
async function runOne(p, s, id, rerender) {
  const confirmMsg = {
    doc: 'Emettere i documenti di prova mancanti?',
    z: 'Eseguire la chiusura giornaliera con trasmissione dei corrispettivi?',
    data: `Programmare la prossima verificazione al ${pad(s.form.vpMonth, 2)}/${s.form.vpYear}?`,
  }[id];
  if (confirmMsg && !await confirmBox(titleOf(id), confirmMsg, { okText: 'Procedi', danger: id !== 'data' })) return;
  await task(`${titleOf(id)}…`, async (ctx) => {
    try { await STEP[id](p, s, ctx, { auto: true }); } catch (e) { if (e.name === 'Cancelled') throw e; setStep(s, id, 'ko', [], e.message); }
  });
  rerender();
}

const ACTIONS = {
  ricorda(p, s, rerender) {
    const fm = s.form;
    const err = validateForm(fm);
    if (!fm.cf) err.push('codice fiscale del tecnico');
    if (!fm.piva) err.push('partita IVA laboratorio');
    if (err.length) { toast(`Per ricordarli completa: ${err.join(', ')}`, 'warn'); return; }
    fm.cf = fm.cf.toUpperCase(); fm.piva = fm.piva.toUpperCase();
    store.set('tecnico', Object.fromEntries(REMEMBER_KEYS.map((k) => [k, fm[k]])));
    // chiede al browser di non cancellare i dati salvati (Safari li può eliminare se il sito non è installato)
    navigator.storage?.persist?.().catch(() => {});
    toast(`Dati salvati su questo ${deviceName()}: verranno compilati in automatico`, 'ok');
    rerender();
  },
  async dimentica(p, s, rerender) {
    if (!await confirmBox('Dimentica i miei dati', 'Cancellare dal dispositivo i dati del tecnico salvati?', { okText: 'Cancella', danger: true })) return;
    store.del('tecnico');
    toast('Dati cancellati', 'ok');
    rerender();
  },
  copyreg: (p, s) => copyText(regText(s)),
  savesum: (p, s) => saveFile(reportName(s), reportText(s), 'text/plain'),
  async fine(p, s, rerender) {
    const c = cache();
    const miss = STEPS.filter(([id]) => !isDone(s, id)).map(([, t]) => t);
    const endMiss = END_CHECKS.filter(([k]) => !s.checks[k] && !(k === 'libretto' && s.reg?.sent));
    if (Object.keys(s.restore).length) { toast('Ripristina prima i flag modificati', 'warn'); return; }
    const msg = `${miss.length ? `Passi non completati: ${miss.join(', ')}. ` : ''}${endMiss.length ? 'Bollino e/o registrazione nel libretto non spuntati. ' : ''}Concludere la verificazione e salvare il rapporto?`;
    if (!await confirmBox('Concludi verifica', msg, { okText: 'Concludi', danger: miss.length > 0 })) return;
    (c.vpHistory ||= []).unshift({ date: new Date().toISOString(), serial: s.info.serial11, tecnico: s.form.tecnico, z: s.z?.number, nextVp: s.info.nextVp, esito: miss.length ? 'incompleta' : 'completata' });
    saveCache();
    await saveFile(reportName(s), reportText(s), 'text/plain');
    rerender();
  },
};

// ---------------------------------------------------------------------------
// Scheda dati per la registrazione dell'intervento
// ---------------------------------------------------------------------------

function regFormPromise(s, pivaEs, enabled) {
  const fm = s.form;
  const anyKo = ['pre', 'visiva', 'orologio', 'rete', 'doc'].some((id) => s.steps[id]?.status === 'ko');
  const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k} – ${esc(v)}</option>`).join('');
  return new Promise((resolve) => {
    openSheet(`
      <h2>Registrazione intervento</h2>
      <p class="muted" style="font-size:.88rem">L'intervento viene memorizzato dalla stampante e trasmesso all'Agenzia delle Entrate con la chiusura che l'app esegue subito dopo («CHIUSURA VP»).</p>
      ${enabled ? '' : `<div class="notice warn"><b>Invio automatico non disponibile.</b> Il comando Epson per registrare l'intervento è riservato: i dati vengono controllati e salvati,
        ma l'intervento va registrato sul libretto elettronico (portale AdE). Con «Copia dati per il libretto» li hai pronti da incollare.</div>`}
      <form class="stack" id="rf">
        <label class="field"><span>Tipo intervento</span><select name="code">${opts(C.INTERVENTION_CODES, anyKo ? '04' : '03')}</select></label>
        <label class="check"><input type="checkbox" name="pre"> Registra anche un intervento precedente (sigillo fiscale assente o contatori azzerati)</label>
        <div class="form-grid hidden" id="preBox">
          <label class="field"><span>Intervento precedente</span><select name="preCode">${opts(C.PRE_INTERVENTION_CODES, '01')}</select></label>
          <label class="field"><span>Nota intervento precedente</span><input type="text" name="preNote" maxlength="100"></label>
        </div>
        <div class="form-grid">
          <label class="field"><span>Codice fiscale tecnico</span><input type="text" name="cf" maxlength="16" value="${esc(fm.cf)}" autocapitalize="characters" spellcheck="false"></label>
          <label class="field"><span>Partita IVA laboratorio</span><input type="text" name="piva" maxlength="13" value="${esc(fm.piva || 'IT')}" autocapitalize="characters" spellcheck="false"></label>
          <label class="field"><span>Partita IVA esercente</span><input type="text" name="pivaEs" maxlength="11" inputmode="numeric" value="${esc(pivaEs)}" placeholder="letta dall'intestazione"></label>
        </div>
        <label class="field"><span>Nota (facoltativa)</span><input type="text" name="note" maxlength="100" placeholder="es. verificazione biennale"></label>
        <div class="actions">
          <button class="btn" type="submit">${enabled ? 'Registra e trasmetti' : 'Controlla e salva i dati'}</button>
          <button class="btn ghost" type="button" data-close>Annulla</button>
        </div>
      </form>`, {
      onDismiss: () => resolve(null),
      onMount(sh, close) {
        const f = sh.querySelector('#rf');
        sh.querySelector('[data-close]').onclick = () => { close(); resolve(null); };
        f.pre.onchange = () => sh.querySelector('#preBox').classList.toggle('hidden', !f.pre.checked);
        f.onsubmit = (e) => {
          e.preventDefault();
          const cf = f.cf.value.trim().toUpperCase();
          const piva = f.piva.value.trim().toUpperCase().replace(/\s/g, '');
          const pivaE = f.pivaEs.value.trim().replace(/\s/g, '');
          const err = [];
          if (!C.isValidCF(cf)) err.push('codice fiscale del tecnico');
          if (!(/^IT\d{11}$/.test(piva) && C.isValidPIva(piva.slice(2)))) err.push('partita IVA laboratorio (IT + 11 cifre)');
          if (!C.isValidPIva(pivaE)) err.push('partita IVA esercente (11 cifre)');
          if (f.pre.checked && f.preCode.value === '06' && !f.preNote.value.trim()) err.push('nota obbligatoria per l\'intervento 06');
          if (err.length) { toast(`Controlla: ${err.join(', ')}`, 'warn'); return; }
          const base = { cfTecnico: cf, pivaLab: piva, pivaEsercente: pivaE, date: new Date().toISOString() };
          const events = [];
          if (f.pre.checked) events.push({ ...base, code: f.preCode.value, label: C.PRE_INTERVENTION_CODES[f.preCode.value], note: C.toPrinterText(f.preNote.value.trim()) });
          events.push({ ...base, code: f.code.value, label: C.INTERVENTION_CODES[f.code.value], note: C.toPrinterText(f.note.value.trim()) });
          Object.assign(s.form, { cf, piva });
          if (remembered()) store.set('tecnico', { ...remembered(), cf, piva });
          close();
          resolve({ events, cf, piva, pivaE });
        };
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Riepilogo e rapporto
// ---------------------------------------------------------------------------

function regText(s) {
  const r = s.reg;
  if (!r?.events) return '';
  const e0 = r.events[0];
  return [
    `Matricola RT: ${s.info.serial11 || '?'}`,
    ...r.events.map((ev) => `Intervento ${ev.code} - ${ev.label}${ev.note ? ` (${ev.note})` : ''}`),
    `Data: ${new Date(e0.date).toLocaleString('it-IT')}`,
    `CF tecnico: ${e0.cfTecnico}`,
    `P.IVA laboratorio: ${e0.pivaLab}`,
    `P.IVA esercente: ${e0.pivaEsercente}`,
  ].join('\n');
}

const reportName = (s) => `VP_${s.info.serial11 || 'stampante'}_${new Date().toISOString().slice(0, 10)}.txt`;

function summaryLines(s) {
  const i = s.info; const fm = s.form;
  return [
    'VERIFICAZIONE PERIODICA',
    `DATA ${new Date().toLocaleDateString('it-IT')}`,
    `CASSA MODELLO ${i.modelName || '?'}`,
    `CASSA MATRICOLA FISCALE ${i.serial11 || '?'}`,
    `CASSA FIRMWARE FISCALE ${i.cpuRel || '?'}`,
    `FIRMWARE MPR (MEMORIA FISCALE) ${i.mfRel || '?'}`,
    `NUMERO AZZERAMENTI ${s.z?.number ?? '?'}`,
    `SCADENZA PROSSIMA VP ${i.nextVp ? fmtDate(i.nextVp) : 'NON IMPOSTATA'}`,
    `DOCUMENTI DI PROVA ${s.docs.map((d) => `${pad(d.z, 4)}-${pad(d.n, 4)}`).join(' ') || '-'}`,
    `SIMULAZIONE ${fm.sim ? 'SI' : 'NO'}`,
    '----------------------------------------',
    `TECNICO ${fm.tecnico || '-'}`,
    `CF TECNICO ${fm.cf || '-'}`,
    `P.IVA LABORATORIO ${fm.piva || '-'}`,
    `REVISIONE EFFETTUATA DAL TECNICO CON SIGILLO ${fm.sigillo || 'NON IMPOSTATO'}`,
    ...(s.reg?.events ? [`INTERVENTO ${s.reg.events.map((e) => e.code).join(' + ')} ${s.reg.sent ? `TRASMESSO CON CHIUSURA ${s.reg.z || ''}` : 'DA REGISTRARE SUL LIBRETTO'}`]
      : s.reg?.mode === 'libretto' ? ['INTERVENTO DA REGISTRARE SUL LIBRETTO ELETTRONICO'] : []),
  ];
}

function reportText(s) {
  const out = [...summaryLines(s), '', 'DETTAGLIO PASSI', ''];
  for (const [id, title] of STEPS) {
    const st = s.steps[id];
    out.push(`${title}: ${st ? st.status.toUpperCase() : 'NON ESEGUITO'}${st?.at ? ` (${new Date(st.at).toLocaleString('it-IT')})` : ''}`);
    (st?.lines || []).forEach(([k, v]) => out.push(`  - ${k}: ${v}`));
    if (st?.note) out.push(`  ! ${st.note}`);
  }
  out.push('', 'CONTROLLI DEL TECNICO');
  [...VIS_CHECKS, ...END_CHECKS].forEach(([k, t]) => out.push(`  [${s.checks[k] || (k === 'libretto' && s.reg?.sent) ? 'X' : ' '}] ${t}`));
  if (s.reg?.events) out.push('', 'REGISTRAZIONE INTERVENTO', regText(s));
  out.push('', `Stampante: ${s.printer.name} (${s.printer.host})`, `Generato da FP Wizard PWA il ${new Date().toLocaleString('it-IT')}`);
  return out.join('\n');
}
