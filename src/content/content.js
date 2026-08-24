/**
 * @fileoverview Content script for the Page Adapter extension.
 * Responsibilities: render UI overlays in the page, extract page context,
 * apply simple transformations and coordinate summarize/chat flows.
 */
const PANEL_ID = 'page-adapter-panel';
const STYLE_MARKER = 'page-adapter-injected';

// --- Load marked (UMD) ---
let markedLoaded = false;
let markedLib = null;

async function loadMarked() {
  if (markedLoaded) return markedLib;
  return new Promise((resolve, reject) => {
    if (typeof window.marked !== 'undefined') {
      markedLoaded = true;
      markedLib = window.marked;
      resolve(markedLib);
      return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/lib/marked.umd.js');
    script.onload = () => {
      markedLoaded = true;
      markedLib = window.marked;
      resolve(markedLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function renderMarkdown(text) {
  if (markedLib && typeof markedLib.parse === 'function') {
    return markedLib.parse(text);
  }
  // Fallback: convert newlines to <br>
  return text.replace(/\n/g, '<br>');
}

// --- Message listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'GET_PAGE_CONTEXT') {
    sendResponse({ ok: true, context: extractPageContext() });
  }

  if (message.type === 'PING') {
    sendResponse({ ok: true });
  }

  if (message.type === 'APPLY_TRANSFORMATION') {
    applyTransformation(message.payload);
    sendResponse({ ok: true });
  }

  if (message.type === 'START_SUMMARIZE') {
    applySummarize().catch(console.error);
    sendResponse({ ok: true });
  }
});

// --- Transformations ---
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
    default:
      const lower = request.toLowerCase();
      if (lower.includes('simplif') || lower.includes('simple')) applySimplify();
      else if (lower.includes('traduc') || lower.includes('translate'))
        applyTranslate();
      else if (lower.includes('explic') || lower.includes('explain'))
        applyExplain();
      else {
        showNotification('Request received: ' + request);
      }
  }
}

function clearTransformations() {
  document.querySelectorAll('.page-adapter-transformation').forEach((el) => el.remove());
  document.body.classList.remove(
    'page-adapter-simplify',
    'page-adapter-translate'
  );
  document.querySelectorAll('[data-page-adapter-hidden]').forEach((el) => {
    el.style.display = '';
    el.removeAttribute('data-page-adapter-hidden');
  });
}

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
  hideSelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (el.style.display !== 'none') {
        el.dataset.pageAdapterHidden = 'true';
        el.style.display = 'none';
      }
    });
  });
  showNotification('Simplified mode activated');
}

function applyTranslate() {
  document.documentElement.lang = 'es';
  document.body.classList.add('page-adapter-translate');
  showNotification('Language changed to Spanish (simulated)');
}

function applyExplain() {
  const text = extractMainText();
  const explanation = 'Explanation: ' + text.slice(0, 300) + '... (simplified)';
  showOverlay('Explanation', explanation);
}

function extractMainText() {
  const main =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;
  return main.innerText || '';
}

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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('button')) {
      overlay.remove();
    }
  });
}

function showNotification(text) {
  const notif = document.createElement('div');
  notif.className = 'page-adapter-transformation';
  notif.style.cssText = `
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
  notif.textContent = text;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// --- AI summarize and chat ---
async function applySummarize() {
  const text = extractMainText();
  const title = document.title;

  // Create a floating window with a loading message
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
  const sendBtn = floatingWindow.querySelector('.page-adapter-chat-send');

  // Update messages container with initial loading message
  messagesContainer.innerHTML = `
    <div class="page-adapter-chat-message assistant">
      <div class="page-adapter-chat-bubble">Generating summary...</div>
    </div>
  `;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_REQUEST',
      payload: { text, title },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to generate summary.');
    }

    // Replace loading with summary
    messagesContainer.innerHTML = '';
    addMessage(
      messagesContainer,
      'assistant',
      response.summary,
      'assistant'
    );

    // Enable chat input
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();

    // Define send function for chat
    async function sendQuestion() {
      const question = input.value.trim();
      if (!question) return;
      addMessage(messagesContainer, 'user', question, 'user');
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;

      try {
        const chatResponse = await chrome.runtime.sendMessage({
          type: 'CHAT_QUESTION',
          payload: { question, context: text },
        });
        if (!chatResponse?.ok) {
          throw new Error(chatResponse?.error || 'Error in response.');
        }
        addMessage(
          messagesContainer,
          'assistant',
          chatResponse.answer,
          'assistant'
        );
      } catch (error) {
        addMessage(
          messagesContainer,
          'assistant',
          `Error: ${error.message}`,
          'assistant'
        );
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    // Attach event listeners
    sendBtn.addEventListener('click', sendQuestion);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendQuestion();
      }
    });
  } catch (error) {
    // Show error in the messages container
    messagesContainer.innerHTML = `
      <div class="page-adapter-chat-message error">
        Failed to generate AI summary. Please try again later.<br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

function addMessage(container, role, text) {
  const msg = document.createElement('div');
  msg.className = `page-adapter-chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble';

  const htmlContent = renderMarkdown(text);
  bubble.innerHTML = htmlContent;

  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function createFloatingWindow(title, initialContent = '', withChat = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-adapter-floating-window';
  wrapper.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(600px, calc(100vw - 40px));
    max-height: 80vh;
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    overflow: hidden;
    user-select: none;
  `;

  // Title bar (draggable)
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

  // Content area
  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #ffffff;
  `;
  wrapper.appendChild(contentArea);

  // If chat mode, build chat UI
  if (withChat) {
    const messages = document.createElement('div');
    messages.className = 'page-adapter-chat-messages';
    messages.style.cssText = `
      max-height: 300px;
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
    const sendBtn = document.createElement('button');
    sendBtn.className = 'page-adapter-chat-send';
    sendBtn.textContent = 'Ask';
    sendBtn.disabled = true;
    sendBtn.style.cssText = `
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    `;
    inputArea.append(input, sendBtn);
    contentArea.appendChild(inputArea);

    // Store references for later use
    wrapper._messages = messages;
    wrapper._input = input;
    wrapper._sendBtn = sendBtn;
  } else {
    // Simple content
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = initialContent;
    contentArea.appendChild(contentDiv);
  }

  // Close button logic
  const closeBtn = titleBar.querySelector('.page-adapter-close');
  closeBtn.addEventListener('click', () => wrapper.remove());

  // Drag logic
  let isDragging = false;
  let startX, startY, initialX, initialY;

  const onDragStart = (e) => {
    // Only drag if the target is the title bar itself or its children (except the close button)
    if (e.target.closest('.page-adapter-close')) return;
    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initialX = rect.left;
    initialY = rect.top;
    wrapper.style.cursor = 'grabbing';
    wrapper.style.transition = 'none';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  };

  const onDragMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    wrapper.style.left = `${initialX + dx}px`;
    wrapper.style.top = `${initialY + dy}px`;
    wrapper.style.transform = 'none'; // remove centering transform while dragging
  };

  const onDragEnd = () => {
    isDragging = false;
    wrapper.style.cursor = '';
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };

  titleBar.addEventListener('mousedown', onDragStart);

  return wrapper;
}

// --- Existing functions (context, etc.) ---
function extractPageContext() {
  const title = document.title;
  const url = location.href;

  const main =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  const text = cleanText(main?.innerText || '');

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

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

if (!document.documentElement.dataset[STYLE_MARKER]) {
  document.documentElement.dataset[STYLE_MARKER] = 'true';
}