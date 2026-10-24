// Posts in the admin's store. Each post is one item (pk POST, sk its id), text included;
// its images are files under posts/<id>/ in the bucket. Saves carry the version they were
// based on, so a save from a second device can't silently overwrite the first. Saves only
// touch the fields the editor owns, so a site job marking the post live never collides
// with one.
//
// History holds snapshots under pk VERSIONS#<id>. Saving takes one at most every ten minutes,
// and those expire after 30 days. Snapshots from restores (and, later, AI runs) are kept.
import { randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { renderPreview } from './preview.mjs';
import { BUCKET, HttpError, TABLE, aiBusy, db, imageKey, loadPost, now, s3, update, viewUrl } from './store.mjs';

const DAY = 24 * 60 * 60 * 1000;
const CHECKPOINT_EVERY = 10 * 60 * 1000;
const AUTOSAVE_KEPT = 30 * DAY;
const BIN_KEPT = 30 * DAY;

/** Fields the editor sets, with what an empty post starts with */
export const EDITABLE = {
  title: '',
  slug: '',
  slugTouched: false,
  description: '',
  category: '',
  tags: [],
  cover: null,
  coverAlt: '',
  share: {},
  notes: '',
  body: '',
};
const LIST_FIELDS = [
  'id', 'title', 'slug', 'description', 'category', 'tags', 'cover', 'status', 'source', 'created', 'updated',
  'deletedAt', 'version', 'liveSlug', 'repoSlug', 'publishedVersion', 'scheduledFor', 'job',
];
/** Names the editor gives uploads */
const IMAGE_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.(webp|jpg|png|gif)$/;
const IMAGE_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
/** Any file name in a post folder, including ones a post brought with it from the repo */
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const editable = (post) => Object.fromEntries(Object.keys(EDITABLE).map((key) => [key, post[key] ?? EDITABLE[key]]));
const publicPost = ({ pk, sk, checkpointAt, ...post }) => post;

/** Checks the editor's fields have the right shapes; returns them cleaned. */
export function validated(input) {
  const fields = {};
  for (const [key, empty] of Object.entries(EDITABLE)) {
    const value = input[key] ?? empty;
    const ok =
      key === 'tags' ? Array.isArray(value) && value.every((tag) => typeof tag === 'string')
      : key === 'share' ? value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((text) => typeof text === 'string')
      : key === 'cover' ? value === null || (FILE_NAME.test(value) && value !== 'index.md')
      : typeof value === typeof empty;
    if (!ok) throw new HttpError(400, `"${key}" has the wrong shape`);
    fields[key] = value;
  }
  if (JSON.stringify(fields).length > 300_000) throw new HttpError(413, 'The post is too long to save');
  return fields;
}

export async function images(id) {
  const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `posts/${id}/` }));
  return Promise.all(
    Contents.map(async ({ Key, Size }) => ({ name: Key.slice(`posts/${id}/`.length), size: Size, url: await viewUrl(Key) })),
  );
}

export async function snapshot(post, kind, label, keep) {
  const at = now();
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `VERSIONS#${post.id}`,
        sk: `${at}#${randomUUID().slice(0, 8)}`,
        kind,
        label,
        at,
        version: post.version,
        post: editable(post),
        ...(keep ? {} : { expiresAt: Math.floor((Date.now() + AUTOSAVE_KEPT) / 1000) }),
      },
    }),
  );
}

/** Writes new editor fields if nobody saved since `expected`; otherwise a 409 with what's there now. */
export async function writeFields(id, fields, expected, extra = {}) {
  try {
    await update({ pk: 'POST', sk: id }, { ...fields, ...extra, version: expected + 1 }, { condition: 'version = :expected', expected });
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
    throw new HttpError(409, 'This post changed on another device', { current: publicPost(await loadPost(id)) });
  }
  return expected + 1;
}

async function purge(post) {
  const { Items = [] } = await db.send(
    new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `VERSIONS#${post.id}` }, ProjectionExpression: 'pk, sk' }),
  );
  await Promise.all(Items.map((item) => db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: item.pk, sk: item.sk } }))));
  const files = await images(post.id);
  if (files.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: files.map((file) => ({ Key: imageKey(post.id, file.name) })) } }));
  }
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: 'POST', sk: post.id } }));
}

export async function allPosts(fields = LIST_FIELDS) {
  const { Items = [] } = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'POST' },
      ProjectionExpression: fields.map((_, index) => `#f${index}`).join(', '),
      ExpressionAttributeNames: Object.fromEntries(fields.map((field, index) => [`#f${index}`, field])),
    }),
  );
  return Items;
}

export async function listPosts() {
  const items = await allPosts();
  // The bin empties itself: anything deleted over 30 days ago goes for good on the next look
  const expired = items.filter((post) => post.status === 'bin' && Date.now() - Date.parse(post.deletedAt) > BIN_KEPT);
  await Promise.all(expired.map(purge));
  const posts = items.filter((post) => !expired.includes(post));
  return {
    posts: await Promise.all(
      posts.map(async (post) => ({ ...post, coverUrl: post.cover ? await viewUrl(imageKey(post.id, post.cover)) : null })),
    ),
  };
}

export async function createPost(input) {
  const at = now();
  const post = {
    id: randomUUID(),
    ...validated({ ...EDITABLE, title: input.title ?? '', notes: input.notes ?? '' }),
    status: 'draft',
    source: 'by-hand',
    created: at,
    updated: at,
    version: 1,
  };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'POST', sk: post.id, ...post }, ConditionExpression: 'attribute_not_exists(sk)' }));
  return getPost(post.id);
}

export async function getPost(id, extra = {}) {
  const post = publicPost(await loadPost(id));
  return { ...post, images: await images(id), ...extra };
}

export async function savePost(id, input) {
  const current = await loadPost(id);
  if (current.status === 'bin') throw new HttpError(409, 'This post is in the bin. Restore it first.');
  if (aiBusy(current)) throw new HttpError(423, 'The AI is working on this post. Wait for it to finish, or cancel it.');
  if (input.version !== current.version) {
    throw new HttpError(409, 'This post changed on another device', { current: publicPost(current) });
  }
  const at = now();
  const due = !current.checkpointAt || Date.now() - Date.parse(current.checkpointAt) > CHECKPOINT_EVERY;
  const fields = validated(input);
  const version = await writeFields(id, fields, current.version, { updated: at, ...(due ? { checkpointAt: at } : {}) });
  if (due) await snapshot({ ...current, ...fields, version }, 'autosave', 'Your edits', false);
  return { version, updated: at };
}

export async function binPost(id) {
  const current = await loadPost(id);
  if (current.liveSlug) throw new HttpError(409, 'This post is live. Unpublish it, or delete it from the live site, first.');
  if (current.status === 'scheduled') throw new HttpError(409, 'This post is scheduled. Cancel the schedule first.');
  // A status change, not an edit, so the version stays and an open editor carries on saving
  await update({ pk: 'POST', sk: id }, { status: 'bin', deletedAt: now() });
  return getPost(id);
}

export async function unbinPost(id) {
  await loadPost(id);
  await update({ pk: 'POST', sk: id }, { status: 'draft', updated: now() }, { remove: ['deletedAt'] });
  return getPost(id);
}

export async function listVersions(id) {
  await loadPost(id);
  const { Items = [] } = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `VERSIONS#${id}` },
      ProjectionExpression: 'sk, kind, label, #at, version, expiresAt',
      ExpressionAttributeNames: { '#at': 'at' },
      ScanIndexForward: false,
    }),
  );
  return { versions: Items.map(({ sk, ...version }) => ({ id: sk, ...version })) };
}

async function loadVersion(id, versionId) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `VERSIONS#${id}`, sk: versionId } }));
  if (!Item) throw new HttpError(404, 'There is no such version');
  return Item;
}

export async function getVersion(id, versionId) {
  const { pk, sk, ...version } = await loadVersion(id, versionId);
  return { id: sk, ...version };
}

/** Makes an earlier version the current one. What it replaces is kept in History too. */
export async function restoreVersion(id, versionId) {
  const [current, version] = await Promise.all([loadPost(id), loadVersion(id, versionId)]);
  await snapshot(current, 'autosave', 'Before restoring', false);
  const at = now();
  const fields = editable(version.post);
  const next = await writeFields(id, fields, current.version, { updated: at, checkpointAt: at });
  const when = new Date(version.at).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
  await snapshot({ ...current, ...fields, version: next }, 'restored', `Restored ${version.label.toLowerCase()} from ${when}`, true);
  return getPost(id);
}

/** A short-lived URL the browser uploads one image to, straight into the bucket. */
export async function imageUpload(id, { name, type }) {
  await loadPost(id);
  if (typeof name !== 'string' || !IMAGE_NAME.test(name)) throw new HttpError(400, 'Image names are lowercase words joined by hyphens, with an image extension');
  if (IMAGE_TYPES[name.split('.').pop()] !== type) throw new HttpError(400, 'The image type does not match its name');
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: imageKey(id, name), ContentType: type }), { expiresIn: 600 });
  return { name, url };
}

export async function preview(id, { body }) {
  if (typeof body !== 'string') throw new HttpError(400, 'Send the body to preview');
  await loadPost(id);
  const uploaded = new Set((await images(id)).map((file) => file.name));
  const html = await renderPreview(body, async (path) => {
    const name = path.replace(/^\.\//, '');
    return uploaded.has(name) ? viewUrl(imageKey(id, name)) : null;
  });
  return { html };
}
