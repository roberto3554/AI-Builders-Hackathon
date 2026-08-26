/**
 * @fileoverview Floating UI components: panels, notifications, overlays.
 * Dependencies: locale.js, marked-loader.js (for chat bubbles).
 * Used by: summarizer.js, transformations.js.
 */

import { renderMarkdown } from './marked-loader.js';

/**
 * Shows a temporary notification at the bottom of the page.
 *
 * @param {string} text - The notification text.
 */
export function showNotification(text) {
  const notification = document.createElement('div');
  notification.className = 'page-adapter-toast page-adapter-transformation';
  notification.textContent = text;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Shows an overlay modal on the page.
 *
 * @param {string} title - The title of the overlay.
 * @param {string} content - The content to display (HTML string).
 */
export function showOverlay(title, content) {
  const overlay = document.createElement('div');
  overlay.className = 'page-adapter-overlay page-adapter-transformation';

  const inner = document.createElement('div');
  inner.className = 'page-adapter-overlay-content';

  const closeButton = document.createElement('button');
  closeButton.className = 'page-adapter-overlay-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close overlay');

  const titleElem = document.createElement('h3');
  titleElem.textContent = title;

  const contentElem = document.createElement('div');
  contentElem.innerHTML = content;

  inner.append(closeButton, titleElem, contentElem);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
}

/**
 * Creates a draggable floating window with optional chat interface.
 *
 * @param {string} title - The window title.
 * @param {string} initialContent - Initial HTML content for the body (ignored if withChat).
 * @param {boolean} withChat - Whether to include a chat input area.
 * @param {number} maxWidth - Maximum width in pixels.
 * @param {string} maxHeight - Maximum height (CSS value).
 * @returns {HTMLElement} The wrapper element containing the window.
 */
export function createFloatingWindow(
  title,
  initialContent = '',
  withChat = false,
  maxWidth = 600,
  maxHeight = '80vh'
) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-adapter-floating-window';
  wrapper.style.cssText = `
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(${maxWidth}px, calc(100vw - 40px));
    max-height: ${maxHeight};
    min-width: 300px;
    min-height: 200px;
  `;

  // Title bar (draggable).
  const titleBar = document.createElement('div');
  titleBar.className = 'page-adapter-title-bar';
  titleBar.innerHTML = `
    <span class="page-adapter-title-text">${title}</span>
    <button class="page-adapter-close" aria-label="Close panel">×</button>
  `;
  wrapper.appendChild(titleBar);

  // Content area.
  const contentArea = document.createElement('div');
  contentArea.className = 'page-adapter-content-area';
  wrapper.appendChild(contentArea);

  // Chat mode.
  if (withChat) {
    const messages = document.createElement('div');
    messages.className = 'page-adapter-chat-messages';
    contentArea.appendChild(messages);

    const inputArea = document.createElement('div');
    inputArea.className = 'page-adapter-chat-input-area';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'page-adapter-chat-input';
    input.placeholder = 'Ask a question about the content…';
    input.disabled = true;

    const sendButton = document.createElement('button');
    sendButton.className = 'page-adapter-chat-send';
    sendButton.textContent = 'Ask';
    sendButton.disabled = true;

    inputArea.append(input, sendButton);
    contentArea.appendChild(inputArea);

    // Store references for later use.
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

/**
 * Adds a message to the chat container.
 *
 * @param {HTMLElement} container - The chat messages container.
 * @param {string} role - The message role ('user' or 'assistant').
 * @param {string} text - The message text (Markdown).
 */
export function addMessage(container, role, text) {
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