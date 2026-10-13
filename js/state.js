// Stato dell'applicazione: elenco stampanti, stampante corrente, dati letti (cache locale).

import { store, confirmBox, toast } from './ui.js';
import * as fp from './fpmate.js';

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

export const state = {
  printers: store.get('printers', []),
  currentId: store.get('current', null),
  data: {},
  conn: {},
};

export const current = () => state.printers.find((p) => p.id === state.currentId) || null;

export function newPrinter(extra = {}) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: 'Stampante fiscale',
    host: '',
    proto: location.protocol === 'https:' ? 'https' : 'http',
    port: '',
    timeout: 10000,
    user: '',
    pass: '',
    plainText: false,
    simulator: false,
    ...extra,
  };
}

export function savePrinter(p) {
  const i = state.printers.findIndex((x) => x.id === p.id);
  if (i >= 0) state.printers[i] = p; else state.printers.push(p);
  store.set('printers', state.printers);
  if (!state.currentId || !current()) selectPrinter(p.id);
  emit();
}

export function deletePrinter(id) {
  state.printers = state.printers.filter((p) => p.id !== id);
  store.set('printers', state.printers);
  store.del('cache.' + id);
  delete state.data[id];
  if (state.currentId === id) selectPrinter(state.printers[0]?.id || null);
  emit();
}

export function selectPrinter(id) {
  state.currentId = id;
  store.set('current', id);
  emit();
}

export function setConn(ok) {
  const p = current();
  if (p) { state.conn[p.id] = ok; emit(); }
}

/** Dati letti dalla stampante corrente (persistiti in locale). */
export function cache() {
  const p = current();
  if (!p) return {};
  if (!state.data[p.id]) state.data[p.id] = store.get('cache.' + p.id, {});
  return state.data[p.id];
}
export function saveCache() {
  const p = current();
  if (p) store.set('cache.' + p.id, state.data[p.id] || {});
}

/** Esegue una chiamata e aggiorna l'indicatore di connessione. */
export async function call(fn) {
  const p = current();
  try {
    const r = await fn(p);
    if (p) state.conn[p.id] = true;
    emit();
    return r;
  } catch (e) {
    if (p && (e.kind === 'network' || e.kind === 'timeout' || e.kind === 'mixed')) { state.conn[p.id] = false; emit(); }
    throw e;
  }
}

/**
 * Molte programmazioni richiedono la giornata chiusa (DAY OPENED = false).
 * Se la giornata risulta aperta propone l'esecuzione della chiusura giornaliera.
 * Restituisce false se l'utente rinuncia.
 */
export async function ensureDayClosed(p, what = 'questa programmazione') {
  let rt;
  try { rt = await fp.queryStatus(p, 1); } catch { return true; }
  if (rt.rtDailyOpen !== '1') return true;
  const ok = await confirmBox('Giornata aperta',
    `Dopo l'ultima chiusura sono stati emessi documenti commerciali: per ${what} la stampante richiede una chiusura giornaliera (Z) con invio dei corrispettivi. Vuoi eseguirla ora?`,
    { okText: 'Esegui chiusura Z', danger: true });
  if (!ok) return false;
  const r = await fp.printReport(p, 'Z');
  toast(`Chiusura giornaliera eseguita${r.info?.zRepNumber ? ` (Z n. ${r.info.zRepNumber})` : ''}`, 'ok');
  return true;
}
