// Signing in to the admin. Cognito's managed login on auth.keithvassallo.com does the sign-in
// itself (password or passkey), then sends the browser back to /admin with a one-time code.
// This swaps the code for tokens using PKCE, which proves the browser that asked for the code
// is the one redeeming it, so the app needs no client secret.
//
// The access token lives in memory only. The refresh token goes in localStorage so the phone
// stays signed in for the month it lasts; signing out revokes it.
import { reactive } from 'vue';
import { config } from './config.js';

const REFRESH_KEY = 'kv-admin-refresh';
const PENDING_KEY = 'kv-admin-pending';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

/** What the screens need to know. `status` is loading, signed-out or signed-in. */
export const session = reactive({ status: 'loading', email: '', error: '' });

let tokens = null;
let refreshing = null;

const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode: the session simply ends with the tab
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was stored
    }
  },
};

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (length) => base64url(crypto.getRandomValues(new Uint8Array(length)));
const redirectUri = () => `${location.origin}/admin`;

/** The id token's claims, read for display only. The API checks the access token itself. */
function claims(jwt) {
  const body = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body), (char) => char.charCodeAt(0))));
}

/**
 * Sends the browser to a managed login page that ends by coming back here with a code.
 * `next` is a page to go on to straight after signing in.
 */
async function startAt(path, next = null) {
  const verifier = random(48);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = random(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, hash: location.hash, path, next }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.assign(`${config.authUrl}${path}?${params}`);
}

export const signIn = () => startAt('/oauth2/authorize');

/** Managed login's own page for registering a passkey on this device. */
export const addPasskey = () => startAt('/passkeys/add');

async function tokenRequest(body) {
  const response = await fetch(`${config.authUrl}/oauth2/token`, {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams({ client_id: config.clientId, ...body }),
  });
  if (!response.ok) throw new Error(`Cognito refused the sign-in (${response.status}). Try again.`);
  return response.json();
}

function keep(result) {
  tokens = { access: result.access_token, expires: Date.now() + result.expires_in * 1000 };
  if (result.refresh_token) storage.set(REFRESH_KEY, result.refresh_token);
  session.email = claims(result.id_token).email ?? '';
  session.status = 'signed-in';
}

async function refresh() {
  const refreshToken = storage.get(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    keep(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }));
    return true;
  } catch {
    storage.remove(REFRESH_KEY);
    return false;
  }
}

/** Finishes a sign-in that has just come back with a code, or resumes the stored session. */
export async function startSession() {
  const query = new URLSearchParams(location.search);
  if (query.has('code') || query.has('error') || query.has('result')) {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    sessionStorage.removeItem(PENDING_KEY);
    // Drop the code from the address bar, and go back to the screen that started the sign-in
    history.replaceState(null, '', `/admin${pending?.hash ?? ''}`);
    if (query.get('result') === 'invalid_session' && pending?.path === '/passkeys/add') {
      // Managed login only adds a passkey straight after a sign-in there, so sign in first
      return startAt('/oauth2/authorize', '/passkeys/add');
    }
    if (query.has('error')) {
      session.error = query.get('error_description') || query.get('error');
    } else if (!pending || pending.state !== query.get('state')) {
      session.error = 'That sign-in had expired. Sign in again.';
    } else {
      try {
        keep(
          await tokenRequest({
            grant_type: 'authorization_code',
            code: query.get('code'),
            redirect_uri: redirectUri(),
            code_verifier: pending.verifier,
          }),
        );
        if (pending.next) return startAt(pending.next);
        return;
      } catch (error) {
        session.error = error.message;
      }
    }
  }
  if (!(await refresh())) session.status = 'signed-out';
}

/** A current access token, refreshed when it's within a minute of expiring. */
export async function accessToken() {
  if (tokens && tokens.expires - Date.now() > 60_000) return tokens.access;
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  if (await refreshing) return tokens.access;
  session.status = 'signed-out';
  throw new Error('Your session ended. Sign in again.');
}

export async function signOut() {
  const refreshToken = storage.get(REFRESH_KEY);
  storage.remove(REFRESH_KEY);
  tokens = null;
  if (refreshToken) {
    await fetch(`${config.authUrl}/oauth2/revoke`, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token: refreshToken, client_id: config.clientId }),
    }).catch(() => {});
  }
  location.assign(`${config.authUrl}/logout?${new URLSearchParams({ client_id: config.clientId, logout_uri: redirectUri() })}`);
}
