/**
 * @fileoverview English locale strings for the Page Adapter extension.
 * Dependencies: none.
 * Used by: locale.js.
 */

export default {
  // ===========================================================================
  // Popup UI
  // ===========================================================================
  'popup.title': 'Page Adapter',
  'popup.quick_actions': 'Quick actions',
  'popup.write_need': 'Or write what you need',
  'popup.placeholder': 'E.g.: Make this page simpler and hide non‑essential elements.',
  'popup.adapt_button': 'Adapt',
  'popup.counter': '{{current}} / {{max}}',
  'popup.status.default': 'Type a need or select a quick action.',
  'popup.status.sending': 'Sending request…',
  'popup.status.success': 'Request sent to the page.',
  'popup.error.generic': 'An error occurred.',
  'popup.cancel_button': 'Cancel',

  // ===========================================================================
  // Popup – Preferences
  // ===========================================================================
  'popup.preferences.language': 'Language',
  'popup.preferences.theme': 'Theme',
  'popup.preferences.settings': 'Settings',
  'popup.preferences.ollama_model': 'Ollama model',
  'popup.preferences.high_contrast': 'High contrast',
  'popup.preferences.simplified_ui': 'Simplified interface',
  'popup.preferences.font_size': 'Font size',
  'popup.preferences.font_size_small': 'Small',
  'popup.preferences.font_size_medium': 'Medium',
  'popup.preferences.font_size_large': 'Large',
  'popup.preferences.theme_system': 'System',
  'popup.preferences.theme_light': 'Light',
  'popup.preferences.theme_dark': 'Dark',
  'popup.preferences.language_en': 'English',
  'popup.preferences.language_es': 'Spanish',
  'popup.preferences.language_system': 'System',

  // ===========================================================================
  // Popup – Presets
  // ===========================================================================
  'preset.high_contrast': 'High contrast',
  'preset.search': 'Search',
  'preset.simplify': 'Simplify',
  'preset.summarize': 'Summarize',

  // ===========================================================================
  // Popup – Info
  // ===========================================================================
  'popup.info.description': 'This extension allows you to adapt web pages to your needs. To use it, click the power button that appears on the page.',
  'popup.info.version': 'Version: {{version}}',

  // ===========================================================================
  // Content – Quick menu
  // ===========================================================================
  'quick_menu.open_menu': 'Open menu',

  // ===========================================================================
  // Content – Summaries
  // ===========================================================================
  'summary.generating': 'Generating summary…',
  'summary.debug_mode': '⚠️ **Debug mode enabled** – this is a sample text to test Markdown rendering.',
  'summary.error': 'Failed to generate AI summary. Please try again later.',

  // ===========================================================================
  // Content – Chat
  // ===========================================================================
  'chat.section_title': 'Conversation',
  'chat.input_label': 'Ask a question',
  'chat.input_placeholder': 'Ask a question about the content…',
  'chat.send_button': 'Ask',
  'chat.error': 'Error: {{message}}',

  // ===========================================================================
  // Content – Notifications & Overlays
  // ===========================================================================
  'notification.high_contrast': 'High contrast mode activated',
  'notification.simplified': 'Simplified mode activated',

  // ===========================================================================
  // Background – Errors
  // ===========================================================================
  'error.no_active_tab': 'Unable to determine the active tab.',
  'error.unsupported_page': 'This page does not allow script injection.',
  'error.injection_failed': 'Failed to establish communication with the content script. Try reloading the page and try again.',
  'error.ollama_connection': 'Unable to connect to the Ollama service. Please ensure it is running at {{url}}.',
  'error.ollama_generic': 'Failed to generate summary: {{message}}',
  'error.dom_adaptation_generic': 'Failed to adapt the page: {{message}}',
  'error.chat_generic': 'Failed to answer question: {{message}}',
  'error.send_to_tab': 'Unable to interact with this page. Try a normal webpage and reload after installing the extension.',

  // ===========================================================================
  // Content – Simplify
  // ===========================================================================
  'simplify.summary_hidden': 'Simplified the page by hiding {{count}} non-essential element(s).',
  'simplify.summary_updated': 'Simplified the page by hiding {{hidden}} element(s) and shortening {{summarized}} element(s).',
  'simplify.no_changes': 'No changes were needed.',

    // ===========================================================================
  // Content – Search
  // ===========================================================================
  'search.no_query': 'Type what you are looking for in the input field, then click Search.',
  'search.input_placeholder': 'What are you looking for?',
  'search.input_label': 'Search query',
  'search.submit_button': 'Search',
  'search.summary_found': 'Highlighted {{count}} element(s) matching your query.',
  'search.summary_not_found': 'No matching element was found on this page.',
  'search.summary_cancelled': 'Search cancelled by user.',
};