/**
 * @fileoverview DOM transformations for page adaptation.
 * Dependencies: page-context.js, locale.js.
 * Used by: content.js message handler.
 */

import { t } from '../shared/locale.js';
import { showOverlay, showNotification } from './floating-ui.js';
import { extractMainText } from './page-context.js';

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
    case 'simplify':
      applySimplify();
      break;

    case 'translate':
      applyTranslate();
      break;

    case 'explain':
      applyExplain();
      break;

    default: {
      // Heuristic based on request text.
      const lower = request.toLowerCase();
      if (lower.includes('simplif') || lower.includes('simple')) {
        applySimplify();
      } else if (lower.includes('traduc') || lower.includes('translate')) {
        applyTranslate();
      } else if (lower.includes('explic') || lower.includes('explain')) {
        applyExplain();
      } else {
        showNotification(`Request received: ${request}`);
      }
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
      if (element.style.display !== 'none') {
        element.dataset.pageAdapterHidden = 'true';
        element.style.display = 'none';
      }
    });
  });

  showNotification(t('notification.simplified'));
}

/**
 * Applies the "translate" transformation (simulated language change).
 */
export function applyTranslate() {
  document.documentElement.lang = 'es';
  document.body.classList.add('page-adapter-translate');
  showNotification(t('notification.translated'));
}

/**
 * Applies the "explain" transformation: shows a simplified explanation.
 */
export function applyExplain() {
  const text = extractMainText();
  const explanation = t('notification.explanation', { text: text.slice(0, 300) });
  showOverlay('Explanation', explanation);
}