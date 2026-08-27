/**
 * @fileoverview AI summarization and chat functionality.
 * Dependencies: marked-loader.js, floating-ui.js, page-context.js, locale.js.
 * Used by: content.js message listener.
 */

import { loadMarked } from './marked-loader.js';
import { createFloatingWindow, addMessage } from './floating-ui.js';
import { extractMainText } from './page-context.js';
import { t } from '../shared/locale.js';

const DEBUG_SUMMARIZE = true;

/**
 * Starts the summarize flow: loads marked, creates a floating window,
 * and generates a summary via Ollama (or uses debug mode).
 *
 * @returns {Promise<void>}
 */
export async function applySummarize() {
  console.debug('[applySummarize] Starting...');
  await loadMarked();

  const pageText = extractMainText();
  const pageTitle = document.title;

  // Pass translated strings for the chat UI.
  const floatingWindow = createFloatingWindow(
    t('summary.generating'),
    '',
    true, // withChat
    600,
    '80vh',
    t('chat.input_placeholder'),
    t('chat.send_button')
  );

  document.body.appendChild(floatingWindow);

  const messagesContainer = floatingWindow.querySelector('.page-adapter-chat-messages');
  const input = floatingWindow.querySelector('.page-adapter-chat-input');
  const sendButton = floatingWindow.querySelector('.page-adapter-chat-send');

  if (messagesContainer) {
    addMessage(messagesContainer, 'assistant', t('summary.generating'));
  }

  // Debug mode: use test markdown.
  if (DEBUG_SUMMARIZE) {
    console.debug('[applySummarize] DEBUG mode: using test markdown');

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
        addMessage(messagesContainer, 'assistant', t('summary.debug_mode'));

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
      const errorHtml = `
        <div class="page-adapter-chat-message error">
          ${t('summary.error')}<br>
          <small>${error.message}</small>
        </div>
      `;
      messagesContainer.innerHTML = errorHtml;
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
export function setupChatHandlers(messagesContainer, input, sendButton, contextText) {
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
      const errorMsg = t('chat.error', { message: error.message });
      addMessage(messagesContainer, 'assistant', errorMsg);
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