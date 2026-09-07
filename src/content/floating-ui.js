/**
 * @fileoverview Floating UI components: panels, notifications, overlays.
 * Dependencies: locale.js, marked-loader.js (for chat bubbles).
 * Used by: summarizer.js, transformations.js.
 */

import { renderMarkdown } from './marked-loader.js';

// ============================================================================
// Constants & storage helpers
// ============================================================================

const WINDOW_SIZE_STORAGE_KEY = 'pageAdapter:windowSize';

/**
 * Saves the window dimensions to storage.
 * @param {number} width
 * @param {number} height
 */
export function saveWindowSize(width, height) {
  if (typeof width !== 'number' || isNaN(width) || width < 100) {
    return;
  }
  if (typeof height !== 'number' || isNaN(height) || height < 100) {
    return;
  }
  chrome.storage.local.set({ [WINDOW_SIZE_STORAGE_KEY]: { width, height } })
    .catch(console.warn);
}

/**
 * Loads saved window dimensions from storage.
 * @returns {Promise<{width: number, height: number} | null>}
 */
export async function loadWindowSize() {
  try {
    const result = await chrome.storage.local.get(WINDOW_SIZE_STORAGE_KEY);
    const data = result[WINDOW_SIZE_STORAGE_KEY];
    if (data && typeof data.width === 'number' && data.width > 0 &&
        typeof data.height === 'number' && data.height > 0) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Notification
// ============================================================================

export function showNotification(text) {
  const notification = document.createElement('div');
  notification.className = 'page-adapter-toast page-adapter-transformation';
  notification.textContent = text;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ============================================================================
// Overlay
// ============================================================================

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

// ============================================================================
// Floating window (draggable, resizable)
// ============================================================================

/**
 * Creates a draggable, resizable floating window.
 *
 * @param {string} title - Window title.
 * @param {string} initialContent - Initial HTML content (ignored if withChat).
 * @param {boolean} withChat - Whether to include a chat input.
 * @param {number} maxWidth - Maximum width in pixels.
 * @param {string} maxHeight - Maximum height CSS value.
 * @param {string} chatPlaceholder - Placeholder for chat input.
 * @param {string} chatButtonText - Text for chat send button.
 * @param {number|null} initialLeft - Fixed left position (pixels).
 * @param {number|null} initialTop - Fixed top position (pixels).
 * @param {HTMLElement|null} moveElement - External element to move during drag.
 * @param {number} moveOffsetX - Horizontal offset from window's left for moveElement.
 * @param {number} moveOffsetY - Vertical offset from window's top for moveElement.
 * @param {number|null} initialWidth - Initial width (pixels).
 * @param {number|null} initialHeight - Initial height (pixels).
 * @returns {HTMLElement} The window element.
 */
export function createFloatingWindow(
  title,
  initialContent = '',
  withChat = false,
  maxWidth = 600,
  maxHeight = '80vh',
  chatPlaceholder = 'Ask a question about the content…',
  chatButtonText = 'Ask',
  initialLeft = null,
  initialTop = null,
  moveElement = null,
  moveOffsetX = 0,
  moveOffsetY = 0,
  initialWidth = null,
  initialHeight = null
) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-adapter-floating-window';
  wrapper._isDragging = false;
  wrapper._dragMoved = false;
  // Mark this element as part of the extension UI so it is ignored in snapshots and transformations.
  wrapper.dataset.extension = 'true';

  // Determine width and height with robust validation
  let width;
  if (typeof initialWidth === 'number' && !isNaN(initialWidth) && initialWidth >= 300) {
    const maxViewportWidth = window.innerWidth - 40;
    width = Math.min(initialWidth, maxViewportWidth, maxWidth);
  } else {
    width = Math.min(maxWidth, window.innerWidth - 40);
  }

  let height = null;
  if (typeof initialHeight === 'number' && !isNaN(initialHeight) && initialHeight >= 200) {
    let limit = Infinity;
    if (typeof maxHeight === 'string' && maxHeight.endsWith('vh')) {
      const vh = parseFloat(maxHeight);
      if (!isNaN(vh) && vh > 0) {
        limit = (vh / 100) * window.innerHeight;
      }
    } else if (typeof maxHeight === 'number' && maxHeight > 0) {
      limit = maxHeight;
    } else if (maxHeight === 'none' || maxHeight === '') {
      limit = Infinity;
    }
    const maxViewportHeight = window.innerHeight - 40;
    limit = Math.min(limit, maxViewportHeight);
    height = Math.min(initialHeight, limit);
  }

  let cssText = `
    position: fixed;
    max-height: ${maxHeight === 'none' ? 'none' : maxHeight};
    min-width: 300px;
    min-height: 200px;
    width: ${width}px;
  `;
  if (height !== null) {
    cssText += `height: ${height}px;`;
  }
  if (initialLeft !== null && initialTop !== null) {
    cssText += `left: ${initialLeft}px; top: ${initialTop}px; transform: none;`;
  } else {
    cssText += 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
  }
  wrapper.style.cssText = cssText;

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.className = 'page-adapter-title-bar';
  titleBar.innerHTML = `
    <span class="page-adapter-title-text">${title}</span>
    <button class="page-adapter-close" aria-label="Close panel">×</button>
  `;
  wrapper.appendChild(titleBar);

  // Content area
  const contentArea = document.createElement('div');
  contentArea.className = 'page-adapter-content-area';
  wrapper.appendChild(contentArea);

  if (withChat) {
    const messages = document.createElement('div');
    messages.className = 'page-adapter-chat-messages';
    contentArea.appendChild(messages);

    const inputArea = document.createElement('div');
    inputArea.className = 'page-adapter-chat-input-area';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'page-adapter-chat-input';
    input.placeholder = chatPlaceholder;
    input.disabled = true;

    const sendButton = document.createElement('button');
    sendButton.className = 'page-adapter-chat-send';
    sendButton.textContent = chatButtonText;
    sendButton.disabled = true;

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

  // --- Drag logic ---
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeftPos = 0, initialTopPos = 0;

  function onDragStart(event) {
    if (event.target.closest('button')) return;
    if (!event.target.closest('.page-adapter-title-bar')) return;

    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    initialLeftPos = rect.left;
    initialTopPos = rect.top;
    wrapper.style.left = initialLeftPos + 'px';
    wrapper.style.top = initialTopPos + 'px';
    wrapper.style.transform = 'none';
    wrapper._isDragging = true;
    wrapper._dragMoved = false;

    wrapper.style.cursor = 'grabbing';
    wrapper.style.transition = 'none';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    event.preventDefault();
  }

  function onDragMove(event) {
    if (!isDragging) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    let newLeft = initialLeftPos + deltaX;
    let newTop = initialTopPos + deltaY;
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      wrapper._dragMoved = true;   // movement detected
    }

    const margin = 20;
    const maxX = window.innerWidth - wrapper.offsetWidth - margin;
    const maxY = window.innerHeight - wrapper.offsetHeight - margin;
    newLeft = Math.max(margin, Math.min(newLeft, maxX));
    newTop = Math.max(margin, Math.min(newTop, maxY));

    wrapper.style.left = newLeft + 'px';
    wrapper.style.top = newTop + 'px';

    if (moveElement) {
      moveElement.style.left = (newLeft + moveOffsetX) + 'px';
      moveElement.style.top = (newTop + moveOffsetY) + 'px';
      moveElement.style.transform = 'none';
    }
  }

  function onDragEnd() {
    isDragging = false;
    wrapper.style.cursor = '';
    wrapper.style.transition = '';
    wrapper._isDragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  titleBar.addEventListener('mousedown', onDragStart);

  // --- Close button ---
  const closeButton = titleBar.querySelector('.page-adapter-close');
  closeButton.addEventListener('click', () => wrapper.remove());

  // --- Resize logic ---
  let resizeDirection = null;
  let isResizing = false;
  let resizeStartX = 0, resizeStartY = 0;
  let resizeStartWidth = 0, resizeStartHeight = 0;
  let resizeStartLeft = 0, resizeStartTop = 0;

  const RESIZE_MARGIN = 8;
  const buttonWidth = moveElement ? moveElement.offsetWidth || 60 : 0;

  function getResizeDirection(clientX, clientY) {
    const rect = wrapper.getBoundingClientRect();
    const { left, top, width, height } = rect;

    const isLeft = clientX - left < RESIZE_MARGIN;
    const isRight = left + width - clientX < RESIZE_MARGIN;
    const isTop = clientY - top < RESIZE_MARGIN;
    const isBottom = top + height - clientY < RESIZE_MARGIN;

    if (isTop && isLeft) return 'nw';
    if (isTop && isRight) return 'ne';
    if (isBottom && isLeft) return 'sw';
    if (isBottom && isRight) return 'se';
    if (isTop) return 'n';
    if (isBottom) return 's';
    if (isLeft) return 'w';
    if (isRight) return 'e';
    return null;
  }

  function getResizeCursor(dir) {
    const map = {
      'n': 'ns-resize', 's': 'ns-resize',
      'e': 'ew-resize', 'w': 'ew-resize',
      'ne': 'nesw-resize', 'nw': 'nwse-resize',
      'se': 'nwse-resize', 'sw': 'nesw-resize',
    };
    return map[dir] || 'default';
  }

  function onWrapperMouseMove(event) {
    if (isDragging || isResizing) return;
    const dir = getResizeDirection(event.clientX, event.clientY);
    resizeDirection = dir;
    wrapper.style.cursor = dir ? getResizeCursor(dir) : 'default';
  }

  function onWrapperMouseDown(event) {
    if (isDragging) return;
    if (event.target.closest('.page-adapter-title-bar') || event.target.closest('.page-adapter-close')) return;
    const dir = resizeDirection;
    if (!dir) return;

    isResizing = true;
    const rect = wrapper.getBoundingClientRect();
    resizeStartX = event.clientX;
    resizeStartY = event.clientY;
    resizeStartWidth = rect.width;
    resizeStartHeight = rect.height;
    resizeStartLeft = rect.left;
    resizeStartTop = rect.top;

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
    event.preventDefault();
  }

  function onResizeMove(event) {
    if (!isResizing) return;
    const dx = event.clientX - resizeStartX;
    const dy = event.clientY - resizeStartY;

    let newWidth = resizeStartWidth;
    let newHeight = resizeStartHeight;
    let newLeft = resizeStartLeft;
    let newTop = resizeStartTop;
    const resizeStartRight = resizeStartLeft + resizeStartWidth;
    const resizeStartBottom = resizeStartTop + resizeStartHeight;

    const dir = resizeDirection;
    const minWidth = 300;
    const minHeight = 200;

    if (dir.includes('e')) {
      newWidth = resizeStartWidth + dx;
    }
    if (dir.includes('w')) {
      newWidth = resizeStartWidth - dx;
    }
    if (dir.includes('s')) {
      newHeight = resizeStartHeight + dy;
    }
    if (dir.includes('n')) {
      newHeight = resizeStartHeight - dy;
    }

    // Compute limits based on the original maxWidth and maxHeight parameters
    // and the current viewport.
    let maxWidthLimit;
    if (typeof maxWidth === 'number' && maxWidth > 0) {
      maxWidthLimit = Math.min(maxWidth, window.innerWidth - 40);
    } else {
      maxWidthLimit = window.innerWidth - 40;
    }

    let maxHeightLimit;
    if (typeof maxHeight === 'number' && maxHeight > 0) {
      maxHeightLimit = Math.min(maxHeight, window.innerHeight - 40);
    } else if (maxHeight === 'none' || maxHeight === '') {
      maxHeightLimit = window.innerHeight - 40;
    } else if (typeof maxHeight === 'string' && maxHeight.endsWith('vh')) {
      const vh = parseFloat(maxHeight);
      if (!isNaN(vh) && vh > 0) {
        maxHeightLimit = Math.min((vh / 100) * window.innerHeight, window.innerHeight - 40);
      } else {
        maxHeightLimit = window.innerHeight - 40;
      }
    } else {
      maxHeightLimit = window.innerHeight - 40;
    }

    // Apply limits
    newWidth = Math.max(minWidth, Math.min(newWidth, maxWidthLimit));
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeightLimit));

    // Keep the opposite edge fixed when resizing from west/north.
    // This prevents lateral/top drift after size reaches the max limit.
    if (dir.includes('w')) {
      newLeft = resizeStartRight - newWidth;
    }
    if (dir.includes('n')) {
      newTop = resizeStartBottom - newHeight;
    }

    // Clamp position to viewport
    newLeft = Math.max(20, Math.min(newLeft, window.innerWidth - newWidth - 20));
    newTop = Math.max(20, Math.min(newTop, window.innerHeight - newHeight - 20));

    wrapper.style.width = newWidth + 'px';
    wrapper.style.height = newHeight + 'px';
    wrapper.style.left = newLeft + 'px';
    wrapper.style.top = newTop + 'px';
    wrapper.style.maxHeight = 'none';

    // Update floating button position
    if (moveElement && buttonWidth > 0) {
      const newButtonLeft = newLeft + newWidth - buttonWidth;
      const newButtonTop = newTop;
      moveElement.style.left = newButtonLeft + 'px';
      moveElement.style.top = newButtonTop + 'px';
      moveElement.style.transform = 'none';
      moveOffsetX = newWidth - buttonWidth;
    }
  }

  function onResizeEnd() {
    isResizing = false;
    resizeDirection = null;
    wrapper.style.cursor = 'default';
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);

    // Persist the new size
    const rect = wrapper.getBoundingClientRect();
    saveWindowSize(rect.width, rect.height);
  }

  wrapper.addEventListener('mousemove', onWrapperMouseMove);
  wrapper.addEventListener('mousedown', onWrapperMouseDown);

  // Expose a save method for external use (e.g., when closing)
  wrapper._saveSize = () => {
    const rect = wrapper.getBoundingClientRect();
    saveWindowSize(rect.width, rect.height);
  };

  return wrapper;
}

// ============================================================================
// Chat message helper
// ============================================================================

export function addMessage(container, role, text) {
  if (!container) return;

  const messageElement = document.createElement('div');
  messageElement.className = `page-adapter-chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'page-adapter-chat-bubble';
  bubble.innerHTML = renderMarkdown(text);

  messageElement.appendChild(bubble);
  container.appendChild(messageElement);
  container.scrollTop = container.scrollHeight;
}