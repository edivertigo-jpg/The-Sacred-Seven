// ================================================================
//  IMU Monitor — Service Worker (PWA)
//  Cache Strategy: Network-first untuk API, Cache-first untuk aset
// ================================================================

const CACHE_NAME    = 'imu-monitor-v1';
const CACHE_STATIC  = 'imu-static-v1';

// Aset yang di-cache saat install
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

// ── Install: pre-cache aset statis ───────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log('[SW] Pre-caching static assets');
      // Gunakan individual add agar 1 error tidak gagalkan semua
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: hapus cache lama ────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) {
            return name !== CACHE_NAME && name !== CACHE_STATIC;
          })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: strategi berdasarkan tipe request ──────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // 1. Request ke Google Apps Script API → Network-only
  //    (data real-time, tidak di-cache)
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ success: false, error: 'Offline — tidak dapat terhubung ke server' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2. Google Fonts → Cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  // 3. Aset lokal (HTML, icons, manifest) → Cache-first, fallback ke network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          // Cache response baru
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_STATIC).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          // Offline fallback → kembalikan index.html
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // 4. Request lainnya → pass through
  event.respondWith(fetch(event.request));
});

// ── Background Sync (opsional) ────────────────────────────────
self.addEventListener('sync', function(event) {
  console.log('[SW] Background sync:', event.tag);
});

// ── Push Notification (siap untuk future use) ─────────────────
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  var title   = data.title   || 'IMU Monitor';
  var options = {
    body: data.body || 'Ada notifikasi baru',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
