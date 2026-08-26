/**
 * @fileoverview Dynamically loads the marked library for markdown rendering.
 * Dependencies: Chrome runtime API.
 * Used by: summarizer.js, floating-ui.js.
 */

let markedLoaded = false;
let markedLib = null;

/**
 * Loads the marked library via ESM or UMD fallback.
 *
 * @returns {Promise<object>} The marked library.
 * @throws Will throw if loading fails after retries.
 */
export async function loadMarked() {
  if (markedLoaded) {
    return markedLib;
  }

  try {
    // Try ESM import.
    const module = await import(chrome.runtime.getURL('src/lib/marked.esm.js'));
    markedLib = module;
    markedLoaded = true;
    console.debug('[Page Adapter] marked loaded via ESM import');
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
        console.debug('[Page Adapter] marked loaded via UMD script');
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
export function renderMarkdown(text) {
  const markdown = markedLib || window.marked;

  if (markdown && typeof markdown.parse === 'function') {
    return markdown.parse(text, { gfm: true, breaks: true });
  }

  // Fallback: convert line breaks to <br>.
  return text.replace(/\n/g, '<br>');
}