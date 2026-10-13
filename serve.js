// Piccolo server statico per usare l'app dalla rete locale (es. da iPhone) senza HTTPS.
// Uso:  node serve.js [porta]      (predefinita 8080)
// Poi apri da Safari:  http://IP-DEL-PC:8080/

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = __dirname;
const port = Number(process.argv[2]) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bin': 'application/octet-stream', '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  // indirizzi malformati (es. "//" o "%zz") non devono far cadere il server
  let p;
  try {
    p = decodeURIComponent(String(req.url || '/').split(/[?#]/)[0]).replace(/\/{2,}/g, '/');
  } catch {
    res.writeHead(400); res.end('Indirizzo non valido'); return;
  }
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  // come GitHub Pages: «/collega» serve «collega.html»
  const target = !path.extname(file) && fs.existsSync(`${file}.html`) ? `${file}.html` : file;
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); res.end('Non trovato'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`FP Wizard in ascolto sulla porta ${port}`);
  for (const ip of ips) console.log(`  http://${ip}:${port}/`);
  console.log(`  http://localhost:${port}/`);
});
