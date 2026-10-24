// The admin's table and bucket, for the jobs that run on GitHub Actions (site-job.mjs and
// ai-job.mjs). The keys are described in infrastructure/blog-admin/lambda/api/store.mjs.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const { TABLE, BUCKET, JOB, RUN_URL } = process.env;
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const s3 = new S3Client({});
export const now = () => new Date().toISOString();

export async function getItem(key) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: key }));
  return Item ?? null;
}

export const putItem = (item) => db.send(new PutCommand({ TableName: TABLE, Item: item }));

/**
 * Sets fields on an item and deletes the attributes in `remove`. With `expected`, only if the
 * item's version still matches it.
 */
export async function update(key, fields, { remove = [], expected } = {}) {
  const set = Object.entries(fields).filter(([, value]) => value !== undefined);
  const all = [...new Set([...set.map(([name]) => name), ...remove, ...(expected === undefined ? [] : ['version'])])];
  const alias = Object.fromEntries(all.map((name, index) => [name, `#n${index}`]));
  const values = Object.fromEntries(set.map(([, value], index) => [`:v${index}`, value]));
  if (expected !== undefined) values[':expected'] = expected;
  const expression = [
    set.length ? `SET ${set.map(([name], index) => `${alias[name]} = :v${index}`).join(', ')}` : '',
    remove.length ? `REMOVE ${remove.map((name) => alias[name]).join(', ')}` : '',
  ].filter(Boolean).join(' ');
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: expression,
      ExpressionAttributeNames: Object.fromEntries(Object.entries(alias).map(([name, placeholder]) => [placeholder, name])),
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
      ...(expected === undefined ? {} : { ConditionExpression: `${alias.version} = :expected` }),
    }),
  );
}

/** A post's files from the bucket, as name and bytes. */
export async function postFiles(postId) {
  const prefix = `posts/${postId}/`;
  const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  return Promise.all(
    Contents.map(async ({ Key }) => {
      const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
      return { name: Key.slice(prefix.length), data: await object.Body.transformToByteArray() };
    }),
  );
}

export const putObject = (key, body, contentType) =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ...(contentType ? { ContentType: contentType } : {}) }));

export async function getJson(key) {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return JSON.parse(await object.Body.transformToString());
  } catch (error) {
    if (error.name === 'NoSuchKey') return null;
    throw error;
  }
}

/** Reports a job's stage on the job and on its post, so the editor can show it. */
export async function reportStage(job, stage, extra = {}) {
  console.log(`stage: ${stage}`);
  await update({ pk: 'JOB', sk: job.id }, { status: 'running', stage, updated: now(), runUrl: RUN_URL, ...extra });
  if (job.postId) {
    await update({ pk: 'POST', sk: job.postId }, { job: { id: job.id, kind: job.kind, status: 'running', stage, dryRun: !!job.dryRun, at: now() } });
  }
}

/** Records how a job ended, on the job and on its post. */
export async function finishJob(job, fields) {
  await update({ pk: 'JOB', sk: job.id }, { ...fields, updated: now() });
  if (job.postId) {
    await update({ pk: 'POST', sk: job.postId }, {
      job: { id: job.id, kind: job.kind, status: fields.status, stage: fields.stage ?? job.stage, dryRun: !!job.dryRun, at: now() },
    });
  }
}

/** Marks the job failed, unless it already ended. Used after a crash or a cancelled run. */
export async function failJob(error, status = 'failed') {
  console.error(error);
  const job = await getItem({ pk: 'JOB', sk: JOB });
  if (!job || ['failed', 'cancelled', 'done'].includes(job.status)) return;
  await finishJob(job, { status, stage: job.stage ?? 'starting', error: String(error?.message ?? error).slice(0, 4000), runUrl: RUN_URL });
}
