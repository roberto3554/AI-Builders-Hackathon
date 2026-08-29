/**
 * @fileoverview Creates a draggable floating circular button to open the extension menu window.
 * Dependencies: chrome.runtime, chrome.storage, MESSAGE_TYPES, menu-window.
 * Used by: content.js.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { createMenuWindow, closeMenuWindow } from './menu-window.js';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'pageAdapter:buttonPosition';
const DRAG_THRESHOLD = 5; // pixels to differentiate click from drag
const BUTTON_VIEWPORT_MARGIN = 20;
const LEGACY_TOP_LEFT_TOLERANCE = 2;

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

function getClampedButtonPosition(button, left, top) {
  const maxX = window.innerWidth - button.offsetWidth - BUTTON_VIEWPORT_MARGIN;
  const maxY = window.innerHeight - button.offsetHeight - BUTTON_VIEWPORT_MARGIN;
  return {
    left: Math.max(BUTTON_VIEWPORT_MARGIN, Math.min(left, maxX)),
    top: Math.max(BUTTON_VIEWPORT_MARGIN, Math.min(top, maxY)),
  };
}

function getDefaultButtonPosition(button) {
  const top = BUTTON_VIEWPORT_MARGIN;
  const left = window.innerWidth - button.offsetWidth - BUTTON_VIEWPORT_MARGIN;
  return getClampedButtonPosition(button, left, top);
}

function setButtonPosition(button, left, top) {
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  button.style.right = 'auto';
  button.style.transform = 'none';
}

function isLegacyTopLeftPosition(position) {
  return (
    position.left <= BUTTON_VIEWPORT_MARGIN + LEGACY_TOP_LEFT_TOLERANCE &&
    position.top <= BUTTON_VIEWPORT_MARGIN + LEGACY_TOP_LEFT_TOLERANCE
  );
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates and injects the floating button into the document body.
 * The button can be dragged to a new position, and its position is persisted.
 * A click (without dragging) opens the menu window.
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

  const defaultPosition = getDefaultButtonPosition(button);
  setButtonPosition(button, defaultPosition.left, defaultPosition.top);

  // Restore saved position when available, otherwise use top-right by default.
  loadButtonPosition().then((pos) => {
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
      if (isLegacyTopLeftPosition(pos)) {
        setButtonPosition(button, defaultPosition.left, defaultPosition.top);
        saveButtonPosition(defaultPosition.left, defaultPosition.top);
        return;
      }

      const clamped = getClampedButtonPosition(button, pos.left, pos.top);
      setButtonPosition(button, clamped.left, clamped.top);
      return;
    }

    setButtonPosition(button, defaultPosition.left, defaultPosition.top);
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
      const clamped = getClampedButtonPosition(button, newLeft, newTop);
      setButtonPosition(button, clamped.left, clamped.top);
    }
  }

  /**
   * Handles the end of a drag action.
   * If the button was not moved, it's a click (handled separately).
   */
  function onDragEnd() {
    if (!isDragging) {
      return;
    }

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    button.style.cursor = '';
    button.style.transition = '';

    if (hasMoved) {
      // Drag finished: persist the new position.
      const rect = button.getBoundingClientRect();
      saveButtonPosition(rect.left, rect.top);
    }

    isDragging = false;
    // Do NOT reset hasMoved here; the click listener will check it.
  }

  /**
   * Handles click events on the button.
   * Opens the menu window only if the button was not dragged.
   */
  function onClick(event) {
    // console.debug('[Page Adapter] Botón clickeado. isDragging:', isDragging, 'hasMoved:', hasMoved);
    // If a drag occurred, ignore the click.
    if (isDragging || hasMoved) {
      // console.debug('[Page Adapter] Ignorando click porque fue arrastre');
      // Reset flags for next interaction.
      hasMoved = false;
      return;
    }
    // console.debug('[Page Adapter] Abriendo ventana desde click');
    createMenuWindow(button);
  }

  button.addEventListener('mousedown', onDragStart);
  button.addEventListener('click', onClick);
}

// =============================================================================
// Exports for position management
// =============================================================================

export { loadButtonPosition, saveButtonPosition };