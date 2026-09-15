/**
 * @fileoverview Safe DOM tool operations for LLM-driven page adaptation.
 * Dependencies: page-context.js, floating-ui.js.
 * Used by: content.js message listener.
 */

import {
  findDomNodeById,
  serializeDomNode,
  contrastRatio,
  parseCSSColor,
  pickReadableTextColor,
} from './page-context.js';

const DEBUG = true;

// Minimum WCAG AA contrast ratio for normal-sized text. Below this the text
// is not reliably readable, so it is replaced with a high-contrast color.
const MIN_CONTRAST_RATIO = 4.5;

const VALID_STYLE_PROPERTIES = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'boxShadow',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'padding',
  'margin',
  'display',
  'visibility',
  'outline',
  'outlineOffset',
  'textDecoration',
  'textShadow',
]);

/**
 * Resolves a tool target node or throws a descriptive error.
 * Special case: if nodeId is 'page-adapter-node-body', return document.body.
 *
 * @param {string} nodeId - The node identifier.
 * @returns {Element} The resolved DOM element.
 */
function requireNode(nodeId) {
  if (nodeId === 'page-adapter-node-body') {
    return document.body;
  }
  const node = findDomNodeById(nodeId);
  if (!node) {
    throw new Error(`Unable to find node with id: ${nodeId}`);
  }
  return node;
}

/**
 * Converts a camelCase style property name to its kebab-case CSS equivalent.
 *
 * @param {string} property - The camelCase property name.
 * @returns {string} The kebab-case property name.
 */
function toKebabCase(property) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Applies a restricted style patch to a DOM element. Values are forced with
 * `!important` so the highlight wins against page rules that also use
 * `!important`. Without this, sites such as GitHub keep their own colors and
 * the highlight has no visible effect.
 *
 * @param {HTMLElement} element - The element to patch.
 * @param {object} style - The style patch.
 */
function applyStylePatch(element, style) {
  if (!style || typeof style !== 'object') return;
  for (const [property, value] of Object.entries(style)) {
    if (!VALID_STYLE_PROPERTIES.has(property)) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    element.style.setProperty(toKebabCase(property), value, 'important');
  }
}

/**
 * Walks the highlighted subtree and ensures every text-bearing node has a
 * readable color against its effective background. Page rules frequently use
 * `!important` on descendants of a highlighted container, so fixing only the
 * target is not enough: each descendant whose own contrast fails is forced to
 * a high-contrast alternative.
 *
 * @param {HTMLElement} element - The element whose styles were just patched.
 * @returns {void}
 */
function ensureReadableTextColor(element) {
  const MAX_DESCENDANTS = 300;

  const computeEffectiveBackground = (node, fallback) => {
    const bg = window.getComputedStyle(node).backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
      return fallback;
    }
    const parsed = parseCSSColor(bg);
    if (!parsed) return fallback;
    if (parsed.a >= 0.9) return bg;
    // Semi-transparent backgrounds are approximated with the parent's color
    // for readability purposes.
    return fallback;
  };

  const fixNode = (node, fallbackBg) => {
    const effectiveBg = computeEffectiveBackground(node, fallbackBg);
    const bgParsed = parseCSSColor(effectiveBg);
    const fgParsed = parseCSSColor(window.getComputedStyle(node).color);
    if (!bgParsed || !fgParsed) return effectiveBg;

    const ratio = contrastRatio(fgParsed, bgParsed);
    if (ratio < MIN_CONTRAST_RATIO) {
      const replacement = pickReadableTextColor(effectiveBg);
      node.style.setProperty('color', replacement, 'important');
      if (DEBUG) {
        console.debug(
          `[dom-tools] Adjusted color to ${replacement} on ${node.tagName} ` +
            `(contrast was ${ratio.toFixed(2)}:1 against ${effectiveBg})`
        );
      }
    }
    return effectiveBg;
  };

  const rootBg = fixNode(element, window.getComputedStyle(element).backgroundColor);

  const descendants = element.querySelectorAll('*');
  const limit = Math.min(descendants.length, MAX_DESCENDANTS);
  for (let i = 0; i < limit; i++) {
    fixNode(descendants[i], rootBg);
  }
}

/**
 * Applies a safe DOM tool request.
 *
 * @param {object} payload - The tool request payload.
 * @returns {Promise<object>} The tool result.
 */
export async function applyDomTool(payload) {
  const { action, nodeId, text, attributes = {}, style = {}, depth = 2 } = payload || {};

  if (DEBUG) {
    console.debug(`[dom-tools] Executing action: ${action} on nodeId: ${nodeId}`);
  }

  switch (action) {
    case 'read_node': {
      const node = requireNode(nodeId);
      return { ok: true, node: serializeDomNode(node, Number.isFinite(depth) ? depth : 2) };
    }
    case 'set_text': {
      const node = requireNode(nodeId);
      node.textContent = typeof text === 'string' ? text : '';
      return { ok: true };
    }
    case 'set_style': {
      const node = requireNode(nodeId);
      applyStylePatch(node, style);
      // Whenever the patch touches background or text color, re-check that
      // the resulting combination is readable and fix it if it is not.
      const touchesColors =
        style &&
        typeof style === 'object' &&
        ('backgroundColor' in style || 'color' in style);
      if (touchesColors) {
        ensureReadableTextColor(node);
      }
      return { ok: true };
    }
    case 'set_attribute': {
      const node = requireNode(nodeId);
      for (const [attributeName, attributeValue] of Object.entries(attributes)) {
        if (typeof attributeValue !== 'string') continue;
        if (!attributeName || attributeName === 'style') continue;
        node.setAttribute(attributeName, attributeValue);
      }
      return { ok: true };
    }
    case 'add_class': {
      const node = requireNode(nodeId);
      if (typeof text === 'string' && text.trim()) {
        node.classList.add(text.trim());
      }
      return { ok: true };
    }
    case 'remove_class': {
      const node = requireNode(nodeId);
      if (typeof text === 'string' && text.trim()) {
        node.classList.remove(text.trim());
      }
      return { ok: true };
    }
    case 'hide_node': {
      const node = requireNode(nodeId);
      node.dataset.pageAdapterHidden = 'true';
      node.style.display = 'none';
      return { ok: true };
    }
    case 'show_node': {
      const node = requireNode(nodeId);
      if (node.dataset.pageAdapterHidden === 'true') {
        node.style.display = '';
        delete node.dataset.pageAdapterHidden;
      }
      return { ok: true };
    }
    case 'remove_node': {
      const node = requireNode(nodeId);
      node.remove();
      return { ok: true };
    }
    case 'scroll_to_node': {
      const node = requireNode(nodeId);
      try {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // Older browsers may not support the options object.
        node.scrollIntoView();
      }
      return { ok: true };
    }
    default:
      throw new Error(`Unsupported DOM tool action: ${action}`);
  }
}