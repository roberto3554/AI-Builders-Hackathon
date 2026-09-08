/**
 * @fileoverview Page context and DOM snapshot extraction utilities.
 * Dependencies: none.
 * Used by: content script for summarization, context, and DOM inspection.
 */

const DEBUG = true; // Enable detailed logging

const MAX_SNAPSHOT_DEPTH = 20; // Increased to capture deeper nesting
const MAX_CHILDREN_PER_NODE = 80; // Increased to include more children
const MAX_TEXT_LENGTH = 2000;

const nodeIdMap = new WeakMap();
let nextNodeId = 1;

// =============================================================================
// Accessibility helpers – color parsing, luminance, contrast, blending
// =============================================================================

/**
 * Parses a CSS color string (rgb/rgba) into an object with r, g, b, a.
 * Returns null if parsing fails.
 *
 * @param {string} colorStr - CSS color string.
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function parseCSSColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const trimmed = colorStr.trim();
  if (trimmed === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const match = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/
  );
  if (!match) return null;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  return { r, g, b, a };
}

/**
 * Converts an RGB color object to a CSS rgb() string.
 *
 * @param {{ r: number, g: number, b: number }} color
 * @returns {string}
 */
function rgbToCSS(color) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

/**
 * Computes the relative luminance of an sRGB color.
 *
 * @param {number} r - Red component (0-255).
 * @param {number} g - Green component (0-255).
 * @param {number} b - Blue component (0-255).
 * @returns {number} Luminance (0..1).
 */
function luminance(r, g, b) {
  const [R, G, B] = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Computes the WCAG contrast ratio between two colors.
 *
 * @param {{ r: number, g: number, b: number }} color1
 * @param {{ r: number, g: number, b: number }} color2
 * @returns {number} Contrast ratio (>= 1).
 */
function contrastRatio(color1, color2) {
  const l1 = luminance(color1.r, color1.g, color1.b);
  const l2 = luminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Blends a foreground color (possibly semi-transparent) over an opaque background.
 *
 * @param {{ r: number, g: number, b: number, a: number }} fg
 * @param {{ r: number, g: number, b: number }} bg - Opaque background.
 * @returns {{ r: number, g: number, b: number, a: number }} Blended color (a=1).
 */
function blendColors(fg, bg) {
  const alpha = fg.a;
  const r = fg.r * alpha + bg.r * (1 - alpha);
  const g = fg.g * alpha + bg.g * (1 - alpha);
  const b = fg.b * alpha + bg.b * (1 - alpha);
  return { r, g, b, a: 1 };
}

/**
 * Determines the effective background color of an element by walking up the DOM
 * and finding the first opaque background, defaulting to white.
 *
 * @param {Element} element - Starting element.
 * @returns {string} CSS color string.
 */
function getEffectiveBackgroundColor(element) {
  let current = element;
  while (current) {
    const bg = window.getComputedStyle(current).backgroundColor;
    if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
      current = current.parentElement;
      continue;
    }
    const color = parseCSSColor(bg);
    if (color && color.a >= 1) {
      return bg;
    }
    if (color && color.a > 0) {
      const parent = current.parentElement;
      if (parent) {
        const parentBg = getEffectiveBackgroundColor(parent);
        const parentColor = parseCSSColor(parentBg);
        if (parentColor) {
          const blended = blendColors(color, parentColor);
          return rgbToCSS(blended);
        }
      }
    }
    current = current.parentElement;
  }
  return '#ffffff'; // fallback
}

// =============================================================================
// Core page extraction functions
// =============================================================================

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
  if (!nodeId) return null;
  const searchRoots = [document.body, document.documentElement].filter(Boolean);
  for (const root of searchRoots) {
    if (getNodeId(root) === nodeId) return root;
    const elements = root.querySelectorAll('*');
    for (const element of elements) {
      if (getNodeId(element) === nodeId) return element;
    }
  }
  return null;
}

/**
 * Checks whether an element is visually visible.
 *
 * @param {Element} element - The element to inspect.
 * @returns {boolean} Whether the element is visible.
 */
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Determines if a node should be included in the snapshot.
 * We include all visible nodes except extension-injected ones.
 *
 * @param {Element} element - The DOM element.
 * @param {string} text - The cleaned text content.
 * @returns {boolean} True if the node should be included.
 */
function isRelevantNode(element, text) {
  // Skip extension UI elements (any element inside a container with data-extension="true").
  if (element.closest('[data-extension="true"]')) {
    return false;
  }
  // Skip the injection marker on the root element (just in case).
  if (element.dataset && element.dataset.pageAdapterInjected) {
    return false;
  }
  return true;
}

/**
 * Filters style properties to only those needed for accessibility and readability.
 *
 * @param {CSSStyleDeclaration} computedStyle - The computed style object.
 * @returns {object} Filtered style object.
 */
function getFilteredStyle(computedStyle) {
  const allowedProps = [
    'color',
    'backgroundColor',
    'fontSize',
    'fontWeight',
    'fontFamily',
    'opacity',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'display',
    'visibility',
  ];
  const style = {};
  for (const prop of allowedProps) {
    const value = computedStyle[prop];
    if (value !== undefined && value !== null && value !== '') {
      style[prop] = value;
    }
  }
  return style;
}

/**
 * Serializes a DOM element into a compact, structured snapshot node,
 * including computed accessibility metadata.
 *
 * @param {Element} element - The element to serialize.
 * @param {number} depth - Current traversal depth.
 * @param {string} parentEffectiveBackground - Effective background color of the parent.
 * @param {object} stats - Statistics collector.
 * @returns {object | null} The serialized node or null when the element should be skipped.
 */
function serializeElement(element, depth, parentEffectiveBackground, stats) {
  console.log('[DEBUG] Procesando:', element.tagName, 'id:', element.id, 'depth:', depth);

  if (depth > MAX_SNAPSHOT_DEPTH || !isElementVisible(element)) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();
  const text = cleanText(element.innerText || element.textContent || '').slice(0, MAX_TEXT_LENGTH);

  const relevant = isRelevantNode(element, text);
  if (!relevant) {
    const childNodes = [];
    const children = [...element.children].slice(0, MAX_CHILDREN_PER_NODE);
    for (const child of children) {
      const serializedChild = serializeElement(child, depth + 1, parentEffectiveBackground, stats);
      if (serializedChild) {
        childNodes.push(serializedChild);
      }
    }
    if (childNodes.length > 0) {
      return {
        id: getNodeId(element),
        tagName,
        text: null,
        attributes: null,
        style: null,
        accessibility: null,
        children: childNodes,
      };
    }
    return null;
  }

  stats.relevantNodeCount++;

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
  const ownBg = computedStyle.backgroundColor;

  let effectiveBg;
  const ownColor = parseCSSColor(ownBg);
  if (!ownColor || ownColor.a === 0) {
    effectiveBg = parentEffectiveBackground;
  } else if (ownColor.a >= 1) {
    effectiveBg = ownBg;
  } else {
    const parentColor = parseCSSColor(parentEffectiveBackground);
    if (parentColor) {
      const blended = blendColors(ownColor, parentColor);
      effectiveBg = rgbToCSS(blended);
    } else {
      effectiveBg = ownBg;
    }
  }

  // Accessibility classification with fixed threshold 4.5 for all texts
  let accessibility = {
    effectiveBackground: effectiveBg,
    contrastRatio: null,
    isLargeText: false,
    classification: 'NOT_APPLICABLE',
  };

  const hasText = text.length > 0;
  if (hasText) {
    const fgColor = computedStyle.color;
    const fgObj = parseCSSColor(fgColor);
    const bgObj = parseCSSColor(effectiveBg);
    let ratio = null;
    let classification = 'UNRESOLVED';
    if (fgObj && bgObj) {
      ratio = contrastRatio(fgObj, bgObj);
      const threshold = 4.5; // Fixed threshold for all text
      classification = ratio >= threshold ? 'PASS' : 'FAIL';
    }
    accessibility = {
      effectiveBackground: effectiveBg,
      contrastRatio: ratio,
      isLargeText: false,
      classification,
    };

    if (classification === 'FAIL') {
      stats.failingNodeCount++;
      if (DEBUG) {
        console.log(`[page-context] FAIL: ${getNodeId(element)} (${tagName}) text: "${text.slice(0, 30)}" ratio: ${ratio}`);
      }
    } else if (classification === 'PASS') {
      stats.passingNodeCount++;
      if (DEBUG) {
        console.log(`[page-context] PASS: ${getNodeId(element)} (${tagName}) text: "${text.slice(0, 30)}" ratio: ${ratio}`);
      }
    } else {
      stats.unresolvedCount++;
    }
  } else {
    stats.unresolvedCount++;
  }

  const childNodes = [];
  const children = [...element.children].slice(0, MAX_CHILDREN_PER_NODE);
  for (const child of children) {
    const serializedChild = serializeElement(child, depth + 1, effectiveBg, stats);
    if (serializedChild) {
      childNodes.push(serializedChild);
    }
  }

  const filteredStyle = getFilteredStyle(computedStyle);

  return {
    id: getNodeId(element),
    tagName,
    text: text || null,
    attributes: Object.keys(attributes).length > 0 ? attributes : null,
    style: filteredStyle,
    accessibility,
    children: childNodes,
  };
}

/**
 * Serializes a DOM element subtree with filtering and statistics.
 *
 * @param {Element} element - The element to serialize.
 * @param {number} [depth=0] - The current recursion depth.
 * @param {string} [parentEffectiveBackground='#ffffff'] - Parent effective background.
 * @param {object} stats - Statistics collector.
 * @returns {object | null} The serialized subtree, if visible.
 */
export function serializeDomNode(element, depth = 0, parentEffectiveBackground = '#ffffff', stats = null) {
  const localStats = stats || { relevantNodeCount: 0, failingNodeCount: 0, passingNodeCount: 0, unresolvedCount: 0 };
  const result = serializeElement(element, depth, parentEffectiveBackground, localStats);
  return result;
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
 * Recursively collects IDs of nodes with failing accessibility classification.
 *
 * @param {object} node - Serialized node.
 * @param {Array<string>} issues - Accumulator array.
 */
function collectAccessibilityIssues(node, issues) {
  if (!node) return;
  if (node.accessibility && node.accessibility.classification === 'FAIL') {
    issues.push(node.id);
  }
  if (node.children) {
    for (const child of node.children) {
      collectAccessibilityIssues(child, issues);
    }
  }
}

/**
 * Extracts a structured DOM snapshot for tool-driven page adaptation,
 * augmented with accessibility metadata, a list of contrast issues, and statistics.
 * Uses the entire page body as root, excluding only extension-injected elements.
 *
 * @returns {object} A compact snapshot of the visible page structure.
 */
export function extractDomSnapshot() {
  // Always use document.body to capture the entire page
  const rootElement = document.body;

  const rootEffectiveBg = getEffectiveBackgroundColor(rootElement);
  const stats = { relevantNodeCount: 0, failingNodeCount: 0, passingNodeCount: 0, unresolvedCount: 0 };

  const serializedRoot = rootElement
    ? serializeElement(rootElement, 0, rootEffectiveBg, stats)
    : null;

  const relevant = stats.relevantNodeCount;
  const failing = stats.failingNodeCount;
  const passing = stats.passingNodeCount;
  const unresolved = stats.unresolvedCount;
  const coverage = relevant > 0 ? (passing / relevant) * 100 : 0;

  const snapshot = {
    title: document.title,
    url: location.href,
    language: document.documentElement.lang || null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    root: serializedRoot,
    snapshotStats: {
      relevantNodeCount: relevant,
      failingNodeCount: failing,
      passingNodeCount: passing,
      unresolvedCount: unresolved,
      coveragePercentage: coverage,
    },
  };

  const issues = [];
  collectAccessibilityIssues(serializedRoot, issues);
  snapshot.accessibilityIssues = issues;

  if (DEBUG) {
    console.log(`[page-context] Snapshot stats: relevant=${relevant}, failing=${failing}, passing=${passing}, unresolved=${unresolved}`);
    console.log(`[page-context] Accessibility issues (FAIL): ${issues.length} nodes`);
  }

  return snapshot;
}