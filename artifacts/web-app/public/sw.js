self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'InstaFlow', {
      body: data.body || 'You have posts ready to review',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'instaflow-reminder',
      renotify: true,
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data?.url || '/')
  );
});
