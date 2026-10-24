// GitHub, for the admin's API: starting workflows, and reading posts on main. The token is a
// fine-grained one Keith pastes into Settings, kept as an SSM SecureString; it never reaches
// the browser again after that.
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const { GITHUB_TOKEN_PARAMETER, SITE_REPO } = process.env;
const ssm = new SSMClient({});
const API = 'https://api.github.com';

let cached = null;

export class GitHubError extends Error {}

/** The stored token, or null when none has been saved yet. Read at most once a minute. */
export async function token() {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  try {
    const { Parameter } = await ssm.send(new GetParameterCommand({ Name: GITHUB_TOKEN_PARAMETER, WithDecryption: true }));
    cached = { value: Parameter.Value, at: Date.now() };
  } catch (error) {
    if (error.name !== 'ParameterNotFound') throw error;
    cached = { value: null, at: Date.now() };
  }
  return cached.value;
}

async function request(path, { method = 'GET', body, auth } = {}) {
  const value = auth === undefined ? await token() : auth;
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'keithvassallo-blog-admin',
      ...(value ? { authorization: `Bearer ${value}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

/** Starts a workflow on main. */
export async function dispatch(repo, workflow, inputs) {
  if (!(await token())) throw new GitHubError('The admin has no GitHub token yet. Add one in Settings, then try again.');
  const response = await request(`/repos/${repo}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: { ref: 'main', inputs } });
  if (response.status === 204) return;
  const detail = await response.text();
  if (response.status === 401) throw new GitHubError('GitHub turned the token down. It may have expired: add a new one in Settings.');
  if (response.status === 403 || response.status === 404) throw new GitHubError(`The GitHub token can't start ${workflow} in ${repo}. Check it has Actions read and write there.`);
  throw new GitHubError(`GitHub didn't start ${workflow} (${response.status}): ${detail.slice(0, 300)}`);
}

/** A file or folder on the site repo's main branch, or null when it doesn't exist. */
export async function siteContents(path) {
  const response = await request(`/repos/${SITE_REPO}/contents/${path}?ref=main`);
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubError(`GitHub didn't send ${path} (${response.status})`);
  return response.json();
}

export async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'keithvassallo-blog-admin' } });
  if (!response.ok) throw new GitHubError(`GitHub didn't send ${url} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Checks a token can see both repositories, then stores it. Returns who it belongs to and when it expires. */
export async function saveToken(value, repos) {
  const user = await request('/user', { auth: value });
  if (user.status === 401) throw new GitHubError('GitHub doesn’t recognise that token.');
  for (const repo of repos) {
    const response = await request(`/repos/${repo}`, { auth: value });
    if (!response.ok) throw new GitHubError(`That token can't see ${repo}. Give it access to that repository.`);
  }
  // GitHub sends it as "2026-12-01 00:00:00 UTC", and not at all for tokens that never expire
  const header = user.headers.get('github-authentication-token-expiration');
  const expiry = header ? new Date(header.replace(' UTC', 'Z').replace(' ', 'T')) : null;
  const { login } = await user.json();
  await ssm.send(new PutParameterCommand({ Name: GITHUB_TOKEN_PARAMETER, Value: value, Type: 'SecureString', Overwrite: true }));
  cached = { value, at: Date.now() };
  return { login, expires: expiry && !Number.isNaN(expiry.valueOf()) ? expiry.toISOString() : header };
}
