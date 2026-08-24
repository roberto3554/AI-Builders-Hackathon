/**
 * @fileoverview Background service logic for the Page Adapter extension.
 * Responsibilities: context menu setup, handling user requests and
 * routing messages between popup/content scripts and backend APIs.
 */
import { PRESETS, MESSAGE_TYPES } from '../shared/messages.js';

const STORAGE_KEY = 'pageAdapter:lastRequest';

// --- Context menu ---
const PARENT_MENU_ID = 'page_adapter';
const OPEN_PANEL_ID = 'open_panel';

chrome.runtime.onInstalled.addListener(async () => {
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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === OPEN_PANEL_ID) {
    chrome.action.openPopup();
    return;
  }

  const match = info.menuItemId.match(/^preset_(.+)$/);
  if (match) {
    const presetId = match[1];
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const message = {
      type: MESSAGE_TYPES.USER_REQUEST,
      payload: {
        mode: 'preset',
        request: preset.request,
        presetId: preset.id,
        createdAt: new Date().toISOString(),
      },
    };

    handleUserRequest(message, tab).catch((error) =>
      console.error('[Page Adapter] Context menu error:', error)
    );
  }
});

// --- Message handling for popup and content ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === MESSAGE_TYPES.USER_REQUEST) {
    handleUserRequest(message)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Page Adapter] Error:', error);
        sendResponse({ ok: false, error: error.message || 'Unknown error' });
      });
    return true;
  }

  if (message.type === MESSAGE_TYPES.OLLAMA_REQUEST) {
    handleOllamaRequest(message.payload)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error.message })
      );
    return true;
  }

  if (message.type === MESSAGE_TYPES.SUMMARIZE_REQUEST) {
    handleSummarize(message.payload)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error.message })
      );
    return true;
  }

  if (message.type === MESSAGE_TYPES.CHAT_QUESTION) {
    handleChatQuestion(message.payload)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error.message })
      );
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ ok: true });
  }
});

// --- Main logic ---
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

  // If the preset is 'summarize', delegate to the content script to start the flow
  if (message.payload.presetId === 'summarize') {
    await sendToContentScript(tab.id, {
      type: 'START_SUMMARIZE',
    });
    return { ok: true };
  }

  // For other presets, apply transformation directly
  await sendToContentScript(tab.id, {
    type: MESSAGE_TYPES.APPLY_TRANSFORMATION,
    payload: {
      presetId: message.payload.presetId,
      request: message.payload.request,
    },
  });

  return { ok: true, request };
}

// --- Handlers for summarize and chat ---
async function handleSummarize({ text, title }) {
  const prompt = `Summarize the following content clearly and concisely, highlighting the main points. If it is an article, extract the key ideas. The title is: "${title}".\n\n${text.slice(0, 15000)}`;
  const systemPrompt =
    'You are a helpful assistant that summarizes web content clearly and concisely.';
  try {
    const response = await callOllama(prompt, systemPrompt);
    return { ok: true, summary: response };
  } catch (error) {
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

async function handleChatQuestion({ question, context }) {
  const prompt = `Based on the following content, answer the user's question in a helpful and accurate way. If you cannot find the answer, say so clearly.\n\nContent:\n${context.slice(0, 15000)}\n\nQuestion: ${question}`;
  const systemPrompt =
    'You are a helpful assistant that answers questions about webpage content.';
  try {
    const response = await callOllama(prompt, systemPrompt);
    return { ok: true, answer: response };
  } catch (error) {
    throw new Error(`Failed to answer question: ${error.message}`);
  }
}

// --- Functions for Ollama ---
async function handleOllamaRequest({
  prompt,
  systemPrompt = null,
  model = 'qwen3.5:2b',
}) {
  const url = 'http://localhost:11434/api/generate';
  const body = {
    model,
    prompt,
    system: systemPrompt || undefined,
    stream: false,
    options: {
      temperature: 0.7,
      top_p: 0.9,
    },
  };

  const response = await fetch(url, {
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

// Reusable helper function
async function callOllama(prompt, systemPrompt = null, model = 'qwen3.5:2b') {
  const result = await handleOllamaRequest({ prompt, systemPrompt, model });
  if (!result.ok) throw new Error(result.error || 'Unknown error from Ollama');
  return result.response;
}

// --- Helper functions ---
function isSupportedUrl(url) {
  if (!url) return false;
  const protocols = ['http:', 'https:', 'file:', 'ftp:'];
  try {
    const parsed = new URL(url);
    return protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function ensureContentScriptInjected(tabId) {
  const MAX_RETRIES = 2;
  let attempts = 0;
  let success = false;

  while (attempts < MAX_RETRIES && !success) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      success = true;
      break;
    } catch (error) {
      if (attempts === 0) {
        console.log(
          `[Page Adapter] Injecting content script into tab ${tabId}`
        );
        await injectContentScripts(tabId);
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (!success) {
    throw new Error(
      'Failed to establish communication with the content script. Try reloading the page and try again.'
    );
  }
}

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
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error('[Page Adapter] Error injecting scripts:', error);
    throw new Error('Failed to inject the content script into this page.');
  }
}

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