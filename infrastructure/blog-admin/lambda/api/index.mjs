// The blog admin's API. API Gateway has already checked the Cognito access token (issuer,
// client, expiry) before this runs; this checks the caller is in the admins group, then
// routes on the request.

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

const routes = {
  'GET /me': (claims) => json(200, { sub: claims.sub, username: claims.username }),
};

export async function handler(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  if (!groups(claims).includes(ADMIN_GROUP)) return json(403, { error: 'Not an admin' });
  const route = routes[event.routeKey];
  if (!route) return json(404, { error: `No route for ${event.routeKey}` });
  try {
    return await route(claims, event);
  } catch (error) {
    console.error(error);
    return json(500, { error: 'Something went wrong. The details are in the API log.' });
  }
}
