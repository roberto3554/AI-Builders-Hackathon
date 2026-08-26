/**
 * @fileoverview Background service logic for the Page Adapter extension.
 * Responsibilities: context menu setup, handling user requests and
 * routing messages between popup/content scripts and backend APIs.
 * Dependencies: Chrome extension APIs, shared message definitions.
 * Used by: manifest.json (service worker) and extension components.
 */

import { PRESETS, MESSAGE_TYPES } from '../shared/messages.js';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'pageAdapter:lastRequest';

const PARENT_MENU_ID = 'page_adapter';
const OPEN_PANEL_ID = 'open_panel';

const OLLAMA_DEFAULT_MODEL = 'qwen3.5:2b';
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const OLLAMA_TEMPERATURE = 0.7;
const OLLAMA_TOP_P = 0.9;

const MAX_RETRIES = 2;
const INJECTION_DELAY_MS = 200;
const CONTENT_SCRIPT_PING_TIMEOUT_MS = 1000;

// =============================================================================
// Context menu setup
// =============================================================================

/**
 * Sets up the extension's context menu items.
 * Called during installation or update.
 *
 * @returns {Promise<void>}
 */
async function setupContextMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: PARENT_MENU_ID,
    title: 'Page Adapter',
    contexts: ['page'],
  });

  for (const preset of PRESETS) {
    chrome.contextMenus.create({
      id: `preset_${preset.id}`,
      parentId: PARENT_MENU_ID,
      title: preset.label,
      contexts: ['page'],
    });
  }

  chrome.contextMenus.create({
    id: 'separator',
    parentId: PARENT_MENU_ID,
    type: 'separator',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: OPEN_PANEL_ID,
    parentId: PARENT_MENU_ID,
    title: 'Open Page Adapter panel',
    contexts: ['page'],
  });
}

// =============================================================================
// Context menu click handler
// =============================================================================

/**
 * Handles clicks on context menu items.
 *
 * @param {chrome.contextMenus.OnClickData} info - Context menu click data.
 * @param {chrome.tabs.Tab} tab - The active tab when the menu was clicked.
 * @returns {Promise<void>}
 */
async function onContextMenuClicked(info, tab) {
  if (info.menuItemId === OPEN_PANEL_ID) {
    chrome.action.openPopup();
    return;
  }

  const match = info.menuItemId.match(/^preset_(.+)$/);
  if (!match) {
    return;
  }

  const presetId = match[1];
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset) {
    return;
  }

  const message = {
    type: MESSAGE_TYPES.USER_REQUEST,
    payload: {
      mode: 'preset',
      request: preset.request,
      presetId: preset.id,
      createdAt: new Date().toISOString(),
    },
  };

  try {
    await handleUserRequest(message, tab);
  } catch (error) {
    console.error('[Page Adapter] Context menu error:', error);
  }
}

// =============================================================================
// Runtime message listener
// =============================================================================

/**
 * Listens for runtime messages and delegates to the appropriate handler.
 *
 * @param {object} message - The received message.
 * @param {chrome.runtime.MessageSender} sender - Sender information.
 * @param {function} sendResponse - Callback to send a response.
 * @returns {boolean | undefined} `true` if the response will be sent asynchronously.
 */
function onRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return;
  }

  try {
    switch (message.type) {
      case MESSAGE_TYPES.USER_REQUEST:
        handleUserRequest(message)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling user request:', error);
            sendResponse({ ok: false, error: error.message || 'Unknown error' });
          });
        return true;

      case MESSAGE_TYPES.OLLAMA_REQUEST:
        handleOllamaRequest(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling Ollama request:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case MESSAGE_TYPES.SUMMARIZE_REQUEST:
        handleSummarize(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling summarize request:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case MESSAGE_TYPES.CHAT_QUESTION:
        handleChatQuestion(message.payload)
          .then(sendResponse)
          .catch((error) => {
            console.error('[Page Adapter] Error handling chat question:', error);
            sendResponse({ ok: false, error: error.message });
          });
        return true;

      case 'PING':
        sendResponse({ ok: true });
        return;
    }
  } catch (error) {
    console.error('[Page Adapter] Unhandled error in message listener:', error);
    sendResponse({ ok: false, error: error.message });
    return true;
  }
}

// =============================================================================
// Main request handler
// =============================================================================

/**
 * Handles a user request by routing it to the appropriate action.
 *
 * @param {object} message - The user request message.
 * @param {chrome.tabs.Tab} [providedTab] - Optional tab object, used for context menu actions.
 * @returns {Promise<object>} Response indicating success or failure.
 * @throws Will throw if the active tab cannot be determined or if injection fails.
 */
async function handleUserRequest(message, providedTab = null) {
  let tab;

  if (providedTab) {
    tab = providedTab;
  } else {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    tab = tabs[0];
  }

  if (!tab?.id) {
    throw new Error('Unable to determine the active tab.');
  }

  const url = tab.url || '';
  if (!isSupportedUrl(url)) {
    throw new Error('This page does not allow script injection.');
  }

  await ensureContentScriptInjected(tab.id);

  const request = {
    ...message.payload,
    page: {
      tabId: tab.id,
      title: tab.title || '',
      url: tab.url || '',
    },
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: request });

  // Delegate to content script based on preset type.
  if (message.payload.presetId === 'summarize') {
    await sendToContentScript(tab.id, {
      type: 'START_SUMMARIZE',
    });
    return { ok: true };
  }

  await sendToContentScript(tab.id, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: message.payload.presetId,
      request: message.payload.request,
    },
  });

  return { ok: true, request };
}

// =============================================================================
// Summarize and chat handlers
// =============================================================================

/**
 * Handles a summarize request by calling Ollama.
 *
 * @param {object} payload - The summarize payload.
 * @param {string} payload.text - The page text content.
 * @param {string} payload.title - The page title.
 * @returns {Promise<object>} Response containing the summary.
 * @throws Will throw if Ollama fails or returns an error.
 */
async function handleSummarize({ text, title }) {
  const prompt = `Summarize the following content clearly and concisely, highlighting the main points. If it is an article, extract the key ideas. The title is: "${title}".\n\n${text.slice(0, 15000)}`;
  const systemPrompt =
    'You are a helpful assistant that summarizes web content clearly and concisely.';

  try {
    const summary = await callOllama(prompt, systemPrompt);
    return { ok: true, summary };
  } catch (error) {
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

/**
 * Handles a chat question by calling Ollama with context.
 *
 * @param {object} payload - The chat payload.
 * @param {string} payload.question - The user's question.
 * @param {string} payload.context - The page content context.
 * @returns {Promise<object>} Response containing the answer.
 * @throws Will throw if Ollama fails or returns an error.
 */
async function handleChatQuestion({ question, context }) {
  const prompt = `Based on the following content, answer the user's question in a helpful and accurate way. If you cannot find the answer, say so clearly.\n\nContent:\n${context.slice(0, 15000)}\n\nQuestion: ${question}`;
  const systemPrompt =
    'You are a helpful assistant that answers questions about webpage content.';

  try {
    const answer = await callOllama(prompt, systemPrompt);
    return { ok: true, answer };
  } catch (error) {
    throw new Error(`Failed to answer question: ${error.message}`);
  }
}

// =============================================================================
// Ollama API communication
// =============================================================================

/**
 * Handles a raw Ollama request.
 *
 * @param {object} params - The request parameters.
 * @param {string} params.prompt - The prompt to send.
 * @param {string|null} [params.systemPrompt] - Optional system prompt.
 * @param {string} [params.model] - The model to use, defaults to OLLAMA_DEFAULT_MODEL.
 * @returns {Promise<object>} The Ollama response.
 * @throws Will throw if the fetch fails or returns a non-ok status.
 */
async function handleOllamaRequest({
  prompt,
  systemPrompt = null,
  model = OLLAMA_DEFAULT_MODEL,
}) {
  const body = {
    model,
    prompt,
    system: systemPrompt || undefined,
    stream: false,
    options: {
      temperature: OLLAMA_TEMPERATURE,
      top_p: OLLAMA_TOP_P,
    },
  };

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return { ok: true, response: data.response };
}

/**
 * Convenience function to call Ollama and return only the response text.
 *
 * @param {string} prompt - The prompt to send.
 * @param {string|null} systemPrompt - Optional system prompt.
 * @param {string} [model] - Optional model name.
 * @returns {Promise<string>} The generated text.
 * @throws Will throw if the Ollama request fails.
 */
async function callOllama(prompt, systemPrompt = null, model = OLLAMA_DEFAULT_MODEL) {
  const result = await handleOllamaRequest({ prompt, systemPrompt, model });

  if (!result.ok) {
    throw new Error(result.error || 'Unknown error from Ollama');
  }

  return result.response;
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Determines whether a URL supports script injection.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} `true` if the URL is supported, otherwise `false`.
 */
function isSupportedUrl(url) {
  if (!url) {
    return false;
  }

  const protocols = ['http:', 'https:', 'file:', 'ftp:'];
  try {
    const parsed = new URL(url);
    return protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Ensures that the content script is injected into the given tab.
 * Attempts to ping the content script, and injects it if communication fails.
 *
 * @param {number} tabId - The ID of the target tab.
 * @returns {Promise<void>}
 * @throws Will throw if injection fails after retries.
 */
async function ensureContentScriptInjected(tabId) {
  let attempts = 0;
  let success = false;

  while (attempts < MAX_RETRIES && !success) {
    try {
      const pingResult = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (pingResult?.ok) {
        success = true;
        break;
      }
    } catch {
      // Ping failed; proceed to inject.
    }

    if (!success && attempts === 0) {
      console.log(`[Page Adapter] Injecting content script into tab ${tabId}`);
      await injectContentScripts(tabId);
      // Wait a moment for the script to initialize.
      await new Promise((resolve) => setTimeout(resolve, INJECTION_DELAY_MS));
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, INJECTION_DELAY_MS));
  }

  if (!success) {
    throw new Error(
      'Failed to establish communication with the content script. Try reloading the page and try again.'
    );
  }
}

/**
 * Injects the content script and CSS into the given tab.
 *
 * @param {number} tabId - The ID of the target tab.
 * @returns {Promise<void>}
 * @throws Will throw if injection fails.
 */
async function injectContentScripts(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/content.css'],
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js'],
    });

    await new Promise((resolve) => setTimeout(resolve, INJECTION_DELAY_MS));
  } catch (error) {
    console.error('[Page Adapter] Error injecting scripts:', error);
    throw new Error('Failed to inject the content script into this page.');
  }
}

/**
 * Sends a message to the content script of a specific tab.
 *
 * @param {number} tabId - The ID of the target tab.
 * @param {object} message - The message to send.
 * @returns {Promise<object>} The response from the content script.
 * @throws Will throw if the tab does not exist or communication fails.
 */
async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[Page Adapter] Error sending message:', error);
    throw new Error(
      'Unable to interact with this page. Try a normal webpage and reload after installing the extension.'
    );
  }
}

// =============================================================================
// Register listeners
// =============================================================================

chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
chrome.runtime.onMessage.addListener(onRuntimeMessage);

// =============================================================================
// Exports (none)
// =============================================================================