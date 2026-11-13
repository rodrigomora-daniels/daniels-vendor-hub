/* My Daniels Workspace — minimal service worker.
   - Makes the app installable (PWA).
   - NETWORK-FIRST for our own pages: users always get the latest deploy when online;
     the cached copy is only a fallback when the connection drops.
   - Never touches Supabase or any other cross-origin request, and never caches POSTs. */
const CACHE = 'dhc-v1';
const PRECACHE = ['offline.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, fonts, etc.: go straight to network
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('offline.html') : Response.error()))
    )
  );
});
