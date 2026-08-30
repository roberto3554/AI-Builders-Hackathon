/**
 * @fileoverview Handles user requests from popup or context menu.
 * Orchestrates tab retrieval, injection, and delegation to content script.
 * Dependencies: injection.js, shared/constants.js, shared/locale.js.
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
  MIN_HIGH_CONTRAST_ACTIONS,
} from './ollama.js';

const STORAGE_KEY = 'pageAdapter:lastRequest';
const DEBUG = true;

// =============================================================================
// Helper: count nodes in a snapshot
// =============================================================================

/**
 * Counts the total number of DOM nodes in a snapshot.
 *
 * @param {object} snapshot - The snapshot object returned by extractDomSnapshot.
 * @returns {number} The total number of nodes.
 */
function countNodes(snapshot) {
  let count = 0;

  function traverse(node) {
    if (!node) {
      return;
    }
    count++;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(snapshot.root);
  return count || 1; // fallback to 1 to avoid division by zero
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

  const summary = actions.map((action, index) => {
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
  }).join('\n');

  return `Applied changes:\n${summary}`;
}

// =============================================================================
// Helper: perform DOM adaptation via LLM
// =============================================================================

/**
 * Executes the DOM adaptation loop using Ollama.
 *
 * @param {number} tabId - The target tab ID.
 * @param {string} requestText - The user request text.
 * @param {object} pageContextResult - Result from GET_PAGE_CONTEXT.
 * @param {string|null} presetId - Preset identifier (if any).
 * @returns {Promise<object>} Result of the adaptation process.
 */
async function performDomAdaptation(tabId, requestText, pageContextResult, presetId = null) {
  let adaptationPlan = null;
  let lastIteration = 0;
  let appliedActions = [];
  let hasPreviousActions = false;
  let previousActionsSummary = '';

  const totalNodes = countNodes(pageContextResult.snapshot);
  // Maximum allowed destructive actions (10% of total nodes, but at least 1).
  const maxDestructive = Math.max(1, Math.floor(totalNodes * 0.1));

  // For high-contrast, we want to force at least 2 iterations if needed.
  const isHighContrast = presetId === 'high_contrast';

  for (let iteration = 1; iteration <= MAX_DOM_ADAPTATION_STEPS; iteration++) {
    lastIteration = iteration;
    if (DEBUG) {
      console.log(`[user-request] === Iteration ${iteration} of ${MAX_DOM_ADAPTATION_STEPS} ===`);
      console.log(`[user-request] Request: ${requestText}, Preset: ${presetId || 'none'}`);
      console.log(`[user-request] Applied actions so far: ${appliedActions.length}`);
    }

    // Determine if we have previous actions (to inform the model).
    hasPreviousActions = appliedActions.length > 0;
    previousActionsSummary = hasPreviousActions
      ? generateActionsSummary(appliedActions)
      : '';

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
    });

    if (DEBUG) {
      console.log(`[user-request] Plan complete: ${adaptationPlan.complete}, actions: ${adaptationPlan.actions.length}`);
      if (adaptationPlan.actions.length > 0) {
        console.log('[user-request] Actions:', JSON.stringify(adaptationPlan.actions, null, 2));
      } else {
        console.log('[user-request] No actions in this plan.');
      }
    }

    // Validate that the plan does not contain too many destructive actions.
    const destructiveActions = adaptationPlan.actions.filter(
      (action) => action.action === 'remove_node' || action.action === 'hide_node'
    );

    if (destructiveActions.length > maxDestructive) {
      console.error(`[user-request] Too many destructive actions: ${destructiveActions.length}`);
      throw new Error(
        `Too many destructive actions (${destructiveActions.length}) – aborting to prevent page damage.`
      );
    }

    // Execute each action.
    for (const action of adaptationPlan.actions) {
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
      if (DEBUG) {
        console.log('[user-request] Action executed successfully.');
      }
    }

    // Record applied actions.
    appliedActions = appliedActions.concat(adaptationPlan.actions);
    const currentActionCount = appliedActions.length;

    // --- Refresh the page snapshot after applying changes ---
    const newPageContextResult = await sendToContentScript(tabId, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    if (newPageContextResult?.ok) {
      pageContextResult = newPageContextResult;
      if (DEBUG) {
        console.log('[user-request] Page snapshot refreshed after iteration.');
      }
    } else {
      console.warn('[user-request] Could not refresh page snapshot; continuing with previous snapshot.');
      // Optionally break if we cannot get a fresh snapshot, but for now we continue.
    }

    // For high-contrast, we enforce a minimum number of actions.
    // If the model says it's complete but we haven't reached the minimum, override.
    let shouldComplete = adaptationPlan.complete;
    if (isHighContrast && currentActionCount < MIN_HIGH_CONTRAST_ACTIONS) {
      if (DEBUG) {
        console.log(`[user-request] High-contrast: only ${currentActionCount} actions, need at least ${MIN_HIGH_CONTRAST_ACTIONS}, overriding complete=false`);
      }
      shouldComplete = false;
    }

    // Also, if no new actions were added in this iteration, break to avoid infinite loop.
    const previousCount = iteration > 1 ? appliedActions.length - adaptationPlan.actions.length : 0;
    if (adaptationPlan.actions.length === 0) {
      if (DEBUG) {
        console.log('[user-request] No new actions added, breaking loop.');
      }
      break;
    }

    if (shouldComplete) {
      if (DEBUG) {
        console.log('[user-request] Adaptation complete according to model.');
      }
      break;
    }

    // If we have reached the maximum iterations, break anyway.
    if (iteration === MAX_DOM_ADAPTATION_STEPS) {
      if (DEBUG) {
        console.log(`[user-request] Reached max iterations (${MAX_DOM_ADAPTATION_STEPS}), stopping.`);
      }
      break;
    }
  }

  if (DEBUG) {
    console.log(`[user-request] Total iterations: ${lastIteration}, total actions: ${appliedActions.length}`);
  }

  return {
    ok: true,
    plan: adaptationPlan,
    iterations: lastIteration,
    totalActions: appliedActions.length,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Handles a user request by routing it to the appropriate action.
 *
 * @param {object} message - The user request message.
 * @param {chrome.tabs.Tab} [providedTab] - Optional tab object, used for context menu actions.
 * @returns {Promise<object>} Response indicating success or failure.
 * @throws Will throw if the active tab cannot be determined or if injection fails.
 */
export async function handleUserRequest(message, providedTab = null) {
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

  // --- Natural language or high-contrast preset → DOM adaptation via LLM ---
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

    const requestText = message.payload.request; // For natural_language or preset request.
    const presetId = message.payload.presetId || null;
    const result = await performDomAdaptation(tab.id, requestText, pageContextResult, presetId);

    return {
      ok: true,
      request,
      ...result,
    };
  }

  // --- Preset: summarize ---
  if (message.payload.presetId === 'summarize') {
    await sendToContentScript(tab.id, {
      type: 'START_SUMMARIZE',
    });
    return { ok: true };
  }

  // --- Other presets (simplify, translate) → simple transformations ---
  await sendToContentScript(tab.id, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: message.payload.presetId,
      request: message.payload.request,
    },
  });

  return { ok: true, request };
}