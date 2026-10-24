// What the admin knows about the built site: the posts on main, the categories and the
// project pages, from /admin/posts.json (src/pages/admin/posts.json.ts). Fetched once per visit.

let loading = null;

export function siteData() {
  loading ??= fetch('/admin/posts.json', { cache: 'no-cache' }).then(async (response) => {
    if (!response.ok) throw new Error(`The site's post list didn't load (${response.status})`);
    return response.json();
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

// The site palette, as in BlogShell.astro's --c-* tokens
export const PALETTE = {
  green: '#8cd49c', orange: '#ffa657', cyan: '#56d4dd', purple: '#d2a8ff', blue: '#79c0ff',
  red: '#ff7b72', indigo: '#a5a6ff', yellow: '#f2cc60', pink: '#f2a0d6', lime: '#b9e06f',
};

/** A post title as a slug: lowercase ASCII words joined by hyphens, six at most. */
export const slugify = (title) =>
  title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
