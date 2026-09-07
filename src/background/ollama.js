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
const OLLAMA_TEMPERATURE = 0.3;
const OLLAMA_TOP_P = 0.9;
export const MAX_DOM_ADAPTATION_STEPS = 20;
export const MIN_HIGH_CONTRAST_ACTIONS = 2;

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

const ALLOWED_DOM_ACTIONS_HIGH_CONTRAST = new Set([
  'set_style',
  'set_attribute',
  'add_class',
  'remove_class',
  'set_text',
]);

const DEBUG = true;
const MAX_LLM_RESPONSE_RETRIES = 4;

// =============================================================================
// Response Validation Constants
// =============================================================================

const ACTION_SCHEMA = {
  action: { type: 'string', required: true, allowed: ALLOWED_DOM_ACTIONS },
  nodeId: { type: 'string', required: true, pattern: /^page-adapter-node-\d+$/ },
  text: { type: 'string', required: false },
  style: { type: 'object', required: false, allowedKeys: ['backgroundColor', 'color', 'borderColor', 'borderWidth', 'borderStyle', 'boxShadow', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'margin', 'display', 'visibility'] },
  attributes: { type: 'object', required: false },
  depth: { type: 'number', required: false, min: 1, max: 5 },
};

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
    console.log('[ollama] Prompt length:', prompt.length, 'characters');
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

  let response;
  try {
    response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    console.error('[ollama] Network error connecting to Ollama:', fetchError);
    throw new Error(`Could not connect to Ollama at ${OLLAMA_API_URL}. Please ensure it is running.`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ollama] HTTP error:', response.status, errorText);
    throw new Error(`Ollama error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (DEBUG) {
    console.log('[ollama] Full response data:', JSON.stringify(data, null, 2));
    console.log('[ollama] Response field "response":', data.response);
    console.log('[ollama] Response field "done":', data.done);
  }
  if (!data.response || data.response.trim() === '') {
    throw new Error('Empty response from Ollama (no "response" field or empty)');
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
  // Direct parse
  try {
    return JSON.parse(trimmedText);
  } catch {
    // Not valid JSON yet.
  }
  // Try to extract from a code fence
  const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // Continue.
    }
  }
  // Look for the first and last curly brace
  const firstBrace = trimmedText.indexOf('{');
  const lastBrace = trimmedText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmedText.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue.
    }
  }
  // Try to parse as an array
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
  // Scan for balanced braces
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

// =============================================================================
// Response Validation Helpers
// =============================================================================

/**
 * Validates that a single action conforms to the schema.
 *
 * @param {object} action - The action to validate.
 * @param {number} index - Index in the actions array (for error messages).
 * @returns {object} Normalized action.
 * @throws Will throw if validation fails.
 */
function validateActionSchema(action, index) {
  if (!action || typeof action !== 'object') {
    throw new Error(`Action at index ${index} is not an object.`);
  }
  for (const [field, spec] of Object.entries(ACTION_SCHEMA)) {
    if (spec.required && !(field in action)) {
      throw new Error(`Action at index ${index} missing required field: ${field}`);
    }
  }
  for (const [field, value] of Object.entries(action)) {
    const spec = ACTION_SCHEMA[field];
    if (!spec) {
      throw new Error(`Action at index ${index} has unexpected field: ${field}`);
    }
    const expectedType = spec.type;
    const actualType = typeof value;
    if (actualType !== expectedType) {
      throw new Error(`Action at index ${index} field "${field}" expected type ${expectedType}, got ${actualType}`);
    }
    if (spec.allowed && spec.allowed instanceof Set) {
      if (!spec.allowed.has(value)) {
        throw new Error(`Action at index ${index} field "${field}" value "${value}" not allowed. Allowed: ${[...spec.allowed].join(', ')}`);
      }
    }
    if (spec.pattern && !spec.pattern.test(value)) {
      throw new Error(`Action at index ${index} field "${field}" value "${value}" does not match pattern ${spec.pattern}`);
    }
    if (spec.min !== undefined && value < spec.min) {
      throw new Error(`Action at index ${index} field "${field}" value ${value} below minimum ${spec.min}`);
    }
    if (spec.max !== undefined && value > spec.max) {
      throw new Error(`Action at index ${index} field "${field}" value ${value} above maximum ${spec.max}`);
    }
    if (field === 'style') {
      const invalidKeys = Object.keys(value).filter(key => !spec.allowedKeys.includes(key));
      if (invalidKeys.length > 0) {
        throw new Error(`Action at index ${index} style contains disallowed keys: ${invalidKeys.join(', ')}`);
      }
    }
  }
  const normalized = { action: action.action, nodeId: action.nodeId };
  if (action.text !== undefined) normalized.text = action.text;
  if (action.style !== undefined) normalized.style = action.style;
  if (action.attributes !== undefined) normalized.attributes = action.attributes;
  if (action.depth !== undefined) normalized.depth = action.depth;
  return normalized;
}

/**
 * Checks that the nodeId exists in the snapshot.
 *
 * @param {string} nodeId - The node ID to check.
 * @param {object} snapshot - The DOM snapshot (with root).
 * @returns {boolean} True if the node exists.
 */
function nodeExistsInSnapshot(nodeId, snapshot) {
  if (!snapshot || !snapshot.root) return false;
  let found = false;
  function traverse(node) {
    if (found) return;
    if (node.id === nodeId) {
      found = true;
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
        if (found) break;
      }
    }
  }
  traverse(snapshot.root);
  return found;
}

/**
 * Detects conflicting actions within the same plan.
 *
 * @param {Array<object>} actions - List of normalized actions.
 * @returns {Array<string>} Array of conflict descriptions.
 */
function detectConflicts(actions) {
  const conflicts = [];
  const nodeChanges = new Map();
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const nodeId = action.nodeId;
    if (!nodeChanges.has(nodeId)) {
      nodeChanges.set(nodeId, { style: {}, class: {}, attribute: {} });
    }
    const record = nodeChanges.get(nodeId);
    if (action.action === 'set_style') {
      for (const [prop, value] of Object.entries(action.style || {})) {
        if (record.style[prop] !== undefined && record.style[prop] !== value) {
          conflicts.push(`Node ${nodeId}: conflicting style property "${prop}" (${record.style[prop]} vs ${value})`);
        }
        record.style[prop] = value;
      }
    } else if (action.action === 'add_class') {
      const cls = action.text?.trim();
      if (cls && record.class[cls] === 'remove') {
        conflicts.push(`Node ${nodeId}: adding class "${cls}" after removal`);
      }
      record.class[cls] = 'add';
    } else if (action.action === 'remove_class') {
      const cls = action.text?.trim();
      if (cls && record.class[cls] === 'add') {
        conflicts.push(`Node ${nodeId}: removing class "${cls}" after addition`);
      }
      record.class[cls] = 'remove';
    } else if (action.action === 'set_attribute') {
      for (const [attr, value] of Object.entries(action.attributes || {})) {
        if (record.attribute[attr] !== undefined && record.attribute[attr] !== value) {
          conflicts.push(`Node ${nodeId}: conflicting attribute "${attr}" (${record.attribute[attr]} vs ${value})`);
        }
        record.attribute[attr] = value;
      }
    }
  }
  return conflicts;
}

/**
 * Builds a list of available node IDs with their tag and text for the prompt.
 *
 * @param {object} node - The serialized node.
 * @param {Array} acc - Accumulator array.
 */
function collectNodeInfo(node, acc) {
  if (!node) return;
  const text = node.text || '';
  acc.push(`- ${node.id} (${node.tagName}): "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
  if (node.children) {
    for (const child of node.children) {
      collectNodeInfo(child, acc);
    }
  }
}

/**
 * Collects node IDs that have accessibility classification 'FAIL'.
 *
 * @param {object} node - The serialized node.
 * @param {Array<string>} acc - Accumulator array.
 */
function collectFailingNodeIds(node, acc) {
  if (!node) return;
  if (node.accessibility && node.accessibility.classification === 'FAIL') {
    acc.push(node.id);
  }
  if (node.children) {
    for (const child of node.children) {
      collectFailingNodeIds(child, acc);
    }
  }
}

/**
 * Extracts detailed information for a list of failing nodes.
 *
 * @param {Array<string>} nodeIds - List of node IDs.
 * @param {object} snapshot - The DOM snapshot.
 * @returns {string} A formatted string describing each failing node.
 */
function getFailingNodesDescription(nodeIds, snapshot) {
  if (!nodeIds || nodeIds.length === 0) {
    return 'None';
  }
  const descriptions = [];
  function findNodeById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }
  for (const id of nodeIds) {
    const node = findNodeById(snapshot.root, id);
    if (node) {
      const text = node.text || '';
      const ratio = node.accessibility?.contrastRatio !== null ? node.accessibility.contrastRatio.toFixed(2) : 'unknown';
      const bg = node.accessibility?.effectiveBackground || 'unknown';
      const fg = node.style?.color || 'unknown';
      const tag = node.tagName || 'element';
      descriptions.push(`- ${id} (${tag}): text="${text.slice(0, 30)}${text.length > 30 ? '...' : ''}", ratio=${ratio}, bg=${bg}, fg=${fg}`);
    } else {
      descriptions.push(`- ${id}: (not found in snapshot)`);
    }
  }
  return descriptions.join('\n');
}

/**
 * Validates and normalizes an entire plan.
 *
 * @param {object} plan - Parsed plan from model.
 * @param {object} snapshot - The DOM snapshot.
 * @returns {object} Normalized plan with validated actions.
 * @throws Will throw with a detailed error if validation fails for structural reasons.
 */
function validateAndNormalizePlan(plan, snapshot) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Plan is not an object.');
  }
  if (!Array.isArray(plan.actions)) {
    throw new Error('Plan.actions must be an array.');
  }

  const normalizedActions = [];
  let skippedCount = 0;
  for (let i = 0; i < plan.actions.length; i++) {
    const raw = plan.actions[i];
    let action;
    try {
      action = validateActionSchema(raw, i);
    } catch (error) {
      console.warn(`[ollama] Skipping action at index ${i} due to schema error: ${error.message}`);
      skippedCount++;
      continue;
    }
    if (!nodeExistsInSnapshot(action.nodeId, snapshot)) {
      console.warn(`[ollama] Skipping action at index ${i} because nodeId "${action.nodeId}" does not exist in snapshot.`);
      skippedCount++;
      continue;
    }
    normalizedActions.push(action);
  }

  if (normalizedActions.length === 0 && plan.actions.length > 0) {
    console.warn('[ollama] All actions were skipped because of missing nodeIds.');
    return {
      complete: false,
      summary: '',
      actions: [],
    };
  }

  const conflicts = detectConflicts(normalizedActions);
  if (conflicts.length > 0) {
    console.warn('[ollama] Conflicts detected:', conflicts);
  }

  return {
    complete: Boolean(plan.complete),
    summary: typeof plan.summary === 'string' ? plan.summary : '',
    actions: normalizedActions,
  };
}

// =============================================================================
// Build DOM adaptation prompt (lightweight for high-contrast)
// =============================================================================

/**
 * Builds the DOM adaptation prompt.
 * For high-contrast, it uses a lightweight prompt with only the failing nodes.
 *
 * @param {object} params - Prompt parameters.
 * @param {string} params.request - The user request.
 * @param {object} params.pageContext - Page context and snapshot.
 * @param {number} params.iteration - Current iteration number.
 * @param {string|null} params.presetId - Preset identifier (if any).
 * @param {boolean} params.hasPreviousActions - Whether previous actions exist.
 * @param {string} params.previousActionsSummary - Summary of previous actions.
 * @param {Array<string>} params.failingNodeIds - List of node IDs with contrast issues.
 * @returns {string} The formatted prompt.
 */
function buildDomAdaptationPrompt({
  request,
  pageContext,
  iteration,
  presetId,
  hasPreviousActions,
  previousActionsSummary,
  failingNodeIds = [],
}) {
  // For high-contrast, use a lightweight prompt.
  if (presetId === 'high_contrast') {
    const failingDetails = failingNodeIds.length > 0
      ? getFailingNodesDescription(failingNodeIds, pageContext.snapshot)
      : 'None (all nodes have good contrast)';

    const promptLines = [
      `User request: ${request}`,
      `Iteration: ${iteration}`,
      '',
      'You are given a list of DOM nodes that have low contrast (FAIL).',
      'For each node, suggest style changes to fix contrast issues.',
      'Use only the node IDs provided.',
      'Return a JSON object with "actions" array. Each action should have:',
      '  - action: "set_style"',
      '  - nodeId: the exact node ID from the list',
      '  - style: object with CSS properties (e.g., backgroundColor, color, fontWeight)',
      '',
      'Failing nodes:',
      failingDetails,
      '',
      'If you fix all failing nodes, set "complete": true. Otherwise, set "complete": false.',
      'Do not include markdown or extra text outside JSON.',
      '',
      'Example:',
      JSON.stringify({
        complete: false,
        summary: 'Fix contrast on two nodes.',
        actions: [
          { action: 'set_style', nodeId: 'page-adapter-node-1', style: { backgroundColor: '#000000', color: '#ffffff' } },
          { action: 'set_style', nodeId: 'page-adapter-node-2', style: { color: '#ffff00', fontWeight: 'bold' } },
        ],
      }, null, 2),
    ];

    if (hasPreviousActions && previousActionsSummary) {
      promptLines.push('Previous changes:', previousActionsSummary);
    }

    return promptLines.join('\n');
  }

  // For other presets, use a more detailed prompt (fallback)
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

  let allowedActions = Array.from(ALLOWED_DOM_ACTIONS);
  if (presetId === 'high_contrast') {
    allowedActions = Array.from(ALLOWED_DOM_ACTIONS_HIGH_CONTRAST);
  }
  const actionsList = allowedActions.map((a) => `- ${a}`).join('\n');

  const nodeInfo = [];
  collectNodeInfo(pageContext.snapshot.root, nodeInfo);
  const nodeListText = nodeInfo.length > 0 ? nodeInfo.join('\n') : '(No nodes available in snapshot)';

  return [
    `User request: ${request}`,
    `Iteration: ${iteration}`,
    '',
    'Page context:',
    contextText,
    '',
    'DOM snapshot (truncated):',
    snapshotText,
    '',
    'Available node IDs (with tag and text):',
    nodeListText,
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
  ].join('\n');
}

// =============================================================================
// Main adaptation function with retry logic
// =============================================================================

/**
 * Requests a bounded DOM adaptation plan from Ollama,
 * with validation and retry logic.
 *
 * @param {object} payload - The request payload.
 * @param {string} payload.request - The user request.
 * @param {object} payload.pageContext - The page context and snapshot.
 * @param {number} [payload.iteration=1] - The planning iteration.
 * @param {string|null} [payload.presetId=null] - Preset identifier.
 * @param {boolean} [payload.hasPreviousActions=false] - Whether previous actions exist.
 * @param {string} [payload.previousActionsSummary=''] - Summary of previous actions.
 * @param {Array<string>} [payload.failingNodeIds=[]] - List of node IDs with contrast issues.
 * @returns {Promise<object>} The validated adaptation plan.
 */
export async function handleDomAdaptation({
  request,
  pageContext,
  iteration = 1,
  presetId = null,
  hasPreviousActions = false,
  previousActionsSummary = '',
  failingNodeIds = [],
}) {
  const basePrompt = buildDomAdaptationPrompt({
    request,
    pageContext,
    iteration,
    presetId,
    hasPreviousActions,
    previousActionsSummary,
    failingNodeIds,
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
    'If you are given a list of failing nodes, focus your actions on those nodes.',
  ].join(' ');

  let lastError = null;
  let retries = 0;
  let plan = null;

  while (retries <= MAX_LLM_RESPONSE_RETRIES) {
    try {
      let prompt = basePrompt;
      if (retries > 0 && lastError) {
        prompt += `\n\nYour previous response was invalid: ${lastError}\nPlease correct the response and return only valid JSON.`;
        if (DEBUG) {
          console.log('[ollama] Retry prompt with error:', lastError);
        }
      }

      const responseText = await callOllama(prompt, systemPrompt, await getPreferredModel());
      if (DEBUG) {
        console.log('[ollama] Raw response from LLM:', responseText);
      }

      if (!responseText || responseText.trim() === '') {
        throw new Error('Empty response from Ollama');
      }

      plan = parseJsonResponse(responseText);
      const validatedPlan = validateAndNormalizePlan(plan, pageContext.snapshot);

      if (DEBUG) {
        console.log('[ollama] Validated plan:', JSON.stringify(validatedPlan, null, 2));
        console.log(`[ollama] Plan actions count: ${validatedPlan.actions.length}`);
        console.log(`[ollama] Plan complete: ${validatedPlan.complete}`);
      }

      return {
        ok: true,
        complete: validatedPlan.complete,
        summary: validatedPlan.summary,
        actions: validatedPlan.actions,
      };
    } catch (error) {
      lastError = error.message;
      console.warn(`[ollama] Validation attempt ${retries + 1} failed:`, lastError);
      if (DEBUG && plan !== null) {
        console.warn('[ollama] Plan that caused error:', JSON.stringify(plan, null, 2));
      } else if (DEBUG) {
        console.warn('[ollama] No plan was parsed (likely empty response or parse error).');
      }
      retries++;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.error('[ollama] All retries exhausted. Last error:', lastError);
  throw new Error(`Failed to get valid adaptation plan after ${MAX_LLM_RESPONSE_RETRIES + 1} attempts. Last error: ${lastError}`);
}

// =============================================================================
// AI Helpers (Summarize & Chat) – unchanged
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
  const systemPrompt = 'You are a helpful assistant that summarizes web content clearly and concisely.';
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
  const systemPrompt = 'You are a helpful assistant that answers questions about webpage content.';
  try {
    const answer = await callOllama(prompt, systemPrompt, await getPreferredModel());
    return { ok: true, answer };
  } catch (error) {
    throw new Error(t('error.chat_generic', { message: error.message }));
  }
}