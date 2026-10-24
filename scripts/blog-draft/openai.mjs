// A small client for the OpenAI Responses and Images APIs. Responses calls are stateless
// (`store: false`): the caller replays the whole conversation each turn, so the private
// writing samples and instructions are never kept on OpenAI's side between requests.

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const ATTEMPTS = 3;
const TIMEOUT_MS = 15 * 60_000;

/** Running totals for the run summary, and each request's tokens for pricing it. */
export const usage = { requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, webSearches: 0, images: 0, calls: [] };

/** The model's reasoning summaries, filed under whichever stage the caller says it is in. */
export const trace = { stage: 'other', summaries: {} };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** POSTs to the API, retrying rate limits, server errors and dropped connections. */
async function post(path, body) {
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res.json();
      const detail = (await res.text()).slice(0, 500);
      if (res.status !== 429 && res.status < 500) throw new Error(`OpenAI API ${res.status}: ${detail}`);
      failure = `OpenAI API ${res.status}: ${detail}`;
    } catch (error) {
      if (error.message.startsWith('OpenAI API')) throw error;
      failure = `OpenAI request failed: ${error.message}`;
    }
    if (attempt >= ATTEMPTS) throw new Error(failure);
    // Back off from rate limits and server errors; a dropped connection only needs a retry
    const seconds = attempt * (failure.startsWith('OpenAI API') ? 30 : 5);
    console.log(`${failure}. Retrying in ${seconds} seconds.`);
    await sleep(seconds * 1000);
  }
}

/** Creates a response. */
export async function respond(body) {
  // Encrypted reasoning lets a stateless conversation keep the model's reasoning across
  // tool calls. Newer models include it anyway; older ones need asking.
  const request = { store: false, include: ['reasoning.encrypted_content'], ...body };
  // Summaries of the model's reasoning, for the admin's AI notes
  if (body.reasoning && !body.reasoning.summary) request.reasoning = { ...body.reasoning, summary: 'auto' };
  let response;
  try {
    response = await post('/responses', request);
  } catch (error) {
    if (!request.reasoning?.summary || !/summary/i.test(error.message)) throw error;
    response = await post('/responses', { ...request, reasoning: body.reasoning });
  }
  const tokens = {
    model: body.model,
    input: response.usage?.input_tokens ?? 0,
    cached: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    output: response.usage?.output_tokens ?? 0,
  };
  usage.requests += 1;
  usage.inputTokens += tokens.input;
  usage.cachedTokens += tokens.cached;
  usage.outputTokens += tokens.output;
  usage.calls.push(tokens);
  usage.webSearches += response.output.filter((item) => item.type === 'web_search_call').length;
  const summaries = response.output.filter((item) => item.type === 'reasoning').flatMap((item) => item.summary ?? []).map((part) => part.text).filter(Boolean);
  if (summaries.length) (trace.summaries[trace.stage] ??= []).push(...summaries);
  if (response.status === 'incomplete') {
    throw new Error(`OpenAI response incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}`);
  }
  return response;
}

/** The text of a response's message, or an error if the model refused. */
export function outputText(response) {
  const parts = response.output.filter((item) => item.type === 'message').flatMap((item) => item.content);
  const refusal = parts.find((part) => part.type === 'refusal');
  if (refusal) throw new Error(`The model refused: ${refusal.refusal}`);
  return parts
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('');
}

/** Generates one image and returns its bytes. */
export async function generateImage(body) {
  const result = await post('/images/generations', { n: 1, ...body });
  usage.images += 1;
  const data = result.data?.[0]?.b64_json;
  if (!data) throw new Error('The Images API returned no image');
  return Buffer.from(data, 'base64');
}
