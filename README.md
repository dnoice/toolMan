<!--
✒ Metadata
    - Title: EcosystemOverview (toolMan Edition - v1.1)
    - File Name: README.md
    - Relative Path: README.md
    - Artifact Type: docs
    - Version: 1.1.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Changelog:
    - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added the "Man =
      manipulate" naming philosophy as ecosystem convention #7, with textMan's
      drag-and-drop workspace arrangement as its first realization.
    - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial ecosystem
      overview: tool roster, layout, run instructions, conventions.

✒ Description:
    Top-level documentation for the toolMan ecosystem: what it is, how the
    repository is laid out, how to run it, and the conventions every current
    and future tool follows. Replaces the old textMan "Foundation Complete"
    build notes, which described the pre-ecosystem v1 layout.

✒ Key Features:
    - Tool roster table (textMan live; colorMan, mathMan, convertMan, devMan
      planned) pointing at the registry source of truth (shared/js/toolman.js)
    - Annotated repository layout with links to each area's own README
    - Run instructions: no build step — file:// double-click or a static server
    - The six ecosystem conventions: house header, house palette, kernel-first
      load, namespaced storage, loader fail-safe, tool registration
    - Standards summary: vanilla HTML/CSS/JS, evergreen browsers, accessibility

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer (GitHub-flavored tables and
      fenced code blocks used)
---------
-->

# toolMan · One workshop, many tools

**toolMan** is a growing ecosystem of focused, beautiful, entirely client-side
browser tools. No accounts, no servers — everything runs locally and persists
in your browser's LocalStorage.

Open `index.html` (the hub) in any modern browser and launch a tool.

## The "Man" philosophy

The **Man** suffix is a promise: every tool is **manipulable**, not merely
usable. Users bend each tool to their own workflow — rearrange it, customize
it, make it theirs. textMan delivers the first installment: drag-and-drop
section reordering in both sidebars, persisted across sessions. Every future
tool ships with its own answer to "how does the user manipulate *this*?"

## The tools

| Tool | Tagline | Status |
| ---- | ------- | ------ |
| **textMan** | Bend text to your will | ✅ Live |
| colorMan | Command the spectrum | 🔜 Planned |
| mathMan | Numbers, tamed | 🔜 Planned |
| convertMan | From anything, to anything | 🔜 Planned |
| devMan | A toolbelt for builders | 🔜 Planned |

The single source of truth for this list is the registry in
[`shared/js/toolman.js`](shared/js/toolman.js) — the hub renders its launcher
cards straight from it.

## Repository layout

```text
toolMan/
├─ index.html              # The hub — loading screen + tool launcher
├─ README.md               # This file
├─ WIREFRAME.md            # Original textMan design wireframe (v1 reference)
├─ token.txt               # digiSpace house palette reference (source of tokens.css)
│
├─ shared/                 # Everything every tool shares
│  ├─ assets/              #   Logos and shared imagery
│  ├─ css/                 #   reset → tokens → shell → panels (+ hub styles)
│  └─ js/                  #   toolman (kernel), dom, storage, loader, hub
│
└─ tools/
   └─ textman/             # The first live tool
      ├─ index.html
      ├─ css/              #   Tool-specific component styles
      └─ js/               #   state, app, and ui/ modules
```

Each area carries its own README:
[`shared/README.md`](shared/README.md) ·
[`tools/textman/README.md`](tools/textman/README.md)

## Running it

No build step, no dependencies. Either:

- **Double-click** `index.html` (works from `file://`), or
- Serve statically for the cleanest experience:

  ```bash
  npx serve .
  # or
  python -m http.server 8000
  ```

## Ecosystem conventions

Every tool — current and future — follows these rules:

1. **The house header.** Every source file carries the digiSpace ✒ Metadata
   docstring (see the signature below).
2. **The house palette.** All colors come from
   [`shared/css/tokens.css`](shared/css/tokens.css): two themes, **Parchment
   Dossier** (light, default) and **Sentinel Obsidian** (dark), switched via
   `data-theme` on `<html>` and persisted ecosystem-wide under the
   `toolman.theme` storage key.
3. **The kernel loads first.** `shared/js/toolman.js` goes in `<head>` so the
   saved theme applies before first paint — no theme flash.
4. **Namespaced storage.** Each tool persists under `toolman.<toolId>.state`
   through the shared, hardened `Storage` manager (validated parsing, quota
   recovery, import/export).
5. **The loader never strands you.** The shared loading screen has a fail-safe
   timeout: if a tool's boot fails, the UI still appears.
6. **Adding a tool** = create `tools/<toolid>/`, register it in the
   `TOOLMAN.tools` array, and it appears on the hub.
7. **Man = manipulate.** Every tool ships at least one way for the user to
   reshape the tool itself (layout, ordering, presets) — and it persists.

## Standards

- Vanilla HTML/CSS/JS — zero runtime dependencies
- Evergreen browsers; graceful degradation for `backdrop-filter` et al.
- Accessibility: ARIA labeling, focus traps in dialogs, `prefers-reduced-motion`
  and `prefers-color-scheme` respected

---

Crafted by Dennis 'dendogg' Smaltz

`︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!`
