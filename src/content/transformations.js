/**
 * @fileoverview DOM transformations for page adaptation.
 * Dependencies: page-context.js, locale.js.
 * Used by: content.js message handler.
 */

import { t } from '../shared/locale.js';
import { showNotification } from './floating-ui.js';

const DEBUG = true;

/**
 * Checks whether an element belongs to the extension UI (has data-extension="true" on itself or an ancestor).
 *
 * @param {Element} element - The DOM element to check.
 * @returns {boolean} True if the element is part of the extension UI.
 */
function isExtensionElement(element) {
  return !!element.closest('[data-extension="true"]');
}

/**
 * Applies a transformation to the page based on the payload.
 *
 * @param {object} payload - The transformation payload.
 * @param {string} payload.presetId - The preset identifier.
 * @param {string} payload.request - The natural language request.
 */
export function applyTransformation(payload) {
  const { presetId, request } = payload;

  clearTransformations();

  if (presetId === 'summarize') {
    showNotification(t('notification.summary_triggered') || 'AI summary generated (see panel)');
    return;
  }

  switch (presetId) {
    case 'high_contrast':
      applyHighContrastMode();
      break;
    case 'simplify':
      applySimplify();
      break;
    case 'translate':
      applyTranslate();
      break;
    default:
      const lower = request.toLowerCase();
      if (lower.includes('contrast') || lower.includes('high contrast') || lower.includes('dalt')) {
        applyHighContrastMode();
      } else if (lower.includes('simplif') || lower.includes('simple')) {
        applySimplify();
      } else if (lower.includes('traduc') || lower.includes('translate')) {
        applyTranslate();
      } else {
        showNotification(`Request received: ${request}`);
      }
  }
}

/**
 * Removes all previously applied transformations and restores the page.
 */
export function clearTransformations() {
  document.querySelectorAll('.page-adapter-transformation').forEach((element) => {
    element.remove();
  });
  document.body.classList.remove(
    'page-adapter-high-contrast',
    'page-adapter-simplify',
    'page-adapter-translate'
  );
  document.querySelectorAll('[data-page-adapter-hidden]').forEach((element) => {
    element.style.display = '';
    element.removeAttribute('data-page-adapter-hidden');
  });
}

/**
 * Applies the "simplify" transformation: hides non-essential elements.
 */
export function applySimplify() {
  document.body.classList.add('page-adapter-simplify');
  const hideSelectors = [
    'img',
    'video',
    'iframe',
    'aside',
    'nav',
    '.sidebar',
    '.ad',
    '.banner',
  ];
  hideSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      // Skip extension UI elements.
      if (isExtensionElement(element)) {
        return;
      }
      if (element.style.display !== 'none') {
        element.dataset.pageAdapterHidden = 'true';
        element.style.display = 'none';
      }
    });
  });
  showNotification(t('notification.simplified'));
}

/**
 * Applies a high-contrast adaptation to the page.
 * This version forces styles on all elements that contain text or are interactive,
 * but skips elements belonging to the extension UI.
 */
export function applyHighContrastMode() {
  document.body.classList.add('page-adapter-high-contrast');

  const allElements = document.querySelectorAll('*');
  let totalElements = allElements.length;
  let elementsWithText = 0;
  let interactiveElements = 0;
  let styledElements = 0;

  if (DEBUG) {
    console.debug('[transformations] applyHighContrastMode: total elements in page:', totalElements);
  }

  for (const el of allElements) {
    // Skip extension UI elements.
    if (isExtensionElement(el)) {
      continue;
    }

    const hasText = el.innerText && el.innerText.trim().length > 0;
    const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);

    if (hasText || isInteractive) {
      if (hasText) elementsWithText++;
      if (isInteractive) interactiveElements++;
      el.style.setProperty('color', '#ffffff', 'important');
      el.style.setProperty('background-color', '#000000', 'important');
      if (el.tagName === 'A') {
        el.style.setProperty('color', '#ffff00', 'important');
      }
      styledElements++;
    }
  }

  if (DEBUG) {
    console.debug('[transformations] applyHighContrastMode: elements with text:', elementsWithText);
    console.debug('[transformations] applyHighContrastMode: interactive elements:', interactiveElements);
    console.debug('[transformations] applyHighContrastMode: elements actually styled:', styledElements);
    console.debug('[transformations] applyHighContrastMode: coverage:', (styledElements / totalElements * 100).toFixed(1) + '%');
  }

  showNotification(t('notification.high_contrast'));
}

/**
 * Applies the "translate" transformation (simulated language change).
 */
export function applyTranslate() {
  document.documentElement.lang = 'es';
  document.body.classList.add('page-adapter-translate');
  showNotification(t('notification.translated'));
}