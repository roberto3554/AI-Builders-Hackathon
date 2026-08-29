/**
 * @fileoverview Locale loader and accessor.
 * Dependencies: locale data from locales/en.js and locales/es.js.
 * Used by: all UI components.
 */

import en from '../locales/en.js';
import es from '../locales/es.js';

const locales = { en, es };

let currentLocale = 'system';
let currentEffectiveLocale = 'en';

/**
 * Sets the active locale. If 'system' is passed, detects the browser language.
 *
 * @param {string} locale - The locale code ('en', 'es', or 'system').
 * @returns {void}
 */
export function setLocale(locale) {
  if (locales[locale]) {
    currentLocale = locale;
    currentEffectiveLocale = locale;
  } else if (locale === 'system') {
    currentLocale = 'system';
    const systemLang = navigator.language || 'en';
    if (systemLang.startsWith('es')) {
      currentEffectiveLocale = 'es';
    } else {
      currentEffectiveLocale = 'en';
    }
  } else {
    console.warn(`Locale "${locale}" not available. Keeping "${currentLocale}".`);
  }
}

/**
 * Retrieves the current locale code (may be 'system').
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
  let localeData = locales[currentEffectiveLocale];
  if (!localeData) {
    // Fallback to English
    localeData = locales['en'];
    if (!localeData) {
      // Ultimate fallback: return the key itself
      return key;
    }
  }
  let text = localeData[key] || key;
  for (const [param, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`{{${param}}}`, 'g'), value);
  }
  return text;
}