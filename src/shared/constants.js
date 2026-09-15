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
  APPLY_DOM_TOOL: 'APPLY_DOM_TOOL',
  CANCEL_REQUEST: 'CANCEL_REQUEST',
  CHAT_QUESTION: 'CHAT_QUESTION',
  CHAT_RESPONSE: 'CHAT_RESPONSE',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  GET_SEARCH_SEGMENTS: 'GET_SEARCH_SEGMENTS',
  GET_SIMPLIFY_CANDIDATES: 'GET_SIMPLIFY_CANDIDATES',
  OLLAMA_REQUEST: 'OLLAMA_REQUEST',
  OLLAMA_RESPONSE: 'OLLAMA_RESPONSE',
  OPEN_POPUP: 'OPEN_POPUP',
  PAGE_CONTEXT: 'PAGE_CONTEXT',
  PING: 'PING',
  SET_FONT_SIZE: 'SET_FONT_SIZE',
  SET_HIGH_CONTRAST: 'SET_HIGH_CONTRAST',
  SET_LOCALE: 'SET_LOCALE',
  SET_SIMPLIFIED_UI: 'SET_SIMPLIFIED_UI',
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
 *
 * Presets with `requiresInput: true` need free-form text from the user before
 * they can run. They are excluded from the context menu, which cannot collect
 * that input, and are handled specially by the menu window.
 */
export const PRESETS = Object.freeze([
  {
    id: 'high_contrast',
    icon: 'src/assets/icons/contrast.svg',
    label: 'High contrast',
    request: 'Apply a strong high-contrast adaptation to the entire page so text, controls, and structure are much easier to distinguish.',
  },
  {
    id: 'search',
    icon: 'src/assets/icons/search.svg',
    label: 'Search',
    request: 'Find the element on this page that best matches the user query.',
    requiresInput: true,
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
]);