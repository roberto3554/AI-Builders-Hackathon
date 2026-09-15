<div align="center">

# Prisma

**A private, local AI agent that adapts the web to you.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Powered by Ollama](https://img.shields.io/badge/Powered%20by-Ollama-black.svg)](https://ollama.com)
[![100% Local](https://img.shields.io/badge/100%25-Local-blueviolet.svg)](#privacy)
[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-brightgreen.svg)](#license)

*Web accessibility should not be a privilege.*

</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Demo](#demo)
- [Privacy](#privacy)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## About

**Prisma** is a browser extension that turns your browser into a personal agent capable of understanding and reshaping any web page you visit. It reads the DOM, interprets your intent through a **local LLM**, and applies the changes you ask for — in real time and entirely on your machine.

No cloud. No accounts. No API keys. Just you and your browser.

---

## Features

| Feature | Description |
| --- | --- |
| **High Contrast** | Applies a strong, WCAG-compliant high-contrast mode to the entire page, fixing unreadable text and low-contrast controls. |
| **Simplify** | Uses an LLM to identify and remove non-essential elements: navigation menus, cookie banners, ads, newsletter prompts, related-content widgets, and more. |
| **Summarize** | Generates a concise, structured summary of the page's main content. |
| **Search** | Finds the element you are looking for on the page ("Where can I log in?", "Where is the documentation?") and highlights it visually. |
| **Natural Language Adaptation** | Write anything you want in plain English and Prisma will figure out how to apply it to the page. |
| **Local AI** | Powered by [Ollama](https://ollama.com). Everything runs on your machine. |
| **Fully Configurable** | Choose your model, theme, language, font size, and accessibility preferences from the in-page panel. |
| **Cancellable** | Every long-running request can be aborted from the UI at any moment. |
| **Accessible by Design** | Keyboard-navigable UI, high-contrast-aware, screen-reader friendly, and reduced-motion compliant. |

---

## Demo

> *Add a GIF or short screen recording here showing the floating button, the quick menu, and one of the transformations in action.*

```
docs/
└── demo.gif
```

---

## Privacy

Prisma is built on three principles:

1. **Local-first.** All AI inference runs through Ollama on `localhost`. Nothing leaves your machine.
2. **Zero tracking.** No analytics, no telemetry, no external requests.
3. **Open source.** Every line of code is auditable.

The only network permission Prisma requests is the one needed to reach your local Ollama instance:

```json
"host_permissions": [
  "http://localhost:11434/*",
  "http://127.0.0.1:11434/*"
]
```

---

## Tech Stack

- **JavaScript (ES Modules)**
- **HTML + CSS**
- **Chrome Extensions API (Manifest V3)**
- **Ollama** — local LLM runtime
- **Marked** — Markdown rendering
- **Shadow DOM** — full UI isolation from page styles
- **AbortController** — cancellable async requests

---

## Architecture

Prisma runs across three isolated environments that communicate through typed messages:

```
┌──────────────────────────────────────────────────────────────┐
│                     Background Service Worker                │
│  ─ message router  ─ Ollama client  ─ request orchestration  │
└────────────▲─────────────────────────────────▲───────────────┘
             │ chrome.runtime.sendMessage       │ fetch (localhost)
             │                                  │
┌────────────┴───────────────┐        ┌─────────┴────────────────┐
│      Content Script        │        │        Ollama            │
│  ─ DOM snapshot            │        │  ─ local LLM inference   │
│  ─ semantic segmentation   │        └──────────────────────────┘
│  ─ DOM tool application    │
│  ─ Shadow DOM UI           │
└────────────────────────────┘
```

Every long-running flow is cancellable, uses `AbortController`, and validates the model's JSON output before applying any change to the DOM.

---

## Getting Started

### Prerequisites

- **Google Chrome** (or any Chromium-based browser supporting Manifest V3)
- **Ollama** installed and running — [install here](https://ollama.com/download)

### 1. Pull a model

```bash
ollama pull qwen2.5:3b-instruct
```

Recommended models for Prisma:

| Model | Size | Notes |
| --- | --- | --- |
| `qwen2.5:3b-instruct` | ~2 GB | Fast, good quality, CPU-friendly |
| `llama3.2:3b-instruct` | ~2 GB | Strong instruction following |
| `qwen2.5:7b-instruct` | ~5 GB | Best quality-to-cost ratio |
| `llama3.1:8b-instruct` | ~5 GB | Excellent for long contexts |

### 2. Make sure Ollama is running

```bash
ollama serve
```

### 3. Clone and load the extension

```bash
git clone https://github.com/your-user/prisma.git
cd prisma
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `prisma/` folder

The Prisma floating button will appear in the top-right corner of every page.

---

## Usage

1. Click the floating **power button** on any page.
2. The quick menu expands with all available presets.
3. Pick a preset, or open the full panel (arrow icon) to:

   - Choose a preset
   - Write a custom request in plain English
   - Adjust theme, language, font size, and model

4. Every preset button shows a small **cancel** icon while it is running.
5. Every result appears as a short summary in the panel.

---

## Configuration

Prisma stores its preferences in `chrome.storage.local` under `pageAdapter:preferences`:

| Preference | Values | Default |
| --- | --- | --- |
| `theme` | `system` \| `light` \| `dark` | `system` |
| `locale` | `system` \| `en` \| `es` | `system` |
| `ollamaModel` | any Ollama model name | `qwen3.5:2b` |
| `highContrast` | `true` \| `false` | `false` |
| `simplifiedUi` | `true` \| `false` | `false` |
| `fontSize` | `small` \| `medium` \| `large` | `medium` |

---

## Project Structure

```
prisma/
├── src/
│   ├── background/       # Service worker: routing, Ollama, orchestration
│   ├── content/          # Content script: DOM, UI, tools, transformations
│   ├── popup/            # Toolbar popup UI
│   ├── shared/           # Constants, messages, preferences, locale helpers
│   ├── locales/          # English and Spanish string tables
│   ├── lib/              # Third-party libraries (Marked)
│   └── assets/
│       └── icons/        # SVG icons
├── manifest.json
├── CONVENTIONS.md        # Coding conventions
├── UIUXCONVENTIONS.md    # Design conventions
└── README.md
```

---

## Roadmap

- [x] High-contrast adaptation
- [x] LLM-driven simplify
- [x] Local summarization
- [x] Semantic element search and highlight
- [x] Natural-language page adaptation
- [ ] Voice input for natural-language requests
- [ ] Per-site preference profiles
- [ ] Custom user-defined presets
- [ ] Translation preset (reintroduction)
- [ ] Firefox and Edge packaging

---

## Contributing

Contributions are welcome. Before opening a pull request, please read:

- [`CONVENTIONS.md`](CONVENTIONS.md) — code and project structure conventions
- [`UIUXCONVENTIONS.md`](UIUXCONVENTIONS.md) — design and accessibility guidelines

All user-visible strings must be externalized into `src/locales/`. All UI must remain keyboard navigable and screen-reader compatible.

---

## License

This project is released under the **MIT License**. See [`LICENSE`](LICENSE) for the full text.

---

<div align="center">

**Built with care for a web that works for everyone.**

*If Prisma helps you, consider giving the repository a star — it helps others find it too.*

</div>
