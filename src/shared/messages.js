/**
 * @fileoverview Shared message types and preset definitions used across
 * the extension. All message type constants are kept here to avoid
 * duplicated string literals.
 * Dependencies: None.
 * Used by: background, content, and popup scripts.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Immutable map of message type constants.
 * Sorted alphabetically by key for consistency.
 */
export const MESSAGE_TYPES = Object.freeze({
  APPLY_TRANSFORMATION: 'APPLY_TRANSFORMATION',
  CHAT_QUESTION: 'CHAT_QUESTION',
  CHAT_RESPONSE: 'CHAT_RESPONSE',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  OLLAMA_REQUEST: 'OLLAMA_REQUEST',
  OLLAMA_RESPONSE: 'OLLAMA_RESPONSE',
  PAGE_CONTEXT: 'PAGE_CONTEXT',
  PING: 'PING',
  SHOW_REQUEST: 'SHOW_REQUEST',
  SHOW_SUMMARY: 'SHOW_SUMMARY',
  SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
  SUMMARIZE_REQUEST: 'SUMMARIZE_REQUEST',
  SUMMARIZE_RESPONSE: 'SUMMARIZE_RESPONSE',
  USER_REQUEST: 'USER_REQUEST',
});

/**
 * Immutable array of preset definitions.
 * Sorted alphabetically by id.
 */
export const PRESETS = Object.freeze([
  {
    id: 'explain',
    icon: 'src/assets/icons/explain.svg',
    label: 'Explain',
    request: 'Explain the main content of this page in simple terms.',
  },
  {
    id: 'simplify',
    icon: 'src/assets/icons/simplify.svg',
    label: 'Simplify',
    request: 'Make this page simpler and easier to read, hiding non-essential elements.',
  },
  {
    id: 'summarize',
    icon: 'src/assets/icons/summarize.svg',
    label: 'Summarize',
    request: 'Summarize the main content of this page clearly and concisely.',
  },
  {
    id: 'translate',
    icon: 'src/assets/icons/translate.svg',
    label: 'Translate',
    request: 'Translate the main content of this page to Spanish.',
  },
]);

// =============================================================================
// Factory function
// =============================================================================

/**
 * Creates a standardized user request message object.
 *
 * @param {object} params - The request parameters.
 * @param {string} params.mode - The request mode ('preset' or 'natural_language').
 * @param {string} params.request - The user's request text.
 * @param {string|null} [params.presetId=null] - The preset identifier, if applicable.
 * @returns {object} The formatted message object with type and payload.
 * @example
 * const message = createUserRequest({
 *   mode: 'preset',
 *   request: 'Summarize this page',
 *   presetId: 'summarize',
 * });
 */
export function createUserRequest({ mode, request, presetId = null }) {
  return {
    payload: {
      createdAt: new Date().toISOString(),
      mode,
      presetId,
      request,
    },
    type: MESSAGE_TYPES.USER_REQUEST,
  };
}