// Tastiere delle stampanti fiscali Epson: disposizione dei tasti, funzioni e codici tasto.
// Dati ricavati dalle tabelle di EpsonFpWizard per Windows (Programmazione Tasti):
// ogni tasto fisico invia un codice (scan code PS/2) e la stampante associa a ogni codice una funzione (4229 / 4029).

/** Funzione predefinita per ogni codice tasto (pulsante «Imposta Default» del wizard). 997/998 = riservate, sola lettura. */
export const KEY_DEFAULTS = {
  0: 999, 1: 113, 2: 999, 3: 109, 4: 105, 5: 14, 6: 112, 7: 98, 8: 999, 9: 97, 10: 103, 11: 110, 12: 119, 13: 56, 14: 999, 15: 999, 16: 999, 17: 58, 18: 59, 19: 999,
  20: 60, 21: 122, 22: 1, 23: 999, 24: 999, 25: 999, 26: 124, 27: 101, 28: 114, 29: 115, 30: 2, 31: 999, 32: 999, 33: 138, 34: 116, 35: 194, 36: 106, 37: 4, 38: 3,
  39: 999, 40: 999, 41: 999, 42: 96, 43: 123, 44: 136, 45: 997, 46: 5, 47: 999, 48: 999, 49: 111, 50: 137, 51: 125, 52: 102, 53: 117, 54: 6, 55: 999, 56: 999, 57: 999,
  58: 999, 59: 999, 60: 107, 61: 7, 62: 8, 63: 999, 64: 999, 65: 15, 66: 999, 67: 139, 68: 118, 69: 0, 70: 9, 71: 999, 72: 999, 73: 62, 74: 63, 75: 193, 76: 126, 77: 104,
  78: 141, 85: 57, 89: 61, 93: 140, 107: 19, 108: 22, 109: 999, 110: 27, 111: 28, 112: 25, 113: 26, 114: 17, 115: 20, 116: 21, 117: 23, 118: 998, 119: 999, 120: 97,
  121: 99, 122: 18, 123: 16, 124: 13, 125: 24, 126: 999, 127: 126, 128: 127, 129: 128, 130: 999, 131: 108, 149: 140, 150: 141, 201: 999, 202: 10, 218: 100, 241: 12,
};
/** Valori di fabbrica di tutti i 256 codici (verificati su una FP-81 II RT): la tabella del wizard più i PLU 1–70 su altri codici. */
export const KEY_FACTORY = (() => {
  const t = { ...KEY_DEFAULTS };
  for (let c = 94; c <= 103; c++) t[c] = c - 38; // PLU 1-10
  for (let c = 151; c <= 170; c++) t[c] = c - 85; // PLU 11-30
  for (let c = 171; c <= 200; c++) t[c] = c - 21; // PLU 31-60
  for (let c = 203; c <= 212; c++) t[c] = c - 23; // PLU 61-70
  return t;
})();
export const keyDefault = (code) => KEY_FACTORY[code] ?? 999;
/** Codici tasto gestiti (come il wizard: da 000 a 255). */
export const KEY_CODES = Array.from({ length: 256 }, (_, i) => i);

/** Tasto equivalente su una tastiera PC (QWERTY italiana). */
export const KEY_QWERTY = {
  1: 'F9', 3: 'F5', 4: 'F3', 5: 'F1', 6: 'F2', 7: 'F12', 9: 'F10', 10: 'F8', 11: 'F6', 12: 'F4', 13: 'Tab', 17: 'Alt (sinistra)', 18: 'Alt (destra)',
  20: 'Ctrl (sinistra)', 21: 'Q', 22: '1 !', 26: 'Z', 27: 'S', 28: 'A', 29: 'W', 30: '2 "', 33: 'C', 34: 'X', 35: 'D', 36: 'E', 37: '4 $', 38: '3 £', 42: 'V',
  43: 'F', 44: 'T', 45: 'R', 46: '5 %', 49: 'N', 50: 'B', 51: 'H', 52: 'G', 53: 'Y', 54: '6 &', 58: 'M', 59: 'J', 60: 'U', 61: '7 /', 62: '8 (', 65: ', ;', 66: 'K',
  67: 'I', 68: 'O', 69: '0 =', 70: '9 )', 73: '. :', 74: '- _', 75: 'L', 76: 'ò ç @', 77: 'P', 78: "' ?", 85: 'ì ^', 89: 'Shift (destra)', 93: 'ù §',
  107: '4 (tast. num.)', 108: '7 (tast. num.)', 112: '0 (tast. num.)', 113: '. (tast. num.)', 114: '2 (tast. num.)', 115: '5 (tast. num.)',
  116: '6 (tast. num.)', 117: '8 (tast. num.)', 118: 'Esc', 120: 'F11', 121: '+ (tast. num.)', 122: '3 (tast. num.)', 123: '- (tast. num.)',
  124: '* (tast. num.)', 125: '9 (tast. num.)', 131: 'F7', 202: '/ (tast. num.)', 218: 'Invio (tast. num.)', 241: 'Canc',
};

/** Nomi delle funzioni (Manuale Operatore Epson, cap. 12, con le descrizioni del wizard). */
export const FUNCS = (() => {
  const f = {};
  for (let i = 0; i <= 9; i++) f[i] = `CIFRA ${i}`;
  Object.assign(f, { 10: '00', 11: '000', 12: 'CL CLEAR', 13: 'X', 14: 'ANNULLO / VOID', 15: ', (VIRGOLA)' });
  for (let i = 1; i <= 40; i++) f[15 + i] = `REPARTO ${i}`;
  for (let i = 1; i <= 30; i++) f[55 + i] = `PLU ${i}`;
  for (let i = 1; i <= 5; i++) { f[85 + i] = `CONTANTE ${i}`; f[90 + i] = `VALUTA ${i}`; }
  Object.assign(f, {
    96: 'VALUTA', 97: 'CARTA CREDITO', 98: 'ASSEGNI', 99: 'SUBTOTAL / APERTURA CASSETTO', 100: 'CONTANTE / TOTALE', 101: 'S', 102: 'G',
    103: 'PLU INDIRETTO / GENERICO', 104: 'PLU ENTRY', 105: 'RESO', 106: 'ENTRATE', 107: 'USCITE', 108: 'MAGGIORAZIONE (%)', 109: 'SCONTO (%)',
    110: 'ABBUONO / SCONTO', 111: 'NON CALCOLA', 112: 'STORNO', 113: 'TICKET', 114: 'SCELTA PREZZO PLU / REPARTO', 115: 'ULTIMO TOTALE',
    116: 'MxN (1)', 117: 'MxN (2)', 118: 'OPERATORE', 119: 'VOID TOTALE / ANNULLO GLOBALE', 120: 'NON UTILIZZATO', 121: 'NON UTILIZZATO', 122: 'SUPERA LIMITE',
    123: 'FATTURA SEGUITO DOCUMENTO', 124: 'CODICE PRODOTTO', 125: 'VISUAL. PRODOTTO', 136: 'CODICE CLIENTE', 137: 'CODICE FISCALE / PARTITA IVA / CODICE LOTTERIA',
    138: 'CHIAVE', 139: 'MAGGIORAZIONE', 190: 'DIPENDENTI (OBSOLETA)', 191: 'CONVENZIONI (OBSOLETA)', 192: 'TICKET SURPLUS (OBSOLETA)', 193: 'NOTA DI CREDITO (OBSOLETA)',
    194: 'DOCUMENTO + FATTURA (A SEGUITO DOCUMENTO)', 195: 'QUANTITÀ DECIMALE', 196: 'FATTURA DIRETTA', 197: 'RICHIESTA E-MAIL',
    198: 'VERIFICA IMMAGINE SCONTRINO (OBSOLETA)', 199: 'INVIO IMMAGINE SCONTRINO (OBSOLETA)', 200: 'ATTIVAZIONE PHP', 260: 'REPARTO INDIRETTO', 261: 'ACCONTO',
    262: 'OMAGGIO', 263: 'BUONO MONOUSO', 264: 'TICKET MULTIPLI', 265: 'NON RISCOSSO BENI E SERVIZI', 266: 'NON RISCOSSO BENI', 267: 'NON RISCOSSO SERVIZI',
    268: 'NON RISCOSSO SEGUE FATTURA', 269: 'NON RISCOSSO SEGUE FATTURA RT', 270: 'NON RISCOSSO SSN', 271: 'SCONTO A PAGARE GENERICO',
    272: 'SCONTO A PAGARE BUONO MULTIUSO', 273: 'MODO EMISSIONE (STAMPA E/O DIGITALE)', 274: 'ID CLIENTE E-RECEIPT', 999: 'NESSUNA FUNZIONE',
  });
  for (let i = 1; i <= 10; i++) { f[125 + i] = `TICKET ${i}`; f[139 + i] = `CARTA DI CREDITO ${i}`; }
  for (let i = 31; i <= 70; i++) f[119 + i] = `PLU ${i}`;
  for (let i = 41; i <= 99; i++) f[160 + i] = `REPARTO ${i}`;
  return f;
})();
export const READ_ONLY_FUNCS = [997, 998];
export const funcName = (n) => FUNCS[n] || (READ_ONLY_FUNCS.includes(n) ? 'FUNZIONE INTERNA RISERVATA (SOLO LETTURA)' : `FUNZIONE ${n}`);

/** Gruppi per la scelta della funzione. */
export const FUNC_GROUPS = [
  ['Tasti numerici e di servizio', (n) => n <= 15 || n === 101 || n === 102 || n === 138 || n === 118],
  ['Reparti', (n) => (n >= 16 && n <= 55) || (n >= 201 && n <= 260)],
  ['PLU', (n) => (n >= 56 && n <= 85) || (n >= 150 && n <= 189) || n === 103 || n === 104 || n === 114 || n === 124 || n === 125],
  ['Pagamenti', (n) => (n >= 86 && n <= 98) || n === 100 || n === 113 || (n >= 126 && n <= 135) || (n >= 140 && n <= 149) || (n >= 261 && n <= 272)],
  ['Sconti, maggiorazioni, resi e annulli', (n) => [105, 108, 109, 110, 112, 119, 139].includes(n)],
  ['Altre funzioni', () => true],
];

// Tastiere: [etichetta, funzione predefinita, opzioni] in ordine di posizione (righe da sinistra a destra).
// opzioni: w = larghezza in colonne, h = altezza in righe, sub = lettere sotto la cifra, c = colore, off = non programmabile.
const D = (l, f, o = {}) => ({ label: l, func: f, ...o });
export const KEYBOARDS = {
  k32: {
    name: '32 tasti', cols: 4, keys: [
      D('↑S', 101, { c: 'sys' }), D('↑G', 102, { c: 'sys' }), D('Chiave', 138, { c: 'key' }), D('All Void', 119, { c: 'void' }),
      D('Sconto', 110, { c: 'disc' }), D('Reso', 105, { c: 'disc' }), D('Plu Generico', 103, { c: 'plu' }), D('Void', 14, { c: 'void' }),
      D('Sconto %', 109, { c: 'disc' }), D('Magg. %', 108, { c: 'disc' }), D('Rep. 2', 17, { c: 'dept' }), D('Storno', 112, { c: 'void' }),
      D('CL Clear', 12, { c: 'sys' }), D('X', 13, { c: 'sys' }), D('Rep. 1', 16, { c: 'dept' }), D('Assegni', 98, { c: 'pay' }),
      D('7', 7, { sub: 'PRS' }), D('8', 8, { sub: 'TUV' }), D('9', 9, { sub: 'WXY' }), D('Non Riscosso', 113, { c: 'pay' }),
      D('4', 4, { sub: 'GHI' }), D('5', 5, { sub: 'JKL' }), D('6', 6, { sub: 'MN' }), D('Credito', 97, { c: 'pay' }),
      D('1', 1), D('2', 2, { sub: 'ABC' }), D('3', 3, { sub: 'DEF' }), D('Sub Totale', 99, { c: 'pay' }),
      D('0', 0, { sub: 'OQZ' }), D('00', 10), D(',', 15), D('Contante', 100, { c: 'pay' }),
    ],
  },
  k23: {
    name: '23/24 tasti', cols: 4, dark: true, keys: [
      D('↑G', 102), D('Chiave', 138), D('Storno', 112), D('All Void', 119),
      D('CL Clear', 12), D('X', 13), D('Sconto %', 109), D('Void', 14),
      D('7', 7, { sub: 'PRS' }), D('8', 8, { sub: 'TUV' }), D('9', 9, { sub: 'WXY' }), D('Rep. 1', 16),
      D('4', 4, { sub: 'GHI' }), D('5', 5, { sub: 'JKL' }), D('6', 6, { sub: 'MN' }), D('Sub Totale', 99),
      D('1', 1), D('2', 2, { sub: 'ABC' }), D('3', 3, { sub: 'DEF' }), D('Contante', 100, { h: 2 }),
      D('0', 0, { sub: 'OQZ' }), D('000', 0, { off: 'Il tasto 000 non ha un codice proprio: non si programma separatamente.' }), D(',', 15),
    ],
  },
  k56: {
    name: '56/60 tasti', cols: 12, keys: [
      D('Annullo', 14, { c: 'void' }), D('Storno', 112, { c: 'void' }), D('Reso', 105, { c: 'void' }), D('Annullo Globale', 119, { c: 'void' }),
      D('Sconto %', 109, { c: 'disc' }), D('Sconto', 110, { c: 'disc' }), D('Magg. %', 108, { c: 'disc' }), D('Rep 8', 23, { c: 'dept' }), D('Rep 9', 24, { c: 'dept' }),
      D('Rep 10', 25, { c: 'dept' }), D('Non Riscosso', 113, { c: 'pay' }), D('Ticket 1', 126, { c: 'pay' }),
      D('Uscite', 107, { c: 'key' }), D('Entrate', 106, { c: 'key' }), D('Operatore', 118, { c: 'key' }), D('Plu Generico', 103, { c: 'key' }),
      D('7', 7, { sub: 'PRS', c: 'num2' }), D('8', 8, { sub: 'TUV', c: 'num2' }), D('9', 9, { sub: 'WXY', c: 'num2' }), D('Rep 5', 20, { c: 'dept' }), D('Rep 6', 21, { c: 'dept' }),
      D('Rep 7', 22, { c: 'dept' }), D('Bancomat', 141, { c: 'pay' }), D('Carta di Credito', 140, { c: 'pay' }),
      D('↑S', 101, { c: 'sys' }), D('↑G', 102, { c: 'sys' }), D('Chiave', 138, { c: 'key' }), D('C. Cliente', 136, { c: 'key' }),
      D('4', 4, { sub: 'GHI', c: 'num2' }), D('5', 5, { sub: 'JKL', c: 'num2' }), D('6', 6, { sub: 'MN', c: 'num2' }), D('C. Fisc', 137, { c: 'sys' }), D('Rep 3', 18, { c: 'dept' }),
      D('Rep 4', 19, { c: 'dept' }), D('Assegni', 98, { c: 'pay' }), D('Credito', 97, { c: 'pay' }),
      D('Plu 5', 60, { c: 'plu' }), D('Plu 6', 61, { c: 'plu' }), D('Plu 7', 62, { c: 'plu' }), D('Plu 8', 63, { c: 'plu' }),
      D('1', 1, { c: 'num2' }), D('2', 2, { sub: 'ABC', c: 'num2' }), D('3', 3, { sub: 'DEF', c: 'num2' }), D('X', 13, { c: 'sys' }),
      D('Reparto Iva 20%', 17, { w: 2, c: 'dept' }), D('Sub Totale', 99, { w: 2, c: 'pay' }),
      D('Plu 1', 56, { c: 'plu' }), D('Plu 2', 57, { c: 'plu' }), D('Plu 3', 58, { c: 'plu' }), D('Plu 4', 59, { c: 'plu' }),
      D('0', 0, { sub: 'OQZ', c: 'num2' }), D('00', 10, { c: 'num2' }), D(',', 15, { c: 'num2' }), D('CL Clear', 12, { c: 'sys' }),
      D('Reparto Iva 10%', 16, { w: 2, c: 'dept' }), D('Contante', 100, { w: 2, c: 'pay' }),
    ],
  },
};

// Codice tasto di ciascun tasto fisico: quello che ha come funzione predefinita la funzione del tasto
// (con più codici possibili vale il più alto, che è quello della tastiera POS; i più bassi sono tasti PC).
const CODE_OF_FUNC = {};
for (const code of KEY_CODES) {
  const f = KEY_DEFAULTS[code];
  if (f < 997) CODE_OF_FUNC[f] = Math.max(CODE_OF_FUNC[f] ?? -1, code);
}
for (const kb of Object.values(KEYBOARDS)) {
  for (const k of kb.keys) k.code = k.off ? null : CODE_OF_FUNC[k.func] ?? null;
}
/** Etichetta del tasto con quel codice sulla tastiera indicata (per la griglia). */
export function keyLabel(kbId, code) {
  const k = KEYBOARDS[kbId].keys.find((x) => x.code === code);
  return k ? k.label : '';
}
