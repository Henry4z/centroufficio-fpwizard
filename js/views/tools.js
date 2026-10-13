// Viste strumenti: loghi, rapporti, backup/ripristino, console Direct IO.

import { $, $$, esc, toast, confirmBox, openSheet, task, saveFile, pickFile, copyText } from '../ui.js';
import { current, cache, saveCache, call, ensureDayClosed } from '../state.js';
import { mixedWarning } from './general.js';
import { writeAll } from './config.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import * as L from '../logo.js';
import { decodeXmlBytes, isWizardXml, parseWizardXml } from '../wizardxml.js';

function needPrinter(main) {
  if (current()) return false;
  main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
  return true;
}

const LOCATIONS = {
  0: 'Tutte le posizioni (testa e coda documenti e fatture)',
  1: 'Testa documenti (header)',
  2: 'Coda documenti (footer)',
  3: 'Testa fatture',
  4: 'Coda fatture',
};
const locationOpts = (sel = 1) => Object.entries(LOCATIONS).map(([k, v]) => `<option value="${k}" ${Number(k) === sel ? 'selected' : ''}>${v}</option>`).join('');
const indexOpts = (sel = 1, zero = false) => Array.from({ length: zero ? 10 : 9 }, (_, i) => (zero ? i : i + 1)).map((i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i === 0 ? '0 – Disattiva' : i}</option>`).join('');

// ===========================================================================
// Loghi
// ===========================================================================

export function logos(main) {
  if (needPrinter(main)) return;
  const p = current();
  const c = cache();
  let paper = c.conf?.[12] === 2 ? 58 : 80;
  let selected = null; // logo standard selezionato { id, raster, buf }
  let custom = null;   // { img, mono }

  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="notice">I loghi vengono salvati nella memoria NVRAM (indici 1–9) e stampati nelle posizioni scelte. La stampa dei loghi richiede il firmware registrato.</div>
    <section class="card">
      <div class="row between"><h2 style="margin:0">Loghi standard Epson</h2>
        <div class="segment" id="paper"><button data-paper="80">80 mm</button><button data-paper="58">58/60 mm</button></div></div>
      <div class="logo-grid" id="stdGrid" style="margin-top:12px"></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field"><span>Posizione di stampa</span><select id="stdLoc">${locationOpts(1)}</select></label>
        <label class="field"><span>Operazione</span><select id="stdOpt"><option value="0">Carica e imposta posizione</option><option value="1">Solo carica in memoria</option></select></label>
      </div>
      <div class="actions"><button class="btn" id="btnStd" disabled>Carica logo selezionato</button></div>
    </section>

    <section class="card">
      <h2>Logo personalizzato</h2>
      <div class="actions" style="margin-top:0"><button class="btn secondary" id="btnPick">Scegli immagine…</button></div>
      <div id="customBox" class="hidden stack" style="margin-top:12px">
        <div class="logo-preview"><canvas id="cv"></canvas></div>
        <div class="muted" id="cvInfo" style="font-size:.85rem"></div>
        <div class="form-grid">
          <label class="field"><span>Larghezza (punti)</span><input type="range" id="w" min="64" max="512" step="8" value="384"></label>
          <label class="field"><span>Soglia</span><input type="range" id="th" min="30" max="230" value="140"></label>
        </div>
        <label class="check"><input type="checkbox" id="dither" checked> Retinatura (per foto e sfumature)</label>
        <label class="check"><input type="checkbox" id="invert"> Inverti bianco/nero</label>
        <div class="form-grid">
          <label class="field"><span>Indice in memoria</span><select id="cIdx">${indexOpts(1)}</select></label>
          <label class="field"><span>Posizione di stampa</span><select id="cLoc">${locationOpts(1)}</select></label>
          <label class="field"><span>Operazione</span><select id="cOpt"><option value="0">Carica e imposta posizione</option><option value="1">Solo carica in memoria</option></select></label>
        </div>
        <div class="actions"><button class="btn" id="btnCustom">Carica logo</button></div>
      </div>
    </section>

    <section class="card">
      <h2>Posizione loghi già caricati</h2>
      <p class="muted" style="font-size:.88rem">Assegna un indice già presente in memoria a una posizione, oppure 0 per non stampare il logo.</p>
      <div class="form-grid">
        <label class="field"><span>Posizione</span><select id="pLoc">${locationOpts(1)}</select></label>
        <label class="field"><span>Indice</span><select id="pIdx">${indexOpts(1, true)}</select></label>
      </div>
      <div class="actions"><button class="btn" id="btnPos">Imposta posizione</button></div>
    </section>`;

  const grid = $('#stdGrid', main);
  const drawGrid = async () => {
    $$('#paper button', main).forEach((b) => b.classList.toggle('on', Number(b.dataset.paper) === paper));
    grid.innerHTML = L.STANDARD_LOGOS.map((l) => `<div class="logo-item" data-id="${l.id}"><canvas></canvas><small>${esc(l.name)}</small></div>`).join('');
    selected = null;
    $('#btnStd', main).disabled = true;
    await Promise.all(L.STANDARD_LOGOS.map(async (l) => {
      const item = grid.querySelector(`[data-id="${l.id}"]`);
      try {
        const res = await fetch(`assets/logos/${l.id}_${paper === 80 ? '80' : '58_60'}.bin`);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const r = L.parseRaster(buf);
        L.drawRaster(item.querySelector('canvas'), r);
        item.querySelector('small').textContent = `${l.name} · indice ${r.index}`;
        item.onclick = () => {
          $$('.logo-item', grid).forEach((x) => x.classList.remove('sel'));
          item.classList.add('sel');
          selected = { ...l, raster: r, buf };
          $('#btnStd', main).disabled = false;
        };
      } catch {
        item.querySelector('small').textContent = `${l.name} (non disponibile)`;
        item.dataset.missing = '1';
      }
    }));
    // la versione pubblicata online non contiene i file Epson dei loghi standard
    if (grid.querySelectorAll('[data-missing]').length === L.STANDARD_LOGOS.length) {
      grid.innerHTML = '<div class="notice" style="grid-column:1/-1">I loghi standard Epson non sono inclusi in questa versione dell\'app: usali dalla versione installata sul PC, oppure carica un logo personalizzato qui sotto.</div>';
    }
  };
  $$('#paper button', main).forEach((b) => b.addEventListener('click', () => {
    paper = Number(b.dataset.paper);
    drawGrid();
    w.max = String(L.PAPER_DOTS[paper]);
    if (Number(w.value) > L.PAPER_DOTS[paper]) w.value = w.max;
    render();
  }));
  drawGrid();

  $('#btnStd', main).onclick = async () => {
    if (!selected) return;
    const option = Number($('#stdOpt', main).value);
    const location = Number($('#stdLoc', main).value);
    const msg = `Caricare il logo "${selected.name}" (${paper} mm) all'indice ${selected.raster.index}${option === 0 ? ` e stamparlo in: ${LOCATIONS[location].toLowerCase()}` : ''}? Un eventuale logo con lo stesso indice verrà sostituito.`;
    if (!await confirmBox('Carica logo', msg, { okText: 'Carica' })) return;
    await task('Caricamento logo…', async () => {
      await call((pr) => fp.setLogo(pr, { option, location, index: selected.raster.index, format: 'R', base64: L.toBase64(new Uint8Array(selected.buf)) }));
      toast('Logo caricato', 'ok');
    });
  };

  // ----- logo personalizzato -----
  const cv = $('#cv', main);
  const w = $('#w', main);
  w.max = String(L.PAPER_DOTS[paper]);
  const render = () => {
    if (!custom) return;
    custom.mono = L.toMonochrome(custom.img, { width: Number(w.value), threshold: Number($('#th', main).value), dither: $('#dither', main).checked, invert: $('#invert', main).checked });
    L.drawMono(cv, custom.mono);
    const bytes = 62 + Math.ceil(custom.mono.width / 32) * 4 * custom.mono.height;
    $('#cvInfo', main).textContent = `${custom.mono.width} × ${custom.mono.height} punti · ${(bytes / 1024).toFixed(1)} KB (max ${(L.MAX_LOGO_BYTES / 1024).toFixed(1)} KB)`;
  };
  ['input', 'change'].forEach((ev) => ['#w', '#th', '#dither', '#invert'].forEach((s) => $(s, main).addEventListener(ev, render)));
  $('#btnPick', main).onclick = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const img = await L.loadImage(file);
      custom = { img };
      const maxW = L.PAPER_DOTS[paper];
      w.max = String(maxW);
      w.value = String(Math.min(maxW, Math.floor((img.naturalWidth || maxW) / 8) * 8 || maxW));
      $('#customBox', main).classList.remove('hidden');
      render();
    } catch {
      toast('Immagine non leggibile', 'error');
    }
  };
  $('#btnCustom', main).onclick = async () => {
    if (!custom?.mono) return;
    const index = Number($('#cIdx', main).value);
    const location = Number($('#cLoc', main).value);
    const option = Number($('#cOpt', main).value);
    if (!await confirmBox('Carica logo', `Caricare il logo all'indice ${index}${option === 0 ? ` e stamparlo in: ${LOCATIONS[location].toLowerCase()}` : ''}?`, { okText: 'Carica' })) return;
    const bmp = L.encodeBmp1(custom.mono);
    if (bmp.length > L.MAX_LOGO_BYTES) { toast('Immagine troppo grande: riduci la larghezza', 'warn'); return; }
    await task('Caricamento logo…', async () => {
      await call((pr) => fp.setLogo(pr, { option, location, index, format: 'B', base64: L.toBase64(bmp) }));
      toast('Logo caricato', 'ok');
    });
  };

  $('#btnPos', main).onclick = () => task('Programmazione posizione…', async () => {
    const location = Number($('#pLoc', main).value);
    const index = Number($('#pIdx', main).value);
    await call((pr) => fp.setLogo(pr, { option: 2, location, index }));
    const map = { 1: [9], 2: [10], 3: [19], 4: [20], 0: [9, 10, 19, 20] }[location];
    if (c.conf) { map.forEach((k) => { c.conf[k] = index; }); saveCache(); }
    toast('Posizione impostata', 'ok');
  });
}

// ===========================================================================
// Rapporti
// ===========================================================================

export function reports(main) {
  if (needPrinter(main)) return;
  const p = current();
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Lettura giornaliera (X)</h2>
      <p class="muted">Stampa il rapporto finanziario della giornata senza azzerare i totali.</p>
      <div class="actions"><button class="btn secondary" data-rep="X">Stampa rapporto X</button></div>
    </section>
    <section class="card">
      <h2>Altre letture X (non azzerano i totali)</h2>
      <div class="table-wrap"><table class="t"><thead><tr><th>Lettura</th><th>Giornaliera</th><th>Periodica</th></tr></thead><tbody>
        ${[['Reparti', '2003', '2009', '0100'], ['PLU', '2004', '2010', '010000'], ['Fasce orarie', '2005', '2011', '01'], ['Operatori', '2006', '2012', '0100']]
    .map(([t, d, pe, data]) => `<tr><td>${t}</td><td><button class="btn small secondary" data-x="${d}" data-d="${data}" data-t="${t} giornaliera">Stampa</button></td>
      <td><button class="btn small ghost" data-x="${pe}" data-d="${data}" data-t="${t} periodica">Stampa</button></td></tr>`).join('')}
        <tr><td>Finanziario</td><td><button class="btn small secondary" data-rep="X">Stampa</button></td><td><button class="btn small ghost" data-x="2007" data-d="01" data-t="Finanziario periodico">Stampa</button></td></tr>
      </tbody></table></div>
    </section>
    <section class="card">
      <h2>Chiusura giornaliera (Z)</h2>
      <p class="muted">Chiude la giornata fiscale e trasmette i corrispettivi all'Agenzia delle Entrate. Necessaria prima di programmare intestazione, IVA, reparti e data/ora.</p>
      <div class="actions"><button class="btn danger" data-rep="Z">Esegui chiusura Z</button><button class="btn ghost" data-rep="XZ">Rapporto X + chiusura Z</button></div>
      <div id="repResult"></div>
    </section>
    <section class="card">
      <h2>Stampa di prova</h2>
      <p class="muted">Stampa un documento gestionale (non fiscale) per verificare carta e intestazione.</p>
      <div class="actions"><button class="btn secondary" id="btnTest">Stampa documento di prova</button></div>
    </section>`;
  $$('[data-rep]', main).forEach((b) => b.addEventListener('click', async () => {
    const kind = b.dataset.rep;
    if (kind !== 'X' && !await confirmBox('Chiusura giornaliera', 'Eseguire la chiusura fiscale giornaliera? L\'operazione non è reversibile e invia i corrispettivi.', { okText: 'Esegui chiusura', danger: true })) return;
    await task(kind === 'X' ? 'Stampa rapporto X…' : 'Chiusura giornaliera e trasmissione…', async () => {
      const r = await call((pr) => fp.printReport(pr, kind));
      if (kind !== 'X') {
        $('#repResult', main).innerHTML = `<div class="notice ok">Chiusura eseguita${r.info.zRepNumber ? `: Z n. <b>${esc(r.info.zRepNumber)}</b>` : ''}${r.info.dailyAmount ? `, totale giornaliero € <b>${esc(r.info.dailyAmount)}</b>` : ''}.</div>`;
      }
      toast(kind === 'X' ? 'Rapporto X stampato' : 'Chiusura eseguita', 'ok');
    });
  }));
  $$('[data-x]', main).forEach((b) => b.addEventListener('click', () => task(`Stampa ${b.dataset.t}…`, async () => {
    await call((pr) => fp.directIO(pr, b.dataset.x, b.dataset.d, { timeout: 60000, label: `Lettura X ${b.dataset.t}` }));
    toast(`Lettura ${b.dataset.t} stampata`, 'ok');
  })));
  $('#btnTest', main).onclick = () => task('Stampa…', async () => {
    const now = new Date().toLocaleString('it-IT');
    await call((pr) => fp.printNonFiscal(pr, ['STAMPA DI PROVA', 'FP Wizard PWA', now, '----------------------------------------', 'Comunicazione di rete OK']));
    toast('Documento stampato', 'ok');
  });
}

// ===========================================================================
// Backup e ripristino
// ===========================================================================

export async function readEverything(p, ctx, sections) {
  const out = { app: 'FP Wizard PWA', format: 1, date: new Date().toISOString(), printer: { name: p.name, host: p.host } };
  const steps = [];
  if (sections.header) {
    for (let n = 1; n <= C.HEADER_LINES; n++) steps.push(['header', n]);
    for (let n = 1; n <= C.HEADER_FONT_LINES; n++) steps.push(['font', n]);
  }
  if (sections.vat) for (let n = 1; n <= C.VAT_GROUPS; n++) steps.push(['vat', n]);
  if (sections.depts) for (let n = 1; n <= C.DEPARTMENTS; n++) steps.push(['dept', n]);
  if (sections.flags) for (let n = 1; n <= C.FLAG_COUNT; n++) steps.push(['flag', n]);
  if (sections.conf) for (let n = 1; n <= C.CONF_COUNT; n++) steps.push(['conf', n]);
  if (sections.tables) {
    for (let n = 1; n <= C.OPERATORS; n++) steps.push(['op', n]);
    for (let n = 1; n <= C.CARDS; n++) steps.push(['card', n]);
    for (let n = 1; n <= C.TICKETS; n++) steps.push(['ticket', n]);
    for (let n = 1; n <= 10; n++) steps.push(['cat', n]);
  }
  try { const r = await fp.directIO(p, C.CMD.READ_SERIAL, '01'); const s = C.decodeSerial(r.data); if (s.ok) out.printer.serial = s.extended; } catch { /* opzionale */ }

  const skipHeader = { stop: false };
  for (let i = 0; i < steps.length; i++) {
    ctx.check();
    const [kind, n] = steps[i];
    ctx.progress(i, steps.length, `Lettura ${i + 1}/${steps.length}`);
    const get = (cmd, data) => fp.directIO(p, cmd, data, { allowFail: true, label: `Backup ${kind} ${n}` });
    let r;
    switch (kind) {
      case 'header': {
        if (skipHeader.stop) break;
        r = await get(C.CMD.READ_HEADER_LINE, C.num(n, 2));
        const d = r.response.success ? C.decodeHeaderLine(n, r.data) : { ok: false };
        if (d.ok) (out.header ||= { lines: {}, fonts: {} }).lines[n] = d.text; else skipHeader.stop = true;
        break;
      }
      case 'font': {
        r = await get(C.CMD.READ_HEADER_FONT, String(n));
        const d = r.response.success ? C.decodeHeaderFont(n, r.data) : { ok: false };
        if (d.ok) (out.header ||= { lines: {}, fonts: {} }).fonts[n] = d.font;
        break;
      }
      case 'vat': { r = await get(C.CMD.READ_VAT, C.num(n, 2)); const d = C.decodeVat(n, r.data); if (r.response.success && d.ok) (out.vat ||= {})[n] = d.rate; break; }
      case 'dept': { r = await get(C.CMD.READ_DEPARTMENT, C.num(n, 2)); if (r.response.success) { const d = C.decodeDepartment(n, r.data); (out.departments ||= {})[n] = { ok: d.ok, fields: d.fields, raw: d.raw }; } break; }
      case 'flag': { r = await get(C.CMD.READ_FLAG, C.num(n, 2)); const d = C.decodeFlag(n, r.data); if (r.response.success && d.ok) (out.flags ||= {})[n] = d.value; break; }
      case 'conf': { r = await get(C.CMD.READ_CONF, C.num(n, 2)); const d = C.decodeConf(n, r.data); if (r.response.success && d.ok) (out.conf ||= {})[n] = d.value; break; }
      case 'op': { r = await get(C.CMD.READ_OPERATOR, C.num(n, 2)); const d = C.decodeOperator(n, r.data); if (r.response.success && d.ok) { delete d.ok; (out.operators ||= {})[n] = d; } break; }
      case 'card': { r = await get(C.CMD.READ_CARD, C.num(n, 2)); const d = C.decodeCard(n, r.data); if (r.response.success && d.ok) { delete d.ok; (out.cards ||= {})[n] = d; } break; }
      case 'ticket': { r = await get(C.CMD.READ_TICKET, C.num(n, 2)); const d = C.decodeTicket(n, r.data); if (r.response.success && d.ok) { delete d.ok; (out.tickets ||= {})[n] = d; } break; }
      case 'cat': { r = await get('4208', C.num(n, 2)); const d = C.decodeCard(n, r.data); if (r.response.success && d.ok) { delete d.ok; (out.categories ||= {})[n] = d; } break; }
      default: break;
    }
  }
  ctx.progress(1, 1);
  return out;
}

/** Aggiorna i dati mostrati dalle schermate con una lettura completa (backup o sincronizzazione) della stampante corrente. */
export function updateCacheFromBackup(b) {
  const c = cache();
  const now = Date.now();
  if (b.header) {
    const lines = Array(C.HEADER_LINES + 1).fill('');
    const fonts = Array(C.HEADER_FONT_LINES + 1).fill(2);
    Object.entries(b.header.lines || {}).forEach(([n, t]) => { lines[n] = t; });
    Object.entries(b.header.fonts || {}).forEach(([n, f]) => { fonts[n] = f; });
    // righe gestite dal modello: la lettura si ferma alla prima riga non prevista
    const max = Math.max(0, ...Object.keys(b.header.lines || {}).map(Number)) || C.HEADER_LINES;
    c.header = { lines, fonts, max, readAt: now };
  }
  if (b.vat) { c.vat = b.vat; c.vatReadAt = now; }
  if (b.departments) {
    // i reparti modificati e non ancora scritti restano modificati: si aggiorna solo il loro valore originale
    const dirty = c.deptDirty || {};
    const fresh = {};
    Object.entries(b.departments).forEach(([n, d]) => { fresh[n] = C.decodeDepartment(Number(n), d.raw); });
    for (const n of Object.keys(dirty)) {
      if (fresh[n] && c.depts?.[n]) { dirty[n].original = fresh[n]; fresh[n] = c.depts[n]; } else delete dirty[n];
    }
    c.depts = fresh;
    c.deptDirty = dirty;
    c.deptReadAt = now;
  }
  if (b.flags) { c.flags = b.flags; c.flagsReadAt = now; }
  if (b.conf) { c.conf = b.conf; c.confReadAt = now; }
  ['operators', 'cards', 'tickets', 'categories'].forEach((k) => { if (b[k]) { c[k] = b[k]; c[`${k}ReadAt`] = now; } });
  saveCache();
}

export function backup(main) {
  if (needPrinter(main)) return;
  const p = current();
  const SECTIONS = [['header', 'Intestazione e font'], ['vat', 'Aliquote IVA'], ['depts', 'Reparti (1–99)'], ['flags', 'Flag SET 14'], ['conf', 'Parametri SET 15'], ['tables', 'Operatori, carte, ticket, gruppi merceologici']];
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Backup della programmazione</h2>
      <p class="muted">Legge la configurazione dalla stampante e la salva in un file JSON sul telefono (File, iCloud, e-mail…).</p>
      ${SECTIONS.map(([k, t]) => `<label class="check"><input type="checkbox" data-sec="${k}" checked> ${t}</label>`).join('')}
      <div class="actions"><button class="btn" id="btnBackup">Leggi e salva backup</button></div>
    </section>
    <section class="card">
      <h2>Ripristino da file</h2>
      <p class="muted">Programma la stampante con un backup di questa app (.json) oppure con un file di <b>EpsonFpWizard per Windows</b> (.xml, cartella <code>C:\\ProgramData\\EPSON\\EpsonFpWizard\\DatiProgrammazione</code>). Prima della scrittura scegli cosa ripristinare.</p>
      <div class="actions"><button class="btn secondary" id="btnRestore">Scegli file di backup…</button></div>
    </section>`;

  $('#btnBackup', main).onclick = async () => {
    const sections = Object.fromEntries($$('[data-sec]', main).map((x) => [x.dataset.sec, x.checked]));
    if (!Object.values(sections).some(Boolean)) { toast('Seleziona almeno una sezione', 'warn'); return; }
    const data = await task('Backup in corso…', async (ctx) => call((pr) => readEverything(pr, ctx, sections)), { cancellable: true });
    if (!data) return;
    updateCacheFromBackup(data);
    const safe = (s) => String(s || '').replace(/[^\w.-]+/g, '_');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const name = `FPWizard_${safe(data.printer.serial || p.name)}_${stamp}.json`;
    await saveFile(name, JSON.stringify(data, null, 2));
    toast('Backup completato', 'ok');
  };

  $('#btnRestore', main).onclick = async () => {
    const file = await pickFile('.json,.xml,application/json,text/xml,application/xml');
    if (!file) return;
    let b;
    try {
      const text = decodeXmlBytes(await file.arrayBuffer());
      b = isWizardXml(text) ? parseWizardXml(text) : JSON.parse(text);
    } catch (e) { toast(`File non valido: ${e.message}`, 'error'); return; }
    if (b.app !== 'FP Wizard PWA') { toast('Il file non è un backup di questa app né di EpsonFpWizard', 'error'); return; }
    restoreSheet(p, b);
  };
}

function restoreSheet(p, b) {
  const flagsList = Object.entries(b.flags || {});
  const parts = [
    ['header', 'Intestazione e font', b.header ? `${Object.values(b.header.lines || {}).filter((x) => x.trim()).length} righe` : null],
    ['vat', 'Aliquote IVA', b.vat ? Object.entries(b.vat).map(([g, v]) => `${g}:${C.fmtPerc(v)}%`).join(' ') : null],
    ['depts', 'Reparti', b.departments ? `${Object.values(b.departments).filter((d) => d.ok).length} reparti` : null],
    ['flags', 'Flag SET 14 (esclusi quelli critici)', flagsList.length ? `${flagsList.length} flag` : null],
    ['conf', 'Parametri SET 15', b.conf ? `${Object.keys(b.conf).length} parametri` : null],
    ['operators', 'Operatori', b.operators ? `${Object.keys(b.operators).length}` : null],
    ['cards', 'Carte di credito', b.cards ? `${Object.keys(b.cards).length}` : null],
    ['tickets', 'Ticket', b.tickets ? `${Object.keys(b.tickets).length}` : null],
    ['categories', 'Gruppi merceologici', b.categories ? `${Object.keys(b.categories).length}` : null],
  ].filter((x) => x[2]);
  const crit = flagsList.filter(([n]) => C.DANGEROUS_FLAGS.includes(Number(n)));
  const cur = cache().serial;
  const otherPrinter = cur?.ok && b.printer?.serial && !String(b.printer.serial).includes(cur.number);
  const extras = Object.values(b.extra || {}).map((x) => x.label);

  openSheet(`
    <h2>Ripristino</h2>
    <p class="muted">${b.source === 'EpsonFpWizard' ? 'File di EpsonFpWizard' : `Backup del ${esc(new Date(b.date).toLocaleString('it-IT'))}`} – ${esc(b.printer?.name || '')} ${b.printer?.serial ? `(${esc(b.printer.serial)})` : ''}</p>
    ${otherPrinter ? `<div class="notice warn">Il file è di un'altra stampante (${esc(b.printer.serial)}). Verifica che sia quello giusto prima di ripristinare.</div>` : ''}
    ${parts.map(([k, t, s]) => `<label class="check"><input type="checkbox" data-part="${k}" checked> <span>${esc(t)} <small class="muted">${esc(s)}</small></span></label>`).join('')}
    ${crit.length ? `<label class="check"><input type="checkbox" data-part="critical"> <span>Includi anche i flag critici (${crit.map(([n]) => n).join(', ')}) <small class="muted">XON-XOFF, demo, simulazione…</small></span></label>` : ''}
    ${extras.length ? `<p class="muted" style="font-size:.85rem">Presenti nel file ma non ancora ripristinabili dall'app: ${esc(extras.join(', '))}.</p>` : ''}
    <div class="notice warn">Il ripristino sovrascrive la programmazione attuale di "${esc(p.name)}". Intestazione, IVA e reparti richiedono la giornata chiusa.</div>
    <div class="actions"><button class="btn" data-go>Ripristina</button><button class="btn ghost" data-close>Annulla</button></div>`, {
    onMount(sh, close) {
      sh.querySelector('[data-close]').onclick = close;
      sh.querySelector('[data-go]').onclick = async () => {
        const sel = Object.fromEntries($$('[data-part]', sh).map((x) => [x.dataset.part, x.checked]));
        close();
        await task('Ripristino…', async (ctx) => {
          const needsClosed = sel.header || sel.vat || sel.depts;
          if (needsClosed && !await ensureDayClosed(p, 'il ripristino')) return;
          const items = [];
          if (sel.vat) {
            // prima gli azzeramenti per evitare aliquote duplicate temporanee
            Object.entries(b.vat).sort((x, y) => (x[1] === 0 ? -1 : 1) - (y[1] === 0 ? -1 : 1))
              .forEach(([g, v]) => items.push({ label: `IVA ${g}`, cmd: C.CMD.SET_VAT, data: C.encodeVat(Number(g), v) }));
          }
          if (sel.depts) {
            // i reparti dei file del wizard non hanno il dato grezzo: prima si verifica che la stampante usi il tracciato atteso
            const needProbe = Object.values(b.departments).some((d) => !d.raw && d.fields);
            let layoutOk = true;
            if (needProbe) {
              ctx.text('Verifica tracciato reparti…');
              const probe = await fp.directIO(p, C.CMD.READ_DEPARTMENT, '01', { allowFail: true, label: 'Verifica tracciato reparti' });
              const d1 = C.decodeDepartment(1, probe.data);
              layoutOk = probe.response.success && d1.ok && d1.known === C.DEPT_FIELDS.length && probe.data.length === d1.knownLength;
              if (!layoutOk) toast('Reparti saltati: il tracciato della stampante non è quello atteso', 'warn');
            }
            Object.entries(b.departments).forEach(([n, d]) => {
              let rec = null;
              if (d.raw) rec = C.decodeDepartment(Number(n), d.raw);
              else if (d.fields && layoutOk) rec = { ok: true, fields: { ...d.fields, num: Number(n) }, known: C.DEPT_FIELDS.length, raw: '', knownLength: 72 };
              if (rec?.ok) items.push({ label: `Reparto ${n}`, cmd: C.CMD.SET_DEPARTMENT, data: C.encodeDepartment(rec) });
            });
          }
          if (sel.header) {
            const lines = b.header.lines || {};
            if (Object.keys(lines).length) {
              const maxL = Math.min(C.HEADER_LINES, Math.max(...Object.keys(lines).map(Number)));
              for (let n = 1; n <= maxL; n++) items.push({ label: `Intestazione riga ${n}`, cmd: C.CMD.SET_HEADER_LINE, data: C.encodeHeaderLine(n, lines[n] || '') });
              items.push({ label: 'Conferma intestazione', cmd: C.CMD.SET_HEADER_LINE, data: C.encodeHeaderLine(C.HEADER_CONFIRM, '') });
            }
            Object.entries(b.header.fonts || {}).forEach(([n, f]) => items.push({ label: `Font riga ${n}`, cmd: C.CMD.SET_HEADER_FONT, data: C.encodeHeaderFont(Number(n), f) }));
          }
          if (sel.flags) {
            flagsList.forEach(([n, v]) => {
              if (C.DANGEROUS_FLAGS.includes(Number(n)) && !sel.critical) return;
              items.push({ label: `Flag ${n}`, cmd: C.CMD.SET_FLAG, data: C.encodeFlag(Number(n), v) });
            });
          }
          if (sel.conf) Object.entries(b.conf).forEach(([n, v]) => items.push({ label: `Parametro ${n}`, cmd: C.CMD.SET_CONF, data: C.encodeConf(Number(n), v) }));
          if (sel.operators) Object.entries(b.operators).forEach(([n, o]) => items.push({ label: `Operatore ${n}`, cmd: C.CMD.SET_OPERATOR, data: C.encodeOperator(Number(n), o) }));
          if (sel.cards) Object.entries(b.cards).forEach(([n, o]) => items.push({ label: `Carta ${n}`, cmd: C.CMD.SET_CARD, data: C.encodeCard(Number(n), o) }));
          if (sel.tickets) Object.entries(b.tickets).forEach(([n, o]) => items.push({ label: `Ticket ${n}`, cmd: C.CMD.SET_TICKET, data: C.encodeTicket(Number(n), o) }));
          if (sel.categories) Object.entries(b.categories).forEach(([n, o]) => items.push({ label: `Gruppo merceologico ${n}`, cmd: '4008', data: C.encodeCard(Number(n), o) }));

          const res = await writeAll(p, items, ctx, 'Programmazione');
          const failed = res.filter((r) => !r.ok);
          openSheet(`<h2>Ripristino completato</h2><p>${res.length - failed.length} programmazioni riuscite${failed.length ? `, ${failed.length} con errore:` : '.'}</p>
            ${failed.length ? `<ul>${failed.map((r) => `<li>${esc(r.label)}: ${esc(r.error)}</li>`).join('')}</ul>` : ''}
            <p class="muted">Rileggi le sezioni per aggiornare i dati mostrati nell'app.</p>
            <div class="actions"><button class="btn" data-close>Chiudi</button></div>`, { onMount: (s2, c2) => { s2.querySelector('[data-close]').onclick = c2; } });
        }, { cancellable: true });
      };
    },
  });
}

// ===========================================================================
// Console Direct IO
// ===========================================================================

export function console_(main) {
  if (needPrinter(main)) return;
  const p = current();
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Comando nativo (Direct IO)</h2>
      <p class="muted" style="font-size:.88rem">Invia un comando del protocollo Epson: 4 cifre (H1 + H2) e campo dati. Es. <code>4205</code> + <code>01</code> legge l'aliquota del gruppo 1.</p>
      <div class="form-grid">
        <label class="field"><span>Comando</span><input type="text" id="cmd" maxlength="4" inputmode="numeric" placeholder="4205" class="mono"></label>
        <label class="field"><span>Timeout (ms)</span><input type="number" id="tmo" value="10000" min="1000" step="1000" inputmode="numeric"></label>
      </div>
      <label class="field" style="margin-top:.6rem"><span>Dati</span><input type="text" id="data" placeholder="01" class="mono" autocapitalize="off" spellcheck="false"></label>
      <div class="actions"><button class="btn" id="btnSend">Invia</button></div>
      <div id="dioOut"></div>
    </section>
    <section class="card">
      <h2>Accesso (login)</h2>
      <p class="muted" style="font-size:.88rem">Alcune letture della memoria (DGFE/MPD) richiedono il login con la password di gestione accesso (SET 38).</p>
      <div class="row"><input type="password" id="pwd" placeholder="Password" style="flex:1"><button class="btn secondary" id="btnLogin">Login</button></div>
    </section>
    <section class="card">
      <h2>XML libero</h2>
      <p class="muted" style="font-size:.88rem">Corpo della richiesta Fiscal ePOS-Print XML (senza busta SOAP).</p>
      <textarea id="xml" spellcheck="false"><printerCommand>
  <queryPrinterStatus operator="1" statusType="1" />
</printerCommand></textarea>
      <div class="actions"><button class="btn" id="btnXml">Invia XML</button></div>
      <div id="xmlOut"></div>
    </section>`;

  const show = (el, r) => {
    const rows = C.decodeFpStatus(r.info?.printerStatus);
    el.innerHTML = `<div class="notice ${r.success ? 'ok' : 'err'}">
      <div><b>${r.success ? 'OK' : esc(fp.errorMessage(r))}</b> <small class="muted">code="${esc(r.code)}" status="${esc(r.status)}"</small></div>
      ${r.info?.responseCommand ? `<div>Risposta comando: <code>${esc(r.info.responseCommand)}</code></div>` : ''}
      ${r.info?.responseData != null ? `<div>Dati: <code style="white-space:pre-wrap;word-break:break-all">${esc(r.info.responseData)}</code> <small class="muted">(${r.info.responseData.length} caratteri)</small></div>` : ''}
      ${rows.length ? `<div class="muted" style="font-size:.85rem">${rows.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</div>` : ''}
      <div class="actions"><button class="btn small ghost" data-copy>Copia risposta XML</button></div></div>`;
    el.querySelector('[data-copy]').onclick = () => copyText(r.raw);
  };

  $('#btnSend', main).onclick = async () => {
    const cmd = $('#cmd', main).value.trim();
    const data = $('#data', main).value;
    const tmo = Math.max(1000, Number($('#tmo', main).value) || 10000);
    if (!/^\d{4}$/.test(cmd)) { toast('Il comando deve essere di 4 cifre', 'warn'); return; }
    if (!C.isReadCommand(cmd) && !await confirmBox('Comando di scrittura', `Il comando ${cmd} può modificare la programmazione o lo stato fiscale della stampante. Inviarlo?`, { okText: 'Invia', danger: true })) return;
    await task(`Invio ${cmd}…`, async () => {
      const r = await call((pr) => fp.directIO(pr, cmd, data, { timeout: tmo, allowFail: true }));
      show($('#dioOut', main), r.response);
    });
  };
  $('#btnLogin', main).onclick = () => task('Login…', async () => {
    const pwd = $('#pwd', main).value;
    if (!pwd) { toast('Inserisci la password', 'warn'); return; }
    await call((pr) => fp.directIO(pr, C.CMD.ACCESS, C.encodeLogin(pwd), { label: 'Login' }));
    toast('Login eseguito', 'ok');
  });
  $('#btnXml', main).onclick = async () => {
    const body = $('#xml', main).value.trim();
    const doc = new DOMParser().parseFromString(`<root>${body}</root>`, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) { toast('XML non valido', 'warn'); return; }
    const root = doc.documentElement.firstElementChild?.localName || '';
    if (root !== 'printerCommand' || /directIO|setDate|resetPrinter|printRecVoid/.test(body)) {
      if (!await confirmBox('Invio XML', 'Questa richiesta può stampare documenti o modificare la stampante. Inviarla?', { okText: 'Invia', danger: true })) return;
    }
    await task('Invio XML…', async () => {
      const r = await call((pr) => fp.rawXml(pr, body, 60000));
      show($('#xmlOut', main), r);
    });
  };
}
