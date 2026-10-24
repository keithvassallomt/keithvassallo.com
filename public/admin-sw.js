// The blog admin's service worker (src/admin/push.js registers it, scoped to /admin). It shows
// the notifications the admin's notifier sends when a job ends, and opens the admin, at the
// right post, when one is tapped. It caches nothing.
const adminWindows = async () =>
  (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((client) => new URL(client.url).pathname.startsWith('/admin'));

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    (async () => {
      // An open admin tab shows it as a toast as well. The system notification still shows,
      // because Safari drops a subscription whose pushes show nothing.
      for (const client of await adminWindows()) client.postMessage({ type: 'notification', title: data.title, body: data.body, url: data.url });
      await self.registration.showNotification(data.title || 'Blog admin', {
        body: data.body || '',
        icon: '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        tag: data.url,
        data: { url: data.url || '/admin' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin';
  event.waitUntil(
    (async () => {
      const [admin] = await adminWindows();
      if (admin && new URL(url, self.location.origin).pathname.startsWith('/admin')) {
        await admin.focus();
        return admin.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })(),
  );
});
