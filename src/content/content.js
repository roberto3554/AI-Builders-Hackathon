/**
 * @fileoverview Content script entry point for the Page Adapter extension.
 * Creates a Shadow DOM root for the extension UI to isolate styles.
 * Responsibilities: set up message listener, coordinate page manipulations.
 * Dependencies: dynamic imports of content modules.
 * Used by: background service worker via chrome.tabs.sendMessage.
 */

console.log('[Page Adapter] Content script loaded');

// =============================================================================
// Shadow DOM setup
// =============================================================================

// Create host element and attach shadow root.
const host = document.createElement('div');
host.id = 'page-adapter-host';
// Ensure the host is not affected by page styles.
host.style.all = 'initial';
document.documentElement.appendChild(host);

const shadowRoot = host.attachShadow({ mode: 'open' });

// Load and inject CSS into shadow root.
(async function loadStyles() {
  try {
    const cssUrl = chrome.runtime.getURL('src/content/content.css');
    const response = await fetch(cssUrl);
    if (!response.ok) {
      throw new Error(`Failed to load CSS: ${response.status}`);
    }
    const cssText = await response.text();
    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    shadowRoot.appendChild(styleEl);
    console.log('[Page Adapter] CSS injected into shadow root');
  } catch (error) {
    console.error('[Page Adapter] Failed to load content CSS:', error);
  }
})();

// =============================================================================
// Self-injection marker (still useful for the page)
// =============================================================================

if (!document.documentElement.dataset.pageAdapterInjected) {
  document.documentElement.dataset.pageAdapterInjected = 'true';
}

// =============================================================================
// Theme, contrast, simplification and font size handling
// =============================================================================

/**
 * Applies the theme by adding/removing classes on the host element.
 * These classes will be used in shadow CSS via :host-context.
 * @param {string} theme - 'system', 'light', or 'dark'.
 */
function applyTheme(theme) {
  host.classList.remove('page-adapter-theme-dark', 'page-adapter-theme-light');
  if (theme === 'dark') {
    host.classList.add('page-adapter-theme-dark');
  } else if (theme === 'light') {
    host.classList.add('page-adapter-theme-light');
  }
}

function applyHighContrast(enabled) {
  host.classList.toggle('page-adapter-high-contrast', enabled);
}

function applySimplifiedUi(enabled) {
  host.classList.toggle('page-adapter-simplified', enabled);
}

/**
 * Applies the font size scale to the host element. The corresponding host
 * classes override the `--pa-font-scale` custom property, which is consumed
 * by every `font-size` declaration in the shadow CSS.
 *
 * @param {string} fontSize - 'small', 'medium', or 'large'.
 */
function applyFontSize(fontSize) {
  host.classList.remove(
    'page-adapter-font-small',
    'page-adapter-font-medium',
    'page-adapter-font-large'
  );
  const safeSize = ['small', 'medium', 'large'].includes(fontSize)
    ? fontSize
    : 'medium';
  host.classList.add(`page-adapter-font-${safeSize}`);
}

// =============================================================================
// Message listener
// =============================================================================

/**
 * Listens for runtime messages from the background script.
 * Delegates to specific handlers based on message type using dynamic imports.
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
        const { extractPageContext, extractDomSnapshot } = await import('./page-context.js');
        sendResponse({
          ok: true,
          context: extractPageContext(),
          snapshot: extractDomSnapshot(),
        });
        return true;
      }

      case 'GET_SIMPLIFY_CANDIDATES': {
        const { extractDomSnapshot } = await import('./page-context.js');
        const { extractSimplifyCandidates } = await import('./simplify-context.js');
        const snapshot = extractDomSnapshot();
        sendResponse({
          ok: true,
          candidates: extractSimplifyCandidates(snapshot),
        });
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

      case 'SET_HIGH_CONTRAST': {
        applyHighContrast(Boolean(message.payload.enabled));
        sendResponse({ ok: true });
        return true;
      }

      case 'SET_SIMPLIFIED_UI': {
        applySimplifiedUi(Boolean(message.payload.enabled));
        sendResponse({ ok: true });
        return true;
      }

      case 'SET_FONT_SIZE': {
        applyFontSize(message.payload.fontSize);
        sendResponse({ ok: true });
        return true;
      }

      case 'SET_LOCALE': {
        const { setLocale } = await import('../shared/locale.js');
        setLocale(message.payload.locale);
        sendResponse({ ok: true });
        return true;
      }

      case 'APPLY_DOM_TOOL': {
        const { applyDomTool } = await import('./dom-tools.js');
        const result = await applyDomTool(message.payload);
        sendResponse(result);
        return true;
      }

      case 'APPLY_TRANSFORMATION': {
        const { applyTransformation } = await import('./transformations.js');
        const { showNotification } = await import('./floating-ui.js');
        // Pass a callback that shows notification inside the shadow root.
        const notify = (msg) => showNotification(msg, shadowRoot);
        applyTransformation(message.payload, notify);
        sendResponse({ ok: true });
        return true;
      }

      case 'SUMMARIZE_PAGE': {
        const { applySummarize } = await import('./summarizer.js');
        applySummarize(shadowRoot).catch((error) => {
          console.error('[Page Adapter] Summarize error:', error);
        });
        sendResponse({ ok: true });
        return true;
      }

      default: {
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
// Initialize – apply stored preferences and create floating button
// =============================================================================

(async function initContent() {
  const { loadPreferences } = await import('../shared/preferences.js');
  const prefs = await loadPreferences();
  applyTheme(prefs.theme);
  applyHighContrast(prefs.highContrast);
  applySimplifiedUi(prefs.simplifiedUi);
  applyFontSize(prefs.fontSize);

  // Load locale module and set the locale.
  const { setLocale } = await import('../shared/locale.js');
  setLocale(prefs.locale);

  // Inject the floating button inside the shadow root.
  const { createFloatingButton } = await import('./floating-button.js');
  createFloatingButton(shadowRoot);
})();