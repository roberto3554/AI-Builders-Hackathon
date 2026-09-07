/**
 * @fileoverview Safe DOM tool operations for LLM-driven page adaptation.
 * Dependencies: page-context.js, floating-ui.js.
 * Used by: content.js message listener.
 */

import { findDomNodeById, serializeDomNode } from './page-context.js';

const DEBUG = true;

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
 * Applies a restricted style patch to a DOM element.
 *
 * @param {HTMLElement} element - The element to patch.
 * @param {object} style - The style patch.
 */
function applyStylePatch(element, style) {
  if (!style || typeof style !== 'object') return;
  for (const [property, value] of Object.entries(style)) {
    if (!VALID_STYLE_PROPERTIES.has(property)) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    element.style[property] = value;
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
    default:
      throw new Error(`Unsupported DOM tool action: ${action}`);
  }
}