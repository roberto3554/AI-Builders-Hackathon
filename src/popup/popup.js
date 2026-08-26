/**
 * @fileoverview Popup UI logic for the Page Adapter extension.
 * Renders preset buttons, handles text input, and sends user requests.
 * Dependencies: shared/constants.js, shared/messages.js, shared/locale.js.
 * Used by: popup.html.
 */

import { PRESETS } from '../shared/constants.js';
import { createUserRequest } from '../shared/messages.js';
import { t, setLocale } from '../shared/locale.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUEST_LENGTH = 2000;
const STATUS_DISPLAY_MS = 350;
const DEFAULT_STATUS_MESSAGE = t('popup.status.default');

// =============================================================================
// DOM references
// =============================================================================

const presetsContainer = document.querySelector('#presets');
const requestInput = document.querySelector('#request');
const adaptButton = document.querySelector('#adapt');
const statusElement = document.querySelector('#status');
const counterElement = document.querySelector('#counter');

// =============================================================================
// Initialization
// =============================================================================

// Set locale (default is 'en'; could be changed based on browser language).
setLocale('en');

// Populate static text from locale.
document.querySelector('#popup-title').textContent = t('popup.title');
document.querySelector('#popup-subtitle').textContent = t('popup.subtitle');
document.querySelector('#quick-actions-label').textContent = t('popup.quick_actions');
document.querySelector('#request-label').textContent = t('popup.write_need');
requestInput.placeholder = t('popup.placeholder');
adaptButton.textContent = t('popup.adapt_button');
statusElement.textContent = DEFAULT_STATUS_MESSAGE;

renderPresets();
updateCounter();

requestInput.addEventListener('input', updateCounter);
adaptButton.addEventListener('click', submitNaturalLanguage);

// =============================================================================
// Rendering functions
// =============================================================================

/**
 * Renders the preset buttons in the popup.
 * Each button triggers a user request when clicked.
 */
function renderPresets() {
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';

    const iconUrl = chrome.runtime.getURL(preset.icon || '');

    button.innerHTML = `
      <span class="preset-icon"><img src="${iconUrl}" alt="" /></span>
      <span>${escapeHtml(preset.label)}</span>
    `;

    button.addEventListener('click', () => {
      sendRequest(
        createUserRequest({
          mode: 'preset',
          request: preset.request,
          presetId: preset.id,
        })
      );
    });

    presetsContainer.appendChild(button);
  }
}

// =============================================================================
// Event handlers
// =============================================================================

/**
 * Handles the natural language submission from the text area.
 */
async function submitNaturalLanguage() {
  const request = requestInput.value.trim();

  if (!request) {
    setStatus(t('popup.status.default'), 'error');
    requestInput.focus();
    return;
  }

  await sendRequest(
    createUserRequest({
      mode: 'natural_language',
      request,
    })
  );
}

// =============================================================================
// Request sending
// =============================================================================

/**
 * Sends a user request to the background script and handles the response.
 *
 * @param {object} message - The request message to send.
 * @returns {Promise<void>}
 */
async function sendRequest(message) {
  setLoading(true);
  setStatus(t('popup.status.sending'));

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (!response?.ok) {
      throw new Error(response?.error || t('popup.error.generic'));
    }

    setStatus(t('popup.status.success'), 'success');

    // Close popup after a short delay to show status.
    setTimeout(() => window.close(), STATUS_DISPLAY_MS);
  } catch (error) {
    setStatus(error.message || t('popup.error.generic'), 'error');
    setLoading(false);
  }
}

// =============================================================================
// UI state helpers
// =============================================================================

/**
 * Enables or disables all interactive elements.
 *
 * @param {boolean} value - `true` to disable, `false` to enable.
 */
function setLoading(value) {
  adaptButton.disabled = value;

  document.querySelectorAll('.preset').forEach((button) => {
    button.disabled = value;
  });
}

/**
 * Updates the status message and its CSS class.
 *
 * @param {string} message - The status text to display.
 * @param {string} [type=''] - Optional type ('error', 'success', or empty).
 */
function setStatus(message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`.trim();
}

/**
 * Updates the character counter for the text area.
 */
function updateCounter() {
  const length = requestInput.value.length;
  counterElement.textContent = t('popup.counter', { current: length, max: MAX_REQUEST_LENGTH });
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Escapes HTML special characters in a string to prevent XSS.
 *
 * @param {string} value - The raw string.
 * @returns {string} The escaped string.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}