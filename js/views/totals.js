// Letture dei totalizzatori giornalieri (2050) e periodici (2051) e dei grand totali (2051/2052).
// Risposta 2050/2051: indice (2) + sotto-indice (2) + valore A (segno + 9 cifre) + valore B (segno + 9 cifre).

import { $, $$, esc, toast, task, saveFile, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

// tipi dei valori: q = quantità (3 decimali), e = euro (centesimi), n = numero, - = non significativo
const OTHERS = [
  [24, 'Documenti commerciali', '-', 'n'], [36, 'Documenti di reso', '-', 'e'], [37, 'Documenti di annullo', '-', 'e'],
  [26, 'Documenti gestionali', '-', 'n'], [13, 'Contanti', 'n', 'e'], [10, 'Entrate contante', 'n', 'e'], [11, 'Uscite contante', 'n', 'e'],
  [17, 'Assegni', 'n', 'e'], [15, 'Entrate assegni', 'n', 'e'], [16, 'Uscite assegni', 'n', 'e'],
  [3, 'Storni', 'n', 'e'], [4, 'Correzioni', 'n', 'e'], [5, 'Annulli globali', 'n', 'e'],
  [6, 'Sconti a valore', 'n', 'e'], [7, 'Sconti %', 'n', 'e'], [8, 'Maggiorazioni %', 'n', 'e'], [30, 'Maggiorazioni a valore', 'n', 'e'],
  [73, 'Non riscossi beni e servizi', 'n', 'e'], [74, 'Non riscossi solo beni', 'n', 'e'], [75, 'Non riscossi solo servizi', 'n', 'e'],
  [76, 'Non riscossi fatture su documento', 'n', 'e'], [77, 'Non riscossi fatture dirette', 'n', 'e'], [78, 'Non riscossi SSN farmacie', 'n', 'e'],
  [79, 'Sconti a pagare generici', 'n', 'e'], [80, 'Sconti a pagare multiuso', 'n', 'e'],
  [81, 'Arrotondamenti per difetto', 'n', 'e'], [82, 'Arrotondamenti per eccesso', 'n', 'e'],
  [21, 'Aperture cassetto', '-', 'n'],
  [27, 'Chiusure giornaliere (solo giornaliero)', '-', 'n'], [28, 'Totale giorno (solo giornaliero)', '-', 'e'],
];
const DEPT_IDX = [[1, 'Vendite'], [86, 'Resi'], [87, 'Annulli'], [70, 'Acconti'], [71, 'Omaggi'], [72, 'Buoni monouso']];
const VAT_IDX = [[20, 'Vendite'], [41, 'Resi'], [42, 'Annulli'], [43, 'Netti']];

export function parseTot(data) {
  const m = String(data).match(/^(\d{2})(\d{2})([+-])(\d{9})([+-])(\d{9})/);
  if (!m) return null;
  return { idx: Number(m[1]), sub: Number(m[2]), a: Number(m[3] + m[4]), b: Number(m[5] + m[6]) };
}
const fmt = (v, t) => (t === 'q' ? (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })
  : t === 'e' ? C.fmtEur(v / 100) : t === 'n' ? String(v) : '');
const eurRaw = (s) => C.fmtEur(Number(s) / 100);

export function totals(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const st = (c.totUi ||= { period: 'day', tab: 'gt', from: 1, to: 10 });
  const res = c.totRes || {};
  const cmd = st.period === 'day' ? '2050' : '2051';

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <div class="segment" id="period">
        <button data-period="day" class="${st.period === 'day' ? 'on' : ''}">Giornalieri</button>
        <button data-period="hist" class="${st.period === 'hist' ? 'on' : ''}">Periodici (storici)</button>
      </div>
      <div class="segment" id="tab" style="margin-top:.6rem">
        ${[['gt', 'Grand totali'], ['dept', 'Reparti'], ['vat', 'IVA'], ['other', 'Pagamenti e altri']].map(([k, t]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t}</button>`).join('')}
      </div>
      ${st.tab === 'dept' ? `<div class="form-grid" style="margin-top:.6rem">
        <label class="field"><span>Dal reparto</span><input type="number" id="from" min="1" max="99" value="${st.from}" inputmode="numeric"></label>
        <label class="field"><span>Al reparto</span><input type="number" id="to" min="1" max="99" value="${st.to}" inputmode="numeric"></label></div>` : ''}
      <div class="actions"><button class="btn" id="btnRead">Leggi dalla stampante</button>${res[key(st)] ? '<button class="btn secondary" id="btnSave">Salva sul telefono</button>' : ''}</div>
    </section>
    <section class="card" id="out">${render(st, res[key(st)])}</section>`;

  $$('[data-period]', main).forEach((b) => b.addEventListener('click', () => { st.period = b.dataset.period; saveCache(); totals(main); }));
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; saveCache(); totals(main); }));
  main.addEventListener('change', () => {
    st.from = Math.max(1, Math.min(99, Number($('#from', main)?.value) || st.from));
    st.to = Math.max(st.from, Math.min(99, Number($('#to', main)?.value) || st.to));
  });

  const read = async (ctx, idx, sub, label) => {
    const r = await fp.directIO(p, cmd, C.num(idx, 2) + C.num(sub, 2), { allowFail: true, label: `${label} (${cmd})` });
    return r.response.success ? parseTot(r.data) : null;
  };

  $('#btnRead', main).onclick = () => task('Lettura totalizzatori…', async (ctx) => {
    const out = { at: Date.now(), period: st.period, rows: [] };
    if (st.tab === 'gt') {
      const r = await call((pr) => fp.directIO(pr, '2052', '', { allowFail: true, label: 'Grand totale (2052)' }));
      const m = String(r.data).match(/^(\d{14})(\d{4})/);
      if (m) out.rows.push(['Grand totale vendite', eurRaw(m[1])], ['Numero azzeramenti (chiusure)', String(Number(m[2]))]);
      for (const [i, t] of [[38, 'Grand totale resi'], [39, 'Grand totale annulli']]) {
        ctx.check();
        const g = await fp.directIO(p, '2051', C.num(i, 2) + '00', { allowFail: true, label: t });
        const mm = String(g.data).match(/^(\d{14})(\d{14})/);
        if (g.response.success && mm) out.rows.push([t, eurRaw(mm[2])]);
      }
    } else if (st.tab === 'dept') {
      const n = st.to - st.from + 1;
      for (let d = st.from; d <= st.to; d++) {
        const row = { dept: d, v: {} };
        for (const [i, t] of DEPT_IDX) {
          ctx.check(); ctx.progress(d - st.from, n, `Reparto ${d}: ${t}…`);
          const v = await call(() => read(ctx, i, d, `Reparto ${d} ${t}`));
          if (v) row.v[i] = v;
        }
        out.rows.push(row);
      }
    } else if (st.tab === 'vat') {
      for (let g = 1; g <= 9; g++) {
        const row = { g, v: {} };
        for (const [i, t] of VAT_IDX) {
          ctx.check(); ctx.progress(g - 1, 9, `IVA ${g}: ${t}…`);
          const v = await call(() => read(ctx, i, g, `IVA ${g} ${t}`));
          if (v) row.v[i] = v;
        }
        out.rows.push(row);
      }
    } else {
      const list = [...OTHERS.map(([i, t, a, b]) => [i, 0, t, a, b]),
        ...Array.from({ length: 10 }, (_, k) => [18, k + 1, `Carta di credito ${k + 1}`, 'n', 'e']),
        ...Array.from({ length: 10 }, (_, k) => [19, k + 1, `Ticket ${k + 1}`, 'n', 'e']),
        ...Array.from({ length: 12 }, (_, k) => [45, k + 1, `Operatore ${k + 1}`, 'n', 'e'])];
      for (let k = 0; k < list.length; k++) {
        const [i, sub, t, ta, tb] = list[k];
        if (st.period === 'hist' && (i === 27 || i === 28)) continue;
        ctx.check(); ctx.progress(k, list.length, `${t}…`);
        const v = await call(() => read(ctx, i, sub, t));
        if (v && (v.a || v.b || sub === 0)) out.rows.push({ label: t, ta, tb, v });
      }
    }
    (c.totRes ||= {})[key(st)] = out;
    saveCache();
    totals(main);
  }, { cancellable: true });

  $('#btnSave', main)?.addEventListener('click', () => {
    const r = res[key(st)];
    const lines = csv(st, r);
    saveFile(`Totalizzatori_${st.tab}_${st.period === 'day' ? 'giornalieri' : 'periodici'}_${new Date(r.at).toISOString().slice(0, 10)}.csv`, lines, 'text/csv');
  });
}

const key = (st) => `${st.tab}-${st.period}`;

function render(st, r) {
  if (!r) return '<div class="empty">Premi «Leggi dalla stampante».</div>';
  const when = `<p class="muted" style="font-size:.82rem">Letti il ${esc(new Date(r.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))} · ${st.period === 'day' ? 'giornalieri (dall\'ultima chiusura)' : 'periodici (storici)'}</p>`;
  if (st.tab === 'gt') return `${when}<dl class="kv">${r.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if (st.tab === 'dept') {
    return `${when}<div class="table-wrap"><table class="t"><thead><tr><th>Rep.</th>${DEPT_IDX.map(([, t]) => `<th class="num">${t}</th>`).join('')}</tr></thead><tbody>
      ${r.rows.map((row) => `<tr><td><b>${row.dept}</b></td>${DEPT_IDX.map(([i]) => {
        const v = row.v[i];
        return `<td class="num">${v ? `${fmt(v.b, 'e')}${v.a ? `<br><small class="muted">${fmt(v.a, 'q')} pz</small>` : ''}` : '—'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  if (st.tab === 'vat') {
    return `${when}<div class="table-wrap"><table class="t"><thead><tr><th>IVA</th>${VAT_IDX.map(([, t]) => `<th class="num">${t}<br><small>imponibile / imposta</small></th>`).join('')}</tr></thead><tbody>
      ${r.rows.map((row) => `<tr><td><b>${row.g}</b></td>${VAT_IDX.map(([i]) => {
        const v = row.v[i];
        return `<td class="num">${v ? `${fmt(v.a, 'e')}<br><small class="muted">${fmt(v.b, 'e')}</small>` : '—'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return `${when}<div class="table-wrap"><table class="t"><thead><tr><th>Totalizzatore</th><th class="num">Operazioni</th><th class="num">Importo / valore</th></tr></thead><tbody>
    ${r.rows.map(({ label, ta, tb, v }) => `<tr><td>${esc(label)}</td><td class="num">${ta === '-' ? '' : fmt(v.a, ta)}</td><td class="num">${fmt(v.b, tb)}</td></tr>`).join('')}
    </tbody></table></div><p class="muted" style="font-size:.8rem">Sono mostrati carte, ticket e operatori con valori diversi da zero.</p>`;
}

function csv(st, r) {
  const rows = [];
  if (st.tab === 'gt') r.rows.forEach(([k, v]) => rows.push([k, v]));
  else if (st.tab === 'dept') {
    rows.push(['Reparto', ...DEPT_IDX.flatMap(([, t]) => [`${t} pezzi`, `${t} importo`])]);
    r.rows.forEach((row) => rows.push([row.dept, ...DEPT_IDX.flatMap(([i]) => (row.v[i] ? [fmt(row.v[i].a, 'q'), fmt(row.v[i].b, 'e')] : ['', '']))]));
  } else if (st.tab === 'vat') {
    rows.push(['Gruppo IVA', ...VAT_IDX.flatMap(([, t]) => [`${t} imponibile`, `${t} imposta`])]);
    r.rows.forEach((row) => rows.push([row.g, ...VAT_IDX.flatMap(([i]) => (row.v[i] ? [fmt(row.v[i].a, 'e'), fmt(row.v[i].b, 'e')] : ['', '']))]));
  } else {
    rows.push(['Totalizzatore', 'Operazioni', 'Importo']);
    r.rows.forEach(({ label, ta, tb, v }) => rows.push([label, ta === '-' ? '' : fmt(v.a, ta), fmt(v.b, tb)]));
  }
  return rows.map((r2) => r2.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
