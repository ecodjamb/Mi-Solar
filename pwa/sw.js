self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || 'Mi Solar';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'La automatización solar fue evaluada.',
    icon: payload.icon || '/misolar-arrayan-animated-192.png?v=6',
    badge: payload.icon || '/misolar-arrayan-animated-192.png?v=6',
    data: payload.data || { url: '/?page=programming' },
    tag: payload.data?.type ? `mi-solar-${payload.data.type}` : 'mi-solar',
    renotify: true
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/?page=programming';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => 'focus' in client);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
