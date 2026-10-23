import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;
export type Category = CollectionEntry<'categories'>;

export const POSTS_PER_PAGE = 9;

// Drafts are rendered by `astro dev` and by preview builds (BLOG_DRAFTS=true npm run build),
// always with noindex. A normal production build never contains them.
export const SHOW_DRAFTS = import.meta.env.DEV || process.env.BLOG_DRAFTS === 'true';

const byNewest = (a: Post, b: Post) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** Posts to render as pages and in listings, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => SHOW_DRAFTS || !data.draft);
  return posts.sort(byNewest);
}

/** Published posts only, for the feed. Never includes drafts, even in preview builds. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort(byNewest);
}

export async function getCategoryMap(): Promise<Map<string, Category>> {
  const categories = await getCollection('categories');
  return new Map(categories.map((category) => [category.id, category]));
}

/** Categories that have at least one post, in the order of categories.yaml. */
export async function getActiveCategories(posts: Post[]): Promise<Category[]> {
  const used = new Set(posts.map((post) => post.data.category.id));
  const categories = await getCollection('categories');
  return categories.filter((category) => used.has(category.id));
}

export function postUrl(post: Post): string {
  return `/blog/${post.id}`;
}

export function categoryUrl(categoryId: string): string {
  return `/blog/category/${categoryId}`;
}

export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function tagUrl(tag: string): string {
  return `/blog/tag/${tagSlug(tag)}`;
}

/** Last substantive change: the updated date when set, otherwise the publication date. */
export function lastModified(post: Post): Date {
  return post.data.updatedDate ?? post.data.pubDate;
}

/** Estimated reading time in minutes, at roughly 220 words a minute. */
export function readingTime(post: Post): number {
  const words = (post.body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Up to `count` other posts, preferring the same category, newest first. */
export function relatedPosts(post: Post, posts: Post[], count = 2): Post[] {
  const others = posts.filter((other) => other.id !== post.id);
  const sameCategory = others.filter((other) => other.data.category.id === post.data.category.id);
  const rest = others.filter((other) => other.data.category.id !== post.data.category.id);
  return [...sameCategory, ...rest].slice(0, count);
}

const dateFormats = {
  long: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }),
  short: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }),
};

export function formatDate(date: Date, style: keyof typeof dateFormats = 'long'): string {
  return dateFormats[style].format(date);
}
