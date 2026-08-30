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
// Reduced temperature for more deterministic and predictable output.
const OLLAMA_TEMPERATURE = 0.3;
const OLLAMA_TOP_P = 0.9;
// Maximum number of iterations for DOM adaptation.
export const MAX_DOM_ADAPTATION_STEPS = 3;
// Minimum number of actions required for high-contrast mode.
export const MIN_HIGH_CONTRAST_ACTIONS = 2;
// Base set of allowed DOM actions.
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
// Allowed actions for high-contrast mode (no destructive actions).
const ALLOWED_DOM_ACTIONS_HIGH_CONTRAST = new Set([
  'set_style',
  'set_attribute',
  'add_class',
  'remove_class',
  'set_text',
]);

// Enable debug logging
const DEBUG = true;

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
  if (DEBUG) {
    console.log('[ollama] Sending request to Ollama with model:', model);
    console.log('[ollama] System prompt:', systemPrompt);
    console.log('[ollama] Prompt (first 500 chars):', prompt.slice(0, 500) + (prompt.length > 500 ? '...' : ''));
  }

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
    console.error('[ollama] HTTP error:', response.status, errorText);
    throw new Error(`Ollama error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (DEBUG) {
    console.log('[ollama] Raw response:', data.response);
  }
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
 * Uses multiple fallback strategies to handle common formatting issues.
 *
 * @param {string} responseText - The raw model response.
 * @returns {object} Parsed JSON payload.
 * @throws Will throw if no valid JSON can be extracted.
 */
function parseJsonResponse(responseText) {
  const trimmedText = responseText.trim();
  if (DEBUG) {
    console.log('[ollama] Trying to parse JSON from response:', trimmedText.slice(0, 300) + (trimmedText.length > 300 ? '...' : ''));
  }

  // Direct parse.
  try {
    return JSON.parse(trimmedText);
  } catch {
    // Not valid JSON yet.
  }

  // Try to extract from a code fence (```json ... ```).
  const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // Continue.
    }
  }

  // Look for the first and last curly brace.
  const firstBrace = trimmedText.indexOf('{');
  const lastBrace = trimmedText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmedText.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue.
    }
  }

  // As a last resort, try to parse as an array and wrap it into an object.
  const firstBracket = trimmedText.indexOf('[');
  const lastBracket = trimmedText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const arrayCandidate = trimmedText.slice(firstBracket, lastBracket + 1);
    try {
      const actions = JSON.parse(arrayCandidate);
      if (Array.isArray(actions)) {
        return { complete: false, summary: '', actions };
      }
    } catch {
      // Continue.
    }
  }

  // Additional attempt: find any JSON-like object by scanning for balanced braces.
  // This handles cases where the model includes extra text after a valid JSON.
  let braceCount = 0;
  let start = -1;
  for (let i = 0; i < trimmedText.length; i++) {
    if (trimmedText[i] === '{') {
      if (braceCount === 0) start = i;
      braceCount++;
    } else if (trimmedText[i] === '}') {
      braceCount--;
      if (braceCount === 0 && start !== -1) {
        const candidate = trimmedText.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // Continue scanning.
        }
      }
    }
  }

  throw new Error('The model did not return valid JSON.');
}

/**
 * Builds the DOM adaptation prompt.
 *
 * @param {object} params - Prompt parameters.
 * @param {string} params.request - The user request.
 * @param {object} params.pageContext - Page context and snapshot.
 * @param {number} params.iteration - Current iteration number.
 * @param {string|null} params.presetId - Preset identifier (if any).
 * @param {boolean} params.hasPreviousActions - Whether previous actions exist.
 * @param {string} params.previousActionsSummary - Summary of previous actions.
 * @returns {string} The formatted prompt.
 */
function buildDomAdaptationPrompt({
  request,
  pageContext,
  iteration,
  presetId,
  hasPreviousActions,
  previousActionsSummary,
}) {
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

  // Determine allowed actions based on preset.
  let allowedActions = Array.from(ALLOWED_DOM_ACTIONS);
  if (presetId === 'high_contrast') {
    allowedActions = Array.from(ALLOWED_DOM_ACTIONS_HIGH_CONTRAST);
  }
  const actionsList = allowedActions.map((a) => `- ${a}`).join('\n');

  // Base prompt lines.
  const promptLines = [
    `User request: ${request}`,
    `Iteration: ${iteration}`,
    '',
    'Page context:',
    contextText,
    '',
    'DOM snapshot (truncated):',
    snapshotText,
    '',
    'Allowed tool actions:',
    actionsList,
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
    '- Do not invent tools or output markdown.',
    '- Do not include code fences or commentary outside JSON.',
    '- Avoid removing or hiding nodes unless explicitly requested and safe.',
  ];

  // If this is a high-contrast request, add specific instructions.
  if (presetId === 'high_contrast') {
    promptLines.push(
      '',
      'For high-contrast adaptation, you MUST apply at least TWO complementary changes.',
      'Common changes include:',
      '  - Set background color to dark (e.g., #000000) and text color to light (e.g., #ffffff).',
      '  - Change link colors to yellow or bright blue.',
      '  - Increase font size or font weight.',
      '  - Add borders to interactive elements.',
      'Do NOT mark the task as complete until you have applied at least two distinct, complementary changes that significantly improve readability.',
      '',
      'IMPORTANT: You are now viewing the CURRENT state of the page after previous iterations.',
      'If you detect any text that is unreadable (e.g., dark text on dark background, or light text on light background), you MUST generate additional actions to fix those nodes.',
      'Do not assume the task is complete if there are any contrast issues remaining.',
      'Verify that ALL text nodes have sufficient contrast against their background.',
      'Only set "complete": true when you are confident that the entire page is readable under high contrast.'
    );

    // If there are previous actions, include a summary and a reminder.
    if (hasPreviousActions && previousActionsSummary) {
      promptLines.push(
        '',
        'Previous changes applied:',
        previousActionsSummary,
        '',
        'Based on these previous changes, you should now add additional improvements to complete the high-contrast adaptation.',
        'If you only changed the background, now change the text color, link colors, or font size.',
        'Do not repeat the same change on the same node.',
        'Generate at least one new action in this iteration.'
      );
    }

    // Provide an example with multiple actions.
    promptLines.push(
      '',
      'Example of a complete high-contrast adaptation with two actions:',
      JSON.stringify(
        {
          complete: true,
          summary: 'Applied high-contrast colors and improved readability.',
          actions: [
            {
              action: 'set_style',
              nodeId: 'page-adapter-node-1',
              style: { backgroundColor: '#000000', color: '#ffffff' },
            },
            {
              action: 'set_style',
              nodeId: 'page-adapter-node-2',
              style: { color: '#ffff00', fontWeight: 'bold' },
            },
          ],
        },
        null,
        2
      )
    );
  }

  return promptLines.join('\n');
}

/**
 * Normalizes and filters DOM actions.
 *
 * @param {Array} actions - Raw actions from the model.
 * @param {string|null} presetId - Preset identifier (for filtering).
 * @returns {Array} Filtered and normalized actions.
 */
function normalizeDomActions(actions, presetId = null) {
  if (!Array.isArray(actions)) {
    return [];
  }

  // Determine which actions are allowed.
  const allowedSet = presetId === 'high_contrast'
    ? ALLOWED_DOM_ACTIONS_HIGH_CONTRAST
    : ALLOWED_DOM_ACTIONS;

  return actions
    .filter((action) => action && typeof action === 'object')
    .map((action) => ({
      ...action,
      action: typeof action.action === 'string' ? action.action : '',
      nodeId: typeof action.nodeId === 'string' ? action.nodeId : '',
    }))
    .filter((action) => allowedSet.has(action.action) && action.nodeId);
}

/**
 * Requests a bounded DOM adaptation plan from Ollama.
 *
 * @param {object} payload - The request payload.
 * @param {string} payload.request - The user request.
 * @param {object} payload.pageContext - The page context and snapshot.
 * @param {number} [payload.iteration=1] - The planning iteration.
 * @param {string|null} [payload.presetId=null] - Preset identifier.
 * @param {boolean} [payload.hasPreviousActions=false] - Whether previous actions exist.
 * @param {string} [payload.previousActionsSummary=''] - Summary of previous actions.
 * @returns {Promise<object>} The parsed adaptation plan.
 */
export async function handleDomAdaptation({
  request,
  pageContext,
  iteration = 1,
  presetId = null,
  hasPreviousActions = false,
  previousActionsSummary = '',
}) {
  const prompt = buildDomAdaptationPrompt({
    request,
    pageContext,
    iteration,
    presetId,
    hasPreviousActions,
    previousActionsSummary,
  });
  const systemPrompt = [
    'You are a DOM adaptation planner for a browser extension.',
    'You must reason from the provided page context and snapshot.',
    'Return only JSON that matches the requested shape.',
    'Keep changes safe, incremental, and focused on accessibility or readability.',
    'Prefer high contrast, reduced clutter, clearer hierarchy, larger text, and stronger affordances when appropriate.',
    'Use the existing node ids from the snapshot only.',
    'For high-contrast requests, ensure you change both background and text colors, and do not consider the task complete until you have made at least two complementary changes.',
    'Critically evaluate the current snapshot: if any text is unreadable due to poor contrast, generate more actions to fix it.',
  ].join(' ');

  try {
    const responseText = await callOllama(prompt, systemPrompt, await getPreferredModel());
    const plan = parseJsonResponse(responseText);

    if (DEBUG) {
      console.log('[ollama] Parsed plan:', JSON.stringify(plan, null, 2));
    }

    return {
      ok: true,
      complete: Boolean(plan.complete),
      summary: typeof plan.summary === 'string' ? plan.summary : '',
      actions: normalizeDomActions(plan.actions, presetId),
    };
  } catch (error) {
    console.error('[ollama] Error in handleDomAdaptation:', error);
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