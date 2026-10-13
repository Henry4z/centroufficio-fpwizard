// Codifica / decodifica dei comandi nativi Epson (directIO) e tabelle di riferimento.
// Fonti: Epson "ePOS Fiscal Print Solution Development Guide" rev. T,
// "EpsonFp2 Active X / OCX Control" (tabella comandi nativi e dimensioni campi),
// "Epson Serie FP Manuale Operatore" rev. Z (SET 14 / SET 15).

// ---------------------------------------------------------------------------
// Utilità di formattazione campi a lunghezza fissa
// ---------------------------------------------------------------------------

const ACCENTS = { 'à': "a'", 'è': "e'", 'é': "e'", 'ì': "i'", 'ò': "o'", 'ù': "u'", 'À': "A'", 'È': "E'", 'É': "E'", 'Ì': "I'", 'Ò': "O'", 'Ù': "U'", '€': 'EUR', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-' };

/** Converte il testo in ASCII stampabile (le stampanti fiscali non gestiscono gli accentati). */
export function toPrinterText(s) {
  return String(s ?? '')
    .replace(/[àèéìòùÀÈÉÌÒÙ€’‘“”–—]/g, (c) => ACCENTS[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

export const num = (v, n) => {
  const i = Math.max(0, Math.round(Number(v) || 0));
  const s = String(i);
  if (s.length > n) throw new Error(`Valore ${v} troppo grande (max ${n} cifre)`);
  return s.padStart(n, '0');
};
export const txt = (s, n) => toPrinterText(s).slice(0, n).padEnd(n, ' ');
/** Importo in euro -> centesimi su n cifre. */
export const money = (eur, n = 9) => num(Math.round((Number(String(eur).replace(',', '.')) || 0) * 100), n);
/** Percentuale (es. 22,5) -> 4 cifre con due decimali impliciti ("2250"). */
export const perc = (p, n = 4) => num(Math.round((Number(String(p).replace(',', '.')) || 0) * 100), n);

export const isDigits = (s) => /^\d+$/.test(s);
export const centsToEur = (s) => (Number(s) / 100);
export const fmtEur = (v) => Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPerc = (v) => Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function centerText(s, width) {
  const t = toPrinterText(s).trim().slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return (' '.repeat(left) + t).padEnd(width, ' ');
}

// ---------------------------------------------------------------------------
// Codici comando nativi (H1 + H2)
// ---------------------------------------------------------------------------

export const CMD = {
  SET_HEADER_LINE: '3016', READ_HEADER_LINE: '3216',
  READ_SERIAL: '3217',
  SET_DEPARTMENT: '4002', READ_DEPARTMENT: '4202',
  SET_VAT: '4005', READ_VAT: '4205',
  SET_CARD: '4007', READ_CARD: '4207',
  SET_TICKET: '4010', READ_TICKET: '4210',
  SET_OPERATOR: '4013', READ_OPERATOR: '4213',
  SET_FLAG: '4014', READ_FLAG: '4214',
  SET_CONF: '4015', READ_CONF: '4215',
  SET_HEADER_FONT: '4016', READ_HEADER_FONT: '4216',
  READ_LAN: '4219',
  ACCESS: '4038',
};

/** Comandi di sola lettura: possono essere inviati senza conferma dalla console. */
export function isReadCommand(cmd) {
  return /^(1074|1138|1070|2050|2051|2052|32\d\d|42\d\d|92\d\d)$/.test(cmd);
}

// ---------------------------------------------------------------------------
// Righe intestazione (SET 16 / comandi 3016-3216 e 4016-4216)
// ---------------------------------------------------------------------------

export const HEADER_LINES = 16;          // righe 1..16
export const HEADER_FONT_LINES = 9;      // il font si programma solo per le righe 1..9
export const HEADER_WIDTH = 40;
export const HEADER_PRINT_SAMPLE = 98;   // 3016 riga 98 = stampa di prova
export const HEADER_CONFIRM = 99;        // 3016 riga 99 = conferma intestazione programmata

export const FONTS = { 1: 'Normale', 2: 'Grassetto', 3: 'Doppia altezza', 4: 'Doppia + grassetto' };

export const encodeHeaderLine = (line, text) => num(line, 2) + txt(text, HEADER_WIDTH);
export const encodeHeaderFont = (line, font) => num(line, 1) + num(font, 1);

export function decodeHeaderLine(line, data) {
  // Risposta attesa: NN + testo (40)
  if (data.length >= 2 && isDigits(data.slice(0, 2)) && Number(data.slice(0, 2)) === line) {
    return { ok: true, text: data.slice(2, 2 + HEADER_WIDTH).replace(/\s+$/, '') };
  }
  return { ok: false, text: data };
}

export function decodeHeaderFont(line, data) {
  if (data.length >= 2 && Number(data[0]) === line && /[1-4]/.test(data[1])) return { ok: true, font: Number(data[1]) };
  return { ok: false, font: null };
}

// ---------------------------------------------------------------------------
// Aliquote IVA (SET 05 / 4005-4205)
// ---------------------------------------------------------------------------

export const VAT_GROUPS = 9;
export const encodeVat = (group, rate) => num(group, 2) + perc(rate);
export function decodeVat(group, data) {
  if (data.length >= 6 && isDigits(data.slice(0, 6)) && Number(data.slice(0, 2)) === group) {
    return { ok: true, rate: Number(data.slice(2, 6)) / 100 };
  }
  return { ok: false, rate: null };
}

/** Gruppi IVA / nature utilizzabili sui reparti. */
export function vatGroupLabel(g, vatTable = {}) {
  g = Number(g);
  if (g === 0) return '0 – Esente';
  if (g >= 1 && g <= 9) return `${g} – IVA ${vatTable[g] != null ? fmtPerc(vatTable[g]) + '%' : '(non letta)'}`;
  if (g >= 10 && g <= 18) return `${g} – Natura`;
  if (g >= 21 && g <= 59) return `${g} – IVA storica`;
  return String(g);
}

// ---------------------------------------------------------------------------
// Reparti (SET 02 / 4002-4202)
// Layout ricostruito dagli argomenti del metodo opProgRepartoEsteso e dalle
// dimensioni dei campi: la risposta 4202 ha lo stesso tracciato del comando 4002.
// ---------------------------------------------------------------------------

export const DEPARTMENTS = 99;
export const DEPT_FIELDS = [
  { k: 'num', n: 2, t: 'int', label: 'Numero' },
  { k: 'desc', n: 20, t: 'text', label: 'Descrizione' },
  { k: 'price1', n: 9, t: 'money', label: 'Prezzo 1' },
  { k: 'price2', n: 9, t: 'money', label: 'Prezzo 2' },
  { k: 'price3', n: 9, t: 'money', label: 'Prezzo 3' },
  { k: 'single', n: 1, t: 'int', label: 'Articolo singolo' },
  { k: 'vat', n: 2, t: 'int', label: 'Gruppo IVA / Natura' },
  { k: 'limit', n: 9, t: 'money', label: 'Limite prezzo' },
  { k: 'printGroup', n: 2, t: 'int', label: 'Gruppo stampa' },
  { k: 'category', n: 2, t: 'int', label: 'Supergruppo merceologico' },
  { k: 'um', n: 2, t: 'text', label: 'Unità di misura (fattura)' },
  { k: 'salesType', n: 1, t: 'int', label: 'Tipologia vendita' },
  { k: 'mode', n: 2, t: 'int', label: 'Attributo vendita' },
  { k: 'ateco', n: 2, t: 'int', label: 'Gruppo ATECO' },
];

/**
 * Decodifica la risposta 4202. Restituisce i campi riconosciuti, il numero di
 * campi validati (`known`) e il dato grezzo per riscrivere invariati i byte
 * non interpretati.
 */
export function decodeDepartment(dept, data) {
  const out = { ok: false, raw: data, known: 0, fields: {} };
  let pos = 0;
  for (const f of DEPT_FIELDS) {
    if (pos + f.n > data.length) break;
    const chunk = data.slice(pos, pos + f.n);
    if (f.t !== 'text' && !isDigits(chunk)) break;
    out.fields[f.k] = f.t === 'money' ? centsToEur(chunk) : f.t === 'int' ? Number(chunk) : chunk.replace(/\s+$/, '');
    pos += f.n;
    out.known++;
  }
  // Validazione minima: numero reparto coerente e almeno fino al gruppo IVA.
  out.ok = out.fields.num === dept && out.known >= 7 && [0, 1].includes(out.fields.single);
  out.knownLength = pos;
  return out;
}

export function encodeDepartment(dept) {
  // dept: { fields, known, raw, knownLength }
  let s = '';
  DEPT_FIELDS.slice(0, dept.known).forEach((f) => {
    const v = dept.fields[f.k];
    if (f.t === 'money') s += money(v, f.n);
    else if (f.t === 'int') s += num(v, f.n);
    else s += txt(v, f.n);
  });
  // eventuali byte successivi non interpretati vengono riscritti invariati
  return s + (dept.raw || '').slice(dept.knownLength ?? s.length);
}

export const SALES_TYPES = { 0: 'Beni', 1: 'Servizi' };
export const DEPT_MODES = { 0: 'Sconti/maggiorazioni consentiti', 1: 'Sconti/maggiorazioni non consentiti' };

// ---------------------------------------------------------------------------
// Operatori (SET 13), carte di credito (SET 07), ticket (SET 10)
// ---------------------------------------------------------------------------

export const OPERATORS = 12, CARDS = 10, TICKETS = 10;

export const encodeOperator = (n, o) => num(n, 2) + txt(o.desc, 20) + num(o.password, 4) + perc(o.commission);
export function decodeOperator(n, data) {
  if (data.length >= 30 && Number(data.slice(0, 2)) === n && isDigits(data.slice(22, 30))) {
    return { ok: true, desc: data.slice(2, 22).replace(/\s+$/, ''), password: Number(data.slice(22, 26)), commission: Number(data.slice(26, 30)) / 100 };
  }
  return { ok: false };
}

export const encodeCard = (n, c) => num(n, 2) + txt(c.desc, 20);
export function decodeCard(n, data) {
  if (data.length >= 22 && Number(data.slice(0, 2)) === n) return { ok: true, desc: data.slice(2, 22).replace(/\s+$/, '') };
  return { ok: false };
}

export const encodeTicket = (n, t) => num(n, 2) + txt(t.desc, 20) + money(t.value);
export function decodeTicket(n, data) {
  if (data.length >= 31 && Number(data.slice(0, 2)) === n && isDigits(data.slice(22, 31))) {
    return { ok: true, desc: data.slice(2, 22).replace(/\s+$/, ''), value: centsToEur(data.slice(22, 31)) };
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Flag SET 14 (4014-4214)
// ---------------------------------------------------------------------------

export const encodeFlag = (n, v) => num(n, 2) + (v ? '1' : '0');
export function decodeFlag(n, data) {
  if (data.length >= 3 && Number(data.slice(0, 2)) === n && /[01]/.test(data[2])) return { ok: true, value: Number(data[2]) };
  if (data.length === 1 && /[01]/.test(data)) return { ok: true, value: Number(data) };
  return { ok: false, value: null };
}

/** [titolo, testo valore 0, testo valore 1, avviso] */
export const FLAGS = {
  1: ['Apprendimento (solo modalità non RT)', 'NO APPRENDIMENTO', 'SI APPRENDIMENTO', 'Richiede chiusura giornaliera; rende i documenti non fiscali.'],
  2: ['Tastiera per righe cliente fattura', 'TAST. PC per CL/FAT', 'TAST. POS per CL/FAT'],
  3: ['Stampa aperture cassetto', 'NO STAMPA AP. CASS.', 'SI STAMPA AP. CASS.'],
  4: ['Presenza operatori', 'NO OPERATORI', 'SI OPERATORI'],
  5: ['Operatori con codice segreto', 'NO OPERATORI SEGRETI', 'SI OPERATORI SEGRETI'],
  6: ['Reset operatore', 'NO RESET OPERATORE', 'SI RESET OPERATORE'],
  7: ['Stampa operatore', 'NO STAMPA OPERATORE', 'SI STAMPA OPERATORE'],
  8: ['Stampa numero pezzi', 'NO STAMPA N.PEZZI', 'SI STAMPA N.PEZZI'],
  9: ['Codice prodotto lungo / corto', 'COD. PRODOTTO CORTO', 'COD. PRODOTTO LUNGO'],
  10: ['P.C. in linea (client/server)', 'NO P.C. IN LINEA', 'SI P.C. IN LINEA', 'Modifica il comportamento della comunicazione con il PC.'],
  11: ['Segnalazione quasi fine carta', 'TX FINE CARTA AUTOM.', 'TX FINE CARTA RICH.'],
  12: ['Visualizzazione quasi fine carta', 'NO VIS. FINE CARTA', 'SI VIS. FINE CARTA'],
  13: ['Richiesta obbligatoria subtotale', 'NO OBBLIGO SUBTOTALE', 'SI OBBLIGO SUBTOTALE'],
  14: ['NTP sincronizzazione orologio', 'NO NTP NON USATO', 'SI NTP ABILITATO'],
  15: ['Barcode con cifra iniziale 2', 'BC2 a codif. TIPO 1', 'BC2 a codif. TIPO 2'],
  16: ['Barcode bilancia check digit centrale', 'BC2 con CKS INTERM', 'BC2 senza CKS INTERM'],
  17: ['Barcode con importo: peso / quantità', 'BC2 con dati di PESO', 'BC2 con dati di Q.TA'],
  18: ['Funzione shift prezzo', 'NO TASTO SHIFT', 'SI TASTO SHIFT'],
  19: ['Funzione storno', 'NO TASTO STORNO', 'SI TASTO STORNO'],
  20: ['Funzione reso', 'NO TASTO RESO', 'SI TASTO RESO'],
  21: ['Funzione annullo', 'NO TASTO ANNULLO', 'SI TASTO ANNULLO'],
  22: ['Funzione sconto %', 'NO TASTO SCONTO', 'SI TASTO SCONTO'],
  23: ['Funzione abbuono / sconto a importo', 'NO TASTO ABBUONO', 'SI TASTO ABBUONO'],
  24: ['Stampa cambio valuta', 'NO STAMPA VALUTA', 'SI STAMPA VALUTA'],
  25: ['Stampa totale in lire (obsoleto)', 'NO TOT. IN LIRE', 'SI TOT. IN LIRE'],
  26: ['Apertura automatica cassetto', 'NO AP. AUT. CASSETTO', 'SI AP. AUT. CASSETTO'],
  27: ['Gestione ACK protocollo nativo', 'NO ACK. TX/RX P.C.', 'SI ACK. TX/RX P.C.', 'Modifica il protocollo di comunicazione con il PC.'],
  28: ['Stampa codice prodotto', 'NO STAMPA COD. PROD.', 'SI STAMPA COD. PROD.'],
  29: ['Modalità JavaPOS-UPOS', 'NO JAVAPOS-UPOS', 'SI JAVAPOS-UPOS', 'Cambia il comportamento dei documenti inviati da PC.'],
  30: ['Differenza ticket (obsoleto)', 'NO DIFFERENZA TICKET', 'SI DIFFERENZA TICKET'],
  31: ['Cambio numero fattura', 'NO CAMBIO NUM. FATT.', 'SI CAMBIO NUM. FATT.'],
  32: ['Caratteri minuscoli (uso futuro)', 'NO CAR. MINUSCOLI', 'SI CAR. MINUSCOLI'],
  33: ['Non utilizzato', 'NO', 'SI'],
  34: ['Gestione automatica ora legale', 'NO ORA LEGALE', 'SI ORA LEGALE'],
  35: ['Protocollo XON-XOFF', 'NO XON-XOFF', 'SI XON-XOFF', 'ATTENZIONE: cambia il protocollo di comunicazione con il PC; i gestionali che usano il protocollo nativo Epson smettono di funzionare.'],
  36: ['Importi e quantità decimali', 'IMPOSTAZ. STANDARD', 'IMPOSTAZ. INT+DEC'],
  37: ['Gestione operatori', 'OPERATORI STANDARD', 'OPERATORI ONLINE'],
  38: ['Reset righe promozionali', 'NO RESET RIGHE PROMO', 'SI RESET RIGHE PROMO'],
  39: ['Barcode PLU bilancia con importo', 'BC2 codice a 4 CIFRE', 'BC2 codice a 5 CIFRE'],
  40: ['Visualizzazione numero pezzi', 'NO VISUAL. N.PEZZI', 'SI VISUAL. N.PEZZI'],
  41: ['Visualizzazione numero ripetizioni', 'NO VISUAL. N.RIPET.', 'SI VISUAL. N.RIPET.'],
  42: ['Footer XON-XOFF', 'NO TX FOOTER (XON)', 'SI TX FOOTER (XON)'],
  43: ['Buzzer tastiera', 'NO BUZZER TASTIERA', 'SI BUZZER TASTIERA'],
  44: ['Stampa prezzo unitario su fattura', 'NO ST PRZ UNT. FATT/RF', 'SI ST PRZ UNT. FATT/RF'],
  45: ['Intestazione documenti gestionali', 'NO INTEST. NON FISC.', 'SI INTEST. NON FISC.'],
  46: ['Decrementa n. pezzi con resi (obsoleto)', 'NO DECR N.PEZZI/RESO', 'SI DECR N.PEZZI/RESO'],
  47: ['Non utilizzato', 'NO', 'SI'],
  48: ['Passaggio XON-XOFF -> protocollo Epson', 'NO SINCR XON->EPSON', 'SI SINCR XON->EPSON', 'Modifica il protocollo di comunicazione.'],
  49: ['Ritardo apertura cassetto', 'NO DELAY AP.CASSETTO', 'SI DELAY AP.CASSETTO'],
  50: ['Subtotale / apertura cassetto', 'NO SUBTOT / CASSETTO', 'SI SUBTOT / CASSETTO'],
  51: ['Larghezza colonne documenti gestionali', 'NO 46 COLONNE', 'SI 40 COLONNE'],
  52: ['Segnalazione stato quasi fine carta', 'NO ABIL. FINE CARTA', 'SI ABIL. FINE CARTA'],
  53: ['Stampa finanziario insieme alla chiusura', 'NO FINANZ.+CHIUSURA', 'SI FINANZ.+CHIUSURA'],
  54: ['Pulsante On/Off frontale', 'NO BOOT on SWITCH-ON', 'SI BOOT on SWITCH-ON'],
  55: ['PLU con prezzo unitario zero', 'NO PLU con PREZZO=0', 'SI PLU con PREZZO=0'],
  56: ['Riferimento Z report in MPD (DGFE)', 'NO ZREP rif. in DGFE', 'SI ZREP rif. in DGFE'],
  57: ['RT – Stampa dettaglio pagamenti', 'NO RT PAGAMENTI', 'SI RT PAGAMENTI'],
  58: ['RT – Modalità documenti di reso', 'NO RT RESO MERCE=NdC', 'SI RT RESO MERCE=NdC'],
  59: ['RT – Modalità documenti di annullo', 'NO RT ANNULLAM.=NdC', 'SI RT ANNULLAM.=NdC'],
  60: ['RT – Descrizione lunga (overlap)', 'NO RT DESCR. OVERLAP', 'SI RT DESCR. OVERLAP'],
  61: ['Letture memoria fiscale: stampa o file', 'LETTURA M.F.-> PRINT', 'LETTURA M.F.-> FILE'],
  62: ['Modalità simulazione', 'NO SIMULAZIONE', 'SI SIMULAZIONE', 'Modalità di prova RT: richiede chiusura giornaliera.'],
  63: ['Modalità Demo RT', "NO Modalita' DEMO", "SI Modalita' DEMO", 'Modalità dimostrativa: richiede chiusura giornaliera.'],
  64: ['Stampa esito trasmissione corrispettivi', 'NO STAMPA RICEV. TX', 'SI STAMPA RICEV. TX'],
  65: ['Stampa parametri rete in DHCP', 'NO STAMPA CONF. DHCP', 'SI STAMPA CONF. DHCP'],
  66: ['Destinazione corrispettivi', 'URL AGENZIA ENTRATE', 'URL STS – FARMACIE', 'Cambia il server di destinazione dei corrispettivi.'],
  67: ['Checksum codice lotteria', 'NO LOTTERIA CKS', 'SI LOTTERIA CKS'],
  68: ['Documento di annullo automatico', 'NO ANNULLO SEMI MAN.', 'SI ANNULLO SEMI MAN.'],
};
export const FLAG_COUNT = 68;
/** Flag esclusi di default dai ripristini da file perché possono interrompere la comunicazione o cambiare modalità fiscale. */
export const DANGEROUS_FLAGS = [1, 10, 27, 29, 35, 48, 62, 63, 66];

// ---------------------------------------------------------------------------
// Parametri SET 15 (4015-4215)
// ---------------------------------------------------------------------------

export const encodeConf = (n, v) => num(n, 2) + num(v, 3);
export function decodeConf(n, data) {
  if (data.length >= 5 && Number(data.slice(0, 2)) === n && isDigits(data.slice(2, 5))) return { ok: true, value: Number(data.slice(2, 5)) };
  if (data.length === 3 && isDigits(data)) return { ok: true, value: Number(data) };
  return { ok: false, value: null };
}

/** { titolo, min, max, unità, opzioni, avviso } */
export const CONF = {
  1: { t: 'Valore imputazione', min: 1, max: 99, u: 'centesimi' },
  2: { t: 'Arrotondamento importo (quantità)', min: 1, max: 999, u: 'centesimi' },
  3: { t: 'Arrotondamento % sconto / maggiorazione', min: 1, max: 999, u: 'centesimi' },
  4: { t: 'Arrotondamento valuta', min: 1, max: 999, u: 'centesimi' },
  5: { t: 'Numero ritrasmissioni (protocollo PC)', min: 1, max: 99 },
  6: { t: 'Tempo fra le ritrasmissioni', min: 1, max: 99, u: 'secondi' },
  7: { t: 'Intensità stampa (non più utilizzato)', min: 0, max: 999 },
  8: { t: 'Intensità visore', min: 0, max: 15 },
  9: { t: 'Indice header grafico (logo in testa)', min: 0, max: 9, u: '0 = disattivo' },
  10: { t: 'Indice footer grafico (logo in coda)', min: 0, max: 9, u: '0 = disattivo' },
  11: { t: 'Numero cassa', min: 0, max: 999, u: '0 = non stampato' },
  12: { t: 'Larghezza carta', opts: { 0: '80 mm', 2: '58 mm' }, warn: 'Su alcuni modelli la larghezza non è modificabile.' },
  13: { t: 'Timeout spegnimento visore', min: 0, max: 999, u: 'secondi, 0 = sempre acceso' },
  14: { t: 'Paga prima', opts: { 0: 'Disattivato', 1: 'Gestionale per ogni vendita', 2: 'Gestionale per vendite con prezzo ≠ 0' } },
  15: { t: 'Numero visori (obsoleto, lasciare 1)', min: 1, max: 2 },
  16: { t: 'Codice carattere Euro per visore', min: 33, max: 255, u: 'default 156' },
  17: { t: 'Righe intestazione su fatture', min: 0, max: 16 },
  18: { t: 'Risparmio carta', opts: { 0: 'Disattivato', 1: 'Interlinea -25%', 2: 'Interlinea -50%' } },
  19: { t: 'Header grafico fatture', min: 0, max: 9, u: '0 = disattivo' },
  20: { t: 'Footer grafico fatture', min: 0, max: 9, u: '0 = disattivo' },
  21: { t: 'Tempo attivazione cassetto', min: 0, max: 255, u: 'unità da 2 ms, default 15' },
  22: { t: 'Posizione loghi header/footer', opts: { 0: 'Sinistra', 1: 'Centrata', 2: 'Destra' } },
  23: { t: 'RT – Tempo fra retry trasmissione', min: 0, max: 999, u: 'minuti, 0 = alla chiusura successiva' },
  24: { t: 'RT – Timeout risposta server AdE', min: 10, max: 99, u: 'secondi' },
  25: { t: 'RT – Soglia giorni file in attesa', min: 0, max: 99, u: 'giorni (consigliato ≤ 11)' },
  26: { t: 'Riga intestazione con ragione sociale (lotteria)', min: 1, max: 16 },
  27: { t: 'Arrotondamento pagamenti in contante (DL 50/2017)', opts: { 0: 'Disattivato', 1: 'Standard', 2: 'Solo per difetto', 3: 'Solo per eccesso' } },
  28: { t: 'E-Receipt – Timeout connessione', min: 1, max: 99, u: 'secondi (FW ≥ 8)' },
  29: { t: 'E-Receipt – Timeout trasmissione', min: 1, max: 99, u: 'secondi (FW ≥ 8)' },
};
export const CONF_COUNT = 29;

// ---------------------------------------------------------------------------
// Verificazione periodica
// 4228 lettura / 4028 programmazione data inizio avvisi VP (GGMMAA, il giorno è sempre 01)
// 4020 test di rete (1 = gateway, 2 = DNS, 3 = server Agenzia Entrate)
// 3012 stampa memoria fiscale (MPR) per numeri Z: operatore (2) + Z iniziale (4) + Z finale (4)
// ---------------------------------------------------------------------------

export const CMD_VP = { READ_DATE: '4228', SET_DATE: '4028', NET_TEST: '4020', MPR_BY_Z: '3012', LOGIN: '4038' };

export function decodeVpDate(data) {
  const m = String(data || '').match(/^(\d{2})(\d{2})(\d{2})/);
  if (!m) return { ok: false };
  if (m[0] === '000000') return { ok: true, date: null };
  const d = new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getFullYear() < 2001) return { ok: true, date: null }; // 30/11/1999 = data non impostata
  return { ok: true, date: d };
}
export const encodeVpDate = (d) => '01' + num(d.getMonth() + 1, 2) + num(d.getFullYear() % 100, 2);
export const encodeMprByZ = (from, to) => '01' + num(from, 4) + num(to, 4);

// ---------------------------------------------------------------------------
// Interventi tecnici (Agenzia delle Entrate, Tabella 9 "Codici interventi RT")
// ---------------------------------------------------------------------------

export const INTERVENTION_CODES = {
  '03': 'Verificazione periodica con esito positivo',
  '04': 'Verificazione periodica con esito negativo',
  '05': 'Verificazione periodica con ritiro dell\'apparecchio',
};
export const PRE_INTERVENTION_CODES = {
  '01': 'Manutenzione (ordinaria o straordinaria)',
  '02': 'Sostituzione del DGFE per guasto o esaurimento',
  '06': 'Altro (nota obbligatoria)',
};

/**
 * Registrazione dell'intervento sul RT (metodo EpsonFp2 setRTServiceEvent).
 * Il codice del comando nativo e il tracciato sono riservati da Epson (NDA) e non sono
 * pubblicati: finché non vengono impostati qui l'app prepara i dati ma non li invia.
 * encode(ev) riceve { code, cfTecnico, pivaLab, pivaEsercente, date: Date, note } e restituisce il campo dati.
 */
export const SERVICE_EVENT = { command: null, encode: null };

const CF_ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };

/** Partita IVA italiana (11 cifre con carattere di controllo). */
export function isValidPIva(p) {
  if (!/^\d{11}$/.test(p)) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(p[i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    s += d;
  }
  return (10 - (s % 10)) % 10 === Number(p[10]);
}

/** Codice fiscale di persona fisica (16 caratteri con controllo) oppure numerico a 11 cifre. */
export function isValidCF(cf) {
  const s = String(cf || '').toUpperCase();
  if (/^\d{11}$/.test(s)) return isValidPIva(s);
  if (!/^[A-Z0-9]{16}$/.test(s)) return false;
  let t = 0;
  for (let i = 0; i < 15; i++) t += i % 2 === 0 ? CF_ODD[s[i]] : (/\d/.test(s[i]) ? Number(s[i]) : s.charCodeAt(i) - 65);
  return String.fromCharCode(65 + (t % 26)) === s[15];
}

/** Cerca la partita IVA dell'esercente nelle righe dell'intestazione. */
export function findPIva(lines) {
  for (const l of lines || []) {
    const m = String(l || '').replace(/\s/g, '').match(/(\d{11})/);
    if (m && isValidPIva(m[1])) return m[1];
  }
  return '';
}

/** Matricola RT a 11 caratteri: produttore + tipo dispositivo + modello + numero (es. 99IEB123456). */
export function rtSerial(serial, rtType) {
  if (!serial?.ok || !rtType) return null;
  const s = `${serial.oem}${rtType}${serial.model}${serial.number}`;
  return s.length === 11 ? s : null;
}

// ---------------------------------------------------------------------------
// Accesso (login) – 4038 indice 02 + password su 100 caratteri
// ---------------------------------------------------------------------------

export const encodeLogin = (password) => '02' + txt(password, 100);

// ---------------------------------------------------------------------------
// Stato stampante
// ---------------------------------------------------------------------------

const ST_PRINTER = { 0: 'OK', 2: 'Carta in esaurimento', 3: 'Offline (fine carta o coperchio aperto)' };
const ST_EJ = { 0: 'OK', 1: 'In esaurimento', 2: 'Da formattare', 3: 'Precedente', 4: 'Di altro MF / RT', 5: 'Esaurito' };
const ST_DRAWER = { 0: 'Aperto', 1: 'Chiuso / scollegato' };
const ST_DOC = { 0: 'Documento commerciale aperto', 1: 'Nessun documento aperto', 2: 'Documento gestionale aperto', 3: 'Pagamento in corso', 4: 'Errore ESC/POS documento commerciale', 5: 'Documento con subtotale negativo', 6: 'Errore ESC/POS documento gestionale', 7: 'In attesa comando di chiusura (JavaPOS)', 8: 'Fattura aperta', 9: 'Nota di credito aperta da PC', A: 'Titolo di accesso aperto', B: 'Titolo di accesso chiuso' };
const ST_MODE = { 0: 'Stato registrazione', 1: 'Stato X', 2: 'Stato Z', 3: 'Stato SET', 4: 'Modalità biglietteria', 5: 'Nota di credito aperta da tastiera' };

/** Decodifica del codice di stato a 5 cifre (printerStatus / fpStatus). */
export function decodeFpStatus(s) {
  s = String(s || '').trim();
  if (s.length < 5) return [];
  const [p, ej, dr, doc, mode] = s.split('');
  return [
    ['Stampante', ST_PRINTER[p] ?? `Codice ${p}`, p === '0' ? 'ok' : 'warn'],
    ['Giornale elettronico (MPD/DGFE)', ST_EJ[ej] ?? `Codice ${ej}`, ej === '0' ? 'ok' : 'warn'],
    ['Cassetto', ST_DRAWER[dr] ?? `Codice ${dr}`, 'info'],
    ['Documento', ST_DOC[doc] ?? `Codice ${doc}`, doc === '1' ? 'ok' : 'info'],
    ['Stato operativo', ST_MODE[mode] ?? `Codice ${mode}`, 'info'],
  ];
}

export const RT_TYPES = { I: 'Interno (negozio / locale fisso)', E: 'Esterno (ambulante / stagionale)', P: 'Palmare', M: 'Misuratore fiscale convertito in RT', S: 'Server RT' };
export const RT_MAIN = { '01': 'Pre-servizio', '02': 'In servizio' };
export const MODELS = { EX: 'FP-81 II RT (modificato)', EY: 'FP-90 III RT (modificato)', EA: 'Server RT', EB: 'FP-81 II RT (nativo)', EC: 'FP-90 III RT (nativo)' };

/** Cerca la matricola nella risposta 3217 (es. "123456EB99"). */
export function decodeSerial(data) {
  const m = String(data).match(/(\d{6})(E[A-Z])(99)/);
  if (!m) return { ok: false, raw: data };
  return { ok: true, number: m[1], model: m[2], oem: m[3], modelName: MODELS[m[2]] || m[2], extended: m[0] };
}

// ---------------------------------------------------------------------------
// Errori del protocollo nativo (attributo status quando code = PRINTER ERROR)
// ---------------------------------------------------------------------------

export const PRINTER_ERRORS = {
  3: 'Stampante offline (senza carta o coperchio aperto)',
  7: 'Slip guasta', 8: 'Tasto errato', 9: 'Data inferiore all\'ultima registrata', 10: 'Data errata',
  11: 'Sequenza errata', 12: 'Dati inesistenti', 13: 'Valore errato', 14: 'Programmazione matricola fiscale',
  15: 'Dati già esistenti', 16: 'Non previsto (comando o formato non supportato)',
  17: 'Impossibile ora – serve una chiusura giornaliera o la stampante non è nello stato corretto',
  18: 'Non possibile', 19: 'Scritta invalida', 20: 'Supera valore', 21: 'Supera limite', 22: 'Non programmato',
  23: 'Chiudere il documento (fare il pagamento)', 24: 'Chiudere il pagamento', 25: 'Manca l\'operatore',
  26: 'Cassa inferiore', 27: 'Oltre limite prezzo reparto', 28: 'Problema di connessione al server',
  29: 'Manca modulo (slip)', 30: 'Checksum errato (partita IVA o codice fiscale)', 31: 'Dati inesistenti PC',
  34: 'Manca attivazione', 35: 'Errore connessione slip', 37: 'Rimuovere modulo dalla slip',
  38: 'Errore EFT-POS o timeout', 39: 'Documento già annullato', 40: 'Documento già reso',
  41: 'Il documento di riferimento non può essere un annullo', 42: 'Il documento di riferimento non può essere un reso',
};

export const RESPONSE_CODES = {
  NO_DATA: 'Richiesta vuota', NO_RAM: 'Memoria della stampante esaurita', PARSER_ERROR: 'XML non valido',
  LAN_ERROR: 'Il servizio fpmate.cgi non comunica con il firmware fiscale', LAN_TIME_OUT: 'Timeout tra fpmate.cgi e firmware fiscale',
  FP_NO_ANSWER: 'Il firmware fiscale non ha risposto: la stampante potrebbe essere occupata da un altro programma collegato alla porta 9100 (gestionale, EpsonFpWizard), essere in un menu da tastiera (SET, X, Z), senza carta o con il coperchio aperto', EPTR_REC_EMPTY: 'Carta assente, coperchio aperto o stampante offline',
  'PRINTER ERROR': 'Errore della stampante fiscale', EFT_POS_ERROR: 'Errore pagamento elettronico',
  FP_NO_ANSWER_NETWORK: 'Nessuna risposta in rete', 'non valid XML command': 'Comando XML non valido per questo tipo di richiesta',
};
