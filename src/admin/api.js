// Calls to the admin API (infrastructure/blog-admin), signed with the current access token.
import { config } from './config.js';
import { accessToken } from './auth.js';

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || `The admin API answered ${response.status}`), { status: response.status });
  }
  return data;
}
