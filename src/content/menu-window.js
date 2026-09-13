/**
 * @fileoverview Creates and manages the floating menu window with main and chat views.
 * Dependencies: floating-ui.js, locale.js, constants.js, messages.js, preferences.js,
 *               marked-loader.js.
 * Used by: floating-button.js.
 */

import { createFloatingWindow, loadWindowSize, saveWindowSize } from './floating-ui.js';
import { t, setLocale } from '../shared/locale.js';
import { PRESETS, MESSAGE_TYPES } from '../shared/constants.js';
import { createUserRequest } from '../shared/messages.js';
import { saveButtonPosition } from './floating-button.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../shared/preferences.js';
import { loadMarked, renderMarkdown } from './marked-loader.js';

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUEST_LENGTH = 2000;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 550;
const VIEWPORT_MARGIN = 10;
const DEFAULT_BUTTON_SIZE = 60;
const TRANSIENT_STATUS_TIMEOUT_MS = 4000;
const CHAT_PRESET_ID = 'summarize';

// =============================================================================
// State
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// =============================================================================
// DOM building – Main view
// =============================================================================

/**
 * Builds the main view of the menu window.
 *
 * @returns {Promise<HTMLElement>} The main view container.
 */
async function buildMainView() {
  const container = document.createElement('div');
  container.className = 'page-adapter-main-view';
  container.style.display = 'block';

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
  inputSection.className = 'page-adapter-menu-section page-adapter-input-section';
  const inputLabel = document.createElement('label');
  inputLabel.className = 'page-adapter-input-label';
  inputLabel.setAttribute('for', 'menu-request');
  inputLabel.textContent = t('popup.write_need');
  inputSection.appendChild(inputLabel);

  // The textarea and the send button share a relatively positioned wrapper
  // so the button can be absolutely placed in the textarea's bottom-right
  // corner. The textarea keeps additional bottom/right padding so text never
  // runs underneath the button.
  const textareaWrapper = document.createElement('div');
  textareaWrapper.className = 'page-adapter-textarea-wrapper';

  const textarea = document.createElement('textarea');
  textarea.id = 'menu-request';
  textarea.className = 'page-adapter-menu-textarea';
  textarea.rows = 5;
  textarea.placeholder = t('popup.placeholder');
  textarea.maxLength = MAX_REQUEST_LENGTH;
  textareaWrapper.appendChild(textarea);

  const adaptButton = document.createElement('button');
  adaptButton.id = 'menu-adapt';
  adaptButton.className = 'page-adapter-send-button';
  adaptButton.type = 'button';
  adaptButton.setAttribute('aria-label', t('popup.adapt_button'));
  adaptButton.setAttribute('title', t('popup.adapt_button'));

  const adaptIconUrl = chrome.runtime.getURL('src/assets/icons/arrow-up.svg');
  try {
    const svg = await fetchSvgContent(adaptIconUrl);
    adaptButton.innerHTML = svg;
  } catch {
    // Fallback if the SVG asset cannot be loaded.
    adaptButton.textContent = '↑';
  }
  textareaWrapper.appendChild(adaptButton);

  inputSection.appendChild(textareaWrapper);

  const footer = document.createElement('div');
  footer.className = 'page-adapter-input-footer';

  const counter = document.createElement('span');
  counter.id = 'menu-counter';
  counter.className = 'page-adapter-counter';
  counter.textContent = t('popup.counter', { current: 0, max: MAX_REQUEST_LENGTH });
  footer.appendChild(counter);

  const cancelButton = document.createElement('button');
  cancelButton.id = 'menu-cancel';
  cancelButton.className = 'page-adapter-cancel-button';
  cancelButton.type = 'button';
  cancelButton.textContent = t('popup.cancel_button');
  cancelButton.hidden = true;
  footer.appendChild(cancelButton);

  inputSection.appendChild(footer);
  container.appendChild(inputSection);

  return container;
}

// =============================================================================
// DOM building – Chat view
// =============================================================================

function buildChatView() {
  const container = document.createElement('div');
  container.className = 'page-adapter-chat-view';
  container.style.display = 'none';

  const messagesContainer = document.createElement('div');
  messagesContainer.id = 'chat-messages';
  messagesContainer.className = 'page-adapter-chat-messages';
  container.appendChild(messagesContainer);

  const inputArea = document.createElement('div');
  inputArea.className = 'page-adapter-chat-input-area';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'chat-input';
  input.className = 'page-adapter-chat-input';
  input.placeholder = t('chat.input_placeholder');
  input.disabled = true;

  const cancelButton = document.createElement('button');
  cancelButton.id = 'chat-cancel';
  cancelButton.className = 'page-adapter-cancel-button';
  cancelButton.type = 'button';
  cancelButton.textContent = t('popup.cancel_button');
  cancelButton.hidden = true;

  const sendButton = document.createElement('button');
  sendButton.id = 'chat-send';
  sendButton.className = 'page-adapter-chat-send';
  sendButton.textContent = t('chat.send_button');
  sendButton.disabled = true;

  inputArea.append(input, cancelButton, sendButton);
  container.appendChild(inputArea);

  return container;
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

async function renderPresets(container, onPresetClick) {
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
    button.dataset.presetId = preset.id;
    const labelKey = `preset.${preset.id}`;
    const labelText = t(labelKey);
    button.innerHTML = `
      <span class="page-adapter-preset-icon">${svgContent}</span>
      <span>${escapeHtml(labelText)}</span>
    `;
    button.addEventListener('click', () => {
      onPresetClick(preset);
    });
    container.appendChild(button);
  }
}

function updatePopupTexts(container) {
  const mainView = container.querySelector('.page-adapter-main-view');
  if (mainView) {
    const subtitle = mainView.querySelector('.page-adapter-menu-subtitle');
    if (subtitle) subtitle.textContent = t('popup.subtitle');
    const sectionTitle = mainView.querySelector('.page-adapter-menu-section h2');
    if (sectionTitle) sectionTitle.textContent = t('popup.quick_actions');
    const inputLabel = mainView.querySelector('.page-adapter-input-label');
    if (inputLabel) inputLabel.textContent = t('popup.write_need');
    const textarea = mainView.querySelector('#menu-request');
    if (textarea) textarea.placeholder = t('popup.placeholder');
    const adaptButton = mainView.querySelector('#menu-adapt');
    if (adaptButton) {
      adaptButton.setAttribute('aria-label', t('popup.adapt_button'));
      adaptButton.setAttribute('title', t('popup.adapt_button'));
    }
    const cancelButton = mainView.querySelector('#menu-cancel');
    if (cancelButton) cancelButton.textContent = t('popup.cancel_button');
    const langLabel = mainView.querySelector('#language-label');
    if (langLabel) langLabel.textContent = t('popup.preferences.language');
    const themeLabel = mainView.querySelector('#theme-label');
    if (themeLabel) themeLabel.textContent = t('popup.preferences.theme');
    const modelLabel = mainView.querySelector('#model-label');
    if (modelLabel) modelLabel.textContent = t('popup.preferences.ollama_model');
    const highContrastLabel = mainView
      .querySelector('#menu-high-contrast')
      ?.closest('.page-adapter-toggle-row')
      ?.querySelector('span');
    if (highContrastLabel) highContrastLabel.textContent = t('popup.preferences.high_contrast');
    const simplifiedLabel = mainView
      .querySelector('#menu-simplified-ui')
      ?.closest('.page-adapter-toggle-row')
      ?.querySelector('span');
    if (simplifiedLabel) simplifiedLabel.textContent = t('popup.preferences.simplified_ui');
  }
  const chatInput = container.querySelector('#chat-input');
  if (chatInput) chatInput.placeholder = t('chat.input_placeholder');
  const chatSend = container.querySelector('#chat-send');
  if (chatSend) chatSend.textContent = t('chat.send_button');
  const chatCancel = container.querySelector('#chat-cancel');
  if (chatCancel) chatCancel.textContent = t('popup.cancel_button');
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
// Chat helpers
// =============================================================================

function addChatMessage(container, role, text) {
  const messagesContainer = container.querySelector('#chat-messages');
  if (!messagesContainer) return;

  const messageElement = document.createElement('div');
  messageElement.className = `page-adapter-chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble';

  if (role === 'assistant') {
    loadMarked()
      .then(() => {
        bubble.innerHTML = renderMarkdown(text);
      })
      .catch(() => {
        bubble.textContent = text;
      });
  } else {
    bubble.textContent = text;
  }

  messageElement.appendChild(bubble);
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeThinkingIndicator(container) {
  const messagesContainer = container.querySelector('#chat-messages');
  if (!messagesContainer) return;
  const thinking = messagesContainer.querySelector('.page-adapter-thinking-indicator');
  if (thinking) thinking.remove();
}

function showThinkingIndicator(
  container,
  phases = ['AI is thinking…', 'Processing request…', 'Generating response…']
) {
  const messagesContainer = container.querySelector('#chat-messages');
  if (!messagesContainer) return;

  removeThinkingIndicator(container);

  const wrapper = document.createElement('div');
  wrapper.className = 'page-adapter-chat-message assistant page-adapter-thinking-indicator';

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble la-05__bubble';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.setAttribute('aria-label', 'Assistant is generating a response');

  const tail = document.createElement('span');
  tail.className = 'la-05__tail';
  tail.setAttribute('aria-hidden', 'true');
  bubble.appendChild(tail);

  const dots = document.createElement('span');
  dots.className = 'la-05__dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('i');
    dot.className = 'la-05__dot';
    dots.appendChild(dot);
  }
  bubble.appendChild(dots);

  const phase = document.createElement('p');
  phase.className = 'la-05__phase';
  phase.textContent = phases[0] || 'AI is thinking…';
  bubble.appendChild(phase);

  const answer = document.createElement('div');
  answer.className = 'la-05__answer';
  answer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('i');
    answer.appendChild(bar);
  }
  bubble.appendChild(answer);

  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  let phaseIndex = 0;
  const phaseInterval = setInterval(() => {
    if (!wrapper.isConnected) {
      clearInterval(phaseInterval);
      return;
    }
    phaseIndex = (phaseIndex + 1) % phases.length;
    phase.textContent = phases[phaseIndex];
  }, 1900);

  wrapper._phaseInterval = phaseInterval;

  return wrapper;
}

function setChatLoading(container, loading, phases) {
  const input = container.querySelector('#chat-input');
  const sendButton = container.querySelector('#chat-send');
  const cancelButton = container.querySelector('#chat-cancel');

  if (loading) {
    showThinkingIndicator(container, phases);
    if (input) input.disabled = true;
    if (sendButton) sendButton.disabled = true;
    if (cancelButton) cancelButton.hidden = false;
  } else {
    removeThinkingIndicator(container);
    if (input) input.disabled = false;
    if (sendButton) sendButton.disabled = false;
    if (cancelButton) cancelButton.hidden = true;
  }
}

// =============================================================================
// Preset loading + transient status
// =============================================================================

function setPresetLoading(container, presetId, loading) {
  const presetButtons = container.querySelectorAll('.page-adapter-preset-button');
  const adaptButton = container.querySelector('#menu-adapt');
  const cancelButton = container.querySelector('#menu-cancel');
  const textarea = container.querySelector('#menu-request');

  presetButtons.forEach((btn) => {
    const isActive = btn.dataset.presetId === presetId;
    btn.disabled = loading;
    if (loading && isActive) {
      btn.classList.add('page-adapter-preset-button--active');
    } else {
      btn.classList.remove('page-adapter-preset-button--active');
    }
  });

  if (adaptButton) adaptButton.disabled = loading;
  if (textarea) textarea.disabled = loading;
  if (cancelButton) cancelButton.hidden = !loading;
}

function showTransientStatus(container, text, type = 'success') {
  const existing = container.querySelector('.page-adapter-transient-status');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `page-adapter-transient-status page-adapter-transient-status--${type}`;
  el.textContent = text;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  container.appendChild(el);

  setTimeout(() => {
    if (el.isConnected) el.remove();
  }, TRANSIENT_STATUS_TIMEOUT_MS);
}

// =============================================================================
// Request sending + cancellation
// =============================================================================

function cancelCurrentRequest(container) {
  const state = container._requestState;
  if (!state) return;
  state.cancelled = true;
  container._requestState = null;

  removeThinkingIndicator(container);
  setChatLoading(container, false);

  const presetButtons = container.querySelectorAll('.page-adapter-preset-button');
  presetButtons.forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove('page-adapter-preset-button--active');
  });
  const adaptButton = container.querySelector('#menu-adapt');
  const cancelButtonMain = container.querySelector('#menu-cancel');
  const textarea = container.querySelector('#menu-request');
  if (adaptButton) adaptButton.disabled = false;
  if (textarea) textarea.disabled = false;
  if (cancelButtonMain) cancelButtonMain.hidden = true;
}

async function sendRequest(message, container, { navigateToChat = false, presetId = null } = {}) {
  cancelCurrentRequest(container);

  const requestState = { cancelled: false, presetId: presetId || null };
  container._requestState = requestState;

  if (navigateToChat) {
    showChatView(container);
    addChatMessage(container, 'user', message.payload.request);
    setChatLoading(container, true, [
      'AI is thinking…',
      'Processing your request…',
      'Analyzing the page…',
      'Preparing response…',
    ]);
  } else {
    setPresetLoading(container, presetId, true);
  }

  try {
    const response = await chrome.runtime.sendMessage(message);
    if (requestState.cancelled) return;

    if (navigateToChat) {
      setChatLoading(container, false);
      if (!response?.ok) {
        throw new Error(response?.error || t('popup.error.generic'));
      }
      const responseText = response.responseText || t('popup.status.success');
      addChatMessage(container, 'assistant', responseText);
      const chatInput = container.querySelector('#chat-input');
      if (chatInput) chatInput.focus();
    } else {
      setPresetLoading(container, presetId, false);
      if (!response?.ok) {
        throw new Error(response?.error || t('popup.error.generic'));
      }
      const responseText = response.responseText || t('popup.status.success');
      showTransientStatus(container, responseText, 'success');
    }
  } catch (error) {
    if (requestState.cancelled) return;
    if (navigateToChat) {
      setChatLoading(container, false);
      addChatMessage(container, 'assistant', `Error: ${error.message || t('popup.error.generic')}`);
    } else {
      setPresetLoading(container, presetId, false);
      showTransientStatus(container, error.message || t('popup.error.generic'), 'error');
    }
  } finally {
    if (container._requestState === requestState) {
      container._requestState = null;
    }
  }
}

// =============================================================================
// View switching
// =============================================================================

function showMainView(container) {
  const mainView = container.querySelector('.page-adapter-main-view');
  const chatView = container.querySelector('.page-adapter-chat-view');
  const backButton = container
    .closest('.page-adapter-floating-window')
    ?.querySelector('.page-adapter-back-button');
  if (mainView) mainView.style.display = 'block';
  if (chatView) chatView.style.display = 'none';
  if (backButton) backButton.style.display = 'none';
  removeThinkingIndicator(container);
}

function showChatView(container) {
  const mainView = container.querySelector('.page-adapter-main-view');
  const chatView = container.querySelector('.page-adapter-chat-view');
  const backButton = container
    .closest('.page-adapter-floating-window')
    ?.querySelector('.page-adapter-back-button');
  if (mainView) mainView.style.display = 'none';
  if (chatView) chatView.style.display = 'flex';
  if (backButton) backButton.style.display = 'flex';
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

  const mainView = container.querySelector('.page-adapter-main-view');
  const chatView = container.querySelector('.page-adapter-chat-view');
  const presetsGrid = mainView.querySelector('#menu-presets');
  const textarea = mainView.querySelector('#menu-request');
  const counter = mainView.querySelector('#menu-counter');
  const adaptButton = mainView.querySelector('#menu-adapt');
  const cancelButtonMain = mainView.querySelector('#menu-cancel');
  const languageSelect = mainView.querySelector('#menu-language');
  const themeSelect = mainView.querySelector('#menu-theme');
  const modelInput = mainView.querySelector('#menu-ollama-model');
  const highContrastToggle = mainView.querySelector('#menu-high-contrast');
  const simplifiedToggle = mainView.querySelector('#menu-simplified-ui');
  const settingsPanel = mainView.querySelector('#menu-settings-panel');

  const chatInput = chatView.querySelector('#chat-input');
  const chatSend = chatView.querySelector('#chat-send');
  const chatCancel = chatView.querySelector('#chat-cancel');

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

  const onPresetClick = (preset) => {
    const message = createUserRequest({
      mode: 'preset',
      request: preset.request,
      presetId: preset.id,
    });
    const navigateToChat = preset.id === CHAT_PRESET_ID;
    sendRequest(message, container, { navigateToChat, presetId: preset.id });
  };

  await renderPresets(presetsGrid, onPresetClick);

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

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      adaptButton.click();
    }
  });

  adaptButton.addEventListener('click', () => {
    const request = textarea.value.trim();
    if (!request) {
      textarea.focus();
      return;
    }
    const message = createUserRequest({
      mode: 'natural_language',
      request,
    });
    sendRequest(message, container, { navigateToChat: true });
  });

  cancelButtonMain.addEventListener('click', () => {
    cancelCurrentRequest(container);
  });

  chatCancel.addEventListener('click', () => {
    cancelCurrentRequest(container);
  });

  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSettingsPanel();
  });

  const handleDocumentClick = (event) => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    const isInsideSettingsPanel = path.some(
      (el) => el === settingsPanel || settingsPanel.contains?.(el)
    );
    const isInsideToggle = path.some(
      (el) => el === settingsButton || settingsButton.contains?.(el)
    );
    const isInsideContainer = path.some((el) => el === container || container.contains?.(el));

    if (isInsideSettingsPanel || isInsideToggle) return;
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

  languageSelect.addEventListener('change', async (e) => {
    const locale = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.locale = locale;
    await savePreferences(newPrefs);
    setLocale(locale);
    updatePopupTexts(container);
    updateFloatingWindowTitle(windowElement);
    updateSelectOptions(languageSelect, themeSelect);
    await renderPresets(presetsGrid, onPresetClick);
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

  modelInput.addEventListener('change', async (e) => {
    const ollamaModel = e.target.value.trim() || DEFAULT_PREFERENCES.ollamaModel;
    const newPrefs = await loadPreferences();
    newPrefs.ollamaModel = ollamaModel;
    await savePreferences(newPrefs);
  });

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

  async function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;
    const message = createUserRequest({
      mode: 'natural_language',
      request: text,
    });
    chatInput.value = '';
    sendRequest(message, container, { navigateToChat: true });
  }

  chatSend.addEventListener('click', handleChatSend);
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSend();
    }
  });

  showMainView(container);
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

    const titleBar = windowElement.querySelector('.page-adapter-title-bar');
    if (!titleBar) {
      throw new Error('Title bar not found');
    }
    titleBar.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'page-adapter-back-button';
    backBtn.setAttribute('aria-label', 'Back to main view');
    backBtn.title = 'Back';
    backBtn.type = 'button';
    backBtn.style.display = 'none';
    const backIconUrl = chrome.runtime.getURL('src/assets/icons/arrow-left.svg');
    try {
      const svg = await fetchSvgContent(backIconUrl);
      backBtn.innerHTML = svg;
    } catch {
      backBtn.textContent = '←';
    }
    backBtn.addEventListener('click', () => {
      if (activeWindow) {
        const menuContainer = activeWindow.querySelector('.page-adapter-menu-container');
        if (menuContainer) {
          // Cancel any in-flight request when returning to the main view.
          cancelCurrentRequest(menuContainer);
          showMainView(menuContainer);
        }
      }
    });
    titleBar.appendChild(backBtn);

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

    const container = document.createElement('div');
    container.className = 'page-adapter-menu-container';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';
    container.style.position = 'relative';

    const mainView = await buildMainView();
    const chatView = buildChatView();
    container.appendChild(mainView);
    container.appendChild(chatView);

    contentArea.appendChild(container);

    await initMenuUI(container, windowElement, floatingButton, settingsBtn, shadowRoot);

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

    // Cancel any in-flight request before closing.
    const menuContainer = activeWindow.querySelector('.page-adapter-menu-container');
    if (menuContainer) {
      cancelCurrentRequest(menuContainer);
    }

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