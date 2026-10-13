// Utilità comuni alle schermate di programmazione: lettura che non interrompe, scrittura con verifica,
// conferma con elenco delle modifiche e gestione della giornata aperta (errore 17).

import { esc, toast, confirmBox, task } from '../ui.js';
import { current, call, saveCache, ensureDayClosed } from '../state.js';
import * as fp from '../fpmate.js';

export const trimR = (s) => String(s ?? '').replace(/\s+$/, '');

/** Legge un comando Direct IO; restituisce i dati o null se la stampante risponde con un errore. */
export const rd = async (p, cmd, data, label) => {
  const r = await fp.directIO(p, cmd, data, { allowFail: true, label: label || `Lettura ${cmd} ${data}` });
  return r.response.success ? r.data : null;
};

/** Scrive e rilegge: lancia un errore se il dato riletto non corrisponde. */
export async function writeVerify(p, wcmd, wdata, rcmd, rdata, label, same = (a, b) => a === b) {
  await fp.directIO(p, wcmd, wdata, { label });
  if (!rcmd) return;
  const back = await rd(p, rcmd, rdata, `Verifica ${label}`);
  if (back == null || !same(back, wdata)) throw new Error(`${label}: il valore riletto non corrisponde (${back == null ? 'nessuna risposta' : trimR(back)})`);
}

/**
 * Esegue scritture [etichetta, cmd, dati, cmdLettura, datiLettura, confronto] con conferma e verifica.
 * Con la giornata aperta propone la chiusura Z e riprova.
 */
export async function writeItems(p, items, rerender, reload, { confirmText } = {}) {
  if (!items.length) { toast('Nessuna modifica da scrivere'); return false; }
  const list = `<ul>${items.map(([l]) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  if (!await confirmBox('Scrivi modifiche', confirmText ? `<p>${esc(confirmText)}</p>${list}` : list, { html: true, okText: 'Scrivi' })) return false;
  let allOk = false;
  await task('Scrittura…', async (ctx) => {
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const [label, wcmd, wdata, rcmd, rdata, same] = items[i];
      ctx.progress(i, items.length, `${label}…`);
      try { await call((pr) => writeVerify(pr, wcmd, wdata, rcmd, rdata, label, same)); } catch (e) {
        if (e.status === 17 && await ensureDayClosed(p, label.toLowerCase())) {
          try { await writeVerify(p, wcmd, wdata, rcmd, rdata, label, same); continue; } catch (e2) { errors.push(`${label}: ${e2.message}`); continue; }
        }
        errors.push(`${label}: ${e.message}`);
      }
    }
    try { await reload?.(); } catch { /* facoltativo */ }
    saveCache();
    if (errors.length) toast(errors.join(' · '), 'error'); else { toast('Modifiche scritte e verificate', 'ok'); allOk = true; }
  });
  rerender?.();
  return allOk;
}

/** Messaggio quando non c'è una stampante selezionata; restituisce true se la vista deve fermarsi. */
export function noPrinter(main) {
  if (current()) return false;
  main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
  return true;
}

/** Data gg/mm/aaaa da "DDMMYY" o "DDMMYYYY"; null se a zero. */
export function fmtDate(s) {
  const t = String(s ?? '');
  if (!/^\d{6}(\d{2})?$/.test(t) || /^0{4}/.test(t)) return null;
  return `${t.slice(0, 2)}/${t.slice(2, 4)}/${t.length === 8 ? t.slice(4) : `20${t.slice(4, 6)}`}`;
}
/** Valore per <input type="date"> da "DDMMYY"/"DDMMYYYY". */
export function isoDate(s) {
  const t = String(s ?? '');
  if (!/^\d{6}(\d{2})?$/.test(t) || /^0{4}/.test(t)) return '';
  return `${t.length === 8 ? t.slice(4) : `20${t.slice(4, 6)}`}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
}
/** Da "aaaa-mm-gg" a "DDMMYY" (o "DDMMYYYY" con long = true). */
export function fromIso(v, long = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  return `${m[3]}${m[2]}${long ? m[1] : m[1].slice(2)}`;
}
