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

const STORAGE_KEY = 'pageAdapter:lastRequest';

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

  // Delegate to content script based on preset type.
  if (message.payload.presetId === 'summarize') {
    await sendToContentScript(tab.id, {
      type: 'START_SUMMARIZE',
    });
    return { ok: true };
  }

  await sendToContentScript(tab.id, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: message.payload.presetId,
      request: message.payload.request,
    },
  });

  return { ok: true, request };
}