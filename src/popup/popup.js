/**
 * @fileoverview Popup UI logic for the Page Adapter extension.
 * Shows information about the extension.
 * Dependencies: shared/locale.js, shared/preferences.js.
 * Used by: popup.html.
 */

import { t, setLocale } from '../shared/locale.js';
import { loadPreferences } from '../shared/preferences.js';

// =============================================================================
// DOM references
// =============================================================================

const titleElement = document.querySelector('#popup-title');
const subtitleElement = document.querySelector('#popup-subtitle');
const descriptionElement = document.querySelector('#info-description');
const versionElement = document.querySelector('#version-number');

// =============================================================================
// Locale and theme helpers
// =============================================================================

/**
 * Applies the selected locale to all static texts.
 *
 * @param {string} locale - 'en' or 'es'.
 */
function applyLocale(locale) {
  setLocale(locale);
  titleElement.textContent = t('popup.title');
  subtitleElement.textContent = t('popup.subtitle');
  descriptionElement.textContent = t('popup.info.description');

  const manifest = chrome.runtime.getManifest();
  versionElement.textContent = t('popup.info.version', { version: manifest.version });
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
 * Applies the selected font size to the popup body. The corresponding body
 * class overrides the `--font-scale` custom property, which is consumed by
 * every `font-size` declaration in popup.css.
 *
 * @param {string} fontSize - 'small', 'medium', or 'large'.
 */
function applyFontSize(fontSize) {
  document.body.classList.remove('font-small', 'font-medium', 'font-large');
  const safeSize = ['small', 'medium', 'large'].includes(fontSize)
    ? fontSize
    : 'medium';
  document.body.classList.add(`font-${safeSize}`);
}

// =============================================================================
// Initialization
// =============================================================================

(async function init() {
  const prefs = await loadPreferences();
  applyTheme(prefs.theme);
  applyFontSize(prefs.fontSize);
  applyLocale(prefs.locale);
})();