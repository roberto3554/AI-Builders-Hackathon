/**
 * @fileoverview Ollama API communication and AI helpers.
 * Dependencies: shared/locale.js.
 * Used by: message-handler.js.
 */

import { t } from '../shared/locale.js';

// =============================================================================
// Constants
// =============================================================================

const OLLAMA_DEFAULT_MODEL = 'qwen3.5:2b';
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const OLLAMA_TEMPERATURE = 0.7;
const OLLAMA_TOP_P = 0.9;

// =============================================================================
// Ollama API communication
// =============================================================================

/**
 * Handles a raw Ollama request.
 *
 * @param {object} params - The request parameters.
 * @param {string} params.prompt - The prompt to send.
 * @param {string|null} [params.systemPrompt=null] - Optional system prompt.
 * @param {string} [params.model=OLLAMA_DEFAULT_MODEL] - The model to use.
 * @returns {Promise<object>} The Ollama response.
 * @throws Will throw if the fetch fails or returns a non-ok status.
 */
export async function handleOllamaRequest({
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
export async function callOllama(
  prompt,
  systemPrompt = null,
  model = OLLAMA_DEFAULT_MODEL
) {
  const result = await handleOllamaRequest({ prompt, systemPrompt, model });

  if (!result.ok) {
    throw new Error(result.error || 'Unknown error from Ollama');
  }

  return result.response;
}

// =============================================================================
// AI Helpers (Summarize & Chat)
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
export async function handleSummarize({ text, title }) {
  const prompt = `Summarize the following content clearly and concisely, highlighting the main points. If it is an article, extract the key ideas. The title is: "${title}".\n\n${text.slice(0, 15000)}`;
  const systemPrompt =
    'You are a helpful assistant that summarizes web content clearly and concisely.';

  try {
    const summary = await callOllama(prompt, systemPrompt);
    return { ok: true, summary };
  } catch (error) {
    throw new Error(t('error.ollama_generic', { message: error.message }));
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
export async function handleChatQuestion({ question, context }) {
  const prompt = `Based on the following content, answer the user's question in a helpful and accurate way. If you cannot find the answer, say so clearly.\n\nContent:\n${context.slice(0, 15000)}\n\nQuestion: ${question}`;
  const systemPrompt =
    'You are a helpful assistant that answers questions about webpage content.';

  try {
    const answer = await callOllama(prompt, systemPrompt);
    return { ok: true, answer };
  } catch (error) {
    throw new Error(t('error.chat_generic', { message: error.message }));
  }
}