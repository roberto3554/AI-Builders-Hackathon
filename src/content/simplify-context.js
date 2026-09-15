/**
 * @fileoverview Extracts a compact list of text-bearing candidate nodes
 * for the simplify feature, annotated with their nearest semantic container.
 * Dependencies: none.
 * Used by: content.js message handler.
 */

const MIN_TEXT_LENGTH = 3;
const MAX_TEXT_PREVIEW = 120;
const MAX_PATH_LENGTH = 120;

// Tags and ARIA roles that define a structural region of the page. A candidate
// is tagged with the innermost such ancestor so batches can be formed from
// coherent groups (a nav, a footer, a sidebar) instead of arbitrary windows.
const SEMANTIC_CONTAINER_TAGS = new Set([
  'nav',
  'header',
  'footer',
  'aside',
  'main',
  'article',
  'section',
  'form',
  'dialog',
]);

const SEMANTIC_CONTAINER_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'main',
  'form',
  'dialog',
  'search',
]);

// Tags that commonly wrap meaningful text. When one of these nodes contains
// text, it is treated as an atomic candidate so inner spans or text nodes are
// not removed independently. This is especially important for list items.
const TEXT_CONTAINER_TAGS = new Set([
  'a',
  'blockquote',
  'button',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'li',
  'p',
  'td',
  'th',
]);

/**
 * Determines whether a serialized node defines a semantic container.
 *
 * @param {object} node - The serialized snapshot node.
 * @returns {boolean} True if the node is a semantic container.
 */
function isSemanticContainer(node) {
  const tag = (node.tagName || '').toLowerCase();
  if (SEMANTIC_CONTAINER_TAGS.has(tag)) {
    return true;
  }
  const role = node.attributes?.role;
  return Boolean(role && SEMANTIC_CONTAINER_ROLES.has(role));
}

/**
 * Produces a short human-readable label for a container node.
 *
 * @param {object} node - The serialized container node.
 * @returns {string} A label such as `<nav role="navigation">`.
 */
function describeContainer(node) {
  const tag = (node.tagName || 'div').toLowerCase();
  const parts = [`<${tag}`];
  const role = node.attributes?.role;
  if (role) {
    parts.push(` role="${role}"`);
  }
  const className = node.attributes?.className;
  if (className) {
    const firstClasses = className.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    if (firstClasses) {
      parts.push(` class="${firstClasses}"`);
    }
  }
  parts.push('>');
  return parts.join('');
}

/**
 * Recursively collects text-bearing nodes from a serialized DOM snapshot.
 * Only nodes that carry their own direct text are considered candidates.
 *
 * @param {object} node - The current snapshot node.
 * @param {number} depth - The current traversal depth.
 * @param {string} path - Ancestor tag chain (e.g. "body > footer > a").
 * @param {Array<{id: string, label: string}>} containerStack - Active semantic
 *   ancestors, innermost last.
 * @param {Array<object>} acc - Accumulator for the collected candidates.
 * @returns {void}
 */
function collectCandidates(node, depth, path, containerStack, acc) {
  if (!node) {
    return;
  }

  const tag = (node.tagName || 'div').toLowerCase();
  const currentPath = path ? `${path} > ${tag}` : tag;
  const truncatedPath =
    currentPath.length > MAX_PATH_LENGTH
      ? `… > ${currentPath.slice(-(MAX_PATH_LENGTH - 4))}`
      : currentPath;

  const isContainer = isSemanticContainer(node);
  const nextStack = isContainer
    ? [...containerStack, { id: node.id, label: describeContainer(node) }]
    : containerStack;

  const directText = typeof node.directText === 'string' ? node.directText.trim() : '';
  const fullText = typeof node.text === 'string' ? node.text.trim() : '';
  const isTextContainer = TEXT_CONTAINER_TAGS.has(tag);

  const candidateText =
    directText.length >= MIN_TEXT_LENGTH
      ? directText
      : isTextContainer && fullText.length >= MIN_TEXT_LENGTH
        ? fullText
        : '';

  if (candidateText.length >= MIN_TEXT_LENGTH) {
    const container =
      nextStack.length > 0
        ? nextStack[nextStack.length - 1]
        : { id: 'root', label: '<body>' };

    acc.push({
      containerId: container.id,
      containerLabel: container.label,
      depth,
      href: node.attributes?.href || null,
      id: node.id,
      path: truncatedPath,
      role: node.attributes?.role || null,
      tagName: node.tagName,
      text: candidateText.slice(0, MAX_TEXT_PREVIEW),
    });
    return;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectCandidates(child, depth + 1, currentPath, nextStack, acc);
    }
  }
}

/**
 * Extracts a compact list of text-bearing nodes from a DOM snapshot.
 *
 * @param {object} snapshot - The snapshot produced by extractDomSnapshot.
 * @returns {Array<object>} Compact candidate descriptors.
 */
export function extractSimplifyCandidates(snapshot) {
  const candidates = [];
  if (snapshot && snapshot.root) {
    collectCandidates(snapshot.root, 0, '', [], candidates);
  }
  return candidates;
}