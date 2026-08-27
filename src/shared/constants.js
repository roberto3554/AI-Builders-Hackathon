/**
 * @fileoverview Shared constants for the Page Adapter extension.
 * Dependencies: none.
 * Used by: background, content, popup, and other shared modules.
 */

// =============================================================================
// Message Types
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
  SET_LOCALE: 'SET_LOCALE',
  SET_THEME: 'SET_THEME',
  SHOW_REQUEST: 'SHOW_REQUEST',
  SHOW_SUMMARY: 'SHOW_SUMMARY',
  SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
  SUMMARIZE_REQUEST: 'SUMMARIZE_REQUEST',
  SUMMARIZE_RESPONSE: 'SUMMARIZE_RESPONSE',
  START_SUMMARIZE: 'START_SUMMARIZE',
  USER_REQUEST: 'USER_REQUEST',
});

// =============================================================================
// Preset Definitions
// =============================================================================

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