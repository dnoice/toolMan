<!--
✒ Metadata
    - Title: ReadMe (toolMan Edition - v1.4)
    - File Name: README.md
    - Relative Path: README.md
    - Artifact Type: docs
    - Version: 1.4.0
    - Date: 11/18/2026
    - Update: Wednesday, November 18, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Changelog:
    - 1.4.0 (11/18/2026) [dendogg + Anthropic - Claude] — Records the BSD
      3-Clause License Dennis added: a License section (with a contents entry)
      replaces the all-rights-reserved note, and the project tree lists
      LICENSE.
    - 1.3.0 (11/17/2026) [dendogg + Anthropic - Claude] — colorMan is live:
      ecosystem row, a full colorMan section (workbench, library, tools,
      shortcuts), its storage key, and its add-only backup import; svgMan
      joins the ecosystem table and roadmap.
    - 1.2.0 (11/17/2026) [dendogg + Anthropic - Claude] — Themes section
      rewritten for Light, Dark, and System (the default, following the device
      live); the Parchment Dossier / Sentinel Obsidian names are retired.
    - 1.1.0 (11/17/2026) [dendogg + Anthropic - Claude] — Metadata moved into
      the standard header comment; project structure now shows the shared
      workbench kit, scripts, tests, and CI; new Contributing and security
      section pointing at CONTRIBUTING.md and SECURITY.md.
    - 1.0.0 (2026-07-26) [dendogg + Anthropic - Claude] — Initial
      documentation for the toolMan ecosystem: the hub and the first live
      tool, textMan.

✒ Description:
    The front page of the toolMan repository: what the ecosystem is, what
    each tool does, how the design system and local-only storage work, and
    how to run, extend, and contribute to it.

✒ Key Features:
    - Ecosystem overview with every tool's status
    - textMan walkthrough: panels, tool sections, keyboard shortcuts
    - Design system, theming, and the local-data model
    - Running locally (file://, Live Server, Python) and project structure
    - Pointers to CONTRIBUTING.md, SECURITY.md, and CHANGELOG.md

✒ Other Important Information:
    - Dependencies: None (documentation only); screenshots live in
      shared/assets/screenshots/
    - Compatible platforms: any Markdown renderer; written for GitHub
---------
-->

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
- [colorMan](#colorman)
- [Design system](#design-system)
- [Your data stays local](#your-data-stays-local)
- [Running toolMan](#running-toolman)
- [Project structure](#project-structure)
- [Adding a new tool](#adding-a-new-tool)
- [Contributing and security](#contributing-and-security)
- [Browser support](#browser-support)
- [Roadmap](#roadmap)
- [Credits](#credits)
- [License](#license)

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
| **colorMan** | Command the spectrum | Pick, convert, and check colors; build palettes, harmonies, scales, and gradients; preview color vision; export anywhere. | Live |
| **mathMan** | Numbers, tamed | Calculators, expression evaluation, and unit-aware math. | Coming soon |
| **convertMan** | From anything, to anything | Units, timestamps, data formats, and file-friendly conversions. | Coming soon |
| **devMan** | A toolbelt for builders | JSON tools, regex testing, UUIDs, hashes, and dev utilities. | Coming soon |
| **svgMan** | Vectors on demand | Generated blobs, waves, patterns, mazes, charts, and diagrams; fill and stroke comparisons; clean, safe SVG export. | Coming soon |

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

## colorMan

colorMan is a workbench for one color at a time and the palettes you build from
it. The left rail is your **Library**, the center **Workbench** holds the active
color, and the right rail is a set of **Tools** that check, adjust, and extend
it.

### Workbench

- **Color field** — type or paste any CSS color, including hex, `rgb()`,
  `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`, CMYK, a
  CSS name, or a pasted declaration such as `--brand: #C9A84C;`. It applies as
  you type, the whole edit is one undo step, and anything unreadable gets a
  plain-language note instead of a change.
- **Picker** — an HSV, HSL, or OKLCH color area with hue and opacity bars, full
  keyboard control, a Before/Now comparison, and number fields for RGB, HSL,
  HWB, OKLCH, or Lab.
- **Formats** — the color as HEX, RGB, HSL, HWB, HSV, CMYK, Lab, LCH, OKLab,
  OKLCH, and its nearest CSS name, each one click to copy, plus black and white
  text samples with their contrast.
- **Working palette** — the palette you're building. Reorder it by drag or by
  keyboard, rename, sort (with Undo), save it to the library, or drop an image
  on it to pull out its main colors.

### Library

**Palettes** (open, rename, duplicate, download, and import from hex lists,
CSS/SCSS variables, JSON, CSV, or GIMP `.gpl`), **Saved Colors**, **Recent**,
and all 148 **Named Colors** with a nearest-match filter.

### Tools

| Tool | What it does |
| --- | --- |
| **Adjust** | Lighten, darken, saturate, desaturate, rotate, invert, grey out, or complement in perceptual OKLCH steps — on the active color or the whole working palette |
| **Contrast** | WCAG 2 ratio and APCA Lc with pass/fail per level, a live text preview, a suggested passing color, and a palette grid of every pair |
| **Harmonies** | Complementary, analogous, triadic, split, tetradic, square, and monochromatic sets in OKLCH or HSL hues |
| **Shades & Tints** | A Tailwind-style 50–950 scale or even tint/shade steps, each with its contrast, copyable as CSS variables |
| **Mix** | Blends two colors in the color space you choose, with every step between |
| **Gradient** | Linear, radial, or conic gradients with editable stops, copied as CSS or downloaded as SVG |
| **Color Vision** | Previews protanopia, deuteranopia, tritanopia, their milder forms, and achromatopsia, and flags colors that become hard to tell apart |
| **Export** | The working palette or saved colors as CSS variables, SCSS, Less, Tailwind config, JSON, hex list, CSV, GIMP `.gpl`, SVG, or PNG |

### colorMan shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Focus the color field |
| `C` | Copy the active color |
| `R` | Random color |
| `E` | Pick a color from the screen (Chrome and Edge on desktop) |
| `F` | Save the color to Saved Colors (again to remove) |
| `A` | Add the color to the working palette |
| `Ctrl/Cmd + Z` · `Ctrl/Cmd + Y` | Undo · redo a color change |
| `Ctrl/Cmd + ,` · `?` | Settings · help |
| `Ctrl/Cmd + [` · `]` · `\` | Toggle the Library rail · Tools rail · Focus mode |

## Design system

The look is driven entirely by CSS custom properties in
[shared/css/tokens.css](shared/css/tokens.css) — a surface ladder, a spacing
scale, radius and control-height ladders, and a split gold accent (one value for
gold-as-surface, another for gold-as-legible-text). Because every tool consumes
the same tokens, restyling is a one-file change.

### Themes

Choose **Light**, **Dark**, or **System** in any tool's Settings; the header
button flips straight between light and dark. **System** is the default and
follows your device's light or dark setting, switching live when the device
does. The choice is stored under `toolman.theme` and applied before first
paint, so there is no theme flash. It is ecosystem-wide: set it in one tool and
every tool follows, including tabs that are already open.

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
| `toolman.colorman.state` | colorMan's palettes, saved and recent colors, working palette, gradient, pane choices, and settings |
| `toolman.lastUsed` | Per-tool last-opened timestamps (powers the hub's recents) |
| `toolman.pinned` | The tools you've pinned on the hub |

Each tool namespaces its own key as `toolman.<toolId>.state`, so tools never
collide.

### Backup and restore

From a tool's Settings you can **download a JSON backup** and **import** one
back in. Imports are validated and *merged* into your existing state — never
blindly overwritten — so restoring on a new machine is safe. colorMan's import
only adds: palettes and colors you don't already have come in, your current
work stays put, and it asks before any setting changes.

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
│   │   ├── tokens.css      # Design tokens: color, spacing, radius, glow, density
│   │   ├── reset.css       # Normalize + base element styles
│   │   ├── shell.css       # App shell / header chrome / mobile drawers
│   │   ├── panels.css      # Collapsible panels, buttons, inputs, chips
│   │   ├── workbench.css   # Shared workbench kit: stage, lists, readouts, modals
│   │   └── hub.css         # Hub-specific layout
│   ├── js/
│   │   ├── toolman.js      # Ecosystem kernel: registry, theme, toasts
│   │   ├── storage.js      # Hardened localStorage + autosave
│   │   ├── dom.js          # Small DOM helpers
│   │   ├── loader.js       # Boot loader with guaranteed handoff
│   │   ├── workbench.js    # Rails: accordions, drag-reorder, drawers, Focus mode
│   │   ├── dialogs.js      # Modals, confirm/prompt, staged settings
│   │   ├── toolapp.js      # One-call tool boot, shortcuts, save pill, helpers
│   │   └── hub.js          # Hub behavior (cards, recents, pins)
│   └── assets/             # Logos + screenshots
├── tools/
│   └── textman/            # The textMan tool
│       ├── index.html
│       ├── css/            # Per-component styles
│       └── js/
│           ├── app.js      # Boot
│           ├── state.js    # App state + persistence contract
│           └── ui/         # Editor, workspace, tools, modals, layout
├── scripts/
│   ├── check.mjs           # Static checks + unit tests (no install needed)
│   └── e2e.mjs             # Browser test runner (Playwright, added ad hoc)
├── tests/e2e/              # Ecosystem-wide browser suites
├── .github/                # CI workflow, issue + PR templates, Dependabot
├── CHANGELOG.md            # Older per-file changelog entries
├── CONTRIBUTING.md         # How to work on toolMan
├── LICENSE                 # BSD 3-Clause License
└── SECURITY.md             # Security model + how to report a vulnerability
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

The full walkthrough — the page anatomy, the shared workbench kit
(`Workbench`, `Dialogs`, `ToolApp`), tests, and the checks a new tool has to
pass — lives in [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-tool).

## Contributing and security

- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) covers local setup, the
  design and code conventions, the file-header standard, and testing. Run
  `node scripts/check.mjs` before you push — it is exactly what CI runs.
- **Security:** toolMan has no server and makes no network requests, but it
  does read files and text you give it. [SECURITY.md](SECURITY.md) describes
  the security model and how to report a vulnerability privately.

## Browser support

toolMan targets modern evergreen browsers — recent Chrome, Edge, Firefox, and
Safari. It leans on CSS custom properties, `:has()`, `color-mix()`, and
`@starting-style` (used as progressive enhancement, so older engines simply skip
the entrance polish). There is no support for Internet Explorer.

## Roadmap

The next tools are already stubbed in the hub registry:

- **mathMan** — calculators, expression evaluation, unit-aware math
- **convertMan** — units, timestamps, data formats, file-friendly conversions
- **devMan** — JSON tools, regex testing, UUIDs, hashes, dev utilities
- **svgMan** — generated blobs, waves, patterns, mazes, charts, and diagrams,
  fill and stroke comparisons, and clean SVG export, with every imported SVG
  cleaned before it is shown

Each will plug into the same kernel, tokens, and storage conventions described
above.

## Credits

Crafted by Dennis 'dendogg' Smaltz, with engineering assistance from Anthropic's
Claude (Opus 4.8).

## License

toolMan is released under the [BSD 3-Clause License](LICENSE). You may use,
modify, and redistribute it, in source or packaged form, as long as the
copyright notice and license text come along and the author's name isn't used
to endorse what you build.
