#!/usr/bin/env node
//
// Syncs the CloudFront key-value store read by infrastructure/cloudfront/viewer-request.js with
// the `redirectFrom` paths of published blog posts, so a renamed post answers its old URL with a
// 301. Runs in buildspec.yml after the S3 upload.
//
// Needs AWS CLI v2 (the key-value store API is signed with SigV4A) and REDIRECTS_KVS_ARN.
//
// Usage:
//   REDIRECTS_KVS_ARN=arn:... node scripts/sync-redirects.mjs
//   REDIRECTS_KVS_ARN=arn:... node scripts/sync-redirects.mjs --dry-run

import { execFileSync } from 'node:child_process';
import { readBlogFrontmatter } from '../src/lib/blog-frontmatter.mjs';

const kvsArn = process.env.REDIRECTS_KVS_ARN;
const dryRun = process.argv.includes('--dry-run');

if (!kvsArn) {
  console.error('REDIRECTS_KVS_ARN is not set');
  process.exit(1);
}

function aws(command, ...args) {
  const output = execFileSync(
    'aws',
    ['cloudfront-keyvaluestore', command, '--kvs-arn', kvsArn, ...args, '--output', 'json'],
    { encoding: 'utf8' },
  );
  return output.trim() ? JSON.parse(output) : {};
}

// Keys never end in a slash; the CloudFront function strips it before looking up
const normalise = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

const posts = readBlogFrontmatter().filter((post) => !post.draft);
const livePaths = new Set(posts.map((post) => `/blog/${post.slug}`));
const desired = new Map();

for (const post of posts) {
  for (const from of post.redirectFrom.map(normalise)) {
    // A redirect from a live post's own URL would make that post unreachable
    if (livePaths.has(from)) {
      console.error(`Refusing to redirect ${from}: a published post lives there (redirectFrom in ${post.slug})`);
      process.exit(1);
    }
    desired.set(from, `/blog/${post.slug}`);
  }
}

const { ETag } = aws('describe-key-value-store');
const current = new Map((aws('list-keys').Items ?? []).map((item) => [item.Key, item.Value]));

const puts = [...desired].filter(([key, value]) => current.get(key) !== value).map(([Key, Value]) => ({ Key, Value }));
const deletes = [...current.keys()].filter((key) => !desired.has(key)).map((Key) => ({ Key }));

for (const { Key, Value } of puts) console.log(`redirect ${Key} -> ${Value}`);
for (const { Key } of deletes) console.log(`remove   ${Key}`);

if (puts.length === 0 && deletes.length === 0) {
  console.log(`Redirects already in sync (${desired.size} total)`);
} else if (dryRun) {
  console.log('Dry run: no changes made');
} else {
  const changes = [];
  if (puts.length > 0) changes.push('--puts', JSON.stringify(puts));
  if (deletes.length > 0) changes.push('--deletes', JSON.stringify(deletes));
  aws('update-keys', '--if-match', ETag, ...changes);
  console.log(`Applied ${puts.length + deletes.length} redirect change(s)`);
}
