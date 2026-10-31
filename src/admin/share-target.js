// Android's share sheet opens the installed admin at /admin?share-title=…&share-text=…&share-url=…
// (the share_target in public/admin.webmanifest). Before the router reads the address, that
// becomes the Ideas screen's own address, #/ideas?shared=1&title=…, which survives a sign-in like
// any other screen's.
const KEYS = ['title', 'text', 'url'];

if (typeof window !== 'undefined') {
  const query = new URLSearchParams(location.search);
  if (KEYS.some((key) => query.has(`share-${key}`))) {
    const shared = new URLSearchParams({ shared: '1' });
    for (const key of KEYS) if (query.get(`share-${key}`)) shared.set(key, query.get(`share-${key}`));
    history.replaceState(null, '', `/admin#/ideas?${shared}`);
  }
}
