// Viste di programmazione: intestazione, IVA, reparti, flag SET 14, parametri SET 15, tabelle.

import { $, $$, esc, toast, confirmBox, openSheet, task, fresh } from '../ui.js';
import { current, cache, saveCache, call, ensureDayClosed } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

function needPrinter(main) {
  if (current()) return false;
  main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
  return true;
}

const readTime = (t) => (t ? `<small class="muted">Letto il ${new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</small>` : '<small class="muted">Non ancora letto dalla stampante</small>');

function summary(results) {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return { ok: true, html: '' };
  return { ok: false, html: failed.map((r) => `<li>${esc(r.label)}: ${esc(r.error)}</li>`).join('') };
}
function reportResults(title, results) {
  const s = summary(results);
  if (s.ok) { toast(`${title}: ${results.length} programmazioni eseguite`, 'ok'); return; }
  openSheet(`<h2>${esc(title)}</h2><p>${results.length - results.filter((r) => !r.ok).length} riuscite, ${results.filter((r) => !r.ok).length} con errore:</p><ul>${s.html}</ul><div class="actions"><button class="btn" data-close>Chiudi</button></div>`,
    { onMount: (sh, close) => { sh.querySelector('[data-close]').onclick = close; } });
}

/** Esegue una lista di scritture { label, cmd, data } raccogliendo gli esiti. */
async function writeAll(p, items, ctx, title) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    ctx.check();
    ctx.progress(i, items.length, `${title} ${i + 1}/${items.length}`);
    const it = items[i];
    try {
      await fp.directIO(p, it.cmd, it.data, { label: it.label });
      results.push({ label: it.label, ok: true });
      it.onOk?.();
    } catch (e) {
      results.push({ label: it.label, ok: false, error: e.message });
      if (e.kind === 'network' || e.kind === 'mixed') break;
    }
  }
  ctx.progress(items.length, items.length);
  return results;
}

// ===========================================================================
// Intestazione
// ===========================================================================

export function header(main) {
  if (needPrinter(main)) return;
  main = fresh(main);
  const p = current();
  const c = cache();
  const saved = c.header || { lines: Array(C.HEADER_LINES + 1).fill(''), fonts: Array(C.HEADER_FONT_LINES + 1).fill(2) };
  const lines = saved.lines.slice();
  const fonts = saved.fonts.slice();

  const fontOpts = (n) => Object.entries(C.FONTS).map(([k, v]) => `<option value="${k}" ${Number(k) === fonts[n] ? 'selected' : ''}>${k} · ${v}</option>`).join('');
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="row between"><h2 style="margin:0">Intestazione esercente</h2>${readTime(saved.readAt)}</div>
      <p class="muted" style="font-size:.88rem">Massimo 40 caratteri per riga, senza lettere accentate. Il font è programmabile solo per le righe 1–9.
      Deve essere presente la partita IVA dell'esercente.</p>
      <div id="lines">
        ${Array.from({ length: C.HEADER_LINES }, (_, i) => i + 1).map((n) => `
          <div class="hdr-line">
            <span class="n">${n}</span>
            <input type="text" maxlength="40" data-line="${n}" value="${esc(lines[n] || '')}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Riga ${n}">
            <div class="tools">
              <span class="cnt" data-cnt="${n}"></span>
              <button class="btn small ghost" data-center="${n}" title="Centra" aria-label="Centra riga ${n}">↔</button>
              ${n <= C.HEADER_FONT_LINES ? `<select data-font="${n}" aria-label="Font riga ${n}">${fontOpts(n)}</select>` : ''}
            </div>
          </div>`).join('')}
      </div>
      <label class="check"><input type="checkbox" id="optSample" checked> Stampa una prova dell'intestazione dopo la scrittura</label>
    </section>
    <section class="card">
      <h2>Anteprima</h2>
      <div class="receipt" id="preview"></div>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
      <button class="btn" id="btnWrite">Scrivi sulla stampante</button>
    </div>`;

  const inputs = $$('input[data-line]', main);
  const update = () => {
    const pv = [];
    for (const inp of inputs) {
      const n = Number(inp.dataset.line);
      const v = C.toPrinterText(inp.value);
      if (v !== inp.value) { const pos = inp.selectionStart; inp.value = v; inp.setSelectionRange?.(pos, pos); }
      $(`[data-cnt="${n}"]`, main).textContent = `${inp.value.length}/40`;
      inp.classList.toggle('changed', inp.value.replace(/\s+$/, '') !== (saved.lines[n] || ''));
      const f = n <= C.HEADER_FONT_LINES ? Number($(`[data-font="${n}"]`, main).value) : 2;
      pv.push({ text: inp.value, f });
    }
    $$('select[data-font]', main).forEach((s) => s.classList.toggle('changed', Number(s.value) !== saved.fonts[Number(s.dataset.font)]));
    let last = pv.length; while (last > 0 && !pv[last - 1].text.trim()) last--;
    $('#preview', main).innerHTML = pv.slice(0, Math.max(last, 1)).map((r) => `<span class="l f${r.f}">${esc(r.text) || ' '}</span>`).join('')
      + '<span class="l"> </span><span class="l">      DOCUMENTO COMMERCIALE</span><span class="l">di vendita o prestazione</span>';
  };
  main.addEventListener('input', update);
  main.addEventListener('change', update);
  $$('[data-center]', main).forEach((b) => b.addEventListener('click', () => {
    const inp = $(`input[data-line="${b.dataset.center}"]`, main);
    inp.value = C.centerText(inp.value, C.HEADER_WIDTH).replace(/\s+$/, '');
    update();
  }));
  update();

  $('#btnRead', main).onclick = () => task('Lettura intestazione…', async (ctx) => {
    const nl = Array(C.HEADER_LINES + 1).fill('');
    const nf = Array(C.HEADER_FONT_LINES + 1).fill(2);
    let max = C.HEADER_LINES;
    for (let n = 1; n <= C.HEADER_LINES; n++) {
      ctx.check(); ctx.progress(n - 1, C.HEADER_LINES + C.HEADER_FONT_LINES, `Riga ${n}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD.READ_HEADER_LINE, C.num(n, 2), { allowFail: true, label: `Lettura riga ${n}` }));
      if (!r.response.success) { if (n > 1) { max = n - 1; break; } throw new Error(fp.errorMessage(r.response)); }
      const d = C.decodeHeaderLine(n, r.data);
      if (!d.ok) throw new Error(`Formato risposta non riconosciuto per la riga ${n}: "${r.data}"`);
      nl[n] = d.text;
    }
    for (let n = 1; n <= C.HEADER_FONT_LINES; n++) {
      ctx.check(); ctx.progress(C.HEADER_LINES + n - 1, C.HEADER_LINES + C.HEADER_FONT_LINES, `Font riga ${n}…`);
      const r = await fp.directIO(p, C.CMD.READ_HEADER_FONT, String(n), { allowFail: true, label: `Lettura font riga ${n}` });
      const d = r.response.success ? C.decodeHeaderFont(n, r.data) : { ok: false };
      if (d.ok) nf[n] = d.font;
    }
    c.header = { lines: nl, fonts: nf, max, readAt: Date.now() };
    saveCache();
    toast(max < C.HEADER_LINES ? `Intestazione letta (${max} righe gestite da questo modello)` : 'Intestazione letta', 'ok');
    header(main);
  }, { cancellable: true });

  $('#btnWrite', main).onclick = async () => {
    if (!saved.readAt) { toast('Leggi prima l\'intestazione dalla stampante: la scrittura riprogramma tutte le righe.', 'warn'); return; }
    const maxLine = saved.max || C.HEADER_LINES;
    const newLines = [''];
    inputs.forEach((inp) => { newLines[Number(inp.dataset.line)] = inp.value.replace(/\s+$/, ''); });
    const newFonts = [0];
    $$('select[data-font]', main).forEach((s) => { newFonts[Number(s.dataset.font)] = Number(s.value); });
    if (!newLines.some((l) => /\d{11}/.test(l.replace(/\s/g, '')))) {
      if (!await confirmBox('Partita IVA', 'Non trovo una partita IVA (11 cifre) nell\'intestazione. Sui registratori telematici deve essere presente e coincidere con quella di attivazione. Continuare comunque?', { okText: 'Continua' })) return;
    }
    const sample = $('#optSample', main).checked;
    if (newLines.some((l, n) => n > maxLine && l.trim())) { toast(`Questo modello gestisce ${maxLine} righe di intestazione`, 'warn'); return; }
    const linesChanged = newLines.some((l, n) => n > 0 && l !== (saved.lines[n] || ''));
    const fontItems = newFonts.map((f, n) => (n > 0 && f !== saved.fonts[n] ? { label: `Font riga ${n}`, cmd: C.CMD.SET_HEADER_FONT, data: C.encodeHeaderFont(n, f) } : null)).filter(Boolean);
    if (!linesChanged && !fontItems.length) { toast('Nessuna modifica da scrivere'); return; }
    if (!await confirmBox('Scrivi intestazione', `Verranno programmate ${linesChanged ? `tutte le ${maxLine} righe dell'intestazione` : 'solo i font modificati'} sulla stampante "${p.name}".`, { okText: 'Scrivi' })) return;

    await task('Scrittura intestazione…', async (ctx) => {
      let results = [];
      if (linesChanged) {
        if (!await ensureDayClosed(p, 'programmare l\'intestazione')) return;
        const items = [];
        for (let n = 1; n <= maxLine; n++) items.push({ label: `Riga ${n}`, cmd: C.CMD.SET_HEADER_LINE, data: C.encodeHeaderLine(n, newLines[n]) });
        if (sample) items.push({ label: 'Stampa di prova', cmd: C.CMD.SET_HEADER_LINE, data: C.encodeHeaderLine(C.HEADER_PRINT_SAMPLE, '') });
        items.push({ label: 'Conferma intestazione', cmd: C.CMD.SET_HEADER_LINE, data: C.encodeHeaderLine(C.HEADER_CONFIRM, '') });
        results = await writeAll(p, items, ctx, 'Scrittura riga');
      }
      if (fontItems.length) results = results.concat(await writeAll(p, fontItems, ctx, 'Scrittura font'));
      if (results.every((r) => r.ok)) {
        c.header = { lines: newLines.map((l) => l || ''), fonts: newFonts.map((f, i) => (i === 0 ? 2 : f)), max: maxLine, readAt: Date.now() };
        saveCache();
      }
      reportResults('Intestazione', results);
      header(main);
    }, { cancellable: true });
  };
}

// ===========================================================================
// Aliquote IVA
// ===========================================================================

export function vat(main) {
  if (needPrinter(main)) return;
  main = fresh(main);
  const p = current();
  const c = cache();
  const saved = c.vat || {};
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="row between"><h2 style="margin:0">Aliquote IVA</h2>${readTime(c.vatReadAt)}</div>
      <p class="muted" style="font-size:.88rem">Gruppi 1–9. Non si può assegnare la stessa aliquota a due gruppi (tranne 0%). Per riorganizzare le aliquote azzera prima i gruppi interessati.
      La programmazione richiede la giornata chiusa. Aliquote calendarizzate, IVA storiche, nature e ATECO sono in <a href="#/iva">IVA, nature e ATECO</a>.</p>
      <table class="t"><thead><tr><th>Gruppo</th><th>Aliquota %</th><th></th></tr></thead><tbody>
      ${Array.from({ length: C.VAT_GROUPS }, (_, i) => i + 1).map((g) => `
        <tr><td><b>${g}</b></td>
          <td><input type="number" step="0.01" min="0" max="99.99" inputmode="decimal" data-vat="${g}" value="${saved[g] ?? ''}" placeholder="—"></td>
          <td class="muted" style="font-size:.8rem" data-st="${g}"></td></tr>`).join('')}
      </tbody></table>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
      <button class="btn" id="btnWrite">Scrivi modifiche</button>
    </div>`;
  const inputs = $$('input[data-vat]', main);
  const mark = () => inputs.forEach((i) => i.classList.toggle('changed', i.value !== '' && Number(i.value) !== saved[i.dataset.vat]));
  main.addEventListener('input', mark);
  mark();

  $('#btnRead', main).onclick = () => task('Lettura aliquote…', async (ctx) => {
    const v = {};
    for (let g = 1; g <= C.VAT_GROUPS; g++) {
      ctx.check(); ctx.progress(g - 1, C.VAT_GROUPS, `Gruppo ${g}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD.READ_VAT, C.num(g, 2), { label: `Lettura IVA ${g}` }));
      const d = C.decodeVat(g, r.data);
      if (!d.ok) throw new Error(`Formato risposta IVA non riconosciuto: "${r.data}"`);
      v[g] = d.rate;
    }
    c.vat = v; c.vatReadAt = Date.now(); saveCache();
    toast('Aliquote lette', 'ok');
    vat(main);
  }, { cancellable: true });

  $('#btnWrite', main).onclick = async () => {
    const vals = {};
    for (const i of inputs) {
      if (i.value === '') continue;
      const v = Number(i.value);
      if (!(v >= 0 && v <= 99.99)) { toast(`Aliquota gruppo ${i.dataset.vat} non valida`, 'warn'); return; }
      vals[i.dataset.vat] = Math.round(v * 100) / 100;
    }
    const final = { ...saved, ...vals };
    const nonZero = Object.values(final).filter((v) => v > 0);
    if (new Set(nonZero).size !== nonZero.length) { toast('La stessa aliquota non può essere assegnata a due gruppi', 'warn'); return; }
    const changed = Object.entries(vals).filter(([g, v]) => v !== saved[g]);
    if (!changed.length) { toast('Nessuna modifica da scrivere'); return; }
    if (!await confirmBox('Scrivi aliquote', `Programmare: ${changed.map(([g, v]) => `gruppo ${g} = ${C.fmtPerc(v)}%`).join(', ')}?`, { okText: 'Scrivi' })) return;
    await task('Scrittura aliquote…', async (ctx) => {
      if (!await ensureDayClosed(p, 'programmare le aliquote IVA')) return;
      // prima gli azzeramenti, così da liberare eventuali aliquote spostate su altri gruppi
      const order = changed.sort((a, b) => (a[1] === 0 ? -1 : 0) - (b[1] === 0 ? -1 : 0));
      const items = order.map(([g, v]) => ({ label: `IVA gruppo ${g}`, cmd: C.CMD.SET_VAT, data: C.encodeVat(Number(g), v), onOk: () => { (c.vat ||= {})[g] = v; } }));
      const res = await writeAll(p, items, ctx, 'Gruppo');
      saveCache();
      reportResults('Aliquote IVA', res);
      vat(main);
    });
  };
}

// ===========================================================================
// Reparti
// ===========================================================================

export function depts(main) {
  if (needPrinter(main)) return;
  const p = current();
  const c = cache();
  c.depts ||= {};
  const dirty = (c.deptDirty ||= {});
  const vatTable = c.vat || {};
  const list = Object.keys(c.depts).map(Number).sort((a, b) => a - b);

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Reparti</h2>
      <div class="form-grid">
        <label class="field"><span>Dal reparto</span><input type="number" id="from" min="1" max="99" value="1" inputmode="numeric"></label>
        <label class="field"><span>Al reparto</span><input type="number" id="to" min="1" max="99" value="${list.length ? Math.max(...list) : 20}" inputmode="numeric"></label>
      </div>
      <div class="actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button></div>
    </section>
    <section class="card">
      ${list.length ? `<div class="table-wrap"><table class="t">
        <thead><tr><th>N.</th><th>Descrizione</th><th class="num">Prezzo</th><th>IVA</th><th>Tipo</th></tr></thead>
        <tbody>${list.map((n) => {
          const d = c.depts[n];
          const f = d.fields || {};
          return `<tr class="clickable ${dirty[n] ? 'dirty' : ''}" data-dept="${n}">
            <td><b>${n}</b></td><td>${esc(f.desc ?? '?')}${d.ok ? '' : ' <span class="badge warn">formato?</span>'}</td>
            <td class="num">${f.price1 != null ? C.fmtEur(f.price1) : '—'}</td>
            <td>${f.vat != null ? esc(String(f.vat)) : '—'}</td>
            <td>${f.salesType != null ? (f.salesType ? 'Servizi' : 'Beni') : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="muted" style="font-size:.85rem">Tocca un reparto per modificarlo. Le righe evidenziate hanno modifiche non ancora scritte.</p>`
      : '<div class="empty">Leggi i reparti dalla stampante per modificarli.</div>'}
    </section>
    <div class="sticky-actions">
      <button class="btn" id="btnWrite" ${Object.keys(dirty).length ? '' : 'disabled'}>Scrivi ${Object.keys(dirty).length || ''} modificati</button>
      ${Object.keys(dirty).length ? '<button class="btn ghost" id="btnDiscard">Annulla modifiche</button>' : ''}
    </div>`;

  $('#btnRead', main).onclick = () => {
    const from = Math.max(1, Math.min(99, Number($('#from', main).value) || 1));
    const to = Math.max(from, Math.min(99, Number($('#to', main).value) || from));
    task('Lettura reparti…', async (ctx) => {
      for (let n = from; n <= to; n++) {
        ctx.check(); ctx.progress(n - from, to - from + 1, `Reparto ${n}…`);
        const r = await call((pr) => fp.directIO(pr, C.CMD.READ_DEPARTMENT, C.num(n, 2), { label: `Lettura reparto ${n}` }));
        c.depts[n] = C.decodeDepartment(n, r.data);
        delete dirty[n];
      }
      c.deptReadAt = Date.now();
      saveCache();
      toast('Reparti letti', 'ok');
    }, { cancellable: true }).finally(() => { saveCache(); depts(main); });
  };
  $$('[data-dept]', main).forEach((tr) => tr.addEventListener('click', () => editDept(Number(tr.dataset.dept), () => depts(main))));
  $('#btnDiscard', main)?.addEventListener('click', async () => {
    if (!await confirmBox('Annulla modifiche', 'Scartare le modifiche non scritte? Rileggi i reparti per ripristinare i valori della stampante.', { okText: 'Scarta', danger: true })) return;
    for (const n of Object.keys(dirty)) { c.depts[n] = dirty[n].original; delete dirty[n]; }
    saveCache(); depts(main);
  });
  $('#btnWrite', main).onclick = async () => {
    const nums = Object.keys(dirty).map(Number).sort((a, b) => a - b);
    if (!await confirmBox('Scrivi reparti', `Programmare ${nums.length} reparti (${nums.join(', ')})?`, { okText: 'Scrivi' })) return;
    await task('Scrittura reparti…', async (ctx) => {
      if (!await ensureDayClosed(p, 'programmare i reparti')) return;
      const items = nums.map((n) => ({ label: `Reparto ${n}`, cmd: C.CMD.SET_DEPARTMENT, data: C.encodeDepartment(c.depts[n]), onOk: () => { delete dirty[n]; } }));
      const res = await writeAll(p, items, ctx, 'Reparto');
      saveCache();
      reportResults('Reparti', res);
      depts(main);
    }, { cancellable: true });
  };

  function editDept(n, done) {
    const d = c.depts[n];
    const f = d.fields;
    if (!d.ok) {
      openSheet(`<h2>Reparto ${n}</h2><div class="notice warn">La risposta della stampante non corrisponde al tracciato atteso: la modifica è disabilitata per sicurezza.</div>
        <p class="muted">Dato ricevuto (comando 4202):</p><pre class="mono" style="white-space:pre-wrap;word-break:break-all">${esc(d.raw)}</pre>
        <div class="actions"><button class="btn" data-close>Chiudi</button></div>`, { onMount: (sh, close) => { sh.querySelector('[data-close]').onclick = close; } });
      return;
    }
    const has = (k) => d.known > C.DEPT_FIELDS.findIndex((x) => x.k === k);
    const vatOpts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((g) => `<option value="${g}" ${g === f.vat ? 'selected' : ''}>${esc(C.vatGroupLabel(g, vatTable))}</option>`).join('')
      + (f.vat > 18 ? `<option value="${f.vat}" selected>${esc(C.vatGroupLabel(f.vat))}</option>` : '');
    openSheet(`
      <h2>Reparto ${n}</h2>
      <form class="stack" id="df">
        <label class="field"><span>Descrizione (max 20)</span><input type="text" name="desc" maxlength="20" value="${esc(f.desc)}" autocapitalize="characters"></label>
        <div class="form-grid">
          <label class="field"><span>Prezzo 1 €</span><input type="number" name="price1" step="0.01" min="0" inputmode="decimal" value="${f.price1}"></label>
          <label class="field"><span>Limite prezzo € (0 = nessuno)</span><input type="number" name="limit" step="0.01" min="0" inputmode="decimal" value="${f.limit}"></label>
        </div>
        <label class="field"><span>Gruppo IVA / natura</span><select name="vat">${vatOpts}</select></label>
        ${has('salesType') ? `<label class="field"><span>Tipologia vendita</span><select name="salesType">${Object.entries(C.SALES_TYPES).map(([k, v]) => `<option value="${k}" ${Number(k) === f.salesType ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
        <label class="check"><input type="checkbox" name="single" ${f.single ? 'checked' : ''}> Articolo singolo (chiude il documento dopo la vendita)</label>
        <details><summary class="muted" style="cursor:pointer">Altri campi</summary>
          <div class="form-grid" style="margin-top:.6rem">
            <label class="field"><span>Prezzo 2 €</span><input type="number" name="price2" step="0.01" min="0" inputmode="decimal" value="${f.price2}"></label>
            <label class="field"><span>Prezzo 3 €</span><input type="number" name="price3" step="0.01" min="0" inputmode="decimal" value="${f.price3}"></label>
            ${has('printGroup') ? `<label class="field"><span>Gruppo stampa (0–10)</span><input type="number" name="printGroup" min="0" max="10" inputmode="numeric" value="${f.printGroup}"></label>` : ''}
            ${has('category') ? `<label class="field"><span>Supergruppo merc. (0–10)</span><input type="number" name="category" min="0" max="10" inputmode="numeric" value="${f.category}"></label>` : ''}
            ${has('um') ? `<label class="field"><span>Unità misura fattura</span><input type="text" name="um" maxlength="2" value="${esc(f.um)}" autocapitalize="characters"></label>` : ''}
            ${has('mode') ? `<label class="field"><span>Attributo vendita</span><select name="mode">${Object.entries(C.DEPT_MODES).map(([k, v]) => `<option value="${k}" ${Number(k) === f.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
            ${has('ateco') ? `<label class="field"><span>Gruppo ATECO (0–3)</span><input type="number" name="ateco" min="0" max="3" inputmode="numeric" value="${f.ateco}"></label>` : ''}
          </div>
        </details>
        <div class="actions"><button class="btn" type="submit">Applica</button><button class="btn ghost" type="button" data-close>Annulla</button></div>
        <p class="muted" style="font-size:.82rem">Le modifiche vengono inviate alla stampante con «Scrivi modificati».</p>
      </form>`, {
      onMount(sh, close) {
        sh.querySelector('[data-close]').onclick = close;
        const form = sh.querySelector('#df');
        form.onsubmit = (e) => {
          e.preventDefault();
          const nf = { ...f };
          const numv = (k, max) => { if (form[k]) { const v = Number(form[k].value); if (!(v >= 0 && v <= max)) throw new Error(`Valore non valido: ${k}`); nf[k] = v; } };
          try {
            nf.desc = C.toPrinterText(form.desc.value).slice(0, 20);
            numv('price1', 9999999.99); numv('price2', 9999999.99); numv('price3', 9999999.99); numv('limit', 9999999.99);
            nf.vat = Number(form.vat.value);
            nf.single = form.single.checked ? 1 : 0;
            if (form.salesType) nf.salesType = Number(form.salesType.value);
            numv('printGroup', 10); numv('category', 10); numv('ateco', 3);
            if (form.mode) nf.mode = Number(form.mode.value);
            if (form.um) nf.um = C.toPrinterText(form.um.value).slice(0, 2);
          } catch (err) { toast(err.message, 'warn'); return; }
          const changed = Object.keys(nf).some((k) => nf[k] !== f[k]);
          if (changed) {
            if (!dirty[n]) dirty[n] = { original: JSON.parse(JSON.stringify(d)) };
            d.fields = nf;
            saveCache();
          }
          close();
          done();
        };
      },
    });
  }
}

// ===========================================================================
// Flag SET 14
// ===========================================================================

export function flags(main) {
  if (needPrinter(main)) return;
  const p = current();
  const c = cache();
  const saved = c.flags || {};
  const edits = {};
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="row between"><h2 style="margin:0">Flag SET 14</h2>${readTime(c.flagsReadAt)}</div>
      <input type="search" id="q" placeholder="Cerca flag…" style="margin-top:.6rem">
      <ul class="list" id="fl">
        ${Array.from({ length: C.FLAG_COUNT }, (_, i) => i + 1).map((n) => {
          const [t, v0, v1, warn] = C.FLAGS[n] || [`Flag ${n}`, '0', '1'];
          const v = saved[n];
          return `<li data-flag="${n}" data-q="${esc(`${n} ${t} ${v0} ${v1}`.toLowerCase())}">
            <div class="grow"><div class="title">${n}. ${esc(t)} ${warn ? '<span class="badge warn">!</span>' : ''}</div>
              <div class="sub" data-lbl="${n}">${v == null ? 'non letto' : esc(v ? v1 : v0)}</div></div>
            <label class="switch"><input type="checkbox" data-sw="${n}" ${v ? 'checked' : ''} ${v == null ? 'disabled' : ''} aria-label="Flag ${n}"><span></span></label>
          </li>`;
        }).join('')}
      </ul>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
      <button class="btn" id="btnWrite" disabled>Scrivi modifiche</button>
    </div>`;
  const btnW = $('#btnWrite', main);
  $('#q', main).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('#fl > li', main).forEach((li) => { li.hidden = q && !li.dataset.q.includes(q); });
  });
  $$('[data-sw]', main).forEach((sw) => sw.addEventListener('change', () => {
    const n = Number(sw.dataset.sw);
    const v = sw.checked ? 1 : 0;
    const [, v0, v1] = C.FLAGS[n] || ['', '0', '1'];
    $(`[data-lbl="${n}"]`, main).textContent = v ? v1 : v0;
    if (v === saved[n]) delete edits[n]; else edits[n] = v;
    sw.closest('li').classList.toggle('changed', n in edits);
    btnW.disabled = !Object.keys(edits).length;
    btnW.textContent = Object.keys(edits).length ? `Scrivi ${Object.keys(edits).length} modifiche` : 'Scrivi modifiche';
  }));

  $('#btnRead', main).onclick = () => task('Lettura flag…', async (ctx) => {
    const fl = {};
    for (let n = 1; n <= C.FLAG_COUNT; n++) {
      ctx.check(); ctx.progress(n - 1, C.FLAG_COUNT, `Flag ${n}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD.READ_FLAG, C.num(n, 2), { allowFail: true, label: `Lettura flag ${n}` }));
      if (!r.response.success) continue; // flag non gestito da questo firmware
      const d = C.decodeFlag(n, r.data);
      if (d.ok) fl[n] = d.value;
    }
    c.flags = fl; c.flagsReadAt = Date.now(); saveCache();
    toast(`Letti ${Object.keys(fl).length} flag`, 'ok');
    flags(main);
  }, { cancellable: true });

  btnW.onclick = async () => {
    const list = Object.entries(edits).map(([n, v]) => [Number(n), v]);
    const warns = list.filter(([n]) => C.FLAGS[n]?.[3]);
    const html = `<ul>${list.map(([n, v]) => `<li><b>${n}</b> ${esc(C.FLAGS[n]?.[0] || '')}: <b>${esc(v ? C.FLAGS[n]?.[2] : C.FLAGS[n]?.[1])}</b></li>`).join('')}</ul>
      ${warns.map(([n]) => `<div class="notice warn"><b>Flag ${n}:</b> ${esc(C.FLAGS[n][3])}</div>`).join('')}`;
    if (!await confirmBox('Scrivi flag', html, { html: true, okText: 'Scrivi', danger: warns.length > 0 })) return;
    await task('Scrittura flag…', async (ctx) => {
      const items = list.map(([n, v]) => ({ label: `Flag ${n}`, cmd: C.CMD.SET_FLAG, data: C.encodeFlag(n, v), onOk: () => { (c.flags ||= {})[n] = v; } }));
      const res = await writeAll(p, items, ctx, 'Flag');
      saveCache();
      reportResults('Flag SET 14', res);
      flags(main);
    });
  };
}

// ===========================================================================
// Parametri SET 15
// ===========================================================================

export function conf(main) {
  if (needPrinter(main)) return;
  main = fresh(main);
  const p = current();
  const c = cache();
  const saved = c.conf || {};
  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="row between"><h2 style="margin:0">Parametri SET 15</h2>${readTime(c.confReadAt)}</div>
      <ul class="list">
        ${Array.from({ length: C.CONF_COUNT }, (_, i) => i + 1).map((n) => {
          const d = C.CONF[n];
          const v = saved[n];
          const ctl = d.opts
            ? `<select data-conf="${n}" ${v == null ? 'disabled' : ''}>${v != null && !(v in d.opts) ? `<option value="${v}" selected>${v}</option>` : ''}${Object.entries(d.opts).map(([k, t]) => `<option value="${k}" ${Number(k) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
            : `<input type="number" data-conf="${n}" min="${d.min}" max="${d.max}" inputmode="numeric" value="${v ?? ''}" ${v == null ? 'disabled' : ''} style="max-width:110px">`;
          return `<li><div class="grow"><div class="title">${n}. ${esc(d.t)}</div><div class="sub">${esc(d.u || (d.opts ? '' : `${d.min}–${d.max}`))}${d.warn ? ` · ${esc(d.warn)}` : ''}</div></div>${ctl}</li>`;
        }).join('')}
      </ul>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
      <button class="btn" id="btnWrite">Scrivi modifiche</button>
    </div>`;
  const ctls = $$('[data-conf]', main);
  const mark = () => ctls.forEach((x) => x.classList.toggle('changed', x.value !== '' && Number(x.value) !== saved[x.dataset.conf]));
  main.addEventListener('input', mark); main.addEventListener('change', mark);

  $('#btnRead', main).onclick = () => task('Lettura parametri…', async (ctx) => {
    const cf = {};
    for (let n = 1; n <= C.CONF_COUNT; n++) {
      ctx.check(); ctx.progress(n - 1, C.CONF_COUNT, `Parametro ${n}…`);
      const r = await call((pr) => fp.directIO(pr, C.CMD.READ_CONF, C.num(n, 2), { allowFail: true, label: `Lettura parametro ${n}` }));
      if (!r.response.success) continue;
      const d = C.decodeConf(n, r.data);
      if (d.ok) cf[n] = d.value;
    }
    c.conf = cf; c.confReadAt = Date.now(); saveCache();
    toast(`Letti ${Object.keys(cf).length} parametri`, 'ok');
    conf(main);
  }, { cancellable: true });

  $('#btnWrite', main).onclick = async () => {
    const changes = [];
    for (const x of ctls) {
      if (x.disabled || x.value === '') continue;
      const n = Number(x.dataset.conf); const v = Number(x.value); const d = C.CONF[n];
      if (v === saved[n]) continue;
      if (!d.opts && !(v >= d.min && v <= d.max)) { toast(`Parametro ${n}: valore fuori intervallo (${d.min}–${d.max})`, 'warn'); return; }
      changes.push([n, v]);
    }
    if (!changes.length) { toast('Nessuna modifica da scrivere'); return; }
    const html = `<ul>${changes.map(([n, v]) => `<li><b>${n}</b> ${esc(C.CONF[n].t)}: <b>${esc(C.CONF[n].opts?.[v] ?? v)}</b></li>`).join('')}</ul>`;
    if (!await confirmBox('Scrivi parametri', html, { html: true, okText: 'Scrivi' })) return;
    await task('Scrittura parametri…', async (ctx) => {
      const items = changes.map(([n, v]) => ({ label: `Parametro ${n}`, cmd: C.CMD.SET_CONF, data: C.encodeConf(n, v), onOk: () => { (c.conf ||= {})[n] = v; } }));
      const res = await writeAll(p, items, ctx, 'Parametro');
      saveCache();
      reportResults('Parametri SET 15', res);
      conf(main);
    });
  };
}

// ===========================================================================
// Operatori, carte di credito, ticket
// ===========================================================================

const TABLES = {
  operators: {
    title: 'Operatori', count: C.OPERATORS, read: C.CMD.READ_OPERATOR, write: C.CMD.SET_OPERATOR,
    decode: C.decodeOperator, encode: C.encodeOperator,
    cols: [['desc', 'Nome', 'text', 20], ['password', 'Password (0–9999)', 'int', 9999], ['commission', 'Commissione %', 'perc', 99.99]],
  },
  cards: {
    title: 'Carte di credito', count: C.CARDS, read: C.CMD.READ_CARD, write: C.CMD.SET_CARD,
    decode: C.decodeCard, encode: C.encodeCard,
    cols: [['desc', 'Descrizione', 'text', 20]],
  },
  tickets: {
    title: 'Ticket (buoni pasto)', count: C.TICKETS, read: C.CMD.READ_TICKET, write: C.CMD.SET_TICKET,
    decode: C.decodeTicket, encode: C.encodeTicket,
    cols: [['desc', 'Descrizione', 'text', 20], ['value', 'Valore € (0 = libero)', 'money', 9999999.99]],
  },
  categories: {
    title: 'Gruppi merceologici', count: 10, read: '4208', write: '4008',
    decode: C.decodeCard, encode: C.encodeCard,
    cols: [['desc', 'Descrizione', 'text', 20]],
  },
};

export function tables(main, tab = 'operators') {
  if (needPrinter(main)) return;
  main = fresh(main);
  if (!TABLES[tab]) tab = 'operators';
  const p = current();
  const c = cache();
  const T = TABLES[tab];
  const saved = (c[tab] ||= {});
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${Object.entries(TABLES).map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t.title.split(' (')[0]}</button>`).join('')}</div>
    <section class="card">
      <div class="row between"><h2 style="margin:0">${T.title}</h2>${readTime(c[`${tab}ReadAt`])}</div>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>N.</th>${T.cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: T.count }, (_, i) => i + 1).map((n) => `<tr><td><b>${n}</b></td>${T.cols.map(([k, , type, max]) => {
          const v = saved[n]?.[k];
          const dis = saved[n] ? '' : 'disabled';
          return type === 'text'
            ? `<td><input type="text" maxlength="${max}" data-k="${k}" data-n="${n}" value="${esc(v ?? '')}" ${dis} autocapitalize="characters"></td>`
            : `<td><input type="number" min="0" max="${max}" step="${type === 'int' ? 1 : 0.01}" inputmode="decimal" data-k="${k}" data-n="${n}" value="${v ?? ''}" ${dis} style="min-width:90px"></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
      <button class="btn" id="btnWrite">Scrivi modifiche</button>
    </div>`;
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/tables/${b.dataset.tab}`; }));
  const inputs = $$('input[data-k]', main);
  const valueOf = (inp) => {
    const col = T.cols.find(([k]) => k === inp.dataset.k);
    return col[2] === 'text' ? C.toPrinterText(inp.value).slice(0, col[3]).replace(/\s+$/, '') : Number(inp.value);
  };
  const mark = () => inputs.forEach((i) => i.classList.toggle('changed', saved[i.dataset.n] && valueOf(i) !== saved[i.dataset.n][i.dataset.k]));
  main.addEventListener('input', mark);

  $('#btnRead', main).onclick = () => task(`Lettura ${T.title.toLowerCase()}…`, async (ctx) => {
    const out = {};
    for (let n = 1; n <= T.count; n++) {
      ctx.check(); ctx.progress(n - 1, T.count, `${T.title} ${n}…`);
      const r = await call((pr) => fp.directIO(pr, T.read, C.num(n, 2), { allowFail: true, label: `Lettura ${T.title} ${n}` }));
      if (!r.response.success) continue;
      const d = T.decode(n, r.data);
      if (d.ok) { delete d.ok; out[n] = d; }
    }
    c[tab] = out; c[`${tab}ReadAt`] = Date.now(); saveCache();
    toast(`${T.title}: letti ${Object.keys(out).length} elementi`, 'ok');
    tables(main, tab);
  }, { cancellable: true });

  $('#btnWrite', main).onclick = async () => {
    const rows = {};
    for (const i of inputs) {
      if (i.disabled) continue;
      const n = Number(i.dataset.n);
      const col = T.cols.find(([k]) => k === i.dataset.k);
      const v = valueOf(i);
      if (col[2] !== 'text' && !(v >= 0 && v <= col[3])) { toast(`${T.title} ${n}: valore non valido`, 'warn'); return; }
      (rows[n] ||= { ...saved[n] })[i.dataset.k] = v;
    }
    const changed = Object.entries(rows).filter(([n, r]) => T.cols.some(([k]) => r[k] !== saved[n][k]));
    if (!changed.length) { toast('Nessuna modifica da scrivere'); return; }
    if (!await confirmBox(`Scrivi ${T.title.toLowerCase()}`, `Programmare ${changed.length} elementi (${changed.map(([n]) => n).join(', ')})?`, { okText: 'Scrivi' })) return;
    await task('Scrittura…', async (ctx) => {
      const items = changed.map(([n, r]) => ({ label: `${T.title} ${n}`, cmd: T.write, data: T.encode(Number(n), r), onOk: () => { saved[n] = r; } }));
      const res = await writeAll(p, items, ctx, T.title);
      saveCache();
      reportResults(T.title, res);
      tables(main, tab);
    });
  };
}

export { writeAll };
