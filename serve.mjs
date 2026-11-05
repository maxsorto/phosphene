#!/usr/bin/env node
// Local server: the static site plus the two /api functions, the same way
// Vercel runs them. No dependencies.   node serve.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = +process.argv[2] || +process.env.PORT || 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// A small stand-in for Vercel's (req, res) helpers.
function wrap(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  res.send = b => res.end(b);
}
async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  try { return JSON.parse(s); } catch { return {}; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    try {
      const mod = await import(`./api/${name}.js`);
      wrap(req, res, url);
      if (req.method === 'POST') req.body = await body(req);
      await mod.default(req, res);
    } catch (e) {
      res.statusCode = 404; res.end('no such function: ' + name + '\n' + e.message);
    }
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  const file = join(root, p);
  if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
  try {
    const s = await stat(file);
    const f = s.isDirectory() ? join(file, 'index.html') : file;
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(await readFile(f));
  } catch {
    res.statusCode = 404; res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`phosphene  http://127.0.0.1:${port}/`));
