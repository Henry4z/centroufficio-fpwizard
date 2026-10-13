// Gestione loghi: conversione immagini in BMP monocromatico e lettura dei file raster Epson (.bin).

export const MAX_LOGO_BYTES = 20000; // limite del comando setLogo (dati non codificati)
export const PAPER_DOTS = { 80: 512, 58: 384 };

export const STANDARD_LOGOS = [
  { id: '01_epson', name: 'Epson' },
  { id: '02_pasqua', name: 'Pasqua' },
  { id: '03_halloween', name: 'Halloween' },
  { id: '04_natalea', name: 'Natale A' },
  { id: '05_nataleb', name: 'Natale B' },
  { id: '06_valentino', name: 'San Valentino' },
  { id: '07_palloncini', name: 'Palloncini' },
  { id: '08_vacanze', name: 'Vacanze' },
  { id: '09_torta', name: 'Torta' },
];

/**
 * Analizza un file raster Epson (GS 8 L ... fn=67, definizione grafica NV).
 * Restituisce dimensioni, coppia key code e indice logo (KC2 - 48 per i modelli RT).
 */
export function parseRaster(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 18 || b[0] !== 0x1d || b[1] !== 0x38 || b[2] !== 0x4c || b[8] !== 0x43) {
    throw new Error('File raster non riconosciuto (atteso formato Epson "Define NV graphics").');
  }
  const kc1 = b[10], kc2 = b[11];
  const width = b[13] | (b[14] << 8);
  const height = b[15] | (b[16] << 8);
  return {
    width, height, kc1, kc2,
    index: kc1 === 48 ? kc2 - 48 : kc1 === 32 ? kc2 - 31 : null,
    newModels: kc1 === 48,
    offset: 18,
    bytes: b,
  };
}

/** Disegna un raster Epson su canvas. */
export function drawRaster(canvas, r) {
  canvas.width = r.width; canvas.height = r.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(r.width, r.height);
  const rowBytes = Math.ceil(r.width / 8);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const byte = r.bytes[r.offset + y * rowBytes + (x >> 3)] ?? 0;
      const black = (byte >> (7 - (x & 7))) & 1;
      const i = (y * r.width + x) * 4;
      const v = black ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Righe massime per stare nel limite di 20000 byte. */
export function maxHeightFor(width) {
  const rowBytes = Math.ceil(width / 32) * 4;
  return Math.floor((MAX_LOGO_BYTES - 62) / rowBytes);
}

/**
 * Converte un'immagine in bitmap 1 bit.
 * opts: { width, threshold (0-255), dither (bool), invert (bool) }
 * Restituisce { width, height, bits: Uint8Array (1 = nero) }.
 */
export function toMonochrome(img, { width, threshold = 140, dither = true, invert = false }) {
  const w = Math.max(8, Math.min(width, img.naturalWidth || img.width));
  let h = Math.max(1, Math.round((img.naturalHeight || img.height) * (w / (img.naturalWidth || img.width))));
  h = Math.min(h, maxHeightFor(w));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = l * a + 255 * (1 - a);
  }
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const black = old < threshold ? 1 : 0;
      bits[i] = invert ? 1 - black : black;
      if (dither) {
        const err = old - (black ? 0 : 255);
        if (x + 1 < w) gray[i + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) gray[i + w - 1] += err * 3 / 16;
          gray[i + w] += err * 5 / 16;
          if (x + 1 < w) gray[i + w + 1] += err * 1 / 16;
        }
      }
    }
  }
  return { width: w, height: h, bits };
}

export function drawMono(canvas, m) {
  canvas.width = m.width; canvas.height = m.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(m.width, m.height);
  for (let i = 0; i < m.bits.length; i++) {
    const v = m.bits[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Codifica una bitmap 1 bit in file BMP (palette: 0 = nero, 1 = bianco). */
export function encodeBmp1(m) {
  const rowBytes = Math.ceil(m.width / 32) * 4;
  const imageSize = rowBytes * m.height;
  const size = 62 + imageSize;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8[0] = 0x42; u8[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 62, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, m.width, true);
  dv.setInt32(22, m.height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 1, true);
  dv.setUint32(30, 0, true);
  dv.setUint32(34, imageSize, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 2, true);
  dv.setUint32(50, 2, true);
  // palette: indice 0 nero, indice 1 bianco
  u8[54] = 0; u8[55] = 0; u8[56] = 0; u8[57] = 0;
  u8[58] = 255; u8[59] = 255; u8[60] = 255; u8[61] = 0;
  for (let y = 0; y < m.height; y++) {
    const row = 62 + (m.height - 1 - y) * rowBytes; // BMP bottom-up
    for (let x = 0; x < m.width; x++) {
      const white = m.bits[y * m.width + x] ? 0 : 1;
      if (white) u8[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
    // padding bit oltre la larghezza: bianco
    for (let x = m.width; x < rowBytes * 8; x++) u8[row + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return u8;
}

export function toBase64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}
