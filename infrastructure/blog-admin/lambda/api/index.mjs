// The blog admin's API. API Gateway has already checked the Cognito access token (issuer,
// client, expiry) before this runs; this checks the caller is in the admins group, then
// routes on the request.
import * as posts from './posts.mjs';

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
    throw new posts.HttpError(400, 'The request body is not JSON');
  }
}

// Each route's key matches its route in lib/blog-admin-stack.js
export const routes = {
  'GET /me': ({ claims }) => ({ sub: claims.sub, username: claims.username }),
  'GET /posts': () => posts.listPosts(),
  'POST /posts': ({ body }) => posts.createPost(body),
  'GET /posts/{id}': ({ id }) => posts.getPost(id),
  'PUT /posts/{id}': ({ id, body }) => posts.savePost(id, body),
  'DELETE /posts/{id}': ({ id }) => posts.binPost(id),
  'POST /posts/{id}/restore': ({ id }) => posts.unbinPost(id),
  'GET /posts/{id}/versions': ({ id }) => posts.listVersions(id),
  'GET /posts/{id}/versions/{version}': ({ id, version }) => posts.getVersion(id, version),
  'POST /posts/{id}/versions/{version}/restore': ({ id, version }) => posts.restoreVersion(id, version),
  'POST /posts/{id}/images': ({ id, body }) => posts.imageUpload(id, body),
  'POST /posts/{id}/preview': ({ id, body }) => posts.preview(id, body),
};

export async function handler(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  if (!groups(claims).includes(ADMIN_GROUP)) return json(403, { error: 'Not an admin' });
  const route = routes[event.routeKey];
  if (!route) return json(404, { error: `No route for ${event.routeKey}` });
  try {
    const { id, version } = event.pathParameters ?? {};
    return json(200, await route({ claims, id, version: version && decodeURIComponent(version), body: input(event) }));
  } catch (error) {
    if (error instanceof posts.HttpError) return json(error.status, { error: error.message, ...error.extra });
    console.error(error);
    return json(500, { error: 'Something went wrong. The details are in the API log.' });
  }
}
