<!--
✒ Metadata
    - Title: TextManGuide (textMan Edition - v2.1)
    - File Name: README.md
    - Relative Path: tools/textman/README.md
    - Artifact Type: docs
    - Version: 2.1.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Changelog:
    - 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Documented the "Man
      = manipulate" philosophy and the new drag-and-drop section reordering.
    - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Rewritten for the
      toolMan-era textMan: full feature set documented, v1 build notes
      superseded.
    - 1.0.0 (2025-11-18) [model not recorded] — Original "Foundation
      Complete" notes (now at the repo root's git history).

✒ Description:
    Documentation for textMan, the toolMan ecosystem's text workspace:
    features, architecture, module map, and storage model. Read it before
    touching the tool's code — it names the one rule every pane obeys.

✒ Key Features:
    - Feature reference for all three panels: workspace (templates, snippets,
      history, favorites, analytics), editor (undo/redo, diff, autosave), and
      tools (transform, search & replace, prefix/suffix, encoding, formatting)
    - Keyboard shortcut table
    - Architecture map of css/ and js/ modules, including the EditorUI rule
      (panes never touch the textarea directly)
    - Storage model: toolman.textman.state key with automatic v1 migration,
      ecosystem-level theme key

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer (GitHub-flavored tables and
      fenced code blocks used)
---------
-->

# textMan · Bend text to your will

A three-panel text workspace. Everything acts on your **selection** — or the
whole document when nothing is selected — and everything persists locally.

## The "Man" in textMan

The **Man** suffix means *manipulate*, not just *use*: the tool itself bends
to your workflow. Today that means **drag-and-drop workspace arrangement** —
grab any section header in either sidebar (Templates, Transform, Search…) and
drop it where you want it; your arrangement persists across sessions. More
manipulability (custom quick-action rows, tool presets) lands on the same
principle.

## Features

### Workspace (left panel)

- **Templates** — 4 seeded (Bug Report, Feature Spec, Meeting Notes, Brain
  Dump) plus your own; use = replace-or-append with a guard
- **Snippets** — save (prefilled from your selection), insert, copy, tag
- **History** — timeline of saves, transforms, and template/snippet activity
- **Favorites** — star templates and snippets for one grid
- **Analytics** — live words/chars, session count, top transform
- **Rearrangeable** — drag any section header to reorder the sidebar; the
  custom order persists (works in the Tools panel too)

### Editor (center)

- Undo/redo (coalescing 100-step stack), live stats, save-status chip
- Open files via picker **or drag-and-drop** (5 MB cap)
- **Diff** against the last save (line-level LCS, +/- rows)
- Autosave: immediate / debounced / manual (Ctrl+S always works)

### Tools (right panel)

- **Transform** — 12 ops: case ×4, trim, collapse, remove-empty, dedupe,
  reverse, shuffle, natural sort ×2
- **Search & Replace** — live match counter, regex with validation,
  whole-word, match-case, wrap-around prev/next, `$1` groups in replace-all
- **Prefix / Suffix** — per-line/selection/document, non-destructive
  preview, exact-match clear
- **Encoding** — Base64 (UTF-8 safe), URL, HTML entities — encode + decode
- **Formatting** — markdown heading/list/quote **toggles**, indent/outdent

## Shortcuts

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Z` / `Y` | Undo / Redo |
| `Ctrl/Cmd + F` | Jump to Search & Replace |
| `Ctrl/Cmd + ,` | Settings |
| `Esc` | Close dialog |

## Architecture

```text
tools/textman/
├─ index.html         # Page + dialogs (settings, help, snippet, template, diff)
├─ css/               # 10 component stylesheets over the shared design system
└─ js/
   ├─ state.js        # AppState + State API; Storage.configure contract
   ├─ app.js          # Boot: restore → module init (error-isolated) → loader handoff
   └─ ui/
      ├─ layout.js    # Panel/section collapse + drag reorder (persisted)
      ├─ header.js    # Settings / theme / help buttons
      ├─ editor.js    # The engine: undo, stats, files, diff, applyToSelectionOrAll()
      ├─ workspace.js # Left-panel renderers + actions
      ├─ tools-*.js   # transform, search, prefix, encoding, formatting
      └─ modals.js    # Dialog system: focus trap, Esc, submit flows
```

**One rule keeps the tool honest:** panes never touch the textarea directly.
Every mutation flows through `EditorUI` (`applyToSelectionOrAll`, `setValue`,
`insertText`), which owns undo, dirty state, stats, and autosave.

## Storage

- Key: `toolman.textman.state` (v1 `textman-state` data migrates in
  automatically, then the old key is removed)
- Theme is ecosystem-level (`toolman.theme`) — set it once, every tool follows

`︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!`
