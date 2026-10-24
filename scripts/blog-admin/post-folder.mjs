// What a site job does to the repo's files: writing a post's folder from the admin's copy,
// moving it when the slug changes, removing it, and setting the pin. No AWS or git here, so
// it can be tried on any checkout.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { postFile } from '../../src/lib/post-file.mjs';

export const PIN_FILE = 'src/data/blog/pin.json';
export const postDir = (siteDir, slug) => path.join(siteDir, 'src/content/blog', slug);

/** Today in the UK, as YYYY-MM-DD. */
export const ukDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);

/**
 * Writes `post` into its folder. A post already in the repo under another slug is moved, and
 * its old address becomes a redirect. Files already in the folder that the admin doesn't
 * know about are left alone.
 * @param {object} post the admin's post: its fields, plus redirectFrom, frontmatter and liveSlug
 * @param {{ name: string, data: Uint8Array }[]} files the post's images
 * @param {{ pubDate: string, updatedDate?: string | null }} dates
 * @returns {{ dir: string, movedFrom: string | null }}
 */
export function writePostFolder(siteDir, post, files, dates) {
  const dir = postDir(siteDir, post.slug);
  // The folder the post lives in now: where it was published, or where it was opened from
  const current = post.liveSlug ?? post.repoSlug ?? null;
  let movedFrom = null;
  let redirectFrom = [...(post.redirectFrom ?? [])];
  if (current && current !== post.slug) {
    if (existsSync(dir)) throw new Error(`There is already a post at /blog/${post.slug}. Choose another slug.`);
    if (existsSync(postDir(siteDir, current))) renameSync(postDir(siteDir, current), dir);
    movedFrom = current;
    // Shared links to the old address keep working
    if (post.liveSlug) redirectFrom = [...new Set([...redirectFrom, `/blog/${current}`])];
  } else if (!current && existsSync(dir)) {
    throw new Error(`There is already a post at /blog/${post.slug}. Choose another slug.`);
  }
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(path.join(dir, file.name), file.data);
  writeFileSync(path.join(dir, 'index.md'), postFile({ ...post, redirectFrom }, dates));
  return { dir, movedFrom, redirectFrom };
}

export function removePostFolder(siteDir, slug) {
  const dir = postDir(siteDir, slug);
  if (!existsSync(dir)) throw new Error(`There is no post at /blog/${slug} to remove.`);
  rmSync(dir, { recursive: true });
}

export function readPin(siteDir) {
  try {
    return JSON.parse(readFileSync(path.join(siteDir, PIN_FILE), 'utf8'));
  } catch {
    return {};
  }
}

/** Pins `slug` (until an optional ISO date), or clears the pin when `slug` is null. */
export function writePin(siteDir, slug, until = null) {
  const pin = slug ? { slug, ...(until ? { until } : {}) } : {};
  writeFileSync(path.join(siteDir, PIN_FILE), `${JSON.stringify(pin, null, 2)}\n`);
  return pin;
}
