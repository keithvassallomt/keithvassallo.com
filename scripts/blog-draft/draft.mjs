#!/usr/bin/env node
//
// Drafts one blog post with the OpenAI API, following docs/writing-a-blog-post.md. A
// research stage picks a topic and gathers evidence from Keith's public GitHub repositories
// and the web; a drafting stage writes the post in his voice; checks.mjs and a draft build
// verify it, and the model gets two chances to fix whatever fails.
//
// Run weekly by a GitHub Actions workflow in a private repository that holds Keith's
// editorial instructions, voice guide and writing samples. None of that material lives in
// this public repository. --private points at a checkout of it:
//
//   instructions/*.md    editorial instructions, voice guide and Keith's review lessons
//   samples/*.md|txt     writing samples (drafting stage only)
//   notes/*.md           Keith's own notes and ideas, usable as evidence (optional)
//   briefs/*.md          briefs from earlier runs, written by this script (optional)
//   excluded-repos.txt   repositories never to write about, one per line (optional)
//
// Usage:
//   OPENAI_API_KEY=... GITHUB_TOKEN=... node scripts/blog-draft/draft.mjs \
//     --private ../blog-private --out /tmp/blog-draft [--topic "..."]
//
// Writes the post to src/content/blog/<slug>/index.md, and result.json, brief.md, pr-body.md
// and a copy of the post to --out. result.json's outcome is "draft", "skip" (no topic met
// the bar) or "failed" (the draft kept repeating private material, or never had a usable
// slug, so nothing was kept).

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildSite, checkPost, checkSlug, shingles } from './checks.mjs';
import {
  BRANCH_PREFIX,
  SITE_REPO,
  bullets,
  loadPrivate,
  loadSite,
  model,
  postFile,
  reasoning,
  requireEnv,
  runSummary,
  serialisePost,
} from './context.mjs';
import { COVER_FILE, generateCover } from './cover.mjs';
import { createGitHubTools, openDraftPullRequests } from './github.mjs';
import { respond } from './openai.mjs';
import * as prompts from './prompts.mjs';
import { writeUntilClean } from './writer.mjs';

const MAX_TOOL_CALLS = 40;
const MAX_ROUNDS = 30;

const { values: args } = parseArgs({
  options: { private: { type: 'string' }, out: { type: 'string' }, topic: { type: 'string', default: '' } },
});
if (!args.private || !args.out) throw new Error('Usage: draft.mjs --private <dir> --out <dir> [--topic "..."]');
requireEnv('OPENAI_API_KEY', 'GITHUB_TOKEN');

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });

const { instructions, samples, notes, briefs, excluded } = loadPrivate(path.resolve(args.private));
const { today, siteGuide, projects, categories, categoryIds, catalogue, site } = loadSite(siteDir);
const drafts = await openDraftPullRequests(SITE_REPO, BRANCH_PREFIX);
const recentBriefs = briefs.slice(-12).reverse();

// Keith's notes are his own words, meant for posts, so repeating them isn't a leak
const privateShingles = shingles([...instructions, ...samples].map((doc) => doc.text));

// --- Stage 1: research ------------------------------------------------------------------

const github = createGitHubTools(excluded);
const publicTexts = [siteGuide, projects];

async function research() {
  const tools = [...github.definitions, prompts.briefTool(categoryIds), { type: 'web_search' }];
  const input = [
    {
      role: 'user',
      content: prompts.researchInput({ today, catalogue, categories, drafts, briefs: recentBriefs, notes, topic: args.topic }),
    },
  ];
  let toolCalls = 0;
  let toolChoice = 'auto';

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const response = await respond({
      model,
      reasoning,
      instructions: prompts.researchInstructions({ instructions, maxToolCalls: MAX_TOOL_CALLS }),
      input,
      tools,
      tool_choice: toolChoice,
      max_output_tokens: 64_000,
    });
    input.push(...response.output);

    const calls = response.output.filter((item) => item.type === 'function_call');
    const submitted = calls.find((call) => call.name === 'submit_brief');
    if (submitted) return JSON.parse(submitted.arguments);

    if (!calls.length) {
      input.push({ role: 'user', content: 'Call submit_brief now with your decision.' });
      toolChoice = { type: 'function', name: 'submit_brief' };
      continue;
    }
    for (const call of calls) {
      toolCalls += 1;
      console.log(`  ${call.name} ${call.arguments}`);
      const output = await github.run(call.name, JSON.parse(call.arguments));
      publicTexts.push(output);
      input.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
    if (toolCalls >= MAX_TOOL_CALLS) toolChoice = { type: 'function', name: 'submit_brief' };
  }
  throw new Error(`The research stage did not submit a brief within ${MAX_ROUNDS} rounds`);
}

// --- Stage 2: drafting ------------------------------------------------------------------

// The post folder this run created, so a retry with a new slug never touches anyone else's
let writtenDir = null;

function writePost(post, { cover = false } = {}) {
  removePost();
  writtenDir = path.dirname(postFile(siteDir, post.slug));
  mkdirSync(writtenDir);
  const { title, description, category, tags, share } = post;
  const coverFields = cover ? { cover: `./${COVER_FILE}`, coverAlt: post.cover_alt } : {};
  const data = { title, description, pubDate: today.iso, category, tags, ...coverFields, share, draft: true };
  writeFileSync(path.join(writtenDir, 'index.md'), serialisePost(data, post.body));
}

function removePost() {
  if (writtenDir) rmSync(writtenDir, { recursive: true, force: true });
  writtenDir = null;
}

/**
 * Writes the post in two passes: a facts-first draft from the brief, then an edit that
 * turns it into a story without changing the facts. Each pass must pass every check and
 * the build; if the edit can't, the facts-first draft stands.
 */
async function draft(brief) {
  // The shortlist and the reasons for choosing stay out of the writing stages: they only
  // need the topic and the evidence, and anything they see could end up in public notes
  const { chosen, evidence, questions_for_keith } = brief;
  const context = { today, catalogue, categories, brief: { chosen, evidence, questions_for_keith }, projects, samples };
  const pass = (content, { story = false } = {}) =>
    writeUntilClean({
      request: {
        model,
        reasoning,
        instructions: prompts.draftingInstructions({ instructions, siteGuide }),
        input: [{ role: 'user', content }],
        text: { format: prompts.postFormat(categoryIds) },
        max_output_tokens: 64_000,
      },
      check: (post) => checkPost(post, site, { story }),
      publicText: (post) =>
        [post.title, post.description, post.cover_alt, ...Object.values(post.share), post.body, prBody(brief, post, [], 1)].join('\n'),
      privateShingles,
      publicShingles: shingles(publicTexts),
      save: writePost,
      discard: removePost,
      siteDir,
    });
  const clean = (result) => !result.problems.length && !result.leaks.length;

  console.log('Facts-first draft');
  const facts = await pass(prompts.draftingInput(context));
  if (!clean(facts)) {
    // Keep a draft that only fails style or build checks, for Keith to fix by hand
    if (!facts.leaks.length && !checkSlug(facts.post.slug, site)) writePost(facts.post);
    return { ...facts, notes: [] };
  }

  console.log('Story edit');
  const edited = await pass(prompts.editInput({ ...context, draft: facts.post }), { story: true });
  if (clean(edited)) return { ...edited, attempts: facts.attempts + edited.attempts, notes: [] };
  writePost(facts.post);
  return {
    ...facts,
    attempts: facts.attempts + edited.attempts,
    notes: ["The story edit couldn't pass the checks, so this is the plainer facts-first draft."],
  };
}

/** Adds a generated cover to the written post, or explains why there isn't one. */
async function addCover(post) {
  try {
    const image = await generateCover({
      siteDir,
      title: post.title,
      idea: post.cover_idea,
      color: categories.find((category) => category.id === post.category)?.color ?? 'green',
    });
    writePost(post, { cover: true });
    writeFileSync(path.join(writtenDir, COVER_FILE), image);
  } catch (error) {
    return `No cover: generating it failed (${error.message.slice(0, 200)}).`;
  }
  const buildFailure = buildSite(siteDir);
  if (!buildFailure) return null;
  writePost(post);
  return 'No cover: the site would not build with the generated image, so it was left out.';
}

// --- Reports ----------------------------------------------------------------------------

// weekly-blog-draft.yml swaps in the commit once it exists, so the image outlives the branch
const COMMIT_PLACEHOLDER = '{{COMMIT}}';

/**
 * The pull request description. It is public, so it carries nothing from the private brief.
 * The preview link points at PREVIEW_URL when the preview site is set up, and at the post on
 * its branch otherwise.
 */
function prBody(brief, post, problems, attempts, notes = [], { cover = false } = {}) {
  const words = post.body.split(/\s+/).filter(Boolean).length;
  const sources = brief.evidence.filter((item) => /^https?:\/\//.test(item.source));
  const fromKeith = brief.evidence.length - sources.length;
  const questions = [...brief.questions_for_keith, ...post.notes_for_keith];
  const folder = `src/content/blog/${post.slug}`;
  const preview = process.env.PREVIEW_URL
    ? `${process.env.PREVIEW_URL}/blog/${post.slug}`
    : `https://github.com/${SITE_REPO}/blob/${BRANCH_PREFIX}${post.slug}/${folder}/index.md`;
  const image = cover
    ? `\n![${post.cover_alt}](https://raw.githubusercontent.com/${SITE_REPO}/${COMMIT_PLACEHOLDER}/${folder}/${COVER_FILE})\n`
    : '';
  return `### [Preview the post](${preview})

A draft from the weekly blog workflow, ${today.long}. It isn't live until you comment \`/publish\`.
${image}
> ${post.description}

Category \`${post.category}\` · tags ${post.tags.join(', ')} · about ${words.toLocaleString('en-GB')} words
${notes.length ? `\n${notes.map((note) => `**${note}**`).join('\n\n')}\n` : ''}
## Before publishing

- [ ] Every claim is right, and it sounds like you
- [ ] The cover works, or is replaced (\`${COVER_FILE}\` in the post folder)
- [ ] Screenshots added where suggested below, or not needed

## Questions and things to confirm

${bullets(questions)}

## Sources the draft relies on

${bullets(sources.map((item) => `${item.claim} (${item.status}): ${item.source}`))}
${fromKeith ? `\nPlus ${fromKeith} point${fromKeith === 1 ? '' : 's'} taken from your notes or requested topic.\n` : ''}${problems.length ? `\n## Checks that still fail\n\nThe model couldn't fix these in ${attempts} attempts:\n\n${bullets(problems.map((problem) => problem.replace(/\n/g, '\n  ')))}\n` : ''}
---

${runSummary(attempts)} The editorial brief is in the private repository.

## Commands

Comment on this pull request:

- \`/revise\`, followed by any overall request, once you've commented on the lines you want changed. The revision arrives as a new commit, with a reply listing what changed, and the preview updates.
- \`/publish\` to put it live. It dates the post today, removes \`draft: true\`, checks the build, merges and replies here with the link.
`;
}

/** The private record of the run: shortlist, reasoning and evidence. */
function briefMarkdown(brief, outcome, post, problems) {
  const chosen = brief.chosen;
  const lines = [
    `# ${post?.title ?? chosen?.working_title ?? 'No post this week'}`,
    '',
    `- Date: ${today.iso}`,
    `- Outcome: ${outcome}`,
    chosen ? `- Editorial category: ${chosen.editorial_category}, site category \`${chosen.site_category}\`` : null,
    post ? `- Branch: \`${BRANCH_PREFIX}${post.slug}\`` : null,
    args.topic ? `- Requested topic: ${args.topic}` : null,
    `- Run: ${runSummary()}`,
    '',
    '## Decision',
    '',
    brief.reason,
    '',
    '## Shortlist',
    '',
    ...brief.shortlist.flatMap((item, index) => [
      `### ${index + 1}. ${item.title} (${item.editorial_category}, ${item.score})`,
      '',
      `- Question: ${item.central_question}`,
      `- Why Keith: ${item.why_keith}`,
      `- Evidence: ${item.evidence_available}`,
      `- Needs: ${item.needs_verification}`,
      `- Timing: ${item.timing}`,
      '',
    ]),
  ];
  // revise.mjs keeps everything above this private and passes the rest to the model
  if (chosen) {
    lines.push(
      '## Brief',
      '',
      `- Purpose: ${chosen.purpose}`,
      `- Audience: ${chosen.audience}`,
      `- Thesis: ${chosen.thesis}`,
      `- Limitations: ${chosen.limitations}`,
      '',
      'Structure:',
      '',
      bullets(chosen.structure),
      '',
      'Editorial risks:',
      '',
      bullets(chosen.editorial_risks),
      '',
    );
  }
  lines.push(
    '## Evidence',
    '',
    bullets(brief.evidence.map((item) => `[${item.status}] ${item.claim}: ${item.source}`)),
    '',
    '## Questions for Keith',
    '',
    bullets([...brief.questions_for_keith, ...(post?.notes_for_keith ?? [])]),
    '',
  );
  if (problems.length) lines.push('## Checks that still fail', '', bullets(problems), '');
  return lines.filter((line) => line !== null).join('\n');
}

function finish(result, brief, post = null, problems = []) {
  const name = `${today.iso}-${post?.slug ?? result.outcome}.md`;
  writeFileSync(path.join(outDir, 'brief.md'), briefMarkdown(brief, result.outcome, post, problems));
  const full = { ...result, brief_file: name, branch: post ? `${BRANCH_PREFIX}${post.slug}` : '' };
  writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(full, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(full).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(`${result.outcome}: ${result.title || result.reason}`);
  console.log(runSummary(result.attempts));
}

// --- Run --------------------------------------------------------------------------------

console.log(`Researching (${catalogue.length} posts, ${drafts.length} drafts in review, ${notes.length} notes)`);
const brief = await research();

if (brief.decision === 'skip' || !brief.chosen) {
  finish({ outcome: 'skip', title: '', slug: '', reason: 'No topic met the editorial bar this week' }, brief);
} else {
  console.log(`Chosen: ${brief.chosen.working_title} (${brief.evidence.length} pieces of evidence)`);
  const { post, problems, leaks, attempts, notes } = await draft(brief);
  if (writtenDir && !problems.length) {
    console.log('Cover');
    const coverNote = await addCover(post);
    if (coverNote) notes.push(coverNote);
  }
  if (!writtenDir) {
    const reason = leaks.length
      ? `${leaks.length} passages still repeated the private material after ${attempts} attempts, so the draft was discarded.`
      : `The draft never had a usable slug: ${checkSlug(post.slug, site)}`;
    finish({ outcome: 'failed', title: post.title, slug: '', reason, attempts }, brief, null, [reason, ...problems]);
  } else {
    const cover = existsSync(path.join(writtenDir, COVER_FILE));
    writeFileSync(path.join(outDir, 'pr-body.md'), prBody(brief, post, problems, attempts, notes, { cover }));
    writeFileSync(path.join(outDir, 'post.md'), readFileSync(path.join(writtenDir, 'index.md')));
    if (cover) copyFileSync(path.join(writtenDir, COVER_FILE), path.join(outDir, COVER_FILE));
    finish({ outcome: 'draft', title: post.title, slug: post.slug, reason: '', attempts }, brief, post, problems);
  }
}
