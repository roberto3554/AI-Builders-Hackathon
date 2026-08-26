/**
 * @fileoverview Content script for the Page Adapter extension.
 * Responsibilities: render UI overlays in the page, extract page context,
 * apply simple transformations, and coordinate summarize/chat flows.
 * Dependencies: Chrome extension APIs, marked library (loaded dynamically).
 * Used by: Background service worker via chrome.tabs.sendMessage.
 */

// =============================================================================
// Constants
// =============================================================================

const PANEL_ID = 'page-adapter-panel';
const STYLE_MARKER = 'page-adapter-injected';
const DEBUG_SUMMARIZE = false; // Set to true to test markdown rendering without Ollama.

// Marked loading retries.
const MARKED_LOAD_MAX_RETRIES = 2;
const MARKED_LOAD_RETRY_DELAY_MS = 200;

// Floating window defaults.
const FLOATING_WINDOW_MAX_WIDTH = 600;
const FLOATING_WINDOW_MAX_HEIGHT = '80vh';
const CHAT_MESSAGES_MAX_HEIGHT = 300;

// =============================================================================
// Marked loading and rendering
// =============================================================================

let markedLoaded = false;
let markedLib = null;

/**
 * Loads the marked library dynamically via ESM or falls back to UMD.
 *
 * @returns {Promise<object>} The marked library.
 * @throws Will throw if loading fails after retries.
 */
async function loadMarked() {
  if (markedLoaded) {
    return markedLib;
  }

  try {
    // Try ESM import.
    const module = await import(chrome.runtime.getURL('src/lib/marked.esm.js'));
    markedLib = module;
    markedLoaded = true;
    console.log('[Page Adapter] marked loaded via ESM import');
    return markedLib;
  } catch (error) {
    console.warn('[Page Adapter] ESM import failed, falling back to UMD:', error);

    // Fallback: inject UMD script into page.
    return new Promise((resolve, reject) => {
      if (typeof window.marked !== 'undefined') {
        markedLib = window.marked;
        markedLoaded = true;
        resolve(markedLib);
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/lib/marked.umd.js');

      script.onload = () => {
        markedLib = window.marked;
        markedLoaded = true;
        console.log('[Page Adapter] marked loaded via UMD script');
        resolve(markedLib);
      };

      script.onerror = (loadError) => {
        console.error('[Page Adapter] Failed to load UMD script:', loadError);
        reject(loadError);
      };

      document.head.appendChild(script);
    });
  }
}

/**
 * Renders Markdown text to HTML using the loaded marked library.
 *
 * @param {string} text - The Markdown text to render.
 * @returns {string} The rendered HTML.
 */
function renderMarkdown(text) {
  const markdown = markedLib || window.marked;

  if (markdown && typeof markdown.parse === 'function') {
    return markdown.parse(text, { gfm: true, breaks: true });
  }

  // Fallback: convert line breaks to <br>.
  return text.replace(/\n/g, '<br>');
}

// =============================================================================
// Message listener
// =============================================================================

/**
 * Listens for runtime messages from the background script.
 *
 * @param {object} message - The received message.
 * @param {object} sender - Sender information.
 * @param {function} sendResponse - Callback to send a response.
 * @returns {boolean | undefined} `true` if response is sent asynchronously.
 */
function onRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return;
  }

  try {
    switch (message.type) {
      case 'GET_PAGE_CONTEXT':
        sendResponse({ ok: true, context: extractPageContext() });
        break;

      case 'PING':
        sendResponse({ ok: true });
        break;

      case 'APPLY_TRANSFORMATION':
        applyTransformation(message.payload);
        sendResponse({ ok: true });
        break;

      case 'START_SUMMARIZE':
        applySummarize().catch((error) => {
          console.error('[Page Adapter] Summarize error:', error);
        });
        sendResponse({ ok: true });
        break;

      default:
        // Ignore unknown message types.
        break;
    }
  } catch (error) {
    console.error('[Page Adapter] Error handling message:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// Register listener.
chrome.runtime.onMessage.addListener(onRuntimeMessage);

// =============================================================================
// Transformation functions
// =============================================================================

/**
 * Applies a transformation to the page based on the payload.
 *
 * @param {object} payload - The transformation payload.
 * @param {string} payload.presetId - The preset identifier.
 * @param {string} payload.request - The natural language request.
 */
function applyTransformation(payload) {
  const { presetId, request } = payload;

  clearTransformations();

  if (presetId === 'summarize') {
    showNotification('AI summary generated (see panel)');
    return;
  }

  switch (presetId) {
    case 'simplify':
      applySimplify();
      break;

    case 'translate':
      applyTranslate();
      break;

    case 'explain':
      applyExplain();
      break;

    default: {
      // Heuristic based on request text.
      const lower = request.toLowerCase();
      if (lower.includes('simplif') || lower.includes('simple')) {
        applySimplify();
      } else if (lower.includes('traduc') || lower.includes('translate')) {
        applyTranslate();
      } else if (lower.includes('explic') || lower.includes('explain')) {
        applyExplain();
      } else {
        showNotification(`Request received: ${request}`);
      }
    }
  }
}

/**
 * Removes all previously applied transformations and restores the page.
 */
function clearTransformations() {
  document.querySelectorAll('.page-adapter-transformation').forEach((element) => {
    element.remove();
  });

  document.body.classList.remove(
    'page-adapter-simplify',
    'page-adapter-translate'
  );

  document.querySelectorAll('[data-page-adapter-hidden]').forEach((element) => {
    element.style.display = '';
    element.removeAttribute('data-page-adapter-hidden');
  });
}

/**
 * Applies the "simplify" transformation: hides non-essential elements.
 */
function applySimplify() {
  document.body.classList.add('page-adapter-simplify');

  const hideSelectors = [
    'img',
    'video',
    'iframe',
    'aside',
    'nav',
    '.sidebar',
    '.ad',
    '.banner',
  ];

  hideSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      if (element.style.display !== 'none') {
        element.dataset.pageAdapterHidden = 'true';
        element.style.display = 'none';
      }
    });
  });

  showNotification('Simplified mode activated');
}

/**
 * Applies the "translate" transformation (simulated language change).
 */
function applyTranslate() {
  document.documentElement.lang = 'es';
  document.body.classList.add('page-adapter-translate');
  showNotification('Language changed to Spanish (simulated)');
}

/**
 * Applies the "explain" transformation: shows a simplified explanation.
 */
function applyExplain() {
  const text = extractMainText();
  const explanation = `Explanation: ${text.slice(0, 300)}... (simplified)`;
  showOverlay('Explanation', explanation);
}

// =============================================================================
// Page content extraction and UI helpers
// =============================================================================

/**
 * Extracts the main text content from the page.
 *
 * @returns {string} The text content of the main element or body.
 */
function extractMainText() {
  const mainElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  return mainElement.innerText || '';
}

/**
 * Shows a notification overlay on the page.
 *
 * @param {string} title - The title of the overlay.
 * @param {string} content - The content to display.
 */
function showOverlay(title, content) {
  const overlay = document.createElement('div');
  overlay.className = 'page-adapter-transformation';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: system-ui, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      position: relative;
      margin: 20px;
    ">
      <button style="
        position: sticky;
        top: 0;
        float: right;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
      ">×</button>
      <h3 style="margin-top: 0;">${title}</h3>
      <p style="white-space: pre-wrap; word-break: break-word;">${content}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('button')) {
      overlay.remove();
    }
  });
}

/**
 * Shows a temporary notification at the bottom of the page.
 *
 * @param {string} text - The notification text.
 */
function showNotification(text) {
  const notification = document.createElement('div');
  notification.className = 'page-adapter-transformation';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    z-index: 999999;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  notification.textContent = text;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// =============================================================================
// AI Summarize and Chat
// =============================================================================

/**
 * Starts the summarize flow: loads marked, creates a floating window,
 * and generates a summary via Ollama (or uses debug mode).
 *
 * @returns {Promise<void>}
 */
async function applySummarize() {
  console.log('[applySummarize] Starting...');
  await loadMarked();
  console.log('[applySummarize] markedLib:', markedLib);

  const pageText = extractMainText();
  const pageTitle = document.title;

  const floatingWindow = createFloatingWindow(
    'AI Summary',
    `<p style="color: #6b7280;">Generating summary...</p>`,
    true // with chat
  );

  document.body.appendChild(floatingWindow);

  const messagesContainer = floatingWindow.querySelector(
    '.page-adapter-chat-messages'
  );
  const input = floatingWindow.querySelector('.page-adapter-chat-input');
  const sendButton = floatingWindow.querySelector('.page-adapter-chat-send');

  if (messagesContainer) {
    messagesContainer.innerHTML = `
      <div class="page-adapter-chat-message assistant">
        <div class="page-adapter-chat-bubble">Generating summary...</div>
      </div>
    `;
  }

  // Debug mode: use test markdown.
  if (DEBUG_SUMMARIZE) {
    console.log('[applySummarize] DEBUG mode: using test markdown');

    const testMarkdown = `
# Test Title

This is a **bold text** and *italic text*.

- List item 1
- List item 2
  - Subelement block:
  \`\`\`
  function test() {
    console.log("Hello, world!");
  }
  \`\`\`

[Link to example](https://example.com)

\`Inline code\`

\`\`\`
Code block
\`\`\`
    `;

    if (messagesContainer) {
      messagesContainer.innerHTML = '';
      setTimeout(() => {
        addMessage(messagesContainer, 'assistant', testMarkdown);
        addMessage(
          messagesContainer,
          'assistant',
          '⚠️ **Debug mode enabled** – this is a sample text to test Markdown rendering.'
        );

        if (input && sendButton) {
          input.disabled = false;
          sendButton.disabled = false;
          input.focus();
        }

        setupChatHandlers(messagesContainer, input, sendButton, pageText);
      }, 50);
    }
    return;
  }

  // Normal flow: ask Ollama.
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_REQUEST',
      payload: { text: pageText, title: pageTitle },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to generate summary.');
    }

    if (messagesContainer) {
      messagesContainer.innerHTML = '';
      addMessage(messagesContainer, 'assistant', response.summary);
      if (input && sendButton) {
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
      }
      setupChatHandlers(messagesContainer, input, sendButton, pageText);
    }
  } catch (error) {
    console.error('[applySummarize] Error:', error);
    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="page-adapter-chat-message error">
          Failed to generate AI summary. Please try again later.<br>
          <small>${error.message}</small>
        </div>
      `;
    }
  }
}

/**
 * Sets up chat event handlers for the floating window.
 *
 * @param {HTMLElement} messagesContainer - The container for chat messages.
 * @param {HTMLInputElement} input - The chat input element.
 * @param {HTMLButtonElement} sendButton - The send button.
 * @param {string} contextText - The page content for context.
 */
function setupChatHandlers(messagesContainer, input, sendButton, contextText) {
  if (!messagesContainer || !input || !sendButton) {
    console.warn('[setupChatHandlers] Missing elements, skipping');
    return;
  }

  async function sendQuestion() {
    const question = input.value.trim();
    if (!question) {
      return;
    }

    addMessage(messagesContainer, 'user', question);
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;

    try {
      const chatResponse = await chrome.runtime.sendMessage({
        type: 'CHAT_QUESTION',
        payload: { question, context: contextText },
      });

      if (!chatResponse?.ok) {
        throw new Error(chatResponse?.error || 'Error in response.');
      }

      addMessage(messagesContainer, 'assistant', chatResponse.answer);
    } catch (error) {
      addMessage(
        messagesContainer,
        'assistant',
        `Error: ${error.message}`
      );
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  }

  // Remove previous listeners to avoid duplicates.
  sendButton.removeEventListener('click', sendQuestion);
  input.removeEventListener('keydown', handleKeydown);

  sendButton.addEventListener('click', sendQuestion);
  input.addEventListener('keydown', handleKeydown);
}

/**
 * Adds a message to the chat container.
 *
 * @param {HTMLElement} container - The chat messages container.
 * @param {string} role - The message role ('user' or 'assistant').
 * @param {string} text - The message text (Markdown).
 */
function addMessage(container, role, text) {
  if (!container) {
    return;
  }

  const messageElement = document.createElement('div');
  messageElement.className = `page-adapter-chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble';
  bubble.innerHTML = renderMarkdown(text);

  messageElement.appendChild(bubble);
  container.appendChild(messageElement);
  container.scrollTop = container.scrollHeight;
}

// =============================================================================
// Floating window creation
// =============================================================================

/**
 * Creates a draggable floating window with optional chat interface.
 *
 * @param {string} title - The window title.
 * @param {string} initialContent - Initial HTML content for the body.
 * @param {boolean} withChat - Whether to include a chat input area.
 * @returns {HTMLElement} The wrapper element containing the window.
 */
function createFloatingWindow(title, initialContent = '', withChat = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-adapter-floating-window';
  wrapper.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(${FLOATING_WINDOW_MAX_WIDTH}px, calc(100vw - 40px));
    max-height: ${FLOATING_WINDOW_MAX_HEIGHT};
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    overflow: hidden;
  `;

  // Title bar (draggable).
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #f1f5f9;
    cursor: move;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  `;
  titleBar.innerHTML = `
    <span style="font-weight: 600; font-size: 16px; color: #0f172a;">${title}</span>
    <button class="page-adapter-close" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #475569; padding: 0 4px;">×</button>
  `;
  wrapper.appendChild(titleBar);

  // Content area.
  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #ffffff;
  `;
  wrapper.appendChild(contentArea);

  // Chat mode.
  if (withChat) {
    const messages = document.createElement('div');
    messages.className = 'page-adapter-chat-messages';
    messages.style.cssText = `
      max-height: ${CHAT_MESSAGES_MAX_HEIGHT}px;
      overflow-y: auto;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    contentArea.appendChild(messages);

    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      display: flex;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'page-adapter-chat-input';
    input.placeholder = 'Ask a question about the content...';
    input.disabled = true;
    input.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      outline: none;
      font-size: 14px;
    `;

    const sendButton = document.createElement('button');
    sendButton.className = 'page-adapter-chat-send';
    sendButton.textContent = 'Ask';
    sendButton.disabled = true;
    sendButton.style.cssText = `
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    `;

    inputArea.append(input, sendButton);
    contentArea.appendChild(inputArea);

    wrapper._messages = messages;
    wrapper._input = input;
    wrapper._sendButton = sendButton;
  } else {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = initialContent;
    contentArea.appendChild(contentDiv);
  }

  // Close button.
  const closeButton = titleBar.querySelector('.page-adapter-close');
  closeButton.addEventListener('click', () => {
    wrapper.remove();
  });

  // Drag functionality.
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialX = 0;
  let initialY = 0;

  function onDragStart(event) {
    if (event.target.closest('.page-adapter-close')) {
      return;
    }

    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    initialX = rect.left;
    initialY = rect.top;
    wrapper.style.cursor = 'grabbing';
    wrapper.style.transition = 'none';
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
    wrapper.style.left = `${initialX + deltaX}px`;
    wrapper.style.top = `${initialY + deltaY}px`;
    wrapper.style.transform = 'none';
  }

  function onDragEnd() {
    isDragging = false;
    wrapper.style.cursor = '';
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  titleBar.addEventListener('mousedown', onDragStart);

  return wrapper;
}

// =============================================================================
// Page context extraction
// =============================================================================

/**
 * Extracts page context for use by AI.
 *
 * @returns {object} An object containing title, url, language, headings, and text.
 */
function extractPageContext() {
  const title = document.title;
  const url = location.href;

  const mainElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  const text = cleanText(mainElement?.innerText || '');

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .slice(0, 50)
    .map((element) => cleanText(element.innerText))
    .filter(Boolean);

  return {
    title,
    url,
    language: document.documentElement.lang || null,
    headings,
    text: text.slice(0, 30000),
  };
}

/**
 * Cleans text by collapsing whitespace.
 *
 * @param {string} value - The raw text.
 * @returns {string} Cleaned text.
 */
function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

// =============================================================================
// Self-injection marker
// =============================================================================

if (!document.documentElement.dataset[STYLE_MARKER]) {
  document.documentElement.dataset[STYLE_MARKER] = 'true';
}