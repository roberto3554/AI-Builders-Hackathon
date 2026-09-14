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

const SEND_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 19V5 M5 12l7-7 7 7"
          stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"
          fill="none"/>
  </svg>
`;

const STOP_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor"/>
  </svg>
`;

const CANCEL_ICON_SVG = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" fill="none"/>
  </svg>
`;

// =============================================================================
// State
// =============================================================================

let activeWindow = null;
let activeFloatingButton = null;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generates a unique identifier used to correlate a user request with its
 * cancellation message. Uses crypto.randomUUID when available and falls back
 * to a timestamp-based identifier otherwise.
 *
 * @returns {string} A random request identifier.
 */
function generateRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

function applyFontSizeToHost(fontSize, host) {
  host.classList.remove(
    'page-adapter-font-small',
    'page-adapter-font-medium',
    'page-adapter-font-large'
  );
  const safeSize = ['small', 'medium', 'large'].includes(fontSize)
    ? fontSize
    : 'medium';
  host.classList.add(`page-adapter-font-${safeSize}`);
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
// DOM building - Main view
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
      <div class="page-adapter-preference-row">
        <label id="font-size-label" for="menu-font-size">${t('popup.preferences.font_size')}</label>
        <select id="menu-font-size"></select>
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
  adaptButton.innerHTML = SEND_ICON_SVG;
  textareaWrapper.appendChild(adaptButton);

  inputSection.appendChild(textareaWrapper);

  const footer = document.createElement('div');
  footer.className = 'page-adapter-input-footer';

  const counter = document.createElement('span');
  counter.id = 'menu-counter';
  counter.className = 'page-adapter-counter';
  counter.textContent = t('popup.counter', { current: 0, max: MAX_REQUEST_LENGTH });
  footer.appendChild(counter);

  inputSection.appendChild(footer);
  container.appendChild(inputSection);

  return container;
}

// =============================================================================
// DOM building - Chat view
// =============================================================================

/**
 * Builds the chat view using the same section structure as the main view
 * so that both views share the same visual rhythm and heading treatments.
 *
 * @returns {HTMLElement} The chat view container.
 */
function buildChatView() {
  const container = document.createElement('div');
  container.className = 'page-adapter-chat-view';
  container.style.display = 'none';

  const messagesSection = document.createElement('section');
  messagesSection.className =
    'page-adapter-menu-section page-adapter-chat-messages-section';
  const messagesLabel = document.createElement('h2');
  messagesLabel.textContent = t('chat.section_title');
  messagesSection.appendChild(messagesLabel);

  const messagesContainer = document.createElement('div');
  messagesContainer.id = 'chat-messages';
  messagesContainer.className = 'page-adapter-chat-messages';
  messagesSection.appendChild(messagesContainer);
  container.appendChild(messagesSection);

  const inputSection = document.createElement('section');
  inputSection.className = 'page-adapter-menu-section page-adapter-input-section';
  const inputLabel = document.createElement('label');
  inputLabel.className = 'page-adapter-input-label';
  inputLabel.setAttribute('for', 'chat-input');
  inputLabel.textContent = t('chat.input_label');
  inputSection.appendChild(inputLabel);

  const inputArea = document.createElement('div');
  inputArea.className = 'page-adapter-chat-input-area';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'chat-input';
  input.className = 'page-adapter-chat-input';
  input.placeholder = t('chat.input_placeholder');
  input.disabled = true;

  const sendButton = document.createElement('button');
  sendButton.id = 'chat-send';
  sendButton.className = 'page-adapter-chat-send';
  sendButton.type = 'button';
  sendButton.setAttribute('aria-label', t('chat.send_button'));
  sendButton.title = t('chat.send_button');
  sendButton.disabled = true;
  sendButton.innerHTML = SEND_ICON_SVG;

  const stopButton = document.createElement('button');
  stopButton.id = 'chat-stop';
  stopButton.className = 'page-adapter-chat-stop';
  stopButton.type = 'button';
  stopButton.setAttribute('aria-label', t('popup.cancel_button'));
  stopButton.title = t('popup.cancel_button');
  stopButton.hidden = true;
  stopButton.innerHTML = STOP_ICON_SVG;

  inputArea.append(input, sendButton, stopButton);
  inputSection.appendChild(inputArea);
  container.appendChild(inputSection);

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

async function renderPresets(container, onPresetClick, onPresetCancel) {
  container.innerHTML = '';
  for (const preset of PRESETS) {
    const iconUrl = chrome.runtime.getURL(preset.icon || '');
    let svgContent = '';
    try {
      svgContent = await fetchSvgContent(iconUrl);
    } catch {
      svgContent = `<span style="font-size:13px;">${preset.id[0].toUpperCase()}</span>`;
    }

    const labelKey = `preset.${preset.id}`;
    const labelText = t(labelKey);

    const wrapper = document.createElement('div');
    wrapper.className = 'page-adapter-preset-wrapper';
    wrapper.dataset.presetId = preset.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-adapter-preset-button';
    button.dataset.presetId = preset.id;
    button.innerHTML = `
      <span class="page-adapter-preset-icon">${svgContent}</span>
      <span>${escapeHtml(labelText)}</span>
    `;
    button.addEventListener('click', () => {
      onPresetClick(preset);
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'page-adapter-preset-cancel';
    cancelButton.setAttribute('aria-label', `${t('popup.cancel_button')} — ${labelText}`);
    cancelButton.title = t('popup.cancel_button');
    cancelButton.innerHTML = CANCEL_ICON_SVG;
    cancelButton.addEventListener('click', (event) => {
      event.stopPropagation();
      onPresetCancel(preset);
    });

    wrapper.append(button, cancelButton);
    container.appendChild(wrapper);
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
    const langLabel = mainView.querySelector('#language-label');
    if (langLabel) langLabel.textContent = t('popup.preferences.language');
    const themeLabel = mainView.querySelector('#theme-label');
    if (themeLabel) themeLabel.textContent = t('popup.preferences.theme');
    const fontSizeLabel = mainView.querySelector('#font-size-label');
    if (fontSizeLabel) fontSizeLabel.textContent = t('popup.preferences.font_size');
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

  const chatView = container.querySelector('.page-adapter-chat-view');
  if (chatView) {
    const chatMessagesTitle = chatView.querySelector(
      '.page-adapter-chat-messages-section h2'
    );
    if (chatMessagesTitle) chatMessagesTitle.textContent = t('chat.section_title');

    const chatInputLabel = chatView.querySelector('.page-adapter-input-label');
    if (chatInputLabel) chatInputLabel.textContent = t('chat.input_label');
  }

  const chatInput = container.querySelector('#chat-input');
  if (chatInput) chatInput.placeholder = t('chat.input_placeholder');

  const chatSend = container.querySelector('#chat-send');
  if (chatSend) {
    chatSend.setAttribute('aria-label', t('chat.send_button'));
    chatSend.title = t('chat.send_button');
  }

  const chatStop = container.querySelector('#chat-stop');
  if (chatStop) {
    chatStop.setAttribute('aria-label', t('popup.cancel_button'));
    chatStop.title = t('popup.cancel_button');
  }
}

function updateSelectOptions(languageSelect, themeSelect, fontSizeSelect) {
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
  if (fontSizeSelect) {
    const fontSizeOptions = fontSizeSelect.querySelectorAll('option');
    fontSizeOptions.forEach((opt) => {
      const key = `popup.preferences.font_size_${opt.value}`;
      opt.textContent = t(key);
    });
  }
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

/**
 * Recomputes the chat send button's disabled state from the current loading
 * state and the presence of text in the chat input. Called whenever either of
 * those two things changes.
 *
 * @param {HTMLElement} container - The menu container.
 * @returns {void}
 */
function updateChatSendState(container) {
  const input = container.querySelector('#chat-input');
  const sendButton = container.querySelector('#chat-send');
  const stopButton = container.querySelector('#chat-stop');
  if (!input || !sendButton || !stopButton) return;

  const isLoading = !stopButton.hidden;
  const hasText = input.value.trim().length > 0;
  sendButton.disabled = isLoading || !hasText;
}

function setChatLoading(container, loading, phases) {
  const input = container.querySelector('#chat-input');
  const sendButton = container.querySelector('#chat-send');
  const stopButton = container.querySelector('#chat-stop');

  if (loading) {
    showThinkingIndicator(container, phases);
    if (input) input.disabled = true;
    if (sendButton) {
      sendButton.hidden = true;
      sendButton.disabled = true;
    }
    if (stopButton) stopButton.hidden = false;
  } else {
    removeThinkingIndicator(container);
    if (input) input.disabled = false;
    if (sendButton) sendButton.hidden = false;
    if (stopButton) stopButton.hidden = true;
    updateChatSendState(container);
  }
}

// =============================================================================
// Preset loading + transient status
// =============================================================================

function setPresetLoading(container, presetId, loading) {
  const wrappers = container.querySelectorAll('.page-adapter-preset-wrapper');
  const adaptButton = container.querySelector('#menu-adapt');
  const textarea = container.querySelector('#menu-request');

  wrappers.forEach((wrapper) => {
    const btn = wrapper.querySelector('.page-adapter-preset-button');
    if (!btn) return;
    const isActive = wrapper.dataset.presetId === presetId;
    btn.disabled = loading;
    if (loading && isActive) {
      btn.classList.add('page-adapter-preset-button--active');
      wrapper.classList.add('page-adapter-preset-wrapper--active');
    } else {
      btn.classList.remove('page-adapter-preset-button--active');
      wrapper.classList.remove('page-adapter-preset-wrapper--active');
    }
  });

  if (adaptButton) adaptButton.disabled = loading;
  if (textarea) textarea.disabled = loading;
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

/**
 * Cancels the currently active request, if any, and resets the menu UI to its
 * idle state. The background service worker is notified so that the
 * adaptation loop stops issuing further DOM changes for the request.
 *
 * @param {HTMLElement} container - The menu container.
 * @returns {void}
 */
function cancelCurrentRequest(container) {
  const state = container._requestState;
  if (!state) return;
  state.cancelled = true;
  container._requestState = null;

  // Notify the background so it can abort the request. Without this, the
  // adaptation loop keeps running even though the popup UI has been reset.
  if (state.requestId) {
    chrome.runtime
      .sendMessage({
        type: MESSAGE_TYPES.CANCEL_REQUEST,
        payload: { requestId: state.requestId },
      })
      .catch((error) => {
        console.warn('[Page Adapter] Failed to send cancellation:', error);
      });
  }

  removeThinkingIndicator(container);
  setChatLoading(container, false);

  const wrappers = container.querySelectorAll('.page-adapter-preset-wrapper');
  wrappers.forEach((wrapper) => {
    const btn = wrapper.querySelector('.page-adapter-preset-button');
    if (btn) btn.disabled = false;
    wrapper.classList.remove('page-adapter-preset-wrapper--active');
    if (btn) btn.classList.remove('page-adapter-preset-button--active');
  });

  const adaptButton = container.querySelector('#menu-adapt');
  const textarea = container.querySelector('#menu-request');
  if (adaptButton) adaptButton.disabled = false;
  if (textarea) textarea.disabled = false;
}

/**
 * Sends a user request to the background service worker. A fresh request ID
 * is attached to the outgoing message so the request can be cancelled later.
 *
 * @param {object} message - The user request message.
 * @param {HTMLElement} container - The menu container.
 * @param {object} [options] - Options.
 * @param {boolean} [options.navigateToChat=false] - Whether to open the chat view.
 * @param {string|null} [options.presetId=null] - Preset identifier, if any.
 * @returns {Promise<void>}
 */
async function sendRequest(message, container, { navigateToChat = false, presetId = null } = {}) {
  cancelCurrentRequest(container);

  const requestId = generateRequestId();
  const requestState = { cancelled: false, presetId: presetId || null, requestId };
  container._requestState = requestState;

  const outgoingMessage = {
    ...message,
    payload: { ...message.payload, requestId },
  };

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
    const response = await chrome.runtime.sendMessage(outgoingMessage);
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
  applyFontSizeToHost(prefs.fontSize, host);
  setLocale(prefs.locale);
  updateFloatingWindowTitle(windowElement);

  const mainView = container.querySelector('.page-adapter-main-view');
  const chatView = container.querySelector('.page-adapter-chat-view');
  const presetsGrid = mainView.querySelector('#menu-presets');
  const textarea = mainView.querySelector('#menu-request');
  const counter = mainView.querySelector('#menu-counter');
  const adaptButton = mainView.querySelector('#menu-adapt');
  const languageSelect = mainView.querySelector('#menu-language');
  const themeSelect = mainView.querySelector('#menu-theme');
  const fontSizeSelect = mainView.querySelector('#menu-font-size');
  const modelInput = mainView.querySelector('#menu-ollama-model');
  const highContrastToggle = mainView.querySelector('#menu-high-contrast');
  const simplifiedToggle = mainView.querySelector('#menu-simplified-ui');
  const settingsPanel = mainView.querySelector('#menu-settings-panel');

  const chatInput = chatView.querySelector('#chat-input');
  const chatSend = chatView.querySelector('#chat-send');
  const chatStop = chatView.querySelector('#chat-stop');

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
  const fontSizeOptions = [
    { value: 'small', label: t('popup.preferences.font_size_small') },
    { value: 'medium', label: t('popup.preferences.font_size_medium') },
    { value: 'large', label: t('popup.preferences.font_size_large') },
  ];

  languageSelect.innerHTML = langOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');
  themeSelect.innerHTML = themeOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');
  fontSizeSelect.innerHTML = fontSizeOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');

  languageSelect.value = prefs.locale;
  themeSelect.value = prefs.theme;
  fontSizeSelect.value = prefs.fontSize;
  modelInput.value = prefs.ollamaModel || DEFAULT_PREFERENCES.ollamaModel;
  highContrastToggle.checked = prefs.highContrast;
  simplifiedToggle.checked = prefs.simplifiedUi;

  updatePopupTexts(container);
  updateSelectOptions(languageSelect, themeSelect, fontSizeSelect);

  const onPresetClick = (preset) => {
    const message = createUserRequest({
      mode: 'preset',
      request: preset.request,
      presetId: preset.id,
    });
    const navigateToChat = preset.id === CHAT_PRESET_ID;
    sendRequest(message, container, { navigateToChat, presetId: preset.id });
  };

  const onPresetCancel = () => {
    cancelCurrentRequest(container);
  };

  await renderPresets(presetsGrid, onPresetClick, onPresetCancel);

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

  chatStop.addEventListener('click', () => {
    cancelCurrentRequest(container);
  });

  // Keep the send button's disabled state in sync with the input content so it
  // becomes clickable as soon as the user types and disables itself again once
  // the input is cleared.
  chatInput.addEventListener('input', () => {
    updateChatSendState(container);
  });
  updateChatSendState(container);

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
    updateSelectOptions(languageSelect, themeSelect, fontSizeSelect);
    await renderPresets(presetsGrid, onPresetClick, onPresetCancel);
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

  fontSizeSelect.addEventListener('change', async (e) => {
    const fontSize = e.target.value;
    const newPrefs = await loadPreferences();
    newPrefs.fontSize = fontSize;
    await savePreferences(newPrefs);
    applyFontSizeToHost(fontSize, shadowRoot.host);
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SET_FONT_SIZE,
          payload: { fontSize },
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
    updateChatSendState(container);
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