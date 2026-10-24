// The weekly run's first step (blog-ai.yml, on its Saturday schedule). It reads the Weekly
// settings, then either records why there's no draft this week (the run is off, this week is
// skipped, or the month's AI spending has reached its cap), or creates the week's post with any
// queued topic as its notes, and the generate job for it. The job's id goes to GITHUB_OUTPUT
// for the next step, which runs ai-job.mjs.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TABLE, db, getItem, now, putItem, update } from './store.mjs';

const AI_DEFAULTS = { defaultModel: 'gpt-6.1-sol', effort: 'high', imageModel: 'gpt-image-2.5-flare', cap: null };
const WEEKLY_DEFAULTS = { enabled: true, topic: '', model: null, skip: null };
const EDITABLE = { title: '', slug: '', slugTouched: false, description: '', category: '', tags: [], cover: null, coverAlt: '', share: {}, notes: '', body: '' };

const ukDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
const ukMonth = (date = new Date()) => ukDate(date).slice(0, 7);

async function query(pk, projection, names) {
  const items = [];
  let start;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ProjectionExpression: projection,
        ExpressionAttributeNames: names,
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return items;
}

function output(job) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `job=${job ?? ''}\n`);
}

/** A week with no draft still shows on the Weekly page, with the reason. */
async function skipped(reason) {
  const id = randomUUID();
  await putItem({ pk: 'JOB', sk: id, id, kind: 'weekly', status: 'skipped', stage: 'skipped', reason, created: now(), updated: now(), params: { source: 'weekly' } });
  console.log(`No weekly draft: ${reason}`);
  output(null);
}

const weekly = { ...WEEKLY_DEFAULTS, ...((await getItem({ pk: 'SETTING', sk: 'weekly' }))?.value ?? {}) };
const ai = { ...AI_DEFAULTS, ...((await getItem({ pk: 'SETTING', sk: 'ai' }))?.value ?? {}) };
const today = ukDate();

if (!weekly.enabled) {
  await skipped('The weekly run is turned off.');
} else if (weekly.skip && weekly.skip >= today && weekly.skip <= ukDate(new Date(Date.now() + 6 * 864e5))) {
  await update({ pk: 'SETTING', sk: 'weekly' }, { value: { ...weekly, skip: null } });
  await skipped('You skipped this week.');
} else {
  const jobs = await query('JOB', '#c, #cost', { '#c': 'created', '#cost': 'cost' });
  const spent = jobs.filter((job) => job.created && ukMonth(new Date(job.created)) === ukMonth()).reduce((sum, job) => sum + (job.cost?.total ?? 0), 0);
  if (ai.cap !== null && ai.cap !== undefined && spent >= ai.cap) {
    await skipped(`This month's AI runs have cost $${spent.toFixed(2)}, which has reached your $${ai.cap} cap.`);
  } else {
    const posts = await query('POST', '#id, #t, #s, #l, #r, #st', { '#id': 'id', '#t': 'title', '#s': 'slug', '#l': 'liveSlug', '#r': 'repoSlug', '#st': 'status' });
    const others = posts.filter((post) => post.status !== 'bin');
    const at = now();
    const postId = randomUUID();
    const fields = { ...EDITABLE, notes: weekly.topic ?? '' };
    await putItem({ pk: 'POST', sk: postId, id: postId, ...fields, status: 'draft', source: 'weekly', created: at, updated: at, version: 1 });
    const jobId = randomUUID();
    const job = {
      id: jobId,
      kind: 'generate',
      postId,
      status: 'queued',
      stage: 'queued',
      created: at,
      updated: at,
      params: {
        model: weekly.model ?? ai.defaultModel,
        effort: ai.effort,
        imageModel: ai.imageModel,
        source: 'weekly',
        takenSlugs: [...new Set(others.flatMap((post) => [post.slug, post.liveSlug, post.repoSlug]).filter(Boolean))],
        drafts: others.filter((post) => !post.liveSlug && post.title).map((post) => ({ title: post.title, slug: post.slug || null })),
      },
      snapshot: { ...fields, version: 1 },
    };
    await putItem({ pk: 'JOB', sk: jobId, ...job });
    await update({ pk: 'POST', sk: postId }, { job: { id: jobId, kind: 'generate', status: 'queued', stage: 'queued', at } });
    // A queued topic is for one week only
    if (weekly.topic) await update({ pk: 'SETTING', sk: 'weekly' }, { value: { ...weekly, topic: '' } });
    console.log(`Weekly draft: job ${jobId} for post ${postId}${weekly.topic ? ', with the queued topic' : ''}`);
    output(jobId);
  }
}
