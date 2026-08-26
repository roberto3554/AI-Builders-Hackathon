/**
 * @fileoverview Message factory functions for extension communication.
 * Dependencies: constants.js.
 * Used by: background, content, popup.
 */

import { MESSAGE_TYPES } from './constants.js';

// =============================================================================
// Factory Functions
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
    type: MESSAGE_TYPES.USER_REQUEST,
    payload: {
      createdAt: new Date().toISOString(),
      mode,
      presetId,
      request,
    },
  };
}