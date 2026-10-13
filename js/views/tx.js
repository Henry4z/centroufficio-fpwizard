// Trasmissioni all'Agenzia delle Entrate: esito dei corrispettivi per ogni Z (9217), lotteria (1134, 9218),
// E-Receipt (1131) e archiviazione dei file rifiutati (9016). Tracciati verificati in lettura su FP-81 II RT.

import { $, $$, esc, toast, confirmBox, task, fresh, saveFile } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { rd, trimR, noPrinter, fmtDate, isoDate, fromIso } from './prog.js';

const TABS = [['z', 'Corrispettivi'], ['lot', 'Lotteria'], ['erec', 'E-Receipt']];
const TILL = '00000000'; // RT Server: identificativo cassa; stampante RT: zeri

export function tx(main, tab = 'z') {
  main = fresh(main);
  if (noPrinter(main)) return;
  const p = current();
  if (!TABS.some(([k]) => k === tab)) tab = 'z';
  const X = (cache().tx ||= {});
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="body"></div>`;
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/tx/${b.dataset.tab}`; }));
  VIEWS[tab](p, X, $('#body', main), () => tx(main, tab));
}

/** Numero dell'ultima chiusura Z (2052: gran totale 14 + Z 4). */
async function lastZ(p) {
  const d = await rd(p, '2052', '01', 'Ultima chiusura');
  const m = /^\d{14}(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// 9217: esito (1) + Z (4) + data file GGMMAAAA (8) + ID operazione AdE (12) + data risposta GGMMAAAA (8)
const Z_RESULT = { 0: ['Risposta AdE ricevuta', 'ok'], 1: ['Z non ancora eseguita', ''], 2: ['In coda di invio', 'warn'], 3: ['Non trovato', 'err'] };
export function parseZReply(raw) {
  const r = String(raw ?? '');
  if (!/^[0-3]\d{4}/.test(r)) return null;
  return { res: Number(r[0]), z: Number(r.slice(1, 5)), date: fmtDate(r.slice(5, 13)), id: trimR(r.slice(13, 25)), reply: fmtDate(r.slice(25, 33)) };
}

// 1134 / 1131: eco della richiesta (22) + contatori da 4 cifre
const LOT_DOC = { '00': 'Inviato e accettato', '01': 'Nella cartella «da inviare»', '02': 'In coda (gruppo da 100)', '03': 'Rifiutato con codice di errore', '04': 'Rifiutato senza codice', '05': 'Non trovato' };
const EMISSION = { '00': 'Solo carta', '01': 'Solo digitale', '02': 'Carta e digitale' };

/** Campi comuni: numero Z e data dei documenti. */
function zDateFields(Q) {
  return `<div class="form-grid">
    <label class="field"><span>Chiusura Z n.</span><input type="number" id="qz" min="1" max="3653" value="${Q.z ?? ''}" inputmode="numeric"></label>
    <label class="field"><span>Data dei documenti</span><input type="date" id="qd" value="${Q.date ? isoDate(Q.date) : ''}"></label>
  </div>`;
}
function readZDate(body) {
  const z = Number($('#qz', body).value);
  const date = fromIso($('#qd', body).value);
  if (!(z >= 1 && z <= 3653)) { toast('Numero Z da 1 a 3653', 'warn'); return null; }
  if (!date) { toast('Indica la data', 'warn'); return null; }
  return { z, date };
}
// ---------------------------------------------------------------------------
// Letture (usate dalle schede e dalla sincronizzazione completa)
// ---------------------------------------------------------------------------

/** Esiti delle ultime X.zCount chiusure (9217) e contatori dei file RT. step(i, n, testo) segnala l'avanzamento. */
export async function loadZ(p, X, step = () => {}) {
  const last = await lastZ(p);
  if (last == null) throw new Error('Numero dell\'ultima chiusura non disponibile');
  let rt = null;
  const n = (v) => (v == null || v === '' ? null : Number(v));
  try { const s = await fp.queryStatus(p, 1); rt = { toSend: n(s.rtFileToSend), old: n(s.rtOldFileToSend), rejected: n(s.rtFileRejected) }; } catch { /* facoltativo */ }
  const rows = [];
  const count = Math.min(X.zCount || 10, last);
  for (let i = 0; i < count; i++) {
    const z = last - i;
    step(i, count, `Z ${z}…`);
    const r = parseZReply(await rd(p, '9217', C.num(z, 4), `Esito Z ${z}`));
    if (r) rows.push(r);
  }
  X.z = { rows, rt, at: Date.now() };
}
/** Coda lotteria per la Z/data indicata (1134 «00») e lotteria istantanea (1134 «01»); false se non supportate. */
export async function loadLotStatus(p, X, q) {
  const c = (s, i) => Number(s.slice(22 + i * 4, 26 + i * 4));
  const a = await rd(p, '1134', `01${TILL}${C.num(q.z, 4)}${q.date}00`, 'Coda lotteria');
  if (a && a.length >= 50) X.lot = { files: c(a, 0), old: c(a, 1), rejFiles: c(a, 2), queued: c(a, 3), docs: c(a, 4), accepted: c(a, 5), rejected: c(a, 6) };
  const b = await rd(p, '1134', `01${TILL}000000000001`, 'Lotteria istantanea');
  if (b && b.length >= 62) X.inst = { requests: c(b, 2), codes: Number(b.slice(50, 52)), http: b.slice(54, 57), sub: b.slice(57, 62) };
  return !!(a || b);
}
/** Stato E-Receipt per la Z/data indicata (1131); false se non supportato. */
export async function loadErec(p, X, q) {
  const d = await rd(p, '1131', `01${TILL}${C.num(q.z, 4)}${q.date}00`, 'Stato E-Receipt');
  if (!d || d.length < 36) return false;
  X.erec = { toSend: Number(d.slice(22, 26)), sent: Number(d.slice(26, 30)), rejected: Number(d.slice(30, 34)), mode: d.slice(34, 36) };
  return true;
}

/** Valori iniziali di Z e data: periodo in corso (ultima Z + 1) e oggi. */
export async function defaults(p, Q) {
  if (Q.z && Q.date) return;
  const z = await lastZ(p);
  const d = new Date();
  Q.z ||= z != null ? z + 1 : 1;
  Q.date ||= `${C.num(d.getDate(), 2)}${C.num(d.getMonth() + 1, 2)}${String(d.getFullYear()).slice(2)}`;
}

async function archive(p, type, what, rerender) {
  if (!await confirmBox('Archivia file rifiutati', `Vuoi archiviare i file rifiutati ${what}? Vengono spostati dalla cartella «rifiutati» a «archivio-rifiutati» e non saranno più segnalati.`, { okText: 'Archivia' })) return;
  await task('Archiviazione…', async () => {
    await call((pr) => fp.directIO(pr, '9016', String(type), { label: `Archivia rifiutati ${what}` }));
    toast('File rifiutati archiviati', 'ok');
  });
  rerender();
}

const VIEWS = {
  z(p, X, body, rerender) {
    const Z = X.z;
    const n = X.zCount || 10;
    body.innerHTML = `
      <section class="card">
        <h2>Invio dei corrispettivi</h2>
        <p class="muted" style="font-size:.88rem">Per ogni chiusura giornaliera: data del file, identificativo dell'operazione restituito dall'Agenzia e data della risposta.</p>
        ${Z?.rt ? `<div class="row" style="gap:.5rem;flex-wrap:wrap;margin:.4rem 0">
          <span class="badge ${Number(Z.rt.toSend) ? 'warn' : 'ok'}">Da inviare: ${esc(Z.rt.toSend ?? '—')}</span>
          <span class="badge ${Number(Z.rt.old) ? 'err' : 'ok'}">In ritardo: ${esc(Z.rt.old ?? '—')}</span>
          <span class="badge ${Number(Z.rt.rejected) ? 'err' : 'ok'}">Rifiutati: ${esc(Z.rt.rejected ?? '—')}</span></div>` : ''}
        <div class="form-grid">
          <label class="field"><span>Chiusure da controllare</span><select id="cnt">${[10, 20, 50, 100].map((k) => `<option value="${k}" ${k === n ? 'selected' : ''}>Ultime ${k}</option>`).join('')}</select></label>
        </div>
        ${!Z ? '<div class="empty">Leggi dalla stampante.</div>' : !Z.rows.length ? '<div class="empty">Nessuna chiusura trovata.</div>' : `
        <div class="table-wrap"><table class="t"><thead><tr><th>Z</th><th>Data file</th><th>Esito</th><th>ID operazione AdE</th><th>Risposta</th></tr></thead><tbody>
          ${Z.rows.map((r) => `<tr><td><b>${r.z}</b></td><td>${esc(r.date || '—')}</td><td><span class="badge ${Z_RESULT[r.res]?.[1] || ''}">${esc(Z_RESULT[r.res]?.[0] || r.res)}</span></td>
            <td class="mono">${esc(r.id || '—')}</td><td>${esc(r.reply || '—')}</td></tr>`).join('')}
        </tbody></table></div>`}
      </section>
      <section class="card"><h2>File rifiutati</h2>
        <p class="muted" style="font-size:.85rem">Dopo aver risolto la causa dello scarto, archivia i file rifiutati dei rapporti Z.</p>
        <div class="actions"><button class="btn secondary" id="btnArch">Archivia rifiutati Z</button>${Z?.rows?.length ? '<button class="btn ghost" id="btnCsv">Salva elenco (CSV)</button>' : ''}</div>
      </section>
      <div class="sticky-actions"><button class="btn" id="btnRead">Leggi dalla stampante</button></div>`;

    $('#cnt', body).addEventListener('change', (e) => { X.zCount = Number(e.target.value); saveCache(); });
    $('#btnRead', body).onclick = () => task('Lettura esiti…', async (ctx) => {
      await call((pr) => loadZ(pr, X, (i, n, t) => { ctx.check(); ctx.progress(i, n, t); }));
      saveCache(); rerender();
    }, { cancellable: true });
    $('#btnArch', body).onclick = () => archive(p, 0, 'dei rapporti Z', rerender);
    $('#btnCsv', body)?.addEventListener('click', () => {
      const csv = ['Z;Data file;Esito;ID operazione;Data risposta', ...X.z.rows.map((r) => [r.z, r.date || '', Z_RESULT[r.res]?.[0] || r.res, r.id, r.reply || ''].join(';'))].join('\r\n');
      saveFile(`esiti-corrispettivi-${(p.name || 'stampante').replace(/[^\w-]+/g, '_')}.csv`, '﻿' + csv, 'text/csv');
    });
  },

  lot(p, X, body, rerender) {
    const Q = (X.q ||= {});
    const L = X.lot;
    const S = X.lotDoc;
    body.innerHTML = `
      <section class="card">
        <h2>Lotteria degli scontrini</h2>
        ${zDateFields(Q)}
        ${L ? `<dl class="kv">
          <dt>File da inviare</dt><dd>${L.files}</dd><dt>File in ritardo</dt><dd>${L.old}</dd><dt>File rifiutati</dt><dd>${L.rejFiles}</dd>
          <dt>Documenti in coda</dt><dd>${L.queued}</dd><dt>Documenti della Z indicata</dt><dd>${L.docs} (accettati ${L.accepted}, rifiutati ${L.rejected})</dd></dl>` : ''}
        ${X.inst ? `<h3>Lotteria istantanea</h3><dl class="kv">
          <dt>Codici del giorno rimasti</dt><dd>${X.inst.codes}</dd><dt>Richieste di set informativo</dt><dd>${X.inst.requests}</dd>
          <dt>Ultima richiesta codici</dt><dd>HTTP ${esc(X.inst.http)}${X.inst.sub && X.inst.sub !== 'FFFFF' ? ` · errore ${esc(X.inst.sub)}` : ''}</dd></dl>` : ''}
        <div class="actions"><button class="btn secondary" id="btnLot">Leggi stato</button></div>
      </section>
      <section class="card">
        <h2>Cerca un documento</h2>
        <div class="form-grid">
          <label class="field"><span>Documento n.</span><input type="number" id="qn" min="1" max="9999" value="${Q.doc ?? 1}" inputmode="numeric"></label>
          <label class="field"><span>Ricerca</span><select id="qt"><option value="00">Documento indicato</option><option value="01">Primo documento con errore</option></select></label>
        </div>
        <p class="muted" style="font-size:.85rem">Usa il numero Z e la data indicati sopra.</p>
        ${S ? `<dl class="kv"><dt>Esito</dt><dd><b>${esc(LOT_DOC[S.res] || S.res)}</b></dd>${S.code && S.code !== 'FFFFF' ? `<dt>Codice errore AdE</dt><dd class="mono">${esc(S.code)}</dd>` : ''}${S.id ? `<dt>ID risposta</dt><dd class="mono">${esc(S.id)}</dd>` : ''}</dl>` : ''}
        <div class="actions"><button class="btn secondary" id="btnDoc">Cerca</button></div>
      </section>
      <section class="card"><h2>File rifiutati</h2><div class="actions" style="margin-top:0"><button class="btn secondary" id="btnArch">Archivia rifiutati lotteria</button></div></section>`;

    if (!Q.z || !Q.date) defaults(p, Q).then(() => { saveCache(); if ($('#qz', body) && !$('#qz', body).value) { $('#qz', body).value = Q.z; $('#qd', body).value = isoDate(Q.date); } }).catch(() => {});
    $('#btnLot', body).onclick = async () => {
      const q = readZDate(body);
      if (!q) return;
      Object.assign(Q, q);
      await task('Lettura lotteria…', async () => {
        if (!await call((pr) => loadLotStatus(pr, X, q))) toast('Questo modello o firmware non gestisce la lettura della coda lotteria', 'warn');
        saveCache();
      });
      rerender();
    };
    $('#btnDoc', body).onclick = async () => {
      const q = readZDate(body);
      if (!q) return;
      const doc = Number($('#qn', body).value);
      if (!(doc >= 1 && doc <= 9999)) { toast('Numero documento da 1 a 9999', 'warn'); return; }
      Object.assign(Q, q, { doc });
      await task('Ricerca documento…', async () => {
        const d = await call((pr) => rd(pr, '9218', `${TILL}${C.num(q.z, 4)}${C.num(doc, 4)}${q.date}${$('#qt', body).value}`, 'Stato documento lotteria'));
        if (!d || d.length < 29) throw new Error('Risposta non riconosciuta');
        X.lotDoc = { res: d.slice(22, 24), code: trimR(d.slice(24, 29)), id: trimR(d.slice(29, 79)) };
        saveCache();
      });
      rerender();
    };
    $('#btnArch', body).onclick = () => archive(p, 1, 'della lotteria', rerender);
  },

  erec(p, X, body, rerender) {
    const Q = (X.q ||= {});
    const E = X.erec;
    body.innerHTML = `
      <section class="card">
        <h2>Documenti digitali (E-Receipt)</h2>
        ${zDateFields(Q)}
        ${E ? `<dl class="kv"><dt>Modalità di emissione</dt><dd><b>${esc(EMISSION[E.mode] || E.mode)}</b></dd>
          <dt>File da inviare</dt><dd>${E.toSend}</dd><dt>File inviati</dt><dd>${E.sent}</dd><dt>File rifiutati</dt><dd>${E.rejected}</dd></dl>` : ''}
        <div class="actions"><button class="btn secondary" id="btnRead">Leggi stato</button><button class="btn ghost" id="btnArch">Archivia rifiutati E-Receipt</button></div>
      </section>`;
    if (!Q.z || !Q.date) defaults(p, Q).then(() => { saveCache(); if ($('#qz', body) && !$('#qz', body).value) { $('#qz', body).value = Q.z; $('#qd', body).value = isoDate(Q.date); } }).catch(() => {});
    $('#btnRead', body).onclick = async () => {
      const q = readZDate(body);
      if (!q) return;
      Object.assign(Q, q);
      await task('Lettura E-Receipt…', async () => {
        if (!await call((pr) => loadErec(pr, X, q))) throw new Error('Questo modello o firmware non gestisce gli E-Receipt');
        saveCache();
      });
      rerender();
    };
    $('#btnArch', body).onclick = () => archive(p, 2, 'degli E-Receipt', rerender);
  },
};
