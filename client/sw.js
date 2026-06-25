// Service worker — cache-first pro shell, network-first pro /api/, offline fallback
const CACHE = 'mindmap-v16';

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
  '/js/prompt.js',
  '/js/references.js',
  '/js/markdown.js',
  '/js/detail.js',
  '/js/floating-toolbar.js',
  '/js/command-palette.js',
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

// Cache-first (obrázky, ikony, fonty) — mění se zřídka, šetří síť
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((res) => {
      if (res && res.ok && request.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });
  });
}

// Network-first (kód: HTML/JS/CSS/manifest) — vždy aktuální verze když běží server,
// cache slouží jen jako offline fallback. Bez toho starý SW servíruje starý kód po updatu.
function networkFirst(request) {
  return fetch(request).then((res) => {
    if (res && res.ok && request.method === 'GET') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request));
}

// Statická aktiva (cache-first): obrázky a ikony
function isAsset(pathname) {
  return /\.(png|jpe?g|svg|ico|webp|gif|woff2?|ttf)$/i.test(pathname) || pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;  // mutace (POST/PUT/DELETE) nech projít na síť
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(apiFetch(request));
  } else if (isAsset(url.pathname)) {
    e.respondWith(cacheFirst(request));
  } else {
    e.respondWith(networkFirst(request));  // HTML, JS, CSS, manifest, vendor skripty
  }
});
