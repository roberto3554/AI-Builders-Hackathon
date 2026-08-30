/**
 * @fileoverview Ollama API communication and AI helpers.
 * Dependencies: shared/locale.js, shared/preferences.js.
 * Used by: message-handler.js.
 */

import { t } from '../shared/locale.js';
import { DEFAULT_PREFERENCES, loadPreferences } from '../shared/preferences.js';

// =============================================================================
// Constants
// =============================================================================

const OLLAMA_DEFAULT_MODEL = DEFAULT_PREFERENCES.ollamaModel;
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const OLLAMA_TEMPERATURE = 0.7;
const OLLAMA_TOP_P = 0.9;
const MAX_DOM_ADAPTATION_STEPS = 3;
const ALLOWED_DOM_ACTIONS = new Set([
  'read_node',
  'set_text',
  'set_style',
  'set_attribute',
  'add_class',
  'remove_class',
  'hide_node',
  'show_node',
  'remove_node',
]);

// =============================================================================
// Ollama API communication
// =============================================================================

/**
 * Handles a raw Ollama request.
 *
 * @param {object} params - The request parameters.
 * @param {string} params.prompt - The prompt to send.
 * @param {string|null} [params.systemPrompt=null] - Optional system prompt.
 * @param {string} [params.model=OLLAMA_DEFAULT_MODEL] - The model to use.
 * @returns {Promise<object>} The Ollama response.
 * @throws Will throw if the fetch fails or returns a non-ok status.
 */
export async function handleOllamaRequest({
  prompt,
  systemPrompt = null,
  model = OLLAMA_DEFAULT_MODEL,
}) {
  const body = {
    model,
    prompt,
    system: systemPrompt || undefined,
    stream: false,
    options: {
      temperature: OLLAMA_TEMPERATURE,
      top_p: OLLAMA_TOP_P,
    },
  };

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return { ok: true, response: data.response };
}

/**
 * Convenience function to call Ollama and return only the response text.
 *
 * @param {string} prompt - The prompt to send.
 * @param {string|null} systemPrompt - Optional system prompt.
 * @param {string} [model] - Optional model name.
 * @returns {Promise<string>} The generated text.
 * @throws Will throw if the Ollama request fails.
 */
export async function callOllama(
  prompt,
  systemPrompt = null,
  model = OLLAMA_DEFAULT_MODEL
) {
  const result = await handleOllamaRequest({ prompt, systemPrompt, model });

  if (!result.ok) {
    throw new Error(result.error || 'Unknown error from Ollama');
  }

  return result.response;
}

async function getPreferredModel() {
  const preferences = await loadPreferences();
  return preferences.ollamaModel || OLLAMA_DEFAULT_MODEL;
}

/**
 * Extracts a JSON object from a model response.
 *
 * @param {string} responseText - The raw model response.
 * @returns {object} Parsed JSON payload.
 */
function parseJsonResponse(responseText) {
  const trimmedText = responseText.trim();

  try {
    return JSON.parse(trimmedText);
  } catch {
    const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const firstBrace = trimmedText.indexOf('{');
    const lastBrace = trimmedText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmedText.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('The model did not return valid JSON.');
  }
}

function buildDomAdaptationPrompt({ request, pageContext, iteration }) {
  const snapshotText = JSON.stringify(pageContext.snapshot).slice(0, 40000);
  const contextText = JSON.stringify(
    {
      title: pageContext.context.title,
      url: pageContext.context.url,
      language: pageContext.context.language,
      headings: pageContext.context.headings,
      text: pageContext.context.text,
    },
    null,
    2
  );

  return [
    `User request: ${request}`,
    `Iteration: ${iteration}`,
    '',
    'Page context:',
    contextText,
    '',
    'DOM snapshot:',
    snapshotText,
    '',
    'Allowed tool actions:',
    '- read_node',
    '- set_text',
    '- set_style',
    '- set_attribute',
    '- add_class',
    '- remove_class',
    '- hide_node',
    '- show_node',
    '- remove_node',
    '',
    'Return only valid JSON with this shape:',
    '{',
    '  "complete": boolean,',
    '  "summary": string,',
    '  "actions": [',
    '    { "action": string, "nodeId": string, "text"?: string, "style"?: object, "attributes"?: object, "depth"?: number }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Prefer minimal, reversible changes.',
    '- Use node ids that already exist in the snapshot.',
    '- Prefer layout, contrast, typography, visibility, and text changes.',
    '- Do not invent tools or output markdown.',
    '- Do not include code fences or commentary outside JSON.',
  ].join('\n');
}

function normalizeDomActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .filter((action) => action && typeof action === 'object')
    .map((action) => ({
      ...action,
      action: typeof action.action === 'string' ? action.action : '',
      nodeId: typeof action.nodeId === 'string' ? action.nodeId : '',
    }))
    .filter((action) => ALLOWED_DOM_ACTIONS.has(action.action) && action.nodeId);
}

/**
 * Requests a bounded DOM adaptation plan from Ollama.
 *
 * @param {object} payload - The request payload.
 * @param {string} payload.request - The user request.
 * @param {object} payload.pageContext - The page context and snapshot.
 * @param {number} [payload.iteration=1] - The planning iteration.
 * @returns {Promise<object>} The parsed adaptation plan.
 */
export async function handleDomAdaptation({ request, pageContext, iteration = 1 }) {
  const prompt = buildDomAdaptationPrompt({ request, pageContext, iteration });
  const systemPrompt = [
    'You are a DOM adaptation planner for a browser extension.',
    'You must reason from the provided page context and snapshot.',
    'Return only JSON that matches the requested shape.',
    'Keep changes safe, incremental, and focused on accessibility or readability.',
    'Prefer high contrast, reduced clutter, clearer hierarchy, larger text, and stronger affordances when appropriate.',
    'Use the existing node ids from the snapshot only.',
  ].join(' ');

  try {
    const responseText = await callOllama(prompt, systemPrompt, await getPreferredModel());
    const plan = parseJsonResponse(responseText);

    return {
      ok: true,
      complete: Boolean(plan.complete),
      summary: typeof plan.summary === 'string' ? plan.summary : '',
      actions: normalizeDomActions(plan.actions),
    };
  } catch (error) {
    throw new Error(t('error.dom_adaptation_generic', { message: error.message }));
  }
}

// =============================================================================
// AI Helpers (Summarize & Chat)
// =============================================================================

/**
 * Handles a summarize request by calling Ollama.
 *
 * @param {object} payload - The summarize payload.
 * @param {string} payload.text - The page text content.
 * @param {string} payload.title - The page title.
 * @returns {Promise<object>} Response containing the summary.
 * @throws Will throw if Ollama fails or returns an error.
 */
export async function handleSummarize({ text, title }) {
  const prompt = `Summarize the following content clearly and concisely, highlighting the main points. If it is an article, extract the key ideas. The title is: "${title}".\n\n${text.slice(0, 15000)}`;
  const systemPrompt =
    'You are a helpful assistant that summarizes web content clearly and concisely.';

  try {
    const summary = await callOllama(prompt, systemPrompt, await getPreferredModel());
    return { ok: true, summary };
  } catch (error) {
    throw new Error(t('error.ollama_generic', { message: error.message }));
  }
}

/**
 * Handles a chat question by calling Ollama with context.
 *
 * @param {object} payload - The chat payload.
 * @param {string} payload.question - The user's question.
 * @param {string} payload.context - The page content context.
 * @returns {Promise<object>} Response containing the answer.
 * @throws Will throw if Ollama fails or returns an error.
 */
export async function handleChatQuestion({ question, context }) {
  const prompt = `Based on the following content, answer the user's question in a helpful and accurate way. If you cannot find the answer, say so clearly.\n\nContent:\n${context.slice(0, 15000)}\n\nQuestion: ${question}`;
  const systemPrompt =
    'You are a helpful assistant that answers questions about webpage content.';

  try {
    const answer = await callOllama(prompt, systemPrompt, await getPreferredModel());
    return { ok: true, answer };
  } catch (error) {
    throw new Error(t('error.chat_generic', { message: error.message }));
  }
}