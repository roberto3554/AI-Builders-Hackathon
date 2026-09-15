/**
 * @fileoverview Creates a draggable floating circular button that expands
 * into a vertical quick-action menu. Each quick-action icon triggers its
 * preset directly; presets that require free-form input open a compact
 * input panel; presets that produce a preview (summarize) keep the menu
 * open and display a result panel once the request completes. While any
 * quick action is running, a rotating ring is shown around the floating
 * button and its icon is replaced by a stop square, making the cancel
 * behaviour unambiguous. Clicking the button while a quick action is
 * running cancels that action instead of toggling the menu.
 * Dependencies: chrome.runtime, chrome.storage, shared/constants.js,
 *               shared/locale.js, shared/messages.js, menu-window.js,
 *               quick-action-input.js.
 * Used by: content.js.
 */

import { PRESETS, MESSAGE_TYPES } from '../shared/constants.js';
import { t } from '../shared/locale.js';
import { createUserRequest } from '../shared/messages.js';
import { createMenuWindow } from './menu-window.js';
import {
  openQuickActionInput,
  openQuickActionResult,
  closeQuickActionInput,
  isQuickActionInputOpen,
  getQuickActionInputPresetId,
  getQuickActionInputElement,
} from './quick-action-input.js';

// =============================================================================
// Constants
// =============================================================================

const DEBUG = false;

const STORAGE_KEY = 'pageAdapter:buttonPosition';
const DRAG_THRESHOLD = 5;
const BUTTON_VIEWPORT_MARGIN = 20;
const LEGACY_TOP_LEFT_TOLERANCE = 2;

const QUICK_MENU_BUTTON_SIZE = 48;
const QUICK_MENU_GAP = 8;
const QUICK_MENU_MARGIN = 8;
const QUICK_MENU_STAGGER_MS = 45;
const QUICK_MENU_CLOSE_ANIMATION_MS = 220;
const QUICK_MENU_CLOSE_BUFFER_MS = 20;

const PRESET_ID_SUMMARIZE = 'summarize';

/**
 * Stop icon shown while a quick action is running, replacing the default
 * accessibility glyph so it is clear that clicking the button will cancel
 * the current operation.
 */
const STOP_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>
  </svg>
`;

// =============================================================================
// Module state
// =============================================================================

let quickMenuElement = null;
let quickMenuOutsideHandler = null;
let quickMenuCloseTimeoutId = null;
let activeRequestCount = 0;

/**
 * Tracks every in-flight quick-menu request by its request identifier.
 * The entry records whether the request has been cancelled so the caller
 * can suppress any late result panel. Using a Map (rather than a Set)
 * keeps the state self-contained per request.
 *
 * @type {Map<string, {cancelled: boolean, presetId: string}>}
 */
const activeRequests = new Map();

// =============================================================================
// Identifier helpers
// =============================================================================

/**
 * Generates a unique identifier used to correlate a request with its
 * cancellation message. Uses crypto.randomUUID when available.
 *
 * @returns {string} A random request identifier.
 */
function generateRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
// Loading indicator
// =============================================================================

/**
 * Shows the loading ring around the floating button and switches the icon
 * to the stop square so the cancel behaviour is unambiguous. Multiple
 * concurrent requests are supported: the ring remains visible until the
 * last one settles.
 *
 * @param {HTMLElement} button - The floating button element.
 * @returns {void}
 */
function startButtonLoading(button) {
  activeRequestCount += 1;
  button.dataset.loading = 'true';
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', t('quick_menu.stop_action'));
  button.setAttribute('title', t('quick_menu.stop_action'));
}

/**
 * Removes one loading count. The ring and the original icon are restored
 * only when no request is outstanding.
 *
 * @param {HTMLElement} button - The floating button element.
 * @returns {void}
 */
function stopButtonLoading(button) {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (activeRequestCount === 0) {
    button.dataset.loading = 'false';
    button.removeAttribute('aria-busy');
    button.setAttribute('aria-label', t('quick_menu.open_button'));
    button.setAttribute('title', t('quick_menu.open_button'));
  }
}

/**
 * Reports whether any quick-menu request is currently in flight.
 *
 * @returns {boolean} True when at least one request is running.
 */
function hasActiveRequests() {
  return activeRequests.size > 0 || activeRequestCount > 0;
}

// =============================================================================
// Request cancellation
// =============================================================================

/**
 * Cancels every in-flight quick-menu request. Each request is marked as
 * cancelled locally so that any late response is suppressed, and the
 * background service worker is notified so it can abort the underlying
 * operation.
 *
 * @returns {Promise<void>}
 */
async function cancelActiveRequests() {
  if (activeRequests.size === 0) {
    return;
  }

  const entries = [...activeRequests.entries()];
  if (DEBUG) {
    console.debug(
      '[Page Adapter] Cancelling active quick-action requests:',
      entries.map(([id]) => id)
    );
  }

  for (const [requestId, entry] of entries) {
    entry.cancelled = true;
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CANCEL_REQUEST,
        payload: { requestId },
      });
    } catch (error) {
      console.warn('[Page Adapter] Failed to cancel request:', error);
    }
  }
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
 *
 * @returns {void}
 */
function closeQuickMenu() {
  if (!quickMenuElement) {
    return;
  }

  if (quickMenuOutsideHandler) {
    document.removeEventListener('click', quickMenuOutsideHandler, true);
    quickMenuOutsideHandler = null;
  }

  const menu = quickMenuElement;

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

  const items = [...menu.querySelectorAll('.page-adapter-quick-menu-button')];

  if (items.length === 0 || prefersReducedMotion()) {
    finalize();
    return;
  }

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
 * Sends a preset request to the background service worker and resolves
 * with the response. A fresh request identifier is attached so the request
 * follows the same path as those dispatched from the popup and menu
 * window, and so it can be cancelled by the floating button.
 *
 * @param {object} preset - The preset definition.
 * @param {string|null} [requestOverride=null] - Optional request text that
 *   replaces the preset's default request (used for input-driven presets).
 * @returns {Promise<object>} The response from the background service worker.
 */
async function sendPresetRequest(preset, requestOverride = null) {
  const requestId = generateRequestId();
  const message = createUserRequest({
    mode: 'preset',
    request: requestOverride || preset.request,
    presetId: preset.id,
  });
  message.payload.requestId = requestId;

  const entry = { cancelled: false, presetId: preset.id };
  activeRequests.set(requestId, entry);

  if (DEBUG) {
    console.debug(`[Page Adapter] Dispatching preset "${preset.id}".`, message);
  }

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (entry.cancelled) {
      return { ok: false, cancelled: true, error: 'Request cancelled' };
    }

    if (DEBUG) {
      console.debug(`[Page Adapter] Response for "${preset.id}".`, response);
    }
    if (!response?.ok) {
      console.warn(
        `[Page Adapter] Preset "${preset.id}" failed:`,
        response?.error || 'Unknown error'
      );
    }
    return response;
  } catch (error) {
    if (entry.cancelled) {
      return { ok: false, cancelled: true, error: 'Request cancelled' };
    }
    console.error(`[Page Adapter] Failed to send preset "${preset.id}":`, error);
    return { ok: false, error: error?.message || 'Message dispatch failed' };
  } finally {
    activeRequests.delete(requestId);
  }
}

/**
 * Builds a single button for the quick menu. The button contains an icon
 * wrapper and a hidden label that is revealed on hover.
 *
 * @param {object} params - The button parameters.
 * @param {string|null} params.iconSvg - Preset icon markup, or null.
 * @param {string} params.ariaLabel - Accessible label for screen readers.
 * @param {string} params.visibleText - Visible label revealed on hover.
 * @param {function(): void} params.onClick - Click callback.
 * @returns {HTMLButtonElement} The built button.
 */
function buildQuickMenuButton({ iconSvg, ariaLabel, visibleText, onClick }) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'page-adapter-quick-menu-button';
  item.setAttribute('aria-label', ariaLabel);
  item.setAttribute('title', ariaLabel);

  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'page-adapter-quick-menu-button__icon';
  iconWrapper.setAttribute('aria-hidden', 'true');

  if (iconSvg) {
    iconWrapper.innerHTML = iconSvg;
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
 * Runs a preset request while keeping the loading indicator and the
 * active-request registry in sync. The loading ring is started before any
 * await so the browser paints it in the same frame as the click, and it
 * remains visible until the promise settles.
 *
 * @param {object} preset - The preset definition.
 * @param {string|null} requestOverride - Optional request text override.
 * @param {HTMLElement} floatingButton - The floating button element.
 * @returns {Promise<object>} The background response.
 */
async function runPresetRequest(preset, requestOverride, floatingButton) {
  startButtonLoading(floatingButton);
  try {
    return await sendPresetRequest(preset, requestOverride);
  } finally {
    stopButtonLoading(floatingButton);
  }
}

/**
 * Handles a click on a quick-menu preset entry. Behaviour varies by preset:
 *
 * - Presets that require free-form input open an inline input panel and
 *   leave the menu visible. The request itself runs from the panel's
 *   submit handler so the loading ring appears as soon as the query is
 *   confirmed.
 * - The summarize preset keeps the menu open while the request is running
 *   and displays a result panel once the summary is ready.
 * - Every other preset closes the menu immediately and dispatches the
 *   request. A rotating ring on the floating button indicates progress and
 *   stays visible until the request settles.
 *
 * @param {object} preset - The preset definition.
 * @param {HTMLButtonElement} anchor - The quick-menu entry element.
 * @param {string|null} iconSvg - Preset icon markup, or null.
 * @param {string} localizedLabel - Localized preset label.
 * @param {ShadowRoot} shadowRoot - The shadow root that hosts the UI.
 * @param {HTMLButtonElement} floatingButton - The floating button element.
 * @returns {Promise<void>}
 */
async function handlePresetClick(
  preset,
  anchor,
  iconSvg,
  localizedLabel,
  shadowRoot,
  floatingButton
) {
  if (anchor.dataset.paRunning === 'true') {
    return;
  }

  // --- Presets that require free-form input ---
  if (preset.requiresInput) {
    if (
      isQuickActionInputOpen() &&
      getQuickActionInputPresetId() === preset.id
    ) {
      closeQuickActionInput({ restoreFocus: true });
      return;
    }
    openQuickActionInput({
      anchor,
      shadowRoot,
      presetId: preset.id,
      iconSvg,
      title: localizedLabel,
      placeholder: t('search.input_placeholder'),
      inputAriaLabel: t('search.input_label'),
      submitAriaLabel: t('search.submit_button'),
      closeAriaLabel: t('popup.cancel_button'),
      onSubmit: (value) => {
        closeQuickMenu();
        floatingButton.setAttribute('aria-expanded', 'false');
        // Fire-and-forget: the loading ring is toggled around the request
        // so it stays visible for the entire duration of the search.
        runPresetRequest(preset, value, floatingButton);
      },
    });
    return;
  }

  // --- Standard dispatch path ---
  const keepMenuOpen = preset.id === PRESET_ID_SUMMARIZE;

  anchor.dataset.paRunning = 'true';

  if (!keepMenuOpen) {
    closeQuickActionInput();
    closeQuickMenu();
    floatingButton.setAttribute('aria-expanded', 'false');
  }

  let response = null;
  try {
    response = await runPresetRequest(preset, null, floatingButton);
  } finally {
    anchor.dataset.paRunning = 'false';
  }

  if (!keepMenuOpen) {
    return;
  }

  // If the user cancelled the request, do not open the result panel: the
  // menu and any open panel have already been dismissed by the cancel
  // handler on the floating button.
  if (response?.cancelled) {
    return;
  }

  // The anchor may have been detached if the user closed the menu while
  // the request was in flight. In that case the floating button is used
  // as a stable anchor so the panel still appears in a sensible place.
  const resultAnchor = anchor.isConnected ? anchor : floatingButton;
  const hasResult =
    response?.ok &&
    typeof response.responseText === 'string' &&
    response.responseText.trim().length > 0;

  if (hasResult) {
    openQuickActionResult({
      anchor: resultAnchor,
      shadowRoot,
      presetId: preset.id,
      iconSvg,
      title: localizedLabel,
      content: response.responseText,
      closeAriaLabel: t('popup.cancel_button'),
    });
  } else {
    closeQuickMenu();
    floatingButton.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Toggles the quick-action menu. If the menu or its input panel is open,
 * both are dismissed; otherwise the menu is built and shown next to the
 * floating button.
 *
 * @param {HTMLElement} button - The floating button element.
 * @param {ShadowRoot} shadowRoot - The shadow root that hosts the UI.
 * @returns {Promise<void>}
 */
async function toggleQuickMenu(button, shadowRoot) {
  if (quickMenuElement || isQuickActionInputOpen()) {
    closeQuickActionInput();
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

  const menuItems = [];

  for (const preset of PRESETS) {
    const iconUrl = chrome.runtime.getURL(preset.icon);
    const iconSvg = await loadSvgContent(iconUrl);
    const localizedLabel = t(`preset.${preset.id}`);

    const presetItem = buildQuickMenuButton({
      iconSvg,
      ariaLabel: localizedLabel,
      visibleText: localizedLabel,
      onClick: () => {
        handlePresetClick(
          preset,
          presetItem,
          iconSvg,
          localizedLabel,
          shadowRoot,
          button
        );
      },
    });
    menu.appendChild(presetItem);
    menuItems.push(presetItem);
  }

  const arrowIconUrl = chrome.runtime.getURL('src/assets/icons/arrow-left.svg');
  const arrowIconSvg = await loadSvgContent(arrowIconUrl);
  const arrowItem = buildQuickMenuButton({
    iconSvg: arrowIconSvg,
    ariaLabel: t('quick_menu.open_menu'),
    visibleText: t('quick_menu.open_menu'),
    onClick: () => {
      closeQuickActionInput();
      closeQuickMenu();
      button.setAttribute('aria-expanded', 'false');
      createMenuWindow(button, shadowRoot);
    },
  });
  arrowItem.classList.add('page-adapter-quick-menu-button--arrow');
  menu.appendChild(arrowItem);
  menuItems.push(arrowItem);

  menuItems.forEach((item, index) => {
    item.style.animationDelay = `${index * QUICK_MENU_STAGGER_MS}ms`;
  });

  shadowRoot.appendChild(menu);
  quickMenuElement = menu;
  button.setAttribute('aria-expanded', 'true');

  const handleOutsideClick = (event) => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    const panel = getQuickActionInputElement();
    if (
      path.includes(button) ||
      path.includes(menu) ||
      (panel && path.includes(panel))
    ) {
      return;
    }
    closeQuickActionInput();
    closeQuickMenu();
    button.setAttribute('aria-expanded', 'false');
  };

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
 * While a quick action is running, the icon switches to a stop square and
 * clicking the button cancels the current operation.
 *
 * @param {ShadowRoot} shadowRoot - The shadow root that hosts the UI.
 * @returns {void}
 */
export function createFloatingButton(shadowRoot) {
  if (shadowRoot.querySelector('#extension-floating-button')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'extension-floating-button';
  button.className = 'page-adapter-floating-button';
  button.setAttribute('aria-label', t('quick_menu.open_button'));
  button.setAttribute('title', t('quick_menu.open_button'));
  button.setAttribute('aria-expanded', 'false');
  button.type = 'button';
  button.dataset.extension = 'true';
  button.dataset.loading = 'false';

  // Two icons share the same slot and crossfade via the `data-loading`
  // attribute on the button: the default accessibility glyph while idle
  // and a stop square while a quick action is running.
  const iconSpan = document.createElement('span');
  iconSpan.className = 'page-adapter-floating-button__icon';
  iconSpan.setAttribute('aria-hidden', 'true');
  button.appendChild(iconSpan);

  const stopSpan = document.createElement('span');
  stopSpan.className =
    'page-adapter-floating-button__icon page-adapter-floating-button__icon--stop';
  stopSpan.setAttribute('aria-hidden', 'true');
  stopSpan.innerHTML = STOP_ICON_SVG;
  button.appendChild(stopSpan);

  // The ring paints above both icons; it is appended last so it wins the
  // paint order without needing an explicit z-index.
  const ringSpan = document.createElement('span');
  ringSpan.className = 'page-adapter-floating-button__ring';
  ringSpan.setAttribute('aria-hidden', 'true');
  button.appendChild(ringSpan);

  shadowRoot.appendChild(button);

  const powerIconUrl = chrome.runtime.getURL('src/assets/icons/accessibility.svg');
  fetch(powerIconUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Failed to load power icon');
      return response.text();
    })
    .then((svg) => {
      iconSpan.innerHTML = svg;
    })
    .catch(() => {
      iconSpan.textContent = '⏻';
    });

  const defaultPosition = getDefaultButtonPosition(button);
  setButtonPosition(button, defaultPosition.left, defaultPosition.top);

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
      if (quickMenuElement || isQuickActionInputOpen()) {
        closeQuickActionInput();
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

    // While any quick action is running, the button acts as a cancel
    // control: it dismisses the menu and any open panel and notifies the
    // background to abort the request.
    if (hasActiveRequests()) {
      closeQuickActionInput();
      closeQuickMenu();
      button.setAttribute('aria-expanded', 'false');
      cancelActiveRequests();
      return;
    }

    toggleQuickMenu(button, shadowRoot);
  }

  button.addEventListener('mousedown', onDragStart);
  button.addEventListener('click', onClick);

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