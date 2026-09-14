/**
 * @fileoverview Shared preference storage helpers for the Page Adapter extension.
 * Dependencies: chrome.storage.local.
 * Used by: content, popup, background, and menu UI modules.
 */

// =============================================================================
// Constants
// =============================================================================

export const STORAGE_PREFS_KEY = 'pageAdapter:preferences';

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  locale: 'en',
  ollamaModel: 'qwen3.5:2b',
  highContrast: false,
  simplifiedUi: false,
  fontSize: 'medium',
});

const VALID_THEMES = new Set(['system', 'light', 'dark']);
const VALID_LOCALES = new Set(['system', 'en', 'es']);
const VALID_FONT_SIZES = new Set(['small', 'medium', 'large']);

// =============================================================================
// Helpers
// =============================================================================

function normalizePreferences(preferences = {}) {
  const theme = VALID_THEMES.has(preferences.theme)
    ? preferences.theme
    : DEFAULT_PREFERENCES.theme;
  const locale = VALID_LOCALES.has(preferences.locale)
    ? preferences.locale
    : DEFAULT_PREFERENCES.locale;
  const ollamaModel = typeof preferences.ollamaModel === 'string' && preferences.ollamaModel.trim()
    ? preferences.ollamaModel.trim()
    : DEFAULT_PREFERENCES.ollamaModel;
  const fontSize = VALID_FONT_SIZES.has(preferences.fontSize)
    ? preferences.fontSize
    : DEFAULT_PREFERENCES.fontSize;

  return {
    theme,
    locale,
    ollamaModel,
    highContrast: Boolean(preferences.highContrast),
    simplifiedUi: Boolean(preferences.simplifiedUi),
    fontSize,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Loads the stored preferences and merges them with the defaults.
 *
 * @returns {Promise<object>} The normalized preferences object.
 */
export async function loadPreferences() {
  const result = await chrome.storage.local.get(STORAGE_PREFS_KEY);
  return normalizePreferences(result[STORAGE_PREFS_KEY]);
}

/**
 * Saves the given preferences after normalization.
 *
 * @param {object} preferences - The preferences to persist.
 * @returns {Promise<void>}
 */
export async function savePreferences(preferences) {
  await chrome.storage.local.set({
    [STORAGE_PREFS_KEY]: normalizePreferences(preferences),
  });
}