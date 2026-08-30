/**
 * @fileoverview Minimal bootstrap for the Page Adapter content script.
 * Loads the real content script as a module so it can use ESM imports.
 */

(async function bootstrapContentScript() {
  try {
    await import(chrome.runtime.getURL('src/content/content.js'));
  } catch (error) {
    console.error('[Page Adapter] Failed to bootstrap content script:', error);
  }
})();
