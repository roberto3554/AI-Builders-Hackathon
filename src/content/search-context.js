/**
 * @fileoverview Extracts searchable segments from a DOM snapshot for the
 * search feature. Each segment groups the text-bearing and interactive
 * descendants of one semantic container so the LLM can be queried about a
 * coherent region of the page at a time.
 * Dependencies: none.
 * Used by: content.js message handler.
 */

const MIN_TEXT_LENGTH = 2;
const MAX_TEXT_PREVIEW = 100;
const MAX_PATH_LENGTH = 120;
const MAX_CANDIDATES_PER_SEGMENT = 80;
const MAX_TOTAL_CANDIDATES = 600;

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

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
]);

// Priority ordering used to decide which segments to query first. Lower is
// higher priority. Dialogs are almost always what the user is looking at;
// headers and forms typically contain login and account controls; navs and
// main content come next; asides and footers are least likely to hold the
// target of a query.
const TAG_PRIORITY = {
  dialog: 0,
  header: 1,
  form: 2,
  nav: 3,
  main: 4,
  article: 4,
  section: 4,
  aside: 5,
  footer: 6,
};

const ROLE_PRIORITY = {
  dialog: 0,
  banner: 1,
  search: 2,
  form: 2,
  navigation: 3,
  main: 4,
  complementary: 5,
  contentinfo: 6,
};

const DEFAULT_PRIORITY = 4;

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
 * Computes the priority used to order segments. Lower numbers are queried
 * before higher ones.
 *
 * @param {object} node - The serialized container node.
 * @returns {number} The priority value.
 */
function getContainerPriority(node) {
  const role = node.attributes?.role;
  if (role && ROLE_PRIORITY[role] !== undefined) {
    return ROLE_PRIORITY[role];
  }
  const tag = (node.tagName || '').toLowerCase();
  if (TAG_PRIORITY[tag] !== undefined) {
    return TAG_PRIORITY[tag];
  }
  return DEFAULT_PRIORITY;
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
    const firstClasses = className
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(' ');
    if (firstClasses) {
      parts.push(` class="${firstClasses}"`);
    }
  }
  parts.push('>');
  return parts.join('');
}

/**
 * Builds a candidate descriptor for a node if it carries enough signal to be
 * worth sending to the model. Returns null for empty wrapper nodes.
 *
 * @param {object} node - The serialized snapshot node.
 * @param {string} path - Ancestor tag chain.
 * @returns {object | null} A candidate descriptor or null.
 */
function buildCandidate(node, path) {
  const tag = (node.tagName || 'div').toLowerCase();
  const attrs = node.attributes || {};
  const directText = typeof node.directText === 'string' ? node.directText.trim() : '';
  const fullText = typeof node.text === 'string' ? node.text.trim() : '';
  const text = (directText || fullText).replace(/\s+/g, ' ');

  const isInteractive = INTERACTIVE_TAGS.has(tag);
  const hasMeaningfulAttr =
    attrs.role || attrs.href || attrs['aria-label'] || attrs.placeholder || attrs.title;

  if (!isInteractive && !hasMeaningfulAttr && text.length < MIN_TEXT_LENGTH) {
    return null;
  }

  return {
    ariaLabel: attrs['aria-label'] || null,
    depth: 0,
    href: attrs.href || null,
    id: node.id,
    path,
    placeholder: attrs.placeholder || null,
    role: attrs.role || null,
    tagName: node.tagName,
    text: text.slice(0, MAX_TEXT_PREVIEW),
    title: attrs.title || null,
    type: attrs.type || null,
  };
}

/**
 * Recursively collects searchable candidates grouped by their innermost
 * semantic container. A body-level segment captures any candidate that is not
 * inside a recognised container so nothing is lost.
 *
 * @param {object} node - The current serialized node.
 * @param {string} path - Ancestor tag chain.
 * @param {Map<string, object>} segmentMap - Accumulator keyed by segment id.
 * @param {Array<object>} order - Segment list in first-seen order.
 * @param {object} state - Mutable state tracking the total candidate count.
 * @returns {void}
 */
function collectSegments(node, path, segmentMap, order, state) {
  if (!node || state.total >= MAX_TOTAL_CANDIDATES) {
    return;
  }

  const tag = (node.tagName || 'div').toLowerCase();
  const currentPath = path ? `${path} > ${tag}` : tag;
  const truncatedPath =
    currentPath.length > MAX_PATH_LENGTH
      ? `… > ${currentPath.slice(-(MAX_PATH_LENGTH - 4))}`
      : currentPath;

  // Determine which segment this node belongs to.
  const segmentKey = node.id;
  const isContainer = isSemanticContainer(node);
  if (isContainer && !segmentMap.has(segmentKey)) {
    const segment = {
      candidates: [],
      priority: getContainerPriority(node),
      segmentId: node.id,
      segmentLabel: describeContainer(node),
    };
    segmentMap.set(segmentKey, segment);
    order.push(segment);
  }

  // The candidate belongs to the innermost container seen so far along the
  // current path. We resolve it by walking down from the caller, which passes
  // the current segment id explicitly.
  const currentSegmentId = state.currentSegmentId;
  const candidate = buildCandidate(node, truncatedPath);
  if (candidate && currentSegmentId) {
    const segment = segmentMap.get(currentSegmentId);
    if (segment && segment.candidates.length < MAX_CANDIDATES_PER_SEGMENT) {
      candidate.depth = state.depth;
      segment.candidates.push(candidate);
      state.total++;
    }
  }

  const nextSegmentId = isContainer ? segmentKey : currentSegmentId;
  const previousSegmentId = state.currentSegmentId;
  const previousDepth = state.depth;
  state.currentSegmentId = nextSegmentId;
  state.depth = previousDepth + 1;

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (state.total >= MAX_TOTAL_CANDIDATES) break;
      collectSegments(child, currentPath, segmentMap, order, state);
    }
  }

  state.currentSegmentId = previousSegmentId;
  state.depth = previousDepth;
}

/**
 * Extracts the searchable segments from a DOM snapshot.
 *
 * @param {object} snapshot - The snapshot produced by extractDomSnapshot.
 * @returns {Array<object>} Segments sorted by priority (ascending).
 */
export function extractSearchSegments(snapshot) {
  const segments = [];
  if (!snapshot || !snapshot.root) {
    return segments;
  }

  // Seed a body-level segment so candidates that never appear inside a
  // recognised container still have a home.
  const segmentMap = new Map();
  const bodySegment = {
    candidates: [],
    priority: DEFAULT_PRIORITY,
    segmentId: 'root',
    segmentLabel: '<body>',
  };
  segmentMap.set('root', bodySegment);
  const order = [bodySegment];

  const state = {
    currentSegmentId: 'root',
    depth: 0,
    total: 0,
  };

  collectSegments(snapshot.root, '', segmentMap, order, state);

  for (const segment of order) {
    if (segment.candidates.length > 0) {
      segments.push(segment);
    }
  }

  segments.sort((a, b) => a.priority - b.priority);
  return segments;
}