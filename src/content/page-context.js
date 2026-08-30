/**
 * @fileoverview Page context and DOM snapshot extraction utilities.
 * Dependencies: none.
 * Used by: content script for summarization, context, and DOM inspection.
 */

const MAX_SNAPSHOT_DEPTH = 5;
const MAX_CHILDREN_PER_NODE = 12;
const MAX_TEXT_LENGTH = 160;

const nodeIdMap = new WeakMap();
let nextNodeId = 1;

/**
 * Extracts the main text content from the page.
 *
 * @returns {string} The text content of the main element or body.
 */
export function extractMainText() {
  const mainElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  return mainElement.innerText || '';
}

/**
 * Cleans text by collapsing whitespace.
 *
 * @param {string} value - The raw text.
 * @returns {string} Cleaned text.
 */
export function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Returns a stable in-memory identifier for a DOM node.
 *
 * @param {Node} node - The DOM node.
 * @returns {string} The generated node identifier.
 */
function getNodeId(node) {
  if (!nodeIdMap.has(node)) {
    nodeIdMap.set(node, `page-adapter-node-${nextNodeId++}`);
  }

  return nodeIdMap.get(node);
}

/**
 * Finds a DOM element by the internal node identifier.
 *
 * @param {string} nodeId - The internal node identifier.
 * @returns {Element | null} The matching element, if any.
 */
export function findDomNodeById(nodeId) {
  if (!nodeId) {
    return null;
  }

  const searchRoots = [document.body, document.documentElement].filter(Boolean);

  for (const root of searchRoots) {
    if (getNodeId(root) === nodeId) {
      return root;
    }

    const elements = root.querySelectorAll('*');
    for (const element of elements) {
      if (getNodeId(element) === nodeId) {
        return element;
      }
    }
  }

  return null;
}

/**
 * Checks whether an element is visually relevant enough to include.
 *
 * @param {Element} element - The element to inspect.
 * @returns {boolean} Whether the element should be included in the snapshot.
 */
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Serializes a DOM element into a compact, structured snapshot node.
 *
 * @param {Element} element - The element to serialize.
 * @param {number} depth - Current traversal depth.
 * @returns {object | null} The serialized node or null when the element should be skipped.
 */
function serializeElement(element, depth) {
  if (depth > MAX_SNAPSHOT_DEPTH || !isElementVisible(element)) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();
  const text = cleanText(element.innerText || element.textContent || '').slice(0, MAX_TEXT_LENGTH);
  const attributes = {};

  for (const attribute of element.attributes) {
    if (
      attribute.name === 'style' ||
      attribute.name === 'srcset' ||
      attribute.name === 'data-page-adapter-node-id'
    ) {
      continue;
    }

    if (attribute.name === 'class') {
      attributes.className = cleanText(attribute.value);
      continue;
    }

    if (['id', 'role', 'href', 'src', 'alt', 'title', 'name', 'type', 'value', 'placeholder', 'aria-label'].includes(attribute.name)) {
      attributes[attribute.name] = attribute.value;
    }
  }

  const computedStyle = window.getComputedStyle(element);
  const childNodes = [];
  const children = [...element.children].slice(0, MAX_CHILDREN_PER_NODE);

  for (const child of children) {
    const serializedChild = serializeElement(child, depth + 1);
    if (serializedChild) {
      childNodes.push(serializedChild);
    }
  }

  return {
    id: getNodeId(element),
    tagName,
    text: text || null,
    attributes: Object.keys(attributes).length > 0 ? attributes : null,
    style: {
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      lineHeight: computedStyle.lineHeight,
      display: computedStyle.display,
      visibility: computedStyle.visibility,
    },
    children: childNodes,
  };
}

/**
 * Serializes a DOM element subtree.
 *
 * @param {Element} element - The element to serialize.
 * @param {number} [depth=0] - The current recursion depth.
 * @returns {object | null} The serialized subtree, if visible.
 */
export function serializeDomNode(element, depth = 0) {
  return serializeElement(element, depth);
}

/**
 * Extracts page context for use by AI.
 *
 * @returns {object} An object containing title, url, language, headings, and text.
 */
export function extractPageContext() {
  const title = document.title;
  const url = location.href;

  const mainElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  const text = cleanText(mainElement?.innerText || '');

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .slice(0, 50)
    .map((element) => cleanText(element.innerText))
    .filter(Boolean);

  return {
    title,
    url,
    language: document.documentElement.lang || null,
    headings,
    text: text.slice(0, 30000),
  };
}

/**
 * Extracts a structured DOM snapshot for tool-driven page adaptation.
 *
 * @returns {object} A compact snapshot of the visible page structure.
 */
export function extractDomSnapshot() {
  const rootElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  const serializedRoot = rootElement ? serializeElement(rootElement, 0) : null;

  return {
    title: document.title,
    url: location.href,
    language: document.documentElement.lang || null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    root: serializedRoot,
  };
}