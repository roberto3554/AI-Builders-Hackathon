/**
 * @fileoverview Handles user requests from popup or context menu.
 * Orchestrates tab retrieval, injection, and delegation to content script.
 * Dependencies: injection.js, shared/constants.js, shared/locale.js,
 *               simplify.js, ollama.js.
 * Used by: message-handler.js, context-menu.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { t } from '../shared/locale.js';
import {
  isSupportedUrl,
  ensureContentScriptInjected,
  sendToContentScript,
} from './injection.js';
import {
  handleDomAdaptation,
  MAX_DOM_ADAPTATION_STEPS,
  handleSummarize,
} from './ollama.js';
import { performSimplify } from './simplify.js';

const STORAGE_KEY = 'pageAdapter:lastRequest';
const DEBUG = true;
const MAX_ACTIONS_PER_ITERATION = 20;
const MAX_TOTAL_ACTIONS = 1000;
const MAX_FAILING_NODES_PER_ITERATION = 5;

// =============================================================================
// Request cancellation registry
// =============================================================================

/**
 * Tracks in-flight user requests by their client-provided identifier. Each
 * token carries an AbortController so the in-flight fetch to Ollama can be
 * aborted when the user cancels from the UI.
 *
 * @type {Map<string, { cancelled: boolean, controller: AbortController }>}
 */
const activeRequestTokens = new Map();

/**
 * Registers a cancellation token for an in-flight user request.
 *
 * @param {string|null} requestId - The client-provided request identifier.
 * @returns {{ cancelled: boolean, controller: AbortController } | null}
 */
function registerRequestToken(requestId) {
  if (!requestId) {
    return null;
  }
  const controller = new AbortController();
  const token = { cancelled: false, controller };
  activeRequestTokens.set(requestId, token);
  return token;
}

/**
 * Releases the cancellation token for a finished user request.
 *
 * @param {string|null} requestId - The client-provided request identifier.
 * @returns {void}
 */
function releaseRequestToken(requestId) {
  if (requestId) {
    activeRequestTokens.delete(requestId);
  }
}

/**
 * Marks an in-flight user request as cancelled and aborts any active network
 * operation associated with it. The original request promise still resolves
 * normally so the caller can clean up its UI.
 *
 * @param {string} requestId - The client-provided request identifier.
 * @returns {boolean} True when a matching in-flight request was found.
 */
export function cancelActiveRequest(requestId) {
  if (!requestId) {
    return false;
  }
  const token = activeRequestTokens.get(requestId);
  if (!token) {
    return false;
  }
  token.cancelled = true;
  try {
    token.controller.abort();
  } catch {
    // AbortController.abort() does not normally throw; ignore just in case.
  }
  return true;
}

/**
 * Returns whether the given token has been cancelled.
 *
 * @param {{ cancelled: boolean } | null} token - The cancellation token.
 * @returns {boolean} True when the token exists and has been cancelled.
 */
function isCancelled(token) {
  return Boolean(token && token.cancelled);
}

// =============================================================================
// Helper: generate a summary of applied actions
// =============================================================================

/**
 * Generates a human-readable summary of the actions applied so far.
 *
 * @param {Array} actions - List of applied actions.
 * @returns {string} Summary string.
 */
function generateActionsSummary(actions) {
  if (!actions || actions.length === 0) {
    return 'No changes have been applied yet.';
  }
  const summary = actions
    .map((action, index) => {
      const actionDesc = action.action;
      const nodeId = action.nodeId || 'unknown node';
      let details = '';
      if (action.style) {
        const styleEntries = Object.entries(action.style)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        details = `style { ${styleEntries} }`;
      } else if (action.text) {
        details = `text: "${action.text}"`;
      } else if (action.attributes) {
        const attrEntries = Object.entries(action.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(', ');
        details = `attributes { ${attrEntries} }`;
      }
      return `${index + 1}. ${actionDesc} on node ${nodeId}${details ? ` (${details})` : ''}`;
    })
    .join('\n');
  return `Applied changes:\n${summary}`;
}

// =============================================================================
// Helper: collect failing node IDs from a snapshot
// =============================================================================

/**
 * Recursively collects node IDs with accessibility classification 'FAIL'.
 *
 * @param {object} node - The serialized node.
 * @param {Array<string>} acc - Accumulator.
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

// =============================================================================
// Helper: apply fallback high-contrast adaptation
// =============================================================================

/**
 * Applies a robust fallback high-contrast adaptation by forcing styles on all
 * visible elements that contain text.
 *
 * @param {number} tabId - The target tab ID.
 * @returns {Promise<void>}
 */
async function applyFallbackHighContrast(tabId) {
  console.warn('[user-request] Applying robust high-contrast fallback.');
  await sendToContentScript(tabId, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: 'high_contrast',
      request: 'Apply high contrast to all elements',
    },
  }).catch(() => {});
  await sendToContentScript(tabId, {
    type: MESSAGE_TYPES.APPLY_DOM_TOOL,
    payload: {
      action: 'set_style',
      nodeId: 'page-adapter-node-body',
      style: { backgroundColor: '#000000', color: '#ffffff' },
    },
  }).catch(() => {});
}

// =============================================================================
// Main adaptation loop
// =============================================================================

/**
 * Executes the DOM adaptation loop using Ollama, iterating until no failing
 * nodes remain. The loop polls the cancellation token between iterations and
 * between actions, and propagates the associated AbortSignal into every LLM
 * request so the in-flight fetch is cancelled immediately.
 *
 * @param {number} tabId - The target tab ID.
 * @param {string} requestText - The user request text.
 * @param {object} pageContextResult - Result from GET_PAGE_CONTEXT.
 * @param {string|null} presetId - Preset identifier (if any).
 * @param {{ cancelled: boolean, controller: AbortController } | null} token - Cancellation token.
 * @returns {Promise<object>} Adaptation result summary.
 */
async function performDomAdaptation(
  tabId,
  requestText,
  pageContextResult,
  presetId = null,
  token = null
) {
  let appliedActions = [];
  let hasPreviousActions = false;
  let previousActionsSummary = '';
  let totalIterations = 0;
  const modifiedNodeIds = new Set();
  let lastSummary = '';

  const isHighContrast = presetId === 'high_contrast';
  const signal = token?.controller?.signal ?? null;

  for (let iteration = 1; iteration <= MAX_DOM_ADAPTATION_STEPS; iteration++) {
    if (isCancelled(token)) {
      if (DEBUG) {
        console.log('[user-request] Cancellation observed before iteration', iteration);
      }
      break;
    }

    totalIterations = iteration;
    if (DEBUG) {
      console.log(`[user-request] === Iteration ${iteration} of ${MAX_DOM_ADAPTATION_STEPS} ===`);
      console.log(`[user-request] Request: ${requestText}, Preset: ${presetId || 'none'}`);
      console.log(`[user-request] Applied actions so far: ${appliedActions.length}`);
    }

    // Refresh snapshot
    const freshContext = await sendToContentScript(tabId, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    if (freshContext?.ok) {
      pageContextResult = freshContext;
    } else {
      console.warn('[user-request] Could not refresh page snapshot; using previous.');
    }

    if (isCancelled(token)) {
      break;
    }

    // Get all failing nodes
    let allFailingNodeIds = [];
    if (isHighContrast) {
      collectFailingNodeIds(pageContextResult.snapshot.root, allFailingNodeIds);
      const failingSubset = allFailingNodeIds.slice(0, MAX_FAILING_NODES_PER_ITERATION);
      if (DEBUG) {
        console.log(`[user-request] Total failing nodes found: ${allFailingNodeIds.length}`);
        console.log(
          `[user-request] Passing ${failingSubset.length} failing nodes to LLM (out of ${allFailingNodeIds.length})`
        );
      }
      if (allFailingNodeIds.length === 0) {
        if (DEBUG) {
          console.log('[user-request] No failing nodes remain. Adaptation complete.');
        }
        break;
      }
    } else {
      // For other presets, only one iteration.
      if (iteration > 1) break;
    }

    hasPreviousActions = appliedActions.length > 0;
    previousActionsSummary = hasPreviousActions
      ? generateActionsSummary(appliedActions)
      : '';

    let adaptationPlan = null;
    try {
      adaptationPlan = await handleDomAdaptation({
        request: requestText,
        pageContext: {
          context: pageContextResult.context,
          snapshot: pageContextResult.snapshot,
        },
        iteration,
        presetId,
        hasPreviousActions,
        previousActionsSummary,
        failingNodeIds: isHighContrast
          ? allFailingNodeIds.slice(0, MAX_FAILING_NODES_PER_ITERATION)
          : [],
        signal,
      });
    } catch (error) {
      // Aborted requests stop immediately without falling back.
      if (error.name === 'AbortError' || isCancelled(token)) {
        if (DEBUG) {
          console.log('[user-request] Adaptation aborted.');
        }
        break;
      }
      console.error('[user-request] LLM adaptation failed:', error);
      if (isHighContrast) {
        console.warn('[user-request] Falling back to built-in high-contrast adaptation.');
        await applyFallbackHighContrast(tabId);
        return {
          summary: 'Applied high-contrast fallback (all text and interactive elements).',
          iterations: iteration,
          totalActions: appliedActions.length,
          uniqueNodesModified: modifiedNodeIds.size,
          complete: true,
          cancelled: false,
        };
      }
      throw error;
    }

    if (isCancelled(token)) {
      break;
    }

    if (DEBUG) {
      console.log(
        `[user-request] Plan complete: ${adaptationPlan.complete}, actions: ${adaptationPlan.actions.length}`
      );
      if (adaptationPlan.actions.length === 0) {
        console.warn('[user-request] LLM generated zero actions. Falling back to fallback?');
        if (isHighContrast) {
          console.warn('[user-request] Forcing fallback high-contrast due to empty plan.');
          await applyFallbackHighContrast(tabId);
          return {
            summary: 'Applied high-contrast fallback (all text and interactive elements).',
            iterations: iteration,
            totalActions: appliedActions.length,
            uniqueNodesModified: modifiedNodeIds.size,
            complete: true,
            cancelled: false,
          };
        }
      }
      if (adaptationPlan.actions.length > 0) {
        console.log(
          '[user-request] Actions:',
          JSON.stringify(adaptationPlan.actions, null, 2)
        );
      }
    }

    if (adaptationPlan.summary) {
      lastSummary = adaptationPlan.summary;
    }

    let actions = adaptationPlan.actions;
    if (actions.length > MAX_ACTIONS_PER_ITERATION) {
      console.warn(
        `Truncating actions from ${actions.length} to ${MAX_ACTIONS_PER_ITERATION}`
      );
      actions = actions.slice(0, MAX_ACTIONS_PER_ITERATION);
    }

    for (const action of actions) {
      if (isCancelled(token)) {
        if (DEBUG) {
          console.log('[user-request] Cancellation observed while applying actions.');
        }
        break;
      }
      if (DEBUG) {
        console.log(`[user-request] Executing action: ${action.action} on node ${action.nodeId}`);
      }
      const toolResult = await sendToContentScript(tabId, {
        type: MESSAGE_TYPES.APPLY_DOM_TOOL,
        payload: action,
      });
      if (!toolResult?.ok) {
        console.error('[user-request] Tool execution failed:', toolResult?.error);
        throw new Error(toolResult?.error || t('error.send_to_tab'));
      }
      if (action.nodeId) {
        modifiedNodeIds.add(action.nodeId);
      }
    }

    appliedActions = appliedActions.concat(actions);

    if (appliedActions.length > MAX_TOTAL_ACTIONS) {
      throw new Error(
        `Circuit breaker: applied ${appliedActions.length} actions, exceeding limit.`
      );
    }

    if (isCancelled(token)) {
      break;
    }

    if (actions.length === 0) {
      if (DEBUG) console.log('[user-request] No new actions, breaking loop.');
      break;
    }

    if (!isHighContrast) break;
  }

  if (DEBUG) {
    console.log(
      `[user-request] Total iterations: ${totalIterations}, total actions: ${appliedActions.length}`
    );
    console.log(`[user-request] Unique nodes modified: ${modifiedNodeIds.size}`);
  }

  const cancelled = isCancelled(token);

  if (!lastSummary) {
    if (cancelled) {
      lastSummary = 'Request cancelled by user.';
    } else if (appliedActions.length > 0) {
      lastSummary = `Applied ${appliedActions.length} DOM changes to adapt the page.`;
    } else {
      lastSummary = 'No changes were needed.';
    }
  }

  return {
    summary: lastSummary,
    iterations: totalIterations,
    totalActions: appliedActions.length,
    uniqueNodesModified: modifiedNodeIds.size,
    complete: !cancelled,
    cancelled,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Handles a user request by routing it to the appropriate action.
 *
 * @param {object} message - The user request message.
 * @param {chrome.tabs.Tab} [providedTab] - Optional tab object.
 * @returns {Promise<object>} Response containing ok, request, and responseText.
 */
export async function handleUserRequest(message, providedTab = null) {
  const requestId = message?.payload?.requestId || null;
  const token = registerRequestToken(requestId);

  try {
    return await executeUserRequest(message, providedTab, token);
  } finally {
    releaseRequestToken(requestId);
  }
}

/**
 * Executes a user request. Extracted from the public entry point so the
 * request token can be released in a single place regardless of how the
 * request settles.
 *
 * @param {object} message - The user request message.
 * @param {chrome.tabs.Tab | null} providedTab - Optional tab object.
 * @param {{ cancelled: boolean, controller: AbortController } | null} token
 * @returns {Promise<object>} Response containing ok, request, and responseText.
 */
async function executeUserRequest(message, providedTab, token) {
  if (DEBUG) {
    console.log('[user-request] handleUserRequest called with message:', message);
  }

  let tab;
  if (providedTab) {
    tab = providedTab;
  } else {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    tab = tabs[0];
  }

  if (!tab?.id) {
    throw new Error(t('error.no_active_tab'));
  }

  const url = tab.url || '';
  if (!isSupportedUrl(url)) {
    throw new Error(t('error.unsupported_page'));
  }

  await ensureContentScriptInjected(tab.id);

  const request = {
    ...message.payload,
    page: {
      tabId: tab.id,
      title: tab.title || '',
      url: tab.url || '',
    },
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: request });

  // --- Natural language or high-contrast preset -> DOM adaptation via LLM ---
  if (
    message.payload.mode === 'natural_language' ||
    (message.payload.mode === 'preset' && message.payload.presetId === 'high_contrast')
  ) {
    const pageContextResult = await sendToContentScript(tab.id, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    if (!pageContextResult?.ok) {
      throw new Error(pageContextResult?.error || t('error.send_to_tab'));
    }

    const requestText = message.payload.request;
    const presetId = message.payload.presetId || null;
    const result = await performDomAdaptation(
      tab.id,
      requestText,
      pageContextResult,
      presetId,
      token
    );

    return {
      ok: true,
      request,
      responseText: result.summary,
    };
  }

  // --- Preset: simplify -> LLM-driven node classification ---
  if (message.payload.mode === 'preset' && message.payload.presetId === 'simplify') {
    const pageContextResult = await sendToContentScript(tab.id, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    if (!pageContextResult?.ok) {
      throw new Error(pageContextResult?.error || t('error.send_to_tab'));
    }

    const result = await performSimplify(tab.id, pageContextResult, token);
    return {
      ok: true,
      request,
      responseText: result.summary,
    };
  }

  // --- Preset: summarize ---
  if (message.payload.presetId === 'summarize') {
    const pageContextResult = await sendToContentScript(tab.id, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    if (!pageContextResult?.ok) {
      throw new Error(pageContextResult?.error || t('error.send_to_tab'));
    }
    const { text, title } = pageContextResult.context;
    const summaryResult = await handleSummarize(
      { text, title },
      token?.controller?.signal ?? null
    );
    if (!summaryResult.ok) {
      throw new Error(summaryResult.error || 'Failed to summarize.');
    }
    return {
      ok: true,
      request,
      responseText: summaryResult.summary,
    };
  }

  // --- Other presets (translate) -> simple transformations ---
  await sendToContentScript(tab.id, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: message.payload.presetId,
      request: message.payload.request,
    },
  });

  let responseText = '';
  switch (message.payload.presetId) {
    case 'translate':
      responseText =
        t('notification.translated') || 'I have translated the page to Spanish.';
      break;
    default:
      responseText = t('popup.status.success') || 'Request applied.';
  }

  return { ok: true, request, responseText };
}