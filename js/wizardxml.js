// Lettura dei file di programmazione salvati da EpsonFpWizard per Windows
// (cartella C:\ProgramData\EPSON\EpsonFpWizard\DatiProgrammazione, es. FP81IIRT_NATIVO_99IEB123456_utc_....xml)
// e conversione nel formato di backup di questa app.

import { toPrinterText } from './commands.js';

/** Decodifica il file (UTF-8 o UTF-16 con BOM). */
export function decodeXmlBytes(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF ? b.subarray(3) : b);
}

/** Numero dal formato del wizard ("1,50", "1.234,50" o "1.5"). */
const num = (v) => {
  let s = String(v ?? '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => Math.round(num(v));

export function isWizardXml(text) {
  return /<settings[\s>]/.test(text) && /<Install[A-Za-z]/.test(text);
}

/**
 * Converte il file del wizard. Le sezioni gestite dall'app diventano programmabili;
 * le altre vengono conservate in `extra` (riportate nel riepilogo del ripristino).
 */
export function parseWizardXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('File XML non valido');
  const get = (name) => {
    const e = doc.getElementsByTagName(name)[0];
    return e ? Object.fromEntries(Array.from(e.attributes).map((a) => [a.name, a.value])) : null;
  };
  const st = get('settings') || {};
  const out = {
    app: 'FP Wizard PWA', format: 1, source: 'EpsonFpWizard', date: new Date().toISOString(),
    printer: { name: st.fiscalPrinterModel || 'EpsonFpWizard', serial: st.fiscalSerialNumber || '', firmware: st.CPUVersion || '' },
    extra: {},
  };

  // intestazione: R1..R16 testo, TipoR1..9 font (0 normale, 1 evidenziata, 2 doppia, 3 doppia evidenziata)
  const ii = get('InstallInt');
  if (ii) {
    const lines = {}; const fonts = {};
    for (let n = 1; n <= 16; n++) if (`R${n}` in ii) lines[n] = toPrinterText(ii[`R${n}`]).replace(/\s+$/, '');
    for (let n = 1; n <= 9; n++) if (/^[0-3]$/.test(ii[`TipoR${n}`] ?? '')) fonts[n] = Number(ii[`TipoR${n}`]) + 1;
    out.header = { lines, fonts };
  }

  const iva = get('InstallIva');
  if (iva) {
    out.vat = {};
    for (let g = 1; g <= 9; g++) if (`Iva${g}` in iva) out.vat[g] = num(iva[`Iva${g}`]);
  }

  // reparti: InstallRepN con attributi suffissati dal numero del reparto
  const deps = {};
  for (let n = 1; n <= 99; n++) {
    const a = get(`InstallRep${n}`);
    if (!a) continue;
    const v = (k) => a[`${k}${n}`];
    deps[n] = {
      ok: true,
      fields: {
        num: n,
        desc: toPrinterText(v('Desc') ?? '').replace(/\s+$/, '').slice(0, 20),
        price1: num(v('Prezzo1')), price2: num(v('Prezzo2')), price3: num(v('Prezzo3')),
        single: int(v('SingleItem')) ? 1 : 0,
        vat: int(v('Iva')),
        limit: num(v('Lim')),
        printGroup: int(v('ScRias')),
        category: int(v('GrpMerc')),
        um: toPrinterText(v('UnMisFattura') ?? '').slice(0, 2),
        salesType: int(v('tipoVendita')) ? 1 : 0,
        mode: int(v('modalitàReparto') ?? v('modalitaReparto')),
        ateco: int(v('indiceATECO')),
      },
    };
  }
  if (Object.keys(deps).length) out.departments = deps;

  const f14 = get('InstallFlagS14');
  if (f14) {
    out.flags = {};
    for (let n = 1; n <= 68; n++) if (/^[01]$/.test(f14[`f${n}`] ?? '')) out.flags[n] = Number(f14[`f${n}`]);
  }
  const f15 = get('InstallFlagS15');
  if (f15) {
    out.conf = {};
    for (let n = 1; n <= 29; n++) if (/^\d{1,3}$/.test(f15[`f${n}`] ?? '')) out.conf[n] = Number(f15[`f${n}`]);
  }

  const op = get('InstallOperatori');
  if (op) {
    out.operators = {};
    for (let n = 1; n <= 12; n++) if (`Desc${n}` in op) out.operators[n] = { desc: toPrinterText(op[`Desc${n}`]).replace(/\s+$/, ''), password: int(op[`Pwd${n}`]), commission: num(op[`Perc${n}`]) };
  }
  const cc = get('InstallCarteCredito');
  if (cc) {
    out.cards = {};
    for (let n = 1; n <= 10; n++) if (`Desc${n}` in cc) out.cards[n] = { desc: toPrinterText(cc[`Desc${n}`]).replace(/\s+$/, '') };
  }
  const tk = get('InstallTicket');
  if (tk) {
    out.tickets = {};
    for (let n = 1; n <= 10; n++) if (`Desc${n}` in tk) out.tickets[n] = { desc: toPrinterText(tk[`Desc${n}`]).replace(/\s+$/, ''), value: num(tk[`Imp${n}`]) };
  }

  // sezioni conservate per le funzioni successive
  const EXTRA = {
    InstallContantiDesc: 'Contanti con descrizione', InstallLimiteContante: 'Limite contante', InstallInvoice: 'Parametri fattura',
    InstallFiscalDoc: 'Parametri ricevuta fiscale', InstallLan: 'Parametri LAN', InstallEmail: 'E-mail', EftPos: 'EFT-POS',
    InstallAutoDailyClosure: 'Chiusura automatica', InstallAccess: 'Gestione accesso', InstallLotteryMessage: 'Messaggio lotteria',
    InstallInstantLottery: 'Lotteria istantanea', InstallVP: 'Verificazione periodica', InstallEReceipt: 'E-Receipt',
    InstallIvaStoriche: 'IVA storiche', InstallNature: 'Nature', intelligentWebServer: 'Web server',
  };
  for (const [tag, label] of Object.entries(EXTRA)) {
    const a = get(tag);
    if (a) out.extra[tag] = { label, attrs: a };
  }
  for (let i = 1; i <= 3; i++) { const a = get(`InstallATECO${i}`); if (a) out.extra[`InstallATECO${i}`] = { label: `ATECO ${i}`, attrs: a }; }
  const keys = []; for (let i = 0; i <= 255; i++) { const a = get(`InstallPS2_${i}`); if (a) keys.push(Number(a[`N${i}`])); }
  if (keys.length) out.extra.InstallPS2 = { label: 'Tastiera', attrs: { keys: keys.join(',') } };
  return out;
}
