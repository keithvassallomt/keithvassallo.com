// A blog post's index.md: YAML frontmatter, then the Markdown body. Shared by the AI scripts
// (scripts/blog-draft), the admin's API (which opens live posts) and the admin's site runner
// (scripts/blog-admin), which writes posts back to the repo.
import yaml from 'js-yaml';
import { SHARE_KEYS } from './post-checks.mjs';

// The core schema keeps dates as plain strings, so `pubDate: 2026-10-24` round-trips as written
export function parsePost(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('The post has no frontmatter');
  return { data: yaml.load(match[1], { schema: yaml.CORE_SCHEMA }) ?? {}, body: match[2].trim() };
}

export function serialisePost(data, body) {
  return `---\n${yaml.dump(data, { lineWidth: -1, schema: yaml.CORE_SCHEMA })}---\n\n${body.trim()}\n`;
}

/** Frontmatter the admin edits or manages. Anything else in a post's frontmatter is kept as it was. */
const MANAGED = new Set(['title', 'description', 'pubDate', 'updatedDate', 'category', 'tags', 'cover', 'coverAlt', 'share', 'redirectFrom', 'draft']);

/** An index.md's frontmatter as the admin's fields, plus what the admin keeps but doesn't edit. */
export function adminFields(data) {
  const share = Object.fromEntries(SHARE_KEYS.filter((key) => typeof data.share?.[key] === 'string').map((key) => [key, data.share[key]]));
  return {
    fields: {
      title: String(data.title ?? ''),
      description: String(data.description ?? ''),
      category: String(data.category ?? ''),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      cover: typeof data.cover === 'string' ? data.cover.replace(/^\.\//, '') : null,
      coverAlt: String(data.coverAlt ?? ''),
      share,
    },
    pubDate: data.pubDate ? String(data.pubDate).slice(0, 10) : null,
    updatedDate: data.updatedDate ? String(data.updatedDate).slice(0, 10) : null,
    redirectFrom: Array.isArray(data.redirectFrom) ? data.redirectFrom.map(String) : [],
    draft: data.draft === true || data.draft === 'true',
    frontmatter: Object.fromEntries(Object.entries(data).filter(([key]) => !MANAGED.has(key))),
  };
}

/**
 * The admin's post as an index.md, in the writing guide's order: the frontmatter the admin
 * manages, then whatever else the post already had.
 * @param {object} post the admin's fields, plus `redirectFrom` and `frontmatter`
 * @param {{ pubDate: string, updatedDate?: string | null }} dates YYYY-MM-DD
 */
export function postFile(post, { pubDate, updatedDate = null }) {
  const share = Object.fromEntries(SHARE_KEYS.filter((key) => post.share?.[key]?.trim()).map((key) => [key, post.share[key].trim()]));
  const data = {
    title: post.title,
    description: post.description,
    pubDate,
    ...(updatedDate ? { updatedDate } : {}),
    category: post.category,
    tags: post.tags,
    ...(post.cover ? { cover: `./${post.cover}`, coverAlt: post.coverAlt } : {}),
    ...(Object.keys(share).length ? { share } : {}),
    ...(post.frontmatter ?? {}),
    ...(post.redirectFrom?.length ? { redirectFrom: post.redirectFrom } : {}),
  };
  return serialisePost(data, post.body);
}
