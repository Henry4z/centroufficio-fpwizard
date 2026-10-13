// Giornale elettronico (DGFE / MPD) e memoria fiscale (MPR):
// ristampa su carta, lettura e salvataggio sul telefono, ristampa ultimo documento.

import { $, $$, esc, toast, confirmBox, task, saveFile, fresh, copyText, store } from '../ui.js';
import { current, cache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

const DATA_TYPES = { 0: 'Tutti i documenti', 1: 'Documenti commerciali (vendita, reso, annullo)', 2: 'Fatture', 3: 'Titoli di accesso' };
const MPR_FILE = '/www/dati-rt/tmp/rt_memoria_riepilogo.txt';

const isoToday = () => new Date().toISOString().slice(0, 10);
const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const ddmmyy = (iso) => { const { y, m, d } = parts(iso); return C.num(d, 2) + C.num(m, 2) + C.num(y % 100, 2); };
const itDate = (iso) => { const { y, m, d } = parts(iso); return `${C.num(d, 2)}/${C.num(m, 2)}/${y}`; };
const baseUrl = (p) => fp.printerUrl(p, 1).replace(/\/cgi-bin.*$/, '');

const savedPwd = () => store.get('accessPwd', null) || store.get('tecnico', {})?.password || '12345';

/** Esegue fn; se la stampante risponde «Impossibile ora» (non loggata) fa il login e riprova una volta. */
async function withLogin(p, pwd, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.status !== 17) throw e;
    await fp.directIO(p, C.CMD.ACCESS, C.encodeLogin(pwd), { label: 'Login gestione accesso' });
    return fn();
  }
}

export function dgfe(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const st = (c.dgfeUi ||= { mode: 'date', from: isoToday(), to: isoToday(), day: isoToday(), nFrom: 1, nTo: 9999, type: 1, zFrom: 1, zTo: 1, mFrom: isoToday(), mTo: isoToday(), dest: 'print' });
  let result = c.dgfeResult || null; // { title, lines, at }

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Accesso</h2>
      <p class="muted" style="font-size:.88rem">Lettura e ristampa del giornale elettronico richiedono il login con la password di gestione accesso (predefinita 12345). L'app lo esegue da sola quando serve.</p>
      <div class="row">
        <input type="password" id="pwd" value="${esc(savedPwd())}" placeholder="Password" style="flex:1;min-width:140px" autocomplete="off">
        <button class="btn secondary" id="btnLogin">Login</button>
      </div>
      <label class="check"><input type="checkbox" id="remPwd" ${store.get('accessPwd', null) ? 'checked' : ''}> Ricorda la password su questo dispositivo</label>
    </section>

    <section class="card">
      <h2>Giornale elettronico (DGFE / MPD)</h2>
      <div class="segment" id="mode" style="margin-bottom:.8rem">
        <button data-mode="date" class="${st.mode === 'date' ? 'on' : ''}">Per date</button>
        <button data-mode="num" class="${st.mode === 'num' ? 'on' : ''}">Per numero documento</button>
      </div>
      <div class="form-grid ${st.mode === 'date' ? '' : 'hidden'}" id="byDate">
        <label class="field"><span>Dal giorno</span><input type="date" id="from" value="${esc(st.from)}"></label>
        <label class="field"><span>Al giorno</span><input type="date" id="to" value="${esc(st.to)}"></label>
      </div>
      <div class="form-grid ${st.mode === 'num' ? '' : 'hidden'}" id="byNum">
        <label class="field"><span>Giorno</span><input type="date" id="day" value="${esc(st.day)}"></label>
        <label class="field"><span>Dal documento n.</span><input type="number" id="nFrom" min="1" max="9999" inputmode="numeric" value="${esc(st.nFrom)}"></label>
        <label class="field"><span>Al documento n.</span><input type="number" id="nTo" min="1" max="9999" inputmode="numeric" value="${esc(st.nTo)}"></label>
      </div>
      <label class="field" style="margin-top:.6rem"><span>Tipo di dati</span>
        <select id="type">${Object.entries(DATA_TYPES).map(([k, v]) => `<option value="${k}" ${Number(k) === st.type ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <div class="actions">
        <button class="btn" id="btnQuery">Leggi e salva sul telefono</button>
        <button class="btn secondary" id="btnPrint">Ristampa su carta</button>
      </div>
      <div class="actions" style="margin-top:.4rem">
        <button class="btn ghost small" id="btnDup">Ristampa ultimo documento commerciale</button>
      </div>
    </section>

    ${result ? `<section class="card" id="resCard">
      <div class="row between"><h2 style="margin:0">${esc(result.title)}</h2><small class="muted">${result.lines.length} righe · ${esc(new Date(result.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))}</small></div>
      <input type="search" id="q" placeholder="Cerca nel testo (es. numero documento, importo, CONTANTI)…" style="margin-top:.6rem">
      <pre class="ej" id="ej"></pre>
      <div class="actions">
        <button class="btn" id="btnSave">Salva sul telefono</button>
        <button class="btn secondary" id="btnCopy">Copia</button>
        <button class="btn ghost" id="btnClear">Chiudi</button>
      </div>
    </section>` : ''}

    <section class="card">
      <h2>Memoria fiscale (MPR)</h2>
      <p class="muted" style="font-size:.88rem">Riepiloghi delle chiusure giornaliere registrati nella memoria permanente.</p>
      <div class="segment" id="dest" style="margin-bottom:.8rem">
        <button data-dest="print" class="${st.dest === 'print' ? 'on' : ''}">Stampa su carta</button>
        <button data-dest="file" class="${st.dest === 'file' ? 'on' : ''}">Salva in file sulla stampante</button>
      </div>
      <h3>Per numero di chiusura (Z)</h3>
      <div class="form-grid">
        <label class="field"><span>Dalla Z n.</span><input type="number" id="zFrom" min="1" max="3653" inputmode="numeric" value="${esc(st.zFrom)}"></label>
        <label class="field"><span>Alla Z n.</span><input type="number" id="zTo" min="1" max="3653" inputmode="numeric" value="${esc(st.zTo)}"></label>
      </div>
      <div class="actions"><button class="btn secondary" data-mpr="z">Leggi per numeri</button></div>
      <h3>Per date</h3>
      <div class="form-grid">
        <label class="field"><span>Dal giorno</span><input type="date" id="mFrom" value="${esc(st.mFrom)}"></label>
        <label class="field"><span>Al giorno</span><input type="date" id="mTo" value="${esc(st.mTo)}"></label>
      </div>
      <div class="actions">
        <button class="btn secondary" data-mpr="date">Leggi per date</button>
        <button class="btn secondary" data-mpr="sum">Totali per date</button>
        <button class="btn ghost" data-mpr="all">Memoria fiscale completa</button>
      </div>
      ${p.simulator ? '' : `<p class="muted" style="font-size:.85rem">Con «Salva in file» i dati vanno in <a href="${esc(baseUrl(p) + MPR_FILE)}" target="_blank" rel="noopener">rt_memoria_riepilogo.txt</a> sulla stampante.</p>`}
    </section>`;

  // ----- stato del form -----
  const val = (id) => $(`#${id}`, main)?.value;
  const sync = () => {
    Object.assign(st, {
      from: val('from'), to: val('to'), day: val('day'), nFrom: Number(val('nFrom')) || 1, nTo: Number(val('nTo')) || 9999,
      type: Number(val('type')), zFrom: Number(val('zFrom')) || 1, zTo: Number(val('zTo')) || 1, mFrom: val('mFrom'), mTo: val('mTo'),
    });
  };
  main.addEventListener('change', sync);
  $$('[data-mode]', main).forEach((b) => b.addEventListener('click', () => { sync(); st.mode = b.dataset.mode; dgfe(main); }));
  $$('[data-dest]', main).forEach((b) => b.addEventListener('click', () => { sync(); st.dest = b.dataset.dest; dgfe(main); }));
  const pwd = () => $('#pwd', main).value || '12345';
  $('#remPwd', main).addEventListener('change', (e) => { if (e.target.checked) store.set('accessPwd', pwd()); else store.del('accessPwd'); });
  $('#pwd', main).addEventListener('change', () => { if ($('#remPwd', main).checked) store.set('accessPwd', pwd()); });

  $('#btnLogin', main).onclick = () => task('Login…', async () => {
    await call((pr) => fp.directIO(pr, C.CMD.ACCESS, C.encodeLogin(pwd()), { label: 'Login gestione accesso' }));
    toast('Login eseguito', 'ok');
  });

  /** Attributi della richiesta per la modalità scelta. */
  const request = () => {
    sync();
    if (st.mode === 'date') {
      if (!st.from || !st.to || st.from > st.to) throw new Error('Intervallo di date non valido');
      const a = parts(st.from); const b = parts(st.to);
      return {
        kind: 'ByDate', title: `DGFE dal ${itDate(st.from)} al ${itDate(st.to)}`, file: `DGFE_${st.from}_${st.to}`,
        attrs: { dataType: st.type, fromDay: a.d, fromMonth: a.m, fromYear: a.y, toDay: b.d, toMonth: b.m, toYear: b.y },
      };
    }
    if (!st.day || !(st.nFrom >= 1 && st.nTo >= st.nFrom && st.nTo <= 9999)) throw new Error('Giorno o numeri documento non validi');
    const d = parts(st.day);
    return {
      kind: 'ByNumbers', title: `DGFE del ${itDate(st.day)}, documenti ${st.nFrom}–${st.nTo}`, file: `DGFE_${st.day}_n${st.nFrom}-${st.nTo}`,
      attrs: { dataType: st.type, day: d.d, month: d.m, year: d.y, fromNumber: st.nFrom, toNumber: st.nTo },
    };
  };

  $('#btnQuery', main).onclick = () => {
    let rq; try { rq = request(); } catch (e) { toast(e.message, 'warn'); return; }
    task('Lettura del giornale elettronico…', async () => {
      const r = await call((pr) => withLogin(pr, pwd(), () => fp.contentRequest(pr, `queryContent${rq.kind}`, rq.attrs)));
      if (!r.lines.length) { toast('Nessun dato nel periodo richiesto', 'warn'); return; }
      const serial = c.serial?.ok ? c.serial.extended : '';
      c.dgfeResult = { title: rq.title, lines: r.lines, at: Date.now(), file: `${rq.file}${serial ? `_${serial}` : ''}.txt` };
      if (r.lines[r.lines.length - 1]?.includes('OUT OF MEMORY')) toast('Dati troppo grandi: lettura interrotta. Riduci l\'intervallo.', 'warn');
      dgfe(main);
      $('#resCard', main)?.scrollIntoView({ behavior: 'smooth' });
    });
  };
  $('#btnPrint', main).onclick = async () => {
    let rq; try { rq = request(); } catch (e) { toast(e.message, 'warn'); return; }
    if (!await confirmBox('Ristampa su carta', `Ristampare: ${rq.title}? Per periodi lunghi la stampa può richiedere molto tempo e molta carta.`, { okText: 'Stampa' })) return;
    task('Ristampa in corso…', async () => {
      await call((pr) => withLogin(pr, pwd(), () => fp.contentRequest(pr, `printContent${rq.kind}`, rq.attrs, { timeout: 600000 })));
      toast('Ristampa completata', 'ok');
    });
  };
  $('#btnDup', main).onclick = () => task('Ristampa ultimo documento…', async () => {
    await call((pr) => withLogin(pr, pwd(), async () => fp.rawXmlChecked(pr, fp.el('printerCommand', {}, fp.el('printDuplicateReceipt', { operator: '1' })))));
    toast('Copia dell\'ultimo documento stampata', 'ok');
  });

  // ----- risultato -----
  if (result) {
    const pre = $('#ej', main);
    const show = (q) => {
      const ql = q.trim().toLowerCase();
      const lines = ql ? result.lines.filter((l) => l.toLowerCase().includes(ql)) : result.lines;
      pre.textContent = lines.join('\n') || '(nessuna riga trovata)';
    };
    show('');
    $('#q', main).addEventListener('input', (e) => show(e.target.value));
    const text = () => `${result.title}\n${'='.repeat(40)}\n${result.lines.join('\n')}\n`;
    $('#btnSave', main).onclick = () => saveFile(result.file || 'DGFE.txt', text(), 'text/plain');
    $('#btnCopy', main).onclick = () => copyText(text());
    $('#btnClear', main).onclick = () => { delete c.dgfeResult; dgfe(main); };
  }

  // ----- memoria fiscale -----
  $$('[data-mpr]', main).forEach((b) => b.addEventListener('click', async () => {
    sync();
    const kind = b.dataset.mpr;
    let cmd; let data; let label;
    if (kind === 'z') {
      if (!(st.zFrom >= 1 && st.zTo >= st.zFrom)) { toast('Numeri di chiusura non validi', 'warn'); return; }
      cmd = C.CMD_VP.MPR_BY_Z; data = C.encodeMprByZ(st.zFrom, st.zTo); label = `chiusure ${st.zFrom}–${st.zTo}`;
    } else if (kind === 'date' || kind === 'sum') {
      if (!st.mFrom || !st.mTo || st.mFrom > st.mTo) { toast('Intervallo di date non valido', 'warn'); return; }
      cmd = kind === 'date' ? '3013' : '3014'; data = `01${ddmmyy(st.mFrom)}${ddmmyy(st.mTo)}`;
      label = `${kind === 'sum' ? 'totali ' : ''}dal ${itDate(st.mFrom)} al ${itDate(st.mTo)}`;
    } else {
      if (!await confirmBox('Memoria fiscale completa', 'Leggere l\'intera memoria fiscale? Con la stampa su carta può essere molto lunga.', { okText: 'Procedi' })) return;
      cmd = '3015'; data = '01'; label = 'memoria fiscale completa';
    }
    const toFile = st.dest === 'file';
    task(`Memoria fiscale: ${label}…`, async (ctx) => {
      // flag SET 14/61: 0 = stampa, 1 = file sulla stampante
      const want = toFile ? 1 : 0;
      const rf = await call((pr) => fp.directIO(pr, C.CMD.READ_FLAG, '61', { allowFail: true, label: 'Lettura flag 61' }));
      const cur = rf.response.success ? C.decodeFlag(61, rf.data).value : null;
      if (cur != null && cur !== want) await fp.directIO(p, C.CMD.SET_FLAG, C.encodeFlag(61, want), { label: `Flag 61 = ${want}` });
      try {
        ctx.text(toFile ? 'Scrittura del file sulla stampante…' : 'Stampa in corso…');
        await fp.directIO(p, cmd, data, { timeout: 600000, label: `Memoria fiscale ${label}` });
      } finally {
        if (cur != null && cur !== want) { try { await fp.directIO(p, C.CMD.SET_FLAG, C.encodeFlag(61, cur), { label: `Flag 61 = ${cur}` }); } catch { /* segnalato sotto */ } }
      }
      if (!toFile) { toast('Stampa completata', 'ok'); return; }
      if (p.simulator) { toast('Simulatore: file non disponibile', 'warn'); return; }
      try {
        const res = await fetch(`${baseUrl(p)}${MPR_FILE}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const lines = (await res.text()).split(/\r?\n/);
        c.dgfeResult = { title: `Memoria fiscale – ${label}`, lines, at: Date.now(), file: `MPR_${label.replace(/[^\w-]+/g, '_')}.txt` };
        dgfe(main);
      } catch {
        toast('File creato sulla stampante: aprilo dal link in fondo alla sezione e salvalo con Condividi', 'warn', 9000);
      }
    });
  }));
}
