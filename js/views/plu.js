// PLU interni (4203 / 4003): codice (4) + descrizione (20) + 3 prezzi (9) + reparto (2) + codice a barre.
// La scrittura riusa la larghezza del codice a barre letta dalla stampante e verifica rileggendo.

import { $, $$, esc, toast, confirmBox, openSheet, task, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { rd, writeItems } from './prog.js';

const trimR = (s) => String(s ?? '').replace(/\s+$/, '');

export function decodePlu(code, data) {
  const d = String(data ?? '');
  if (Number(d.slice(0, 4)) !== code || !/^\d{29}$/.test(d.slice(24, 53))) return { ok: false, raw: d };
  return {
    ok: true, raw: d, bw: Math.max(0, d.length - 53),
    desc: trimR(d.slice(4, 24)), p1: Number(d.slice(24, 33)) / 100, p2: Number(d.slice(33, 42)) / 100, p3: Number(d.slice(42, 51)) / 100,
    dept: Number(d.slice(51, 53)), barcode: trimR(d.slice(53)),
  };
}
export const encodePlu = (code, f) => C.num(code, 4) + C.txt(f.desc, 20) + C.money(f.p1) + C.money(f.p2) + C.money(f.p3) + C.num(f.dept, 2) + (f.bw ? C.txt(f.barcode, f.bw) : '');

/** Legge i PLU da `from` a `to` (4203); con keepDirty non tocca quelli modificati e non ancora scritti. */
export async function loadPluRange(p, P, from, to, step = () => {}, { keepDirty = true } = {}) {
  for (let n = from; n <= to; n++) {
    step(n - from, to - from + 1, `PLU ${n}…`);
    if (keepDirty && P[n]?.dirty) continue;
    const r = await fp.directIO(p, '4203', C.num(n, 4), { allowFail: true, label: `Lettura PLU ${n}` });
    if (r.response.success) P[n] = decodePlu(n, r.data);
  }
}
/** Tasti PLU diretti 1–70 (4212): tasto (2) + PLU interno (4). */
export async function loadPluKeys(p, c, step = () => {}) {
  const out = {};
  for (let n = 1; n <= 70; n++) {
    step(n - 1, 70, `Tasto PLU ${n}…`);
    const d = await rd(p, '4212', C.num(n, 2), `Tasto PLU ${n}`);
    if (d && Number(d.slice(0, 2)) === n && /^\d{4}$/.test(d.slice(2, 6))) out[n] = Number(d.slice(2, 6));
  }
  c.pluKeys = Object.keys(out).length ? out : null;
}

const SEG = (tab) => `<div class="segment" style="margin-bottom:12px"><button data-seg="" class="${tab ? '' : 'on'}">PLU</button><button data-seg="tasti" class="${tab === 'tasti' ? 'on' : ''}">Tasti PLU diretti</button></div>`;
const bindSeg = (main) => $$('[data-seg]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/plu${b.dataset.seg ? `/${b.dataset.seg}` : ''}`; }));

export function plu(main, tab) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  if (tab === 'tasti') { pluKeys(main, p); return; }
  const c = cache();
  const P = (c.plu ||= {});
  const ui = (c.pluUi ||= { from: 1, to: 20 });
  const codes = Object.keys(P).map(Number).sort((a, b) => a - b);
  const dirty = codes.filter((n) => P[n].dirty);

  main.innerHTML = `
    ${mixedWarning(p)}
    ${SEG('')}
    <section class="card">
      <h2>PLU interni</h2>
      <p class="muted" style="font-size:.88rem">Fino a 1000 articoli richiamabili da tastiera o da codice a barre. Reparto 0 = PLU disattivato. Una «@» come ultimo carattere della descrizione indica un PLU da bilancia (prezzo 2 = tara).</p>
      <div class="form-grid">
        <label class="field"><span>Dal PLU</span><input type="number" id="from" min="1" max="1000" value="${ui.from}" inputmode="numeric"></label>
        <label class="field"><span>Al PLU</span><input type="number" id="to" min="1" max="1000" value="${ui.to}" inputmode="numeric"></label>
      </div>
      <div class="actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button></div>
    </section>
    <section class="card">
      ${codes.length ? `<input type="search" id="q" placeholder="Cerca per descrizione o codice a barre…">
      <div class="table-wrap"><table class="t"><thead><tr><th>PLU</th><th>Descrizione</th><th class="num">Prezzo</th><th>Rep.</th><th>Barcode</th></tr></thead><tbody>
      ${codes.map((n) => { const x = P[n]; return `<tr class="clickable ${x.dirty ? 'dirty' : ''}" data-plu="${n}" data-q="${esc(`${n} ${x.desc || ''} ${x.barcode || ''}`.toLowerCase())}">
        <td><b>${n}</b></td><td>${x.ok ? esc(x.desc) : '<span class="badge warn">formato?</span>'}</td><td class="num">${x.ok ? C.fmtEur(x.p1) : ''}</td><td>${x.ok ? x.dept : ''}</td><td class="mono">${esc(x.barcode || '')}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Leggi i PLU dalla stampante.</div>'}
    </section>
    <div class="sticky-actions"><button class="btn" id="btnWrite" ${dirty.length ? '' : 'disabled'}>Scrivi ${dirty.length || ''} modificati</button></div>`;

  bindSeg(main);
  $('#q', main)?.addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); $$('[data-plu]', main).forEach((tr) => { tr.hidden = q && !tr.dataset.q.includes(q); }); });
  $('#btnRead', main).onclick = () => {
    ui.from = Math.max(1, Math.min(1000, Number($('#from', main).value) || 1));
    ui.to = Math.max(ui.from, Math.min(1000, Number($('#to', main).value) || ui.from));
    task('Lettura PLU…', async (ctx) => {
      await call((pr) => loadPluRange(pr, P, ui.from, ui.to, (i, n, t) => { ctx.check(); ctx.progress(i, n, t); }, { keepDirty: false }));
      saveCache();
    }, { cancellable: true }).finally(() => { saveCache(); plu(main); });
  };
  $$('[data-plu]', main).forEach((tr) => tr.addEventListener('click', () => edit(Number(tr.dataset.plu))));
  $('#btnWrite', main).onclick = async () => {
    if (!await confirmBox('Scrivi PLU', `Programmare ${dirty.length} PLU (${dirty.join(', ')})?`, { okText: 'Scrivi' })) return;
    await task('Scrittura PLU…', async (ctx) => {
      const errors = [];
      for (let i = 0; i < dirty.length; i++) {
        const n = dirty[i]; const x = P[n];
        ctx.progress(i, dirty.length, `PLU ${n}…`);
        try {
          const data = encodePlu(n, x);
          await call((pr) => fp.directIO(pr, '4003', data, { label: `PLU ${n}` }));
          const back = await fp.directIO(p, '4203', C.num(n, 4), { label: `Verifica PLU ${n}` });
          if (trimR(back.data) !== trimR(data)) throw new Error('valore riletto diverso');
          P[n] = decodePlu(n, back.data);
        } catch (e) { errors.push(`PLU ${n}: ${e.message}`); }
      }
      saveCache();
      if (errors.length) toast(errors.join(' · '), 'error'); else toast('PLU scritti e verificati', 'ok');
    });
    plu(main);
  };

  function edit(n) {
    const x = P[n];
    if (!x.ok) { toast('Tracciato non riconosciuto: modifica disattivata', 'warn'); return; }
    openSheet(`
      <h2>PLU ${n}</h2>
      <form class="stack" id="pf">
        <label class="field"><span>Descrizione (max 20)</span><input type="text" name="desc" maxlength="20" value="${esc(x.desc)}" autocapitalize="characters"></label>
        <div class="form-grid">
          <label class="field"><span>Prezzo 1 €</span><input type="number" name="p1" step="0.01" min="0" value="${x.p1}" inputmode="decimal"></label>
          <label class="field"><span>Prezzo 2 € (o tara)</span><input type="number" name="p2" step="0.01" min="0" value="${x.p2}" inputmode="decimal"></label>
          <label class="field"><span>Prezzo 3 €</span><input type="number" name="p3" step="0.01" min="0" value="${x.p3}" inputmode="decimal"></label>
          <label class="field"><span>Reparto (0 = disattivato)</span><input type="number" name="dept" min="0" max="99" value="${x.dept}" inputmode="numeric"></label>
        </div>
        ${x.bw ? `<label class="field"><span>Codice a barre</span><input type="text" name="barcode" maxlength="${x.bw}" value="${esc(x.barcode)}" inputmode="numeric"></label>` : ''}
        <div class="actions"><button class="btn" type="submit">Applica</button><button class="btn ghost" type="button" data-close>Annulla</button></div>
      </form>`, {
      onMount(sh, close) {
        sh.querySelector('[data-close]').onclick = close;
        const f = sh.querySelector('#pf');
        f.onsubmit = (e) => {
          e.preventDefault();
          const nv = { ...x, desc: C.toPrinterText(f.desc.value).slice(0, 20), p1: Number(f.p1.value || 0), p2: Number(f.p2.value || 0), p3: Number(f.p3.value || 0), dept: Number(f.dept.value || 0), barcode: f.barcode ? f.barcode.value.trim() : x.barcode };
          if (![nv.p1, nv.p2, nv.p3].every((v) => v >= 0 && v <= 9999999.99) || !(nv.dept >= 0 && nv.dept <= 99)) { toast('Valori non validi', 'warn'); return; }
          if (['desc', 'p1', 'p2', 'p3', 'dept', 'barcode'].some((k) => nv[k] !== x[k])) { P[n] = { ...nv, dirty: true }; saveCache(); }
          close(); plu(main);
        };
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Tasti PLU diretti (4212 / 4012): tasto (2) + PLU interno (4). Le funzioni tastiera «PLU n» richiamano il tasto n.
// ---------------------------------------------------------------------------
function pluKeys(main, p) {
  const c = cache();
  const K = c.pluKeys;
  const P = c.plu || {};
  const rerender = () => plu(main, 'tasti');
  main.innerHTML = `
    ${mixedWarning(p)}
    ${SEG('tasti')}
    <section class="card">
      <h2>Tasti PLU diretti</h2>
      <p class="muted" style="font-size:.88rem">I 70 tasti PLU diretti (funzioni «PLU 1–70» della tastiera) richiamano un PLU interno da 1 a 1000.</p>
      ${!K ? '<div class="empty">Leggi dalla stampante.</div>' : `
      <div class="table-wrap"><table class="t"><thead><tr><th>Tasto</th><th>PLU interno</th><th>Descrizione</th></tr></thead><tbody>
        ${Object.keys(K).map(Number).sort((a, b) => a - b).map((n) => `<tr><td><b>PLU ${n}</b></td>
          <td><input type="number" min="1" max="1000" data-k="${n}" value="${K[n]}" inputmode="numeric" style="max-width:110px"></td>
          <td class="muted">${esc(P[K[n]]?.desc || '')}</td></tr>`).join('')}
      </tbody></table></div>`}
    </section>
    <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${K ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
  bindSeg(main);
  $$('[data-k]', main).forEach((i) => i.addEventListener('input', () => i.classList.toggle('changed', Number(i.value) !== K[i.dataset.k])));
  $('#btnRead', main).onclick = () => task('Lettura tasti PLU…', async (ctx) => {
    await call((pr) => loadPluKeys(pr, c, (i, n, t) => { ctx.check(); ctx.progress(i, n, t); }));
    if (!c.pluKeys) toast('Questo modello o firmware non gestisce i tasti PLU diretti', 'warn');
    saveCache(); rerender();
  }, { cancellable: true });
  $('#btnWrite', main).onclick = async () => {
    const items = [];
    for (const i of $$('[data-k]', main)) {
      const n = Number(i.dataset.k); const v = Number(i.value);
      if (v === K[n]) continue;
      if (!(Number.isInteger(v) && v >= 1 && v <= 1000)) { toast(`Tasto PLU ${n}: PLU da 1 a 1000`, 'warn'); return; }
      const data = C.num(n, 2) + C.num(v, 4);
      items.push([`Tasto PLU ${n} → PLU ${v}`, '4012', data, '4212', C.num(n, 2), (b) => b.slice(0, 6) === data]);
    }
    await writeItems(p, items, rerender, async () => {
      for (const [, , data] of items) K[Number(data.slice(0, 2))] = Number(data.slice(2));
    });
  };
}
