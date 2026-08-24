/**
 * @fileoverview Shared message types and preset definitions used across
 * the extension. All message type constants are kept here to avoid
 * duplicated string literals.
 */
export const MESSAGE_TYPES = Object.freeze({
  USER_REQUEST: 'USER_REQUEST',
  SHOW_REQUEST: 'SHOW_REQUEST',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  PAGE_CONTEXT: 'PAGE_CONTEXT',
  PING: 'PING',
  APPLY_TRANSFORMATION: 'APPLY_TRANSFORMATION',
  OLLAMA_REQUEST: 'OLLAMA_REQUEST',
  OLLAMA_RESPONSE: 'OLLAMA_RESPONSE',
  SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
  SHOW_SUMMARY: 'SHOW_SUMMARY',
  SUMMARIZE_REQUEST: 'SUMMARIZE_REQUEST',
  SUMMARIZE_RESPONSE: 'SUMMARIZE_RESPONSE',
  CHAT_QUESTION: 'CHAT_QUESTION',
  CHAT_RESPONSE: 'CHAT_RESPONSE'
});

export const PRESETS = Object.freeze([
  {
    id: 'summarize',
    label: 'Summarize',
    icon: 'src/assets/icons/summarize.svg',
    request: 'Summarize the main content of this page clearly and concisely.'
  },
  {
    id: 'simplify',
    label: 'Simplify',
    icon: 'src/assets/icons/simplify.svg',
    request: 'Make this page simpler and easier to read, hiding non-essential elements.'
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: 'src/assets/icons/translate.svg',
    request: 'Translate the main content of this page to Spanish.'
  },
  {
    id: 'explain',
    label: 'Explain',
    icon: 'src/assets/icons/explain.svg',
    request: 'Explain the main content of this page in simple terms.'
  }
]);

export function createUserRequest({ mode, request, presetId = null }) {
  return {
    type: MESSAGE_TYPES.USER_REQUEST,
    payload: {
      mode,
      request,
      presetId,
      createdAt: new Date().toISOString()
    }
  };
}