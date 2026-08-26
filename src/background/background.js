/**
 * @fileoverview Entry point for the Page Adapter background service worker.
 * Registers runtime and context menu listeners.
 * Dependencies: context-menu.js, message-handler.js.
 * Used by: manifest.json.
 */

import { setupContextMenu, onContextMenuClicked } from './context-menu.js';
import { onRuntimeMessage } from './message-handler.js';

// =============================================================================
// Initialization
// =============================================================================

// Set up context menu on installation or update.
chrome.runtime.onInstalled.addListener(setupContextMenu);

// Register context menu click handler.
chrome.contextMenus.onClicked.addListener(onContextMenuClicked);

// Register runtime message listener.
chrome.runtime.onMessage.addListener(onRuntimeMessage);