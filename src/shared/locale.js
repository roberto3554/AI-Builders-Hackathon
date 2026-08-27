/**
 * @fileoverview Locale loader and accessor.
 * Dependencies: locale data from index.js.
 * Used by: all UI components.
 */

import locales from '../locales/index.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LOCALE = 'en';
let currentLocale = DEFAULT_LOCALE;

// =============================================================================
// Public API
// =============================================================================

/**
 * Sets the active locale.
 *
 * @param {string} locale - The locale code (e.g., 'en', 'es').
 * @returns {void}
 */
export function setLocale(locale) {
  if (locales[locale]) {
    currentLocale = locale;
  } else {
    console.warn(`Locale "${locale}" not available. Keeping "${currentLocale}".`);
  }
}

/**
 * Retrieves the current locale code.
 *
 * @returns {string} The current locale code.
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Retrieves a localized string by key, with optional interpolation.
 *
 * @param {string} key - The key in the locale object.
 * @param {object} [params] - Key-value pairs for interpolation.
 * @returns {string} The localized string with placeholders replaced.
 */
export function t(key, params = {}) {
  const localeData = locales[currentLocale] || locales[DEFAULT_LOCALE];
  let text = localeData[key] || key;

  for (const [param, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`{{${param}}}`, 'g'), value);
  }

  return text;
}