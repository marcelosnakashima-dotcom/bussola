const CACHE = 'bussola-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Bússola';
  const opts = { body: data.body || 'Você tem uma conta a vencer.', icon: 'icon-192.png', badge: 'icon-192.png', tag: data.tag || 'bussola-push', data: { url: data.url || '.' }, requireInteraction: false };
  event.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '.';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const ex = clients.find(c => c.url.includes(self.location.origin));
    if (ex) return ex.focus();
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
  }).then(sub => self.clients.matchAll({ type: 'window' }).then(clients =>
    clients.forEach(c => c.postMessage({ type: 'SUBSCRIPTION_CHANGED', subscription: sub.toJSON() }))
  )));
});
