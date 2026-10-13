// Tastiera, come «Programmazione Tasti» del wizard: si sceglie la tastiera della stampante (32, 23/24, 56/60 tasti
// o griglia QWERTY), si tocca un tasto e gli si associa una funzione.
// Comandi: 4229 lettura e 4029 scrittura (codice tasto 3 cifre + funzione 3 cifre); ogni scrittura viene riletta.

import { $, $$, esc, toast, confirmBox, task, fresh, openSheet, saveFile, pickFile } from '../ui.js';
import { current, cache, saveCache, call, ensureDayClosed } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { KEYBOARDS, KEY_CODES, KEY_QWERTY, FUNCS, FUNC_GROUPS, READ_ONLY_FUNCS, funcName, keyLabel, keyDefault } from '../keyboards.js';

export { FUNCS };
const VIEWS = [['k32', '32 tasti'], ['k23', '23/24 tasti'], ['k56', '56/60 tasti'], ['grid', 'QWERTY / griglia']];
const n3 = (n) => C.num(n, 3);
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const shortName = (n) => funcName(n).replace(/^REPARTO /, 'REP ').replace(/^CARTA DI CREDITO /, 'CARTA ').replace(/ \/ /g, '/').replace(/^CIFRA /, '');

/** Funzione da mostrare per un codice: modifica in sospeso, poi valore letto; null se non ancora letto. */
const shownFunc = (K, code) => (K[code]?.dirty ? K[code].nf : K[code]?.f ?? null);

export function keys(main, view) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const K = (c.keys ||= {});
  const ui = (c.keysUi ||= {});
  if (view && VIEWS.some(([k]) => k === view)) { ui.kb = view; saveCache(); }
  const kbId = VIEWS.some(([k]) => k === ui.kb) ? ui.kb : 'k32';
  const rerender = () => keys(main);
  const pending = KEY_CODES.filter((code) => K[code]?.dirty);
  const anyRead = KEY_CODES.some((code) => K[code]?.f != null);

  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${VIEWS.map(([k, t]) => `<button data-kb="${k}" class="${k === kbId ? 'on' : ''}">${t}</button>`).join('')}</div>
    <section class="card">
      <p class="muted" style="font-size:.88rem;margin-top:0">${kbId === 'grid'
    ? 'Tutti i codici tasto con la funzione associata e il tasto corrispondente su ogni tastiera. In rosso le righe riprogrammate. Tocca una riga per cambiarla.'
    : 'Scegli la tastiera montata sulla stampante, tocca un tasto, scegli la funzione e premi «Imposta»; alla fine premi «Salva su FP» per scrivere le modifiche sulla stampante. Sotto ogni tasto c’è la funzione: in rosso i tasti diversi dai valori predefiniti.'}</p>
      ${anyRead ? '' : '<div class="notice">Sono mostrati i valori predefiniti: premi <b>Leggi da FP</b> per vedere la programmazione della stampante.</div>'}
      ${pending.length ? `<div class="notice warn"><b>${pending.length === 1 ? '1 tasto modificato' : `${pending.length} tasti modificati`}</b> e non ancora scritt${pending.length === 1 ? 'o' : 'i'} sulla stampante: premi <b>Salva su FP</b>.</div>` : ''}
      ${kbId === 'grid' ? gridHtml(K) : keyboardHtml(K, kbId)}
    </section>
    <section class="card">
      <h2>File e valori predefiniti</h2>
      <div class="actions" style="margin-top:0">
        <button class="btn secondary" id="btnLoad">Leggi da file</button>
        <button class="btn secondary" id="btnSave">Salva su file</button>
        <button class="btn secondary" id="btnDefaults">Imposta default</button>
        ${pending.length ? '<button class="btn ghost" id="btnDiscard">Annulla modifiche</button>' : ''}
      </div>
      <p class="muted" style="font-size:.85rem">«Imposta default» prepara i valori predefiniti di ${kbId === 'grid' ? 'tutti i codici tasto' : 'tutti i tasti di questa tastiera'}; vengono scritti con «Salva su FP».</p>
    </section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnRead">Leggi da FP</button>
      <button class="btn" id="btnWrite">Salva su FP${pending.length ? ` (${pending.length})` : ''}</button>
    </div>`;

  $$('[data-kb]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/keys/${b.dataset.kb}`; }));
  $$('[data-i]', main).forEach((b) => b.addEventListener('click', () => {
    const k = KEYBOARDS[kbId].keys[Number(b.dataset.i)];
    if (k.off) { toast(k.off, 'warn'); return; }
    if (k.code == null) { toast('Codice del tasto non noto', 'warn'); return; }
    keySheet(p, k.code, k.label, rerender);
  }));
  $$('[data-code]', main).forEach((r) => r.addEventListener('click', () => {
    const code = Number(r.dataset.code);
    keySheet(p, code, KEY_QWERTY[code] || `codice ${n3(code)}`, rerender);
  }));

  const codesHere = () => (kbId === 'grid' ? KEY_CODES : [...new Set(KEYBOARDS[kbId].keys.map((k) => k.code).filter((x) => x != null))]);

  $('#btnRead', main).onclick = async () => {
    const codes = codesHere();
    await task('Lettura tastiera…', async (ctx) => {
      await call((pr) => loadKeyCodes(pr, K, codes, (i, n, t) => { ctx.check(); ctx.progress(i, n, t); }));
      toast(`Letti ${codes.length} tasti`, 'ok');
    }, { cancellable: true });
    saveCache();
    rerender();
  };

  $('#btnWrite', main).onclick = () => writePending(p, rerender);

  $('#btnDefaults', main).onclick = async () => {
    const codes = codesHere().filter((code) => !READ_ONLY_FUNCS.includes(K[code]?.f) && shownFunc(K, code) !== keyDefault(code));
    if (!codes.length) { toast(anyRead ? 'I tasti hanno già i valori predefiniti' : 'Leggi prima la tastiera dalla stampante', 'warn'); return; }
    if (!await confirmBox('Valori predefiniti', `Preparo i valori predefiniti per ${codes.length} tast${codes.length === 1 ? 'o' : 'i'}. Verranno scritti sulla stampante con «Salva su FP».`, { okText: 'Prepara' })) return;
    for (const code of codes) setPending(K, code, keyDefault(code));
    saveCache();
    rerender();
  };
  $('#btnDiscard', main)?.addEventListener('click', () => {
    for (const code of Object.keys(K)) { if (K[code]?.dirty) { if (K[code].f == null) delete K[code]; else K[code] = { f: K[code].f }; } }
    saveCache();
    rerender();
  });

  $('#btnSave', main).onclick = () => {
    const out = {};
    for (const code of KEY_CODES) { const f = shownFunc(K, code); if (f != null) out[code] = f; }
    if (!Object.keys(out).length) { toast('Leggi prima la tastiera dalla stampante', 'warn'); return; }
    const d = new Date();
    const stamp = `${d.getFullYear()}${C.num(d.getMonth() + 1, 2)}${C.num(d.getDate(), 2)}-${C.num(d.getHours(), 2)}${C.num(d.getMinutes(), 2)}`;
    saveFile(`tastiera-${(p.name || 'stampante').replace(/[^\w-]+/g, '_')}-${stamp}.json`, JSON.stringify({ format: 'fpwizard-pwa-tastiera', version: 1, keys: out }, null, 1));
  };
  $('#btnLoad', main).onclick = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('File non valido', 'error'); return; }
    const src = data?.format === 'fpwizard-pwa-tastiera' ? data.keys : data?.keys || null;
    if (!src || typeof src !== 'object') { toast('Il file non contiene una programmazione della tastiera', 'error'); return; }
    let n = 0;
    for (const [code, f] of Object.entries(src)) {
      const k = Number(code);
      const fn = Number(f);
      if (!Number.isInteger(k) || k < 0 || k > 255 || !Number.isInteger(fn) || fn < 0 || fn > 999 || READ_ONLY_FUNCS.includes(fn)) continue;
      if (READ_ONLY_FUNCS.includes(K[k]?.f)) continue;
      if (shownFunc(K, k) === fn && K[k]?.f != null) continue;
      setPending(K, k, fn);
      n++;
    }
    saveCache();
    rerender();
    if (!n) { toast('Nessuna differenza rispetto ai valori attuali'); return; }
    if (await confirmBox('Lettura da file', `Lettura dati da file terminata: ${n} tast${n === 1 ? 'o' : 'i'} da programmare. Vuoi programmarli sulla stampante adesso?`, { okText: 'Programma' })) writePending(p, rerender, true);
  };
}

function keyboardHtml(K, kbId) {
  const kb = KEYBOARDS[kbId];
  return `${kbId === 'k56' ? '<p class="muted kbd-hint">Scorri la tastiera verso destra per vedere tutti i tasti.</p>' : ''}
    <div class="kbd-wrap"><div class="kbd ${kbId}${kb.dark ? ' dark' : ''}" style="--cols:${kb.cols}">
      ${kb.keys.map((k, i) => {
    const f = k.code == null ? null : shownFunc(K, k.code);
    const known = f != null;
    const fn = known ? f : (k.code == null ? null : keyDefault(k.code));
    const changed = known && k.code != null && f !== keyDefault(k.code);
    const style = [k.w ? `grid-column:span ${k.w}` : '', k.h ? `grid-row:span ${k.h}` : ''].filter(Boolean).join(';');
    return `<button class="k c-${k.c || 'num'}${changed ? ' changed' : ''}${K[k.code]?.dirty ? ' pending' : ''}${k.off ? ' off' : ''}${known ? '' : ' unread'}" data-i="${i}" ${style ? `style="${style}"` : ''}
          title="${esc(k.code == null ? k.label : `Codice ${n3(k.code)} · ${funcName(fn)}`)}">
          <span class="l">${esc(k.label)}</span>${k.sub ? `<span class="s">${k.sub}</span>` : ''}
          <span class="f">${fn == null ? '&nbsp;' : esc(shortName(fn))}</span></button>`;
  }).join('')}
    </div></div>
    <p class="muted kbd-legend"><span class="sw changed"></span> diverso dal predefinito <span class="sw pending"></span> da salvare con «Salva su FP»</p>`;
}

function gridHtml(K) {
  return `
    <div class="table-wrap"><table class="t keys-grid"><thead><tr><th>Codice</th><th>Funz.</th><th>Descrizione</th><th>QWERTY</th><th>32 tasti</th><th>23/24 tasti</th><th>56/60 tasti</th></tr></thead><tbody>
    ${KEY_CODES.map((code) => {
    const f = shownFunc(K, code);
    const fn = f ?? keyDefault(code);
    const changed = f != null && f !== keyDefault(code);
    return `<tr data-code="${code}" class="${changed ? 'chg' : ''}${K[code]?.dirty ? ' dirty' : ''}${f == null ? ' unread' : ''}">
        <td class="mono">${n3(code)}</td><td class="mono">${n3(fn)}</td><td>${esc(funcName(fn))}</td><td>${esc(KEY_QWERTY[code] || 'n/a')}</td>
        <td>${esc(keyLabel('k32', code) || 'n/a')}</td><td>${esc(keyLabel('k23', code) || 'n/a')}</td><td>${esc(keyLabel('k56', code) || 'n/a')}</td></tr>`;
  }).join('')}
    </tbody></table></div>`;
}

function setPending(K, code, f) {
  const cur = K[code]?.f;
  if (cur != null && cur === f) K[code] = { f: cur };
  else K[code] = { ...(cur != null ? { f: cur } : {}), nf: f, dirty: true };
}

/** Codici dei tasti delle tastiere POS (32, 23/24 e 56/60): sono quelli letti dalla sincronizzazione completa. */
export const POS_CODES = [...new Set(Object.values(KEYBOARDS).flatMap((kb) => kb.keys.map((k) => k.code)).filter((x) => x != null))].sort((a, b) => a - b);

/** Legge la funzione dei codici indicati; le modifiche in sospeso restano tali. step(i, n, testo) segnala l'avanzamento. */
export async function loadKeyCodes(p, K, codes, step = () => {}) {
  for (let i = 0; i < codes.length; i++) {
    step(i, codes.length, `Tasto ${n3(codes[i])}…`);
    const f = await readKey(p, codes[i]);
    if (f != null) {
      const old = K[codes[i]];
      K[codes[i]] = old?.dirty && old.nf !== f ? { f, nf: old.nf, dirty: true } : { f };
    }
  }
}

async function readKey(p, code) {
  const r = await fp.directIO(p, '4229', n3(code), { allowFail: true, label: `Tasto ${n3(code)}` });
  const m = String(r.data ?? '').match(/^(\d{3})(\d{3})/);
  return r.response.success && m && Number(m[1]) === code ? Number(m[2]) : null;
}

/** Scrive un tasto e lo rilegge; con la giornata aperta propone la chiusura e riprova. */
async function writeKey(p, code, f) {
  const once = async () => {
    try {
      await call((pr) => fp.directIO(pr, '4029', n3(code) + n3(f), { label: `Tasto ${n3(code)} = ${n3(f)}` }));
    } catch (e) {
      if (e.status === 16) throw new Error(`il firmware non supporta la funzione ${n3(f)} su questo tasto`);
      throw e;
    }
    const back = await readKey(p, code);
    if (back !== f) throw new Error(`valore riletto diverso (${back == null ? 'nessuna risposta' : n3(back)})`);
  };
  try { await once(); } catch (e) {
    if (e.status === 17 && await ensureDayClosed(p, 'la programmazione della tastiera')) { await once(); return; }
    throw e;
  }
}

async function writePending(p, rerender, skipConfirm = false) {
  const K = cache().keys || {};
  const codes = KEY_CODES.filter((code) => K[code]?.dirty);
  if (!codes.length) { toast('Nessun tasto da salvare: tocca un tasto, scegli la funzione e premi «Imposta». I tasti già salvati non hanno il bordo tratteggiato.', 'warn', 6000); return; }
  const name = (code) => keyLabel('k32', code) || keyLabel('k56', code) || keyLabel('k23', code) || KEY_QWERTY[code] || '';
  if (!skipConfirm && !await confirmBox('Salva su FP', `<p>Scrivo sulla stampante ${codes.length === 1 ? 'questo tasto' : `questi ${codes.length} tasti`} e li rileggo per conferma:</p><ul>${codes.map((code) => `<li><b>${esc(name(code) || `Tasto ${n3(code)}`)}</b> (codice ${n3(code)}) → ${esc(n3(K[code].nf))} ${esc(funcName(K[code].nf))}</li>`).join('')}</ul>`, { html: true, okText: 'Salva su FP' })) return;
  await task('Scrittura tastiera…', async (ctx) => {
    const errors = [];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      ctx.check();
      ctx.progress(i, codes.length, `Tasto ${n3(code)}…`);
      try {
        await writeKey(p, code, K[code].nf);
        K[code] = { f: K[code].nf };
      } catch (e) {
        errors.push(`Tasto ${n3(code)}: ${e.message}`);
        if (e.status === 17) break;
      }
    }
    saveCache();
    if (errors.length) toast(errors.join(' · '), 'error');
    else toast('Tasti programmati e verificati', 'ok');
  }, { cancellable: true });
  saveCache();
  rerender();
}

function keySheet(p, code, label, rerender) {
  const K = cache().keys || {};
  const known = K[code]?.f ?? null;
  const shown = shownFunc(K, code);
  const def = keyDefault(code);
  const ro = READ_ONLY_FUNCS.includes(known ?? def);
  const all = Object.keys(FUNCS).map(Number).sort((a, b) => a - b);
  openSheet(`
    <h2>Tasto «${esc(label)}»</h2>
    <dl class="kv">
      <dt>Codice tasto</dt><dd class="mono">${n3(code)}</dd>
      <dt>Tastiera PC</dt><dd>${esc(KEY_QWERTY[code] || 'n/a')}</dd>
      <dt>Funzione attuale</dt><dd>${known == null ? '<span class="muted">non letta</span>' : esc(`${n3(known)} · ${funcName(known)}`)}</dd>
      ${K[code]?.dirty ? `<dt>Da salvare</dt><dd>${esc(`${n3(K[code].nf)} · ${funcName(K[code].nf)}`)}</dd>` : ''}
      <dt>Predefinita</dt><dd>${esc(`${n3(def)} · ${funcName(def)}`)}</dd>
    </dl>
    ${ro ? '<div class="notice warn">Solo lettura: questo tasto ha una funzione interna riservata e non si può riprogrammare.</div>' : `
    <label class="field" style="margin-top:.8rem"><span>Cerca funzione</span><input type="search" id="q" placeholder="es. reparto 5, contante, plu 12, 113" autocomplete="off"></label>
    <label class="field"><span>Funzione da associare</span><select id="fn"></select></label>`}
    <div class="actions">
      ${ro ? '' : `<button class="btn" data-set>Imposta</button><button class="btn secondary" data-now>Imposta e salva su FP</button>${def < 997 ? '<button class="btn secondary" data-def>Imposta default</button>' : ''}`}
      <button class="btn ghost" data-close>Chiudi</button>
    </div>
    ${ro ? '' : '<p class="muted" style="font-size:.82rem">«Imposta» prepara la modifica: puoi cambiare altri tasti e poi scriverli tutti insieme con «Salva su FP». «Imposta e salva su FP» scrive subito solo questo tasto.</p>'}`, {
    onMount(sheet, close) {
      sheet.querySelector('[data-close]').onclick = close;
      if (ro) return;
      const sel = $('#fn', sheet);
      const q = $('#q', sheet);
      const fill = () => {
        const words = fold(q.value).split(/\s+/).filter(Boolean);
        // le parole numeriche devono coincidere con il codice o con un numero intero del nome (5 non trova 15)
        const match = (n) => {
          const name = fold(funcName(n));
          return words.every((w) => (/^\d+$/.test(w) ? Number(w) === n || new RegExp(`(^|\\D)${Number(w)}(\\D|$)`).test(name) : name.includes(w)));
        };
        const keep = Number(sel.value || (shown ?? def));
        const seen = new Set();
        let html = '';
        for (const [title, test] of FUNC_GROUPS) {
          const items = all.filter((n) => !seen.has(n) && test(n));
          items.forEach((n) => seen.add(n));
          const shownItems = items.filter(match);
          if (shownItems.length) html += `<optgroup label="${esc(title)}">${shownItems.map((n) => `<option value="${n}">${n3(n)} · ${esc(funcName(n))}</option>`).join('')}</optgroup>`;
        }
        sel.innerHTML = html || '<option value="">Nessuna funzione trovata</option>';
        if ([...sel.options].some((o) => Number(o.value) === keep && o.value !== '')) sel.value = String(keep);
      };
      fill();
      q.addEventListener('input', fill);
      const chosen = () => {
        const f = Number(sel.value);
        if (sel.value === '' || !Number.isInteger(f)) { toast('Scegli una funzione', 'warn'); return null; }
        return f;
      };
      // «Imposta»: prepara la modifica, che si scrive con «Salva su FP» (anche insieme ad altri tasti)
      const prepare = (f) => {
        close();
        if (known != null && f === known && !K[code]?.dirty) { toast('Il tasto ha già questa funzione'); return; }
        setPending(K, code, f);
        saveCache();
        rerender();
        toast(K[code]?.dirty ? `Tasto impostato su ${n3(f)} ${funcName(f)}: premi «Salva su FP» per scriverlo sulla stampante` : 'Modifica annullata: il tasto ha già questa funzione', 'ok', 5000);
      };
      // «Imposta e salva su FP»: scrive subito questo tasto e lo rilegge
      const saveNow = async (f) => {
        close();
        let ok = false;
        await task('Programmazione tasto…', async () => {
          await writeKey(p, code, f);
          K[code] = { f };
          saveCache();
          ok = true;
        });
        if (ok) toast(`Tasto salvato sulla stampante: ${n3(f)} ${funcName(f)}`, 'ok');
        rerender();
      };
      sheet.querySelector('[data-set]').onclick = () => { const f = chosen(); if (f != null) prepare(f); };
      sheet.querySelector('[data-now]').onclick = () => { const f = chosen(); if (f != null) saveNow(f); };
      sheet.querySelector('[data-def]')?.addEventListener('click', () => prepare(def));
    },
  });
}
