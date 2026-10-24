// The models the AI jobs can use, from the API's reading of models.dev, with the defaults from
// Settings. Fetched once per visit; Settings refreshes it after a change.
import { api } from './api.js';

let loading = null;

export function loadModels({ fresh = false } = {}) {
  if (fresh) loading = null;
  loading ??= api('/models');
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** "about $0.98", or an empty string when there's no price to go on. */
export const dollars = (amount) => (amount === null || amount === undefined ? '' : `about $${amount.toFixed(2)}`);
