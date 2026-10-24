// The blog admin's API. API Gateway has already checked the Cognito access token (issuer,
// client, expiry) before this runs; this checks the caller is in the admins group, then
// routes on the request. EventBridge Scheduler also calls it directly, for scheduled posts.
import * as ai from './ai.mjs';
import * as posts from './posts.mjs';
import * as publishing from './publishing.mjs';
import * as notify from './notify.mjs';
import * as weekly from './weekly.mjs';
import { HttpError } from './store.mjs';

const ADMIN_GROUP = process.env.ADMIN_GROUP;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

/** HTTP APIs pass array claims as a string, "[admins other]", so read either form. */
function groups(claims) {
  const value = claims['cognito:groups'];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);
}

function input(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'The request body is not JSON');
  }
}

// Each route's key matches its route in lib/blog-admin-stack.js
export const routes = {
  'GET /me': ({ claims }) => ({ sub: claims.sub, username: claims.username }),
  'GET /posts': () => posts.listPosts(),
  'POST /posts': ({ body }) => posts.createPost(body),
  'POST /posts/import': ({ body }) => publishing.importPost(body),
  'GET /posts/{id}': ({ id }) => publishing.getPostWithRepo(id),
  'PUT /posts/{id}': ({ id, body }) => posts.savePost(id, body),
  'DELETE /posts/{id}': ({ id }) => posts.binPost(id),
  'POST /posts/{id}/restore': ({ id }) => posts.unbinPost(id),
  'GET /posts/{id}/versions': ({ id }) => posts.listVersions(id),
  'GET /posts/{id}/versions/{version}': ({ id, version }) => posts.getVersion(id, version),
  'POST /posts/{id}/versions/{version}/restore': ({ id, version }) => posts.restoreVersion(id, version),
  'POST /posts/{id}/images': ({ id, body }) => posts.imageUpload(id, body),
  'POST /posts/{id}/preview': ({ id, body }) => posts.preview(id, body),
  'POST /posts/{id}/publish': ({ id, body }) => publishing.publishPost(id, body),
  'DELETE /posts/{id}/schedule': ({ id }) => publishing.cancelSchedule(id),
  'POST /posts/{id}/unpublish': ({ id }) => publishing.unpublishPost(id),
  'POST /posts/{id}/delete-live': ({ id, body }) => publishing.deleteLivePost(id, body),
  'POST /posts/{id}/pin': ({ id, body }) => publishing.pinPost(id, body),
  'DELETE /posts/{id}/pin': ({ id }) => publishing.unpinPost(id),
  'POST /posts/{id}/repo': ({ id, body }) => publishing.repoChoice(id, body),
  'POST /posts/{id}/generate': ({ id, body }) => ai.generatePost(id, body),
  'POST /posts/{id}/revise': ({ id, body }) => ai.revisePost(id, body),
  'POST /posts/{id}/cover': ({ id, body }) => ai.coverPost(id, body),
  'GET /posts/{id}/ai': ({ id }) => ai.aiNotes(id),
  'GET /jobs/{id}': ({ id }) => publishing.getJob(id),
  'POST /jobs/{id}/cancel': ({ id }) => ai.cancelJob(id),
  'GET /models': () => ai.listModels(),
  'GET /weekly': () => weekly.getWeekly(),
  'PUT /weekly': ({ body }) => weekly.saveWeekly(body),
  'POST /weekly/run': () => weekly.runWeekly(),
  'GET /spend': ({ query }) => ai.spend(query),
  'GET /settings': async () => ({ ...(await publishing.getSettings()), ai: await ai.aiSettings(), notify: await notify.notifySettings() }),
  'PUT /settings/notify': ({ body }) => notify.saveNotifySettings(body),
  'POST /push': ({ body }) => notify.addDevice(body),
  'DELETE /push/{id}': ({ id }) => notify.removeDevice(id),
  'POST /push/test': ({ body }) => notify.testNotification(body),
  'PUT /settings/github-token': ({ body }) => publishing.setGitHubToken(body),
  'PUT /settings/ai': ({ body }) => ai.saveAiSettings(body),
};

export async function handler(event, context) {
  // Scheduled posts name this function as their target
  process.env.SELF_ARN = context?.invokedFunctionArn ?? process.env.SELF_ARN;
  if (event.timer) return publishing.timer(event);

  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  if (!groups(claims).includes(ADMIN_GROUP)) return json(403, { error: 'Not an admin' });
  const route = routes[event.routeKey];
  if (!route) return json(404, { error: `No route for ${event.routeKey}` });
  try {
    const { id, version } = event.pathParameters ?? {};
    return json(200, await route({ claims, id, version: version && decodeURIComponent(version), body: input(event), query: event.queryStringParameters ?? {} }));
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message, ...error.extra });
    console.error(error);
    return json(500, { error: 'Something went wrong. The details are in the API log.' });
  }
}
