/**
 * @fileoverview Compact panels anchored to quick-menu entries. Two variants
 * are supported: an input panel for presets that require free-form user
 * input, and a result panel for presets that produce a preview (e.g.
 * summarize). Both panels share the visual language of the main menu
 * window. Result content is rendered as Markdown when the renderer is
 * available.
 * Dependencies: marked-loader.js.
 * Used by: floating-button.js.
 */

import { loadMarked, renderMarkdown } from './marked-loader.js';

// =============================================================================
// Constants
// =============================================================================

const INPUT_PANEL_WIDTH = 320;
const RESULT_PANEL_WIDTH = 360;
const PANEL_MARGIN = 8;
const PANEL_GAP = 10;
const INPUT_PANEL_ESTIMATED_HEIGHT = 110;
const RESULT_PANEL_ESTIMATED_HEIGHT = 260;
const CLOSE_ANIMATION_MS = 160;
const CLOSE_ANIMATION_BUFFER_MS = 20;

const CLOSE_ICON_SVG = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" fill="none"/>
  </svg>
`;

const SUBMIT_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 19V5 M5 12l7-7 7 7"
          stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"
          fill="none"/>
  </svg>
`;

// =============================================================================
// Module state
// =============================================================================

let activePanel = null;
let activeAnchor = null;
let activePresetId = null;
let resizeHandler = null;
let closeTimeoutId = null;

// =============================================================================
// Positioning
// =============================================================================

/**
 * Computes the fixed position of the panel relative to its anchor. The
 * panel is placed to the left of the anchor when the viewport offers
 * enough space, and to the right otherwise. It is vertically centred on
 * the anchor so that it reads as an extension of the clicked entry.
 *
 * @param {HTMLElement} anchor - The triggering quick-menu entry.
 * @param {number} panelWidth - Measured width of the panel in pixels.
 * @param {number} panelHeight - Estimated height of the panel in pixels.
 * @returns {{left: number, top: number}} The computed coordinates.
 */
function computePanelPosition(anchor, panelWidth, panelHeight) {
  const rect = anchor.getBoundingClientRect();

  let left = rect.left - panelWidth - PANEL_GAP;
  if (left < PANEL_MARGIN) {
    left = rect.right + PANEL_GAP;
  }
  left = Math.max(
    PANEL_MARGIN,
    Math.min(left, window.innerWidth - panelWidth - PANEL_MARGIN)
  );

  let top = rect.top + rect.height / 2 - panelHeight / 2;
  top = Math.max(
    PANEL_MARGIN,
    Math.min(top, window.innerHeight - panelHeight - PANEL_MARGIN)
  );

  return { left, top };
}

function repositionPanel() {
  if (!activePanel || !activeAnchor || !activeAnchor.isConnected) {
    return;
  }
  const rect = activePanel.getBoundingClientRect();
  const position = computePanelPosition(activeAnchor, rect.width, rect.height);
  activePanel.style.left = `${position.left}px`;
  activePanel.style.top = `${position.top}px`;
}

// =============================================================================
// Panel construction helpers
// =============================================================================

/**
 * Builds the shared header of a quick-action panel.
 *
 * @param {object} params - The header parameters.
 * @param {string|null} params.iconSvg - Preset icon markup, or null.
 * @param {string} params.title - Panel title text.
 * @param {string} params.closeAriaLabel - Accessible label for the close button.
 * @returns {HTMLElement} The header element.
 */
function buildPanelHeader({ iconSvg, title, closeAriaLabel }) {
  const header = document.createElement('div');
  header.className = 'page-adapter-quick-input__header';

  if (iconSvg) {
    const icon = document.createElement('span');
    icon.className = 'page-adapter-quick-input__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconSvg;
    header.appendChild(icon);
  }

  const titleEl = document.createElement('span');
  titleEl.className = 'page-adapter-quick-input__title';
  titleEl.textContent = title || '';
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'page-adapter-quick-input__close';
  closeBtn.setAttribute('aria-label', closeAriaLabel || 'Close');
  closeBtn.title = closeAriaLabel || 'Close';
  closeBtn.innerHTML = CLOSE_ICON_SVG;
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeQuickActionInput({ restoreFocus: true });
  });
  header.appendChild(closeBtn);

  return header;
}

/**
 * Creates the outer panel element and positions it after appending it to
 * the shadow root. Measuring the panel after append keeps the anchoring
 * exact regardless of content height.
 *
 * @param {object} params - The panel parameters.
 * @param {HTMLElement} params.anchor - The triggering element.
 * @param {ShadowRoot} params.shadowRoot - The shadow root that hosts the UI.
 * @param {string} params.presetId - Identifier of the triggering preset.
 * @param {number} params.width - Panel width in pixels.
 * @param {number} params.estimatedHeight - Height used for the initial position.
 * @param {boolean} [params.isResult=false] - Whether this is a result panel.
 * @returns {HTMLElement} The panel element.
 */
function mountPanel({
  anchor,
  shadowRoot,
  presetId,
  width,
  estimatedHeight,
  isResult = false,
}) {
  closeQuickActionInput();

  const effectiveWidth = Math.min(width, window.innerWidth - PANEL_MARGIN * 2);

  const panel = document.createElement('div');
  panel.className = isResult
    ? 'page-adapter-quick-input page-adapter-quick-input--result'
    : 'page-adapter-quick-input';
  panel.dataset.extension = 'true';
  panel.dataset.presetId = presetId || '';
  panel.setAttribute('role', 'dialog');
  panel.style.width = `${effectiveWidth}px`;

  const initial = computePanelPosition(anchor, effectiveWidth, estimatedHeight);
  panel.style.left = `${initial.left}px`;
  panel.style.top = `${initial.top}px`;

  shadowRoot.appendChild(panel);
  activePanel = panel;
  activeAnchor = anchor;
  activePresetId = presetId || null;

  requestAnimationFrame(() => {
    if (!panel.isConnected) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const adjusted = computePanelPosition(anchor, rect.width, rect.height);
    panel.style.left = `${adjusted.left}px`;
    panel.style.top = `${adjusted.top}px`;
  });

  resizeHandler = repositionPanel;
  window.addEventListener('resize', resizeHandler);

  return panel;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Reports whether a quick-action panel is currently open.
 *
 * @returns {boolean} True when a panel is open.
 */
export function isQuickActionInputOpen() {
  return Boolean(activePanel);
}

/**
 * Returns the preset identifier the open panel belongs to, if any.
 *
 * @returns {string|null} The preset identifier or null.
 */
export function getQuickActionInputPresetId() {
  return activePresetId;
}

/**
 * Returns the currently open panel element, if any.
 *
 * @returns {HTMLElement|null} The panel element or null.
 */
export function getQuickActionInputElement() {
  return activePanel;
}

/**
 * Closes the open panel, playing a short exit animation, and optionally
 * returns focus to the anchor.
 *
 * @param {object} [options] - Close options.
 * @param {boolean} [options.restoreFocus=false] - Return focus to the anchor.
 * @returns {void}
 */
export function closeQuickActionInput({ restoreFocus = false } = {}) {
  if (!activePanel) {
    return;
  }

  const panel = activePanel;
  const anchor = activeAnchor;

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (closeTimeoutId) {
    clearTimeout(closeTimeoutId);
    closeTimeoutId = null;
  }

  activePanel = null;
  activeAnchor = null;
  activePresetId = null;

  panel.classList.add('page-adapter-quick-input--closing');
  closeTimeoutId = setTimeout(() => {
    if (panel.isConnected) {
      panel.remove();
    }
    closeTimeoutId = null;
    if (restoreFocus && anchor && anchor.isConnected) {
      try {
        anchor.focus({ preventScroll: true });
      } catch {
        // Older browsers may not support the options object.
      }
    }
  }, CLOSE_ANIMATION_MS + CLOSE_ANIMATION_BUFFER_MS);
}

/**
 * Opens the free-form input panel anchored to a quick-menu entry.
 *
 * @param {object} params - The panel parameters.
 * @param {HTMLElement} params.anchor - The quick-menu entry that triggered it.
 * @param {ShadowRoot} params.shadowRoot - The shadow root that hosts the UI.
 * @param {string} params.presetId - Identifier of the triggering preset.
 * @param {string|null} params.iconSvg - Preset icon markup, or null.
 * @param {string} params.title - Panel title text.
 * @param {string} params.placeholder - Input placeholder text.
 * @param {string} params.inputAriaLabel - Accessible label for the input.
 * @param {string} params.submitAriaLabel - Accessible label for the submit button.
 * @param {string} params.closeAriaLabel - Accessible label for the close button.
 * @param {function(string): void} params.onSubmit - Called with the trimmed value.
 * @returns {HTMLElement} The panel element.
 */
export function openQuickActionInput({
  anchor,
  shadowRoot,
  presetId,
  iconSvg,
  title,
  placeholder,
  inputAriaLabel,
  submitAriaLabel,
  closeAriaLabel,
  onSubmit,
}) {
  const panel = mountPanel({
    anchor,
    shadowRoot,
    presetId,
    width: INPUT_PANEL_WIDTH,
    estimatedHeight: INPUT_PANEL_ESTIMATED_HEIGHT,
  });

  panel.setAttribute('aria-label', title || inputAriaLabel || 'Input');
  panel.appendChild(buildPanelHeader({ iconSvg, title, closeAriaLabel }));

  const body = document.createElement('div');
  body.className = 'page-adapter-quick-input__body';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'page-adapter-quick-input__field';
  input.placeholder = placeholder || '';
  input.setAttribute('aria-label', inputAriaLabel || title || '');
  input.autocomplete = 'off';
  input.spellcheck = false;

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'page-adapter-quick-input__submit';
  submitBtn.setAttribute('aria-label', submitAriaLabel || 'Submit');
  submitBtn.title = submitAriaLabel || 'Submit';
  submitBtn.innerHTML = SUBMIT_ICON_SVG;
  submitBtn.disabled = true;

  const submit = () => {
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    closeQuickActionInput();
    onSubmit(value);
  };

  submitBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    submit();
  });
  input.addEventListener('input', () => {
    submitBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickActionInput({ restoreFocus: true });
    }
  });

  body.append(input, submitBtn);
  panel.appendChild(body);

  requestAnimationFrame(() => input.focus());

  return panel;
}

/**
 * Opens a read-only result panel anchored to a quick-menu entry. The
 * content is initially written as plain text and then upgraded to
 * rendered Markdown once the renderer becomes available, so the panel
 * always displays something immediately even on the very first use.
 *
 * @param {object} params - The panel parameters.
 * @param {HTMLElement} params.anchor - The quick-menu entry that triggered it.
 * @param {ShadowRoot} params.shadowRoot - The shadow root that hosts the UI.
 * @param {string} params.presetId - Identifier of the triggering preset.
 * @param {string|null} params.iconSvg - Preset icon markup, or null.
 * @param {string} params.title - Panel title text.
 * @param {string} params.content - The result text to display.
 * @param {string} params.closeAriaLabel - Accessible label for the close button.
 * @returns {HTMLElement} The panel element.
 */
export function openQuickActionResult({
  anchor,
  shadowRoot,
  presetId,
  iconSvg,
  title,
  content,
  closeAriaLabel,
}) {
  const panel = mountPanel({
    anchor,
    shadowRoot,
    presetId,
    width: RESULT_PANEL_WIDTH,
    estimatedHeight: RESULT_PANEL_ESTIMATED_HEIGHT,
    isResult: true,
  });

  panel.setAttribute('aria-label', title || 'Result');
  panel.appendChild(buildPanelHeader({ iconSvg, title, closeAriaLabel }));

  const contentEl = document.createElement('div');
  contentEl.className = 'page-adapter-quick-input__content';

  const text = typeof content === 'string' ? content : '';
  contentEl.textContent = text;
  panel.appendChild(contentEl);

  if (text.length > 0) {
    loadMarked()
      .then(() => {
        if (!contentEl.isConnected) {
          return;
        }
        contentEl.innerHTML = renderMarkdown(text);
      })
      .catch((error) => {
        console.warn('[Page Adapter] Failed to render markdown:', error);
      });
  }

  requestAnimationFrame(() => {
    const closeBtn = panel.querySelector('.page-adapter-quick-input__close');
    if (closeBtn && closeBtn.isConnected) {
      try {
        closeBtn.focus({ preventScroll: true });
      } catch {
        // Older browsers may not support the options object.
      }
    }
  });

  return panel;
}