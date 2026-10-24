// What both entry points load: Keith's private material, the site's own data, and reading
// and writing post files.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { readBlogFrontmatter } from '../../src/lib/blog-frontmatter.mjs';
import { usage } from './openai.mjs';

export const SITE_REPO = 'keithvassallomt/keithvassallo.com';
export const BRANCH_PREFIX = 'blog-draft/';
const MAX_PRIVATE_CHARACTERS = 600_000;

export const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
export const reasoning = { effort: process.env.OPENAI_REASONING_EFFORT || 'high' };

export function requireEnv(...names) {
  for (const name of names) if (!process.env[name]) throw new Error(`${name} is not set`);
}

export const bullets = (items) => (items.length ? items.map((item) => `- ${item}`).join('\n') : '- None');

const thousands = (n) => `${Math.round(n / 1000)}k`;

/** One line on the model, requests and tokens used so far, for logs and reports. */
export function runSummary(attempts = 0) {
  const writing = attempts ? `, ${attempts} writing attempt${attempts === 1 ? '' : 's'}` : '';
  const images = usage.images ? `, ${usage.images} image${usage.images === 1 ? '' : 's'}` : '';
  return (
    `Model ${model} (${reasoning.effort} reasoning), ${usage.requests} requests, ${usage.webSearches} web searches${writing}${images}. ` +
    `Tokens: ${thousands(usage.inputTokens)} in (${thousands(usage.cachedTokens)} cached), ${thousands(usage.outputTokens)} out.`
  );
}

/**
 * The private repository's material (see the layout in draft.mjs). Briefs come oldest first.
 */
export function loadPrivate(privateDir) {
  const read = (folder) => {
    const dir = path.join(privateDir, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /\.(md|txt)$/i.test(name) && name.toLowerCase() !== 'readme.md')
      .sort()
      .map((name) => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }));
  };
  const instructions = read('instructions');
  const samples = read('samples');
  const notes = read('notes');
  if (!instructions.length) throw new Error(`No instructions found in ${privateDir}/instructions`);

  const size = [...instructions, ...samples, ...notes].reduce((total, doc) => total + doc.text.length, 0);
  if (size > MAX_PRIVATE_CHARACTERS) {
    throw new Error(`The private material is ${size} characters, over the ${MAX_PRIVATE_CHARACTERS} limit that keeps each run affordable`);
  }

  const excludedFile = path.join(privateDir, 'excluded-repos.txt');
  const excluded = new Set(
    (existsSync(excludedFile) ? readFileSync(excludedFile, 'utf8') : '')
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );
  return { instructions, samples, notes, briefs: read('briefs'), excluded };
}

/** The site's guide, data and posts, plus what checks.mjs needs to know about it. */
export function loadSite(siteDir) {
  const now = new Date();
  const today = {
    iso: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now),
    long: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'full' }).format(now),
  };
  const projects = readFileSync(path.join(siteDir, 'src/data/projects/projects.yaml'), 'utf8');
  const categories = yaml.load(readFileSync(path.join(siteDir, 'src/data/blog/categories.yaml'), 'utf8'));
  const posts = readBlogFrontmatter(path.join(siteDir, 'src/content/blog'));
  return {
    today,
    siteGuide: readFileSync(path.join(siteDir, 'docs/writing-a-blog-post.md'), 'utf8'),
    projects,
    categories,
    categoryIds: categories.map((category) => category.id),
    catalogue: posts.map(({ slug, title, description, category, tags, draft, pubDate }) => ({
      slug,
      title,
      description,
      category,
      tags,
      status: draft ? 'draft, not published' : `published ${pubDate?.toISOString().slice(0, 10)}`,
    })),
    site: {
      siteDir,
      categoryIds: new Set(categories.map((category) => category.id)),
      publishedSlugs: new Set(posts.filter((post) => !post.draft).map((post) => post.slug)),
      projectIds: new Set(yaml.load(projects).projects.map((project) => project.id)),
      branchExists: (slug) =>
        spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', `${BRANCH_PREFIX}${slug}`], { cwd: siteDir }).status === 0,
      // The slug of the post being revised, which is "taken" by the post itself
      ownSlug: null,
    },
  };
}

export const postFile = (siteDir, slug) => path.join(siteDir, 'src/content/blog', slug, 'index.md');

// Reading and writing index.md lives in src/lib/post-file.mjs, shared with the blog admin
export { parsePost, serialisePost } from '../../src/lib/post-file.mjs';
