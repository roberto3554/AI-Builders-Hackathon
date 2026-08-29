/**
 * @fileoverview Creates and manages the floating menu window.
 * Replaces the browser popup with a draggable, resizable panel.
 * Dependencies: floating-ui.js, locale.js, constants.js, messages.js.
 * Used by: floating-button.js.
 */

import { createFloatingWindow, loadWindowSize, saveWindowSize } from './floating-ui.js';
import { t, setLocale } from '../shared/locale.js';
import { PRESETS, MESSAGE_TYPES } from '../shared/constants.js';
import { createUserRequest } from '../shared/messages.js';
import { saveButtonPosition } from './floating-button.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUEST_LENGTH = 2000;
const STORAGE_PREFS_KEY = 'pageAdapter:preferences';

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 670;

const VIEWPORT_MARGIN = 10;
const BUTTON_SYNC_MARGIN = 20;
const DEFAULT_BUTTON_SIZE = 60;

/**
 * SVG icon for the power button (used for the close button).
 * The icon uses currentColor for proper theming.
 */
const POWER_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v10M18.36 6.64a9 9 0 1 1-12.72 0" />
  </svg>
`;

// =============================================================================
// State
// =============================================================================

let activeWindow = null;
let activeFloatingButton = null;

// =============================================================================
// Preferences helpers
// =============================================================================

async function loadPreferences() {
  const result = await chrome.storage.local.get(STORAGE_PREFS_KEY);
  return result[STORAGE_PREFS_KEY] || { theme: 'system', locale: 'en' };
}

async function savePreferences(prefs) {
  await chrome.storage.local.set({ [STORAGE_PREFS_KEY]: prefs });
}

function applyTheme(theme) {
  document.body.classList.remove('page-adapter-theme-dark', 'page-adapter-theme-light');
  if (theme === 'dark') {
    document.body.classList.add('page-adapter-theme-dark');
  } else if (theme === 'light') {
    document.body.classList.add('page-adapter-theme-light');
  }
}

function getDefaultStatusMessage() {
  return t('popup.status.default');
}

function clampMenuWindowPosition(windowElement, margin = VIEWPORT_MARGIN) {
  if (!windowElement) {
    return;
  }

  const rect = windowElement.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const clampedLeft = Math.max(margin, Math.min(rect.left, maxLeft));
  const clampedTop = Math.max(margin, Math.min(rect.top, maxTop));

  windowElement.style.left = `${clampedLeft}px`;
  windowElement.style.top = `${clampedTop}px`;
  windowElement.style.transform = 'none';
}

function syncFloatingButtonWithWindow(windowElement, floatingButton) {
  if (!windowElement || !floatingButton) {
    return;
  }

  const windowRect = windowElement.getBoundingClientRect();
  const buttonRect = floatingButton.getBoundingClientRect();
  const computedWidth = parseFloat(window.getComputedStyle(floatingButton).width);
  const computedHeight = parseFloat(window.getComputedStyle(floatingButton).height);
  const buttonWidth = buttonRect.width || floatingButton.offsetWidth || computedWidth || DEFAULT_BUTTON_SIZE;
  const buttonHeight = buttonRect.height || floatingButton.offsetHeight || computedHeight || DEFAULT_BUTTON_SIZE;

  const maxLeft = Math.max(BUTTON_SYNC_MARGIN, window.innerWidth - buttonWidth - BUTTON_SYNC_MARGIN);
  const maxTop = Math.max(BUTTON_SYNC_MARGIN, window.innerHeight - buttonHeight - BUTTON_SYNC_MARGIN);
  const nextLeft = Math.max(
    BUTTON_SYNC_MARGIN,
    Math.min(windowRect.left + windowRect.width - buttonWidth, maxLeft)
  );
  const nextTop = Math.max(BUTTON_SYNC_MARGIN, Math.min(windowRect.top, maxTop));

  floatingButton.style.left = `${nextLeft}px`;
  floatingButton.style.top = `${nextTop}px`;
  floatingButton.style.right = 'auto';
  floatingButton.style.transform = 'none';
}

function updateFloatingWindowTitle(windowElement) {
  const titleElement = windowElement?.querySelector('.page-adapter-title-text');
  if (titleElement) {
    titleElement.textContent = t('popup.title');
  }
}

// =============================================================================
// DOM building
// =============================================================================

function buildMenuContent() {
  const container = document.createElement('div');
  container.className = 'page-adapter-menu-container';

  const header = document.createElement('header');
  header.className = 'page-adapter-menu-header';
  header.innerHTML = `
    <h1 id="menu-title">${t('popup.title')}</h1>
    <p id="menu-subtitle">${t('popup.subtitle')}</p>
  `;
  container.appendChild(header);

  const presetsSection = document.createElement('section');
  presetsSection.className = 'page-adapter-menu-section';
  const presetsLabel = document.createElement('h2');
  presetsLabel.textContent = t('popup.quick_actions');
  presetsSection.appendChild(presetsLabel);
  const presetsGrid = document.createElement('div');
  presetsGrid.id = 'menu-presets';
  presetsGrid.className = 'page-adapter-presets-grid';
  presetsSection.appendChild(presetsGrid);
  container.appendChild(presetsSection);

  const inputSection = document.createElement('section');
  inputSection.className = 'page-adapter-menu-section';
  const inputLabel = document.createElement('label');
  inputLabel.className = 'page-adapter-input-label';
  inputLabel.setAttribute('for', 'menu-request');
  inputLabel.textContent = t('popup.write_need');
  inputSection.appendChild(inputLabel);

  const textarea = document.createElement('textarea');
  textarea.id = 'menu-request';
  textarea.className = 'page-adapter-menu-textarea';
  textarea.rows = 5;
  textarea.placeholder = t('popup.placeholder');
  textarea.maxLength = MAX_REQUEST_LENGTH;
  inputSection.appendChild(textarea);

  const footer = document.createElement('div');
  footer.className = 'page-adapter-input-footer';
  const counter = document.createElement('span');
  counter.id = 'menu-counter';
  counter.className = 'page-adapter-counter';
  counter.textContent = t('popup.counter', { current: 0, max: MAX_REQUEST_LENGTH });
  footer.appendChild(counter);

  const adaptButton = document.createElement('button');
  adaptButton.id = 'menu-adapt';
  adaptButton.className = 'page-adapter-primary-button';
  adaptButton.type = 'button';
  adaptButton.textContent = t('popup.adapt_button');
  footer.appendChild(adaptButton);
  inputSection.appendChild(footer);
  container.appendChild(inputSection);

  const status = document.createElement('div');
  status.id = 'menu-status';
  status.className = 'page-adapter-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = getDefaultStatusMessage();
  container.appendChild(status);

  const prefsSection = document.createElement('section');
  prefsSection.className = 'page-adapter-menu-preferences';
  const langRow = createPreferenceRow('language-label', 'menu-language', t('popup.preferences.language'));
  prefsSection.appendChild(langRow);
  const themeRow = createPreferenceRow('theme-label', 'menu-theme', t('popup.preferences.theme'));
  prefsSection.appendChild(themeRow);
  container.appendChild(prefsSection);

  return container;
}

function createPreferenceRow(labelId, selectId, labelText) {
  const row = document.createElement('div');
  row.className = 'page-adapter-preference-row';

  const label = document.createElement('label');
  label.id = labelId;
  label.setAttribute('for', selectId);
  label.textContent = labelText;
  row.appendChild(label);

  const select = document.createElement('select');
  select.id = selectId;
  row.appendChild(select);

  return row;
}

// =============================================================================
// Rendering helpers
// =============================================================================

async function fetchSvgContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load SVG: ${url}`);
  }
  return response.text();
}

async function renderPresets(container) {
  container.innerHTML = '';

  for (const preset of PRESETS) {
    const iconUrl = chrome.runtime.getURL(preset.icon || '');
    let svgContent = '';

    try {
      svgContent = await fetchSvgContent(iconUrl);
    } catch {
      svgContent = `<span style="font-size:18px;">${preset.id[0].toUpperCase()}</span>`;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-adapter-preset-button';

    const labelKey = `preset.${preset.id}`;
    const labelText = t(labelKey);

    button.innerHTML = `
      <span class="page-adapter-preset-icon">${svgContent}</span>
      <span>${escapeHtml(labelText)}</span>
    `;

    button.addEventListener('click', () => {
      sendRequest(
        createUserRequest({
          mode: 'preset',
          request: preset.request,
          presetId: preset.id,
        })
      );
    });

    container.appendChild(button);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function updateSelectOptions(languageSelect, themeSelect) {
  const langOptions = languageSelect.querySelectorAll('option');
  langOptions.forEach((opt) => {
    const key = `popup.preferences.language_${opt.value}`;
    opt.textContent = t(key);
  });

  const themeOptions = themeSelect.querySelectorAll('option');
  themeOptions.forEach((opt) => {
    const key = `popup.preferences.theme_${opt.value}`;
    opt.textContent = t(key);
  });
}

function updatePopupTexts(container) {
  container.querySelector('#menu-title').textContent = t('popup.title');
  container.querySelector('#menu-subtitle').textContent = t('popup.subtitle');
  container.querySelector('.page-adapter-menu-section h2').textContent = t('popup.quick_actions');
  container.querySelector('.page-adapter-input-label').textContent = t('popup.write_need');
  const textarea = container.querySelector('#menu-request');
  textarea.placeholder = t('popup.placeholder');
  container.querySelector('#menu-adapt').textContent = t('popup.adapt_button');
  const rows = container.querySelectorAll('.page-adapter-preference-row label');
  rows[0].textContent = t('popup.preferences.language');
  rows[1].textContent = t('popup.preferences.theme');
}

// =============================================================================
// Request sending
// =============================================================================

async function sendRequest(message, statusElement) {
  setLoading(true);
  setStatus(statusElement, t('popup.status.sending'));

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (!response?.ok) {
      throw new Error(response?.error || t('popup.error.generic'));
    }

    setStatus(statusElement, t('popup.status.success'), 'success');
  } catch (error) {
    setStatus(statusElement, error.message || t('popup.error.generic'), 'error');
    setLoading(false);
  }
}

function setLoading(value, container) {
  const adaptButton = container.querySelector('#menu-adapt');
  adaptButton.disabled = value;

  const presetButtons = container.querySelectorAll('.page-adapter-preset-button');
  presetButtons.forEach((btn) => {
    btn.disabled = value;
  });
}

function setStatus(statusElement, message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `page-adapter-status ${type}`.trim();
}

// =============================================================================
// Menu initialization
// =============================================================================

async function initMenuUI(container, windowElement, floatingButton) {
  const prefs = await loadPreferences();
  applyTheme(prefs.theme);
  setLocale(prefs.locale);
  updateFloatingWindowTitle(windowElement);

  const presetsGrid = container.querySelector('#menu-presets');
  const textarea = container.querySelector('#menu-request');
  const counter = container.querySelector('#menu-counter');
  const adaptButton = container.querySelector('#menu-adapt');
  const statusElement = container.querySelector('#menu-status');
  const languageSelect = container.querySelector('#menu-language');
  const themeSelect = container.querySelector('#menu-theme');

  const langOptions = [
    { value: 'en', label: t('popup.preferences.language_en') },
    { value: 'es', label: t('popup.preferences.language_es') },
  ];
  const themeOptions = [
    { value: 'system', label: t('popup.preferences.theme_system') },
    { value: 'light', label: t('popup.preferences.theme_light') },
    { value: 'dark', label: t('popup.preferences.theme_dark') },
  ];

  languageSelect.innerHTML = langOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');
  themeSelect.innerHTML = themeOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');

  languageSelect.value = prefs.locale;
  themeSelect.value = prefs.theme;

  updatePopupTexts(container);
  await renderPresets(presetsGrid);

  function updateCounter() {
    const length = textarea.value.length;
    counter.textContent = t('popup.counter', { current: length, max: MAX_REQUEST_LENGTH });
  }
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  adaptButton.addEventListener('click', () => {
    const request = textarea.value.trim();
    if (!request) {
      setStatus(statusElement, t('popup.status.default'), 'error');
      textarea.focus();
      return;
    }
    sendRequest(
      createUserRequest({
        mode: 'natural_language',
        request,
      }),
      statusElement
    );
  });

  languageSelect.addEventListener('change', async (e) => {
    const locale = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.locale = locale;
    await savePreferences(newPrefs);
    setLocale(locale);
    updatePopupTexts(container);
    updateFloatingWindowTitle(windowElement);
    updateSelectOptions(languageSelect, themeSelect);
    await renderPresets(presetsGrid);
    setStatus(statusElement, getDefaultStatusMessage());

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SET_LOCALE,
          payload: { locale },
        });
      }
    } catch {
      // Ignore
    }
  });

  themeSelect.addEventListener('change', async (e) => {
    const theme = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.theme = theme;
    await savePreferences(newPrefs);
    applyTheme(theme);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SET_THEME,
          payload: { theme },
        });
      }
    } catch {
      // Ignore
    }
  });

  setStatus(statusElement, getDefaultStatusMessage());
}

// =============================================================================
// Window creation and management
// =============================================================================

export async function createMenuWindow(floatingButton) {
  if (activeWindow) {
    return;
  }

  try {
    const rect = floatingButton.getBoundingClientRect();

    const maxWidth = Math.min(800, window.innerWidth * 0.9);
    const maxHeight = 'none';

    // Load saved size and compute the actual dimensions that will be used,
    // applying the same limits as createFloatingWindow.
    const savedSize = await loadWindowSize();
    // console.debug('[Page Adapter] createMenuWindow: savedSize from storage', savedSize);

    const maxViewportWidth = window.innerWidth - 40;
    let actualWidth;
    if (savedSize && typeof savedSize.width === 'number' && savedSize.width >= 300) {
      actualWidth = Math.min(savedSize.width, maxViewportWidth, maxWidth);
    } else {
      actualWidth = Math.min(DEFAULT_WIDTH, maxViewportWidth);
    }

    const maxViewportHeight = window.innerHeight - 40;
    let actualHeight = null;
    if (savedSize && typeof savedSize.height === 'number' && savedSize.height >= 200) {
      actualHeight = Math.min(savedSize.height, maxViewportHeight);
    } else {
      actualHeight = Math.min(DEFAULT_HEIGHT, maxViewportHeight);
    }
    // If no saved height, actualHeight remains null (auto height).

    // console.debug('[Page Adapter] createMenuWindow: actualWidth=', actualWidth, 'actualHeight=', actualHeight);

    const buttonWidth = 60;
    const buttonCenterX = rect.left + rect.width / 2;
    const buttonCenterY = rect.top + rect.height / 2;

    // Offsets to align the close button's center with the floating button's center
    const closeButtonSize = 32;
    const halfClose = closeButtonSize / 2;
    const titleBarPaddingTop = 12;
    const titleBarPaddingRight = 16;

    let left = buttonCenterX - actualWidth + titleBarPaddingRight + halfClose;
    let top = buttonCenterY - titleBarPaddingTop - halfClose;

    // Clamp to viewport using the same dimensions that will be applied.
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - actualWidth - VIEWPORT_MARGIN)
    );
    top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, window.innerHeight - actualHeight - VIEWPORT_MARGIN)
    );

    activeFloatingButton = floatingButton;
    floatingButton.style.display = 'none';

    const moveOffsetX = actualWidth - buttonWidth;
    const moveOffsetY = 0;

    const windowElement = createFloatingWindow(
      t('popup.title'),
      '',
      false,
      maxWidth,
      maxHeight,
      '',
      '',
      left,
      top,
      floatingButton,
      moveOffsetX,
      moveOffsetY,
      actualWidth,
      actualHeight
    );

    if (!windowElement) {
      // console.debug('[Page Adapter] createMenuWindow: windowElement is null');
      throw new Error('createFloatingWindow returned null or undefined');
    }

    document.body.appendChild(windowElement);

    // Re-clamp using measured dimensions in case runtime styles differ
    // from the pre-computed size.
    clampMenuWindowPosition(windowElement);
    syncFloatingButtonWithWindow(windowElement, floatingButton);

    // Hide the original close button
    const existingCloseButton = windowElement.querySelector('.page-adapter-close');
    if (existingCloseButton) {
      existingCloseButton.style.display = 'none';
    }

    // Create custom close button with power icon
    const titleBar = windowElement.querySelector('.page-adapter-title-bar');
    if (!titleBar) {
      throw new Error('Title bar not found');
    }

    const newCloseButton = document.createElement('button');
    newCloseButton.className = 'page-adapter-close';
    newCloseButton.setAttribute('aria-label', 'Close menu');
    newCloseButton.innerHTML = POWER_SVG;
    newCloseButton.style.width = '32px';
    newCloseButton.style.height = '32px';
    newCloseButton.style.fontSize = '0';
    newCloseButton.addEventListener('click', () => {
      // console.debug('[Page Adapter] createMenuWindow: close button clicked');
      closeMenuWindow();
    });

    titleBar.appendChild(newCloseButton);

    // Build menu content
    const contentArea = windowElement.querySelector('.page-adapter-content-area');
    if (!contentArea) {
      throw new Error('Content area not found');
    }
    contentArea.innerHTML = '';
    const menuContainer = buildMenuContent();
    contentArea.appendChild(menuContainer);

    await initMenuUI(menuContainer, windowElement, floatingButton);

    activeWindow = windowElement;
    // console.debug('[Page Adapter] createMenuWindow: window created and active');
  } catch (error) {
    console.error('[Page Adapter] Failed to create menu window:', error);
    if (floatingButton) {
      floatingButton.style.display = '';
    }
    activeFloatingButton = null;
    activeWindow = null;
  }
}

export function closeMenuWindow() {
  // console.debug('[Page Adapter] closeMenuWindow called');
  if (activeWindow) {
    // Save the current size before closing
    const rect = activeWindow.getBoundingClientRect();
    // console.debug('[Page Adapter] closeMenuWindow: saving size', { width: rect.width, height: rect.height });
    saveWindowSize(rect.width, rect.height);

    if (activeFloatingButton) {
      syncFloatingButtonWithWindow(activeWindow, activeFloatingButton);
      const rectBtn = activeFloatingButton.getBoundingClientRect();
      // console.debug('[Page Adapter] closeMenuWindow: saving button position', { left: rectBtn.left, top: rectBtn.top });
      saveButtonPosition(rectBtn.left, rectBtn.top);
      activeFloatingButton.style.display = '';
      activeFloatingButton = null;
    }
    activeWindow.remove();
    activeWindow = null;
    // console.debug('[Page Adapter] closeMenuWindow: window closed');
  }
}