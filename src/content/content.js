/**
 * @fileoverview Content script entry point for the Page Adapter extension.
 * Responsibilities: set up message listener, coordinate page manipulations.
 * Dependencies: dynamic imports of content modules.
 * Used by: background service worker via chrome.tabs.sendMessage.
 */

console.log('[Page Adapter] Content script loaded');

// =============================================================================
// Self-injection marker
// =============================================================================

if (!document.documentElement.dataset.pageAdapterInjected) {
  document.documentElement.dataset.pageAdapterInjected = 'true';
}

// =============================================================================
// Message listener
// =============================================================================

/**
 * Listens for runtime messages from the background script.
 * Delegates to specific handlers based on message type using dynamic imports.
 *
 * @param {object} message - The received message.
 * @param {object} sender - Sender information (unused).
 * @param {function} sendResponse - Callback to send a response.
 * @returns {boolean | undefined} `true` if response is sent asynchronously.
 */
async function onRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return;
  }

  try {
    switch (message.type) {
      case 'GET_PAGE_CONTEXT': {
        const { extractPageContext } = await import('./page-context.js');
        sendResponse({ ok: true, context: extractPageContext() });
        return true;
      }

      case 'PING': {
        sendResponse({ ok: true });
        return;
      }

      case 'APPLY_TRANSFORMATION': {
        const { applyTransformation } = await import('./transformations.js');
        applyTransformation(message.payload);
        sendResponse({ ok: true });
        return true;
      }

      case 'START_SUMMARIZE':
      case 'SUMMARIZE_PAGE': {
        const { applySummarize } = await import('./summarizer.js');
        applySummarize().catch((error) => {
          console.error('[Page Adapter] Summarize error:', error);
        });
        sendResponse({ ok: true });
        return true;
      }

      default: {
        // Ignore unknown message types.
        break;
      }
    }
  } catch (error) {
    console.error('[Page Adapter] Error handling message:', error);
    sendResponse({ ok: false, error: error.message });
    return true;
  }
}

// Register listener.
chrome.runtime.onMessage.addListener(onRuntimeMessage);