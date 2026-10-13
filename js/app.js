// Avvio, navigazione e barra superiore.

import { $, esc, fresh, closeSheet } from './ui.js';
import { state, current, onChange } from './state.js';
import * as G from './views/general.js';
import * as K from './views/config.js';
import * as T from './views/tools.js';
import { vp } from './views/vp.js';
import { dgfe } from './views/dgfe.js';
import { totals } from './views/totals.js';
import { extras } from './views/extras.js';
import { plu } from './views/plu.js';
import { diag } from './views/diag.js';
import { cassa } from './views/cassa.js';
import { cambio } from './views/cambio.js';
import { keys } from './views/keys.js';
import { iva } from './views/iva.js';
import { net } from './views/net.js';
import { tx } from './views/tx.js';
import { moduli } from './views/moduli.js';

const ROUTES = {
  home: { title: 'FP Wizard', view: G.home, root: true },
  printers: { title: 'Stampanti', view: G.printers },
  printer: { title: 'Stampante', view: G.printerEdit, back: 'printers' },
  status: { title: 'Stato e info', view: G.status },
  header: { title: 'Intestazione', view: K.header },
  vat: { title: 'Aliquote IVA', view: K.vat },
  depts: { title: 'Reparti', view: K.depts },
  flags: { title: 'Flag SET 14', view: K.flags },
  conf: { title: 'Parametri SET 15', view: K.conf },
  tables: { title: 'Operatori e pagamenti', view: K.tables },
  logos: { title: 'Loghi', view: T.logos },
  reports: { title: 'Rapporti X / Z', view: T.reports },
  vp: { title: 'Verificazione periodica', view: vp },
  dgfe: { title: 'Giornale elettronico', view: dgfe },
  tx: { title: 'Trasmissioni AdE', view: tx },
  totals: { title: 'Totalizzatori', view: totals },
  extras: { title: 'Altre impostazioni', view: extras },
  iva: { title: 'IVA, nature e ATECO', view: iva },
  net: { title: 'Rete e servizi', view: net },
  plu: { title: 'PLU', view: plu },
  diag: { title: 'Diagnostica', view: diag },
  cassa: { title: 'Simulatore cassa', view: cassa },
  cambio: { title: 'Cambio DGFE', view: cambio },
  moduli: { title: 'Moduli tecnico', view: moduli },
  keys: { title: 'Tastiera', view: keys },
  backup: { title: 'Backup e ripristino', view: T.backup },
  console: { title: 'Direct IO', view: T.console_ },
  log: { title: 'Registro', view: G.log },
  help: { title: 'Guida', view: G.help },
};

function render() {
  closeSheet();
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const route = ROUTES[name] || ROUTES.home;
  $('#title').textContent = route.title;
  // nella home il logo Centro Ufficio prende il posto del titolo
  $('#title').hidden = !!route.root;
  $('#brand').hidden = !route.root;
  document.title = route.root ? 'FP Wizard · Centro Ufficio' : `${route.title} · FP Wizard`;
  const back = $('#btnBack');
  back.hidden = !!route.root;
  back.onclick = () => { location.hash = '#/' + (route.back || 'home'); };
  route.view(fresh($('#view')), ...args.map(decodeURIComponent));
  window.scrollTo(0, 0);
}

function renderPill() {
  const p = current();
  $('#printerName').textContent = p ? p.name : 'Nessuna stampante';
  const dot = $('#printerDot');
  dot.className = 'dot' + (p?.simulator ? ' sim' : p && state.conn[p.id] === true ? ' ok' : p && state.conn[p.id] === false ? ' err' : '');
  $('#printerPill').title = p ? (p.simulator ? 'Simulatore' : `${p.proto}://${p.host}`) : '';
}

$('#printerPill').addEventListener('click', () => { location.hash = '#/printers'; });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (t && t.tagName !== 'FORM' && !t.closest('.sheet')) { e.preventDefault(); location.hash = '#/' + t.dataset.go; }
});
window.addEventListener('hashchange', render);
// cambiando stampante la pagina aperta va ridisegnata con i dati della nuova stampante
let shownPrinter = current()?.id ?? null;
onChange(() => {
  renderPill();
  const id = current()?.id ?? null;
  if (id !== shownPrinter) { shownPrinter = id; render(); }
});
renderPill();
render();

// Service worker: cache dell'app per l'uso offline (solo in contesto sicuro: HTTPS o localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non indispensabile */ });
  });
}

// Messaggio in caso di errori JavaScript non gestiti, per non lasciare l'utente senza indicazioni.
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
});
window.addEventListener('error', (e) => {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast error';
  t.innerHTML = `Errore imprevisto: ${esc(e.message)}`;
  box.appendChild(t);
  setTimeout(() => t.remove(), 6000);
});
