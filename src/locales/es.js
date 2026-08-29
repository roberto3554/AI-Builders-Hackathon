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
  'popup.subtitle': 'Adapta la página a tus necesidades.',
  'popup.quick_actions': 'Acciones rápidas',
  'popup.write_need': 'O escribe lo que necesitas',
  'popup.placeholder': 'Ej.: Haz esta página más simple y oculta elementos no esenciales.',
  'popup.adapt_button': 'Adaptar',
  'popup.counter': '{{current}} / {{max}}',
  'popup.status.default': 'Escribe una necesidad o selecciona una acción rápida.',
  'popup.status.sending': 'Enviando solicitud…',
  'popup.status.success': 'Solicitud enviada a la página.',
  'popup.error.generic': 'Ocurrió un error.',

  // ===========================================================================
  // Popup – Preferences
  // ===========================================================================
  'popup.preferences.language': 'Idioma',
  'popup.preferences.theme': 'Tema',
  'popup.preferences.settings': 'Ajustes',
  'popup.preferences.ollama_model': 'Modelo de Ollama',
  'popup.preferences.high_contrast': 'Alto contraste',
  'popup.preferences.simplified_ui': 'Interfaz simplificada',
  'popup.preferences.theme_system': 'Sistema',
  'popup.preferences.theme_light': 'Claro',
  'popup.preferences.theme_dark': 'Oscuro',
  'popup.preferences.language_en': 'Inglés',
  'popup.preferences.language_es': 'Español',
  'popup.preferences.language_system': 'Sistema',

  // ===========================================================================
  // Popup – Presets
  // ===========================================================================
  'preset.simplify': 'Simplificar',
  'preset.summarize': 'Resumir',
  'preset.explain': 'Explicar',
  'preset.translate': 'Traducir',

  // ===========================================================================
  // Popup – Info
  // ===========================================================================
  'popup.info.description': 'Esta extensión te permite adaptar páginas web a tus necesidades. Para usarla, haz clic en el botón de encendido que aparece en la página.',
  'popup.info.version': 'Versión: {{version}}',

  // ===========================================================================
  // Content – Summaries
  // ===========================================================================
  'summary.generating': 'Generando resumen…',
  'summary.debug_mode': '⚠️ **Modo de depuración activado** – este es un texto de ejemplo para probar el renderizado de Markdown.',
  'summary.error': 'Error al generar el resumen. Inténtalo de nuevo más tarde.',

  // ===========================================================================
  // Content – Chat
  // ===========================================================================
  'chat.input_placeholder': 'Haz una pregunta sobre el contenido…',
  'chat.send_button': 'Preguntar',
  'chat.error': 'Error: {{message}}',

  // ===========================================================================
  // Content – Notifications & Overlays
  // ===========================================================================
  'notification.simplified': 'Modo simplificado activado',
  'notification.translated': 'Idioma cambiado a español (simulado)',
  'notification.explanation': 'Explicación: {{text}}… (simplificada)',

  // ===========================================================================
  // Background – Errors
  // ===========================================================================
  'error.no_active_tab': 'No se pudo determinar la pestaña activa.',
  'error.unsupported_page': 'Esta página no permite la inyección de scripts.',
  'error.injection_failed': 'No se pudo establecer comunicación con el script de contenido. Intenta recargar la página.',
  'error.ollama_connection': 'No se pudo conectar con el servicio Ollama. Asegúrate de que esté ejecutándose en {{url}}.',
  'error.ollama_generic': 'Error al generar el resumen: {{message}}',
  'error.chat_generic': 'Error al responder la pregunta: {{message}}',
  'error.send_to_tab': 'No se puede interactuar con esta página. Prueba con una página web normal y recarga después de instalar la extensión.',
};