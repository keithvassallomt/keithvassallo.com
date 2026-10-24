// The admin's table and bucket, shared by the API's modules.
//
// Table keys:
//   POST / <id>              a post, text included
//   VERSIONS#<id> / <time>   a snapshot of a post for History
//   JOB / <id>               a site or AI job, and how far it has got
//   SETTING / <name>         github (the token's owner and expiry), pin
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const { TABLE, BUCKET } = process.env;
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const s3 = new S3Client({});

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    Object.assign(this, { status, extra });
  }
}

export const now = () => new Date().toISOString();

export const AI_KINDS = new Set(['generate', 'revise', 'cover']);
/** True while a job may still be running for a post: its workflow can't outlast an hour. */
export const busy = (post) => ['queued', 'running'].includes(post.job?.status) && Date.now() - Date.parse(post.job.at ?? 0) < 60 * 60 * 1000;
export const aiBusy = (post) => busy(post) && AI_KINDS.has(post.job.kind);
export const imageKey = (id, name) => `posts/${id}/${name.replace(/^\.\//, '')}`;
export const viewUrl = (key) => getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });

export async function loadPost(id) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'POST', sk: id } }));
  if (!Item) throw new HttpError(404, 'There is no such post');
  return Item;
}

export async function setting(name) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'SETTING', sk: name } }));
  return Item?.value ?? null;
}

/**
 * Sets `fields` on an item and deletes the attributes named in `remove`, optionally only if
 * `condition` (an expression over :expected) holds.
 */
export async function update(key, fields, { remove = [], condition = null, expected } = {}) {
  const set = Object.entries(fields).filter(([, value]) => value !== undefined);
  const all = [...set.map(([name]) => name), ...remove, ...(condition ? ['version'] : [])];
  const alias = Object.fromEntries([...new Set(all)].map((name, index) => [name, `#n${index}`]));
  const values = Object.fromEntries(set.map(([, value], index) => [`:v${index}`, value]));
  if (condition) values[':expected'] = expected;
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
      ...(condition ? { ConditionExpression: condition.replace(/\bversion\b/g, alias.version) } : {}),
    }),
  );
}
