/**
 * @fileoverview LLM-driven page simplification.
 * Batches are formed from semantic container groups (nav, footer, aside, ...)
 * so that each request describes a coherent region of the page rather than an
 * arbitrary window of the DFS order. Each batch is issued as a fresh,
 * self-contained Ollama call; no conversation state is carried between batches.
 * Dependencies: shared/constants.js, shared/locale.js, injection.js, ollama.js.
 * Used by: user-request.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { t } from '../shared/locale.js';
import { sendToContentScript } from './injection.js';
import { callOllama, getPreferredModel, handleSummarize } from './ollama.js';

const DEBUG = true;

const MAX_CANDIDATES = 300;
const MAX_TEXT_PREVIEW = 80;
const MAX_REASON_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 400;

const MAX_BATCH_SIZE = 8;
const MAX_BATCH_ATTEMPTS = 3;
const MAX_SPLIT_DEPTH = 3;
const BATCH_NUM_PREDICT = 512;

const SYSTEM_PROMPT = [
  'You review web page elements for a simplify feature.',
  'For each numbered element, choose exactly one decision:',
  'remove: non-essential navigation menus, sidebars, footers, ads, cookie banners,',
  'newsletter prompts, social links, related-content widgets, promotional blocks.',
  'keep: essential content such as the main heading, article body, forms and their labels,',
  'primary tabs, or any short element that should remain unchanged.',
  'summarize: essential content that is lengthy, repetitive, or verbose and can be shortened',
  'without losing key information. Provide the replacement text.',
  'Do not remove a list item just because it is part of a list. Keep or summarize it when it',
  'contains meaningful content. If you remove a list item, remove the whole item, not only its',
  'inner text. Never leave a list structure empty.',
  'Reply with a JSON array of decisions, one per element, using only the provided index.',
  'Each decision must be an object with "index" (number), "decision" ("remove", "keep", or',
  '"summarize"), and optional "reason" (string) for remove decisions. For "summarize", include',
  'a "text" field with the shortened replacement text.',
  'If every element should be kept, reply with an empty array.',
].join(' ');

// =============================================================================
// Page description
// =============================================================================

/**
 * Produces a compact, single-sentence description of the page purpose.
 *
 * @param {{text: string, title: string}} context - The page context.
 * @param {AbortSignal|null} signal - Optional abort signal.
 * @returns {Promise<string>} A short description, or an empty string.
 */
async function getPageDescription(context, signal = null) {
  try {
    const result = await handleSummarize({ text: context.text, title: context.title }, signal);
    if (!result?.ok || !result.summary) {
      return '';
    }
    const firstSentence = result.summary.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0];
    return firstSentence.slice(0, 200).trim();
  } catch (error) {
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      throw error;
    }
    console.warn('[simplify] Page description generation failed:', error.message);
    return '';
  }
}

// =============================================================================
// Batch construction from container groups
// =============================================================================

/**
 * Groups candidates by their nearest semantic container, preserving document
 * order.
 *
 * @param {Array<object>} candidates - The ordered candidate list.
 * @returns {Array<{containerId: string, containerLabel: string, items: Array<object>}>}
 */
function groupCandidatesByContainer(candidates) {
  const groups = [];
  const byKey = new Map();

  for (const candidate of candidates) {
    const key = candidate.containerId || 'root';
    let group = byKey.get(key);
    if (!group) {
      group = {
        containerId: key,
        containerLabel: candidate.containerLabel || '<body>',
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(candidate);
  }

  return groups;
}

/**
 * Splits container groups into batches.
 *
 * @param {Array<object>} groups
 * @returns {Array<{containerLabel: string, items: Array<object>}>}
 */
function buildBatches(groups) {
  const batches = [];
  for (const group of groups) {
    for (let i = 0; i < group.items.length; i += MAX_BATCH_SIZE) {
      batches.push({
        containerLabel: group.containerLabel,
        items: group.items.slice(i, i + MAX_BATCH_SIZE),
      });
    }
  }
  return batches;
}

// =============================================================================
// Prompt construction
// =============================================================================

/**
 * Formats a single candidate as a numbered input line.
 *
 * @param {object} candidate - The candidate descriptor.
 * @param {number} index - One-based index within the batch.
 * @returns {string} The formatted line.
 */
function formatCandidateLine(candidate, index) {
  const path = candidate.path ? ` [${candidate.path}]` : '';
  const text = (candidate.text || '').replace(/\s+/g, ' ').slice(0, MAX_TEXT_PREVIEW);
  const tag = (candidate.tagName || 'div').toLowerCase();
  return `${index}. <${tag}>${path} "${text}"`;
}

/**
 * Builds the per-batch prompt.
 *
 * @param {object} params - Prompt parameters.
 * @returns {string} The formatted prompt.
 */
function buildBatchPrompt({ description, containerLabel, candidates }) {
  const lines = [];
  if (description) {
    lines.push(`Page: ${description}`);
  }
  lines.push(`Container: ${containerLabel}`);
  lines.push('');
  for (let i = 0; i < candidates.length; i++) {
    lines.push(formatCandidateLine(candidates[i], i + 1));
  }
  lines.push('');
  lines.push('Example reply:');
  lines.push('[{"index":2,"decision":"remove","reason":"site-wide navigation link"}]');
  lines.push('If every element is essential, reply with [].');
  return lines.join('\n');
}

// =============================================================================
// Response parsing
// =============================================================================

/**
 * Parses the model response into a list of simplification decisions.
 *
 * @param {string} responseText - The raw model response.
 * @param {Array<object>} candidates - The ordered batch of candidates.
 * @returns {{decisions: Array<object>, hadContent: boolean}}
 */
function parseDecisions(responseText, candidates) {
  const decisions = [];
  const byIndex = new Map();
  candidates.forEach((candidate, i) => byIndex.set(i + 1, candidate));

  const text = typeof responseText === 'string' ? responseText : '';
  if (text.trim() === '') {
    return { decisions, hadContent: false };
  }

  let payload = null;

  try {
    payload = JSON.parse(text.trim());
  } catch {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      try {
        payload = JSON.parse(fencedMatch[1].trim());
      } catch {
        // Continue with bracket extraction.
      }
    }

    if (!payload) {
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          payload = JSON.parse(text.slice(firstBracket, lastBracket + 1));
        } catch {
          // Ignore malformed JSON.
        }
      }
    }
  }

  if (!Array.isArray(payload)) {
    return { decisions, hadContent: false };
  }

  for (const item of payload) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const index = Number(item.index);
    const candidate = byIndex.get(index);
    if (!candidate) {
      continue;
    }

    const decision = typeof item.decision === 'string' ? item.decision.toLowerCase() : '';
    if (!['remove', 'keep', 'summarize'].includes(decision)) {
      continue;
    }

    const normalized = {
      decision,
      index,
      nodeId: candidate.id,
    };

    if (decision === 'remove') {
      normalized.reason =
        typeof item.reason === 'string'
          ? item.reason.trim().slice(0, MAX_REASON_LENGTH)
          : '';
    }

    if (decision === 'summarize') {
      const summaryText = typeof item.text === 'string' ? item.text.trim() : '';
      if (!summaryText) {
        continue;
      }
      normalized.text = summaryText.slice(0, MAX_SUMMARY_LENGTH);
    }

    decisions.push(normalized);
  }

  return {
    decisions,
    hadContent: payload.length === 0 || decisions.length > 0,
  };
}

// =============================================================================
// Batch execution
// =============================================================================

/**
 * Issues a single self-contained classification request for one batch.
 *
 * @param {Array<object>} batch - The batch candidates.
 * @param {string} description - One-line page description.
 * @param {string} containerLabel - Container label for the batch.
 * @param {string} model - The Ollama model name.
 * @param {string} label - Human-readable batch label for logging.
 * @param {AbortSignal|null} signal - Optional abort signal.
 * @returns {Promise<{decisions: Array<object>, hadContent: boolean}>}
 */
async function runSingleBatch(batch, description, containerLabel, model, label, signal) {
  const prompt = buildBatchPrompt({
    description,
    containerLabel,
    candidates: batch,
  });

  const responseText = await callOllama(
    prompt,
    SYSTEM_PROMPT,
    model,
    BATCH_NUM_PREDICT,
    false,
    signal
  );

  if (DEBUG) {
    console.debug(`[simplify] ${label} prompt:\n${prompt}`);
    console.debug(
      `[simplify] ${label} response (first 300 chars):`,
      (responseText || '').slice(0, 300)
    );
  }

  return parseDecisions(responseText, batch);
}

/**
 * Executes a batch with retries and splitting.
 *
 * @param {Array<object>} batch - The batch candidates.
 * @param {string} description - One-line page description.
 * @param {string} containerLabel - Container label for the batch.
 * @param {string} model - The Ollama model name.
 * @param {string} label - Human-readable batch label.
 * @param {number} [depth=0] - Current split depth.
 * @param {AbortSignal|null} signal - Optional abort signal.
 * @returns {Promise<Array<object>>} The accumulated decisions.
 */
async function runBatchWithFallback(
  batch,
  description,
  containerLabel,
  model,
  label,
  depth = 0,
  signal = null
) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      const abortError = new Error('Request aborted.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    try {
      const result = await runSingleBatch(
        batch,
        description,
        containerLabel,
        model,
        label,
        signal
      );

      if (!result.hadContent) {
        lastError = 'Non-empty response with no parsable decisions';
        console.warn(`[simplify] ${label} attempt ${attempt}: ${lastError}`);
        continue;
      }

      return result.decisions;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      lastError = error.message;
      console.warn(`[simplify] ${label} attempt ${attempt} failed: ${error.message}`);
    }
  }

  if (depth >= MAX_SPLIT_DEPTH || batch.length <= 2) {
    console.warn(
      `[simplify] Giving up on ${label} after ${MAX_BATCH_ATTEMPTS} attempts ` +
        `(${batch.length} nodes). Last error: ${lastError}`
    );
    return [];
  }

  console.warn(`[simplify] Splitting ${label} (${batch.length} nodes) into halves.`);
  const midpoint = Math.ceil(batch.length / 2);
  const halves = [batch.slice(0, midpoint), batch.slice(midpoint)];
  const merged = [];

  for (let i = 0; i < halves.length; i++) {
    if (signal?.aborted) {
      const abortError = new Error('Request aborted.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const halfLabel = `${label}.${i + 1}`;
    const halfResult = await runBatchWithFallback(
      halves[i],
      description,
      containerLabel,
      model,
      halfLabel,
      depth + 1,
      signal
    );
    merged.push(...halfResult);
  }

  return merged;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Runs the simplify flow for a tab.
 *
 * @param {number} tabId - The target tab ID.
 * @param {object} pageContextResult - The result from GET_PAGE_CONTEXT.
 * @param {{ cancelled: boolean, controller: AbortController } | null} [token=null]
 * @returns {Promise<object>} The simplification result summary.
 */
export async function performSimplify(tabId, pageContextResult, token = null) {
  const context = pageContextResult.context;
  const signal = token?.controller?.signal ?? null;

  const [description, candidatesResponse] = await Promise.all([
    getPageDescription(context, signal),
    sendToContentScript(tabId, {
      type: MESSAGE_TYPES.GET_SIMPLIFY_CANDIDATES,
    }),
  ]);

  if (!candidatesResponse?.ok) {
    throw new Error(candidatesResponse?.error || t('error.send_to_tab'));
  }

  const allCandidates = candidatesResponse.candidates || [];
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);

  if (DEBUG) {
    console.debug('[simplify] Page description:', description);
    console.debug(
      `[simplify] Candidates: ${allCandidates.length} (processing ${candidates.length})`
    );
  }

  if (candidates.length === 0) {
    return {
      summary: t('simplify.no_changes'),
      totalCandidates: 0,
      totalHidden: 0,
      totalSummarized: 0,
    };
  }

  const model = await getPreferredModel();
  const groups = groupCandidatesByContainer(candidates);
  const batches = buildBatches(groups);
  const validIds = new Set(candidates.map((candidate) => candidate.id));
  const toRemove = new Set();
  const toSummarize = new Map();

  if (DEBUG) {
    console.debug(
      `[simplify] ${groups.length} container groups, ${batches.length} batches.`
    );
    for (const group of groups) {
      console.debug(
        `[simplify]   ${group.containerLabel}: ${group.items.length} candidates`
      );
    }
  }

  for (let i = 0; i < batches.length; i++) {
    if (token?.cancelled) {
      if (DEBUG) {
        console.debug('[simplify] Cancellation observed before batch', i + 1);
      }
      break;
    }

    const batch = batches[i];
    const label = `Batch ${i + 1}/${batches.length}`;
    let decisions;
    try {
      decisions = await runBatchWithFallback(
        batch.items,
        description,
        batch.containerLabel,
        model,
        label,
        0,
        signal
      );
    } catch (error) {
      if (error.name === 'AbortError' || token?.cancelled) {
        break;
      }
      throw error;
    }

    for (const decision of decisions) {
      if (!validIds.has(decision.nodeId)) {
        continue;
      }

      if (decision.decision === 'remove') {
        toRemove.add(decision.nodeId);
        toSummarize.delete(decision.nodeId);
        if (DEBUG) {
          console.debug(
            `[simplify] ${label} REMOVE ${decision.nodeId} — ${decision.reason || ''}`
          );
        }
      } else if (decision.decision === 'summarize') {
        if (!toRemove.has(decision.nodeId)) {
          toSummarize.set(decision.nodeId, decision.text);
          if (DEBUG) {
            console.debug(
              `[simplify] ${label} SUMMARIZE ${decision.nodeId} — ${decision.text.slice(
                0,
                80
              )}`
            );
          }
        }
      }
    }
  }

  if (token?.cancelled) {
    return {
      summary: 'Request cancelled by user.',
      totalCandidates: candidates.length,
      totalHidden: 0,
      totalSummarized: 0,
    };
  }

  if (toRemove.size === 0 && toSummarize.size === 0) {
    return {
      summary: t('simplify.no_changes'),
      totalCandidates: candidates.length,
      totalHidden: 0,
      totalSummarized: 0,
    };
  }

  let summarizedCount = 0;
  for (const [nodeId, text] of toSummarize) {
    if (token?.cancelled) break;
    try {
      const result = await sendToContentScript(tabId, {
        payload: { action: 'set_text', nodeId, text },
        type: MESSAGE_TYPES.APPLY_DOM_TOOL,
      });
      if (result?.ok) {
        summarizedCount++;
      }
    } catch (error) {
      console.warn(`[simplify] Failed to summarize ${nodeId}:`, error.message);
    }
  }

  let hiddenCount = 0;
  for (const nodeId of toRemove) {
    if (token?.cancelled) break;
    try {
      const result = await sendToContentScript(tabId, {
        payload: { action: 'hide_node', nodeId },
        type: MESSAGE_TYPES.APPLY_DOM_TOOL,
      });
      if (result?.ok) {
        hiddenCount++;
      }
    } catch (error) {
      console.warn(`[simplify] Failed to hide ${nodeId}:`, error.message);
    }
  }

  if (DEBUG) {
    console.debug(
      `[simplify] Hidden ${hiddenCount} of ${candidates.length} candidates; ` +
        `summarized ${summarizedCount}.`
    );
  }

  const cancelled = Boolean(token?.cancelled);

  return {
    summary: cancelled
      ? 'Request cancelled by user.'
      : t('simplify.summary_updated', {
          hidden: hiddenCount,
          summarized: summarizedCount,
        }),
    totalCandidates: candidates.length,
    totalHidden: hiddenCount,
    totalSummarized: summarizedCount,
  };
}