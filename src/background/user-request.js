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
import { handleDomAdaptation } from './ollama.js';

const STORAGE_KEY = 'pageAdapter:lastRequest';

// =============================================================================
// Helper: perform DOM adaptation via LLM
// =============================================================================

/**
 * Executes the DOM adaptation loop using Ollama.
 *
 * @param {number} tabId - The target tab ID.
 * @param {string} requestText - The user request text.
 * @param {object} pageContextResult - Result from GET_PAGE_CONTEXT.
 * @returns {Promise<object>} Result of the adaptation process.
 */
async function performDomAdaptation(tabId, requestText, pageContextResult) {
  let adaptationPlan = null;
  let lastIteration = 0;

  for (let iteration = 1; iteration <= 3; iteration++) {
    lastIteration = iteration;

    adaptationPlan = await handleDomAdaptation({
      request: requestText,
      pageContext: {
        context: pageContextResult.context,
        snapshot: pageContextResult.snapshot,
      },
      iteration,
    });

    for (const action of adaptationPlan.actions) {
      const toolResult = await sendToContentScript(tabId, {
        type: MESSAGE_TYPES.APPLY_DOM_TOOL,
        payload: action,
      });

      if (!toolResult?.ok) {
        throw new Error(toolResult?.error || t('error.send_to_tab'));
      }
    }

    if (adaptationPlan.complete || adaptationPlan.actions.length === 0) {
      break;
    }
  }

  return {
    ok: true,
    plan: adaptationPlan,
    iterations: lastIteration,
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

    const requestText = message.payload.request; // For natural_language or preset request
    const result = await performDomAdaptation(tab.id, requestText, pageContextResult);

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