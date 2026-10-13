// Diagnostica: test di rete (4020), partizioni della scheda SD / DGFE (1136), contatori di manutenzione (4295, sola lettura),
// riavvio web server, reset.

import { $, esc, toast, confirmBox, task, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

const mb = (bytes) => `${(bytes / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;

/** Partizioni della scheda SD (1136); false se non supportato. */
export async function loadSd(p, D) {
  const out = [];
  for (const [i, name] of [[1, 'Fiscale'], [2, 'Utente']]) {
    const r = await fp.directIO(p, '1136', `01${i}`, { allowFail: true, label: `Partizione ${i}` });
    const m = String(r.data).match(/^\d{2}(\d)\s*(\d{13})\s+(\d{13})\s+(\d{13})\s+(\d{13})/);
    if (r.response.success && m) out.push({ name, used: Number(m[2]), total: Number(m[3]), iused: Number(m[4]), itotal: Number(m[5]) });
  }
  if (!out.length) return false;
  D.sd = out;
  return true;
}
/** Contatori di manutenzione (4295): tipo (2) + azzeramento (1), sempre 0: l'app non azzera mai i contatori. */
export async function loadCounters(p, D) {
  const out = [];
  for (const [t, label] of [[10, 'Carta e coperchio'], [1, 'Righe stampate'], [2, 'Attivazioni testina'], [3, 'Tagli carta'], [4, 'Ore di stampa']]) {
    const r = await fp.directIO(p, '4295', `${C.num(t, 2)}0`, { allowFail: true, label });
    const m = String(r.data).match(/^(\d{2})[01](\d{10})/);
    if (!r.response.success || !m || Number(m[1]) !== t) continue;
    const v = Number(m[2]);
    out.push([label, t === 10 ? ({ 0: 'Coperchio chiuso, carta presente', 1000000000: 'Coperchio chiuso, carta assente', 2000000000: 'Coperchio aperto' }[v] || String(v)) : v.toLocaleString('it-IT')]);
  }
  if (!out.length) return false;
  D.mc = out;
  return true;
}

export function diag(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const D = (c.diag ||= {});
  const badge = (ok) => `<span class="badge ${ok ? 'ok' : 'err'}">${ok ? 'OK' : 'KO'}</span>`;

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Test di rete</h2>
      <p class="muted" style="font-size:.88rem">Ping del gateway e del DNS e prova di connessione al server dell'Agenzia delle Entrate (con verifica del certificato). L'esito compare anche sul visore.</p>
      ${D.net ? `<dl class="kv">${D.net.map(([k, ok, msg]) => `<dt>${esc(k)}</dt><dd>${badge(ok)} ${ok ? '' : esc(msg)}</dd>`).join('')}</dl>
        <small class="muted">Eseguito il ${esc(new Date(D.netAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))}</small>` : ''}
      <div class="actions"><button class="btn" id="btnNet">Esegui test di rete</button></div>
    </section>
    <section class="card">
      <h2>Scheda SD (giornale elettronico)</h2>
      ${D.sd ? `<div class="table-wrap"><table class="t"><thead><tr><th>Partizione</th><th class="num">Spazio usato</th><th class="num">Totale</th><th class="num">File (inode)</th></tr></thead><tbody>
        ${D.sd.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${mb(x.used)}</td><td class="num">${mb(x.total)}</td><td class="num">${x.iused.toLocaleString('it-IT')} / ${x.itotal.toLocaleString('it-IT')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Leggi le partizioni dalla stampante.</div>'}
      <div class="actions"><button class="btn secondary" id="btnSd">Leggi partizioni</button></div>
    </section>
    <section class="card">
      <h2>Contatori di manutenzione</h2>
      ${D.mc ? `<dl class="kv">${D.mc.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<div class="empty">Leggi i contatori dalla stampante.</div>'}
      <p class="muted" style="font-size:.85rem">Righe stampate, attivazioni della testina e della taglierina e ore di stampa sono disponibili solo sulla FP-90 III RT.</p>
      <div class="actions"><button class="btn secondary" id="btnMc">Leggi contatori</button></div>
    </section>
    <section class="card">
      <h2>Riavvii e reset</h2>
      <div class="actions" style="margin-top:0">
        <button class="btn secondary" id="btnReset">Reset stampante</button>
        <button class="btn ghost" id="btnWeb">Riavvia web server</button>
      </div>
      <p class="muted" style="font-size:.85rem">Il reset annulla documenti aperti e riporta la stampante in stato registrazione. Il riavvio del web server interrompe la connessione per circa un minuto.</p>
    </section>`;

  $('#btnNet', main).onclick = () => task('Test di rete…', async (ctx) => {
    const out = [];
    for (const [t, label, tmo] of [[1, 'Ping gateway', 20000], [2, 'Ping DNS', 25000], [3, 'Server Agenzia Entrate', 60000]]) {
      ctx.text(`${label}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD_VP.NET_TEST, String(t), { timeout: tmo, allowFail: true, label }));
      out.push([label, r.response.success, r.response.success ? '' : fp.errorMessage(r.response)]);
    }
    D.net = out; D.netAt = Date.now(); saveCache(); diag(main);
  });
  $('#btnSd', main).onclick = () => task('Lettura partizioni…', async () => {
    if (!await call((pr) => loadSd(pr, D))) throw new Error('Lettura non supportata da questo modello o firmware');
    saveCache(); diag(main);
  });
  $('#btnMc', main).onclick = () => task('Lettura contatori…', async () => {
    if (!await call((pr) => loadCounters(pr, D))) throw new Error('Lettura non supportata da questo modello o firmware');
    saveCache(); diag(main);
  });
  $('#btnReset', main).onclick = async () => {
    if (!await confirmBox('Reset stampante', 'Annullare eventuali documenti aperti e riportare la stampante in stato registrazione?', { okText: 'Reset', danger: true })) return;
    task('Reset…', async () => { await call((pr) => fp.resetPrinter(pr)); toast('Reset eseguito', 'ok'); });
  };
  $('#btnWeb', main).onclick = async () => {
    if (!await confirmBox('Riavvia web server', 'Riavviare il web server della stampante? Per circa un minuto l\'app non potrà comunicare.', { okText: 'Riavvia', danger: true })) return;
    task('Riavvio web server…', async () => {
      await call((pr) => fp.rawXmlChecked(pr, fp.el('printerCommand', {}, fp.el('rebootWebServer'))));
      toast('Riavvio richiesto: attendi circa un minuto', 'ok');
    });
  };
}
