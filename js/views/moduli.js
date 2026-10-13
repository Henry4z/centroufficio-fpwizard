// Moduli del tecnico, come in EpsonFpWizard: comunicazione di messa in servizio o di defiscalizzazione/cessione
// del registratore telematico (o misuratore fiscale). Stampa su A4 (o PDF) e salvataggio come testo.
// Modello, matricola, numero di azzeramenti e scadenza della verificazione periodica si leggono dalla stampante.

import { $, $$, esc, toast, task, fresh, store, saveFile, copyText } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';
import { rd, trimR, noPrinter } from './prog.js';

const KINDS = [['inst', 'Messa in servizio'], ['dis', 'Defiscalizzazione / cessione']];
const W = 86; // larghezza del modulo in caratteri (Courier su A4)

const today = () => { const d = new Date(); return `${C.num(d.getDate(), 2)}/${C.num(d.getMonth() + 1, 2)}/${d.getFullYear()}`; };
const itDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function moduli(main, kind = 'inst') {
  main = fresh(main);
  if (noPrinter(main)) return;
  const p = current();
  if (!KINDS.some(([k]) => k === kind)) kind = 'inst';
  const c = cache();
  const tec = { ...store.get('tecnico', {}), ...store.get('laboratorio', {}) };
  const F = (c.modulo ||= {});
  const v = (k, d = '') => esc(F[k] ?? d);
  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="segment" style="margin-bottom:12px">${KINDS.map(([k, t]) => `<button data-kind="${k}" class="${k === kind ? 'on' : ''}">${t}</button>`).join('')}</div>
    <form id="f" autocomplete="off">
    <section class="card">
      <h2>Apparecchio</h2>
      <div class="form-grid">
        <label class="field"><span>Tipo</span><select name="device"><option value="rt" ${F.device !== 'mf' ? 'selected' : ''}>Registratore telematico</option><option value="mf" ${F.device === 'mf' ? 'selected' : ''}>Misuratore fiscale</option></select></label>
        <label class="field"><span>Modello</span><input name="model" value="${v('model')}" placeholder="es. FP-81 II RT"></label>
        <label class="field"><span>Matricola fiscale</span><input name="serial" value="${v('serial')}" placeholder="es. 99IEB123456" autocapitalize="characters" spellcheck="false"></label>
        <label class="field"><span>Numero azzeramenti (ultima Z)</span><input name="zeta" value="${v('zeta')}" inputmode="numeric"></label>
        <label class="field"><span>Data verificazione periodica</span><input type="date" name="vpDate" value="${v('vpDate')}"></label>
        <label class="field"><span>Scadenza verificazione periodica</span><input type="date" name="vpNext" value="${v('vpNext')}"></label>
      </div>
      <div class="actions"><button class="btn secondary" type="button" id="btnRead">Leggi dalla stampante</button></div>
    </section>
    <section class="card">
      <h2>${kind === 'inst' ? 'Messa in servizio' : 'Defiscalizzazione / cessione'}</h2>
      <div class="form-grid">
        ${kind === 'dis' ? `<label class="field"><span>Operazione</span><select name="disKind"><option value="def" ${F.disKind !== 'ced' ? 'selected' : ''}>Defiscalizzazione</option><option value="ced" ${F.disKind === 'ced' ? 'selected' : ''}>Cessione</option></select></label>` : ''}
        <label class="field"><span>${kind === 'inst' ? 'Data di messa in servizio' : 'Data dell\'operazione'}</span><input type="date" name="date" value="${v('date', new Date().toISOString().slice(0, 10))}"></label>
        <label class="field"><span>Esercizio ubicato in</span><input name="place" value="${v('place')}" placeholder="indirizzo dove è installata"></label>
      </div>
    </section>
    <section class="card">
      <h2>Esercente</h2>
      <div class="form-grid">
        <label class="field"><span>Il sottoscritto</span><input name="person" value="${v('person')}" autocapitalize="words"></label>
        <label class="field"><span>Codice fiscale</span><input name="personCf" value="${v('personCf')}" maxlength="16" autocapitalize="characters" spellcheck="false"></label>
        <label class="field"><span>Nella qualità di</span><input name="role" value="${v('role', 'titolare')}"></label>
        <label class="field"><span>Ditta</span><input name="company" value="${v('company')}"></label>
        <label class="field"><span>Sede legale</span><input name="seat" value="${v('seat')}"></label>
        <label class="field"><span>Partita IVA</span><input name="vat" value="${v('vat')}" maxlength="13" autocapitalize="characters" spellcheck="false"></label>
      </div>
    </section>
    <section class="card">
      <h2>Tecnico e laboratorio</h2>
      <p class="muted" style="font-size:.85rem">${kind === 'inst' ? 'Da compilare solo se la verificazione periodica è stata fatta contestualmente alla messa in servizio.' : 'Da compilare a cura del tecnico che ha eseguito la defiscalizzazione.'}</p>
      <label class="check"><input type="checkbox" name="withTech" ${F.withTech !== false ? 'checked' : ''}> Includi i dati del tecnico</label>
      <div class="form-grid">
        <label class="field"><span>Tecnico</span><input name="tech" value="${v('tech', tec.tecnico || '')}" autocapitalize="words"></label>
        <label class="field"><span>Codice fiscale tecnico</span><input name="techCf" value="${v('techCf', tec.cf || '')}" maxlength="16" autocapitalize="characters" spellcheck="false"></label>
        <label class="field"><span>Marchio identificativo n.</span><input name="mark" value="${v('mark', tec.sigillo || '')}"></label>
        <label class="field"><span>Tessera di riconoscimento n.</span><input name="card" value="${v('card', tec.tessera || '')}"></label>
        <label class="field"><span>Ragione sociale laboratorio</span><input name="lab" value="${v('lab', tec.lab || '')}"></label>
        <label class="field"><span>Indirizzo laboratorio</span><input name="labAddr" value="${v('labAddr', tec.labAddr || '')}"></label>
        <label class="field"><span>Partita IVA laboratorio</span><input name="labVat" value="${v('labVat', tec.piva || '')}" maxlength="13" autocapitalize="characters" spellcheck="false"></label>
      </div>
      <div class="actions"><button class="btn ghost" type="button" id="btnRemember">Ricorda i dati del laboratorio</button></div>
    </section>
    </form>
    ${kind === 'dis' ? `<section class="card"><h2>Procedura</h2><ol class="muted" style="font-size:.88rem;padding-left:1.2rem;margin:.2rem 0">
      <li>Esegui la chiusura giornaliera (<a href="#/reports">Rapporti</a>).</li>
      <li>Stampa la memoria fiscale (MPR) completa e conserva la memoria SD del giornale (<a href="#/dgfe">Giornale elettronico</a>).</li>
      <li>Sul libretto fiscale aggiungi «DISINSTALLATO IN DATA ___».</li>
      <li>Stampa due copie di questo modulo: una va allegata al libretto, l'altra all'Agenzia delle Entrate.</li></ol></section>` : ''}
    <section class="card"><h2>Anteprima</h2><pre class="ej" id="prev" style="font-size:11px;max-height:none"></pre></section>
    <div class="sticky-actions">
      <button class="btn secondary" id="btnTxt">Salva testo</button>
      <button class="btn" id="btnPrint">Stampa / PDF</button>
    </div>`;

  const form = $('#f', main);
  const collect = () => {
    const o = Object.fromEntries(new FormData(form).entries());
    o.withTech = !!form.elements.withTech.checked;
    return o;
  };
  const refresh = () => {
    Object.assign(F, collect());
    saveCache();
    $('#prev', main).textContent = build(kind, F);
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();
  $$('[data-kind]', main).forEach((b) => b.addEventListener('click', () => { location.hash = `#/moduli/${b.dataset.kind}`; }));

  $('#btnRead', main).onclick = () => task('Lettura dati della stampante…', async () => {
    const serial = C.decodeSerial(await call((pr) => rd(pr, '3217', '01', 'Matricola')) || '');
    let rtType = null;
    try { rtType = (await fp.queryStatus(p, 1)).rtType; } catch { /* facoltativo */ }
    const s11 = C.rtSerial(serial, rtType);
    if (serial.ok) {
      form.elements.model.value = (C.MODELS[serial.model] || serial.model).replace(/\s*\(.*\)$/, '');
      form.elements.serial.value = s11 || `${serial.oem}${serial.model}${serial.number}`;
    }
    const gt = await rd(p, '2052', '01', 'Ultima chiusura');
    const z = /^\d{14}(\d{4})/.exec(String(gt ?? ''));
    if (z) form.elements.zeta.value = String(Number(z[1]));
    const vp = await rd(p, '4228', '', 'Data verificazione periodica');
    const d = C.decodeVpDate(vp);
    if (d.ok && d.date) form.elements.vpNext.value = `${d.date.getFullYear()}-${C.num(d.date.getMonth() + 1, 2)}-${C.num(d.date.getDate(), 2)}`;
    // esercente dall'intestazione (riga 1 = ragione sociale, P.IVA dalle righe); se non è in memoria si leggono le prime righe
    let lines = cache().header?.lines || [];
    if (!lines.some((l) => String(l || '').trim())) {
      lines = [''];
      for (let n = 1; n <= 6; n++) {
        const d = C.decodeHeaderLine(n, String(await rd(p, '3216', C.num(n, 2), `Intestazione ${n}`) ?? ''));
        lines.push(d.ok ? d.text : '');
      }
    }
    const firstText = lines.slice(1).map((l) => String(l || '').trim()).find(Boolean) || '';
    if (!form.elements.company.value && firstText) form.elements.company.value = trimR(firstText);
    const piva = C.findPIva(lines);
    if (!form.elements.vat.value && piva) form.elements.vat.value = piva;
    refresh();
    toast('Dati letti dalla stampante', 'ok');
  });
  $('#btnRemember', main).onclick = () => {
    const o = collect();
    store.set('laboratorio', { tessera: o.card, lab: o.lab, labAddr: o.labAddr });
    store.set('tecnico', { ...store.get('tecnico', {}), tecnico: o.tech, cf: o.techCf, sigillo: o.mark, piva: o.labVat });
    try { navigator.storage?.persist?.(); } catch { /* facoltativo */ }
    toast('Dati del tecnico e del laboratorio salvati su questo dispositivo', 'ok');
  };
  $('#btnTxt', main).onclick = () => {
    const text = build(kind, F);
    saveFile(`${kind === 'inst' ? 'Modulo_Installazione' : 'Modulo_Disinstallazione'}_${(F.serial || 'RT').replace(/\W+/g, '')}_${new Date().toISOString().slice(0, 10)}.txt`, text, 'text/plain');
  };
  $('#btnPrint', main).onclick = () => printText(build(kind, F));
  $('#prev', main).addEventListener('dblclick', () => copyText(build(kind, F)));
}

// ---------------------------------------------------------------------------
// Testo del modulo (impaginazione a larghezza fissa come quella del wizard)
// ---------------------------------------------------------------------------
const center = (s) => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
const lab = (label, value) => `${label.padStart(30)} ${value || '_'.repeat(40)}`;
const cell = (s, n) => ` ${String(s ?? '').slice(0, n - 2).padEnd(n - 2)} `;

export function build(kind, F) {
  const rt = F.device !== 'mf';
  const what = rt ? 'REGISTRATORE TELEMATICO' : 'MISURATORE FISCALE';
  const whatPl = rt ? 'registratori telematici' : 'misuratori fiscali';
  const ced = kind === 'dis' && F.disKind === 'ced';
  const out = [];
  out.push(center(kind === 'inst' ? 'COMUNICAZIONE DI MESSA IN SERVIZIO' : `COMUNICAZIONE DI ${ced ? 'CESSIONE' : 'DEFISCALIZZAZIONE'}`), center(what), '');
  out.push(lab('Il sottoscritto:', F.person), lab('Codice fiscale:', F.personCf), lab('nella qualità di:', F.role), lab('della ditta:', F.company),
    lab('sede legale in:', F.seat), lab('Partita IVA:', F.vat), '', center('DICHIARA'), '');
  out.push(lab('che in data:', itDate(F.date)), lab('presso l\'esercizio ubicato in:', F.place));
  out.push('', kind === 'inst' ? `sono stati MESSI IN SERVIZIO i seguenti ${whatPl}:` : `sono stati [${ced ? ' ' : 'X'}] DEFISCALIZZATI  [${ced ? 'X' : ' '}] CEDUTI  i seguenti ${whatPl}:`, '');
  const cols = [22, 16, 14, 14, 12];
  const row = (a) => `|${a.map((x, i) => cell(x, cols[i])).join('|')}|`;
  const sep = `|${cols.map((n) => '-'.repeat(n)).join('|')}|`;
  out.push(row(['MODELLO', 'MATRICOLA', 'VERIFICA', 'SCADENZA', 'AZZERA-']), row(['', 'FISCALE', 'PERIODICA', 'VERIFICA', 'MENTI']), sep,
    row([F.model, F.serial, itDate(F.vpDate), itDate(F.vpNext), F.zeta]), sep, '');
  if (F.withTech) {
    out.push(kind === 'inst'
      ? 'Da compilare a cura del tecnico SOLO SE effettuata la VERIFICAZIONE PERIODICA\ncon applicazione del bollino verde contestualmente alla messa in servizio'
      : 'Da compilare a cura del tecnico SOLO SE effettuata una DEFISCALIZZAZIONE', '');
    out.push(lab('effettuata dal sig.:', F.tech), lab('Codice fiscale:', F.techCf), lab('Marchio identificativo n.:', F.mark), lab('Tessera riconoscimento n.:', F.card),
      lab('Ragione sociale laboratorio:', F.lab), lab('Indirizzo:', F.labAddr), lab('Partita IVA:', F.labVat), '');
  }
  out.push(`Data: ${itDate(F.date) || today()}`, '', '', `${'La Ditta'.padEnd(43)}Il Tecnico`, `${'_'.repeat(34).padEnd(43)}${'_'.repeat(34)}`);
  return out.join('\n');
}

/** Stampa (o salva in PDF) solo il modulo, con un foglio di stile dedicato. */
function printText(text) {
  const box = document.createElement('div');
  box.className = 'print-sheet';
  box.innerHTML = `<pre>${esc(text)}</pre>`;
  document.body.appendChild(box);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}
