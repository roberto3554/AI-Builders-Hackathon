/**
 * @fileoverview LLM-driven element search and highlighting.
 * Splits the page into semantic segments and asks Ollama about one segment at
 * a time, stopping as soon as a segment produces a highlight plan. The first
 * highlighted node is scrolled into view so the user sees it immediately.
 * Dependencies: shared/constants.js, shared/locale.js, injection.js, ollama.js.
 * Used by: user-request.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { t } from '../shared/locale.js';
import { sendToContentScript } from './injection.js';
import { handleSegmentSearch } from './ollama.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_HIGHLIGHT_ACTIONS = 2;
const MAX_SEGMENTS_TO_SEARCH = 8;
const DEBUG = true;

// =============================================================================
// Public API
// =============================================================================

/**
 * Runs the search flow for a tab. The page is split into semantic segments by
 * the content script, then each segment is queried in priority order. The
 * first segment that produces a non-empty highlight plan wins and the loop
 * stops. If no segment matches, a "not found" summary is returned.
 *
 * @param {number} tabId - The target tab ID.
 * @param {object} pageContextResult - The result from GET_PAGE_CONTEXT.
 * @param {string} query - The user's free-form search query.
 * @param {{ cancelled: boolean, controller: AbortController } | null} [token=null]
 * @returns {Promise<object>} The search result summary.
 */
export async function performSearch(tabId, pageContextResult, query, token = null) {
  const signal = token?.controller?.signal ?? null;

  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return {
      summary: t('search.no_query'),
      highlightedCount: 0,
      targets: [],
    };
  }

  const context = pageContextResult.context;

  const segmentsResponse = await sendToContentScript(tabId, {
    type: MESSAGE_TYPES.GET_SEARCH_SEGMENTS,
  });
  if (!segmentsResponse?.ok) {
    throw new Error(segmentsResponse?.error || t('error.send_to_tab'));
  }

  const allSegments = Array.isArray(segmentsResponse.segments)
    ? segmentsResponse.segments
    : [];
  const segments = allSegments
    .filter((segment) => segment.candidates && segment.candidates.length > 0)
    .slice(0, MAX_SEGMENTS_TO_SEARCH);

  if (DEBUG) {
    console.debug('[search] Query:', trimmedQuery);
    console.debug(`[search] Segments to inspect: ${segments.length}`);
    for (const segment of segments) {
      console.debug(
        `[search]   ${segment.segmentLabel} (priority ${segment.priority}): ` +
          `${segment.candidates.length} candidates`
      );
    }
  }

  if (segments.length === 0) {
    return {
      summary: t('search.summary_not_found'),
      highlightedCount: 0,
      targets: [],
    };
  }

  for (let i = 0; i < segments.length; i++) {
    if (token?.cancelled) {
      return {
        summary: t('search.summary_cancelled'),
        highlightedCount: 0,
        targets: [],
      };
    }

    const segment = segments[i];
    if (DEBUG) {
      console.debug(
        `[search] Querying segment ${i + 1}/${segments.length}: ${segment.segmentLabel}`
      );
    }

    let result;
    try {
      result = await handleSegmentSearch({
        query: trimmedQuery,
        segment,
        context,
        signal,
      });
    } catch (error) {
      if (error.name === 'AbortError' || token?.cancelled) {
        return {
          summary: t('search.summary_cancelled'),
          highlightedCount: 0,
          targets: [],
        };
      }
      // A segment failure is not fatal: move on to the next one.
      console.warn(
        `[search] Segment ${segment.segmentLabel} failed: ${error.message}`
      );
      continue;
    }

    if (!result.matched || result.actions.length === 0) {
      continue;
    }

    // Only highlight actions are allowed for search. Any other action returned
    // by the model is dropped so the page structure remains intact.
    const highlightActions = result.actions
      .filter((action) => action.action === 'set_style')
      .slice(0, MAX_HIGHLIGHT_ACTIONS);

    if (highlightActions.length === 0) {
      continue;
    }

    const appliedNodeIds = [];
    for (const action of highlightActions) {
      if (token?.cancelled) break;
      try {
        const applyResult = await sendToContentScript(tabId, {
          type: MESSAGE_TYPES.APPLY_DOM_TOOL,
          payload: action,
        });
        if (applyResult?.ok) {
          appliedNodeIds.push(action.nodeId);
        }
      } catch (error) {
        console.warn(
          `[search] Failed to apply highlight on ${action.nodeId}:`,
          error.message
        );
      }
    }

    if (appliedNodeIds.length === 0) {
      // The model claimed a match but nothing could be applied; keep looking.
      continue;
    }

    try {
      await sendToContentScript(tabId, {
        type: MESSAGE_TYPES.APPLY_DOM_TOOL,
        payload: { action: 'scroll_to_node', nodeId: appliedNodeIds[0] },
      });
    } catch (error) {
      console.warn('[search] Failed to scroll to target node:', error.message);
    }

    const summary =
      result.summary || t('search.summary_found', { count: appliedNodeIds.length });

    return {
      summary,
      highlightedCount: appliedNodeIds.length,
      targets: appliedNodeIds,
      matchedSegment: segment.segmentId,
    };
  }

  return {
    summary: t('search.summary_not_found'),
    highlightedCount: 0,
    targets: [],
  };
}