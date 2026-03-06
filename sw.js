
// sw.js - UmiCare Service Worker v3.2
// Handles background push notifications with sound broadcast

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'UmiCare 🐾';
  const options = {
    body: data.body || '有任務待完成',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'umicare',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    data: { url: data.url || '/' },
  };
  e.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Broadcast to open app windows to play sound
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        windowClients.forEach(client => {
          client.postMessage({ type: 'push-received', title, body: options.body });
        });
        // Also broadcast via BroadcastChannel for apps that may not have focus
        try {
          const bc = new BroadcastChannel('push-notify');
          bc.postMessage({ type: 'push-received', title, body: options.body });
          bc.close();
        } catch(e) {}
      });
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(e.notification.data.url || '/');
    })
  );
});
