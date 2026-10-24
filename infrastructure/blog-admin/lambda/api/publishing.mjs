// Getting posts onto the live site and off it (docs/blog-admin-plan.md, stage 4). The API only
// records a job and starts the site repo's blog-admin-site.yml workflow, which does the work
// with scripts/blog-admin/site-job.mjs and reports back on the job. Scheduled posts get a
// one-off EventBridge Scheduler timer that calls this Lambda at the chosen minute.
//
// Posts on main open in the admin by copying them in (importPost). The copy remembers the git
// blob it came from, so a later edit in VS Code shows up as a change in the repo.
import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient } from '@aws-sdk/client-scheduler';
import { adminFields, parsePost } from '../../../../src/lib/post-file.mjs';
import { slugFormatProblem } from '../../../../src/lib/post-checks.mjs';
import { GitHubError, dispatch, download, saveToken, siteContents } from './github.mjs';
import { FILE_NAME, allPosts, editable, getPost, snapshot, writeFields } from './posts.mjs';
import { BUCKET, HttpError, TABLE, db, loadPost, now, s3, setting, update } from './store.mjs';

const { SITE_REPO, PRIVATE_REPO, SCHEDULE_GROUP, SCHEDULER_ROLE_ARN } = process.env;
const SITE_WORKFLOW = 'blog-admin-site.yml';
const scheduler = new SchedulerClient({});

const ukDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
const decode = (content) => Buffer.from(content, 'base64').toString('utf8');

// ---- jobs ------------------------------------------------------------------------------

/** Records a site job and starts the workflow. A job that can't start is marked failed. */
async function startSiteJob(kind, post, { params = {}, snapshotted = false, dryRun = false } = {}) {
  // A job only blocks the next for as long as the workflow could still be running it
  const busy = ['queued', 'running'].includes(post.job?.status) && Date.now() - Date.parse(post.job.at ?? 0) < 45 * 60 * 1000;
  if (busy) throw new HttpError(409, 'Something is already happening to this post. Wait for it to finish.');
  const job = {
    id: randomUUID(),
    kind,
    postId: post.id ?? null,
    status: 'queued',
    stage: 'queued',
    dryRun,
    params,
    created: now(),
    updated: now(),
    // The post as it is now, so later edits don't change what goes live
    ...(snapshotted ? { snapshot: { ...editable(post), version: post.version } } : {}),
  };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'JOB', sk: job.id, ...job } }));
  const state = { id: job.id, kind, status: 'queued', stage: 'queued', dryRun, at: job.created };
  if (post.id) await update({ pk: 'POST', sk: post.id }, { job: state });
  try {
    await dispatch(SITE_REPO, SITE_WORKFLOW, { job: job.id, dry_run: String(dryRun) });
  } catch (error) {
    const message = error instanceof GitHubError ? error.message : 'GitHub didn’t start the site job.';
    await update({ pk: 'JOB', sk: job.id }, { status: 'failed', error: message, updated: now() });
    if (post.id) await update({ pk: 'POST', sk: post.id }, { job: { ...state, status: 'failed' } });
    if (!(error instanceof GitHubError)) console.error(error);
    throw new HttpError(503, message);
  }
  return { job: state };
}

export async function getJob(id) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'JOB', sk: id } }));
  if (!Item) throw new HttpError(404, 'There is no such job');
  const { pk, sk, snapshot: _, ...job } = Item;
  return job;
}

// ---- what can be published -------------------------------------------------------------

/** Problems that would stop the site building or the post going live at its address. */
async function publishProblems(post) {
  const problems = [];
  if (!post.title.trim()) problems.push('It needs a title.');
  if (!post.description.trim()) problems.push('It needs a description.');
  if (!post.category) problems.push('It needs a category.');
  if (post.cover && !post.coverAlt.trim()) problems.push('The cover needs alt text.');
  const slugProblem = slugFormatProblem(post.slug);
  if (slugProblem) problems.push(slugProblem);
  else {
    const others = await allPosts(['id', 'slug', 'liveSlug', 'repoSlug', 'status']);
    const taken = others.some((other) => other.id !== post.id && other.status !== 'bin' && [other.slug, other.liveSlug, other.repoSlug].includes(post.slug));
    const ownFolder = [post.liveSlug, post.repoSlug].includes(post.slug);
    if (taken || (!ownFolder && (await siteContents(`src/content/blog/${post.slug}`)))) {
      problems.push(`The slug "${post.slug}" is already taken. Choose another.`);
    }
  }
  return problems;
}

async function publishable(id) {
  const post = await loadPost(id);
  if (post.status === 'bin') throw new HttpError(409, 'This post is in the bin. Restore it first.');
  const problems = await publishProblems(post);
  if (problems.length) throw new HttpError(422, problems.join(' '), { problems });
  return post;
}

function pinParam(pin, slug) {
  if (pin === undefined) return undefined;
  if (pin === null) return null;
  if (pin.until && Number.isNaN(Date.parse(pin.until))) throw new HttpError(400, 'The pin’s end date isn’t a date');
  return { slug, until: pin.until ?? null };
}

/**
 * Publishes now, or at a set time. `at` is a UK local time, YYYY-MM-DDTHH:MM. A dry run checks
 * the production build without committing anything.
 */
export async function publishPost(id, { when = 'now', at, pin, dryRun = false } = {}) {
  const post = await publishable(id);
  if (when === 'schedule') {
    if (post.liveSlug) throw new HttpError(409, 'This post is already live. Use Update live post instead.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at ?? '')) throw new HttpError(400, 'Choose a date and time to publish it');
    const name = `publish-${id}`;
    await scheduler.send(new DeleteScheduleCommand({ Name: name, GroupName: SCHEDULE_GROUP })).catch(() => {});
    await scheduler.send(
      new CreateScheduleCommand({
        Name: name,
        GroupName: SCHEDULE_GROUP,
        ScheduleExpression: `at(${at}:00)`,
        ScheduleExpressionTimezone: 'Europe/London',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ActionAfterCompletion: 'DELETE',
        Target: {
          Arn: process.env.SELF_ARN,
          RoleArn: SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ timer: 'publish', postId: id, pin: pinParam(pin, post.slug) ?? null }),
        },
      }),
    );
    await update({ pk: 'POST', sk: id }, { status: 'scheduled', scheduledFor: at, scheduleName: name });
    return getPost(id);
  }
  const params = { pubDate: ukDate(), ...(pin !== undefined ? { pin: pinParam(pin, post.slug) } : {}) };
  return startSiteJob('publish', post, { params, snapshotted: true, dryRun });
}

export async function cancelSchedule(id) {
  const post = await loadPost(id);
  if (post.status !== 'scheduled') throw new HttpError(409, 'This post isn’t scheduled');
  await scheduler.send(new DeleteScheduleCommand({ Name: post.scheduleName, GroupName: SCHEDULE_GROUP })).catch(() => {});
  await update({ pk: 'POST', sk: id }, { status: 'draft' }, { remove: ['scheduledFor', 'scheduleName'] });
  return getPost(id);
}

/** The scheduler's call at a scheduled post's minute. */
export async function timer(event) {
  if (event.timer !== 'publish') throw new Error(`Unknown timer ${event.timer}`);
  const post = await loadPost(event.postId);
  if (post.status !== 'scheduled') return { skipped: `status is ${post.status}` };
  const params = { pubDate: ukDate(), ...(event.pin ? { pin: { ...event.pin, slug: post.slug } } : {}) };
  return startSiteJob('publish', post, { params, snapshotted: true });
}

function live(post) {
  if (!post.liveSlug) throw new HttpError(409, 'This post isn’t live.');
  return post;
}

export async function unpublishPost(id) {
  return startSiteJob('unpublish', live(await loadPost(id)));
}

export async function deleteLivePost(id, { title } = {}) {
  const post = live(await loadPost(id));
  if (title !== post.title) throw new HttpError(400, 'Type the post’s title exactly to delete it.');
  return startSiteJob('delete', post);
}

export async function pinPost(id, { until = null } = {}) {
  const post = live(await loadPost(id));
  return startSiteJob('pin', post, { params: { pin: pinParam({ until }, post.liveSlug) } });
}

export async function unpinPost(id) {
  return startSiteJob('pin', live(await loadPost(id)), { params: { pin: null } });
}

// ---- posts already on main -------------------------------------------------------------

/** A post folder on main as the admin's fields, with its index.md's blob and its other files. */
async function readRepoPost(slug) {
  const folder = await siteContents(`src/content/blog/${slug}`);
  if (!Array.isArray(folder)) throw new HttpError(404, `There is no post at src/content/blog/${slug} on main`);
  const index = folder.find((entry) => entry.name === 'index.md');
  if (!index) throw new HttpError(404, `src/content/blog/${slug} has no index.md`);
  const file = await siteContents(index.path);
  const { data, body } = parsePost(decode(file.content));
  const files = folder.filter((entry) => entry.type === 'file' && entry.name !== 'index.md' && FILE_NAME.test(entry.name));
  return { ...adminFields(data), body, blob: file.sha, files };
}

async function copyFiles(id, files) {
  for (const entry of files) {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `posts/${id}/${entry.name}`, Body: await download(entry.download_url) }));
  }
}

/** Opens a post from main in the admin, copying it in the first time. */
export async function importPost({ slug } = {}) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) throw new HttpError(400, 'Which post?');
  const existing = (await allPosts(['id', 'liveSlug', 'repoSlug', 'status'])).find(
    (post) => post.status !== 'bin' && (post.liveSlug === slug || post.repoSlug === slug),
  );
  if (existing) return { id: existing.id };
  const repo = await readRepoPost(slug);
  const id = randomUUID();
  await copyFiles(id, repo.files);
  const at = now();
  const post = {
    id,
    title: repo.fields.title,
    slug,
    slugTouched: true,
    description: repo.fields.description,
    category: repo.fields.category,
    tags: repo.fields.tags,
    cover: repo.fields.cover,
    coverAlt: repo.fields.coverAlt,
    share: repo.fields.share,
    notes: '',
    body: repo.body,
    source: 'repo',
    created: at,
    updated: at,
    version: 1,
    redirectFrom: repo.redirectFrom,
    frontmatter: repo.frontmatter,
    liveBlobSha: repo.blob,
    ...(repo.draft
      ? { status: 'draft', repoSlug: slug }
      : { status: 'live', liveSlug: slug, livePubDate: repo.pubDate, publishedVersion: 1, publishedAt: at }),
  };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'POST', sk: id, ...post }, ConditionExpression: 'attribute_not_exists(sk)' }));
  await snapshot(post, 'imported', 'As it was in the repo', true);
  return { id };
}

/** The post, noting when its file on main has changed since the admin last wrote or read it. */
export async function getPostWithRepo(id) {
  const post = await loadPost(id);
  const slug = post.liveSlug ?? post.repoSlug;
  if (!slug || !post.liveBlobSha) return getPost(id);
  const file = await siteContents(`src/content/blog/${slug}/index.md`).catch(() => null);
  return getPost(id, file && file.sha !== post.liveBlobSha ? { repoChanged: true } : {});
}

/** After a change on main: load the repo's version over the admin's, or keep the admin's. */
export async function repoChoice(id, { use } = {}) {
  const post = await loadPost(id);
  const slug = post.liveSlug ?? post.repoSlug;
  if (!slug) throw new HttpError(409, 'This post isn’t in the repo');
  const repo = await readRepoPost(slug);
  if (use === 'repo') {
    await snapshot(post, 'autosave', 'Before loading the repo version', false);
    await copyFiles(id, repo.files);
    const fields = { ...editable({ ...post, ...repo.fields, body: repo.body }), slug, slugTouched: true };
    await writeFields(id, fields, post.version, { updated: now(), liveBlobSha: repo.blob, redirectFrom: repo.redirectFrom, frontmatter: repo.frontmatter });
  } else if (use === 'admin') {
    // The next publish overwrites the repo's version
    await update({ pk: 'POST', sk: id }, { liveBlobSha: repo.blob });
  } else {
    throw new HttpError(400, 'Choose repo or admin');
  }
  return getPost(id);
}

// ---- settings --------------------------------------------------------------------------

export async function getSettings() {
  return { github: await setting('github'), pin: await setting('pin') };
}

export async function setGitHubToken({ token } = {}) {
  if (typeof token !== 'string' || !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token.trim())) {
    throw new HttpError(400, 'That doesn’t look like a GitHub token. Fine-grained ones start with github_pat_.');
  }
  try {
    const github = { ...(await saveToken(token.trim(), [SITE_REPO, PRIVATE_REPO])), saved: now() };
    await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'github', value: github } }));
    return { github };
  } catch (error) {
    if (error instanceof GitHubError) throw new HttpError(400, error.message);
    throw error;
  }
}
