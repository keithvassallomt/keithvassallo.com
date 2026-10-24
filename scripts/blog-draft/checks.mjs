// Checks a generated post against docs/writing-a-blog-post.md before anyone sees it. Each
// problem is phrased so the model can fix it on the next attempt. The site build is the
// final gate; these catch the common mistakes faster and with clearer messages.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { shareTexts } from '../../src/lib/share.ts';
import { SITE } from '../../src/lib/site.ts';

const SHARE_KEYS = ['linkedin', 'x', 'bluesky', 'threads', 'mastodon', 'facebook'];
const STATIC_PAGES = new Set(['/', '/about', '/cv', '/contact', '/projects', '/blog']);
const ALLOWED_TAGS = new Set(['kbd', 'mark']);

const DASHES = /[\u2013\u2014]/;
const SPACED_HYPHEN = /\S - \S/;
// "And" opening a line or following sentence punctuation, allowing for list markers,
// quotes and emphasis in between.
const SENTENCE_AND = /(?:^|[.!?]["'\u2019\u201d)\]]*\s+)(?:[-*+>]\s+|\d+\.\s+)*[*_"'\u2018\u201c(]*And\b/m;

/** Splits Markdown into prose lines (inline code removed) and fenced code blocks. */
function scan(body) {
  const prose = [];
  const fences = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2]) fence = null;
    } else if (marker) {
      fence = marker[1];
      fences.push(marker[2]);
    } else {
      prose.push(line.replace(/`[^`]*`/g, '`code`'));
    }
  }
  return { prose, fences, unclosed: fence !== null };
}

function textProblems(label, text) {
  const problems = [];
  // Strip list and blockquote markers first, so "> - item" isn't mistaken for a dash
  const lines = text.split('\n').map((line) => line.replace(/^[\s>]*(?:[-*+]\s+)?/, ''));
  if (DASHES.test(text)) problems.push(`${label} contains an em or en dash. Use a comma, colon, parentheses or a new sentence.`);
  if (lines.some((line) => SPACED_HYPHEN.test(line))) {
    problems.push(`${label} uses a spaced hyphen (" - ") as a dash. Use a comma, colon, parentheses or a new sentence.`);
  }
  if (SENTENCE_AND.test(text)) problems.push(`${label} has a sentence beginning with "And". Restructure it.`);
  return problems;
}

/** A problem with the slug, or null when it is valid and free. */
export function checkSlug(slug, site) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){2,5}$/.test(slug)) {
    return `The slug "${slug}" must be three to six lowercase ASCII words joined by hyphens.`;
  }
  if (slug === site.ownSlug) return null;
  if (existsSync(path.join(site.siteDir, 'src/content/blog', slug)) || site.branchExists(slug)) {
    return `The slug "${slug}" is already taken. Choose another.`;
  }
  return null;
}

/**
 * @param {object} post the model's structured output
 * @param {{ siteDir: string, publishedSlugs: Set<string>, projectIds: Set<string>, categoryIds: Set<string>, branchExists: (slug: string) => boolean, ownSlug: string | null }} site
 * @param {{ story?: boolean }} options `story` adds the checks for the finished voice, which a
 *   facts-first draft doesn't have to meet yet
 * @returns {string[]} problems, empty when the post passes
 */
export function checkPost(post, site, { story = false } = {}) {
  const { slug, title, description, tags, share, body } = post;
  const problems = [checkSlug(slug, site)].filter(Boolean);

  if (title.length > 70) problems.push(`The title is ${title.length} characters. Keep it to 70 or fewer.`);
  if (description.length < 120 || description.length > 160) {
    problems.push(`The description is ${description.length} characters. It must be 120 to 160.`);
  }
  if (/^in this (post|article)/i.test(description)) problems.push('The description must not start with "In this post".');
  if (tags.length < 2 || tags.length > 5) problems.push(`Use two to five tags, not ${tags.length}.`);
  if (!site.categoryIds.has(post.category)) problems.push(`"${post.category}" is not a category id.`);
  problems.push(...textProblems('The title', title), ...textProblems('The description', description));

  for (const key of SHARE_KEYS) {
    if (!share[key]?.trim()) problems.push(`share.${key} is empty.`);
    if (/https?:\/\/|keithvassallo\.com/i.test(share[key])) problems.push(`share.${key} contains a link. Links are added automatically.`);
    problems.push(...textProblems(`share.${key}`, share[key]));
  }
  try {
    shareTexts({ id: slug, data: { title, description, share } }, `${SITE.url}/blog/${slug}`);
  } catch (error) {
    problems.push(`${error.message}. Shorten it.`);
  }

  const { prose, fences, unclosed } = scan(body);
  const text = prose.join('\n');
  problems.push(...textProblems('The body', text));
  if (unclosed) problems.push('A code block is never closed.');
  if (fences.some((lang) => !lang)) problems.push('Every code block must name its language (use `text` for output).');
  // Only images Keith has added to the post folder exist; a first draft has none
  for (const [, image] of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    if (!image.startsWith('./') || !existsSync(path.join(site.siteDir, 'src/content/blog', slug, image))) {
      problems.push(`The image ${image} isn't in the post folder. Describe image ideas in notes_for_keith instead.`);
    }
  }
  if (/<!--/.test(text)) problems.push('The body contains an HTML comment. Put notes in notes_for_keith.');
  for (const [, tag] of text.matchAll(/<\/?([a-z][a-z0-9-]*)(?=[\s/>])/gi)) {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) problems.push(`The body uses a <${tag}> tag. Only <kbd> and <mark> are allowed.`);
  }
  if (/https?:\/\//.test(text.replace(/\]\([^)]*\)/g, ']()'))) {
    problems.push('The body contains a bare URL. Link descriptive text instead: [text](url).');
  }

  let level = 1;
  for (const line of prose) {
    const heading = /^(#{1,6})\s+(.*)/.exec(line);
    if (!heading) continue;
    const depth = heading[1].length;
    if (depth === 1) problems.push(`"${line}" is a top-level heading. Start sections at ##.`);
    else if (depth > level + 1) problems.push(`"${line}" skips a heading level.`);
    if (/\p{Extended_Pictographic}/u.test(heading[2])) problems.push(`"${line}" has an emoji. Headings must not.`);
    level = depth;
  }

  for (const [, target] of text.matchAll(/\]\((\/[^)\s#]*)/g)) {
    const page = target.length > 1 ? target.replace(/\/+$/, '') : target;
    const parts = page.split('/').slice(1);
    const exists =
      STATIC_PAGES.has(page) ||
      (parts.length === 2 && parts[0] === 'blog' && site.publishedSlugs.has(parts[1])) ||
      (parts.length === 2 && parts[0] === 'projects' && site.projectIds.has(parts[1]));
    if (!exists) problems.push(`The link to ${target} points at a page that doesn't exist.`);
  }
  if (/(?<!!)\[[^\]]*\]\(\.\.?\//.test(text)) {
    problems.push('The body has a relative link. Use root-relative paths such as /projects.');
  }

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 500 || words > 2500) problems.push(`The body is ${words} words. Aim for 800 to 1,800.`);

  // Keith wants every post to talk to its reader; "you" is the measurable part of that
  const address = (text.match(/\byou(?:rs?|rself|rselves)?\b/gi) ?? []).length;
  if (story && address < 5) {
    const times = `${address} time${address === 1 ? '' : 's'}`;
    problems.push(`The post says "you" ${times}. Talk to the reader directly, using "you" naturally throughout.`);
  }

  return [...new Set(problems)];
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
