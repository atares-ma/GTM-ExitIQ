// Serves site/ with the same security headers vercel.json ships, so the CSP
// can be verified against the real page before deploying.
// Usage: node tests/csp-server.mjs [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('../site', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/' || path === '') path = '/index.html';
  try {
    const body = readFileSync(join(root, path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', ...headers });
    res.end(body);
  } catch {
    res.writeHead(404, headers);
    res.end('not found');
  }
}).listen(Number(process.argv[2] || 8081), '127.0.0.1', () => console.log('csp server on', process.argv[2] || 8081));
