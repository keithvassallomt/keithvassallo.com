// The writing guide's machine-checkable rules (docs/writing-a-blog-post.md), shared by the AI
// scripts (scripts/blog-draft/checks.mjs) and the admin's editor (src/admin). Pure, so it runs
// in Node and in the browser: everything it needs to know about the site comes in as `site`.
// Each problem is phrased so a model can fix it on the next attempt, and says which body lines
// it was found on so the editor can mark them.

import { shareTexts } from './share.ts';
import { SITE } from './site.ts';

export const SHARE_KEYS = ['linkedin', 'x', 'bluesky', 'threads', 'mastodon', 'facebook'];
export const STATIC_PAGES = ['/', '/about', '/cv', '/contact', '/projects', '/blog'];
const STATIC = new Set(STATIC_PAGES);
const ALLOWED_TAGS = new Set(['kbd', 'mark']);

const DASHES = /[\u2013\u2014]/;
const SPACED_HYPHEN = /\S - (?=\S)/g;
// Spaced hyphens are fine for the odd aside, so only a habit of them is a problem: two per field,
// or one per 150 words of a longer body (Keith's own posts run at about one per 220)
const SPACED_HYPHEN_WORDS = 150;
// "And" opening a line or following sentence punctuation, allowing for list markers,
// quotes and emphasis in between.
const SENTENCE_AND = /(?:^|[.!?]["'\u2019\u201d)\]]*\s+)(?:[-*+>]\s+|\d+\.\s+)*[*_"'\u2018\u201c(]*And\b/m;

/** Splits Markdown into prose lines (inline code removed) and fenced code blocks, with line numbers. */
function scan(body) {
  const prose = [];
  const fences = [];
  let fence = null;
  body.split('\n').forEach((text, index) => {
    const line = index + 1;
    const marker = /^\s*(`{3,}|~{3,})\s*(\S*)/.exec(text);
    if (fence) {
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && !marker[2]) fence = null;
    } else if (marker) {
      fence = { marker: marker[1], line };
      fences.push({ lang: marker[2], line });
    } else {
      prose.push({ text: text.replace(/`[^`]*`/g, '`code`'), line });
    }
  });
  return { prose, fences, unclosed: fence?.line ?? null };
}

/** Dash and "And" problems in one field. `lines` maps each line of `text` to a body line. */
function textProblems(label, text, lines = null) {
  const problems = [];
  const at = (indexes) => (lines ? { lines: [...new Set(indexes.map((index) => lines[index]))] } : {});
  const rows = text.split('\n');
  // Strip list and blockquote markers first, so "> - item" isn't mistaken for a dash
  const stripped = rows.map((row) => row.replace(/^[\s>]*(?:[-*+]\s+)?/, ''));
  const dashed = rows.flatMap((row, index) => (DASHES.test(row) ? [index] : []));
  if (dashed.length) {
    problems.push({ message: `${label} contains an em or en dash. Use a comma, colon, parentheses or a new sentence.`, ...at(dashed) });
  }
  const spaced = stripped.flatMap((row, index) => [...row.matchAll(SPACED_HYPHEN)].map(() => index));
  const allowed = Math.max(2, Math.floor(text.split(/\s+/).filter(Boolean).length / SPACED_HYPHEN_WORDS));
  if (spaced.length > allowed) {
    problems.push({
      message: `${label} uses ${spaced.length} spaced hyphens (" - "). The odd one is fine, but keep it to ${allowed} at most: use a comma, colon, parentheses or a new sentence for the rest.`,
      ...at(spaced),
    });
  }
  const ands = [...text.matchAll(new RegExp(SENTENCE_AND, 'gm'))].map(
    (match) => text.slice(0, match.index + match[0].length).split('\n').length - 1,
  );
  if (ands.length) problems.push({ message: `${label} has a sentence beginning with "And". Restructure it.`, ...at(ands) });
  return problems;
}

/** A problem with the slug's form, or null. Whether it is free is for the caller to say. */
export function slugFormatProblem(slug) {
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,5}$/.test(slug)) return null;
  return `The slug "${slug}" must be three to six lowercase ASCII words joined by hyphens.`;
}

/**
 * @param {{ slug: string, title: string, description: string, category: string, tags: string[], share: object, body: string }} post
 * @param {{ categoryIds: Set<string>, publishedSlugs: Set<string>, projectIds: Set<string>, imageExists: (path: string) => boolean }} site
 * @param {{ story?: boolean, requireShare?: boolean, notesField?: string | null }} options
 *   `story` adds the checks for the finished voice, which a facts-first draft doesn't have to
 *   meet yet. `requireShare` asks for a blurb for every network, which the AI must write but a
 *   hand-written post can leave to the description. `notesField` names where a model should
 *   put notes and image ideas instead.
 * @returns {{ message: string, lines?: number[] }[]} problems in the body carry its line numbers
 */
export function postProblems(post, site, { story = false, requireShare = true, notesField = null } = {}) {
  const { slug, title, description, tags, share = {}, body } = post;
  const problems = [];
  const add = (message, lines) => problems.push(lines?.length ? { message, lines } : { message });

  if (title.length > 70) add(`The title is ${title.length} characters. Keep it to 70 or fewer.`);
  if (description.length < 120 || description.length > 160) {
    add(`The description is ${description.length} characters. It must be 120 to 160.`);
  }
  if (/^in this (post|article)/i.test(description)) add('The description must not start with "In this post".');
  if (tags.length < 2 || tags.length > 5) add(`Use two to five tags, not ${tags.length}.`);
  if (!site.categoryIds.has(post.category)) add(`"${post.category}" is not a category id.`);
  problems.push(...textProblems('The title', title), ...textProblems('The description', description));

  for (const key of SHARE_KEYS) {
    const text = share[key] ?? '';
    if (requireShare && !text.trim()) add(`share.${key} is empty.`);
    if (/https?:\/\/|keithvassallo\.com/i.test(text)) add(`share.${key} contains a link. Links are added automatically.`);
    problems.push(...textProblems(`share.${key}`, text));
  }
  try {
    const blurbs = Object.fromEntries(SHARE_KEYS.filter((key) => share[key]?.trim()).map((key) => [key, share[key]]));
    shareTexts({ id: slug, data: { title, description, share: blurbs } }, `${SITE.url}/blog/${slug}`);
  } catch (error) {
    add(`${error.message}. Shorten it.`);
  }

  const { prose, fences, unclosed } = scan(body);
  const text = prose.map((row) => row.text).join('\n');
  const lineOf = prose.map((row) => row.line);
  problems.push(...textProblems('The body', text, lineOf));
  if (unclosed) add('A code block is never closed.', [unclosed]);
  const unnamed = fences.filter((fence) => !fence.lang).map((fence) => fence.line);
  if (unnamed.length) add('Every code block must name its language (use `text` for output).', unnamed);

  for (const row of prose) {
    // Only images added to the post exist; a first draft has none
    for (const [, image] of row.text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      if (!image.startsWith('./') || !site.imageExists(image)) {
        add(`The image ${image} isn't in the post folder.${notesField ? ` Describe image ideas in ${notesField} instead.` : ''}`, [row.line]);
      }
    }
  }
  const comments = prose.filter((row) => /<!--/.test(row.text)).map((row) => row.line);
  if (comments.length) {
    add(`The body contains an HTML comment.${notesField ? ` Put notes in ${notesField}.` : ' It would be published in the page source.'}`, comments);
  }
  for (const row of prose) {
    for (const [, tag] of `${row.text}\n`.matchAll(/<\/?([a-z][a-z0-9-]*)(?=[\s/>])/gi)) {
      if (!ALLOWED_TAGS.has(tag.toLowerCase())) add(`The body uses a <${tag}> tag. Only <kbd> and <mark> are allowed.`, [row.line]);
    }
  }
  const bare = prose.filter((row) => /https?:\/\//.test(row.text.replace(/\]\([^)]*\)/g, ']()'))).map((row) => row.line);
  if (bare.length) add('The body contains a bare URL. Link descriptive text instead: [text](url).', bare);

  let level = 1;
  for (const row of prose) {
    const heading = /^(#{1,6})\s+(.*)/.exec(row.text);
    if (!heading) continue;
    const depth = heading[1].length;
    if (depth === 1) add(`"${row.text}" is a top-level heading. Start sections at ##.`, [row.line]);
    else if (depth > level + 1) add(`"${row.text}" skips a heading level.`, [row.line]);
    if (/\p{Extended_Pictographic}/u.test(heading[2])) add(`"${row.text}" has an emoji. Headings must not.`, [row.line]);
    level = depth;
  }

  for (const row of prose) {
    for (const [, target] of row.text.matchAll(/\]\((\/[^)\s#]*)/g)) {
      const page = target.length > 1 ? target.replace(/\/+$/, '') : target;
      const parts = page.split('/').slice(1);
      const exists =
        STATIC.has(page) ||
        (parts.length === 2 && parts[0] === 'blog' && site.publishedSlugs.has(parts[1])) ||
        (parts.length === 2 && parts[0] === 'projects' && site.projectIds.has(parts[1]));
      if (!exists) add(`The link to ${target} points at a page that doesn't exist.`, [row.line]);
    }
  }
  const relative = prose.filter((row) => /(?<!!)\[[^\]]*\]\(\.\.?\//.test(row.text)).map((row) => row.line);
  if (relative.length) add('The body has a relative link. Use root-relative paths such as /projects.', relative);

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 500 || words > 2500) add(`The body is ${words} words. Aim for 800 to 1,800.`);

  // Keith wants every post to talk to its reader; "you" is the measurable part of that
  const address = (text.match(/\byou(?:rs?|rself|rselves)?\b/gi) ?? []).length;
  if (story && address < 5) {
    const times = `${address} time${address === 1 ? '' : 's'}`;
    add(`The post says "you" ${times}. Talk to the reader directly, using "you" naturally throughout.`);
  }

  // One entry per message, with the lines of every occurrence
  const merged = new Map();
  for (const problem of problems) {
    const seen = merged.get(problem.message);
    if (!seen) merged.set(problem.message, { ...problem });
    else if (problem.lines) seen.lines = [...new Set([...(seen.lines ?? []), ...problem.lines])];
  }
  return [...merged.values()];
}
