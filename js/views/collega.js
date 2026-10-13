// Collega stampante: si scrive l'IP e l'app crea la stampante, prova il collegamento e, se il browser non ha ancora
// accettato il certificato HTTPS della stampante, apre la sua pagina e completa il collegamento da sola al ritorno.
// Link diretto: …/collega oppure …/collega?ip=192.168.1.111 (vedi collega.html).

import { $, $$, esc, toast, fresh, store, ipField } from '../ui.js';
import { state, newPrinter, savePrinter, selectPrinter, cache, saveCache } from '../state.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { openSync } from '../sync.js';

const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const RETRY_MS = 3000;
let poll = null; // tentativi automatici mentre si aspetta l'accettazione del certificato

export function collega(main, ipArg = '') {
  main = fresh(main);
  stopPolling();
  const recent = store.get('recentIps', []);
  const https = location.protocol === 'https:';
  main.innerHTML = `
    <section class="card hero">
      <span class="hero-badge">Collega stampante</span>
      <h2>Scrivi l'IP della stampante <em>e collegati.</em></h2>
      <p class="muted">L'IP si legge sulla stampante (3333 + CHIAVE + 19, oppure nello scontrino di stato rete).</p>
      <form id="f" autocomplete="off">
        <input id="ip" type="text" inputmode="decimal" placeholder="192.168.1.100" value="${esc(ipArg)}" aria-label="Indirizzo IP della stampante"
          style="font-size:1.4rem;font-weight:900;letter-spacing:.02em;margin:.4rem 0 .2rem">
        <div class="actions"><button class="btn" type="submit">Collega</button></div>
      </form>
      ${recent.length ? `<p class="muted" style="font-size:.85rem;margin-top:.9rem">Usati di recente:</p><div class="row">${recent.map((ip) => `<button class="btn small secondary" data-ip="${esc(ip)}">${esc(ip)}</button>`).join('')}</div>` : ''}
    </section>
    <section class="card" id="out" hidden></section>`;

  const out = $('#out', main);
  const show = (html) => { out.hidden = false; out.innerHTML = html; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const ipInput = $('#ip', main);
  ipField(ipInput);

  const go = (raw) => {
    const ip = String(raw || '').trim().replace(/,/g, '.').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!IP_RE.test(ip)) { toast('Scrivi un indirizzo IP valido, es. 192.168.1.100', 'warn'); ipInput.focus(); return; }
    ipInput.value = ip;
    store.set('recentIps', [ip, ...recent.filter((x) => x !== ip)].slice(0, 5));
    connect(ip, https, show, main);
  };
  $('#f', main).addEventListener('submit', (e) => { e.preventDefault(); go(ipInput.value); });
  $$('[data-ip]', main).forEach((b) => b.addEventListener('click', () => go(b.dataset.ip)));
  // pagina ridisegnata dopo il collegamento (cambio di stampante): si mostra l'esito invece di ricollegarsi
  if (result) { const r = result; result = null; showResult(main, r); return; }
  if (ipArg) go(ipArg); else setTimeout(() => ipInput.focus(), 50);
}

function stopPolling() {
  if (poll) { clearInterval(poll.timer); document.removeEventListener('visibilitychange', poll.onVisible); poll = null; }
}

/** Prova il collegamento; in HTTPS il primo errore di rete di solito vuol dire certificato non ancora accettato. */
async function connect(ip, https, show, main) {
  stopPolling();
  const existing = state.printers.find((x) => !x.simulator && x.host === ip);
  const protos = https ? ['https'] : [existing?.proto || 'https', existing?.proto === 'http' ? 'https' : 'http'];
  show(`<div class="row" style="gap:.7rem"><div class="spinner" aria-hidden="true"></div><div>Collegamento a <b>${esc(ip)}</b>…</div></div>`);
  let lastErr = null;
  for (const proto of protos) {
    const res = await tryPrinter(ip, proto);
    if (res.ok) { await done(ip, proto, existing); return; }
    lastErr = res.err;
    if (res.answered) { await done(ip, proto, existing, res.err); return; }
  }
  if (!main.isConnected) return;
  // non risponde: certificato da accettare (HTTPS) oppure stampante non raggiungibile
  const url = `https://${ip}/`;
  show(`
    <h2>Accetta il certificato della stampante</h2>
    <p>La stampante usa un certificato Epson che il telefono non conosce: va accettato <b>una volta</b>.</p>
    <ol style="padding-left:1.2rem;margin:.4rem 0">
      <li>Tocca <b>Apri la pagina della stampante</b>.</li>
      <li>Alla pagina «Questa connessione non è privata» tocca <b>Mostra dettagli</b> e poi <b>visita questo sito web</b> (su PC: <b>Avanzate › Procedi</b>).</li>
      <li>Quando vedi la pagina della stampante <b>torna qui</b>: il collegamento si completa da solo.</li>
    </ol>
    <div class="actions"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Apri la pagina della stampante</a><button class="btn secondary" id="btnRetry">Riprova</button></div>
    <p class="muted" style="font-size:.85rem" id="pollState">In attesa…</p>
    <details style="margin-top:.6rem"><summary class="muted" style="cursor:pointer">Non funziona?</summary>
      <ul class="muted" style="font-size:.88rem;padding-left:1.2rem">
        <li>Il telefono deve essere sulla <b>stessa rete Wi-Fi</b> della stampante e l'IP deve essere giusto${lastErr ? ` (errore: ${esc(lastErr.message)})` : ''}.</li>
        <li>Sulla stampante deve essere attivo <b>SSL</b> (3333 + CHIAVE + 34 › WEB SERVER › SSL = 1, poi riavvio).</li>
        <li>Su iPhone apri questo link da <b>Safari</b>: l'app aggiunta alla schermata Home può non vedere il certificato accettato in Safari.</li>
      </ul></details>`);
  let attempts = 0;
  let busy = false;
  const retry = async () => {
    if (busy || !main.isConnected) { if (!main.isConnected) stopPolling(); return; }
    busy = true;
    attempts++;
    const st = $('#pollState', main);
    if (st) st.textContent = `Provo a collegarmi… (tentativo ${attempts})`;
    const res = await tryPrinter(ip, 'https');
    busy = false;
    if (!main.isConnected) { stopPolling(); return; }
    if (res.ok || res.answered) { stopPolling(); await done(ip, 'https', existing, res.answered ? res.err : null); return; }
    if (st) st.textContent = 'In attesa: accetta il certificato nella pagina della stampante e torna qui.';
  };
  const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
  poll = { timer: setInterval(() => { if (document.visibilityState === 'visible') retry(); }, RETRY_MS), onVisible };
  document.addEventListener('visibilitychange', onVisible);
  $('#btnRetry', main)?.addEventListener('click', retry);
}

/** ok = risposta corretta; answered = il web server ha risposto ma la stampante ha dato un errore (es. occupata). */
async function tryPrinter(ip, proto) {
  const probe = { ...newPrinter({ host: ip, proto, name: `Stampante ${ip}` }), timeout: 3000 };
  try {
    await fp.queryStatus(probe, 0);
    return { ok: true };
  } catch (e) {
    const net = ['network', 'timeout', 'mixed'].includes(e.kind);
    return { ok: false, answered: !net, err: e };
  }
}

/** Salva e seleziona la stampante, legge modello e matricola per darle un nome riconoscibile. */
async function done(ip, proto, existing, warn = null) {
  const p = existing ? { ...existing, proto } : newPrinter({ host: ip, proto, name: `Stampante ${ip}` });
  let model = '';
  let serial = '';
  let decoded = null;
  if (!warn) {
    try {
      decoded = C.decodeSerial((await fp.directIO(p, C.CMD.READ_SERIAL, '01', { allowFail: true, label: 'Matricola' })).data);
      let rtType = null;
      try { rtType = (await fp.queryStatus(p, 1)).rtType; } catch { /* facoltativo */ }
      if (decoded.ok) {
        model = (C.MODELS[decoded.model] || decoded.model).replace(/\s*\(.*\)$/, '');
        serial = C.rtSerial(decoded, rtType) || `${decoded.oem}${decoded.model}${decoded.number}`;
      }
      if (!existing || /^Stampante (fiscale|\d)/.test(existing.name)) p.name = model ? `${model} (${ip})` : `Stampante ${ip}`;
    } catch { /* il nome resta quello predefinito */ }
  }
  const html = warn ? `
    <h2>Stampante raggiunta</h2>
    <div class="notice warn">Il web server di <b>${esc(ip)}</b> risponde, ma la stampante ha dato un errore: ${esc(warn.message)}<br>
      Se EpsonFpWizard per Windows o un gestionale sono collegati, chiudili e premi «Verifica connessione» in Home.</div>
    <div class="actions"><a class="btn" href="#/home">Vai alla home</a></div>`
    : `
    <h2>Collegata ✓</h2>
    <p><b>${esc(p.name)}</b>${serial ? ` · matricola <span class="mono">${esc(serial)}</span>` : ''} · ${esc(proto.toUpperCase())}</p>
    <p class="muted">La stampante è salvata e selezionata. Ora puoi leggere in una volta tutti i dati.</p>
    <div class="actions"><button class="btn" id="btnSyncNow">Sincronizza tutto</button><a class="btn secondary" href="#/home">Vai alla home</a></div>`;
  // selezionando la stampante l'app ridisegna la pagina: il risultato viene mostrato dalla pagina ridisegnata
  result = { html, printer: p };
  state.conn[p.id] = !warn;
  savePrinter(p);
  selectPrinter(p.id);
  if (decoded?.ok) { cache().serial = decoded; saveCache(); }
  if (result) { const r = result; result = null; showResult(document.getElementById('view'), r); }
  if (!warn) toast(`Collegata a ${p.name}`, 'ok');
}

let result = null;
function showResult(main, r) {
  const out = main?.querySelector('#out');
  if (!out) return;
  out.hidden = false;
  out.innerHTML = r.html;
  out.querySelector('#btnSyncNow')?.addEventListener('click', () => openSync(r.printer, () => { location.hash = '#/home'; }));
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
