/**
 * @fileoverview Page context extraction utilities.
 * Dependencies: none.
 * Used by: content script for summarization and context.
 */

/**
 * Extracts the main text content from the page.
 *
 * @returns {string} The text content of the main element or body.
 */
export function extractMainText() {
  const mainElement =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  return mainElement.innerText || '';
}

/**
 * Cleans text by collapsing whitespace.
 *
 * @param {string} value - The raw text.
 * @returns {string} Cleaned text.
 */
export function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts page context for use by AI.
 *
 * @returns {object} An object containing title, url, language, headings, and text.
 */
export function extractPageContext() {
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