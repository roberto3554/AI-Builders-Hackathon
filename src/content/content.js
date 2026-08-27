/**
 * @fileoverview Content script entry point for the Page Adapter extension.
 * Responsibilities: set up message listener, coordinate page manipulations.
 * Dependencies: dynamic imports of content modules.
 * Used by: background service worker via chrome.tabs.sendMessage.
 */

console.log('[Page Adapter] Content script loaded');

// =============================================================================
// Self-injection marker
// =============================================================================

if (!document.documentElement.dataset.pageAdapterInjected) {
  document.documentElement.dataset.pageAdapterInjected = 'true';
}

// =============================================================================
// Theme & locale handling
// =============================================================================

const STORAGE_PREFS_KEY = 'pageAdapter:preferences';

/**
 * Loads the locale module dynamically.
 *
 * @returns {Promise<object>} The locale module containing `setLocale` and `t`.
 */
async function loadLocaleModule() {
  // `import()` works because the module is declared as web_accessible_resource.
  return import('../shared/locale.js');
}

/**
 * Applies the theme by adding/removing classes on the document body.
 *
 * @param {string} theme - 'system', 'light', or 'dark'.
 */
function applyTheme(theme) {
  document.body.classList.remove('page-adapter-theme-dark', 'page-adapter-theme-light');
  if (theme === 'dark') {
    document.body.classList.add('page-adapter-theme-dark');
  } else if (theme === 'light') {
    document.body.classList.add('page-adapter-theme-light');
  }
  // 'system' → no class, media query prevails
}

/**
 * Loads user preferences from storage.
 *
 * @returns {Promise<object>} An object with `theme` and `locale` properties.
 */
async function loadPreferences() {
  const result = await chrome.storage.local.get(STORAGE_PREFS_KEY);
  return result[STORAGE_PREFS_KEY] || { theme: 'system', locale: 'en' };
}

// =============================================================================
// Message listener
// =============================================================================

/**
 * Listens for runtime messages from the background script.
 * Delegates to specific handlers based on message type using dynamic imports.
 *
 * @param {object} message - The received message.
 * @param {object} sender - Sender information (unused).
 * @param {function} sendResponse - Callback to send a response.
 * @returns {boolean | undefined} `true` if response is sent asynchronously.
 */
async function onRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return;
  }

  try {
    switch (message.type) {
      case 'GET_PAGE_CONTEXT': {
        const { extractPageContext } = await import('./page-context.js');
        sendResponse({ ok: true, context: extractPageContext() });
        return true;
      }

      case 'PING': {
        sendResponse({ ok: true });
        return;
      }

      case 'SET_THEME': {
        applyTheme(message.payload.theme);
        sendResponse({ ok: true });
        return true;
      }

      case 'SET_LOCALE': {
        const { setLocale } = await loadLocaleModule();
        setLocale(message.payload.locale);
        sendResponse({ ok: true });
        return true;
      }

      case 'APPLY_TRANSFORMATION': {
        const { applyTransformation } = await import('./transformations.js');
        applyTransformation(message.payload);
        sendResponse({ ok: true });
        return true;
      }

      case 'START_SUMMARIZE':
      case 'SUMMARIZE_PAGE': {
        const { applySummarize } = await import('./summarizer.js');
        applySummarize().catch((error) => {
          console.error('[Page Adapter] Summarize error:', error);
        });
        sendResponse({ ok: true });
        return true;
      }

      default: {
        // Ignore unknown message types.
        break;
      }
    }
  } catch (error) {
    console.error('[Page Adapter] Error handling message:', error);
    sendResponse({ ok: false, error: error.message });
    return true;
  }
}

// Register listener.
chrome.runtime.onMessage.addListener(onRuntimeMessage);

// =============================================================================
// Initialize – apply stored preferences
// =============================================================================

(async function initContent() {
  const prefs = await loadPreferences();
  applyTheme(prefs.theme);

  // Load locale module and set the locale.
  const { setLocale } = await loadLocaleModule();
  setLocale(prefs.locale);

  // Inject the floating button.
  const { createFloatingButton } = await import('./floating-button.js');
  createFloatingButton();
})();