// Service worker: riceve le notifiche push.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// File dell'app: sempre verificati sul server (no-cache), così dopo un aggiornamento
// non si mescolano file vecchi della cache di Safari con file nuovi.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const fresh = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(new Request(req, { cache: 'no-cache' }));
  event.respondWith(fresh.catch(() => fetch(req)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  // Su iOS ogni push deve mostrare una notifica visibile.
  event.waitUntil(
    self.registration.showNotification(data.title || 'Palestrina', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { tab: data.tab || '' },
    })
  );
});

// Tocco sulla notifica: apre l'app sul tab giusto (es. la chat).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = (event.notification.data && event.notification.data.tab) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => 'focus' in c);
      if (client) {
        if (tab) client.postMessage({ tab });
        return client.focus();
      }
      return self.clients.openWindow(self.registration.scope + (tab ? `?tab=${tab}` : ''));
    })
  );
});
