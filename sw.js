// ================================================================
//  IMU Monitor — Service Worker (PWA) v2
//  Cache Strategy: Network-first untuk API, Cache-first untuk aset
//  Auto clear cache on update
// ================================================================

const APP_VERSION  = 'v2';   // Ganti versi ini setiap kali deploy baru
const CACHE_STATIC = 'imu-static-' + APP_VERSION;

// Aset yang di-cache saat install
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

// ── Install: pre-cache aset statis + skip waiting langsung ────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing version:', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log('[SW] Pre-caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function() {
      // Langsung aktif tanpa tunggu tab lama ditutup
      return self.skipWaiting();
    })
  );
});

// ── Activate: hapus SEMUA cache lama secara otomatis ──────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating version:', APP_VERSION);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          // Hapus semua cache yang BUKAN versi aktif
          if (name !== CACHE_STATIC) {
            console.log('[SW] 🗑 Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      console.log('[SW] ✅ Old caches cleared, claiming clients');
      // Langsung kontrol semua tab yang terbuka
      return self.clients.claim();
    }).then(function() {
      // Beritahu semua tab bahwa ada update
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
        });
      });
    })
  );
});

// ── Fetch: strategi berdasarkan tipe request ──────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // 1. Request ke Google Apps Script API → Network-only
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

  // 3. Aset lokal (HTML, icons, manifest) → Network-first, fallback ke cache
  //    Ini memastikan selalu dapat file terbaru saat online
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        // Update cache dengan versi terbaru
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback → ambil dari cache
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
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

// ── Background Sync ───────────────────────────────────────────
self.addEventListener('sync', function(event) {
  console.log('[SW] Background sync:', event.tag);
});

// ── Push Notification ─────────────────────────────────────────
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
