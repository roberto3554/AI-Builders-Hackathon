/**
 * @fileoverview Creates a draggable floating circular button that expands
 * into a vertical quick-action menu. Each quick-action icon triggers its
 * preset directly; the bottom arrow opens the main menu window.
 * Dependencies: chrome.runtime, chrome.storage, shared/constants.js,
 *               shared/locale.js, shared/messages.js, menu-window.js.
 * Used by: content.js.
 */

import { PRESETS } from '../shared/constants.js';
import { t } from '../shared/locale.js';
import { createUserRequest } from '../shared/messages.js';
import { createMenuWindow } from './menu-window.js';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'pageAdapter:buttonPosition';
const DRAG_THRESHOLD = 5;
const BUTTON_VIEWPORT_MARGIN = 20;
const LEGACY_TOP_LEFT_TOLERANCE = 2;

const QUICK_MENU_BUTTON_SIZE = 48;
const QUICK_MENU_GAP = 8;
const QUICK_MENU_MARGIN = 8;
const QUICK_MENU_STAGGER_MS = 45;
const QUICK_MENU_OPEN_ANIMATION_MS = 300;
const QUICK_MENU_CLOSE_ANIMATION_MS = 220;
const QUICK_MENU_CLOSE_BUFFER_MS = 20;

// =============================================================================
// Module state
// =============================================================================

let quickMenuElement = null;
let quickMenuOutsideHandler = null;
let quickMenuCloseTimeoutId = null;

// =============================================================================
// Position persistence helpers
// =============================================================================

/**
 * Loads the saved button position from storage.
 *
 * @returns {Promise<{left: number, top: number} | null>} The saved position
 *   or null when none is available.
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
// SVG loading
// =============================================================================

/**
 * Fetches the contents of an SVG asset served by the extension.
 *
 * @param {string} url - The absolute URL of the SVG.
 * @returns {Promise<string | null>} The SVG markup or null when unavailable.
 */
async function loadSvgContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

// =============================================================================
// Quick-menu positioning
// =============================================================================

/**
 * Computes the fixed position of the quick menu relative to the button.
 * The menu is centred horizontally on the button and placed below it,
 * unless there is not enough vertical space, in which case it is placed
 * above.
 *
 * @param {HTMLElement} button - The floating button element.
 * @param {number} itemCount - Number of buttons that will be rendered.
 * @returns {{left: number, top: number}} The computed coordinates.
 */
function computeQuickMenuPosition(button, itemCount) {
  const rect = button.getBoundingClientRect();
  const menuWidth = QUICK_MENU_BUTTON_SIZE;
  const estimatedHeight =
    itemCount * QUICK_MENU_BUTTON_SIZE + Math.max(0, itemCount - 1) * QUICK_MENU_GAP;

  let left = rect.left + rect.width / 2 - menuWidth / 2;
  left = Math.max(
    QUICK_MENU_MARGIN,
    Math.min(left, window.innerWidth - menuWidth - QUICK_MENU_MARGIN)
  );

  let top = rect.bottom + QUICK_MENU_GAP;
  if (top + estimatedHeight > window.innerHeight - QUICK_MENU_MARGIN) {
    const aboveTop = rect.top - estimatedHeight - QUICK_MENU_GAP;
    top = aboveTop >= QUICK_MENU_MARGIN ? aboveTop : QUICK_MENU_MARGIN;
  }

  return { left, top };
}

// =============================================================================
// Quick-menu behaviour
// =============================================================================

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Closes the quick menu, playing a top-to-bottom staggered exit animation
 * before the element is removed from the DOM.
 */
function closeQuickMenu() {
  if (!quickMenuElement) {
    return;
  }

  // The outside click handler is removed as soon as the close begins; the
  // menu is logically dismissed even while the exit animation is running.
  if (quickMenuOutsideHandler) {
    document.removeEventListener('click', quickMenuOutsideHandler, true);
    quickMenuOutsideHandler = null;
  }

  const menu = quickMenuElement;
  const items = [...menu.querySelectorAll('.page-adapter-quick-menu-button')];

  // If a previous close is already in progress, finalize it immediately so
  // the state stays consistent even on rapid re-toggles.
  if (quickMenuCloseTimeoutId) {
    clearTimeout(quickMenuCloseTimeoutId);
    quickMenuCloseTimeoutId = null;
    if (menu.isConnected) {
      menu.remove();
    }
    if (quickMenuElement === menu) {
      quickMenuElement = null;
    }
    return;
  }

  const finalize = () => {
    if (menu.isConnected) {
      menu.remove();
    }
    if (quickMenuElement === menu) {
      quickMenuElement = null;
    }
    quickMenuCloseTimeoutId = null;
  };

  if (items.length === 0 || prefersReducedMotion()) {
    finalize();
    return;
  }

  // Reverse the cascade so the bottom-most item closes first.
  const lastIndex = items.length - 1;
  items.forEach((item, index) => {
    item.style.animationDelay = `${(lastIndex - index) * QUICK_MENU_STAGGER_MS}ms`;
  });
  menu.classList.add('page-adapter-quick-menu--closing');

  const totalDuration =
    QUICK_MENU_CLOSE_ANIMATION_MS + lastIndex * QUICK_MENU_STAGGER_MS;

  quickMenuCloseTimeoutId = setTimeout(finalize, totalDuration + QUICK_MENU_CLOSE_BUFFER_MS);
}

/**
 * Sends a preset request to the background service worker.
 *
 * @param {object} preset - The preset definition.
 * @returns {Promise<void>}
 */
async function sendPresetRequest(preset) {
  const message = createUserRequest({
    mode: 'preset',
    request: preset.request,
    presetId: preset.id,
  });

  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      console.warn(
        `[Page Adapter] Preset "${preset.id}" failed:`,
        response?.error || 'Unknown error'
      );
    }
  } catch (error) {
    console.error(`[Page Adapter] Failed to send preset "${preset.id}":`, error);
  }
}

/**
 * Builds a single button for the quick menu. The button contains an icon
 * wrapper and a hidden label that is revealed on hover.
 *
 * @param {object} params - The button parameters.
 * @param {string|null} params.iconPath - Absolute URL of the icon, or null.
 * @param {string} params.ariaLabel - Accessible label for screen readers.
 * @param {string} params.visibleText - Visible label revealed on hover.
 * @param {function(): void} params.onClick - Click callback.
 * @returns {Promise<HTMLButtonElement>} The built button.
 */
async function buildQuickMenuButton({ iconPath, ariaLabel, visibleText, onClick }) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'page-adapter-quick-menu-button';
  item.setAttribute('aria-label', ariaLabel);
  item.setAttribute('title', ariaLabel);

  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'page-adapter-quick-menu-button__icon';
  iconWrapper.setAttribute('aria-hidden', 'true');

  const svgContent = iconPath ? await loadSvgContent(iconPath) : null;
  if (svgContent) {
    iconWrapper.innerHTML = svgContent;
  } else {
    iconWrapper.textContent = (ariaLabel.charAt(0) || '?').toUpperCase();
  }

  const labelElement = document.createElement('span');
  labelElement.className = 'page-adapter-quick-menu-button__label';
  labelElement.textContent = visibleText || ariaLabel;

  item.append(iconWrapper, labelElement);

  item.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });

  return item;
}

/**
 * Toggles the quick-action menu. If the menu is open, it is closed; if it
 * is closed, it is built and shown next to the floating button.
 *
 * @param {HTMLElement} button - The floating button element.
 * @param {ShadowRoot} shadowRoot - The shadow root that hosts the UI.
 * @returns {Promise<void>}
 */
async function toggleQuickMenu(button, shadowRoot) {
  if (quickMenuElement) {
    closeQuickMenu();
    button.setAttribute('aria-expanded', 'false');
    return;
  }

  const totalItems = PRESETS.length + 1;
  const position = computeQuickMenuPosition(button, totalItems);

  const menu = document.createElement('div');
  menu.className = 'page-adapter-quick-menu';
  menu.dataset.extension = 'true';
  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;

  // Collect all buttons so their stagger delay can be assigned in order.
  const menuItems = [];

  for (const preset of PRESETS) {
    const iconUrl = chrome.runtime.getURL(preset.icon);
    const localizedLabel = t(`preset.${preset.id}`);
    const presetItem = await buildQuickMenuButton({
      iconPath: iconUrl,
      ariaLabel: localizedLabel,
      visibleText: localizedLabel,
      onClick: () => {
        closeQuickMenu();
        button.setAttribute('aria-expanded', 'false');
        sendPresetRequest(preset);
      },
    });
    menu.appendChild(presetItem);
    menuItems.push(presetItem);
  }

  const arrowIconUrl = chrome.runtime.getURL('src/assets/icons/arrow-left.svg');
  const arrowItem = await buildQuickMenuButton({
    iconPath: arrowIconUrl,
    ariaLabel: t('quick_menu.open_menu'),
    visibleText: t('quick_menu.open_menu'),
    onClick: () => {
      closeQuickMenu();
      button.setAttribute('aria-expanded', 'false');
      createMenuWindow(button, shadowRoot);
    },
  });
  arrowItem.classList.add('page-adapter-quick-menu-button--arrow');
  menu.appendChild(arrowItem);
  menuItems.push(arrowItem);

  // Apply a staggered animation delay to each item so the menu opens
  // top-to-bottom in a cascade.
  menuItems.forEach((item, index) => {
    item.style.animationDelay = `${index * QUICK_MENU_STAGGER_MS}ms`;
  });

  shadowRoot.appendChild(menu);
  quickMenuElement = menu;
  button.setAttribute('aria-expanded', 'true');

  const handleOutsideClick = (event) => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.includes(button) || path.includes(menu)) {
      return;
    }
    closeQuickMenu();
    button.setAttribute('aria-expanded', 'false');
  };

  // Delay listener registration so the click that opened the menu is
  // not immediately captured as an outside click.
  setTimeout(() => {
    if (quickMenuElement === menu) {
      document.addEventListener('click', handleOutsideClick, true);
      quickMenuOutsideHandler = handleOutsideClick;
    }
  }, 0);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates and injects the floating button into the shadow root.
 * The button can be dragged to a new position, and its position is
 * persisted. Clicking the button toggles a vertical quick-action menu.
 *
 * @param {ShadowRoot} shadowRoot - The shadow root that hosts the UI.
 * @returns {void}
 */
export function createFloatingButton(shadowRoot) {
  // Avoid duplicate injection.
  if (shadowRoot.querySelector('#extension-floating-button')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'extension-floating-button';
  button.className = 'page-adapter-floating-button';
  button.setAttribute('aria-label', 'Open Page Adapter');
  button.setAttribute('title', 'Open Page Adapter');
  button.setAttribute('aria-expanded', 'false');
  button.type = 'button';
  // Mark this element as part of the extension UI so it is ignored in snapshots.
  button.dataset.extension = 'true';

  // Load the power SVG icon.
  const powerIconUrl = chrome.runtime.getURL('src/assets/icons/accessibility.svg');
  fetch(powerIconUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Failed to load power icon');
      return response.text();
    })
    .then((svg) => {
      button.innerHTML = svg;
    })
    .catch(() => {
      // Fallback: simple text.
      button.textContent = '⏻';
    });

  shadowRoot.appendChild(button);

  const defaultPosition = getDefaultButtonPosition(button);
  setButtonPosition(button, defaultPosition.left, defaultPosition.top);

  // Restore saved position when available.
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
      // Once a real drag begins, dismiss the quick menu so it does not
      // visually trail behind the button.
      if (quickMenuElement) {
        closeQuickMenu();
        button.setAttribute('aria-expanded', 'false');
      }
    }

    if (hasMoved) {
      const newLeft = initialLeft + deltaX;
      const newTop = initialTop + deltaY;

      const clamped = getClampedButtonPosition(button, newLeft, newTop);
      setButtonPosition(button, clamped.left, clamped.top);
    }
  }

  function onDragEnd() {
    if (!isDragging) {
      return;
    }

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    button.style.cursor = '';
    button.style.transition = '';

    if (hasMoved) {
      const rect = button.getBoundingClientRect();
      saveButtonPosition(rect.left, rect.top);
    }

    isDragging = false;
  }

  function onClick(event) {
    if (isDragging || hasMoved) {
      hasMoved = false;
      return;
    }
    event.preventDefault();
    toggleQuickMenu(button, shadowRoot);
  }

  button.addEventListener('mousedown', onDragStart);
  button.addEventListener('click', onClick);

  // Keep the quick menu aligned with the button on viewport resize.
  window.addEventListener('resize', () => {
    if (!quickMenuElement) {
      return;
    }
    const totalItems = PRESETS.length + 1;
    const position = computeQuickMenuPosition(button, totalItems);
    quickMenuElement.style.left = `${position.left}px`;
    quickMenuElement.style.top = `${position.top}px`;
  });
}

export { loadButtonPosition, saveButtonPosition };