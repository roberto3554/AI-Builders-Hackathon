# UI/UX Design Guidelines for Page Adapter

This document defines the visual, interaction, and accessibility standards for the **Page Adapter** browser extension. All user interfaces—popup, content panels, notifications, and any other UI elements—must comply with these guidelines to ensure a cohesive, professional, and accessible experience.

The extension’s core mission is to adapt web pages to user needs, with a strong emphasis on **accessibility**. Therefore, the UI itself must be a model of inclusive design, supporting high contrast, dark/light themes, scalable text and icons, keyboard navigation, and screen reader compatibility.

---

## 1. General Principles

- **Accessibility first**: Every design decision must prioritise usability for people with diverse abilities. This includes vision, motor, and cognitive impairments.
    
- **Clarity and simplicity**: Interfaces should be clean, uncluttered, and easy to understand at a glance.
    
- **Consistency**: Reuse the same UI patterns, colours, and behaviours across all components to build user familiarity.
    
- **Professionalism**: The UI must look polished and trustworthy, reflecting the quality of the extension.
    
- **Responsive**: All UI elements must adapt gracefully to different window sizes, zoom levels, and screen resolutions.
    
- **User control**: Users should be able to adjust font size, contrast, and colour scheme according to their preferences.
    

---

## 2. Colour Palette

The colour system is designed to be accessible, with sufficient contrast ratios (WCAG 2.1 AA or higher). It supports both light and dark themes.

### 2.1 Base Colours (Light Theme)

|Role|Hex|Usage|
|---|---|---|
|Background (surface)|`#ffffff`|Main panels, popups, cards|
|Background (subtle)|`#f8fafc`|Section backgrounds, input fields|
|Surface (elevated)|`#ffffff`|Floating windows, tooltips, modals|
|Primary text|`#111827`|Headings, body text|
|Secondary text|`#6b7280`|Labels, placeholders, helper texts|
|Muted text|`#9ca3af`|Disabled text, counters, timestamps|
|Border|`#e5e7eb`|Dividers, input borders, card outlines|
|Border (focus)|`#60a5fa`|Focus rings, active states|
|Primary action|`#2563eb`|Buttons, links, active icons|
|Primary hover|`#1d4ed8`|Hover state for primary actions|
|Success|`#16a34a`|Success messages, confirmed actions|
|Warning|`#f59e0b`|Warnings, pending states|
|Error|`#dc2626`|Errors, destructive actions|

### 2.2 Dark Theme

For dark mode, invert the lightness while maintaining contrast ratios:

|Role|Hex|
|---|---|
|Background (surface)|`#1e293b`|
|Background (subtle)|`#0f172a`|
|Surface (elevated)|`#334155`|
|Primary text|`#f1f5f9`|
|Secondary text|`#94a3b8`|
|Muted text|`#64748b`|
|Border|`#475569`|
|Border (focus)|`#60a5fa`|
|Primary action|`#3b82f6`|
|Primary hover|`#2563eb`|
|Success|`#22c55e`|
|Warning|`#f59e0b`|
|Error|`#ef4444`|

### 2.3 High Contrast Mode

When the user’s system is in high-contrast mode (or the extension’s own high-contrast setting is enabled), use the following simplified palette:

- **Background**: `#000000` or `#ffffff` (depending on system setting)
    
- **Text**: `#ffffff` or `#000000`
    
- **Links & buttons**: `#ffff00` (yellow) or `#0000ff` (blue) with underlines
    
- **Borders**: `#ffffff` or `#000000` with increased thickness
    
- **Focus indicators**: thick outlines (≥ 2px) with high contrast
    

All interactive elements must remain distinguishable by shape, not only colour.

### 2.4 Theme Switching

- The extension must respect the system’s preferred colour scheme (`prefers-color-scheme`) by default.
    
- Users can override this via a toggle in the popup or options page, with persistent storage.
    
- The toggle should be clearly labelled (e.g., “Dark mode”, “Light mode”, “System default”).
    

---

## 3. Typography and Scalability

### 3.1 Font Family

Use the system’s default sans‑serif font stack to ensure optimal readability and performance:

text

font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

No custom fonts should be loaded unless strictly necessary for a specific feature (e.g., a code block may use monospace).

### 3.2 Font Sizes

Base size for body text is **14px** (1rem = 14px). All other sizes are relative:

- **H1 (page titles)**: 20px
    
- **H2 (section headings)**: 16px
    
- **Body text**: 14px
    
- **Small text (labels, helpers)**: 12px
    
- **Micro text (counters, footnotes)**: 11px
    

All sizes must be defined in `rem` or `em` units to allow user scaling.

### 3.3 Line Height

- Body text: **1.5**
    
- Headings: **1.2**
    

### 3.4 Font Weight

- Regular: `400`
    
- Medium: `500`
    
- Semibold: `600`
    
- Bold: `700`
    

Use bold sparingly for emphasis, not as a default.

### 3.5 Scalability

- All text must be resizable without breaking the layout (zoom up to 200%).
    
- Use `rem` for font sizes, `em` for padding/margins where appropriate.
    
- Buttons and input fields must accommodate larger text without truncation.
    

---

## 4. Spacing and Layout

### 4.1 Spacing Scale

Use a consistent spacing scale based on `4px` increments:

|Token|Value|
|---|---|
|`xs`|4px|
|`sm`|8px|
|`md`|12px|
|`lg`|16px|
|`xl`|20px|
|`2xl`|24px|
|`3xl`|32px|

### 4.2 Padding and Margins

- Popup container: `20px` padding on all sides.
    
- Section spacing: `22px` between sections.
    
- Card/preset padding: `9px 10px`.
    
- Input fields: `12px` padding.
    

### 4.3 Border Radius

- **Small elements** (buttons, badges): `8px`
    
- **Medium elements** (cards, inputs): `10px`
    
- **Large elements** (panels, popups): `16px`
    

### 4.4 Box Shadows

Use shadows to elevate floating elements:

- **Popup / modal**: `0 18px 50px rgba(0,0,0,0.2)`
    
- **Hover effect**: `0 8px 30px rgba(0,0,0,0.12)`
    
- **Focus ring**: `0 0 0 3px rgba(96,165,250,0.15)`
    

---

## 5. Components

### 5.1 Buttons

- **Primary button**: Solid background (`#2563eb`), white text, bold weight, border-radius `9px`, padding `9px 16px`.
    
- **Hover**: Darken background to `#1d4ed8`.
    
- **Disabled**: Reduce opacity to `0.55`, change cursor to `not-allowed`.
    
- **Focus**: Show a visible focus ring (`outline: 2px solid #60a5fa; outline-offset: 2px`).
    
- **Secondary / ghost buttons** (e.g., close buttons): Transparent background, subtle hover (`#f3f4f6`).
    

### 5.2 Input Fields (Textareas, Text Inputs)

- **Background**: `#ffffff` (or dark theme equivalent).
    
- **Border**: `1px solid #d1d5db`, border-radius `10px`.
    
- **Padding**: `12px`.
    
- **Focus**: Border colour changes to `#60a5fa`, with a box-shadow glow.
    
- **Placeholder**: Use secondary text colour (`#6b7280`).
    
- **Disabled**: `opacity: 0.55`, cursor `not-allowed`.
    
- **Character counter**: Use muted text (`#9ca3af`), positioned below the input, aligned right.
    

### 5.3 Preset Buttons

- Display as a grid (two columns).
    
- Each preset is a button with an icon and a label.
    
- Background: `#ffffff`, border `1px solid #e5e7eb`, border-radius `10px`.
    
- Hover: Background changes to `#f1f5f9`, border to `#cbd5e1`.
    
- Icon container: `24px` square, background `#eff6ff`, rounded `7px`, centred icon.
    
- Label: Use body font size.
    

### 5.4 Status Messages

- Positioned below the action area.
    
- Font size: `12px`, colour `#6b7280`.
    
- **Error**: `#dc2626`.
    
- **Success**: `#16a34a`.
    
- The status element should have `aria-live="polite"` for screen readers.
    

---

## 6. Windows and Panels

### 6.1 Popup

- **Fixed size**: `width: 360px`, `min-height: 420px`.
    
- **Not resizable** (the popup is a small utility window).
    
- Opens from the toolbar icon.
    
- Contains presets and a text input for custom requests.
    
- Must close automatically after a successful request (with a short delay to show status).
    

### 6.2 Floating Panels (Content Script)

- **Draggable**: The panel can be dragged by its title bar.
    
- **Default position**: Centered on the page (`top: 50%; left: 50%; transform: translate(-50%, -50%)`).
    
- **Size**: `width: min(600px, calc(100vw - 40px))`, `max-height: 80vh`.
    
- **Resizable**: Users may resize the panel by dragging the bottom-right corner (if feasible). For simplicity, the initial version can have a fixed width and height with overflow scrolling.
    
- **Scrollable content**: The body area scrolls independently of the title bar.
    
- **Close button**: A simple "×" button in the top-right corner of the title bar.
    
- **Chat mode**: When chat is enabled, a message list and an input bar appear at the bottom of the panel.
    

### 6.3 Notifications (Toast)

- **Fixed position**: Bottom‑center of the page (`bottom: 20px; left: 50%; transform: translateX(-50%)`).
    
- **Duration**: Appears for `3 seconds`, then fades out.
    
- **Style**: Dark background (`#1f2937`), white text, border-radius `8px`, padding `10px 20px`.
    
- Do not use notifications for critical errors; use the floating panel or popup status for that.
    

### 6.4 Overlay Modals

- Used for simple explanations or long‑form content.
    
- Centered, with a semi‑transparent backdrop (`rgba(0,0,0,0.5)`).
    
- Inner container: white background, `border-radius: 12px`, `padding: 24px`, `max-width: 600px`.
    
- Close by clicking the backdrop or the close button.
    

---

## 7. Iconography

### 7.1 Use of Icons

- Icons are used to visually reinforce actions and categories.
    
- They **must** be accompanied by text labels, except in cases where the icon is universally recognised (e.g., close button “×”).
    
- Icons must be **SVG** files, stored in `src/assets/icons/`.
    
- Each icon must have a descriptive `alt` attribute or be hidden from screen readers (`aria-hidden="true"`) when decorative.
    

### 7.2 Icon Size

- Preset icons: `24px × 24px`.
    
- Action icons (close, settings): `20px × 20px`.
    
- Status icons: `16px × 16px`.
    

### 7.3 Icon Colours

- Icons should inherit the text colour or use a specific semantic colour (e.g., blue for primary actions, green for success).
    
- Avoid hard‑coding icon colours; use CSS `fill="currentColor"` where possible.
    

---

## 8. States and Feedback

### 8.1 Loading State

- Disable all interactive elements (presets, adapt button, send button) during async operations.
    
- Show a status message: “Sending request…” or “Generating summary…”.
    
- For long operations, consider a progress indicator (spinner). Use a simple CSS spinner (not a gif) to maintain accessibility.
    

### 8.2 Success State

- Display a success status message in green (e.g., “Request sent to the page.”).
    
- For popup actions, close the popup after a short delay (350 ms) so the user sees the confirmation.
    

### 8.3 Error State

- Display an error message in red, either in the status area or within the floating panel.
    
- Error messages must be user‑friendly and actionable: e.g., “Failed to generate summary. Please check your internet connection and try again.”
    
- Do not show technical stack traces to end‑users; log them to the console for developers.
    

### 8.4 Empty / Initial State

- The popup textarea should have a placeholder: “E.g.: Make this page simpler…”.
    
- The chat panel should show an initial assistant message like “Generating summary…” or a welcome message.
    

---

## 9. Accessibility (A11y)

This is the cornerstone of the extension. All UI must meet **WCAG 2.1 AA** as a minimum, with AAA where feasible.

### 9.1 Keyboard Navigation

- All interactive elements must be focusable via the keyboard (`tabindex="0"` where needed).
    
- Focus order must follow a logical sequence (top to bottom, left to right).
    
- Provide visible focus indicators (outline or background change).
    
- Support `Enter` / `Space` to activate buttons and links.
    
- Support `Escape` to close modals, panels, and the popup.
    
- In chat mode, `Enter` should send the message (or `Shift+Enter` for new line).
    

### 9.2 Screen Reader Compatibility

- Use semantic HTML elements (`button`, `input`, `textarea`, `h1`, `p`, etc.).
    
- Provide `aria-label` or `aria-labelledby` for elements without visible text.
    
- Use `aria-live="polite"` for status updates.
    
- Use `role="dialog"` for modal panels.
    
- Ensure all images have `alt` text; decorative icons have `aria-hidden="true"`.
    

### 9.3 Colour Contrast

- Minimum contrast ratio of **4.5:1** for normal text, **3:1** for large text (18px+).
    
- Provide a **high‑contrast mode** that overrides all colours to black/white/yellow/blue as described in section 2.3.
    
- The high‑contrast mode must be toggleable by the user and respect system high‑contrast settings if possible.
    

### 9.4 Scaling and Zoom

- The UI must remain functional and readable when zoomed to **200%**.
    
- No horizontal scrolling should occur at 200% zoom.
    
- Use relative units (`rem`, `em`, `%`) for layout and font sizes.
    

### 9.5 Reduced Motion

- Respect the user’s `prefers-reduced-motion` setting.
    
- If animations are used (e.g., fade‑in, spinner), provide a reduced‑motion alternative or disable animations when the setting is detected.
    

### 9.6 Focus Management

- When a panel opens, move focus to the first interactive element (or the panel itself with `aria-describedby`).
    
- When a panel closes, return focus to the element that triggered it (e.g., the preset button).
    

---

## 10. Animations and Transitions

Use subtle, short animations to provide feedback without being distracting.

- **Fade in/out**: `opacity` transition with `duration 150ms` and `ease-in-out`.
    
- **Slide in/out** for panels: use `transform: translateY(-10px)` with `opacity`, duration `200ms`.
    
- **Spinner**: A rotating circular SVG, 16–24px, with a smooth `linear` infinite rotation.
    
- **Focus ring**: `box-shadow` transition on focus, duration `150ms`.
    

Animations must be disabled when `prefers-reduced-motion` is set.

---

## 11. Messages and Notifications

### 11.1 User‑Facing Messages

All messages should be:

- **Clear**: Use plain language, avoid jargon.
    
- **Concise**: Get to the point quickly.
    
- **Actionable**: Tell the user what to do next if needed.
    
- **Neutral / professional**: No emojis, no informal language.
    

Examples:

- “Request sent to the page.” (success)
    
- “Failed to generate summary. Please try again.” (error)
    
- “Type a need or select a quick action.” (placeholder)
    

### 11.2 Error Messages

- **Network errors**: “Unable to connect to the Ollama service. Please ensure it is running at [http://localhost:11434](http://localhost:11434/).”
    
- **Injection errors**: “Failed to interact with this page. Try reloading the page.”
    
- **Generic errors**: “Something went wrong. Please try again.”
    

Do not show raw exception messages.

---

## 12. Content and Copy

- All UI labels, button texts, placeholders, and instructions must be in **English** (as per project conventions).
    
- Use consistent terminology: “Adapt”, “Request”, “Preset”, “Summarize”, “Simplify”, etc.
    
- Keep copy concise but informative.
    

---

## 13. Performance and Usability

- **Fast interactions**: The UI should respond within 100ms for local operations (e.g., updating the counter).
    
- **Asynchronous feedback**: For network requests, show a loading state immediately to avoid perceived delay.
    
- **Lazy loading**: Do not load heavy libraries (like marked) unless needed; the content script loads them dynamically.
    
- **Memory**: Avoid leaking DOM elements; clean up panels and notifications when they are removed.
    

---

## 14. Testing and Validation

All UI changes must be tested for:

- Keyboard navigation (all interactive elements reachable and operable).
    
- Screen reader compatibility (NVDA, VoiceOver, or similar).
    
- Colour contrast (using tools like axe, Lighthouse, or contrast checkers).
    
- Zoom up to 200% without breaking layout.
    
- Dark and light themes.
    
- High‑contrast mode.
    
- Reduced motion.
    

---

## 15. Implementation Guidelines

### 15.1 CSS Variables

Define all colours, spacing, and font sizes as CSS custom properties to facilitate theming.

Example:

css

:root {
  --color-background: #ffffff;
  --color-text-primary: #111827;
  --color-primary: #2563eb;
  --font-size-base: 14px;
  /* ... */
}
.dark {
  --color-background: #1e293b;
  --color-text-primary: #f1f5f9;
  /* ... */
}

### 15.2 Class Naming

Use BEM or a similar methodology to keep styles modular and avoid conflicts. Prefix all content‑script styles with `.page-adapter-` to avoid clashing with the page’s styles.

### 15.3 Responsive Design

- Use `min()`, `max()`, and `clamp()` for fluid sizing.
    
- Use `flexbox` and `grid` for layout.
    
- Avoid fixed pixel widths for containers where possible.
    

---

## 16. Summary of Key UI/UX Rules

|Aspect|Rule|
|---|---|
|Colour contrast|≥ 4.5:1 for normal text, high‑contrast mode available|
|Font sizes|Base 14px, scalable with `rem`|
|Spacing|4px grid, consistent padding and margins|
|Popup size|360px × min 420px, fixed|
|Floating panel size|max 600px wide, max‑height 80vh, draggable|
|Notifications|Bottom‑center, auto‑dismiss after 3s|
|Icons|SVG, with text label, accessible|
|Keyboard navigation|Full support, focus indicators, `Esc` to close|
|Screen readers|Semantic HTML, ARIA attributes|
|Animations|Subtle, respect `prefers-reduced-motion`|
|Errors|User‑friendly, no stack traces, logged to console|
|Theming|Light/dark/system, high‑contrast toggle|
|Loading states|Disable interactions, show status message|

---

## 17. Final Remarks

These guidelines are mandatory for all UI/UX work on the Page Adapter extension. They ensure a consistent, accessible, and professional experience for all users, regardless of ability or device.

When in doubt, prioritise accessibility and clarity over visual novelty. If a new pattern is needed, discuss it with the team and update this document accordingly.