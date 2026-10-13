// Sincronizzazione completa: legge dalla stampante tutte le sezioni scelte e aggiorna i dati che ogni schermata mostra,
// così non serve entrare in ciascuna e premere «Leggi». Fa solo letture: la programmazione della stampante non cambia.
// Le modifiche in sospeso (reparti, PLU, tasti non ancora scritti) restano tali.

import { esc, toast, task, openSheet, store, Cancelled } from './ui.js';
import { cache, saveCache, call } from './state.js';
import { loadStatus } from './views/general.js';
import { readEverything, updateCacheFromBackup } from './views/tools.js';
import { loadInvoice, loadCash, loadAutoz, loadLot } from './views/extras.js';
import { loadCal, loadHist, loadNat, loadAteco } from './views/iva.js';
import { loadLan, loadWeb, loadEmail, loadEft, loadAcc } from './views/net.js';
import { loadKeyCodes, POS_CODES } from './views/keys.js';
import { loadPluKeys, loadPluRange } from './views/plu.js';
import { loadZ, loadLotStatus, loadErec, defaults } from './views/tx.js';
import { loadSd, loadCounters } from './views/diag.js';

const SECONDS_PER_READ = 0.18; // misurato su FP-81 II RT in rete locale

/** Sezioni: id, titolo, numero indicativo di letture, attiva di default. */
export const SYNC_SECTIONS = [
  { id: 'status', title: 'Stato, matricola e data/ora', reads: 4, on: true },
  { id: 'base', title: 'Intestazione, aliquote IVA, reparti, flag e parametri', reads: 232, on: true },
  { id: 'tables', title: 'Operatori, carte, ticket e gruppi merceologici', reads: 43, on: true },
  { id: 'extras', title: 'Fatture, contanti, chiusura automatica, lotteria', reads: 22, on: true },
  { id: 'iva', title: 'IVA calendarizzate e storiche, nature, ATECO', reads: 18, on: true },
  { id: 'net', title: 'Rete, web server, e-mail, EFT-POS, accesso', reads: 51, on: true },
  { id: 'keys', title: 'Tastiera (tasti delle tastiere 32, 23/24 e 56/60)', reads: POS_CODES.length, on: true },
  { id: 'pluKeys', title: 'Tasti PLU diretti', reads: 70, on: true },
  { id: 'tx', title: 'Trasmissioni AdE (esiti Z, lotteria, E-Receipt)', reads: 16, on: true },
  { id: 'diag', title: 'Scheda SD e contatori di manutenzione', reads: 7, on: true },
  { id: 'plu', title: 'PLU interni (intervallo scelto nella schermata PLU)', reads: 20, on: false },
];

const pluRange = (c) => { const u = c.pluUi || { from: 1, to: 20 }; return [u.from || 1, u.to || 20]; };
const readsOf = (s, c) => (s.id === 'plu' ? pluRange(c)[1] - pluRange(c)[0] + 1 : s.id === 'tx' ? 6 + (c.tx?.zCount || 10) : s.reads);

/** Ogni sezione riceve step(i, n, testo) per l'avanzamento; restituisce un'eventuale nota per il riepilogo. */
const RUN = {
  async status(p, c, step) {
    return loadStatus(p, c, (t) => step(0, 1, t));
  },
  async base(p, c, step, ctx) {
    const b = await readEverything(p, { check: () => ctx.check(), progress: (i, n) => step(i, n, `lettura ${i + 1}/${n}`), text: () => {} },
      { header: true, vat: true, depts: true, flags: true, conf: true });
    updateCacheFromBackup(b);
    if (!b.header && !b.vat && !b.departments) throw new Error('nessun dato letto');
    return `${Object.keys(b.departments || {}).length} reparti, ${Object.keys(b.flags || {}).length} flag, ${Object.keys(b.conf || {}).length} parametri`;
  },
  async tables(p, c, step, ctx) {
    const b = await readEverything(p, { check: () => ctx.check(), progress: (i, n) => step(i, n, `lettura ${i + 1}/${n}`), text: () => {} }, { tables: true });
    updateCacheFromBackup(b);
    return `${Object.keys(b.operators || {}).length} operatori, ${Object.keys(b.cards || {}).length} carte, ${Object.keys(b.tickets || {}).length} ticket, ${Object.keys(b.categories || {}).length} gruppi`;
  },
  async extras(p, c, step) {
    const X = (c.extras ||= {});
    step(0, 4, 'parametri fattura'); await loadInvoice(p, X);
    step(1, 4, 'contanti'); await loadCash(p, X);
    step(2, 4, 'chiusura automatica'); await loadAutoz(p, X);
    step(3, 4, 'lotteria'); await loadLot(p, X);
  },
  async iva(p, c, step, ctx, opt) {
    const X = (c.iva ||= {});
    // le aliquote attuali sono già lette con la sezione «base»: si rileggono solo se non è stata scelta
    step(0, 4, 'IVA calendarizzate'); await loadCal(p, X, { withVat: !opt.base });
    step(1, 4, 'IVA storiche'); await loadHist(p, X);
    step(2, 4, 'nature'); await loadNat(p, X);
    step(3, 4, 'ATECO'); await loadAteco(p, X);
  },
  async net(p, c, step) {
    const X = (c.net ||= {});
    step(0, 5, 'rete'); await loadLan(p, X);
    step(1, 5, 'web server e servizi'); await loadWeb(p, X);
    step(2, 5, 'e-mail'); await loadEmail(p, X);
    step(3, 5, 'EFT-POS'); await loadEft(p, X);
    step(4, 5, 'accesso ai dati'); await loadAcc(p, X);
    const missing = [!X.web && 'web server', !X.email && 'e-mail', !X.eft && 'EFT-POS'].filter(Boolean);
    return missing.length ? `non disponibili su questo modello: ${missing.join(', ')}` : '';
  },
  async keys(p, c, step) {
    await loadKeyCodes(p, (c.keys ||= {}), POS_CODES, step);
    return `${POS_CODES.length} tasti`;
  },
  async pluKeys(p, c, step) {
    await loadPluKeys(p, c, step);
    if (!c.pluKeys) return 'non gestiti da questo modello';
    return '';
  },
  async tx(p, c, step) {
    const X = (c.tx ||= {});
    await loadZ(p, X, (i, n, t) => step(i, n + 2, t));
    // lotteria ed E-Receipt del periodo in corso: Z successiva all'ultima chiusura e data di oggi
    const Q = (X.q ||= {});
    delete Q.z; delete Q.date;
    await defaults(p, Q);
    const n = (X.zCount || 10) + 2;
    step(n - 2, n, 'lotteria');
    const lot = await loadLotStatus(p, X, Q);
    step(n - 1, n, 'E-Receipt');
    const er = await loadErec(p, X, Q);
    const bad = X.z?.rows?.filter((r) => r.res === 3).length || 0;
    return [bad ? `${bad} Z senza risposta trovata` : '', !lot && 'lotteria non disponibile', !er && 'E-Receipt non disponibili'].filter(Boolean).join(', ');
  },
  async diag(p, c, step) {
    const D = (c.diag ||= {});
    step(0, 2, 'scheda SD'); const sd = await loadSd(p, D);
    step(1, 2, 'contatori'); const mc = await loadCounters(p, D);
    return [!sd && 'scheda SD non disponibile', !mc && 'contatori non disponibili'].filter(Boolean).join(', ');
  },
  async plu(p, c, step) {
    const [from, to] = pluRange(c);
    await loadPluRange(p, (c.plu ||= {}), from, to, step);
    return `PLU ${from}–${to}`;
  },
};

/** Esegue la sincronizzazione delle sezioni indicate. Si ferma solo se la stampante non risponde o se l'utente interrompe. */
export async function runSync(p, ids, ctx) {
  const c = cache();
  const list = SYNC_SECTIONS.filter((s) => ids.includes(s.id));
  const weights = list.map((s) => Math.max(1, readsOf(s, c)));
  const total = weights.reduce((a, b) => a + b, 0);
  const results = [];
  const started = Date.now();
  let done = 0;
  const opt = { base: ids.includes('base') };
  try {
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const w = weights[k];
      ctx.check();
      ctx.progress(done, total, `${s.title}…`);
      const step = (i, n, t) => { ctx.check(); ctx.progress(done + (n ? Math.min(1, i / n) * w : 0), total, `${s.title}: ${t}`); };
      try {
        const note = await RUN[s.id](p, c, step, ctx, opt);
        results.push({ id: s.id, title: s.title, ok: true, note: note || '' });
      } catch (e) {
        if (e instanceof Cancelled || e?.name === 'Cancelled') throw e;
        if (['network', 'timeout', 'mixed'].includes(e?.kind)) throw e;
        results.push({ id: s.id, title: s.title, ok: false, note: e.message || String(e) });
      }
      saveCache();
      done += w;
    }
  } finally {
    c.sync = { at: Date.now(), seconds: Math.round((Date.now() - started) / 1000), requested: list.length, results };
    saveCache();
  }
  ctx.progress(total, total);
  return results;
}

/** Finestra «Sincronizza tutto»: scelta delle sezioni, avvio e riepilogo. */
export function openSync(p, onDone) {
  const c = cache();
  const saved = store.get('syncSections', null);
  const isOn = (s) => (saved ? saved.includes(s.id) : s.on);
  const estimate = (ids) => {
    const reads = SYNC_SECTIONS.filter((s) => ids.includes(s.id)).reduce((a, s) => a + readsOf(s, c), 0);
    const sec = Math.round(reads * SECONDS_PER_READ * (p.simulator ? 0.8 : 1));
    return sec < 90 ? `circa ${Math.max(10, Math.round(sec / 10) * 10)} secondi` : `circa ${Math.round(sec / 60)} minuti`;
  };
  openSheet(`
    <h2>Sincronizza tutto</h2>
    <p class="muted" style="font-size:.88rem">Legge dalla stampante le sezioni selezionate e aggiorna i dati di tutte le schermate. È solo una lettura: la programmazione della stampante non viene modificata.</p>
    ${SYNC_SECTIONS.map((s) => `<label class="check"><input type="checkbox" data-sec="${s.id}" ${isOn(s) ? 'checked' : ''}> <span>${esc(s.title)}</span></label>`).join('')}
    <p class="muted" style="font-size:.85rem" data-est></p>
    <div class="actions"><button class="btn" data-ok>Avvia</button><button class="btn ghost" data-cancel>Annulla</button></div>`, {
    onMount(sheet, close) {
      const ids = () => [...sheet.querySelectorAll('[data-sec]')].filter((x) => x.checked).map((x) => x.dataset.sec);
      const upd = () => { sheet.querySelector('[data-est]').textContent = ids().length ? `Tempo stimato: ${estimate(ids())}. Puoi interrompere in qualsiasi momento.` : 'Seleziona almeno una sezione.'; };
      sheet.addEventListener('change', upd);
      upd();
      sheet.querySelector('[data-cancel]').onclick = close;
      sheet.querySelector('[data-ok]').onclick = async () => {
        const sel = ids();
        if (!sel.length) { toast('Seleziona almeno una sezione', 'warn'); return; }
        store.set('syncSections', sel);
        close();
        let results;
        let stopped = '';
        await task('Sincronizzazione…', async (ctx) => {
          try {
            results = await call((pr) => runSync(pr, sel, ctx));
          } catch (e) {
            results = cache().sync?.results || [];
            stopped = e instanceof Cancelled || e?.name === 'Cancelled' ? 'Interrotta dall\'utente.' : `Interrotta: ${e.message}`;
          }
        }, { cancellable: true, quiet: true }).catch(() => {});
        showSummary(results || [], stopped);
        onDone?.();
      };
    },
  });
}

function showSummary(results, stopped) {
  const s = cache().sync;
  const ok = results.filter((r) => r.ok).length;
  const ko = results.filter((r) => !r.ok);
  if (!stopped && !ko.length) toast('Sincronizzazione completata', 'ok');
  openSheet(`
    <h2>${stopped ? 'Sincronizzazione interrotta' : 'Sincronizzazione completata'}</h2>
    ${stopped ? `<div class="notice warn">${esc(stopped)} I dati delle sezioni già lette sono stati aggiornati.</div>` : ''}
    <ul class="sync-list">${results.map((r) => `<li class="${r.ok ? 'ok' : 'err'}"><b>${r.ok ? '✓' : '✗'} ${esc(r.title)}</b>${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</li>`).join('')}</ul>
    <p class="muted" style="font-size:.85rem">${ok === 1 ? '1 sezione letta' : `${ok} sezioni lette`}${s?.requested ? ` su ${s.requested}` : ''}${ko.length ? ` (${ko.length} non disponibili o con errore)` : ''}${s?.seconds != null ? ` in ${s.seconds < 60 ? `${s.seconds} secondi` : `${Math.floor(s.seconds / 60)} min ${s.seconds % 60} s`}` : ''}.</p>
    <div class="actions"><button class="btn" data-close>Chiudi</button></div>`, {
    onMount(sheet, close) { sheet.querySelector('[data-close]').onclick = close; },
  });
}
