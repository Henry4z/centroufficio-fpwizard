// Altre impostazioni: fatture, contanti, chiusura automatica, lotteria (messaggi e data della lotteria istantanea).
// Ogni scrittura usa lo stesso tracciato restituito dalla lettura e viene verificata rileggendo il valore.

import { $, $$, esc, toast, confirmBox, task, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as C from '../commands.js';
import { rd, writeItems, trimR, isoDate, fromIso, fmtDate } from './prog.js';

const TABS = [['inv', 'Fatture'], ['cash', 'Contanti'], ['autoz', 'Chiusura automatica'], ['lot', 'Lotteria']];

export function extras(main, tab = 'inv') {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  if (tab === 'info') { location.replace('#/net/lan'); return; }
  if (!TABS.some(([k]) => k === tab)) tab = 'inv';
  const c = cache();
  const X = (c.extras ||= {});
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="body"></div>`;
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/extras/${b.dataset.tab}`; }));
  const body = $('#body', main);
  const rerender = () => extras(main, tab);
  VIEWS[tab](p, X, body, rerender);
}

// ---------------------------------------------------------------------------

const VIEWS = {
  // ----- Fatture: 4225/4025 (34 car.) e messaggi di cortesia 4227/4027 -----
  inv(p, X, body, rerender) {
    const v = X.inv;
    const f = v?.fields;
    body.innerHTML = `
      <section class="card">
        <h2>Parametri fattura</h2>
        ${!v ? '<div class="empty">Leggi i parametri dalla stampante.</div>' : !f ? `<div class="notice warn">Tracciato non riconosciuto («${esc(v.raw)}»): modifica disattivata.</div>` : `
        <div class="form-grid">
          <label class="field"><span>Prossimo numero fattura</span><input type="number" id="num" min="0" max="9999" value="${f.num}" ${v.numLocked ? 'disabled' : ''} inputmode="numeric"></label>
          <label class="field"><span>Righe modulo</span><input type="number" id="lines" min="0" max="99" value="${f.lines}" inputmode="numeric"></label>
          <label class="field"><span>Righe di inizio</span><input type="number" id="start" min="0" max="99" value="${f.start}" inputmode="numeric"></label>
          <label class="field"><span>Testo esente IVA (14)</span><input type="text" id="tax" maxlength="14" value="${esc(f.tax)}" autocapitalize="characters"></label>
          <label class="field"><span>Prefisso / suffisso numero (10)</span><input type="text" id="pref" maxlength="10" value="${esc(f.pref)}" autocapitalize="characters"></label>
          <label class="field"><span>Posizione prefisso</span><select id="pos"><option value="0" ${f.pos === '0' ? 'selected' : ''}>Prefisso</option><option value="1" ${f.pos === '1' ? 'selected' : ''}>Suffisso</option></select></label>
        </div>
        <label class="check"><input type="checkbox" id="hdr" ${f.hdr === '1' ? 'checked' : ''}> Stampa l'intestazione dell'esercente sulle fatture</label>
        ${v.numLocked ? '<p class="muted" style="font-size:.85rem">Il numero fattura attuale supera 9999: non si può programmare con questo comando.</p>' : ''}`}
      </section>
      <section class="card">
        <h2>Messaggi di cortesia (coda fattura)</h2>
        ${[1, 2].map((n) => `<label class="field" style="margin-bottom:.5rem"><span>Riga ${n}</span><input type="text" id="tr${n}" maxlength="${X.trail?.[n]?.width || 35}" value="${esc(X.trail?.[n]?.text ?? '')}" ${X.trail?.[n] ? '' : 'disabled'} autocapitalize="characters"></label>`).join('')}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${v || X.trail ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    $('#btnRead', body).onclick = () => task('Lettura parametri fattura…', async () => {
      await call((pr) => loadInvoice(pr, X));
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      if (X.inv?.fields) {
        const nf = {
          num: X.inv.numLocked ? null : Number($('#num', body).value), lines: Number($('#lines', body).value), start: Number($('#start', body).value),
          hdr: $('#hdr', body).checked ? '1' : '0', tax: C.toPrinterText($('#tax', body).value), pref: C.toPrinterText($('#pref', body).value), pos: $('#pos', body).value,
        };
        if (!X.inv.numLocked && !(nf.num >= 0 && nf.num <= 9999)) { toast('Numero fattura non valido', 'warn'); return; }
        if (!(nf.lines >= 0 && nf.lines <= 99 && nf.start >= 0 && nf.start <= 99)) { toast('Righe non valide', 'warn'); return; }
        const data = encodeInvoice(X.inv, nf);
        if (data !== X.inv.raw) items.push(['Parametri fattura', '4025', data, '4225', '', (back) => back === data]);
      }
      for (const n of [1, 2]) {
        const t = X.trail?.[n];
        if (!t) continue;
        const nt = C.toPrinterText($(`#tr${n}`, body).value).slice(0, t.width);
        if (nt !== t.text) { const d = String(n) + nt.padEnd(t.width, ' '); items.push([`Messaggio cortesia ${n}`, '4027', d, '4227', String(n), (back) => trimR(back) === trimR(d)]); }
      }
      if (X.inv?.numLocked && items.some(([l]) => l === 'Parametri fattura')) { toast('Numero fattura oltre 9999: parametri fattura non modificabili da qui', 'warn'); return; }
      await writeItems(p, items, rerender, () => loadInvoice(p, X));
    };
  },

  // ----- Contanti: descrizioni 4253/4053, predefiniti e limite 4209/4009 -----
  cash(p, X, body, rerender) {
    const desc = X.cashDesc || {};
    const pre = X.cashPre || {};
    body.innerHTML = `
      <section class="card">
        <h2>Contanti con descrizione</h2>
        <div class="table-wrap"><table class="t"><thead><tr><th>N.</th><th>Descrizione</th><th class="num">Importo predefinito €</th></tr></thead><tbody>
        ${[1, 2, 3, 4, 5].map((n) => `<tr><td><b>${n}</b></td>
          <td><input type="text" maxlength="20" id="cd${n}" value="${esc(desc[n] ?? '')}" ${desc[n] != null ? '' : 'disabled'} autocapitalize="characters"></td>
          <td><input type="number" step="0.01" min="0" id="cp${n}" value="${pre[n] ?? ''}" ${pre[n] != null ? '' : 'disabled'} inputmode="decimal" style="max-width:120px"></td></tr>`).join('')}
        </tbody></table></div>
      </section>
      <section class="card">
        <h2>Limite pagamento in contanti</h2>
        <div class="form-grid">
          <label class="field"><span>Limite € (0 = nessun limite)</span><input type="number" step="0.01" min="0" id="lim" value="${pre[6] ?? ''}" ${pre[6] != null ? '' : 'disabled'} inputmode="decimal"></label>
          <label class="field"><span>Comportamento</span><select id="limMode" ${pre[7] != null ? '' : 'disabled'}>
            <option value="0" ${pre[7] === 0 ? 'selected' : ''}>Avviso superabile, pagamento concesso</option>
            <option value="0.01" ${pre[7] === 0.01 ? 'selected' : ''}>Pagamento non concesso</option></select></label>
        </div>
        <p class="muted" style="font-size:.85rem">Vale per i pagamenti eseguiti dalla tastiera della stampante.</p>
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${X.cashDesc ? '' : 'disabled'}>Scrivi modifiche</button></div>`;

    $('#btnRead', body).onclick = () => task('Lettura contanti…', async () => { await call((pr) => loadCash(pr, X)); saveCache(); rerender(); });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (let n = 1; n <= 5; n++) {
        if (X.cashDesc[n] != null) {
          const v = C.toPrinterText($(`#cd${n}`, body).value).slice(0, 20);
          if (v !== X.cashDesc[n]) { const d = C.num(n, 2) + C.txt(v, 20); items.push([`Contante ${n} descrizione`, '4053', d, '4253', C.num(n, 2), (b) => trimR(b) === trimR(d)]); }
        }
        if (X.cashPre[n] != null) {
          const v = Number($(`#cp${n}`, body).value || 0);
          if (Math.round(v * 100) !== Math.round(X.cashPre[n] * 100)) { const d = String(n) + C.money(v); items.push([`Contante ${n} importo`, '4009', d, '4209', String(n), (b) => b.slice(0, 10) === d]); }
        }
      }
      if (X.cashPre[6] != null) {
        const v = Number($('#lim', body).value || 0);
        if (Math.round(v * 100) !== Math.round(X.cashPre[6] * 100)) { const d = '6' + C.money(v); items.push(['Limite contante', '4009', d, '4209', '6', (b) => b.slice(0, 10) === d]); }
      }
      if (X.cashPre[7] != null) {
        const v = Number($('#limMode', body).value);
        if (v !== X.cashPre[7]) { const d = '7' + C.money(v); items.push(['Comportamento limite', '4009', d, '4209', '7', (b) => b.slice(0, 10) === d]); }
      }
      await writeItems(p, items, rerender, () => loadCash(p, X));
    };
  },

  // ----- Chiusura automatica 9213 / 9013: modo (1) + stampa X-01 (1) + ora (2) + minuti (2) -----
  autoz(p, X, body, rerender) {
    const a = X.autoz;
    body.innerHTML = `
      <section class="card">
        <h2>Chiusura giornaliera automatica</h2>
        ${!a ? '<div class="empty">Leggi la programmazione dalla stampante.</div>' : !a.ok ? `<div class="notice warn">Risposta non riconosciuta («${esc(a.raw)}»).</div>` : `
        <div class="form-grid">
          <label class="field"><span>Modalità</span><select id="mode">
            <option value="0" ${a.mode === 0 ? 'selected' : ''}>Disattivata</option>
            <option value="1" ${a.mode === 1 ? 'selected' : ''}>Attivata sempre</option>
            <option value="2" ${a.mode === 2 ? 'selected' : ''}>Attivata solo in periodo inattivo</option></select></label>
          <label class="field"><span>Ora</span><input type="time" id="time" value="${C.num(a.hh, 2)}:${C.num(a.mm, 2)}"></label>
        </div>
        <label class="check"><input type="checkbox" id="x01" ${a.x01 ? 'checked' : ''}> Stampa anche il rapporto finanziario X-01</label>
        <p class="muted" style="font-size:.85rem">L'Agenzia delle Entrate non accetta i file nella fascia oraria notturna di manutenzione: in quel caso la stampante ritrasmette più tardi.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${a?.ok ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
    $('#btnRead', body).onclick = () => task('Lettura chiusura automatica…', async () => {
      await call((pr) => loadAutoz(pr, X));
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const [hh, mm] = ($('#time', body).value || '00:00').split(':').map(Number);
      const d = `${$('#mode', body).value}${$('#x01', body).checked ? '1' : '0'}${C.num(hh, 2)}${C.num(mm, 2)}`;
      if (d === X.autoz.raw.slice(0, 6)) { toast('Nessuna modifica da scrivere'); return; }
      await writeItems(p, [['Chiusura automatica', '9013', d, '9213', '', (b) => b.slice(0, 6) === d]], rerender, () => loadAutoz(p, X));
    };
  },

  // ----- Lotteria: messaggi 9219 / 9019 (indice 2 + stampa 1 + testo), data lotteria istantanea 4240 / 4040 (GGMMAA) -----
  lot(p, X, body, rerender) {
    const L = X.lot;
    const inst = L?.instantRaw ?? null;
    body.innerHTML = `
      <section class="card">
        <h2>Righe messaggio lotteria</h2>
        <p class="muted" style="font-size:.85rem">Righe facoltative stampate sui documenti con codice lotteria.</p>
        ${L ? [1, 2, 3, 4, 5].map((n) => (L.msg[n] ? `<div class="hdr-line"><span class="n">${n}</span><input type="text" id="lm${n}" maxlength="${L.msg[n].width}" value="${esc(L.msg[n].text)}" autocapitalize="characters">
          <div class="tools"><label class="check" style="padding:0"><input type="checkbox" id="lp${n}" ${L.msg[n].print ? 'checked' : ''}> stampa</label></div></div>` : '')).join('')
    : '<div class="empty">Leggi dalla stampante.</div>'}
      </section>
      <section class="card">
        <h2>Lotteria istantanea</h2>
        ${inst == null ? '<div class="empty">Leggi dalla stampante.</div>' : `
        <p><b>${esc(instantState(inst))}</b></p>
        <div class="form-grid">
          <label class="field"><span>Data di partenza</span><input type="date" id="instDate" value="${isoDate(inst)}"></label>
        </div>
        <label class="check"><input type="checkbox" id="instOff" ${inst === '000000' ? 'checked' : ''}> Nessuna data (lotteria istantanea disattivata)</label>
        <p class="muted" style="font-size:.85rem">Dalla data indicata la stampante gestisce i codici della lotteria istantanea. Lo stato dei codici è in <a href="#/tx/lot">Trasmissioni AdE</a>.</p>`}
      </section>
      <div class="sticky-actions"><button class="btn secondary" id="btnRead">Leggi dalla stampante</button><button class="btn" id="btnWrite" ${L ? '' : 'disabled'}>Scrivi modifiche</button></div>`;
    $('#instOff', body)?.addEventListener('change', (e) => { $('#instDate', body).disabled = e.target.checked; });
    if ($('#instOff', body)?.checked) $('#instDate', body).disabled = true;
    $('#btnRead', body).onclick = () => task('Lettura lotteria…', async () => {
      await call((pr) => loadLot(pr, X));
      saveCache(); rerender();
    });
    $('#btnWrite', body).onclick = async () => {
      const items = [];
      for (let n = 1; n <= 5; n++) {
        const m = X.lot.msg[n];
        if (!m) continue;
        const text = C.toPrinterText($(`#lm${n}`, body).value).slice(0, m.width);
        const print = $(`#lp${n}`, body).checked;
        if (text !== m.text || print !== m.print) {
          const d = C.num(n, 2) + (print ? '1' : '0') + text.padEnd(m.width, ' ');
          items.push([`Messaggio lotteria ${n}`, '9019', d, '9219', C.num(n, 2), (b) => trimR(b) === trimR(d)]);
        }
      }
      if (X.lot.instantRaw != null) {
        const off = $('#instOff', body).checked;
        const d = off ? '000000' : fromIso($('#instDate', body).value);
        if (!d) { toast('Indica la data di partenza della lotteria istantanea', 'warn'); return; }
        if (d !== X.lot.instantRaw) {
          if (off && !await confirmBox('Lotteria istantanea', 'Sei sicuro di voler disattivare la data di partenza della lotteria istantanea?', { okText: 'Disattiva', danger: true })) return;
          items.push([off ? 'Disattiva lotteria istantanea' : `Lotteria istantanea dal ${fmtDate(d)}`, '4040', d, '4240', '', (b) => b.slice(0, 6) === d]);
        }
      }
      await writeItems(p, items, rerender, () => loadLot(p, X));
    };
  },
};

/** Stato della lotteria istantanea come nel wizard. */
function instantState(raw) {
  if (!raw || raw === '000000') return 'Stato attuale: non attiva, nessuna data programmata.';
  const d = new Date(2000 + Number(raw.slice(4, 6)), Number(raw.slice(2, 4)) - 1, Number(raw.slice(0, 2)));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d > today) return `Stato attuale: non attiva, data programmata ${fmtDate(raw)}.`;
  if (d.getTime() === today.getTime()) return 'Stato attuale: attiva da oggi.';
  return `Stato attuale: attiva dal ${fmtDate(raw)}.`;
}
// ---------------------------------------------------------------------------
// Letture (usate dalle schede e dalla sincronizzazione completa)
// ---------------------------------------------------------------------------

/** Parametri fattura (4225) e messaggi di cortesia (4227). */
export async function loadInvoice(p, X) {
  X.inv = parseInvoice(await rd(p, '4225', '', 'Parametri fattura'));
  X.trail = {};
  for (const n of [1, 2]) {
    const t = await rd(p, '4227', String(n), `Messaggio cortesia ${n}`);
    if (t != null && t[0] === String(n)) X.trail[n] = { text: trimR(t.slice(1)), width: t.length - 1 };
  }
}
/** Chiusura giornaliera automatica (9213): modo (1) + X-01 (1) + ora (2) + minuti (2). */
export async function loadAutoz(p, X) {
  const raw = await rd(p, '9213', '', 'Chiusura automatica');
  const m = String(raw ?? '').match(/^([0-2])([01])(\d{2})(\d{2})/);
  X.autoz = m ? { ok: true, raw, mode: Number(m[1]), x01: m[2] === '1', hh: Number(m[3]), mm: Number(m[4]) } : { ok: false, raw };
}
/** Messaggi lotteria (9219) e data della lotteria istantanea (4240). */
export async function loadLot(p, X) {
  const msg = {};
  for (let n = 1; n <= 5; n++) {
    const d = await rd(p, '9219', C.num(n, 2), `Messaggio lotteria ${n}`);
    if (d && Number(d.slice(0, 2)) === n && /[01]/.test(d[2])) msg[n] = { print: d[2] === '1', text: trimR(d.slice(3)), width: d.length - 3 };
  }
  const raw = await rd(p, '4240', '', 'Data lotteria istantanea');
  X.lot = { msg, instantRaw: raw && /^\d{6}/.test(raw) ? raw.slice(0, 6) : null };
}

/** Contanti: descrizioni (4253) e importi predefiniti / limite (4209). */
export async function loadCash(p, X) {
  X.cashDesc = {}; X.cashPre = {};
  for (let n = 1; n <= 5; n++) {
    const d = await rd(p, '4253', C.num(n, 2), `Contante ${n}`);
    if (d && Number(d.slice(0, 2)) === n) X.cashDesc[n] = trimR(d.slice(2, 22));
  }
  for (let n = 1; n <= 7; n++) {
    const d = await rd(p, '4209', String(n), `Contante predefinito ${n}`);
    if (d && d[0] === String(n) && /^\d{9}/.test(d.slice(1))) X.cashPre[n] = Number(d.slice(1, 10)) / 100;
  }
}

function parseInvoice(raw) {
  const r = String(raw ?? '');
  // 34 caratteri: numero (4) righe (2) inizio (2) intestazione (1) esente (14) prefisso (10) posizione (1); 35 se numero > 9999
  const off = r.length === 35 || r.length === 24 ? 1 : 0;
  if (![23, 24, 34, 35].includes(r.length) || !/^\d+$/.test(r.slice(0, 9 + off))) return { raw: r, fields: null };
  return {
    raw: r, off, numLocked: off === 1,
    fields: {
      num: Number(r.slice(0, 4 + off)), lines: Number(r.slice(4 + off, 6 + off)), start: Number(r.slice(6 + off, 8 + off)), hdr: r[8 + off],
      tax: trimR(r.slice(9 + off, 23 + off)), pref: r.length > 24 ? trimR(r.slice(23 + off, 33 + off)) : '', pos: r.length > 24 ? r[33 + off] : '0',
    },
    ext: r.length > 24,
  };
}
function encodeInvoice(inv, f) {
  let s = (inv.numLocked ? inv.raw.slice(0, 5) : C.num(f.num, 4)) + C.num(f.lines, 2) + C.num(f.start, 2) + f.hdr + C.txt(f.tax, 14);
  if (inv.ext) s += C.txt(f.pref, 10) + (f.pos === '1' ? '1' : '0');
  return s;
}
