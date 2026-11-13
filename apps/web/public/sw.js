const CACHE_NAME = 'luki-fitti-shell-v4';
const STATIC_ASSETS = ['/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((oldKey) => caches.delete(oldKey)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API mutations or auth calls in the service worker;
  // active workouts and offline mutations are durably managed in IndexedDB.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  // Navigation requests: network-first, falling back to cached shell '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/');
        }),
    );
    return;
  }

  // Static assets (_next/static, icons, fonts): network-first with cache fallback for offline support
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)),
    );
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SHOW_NOTIFICATION' && self.registration) {
    event.waitUntil(
      self.registration.showNotification(data.title || 'LukiFitti', {
        body: data.body || '',
        tag: data.tag || 'luki-fitti-notification',
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!self.registration) return;
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'LukiFitti', {
      body: payload.body || '',
      tag: payload.tag || 'luki-fitti-notification',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/';
  const openUrl = '/?open=' + encodeURIComponent(target);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client
            .focus()
            .then((focused) =>
              focused && 'navigate' in focused ? focused.navigate(openUrl) : focused,
            );
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(openUrl);
      }
      return undefined;
    }),
  );
});
