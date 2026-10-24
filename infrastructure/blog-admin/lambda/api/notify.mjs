// Notification settings and the devices that get Web Push notifications. The notifier Lambda
// (lambda/notifier) does the sending; this is the admin's side: preferences, registering a
// device, and a test.
import { createHash } from 'node:crypto';
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { HttpError, TABLE, db, now, setting } from './store.mjs';

const { NOTIFIER_FUNCTION, VAPID_PUBLIC_KEY } = process.env;
const lambda = new LambdaClient({});
const EVENTS = ['draft', 'revision', 'live', 'failed', 'weekly'];

export async function notifySettings() {
  const prefs = (await setting('notify')) ?? {};
  const { Items = [] } = await db.send(
    new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'PUSH' }, ProjectionExpression: 'sk, label, created' }),
  );
  return {
    email: prefs.email ?? true,
    push: prefs.push ?? true,
    events: Object.fromEntries(EVENTS.map((event) => [event, prefs.events?.[event] ?? true])),
    devices: Items.map(({ sk, ...device }) => ({ id: sk, ...device })),
    vapidPublicKey: VAPID_PUBLIC_KEY,
  };
}

export async function saveNotifySettings(input = {}) {
  const current = (await setting('notify')) ?? {};
  const next = {
    email: typeof input.email === 'boolean' ? input.email : (current.email ?? true),
    push: typeof input.push === 'boolean' ? input.push : (current.push ?? true),
    events: Object.fromEntries(EVENTS.map((event) => [event, typeof input.events?.[event] === 'boolean' ? input.events[event] : (current.events?.[event] ?? true)])),
  };
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: 'SETTING', sk: 'notify', value: next } }));
  return notifySettings();
}

/** Remembers a browser's push subscription. Registering the same browser again replaces it. */
export async function addDevice({ subscription, label } = {}) {
  if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint) || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new HttpError(400, 'That isn’t a push subscription');
  }
  const id = createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 24);
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: 'PUSH', sk: id, subscription: { endpoint: subscription.endpoint, keys: subscription.keys }, label: String(label ?? 'A device').slice(0, 80), created: now() },
    }),
  );
  return notifySettings();
}

export async function removeDevice(id) {
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: 'PUSH', sk: id } }));
  return notifySettings();
}

export async function testNotification({ email = false, push = true } = {}) {
  const response = await lambda.send(
    new InvokeCommand({ FunctionName: NOTIFIER_FUNCTION, Payload: Buffer.from(JSON.stringify({ test: true, channels: { email, push } })) }),
  );
  if (response.FunctionError) throw new HttpError(502, 'The test didn’t send. The notifier’s log has the details.');
  return { sent: true };
}
