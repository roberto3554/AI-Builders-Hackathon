/**
 * @fileoverview Content script injection and tab communication helpers.
 * Dependencies: shared/locale.js.
 * Used by: user-request.js.
 */

import { t } from '../shared/locale.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 300;

// =============================================================================
// Public API
// =============================================================================

/**
 * Determines whether a URL supports script injection.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} `true` if the URL is supported, otherwise `false`.
 */
export function isSupportedUrl(url) {
  if (!url) {
    return false;
  }

  const protocols = ['http:', 'https:', 'file:', 'ftp:'];
  try {
    const parsed = new URL(url);
    return protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Ensures that the content script is ready by pinging it.
 * Retries a few times to allow the content script to load.
 *
 * @param {number} tabId - The ID of the target tab.
 * @returns {Promise<void>}
 * @throws Will throw if the content script does not respond after retries.
 */
export async function ensureContentScriptInjected(tabId) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const pingResult = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (pingResult?.ok) {
        return; // Success.
      }
    } catch (error) {
      lastError = error;
      // Wait before retrying.
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  console.error('[Page Adapter] Content script not ready after retries:', lastError);
  throw new Error(t('error.injection_failed'));
}

/**
 * Sends a message to the content script of a specific tab.
 *
 * @param {number} tabId - The ID of the target tab.
 * @param {object} message - The message to send.
 * @returns {Promise<object>} The response from the content script.
 * @throws Will throw if the tab does not exist or communication fails.
 */
export async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[Page Adapter] Error sending message:', error);
    throw new Error(t('error.send_to_tab'));
  }
}