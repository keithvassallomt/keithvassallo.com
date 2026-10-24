// The weekly run (docs/blog-admin-plan.md, stage 6). blog-ai.yml runs every Saturday at 09:00
// UK time and, through scripts/blog-admin/weekly.mjs, reads these settings: whether it runs, a
// week to skip, a topic queued for the next run and the model. This module is the admin's side:
// the settings, the past runs, and running one straight away.
import { randomUUID } from 'node:crypto';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { aiSettings, generatePost } from './ai.mjs';
import { EDITABLE, allPosts } from './posts.mjs';
import { HttpError, TABLE, db, now, setting } from './store.mjs';

const DEFAULTS = { enabled: true, topic: '', model: null, skip: null };

export async function weeklySettings() {
  const settings = { ...DEFAULTS, ...((await setting('weekly')) ?? {}) };
  // A skip for a week that has gone by no longer applies
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  if (settings.skip && settings.skip < today) settings.skip = null;
  return settings;
}

/** The UK date and time of the next Saturday 09:00 run. */
function nextRun(from = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
      .formatToParts(from)
      .map((part) => [part.type, part.value]),
  );
  const days = { Sat: 0, Sun: 6, Mon: 5, Tue: 4, Wed: 3, Thu: 2, Fri: 1 }[parts.weekday];
  const ahead = days === 0 && Number(parts.hour) >= 9 ? 7 : days;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + ahead));
  return day.toISOString().slice(0, 10);
}

export async function getWeekly() {
  const settings = await weeklySettings();
  const posts = new Map((await allPosts(['id', 'title'])).map((post) => [post.id, post.title]));
  const jobs = [];
  let start;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'JOB' },
        ProjectionExpression: '#id, #kind, #post, #status, #stage, #created, #cost, #params.#source, #params.#model, #reason, #error, #outcome',
        ExpressionAttributeNames: {
          '#id': 'id', '#kind': 'kind', '#post': 'postId', '#status': 'status', '#stage': 'stage', '#created': 'created', '#cost': 'cost',
          '#params': 'params', '#source': 'source', '#model': 'model', '#reason': 'reason', '#error': 'error', '#outcome': 'outcome',
        },
        ExclusiveStartKey: start,
      }),
    );
    jobs.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  const runs = jobs
    .filter((job) => job.params?.source === 'weekly' && (job.kind === 'weekly' || job.kind === 'generate'))
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, 20)
    .map(({ params, ...job }) => ({ ...job, model: params?.model ?? null, title: posts.get(job.postId) ?? null }));
  let next = nextRun();
  // A skipped week moves the next run on by seven days
  if (settings.skip === next) next = nextRun(new Date(Date.parse(`${next}T12:00:00Z`)));
  return { settings, next, runs, defaultModel: (await aiSettings()).defaultModel };
}

export async function saveWeekly(input = {}) {
  const next = { ...(await weeklySettings()) };
  if (input.enabled !== undefined) next.enabled = !!input.enabled;
  if (input.topic !== undefined) {
    if (typeof input.topic !== 'string') throw new HttpError(400, 'The topic is text');
    next.topic = input.topic.slice(0, 4000);
  }
  if (input.model !== undefined) {
    if (input.model !== null && !/^gpt-[\w.-]+$/.test(input.model)) throw new HttpError(400, 'That isn’t a model name');
    next.model = input.model;
  }
  if (input.skip !== undefined) next.skip = input.skip === 'next' ? nextRun() : null;
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'weekly', value: next } }));
  return getWeekly();
}

/** A weekly-style draft now, with the queued topic if there is one. The schedule is unchanged. */
export async function runWeekly() {
  const settings = await weeklySettings();
  const id = randomUUID();
  const at = now();
  const post = { id, ...EDITABLE, notes: settings.topic ?? '', status: 'draft', source: 'weekly', created: at, updated: at, version: 1 };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'POST', sk: id, ...post }, ConditionExpression: 'attribute_not_exists(sk)' }));
  const result = await generatePost(id, { source: 'weekly', ...(settings.model ? { model: settings.model } : {}) });
  if (settings.topic) await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'weekly', value: { ...settings, topic: '' } } }));
  return { id, ...result };
}
