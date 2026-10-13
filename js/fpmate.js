// Client per il servizio web fpmate.cgi integrato nelle stampanti fiscali Epson RT
// (FP-81 II RT, FP-90 III RT, Server RT). Richieste SOAP/XML via HTTP(S) POST.

import { simulate } from './simulator.js';
import { PRINTER_ERRORS, RESPONSE_CODES } from './commands.js';

export class FpError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'FpError';
    Object.assign(this, extra);
  }
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Costruisce un elemento XML. `content` null => elemento autochiuso. */
export function el(name, attrs = {}, content = null) {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return content == null ? `<${name}${a} />` : `<${name}${a}>${content}</${name}>`;
}

export function envelope(body) {
  return '<?xml version="1.0" encoding="utf-8"?>\n'
    + '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n<s:Body>\n'
    + body + '\n</s:Body>\n</s:Envelope>';
}

export function printerUrl(p, timeout) {
  const host = String(p.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const proto = p.proto === 'https' ? 'https' : 'http';
  const port = p.port && !((proto === 'http' && +p.port === 80) || (proto === 'https' && +p.port === 443)) ? `:${p.port}` : '';
  const q = new URLSearchParams({ devid: 'local_printer', timeout: String(timeout) });
  return `${proto}://${host}${port}/cgi-bin/fpmate.cgi?${q}`;
}

/** true se il browser bloccherà la richiesta per contenuto misto (pagina HTTPS -> stampante HTTP). */
export function isMixedContent(p) {
  return !p.simulator && location.protocol === 'https:' && p.proto !== 'https';
}

// ---------------------------------------------------------------------------
// Registro delle comunicazioni (visibile nella sezione "Registro")
// ---------------------------------------------------------------------------

const LOG_MAX = 300;
const logEntries = [];
const logListeners = new Set();
export const getLog = () => logEntries;
export const clearLog = () => { logEntries.length = 0; logListeners.forEach((f) => f()); };
export const onLog = (fn) => { logListeners.add(fn); return () => logListeners.delete(fn); };
function addLog(e) {
  logEntries.unshift({ time: new Date(), ...e });
  if (logEntries.length > LOG_MAX) logEntries.length = LOG_MAX;
  logListeners.forEach((f) => f());
}

// ---------------------------------------------------------------------------
// Trasporto
// ---------------------------------------------------------------------------

/** Coda: la stampante elabora una richiesta alla volta. */
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export function sendXml(printer, body, { timeout, label = '' } = {}) {
  const t = Math.max(Number(timeout) || 0, Number(printer.timeout) || 10000);
  return enqueue(() => doSend(printer, body, { timeout: t, label }));
}

async function doSend(printer, body, { timeout, label }) {
  const req = envelope(body);
  const t0 = performance.now();
  let text;
  try {
    if (printer.simulator) {
      text = await simulate(body);
    } else {
      text = await httpPost(printer, req, timeout);
    }
  } catch (e) {
    addLog({ label, request: req, error: e.message, ms: Math.round(performance.now() - t0), printer: printer.name });
    throw e;
  }
  const res = parseResponse(text);
  addLog({ label, request: req, response: text, ok: res.success, ms: Math.round(performance.now() - t0), printer: printer.name });
  return res;
}

/** La 9100 è la porta del protocollo nativo Epson: una richiesta web su quella porta blocca il firmware. */
export const NATIVE_PORT_MESSAGE = 'La porta 9100 è quella del protocollo nativo (usata da EpsonFpWizard e dai gestionali), non del web server. Lascia vuoto il campo porta: l\'app usa la 80 (HTTP) o la 443 (HTTPS).';
export const isNativePort = (port) => String(port || '').trim() === '9100';

async function httpPost(p, body, timeout) {
  if (!p.host) throw new FpError('Indirizzo IP della stampante non impostato.');
  if (isNativePort(p.port)) throw new FpError(NATIVE_PORT_MESSAGE, { kind: 'config' });
  if (isMixedContent(p)) {
    throw new FpError('Questa app è aperta in HTTPS e il browser blocca le richieste HTTP verso la stampante. Imposta il protocollo HTTPS (SSL attivo sulla stampante) oppure apri l\'app tramite HTTP. Vedi la sezione Guida.', { kind: 'mixed' });
  }
  const url = printerUrl(p, timeout);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout + 8000);
  const headers = { 'Content-Type': p.plainText ? 'text/plain; charset=utf-8' : 'text/xml; charset=utf-8' };
  if (!p.plainText) headers['If-Modified-Since'] = 'Thu, 01 Jan 1970 00:00:00 GMT';
  if (p.user) headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(`${p.user}:${p.pass || ''}`)));
  try {
    const r = await fetch(url, { method: 'POST', headers, body, mode: 'cors', cache: 'no-store', signal: ctrl.signal });
    if (r.status === 401) throw new FpError('La stampante richiede utente e password del web server (SET 34). Inseriscili nelle impostazioni della stampante.');
    if (!r.ok) throw new FpError(`La stampante ha risposto HTTP ${r.status}.`);
    return await r.text();
  } catch (e) {
    if (e instanceof FpError) throw e;
    if (e.name === 'AbortError') throw new FpError('Nessuna risposta dalla stampante entro il tempo previsto (timeout).', { kind: 'timeout' });
    const hint = p.proto === 'https'
      ? 'Con HTTPS apri prima https://' + p.host + ' in Safari e accetta il certificato della stampante.'
      : 'Controlla che il telefono sia sulla stessa rete Wi-Fi della stampante.';
    throw new FpError(`Impossibile contattare la stampante (${p.host}). ${hint}`, { kind: 'network', cause: e });
  } finally {
    clearTimeout(timer);
  }
}

export function parseResponse(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const resp = doc.getElementsByTagName('response')[0];
  if (!resp) throw new FpError('Risposta non riconosciuta dalla stampante.', { raw: text });
  const info = {};
  const add = resp.getElementsByTagName('addInfo')[0];
  if (add) {
    for (const c of add.children) {
      const name = c.localName;
      if (name === 'elementList') continue;
      info[name] = c.children.length ? Array.from(c.children).map((x) => x.textContent) : c.textContent;
    }
  }
  return {
    success: resp.getAttribute('success') === 'true',
    code: (resp.getAttribute('code') || '').trim(),
    status: (resp.getAttribute('status') || '').trim(),
    info,
    raw: text,
  };
}

export function errorMessage(r) {
  const code = r.code.replace(/_/g, ' ').toUpperCase();
  if (code === 'PRINTER ERROR' || (code === '' && /^\d+$/.test(r.status) && r.status !== '0')) {
    const n = Number(r.status);
    return `Errore ${n}: ${PRINTER_ERRORS[n] || 'errore della stampante'}`;
  }
  const key = Object.keys(RESPONSE_CODES).find((k) => k.replace(/_/g, ' ').toUpperCase() === code);
  return (key && RESPONSE_CODES[key]) || r.code || 'Operazione non riuscita';
}

function check(r) {
  if (!r.success) throw new FpError(errorMessage(r), { response: r, status: Number(r.status) });
  return r;
}

// ---------------------------------------------------------------------------
// Comandi di alto livello
// ---------------------------------------------------------------------------

/** Invia un comando nativo. Restituisce { data, command, printerStatus, response }. */
export async function directIO(p, command, data = '', { timeout, allowFail = false, label } = {}) {
  timeout = Math.max(Number(timeout) || 0, Number(p.timeout) || 10000);
  const body = el('printerCommand', {}, el('directIO', { command, data, timeout }));
  const r = await sendXml(p, body, { timeout, label: label || `directIO ${command}` });
  if (!allowFail) check(r);
  return { data: r.info.responseData ?? '', command: r.info.responseCommand ?? '', printerStatus: r.info.printerStatus ?? '', response: r };
}

export async function queryStatus(p, statusType = 0) {
  const r = check(await sendXml(p, el('printerCommand', {}, el('queryPrinterStatus', { operator: '1', statusType: String(statusType) })), { label: statusType ? 'Stato RT' : 'Stato stampante' }));
  return r.info;
}

export async function getDate(p) {
  const r = check(await sendXml(p, el('printerCommand', {}, el('getDate')), { label: 'Lettura data/ora' }));
  const i = r.info;
  return new Date(Number(i.year) < 100 ? 2000 + Number(i.year) : Number(i.year), Number(i.month) - 1, Number(i.day), Number(i.hour), Number(i.minute));
}

export async function setDate(p, d) {
  const body = el('printerCommand', {}, el('setDate', {
    day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), hour: d.getHours(), minute: d.getMinutes(),
  }));
  return check(await sendXml(p, body, { label: 'Programmazione data/ora' }));
}

export async function printReport(p, kind) {
  const tag = { X: 'printXReport', Z: 'printZReport', XZ: 'printXZReport' }[kind];
  const timeout = kind === 'X' ? 15000 : 120000;
  const body = el('printerFiscalReport', {}, el(tag, { operator: '1', timeout: kind === 'X' ? undefined : timeout }));
  return check(await sendXml(p, body, { timeout, label: `Rapporto ${kind}` }));
}

export async function resetPrinter(p) {
  return check(await sendXml(p, el('printerCommand', {}, el('resetPrinter', { operator: '1' })), { label: 'Reset stampante' }));
}

export async function printNonFiscal(p, lines) {
  const body = el('printerNonFiscal', {}, [
    el('beginNonFiscal', { operator: '1' }),
    ...lines.map((l) => el('printNormal', { operator: '1', font: '1', data: l })),
    el('endNonFiscal', { operator: '1' }),
  ].join('\n'));
  return check(await sendXml(p, body, { label: 'Documento gestionale' }));
}

export async function displayText(p, text) {
  return check(await sendXml(p, el('printerCommand', {}, el('displayText', { operator: '1', data: text })), { label: 'Messaggio visore' }));
}

/**
 * Carica un logo nella NVRAM e/o ne programma la posizione.
 * option: 0 = carica + programma posizione, 1 = solo carica, 2 = solo posizione.
 * format: 'B' (BMP) o 'R' (raster .bin Epson).
 */
export async function setLogo(p, { location = 0, index = 1, option = 0, format = 'B', base64 = '' }) {
  let body;
  if (option === 2) {
    body = el('printerCommand', {}, el('setLogo', { location, index }));
  } else {
    body = el('printerNonFiscal', {}, [
      el('beginNonFiscal', { operator: '1' }),
      el('printNormal', { operator: '1', font: '1', data: 'AGGIORNAMENTO LOGO GRAFICO ...' }),
      el('setLogo', { operator: '1', location: option === 0 ? location : undefined, index, option, graphicFormat: format }, base64),
      el('printNormal', { operator: '1', font: '1', data: 'AGGIORNAMENTO LOGO TERMINATO.' }),
      el('endNonFiscal', { operator: '1' }),
    ].join('\n'));
  }
  return check(await sendXml(p, body, { timeout: 30000, label: option === 2 ? 'Posizione logo' : 'Caricamento logo' }));
}

/** Emette un documento commerciale (o di reso/annullo). Restituisce le informazioni della risposta. */
export async function fiscalReceipt(p, inner, { timeout = 30000, label = 'Documento commerciale' } = {}) {
  const r = check(await sendXml(p, el('printerFiscalReceipt', {}, inner), { timeout, label }));
  return r.info;
}

/** Ristampa dal giornale elettronico (MPD/DGFE) per numeri documento. Richiede il login. */
export async function printContentByNumbers(p, { dataType = 1, day, month, year, from, to }) {
  const body = el('printerCommand', {}, el('printContentByNumbers', { operator: '1', dataType, day, month, year, fromNumber: from, toNumber: to }));
  return check(await sendXml(p, body, { timeout: 120000, label: 'Stampa MPD per numeri' }));
}

/**
 * Giornale elettronico (MPD/DGFE): kind = printContentByDate | printContentByNumbers |
 * queryContentByDate | queryContentByNumbers. Richiede il login (altrimenti errore 17).
 * Le query restituiscono le righe in `lines`.
 */
export async function contentRequest(p, kind, attrs, { timeout = 180000 } = {}) {
  const body = el('printerCommand', {}, el(kind, { operator: '1', ...attrs }));
  const r = check(await sendXml(p, body, { timeout, label: kind }));
  const lc = r.info.lineCount;
  return { response: r, lines: Array.isArray(lc) ? lc : [] };
}

/** Invia XML e lancia un errore se la stampante risponde con esito negativo. */
export async function rawXmlChecked(p, body, timeout) {
  return check(await sendXml(p, body, { timeout, label: 'Comando' }));
}

/** Invia XML libero (console avanzata). */
export async function rawXml(p, body, timeout) {
  return sendXml(p, body, { timeout, label: 'XML libero' });
}
