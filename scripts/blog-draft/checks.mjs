// Checks a generated post against docs/writing-a-blog-post.md before anyone sees it. The
// rules themselves are src/lib/post-checks.mjs, shared with the admin's editor; this adds the
// parts that need the file system. Each problem is phrased so the model can fix it on the
// next attempt. The site build is the final gate; these catch the common mistakes faster and
// with clearer messages.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { postProblems, slugFormatProblem } from '../../src/lib/post-checks.mjs';

/** A problem with the slug, or null when it is valid and free. */
export function checkSlug(slug, site) {
  const form = slugFormatProblem(slug);
  if (form) return form;
  if (slug === site.ownSlug) return null;
  if (existsSync(path.join(site.siteDir, 'src/content/blog', slug)) || site.slugTaken?.(slug)) {
    return `The slug "${slug}" is already taken. Choose another.`;
  }
  return null;
}

/**
 * @param {object} post the model's structured output
 * @param {{ siteDir: string, publishedSlugs: Set<string>, projectIds: Set<string>, categoryIds: Set<string>, slugTaken: (slug: string) => boolean, ownSlug: string | null }} site
 * @param {{ story?: boolean }} options `story` adds the checks for the finished voice, which a
 *   facts-first draft doesn't have to meet yet
 * @returns {string[]} problems, empty when the post passes
 */
export function checkPost(post, site, { story = false } = {}) {
  const { slug } = post;
  const imageExists = (image) => existsSync(path.join(site.siteDir, 'src/content/blog', slug, image));
  const problems = postProblems(post, { ...site, imageExists }, { story, notesField: 'notes_for_keith' });
  return [...new Set([checkSlug(slug, site), ...problems.map((problem) => problem.message)].filter(Boolean))];
}

const SHINGLE = 10;

function words(text) {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/** Every run of ten consecutive words in `texts`. */
export function shingles(texts) {
  const set = new Set();
  for (const text of texts) {
    const list = words(text);
    for (let i = 0; i + SHINGLE <= list.length; i++) set.add(list.slice(i, i + SHINGLE).join(' '));
  }
  return set;
}

/**
 * Passages of `text` that repeat ten or more words of the private material verbatim, unless
 * the same words also appear in public material the research stage read (a README the
 * samples happen to quote, for instance).
 */
export function findLeaks(text, privateShingles, publicShingles) {
  const list = words(text);
  const leaks = [];
  for (let i = 0; i + SHINGLE <= list.length; i++) {
    const shingle = list.slice(i, i + SHINGLE).join(' ');
    if (privateShingles.has(shingle) && !publicShingles.has(shingle)) leaks.push(shingle);
  }
  return leaks;
}

/**
 * Runs `npm run check` and a draft build. The child gets no API keys: nothing the build
 * runs needs them.
 * @returns {string | null} the tail of the failing output, or null on success
 */
export function buildSite(siteDir) {
  const { OPENAI_API_KEY, GITHUB_TOKEN, GH_TOKEN, ...env } = process.env;
  for (const args of [['run', 'check'], ['run', 'build']]) {
    console.log(`npm ${args.join(' ')}`);
    const result = spawnSync('npm', args, {
      cwd: siteDir,
      env: { ...env, BLOG_DRAFTS: 'true' },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.trim().split('\n');
      return `npm ${args.join(' ')} failed:\n${output.slice(-60).join('\n')}`;
    }
  }
  return null;
}
