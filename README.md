# toolMan

**One workshop, many tools.** Focused, beautiful browser tools — no accounts, no
servers, your data stays local.

toolMan is a small ecosystem of single-purpose utilities that run entirely in
your browser. There is no build step, no bundler, and no backend: every tool is
plain HTML, CSS, and JavaScript sharing one design system. Open a file and it
works — from a static host or straight off your disk.

![The toolMan hub — a grid of tool cards with a live textMan and four upcoming tools, the focused card lit by a soft gold glow](shared/assets/screenshots/Screenshot%202026-07-23%20141455.png)

## Table of contents

- [Highlights](#highlights)
- [The ecosystem](#the-ecosystem)
- [textMan](#textman)
- [Design system](#design-system)
- [Your data stays local](#your-data-stays-local)
- [Running toolMan](#running-toolman)
- [Project structure](#project-structure)
- [Adding a new tool](#adding-a-new-tool)
- [Browser support](#browser-support)
- [Roadmap](#roadmap)
- [Credits](#credits)

## Highlights

- **Zero build, zero install** — static files you can open directly or serve
  from any host.
- **Local-first** — everything lives in your browser's `localStorage`; nothing
  is uploaded, tracked, or phoned home.
- **One shared design system** — a token-driven light/dark theme, applied before
  first paint so there is no flash of the wrong colors.
- **A hub that remembers** — recently used and pinned tools surface first.
- **Accessible by default** — keyboard-reachable controls, visible focus, and
  states that never rely on color alone.
- **Private-mode safe** — every storage touch is guarded, so the tools degrade
  gracefully instead of crashing when storage is unavailable.

## The ecosystem

The hub (`index.html`) is the front door. It reads a single registry in
[shared/js/toolman.js](shared/js/toolman.js) and renders a card for every tool,
with its live/upcoming status, last-used time, and a pin control.

| Tool | Tagline | What it does | Status |
| --- | --- | --- | --- |
| **textMan** | Bend text to your will | A three-panel text workspace: templates, snippets, transforms, search & replace, encoding, and formatting. | Live |
| **colorMan** | Command the spectrum | Palettes, conversions, contrast checks, and gradient building. | Coming soon |
| **mathMan** | Numbers, tamed | Calculators, expression evaluation, and unit-aware math. | Coming soon |
| **convertMan** | From anything, to anything | Units, timestamps, data formats, and file-friendly conversions. | Coming soon |
| **devMan** | A toolbelt for builders | JSON tools, regex testing, UUIDs, hashes, and dev utilities. | Coming soon |

Every tool shares the same theme, storage conventions, and toast notifications
through the ecosystem kernel, so moving between them feels like one product.

## textMan

textMan is the flagship tool — a three-panel workspace for reshaping text. The
left rail holds your reusable material, the center is the editor, and the right
rail is a toolbox that acts on your selection, or the whole document when
nothing is selected.

![textMan's three-panel workspace: the Workspace rail with Templates and Saved Snippets on the left, the editor in the center, and the Tools rail with the Transform grid on the right](shared/assets/screenshots/Screenshot%202026-07-23%20132156.png)

### The three panels

- **Workspace (left)** — Templates, Saved Snippets, History, Favorites, and
  Analytics. Both side rails collapse to reclaim space.
- **Editor (center)** — the writing canvas, with an editable document title, a
  type-size stepper, open / download / copy-all, undo / redo, a word-wrap
  toggle, and a diff-against-last-save view. A status bar reports live word,
  character, and reading-time counts, the caret's line and column (click to go
  to a line), and the saved state.
- **Tools (right)** — Transform, Search & Replace, Prefix / Suffix,
  Encoding / Decoding, and Text Formatting, each in its own collapsible section.

### Transform

Twenty one-click transforms, grouped into six families. Each acts on the current
selection, or the entire document when nothing is selected.

| Family | Transforms |
| --- | --- |
| **Case** | UPPERCASE, lowercase, Title Case, Sentence case |
| **Clean** | Trim whitespace, Collapse spaces |
| **Lines** | Remove empty lines, Deduplicate lines, Reverse lines, Shuffle lines |
| **Order** | Sort A → Z, Sort Z → A |
| **Code** | camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE |
| **Chars** | Strip accents, Smart quotes, Straight quotes |

### Search & Replace

Find and replace across the selection or the whole document, with match-case,
whole-word, and full regular-expression modes, plus previous / next navigation
and replace-one / replace-all.

### Prefix / Suffix

Wrap each line, the selection, or the whole document with a prefix and suffix —
handy for commenting code, quoting, or list-building — with a preview before you
commit.

### Encoding / Decoding

UTF-8 safe round-trips (emoji and accents survive):

- **Base64** encode / decode
- **Base64URL** encode / decode (URL-safe, no padding)
- **URL** percent-encode / decode
- **HTML** entity escape / unescape
- **Hex** encode / decode
- **JWT** decode — reads a token's header and payload for inspection (the
  signature is **not** verified)

### Text Formatting

Markdown-flavored formatting that toggles on and off:

- Headings **H1**, **H2**, **H3**
- Blockquote, bulleted list, numbered list
- Indent / outdent
- Fenced code block
- Strip markdown back to plain text

### Keyboard shortcuts

Modifier is `Ctrl` on Windows and Linux, `Cmd` on macOS.

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Save document |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + F` | Jump to Search & Replace |
| `Ctrl/Cmd + G` | Go to line |
| `Ctrl/Cmd + [` | Toggle the Workspace panel |
| `Ctrl/Cmd + ]` | Toggle the Tools panel |
| `Ctrl/Cmd + \` | Focus mode (collapse both side panels) |
| `Ctrl/Cmd + Shift + \` | Zen mode (distraction-free) |
| `Ctrl/Cmd + ,` | Open Settings |
| `Esc` | Close any dialog, or exit Zen mode |

## Design system

The look is driven entirely by CSS custom properties in
[shared/css/tokens.css](shared/css/tokens.css) — a surface ladder, a spacing
scale, radius and control-height ladders, and a split gold accent (one value for
gold-as-surface, another for gold-as-legible-text). Because every tool consumes
the same tokens, restyling is a one-file change.

### Themes

Two themes ship: **Light** (Parchment Dossier) and **Dark** (Sentinel
Obsidian). The choice is stored under `toolman.theme` and applied to the
document before first paint, so there is no theme flash. On a first visit the
tool honors your operating-system `prefers-color-scheme`. The theme is
ecosystem-wide — set it in one tool and every tool follows.

### The gold glow

Focus and hover emphasis is carried by a soft gold **glow** rather than a hard
stroke. A single pair of tokens — `--glow-brand` for standalone controls and
`--glow-brand-inset` for elements whose container clips its overflow — gives the
whole ecosystem one consistent, gentle focus treatment. Selection and active
states keep a solid accent edge on purpose, so "selected" never reads the same
as "focused."

## Your data stays local

toolMan never sends your content anywhere. Everything is persisted in your
browser via a hardened `localStorage` wrapper
([shared/js/storage.js](shared/js/storage.js)) with prototype-pollution-safe
parsing, quota-recovery, and versioned migrations.

### What's stored

| Key | Holds |
| --- | --- |
| `toolman.theme` | The active theme, shared across all tools |
| `toolman.textman.state` | textMan's document, templates, snippets, history, favorites, and settings |
| `toolman.lastUsed` | Per-tool last-opened timestamps (powers the hub's recents) |
| `toolman.pinned` | The tools you've pinned on the hub |

Each tool namespaces its own key as `toolman.<toolId>.state`, so tools never
collide.

### Backup and restore

From textMan's Settings you can **download a JSON backup** of your workspace and
**import** one back in. Imports are validated and *merged* into your existing
state — never blindly overwritten — so restoring on a new machine is safe.

### Autosave

Autosave is configurable: **Immediate** (on every change), **Debounced** (after
you stop typing — the default, with an adjustable delay), or **Manual**
(`Ctrl/Cmd + S` only). Pending saves are flushed automatically when the page is
backgrounded or closed.

## Running toolMan

There is no build step. Pick whichever is easiest:

- **Open it directly** — double-click `index.html`. It runs from `file://` with
  no server. A static server is recommended for the most consistent
  `localStorage` behavior across browsers.
- **VS Code Live Server** — the bundled [.vscode/settings.json](.vscode/settings.json)
  serves the app on port 5500 in Edge. Click **Go Live** and the hub opens at
  `http://localhost:5500`.
- **Python** — from the project root:

  ```bash
  python -m http.server 5500
  ```

  Then open `http://localhost:5500`.

- **Any static host** — GitHub Pages, Netlify, or an S3 bucket all work; just
  publish the folder as-is.

## Project structure

```text
toolMan/
├── index.html              # The hub — landing page + tool registry view
├── shared/                 # Everything every tool shares
│   ├── css/
│   │   ├── tokens.css      # Design tokens: color, spacing, radius, glow
│   │   ├── reset.css       # Normalize + base element styles
│   │   ├── shell.css       # App shell / header chrome
│   │   ├── panels.css      # Collapsible panels, buttons, inputs, chips
│   │   └── hub.css         # Hub-specific layout
│   ├── js/
│   │   ├── toolman.js      # Ecosystem kernel: registry, theme, toasts
│   │   ├── storage.js      # Hardened localStorage + autosave
│   │   ├── dom.js          # Small DOM helpers
│   │   ├── loader.js       # Boot loader with guaranteed handoff
│   │   └── hub.js          # Hub behavior (cards, recents, pins)
│   └── assets/             # Logos + screenshots
└── tools/
    └── textman/            # The textMan tool
        ├── index.html
        ├── css/            # Per-component styles
        └── js/
            ├── app.js      # Boot
            ├── state.js    # App state + persistence contract
            └── ui/         # Editor, workspace, tools, modals, layout
```

## Adding a new tool

The ecosystem is designed to grow. To add a tool:

1. Register it in the `tools` array in
   [shared/js/toolman.js](shared/js/toolman.js) with an `id`, `name`, `tagline`,
   `description`, `status`, and `path`.
2. Create `tools/<id>/index.html` and load the kernel **first**, in `<head>`, so
   the theme applies before paint:

   ```html
   <script src="../../shared/js/toolman.js"></script>
   ```

3. Reuse the shared CSS (`reset.css`, `tokens.css`, `shell.css`, `panels.css`)
   so the tool inherits the design system for free.
4. Register a persistence contract for the tool's own namespaced key:

   ```javascript
   Storage.configure({
       key: 'toolman.<id>.state',
       version: '1.0.0',
       getState: () => window.AppState,
       restore: (saved) => mergeIntoAppState(saved)
   });
   ```

5. Flip the tool's `status` from `soon` to `live` when it's ready, and the hub
   card starts launching it.

## Browser support

toolMan targets modern evergreen browsers — recent Chrome, Edge, Firefox, and
Safari. It leans on CSS custom properties, `:has()`, `color-mix()`, and
`@starting-style` (used as progressive enhancement, so older engines simply skip
the entrance polish). There is no support for Internet Explorer.

## Roadmap

The next tools are already stubbed in the hub registry:

- **colorMan** — palettes, conversions, contrast checks, gradient building
- **mathMan** — calculators, expression evaluation, unit-aware math
- **convertMan** — units, timestamps, data formats, file-friendly conversions
- **devMan** — JSON tools, regex testing, UUIDs, hashes, dev utilities

Each will plug into the same kernel, tokens, and storage conventions described
above.

## Credits

Crafted by Dennis 'dendogg' Smaltz, with engineering assistance from Anthropic's
Claude (Opus 4.8). toolMan is a personal project; in the absence of a bundled
`LICENSE` file, treat it as all rights reserved unless the repository states
otherwise.

## ✒ Metadata

- **Title:** README (toolMan Edition — v1.0)
- **Version:** 1.0.0
- **Date:** 2026-07-26
- **Author:** Dennis 'dendogg' Smaltz
- **A.I. Acknowledgement:** Anthropic — Claude Opus 4.8
- **Signature:** ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

## ✒ Changelog

- **1.0.0 (2026-07-26)** — Initial documentation for the toolMan ecosystem: the
  hub and the first live tool, textMan.
