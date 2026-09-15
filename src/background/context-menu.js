/**
 * @fileoverview Context menu creation and click handling.
 * Dependencies: shared/constants.js.
 * Used by: background.js.
 */

import { PRESETS } from '../shared/constants.js';

// =============================================================================
// Constants
// =============================================================================

const PARENT_MENU_ID = 'page_adapter';
const OPEN_PANEL_ID = 'open_panel';

// =============================================================================
// Public API
// =============================================================================

/**
 * Sets up the extension's context menu items.
 * Called during installation or update.
 *
 * @returns {Promise<void>}
 */
export async function setupContextMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: PARENT_MENU_ID,
    title: 'Page Adapter',
    contexts: ['page'],
  });

  for (const preset of PRESETS) {
    // Presets that require free-form input cannot be triggered from a
    // context menu; they are exposed from the floating panel instead.
    if (preset.requiresInput) {
      continue;
    }
    chrome.contextMenus.create({
      id: `preset_${preset.id}`,
      parentId: PARENT_MENU_ID,
      title: preset.label,
      contexts: ['page'],
    });
  }

  chrome.contextMenus.create({
    id: 'separator',
    parentId: PARENT_MENU_ID,
    type: 'separator',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: OPEN_PANEL_ID,
    parentId: PARENT_MENU_ID,
    title: 'Open Page Adapter panel',
    contexts: ['page'],
  });
}

/**
 * Handles clicks on context menu items.
 *
 * @param {chrome.contextMenus.OnClickData} info - Context menu click data.
 * @param {chrome.tabs.Tab} tab - The active tab when the menu was clicked.
 * @returns {Promise<void>}
 */
export async function onContextMenuClicked(info, tab) {
  if (info.menuItemId === OPEN_PANEL_ID) {
    chrome.action.openPopup();
    return;
  }

  const match = info.menuItemId.match(/^preset_(.+)$/);
  if (!match) {
    return;
  }

  const presetId = match[1];
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset || preset.requiresInput) {
    return;
  }

  const { createUserRequest } = await import('../shared/messages.js');
  const { handleUserRequest } = await import('./user-request.js');

  const message = createUserRequest({
    mode: 'preset',
    request: preset.request,
    presetId: preset.id,
  });

  try {
    await handleUserRequest(message, tab);
  } catch (error) {
    console.error('[Page Adapter] Context menu error:', error);
  }
}