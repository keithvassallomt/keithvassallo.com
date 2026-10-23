import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Reads blog post frontmatter when astro.config.mjs loads, before content collections
// exist, so the sitemap can carry lastmod dates and old URLs can redirect. Mirrors the
// collection layout in src/content.config.ts: src/content/blog/<slug>/index.md.

function toDate(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/**
 * @param {string} [dir]
 * @returns {{ slug: string, draft: boolean, pubDate?: Date, updatedDate?: Date, redirectFrom: string[] }[]}
 */
export function readBlogFrontmatter(dir = 'src/content/blog') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const file = path.join(dir, entry.name, 'index.md');
      if (!existsSync(file)) return [];
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
      const data = (block && yaml.load(block[1])) || {};
      return [
        {
          slug: entry.name,
          draft: data.draft === true,
          pubDate: toDate(data.pubDate),
          updatedDate: toDate(data.updatedDate),
          redirectFrom: Array.isArray(data.redirectFrom) ? data.redirectFrom : [],
        },
      ];
    });
}
