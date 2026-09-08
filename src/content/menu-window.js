/**
 * @fileoverview Creates and manages the floating menu window.
 * Replaces the browser popup with a draggable, resizable panel.
 * Dependencies: floating-ui.js, locale.js, constants.js, messages.js, preferences.js.
 * Used by: floating-button.js.
 */

import { createFloatingWindow, loadWindowSize, saveWindowSize } from './floating-ui.js';
import { t, setLocale } from '../shared/locale.js';
import { PRESETS, MESSAGE_TYPES } from '../shared/constants.js';
import { createUserRequest } from '../shared/messages.js';
import { saveButtonPosition } from './floating-button.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../shared/preferences.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUEST_LENGTH = 2000;

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 550;

const VIEWPORT_MARGIN = 10;
const BUTTON_SYNC_MARGIN = 20;
const DEFAULT_BUTTON_SIZE = 60;

// =============================================================================
// State (per shadow root)
// =============================================================================

let activeWindow = null;
let activeFloatingButton = null;

// =============================================================================
// Preferences helpers (applied to host)
// =============================================================================

function applyThemeToHost(theme, host) {
  host.classList.remove('page-adapter-theme-dark', 'page-adapter-theme-light');
  if (theme === 'dark') {
    host.classList.add('page-adapter-theme-dark');
  } else if (theme === 'light') {
    host.classList.add('page-adapter-theme-light');
  }
}

function applyHighContrastToHost(enabled, host) {
  host.classList.toggle('page-adapter-high-contrast', enabled);
}

function applySimplifiedUiToHost(enabled, host) {
  host.classList.toggle('page-adapter-simplified', enabled);
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

function updateFloatingWindowTitle(windowElement) {
  const titleElement = windowElement?.querySelector('.page-adapter-title-text');
  if (titleElement) {
    titleElement.textContent = t('popup.title');
  }
}

// =============================================================================
// DOM building (unchanged)
// =============================================================================

function buildMenuContent() {
  const container = document.createElement('div');
  container.className = 'page-adapter-menu-container';

  const subtitle = document.createElement('p');
  subtitle.className = 'page-adapter-menu-subtitle';
  subtitle.textContent = t('popup.subtitle');
  container.appendChild(subtitle);

  const settingsPanel = document.createElement('section');
  settingsPanel.id = 'menu-settings-panel';
  settingsPanel.className = 'page-adapter-settings-panel';
  settingsPanel.hidden = true;
  settingsPanel.innerHTML = `
    <div class="page-adapter-settings-grid">
      <div class="page-adapter-preference-row">
        <label id="language-label" for="menu-language">${t('popup.preferences.language')}</label>
        <select id="menu-language"></select>
      </div>
      <div class="page-adapter-preference-row">
        <label id="theme-label" for="menu-theme">${t('popup.preferences.theme')}</label>
        <select id="menu-theme"></select>
      </div>
      <div class="page-adapter-preference-row page-adapter-model-row">
        <label id="model-label" for="menu-ollama-model">${t('popup.preferences.ollama_model')}</label>
        <input id="menu-ollama-model" type="text" spellcheck="false" autocomplete="off" />
      </div>
      <label class="page-adapter-toggle-row" for="menu-high-contrast">
        <span>${t('popup.preferences.high_contrast')}</span>
        <input id="menu-high-contrast" type="checkbox" />
      </label>
      <label class="page-adapter-toggle-row" for="menu-simplified-ui">
        <span>${t('popup.preferences.simplified_ui')}</span>
        <input id="menu-simplified-ui" type="checkbox" />
      </label>
    </div>
  `;
  container.appendChild(settingsPanel);

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

  return container;
}

// =============================================================================
// Rendering helpers (unchanged)
// =============================================================================

async function fetchSvgContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load SVG: ${url}`);
  }
  return response.text();
}

async function renderPresets(container, statusElement) {
  container.innerHTML = '';
  const menuContainer = statusElement?.closest('.page-adapter-menu-container') || container.closest('.page-adapter-menu-container');

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
        }),
        statusElement,
        menuContainer
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

function updatePopupTexts(container) {
  container.querySelector('.page-adapter-menu-subtitle').textContent = t('popup.subtitle');
  container.querySelector('.page-adapter-menu-section h2').textContent = t('popup.quick_actions');
  container.querySelector('.page-adapter-input-label').textContent = t('popup.write_need');
  const textarea = container.querySelector('#menu-request');
  textarea.placeholder = t('popup.placeholder');
  container.querySelector('#menu-adapt').textContent = t('popup.adapt_button');
  container.querySelector('#language-label').textContent = t('popup.preferences.language');
  container.querySelector('#theme-label').textContent = t('popup.preferences.theme');
  container.querySelector('#model-label').textContent = t('popup.preferences.ollama_model');
  container.querySelector('#menu-high-contrast').closest('.page-adapter-toggle-row').querySelector('span').textContent = t('popup.preferences.high_contrast');
  container.querySelector('#menu-simplified-ui').closest('.page-adapter-toggle-row').querySelector('span').textContent = t('popup.preferences.simplified_ui');
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

// =============================================================================
// Request sending (unchanged)
// =============================================================================

async function sendRequest(message, statusElement, container) {
  setLoading(true, container || statusElement?.closest('.page-adapter-menu-container'));
  setStatus(statusElement, t('popup.status.sending'));

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (!response?.ok) {
      throw new Error(response?.error || t('popup.error.generic'));
    }

    setStatus(statusElement, t('popup.status.success'), 'success');
  } catch (error) {
    setStatus(statusElement, error.message || t('popup.error.generic'), 'error');
    setLoading(false, container || statusElement?.closest('.page-adapter-menu-container'));
  }
}

function setLoading(value, container) {
  if (!container) {
    return;
  }

  const adaptButton = container.querySelector('#menu-adapt');
  if (adaptButton) {
    adaptButton.disabled = value;
  }

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

async function initMenuUI(container, windowElement, floatingButton, settingsButton, shadowRoot) {
  const prefs = await loadPreferences();
  const host = shadowRoot.host;
  applyThemeToHost(prefs.theme, host);
  applyHighContrastToHost(prefs.highContrast, host);
  applySimplifiedUiToHost(prefs.simplifiedUi, host);
  setLocale(prefs.locale);
  updateFloatingWindowTitle(windowElement);

  const presetsGrid = container.querySelector('#menu-presets');
  const textarea = container.querySelector('#menu-request');
  const counter = container.querySelector('#menu-counter');
  const adaptButton = container.querySelector('#menu-adapt');
  const statusElement = container.querySelector('#menu-status');
  const languageSelect = container.querySelector('#menu-language');
  const themeSelect = container.querySelector('#menu-theme');
  const modelInput = container.querySelector('#menu-ollama-model');
  const highContrastToggle = container.querySelector('#menu-high-contrast');
  const simplifiedToggle = container.querySelector('#menu-simplified-ui');
  const settingsPanel = container.querySelector('#menu-settings-panel');

  // Configure language and theme options
  const langOptions = [
    { value: 'system', label: t('popup.preferences.language_system') },
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
  modelInput.value = prefs.ollamaModel || DEFAULT_PREFERENCES.ollamaModel;
  highContrastToggle.checked = prefs.highContrast;
  simplifiedToggle.checked = prefs.simplifiedUi;

  updatePopupTexts(container);
  updateSelectOptions(languageSelect, themeSelect);
  await renderPresets(presetsGrid, statusElement);

  function closeSettingsPanel() {
    settingsPanel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
  }

  function toggleSettingsPanel() {
    const nextHidden = !settingsPanel.hidden;
    settingsPanel.hidden = nextHidden;
    settingsButton.setAttribute('aria-expanded', String(!nextHidden));
  }

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
      statusElement,
      container
    );
  });

  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSettingsPanel();
  });

  const handleDocumentClick = (event) => {
    const path = event.composedPath ? event.composedPath() : [event.target];

    const isInsideSettingsPanel = path.some(el => el === settingsPanel || settingsPanel.contains?.(el));
    const isInsideToggle = path.some(el => el === settingsButton || settingsButton.contains?.(el));
    const isInsideContainer = path.some(el => el === container || container.contains?.(el));

    if (isInsideSettingsPanel || isInsideToggle) {
      return;
    }

    if (!isInsideContainer) {
      closeSettingsPanel();
      return;
    }

    if (!settingsPanel.hidden && !isInsideSettingsPanel && !isInsideToggle) {
      closeSettingsPanel();
    }
  };

  document.addEventListener('click', handleDocumentClick);
  windowElement._pageAdapterSettingsDocHandler = handleDocumentClick;

  // Language change
  languageSelect.addEventListener('change', async (e) => {
    const locale = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.locale = locale;
    await savePreferences(newPrefs);
    setLocale(locale);
    updatePopupTexts(container);
    updateFloatingWindowTitle(windowElement);
    updateSelectOptions(languageSelect, themeSelect);
    await renderPresets(presetsGrid, statusElement);
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

  // Theme change
  themeSelect.addEventListener('change', async (e) => {
    const theme = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.theme = theme;
    await savePreferences(newPrefs);
    applyThemeToHost(theme, shadowRoot.host);

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

  // Model input
  modelInput.addEventListener('change', async (e) => {
    const ollamaModel = e.target.value.trim() || DEFAULT_PREFERENCES.ollamaModel;
    const newPrefs = await loadPreferences();
    newPrefs.ollamaModel = ollamaModel;
    await savePreferences(newPrefs);
  });

  // High contrast toggle
  highContrastToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    const newPrefs = await loadPreferences();
    newPrefs.highContrast = enabled;
    await savePreferences(newPrefs);
    applyHighContrastToHost(enabled, shadowRoot.host);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SET_HIGH_CONTRAST,
          payload: { enabled },
        });
      }
    } catch {
      // Ignore
    }
  });

  // Simplified UI toggle
  simplifiedToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    const newPrefs = await loadPreferences();
    newPrefs.simplifiedUi = enabled;
    await savePreferences(newPrefs);
    applySimplifiedUiToHost(enabled, shadowRoot.host);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SET_SIMPLIFIED_UI,
          payload: { enabled },
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

export async function createMenuWindow(floatingButton, shadowRoot) {
  if (activeWindow) {
    return;
  }

  try {
    const rect = floatingButton.getBoundingClientRect();

    const maxWidth = Math.min(800, window.innerWidth * 0.9);
    const maxHeight = 'none';

    const savedSize = await loadWindowSize();
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

    const buttonWidth = 60;
    const buttonCenterX = rect.left + rect.width / 2;
    const buttonCenterY = rect.top + rect.height / 2;

    const closeButtonSize = 40;
    const halfClose = closeButtonSize / 2;
    const titleBarPaddingTop = 12;
    const titleBarPaddingRight = 16;

    let left = buttonCenterX - actualWidth + titleBarPaddingRight + halfClose;
    let top = buttonCenterY - titleBarPaddingTop - halfClose;

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
      actualHeight,
      shadowRoot
    );

    if (!windowElement) {
      throw new Error('createFloatingWindow returned null or undefined');
    }

    shadowRoot.appendChild(windowElement);

    clampMenuWindowPosition(windowElement);

    // Rebuild the title bar with our custom buttons
    const titleBar = windowElement.querySelector('.page-adapter-title-bar');
    if (!titleBar) {
      throw new Error('Title bar not found');
    }

    titleBar.innerHTML = '';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'page-adapter-title-text';
    titleSpan.textContent = t('popup.title');
    titleBar.appendChild(titleSpan);

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'menu-settings-toggle';
    settingsBtn.className = 'page-adapter-settings-toggle';
    settingsBtn.setAttribute('aria-expanded', 'false');
    settingsBtn.setAttribute('aria-controls', 'menu-settings-panel');
    settingsBtn.setAttribute('aria-label', t('popup.preferences.settings'));
    settingsBtn.title = t('popup.preferences.settings');
    settingsBtn.type = 'button';

    const settingsIconUrl = chrome.runtime.getURL('src/assets/icons/settings.svg');
    try {
      const svg = await fetchSvgContent(settingsIconUrl);
      settingsBtn.innerHTML = svg;
    } catch {
      settingsBtn.textContent = '⚙';
    }

    titleBar.appendChild(settingsBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'page-adapter-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.type = 'button';

    const powerIconUrl = chrome.runtime.getURL('src/assets/icons/accessibility.svg');
    try {
      const svg = await fetchSvgContent(powerIconUrl);
      closeBtn.innerHTML = svg;
    } catch {
      closeBtn.textContent = '⏻';
    }

    closeBtn.addEventListener('click', () => {
      closeMenuWindow();
    });

    titleBar.appendChild(closeBtn);

    const contentArea = windowElement.querySelector('.page-adapter-content-area');
    if (!contentArea) {
      throw new Error('Content area not found');
    }
    contentArea.innerHTML = '';
    const menuContainer = buildMenuContent();
    contentArea.appendChild(menuContainer);

    await initMenuUI(menuContainer, windowElement, floatingButton, settingsBtn, shadowRoot);

    activeWindow = windowElement;
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
  if (activeWindow) {
    const rect = activeWindow.getBoundingClientRect();
    saveWindowSize(rect.width, rect.height);

    if (activeFloatingButton) {
      const closeBtn = activeWindow.querySelector('.page-adapter-close');
      if (closeBtn) {
        const closeRect = closeBtn.getBoundingClientRect();
        const btnRect = activeFloatingButton.getBoundingClientRect();
        const w = btnRect.width || 60;
        const h = btnRect.height || 60;
        const left = closeRect.left + closeRect.width / 2 - w / 2;
        const top = closeRect.top + closeRect.height / 2 - h / 2;

        const margin = 20;
        const maxLeft = window.innerWidth - w - margin;
        const maxTop = window.innerHeight - h - margin;
        const clampedLeft = Math.max(margin, Math.min(left, maxLeft));
        const clampedTop = Math.max(margin, Math.min(top, maxTop));

        activeFloatingButton.style.left = `${clampedLeft}px`;
        activeFloatingButton.style.top = `${clampedTop}px`;
        activeFloatingButton.style.transform = 'none';
        saveButtonPosition(clampedLeft, clampedTop);
      } else {
        const btnRect = activeFloatingButton.getBoundingClientRect();
        const w = btnRect.width || 60;
        const h = btnRect.height || 60;
        const left = rect.left + rect.width - w - 20;
        const top = rect.top + 20;
        activeFloatingButton.style.left = `${left}px`;
        activeFloatingButton.style.top = `${top}px`;
        activeFloatingButton.style.transform = 'none';
        saveButtonPosition(left, top);
      }

      activeFloatingButton.style.display = '';
      activeFloatingButton = null;
    }

    if (activeWindow._pageAdapterSettingsDocHandler) {
      document.removeEventListener('click', activeWindow._pageAdapterSettingsDocHandler);
      activeWindow._pageAdapterSettingsDocHandler = null;
    }

    activeWindow.remove();
    activeWindow = null;
  }
}