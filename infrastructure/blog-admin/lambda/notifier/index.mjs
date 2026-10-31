// Tells Keith when a job ends: a draft is ready, a post is live, something failed, or the week
// had no draft. It runs on the table's change stream, filtered to job records, and sends an
// email through SES and a Web Push notification to each device he has allowed, as his
// notification settings say. Cancelled jobs, dry runs and pin changes stay quiet. A daily
// rule also runs it to warn him before the GitHub token in Settings expires.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import webpush from 'web-push';

const { TABLE, EMAIL, SES_REGION, VAPID_PUBLIC_KEY, VAPID_PARAMETER } = process.env;
const ADMIN = 'https://keithvassallo.com/admin';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({ region: SES_REGION });
const ssm = new SSMClient({});

const ENDED = new Set(['done', 'failed', 'skipped']);
export const EVENT_DEFAULTS = { draft: true, revision: true, live: true, failed: true, weekly: true };

let vapid = null;

async function setting(name) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'SETTING', sk: name } }));
  return Item?.value ?? null;
}

/** What to say about a job that has just ended, and which preference it falls under. */
function message(job, post) {
  const title = post?.title || 'Untitled';
  const link = post ? `${ADMIN}#/posts/${post.id}` : ADMIN;
  const live = post?.liveSlug ? `https://keithvassallo.com/blog/${post.liveSlug}` : null;
  if (job.status === 'failed') {
    if (job.kind === 'weekly') return { event: 'failed', subject: 'The weekly run failed', text: job.error ?? '', link: `${ADMIN}#/weekly` };
    const what = { generate: 'Generating', revise: 'The revision', cover: 'The new cover', publish: 'Publishing', unpublish: 'Unpublishing', delete: 'Deleting' }[job.kind] ?? 'A job';
    return { event: 'failed', subject: `${what} failed: ${title}`, text: `${what} for "${title}" stopped.\n\n${job.error ?? ''}`, link: job.runUrl ?? link };
  }
  if (job.kind === 'weekly' && job.status === 'skipped') {
    return { event: 'weekly', subject: 'No weekly draft this week', text: job.reason ?? 'The weekly run was skipped.', link: `${ADMIN}#/weekly` };
  }
  if (job.kind === 'generate') {
    if (job.outcome === 'skip') {
      return { event: 'weekly', subject: 'No draft: nothing met the bar', text: job.reason ?? 'The research found no topic that met the editorial bar.', link };
    }
    const weekly = job.params?.source === 'weekly';
    return { event: 'draft', subject: `${weekly ? 'Weekly draft' : 'Draft'} ready: ${title}`, text: `${title}\n\n${post?.description ?? ''}`, link };
  }
  if (job.kind === 'revise') return { event: 'revision', subject: `Revision ready: ${title}`, text: `${(job.changes ?? []).map((change) => `- ${change}`).join('\n')}`, link };
  if (job.kind === 'cover') return { event: 'revision', subject: `New cover: ${title}`, text: `The new cover for "${title}" is in.`, link };
  if (job.kind === 'publish') return { event: 'live', subject: `Live: ${title}`, text: `"${title}" is live${live ? ` at ${live}` : ''}.`, link: live ?? link };
  if (job.kind === 'unpublish' || job.kind === 'delete') {
    return { event: 'live', subject: `${job.kind === 'delete' ? 'Deleted' : 'Unpublished'}: ${title}`, text: `"${title}" is off the site.`, link };
  }
  return null;
}

async function email(note) {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: `Blog admin <${EMAIL}>`,
      Destination: { ToAddresses: [EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: note.subject },
          Body: { Text: { Data: `${note.text.trim()}\n\n${note.link}\n` } },
        },
      },
    }),
  );
}

async function push(note) {
  const { Items: devices = [] } = await db.send(
    new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'PUSH' } }),
  );
  if (!devices.length) return;
  if (!vapid) {
    const { Parameter } = await ssm.send(new GetParameterCommand({ Name: VAPID_PARAMETER, WithDecryption: true }));
    vapid = Parameter.Value;
    webpush.setVapidDetails(`mailto:${EMAIL}`, VAPID_PUBLIC_KEY, vapid);
  }
  const payload = JSON.stringify({ title: note.subject, body: note.text.trim().split('\n')[0].slice(0, 200), url: note.link });
  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(device.subscription, payload, { TTL: 24 * 60 * 60 });
      } catch (error) {
        // The browser has dropped the subscription, so forget the device
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: device.pk, sk: device.sk } }));
        } else {
          console.error(`Push to ${device.label} failed`, error.statusCode, error.body);
        }
      }
    }),
  );
}

/** Sends a note now, for Settings' test button, which invokes this Lambda directly. */
export async function send(note, channels = { email: true, push: true }) {
  if (channels.email) await email(note);
  if (channels.push) await push(note);
}

/** Warns 14 days and 3 days before the GitHub token expires, and once it has: each once per token. */
async function checkToken(prefs) {
  const github = await setting('github');
  if (!github?.expires || Number.isNaN(Date.parse(github.expires))) return { warned: null };
  const days = Math.ceil((Date.parse(github.expires) - Date.now()) / 864e5);
  const step = days <= 0 ? 'expired' : days <= 3 ? '3' : days <= 14 ? '14' : null;
  const record = await setting('token-warnings');
  const sent = record?.expires === github.expires ? record.sent : [];
  if (!step || sent.includes(step)) return { warned: null, days };
  const when = days <= 0 ? 'has expired' : `expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  await send(
    {
      subject: `The blog admin's GitHub token ${when}`,
      text: `The token ${github.login ? `(${github.login}'s) ` : ''}${when}. Without it, the admin can't publish, start AI jobs (the weekly run included) or save ideas and style lessons. Make a new fine-grained token on GitHub and paste it in Settings.`,
      link: `${ADMIN}#/settings`,
    },
    { email: prefs.email, push: prefs.push },
  );
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'token-warnings', value: { expires: github.expires, sent: [...sent, step] } } }));
  console.log(`Warned that the GitHub token ${when}`);
  return { warned: step, days };
}

export async function handler(event) {
  // A direct call from the API, for a test
  if (event.test) {
    await send({ subject: 'Test from the blog admin', text: 'Notifications reach this device.', link: ADMIN }, event.channels);
    return { sent: true };
  }
  const prefs = { email: true, push: true, ...((await setting('notify')) ?? {}) };
  if (event.check === 'token') return checkToken(prefs);
  const events = { ...EVENT_DEFAULTS, ...(prefs.events ?? {}) };
  for (const record of event.Records ?? []) {
    const job = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
    const before = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage) : null;
    if (job?.pk !== 'JOB' || !ENDED.has(job.status) || ENDED.has(before?.status) || job.dryRun || job.kind === 'pin') continue;
    const post = job.postId ? (await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'POST', sk: job.postId } }))).Item : null;
    const note = message(job, post);
    console.log(`Job ${job.id} (${job.kind}) ended ${job.status}: ${note && events[note.event] ? note.subject : 'not notifying'}`);
    if (!note || !events[note.event]) continue;
    try {
      await send(note, { email: prefs.email, push: prefs.push });
    } catch (error) {
      console.error('Notifying failed', error);
    }
  }
}
