// IVA, nature e ATECO: IVA calendarizzate (4255/4055), IVA storiche (9212/9012), nature 15–18 (9204/9004),
// codici ATECO (4237/4037). Tracciati verificati in lettura su FP-81 II RT; ogni scrittura viene riletta.

import { $, $$, esc, toast, task, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as C from '../commands.js';
import { rd, writeItems, trimR, noPrinter, isoDate, fromIso, fmtDate } from './prog.js';

const TABS = [['cal', 'IVA calendarizzate'], ['hist', 'IVA storiche'], ['nat', 'Nature'], ['ateco', 'ATECO']];

export function iva(main, tab = 'cal') {
  main = fresh(main);
  if (noPrinter(main)) return;
  const p = current();
  if (!TABS.some(([k]) => k === tab)) tab = 'cal';
  const X = (cache().iva ||= {});
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="body"></div>`;
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/iva/${b.dataset.tab}`; }));
  VIEWS[tab](p, X, $('#body', main), () => iva(main, tab));
}

// ---------------------------------------------------------------------------
// IVA calendarizzate: GGMMAA (6) + ventilazione (1) + 9 aliquote (4 cifre, centesimi) = 43 caratteri
// ---------------------------------------------------------------------------
export function parseDeferredVat(raw) {
  const r = String(raw ?? '');
  if (!/^\d{43}/.test(r)) return null;
  return { raw: r.slice(0, 43), date: r.slice(0, 6), vent: r[6] === '1', rates: Array.from({ length: 9 }, (_, i) => Number(r.slice(7 + i * 4, 11 + i * 4)) / 100), empty: /^0{43}/.test(r) };
}
export const encodeDeferredVat = (date, vent, rates) => date + (vent ? '1' : '0') + rates.map((v) => C.num(Math.round(v * 100), 4)).join('');

// IVA storiche: indice (1) + GGMMAAAA (8) + modalità reparti (0/R) + multiplo (0-9)
export function parseHistVat(raw) {
  const m = /^([1-4])(\d{8})([0R])(\d)/.exec(String(raw ?? ''));
  return m ? { i: Number(m[1]), date: m[2], mode: m[3], mult: Number(m[4]), empty: /^0000/.test(m[2]), raw: m[0] } : null;
}

// Nature: lettura NN + "*" + simbolo (2) + " = " + descrizione (40) + codice AdE (5); vuota = spazi.
// Scrittura (9004): NN + simbolo (2) + descrizione (40) + codice AdE (5).
export function parseNature(n, raw) {
  const r = String(raw ?? '');
  if (r.length < 2 || Number(r.slice(0, 2)) !== n) return null;
  const rest = r.slice(2);
  if (!rest.trim()) return { n, empty: true, sym: '', desc: '', tx: '' };
  if (rest[0] === '*' && rest.slice(3, 6) === ' = ' && rest.length >= 51) return { n, sym: trimR(rest.slice(1, 3)), desc: trimR(rest.slice(6, 46)), tx: trimR(rest.slice(46, 51)) };
  return { n, unknown: true, raw: r };
}
export const encodeNature = (n, sym, desc, tx) => C.num(n, 2) + C.txt(sym, 2) + C.txt(desc, 40) + C.txt(tx, 5);
const NATURE_CODES = /^N(1|2(\.[12])?|3(\.[1-6])?|4|5|6(\.[1-9])?|7)$/;

// ATECO: NN + codice (6) + ventilazione (1) + modalità colonna IVA (1) + riserva (11) = 21 caratteri
export function parseAteco(i, raw) {
  const r = String(raw ?? '');
  if (r.length !== 21 || Number(r.slice(0, 2)) !== i || !/^[01]$/.test(r[8])) return null;
  return { i, raw: r, code: /^0{6}$/.test(r.slice(2, 8)) ? '' : r.slice(2, 8), vent: r[8] === '1' };
}

/** IVA calendarizzate (4255); con withVat rilegge anche le aliquote attuali (4205), usate per confronto e precompilazione. */
export async function loadCal(p, X, { withVat = true } = {}) {
  if (withVat) {
    const now = {};
    for (let g = 1; g <= 9; g++) {
      const d = C.decodeVat(g, String(await rd(p, '4205', C.num(g, 2), `IVA ${g}`) ?? ''));
      if (d.ok) now[g] = d.rate;
    }
    if (Object.keys(now).length === 9) { const c = cache(); c.vat = now; c.vatReadAt = Date.now(); }
  }
  X.cal = parseDeferredVat(await rd(p, '4255', '', 'IVA calendarizzate'));
}
export async function loadHist(p, X) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const h = parseHistVat(await rd(p, '9212', String(i), `IVA storica ${i}`));
    if (h && h.i === i) out.push(h);
  }
  X.hist = out;
}
export async function loadNat(p, X) {
  const out = [];
  for (const n of [0, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
    const x = parseNature(n, await rd(p, '9204', C.num(n, 2), `Natura ${n}`));
    if (x) out.push(x);
  }
  X.nat = out;
}
export async function loadAteco(p, X) {
  const out = [];
  for (const i of [1, 2, 3]) {
    const a = parseAteco(i, await rd(p, '4237', C.num(i, 2), `ATECO ${i}`));
    if (a) out.push(a);
  }
  X.ateco = out;
}

const VIEWS = {
  cal(p, X, body, rerender) {
    const v = X.cal;
    const cur = cache().vat || {};
    body.innerHTML = `
      <section class="card">
        <h2>IVA calendarizzate</h2>
        <p class="muted" style="font-size:.88rem">Nuove aliquote dei gruppi IVA 1–9 che la stampante applica da sola dalla data indicata (ad esempio per un cambio di aliquota per legge). La nuova tabella sostituisce tutti i 9 gruppi: i campi partono dalle aliquote attuali.</p>
        ${v === undefined ? '<div class="empty">Leggi dalla stampante.</div>' : v === null ? '<div class="notice warn">Questo modello o firmware non supporta la programmazione calendarizzata.</div>' : `
        <p><b>${v.empty ? 'Nessuna programmazione calendarizzata.' : `Programmate dal ${esc(fmtDate(v.date) || '—')}${v.vent ? ', con ventilazione' : ''}.`}</b></p>
        <div class="form-grid">
          <label class="field"><span>Data di entrata in vigore</span><input type="date" id="date" value="${isoDate(v.date)}"></label>
        </div>
        <label class="check"><input type="checkbox" id="vent" ${v.vent ? 'checked' : ''}> Ventilazione IVA</label>
        <div class="table-wrap"><table class="t"><thead><tr><th>Gruppo</th><th>Nuova aliquota %</th><th>Attuale</th></tr></thead><tbody>
          ${v.rates.map((r, i) => `<tr><td><b>${i + 1}</b></td><td><input type="number" id="r${i + 1}" min="0" max="99.99" step="0.01" inputmode="decimal" value="${v.empty ? (cur[i + 1] ?? '') : r}" style="max-width:120px"></td>
            <td class="muted">${cur[i + 1] != null ? `${C.fmtPerc(cur[i + 1])}%` : '—'}</td></tr>`).join('')}
        </tbody></table></div>`}
      </section>
      <div class="sticky-actions">
        <button class="btn secondary" id="btnRead">Leggi dalla stampante</button>
        <button class="btn" id="btnWrite" ${v ? '' : 'disabled'}>Scrivi</button>
      </div>
      ${v && !v.empty ? '<div class="actions"><button class="btn ghost" id="btnClear">Annulla la programmazione</button></div>' : ''}`;

    $('#btnRead', body).onclick = () => task('Lettura IVA calendarizzate…', async () => {
      await call((pr) => loadCal(pr, X));
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const date = fromIso($('#date', body).value);
      if (!date) { toast('Indica la data di entrata in vigore', 'warn'); return; }
      const d = new Date($('#date', body).value); const today = new Date(); today.setHours(0, 0, 0, 0);
      if (!(d > today)) { toast('La data deve essere successiva a oggi', 'warn'); return; }
      const rates = [];
      for (let i = 1; i <= 9; i++) {
        const t = $(`#r${i}`, body).value;
        if (t === '') { toast(`Indica l'aliquota del gruppo ${i}: la nuova tabella sostituisce tutti i 9 gruppi`, 'warn'); return; }
        const r = Number(t);
        if (!(r >= 0 && r <= 99.99)) { toast(`Aliquota del gruppo ${i} non valida`, 'warn'); return; }
        rates.push(r);
      }
      const data = encodeDeferredVat(date, $('#vent', body).checked, rates);
      if (data === X.cal.raw) { toast('Nessuna modifica da scrivere'); return; }
      await writeItems(p, [[`IVA calendarizzate dal ${fmtDate(date)}`, '4055', data, '4255', '', (b) => b.slice(0, 43) === data]], rerender,
        async () => { X.cal = parseDeferredVat(await rd(p, '4255', '')); },
        { confirmText: `Dal ${fmtDate(date)}: ${rates.map((r, i) => `gruppo ${i + 1} ${r}%`).join(', ')}.` });
    };
    $('#btnClear', body)?.addEventListener('click', async () => {
      const data = '0'.repeat(43);
      await writeItems(p, [['Annulla IVA calendarizzate', '4055', data, '4255', '', (b) => b.slice(0, 43) === data]], rerender,
        async () => { X.cal = parseDeferredVat(await rd(p, '4255', '')); });
    });
  },

  hist(p, X, body, rerender) {
    const H = X.hist;
    body.innerHTML = `
      <section class="card">
        <h2>IVA storiche</h2>
        <p class="muted" style="font-size:.88rem">Servono ai resi e agli annulli automatici quando il documento di riferimento è stato emesso con un'aliquota poi cambiata per legge: per i documenti fino alla data di fine validità la stampante usa i reparti spostati (modalità predefinita: +20, +30, +40, +50, +60; personalizzata: multiplo indicato).</p>
        ${H === undefined ? '<div class="empty">Leggi dalla stampante.</div>' : !H.length ? '<div class="notice warn">Questo modello o firmware non supporta le IVA storiche.</div>' : `
        <div class="table-wrap"><table class="t"><thead><tr><th>N.</th><th>Fine validità</th><th>Reparti</th><th>Multiplo</th></tr></thead><tbody>
          ${H.map((h) => `<tr><td><b>${h.i}</b></td>
            <td><input type="date" id="hd${h.i}" value="${h.empty ? '' : isoDate(h.date)}"></td>
            <td><select id="hm${h.i}"><option value="0" ${h.mode === '0' ? 'selected' : ''}>Predefinita</option><option value="R" ${h.mode === 'R' ? 'selected' : ''}>Personalizzata</option></select></td>
            <td><input type="number" id="hx${h.i}" min="0" max="9" value="${h.mult}" inputmode="numeric" style="max-width:70px"></td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted" style="font-size:.85rem">Lascia la data vuota per non usare una riga.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${H?.length ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    $('#btnRead', body).onclick = () => task('Lettura IVA storiche…', async () => { await call((pr) => loadHist(pr, X)); saveCache(); rerender(); });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (const h of X.hist) {
        const iso = $(`#hd${h.i}`, body).value;
        const date = iso ? fromIso(iso, true) : '00002000';
        const mode = $(`#hm${h.i}`, body).value;
        const mult = Number($(`#hx${h.i}`, body).value || 0);
        if (!(mult >= 0 && mult <= 9)) { toast(`Riga ${h.i}: multiplo da 0 a 9`, 'warn'); return; }
        const data = `${h.i}${date}${mode}${mult}`;
        if (data !== h.raw) items.push([iso ? `IVA storica ${h.i}: fino al ${fmtDate(date)}` : `IVA storica ${h.i}: non usata`, '9012', data, '9212', String(h.i), (b) => b.slice(0, 11) === data]);
      }
      await writeItems(p, items, rerender, () => loadHist(p, X));
    };
  },

  nat(p, X, body, rerender) {
    const N = X.nat;
    body.innerHTML = `
      <section class="card">
        <h2>Nature IVA</h2>
        <div class="notice warn">Le nature 15–18 vanno programmate <b>solo</b> se pubblicate ufficialmente dall'Agenzia delle Entrate: un codice non ufficiale fa scartare per intero i corrispettivi giornalieri.</div>
        ${!N ? '<div class="empty">Leggi dalla stampante.</div>' : `
        <div class="table-wrap"><table class="t"><thead><tr><th>N.</th><th>Simbolo</th><th>Descrizione</th><th>Codice AdE</th></tr></thead><tbody>
          ${N.map((x) => (x.n >= 15 && !x.unknown ? `<tr><td><b>${x.n}</b></td>
            <td><input type="text" id="ns${x.n}" maxlength="2" value="${esc(x.sym)}" autocapitalize="characters" style="max-width:60px"></td>
            <td><input type="text" id="nd${x.n}" maxlength="40" value="${esc(x.desc)}"></td>
            <td><input type="text" id="nt${x.n}" maxlength="5" value="${esc(x.tx)}" autocapitalize="characters" style="max-width:90px" placeholder="es. N2.1"></td></tr>`
    : `<tr><td><b>${x.n}</b></td><td class="mono">${esc(x.sym || '')}</td><td>${x.unknown ? `<span class="muted">formato non riconosciuto</span>` : esc(x.desc || '—')}</td><td class="mono">${esc(x.tx || '')}</td></tr>`)).join('')}
        </tbody></table></div>
        <p class="muted" style="font-size:.85rem">Le nature 0 e 10–14 sono fisse. Simbolo: 2 caratteri stampati sul documento (es. NS); codice AdE: natura del file dei corrispettivi (N1, N2.1, N2.2, N3.1–N3.6, N4, N5, N6.1–N6.9, N7). Svuota i tre campi per cancellare una natura.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${N ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    $('#btnRead', body).onclick = () => task('Lettura nature…', async () => { await call((pr) => loadNat(pr, X)); saveCache(); rerender(); });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (const x of X.nat.filter((y) => y.n >= 15 && !y.unknown)) {
        const sym = C.toPrinterText($(`#ns${x.n}`, body).value).toUpperCase().trim();
        const desc = C.toPrinterText($(`#nd${x.n}`, body).value).trim();
        const tx = $(`#nt${x.n}`, body).value.toUpperCase().trim();
        if (sym === x.sym && desc === x.desc && tx === x.tx) continue;
        const clear = !sym && !desc && !tx;
        if (!clear) {
          if (sym.length !== 2) { toast(`Natura ${x.n}: il simbolo deve avere 2 caratteri`, 'warn'); return; }
          if (!desc) { toast(`Natura ${x.n}: manca la descrizione`, 'warn'); return; }
          if (!NATURE_CODES.test(tx)) { toast(`Natura ${x.n}: codice AdE non valido (es. N2.1)`, 'warn'); return; }
        }
        const data = encodeNature(x.n, sym, desc, tx);
        items.push([clear ? `Cancella natura ${x.n}` : `Natura ${x.n}: ${sym} ${desc} (${tx})`, '9004', data, '9204', C.num(x.n, 2), (b) => {
          const r = parseNature(x.n, b);
          return !!r && !r.unknown && (clear ? !!r.empty : r.sym === sym && r.desc === desc && r.tx === tx);
        }]);
      }
      await writeItems(p, items, rerender, () => loadNat(p, X), { confirmText: 'Programma solo nature pubblicate ufficialmente dall\'Agenzia delle Entrate.' });
    };
  },

  ateco(p, X, body, rerender) {
    const A = X.ateco;
    body.innerHTML = `
      <section class="card">
        <h2>Codici ATECO</h2>
        <p class="muted" style="font-size:.88rem">Fino a tre codici attività (due sul Server RT). In <a href="#/depts">Reparti</a> ogni reparto indica quale codice usare; la ventilazione IVA si attiva per codice.</p>
        ${!A ? '<div class="empty">Leggi dalla stampante.</div>' : !A.length ? '<div class="notice warn">Lettura non supportata da questo modello o firmware.</div>' : `
        <div class="table-wrap"><table class="t"><thead><tr><th>N.</th><th>Codice ATECO</th><th>Ventilazione</th></tr></thead><tbody>
          ${A.map((a) => `<tr><td><b>${a.i}</b></td>
            <td><input type="text" id="ac${a.i}" maxlength="8" inputmode="numeric" value="${esc(a.code)}" placeholder="es. 471110" style="max-width:140px"></td>
            <td><label class="check" style="padding:0"><input type="checkbox" id="av${a.i}" ${a.vent ? 'checked' : ''}> sì</label></td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted" style="font-size:.85rem">Inserisci le 6 cifre senza punti (47.11.10 → 471110). Vuoto = codice non usato.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${A?.length ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    $('#btnRead', body).onclick = () => task('Lettura ATECO…', async () => { await call((pr) => loadAteco(pr, X)); saveCache(); rerender(); });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (const a of X.ateco) {
        const code = $(`#ac${a.i}`, body).value.replace(/\D/g, '');
        if (code && code.length !== 6) { toast(`ATECO ${a.i}: servono 6 cifre`, 'warn'); return; }
        const vent = $(`#av${a.i}`, body).checked;
        const data = C.num(a.i, 2) + (code || '000000') + (vent ? '1' : '0') + a.raw.slice(9);
        if (data !== a.raw) items.push([`ATECO ${a.i}: ${code || 'non usato'}${vent ? ' (ventilazione)' : ''}`, '4037', data, '4237', C.num(a.i, 2), (b) => b === data]);
      }
      await writeItems(p, items, rerender, () => loadAteco(p, X));
    };
  },
};
