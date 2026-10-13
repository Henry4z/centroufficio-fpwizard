// Viste generali: home, stampanti, stato, registro, guida.

import { $, $$, esc, toast, confirmBox, promptBox, task, icon, copyText, ipField } from '../ui.js';
import { state, current, newPrinter, savePrinter, deletePrinter, selectPrinter, cache, saveCache, call, ensureDayClosed } from '../state.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { openSync } from '../sync.js';

const go = (r) => { location.hash = '#/' + r; };

export const TILES = [
  ['status', 'status', 'Stato e info', 'Stato stampante e RT, matricola, data e ora'],
  ['header', 'header', 'Intestazione', 'Righe intestazione esercente e font'],
  ['vat', 'vat', 'Aliquote IVA', 'Gruppi IVA 1–9'],
  ['depts', 'dept', 'Reparti', 'Descrizione, prezzo, IVA, beni/servizi'],
  ['flags', 'flag', 'Flag SET 14', 'Opzioni di funzionamento'],
  ['conf', 'sliders', 'Parametri SET 15', 'Configurazioni numeriche'],
  ['tables', 'users', 'Operatori e pagamenti', 'Operatori, carte di credito, ticket, gruppi merceologici'],
  ['extras', 'sliders', 'Altre impostazioni', 'Fatture, contanti, chiusura automatica, lotteria'],
  ['iva', 'vat', 'IVA, nature e ATECO', 'IVA calendarizzate e storiche, nature 15–18, codici ATECO'],
  ['net', 'globe', 'Rete e servizi', 'Rete, web server e SSL, e-mail, EFT-POS, accesso ai dati'],
  ['plu', 'tag', 'PLU', 'Articoli interni, codici a barre, tasti PLU diretti'],
  ['keys', 'keyboard', 'Tastiera', 'Programmazione tasti: 32, 23/24, 56/60 tasti o QWERTY'],
  ['logos', 'image', 'Loghi', 'Loghi standard e personalizzati'],
  ['vp', 'check', 'Verificazione periodica', 'Visita fiscale guidata con riepilogo'],
  ['dgfe', 'journal', 'Giornale elettronico', 'Ristampa e salva scontrini (DGFE) e memoria fiscale'],
  ['tx', 'send', 'Trasmissioni AdE', 'Esiti dei corrispettivi, lotteria, E-Receipt, file rifiutati'],
  ['totals', 'chart', 'Totalizzatori', 'Grand totali, reparti, IVA, pagamenti'],
  ['reports', 'report', 'Rapporti X / Z', 'Lettura e chiusura giornaliera'],
  ['cassa', 'cart', 'Simulatore cassa', 'Scontrini, resi, annulli, fatture'],
  ['cambio', 'sd', 'Cambio DGFE', 'Sostituzione guidata del giornale elettronico'],
  ['moduli', 'pen', 'Moduli tecnico', 'Messa in servizio, defiscalizzazione e cessione'],
  ['diag', 'tool', 'Diagnostica', 'Test di rete, scheda SD, contatori, riavvii'],
  ['backup', 'backup', 'Backup e ripristino', 'Salva o ripristina la programmazione'],
  ['console', 'terminal', 'Direct IO', 'Comandi nativi e XML libero'],
  ['log', 'log', 'Registro', 'Richieste e risposte'],
  ['help', 'help', 'Guida', 'Connessione da iPhone e note'],
];

/** Riga «ultima sincronizzazione» della schermata iniziale. */
function syncInfo(s) {
  if (!s?.at) return 'Premi «Sincronizza tutto» per leggere in una volta tutti i dati dalla stampante: poi le schermate li mostrano subito.';
  const when = new Date(s.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  const ok = (s.results || []).filter((r) => r.ok).length;
  const of = s.requested || (s.results || []).length;
  return `Ultima sincronizzazione: ${esc(when)} · ${ok} di ${of} sezioni lette${(s.results || []).length < of ? ' (interrotta)' : ''}`;
}

export function mixedWarning(p) {
  if (!p || !fp.isMixedContent(p)) return '';
  return `<div class="notice warn"><b>Connessione bloccata dal browser.</b> L'app è aperta in HTTPS ma la stampante è impostata in HTTP.
    Attiva SSL sulla stampante (SET 34 &gt; Web server) e scegli HTTPS, oppure apri l'app da un indirizzo HTTP. <a href="#/help">Dettagli</a></div>`;
}

function installHint() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || sessionStorage.getItem('hideInstall')) return '';
  return `<div class="notice" id="installHint">Per usarla come app: tocca <b>Condividi</b> <span aria-hidden="true">⬆︎</span> e poi <b>Aggiungi alla schermata Home</b>.
    <button class="btn small ghost" id="hideInstall" style="margin-left:.4rem">OK</button></div>`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function home(main) {
  const p = current();
  main.innerHTML = `
    ${installHint()}
    <section class="card hero">
      <span class="hero-badge">Centro Ufficio · Assistenza RT</span>
      ${p ? `
        <div class="row between" style="align-items:flex-start">
          <div style="min-width:0">
            <div class="muted" style="font-size:.82rem">Stampante selezionata</div>
            <div class="hero-name">${esc(p.name)}</div>
            <div class="muted mono">${p.simulator ? 'Simulatore (nessuna stampante reale)' : esc(fp.printerUrl(p, 10000).replace(/\/cgi-bin.*$/, ''))}</div>
          </div>
          <button class="btn secondary small" data-go="printers">Cambia</button>
        </div>
        ${mixedWarning(p)}
        <div class="actions"><button class="btn" id="btnSyncAll">${icon('sync', 18)} Sincronizza tutto</button>
        <button class="btn secondary" id="btnTest">Verifica<span class="hide-xs"> connessione</span></button>
        <button class="btn ghost" data-go="printer/${p.id}">Impostazioni</button></div>
        <p class="muted sync-info">${syncInfo(cache().sync)}</p>
        <div id="testResult"></div>`
    : `
        <h2>Stampanti fiscali Epson RT <em>a portata di telefono.</em></h2>
        <p class="muted">Configura FP-81 II RT, FP-90 III RT e Server RT tramite rete, direttamente dall'iPhone.</p>
        <div class="actions">
          <button class="btn" data-go="collega">Collega stampante</button>
          <button class="btn secondary" id="btnSim">Prova con il simulatore</button>
        </div>`}
    </section>
    <h2 class="section-title">Funzioni</h2>
    <div class="grid">
      ${TILES.map(([r, ic, t, s]) => `<button class="tile" data-go="${r}"><span class="ico">${icon(ic)}</span><b>${t}</b><small class="muted">${s}</small></button>`).join('')}
    </div>
    <footer class="brand-footer">
      <img src="assets/brand/logo-centro-ufficio.png" alt="Centro Ufficio" width="128" height="24">
      <p>Centro Ufficio Padova · stampanti, software e assistenza dal 1989</p>
      <p><a href="tel:+390498077933">049 8077933</a> · <a href="mailto:info@centroufficiopadova.it">info@centroufficiopadova.it</a> · <a href="https://centroufficiopadova.it/" target="_blank" rel="noopener">centroufficiopadova.it</a></p>
    </footer>`;

  $('#hideInstall', main)?.addEventListener('click', () => { sessionStorage.setItem('hideInstall', '1'); $('#installHint')?.remove(); });
  $('#btnSim', main)?.addEventListener('click', () => {
    savePrinter(newPrinter({ name: 'Simulatore', simulator: true, host: 'simulatore' }));
    toast('Stampante simulata aggiunta', 'ok');
    home(main);
  });
  $('#btnSyncAll', main)?.addEventListener('click', () => openSync(current(), () => home(main)));
  $('#btnTest', main)?.addEventListener('click', () => task('Verifica connessione…', async () => {
    const info = await call((pr) => fp.queryStatus(pr, 0));
    cache().status = info; saveCache();
    const rows = C.decodeFpStatus(info.fpStatus);
    $('#testResult', main).innerHTML = `<div class="notice ok"><b>Stampante raggiungibile.</b> Firmware ${esc(info.cpuRel || '?')}
      ${rows.map(([k, v, s]) => `<div>${esc(k)}: <span class="badge ${s}">${esc(v)}</span></div>`).join('')}</div>`;
  }).catch(() => {}));
}

// ---------------------------------------------------------------------------
// Elenco stampanti
// ---------------------------------------------------------------------------

export function printers(main) {
  main.innerHTML = `
    <section class="card">
      <h2>Stampanti</h2>
      ${state.printers.length ? `<ul class="list">${state.printers.map((p) => `
        <li>
          <input type="radio" name="cur" value="${p.id}" ${p.id === state.currentId ? 'checked' : ''} aria-label="Seleziona ${esc(p.name)}" style="width:22px;height:22px;accent-color:var(--brand)">
          <div class="grow" data-sel="${p.id}" style="cursor:pointer">
            <div class="title">${esc(p.name)} ${p.simulator ? '<span class="badge warn">simulatore</span>' : ''}</div>
            <div class="sub mono">${p.simulator ? '—' : esc(`${p.proto}://${p.host}${p.port ? ':' + p.port : ''}`)}</div>
          </div>
          <button class="btn small ghost" data-go="printer/${p.id}">Modifica</button>
        </li>`).join('')}</ul>` : '<div class="empty">Nessuna stampante configurata.</div>'}
      <div class="actions">
        <button class="btn" data-go="collega">Collega stampante</button>
        <button class="btn secondary" data-go="printer/new">Aggiungi a mano</button>
        <button class="btn secondary" id="addSim">Aggiungi simulatore</button>
      </div>
    </section>`;
  $$('input[name=cur]', main).forEach((r) => r.addEventListener('change', () => { selectPrinter(r.value); toast('Stampante selezionata', 'ok'); }));
  $$('[data-sel]', main).forEach((d) => d.addEventListener('click', () => { selectPrinter(d.dataset.sel); go('home'); }));
  $('#addSim', main).addEventListener('click', () => { savePrinter(newPrinter({ name: 'Simulatore', simulator: true, host: 'simulatore' })); printers(main); });
}

// ---------------------------------------------------------------------------
// Modifica stampante
// ---------------------------------------------------------------------------

export function printerEdit(main, id) {
  const existing = state.printers.find((p) => p.id === id);
  const p = existing ? { ...existing } : newPrinter();
  main.innerHTML = `
    <section class="card">
      <h2>${existing ? 'Modifica stampante' : 'Nuova stampante'}</h2>
      <form id="pf" class="stack" autocomplete="off">
        <label class="field"><span>Nome</span><input type="text" name="name" value="${esc(p.name)}" required></label>
        <label class="check"><input type="checkbox" name="simulator" ${p.simulator ? 'checked' : ''}> Simulatore (prova senza stampante)</label>
        <div id="realFields" class="stack">
          <label class="field"><span>Indirizzo IP o nome host</span><input type="text" name="host" value="${esc(p.simulator ? '' : p.host)}" placeholder="192.168.1.50" inputmode="url" autocapitalize="off" spellcheck="false"></label>
          <div class="form-grid">
            <label class="field"><span>Protocollo</span>
              <select name="proto"><option value="http" ${p.proto === 'http' ? 'selected' : ''}>HTTP (SSL disattivo)</option><option value="https" ${p.proto === 'https' ? 'selected' : ''}>HTTPS (SSL attivo)</option></select></label>
            <label class="field"><span>Porta web (vuoto = 80 / 443)</span><input type="number" name="port" value="${esc(p.port)}" min="1" max="65535" inputmode="numeric" placeholder="vuoto"></label>
            <label class="field"><span>Timeout (ms)</span><input type="number" name="timeout" value="${esc(p.timeout)}" min="2000" max="120000" step="1000" inputmode="numeric"></label>
          </div>
          <details>
            <summary class="muted" style="cursor:pointer">Opzioni avanzate</summary>
            <div class="stack" style="margin-top:.6rem">
              <div class="form-grid">
                <label class="field"><span>Utente web server (SET 34)</span><input type="text" name="user" value="${esc(p.user)}" autocapitalize="off"></label>
                <label class="field"><span>Password web server</span><input type="password" name="pass" value="${esc(p.pass)}"></label>
              </div>
              <label class="check"><input type="checkbox" name="plainText" ${p.plainText ? 'checked' : ''}> Compatibilità CORS (invia come text/plain, senza intestazioni aggiuntive)</label>
              <p class="muted" style="font-size:.85rem">Attivala solo se la connessione fallisce pur raggiungendo la stampante dal browser.</p>
            </div>
          </details>
        </div>
        <div class="actions">
          <button class="btn" type="submit">Salva</button>
          <button class="btn secondary" type="button" id="btnTry">Prova connessione</button>
          ${existing ? '<button class="btn danger" type="button" id="btnDel">Elimina</button>' : ''}
        </div>
        <div id="tryResult"></div>
      </form>
    </section>
    ${location.protocol === 'https:' ? '<div class="notice">L\'app è aperta in <b>HTTPS</b>: per raggiungere la stampante serve il protocollo HTTPS (SSL attivo sulla stampante). Vedi la <a href="#/help">Guida</a>.</div>' : ''}`;

  const f = $('#pf', main);
  ipField(f.host);
  const syncSim = () => { $('#realFields', main).classList.toggle('hidden', f.simulator.checked); };
  f.simulator.addEventListener('change', syncSim);
  syncSim();

  const read = () => ({
    ...p,
    name: f.name.value.trim() || 'Stampante fiscale',
    simulator: f.simulator.checked,
    host: f.simulator.checked ? 'simulatore' : f.host.value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
    proto: f.proto.value,
    port: f.port.value.trim(),
    timeout: Math.max(2000, Number(f.timeout.value) || 10000),
    user: f.user.value.trim(),
    pass: f.pass.value,
    plainText: f.plainText.checked,
  });

  f.port.addEventListener('change', () => { if (fp.isNativePort(f.port.value)) { f.port.value = ''; toast(fp.NATIVE_PORT_MESSAGE, 'warn', 9000); } });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const np = read();
    if (!np.simulator && !np.host) { toast('Inserisci l\'indirizzo IP della stampante', 'warn'); return; }
    if (!np.simulator && fp.isNativePort(np.port)) { toast(fp.NATIVE_PORT_MESSAGE, 'warn', 9000); return; }
    savePrinter(np);
    selectPrinter(np.id);
    toast('Stampante salvata', 'ok');
    go('home');
  });
  $('#btnTry', main).addEventListener('click', () => task('Prova connessione…', async () => {
    const np = read();
    const info = await fp.queryStatus(np, 0);
    $('#tryResult', main).innerHTML = `<div class="notice ok">Connessione riuscita. Firmware ${esc(info.cpuRel || '?')}, stato ${esc(info.fpStatus || '?')}.</div>`;
  }));
  $('#btnDel', main)?.addEventListener('click', async () => {
    if (await confirmBox('Elimina stampante', `Eliminare "${p.name}" e i dati letti salvati sul telefono?`, { okText: 'Elimina', danger: true })) {
      deletePrinter(p.id);
      go('printers');
    }
  });
}

// ---------------------------------------------------------------------------
// Stato e informazioni
// ---------------------------------------------------------------------------

const fmtYmd = (s) => (/^\d{8}$/.test(s || '') ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s || '—');

/** Legge stato stampante, stato RT, matricola e data/ora nella memoria della stampante; restituisce un eventuale avviso. */
export async function loadStatus(p, c, say = () => {}) {
  c.status = await fp.queryStatus(p, 0);
  let warn = '';
  say('Lettura stato RT…');
  try { c.rt = await fp.queryStatus(p, 1); } catch (e) { c.rt = null; warn = `Stato RT non disponibile: ${e.message}`; }
  say('Lettura matricola…');
  try { const r = await fp.directIO(p, C.CMD.READ_SERIAL, '01'); c.serial = C.decodeSerial(r.data); } catch { c.serial = null; }
  say('Lettura data/ora…');
  try { c.date = (await fp.getDate(p)).toISOString(); } catch { /* facoltativo */ }
  return warn;
}

export function status(main) {
  const p = current();
  const c = cache();
  const st = c.status;
  const rt = c.rt;
  const serial = c.serial;
  const date = c.date ? new Date(c.date) : null;

  const rtRows = rt ? [
    ['Tipo dispositivo', `${C.RT_TYPES[rt.rtType] || ''} ${rt.rtType ? `(${rt.rtType})` : ''}`],
    ['Stato principale', `${C.RT_MAIN[rt.rtMainStatus] || ''} (${rt.rtMainStatus ?? '?'})`],
    ['Sotto-stato', rt.rtSubStatus ?? '—'],
    ['Giornata aperta', rt.rtDailyOpen === '1' ? '<span class="badge warn">Sì – chiusura Z necessaria per le programmazioni</span>' : '<span class="badge ok">No</span>', true],
    ['Periodo di inattività', rt.rtNoWorkingPeriod === '1' ? '<span class="badge warn">Sì – eseguire una chiusura</span>' : 'No', true],
    ['File da inviare', rt.rtFileToSend ?? '—'],
    ['File vecchi in attesa', rt.rtOldFileToSend ?? '—'],
    ['File rifiutati', rt.rtFileRejected && rt.rtFileRejected !== '0' ? `<span class="badge err">${esc(rt.rtFileRejected)}</span>` : (rt.rtFileRejected ?? '—'), true],
    ['Scadenza certificato dispositivo', fmtYmd(rt.rtExpiryCD)],
    ['Scadenza certificato AdE', fmtYmd(rt.rtExpiryCA)],
    ['Modalità (demo/simulazione)', rt.rtTrainingMode ?? '—'],
    ['Esito ultimo aggiornamento FW', rt.rtUpgradeResult ?? '—'],
  ] : [];

  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="actions" style="margin-top:0;margin-bottom:12px">
      <button class="btn" id="btnRefresh">Aggiorna</button>
      <button class="btn secondary" id="btnSync">Imposta data/ora del telefono</button>
    </div>
    <section class="card">
      <h2>Stampante</h2>
      ${st ? `<dl class="kv">
        <dt>Firmware scheda fiscale</dt><dd>${esc(st.cpuRel || '—')}</dd>
        <dt>Firmware MPR / memoria fiscale</dt><dd>${esc(st.mfRel || '—')} (stato ${esc(st.mfStatus ?? '—')})</dd>
        ${C.decodeFpStatus(st.fpStatus).map(([k, v, s]) => `<dt>${esc(k)}</dt><dd><span class="badge ${s}">${esc(v)}</span></dd>`).join('')}
        <dt>Codice stato</dt><dd class="mono">${esc(st.fpStatus || '—')}</dd>
      </dl>` : '<div class="empty">Premi Aggiorna per leggere lo stato.</div>'}
    </section>
    <section class="card">
      <h2>Matricola e data</h2>
      <dl class="kv">
        <dt>Matricola</dt><dd class="mono">${serial ? (serial.ok ? esc(`${serial.oem}${rt?.rtType || ''}${serial.model}${serial.number}`) : esc(serial.raw)) : '—'}</dd>
        <dt>Modello</dt><dd>${serial?.ok ? esc(serial.modelName) : '—'}</dd>
        <dt>Data/ora stampante</dt><dd>${date ? esc(date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })) : '—'}</dd>
        <dt>Data/ora telefono</dt><dd>${esc(new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))}</dd>
      </dl>
    </section>
    <section class="card">
      <h2>Registratore telematico</h2>
      ${rt ? `<dl class="kv">${rtRows.map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>` : '<div class="empty">Nessun dato RT letto.</div>'}
    </section>
    <section class="card">
      <h2>Azioni rapide</h2>
      <div class="actions" style="margin-top:0">
        <button class="btn secondary" id="btnDrawer">Apri cassetto</button>
        <button class="btn secondary" id="btnDisplay">Messaggio sul visore</button>
        <button class="btn ghost" id="btnReset">Reset stampante</button>
      </div>
      <p class="muted" style="font-size:.85rem">Il reset annulla eventuali documenti aperti e riporta la stampante in stato registrazione.</p>
    </section>`;

  $('#btnRefresh', main).onclick = () => task('Lettura stato…', async (ctx) => {
    const warn = await call((pr) => loadStatus(pr, cache(), (t) => ctx.text(t)));
    if (warn) toast(warn, 'warn');
    saveCache();
    status(main);
  });
  $('#btnSync', main).onclick = async () => {
    const now = new Date();
    if (!await confirmBox('Data e ora', `Impostare sulla stampante la data/ora del telefono (${now.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })})? Richiede la giornata chiusa e non può essere precedente all'ultima chiusura.`, { okText: 'Imposta' })) return;
    await task('Programmazione data/ora…', async () => {
      if (!await ensureDayClosed(p, 'cambiare la data')) return;
      await call((pr) => fp.setDate(pr, new Date()));
      cache().date = (await fp.getDate(p)).toISOString(); saveCache();
      toast('Data e ora aggiornate', 'ok');
      status(main);
    });
  };
  $('#btnDrawer', main).onclick = () => task('Apertura cassetto…', async () => { await call((pr) => fp.directIO(pr, '1050', '01')); toast('Comando inviato', 'ok'); });
  $('#btnDisplay', main).onclick = async () => {
    const t = await promptBox('Messaggio sul visore', 'Testo da mostrare (max 40 caratteri, 20 per riga).', { value: 'BENVENUTI' });
    if (t == null) return;
    await task('Invio messaggio…', async () => { await call((pr) => fp.displayText(pr, C.toPrinterText(t).slice(0, 40))); toast('Messaggio inviato', 'ok'); });
  };
  $('#btnReset', main).onclick = async () => {
    if (!await confirmBox('Reset stampante', 'Annullare eventuali documenti aperti e riportare la stampante in stato registrazione?', { okText: 'Reset', danger: true })) return;
    await task('Reset…', async () => { await call((pr) => fp.resetPrinter(pr)); toast('Reset eseguito', 'ok'); });
  };
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export function log(main) {
  const entries = fp.getLog();
  const fmt = (x) => (x || '').replace(/></g, '>\n<');
  main.innerHTML = `
    <section class="card">
      <div class="row between"><h2 style="margin:0">Registro comunicazioni</h2>
        <div class="row"><button class="btn small secondary" id="btnCopy">Copia</button><button class="btn small ghost" id="btnClear">Svuota</button></div></div>
      <p class="muted" style="font-size:.85rem">Ultime ${entries.length} richieste di questa sessione. Utile per diagnosticare errori con la stampante.</p>
      ${entries.length ? entries.map((e, i) => `
        <details class="log-entry">
          <summary><span class="badge ${e.error ? 'err' : e.ok ? 'ok' : 'warn'}">${e.error ? 'ERR' : e.ok ? 'OK' : 'KO'}</span>
            <span class="grow" style="flex:1">${esc(e.label || 'richiesta')}</span><small class="muted">${e.time.toLocaleTimeString('it-IT')} · ${e.ms} ms</small></summary>
          ${e.error ? `<div class="notice err">${esc(e.error)}</div>` : ''}
          <div class="muted" style="font-size:.8rem">Richiesta</div><pre>${esc(fmt(e.request))}</pre>
          ${e.response ? `<div class="muted" style="font-size:.8rem">Risposta</div><pre>${esc(fmt(e.response))}</pre>` : ''}
        </details>`).join('') : '<div class="empty">Nessuna comunicazione registrata.</div>'}
    </section>`;
  $('#btnClear', main).onclick = () => { fp.clearLog(); log(main); };
  $('#btnCopy', main).onclick = () => copyText(entries.map((e) => `[${e.time.toISOString()}] ${e.label} ${e.ms}ms ${e.error || (e.ok ? 'OK' : 'KO')}\n>>> ${e.request}\n<<< ${e.response || ''}`).join('\n\n'));
}

// ---------------------------------------------------------------------------
// Guida
// ---------------------------------------------------------------------------

export function help(main) {
  const here = `${location.protocol}//${location.host}${location.pathname}`;
  main.innerHTML = `
    <section class="card stack">
      <h2>Come funziona</h2>
      <p>L'app comunica con il servizio web <code>fpmate.cgi</code> integrato nelle stampanti fiscali Epson RT (FP-81 II RT, FP-90 III RT, Server RT) usando
      i comandi nativi del protocollo Epson (Direct IO). Il telefono deve essere sulla <b>stessa rete</b> della stampante e la stampante deve avere la porta LAN o Wi-Fi configurata (SET 19).</p>
      <p>Aperta ora da: <code>${esc(here)}</code></p>
    </section>

    <section class="card stack">
      <h2>iPhone: HTTP o HTTPS</h2>
      <p>Safari blocca le chiamate da una pagina <b>HTTPS</b> verso un indirizzo <b>HTTP</b>. Scegli una delle configurazioni:</p>
      <ol>
        <li><b>App in HTTPS + stampante in HTTPS</b> (consigliata se pubblichi l'app su internet, es. GitHub Pages):
          attiva SSL sulla stampante (<i>3333 + CHIAVE + 34 &gt; WEB SERVER &gt; SSL</i>, poi riavvia), nell'app imposta il protocollo HTTPS,
          quindi apri una volta <code>https://IP-STAMPANTE</code> in Safari e accetta il certificato.</li>
        <li><b>App in HTTP + stampante in HTTP</b>: pubblica l'app su un indirizzo http (ad es. il PC del negozio/laboratorio con <code>node serve.js</code>)
          e aprila da Safari. Non serve alcun certificato.</li>
        <li><b>App caricata sulla stampante</b>: carica la cartella dell'app nella web application della stampante (<code>/www/webapp</code> tramite <code>upload.cgi</code>)
          e aprila da <code>http://IP-STAMPANTE/www/webapp/index.html</code>.</li>
      </ol>
      <p>Per installarla: in Safari tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>
    </section>

    <section class="card stack">
      <h2>Regole della stampante</h2>
      <ul>
        <li>Intestazione, aliquote IVA, reparti e data/ora si programmano solo con la <b>giornata chiusa</b> (nessun documento dopo l'ultima chiusura Z). L'app lo verifica e propone la chiusura.</li>
        <li>Non è possibile assegnare la stessa aliquota a due gruppi IVA (tranne lo 0%).</li>
        <li>L'intestazione deve contenere la partita IVA usata in attivazione; niente lettere accentate (vengono convertite, es. "à" → "a'").</li>
        <li>I parametri LAN/Wi-Fi (SET 19) non si possono modificare via rete: usare la tastiera o la porta USB/seriale.</li>
        <li>I loghi grafici vengono stampati solo se il firmware è registrato (licenza attiva).</li>
      </ul>
    </section>

    <section class="card stack">
      <h2>Se qualcosa non funziona</h2>
      <ul>
        <li>Verifica che <code>http(s)://IP-STAMPANTE/www/printer_status/get_status.html</code> si apra da Safari.</li>
        <li>Se il web server ha utente e password (SET 34), inseriscili nelle impostazioni della stampante.</li>
        <li>Errore 17 «Impossibile ora»: serve una chiusura giornaliera o la stampante non è in stato registrazione.</li>
        <li>Errore 16 «Non previsto»: comando non supportato da questo modello/firmware.</li>
        <li>Nella sezione <a href="#/log">Registro</a> trovi richieste e risposte complete da inviare all'assistenza.</li>
      </ul>
      <p class="muted" style="font-size:.85rem">Le programmazioni fiscali sono responsabilità del tecnico abilitato. Prima di modifiche importanti esegui un <a href="#/backup">backup</a>.</p>
    </section>`;
}
