// The write, check, build and repair loop shared by draft.mjs and revise.mjs.

import { buildSite, findLeaks } from './checks.mjs';
import { outputText, respond } from './openai.mjs';
import { repairRequest } from './prompts.mjs';

export const ATTEMPTS = 3;

/**
 * Asks for a post until it passes the checks, the private-material check and a draft build,
 * feeding each failure back to the model. `save` puts a post on disk and `discard` undoes
 * that. Returns the last attempt; if it still fails, it has been discarded.
 */
export async function writeUntilClean({ request, check, publicText, privateShingles, publicShingles, save, discard, siteDir }) {
  const input = [...request.input];
  for (let attempt = 1; ; attempt++) {
    console.log(`Writing, attempt ${attempt}`);
    const response = await respond({ ...request, input });
    input.push(...response.output);
    discard();
    const post = JSON.parse(outputText(response));

    let problems = check(post);
    const leaks = findLeaks(publicText(post), privateShingles, publicShingles);
    if (!problems.length && !leaks.length) {
      save(post);
      const buildFailure = buildSite(siteDir);
      if (!buildFailure) return { post, problems, leaks, attempts: attempt };
      problems = [buildFailure];
      discard();
    }
    console.log(`  ${problems.length} problems, ${leaks.length} passages matching private material`);
    if (attempt === ATTEMPTS) return { post, problems, leaks, attempts: attempt };
    input.push({ role: 'user', content: repairRequest(problems, leaks) });
  }
}
