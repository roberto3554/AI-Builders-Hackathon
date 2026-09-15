/**
 * @fileoverview Spanish locale strings for the Page Adapter extension.
 * Dependencies: none.
 * Used by: locale.js.
 */

export default {
  // ===========================================================================
  // Popup UI
  // ===========================================================================
  'popup.title': 'Adaptador de Página',
  'popup.quick_actions': 'Acciones rápidas',
  'popup.write_need': 'O escribe lo que necesitas',
  'popup.placeholder': 'Ej.: Haz esta página más simple y oculta elementos no esenciales.',
  'popup.adapt_button': 'Adaptar',
  'popup.counter': '{{current}} / {{max}}',
  'popup.status.default': 'Escribe una necesidad o selecciona una acción rápida.',
  'popup.status.sending': 'Enviando solicitud…',
  'popup.status.success': 'Solicitud enviada a la página.',
  'popup.error.generic': 'Ocurrió un error.',
  'popup.cancel_button': 'Cancelar',

  // ===========================================================================
  // Popup – Preferences
  // ===========================================================================
  'popup.preferences.language': 'Idioma',
  'popup.preferences.theme': 'Tema',
  'popup.preferences.settings': 'Ajustes',
  'popup.preferences.ollama_model': 'Modelo de Ollama',
  'popup.preferences.high_contrast': 'Alto contraste',
  'popup.preferences.simplified_ui': 'Interfaz simplificada',
  'popup.preferences.font_size': 'Tamaño de fuente',
  'popup.preferences.font_size_small': 'Pequeña',
  'popup.preferences.font_size_medium': 'Mediana',
  'popup.preferences.font_size_large': 'Grande',
  'popup.preferences.theme_system': 'Sistema',
  'popup.preferences.theme_light': 'Claro',
  'popup.preferences.theme_dark': 'Oscuro',
  'popup.preferences.language_en': 'Inglés',
  'popup.preferences.language_es': 'Español',
  'popup.preferences.language_system': 'Sistema',

  // ===========================================================================
  // Popup – Presets
  // ===========================================================================
  'preset.high_contrast': 'Alto contraste',
  'preset.search': 'Buscar',
  'preset.simplify': 'Simplificar',
  'preset.summarize': 'Resumir',

  // ===========================================================================
  // Popup – Info
  // ===========================================================================
  'popup.info.description': 'Esta extensión te permite adaptar páginas web a tus necesidades. Para usarla, haz clic en el botón de encendido que aparece en la página.',
  'popup.info.version': 'Versión: {{version}}',

  // ===========================================================================
  // Content – Quick menu
  // ===========================================================================
  'quick_menu.open_button': 'Abrir Adaptador de Página',
  'quick_menu.open_menu': 'Abrir menú',
  'quick_menu.stop_action': 'Detener la acción actual',

  // ===========================================================================
  // Content – Summaries
  // ===========================================================================
  'summary.generating': 'Generando resumen…',
  'summary.debug_mode': '⚠️ **Modo de depuración activado** – este es un texto de ejemplo para probar el renderizado de Markdown.',
  'summary.error': 'Error al generar el resumen. Inténtalo de nuevo más tarde.',

  // ===========================================================================
  // Content – Chat
  // ===========================================================================
  'chat.section_title': 'Conversación',
  'chat.input_label': 'Haz una pregunta',
  'chat.input_placeholder': 'Haz una pregunta sobre el contenido…',
  'chat.send_button': 'Preguntar',
  'chat.error': 'Error: {{message}}',

  // ===========================================================================
  // Content – Notifications & Overlays
  // ===========================================================================
  'notification.high_contrast': 'Modo de alto contraste activado',
  'notification.simplified': 'Modo simplificado activado',

  // ===========================================================================
  // Background – Errors
  // ===========================================================================
  'error.no_active_tab': 'No se pudo determinar la pestaña activa.',
  'error.unsupported_page': 'Esta página no permite la inyección de scripts.',
  'error.injection_failed': 'No se pudo establecer comunicación con el script de contenido. Intenta recargar la página.',
  'error.ollama_connection': 'No se pudo conectar con el servicio Ollama. Asegúrate de que esté ejecutándose en {{url}}.',
  'error.ollama_generic': 'Error al generar el resumen: {{message}}',
  'error.dom_adaptation_generic': 'Error al adaptar la página: {{message}}',
  'error.chat_generic': 'Error al responder la pregunta: {{message}}',
  'error.send_to_tab': 'No se puede interactuar con esta página. Prueba con una página web normal y recarga después de instalar la extensión.',

  // ===========================================================================
  // Content – Simplify
  // ===========================================================================
  'simplify.summary_hidden': 'Página simplificada ocultando {{count}} elemento(s) no esencial(es).',
  'simplify.summary_updated': 'Página simplificada ocultando {{hidden}} elemento(s) y acortando {{summarized}} elemento(s).',
  'simplify.no_changes': 'No fue necesario ningún cambio.',

    // ===========================================================================
  // Content – Search
  // ===========================================================================
  'search.no_query': 'Escribe lo que buscas en el campo de texto y pulsa Buscar.',
  'search.input_placeholder': '¿Qué estás buscando?',
  'search.input_label': 'Consulta de búsqueda',
  'search.submit_button': 'Buscar',
  'search.summary_found': 'Se resaltaron {{count}} elemento(s) que coinciden con tu búsqueda.',
  'search.summary_not_found': 'No se encontró ningún elemento que coincida en esta página.',
  'search.summary_cancelled': 'Búsqueda cancelada por el usuario.',
};