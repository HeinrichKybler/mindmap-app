// Service worker — cache-first pro shell, network-first pro /api/, offline fallback
const CACHE = 'mindmap-v8';

// Aplikační shell cachovaný při instalaci
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/app.js',
  '/js/api.js',
  '/js/canvas.js',
  '/js/nodes.js',
  '/js/edges.js',
  '/js/groups.js',
  '/js/layout.js',
  '/js/history.js',
  '/js/search.js',
  '/js/timeline.js',
  '/js/tags.js',
  '/js/panel.js',
  '/js/sidebar.js',
  '/js/export.js',
  '/js/toast.js',
  '/js/cheatsheet.js',
  '/js/templates.js',
  '/js/focus.js',
  '/js/pitch.js',
  '/js/drill.js',
  '/js/context-menu.js',
  '/js/stats.js',
  '/js/settings.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install — přednačti shell (jednotlivé chyby ignoruj)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

// Activate — vyčisti staré verze cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first pro API: při výpadku vrať 503 + JSON
function apiFetch(request) {
  return fetch(request).catch(() =>
    new Response(JSON.stringify({ error: 'Server není dostupný' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

// Cache-first pro shell: cache → síť (a doplň do cache)
function shellFetch(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((res) => {
      // Uložení úspěšných GET odpovědí pro příští offline použití
      if (res && res.ok && request.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });
  });
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;  // mutace (POST/PUT/DELETE) nech projít na síť
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(apiFetch(request));
  } else {
    e.respondWith(shellFetch(request));
  }
});
