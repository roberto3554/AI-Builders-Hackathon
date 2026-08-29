# Code Convention Guide for Page Adapter Extension

This document defines the mandatory coding conventions and project structure for all JavaScript files and related resources in the **Page Adapter** browser extension.

All code, including variable names, function names, comments, documentation, message types, and user-facing developer documentation, must be written in **English**.

The goal is to maintain a codebase that is readable, predictable, maintainable, professional, and easy for any contributor to understand.

---

## 1. General Principles

- **Readability first**: Code should be self-documenting whenever possible and complemented by clear, concise comments when necessary.
- **Consistency**: All files must follow the same rules for indentation, naming, spacing, structure, and documentation.
- **Modern JavaScript**: Use modern ES6+ features such as `const`/`let`, arrow functions, classes, template literals, destructuring, modules, and `async`/`await`.
- **Modularity**: Each file should have a clear and focused responsibility.
- **Single responsibility**: Avoid large files or modules that combine unrelated functionality.
- **Explicit dependencies**: Dependencies should be clearly declared through imports rather than hidden or implicit coupling.
- **Minimal complexity**: Prefer simple and explicit solutions over clever or unnecessarily complex implementations.
- **No unnecessary abstractions**: Do not introduce a helper, class, or abstraction unless it provides a clear benefit.
- **Professional codebase**: Production code must remain clean and professional. Avoid informal, temporary, or conversational annotations.

---

## 2. Project and Directory Structure

The project must follow a predictable directory structure. Files should be placed according to their responsibility rather than grouped arbitrarily.

Recommended structure:

````text
page-adapter/
├── src/
│   ├── background/
│   │   ├── background.js
│   │   └── ...
│   │
│   ├── content/
│   │   ├── content.js
│   │   └── ...
│   │
│   ├── popup/
│   │   ├── popup.js
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── ...
│   │
│   ├── shared/
│   │   ├── constants.js
│   │   ├── messages.js
│   │   └── ...
│   │
│   ├── lib/
│   │   └── ...
│   │
│   └── assets/
│       ├── icons/
│       │   └── ...
│       └── ...
│
├── tests/
│   └── ...
│
├── manifest.json
├── CONVENTIONS.md
└── ...
````

### 2.1 Directory Responsibilities

#### `src/background/`

Contains the extension's background logic and service worker.

Examples:

- Extension lifecycle handling.
    
- Communication between extension components.
    
- Tab-related operations.
    
- Background orchestration.
    
- Persistent extension logic.
    

The background directory must not contain UI-specific code.

#### `src/content/`

Contains content scripts executed in web pages.

Examples:

- DOM interaction.
    
- Page inspection.
    
- Page manipulation.
    
- Communication with the background service worker.
    

Content scripts should contain only logic that requires access to the webpage context.

#### `src/popup/`

Contains everything related to the browser extension popup.

Examples:

- Popup UI.
    
- Popup event handlers.
    
- Popup-specific state.
    
- Popup HTML and CSS.
    

Popup code should communicate with the background or content scripts through the defined messaging APIs rather than directly accessing unrelated modules.

#### `src/shared/`

Contains functionality shared by multiple extension components.

Examples:

- Constants.
    
- Message definitions.
    
- Shared utilities.
    
- Common validation functions.
    
- Shared data structures.
    

Only genuinely shared functionality should be placed here.

#### `src/lib/`

Contains third-party libraries that are required by the extension.

- Third-party code must not be modified unless absolutely necessary.
    
- Custom application logic must not be placed in this directory.
    
- If a third-party library requires modifications, document the reason clearly.
    

#### `src/assets/`

Contains static assets used by the extension.

Examples:

- SVG icons.
    
- Images.
    
- Fonts.
    
- Other static resources.
    

Icons must be stored as actual asset files rather than represented through emoji or text characters.

#### `tests/`

Contains automated tests.

Test files should mirror the structure of the source code whenever practical, making it easy to identify which source module each test covers.

---

## 3. File Structure and Naming

### 3.1 File Names

Use lowercase names with hyphens for multi-word files.

Examples:

```text
background.js
content.js
popup.js
messages.js
tab-manager.js
request-handler.js
storage-utils.js
```

Avoid:

```text
Background.js
backgroundScript.js
background_script.js
TabManager.js
```

### 3.2 JavaScript File Header

Every JavaScript file must begin with a JSDoc comment describing its purpose, dependencies, and known consumers.

Example:

```javascript
/**
 * @fileoverview Handles communication and orchestration for the extension background service.
 * Dependencies: chrome APIs, shared message definitions.
 * Used by: manifest.json and extension components through runtime messaging.
 */
```

The header should be updated whenever the module's responsibilities or dependencies change significantly.

---

## 4. Naming Conventions

|**TypeConventionExample**|||
|---|---|---|
|Variables|`camelCase`|`tabId`|
|Parameters|`camelCase`|`userRequest`|
|Object properties|`camelCase`|`activeTab`|
|Constants|`UPPER_SNAKE_CASE`|`MAX_RETRIES`|
|Functions|`camelCase`, preferably verb-based|`getTabContext()`|
|Classes|`PascalCase`|`RequestHandler`|
|Files|`kebab-case`|`tab-manager.js`|
|Private class methods/fields|`#` prefix|`#injectScripts()`|
|Message types|`UPPER_SNAKE_CASE`|`GET_TAB_CONTEXT`|

Names must clearly describe what the value or function represents.

Prefer:

```javascript
const activeTabId = tab.id;
```

Over:

```javascript
const id = tab.id;
```

Avoid meaningless names such as:

```javascript
const x = ...;
const temp = ...;
const data = ...;
const stuff = ...;
```

unless their meaning is genuinely clear from the local context.

---

## 5. Indentation and Spacing

- Use **2 spaces** for indentation.
    
- Never use tabs.
    
- Aim for a maximum line length of **100 characters**.
    
- Break long expressions when doing so improves readability.
    
- Opening braces must remain on the same line as the statement.
    
- Closing braces must be on their own line.
    
- Use one space after keywords such as `if`, `for`, `while`, and `catch`.
    
- Use one space before an opening brace.
    
- Use spaces around operators.
    
- Do not use spaces inside parentheses or brackets.
    
- Use one space after commas.
    
- Add blank lines between logical sections.
    
- Separate import groups from application logic with a blank line.
    

Example:

```javascript
if (condition) {
  handleCondition();
} else {
  handleAlternative();
}
```

Correct:

```javascript
const result = calculateValue(input);
```

Incorrect:

```javascript
const result=calculateValue(input);
```

---

## 6. Quotes and Strings

Use **single quotes** for strings by default.

Use double quotes only when the string contains a single quote and using double quotes significantly improves readability.

Use template literals for:

- String interpolation.
    
- Multi-line strings.
    
- Strings that are dynamically constructed.
    

Examples:

```javascript
const message = 'Hello world';
const interpolated = `Hello ${name}`;
const description = `
  This is a multi-line string.
`;
```

Avoid template literals for simple static strings:

```javascript
const message = 'Hello world';
```

rather than:

```javascript
const message = `Hello world`;
```

---

## 7. Semicolons

Always use semicolons to terminate statements.

Example:

```javascript
const message = 'Hello world';
sendMessage(message);
```

Do not rely on JavaScript's automatic semicolon insertion.

---

## 8. Variables and Declarations

- Use `const` by default.
    
- Use `let` only when reassignment is required.
    
- Never use `var`.
    
- Declare one variable per statement.
    
- Avoid comma-separated variable declarations.
    
- Keep variables scoped as narrowly as possible.
    
- Avoid mutable state when it is not necessary.
    

Correct:

```javascript
const tabId = tab.id;
const tabUrl = tab.url;
```

Incorrect:

```javascript
const tabId = tab.id, tabUrl = tab.url;
```

---

## 9. Functions

- Prefer named function declarations for top-level functions.
    
- Prefer arrow functions for callbacks and simple anonymous functions.
    
- Use default parameters instead of manually checking for `undefined`.
    
- Keep functions short and focused.
    
- If a function exceeds approximately 30 lines, consider splitting it into smaller functions.
    
- Functions should generally perform one clearly defined task.
    
- Avoid deeply nested logic.
    

Example:

```javascript
/**
 * Retrieves the currently active browser tab.
 *
 * @returns {Promise<chrome.tabs.Tab>} The active browser tab.
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tabs[0];
}
```

For callbacks:

```javascript
const tabIds = tabs.map(tab => tab.id);
```

Avoid anonymous function expressions when a named function would improve readability, except where an anonymous callback or `this` binding is appropriate.

---

## 10. Comments and Documentation

### 10.1 General Rules

Comments must explain **why** something is done when the reason is not obvious from the code.

Do not write comments that merely repeat what the code already says.

Good:

```javascript
// Wait for the page to finish loading before injecting the content script.
await waitForPageLoad(tabId);
```

Poor:

```javascript
// Get tab.
const tab = await getTab();
```

### 10.2 Professional Comment Style

Comments must always be professional, concise, and written in English.

Do **not** use informal or temporary comments such as:

```text
<-- New
<-- Nuevo
NEW!!!
TODO LOL
This is weird
Magic happens here
Don't touch this
```

Avoid comments that look like personal notes, chat messages, commit messages, or temporary development markers.

If something needs to be documented, explain the technical reason clearly.

Prefer:

```javascript
// Keep this timeout aligned with the maximum duration allowed by the
// browser messaging lifecycle.
const MESSAGE_TIMEOUT_MS = 5000;
```

Instead of:

```javascript
// <-- Nuevo
const MESSAGE_TIMEOUT_MS = 5000;
```

### 10.3 Emojis and Emoticons

Do not use emojis, emoticons, decorative Unicode characters, or similar informal symbols in:

- Source-code comments.
    
- Documentation comments.
    
- Log messages.
    
- Error messages.
    
- Developer-facing UI text.
    
- Identifiers.
    
- Constant names.
    

The codebase must maintain a professional and consistent technical style.

If a visual icon is required, **do not use an emoji as a substitute**.

Instead, use the appropriate SVG asset.

For example, instead of:

```javascript
const status = 'Success';
```

use a proper status representation and load the corresponding icon:

```text
src/
└── assets/
    └── icons/
        ├── success.svg
        ├── warning.svg
        └── error.svg
```

The SVG should then be referenced through the application's normal asset-loading mechanism.

### 10.4 JSDoc

Use JSDoc comments for:

- Functions.
    
- Classes.
    
- Complex objects.
    
- Public module APIs.
    
- Non-obvious exported values.
    

For functions, include:

- A brief description.
    
- `@param` for each parameter.
    
- `@returns` when applicable.
    
- `@throws` when the function may throw.
    

Additionally, the following JSDoc tags should be used when appropriate:

- `@example` to provide usage examples.
    
- `@typedef` to define complex object types.
    
- `@enum` for enumerations.
    
- `@see` for references to external documentation or related functions.
    

All JSDoc blocks should follow the official JSDoc standard or the Google Closure Compiler style guide, as they are widely adopted and well-documented.

Example:

```javascript
/**
 * Sends a message to the content script of a specific tab.
 *
 * @param {number} tabId - The ID of the target tab.
 * @param {object} message - The message object to send.
 * @param {string} message.type - The message type.
 * @returns {Promise<object>} The response from the content script.
 * @throws Will throw if the tab is not found or communication fails.
 * @example
 * const response = await sendToContentScript(123, { type: 'PING' });
 */
async function sendToContentScript(tabId, message) {
  // ...
}
```

---

## 11. Imports and Exports

Use ES module syntax:

```javascript
import { getTabContext } from '../shared/tab-context.js';
export { sendMessage };
```

Group imports in the following order:

1. External dependencies.
    
2. Internal shared modules.
    
3. Internal feature-specific modules.
    

Example:

```javascript
import { someLibrary } from 'some-library';

import { MESSAGE_TYPES } from '../shared/messages.js';
import { getStorageValue } from '../shared/storage.js';

import { handleRequest } from './request-handler.js';
```

Guidelines:

- Use named exports when a module exposes multiple related values.
    
- Use a default export when the module has one clear primary value.
    
- Avoid unnecessary default exports.
    
- Avoid side-effect imports unless they are required.
    

Prefer using named exports at the end of the file (e.g., `export { functionA, functionB };`) rather than exporting inline, as this centralizes the public API and improves readability. The only exception is `export default`, which may be placed alongside the class or function definition when it is the primary export of the module.

---

## 12. Async/Await and Promises

Prefer `async`/`await` over raw `.then()` chains because it generally improves readability.

Prefer:

```javascript
async function loadConfiguration() {
  try {
    const configuration = await getConfiguration();
    return configuration;
  } catch (error) {
    console.error('Failed to load configuration:', error);
    throw error;
  }
}
```

Over:

```javascript
function loadConfiguration() {
  return getConfiguration()
    .then(configuration => configuration)
    .catch(error => {
      console.error('Failed to load configuration:', error);
      throw error;
    });
}
```

When working with callback-based Chrome APIs, wrap them in Promises when necessary to maintain a consistent asynchronous programming model.

---

## 13. Error Handling

- Handle errors at the appropriate level.
    
- Use `try/catch` for operations that may throw when the caller can meaningfully handle the error.
    
- Always provide meaningful error messages.
    
- Use `console.error()` for actual errors.
    
- Do not silently swallow exceptions.
    
- Re-throw errors when callers need to handle them.
    
- Return structured error information when appropriate.
    

Good:

```javascript
try {
  await saveConfiguration(configuration);
} catch (error) {
  console.error('Failed to save extension configuration:', error);
  throw error;
}
```

Avoid:

```javascript
try {
  await saveConfiguration(configuration);
} catch (error) {
  // Ignore.
}
```

---

## 14. Objects and Arrays

Use trailing commas in multi-line objects and arrays.

Example:

```javascript
const config = {
  model: 'qwen3.5:2b',
  temperature: 0.7,
  topP: 0.9,
};
```

Use destructuring when accessing multiple properties.

Example:

```javascript
const { id, url, title } = tab;
```

Prefer readable object literals:

```javascript
const message = {
  type: MESSAGE_TYPES.GET_TAB_CONTEXT,
  tabId,
  includeMetadata: true,
};
```

Avoid unnecessary alignment or formatting that makes future changes harder.

---

## 15. Constants and Immutable Data

Constants must use `UPPER_SNAKE_CASE` when they represent immutable configuration or application-wide constant values.

Example:

```javascript
const MAX_RETRIES = 3;
const STORAGE_KEY = 'pageAdapterConfiguration';
```

Constant objects should use `Object.freeze()` when they must not be modified.

Example:

```javascript
const MESSAGE_TYPES = Object.freeze({
  GET_TAB_CONTEXT: 'GET_TAB_CONTEXT',
  UPDATE_PAGE: 'UPDATE_PAGE',
});
```

Do not mutate exported constant objects.

---

## 16. Browser Extension Communication

All communication between extension components must use the appropriate Chrome extension messaging APIs.

Use:

- `chrome.runtime.sendMessage()` for runtime-level communication.
    
- `chrome.tabs.sendMessage()` for communication with a specific tab.
    

Do not create ad-hoc communication mechanisms between extension components unless there is a documented technical reason.

### 16.1 Message Types

All message types must be defined in the shared `messages.js` module.

Example:

```javascript
const MESSAGE_TYPES = Object.freeze({
  GET_TAB_CONTEXT: 'GET_TAB_CONTEXT',
  UPDATE_PAGE: 'UPDATE_PAGE',
  GET_CONFIGURATION: 'GET_CONFIGURATION',
});

export { MESSAGE_TYPES };
```

This avoids duplicated string literals, prevents typos, and makes future refactoring easier.

### 16.2 Message Structure

Messages should use a predictable structure.

Example:

```javascript
const message = {
  type: MESSAGE_TYPES.GET_TAB_CONTEXT,
  payload: {
    includeMetadata: true,
  },
};
```

Message types should be explicit and self-explanatory.

---

## 17. Chrome APIs

When using Chrome extension APIs:

- Handle asynchronous operations correctly.
    
- Use Promises where supported.
    
- Wrap callback-based APIs when necessary.
    
- Handle rejected Promises.
    
- Validate API responses before using them.
    
- Avoid assuming that tabs, windows, storage values, or other resources always exist.
    
- Use `chrome.scripting` to inject content scripts only when required.
    

Examples of APIs requiring careful asynchronous handling include:

- `chrome.storage`
    
- `chrome.tabs`
    
- `chrome.scripting`
    
- `chrome.runtime`
    

---

## 18. Content Script Injection

Content scripts must only be injected when they are actually required.

Use the `chrome.scripting` API where dynamic injection is necessary.

Before injecting a script:

1. Confirm that the target tab is valid.
    
2. Confirm that the page supports script injection.
    
3. Avoid injecting the same functionality repeatedly.
    
4. Handle injection failures.
    
5. Keep page-specific logic inside the content-script layer.
    

Injection logic should remain centralized rather than being duplicated across multiple modules.

---

## 19. UI Icons and Visual Assets

Icons must be represented by proper image assets rather than emojis or emoticons.

The preferred format for interface icons is **SVG**.

Store SVG assets under:

```text
src/
└── assets/
    └── icons/
        ├── success.svg
        ├── warning.svg
        ├── error.svg
        ├── settings.svg
        └── close.svg
```

Do not use:

```javascript
const icon = '🔧';
```

or:

```html
<span>⚠️</span>
```

Instead, reference the corresponding SVG asset through the appropriate HTML, CSS, or JavaScript mechanism.

Icons should have descriptive filenames and should be reusable wherever possible.

---

## 20. File Responsibilities

Every source file should have one primary responsibility.

For example:

```text
background.js
    Responsible for background/service-worker orchestration.

content.js
    Responsible for communication with and manipulation of the webpage.

messages.js
    Responsible for shared message type definitions.

storage.js
    Responsible for storage-related operations.

tab-manager.js
    Responsible for tab-related operations.

request-handler.js
    Responsible for processing a specific category of requests.
```

Avoid creating files that become miscellaneous containers such as:

```text
utils.js
helpers.js
misc.js
common.js
stuff.js
```

If a utility module is genuinely necessary, its responsibility should remain clearly defined. Prefer more specific names when possible.

---

## 21. Separation of Concerns

Keep the following responsibilities separated:

- UI rendering.
    
- DOM manipulation.
    
- Browser API interaction.
    
- Business logic.
    
- Storage.
    
- Messaging.
    
- Configuration.
    
- Constants.
    
- Third-party dependencies.
    

For example, a popup component should not contain complex storage implementation details if those operations can be encapsulated in a shared storage module.

This makes code easier to test, reuse, and maintain.

---

## 22. Avoiding Duplication

Do not duplicate the same logic across multiple files.

If functionality is genuinely shared:

1. Identify the common responsibility.
    
2. Create an appropriately named shared module.
    
3. Export the required functionality.
    
4. Import it from the relevant components.
    

Do not move unrelated functionality into `shared/` merely to avoid duplication.

---

## 23. Temporary Code and TODOs

Temporary code must not be committed without a clear reason.

When a TODO is genuinely required, it must be professional and actionable.

Good:

```javascript
// TODO: Replace the polling mechanism with an event-based implementation.
```

Poor:

```javascript
// TODO: Fix this later!!!
```

Avoid vague comments that do not explain what needs to be changed.

---

## 24. Logging

Logs must be useful for debugging and written in English.

Use:

- `console.error()` for actual errors that need attention.
    
- `console.warn()` for warnings that do not break functionality but should be noted.
    
- `console.debug()` for development-only debugging information.
    

Avoid:

- `console.log()` for production logging, as it clutters the console and can expose sensitive information.
    
- Temporary markers like `console.log('HERE')` or `console.log('WHY DOES THIS HAPPEN???')`.
    

To control logging in production, use a global variable (e.g., `DEBUG`) or a configuration flag that can be set via the extension's settings. For example:

```javascript
const DEBUG = process.env.DEBUG === 'true'; // or a similar mechanism

if (DEBUG) {
  console.debug('Detailed debug information');
}
```

This allows filtering debug messages without removing them from the codebase.

---

## 25. Code Quality

Before considering a change complete, verify that:

- The code follows this convention guide.
    
- Names are descriptive.
    
- There are no unnecessary comments.
    
- There are no informal comments or emoticons.
    
- No emojis are being used as icons.
    
- SVG assets are used for visual icons.
    
- Errors are handled appropriately.
    
- No unnecessary duplication has been introduced.
    
- Functions remain focused.
    
- Imports are correctly organized.
    
- Constants are immutable where appropriate.
    
- Browser API calls handle asynchronous behavior correctly.
    
- Files remain within their defined responsibility.
    
- New files are placed in the appropriate directory.
    

---

## 26. Example of a Well-Structured Module

```javascript
/**
 * @fileoverview Provides tab-related browser operations.
 * Dependencies: Chrome Tabs API.
 * Used by: background service modules.
 */

/**
 * Retrieves the currently active tab.
 *
 * @returns {Promise<chrome.tabs.Tab | undefined>} The active tab.
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tabs[0];
}

/**
 * Retrieves the URL of the currently active tab.
 *
 * @returns {Promise<string | undefined>} The active tab URL.
 */
async function getActiveTabUrl() {
  const activeTab = await getActiveTab();

  return activeTab?.url;
}

export {
  getActiveTab,
  getActiveTabUrl,
};
```

This example demonstrates:

- A professional file header.
    
- English documentation.
    
- Clear naming.
    
- `async`/`await`.
    
- `const`.
    
- Destructuring-friendly APIs.
    
- Proper spacing.
    
- Semicolons.
    
- Focused functions.
    
- Named exports.
    
- No unnecessary comments or informal annotations.
    

---

## 27. Authoritative Project Structure

The following structure should be treated as the default architectural guideline for the extension:

```text
page-adapter/
│
├── src/
│
│   ├── background/
│   │   ├── background.js
│   │   └── ...
│
│   ├── content/
│   │   ├── content.js
│   │   └── ...
│
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   ├── popup.css
│   │   └── ...
│
│   ├── shared/
│   │   ├── constants.js
│   │   ├── messages.js
│   │   ├── storage.js
│   │   └── ...
│
│   ├── lib/
│   │   └── third-party-library/
│
│   └── assets/
│       ├── icons/
│       │   ├── success.svg
│       │   ├── warning.svg
│       │   ├── error.svg
│       │   └── ...
│       └── ...
│
├── tests/
│   ├── background/
│   ├── content/
│   ├── popup/
│   └── shared/
│
├── manifest.json
├── CONVENTIONS.md
└── ...
```

### Directory Rules

- `background/` contains background/service-worker logic.
    
- `content/` contains webpage-specific logic.
    
- `popup/` contains popup UI and its associated logic.
    
- `shared/` contains genuinely reusable application code.
    
- `lib/` contains third-party libraries and must not contain application-specific code.
    
- `assets/` contains static resources such as SVG icons.
    
- `tests/` contains automated tests and should mirror the source structure where practical.
    
- The project root contains project-level configuration and documentation.
    

New directories should only be created when there is a clear architectural reason for them.

---

## 28. Documentation File

This document is stored as:

```text
CONVENTIONS.md
```

in the project root.

`CONVENTIONS.md` is the **authoritative coding and project-structure guide** for all contributors.

When introducing a new convention or architectural pattern, update this document so that the repository remains self-documenting and future contributors can follow the same standards.

All contributions to the Page Adapter extension must comply with the conventions defined in this document.

---

## 29. Separators and Section Dividers

Do not use visual separators such as `------------ Section X ------------` inside source files.

If a file is long enough to need such dividers, consider splitting it into smaller, more focused modules instead. Separators are a code smell that indicates a file is trying to do too much.

In rare cases where a file unavoidably exceeds 500 lines and contains logical sections that cannot be extracted, you may use a single line of dashes or equals signs (e.g., `// ========================================`) to separate major blocks, but this must be an exception, not the norm. Even then, prefer adding a comment that describes the section clearly and ensure there are two blank lines before the separator and one after.

---

## 30. Blank Lines Between Functions and Methods

Maintain consistent vertical spacing to improve readability:

- Leave **one blank line** between consecutive functions or methods.
    
- Leave **two blank lines** between major sections within a file, such as between the exported functions block and the internal helper functions block.
    
- Avoid excessive blank lines (more than two) as they waste vertical space.
    

Example:

```javascript
// Public exports
export function publicFunctionA() { ... }

export function publicFunctionB() { ... }


// Private helpers
function privateHelper() { ... }
```

---

## 31. Maximum File Length

While there is no hard limit, it is strongly recommended to keep source files under **300–400 lines** of code.

Longer files tend to become harder to navigate, test, and maintain. If a file exceeds this range, evaluate whether it can be split into multiple modules based on responsibility.

This recommendation applies to all JavaScript files, including background, content, popup, and shared modules.

---

## 32. Function Order Within a File

To make the structure of a module predictable, order functions inside a file as follows:

1. **Public exports** (main functions that are consumed by other modules). Place these either at the top or at the bottom of the file – prefer the bottom when using the `export { ... }` style (see section 11).
    
2. **Internal public functions** – functions that are used within the same module but are not exported.
    
3. **Private functions** – functions that are only called inside this module and are not meant to be used elsewhere. If using classes, mark them with `#`.
    
4. **Module-specific helpers** – small utility functions that are only relevant to this module and do not belong in a shared location.
    

Having a consistent order helps reviewers and maintainers quickly locate the most important parts of the file.

---

## 33. Strict Comparisons (=== and !==)

Always use the strict equality operators `===` and `!==` instead of the loose ones (`==` and `!=`).

Loose comparisons can lead to unexpected type coercion and subtle bugs.

Good:

```javascript
if (value === null) { ... }
if (type !== 'string') { ... }
```

Bad:

```javascript
if (value == null) { ... }   // Also matches undefined, which may be unintended
if (type != 'string') { ... }
```

The only exception is when you explicitly intend to check for both `null` and `undefined` using `== null`, but even then, prefer an explicit check for clarity (e.g., `value === null || value === undefined`).

---

## 34. Use of undefined vs. null

Use the following conventions to distinguish between `undefined` and `null`:

- **`undefined`** should be the default implicit value for:
    
    - Uninitialized variables.
        
    - Missing object properties.
        
    - Return value of a function that does not explicitly return anything.
        
    - Parameters that are not provided (default parameters handle this explicitly).
        
- **`null`** should be used when you need to explicitly indicate the **intentional absence of an object value**. For example:
    
    - When a function that normally returns an object returns nothing (e.g., `findUser(id)` returns `null` if no user is found).
        
    - When resetting an object reference to signal that it is intentionally empty.
        

Avoid using `undefined` as an assignment value – use `null` instead for intentional absence.

Examples:

```javascript
let currentUser = null;   // No user is set intentionally.

function findUser(id) {
  if (users.has(id)) {
    return users.get(id);
  }

  return null;            // Explicitly no user.
}

function getUserName(user) {
  return user?.name;      // Returns undefined if user is null or undefined.
}
```

---

## 35. Order of Properties in Object Literals

For consistency and predictability, arrange properties in object literals in alphabetical order (by key name). This makes it easier to spot duplicates and navigate the object during code reviews.

If there is a strong reason to group related properties (e.g., primitive values first, then objects/functions), you may do so, but you must be consistent across the project. The recommended default is alphabetical.

Example:

```javascript
const config = {
  host: 'localhost',
  port: 8080,
  timeout: 5000,
  useSSL: true,
};
```

For nested objects, apply the same rule recursively.

---

## 36. Naming Event Handlers and Listeners

To clearly distinguish between different types of functions that deal with events, follow these naming conventions:

- **Event handler** (the function that is called when an event occurs): prefix with `handle` + the event name or what it handles, e.g., `handleClick`, `handleSubmit`, `handleMessageReceived`.
    
- **Event listener** (the function that registers a handler or that is used as the listener in `addEventListener`): prefix with `on` + the event name, e.g., `onMessageReceived`, `onTabActivated`.
    

This makes it immediately clear whether a function is setting up a listener or is the actual callback.

Example:

```javascript
function onMessageReceived(message) {
  // This is the listener callback.
}

function handleMessageReceived(message) {
  // This is the handler that processes the message.
}

// Registering the listener:
chrome.runtime.onMessage.addListener(onMessageReceived);
```

---

## 37. Handling Rejected Promises Without await

When you are not using `await` on a promise (because you are returning it directly to the caller), you must ensure that the promise has a `.catch()` or that the caller handles the rejection. Otherwise, an unhandled rejection may occur, which can crash the extension or cause silent failures.

If you return a promise from a function and the caller is expected to handle errors, it is acceptable to return it without a `.catch()`. However, if you are not returning it to a caller that will handle errors, you must attach a `.catch()` to log the error or take corrective action.

Good:

```javascript
// Caller handles errors.
function fetchData() {
  return fetch('...').then(response => response.json());
}

// Or attach a catch for logging.
function fetchDataAndLog() {
  return fetch('...')
    .then(response => response.json())
    .catch(error => {
      console.error('Fetch failed:', error);
      throw error; // Re-throw if needed.
    });
}
```

When using `async/await`, always use `try/catch` to handle errors unless you are intentionally propagating them upward.

---

## 38. Internationalization (i18n) and User-Visible Strings

All strings that are displayed to the user in the UI (including popup, options page, notifications, error messages, etc.) must be externalized into locale files. Do not hardcode such strings directly in JavaScript, HTML, or CSS.

Store locale files under a dedicated directory, for example:

```text
src/
└── locales/
    ├── en.js
    ├── es.js
    └── ...
```

Each locale file exports an object containing key-value pairs for every user-visible string. Use descriptive keys that reflect the context, e.g., `'popup.title'`, `'error.network.unavailable'`.

In the JavaScript code, import the appropriate locale object based on the user's preference or browser language, and reference the keys.

Example:

```javascript
// locales/en.js
export default {
  'popup.title': 'Page Adapter',
  'popup.button.start': 'Start Adapter',
  'error.network': 'Network error, please try again.',
};

// In the popup script:
import locale from '../locales/en.js'; // or dynamically selected
document.getElementById('title').textContent = locale['popup.title'];
```

This approach makes it easy to add new languages and avoids scattered hardcoded strings that are difficult to maintain.

---

## 39. Final Remarks

These conventions are designed to produce a clean, predictable, and professional codebase. They are not optional – all contributions must adhere to them.

When in doubt, refer to this document. If a situation arises that is not covered here, discuss it with the team and update this guide accordingly.

Remember: consistency is more important than perfection. When you see existing code that does not follow these rules, update it as part of your work to gradually improve the overall code quality.
