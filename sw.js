// ================================================================
//  IMU Monitor — Service Worker (PWA) v4
// ================================================================

const APP_VERSION  = 'v4';
const CACHE_STATIC = 'imu-static-' + APP_VERSION;

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting(); // langsung aktif tanpa tunggu tab lama ditutup
    })
  );
});

// ── Activate: hapus semua cache lama ─────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_STATIC) {
            console.log('[SW] Hapus cache lama:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
        });
      });
    })
  );
});

// ── Fetch: hapus cache & ambil fresh setiap kali dibuka ──────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Google Apps Script → network only
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ success: false, error: 'Offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Google Fonts → cache first
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

  // Aset lokal → selalu ambil dari network (fresh), update cache, fallback ke cache kalau offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(function(cache) {
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            // Hapus cache lama untuk URL ini, simpan yang baru
            cache.delete(event.request).then(function() {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        }).catch(function() {
          // Offline → fallback ke cache
          return cache.match(event.request).then(function(cached) {
            if (cached) return cached;
            if (event.request.destination === 'document') {
              return cache.match('./index.html');
            }
          });
        });
      })
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

// ── Message: hapus cache manual dari halaman ─────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(function(cacheNames) {
      return Promise.all(cacheNames.map(function(name) {
        return caches.delete(name);
      }));
    }).then(function() {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});

// ── Push Notification ─────────────────────────────────────────
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || 'IMU Monitor';
  var options = {
    body: data.body || 'Ada notifikasi baru',
    icon: './icon-192x192.png',
    badge: './icon-192x192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
