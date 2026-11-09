import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'pudata' }));
    return;
  }

  if (url.pathname === '/config.js') {
    const publicConfig = {
      supabaseUrl: process.env.VITE_SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
      flutterwavePublicKey: process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '',
      appUrl: process.env.VITE_APP_URL || ''
    };
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(`window.PUDATA_CONFIG = ${JSON.stringify(publicConfig)};`);
    return;
  }

  const requested = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const safePath = requested.startsWith('/') ? requested.slice(1) : requested;
  const candidate = join(root, safePath);
  try {
    const body = await readFile(candidate);
    res.writeHead(200, {
      'content-type': mime[extname(candidate)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(body);
  } catch {
    const fallback = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(fallback);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`pudata listening on ${port}`);
});
