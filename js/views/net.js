// Rete e servizi: rete LAN/Wi-Fi (sola lettura, 4219), web server e servizi «Intelligent» (4234/4034),
// e-mail (4232/4032), EFT-POS (4231/4031), accesso ai dati riservati DGFE/MPR (4238/4038).
// Tracciati verificati in lettura su FP-81 II RT; le scritture ripetono il tracciato letto e vengono rilette.

import { $, $$, esc, toast, confirmBox, promptBox, task, fresh, store, ipField } from '../ui.js';
import { current, cache, saveCache, call, savePrinter } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { rd, writeItems, trimR, noPrinter } from './prog.js';

const TABS = [['lan', 'Rete'], ['web', 'Web server e servizi'], ['email', 'E-mail'], ['eft', 'EFT-POS'], ['acc', 'Accesso dati']];
// password lette dalla stampante: solo in memoria, mai salvate sul telefono
const SECRETS = new Map();
const secretKey = (p, k) => `${p.id}:${k}`;

export function net(main, tab = 'lan') {
  main = fresh(main);
  if (noPrinter(main)) return;
  const p = current();
  if (!TABS.some(([k]) => k === tab)) tab = 'lan';
  const X = (cache().net ||= {});
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="body"></div>`;
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/net/${b.dataset.tab}`; }));
  VIEWS[tab](p, X, $('#body', main), () => net(main, tab));
}

/** Campo di un modulo: testo, numero, scelta, sì/no o password nascosta. */
function field(id, label, type, value, { opts, max = 64, hint = '', disabled = false } = {}) {
  const dis = disabled ? 'disabled' : '';
  if (type === 'bool') return `<label class="check"><input type="checkbox" id="${id}" ${value === '1' ? 'checked' : ''} ${dis}> ${esc(label)}</label>`;
  let input;
  if (type === 'sel') input = `<select id="${id}" ${dis}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}${opts.some(([v]) => v === value) ? '' : `<option value="${esc(value)}" selected>${esc(value)} (attuale)</option>`}</select>`;
  else if (type === 'secret') input = `<div class="row" style="gap:.4rem"><input type="password" id="${id}" maxlength="${max}" value="${esc(value)}" autocomplete="off" ${dis} style="flex:1"><button class="btn ghost" type="button" data-show="${id}">Mostra</button></div>`;
  else input = `<input type="${type === 'num' ? 'number' : 'text'}" id="${id}" maxlength="${max}" value="${esc(value)}" ${type === 'num' ? 'inputmode="numeric"' : 'autocapitalize="off" autocorrect="off" spellcheck="false"'} ${dis}>`;
  return `<label class="field"><span>${esc(label)}</span>${input}${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</label>`;
}
const val = (body, id, type) => (type === 'bool' ? ($(`#${id}`, body).checked ? '1' : '0') : String($(`#${id}`, body).value ?? '').trim());
function bindShow(body) {
  $$('[data-show]', body).forEach((b) => b.addEventListener('click', () => {
    const i = $(`#${b.dataset.show}`, body);
    i.type = i.type === 'password' ? 'text' : 'password';
    b.textContent = i.type === 'password' ? 'Mostra' : 'Nascondi';
  }));
}

// ---------------------------------------------------------------------------
// Parametri Intelligent: lettura categoria (2) + indice (2) + "00" + valore (64); scrittura con lo stesso tracciato
// ---------------------------------------------------------------------------
const INTEL = [
  ['Web server', [
    ['0103', 'SSL (HTTPS)', 'sel', { opts: [['0', 'Disattivato (HTTP)'], ['1', 'Attivato (HTTPS)'], ['2', 'Attivato, solo TLS 1.2']] }],
    ['0104', 'WebSocket attivi', 'bool'],
    ['0105', 'CORS: origine consentita', 'text', { hint: '* = qualsiasi sito (necessario per usare questa app da un altro indirizzo)' }],
    ['0101', 'Utente web server', 'text', { hint: 'Vuoto = nessuna autenticazione' }],
    ['0102', 'Password web server', 'secret'],
  ]],
  ['PHP', [
    ['0201', 'PHP attivo', 'bool'],
    ['0202', 'Script automatico', 'sel', { opts: [['0', 'Nessuno'], ['1', 'Dopo il pagamento (attende la risposta)'], ['2', 'Alla chiusura della stampa'], ['3', 'In background'], ['4', 'Dopo la chiusura giornaliera']] }],
    ['0203', 'Nome dello script', 'text'],
  ]],
  ['Web application', [
    ['0401', 'Memoria della web application', 'sel', { opts: [['0', 'Memoria interna (flash)'], ['1', 'Chiavetta USB'], ['2', 'Scheda SD']] }],
    ['0701', 'Carica la web application al riavvio', 'bool'],
    ['0601', 'Usa il fpmate.cgi aggiornato (caricato con upload.cgi)', 'bool'],
  ]],
  ['Altri servizi', [
    ['0301', 'Samba (cartella di rete)', 'bool'],
    ['0901', 'Salva il file JSON di ogni documento', 'bool'],
    ['0801', 'Programma in background attivo', 'bool'],
    ['0802', 'Nome del programma in background', 'text'],
  ]],
  ['Device Data Notification (lettore codici)', [
    ['1001', 'Programma', 'text'],
    ['1002', 'Prefisso (0–255)', 'num', { max: 3 }],
    ['1003', 'Suffisso (0–255)', 'num', { max: 3 }],
  ]],
];
const INTEL_KEYS = INTEL.flatMap(([, items]) => items.map((i) => i[0]));
const intelLabel = (k) => INTEL.flatMap(([, items]) => items).find((i) => i[0] === k)?.[1] || k;

// E-mail: parametro (3) + valore (64)
const EMAIL = [
  [2, 'Server SMTP (nome o indirizzo IP)', 'text'],
  [3, 'Porta SMTP', 'num', { max: 5 }],
  [4, 'Utente SMTP', 'text'],
  [5, 'Password SMTP', 'secret'],
  [6, 'Opzioni (2 cifre)', 'text', { max: 2, hint: 'Vedi il protocollo Epson «SET E-MAIL PARAMETERS»' }],
  [7, 'Mittente (obbligatorio)', 'text'],
  [8, 'Destinatario documenti fiscali e fatture', 'text'],
  [9, 'Destinatario notifiche', 'text'],
  [10, 'Formato dei documenti', 'sel', { opts: [['0', 'DOC'], ['1', 'TXT'], ['2', 'BMP (immagine)']] }],
  [11, 'Nome EHLO (obbligatorio)', 'text'],
];

const LAN = [[1, 'Indirizzo IP'], [2, 'Subnet mask'], [3, 'Gateway'], [4, 'Server proxy'], [5, 'DNS 1'], [6, 'DNS 2'], [7, 'Interfaccia / DHCP'], [9, 'Opzioni'],
  [11, 'MAC address'], [12, 'Porta TCP protocollo nativo'], [21, 'Wi-Fi SSID'], [22, 'Wi-Fi autenticazione'], [23, 'Wi-Fi crittografia'], [25, 'Wi-Fi tipo rete'],
  [26, 'Wi-Fi canale'], [31, '802.1X'], [41, 'Parametro 41'], [42, 'Nome host']];

// EFT-POS (38): modo (1) stampa (1) copie (1) terminale (8) interfaccia (1) IP (15) porta (4) timeout (3) riserva (4)
export function parseEft(raw) {
  const m = /^([0-2])([01])(\d)(\d{8})([01])(\d{3}\.\d{3}\.\d{3}\.\d{3})(\d{4})(\d{3})(.{4})$/.exec(String(raw ?? ''));
  return m ? { raw: m[0], mode: m[1], dev: m[2], copies: Number(m[3]), term: m[4], iface: m[5], ip: m[6].split('.').map(Number).join('.'), port: Number(m[7]), timeout: Number(m[8]), spare: m[9] } : null;
}
const padIp = (ip) => ip.split('.').map((x) => C.num(Number(x), 3)).join('.');

// ---------------------------------------------------------------------------
// Letture (usate dalle schede e dalla sincronizzazione completa). Le password restano solo in memoria.
// ---------------------------------------------------------------------------
export async function loadLan(p, X) {
  const out = {};
  for (const [n] of LAN) {
    const d = await rd(p, '4219', C.num(n, 2), `LAN ${n}`);
    if (d && Number(d.slice(0, 2)) === n) out[n] = trimR(d.slice(3)).replace(/\b0+(\d)/g, '$1');
  }
  X.lan = out;
}
export async function loadWeb(p, X) {
  const out = {};
  for (const k of INTEL_KEYS) {
    const d = await rd(p, '4234', k, `Parametro ${k} (${intelLabel(k)})`);
    if (d && d.slice(0, 4) === k && d.slice(4, 6) === '00') {
      if (k === '0102') { SECRETS.set(secretKey(p, k), trimR(d.slice(6))); out[k] = ''; } else out[k] = trimR(d.slice(6));
    }
  }
  X.web = Object.keys(out).length ? out : null;
}
export async function loadEmail(p, X) {
  const out = {};
  for (const n of [1, ...EMAIL.map(([x]) => x)]) {
    const d = await rd(p, '4232', C.num(n, 3), `E-mail ${n}`);
    if (d && Number(d.slice(0, 3)) === n) {
      if (n === 5) { SECRETS.set(secretKey(p, 'mail5'), trimR(d.slice(3))); out[n] = ''; } else out[n] = trimR(d.slice(3));
    }
  }
  X.email = Object.keys(out).length ? out : null;
}
export async function loadEft(p, X) {
  X.eft = parseEft(await rd(p, '4231', '', 'EFT-POS'));
}
export async function loadAcc(p, X) {
  const g = async (n) => { const d = await rd(p, '4238', C.num(n, 2), `Accesso ${n}`); return d && Number(d.slice(0, 2)) === n ? d.slice(2) : null; };
  const t = await g(4); const m = await g(5); const s = await g(20); const l = await g(21);
  X.acc = {
    timeout: t != null && /^\d{2}/.test(t) ? Number(t.slice(0, 2)) : null,
    mail: m != null ? trimR(m.slice(0, 100)) : null,
    session: s != null ? s[0] : null,
    left: l != null && /^\d{4}/.test(l) ? `${Number(l.slice(0, 4))} minuti` : null,
  };
}

const VIEWS = {
  lan(p, X, body, rerender) {
    const L = X.lan;
    body.innerHTML = `
      <section class="card"><h2>Rete (LAN / Wi-Fi)</h2>
        <p class="muted" style="font-size:.85rem">Sola lettura: Epson non consente di modificare i parametri di rete tramite la rete (si cambiano dalla tastiera della stampante o via USB/seriale).</p>
        ${L ? `<dl class="kv">${LAN.filter(([n]) => L[n] != null).map(([n, t]) => `<dt>${esc(t)}</dt><dd class="mono">${esc(L[n] || '—')}</dd>`).join('')}</dl>` : '<div class="empty">Leggi dalla stampante.</div>'}
      </section>
      <div class="sticky-actions"><button class="btn" id="btnRead">Leggi dalla stampante</button></div>`;
    $('#btnRead', body).onclick = () => task('Lettura rete…', async () => {
      await call((pr) => loadLan(pr, X));
      saveCache(); rerender();
    });
  },

  web(p, X, body, rerender) {
    const W = X.web;
    const v = (k) => (k === '0102' ? SECRETS.get(secretKey(p, k)) ?? '' : W?.[k] ?? '');
    body.innerHTML = `
      <div class="notice warn">Attenzione: questi parametri riguardano il web server con cui l'app comunica. Dopo aver cambiato SSL, utente o password bisogna riavviare il web server; se qualcosa va storto si ripristina dalla tastiera della stampante (menu web server).</div>
      ${!W ? '<section class="card"><div class="empty">Leggi dalla stampante.</div></section>' : INTEL.map(([title, items]) => {
    const shown = items.filter(([k]) => W[k] != null);
    return shown.length ? `<section class="card"><h2>${esc(title)}</h2>${shown.map(([k, label, type, o = {}]) => field(`i${k}`, label, type, v(k), o)).join('')}</section>` : '';
  }).join('')}
      ${W ? `<section class="card"><h2>Riavvio</h2><p class="muted" style="font-size:.85rem">Necessario dopo aver cambiato SSL, utente o password del web server. La stampante non risponde per qualche secondo.</p>
        <div class="actions"><button class="btn secondary" id="btnReboot">Riavvia web server</button></div></section>` : ''}
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${W ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
    bindShow(body);
    $('#btnRead', body).onclick = () => task('Lettura web server e servizi…', async () => {
      await call((pr) => loadWeb(pr, X));
      saveCache(); rerender();
    });
    $('#btnReboot', body)?.addEventListener('click', async () => {
      if (!await confirmBox('Riavvia web server', 'Il web server della stampante si riavvia: per qualche secondo l\'app non riceverà risposte.', { okText: 'Riavvia' })) return;
      await task('Riavvio del web server…', async () => {
        await call((pr) => fp.rawXmlChecked(pr, fp.el('printerCommand', {}, fp.el('rebootWebServer')), 15000));
        toast('Riavvio richiesto: attendi una ventina di secondi prima di continuare', 'ok', 6000);
      });
    });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      let sslTo = null;
      for (const [, list] of INTEL) {
        for (const [k, label, type, o = {}] of list) {
          if (X.web[k] == null) continue;
          const nv = val(body, `i${k}`, type);
          if (nv === v(k)) continue;
          if (type === 'num' && !(Number(nv) >= 0 && Number(nv) <= 255)) { toast(`${label}: valore da 0 a 255`, 'warn'); return; }
          const value = type === 'num' ? C.num(Number(nv), 3) : nv;
          if (value.length > (o.max || 64)) { toast(`${label}: massimo ${o.max || 64} caratteri`, 'warn'); return; }
          const data = `${k}00${C.txt(value, 64)}`;
          if (k === '0103') sslTo = value;
          const shown = type === 'secret' ? '' : type === 'bool' ? (value === '1' ? 'sì' : 'no') : type === 'sel' ? (o.opts.find(([x]) => x === value)?.[1] || value) : value || '(vuoto)';
          items.push([type === 'secret' ? label : `${label}: ${shown}`, '4034', data, '4234', k, (b) => b.slice(0, 6) === `${k}00` && trimR(b.slice(6)) === trimR(value)]);
        }
      }
      const ok = await writeItems(p, items, null, null, { confirmText: sslTo != null ? `SSL passa a «${{ 0: 'disattivato', 1: 'attivato', 2: 'solo TLS 1.2' }[sslTo] || sslTo}»: dopo il riavvio del web server l'app dovrà collegarsi in ${sslTo === '0' ? 'HTTP' : 'HTTPS'}.` : '' });
      if (ok) {
        for (const [, , data] of items) {
          const k = data.slice(0, 4);
          if (k === '0102') SECRETS.set(secretKey(p, k), trimR(data.slice(6))); else X.web[k] = trimR(data.slice(6));
        }
        saveCache();
        if (sslTo != null && !p.simulator) {
          const proto = sslTo === '0' ? 'http' : 'https';
          if (p.proto !== proto && await confirmBox('Collegamento dell\'app', `Vuoi che l'app usi ${proto.toUpperCase()} per questa stampante? Ricordati di riavviare il web server${proto === 'https' ? ' e di aprire una volta https://' + p.host + ' in Safari per accettare il certificato' : ''}.`, { okText: `Usa ${proto.toUpperCase()}` })) {
            savePrinter({ ...p, proto });
            toast(`Ora l'app usa ${proto.toUpperCase()} per ${p.name}`, 'ok');
          }
        }
      }
      rerender();
    };
  },

  email(p, X, body, rerender) {
    const E = X.email;
    const v = (n) => (n === 5 ? SECRETS.get(secretKey(p, 'mail5')) ?? '' : E?.[n] ?? '');
    body.innerHTML = `
      <section class="card"><h2>Posta elettronica</h2>
        <p class="muted" style="font-size:.85rem">Server di invio (SMTP) usato dalla stampante per inviare documenti, fatture e notifiche.</p>
        ${!E ? '<div class="empty">Leggi dalla stampante.</div>' : `
        ${E[1] != null ? `<p class="muted">Tipo server: <b>${esc(E[1] || '—')}</b></p>` : ''}
        ${EMAIL.filter(([n]) => E[n] != null).map(([n, label, type, o = {}]) => field(`e${n}`, label, type, v(n), o)).join('')}`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${E ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
    bindShow(body);
    $('#btnRead', body).onclick = () => task('Lettura e-mail…', async () => {
      await call((pr) => loadEmail(pr, X));
      if (!X.email) toast('Questo modello o firmware non gestisce l\'e-mail', 'warn');
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (const [n, label, type, o = {}] of EMAIL) {
        if (X.email[n] == null) continue;
        const nv = val(body, `e${n}`, type);
        if (nv === v(n)) continue;
        if ((n === 7 || n === 11) && !nv) { toast(`${label}: non può essere vuoto`, 'warn'); return; }
        if (n === 3 && !(Number(nv) >= 1 && Number(nv) <= 65535)) { toast('Porta SMTP non valida', 'warn'); return; }
        if (nv.length > (o.max || 64)) { toast(`${label}: massimo ${o.max || 64} caratteri`, 'warn'); return; }
        const data = C.num(n, 3) + C.txt(nv, 64);
        const shown = type === 'sel' ? (o.opts.find(([x]) => x === nv)?.[1] || nv) : nv || '(vuoto)';
        items.push([type === 'secret' ? label : `${label}: ${shown}`, '4032', data, '4232', C.num(n, 3), (b) => b.slice(0, 3) === C.num(n, 3) && trimR(b.slice(3)) === nv]);
      }
      if (await writeItems(p, items, null, null)) {
        for (const [, , data] of items) {
          const n = Number(data.slice(0, 3));
          if (n === 5) SECRETS.set(secretKey(p, 'mail5'), trimR(data.slice(3))); else X.email[n] = trimR(data.slice(3));
        }
        saveCache();
      }
      rerender();
    };
  },

  eft(p, X, body, rerender) {
    const F = X.eft;
    body.innerHTML = `
      <section class="card"><h2>Pagamenti elettronici (EFT-POS)</h2>
        ${F === undefined ? '<div class="empty">Leggi dalla stampante.</div>' : F === null ? '<div class="notice warn">Risposta non riconosciuta: modifica disattivata.</div>' : `
        ${field('fMode', 'Collegamento POS', 'sel', F.mode, { opts: [['0', 'Disattivato'], ['1', 'Attivo, protocollo SETEFI'], ['2', 'Attivo, protocollo Ingenico 17']] })}
        <div class="form-grid">
          ${field('fIface', 'Interfaccia', 'sel', F.iface, { opts: [['0', 'Seriale RS-232'], ['1', 'Rete TCP/IP']] })}
          ${field('fIp', 'Indirizzo IP del POS', 'text', F.ip, { max: 15 })}
          ${field('fPort', 'Porta TCP (1–9999)', 'num', String(F.port), { max: 4 })}
          ${field('fTerm', 'ID terminale POS (8 cifre)', 'text', F.term, { max: 8 })}
          ${field('fTimeout', 'Timeout in secondi (0 = nessuno)', 'num', String(F.timeout), { max: 3 })}
          ${field('fCopies', 'Copie dello scontrino POS (2–9)', 'num', String(F.copies), { max: 1 })}
          ${field('fDev', 'Stampa ricevuta del pagamento', 'sel', F.dev, { opts: [['0', 'Sulla stampante del POS'], ['1', 'Sulla stampante fiscale']] })}
        </div>
        <p class="muted" style="font-size:.85rem">Le porte oltre 9999 si programmano solo dalla tastiera. Copie e stampa valgono per i pagamenti fatti dalla tastiera della stampante.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${F ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
    $('#fIp', body)?.setAttribute('inputmode', 'decimal');
    ipField($('#fIp', body));
    $('#btnRead', body).onclick = () => task('Lettura EFT-POS…', async () => {
      await call((pr) => loadEft(pr, X));
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const ip = val(body, 'fIp', 'text');
      if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) || ip.split('.').some((x) => Number(x) > 255)) { toast('Indirizzo IP non valido', 'warn'); return; }
      const port = Number(val(body, 'fPort', 'num')); const timeout = Number(val(body, 'fTimeout', 'num')); const copies = Number(val(body, 'fCopies', 'num'));
      const term = val(body, 'fTerm', 'text');
      if (!(port >= 1 && port <= 9999)) { toast('Porta da 1 a 9999', 'warn'); return; }
      if (!(timeout >= 0 && timeout <= 999)) { toast('Timeout da 0 a 999 secondi', 'warn'); return; }
      if (!(copies >= 2 && copies <= 9)) { toast('Copie da 2 a 9', 'warn'); return; }
      if (!/^\d{1,8}$/.test(term)) { toast('ID terminale: solo cifre (massimo 8)', 'warn'); return; }
      const data = val(body, 'fMode', 'sel') + val(body, 'fDev', 'sel') + copies + C.num(Number(term), 8) + val(body, 'fIface', 'sel') + padIp(ip) + C.num(port, 4) + C.num(timeout, 3) + X.eft.spare;
      if (data === X.eft.raw) { toast('Nessuna modifica da scrivere'); return; }
      await writeItems(p, [['Parametri EFT-POS', '4031', data, '4231', '', (b) => b === data]], rerender, () => loadEft(p, X));
    };
  },

  acc(p, X, body, rerender) {
    const A = X.acc;
    body.innerHTML = `
      <section class="card"><h2>Accesso ai dati riservati</h2>
        <p class="muted" style="font-size:.88rem">Protegge con password la consultazione di giornale elettronico (DGFE/MPD) e memoria fiscale (MPR) da rete.</p>
        ${!A ? '<div class="empty">Leggi dalla stampante.</div>' : `
        <dl class="kv">
          <dt>Sessione</dt><dd>${A.session == null ? '—' : A.session === '1' ? '<span class="badge ok">attiva</span>' : '<span class="badge">non attiva</span>'}</dd>
          ${A.left != null ? `<dt>Tempo residuo</dt><dd>${esc(A.left)}</dd>` : ''}
        </dl>
        <div class="form-grid" style="margin-top:.6rem">
          ${A.timeout != null ? field('aTimeout', 'Durata della sessione (minuti, 0–99)', 'num', String(A.timeout), { max: 2 }) : ''}
          ${A.mail != null ? field('aMail', 'E-mail per il recupero password', 'text', A.mail, { max: 100 }) : ''}
        </div>`}
      </section>
      ${A ? `<section class="card"><h2>Operazioni</h2>
        <div class="actions" style="margin-top:0">
          <button class="btn secondary" data-act="login">Accedi</button>
          <button class="btn secondary" data-act="logout">Esci</button>
          <button class="btn secondary" data-act="test">E-mail di prova</button>
          <button class="btn secondary" data-act="recovery">Recupero password</button>
          <button class="btn ghost" data-act="pwd">Imposta password</button>
        </div>
        <p class="muted" style="font-size:.85rem">«E-mail di prova» e «Recupero password» usano l'indirizzo qui sopra e il server di posta della scheda E-mail.</p>
      </section>` : ''}
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${A ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    const load = async () => { await call((pr) => loadAcc(pr, X)); saveCache(); };
    $('#btnRead', body).onclick = () => task('Lettura accesso…', async () => { await load(); rerender(); });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      if (X.acc.timeout != null) {
        const t = Number(val(body, 'aTimeout', 'num'));
        if (!(t >= 0 && t <= 99)) { toast('Durata da 0 a 99 minuti', 'warn'); return; }
        if (t !== X.acc.timeout) { const data = `04${C.txt(C.num(t, 2), 100)}`; items.push([`Durata sessione: ${t} minuti`, '4038', data, '4238', '04', (b) => b.slice(0, 4) === `04${C.num(t, 2)}`]); }
      }
      if (X.acc.mail != null) {
        const m = val(body, 'aMail', 'text');
        if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { toast('Indirizzo e-mail non valido', 'warn'); return; }
        if (m !== X.acc.mail) { const data = `05${C.txt(m, 100)}`; items.push([`E-mail recupero: ${m || '(vuoto)'}`, '4038', data, '4238', '05', (b) => trimR(b.slice(2, 102)) === m]); }
      }
      await writeItems(p, items, rerender, load);
    };
    const action = async (n, value, label, okMsg) => {
      await task(`${label}…`, async () => {
        await call((pr) => fp.directIO(pr, '4038', C.num(n, 2) + C.txt(value, 100), { label }));
        toast(okMsg, 'ok');
        try { await load(); } catch { /* facoltativo */ }
      });
      rerender();
    };
    $$('[data-act]', body).forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'login') {
        const pwd = await promptBox('Accedi', 'Password di accesso ai dati riservati', { type: 'password', value: store.get('accessPwd', '') });
        if (pwd == null) return;
        await action(2, pwd, 'Accesso', 'Accesso eseguito');
      } else if (act === 'logout') await action(3, '', 'Uscita', 'Sessione chiusa');
      else if (act === 'test') await action(6, '', 'E-mail di prova', 'E-mail di prova inviata: controlla la casella indicata');
      else if (act === 'recovery') {
        if (await confirmBox('Recupero password', 'La stampante invia all\'indirizzo di recupero le istruzioni per reimpostare la password.', { okText: 'Invia' })) await action(7, '', 'Recupero password', 'Richiesta di recupero inviata');
      } else if (act === 'pwd') {
        const a1 = await promptBox('Imposta password', 'Nuova password (fino a 40 caratteri). Senza di essa non si potranno più consultare DGFE e memoria fiscale da rete: conservala con cura.', { type: 'password' });
        if (a1 == null) return;
        if (a1.length > 40) { toast('Massimo 40 caratteri', 'warn'); return; }
        const a2 = await promptBox('Conferma password', 'Ripeti la nuova password', { type: 'password' });
        if (a2 == null) return;
        if (a1 !== a2) { toast('Le due password non coincidono', 'warn'); return; }
        if (!await confirmBox('Imposta password', 'Confermi la nuova password di accesso ai dati riservati? Se la stampante ne ha già una, prima esegui «Accedi».', { okText: 'Imposta', danger: true })) return;
        await action(1, a1, 'Impostazione password', 'Password impostata');
      }
    }));
  },
};
