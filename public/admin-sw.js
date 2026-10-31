// The blog admin's service worker (src/admin/push.js registers it on every visit, scoped to
// /admin). It shows the notifications the admin's notifier sends when a job ends, and opens the
// admin, at the right post, when one is tapped.
//
// It also keeps the app's own files, so the installed admin opens without a connection: the
// page itself is fetched fresh whenever it can be and kept for when it can't, and the build's
// hashed files, which never change, come from the cache once fetched. Anything from another
// origin (the API, sign-in, GitHub) always goes to the network, untouched.
const CACHE = 'blog-admin-v1';
const SHELL = '/admin';
const KEEP = [SHELL, '/admin.webmanifest', '/admin-icons/icon.svg', '/admin-icons/icon-192.png', '/admin-icons/badge-96.png'];

self.addEventListener('install', (event) => {
  // A file that won't fetch now is fetched on first use instead
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(KEEP.map((path) => cache.add(path).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('blog-admin-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** The network's answer, kept for next time; what was kept, when there's no network. */
async function networkFirst(request, key = request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const kept = await cache.match(key, { ignoreSearch: true });
    if (kept) return kept;
    throw error;
  }
}

/** A file whose name changes whenever its contents do, so a kept copy is always right. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The admin page, whatever it was opened with (a sign-in's code, a shared link)
  if (request.mode === 'navigate') {
    if (url.pathname === '/admin' || url.pathname === '/admin/') event.respondWith(networkFirst(request, SHELL));
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/admin-icons/') || url.pathname === '/admin.webmanifest' || url.pathname === '/admin/posts.json') {
    event.respondWith(networkFirst(request));
  }
});

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
        icon: '/admin-icons/icon-192.png',
        // Android draws the status bar's icon from the alpha alone, so it's white on transparent
        badge: '/admin-icons/badge-96.png',
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
