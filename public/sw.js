const VERSION = 'pudata-static-v1';
const STATIC_ASSETS = [
  '/styles.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];
const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111111"><title>pudata offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;font:16px system-ui,sans-serif;text-align:center}main{max-width:320px;padding:28px}b{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 20px;border-radius:16px 16px 16px 4px;background:#111;color:#fff;font-size:36px}p{color:#666;line-height:1.5}</style></head><body><main><b>p</b><h1>You’re offline</h1><p>Reconnect to continue using pudata.</p></main></body></html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(STATIC_ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
function isNeverCache(url) {
  return url.origin !== self.location.origin || /supabase|auth|payment|api|functions|flutterwave|recheck|create-purchase|transaction-pin/i.test(url.pathname + url.search);
}
function isStaticAsset(request, url) {
  return request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.destination === 'font' || url.pathname === '/manifest.webmanifest';
}
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isNeverCache(url)) { event.respondWith(fetch(request)); return; }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (isStaticAsset(request, url)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then((cache) => cache.put(request, copy)); } return response; })));
  }
});
