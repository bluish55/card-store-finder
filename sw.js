self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));

self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/vending.png',
      badge: '/icons/vending.png',
      data: { storeId: data.storeId, type: data.type }
    })
  );

  // localStorage에 알림 기록 저장 (클라이언트에 메시지 전달)
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'push-received', payload: data }));
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data;
  const url = data?.type === 'batch' ? '/?tab=notifications' : '/?tab=notifications';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'notification-click', payload: data });
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
