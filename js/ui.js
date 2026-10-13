// Utilità di interfaccia: selettori, escaping, notifiche, finestre modali, attività con avanzamento.

/** Sostituisce il contenitore con una copia vuota, eliminando i listener della vista precedente. */
export function fresh(el) {
  const n = el.cloneNode(false);
  el.replaceWith(n);
  return n;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const store = {
  get(k, d) {
    try { const v = localStorage.getItem('fpw.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('fpw.' + k, JSON.stringify(v)); } catch { /* memoria non disponibile */ }
  },
  del(k) {
    try { localStorage.removeItem('fpw.' + k); } catch { /* ignorato */ }
  },
};

// ---------------------------------------------------------------------------
// Notifiche
// ---------------------------------------------------------------------------

export function toast(msg, type = '', ms = 3800) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? Math.max(ms, 6500) : ms);
}

// ---------------------------------------------------------------------------
// Finestre modali (bottom sheet)
// ---------------------------------------------------------------------------

let dismissCurrent = null;
/** Chiude l'eventuale pannello aperto (es. quando si cambia pagina). */
export function closeSheet() { dismissCurrent?.(); }

export function openSheet(html, { onMount, onDismiss, dismissable = true } = {}) {
  closeSheet();
  const modal = $('#modal');
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  modal.hidden = false;
  const sheet = modal.firstElementChild;
  let closed = false;
  const close = (dismissed = false) => {
    if (closed) return;
    closed = true;
    modal.hidden = true;
    modal.innerHTML = '';
    modal.onclick = null;
    document.removeEventListener('keydown', onKey);
    if (dismissCurrent === dismissThis) dismissCurrent = null;
    if (dismissed) onDismiss?.();
  };
  const dismissThis = () => close(true);
  dismissCurrent = dismissThis;
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(true); };
  document.addEventListener('keydown', onKey);
  modal.onclick = (e) => { if (e.target === modal && dismissable) close(true); };
  onMount?.(sheet, () => close(false));
  return { sheet, close: () => close(false) };
}

export function confirmBox(title, message, { okText = 'Conferma', cancelText = 'Annulla', danger = false, html = false } = {}) {
  return new Promise((resolve) => {
    openSheet(`
      <h2>${esc(title)}</h2>
      <div class="stack">${html ? message : `<p>${esc(message)}</p>`}</div>
      <div class="actions">
        <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okText)}</button>
        <button class="btn ghost" data-cancel>${esc(cancelText)}</button>
      </div>`, {
      onDismiss: () => resolve(false),
      onMount(sheet, close) {
        sheet.querySelector('[data-ok]').onclick = () => { close(); resolve(true); };
        sheet.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
      },
    });
  });
}

export function promptBox(title, message, { value = '', type = 'text', okText = 'OK', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    openSheet(`
      <h2>${esc(title)}</h2>
      <p>${esc(message)}</p>
      <input type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" data-in autocomplete="off">
      <div class="actions">
        <button class="btn" data-ok>${esc(okText)}</button>
        <button class="btn ghost" data-cancel>Annulla</button>
      </div>`, {
      onDismiss: () => resolve(null),
      onMount(sheet, close) {
        const inp = sheet.querySelector('[data-in]');
        setTimeout(() => inp.focus(), 50);
        const ok = () => { close(); resolve(inp.value); };
        inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
        sheet.querySelector('[data-ok]').onclick = ok;
        sheet.querySelector('[data-cancel]').onclick = () => { close(); resolve(null); };
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Attività con overlay di attesa e avanzamento
// ---------------------------------------------------------------------------

export class Cancelled extends Error { constructor() { super('Operazione interrotta'); this.name = 'Cancelled'; } }

let running = false;
let cancelRequested = false;

/**
 * Esegue `fn(ctx)` mostrando un overlay. ctx.progress(i, n, testo) aggiorna la barra;
 * ctx.check() lancia Cancelled se l'utente ha premuto "Interrompi".
 */
export async function task(text, fn, { cancellable = false, quiet = false } = {}) {
  if (running) { toast('Attendere il termine dell\'operazione in corso', 'warn'); return undefined; }
  running = true;
  cancelRequested = false;
  const box = $('#busy');
  const label = $('#busyText');
  const bar = $('#busyProgress');
  const cancel = $('#busyCancel');
  label.textContent = text;
  bar.hidden = true;
  bar.firstElementChild.style.width = '0';
  cancel.hidden = !cancellable;
  cancel.onclick = () => { cancelRequested = true; label.textContent = 'Interruzione…'; };
  box.hidden = false;
  const ctx = {
    progress(i, n, t) {
      bar.hidden = false;
      bar.firstElementChild.style.width = `${Math.round((i / Math.max(1, n)) * 100)}%`;
      if (t) label.textContent = t;
    },
    text(t) { label.textContent = t; },
    check() { if (cancelRequested) throw new Cancelled(); },
  };
  try {
    return await fn(ctx);
  } catch (e) {
    if (e instanceof Cancelled) toast('Operazione interrotta', 'warn');
    else if (!quiet) toast(e.message || String(e), 'error');
    if (quiet) throw e;
    return undefined;
  } finally {
    box.hidden = true;
    running = false;
  }
}

export const isBusy = () => running;

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

export async function saveFile(name, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const file = typeof File === 'function' ? new File([blob], name, { type: mime }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

/**
 * Campo indirizzo IP: il tastierino numerico dell'iPhone in italiano ha la virgola e non il punto,
 * quindi mentre si scrive ogni virgola diventa un punto (il cursore resta dov'era).
 */
export function ipField(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    if (!input.value.includes(',')) return;
    const pos = input.selectionStart;
    input.value = input.value.replace(/,/g, '.');
    try { input.setSelectionRange(pos, pos); } catch { /* alcuni tipi di campo non lo consentono */ }
  });
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiato negli appunti', 'ok'); } catch { toast('Copia non disponibile', 'warn'); }
}

// ---------------------------------------------------------------------------
// Icone (SVG inline, stile a linea)
// ---------------------------------------------------------------------------

const P = {
  printer: 'M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z',
  status: 'M3 12h4l3-8 4 16 3-8h4',
  header: 'M4 5h16M4 10h16M7 15h10M9 20h6',
  vat: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  dept: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 1 0 0-.01',
  report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  backup: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  log: 'M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M9 3h6v3H9zM7 4.5H5v16h14v-16h-2M8.5 13l2.5 2.5 4.5-5',
  journal: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 8.5h0',
  keyboard: 'M3 6h18v12H3zM7 10h0M11 10h0M15 10h0M7 14h10',
  cart: 'M3 4h2l2.5 11h11L21 7H6.2M9 20h0M18 20h0',
  sd: 'M7 3h8l4 4v14H7zM10 3v4M13 3v4M16 7v0',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sync: 'M20 11a8 8 0 0 0-14.9-3.9L4 9M4 4v5h5M4 13a8 8 0 0 0 14.9 3.9L20 15M20 20v-5h-5',
};
export function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${P[name] || ''}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
