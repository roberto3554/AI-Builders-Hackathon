/**
 * @fileoverview Popup UI logic for the Page Adapter extension.
 * Renders preset buttons, handles text input, and sends user requests.
 * Dependencies: shared/constants.js, shared/messages.js, shared/locale.js.
 * Used by: popup.html.
 */

import { PRESETS, MESSAGE_TYPES } from '../shared/constants.js';
import { createUserRequest } from '../shared/messages.js';
import { t, setLocale } from '../shared/locale.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUEST_LENGTH = 2000;
const STATUS_DISPLAY_MS = 350;
const STORAGE_PREFS_KEY = 'pageAdapter:preferences';

// =============================================================================
// DOM references
// =============================================================================

const presetsContainer = document.querySelector('#presets');
const requestInput = document.querySelector('#request');
const adaptButton = document.querySelector('#adapt');
const statusElement = document.querySelector('#status');
const counterElement = document.querySelector('#counter');
const languageSelect = document.querySelector('#language-select');
const themeSelect = document.querySelector('#theme-select');

// =============================================================================
// Preferences helpers
// =============================================================================

/**
 * Loads user preferences from storage.
 *
 * @returns {Promise<object>} An object with `theme` and `locale` properties.
 */
async function loadPreferences() {
  const result = await chrome.storage.local.get(STORAGE_PREFS_KEY);
  return result[STORAGE_PREFS_KEY] || { theme: 'system', locale: 'en' };
}

/**
 * Saves user preferences to storage.
 *
 * @param {object} prefs - The preferences object.
 * @param {string} prefs.theme - 'system', 'light', or 'dark'.
 * @param {string} prefs.locale - 'en' or 'es'.
 * @returns {Promise<void>}
 */
async function savePreferences(prefs) {
  await chrome.storage.local.set({ [STORAGE_PREFS_KEY]: prefs });
}

/**
 * Applies the selected theme to the popup body.
 *
 * @param {string} theme - 'system', 'light', or 'dark'.
 */
function applyTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-light');
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else if (theme === 'light') {
    document.body.classList.add('theme-light');
  }
  // 'system' → no class, media query prevails
}

/**
 * Returns the default status message for the current locale.
 *
 * @returns {string} The localized default status message.
 */
function getDefaultStatusMessage() {
  return t('popup.status.default');
}

/**
 * Applies the selected locale to the popup UI.
 *
 * @param {string} locale - 'en' or 'es'.
 */
function applyLocale(locale) {
  setLocale(locale);
  updatePopupTexts();
  updateSelectOptions();
  // Refresh the status message with the new locale.
  setStatus(getDefaultStatusMessage());
  // Regenerate preset buttons with the new locale.
  renderPresets();
}

/**
 * Updates all static text elements in the popup with current locale.
 */
function updatePopupTexts() {
  document.querySelector('#popup-title').textContent = t('popup.title');
  document.querySelector('#popup-subtitle').textContent = t('popup.subtitle');
  document.querySelector('#quick-actions-label').textContent = t('popup.quick_actions');
  document.querySelector('#request-label').textContent = t('popup.write_need');
  requestInput.placeholder = t('popup.placeholder');
  adaptButton.textContent = t('popup.adapt_button');
  document.querySelector('#language-label').textContent = t('popup.preferences.language');
  document.querySelector('#theme-label').textContent = t('popup.preferences.theme');
}

/**
 * Updates the options of the language and theme selects with translated labels.
 */
function updateSelectOptions() {
  const langOptions = languageSelect.querySelectorAll('option');
  langOptions.forEach((opt) => {
    const key = `popup.preferences.language_${opt.value}`;
    opt.textContent = t(key);
  });

  const themeOptions = themeSelect.querySelectorAll('option');
  themeOptions.forEach((opt) => {
    const key = `popup.preferences.theme_${opt.value}`;
    opt.textContent = t(key);
  });
}

/**
 * Sends a message to the content script of the active tab.
 *
 * @param {object} message - The message to send.
 * @returns {Promise<void>}
 */
async function sendMessageToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.debug('[Page Adapter] Could not send message to content script:', error);
    }
  }
}

// =============================================================================
// Rendering functions
// =============================================================================

/**
 * Renders the preset buttons in the popup.
 * Each button triggers a user request when clicked.
 */
function renderPresets() {
  // Clear container before re-rendering to avoid duplicates.
  presetsContainer.innerHTML = '';

  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';

    const iconUrl = chrome.runtime.getURL(preset.icon || '');

    // Use translation for the preset label.
    const labelKey = `preset.${preset.id}`;
    const labelText = t(labelKey);

    button.innerHTML = `
      <span class="preset-icon"><img src="${iconUrl}" alt="" /></span>
      <span>${escapeHtml(labelText)}</span>
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

// =============================================================================
// Initialization
// =============================================================================

(async function init() {
  // Load and apply preferences
  const prefs = await loadPreferences();
  applyTheme(prefs.theme);
  applyLocale(prefs.locale);
  languageSelect.value = prefs.locale;
  themeSelect.value = prefs.theme;

  // Render presets is now called inside applyLocale, so we don't call it here.
  // But we still need to update the counter and set up event listeners.
  updateCounter();

  // Event listeners for user actions
  requestInput.addEventListener('input', updateCounter);
  adaptButton.addEventListener('click', submitNaturalLanguage);

  // Event listeners for preference changes
  languageSelect.addEventListener('change', async (e) => {
    const locale = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.locale = locale;
    await savePreferences(newPrefs);
    applyLocale(locale);
    await sendMessageToActiveTab({
      type: MESSAGE_TYPES.SET_LOCALE,
      payload: { locale },
    });
  });

  themeSelect.addEventListener('change', async (e) => {
    const theme = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.theme = theme;
    await savePreferences(newPrefs);
    applyTheme(theme);
    await sendMessageToActiveTab({
      type: MESSAGE_TYPES.SET_THEME,
      payload: { theme },
    });
  });
})();