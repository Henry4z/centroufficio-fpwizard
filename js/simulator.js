// Stampante simulata: risponde come fpmate.cgi per provare l'app senza hardware.
// I dati vivono solo in memoria e si azzerano ricaricando la pagina.

import { keyDefault } from './keyboards.js';

const pad = (v, n, c = '0') => String(v).padStart(n, c).slice(-n);
const txt = (s, n) => String(s).padEnd(n, ' ').slice(0, n);

const S = {
  header: ['', '      NEGOZIO DI PROVA SRL', '       VIA ROMA 1 - MILANO', '      P.IVA 01234567890', '', '', '', '', '', '', '', '', '', '', '', '', ''].map((t, i) => (i === 0 ? '' : t)),
  fonts: [0, 4, 2, 2, 2, 2, 2, 2, 2, 2],
  vat: [0, 22, 10, 4, 5, 0, 0, 0, 0, 0],
  depts: {},
  flags: {},
  conf: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 3, 6: 2, 7: 0, 8: 10, 9: 0, 10: 0, 11: 1, 12: 0, 13: 0, 14: 0, 15: 1, 16: 156, 17: 5, 18: 0, 19: 0, 20: 0, 21: 15, 22: 1, 23: 60, 24: 30, 25: 11, 26: 1, 27: 0, 28: 10, 29: 10 },
  operators: {}, cards: {}, tickets: {},
  dayOpen: false, z: 127, docs: 0, drawer: 1, paper: 0, offsetMs: 0,
  logos: {},
  vpDate: '010525',
  loggedIn: false,
  inv: '000199001' + ' '.repeat(24) + '0',
  trail: { 1: '', 2: '' },
  cashDesc: { 1: 'CONTANTE 1', 2: 'CONTANTE 2', 3: 'CONTANTE 3', 4: 'CONTANTE 4', 5: 'CONTANTE 5' },
  cashPre: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  autoz: '010000',
  plu: {},
  ej: '0',
  keys: {},
  lotMsg: { 1: '0', 2: '0', 3: '0', 4: '0', 5: '0' },
  // nature: 0 e 10-14 fisse, 15-18 programmabili [simbolo, descrizione, codice AdE]
  nat: { 0: ['ES', 'Esente', 'N4'], 10: ['EE', 'Esclusa', 'N1'], 11: ['NS', 'Non soggetta', 'N2'], 12: ['NI', 'Non imponibile', 'N3'], 13: ['RM', 'Regime del margine', 'N5'], 14: ['AL', 'Altro non IVA', 'N6'], 15: null, 16: null, 17: null, 18: null },
  ateco: { 1: '0'.repeat(19), 2: '0'.repeat(19), 3: '0'.repeat(19) },
  defVat: '0'.repeat(43),
  histVat: { 1: '0000200000', 2: '0000200000', 3: '0000200000', 4: '0000200000' },
  eft: '012000000000192.168.000.10091000600000',
  email: { 1: 'smtp', 2: '', 3: '25', 4: '', 5: '', 6: '00', 7: 'epsonfp90@epson.it', 8: '', 9: '', 10: '1', 11: 'epson-printer', 21: '', 22: '', 23: '', 24: '', 25: '', 26: '' },
  intel: {
    '0101': '', '0102': '', '0103': '0', '0104': '0', '0105': '*', '0201': '0', '0202': '0', '0203': 'serverDirectPrint.php', '0301': '0', '0401': '0', '0501': '000',
    '0601': '0', '0701': '0', '0801': '0', '0802': 'E015_client.sh', '0901': '0', '1001': 'remote_request_job', '1002': '000', '1003': '000', '1004': '0',
  },
  accessPwd: '12345', accessTimeout: '30', accessMail: '',
  instant: '030926',
  cats: {},
  pluKeys: {},
};
for (let i = 1; i <= 10; i++) S.cats[i] = `MERCEOLOGICO ${String(i).padStart(2, ' ')}`;
for (let i = 1; i <= 70; i++) S.pluKeys[i] = i;
for (let i = 1; i <= 99; i++) {
  const vat = i === 1 ? 1 : i === 2 ? 2 : i === 3 ? 3 : i === 4 ? 4 : 1;
  S.depts[i] = { desc: i <= 4 ? ['REPARTO 22%', 'REPARTO 10%', 'REPARTO 4%', 'REPARTO 5%'][i - 1] : `PRODOTTO ${i}`, p1: 0, p2: 0, p3: 0, single: 0, vat, limit: 0, pg: 0, cat: 0, um: '  ', st: i === 5 ? 1 : 0, mode: 0, ateco: 0 };
}
for (let i = 1; i <= 68; i++) S.flags[i] = [19, 20, 21, 22, 23, 57, 43].includes(i) ? 1 : 0;
for (let i = 1; i <= 12; i++) S.operators[i] = { desc: `OPERATORE ${i}`, pwd: 0, perc: 0 };
for (let i = 1; i <= 10; i++) S.cards[i] = { desc: ['BANCOMAT', 'VISA', 'MASTERCARD', 'AMEX'][i - 1] || `CARTA ${i}` };
for (let i = 1; i <= 10; i++) S.tickets[i] = { desc: `TICKET ${i}`, value: 0 };

const deptData = (n) => {
  const d = S.depts[n];
  return pad(n, 2) + txt(d.desc, 20) + pad(d.p1, 9) + pad(d.p2, 9) + pad(d.p3, 9) + d.single + pad(d.vat, 2) + pad(d.limit, 9) + pad(d.pg, 2) + pad(d.cat, 2) + txt(d.um, 2) + d.st + pad(d.mode, 2) + pad(d.ateco, 2);
};

const status = () => `${S.paper}${S.ej}${S.drawer}10`;

function reply(success, { code = '', st = success ? '2' : '0', info = null } = {}) {
  let add = '';
  if (info) {
    const keys = Object.keys(info);
    add = `<addInfo><elementList>${keys.join(',')}</elementList>${keys.map((k) => `<${k}>${info[k]}</${k}>`).join('')}</addInfo>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><response success="${success}" code="${code}" status="${st}">${add}</response></soapenv:Body></soapenv:Envelope>`;
}
const err = (n) => reply(false, { code: 'PRINTER ERROR', st: String(n), info: { lastCommand: '0', printerStatus: status() } });
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function dio(cmd, data) {
  const n2 = () => Number(data.slice(0, 2));
  const ok = (resp = '') => reply(true, { info: { lastCommand: '0', printerStatus: status(), responseCommand: cmd, responseData: xmlEsc(resp) } });
  const needClosed = () => S.dayOpen;
  switch (cmd) {
    case '3216': { const n = n2(); if (n < 1 || n > 16) return err(16); return ok(pad(n, 2) + txt(S.header[n], 40)); }
    case '3016': {
      const n = n2();
      if (n === 98 || n === 99) return ok();
      if (n < 1 || n > 16 || data.length < 42) return err(16);
      if (needClosed()) return err(17);
      S.header[n] = data.slice(2, 42).replace(/\s+$/, ''); return ok();
    }
    case '4216': { const n = Number(data[0]); if (!(n >= 1 && n <= 9)) return err(16); return ok(`${n}${S.fonts[n]}`); }
    case '4016': { const n = Number(data[0]); const f = Number(data[1]); if (!(n >= 1 && n <= 9) || !(f >= 1 && f <= 4)) return err(13); S.fonts[n] = f; return ok(); }
    case '4205': { const n = n2(); if (!(n >= 1 && n <= 9)) return err(16); return ok(pad(n, 2) + pad(Math.round(S.vat[n] * 100), 4)); }
    case '4005': {
      const n = n2(); const v = Number(data.slice(2, 6)) / 100;
      if (!(n >= 1 && n <= 9) || data.length !== 6) return err(16);
      if (needClosed()) return err(17);
      if (v !== 0 && S.vat.some((x, i) => i !== n && x === v)) return err(15);
      S.vat[n] = v; return ok();
    }
    case '4202': { const n = n2(); if (!(n >= 1 && n <= 99)) return err(16); return ok(deptData(n)); }
    case '4002': {
      const n = n2(); if (!(n >= 1 && n <= 99) || data.length !== 72) return err(16);
      if (needClosed()) return err(17);
      const d = S.depts[n];
      d.desc = data.slice(2, 22).trimEnd(); d.p1 = +data.slice(22, 31); d.p2 = +data.slice(31, 40); d.p3 = +data.slice(40, 49);
      d.single = +data[49]; d.vat = +data.slice(50, 52); d.limit = +data.slice(52, 61); d.pg = +data.slice(61, 63); d.cat = +data.slice(63, 65);
      d.um = data.slice(65, 67); d.st = +data[67]; d.mode = +data.slice(68, 70); d.ateco = +data.slice(70, 72);
      return ok();
    }
    case '4214': { const n = n2(); if (!(n >= 1 && n <= 68)) return err(16); return ok(pad(n, 2) + S.flags[n]); }
    case '4014': { const n = n2(); if (!(n >= 1 && n <= 68) || !/[01]/.test(data[2])) return err(16); S.flags[n] = +data[2]; return ok(); }
    case '4215': { const n = n2(); if (!(n >= 1 && n <= 29)) return err(16); return ok(pad(n, 2) + pad(S.conf[n], 3)); }
    case '4015': { const n = n2(); if (!(n >= 1 && n <= 29)) return err(16); S.conf[n] = +data.slice(2, 5); return ok(); }
    case '4213': { const n = n2(); if (!(n >= 1 && n <= 12)) return err(16); const o = S.operators[n]; return ok(pad(n, 2) + txt(o.desc, 20) + pad(o.pwd, 4) + pad(o.perc, 4)); }
    case '4013': { const n = n2(); if (!(n >= 1 && n <= 12) || data.length !== 30) return err(16); S.operators[n] = { desc: data.slice(2, 22).trimEnd(), pwd: +data.slice(22, 26), perc: +data.slice(26, 30) }; return ok(); }
    case '4207': { const n = n2(); if (!(n >= 1 && n <= 10)) return err(16); return ok(pad(n, 2) + txt(S.cards[n].desc, 20)); }
    case '4007': { const n = n2(); if (!(n >= 1 && n <= 10) || data.length !== 22) return err(16); S.cards[n] = { desc: data.slice(2).trimEnd() }; return ok(); }
    case '4210': { const n = n2(); if (!(n >= 1 && n <= 10)) return err(16); const t = S.tickets[n]; return ok(pad(n, 2) + txt(t.desc, 20) + pad(t.value, 9)); }
    case '4010': { const n = n2(); if (!(n >= 1 && n <= 10) || data.length !== 31) return err(16); S.tickets[n] = { desc: data.slice(2, 22).trimEnd(), value: +data.slice(22, 31) }; return ok(); }
    case '3217': return ok('01' + '123456EB99');
    case '4020': return /^(01)?[123]$/.test(data) ? ok(data.slice(-1) + '0') : err(16);
    case '4228': return ok(S.vpDate);
    case '4028': if (!/^\d{6}$/.test(data)) return err(16); S.vpDate = `01${data.slice(2)}`; return ok();
    case '3012': return /^\d{10}$/.test(data) ? ok('01') : err(16);
    case '3013': case '3014': return /^\d{14}$/.test(data) ? ok('01') : err(16);
    case '2050': case '2051': {
      if (!/^\d{4}$/.test(data)) return err(16);
      const idx = Number(data.slice(0, 2)); const sub = Number(data.slice(2));
      if (cmd === '2051' && [32, 38, 39].includes(idx)) return ok('00000001943750' + '00000000000591'.slice(0) + pad(S.z, 4));
      if (cmd === '2051' && (idx === 27 || idx === 28)) return err(16);
      const sample = { 1: sub === 1 ? [6000, 960] : [0, 0], 20: sub === 2 ? [873, 87] : [0, 0], 18: sub === 1 ? [4, 714] : [0, 0], 24: [0, 13], 13: [9, 2346], 27: [0, S.z] }[idx] || [0, 0];
      const f = (v) => (v < 0 ? '-' : '+') + pad(Math.abs(v), 9);
      return ok(data + f(sample[0]) + f(sample[1]));
    }
    case '2052': return ok('00000001943750' + pad(S.z, 4));
    // altre impostazioni (tracciati come sulla stampante reale)
    case '4225': return ok(S.inv);
    case '4025': if (data.length !== 34) return err(16); S.inv = data; return ok();
    case '4227': return /^[12]$/.test(data) ? ok(data + S.trail[data].padEnd(35, ' ')) : err(16);
    case '4027': if (!/^[12]/.test(data) || data.length !== 36) return err(16); S.trail[data[0]] = data.slice(1).trimEnd(); return ok();
    case '4253': { const n = n2(); return n >= 1 && n <= 5 ? ok(pad(n, 2) + txt(S.cashDesc[n], 20)) : err(16); }
    case '4053': { const n = n2(); if (!(n >= 1 && n <= 5) || data.length !== 22) return err(16); S.cashDesc[n] = data.slice(2).trimEnd(); return ok(); }
    case '4209': return /^[1-7]$/.test(data) ? ok(data + pad(S.cashPre[data], 9)) : err(16);
    case '4009': if (!/^[1-7]\d{9}$/.test(data)) return err(16); S.cashPre[data[0]] = Number(data.slice(1)); return ok();
    case '9213': return ok(S.autoz + '0000000000000000');
    case '9013': if (!/^[0-2][01]\d{4}$/.test(data)) return err(16); S.autoz = data; return ok();
    case '9219': { const n = n2(); return n >= 1 && n <= 5 ? ok(pad(n, 2) + S.lotMsg[n].padEnd(47, ' ')) : err(16); }
    case '9019': { const n = n2(); if (!(n >= 1 && n <= 5) || data.length !== 49) return err(16); S.lotMsg[n] = data.slice(2).trimEnd(); return ok(); }
    case '4240': return ok(S.instant);
    case '4040': if (!/^\d{6}$/.test(data)) return err(16); S.instant = data; return ok();
    case '4203': { const n = Number(data); if (!/^\d{4}$/.test(data) || n < 1 || n > 1000) return err(16); const x = S.plu[n] || { desc: `P.L.U. ${String(n).padStart(4, ' ')}`, p1: 0, p2: 0, p3: 0, dept: 0, bc: '' }; return ok(pad(n, 4) + txt(x.desc, 20) + pad(x.p1, 9) + pad(x.p2, 9) + pad(x.p3, 9) + pad(x.dept, 2) + txt(x.bc, 41)); }
    case '4003': { const n = Number(data.slice(0, 4)); if (data.length !== 94 || !(n >= 1 && n <= 1000)) return err(16); S.plu[n] = { desc: data.slice(4, 24).trimEnd(), p1: +data.slice(24, 33), p2: +data.slice(33, 42), p3: +data.slice(42, 51), dept: +data.slice(51, 53), bc: data.slice(53).trimEnd() }; return ok(); }
    case '4229': return /^\d{3}$/.test(data) && Number(data) <= 255 ? ok(data + pad(S.keys[Number(data)] ?? keyDefault(Number(data)), 3)) : err(16);
    case '4029': {
      if (!/^\d{6}$/.test(data) || Number(data.slice(0, 3)) > 255) return err(16);
      const k = Number(data.slice(0, 3));
      const f = Number(data.slice(3));
      if ([997, 998].includes(f) || [997, 998].includes(S.keys[k] ?? keyDefault(k))) return err(16);
      S.keys[k] = f;
      return ok();
    }
    case '2003': case '2006': case '2009': case '2012': return /^\d{4}$/.test(data) ? ok('01') : err(16);
    case '2004': case '2010': return /^\d{6}$/.test(data) ? ok('01') : err(16);
    case '2005': case '2007': case '2011': return data === '01' ? ok('01') : err(16);
    case '1136': return /^01[12]$/.test(data) ? ok(`${data} 0000025822208 0000264701952 0000000000117 0000000073323 `) : err(16);
    case '3097': if (status()[1] !== '2') return err(17); S.ej = '0'; return ok('01');
    // nature: NN + "*" + simbolo (2) + " = " + descrizione (40) + codice AdE (5); vuota = spazi
    case '9204': {
      const n = n2();
      if (!(n === 0 || (n >= 10 && n <= 18)) || data.length !== 2) return err(16);
      const N = S.nat[n];
      return ok(pad(n, 2) + (N ? `*${txt(N[0], 2)} = ${txt(N[1], 40)}${txt(N[2], 5)}` : ' '.repeat(51)));
    }
    case '9004': {
      const n = n2();
      if (!(n >= 15 && n <= 18) || data.length !== 49) return err(16);
      if (needClosed()) return err(17);
      const sym = data.slice(2, 4).trimEnd(); const desc = data.slice(4, 44).trimEnd(); const tx = data.slice(44, 49).trimEnd();
      S.nat[n] = sym || desc || tx ? [sym, desc, tx] : null;
      return ok();
    }
    case '4237': { const n = n2(); return n >= 1 && n <= 3 && data.length === 2 ? ok(pad(n, 2) + S.ateco[n]) : err(16); }
    case '4037': {
      const n = n2();
      if (!(n >= 1 && n <= 3) || data.length !== 21 || !/^\d{6}[01][01]\d{11}$/.test(data.slice(2))) return err(16);
      if (needClosed()) return err(17);
      S.ateco[n] = data.slice(2); return ok();
    }
    case '4255': return ok(S.defVat);
    case '4055': if (!/^\d{43}$/.test(data)) return err(16); if (needClosed()) return err(17); S.defVat = data; return ok();
    case '9212': return /^[1-4]$/.test(data) ? ok(data + S.histVat[data]) : err(16);
    case '9012': if (!/^[1-4]\d{8}[0R]\d$/.test(data)) return err(16); S.histVat[data[0]] = data.slice(1); return ok();
    case '4219': { const n = n2(); const v = { 1: '192.168.001.050', 2: '255.255.255.000', 3: '192.168.001.254', 5: '192.168.001.254', 6: '008.008.008.008', 11: '38-1a-52-00-00-01', 12: '09100', 42: 'FP81II-SIMULATORE' }[n] ?? '0'; return ok(pad(n, 2) + '0' + v.padEnd(64, ' ')); }
    case '4231': return ok(S.eft);
    case '4031': if (!/^[0-2][01][2-9]\d{8}[01]\d{3}\.\d{3}\.\d{3}\.\d{3}\d{4}\d{3}\d{4}$/.test(data)) return err(16); S.eft = data; return ok();
    case '4232': { const k = Number(data); return /^\d{3}$/.test(data) && S.email[k] != null ? ok(data + txt(S.email[k], 64)) : err(16); }
    case '4032': { const k = Number(data.slice(0, 3)); if (data.length !== 67 || S.email[k] == null) return err(16); S.email[k] = data.slice(3).trimEnd(); return ok(); }
    case '4234': return /^\d{4}$/.test(data) && S.intel[data] != null ? ok(`${data}00${txt(S.intel[data], 64)}`) : err(16);
    case '4034': { const k = data.slice(0, 4); if (data.length !== 70 || data.slice(4, 6) !== '00' || S.intel[k] == null) return err(16); S.intel[k] = data.slice(6).trimEnd(); return ok(); }
    // accesso ai dati riservati: lettura indice (2) + valore (40, e-mail 100) + 32 zeri
    case '4238': {
      const n = n2();
      const v = { 4: S.accessTimeout, 5: S.accessMail, 20: S.loggedIn ? '1' : '0', 21: S.loggedIn ? '0029' : '0000' }[n];
      if (v == null || data.length !== 2) return err(16);
      return ok(pad(n, 2) + txt(v, n === 5 ? 100 : 40) + '0'.repeat(32));
    }
    case '4038': {
      const n = n2(); const v = data.slice(2).trimEnd();
      if (data.length !== 102) return err(16);
      if (n === 2) { if (v === S.accessPwd) { S.loggedIn = true; return ok(); } return err(13); }
      if (n === 3) { S.loggedIn = false; return ok(); }
      if (n === 1) { if (S.accessPwd && !S.loggedIn) return err(17); S.accessPwd = v; return ok(); }
      if (n === 4) { if (!/^\d{2}$/.test(v)) return err(13); S.accessTimeout = v; return ok(); }
      if (n === 5) { S.accessMail = v; return ok(); }
      if (n === 6 || n === 7) return S.accessMail ? ok() : err(22);
      return err(16);
    }
    case '3015': return data === '01' ? ok('01') : err(16);
    // trasmissioni
    case '9217': {
      if (!/^\d{4}$/.test(data)) return err(16);
      const z = Number(data);
      if (z < 1 || z > S.z) return ok(`1${data}${' '.repeat(28)}`);
      const d = new Date(Date.now() - (S.z - z) * 86400000);
      const dt = `${pad(d.getDate(), 2)}${pad(d.getMonth() + 1, 2)}${d.getFullYear()}`;
      return ok(`0${data}${dt}${txt(String(3672000000 + z * 137), 12)}${dt}`);
    }
    case '1134': {
      if (!/^\d{20}0[01]$/.test(data)) return err(16);
      return ok(data + '0'.repeat(28) + (data.endsWith('01') ? '0001200FFFFF' : '0'.repeat(12)));
    }
    case '1131': return /^\d{22}$/.test(data) ? ok(data + '0'.repeat(14) + '0'.repeat(20)) : err(16);
    case '9218': return /^\d{22}0[01]$/.test(data) ? ok(`${data.slice(0, 22)}05FFFFF${' '.repeat(50)}00000000`) : err(16);
    case '9016': return /^[0-2]$/.test(data) ? ok() : err(16);
    case '1333': return ok('010000');
    // contatori di manutenzione: tipo (2) + azzeramento (1); come una FP-81 II RT esiste solo lo stato carta/coperchio
    case '4295': if (!/^\d{2}[01]$/.test(data)) return err(16); return data.slice(0, 2) === '10' ? ok(`${data}${S.paper ? '1000000000' : '0000000000'}`) : err(18);
    // gruppi merceologici e tasti PLU diretti
    case '4208': { const n = n2(); return n >= 1 && n <= 10 && data.length === 2 ? ok(pad(n, 2) + txt(S.cats[n], 20)) : err(16); }
    case '4008': { const n = n2(); if (!(n >= 1 && n <= 10) || data.length !== 22) return err(16); S.cats[n] = data.slice(2).trimEnd(); return ok(); }
    case '4212': { const n = n2(); return n >= 1 && n <= 70 && data.length === 2 ? ok(pad(n, 2) + pad(S.pluKeys[n], 4)) : err(16); }
    case '4012': { const n = n2(); const v = Number(data.slice(2)); if (!(n >= 1 && n <= 70) || !/^\d{6}$/.test(data) || v < 1 || v > 1000) return err(16); S.pluKeys[n] = v; return ok(); }
    case '1050': S.drawer = 0; setTimeout(() => { S.drawer = 1; }, 3000); return ok('01');
    default: return err(16);
  }
}

export async function simulate(body) {
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 90));
  const doc = new DOMParser().parseFromString(`<root>${body}</root>`, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return reply(false, { code: 'PARSER_ERROR' });
  const root = doc.documentElement.firstElementChild;
  if (!root) return reply(false, { code: 'NO_DATA' });
  const kids = Array.from(root.children);
  const first = kids[0];
  const name = root.localName;

  if (name === 'printerCommand' && first) {
    const a = (k) => first.getAttribute(k) || '';
    switch (first.localName) {
      case 'directIO': return dio(a('command'), a('data'));
      case 'queryPrinterStatus':
        if (a('statusType') === '1') {
          return reply(true, { info: { lastCommand: '138', rtType: 'I', rtMainStatus: '02', rtSubStatus: '08', rtDailyOpen: S.dayOpen ? '1' : '0', rtNoWorkingPeriod: '0', rtFileToSend: '0', rtOldFileToSend: '0', rtFileRejected: '0', rtExpiryCD: '20280630', rtExpiryCA: '20290101', rtTrainingMode: '0', rtUpgradeResult: '0' } });
        }
        return reply(true, { info: { lastCommand: '74', cpuRel: '08.10', mfRel: '04.3', mfStatus: '0', fpStatus: status() } });
      case 'getDate': {
        const d = new Date(Date.now() + S.offsetMs);
        return reply(true, { info: { day: pad(d.getDate(), 2), month: pad(d.getMonth() + 1, 2), year: d.getFullYear(), hour: pad(d.getHours(), 2), minute: pad(d.getMinutes(), 2) } });
      }
      case 'setDate': {
        if (S.dayOpen) return err(17);
        const y = +a('year'); const d = new Date(y < 100 ? 2000 + y : y, +a('month') - 1, +a('day'), +a('hour'), +a('minute'));
        S.offsetMs = d - Date.now(); return reply(true);
      }
      case 'setLogo': S.conf[{ 0: 9, 1: 9, 2: 10, 3: 19, 4: 20 }[+a('location')]] = +a('index'); if (+a('location') === 0) { S.conf[10] = S.conf[19] = S.conf[20] = +a('index'); } return reply(true);
      case 'printContentByNumbers': case 'printContentByDate': case 'printDuplicateReceipt': return S.loggedIn ? reply(true, { info: { lastCommand: '74', printerStatus: status() } }) : err(17);
      case 'queryContentByNumbers': case 'queryContentByDate': {
        if (!S.loggedIn) return err(17);
        const from = Number(a('fromNumber')) || 1; const to = Math.min(Number(a('toNumber')) || 3, from + 2);
        const lines = [];
        for (let n = from; n <= to; n++) {
          lines.push('      NEGOZIO DI PROVA SRL', '      P.IVA 01234567890', '      DOCUMENTO COMMERCIALE', '   di vendita o prestazione',
            'DESCRIZIONE              IVA  Prezzo(€)', `PRODOTTO ${n}                22%      ${n},00`, `TOTALE COMPLESSIVO             ${n},00`,
            'PAGAMENTO CONTANTE               ' + `${n},00`, `${a('day') || a('fromDay') || '12'}-10-2026 10:${pad(n, 2)}`, `DOCUMENTO N. 0128-${pad(n, 4)}`, 'RT 99IEB123456', '');
        }
        return reply(true, { info: { lastCommand: '74', printerStatus: status(), lineCount: lines.map((l, i) => `<lineNumber${i + 1}>${xmlEsc(l)}</lineNumber${i + 1}>`).join('') } });
      }
      case 'resetPrinter': case 'displayText': case 'clearText': case 'openDrawer': case 'rebootWebServer': return reply(true);
      default: return reply(false, { code: 'non valid XML command' });
    }
  }
  if (name === 'printerFiscalReport') {
    if (first && /printZReport|printXZReport/.test(first.localName)) {
      S.z += 1; S.dayOpen = false; S.docs = 0;
      return reply(true, { info: { lastCommand: '74', printerStatus: status(), zRepNumber: String(S.z), dailyAmount: '0,00' } });
    }
    return reply(true, { info: { lastCommand: '74', printerStatus: status() } });
  }
  if (name === 'printerNonFiscal') {
    for (const k of kids) if (k.localName === 'setLogo') S.logos[k.getAttribute('index') || '?'] = true;
    return reply(true, { info: { lastCommand: '74', printerStatus: status() } });
  }
  if (name === 'printerFiscalDocument') {
    if (!kids.some((k) => k.localName === 'endFiscalDocument')) return reply(false, { code: 'INCOMPLETE FILE' });
    S.dayOpen = true; S.invoice = (S.invoice || 0) + 1;
    return reply(true, { info: { lastCommand: '74', printerStatus: status(), invoiceNumber: String(S.invoice) } });
  }
  if (name === 'printerFiscalReceipt') {
    const msg = kids.find((k) => k.localName === 'printRecMessage' && k.getAttribute('messageType') === '4')?.getAttribute('message') || '';
    const isVoid = /^VOID /.test(msg);
    const hasEnd = kids.some((k) => k.localName === 'endFiscalReceipt');
    if (!isVoid && !hasEnd) return reply(false, { code: 'INCOMPLETE FILE' });
    if (/^(VOID|REFUND) /.test(msg) && !/^(VOID|REFUND) \d{4} \d{4} \d{8} \S{11}$/.test(msg)) return err(16);
    const paid = kids.filter((k) => k.localName === 'printRecTotal').reduce((a, k) => a + Number(String(k.getAttribute('payment')).replace(',', '.')), 0);
    S.dayOpen = true; S.docs += 1;
    const d = new Date(Date.now() + S.offsetMs);
    return reply(true, { info: { lastCommand: '74', printerStatus: status(), fiscalReceiptNumber: String(S.docs), fiscalReceiptAmount: isVoid ? '0,00' : paid.toFixed(2).replace('.', ','), fiscalReceiptDate: `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`, fiscalReceiptTime: `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`, zRepNumber: String(S.z + 1) } });
  }
  return reply(false, { code: 'non valid XML command' });
}

/** Utilità per i test: apre la giornata come se fosse stato emesso un documento. */
export function simulatorOpenDay() { S.dayOpen = true; }
