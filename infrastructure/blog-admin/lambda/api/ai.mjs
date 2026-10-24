// The AI jobs (docs/blog-admin-plan.md, stage 5): generating, revising and new covers. The API
// records a job and starts blog-ai.yml in the private repository, which runs
// scripts/blog-admin/ai-job.mjs with Keith's private material and reports back on the job.
// Also: which models to offer (from models.dev), the AI settings, and what the runs cost.
import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { GitHubError, cancelRun, dispatch } from './github.mjs';
import { allPosts, editable } from './posts.mjs';
import { AI_KINDS, BUCKET, HttpError, TABLE, busy, db, loadPost, now, s3, setting, update } from './store.mjs';

const { PRIVATE_REPO } = process.env;
const AI_WORKFLOW = 'blog-ai.yml';
const TIERS = ['luna', 'terra', 'sol', 'astra'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2'];

export const AI_DEFAULTS = {
  defaultModel: 'gpt-6.1-sol',
  effort: 'high',
  imageModel: 'gpt-image-2.5-flare',
  generations: ['gpt-6', 'gpt-5.6'],
  cap: null,
  webSearchRate: null,
  imageRate: null,
};

// A first run's tokens, from the post this admin's predecessor drafted (PR #2), for estimates
// until there are runs of its own
const TYPICAL = { generate: { input: 567_000, cached: 186_000, output: 20_000 }, revise: { input: 201_000, cached: 98_000, output: 7_000 }, cover: { input: 8_000, cached: 0, output: 1_000 } };

export async function aiSettings() {
  return { ...AI_DEFAULTS, ...((await setting('ai')) ?? {}) };
}

// ---- models ----------------------------------------------------------------------------

let catalogue = null;

async function modelsDev() {
  if (catalogue && Date.now() - catalogue.at < 60 * 60 * 1000) return catalogue.data;
  const response = await fetch('https://models.dev/api.json');
  if (!response.ok) throw new HttpError(502, `models.dev didn't answer (${response.status})`);
  catalogue = { data: await response.json(), at: Date.now() };
  return catalogue.data;
}

const generationOf = (id, generations) => generations.find((generation) => id === generation || id.startsWith(`${generation}.`) || id.startsWith(`${generation}-`)) ?? null;
const versionOf = (id) => (id.match(/^gpt-([\d.]+)/)?.[1] ?? '0').split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [versionOf(a), versionOf(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

function estimate(cost, tokens) {
  if (!cost) return null;
  return ((tokens.input - tokens.cached) * cost.input + tokens.cached * (cost.cache_read ?? cost.input) + tokens.output * cost.output) / 1e6;
}

/**
 * OpenAI's models on models.dev that reason, call tools and return structured output, aren't
 * deprecated and aren't pro, mini, nano, codex or preview variants: the newest of each tier in
 * each generation the settings allow. Plus any newer generation, so Settings can offer it.
 */
export async function listModels() {
  const settings = await aiSettings();
  const data = await modelsDev();
  const usable = Object.values(data.openai?.models ?? {}).filter(
    (model) =>
      model.reasoning &&
      model.tool_call &&
      model.structured_output &&
      model.status !== 'deprecated' &&
      (model.modalities?.output ?? []).includes('text') &&
      /^gpt-\d+(\.\d+)?(-(luna|terra|sol|astra))?$/.test(model.id),
  );
  const tierOf = (model) => model.id.match(/-(luna|terra|sol|astra)$/)?.[1] ?? model.family?.replace(/^gpt-/, '');
  const picked = new Map();
  for (const model of usable) {
    const generation = generationOf(model.id, settings.generations);
    const tier = tierOf(model);
    if (!generation || !TIERS.includes(tier)) continue;
    const key = `${generation}/${tier}`;
    const best = picked.get(key);
    // Newest wins; between equals, the name that says its tier (gpt-5.6-sol over gpt-5.6)
    const better = !best || newer(model.id, best.id) || (!newer(best.id, model.id) && /-(luna|terra|sol|astra)$/.test(model.id) && !/-(luna|terra|sol|astra)$/.test(best.id));
    if (better) picked.set(key, { ...model, generation, tier });
  }
  const typical = await typicalTokens();
  const models = [...picked.values()]
    .sort((a, b) => settings.generations.indexOf(a.generation) - settings.generations.indexOf(b.generation) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
    .map((model) => ({
      id: model.id,
      name: model.name,
      tier: model.tier,
      generation: model.generation,
      released: model.release_date,
      cost: model.cost ? { input: model.cost.input, cached: model.cost.cache_read ?? model.cost.input, output: model.cost.output } : null,
      estimate: Object.fromEntries(Object.entries(typical).map(([kind, tokens]) => [kind, estimate(model.cost, tokens)])),
      efforts: model.reasoning_options?.find((option) => option.type === 'effort')?.values ?? EFFORTS,
    }));
  const allowedNewest = settings.generations.reduce((best, generation) => (newer(`${generation}`, best) ? generation : best), 'gpt-0');
  const unlisted = [...new Set(usable.map((model) => model.id.match(/^(gpt-\d+(?:\.\d+)?)/)[1]))].filter(
    (generation) => !generationOf(generation, settings.generations) && newer(generation, allowedNewest),
  );
  return { models, newerGenerations: unlisted.sort((a, b) => (newer(a, b) ? -1 : 1)), imageModels: IMAGE_MODELS, settings };
}

/** Average tokens of past runs by kind, falling back to typical figures. */
async function typicalTokens() {
  const jobs = await recentJobs(90);
  const result = { ...TYPICAL };
  for (const kind of Object.keys(TYPICAL)) {
    const runs = jobs.filter((job) => job.kind === kind && job.status === 'done' && job.usage?.inputTokens);
    if (!runs.length) continue;
    const mean = (key) => Math.round(runs.reduce((sum, job) => sum + job.usage[key], 0) / runs.length);
    result[kind] = { input: mean('inputTokens'), cached: mean('cachedTokens'), output: mean('outputTokens') };
  }
  return result;
}

// ---- settings and spend -----------------------------------------------------------------

export async function saveAiSettings(input = {}) {
  const current = await aiSettings();
  const next = { ...current };
  if (input.defaultModel !== undefined) {
    if (typeof input.defaultModel !== 'string' || !/^gpt-[\w.-]+$/.test(input.defaultModel)) throw new HttpError(400, 'That isn’t a model name');
    next.defaultModel = input.defaultModel;
  }
  if (input.effort !== undefined) {
    if (!EFFORTS.includes(input.effort)) throw new HttpError(400, `Reasoning effort is one of ${EFFORTS.join(', ')}`);
    next.effort = input.effort;
  }
  if (input.imageModel !== undefined) {
    if (!IMAGE_MODELS.includes(input.imageModel)) throw new HttpError(400, `The image model is one of ${IMAGE_MODELS.join(', ')}`);
    next.imageModel = input.imageModel;
  }
  if (input.generations !== undefined) {
    const ok = Array.isArray(input.generations) && input.generations.length && input.generations.every((value) => /^gpt-\d+(\.\d+)?$/.test(value));
    if (!ok) throw new HttpError(400, 'Generations look like gpt-6 or gpt-5.6');
    next.generations = [...new Set(input.generations)];
  }
  for (const key of ['cap', 'webSearchRate', 'imageRate']) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && !(typeof input[key] === 'number' && input[key] >= 0)) throw new HttpError(400, `"${key}" must be a number of dollars, or empty`);
    next[key] = input[key];
  }
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'ai', value: next } }));
  return { settings: next };
}

async function recentJobs(days) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const jobs = [];
  let start;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: '#created >= :since',
        ExpressionAttributeValues: { ':pk': 'JOB', ':since': since },
        ProjectionExpression: '#id, #kind, #post, #status, #created, #usage, #cost, #params.#model, #dry',
        ExpressionAttributeNames: {
          '#id': 'id', '#kind': 'kind', '#post': 'postId', '#status': 'status', '#created': 'created',
          '#usage': 'usage', '#cost': 'cost', '#params': 'params', '#model': 'model', '#dry': 'dryRun',
        },
        ExclusiveStartKey: start,
      }),
    );
    jobs.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return jobs;
}

const ukMonth = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(date);

/** The AI runs in a month (YYYY-MM, the current one by default), with what each cost. */
export async function spend({ month } = {}) {
  const which = month && /^\d{4}-\d{2}$/.test(month) ? month : ukMonth();
  const jobs = (await recentJobs(400)).filter((job) => AI_KINDS.has(job.kind) && ukMonth(new Date(job.created)) === which);
  const posts = new Map((await allPosts(['id', 'title'])).map((post) => [post.id, post.title]));
  const runs = jobs
    .sort((a, b) => b.created.localeCompare(a.created))
    .map((job) => ({ ...job, model: job.params?.model ?? null, params: undefined, title: posts.get(job.postId) ?? null }));
  const total = runs.reduce((sum, job) => sum + (job.cost?.total ?? 0), 0);
  const settings = await aiSettings();
  return { month: which, runs, total: Math.round(total * 100) / 100, cap: settings.cap };
}

async function underCap() {
  const { cap } = await aiSettings();
  if (cap === null || cap === undefined) return;
  const { total } = await spend();
  if (total >= cap) throw new HttpError(402, `This month's AI runs have cost $${total.toFixed(2)}, which has reached your $${cap} cap. Raise it in Settings to run more.`);
}

// ---- jobs ------------------------------------------------------------------------------

async function choices(input, settings) {
  const model = input.model ?? settings.defaultModel;
  if (typeof model !== 'string' || !/^gpt-[\w.-]+$/.test(model)) throw new HttpError(400, 'Choose a model');
  const effort = input.effort ?? settings.effort;
  if (!EFFORTS.includes(effort)) throw new HttpError(400, `Reasoning effort is one of ${EFFORTS.join(', ')}`);
  const imageModel = input.imageModel ?? settings.imageModel;
  if (!IMAGE_MODELS.includes(imageModel)) throw new HttpError(400, `The image model is one of ${IMAGE_MODELS.join(', ')}`);
  return { model, effort, imageModel };
}

/** Records an AI job and starts the private repository's workflow. */
export async function startAiJob(kind, post, params) {
  if (post.status === 'bin') throw new HttpError(409, 'This post is in the bin. Restore it first.');
  if (busy(post)) throw new HttpError(409, 'Something is already happening to this post. Wait for it to finish.');
  await underCap();
  // The research stage avoids the topics and slugs of the admin's other drafts
  const others = (await allPosts(['id', 'title', 'slug', 'liveSlug', 'repoSlug', 'status'])).filter((other) => other.id !== post.id && other.status !== 'bin');
  const job = {
    id: randomUUID(),
    kind,
    postId: post.id,
    status: 'queued',
    stage: 'queued',
    created: now(),
    updated: now(),
    params: {
      ...params,
      takenSlugs: [...new Set(others.flatMap((other) => [other.slug, other.liveSlug, other.repoSlug]).filter(Boolean))],
      drafts: others.filter((other) => !other.liveSlug && other.title).map((other) => ({ title: other.title, slug: other.slug || null })),
    },
    snapshot: { ...editable(post), version: post.version },
  };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'JOB', sk: job.id, ...job } }));
  const state = { id: job.id, kind, status: 'queued', stage: 'queued', at: job.created };
  await update({ pk: 'POST', sk: post.id }, { job: state });
  try {
    await dispatch(PRIVATE_REPO, AI_WORKFLOW, { job: job.id });
  } catch (error) {
    const message = error instanceof GitHubError ? error.message : 'GitHub didn’t start the AI job.';
    await update({ pk: 'JOB', sk: job.id }, { status: 'failed', error: message, updated: now() });
    await update({ pk: 'POST', sk: post.id }, { job: { ...state, status: 'failed' } });
    if (!(error instanceof GitHubError)) console.error(error);
    throw new HttpError(503, message);
  }
  return { job: state };
}

export async function generatePost(id, input = {}) {
  const settings = await aiSettings();
  return startAiJob('generate', await loadPost(id), { ...(await choices(input, settings)), source: input.source === 'weekly' ? 'weekly' : 'on request' });
}

export async function revisePost(id, input = {}) {
  const post = await loadPost(id);
  if (!post.body.trim()) throw new HttpError(409, 'There is nothing to revise yet. Generate the post, or write some of it, first.');
  const highlights = Array.isArray(input.highlights) ? input.highlights : [];
  const clean = highlights
    .filter((item) => typeof item?.quote === 'string' && typeof item?.note === 'string' && item.note.trim())
    .map((item) => ({ quote: item.quote.slice(0, 2000), note: item.note.slice(0, 2000) }));
  const request = typeof input.request === 'string' ? input.request.slice(0, 4000) : '';
  if (!clean.length && !request.trim()) throw new HttpError(400, 'Add a note on a passage, or an overall request, so the AI knows what to change.');
  const settings = await aiSettings();
  return startAiJob('revise', post, { ...(await choices(input, settings)), highlights: clean, request, learn: input.learn !== false });
}

export async function coverPost(id, input = {}) {
  const post = await loadPost(id);
  if (!post.title.trim()) throw new HttpError(409, 'Give the post a title first, so the cover has something to go on.');
  const settings = await aiSettings();
  const instruction = typeof input.instruction === 'string' ? input.instruction.slice(0, 1000) : '';
  return startAiJob('cover', post, { ...(await choices(input, settings)), instruction });
}

export async function cancelJob(id) {
  const { Item: job } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'JOB', sk: id } }));
  if (!job) throw new HttpError(404, 'There is no such job');
  if (!AI_KINDS.has(job.kind)) throw new HttpError(409, 'Only AI runs can be cancelled. A publish finishes once it has started.');
  if (!['queued', 'running'].includes(job.status)) return { status: job.status };
  if (job.runId) {
    await cancelRun(PRIVATE_REPO, job.runId);
  }
  // The run marks itself cancelled when it stops; one that hasn't started is marked here
  await update({ pk: 'JOB', sk: id }, { status: 'cancelled', updated: now() });
  await update({ pk: 'POST', sk: job.postId }, { job: { id, kind: job.kind, status: 'cancelled', stage: job.stage, at: now() } });
  return { status: 'cancelled' };
}

// ---- notes -----------------------------------------------------------------------------

async function notesFile(postId, jobId) {
  if (!jobId) return null;
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `ai/${postId}/${jobId}.json` }));
    return JSON.parse(await object.Body.transformToString());
  } catch (error) {
    if (error.name === 'NoSuchKey') return null;
    throw error;
  }
}

/** What the AI said about the post: its latest run, and the brief from the run that generated it. */
export async function aiNotes(id) {
  const post = await loadPost(id);
  const [latest, briefRun] = await Promise.all([notesFile(id, post.ai?.latest?.job), notesFile(id, post.ai?.brief)]);
  return { latest, brief: briefRun?.brief ?? null, briefRun: briefRun ? { job: briefRun.job, kind: briefRun.kind, at: briefRun.at, model: briefRun.model, cost: briefRun.cost, usage: briefRun.usage, summaries: briefRun.summaries, notesForKeith: briefRun.notesForKeith, problems: briefRun.problems, writingNotes: briefRun.writingNotes, attempts: briefRun.attempts } : null };
}
