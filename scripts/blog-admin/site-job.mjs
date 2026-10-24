// Runs one of the blog admin's site jobs (docs/blog-admin-plan.md, stage 4): publishing or
// updating a post, unpublishing or deleting one, or changing the pin. The admin's API records
// the job and starts .github/workflows/blog-admin-site.yml, which runs this. It reports each
// stage back to the job, so the admin can show progress, and finishes once the change is live.
//
// Usage (the workflow sets these):
//   TABLE=... BUCKET=... JOB=<id> [DRY_RUN=true] [RUN_URL=...] node scripts/blog-admin/site-job.mjs
//   node scripts/blog-admin/site-job.mjs --failed    marks the job failed after a crash
//
// A dry run does everything up to the production build check, then stops: nothing is
// committed and the post isn't changed.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { CodePipelineClient, ListPipelineExecutionsCommand } from '@aws-sdk/client-codepipeline';
import { PIN_FILE, readPin, removePostFolder, ukDate, writePin, writePostFolder } from './post-folder.mjs';

const { TABLE, BUCKET, JOB, RUN_URL } = process.env;
const DRY_RUN = process.env.DRY_RUN === 'true';
const SITE = 'https://keithvassallo.com';
const PIPELINE = 'keithvassallo.com';
const siteDir = process.cwd();

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({});
const pipeline = new CodePipelineClient({});

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (...args) => execFileSync('git', args, { cwd: siteDir, encoding: 'utf8' }).trim();

/** Sets fields on an item. `remove` lists attributes to delete. */
async function update(key, fields, remove = []) {
  const set = Object.entries(fields).filter(([, value]) => value !== undefined);
  const names = Object.fromEntries([...set.map(([name]) => name), ...remove].map((name, index) => [`#n${index}`, name]));
  const alias = Object.fromEntries(Object.entries(names).map(([placeholder, name]) => [name, placeholder]));
  const clauses = [
    set.length ? `SET ${set.map(([name], index) => `${alias[name]} = :v${index}`).join(', ')}` : '',
    remove.length ? `REMOVE ${remove.map((name) => alias[name]).join(', ')}` : '',
  ];
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: clauses.filter(Boolean).join(' '),
      ExpressionAttributeNames: names,
      ...(set.length ? { ExpressionAttributeValues: Object.fromEntries(set.map(([, value], index) => [`:v${index}`, value])) } : {}),
    }),
  );
}

const jobKey = { pk: 'JOB', sk: JOB };

async function stage(job, name, extra = {}) {
  console.log(`stage: ${name}`);
  const state = { id: job.id, kind: job.kind, status: 'running', stage: name, dryRun: DRY_RUN, at: now() };
  await update(jobKey, { status: 'running', stage: name, updated: now(), runUrl: RUN_URL, ...extra });
  if (job.postId) await update({ pk: 'POST', sk: job.postId }, { job: state });
}

async function images(postId) {
  const prefix = `posts/${postId}/`;
  const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  return Promise.all(
    Contents.map(async ({ Key }) => {
      const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
      return { name: Key.slice(prefix.length), data: await object.Body.transformToByteArray() };
    }),
  );
}

function build() {
  // A production build: drafts off, exactly what the deploy will build
  const { BLOG_DRAFTS, ...env } = process.env;
  const result = spawnSync('npm', ['run', 'build'], { cwd: siteDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n');
    throw new Error(`The site didn't build with this change, so nothing was published:\n${tail}`);
  }
}

const built = (slug) => existsSync(path.join(siteDir, 'dist/blog', slug, 'index.html'));

/** Commits and pushes, rebasing once if main moved on meanwhile. */
function commit(message) {
  git('add', '-A', 'src/content/blog', PIN_FILE);
  if (!git('status', '--porcelain', '--', 'src/content/blog', PIN_FILE)) return git('rev-parse', 'HEAD');
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', message);
  try {
    git('push', 'origin', 'HEAD:main');
  } catch {
    git('pull', '--rebase', 'origin', 'main');
    git('push', 'origin', 'HEAD:main');
  }
  return git('rev-parse', 'HEAD');
}

/** Waits for the CodePipeline run that deploys `commit`, then for `check` to pass on the live site. */
async function deployed(commit, check) {
  const until = Date.now() + 30 * 60 * 1000;
  let finished = false;
  while (Date.now() < until) {
    if (!finished) {
      const { pipelineExecutionSummaries = [] } = await pipeline.send(new ListPipelineExecutionsCommand({ pipelineName: PIPELINE, maxResults: 20 }));
      const run = pipelineExecutionSummaries.find((summary) => summary.sourceRevisions?.some((revision) => revision.revisionId === commit));
      if (run?.status === 'Failed' || run?.status === 'Stopped') throw new Error(`The deploy ${run.status.toLowerCase()}. Check the keithvassallo.com pipeline in CodePipeline.`);
      // Superseded means a later push deployed this commit too
      finished = run?.status === 'Succeeded' || run?.status === 'Superseded';
    }
    if (finished && (await check())) return;
    await sleep(15_000);
  }
  throw new Error('The change was committed, but it still isn’t live after 30 minutes. Check the keithvassallo.com pipeline.');
}

const answers = async (url, status) => {
  const response = await fetch(url, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } }).catch(() => null);
  return response?.status === status;
};

async function run() {
  const { Item: job } = await db.send(new GetCommand({ TableName: TABLE, Key: jobKey }));
  if (!job) throw new Error(`There is no job ${JOB}`);
  const { Item: current } = job.postId ? await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'POST', sk: job.postId } })) : {};
  await stage(job, 'preparing', { dryRun: DRY_RUN });

  let message;
  let check;
  let after = null;
  const postKey = job.postId ? { pk: 'POST', sk: job.postId } : null;

  if (job.kind === 'publish') {
    // The post as it was when Publish was pressed, so edits made meanwhile wait for the next one
    const post = { ...job.snapshot, liveSlug: current.liveSlug, repoSlug: current.repoSlug, redirectFrom: current.redirectFrom, frontmatter: current.frontmatter };
    const first = !current.liveSlug;
    const dates = first ? { pubDate: job.params?.pubDate ?? ukDate() } : { pubDate: current.livePubDate, updatedDate: ukDate() };
    const { movedFrom, redirectFrom } = writePostFolder(siteDir, post, await images(job.postId), dates);
    const pin = readPin(siteDir);
    if (job.params?.pin) writePin(siteDir, post.slug, job.params.pin.until ?? null);
    else if (movedFrom && pin.slug === movedFrom) writePin(siteDir, post.slug, pin.until ?? null);
    await stage(job, 'building');
    build();
    if (!built(post.slug)) throw new Error(`The build passed, but has no page at /blog/${post.slug}. Is the post still a draft?`);
    message = `${first ? 'Published' : 'Updated'} blog post: ${post.title}`;
    check = () => answers(`${SITE}/blog/${post.slug}`, 200);
    after = (sha) => ({
      fields: {
        status: 'live',
        liveSlug: post.slug,
        livePubDate: dates.pubDate,
        liveCommit: sha,
        liveBlobSha: git('rev-parse', `${sha}:src/content/blog/${post.slug}/index.md`),
        publishedAt: now(),
        publishedVersion: job.snapshot.version,
        redirectFrom,
      },
      remove: ['scheduledFor', 'scheduleName', 'repoSlug'],
    });
  } else if (job.kind === 'unpublish' || job.kind === 'delete') {
    const slug = current.liveSlug;
    if (!slug) throw new Error('This post isn’t live, so there is nothing to take down.');
    removePostFolder(siteDir, slug);
    if (readPin(siteDir).slug === slug) writePin(siteDir, null);
    await stage(job, 'building');
    build();
    if (built(slug)) throw new Error(`The build still has a page at /blog/${slug}.`);
    message = `${job.kind === 'delete' ? 'Deleted' : 'Unpublished'} blog post: ${current.title}`;
    check = () => answers(`${SITE}/blog/${slug}`, 404);
    after = () => ({
      fields: job.kind === 'delete' ? { status: 'bin', deletedAt: now() } : { status: 'draft' },
      remove: ['liveSlug', 'livePubDate', 'liveCommit', 'liveBlobSha', 'publishedAt', 'publishedVersion'],
    });
  } else if (job.kind === 'pin') {
    const pin = job.params?.pin ?? null;
    writePin(siteDir, pin?.slug ?? null, pin?.until ?? null);
    await stage(job, 'building');
    build();
    message = pin ? `Pinned blog post: ${pin.slug}` : 'Unpinned the blog’s pinned post';
    check = async () => true;
  } else {
    throw new Error(`Unknown job kind "${job.kind}"`);
  }

  if (DRY_RUN) {
    console.log(`Dry run: would commit "${message}"`);
    console.log(git('status', '--short'));
    await finish(job, { status: 'done', stage: 'checked', dryRun: true });
    return;
  }

  await stage(job, 'committing');
  const sha = commit(message);
  if (postKey && after) {
    const { fields, remove } = after(sha);
    await update(postKey, fields, remove);
  }
  if (job.kind === 'pin' || job.params?.pin) await update({ pk: 'SETTING', sk: 'pin' }, { value: readPin(siteDir), updated: now() });
  await stage(job, 'deploying', { commit: sha });
  await deployed(sha, check);
  await finish(job, { status: 'done', stage: 'live', commit: sha });
}

async function finish(job, fields) {
  await update(jobKey, { ...fields, updated: now() });
  if (job.postId) {
    await update({ pk: 'POST', sk: job.postId }, { job: { id: job.id, kind: job.kind, status: fields.status, stage: fields.stage, dryRun: !!job.dryRun, at: now() } });
  }
}

async function fail(error) {
  console.error(error);
  const { Item: job } = await db.send(new GetCommand({ TableName: TABLE, Key: jobKey }));
  if (!job || job.status === 'failed') return;
  await finish(job, { status: 'failed', stage: job.stage ?? 'preparing', error: String(error?.message ?? error).slice(0, 4000), runUrl: RUN_URL });
}

if (process.argv.includes('--failed')) {
  await fail(new Error('The site job stopped unexpectedly. The log has the details.'));
} else {
  try {
    await run();
  } catch (error) {
    await fail(error);
    process.exitCode = 1;
  }
}
