/**
 * @fileoverview Runtime message router for the background service.
 * Delegates messages to specific handlers based on type.
 * Dependencies: ollama.js, user-request.js.
 * Used by: background.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import {
  handleOllamaRequest,
  handleSummarize,
  handleChatQuestion,
} from './ollama.js';
import { handleUserRequest, cancelActiveRequest } from './user-request.js';

// =============================================================================
// Message Router
// =============================================================================

/**
 * Listens for runtime messages and delegates to the appropriate handler.
 *
 * @param {object} message - The received message.
 * @param {chrome.runtime.MessageSender} sender - Sender information.
 * @param {function} sendResponse - Callback to send a response.
 * @returns {boolean | undefined} `true` if the response will be sent asynchronously.
 */
export function onRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return;
  }

  try {
    switch (message.type) {
      case MESSAGE_TYPES.USER_REQUEST:
        handleUserRequest(message, sender?.tab)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling user request:', error);
            sendResponse({ ok: false, error: error.message || 'Unknown error' });
          });
        return true;

      case MESSAGE_TYPES.CANCEL_REQUEST: {
        const requestId = message.payload?.requestId;
        const cancelled = cancelActiveRequest(requestId);
        sendResponse({ ok: true, cancelled });
        return;
      }

      case MESSAGE_TYPES.OLLAMA_REQUEST:
        handleOllamaRequest(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling Ollama request:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case MESSAGE_TYPES.SUMMARIZE_REQUEST:
        handleSummarize(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling summarize request:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case MESSAGE_TYPES.CHAT_QUESTION:
        handleChatQuestion(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling chat question:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case MESSAGE_TYPES.OPEN_POPUP:
        chrome.action.openPopup();
        sendResponse({ ok: true });
        return;

      case MESSAGE_TYPES.PING:
        sendResponse({ ok: true });
        return;
    }
  } catch (error) {
    console.error('[Page Adapter] Unhandled error in message listener:', error);
    sendResponse({ ok: false, error: error.message });
    return true;
  }
}