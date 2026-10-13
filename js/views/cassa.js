// Simulatore cassa: emissione di documenti dalla app (come il «Simulatore Cassa» di EpsonFpWizard).
// Documento commerciale, reso, annullo, fattura diretta e documento gestionale, con i comandi Fiscal ePOS-Print XML.

import { $, $$, esc, toast, confirmBox, task, fresh } from '../ui.js';
import { current, cache, saveCache, call } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

const KINDS = { sale: 'Documento commerciale (vendita)', refund: 'Documento di reso', void: 'Documento di annullo', invoice: 'Fattura diretta', mgmt: 'Documento gestionale' };
const PAY = { '0|1': 'Contanti', '2|1': 'Pagamento elettronico / carta 1', '1|0': 'Assegno', '3|1': 'Ticket 1', '5|0': 'Non riscosso (beni e servizi)', '5|2': 'Non riscosso servizi', '6|0': 'Sconto a pagare' };
const eur = (v) => Number(v || 0).toFixed(2).replace('.', ',');

export function cassa(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const S = (c.cassa ||= { kind: 'sale', rows: [{ desc: 'ARTICOLO', dept: 1, qty: 1, price: 1.00 }], pay: '0|1', lottery: '', refZ: '', refN: '', refDate: new Date().toISOString().slice(0, 10), refSerial: '', client: ['', '', ''], text: 'DOCUMENTO DI PROVA', last: null });
  const total = () => S.rows.reduce((a, r) => a + Math.round(Number(r.qty || 0) * Number(r.price || 0) * 100) / 100, 0);
  const serial11 = C.rtSerial(c.serial, c.rt?.rtType) || '';
  if (!S.refSerial) S.refSerial = serial11;
  const needRef = S.kind === 'refund' || S.kind === 'void';

  main.innerHTML = `
    ${mixedWarning(p)}
    <div class="notice warn">I documenti emessi da qui sono <b>documenti fiscali reali</b> (salvo modalità simulazione o demo attive sulla stampante).</div>
    <section class="card">
      <label class="field"><span>Tipo di documento</span><select id="kind">${Object.entries(KINDS).map(([k, t]) => `<option value="${k}" ${k === S.kind ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${needRef ? `
        <h3>Documento di riferimento</h3>
        <div class="form-grid">
          <label class="field"><span>N. chiusura (Z)</span><input type="number" id="refZ" min="1" max="9999" value="${esc(S.refZ)}" inputmode="numeric"></label>
          <label class="field"><span>N. documento</span><input type="number" id="refN" min="1" max="9999" value="${esc(S.refN)}" inputmode="numeric"></label>
          <label class="field"><span>Data</span><input type="date" id="refDate" value="${esc(S.refDate)}"></label>
          <label class="field"><span>Matricola (o POS / VR / ND)</span><input type="text" id="refSerial" maxlength="11" value="${esc(S.refSerial)}" autocapitalize="characters"></label>
        </div>
        ${S.kind === 'void' ? '<p class="muted" style="font-size:.85rem">Se il documento è nel giornale elettronico di questa stampante l\'annullo viene stampato automaticamente; altrimenti vengono usate le righe sotto.</p>' : ''}` : ''}
      ${S.kind === 'invoice' ? `<h3>Cliente (fino a 5 righe)</h3>${[0, 1, 2, 3, 4].map((i) => `<input type="text" data-client="${i}" maxlength="46" value="${esc(S.client[i] || '')}" placeholder="Riga cliente ${i + 1}" style="margin-bottom:.4rem" autocapitalize="characters">`).join('')}` : ''}
    </section>

    ${S.kind === 'mgmt' ? `<section class="card"><h2>Testo</h2><textarea id="text" style="font-family:var(--mono)">${esc(S.text)}</textarea><p class="muted" style="font-size:.85rem">Una riga per ogni riga stampata (max 46 caratteri).</p></section>` : `
    <section class="card">
      <h2>Righe</h2>
      <div class="table-wrap"><table class="t"><thead><tr><th>Descrizione</th><th>Rep.</th><th>Q.tà</th><th>Prezzo €</th><th></th></tr></thead><tbody>
      ${S.rows.map((r, i) => `<tr>
        <td><input type="text" data-r="${i}" data-k="desc" maxlength="38" value="${esc(r.desc)}" autocapitalize="characters"></td>
        <td><input type="number" data-r="${i}" data-k="dept" min="1" max="99" value="${r.dept}" style="width:64px" inputmode="numeric"></td>
        <td><input type="number" data-r="${i}" data-k="qty" step="0.001" min="0.001" value="${r.qty}" style="width:80px" inputmode="decimal"></td>
        <td><input type="number" data-r="${i}" data-k="price" step="0.01" min="0" value="${r.price}" style="width:96px" inputmode="decimal"></td>
        <td><button class="btn small ghost" data-del="${i}" ${S.rows.length < 2 ? 'disabled' : ''}>✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="actions"><button class="btn small secondary" id="addRow">Aggiungi riga</button></div>
      <div class="form-grid" style="margin-top:.6rem">
        <label class="field"><span>Pagamento</span><select id="pay">${Object.entries(PAY).map(([k, t]) => `<option value="${k}" ${k === S.pay ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${S.kind === 'sale' ? `<label class="field"><span>Codice lotteria (facoltativo)</span><input type="text" id="lottery" maxlength="8" value="${esc(S.lottery)}" autocapitalize="characters"></label>` : ''}
      </div>
      <p style="text-align:right;font-weight:700;font-size:1.1rem">Totale € ${eur(total())}</p>
    </section>`}

    ${S.last ? `<section class="card"><h2>Ultimo documento</h2><dl class="kv">
      ${Object.entries(S.last).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>` : ''}
    <div class="sticky-actions"><button class="btn" id="btnEmit">Emetti ${esc(KINDS[S.kind].toLowerCase())}</button></div>`;

  const save = () => saveCache();
  $('#kind', main).onchange = (e) => { S.kind = e.target.value; save(); cassa(main); };
  $$('[data-r]', main).forEach((inp) => inp.addEventListener('change', () => {
    const r = S.rows[Number(inp.dataset.r)]; const k = inp.dataset.k;
    r[k] = k === 'desc' ? C.toPrinterText(inp.value).slice(0, 38) : Number(inp.value);
    save(); cassa(main);
  }));
  $$('[data-del]', main).forEach((b) => b.addEventListener('click', () => { S.rows.splice(Number(b.dataset.del), 1); save(); cassa(main); }));
  $('#addRow', main)?.addEventListener('click', () => { S.rows.push({ desc: 'ARTICOLO', dept: 1, qty: 1, price: 1.00 }); save(); cassa(main); });
  $('#pay', main)?.addEventListener('change', (e) => { S.pay = e.target.value; save(); });
  $('#lottery', main)?.addEventListener('change', (e) => { S.lottery = e.target.value.trim().toUpperCase(); save(); });
  $('#text', main)?.addEventListener('change', (e) => { S.text = e.target.value; save(); });
  $$('[data-client]', main).forEach((inp) => inp.addEventListener('change', () => { S.client[Number(inp.dataset.client)] = C.toPrinterText(inp.value); save(); }));
  ['refZ', 'refN', 'refDate', 'refSerial'].forEach((id) => $(`#${id}`, main)?.addEventListener('change', (e) => { S[id] = e.target.value.trim().toUpperCase(); save(); }));

  $('#btnEmit', main).onclick = async () => {
    let body; let label;
    const [ptype, pidx] = S.pay.split('|');
    const items = (tag) => S.rows.map((r) => fp.el(tag, { operator: '1', description: r.desc || 'ARTICOLO', quantity: String(r.qty).replace('.', ','), unitPrice: eur(r.price), department: String(r.dept), justification: '1' })).join('');
    const totalXml = (desc) => fp.el('printRecTotal', { operator: '1', description: desc, payment: eur(total()), paymentType: ptype, index: pidx, justification: '1' });
    if (S.kind !== 'mgmt' && (!S.rows.length || total() <= 0)) { toast('Inserisci almeno una riga con importo', 'warn'); return; }
    if (S.kind === 'mgmt') {
      const lines = String(S.text).split(/\r?\n/).map((l) => C.toPrinterText(l).slice(0, 46));
      label = 'documento gestionale';
      if (!await confirmBox('Emetti documento', `Stampare un documento gestionale di ${lines.length} righe?`, { okText: 'Stampa' })) return;
      return task('Stampa…', async () => { await call((pr) => fp.printNonFiscal(pr, lines)); toast('Documento stampato', 'ok'); });
    }
    if (S.kind === 'sale') {
      label = 'documento commerciale';
      body = fp.el('printerFiscalReceipt', {}, [
        fp.el('beginFiscalReceipt', { operator: '1' }), items('printRecItem'),
        S.lottery ? fp.el('printRecLotteryID', { operator: '1', code: S.lottery }) : '',
        totalXml(PAY[S.pay].toUpperCase()), fp.el('endFiscalReceipt', { operator: '1' }),
      ].join(''));
    } else if (S.kind === 'refund' || S.kind === 'void') {
      if (!S.refSerial) {
        // matricola RT a 11 caratteri letta dalla stampante (3217 + tipo dispositivo dallo stato RT)
        try {
          const ser = C.decodeSerial((await call((pr) => fp.directIO(pr, C.CMD.READ_SERIAL, '01', { label: 'Lettura matricola' }))).data);
          const rt = await fp.queryStatus(p, 1);
          c.serial = ser; c.rt = rt; S.refSerial = C.rtSerial(ser, rt.rtType) || ''; saveCache();
        } catch { /* l'utente la inserisce a mano */ }
      }
      const d = S.refDate ? S.refDate.split('-').reverse().join('') : '';
      const okRef = /^\d{1,4}$/.test(S.refZ) && /^\d{1,4}$/.test(S.refN) && /^\d{8}$/.test(d) && (/^[A-Z0-9]{11}$/.test(S.refSerial) || /^(POS|VR|ND)$/.test(S.refSerial));
      if (!okRef) { toast('Completa il documento di riferimento (Z, numero, data, matricola)', 'warn'); return; }
      const ref = `${C.num(S.refZ, 4)} ${C.num(S.refN, 4)} ${d} ${S.refSerial}`;
      const flag = await readFlag(p, S.kind === 'refund' ? 58 : 59);
      const tag = flag === 1 ? 'printRecRefund' : 'printRecItem';
      label = S.kind === 'refund' ? 'documento di reso' : 'documento di annullo';
      body = fp.el('printerFiscalReceipt', {}, [
        fp.el('printRecMessage', { operator: '1', messageType: '4', message: `${S.kind === 'refund' ? 'REFUND' : 'VOID'} ${ref}` }),
        items(tag), totalXml(S.kind === 'refund' ? 'RESO' : 'ANNULLO'), fp.el('endFiscalReceipt', { operator: '1' }),
      ].join(''));
    } else {
      label = 'fattura diretta';
      body = fp.el('printerFiscalDocument', {}, [
        ...S.client.filter((l) => l && l.trim()).slice(0, 5).map((l, i) => fp.el('printRecMessage', { operator: '1', messageType: '6', index: String(i + 1), font: '1', message: l })),
        fp.el('beginFiscalDocument', { operator: '1', documentType: 'directInvoice', documentNumber: '0' }),
        items('printRecItem'), totalXml(PAY[S.pay].toUpperCase()), fp.el('endFiscalDocument', { operator: '1' }),
      ].join(''));
    }
    if (!await confirmBox('Emetti documento', `Emettere un ${label} di € ${eur(total())}? È un documento fiscale reale.`, { okText: 'Emetti', danger: true })) return;
    await task('Emissione…', async () => {
      const r = await call((pr) => fp.rawXmlChecked(pr, body, 60000));
      const i = r.info;
      S.last = {
        Tipo: KINDS[S.kind],
        ...(i.fiscalReceiptNumber ? { Numero: `${C.num(i.zRepNumber || 0, 4)}-${C.num(i.fiscalReceiptNumber, 4)}` } : {}),
        ...(i.fiscalReceiptAmount ? { Importo: `€ ${i.fiscalReceiptAmount}` } : {}),
        ...(i.fiscalReceiptDate ? { Data: `${i.fiscalReceiptDate} ${i.fiscalReceiptTime || ''}` } : {}),
        ...(i.invoiceNumber ? { 'Numero fattura': i.invoiceNumber } : {}),
      };
      if (S.kind === 'sale' && i.fiscalReceiptNumber) Object.assign(S, { refZ: String(i.zRepNumber || ''), refN: String(i.fiscalReceiptNumber), refDate: new Date().toISOString().slice(0, 10) });
      save();
      toast('Documento emesso', 'ok');
    });
    cassa(main);
  };
}

async function readFlag(p, n) {
  const r = await fp.directIO(p, C.CMD.READ_FLAG, C.num(n, 2), { allowFail: true, label: `Lettura flag ${n}` });
  const d = r.response.success ? C.decodeFlag(n, r.data) : { ok: false };
  return d.ok ? d.value : null;
}
