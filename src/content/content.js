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

  if (message.type === 'SHOW_REQUEST') {
    showRequestPanel(message.payload);
    sendResponse({ ok: true });
  }

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

  // Start summarize flow
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
      else if (lower.includes('traduc') || lower.includes('translate')) applyTranslate();
      else if (lower.includes('explic') || lower.includes('explain')) applyExplain();
      else {
        showNotification('Request received: ' + request);
      }
  }
}

function clearTransformations() {
  document.querySelectorAll('.page-adapter-transformation').forEach(el => el.remove());
  document.body.classList.remove('page-adapter-simplify', 'page-adapter-translate');
  document.querySelectorAll('[data-page-adapter-hidden]').forEach(el => {
    el.style.display = '';
    el.removeAttribute('data-page-adapter-hidden');
  });
}

function applySimplify() {
  document.body.classList.add('page-adapter-simplify');
  const hideSelectors = ['img', 'video', 'iframe', 'aside', 'nav', '.sidebar', '.ad', '.banner'];
  hideSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
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
  const main = document.querySelector('main') || document.querySelector('article') || document.querySelector('[role="main"]') || document.body;
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

  // Show loading overlay
  const overlay = createOverlay('Generating AI summary...', 'Loading...');
  document.body.appendChild(overlay);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_REQUEST",
      payload: { text, title }
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to generate summary.');
    }

    const summary = response.summary;
    overlay.remove();
    await showChatOverlay(summary, text);
  } catch (error) {
    const messagesContainer = overlay.querySelector('.page-adapter-chat-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="page-adapter-chat-message error">
          Failed to generate AI summary. Please try again later.<br>
          <small>${error.message}</small>
        </div>
      `;
    } else {
      overlay.querySelector('.page-adapter-chat-messages').textContent = 'Error: ' + error.message;
    }
  }
}

async function showChatOverlay(summary, context) {
  await loadMarked(); // Ensure that marked is loaded

  const overlay = createOverlay('AI Summary', '', true);
  const messagesContainer = overlay.querySelector(".page-adapter-chat-messages");
  const input = overlay.querySelector(".page-adapter-chat-input");
  const sendBtn = overlay.querySelector(".page-adapter-chat-send");

  addMessage(messagesContainer, 'AI', summary, 'assistant');

  async function sendQuestion() {
    const question = input.value.trim();
    if (!question) return;
    addMessage(messagesContainer, 'You', question, 'user');
    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHAT_QUESTION",
        payload: { question, context }
      });
      if (!response?.ok) {
        throw new Error(response?.error || 'Error in response.');
      }
      addMessage(messagesContainer, 'AI', response.answer, 'assistant');
    } catch (error) {
      addMessage(messagesContainer, 'AI', `Error: ${error.message}`, 'assistant');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", sendQuestion);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  });

  document.body.appendChild(overlay);
}

function addMessage(container, sender, text, role) {
  const msg = document.createElement('div');
  msg.className = `page-adapter-chat-message ${role}`; // 'user' o 'assistant'

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble';

  // Render content (markdown)
  const htmlContent = renderMarkdown(text);
  bubble.innerHTML = htmlContent;

  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function createOverlay(title, initialContent = "", withChat = false) {
  const overlay = document.createElement("div");
  overlay.className = "page-adapter-transformation";
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: system-ui, sans-serif;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 30px rgba(0,0,0,0.2);
    position: relative;
    margin: 20px;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;";
  header.innerHTML = `
    <h3 style="margin: 0;">${title}</h3>
    <button class="page-adapter-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
  `;
  box.appendChild(header);

  const contentArea = document.createElement("div");
  contentArea.style.cssText = "flex: 1; overflow-y: auto; margin-bottom: 12px;";

  if (withChat) {
    const messages = document.createElement("div");
    messages.className = "page-adapter-chat-messages";
    messages.style.cssText = "max-height: 300px; overflow-y: auto; margin-bottom: 12px; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;";
    contentArea.appendChild(messages);

    const inputArea = document.createElement("div");
    inputArea.style.cssText = "display: flex; gap: 8px;";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "page-adapter-chat-input";
    input.placeholder = 'Ask a question about the content...';
    input.style.cssText = "flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;";
    const sendBtn = document.createElement("button");
    sendBtn.className = "page-adapter-chat-send";
    sendBtn.textContent = 'Ask';
    sendBtn.style.cssText = "padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;";
    inputArea.append(input, sendBtn);
    contentArea.appendChild(inputArea);

    box._messages = messages;
    box._input = input;
    box._sendBtn = sendBtn;
  } else {
    const content = document.createElement("div");
    content.className = "page-adapter-chat-messages";
    content.innerHTML = initialContent;
    contentArea.appendChild(content);
  }

  box.appendChild(contentArea);
  overlay.appendChild(box);

  const closeBtn = box.querySelector(".page-adapter-close");
  closeBtn.addEventListener("click", () => overlay.remove());

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  return overlay;
}

// --- Existing functions (request panel, context, etc.) ---
function showRequestPanel(request) {
  removeExistingPanel();

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "page-adapter-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Page Adapter");

  const header = document.createElement("div");
  header.className = "page-adapter-header";

  const title = document.createElement("strong");
  title.textContent = 'Page Adapter';

  const closeButton = document.createElement("button");
  closeButton.className = "page-adapter-close";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.addEventListener("click", () => panel.remove());

  header.append(title, closeButton);

  const status = document.createElement('div');
  status.className = 'page-adapter-status';
  status.textContent = 'Request received';

  const requestLabel = document.createElement('div');
  requestLabel.className = 'page-adapter-label';
  requestLabel.textContent = 'User need';

  const requestText = document.createElement('div');
  requestText.className = 'page-adapter-request';
  requestText.textContent = request.request;

  const info = document.createElement('div');
  info.className = 'page-adapter-info';
  info.innerHTML = `
    <span class="page-adapter-dot"></span>
    Adaptation engine: <strong>not connected to Ollama</strong>
  `;

  const pageInfo = document.createElement("div");
  pageInfo.className = "page-adapter-page";
  pageInfo.textContent = request.page?.title || document.title || location.href;

  panel.append(header, status, requestLabel, requestText, info, pageInfo);
  document.documentElement.appendChild(panel);
}

function removeExistingPanel() {
  document.getElementById(PANEL_ID)?.remove();
}

function extractPageContext() {
  const title = document.title;
  const url = location.href;

  const main =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.body;

  const text = cleanText(main?.innerText || "");

  const headings = [...document.querySelectorAll("h1, h2, h3")]
    .slice(0, 50)
    .map((element) => cleanText(element.innerText))
    .filter(Boolean);

  return {
    title,
    url,
    language: document.documentElement.lang || null,
    headings,
    text: text.slice(0, 30000)
  };
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

if (!document.documentElement.dataset[STYLE_MARKER]) {
  document.documentElement.dataset[STYLE_MARKER] = 'true';
}