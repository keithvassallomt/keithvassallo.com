#!/usr/bin/env node
//
// Runs one of the blog admin's AI jobs (docs/blog-admin-plan.md, stage 5), with the OpenAI
// API and Keith's private material:
//
//   generate   researches and writes a post, then draws its cover. What it starts from is the
//              post's notes for the AI and its body: neither (it picks a topic, as the weekly
//              run does), notes (it writes about them), a body (Keith's rough draft, which it
//              keeps and builds on) or both.
//   revise     rewrites the post from Keith's notes on passages and an overall request
//   cover      draws a new cover, optionally from an instruction
//
// The admin's API records the job and starts blog-ai.yml in the private repository, which
// runs this with a checkout of that repository at --private. Each stage is reported on the
// job. The result is saved to the post as a new version, with History snapshots either side,
// and the AI's notes go to ai/<post>/<job>.json in the bucket, never into the site repo.
// --out receives brief.md (for briefs/ in the private repo) and result.json. Style lessons, and
// the mark on an idea a draft came from, are saved to the private repository through GitHub's
// API as the job runs, so an edit made in the admin meanwhile can't clash with them.
//
// Usage: TABLE=... BUCKET=... JOB=<id> OPENAI_API_KEY=... GITHUB_TOKEN=... \
//   node scripts/blog-admin/ai-job.mjs --private ../private --out /tmp/ai-job
//   node scripts/blog-admin/ai-job.mjs --failed | --cancelled     after a crash or a cancel

import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { postFile as postText } from '../../src/lib/post-file.mjs';
import { IDEAS_FILE, LESSONS_FILE, changeIdea, editRepoFile, reviseLessons } from '../../src/lib/private-notes.mjs';
import { JOB, failJob, finishJob, getItem, getJson, now, postFiles, putItem, putObject, reportStage, update } from './store.mjs';

const { values: args } = parseArgs({
  options: { private: { type: 'string' }, out: { type: 'string' }, failed: { type: 'boolean' }, cancelled: { type: 'boolean' } },
});

if (args.failed || args.cancelled) {
  await failJob(new Error(args.cancelled ? 'Cancelled.' : 'The AI job stopped unexpectedly. The log has the details.'), args.cancelled ? 'cancelled' : 'failed');
  process.exit(0);
}
if (!args.private || !args.out) throw new Error('Usage: ai-job.mjs --private <dir> --out <dir>');

const job = await getItem({ pk: 'JOB', sk: JOB });
if (!job) throw new Error(`There is no job ${JOB}`);

// The model choices travel with the job; the pipeline's modules read them when imported
const choice = job.params ?? {};
if (choice.model) process.env.OPENAI_MODEL = choice.model;
if (choice.effort) process.env.OPENAI_REASONING_EFFORT = choice.effort;
if (choice.imageModel) process.env.OPENAI_IMAGE_MODEL = choice.imageModel;

const { buildSite, checkPost, checkSlug, shingles } = await import('../blog-draft/checks.mjs');
const { bullets, loadPrivate, loadSite, model, postFile, reasoning, requireEnv, runSummary } = await import('../blog-draft/context.mjs');
const { COVER_FILE, generateCover } = await import('../blog-draft/cover.mjs');
const { createGitHubTools } = await import('../blog-draft/github.mjs');
const { outputText, respond, trace, usage } = await import('../blog-draft/openai.mjs');
const prompts = await import('../blog-draft/prompts.mjs');
const { writeUntilClean } = await import('../blog-draft/writer.mjs');

requireEnv('OPENAI_API_KEY', 'GITHUB_TOKEN');

const MAX_TOOL_CALLS = 40;
const MAX_ROUNDS = 30;
const PRIVATE_REPO = process.env.GITHUB_REPOSITORY ?? 'keithvassallomt/blog-private';
const EDITABLE = ['title', 'slug', 'slugTouched', 'description', 'category', 'tags', 'cover', 'coverAlt', 'share', 'notes', 'body'];

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const privateDir = path.resolve(args.private);
const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });

const { instructions, samples, notes, briefs, excluded } = loadPrivate(privateDir);
const { today, siteGuide, projects, categories, categoryIds, catalogue, site } = loadSite(siteDir);
// Slugs the admin's other posts hold count as taken, as folders on main already do
const taken = new Set(choice.takenSlugs ?? []);
site.slugTaken = (slug) => taken.has(slug);

const privateShingles = shingles([...instructions, ...samples].map((doc) => doc.text));
const github = createGitHubTools(excluded);
const publicTexts = [siteGuide, projects];

let current = await getItem({ pk: 'POST', sk: job.postId });
const stage = (name, label) => {
  trace.stage = label;
  return reportStage(job, name);
};

// ---- the post folder the build checks --------------------------------------------------

let writtenDir = null;

function removePost() {
  if (writtenDir) rmSync(writtenDir, { recursive: true, force: true });
  writtenDir = null;
}

/** Puts the model's post in the site checkout, as a draft, with any files it should have. */
function writePost(post, { cover = false, files = [], frontmatter = {} } = {}) {
  removePost();
  writtenDir = path.dirname(postFile(siteDir, post.slug));
  mkdirSync(writtenDir, { recursive: true });
  for (const file of files) writeFileSync(path.join(writtenDir, file.name), file.data);
  const fields = {
    ...post,
    cover: cover ? COVER_FILE : (post.cover ?? null),
    coverAlt: cover ? post.cover_alt : (post.coverAlt ?? ''),
    frontmatter: { ...frontmatter, draft: true },
  };
  writeFileSync(path.join(writtenDir, 'index.md'), postText(fields, { pubDate: today.iso }));
}

// ---- research --------------------------------------------------------------------------

async function research({ topic, roughDraft }) {
  const tools = [...github.definitions, prompts.briefTool(categoryIds), { type: 'web_search' }];
  const input = [
    {
      role: 'user',
      content: prompts.researchInput({
        today,
        catalogue,
        categories,
        drafts: choice.drafts ?? [],
        briefs: briefs.slice(-12).reverse(),
        notes,
        topic,
        roughDraft,
      }),
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

// ---- writing ---------------------------------------------------------------------------

const clean = (result) => !result.problems.length && !result.leaks.length;
const postPublicText = (post) => [post.title, post.description, post.cover_alt, ...Object.values(post.share), post.body, ...(post.notes_for_keith ?? [])].join('\n');

/**
 * Writes the post in two passes: a facts-first draft from the brief, then an edit that turns
 * it into a story without changing the facts. Each pass must pass every check and the build;
 * if the edit can't, the facts-first draft stands.
 */
async function draft(brief, roughDraft) {
  // The shortlist and the reasons for choosing stay out of the writing stages: they only need
  // the topic and the evidence
  const { chosen, evidence, questions_for_keith } = brief;
  const context = { today, catalogue, categories, brief: { chosen, evidence, questions_for_keith }, projects, samples, roughDraft };
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
      publicText: postPublicText,
      privateShingles,
      // Keith's own rough draft can be repeated, of course
      publicShingles: shingles([...publicTexts, roughDraft]),
      save: (post) => writePost(post),
      discard: removePost,
      siteDir,
    });
  await stage('drafting', 'Facts-first draft');
  const facts = await pass(prompts.draftingInput(context));
  if (!clean(facts)) {
    // Keep a draft that only fails style or build checks, for Keith to fix by hand
    if (!facts.leaks.length && !checkSlug(facts.post.slug, site)) writePost(facts.post);
    return { ...facts, notes: [] };
  }
  await stage('editing', 'Story edit');
  const edited = await pass(prompts.editInput({ ...context, draft: facts.post }), { story: true });
  if (clean(edited)) return { ...edited, attempts: facts.attempts + edited.attempts, notes: [] };
  writePost(facts.post);
  return {
    ...facts,
    attempts: facts.attempts + edited.attempts,
    notes: ["The story edit couldn't pass the checks, so this is the plainer facts-first draft."],
  };
}

/** The cover's bytes, after checking the site builds with it, or a note saying why there is none. */
async function addCover(post) {
  await stage('cover', 'Cover');
  try {
    const image = await generateCover({
      siteDir,
      title: post.title,
      idea: post.cover_idea,
      color: categories.find((category) => category.id === post.category)?.color ?? 'green',
    });
    writePost(post, { cover: true });
    writeFileSync(path.join(writtenDir, COVER_FILE), image);
    await stage('checking', 'Checks');
    if (buildSite(siteDir)) return { note: 'No cover: the site would not build with the generated image, so it was left out.' };
    return { image };
  } catch (error) {
    return { note: `No cover: generating it failed (${error.message.slice(0, 200)}).` };
  }
}

// ---- saving to the admin ---------------------------------------------------------------

const editable = (post) => Object.fromEntries(EDITABLE.map((key) => [key, post[key]]));

/** Keeps a copy of the post in History, for good, and returns its id. */
async function snapshot(post, kind, label) {
  const at = now();
  const id = `${at}#${randomUUID().slice(0, 8)}`;
  await putItem({ pk: `VERSIONS#${post.id}`, sk: id, kind, label, at, version: post.version, post: editable(post) });
  return id;
}

/** Saves new fields to the post as a new version, keeping what it replaces in History. */
async function save(fields, { before, after, kind }) {
  current = await getItem({ pk: 'POST', sk: job.postId });
  const beforeId = await snapshot(current, 'before', before);
  const version = current.version + 1;
  const at = now();
  // The brief stays with the run that generated the post; the latest notes are this run's
  const ai = { brief: job.kind === 'generate' ? job.id : (current.ai?.brief ?? null), latest: { job: job.id, kind: job.kind, at } };
  await update({ pk: 'POST', sk: job.postId }, { ...fields, version, updated: at, checkpointAt: at, ai }, { expected: current.version });
  await snapshot({ ...current, ...fields, version }, kind, after);
  return { version, beforeId };
}

/** Prices the run from models.dev, plus web searches and images at the rates in Settings. */
async function cost() {
  const rates = (await getItem({ pk: 'SETTING', sk: 'ai' }))?.value ?? {};
  let prices = null;
  try {
    const catalogue = await (await fetch('https://models.dev/api.json')).json();
    prices = catalogue.openai?.models?.[model]?.cost ?? null;
  } catch {
    // Priced as unknown below
  }
  const tokens = prices
    ? usage.calls.reduce((sum, call) => {
        // Some models charge more for the whole request once its context passes a size
        const tier = (prices.tiers ?? []).filter((entry) => entry.tier?.type === 'context' && call.input > entry.tier.size).at(-1);
        const price = tier ?? prices;
        const cached = price.cache_read ?? price.input;
        return sum + ((call.input - call.cached) * price.input + call.cached * cached + call.output * price.output) / 1e6;
      }, 0)
    : null;
  const searches = rates.webSearchRate ? (usage.webSearches * rates.webSearchRate) / 1000 : null;
  const images = rates.imageRate ? usage.images * rates.imageRate : null;
  const known = [tokens, searches, images].filter((value) => value !== null);
  const round = (value) => (value === null ? null : Math.round(value * 10000) / 10000);
  return {
    tokens: round(tokens),
    searches: usage.webSearches ? round(searches) : 0,
    images: usage.images ? round(images) : 0,
    total: round(known.reduce((sum, value) => sum + value, 0)),
    complete: tokens !== null && (!usage.webSearches || searches !== null) && (!usage.images || images !== null),
  };
}

async function writeNotes(extra) {
  const notesFile = {
    job: job.id,
    kind: job.kind,
    at: now(),
    model,
    effort: reasoning.effort,
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
    summaries: trace.summaries,
    usage: { requests: usage.requests, inputTokens: usage.inputTokens, cachedTokens: usage.cachedTokens, outputTokens: usage.outputTokens, webSearches: usage.webSearches, images: usage.images },
    cost: await cost(),
    runSummary: runSummary(extra.attempts ?? 0),
    ...extra,
  };
  await putObject(`ai/${job.postId}/${job.id}.json`, JSON.stringify(notesFile, null, 2), 'application/json');
  return notesFile;
}

/** The private record for briefs/ in blog-private, which later research reads to keep the mix. */
function briefMarkdown(brief, outcome, post, problems) {
  const chosen = brief.chosen;
  const lines = [
    `# ${post?.title ?? chosen?.working_title ?? 'No post this time'}`,
    '',
    `- Date: ${today.iso}`,
    `- Outcome: ${outcome}`,
    `- Source: ${choice.source ?? 'on request'}`,
    chosen ? `- Editorial category: ${chosen.editorial_category}, site category \`${chosen.site_category}\`` : null,
    post ? `- Slug: \`${post.slug}\`` : null,
    `- Admin post: ${job.postId}`,
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

function result(outcome, extra = {}) {
  const full = { outcome, ...extra };
  writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(full, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(full).map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}\n`).join(''));
  }
  console.log(`${outcome}${extra.title ? `: ${extra.title}` : ''}`);
  console.log(runSummary(extra.attempts ?? 0));
}

/** Edits a file in the private repository. A failure is logged and returned, not thrown: the post is saved by then. */
async function editPrivate(file, message, change) {
  try {
    const { changed } = await editRepoFile({ repo: PRIVATE_REPO, path: file, token: process.env.GITHUB_TOKEN, message, change });
    return { changed, error: null };
  } catch (error) {
    console.error(`Couldn't save ${file}:`, error.message);
    return { changed: false, error: `${file} couldn't be saved: ${error.message}` };
  }
}

// ---- the jobs --------------------------------------------------------------------------

async function generate() {
  const snap = job.snapshot;
  const topic = snap.notes.trim();
  const roughDraft = snap.body.trim();
  await stage('researching', 'Research');
  console.log(`Researching (${catalogue.length} posts, ${notes.length} notes${topic ? ', with notes for this post' : ''}${roughDraft ? ', from a rough draft' : ''})`);
  const brief = await research({ topic, roughDraft });
  const briefFile = (post, outcome, problems = []) => {
    const name = `${today.iso}-${post?.slug ?? outcome}.md`;
    writeFileSync(path.join(outDir, 'brief.md'), briefMarkdown(brief, outcome, post, problems));
    return name;
  };

  if (brief.decision === 'skip' || !brief.chosen) {
    await writeNotes({ brief, outcome: 'skip' });
    result('skip', { reason: brief.reason, brief_file: briefFile(null, 'skip') });
    return { status: 'done', stage: 'skipped', outcome: 'skip', reason: brief.reason };
  }

  console.log(`Chosen: ${brief.chosen.working_title} (${brief.evidence.length} pieces of evidence)`);
  const written = await draft(brief, roughDraft);
  if (written.leaks.length || !writtenDir) {
    const reason = written.leaks.length
      ? `${written.leaks.length} passages still repeated the private material after ${written.attempts} attempts, so the draft was discarded.`
      : `The draft never had a usable slug: ${checkSlug(written.post.slug, site)}`;
    await writeNotes({ brief, outcome: 'failed', reason, attempts: written.attempts });
    result('failed', { reason, brief_file: briefFile(null, 'failed', [reason]) });
    return { status: 'failed', stage: 'drafting', error: reason };
  }

  const covered = written.problems.length ? { note: null } : await addCover(written.post);
  const post = written.post;
  await stage('saving', 'Saving');
  if (covered.image) await putObject(`posts/${job.postId}/${COVER_FILE}`, covered.image, 'image/webp');
  const fields = {
    title: post.title,
    slug: snap.slugTouched && snap.slug ? snap.slug : post.slug,
    slugTouched: !!snap.slugTouched,
    description: post.description,
    category: post.category,
    tags: post.tags,
    share: post.share,
    body: post.body,
    ...(covered.image ? { cover: COVER_FILE, coverAlt: post.cover_alt } : {}),
  };
  const { version, beforeId } = await save(fields, { before: 'Before generating', after: `Generated by ${model}`, kind: 'generated' });
  const writingNotes = [...written.notes, ...(covered.note ? [covered.note] : [])];
  // The idea the topic came from, if any, is marked with this draft
  if (brief.idea_id) {
    const marked = await editPrivate(IDEAS_FILE, `Marked the idea behind "${post.title}" as used`, (text) =>
      changeIdea(text, brief.idea_id, (idea) => ({ ...idea, used: today.iso, post: job.postId })),
    );
    if (marked.error) writingNotes.push(marked.error);
  }
  await writeNotes({ brief, outcome: 'draft', notesForKeith: post.notes_for_keith, problems: written.problems, attempts: written.attempts, writingNotes });
  result('draft', { title: post.title, slug: fields.slug, attempts: written.attempts, brief_file: briefFile({ ...post, slug: fields.slug }, 'draft', written.problems) });
  return { status: 'done', stage: 'done', outcome: 'draft', version, beforeId, problems: written.problems };
}

/** The brief of the run that generated this post, split into what may reach the model and what stays out. */
async function earlierBrief() {
  if (!current.ai?.brief) return { forPost: '', reasons: '' };
  const earlier = await getJson(`ai/${job.postId}/${current.ai.brief}.json`);
  const brief = earlier?.brief ?? null;
  if (!brief?.chosen) return { forPost: '', reasons: brief ? JSON.stringify({ reason: brief.reason, shortlist: brief.shortlist }) : '' };
  const { chosen, evidence, questions_for_keith, reason, shortlist } = brief;
  return { forPost: JSON.stringify({ chosen, evidence, questions_for_keith }, null, 2), reasons: JSON.stringify({ reason, shortlist }) };
}

async function revise() {
  await stage('revising', 'Revision');
  const snap = job.snapshot;
  // The build needs a folder; a post without a usable slug yet borrows one for the check
  const slug = snap.slug && !checkSlug(snap.slug, { ...site, ownSlug: snap.slug }) ? snap.slug : 'admin-revision-in-progress';
  site.ownSlug = slug;
  const files = (await postFiles(job.postId)).filter((file) => file.name !== 'index.md');
  const base = { ...snap, slug, cover_alt: snap.coverAlt };
  writePost(base, { files, frontmatter: current.frontmatter ?? {} });
  const original = readFileSync(path.join(writtenDir, 'index.md'), 'utf8');
  const feedback = {
    requests: [choice.request].filter((text) => text?.trim()),
    review_summaries: [],
    line_comments: (choice.highlights ?? []).map((item) => ({ on: item.quote, comment: item.note })),
  };
  const { forPost, reasons } = await earlierBrief();
  const merged = (post) => ({ ...base, title: post.title, description: post.description, category: post.category, tags: post.tags, share: post.share, body: post.body });
  const written = await writeUntilClean({
    request: {
      model,
      reasoning,
      instructions: prompts.draftingInstructions({ instructions, siteGuide }),
      input: [
        { role: 'user', content: prompts.revisionInput({ today, catalogue, categories, projects, samples, brief: forPost, current: original, feedback }) },
      ],
      text: { format: prompts.postFormat(categoryIds, { revision: true }) },
      max_output_tokens: 64_000,
    },
    check: (post) => checkPost({ ...post, slug }, site, { story: true }),
    publicText: (post) => [post.title, post.description, ...Object.values(post.share), post.body, ...post.changes, ...post.notes_for_keith].join('\n'),
    privateShingles: shingles([...instructions, ...samples].map((doc) => doc.text).concat(reasons)),
    // Keith's own post and notes can be repeated
    publicShingles: shingles([siteGuide, projects, original, forPost, JSON.stringify(feedback)]),
    save: (post) => writePost(merged(post), { files, frontmatter: current.frontmatter ?? {} }),
    discard: () => writePost(base, { files, frontmatter: current.frontmatter ?? {} }),
    siteDir,
  });
  if (written.leaks.length) {
    const reason = "The revision kept repeating private material word for word, so the post is unchanged. Rewording the request may help.";
    await writeNotes({ outcome: 'failed', reason, attempts: written.attempts });
    result('failed', { reason });
    return { status: 'failed', stage: 'revising', error: reason };
  }
  const post = written.post;
  await stage('saving', 'Saving');
  const count = (await getItem({ pk: 'POST', sk: job.postId })).revisions ?? 0;
  const fields = { title: post.title, description: post.description, category: post.category, tags: post.tags, share: post.share, body: post.body, revisions: count + 1 };
  const { version, beforeId } = await save(fields, { before: 'Before revision', after: `Revision ${count + 1}`, kind: 'revised' });
  const lessons = choice.learn === false ? [] : post.style_lessons;
  const saved = lessons.length
    ? await editPrivate(LESSONS_FILE, `Saved style lessons from the revision of "${post.title}"`, (text) => reviseLessons(text, today.iso, post.title, lessons))
    : { error: null };
  await writeNotes({ outcome: 'revised', changes: post.changes, lessons, writingNotes: saved.error ? [saved.error] : [], notesForKeith: post.notes_for_keith, problems: written.problems, attempts: written.attempts });
  result('revised', { title: post.title, lessons: lessons.length, attempts: written.attempts });
  return { status: 'done', stage: 'done', outcome: 'revised', version, beforeId, changes: post.changes, lessons, problems: written.problems };
}

async function newCover() {
  await stage('cover', 'Cover');
  const snap = job.snapshot;
  // Keith's direction is the scene itself, word for word, so the model only writes its alt text.
  // Without one, the model picks a scene from the post.
  const direction = choice.instruction?.trim();
  const response = await respond({
    model,
    reasoning: { effort: 'low' },
    instructions: direction
      ? 'You write alt text for blog cover illustrations. Describe the scene exactly as given, for someone who cannot see it, in one or two sentences. Include any wording it shows. Add nothing that is not in the scene. Return the scene unchanged as cover_idea.'
      : 'You suggest cover illustrations for blog posts. Reply with one concrete scene or object that captures the post, slightly playful if it fits, with no text, logos, user interfaces, screenshots or real people, and alt text describing that illustration.',
    input: [
      {
        role: 'user',
        content: direction ? `The scene: ${direction}` : `Title: ${snap.title}\nDescription: ${snap.description}\n\nThe post:\n${snap.body.slice(0, 6000)}`,
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'cover',
        strict: true,
        schema: {
          type: 'object',
          properties: { cover_idea: { type: 'string' }, cover_alt: { type: 'string' } },
          required: ['cover_idea', 'cover_alt'],
          additionalProperties: false,
        },
      },
    },
    max_output_tokens: 4000,
  });
  const reply = JSON.parse(outputText(response));
  const cover_idea = direction || reply.cover_idea;
  const { cover_alt } = reply;
  const image = await generateCover({
    siteDir,
    title: snap.title,
    idea: cover_idea,
    color: categories.find((category) => category.id === snap.category)?.color ?? 'green',
    quotedText: !!direction,
    houseStyle: !(direction && choice.overrideStyle),
  });
  await stage('saving', 'Saving');
  await putObject(`posts/${job.postId}/${COVER_FILE}`, image, 'image/webp');
  const { version, beforeId } = await save({ cover: COVER_FILE, coverAlt: cover_alt }, { before: 'Before the new cover', after: 'New cover', kind: 'generated' });
  await writeNotes({ outcome: 'cover', coverIdea: cover_idea });
  result('cover', {});
  return { status: 'done', stage: 'done', outcome: 'cover', version, beforeId };
}

try {
  // Cancelled before the run got going
  if (job.status === 'cancelled') process.exit(0);
  await reportStage(job, 'starting', { runId: process.env.RUN_ID });
  const run = { generate, revise, cover: newCover }[job.kind];
  if (!run) throw new Error(`Unknown job kind "${job.kind}"`);
  const outcome = await run();
  removePost();
  const cost = (await getJson(`ai/${job.postId}/${job.id}.json`))?.cost ?? null;
  await finishJob(job, { ...outcome, cost, usage: { requests: usage.requests, inputTokens: usage.inputTokens, cachedTokens: usage.cachedTokens, outputTokens: usage.outputTokens, webSearches: usage.webSearches, images: usage.images } });
} catch (error) {
  removePost();
  await failJob(error);
  process.exitCode = 1;
}
