/**
 * @fileoverview Creates a draggable floating circular button to open the extension popup.
 * Dependencies: chrome.runtime, chrome.storage, MESSAGE_TYPES.
 * Used by: content.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'pageAdapter:buttonPosition';
const DRAG_THRESHOLD = 5; // pixels to differentiate click from drag

/**
 * SVG icon for the power button (inline).
 * The icon uses currentColor for proper theming.
 */
const POWER_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2v10M18.36 6.64a9 9 0 1 1-12.72 0" />
</svg>
`;

// =============================================================================
// Position persistence helpers
// =============================================================================

/**
 * Loads the saved button position from storage.
 *
 * @returns {Promise<object|null>} An object with `left` and `top` properties,
 *   or `null` if no position is saved.
 */
async function loadButtonPosition() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

/**
 * Saves the button position to storage.
 *
 * @param {number} left - The left coordinate in pixels.
 * @param {number} top - The top coordinate in pixels.
 * @returns {Promise<void>}
 */
async function saveButtonPosition(left, top) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: { left, top } });
  } catch (error) {
    console.warn('[Page Adapter] Failed to save button position:', error);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates and injects the floating button into the document body.
 * The button can be dragged to a new position, and its position is persisted.
 * A click (without dragging) opens the extension popup.
 *
 * @returns {void}
 */
export function createFloatingButton() {
  // Avoid duplicate injection.
  if (document.querySelector('#page-adapter-floating-button')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'page-adapter-floating-button';
  button.className = 'page-adapter-floating-button';
  button.setAttribute('aria-label', 'Open Page Adapter');
  button.setAttribute('title', 'Open Page Adapter');
  button.type = 'button';

  button.innerHTML = POWER_SVG;
  document.body.appendChild(button);

  // Restore saved position if it exists.
  loadButtonPosition().then((pos) => {
    if (pos) {
      button.style.left = `${pos.left}px`;
      button.style.top = `${pos.top}px`;
      button.style.transform = 'none';
    }
  });

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let hasMoved = false;

  /**
   * Handles the start of a drag action.
   */
  function onDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    isDragging = true;
    hasMoved = false;

    const rect = button.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;

    button.style.cursor = 'grabbing';
    button.style.transition = 'none';

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    event.preventDefault();
  }

  /**
   * Handles the drag movement, updating the button position.
   */
  function onDragMove(event) {
    if (!isDragging) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (
      !hasMoved &&
      (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)
    ) {
      hasMoved = true;
    }

    if (hasMoved) {
      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // Keep the button within the viewport with a margin.
      const margin = 20;
      const maxX = window.innerWidth - button.offsetWidth - margin;
      const maxY = window.innerHeight - button.offsetHeight - margin;
      newLeft = Math.max(margin, Math.min(newLeft, maxX));
      newTop = Math.max(margin, Math.min(newTop, maxY));

      button.style.left = `${newLeft}px`;
      button.style.top = `${newTop}px`;
      button.style.transform = 'none';
    }
  }

  /**
   * Handles the end of a drag action.
   * If the button was not moved, opens the popup.
   * Otherwise, saves the new position.
   */
  function onDragEnd(event) {
    if (!isDragging) {
      return;
    }

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    button.style.cursor = '';
    button.style.transition = '';

    if (!hasMoved) {
      // Click without drag: open the popup.
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_POPUP });
    } else {
      // Drag finished: persist the new position.
      const rect = button.getBoundingClientRect();
      saveButtonPosition(rect.left, rect.top);
    }

    isDragging = false;
    hasMoved = false;
  }

  button.addEventListener('mousedown', onDragStart);
}