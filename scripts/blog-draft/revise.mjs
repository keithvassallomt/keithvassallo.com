#!/usr/bin/env node
//
// Revises a draft post after Keith's review. Reads his comments on the pull request made
// since the last revision (line comments, review summaries and the /revise comment itself),
// rewrites the post on its blog-draft branch, and checks and builds it the same way as
// draft.mjs. General lessons about his voice are appended to instructions/keith-feedback.md
// in the private repository, so later drafts learn from them.
//
// Run by revise-blog-draft.yml in the private repository, with the site checked out at the
// pull request's branch.
//
// Usage:
//   OPENAI_API_KEY=... GITHUB_TOKEN=... node scripts/blog-draft/revise.mjs \
//     --private ../blog-private --out /tmp/revise --pr 12 [--request "..."]
//
// Writes reply.md (the public reply for the pull request) and result.json to --out.
// result.json's outcome is "revised", "nothing" (no new feedback) or "failed" (every
// attempt repeated private material, so the post was left as it was).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkPost, shingles } from './checks.mjs';
import {
  BRANCH_PREFIX,
  SITE_REPO,
  bullets,
  loadPrivate,
  loadSite,
  model,
  parsePost,
  postFile,
  reasoning,
  requireEnv,
  runSummary,
  serialisePost,
} from './context.mjs';
import { OWNER, pullRequestWithFeedback } from './github.mjs';
import * as prompts from './prompts.mjs';
import { writeUntilClean } from './writer.mjs';

// Replies go out with Keith's token, so they look like his comments. The markers tell them
// apart, and the latest "revised" reply is where new feedback starts.
const REVISED = '<!-- blog-draft:revised -->';
const NOTE = '<!-- blog-draft:note -->';
const FEEDBACK_FILE = 'instructions/keith-feedback.md';
const FEEDBACK_HEADER = `# Keith's corrections

Lessons from Keith's reviews of earlier drafts. They come from him directly, so they override anything the voice guide infers.
`;

const { values: args } = parseArgs({
  options: {
    private: { type: 'string' },
    out: { type: 'string' },
    pr: { type: 'string' },
    request: { type: 'string', default: '' },
  },
});
if (!args.private || !args.out || !args.pr) throw new Error('Usage: revise.mjs --private <dir> --out <dir> --pr <number> [--request "..."]');
requireEnv('OPENAI_API_KEY', 'GITHUB_TOKEN');

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const privateDir = path.resolve(args.private);
const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });

const { instructions, samples, briefs } = loadPrivate(privateDir);
const { today, siteGuide, projects, categories, categoryIds, catalogue, site } = loadSite(siteDir);
const { pull, comments, reviews, lineComments } = await pullRequestWithFeedback(SITE_REPO, Number(args.pr));

const branch = pull.head.ref;
if (pull.state !== 'open' || !branch.startsWith(BRANCH_PREFIX)) throw new Error(`#${args.pr} is not an open blog draft`);
const slug = branch.slice(BRANCH_PREFIX.length);
const file = postFile(siteDir, slug);
if (!existsSync(file)) throw new Error(`${file} doesn't exist. Is the site checked out at ${branch}?`);
const original = readFileSync(file, 'utf8');
const current = parsePost(original);
site.ownSlug = slug;

// --- Keith's feedback -------------------------------------------------------------------

const byKeith = (item) => item.user?.login === OWNER;
const since = comments.filter((comment) => byKeith(comment) && comment.body.includes(REVISED)).at(-1)?.created_at ?? '';
const fresh = (item, date) => byKeith(item) && !(item.body ?? '').includes('<!-- blog-draft:') && (date ?? '') > since;

// The lines a review comment is attached to are the end of its diff hunk
function quotedLines(comment) {
  const count = comment.start_line && comment.line ? comment.line - comment.start_line + 1 : 1;
  return comment.diff_hunk
    .split('\n')
    .slice(-count)
    .map((line) => line.replace(/^[+ ]/, ''))
    .join('\n');
}

const feedback = {
  requests: [
    args.request,
    ...comments.filter((comment) => fresh(comment, comment.created_at)).map((comment) => comment.body.replace(/^\s*\/revise\b/i, '')),
  ]
    .map((text) => text.trim())
    .filter(Boolean),
  review_summaries: reviews
    .filter((review) => fresh(review, review.submitted_at) && review.body?.trim())
    .map((review) => review.body.trim()),
  line_comments: lineComments
    .filter((comment) => fresh(comment, comment.created_at))
    .map((comment) => ({ on: quotedLines(comment), comment: comment.body.trim() })),
};

// --- Brief ------------------------------------------------------------------------------

// The decision and shortlist explain why this topic suits Keith, which stays private. From
// "## Brief" on, the brief is about the post itself.
const briefText = briefs.find((doc) => doc.text.includes(`\`${branch}\``))?.text ?? '';
const briefStart = briefText.search(/\n## (Brief|Evidence)\n/);
const briefReasons = briefStart < 0 ? briefText : briefText.slice(0, briefStart);
const briefForPost = briefStart < 0 ? '' : briefText.slice(briefStart + 1);

// --- Reports ----------------------------------------------------------------------------

function finish(outcome, reply, lessons = 0) {
  writeFileSync(path.join(outDir, 'reply.md'), `${reply}\n`);
  const result = { outcome, title: current.data.title ?? slug, lessons };
  writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(`${outcome}: ${result.title}`);
  console.log(runSummary());
}

function revisedReply({ post, problems, attempts }) {
  const lessons = post.style_lessons.length;
  return [
    REVISED,
    'Revised from your comments.',
    '',
    '**Changes**',
    '',
    bullets(post.changes),
    ...(post.notes_for_keith.length ? ['', '**Still to confirm**', '', bullets(post.notes_for_keith)] : []),
    ...(problems.length
      ? ['', `**Checks that still fail** after ${attempts} attempts`, '', bullets(problems.map((problem) => problem.replace(/\n/g, '\n  ')))]
      : []),
    ...(lessons ? ['', `Saved ${lessons} style lesson${lessons === 1 ? '' : 's'} for future drafts.`] : []),
    '',
    `<sub>${runSummary(attempts)}</sub>`,
  ].join('\n');
}

// --- Run --------------------------------------------------------------------------------

const count = feedback.requests.length + feedback.review_summaries.length + feedback.line_comments.length;
if (!count) {
  finish(
    'nothing',
    `${NOTE}\nNothing to revise: there are no comments from you since the last revision. Comment on the lines you want changed, or add a request after \`/revise\`.`,
  );
} else {
  console.log(`Revising ${branch} from ${count} pieces of feedback`);
  const merged = (post) => ({
    ...current.data,
    title: post.title,
    description: post.description,
    category: post.category,
    tags: post.tags,
    share: post.share,
  });
  const save = (post) => writeFileSync(file, serialisePost(merged(post), post.body));
  const restore = () => writeFileSync(file, original);
  const conversation = [pull, ...comments, ...reviews, ...lineComments].map((item) => item.body ?? '');

  const result = await writeUntilClean({
    request: {
      model,
      reasoning,
      instructions: prompts.draftingInstructions({ instructions, siteGuide, revision: true }),
      input: [
        {
          role: 'user',
          content: prompts.revisionInput({ today, catalogue, categories, projects, samples, brief: briefForPost, current: original, feedback }),
        },
      ],
      text: { format: prompts.postFormat(categoryIds, { revision: true }) },
      max_output_tokens: 64_000,
    },
    check: (post) => checkPost({ ...post, slug }, site),
    publicText: (post) =>
      [post.title, post.description, ...Object.values(post.share), post.body, ...post.changes, ...post.notes_for_keith].join('\n'),
    privateShingles: shingles([...instructions, ...samples].map((doc) => doc.text).concat(briefReasons)),
    // Anything already public on the pull request can be repeated
    publicShingles: shingles([siteGuide, projects, original, briefForPost, ...conversation]),
    save,
    discard: restore,
    siteDir,
  });

  if (result.leaks.length) {
    restore();
    finish(
      'failed',
      `${NOTE}\nI couldn't revise this without repeating private material word for word, so the post is unchanged. Rewording the request may help.`,
    );
  } else {
    // A revision that only fails style or build checks is still kept, with the failures listed
    if (result.problems.length) save(result.post);
    const lessons = result.post.style_lessons;
    if (lessons.length) {
      const feedbackFile = path.join(privateDir, FEEDBACK_FILE);
      const header = existsSync(feedbackFile) ? '' : FEEDBACK_HEADER;
      appendFileSync(feedbackFile, `${header}\n## ${today.iso}: ${result.post.title} (#${args.pr})\n\n${bullets(lessons)}\n`);
    }
    finish('revised', revisedReply(result), lessons.length);
  }
}
