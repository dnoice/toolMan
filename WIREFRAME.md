<!--
✒ Metadata
    - Title: DesignWireframe (textMan Edition - v1.1)
    - File Name: WIREFRAME.md
    - Relative Path: WIREFRAME.md
    - Artifact Type: docs
    - Version: 1.1.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Changelog:
    - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added the house
      header and the historical note below; content otherwise preserved as
      the original design reference.
    - 1.0.0 (2025-11-18) [model not recorded] — Original textMan wireframe.

✒ Description:
    The original design wireframe for textMan v1. Kept as a historical
    design reference. NOTE: the directory structure in §12 predates the
    toolMan ecosystem — the authoritative layout now lives in README.md
    (shared/ + tools/textman/), and theming moved from per-theme stylesheets
    to data-theme token switching (see shared/css/tokens.css).

✒ Key Features:
    - Complete v1 UI specification: branding/assets, loading screen, sticky
      header, and the three-panel shell with layout rules
    - Left-panel workspace sections in detail, including the four seeded
      templates (Bug Report, Feature Spec, Meeting Notes, Brain Dump)
    - Editor spec: toolbar, save-status states, and live word/char/read-time
      stats behavior
    - Right-panel tool specs: transform, search & replace, prefix/suffix,
      encoding, and formatting (the latter two as MVP guidance)
    - Modal inventory (settings, help, snippet, template) and the LocalStorage
      data and lifecycle model
    - Original standalone directory structure (§12, now superseded)

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer
    - Limitations: historical reference — §12 layout and the per-theme
      stylesheet model are superseded by the toolMan ecosystem (see README.md)
---------
-->

# textMan · Wireframe v1.0

> **Historical note (2026-07-22):** textMan now lives inside the **toolMan**
> ecosystem. See [README.md](README.md) for the current structure and
> conventions; §12 below reflects the original standalone layout.

## 0. Product Overview

**Name:** `textMan` (lowercase `t`, uppercase `M`)
**Tagline (suggested):** “Bend text to your will.”

**High-level concept:**
textMan is a three-panel, text-centric workspace that lets users write, transform, analyze, and reuse text efficiently. It combines:

* A central notepad-style editor
* A left “Workspace” sidebar for templates, snippets, history, favorites, and analytics
* A right “Tools” sidebar with transformation, search & replace, prefix/suffix, encoding/decoding, and formatting utilities
* A polished glassmorphism UI, localized scrolling behavior, and LocalStorage-backed persistence

The entire experience feels like a compact text IDE with powerful side tools.

---

## 1. Global Branding & Assets

### 1.1 Identity

* **App name:** `textMan`
* **Displayed everywhere as:** `textMan` (no variants, no all-caps)

### 1.2 Logo

SVG logo (fountain pen tip, angled diagonally up-left):

* **File:** `assets/logo-textMan.svg`
* **Usage:**

  * In app header (small size)
  * On loading screen (larger)
* **Color:** `fill="currentColor"` so it integrates with theme colors.

### 1.3 Favicon

* **File:** `favicon.png`
* PNG version of the same icon, square format
* Referenced in `<head>`:

  ```html
  <link rel="icon" type="image/png" href="/favicon.png" />
  ```

### 1.4 Page Title

* `<title>textMan – Bend text to your will</title>`

---

## 2. Loading Screen

**Purpose:** Provide a branded and smooth entry while state restores from LocalStorage.

### 2.1 Layout

* **Full viewport overlay** (`#loader-screen`), absolutely or fixed positioned above the app.

* **Background:**

  * Dark gradient (e.g. deep blue/black)
  * Optional subtle animated noise or slowly shifting radial gradients.

* **Centered Content Card (glassmorphism):**

  * Rounded corners
  * Backdrop blur
  * Subtle border & soft shadow

Inside the card:

1. **Logo & Name**

   * Large `logo-textMan.svg`
   * Text below: `textMan`
   * Font: bold, slightly increased size

2. **Tagline / Status**

   * Line below name, e.g.:

     * “Bend text to your will.”
     * Or “Loading your workspace…”

3. **Loader Bar**

   * Horizontal pill-shaped progress bar or indeterminate animated bar
   * Positioned under the tagline

4. **Rotating Status Messages (optional)**

   * Small text under the bar, cycling through messages like:

     * “Restoring last session…”
     * “Sharpening the pen…”
     * “Loading templates and snippets…”
     * “Preparing tools…”

### 2.2 Behavior

* **On app start:**

  * Loader is visible immediately.
  * JS reads LocalStorage for:

    * Editor content
    * Templates & snippets
    * Favorites
    * Panel collapse state
    * Theme preference

* **On completion:**

  * Loader fades out (opacity + slight scale-down).
  * Main app layout fades in.
  * Loader DOM node can be removed or hidden.

---

## 3. Main Shell & Layout

### 3.1 Overall Structure

Inside `<body>`:

* `<div class="app">`

  * `<header class="app-header">` (sticky)
  * `<main class="app-main">`

    * `<section class="panel panel-left">`   (Workspace)
    * `<section class="panel panel-center">` (Editor)
    * `<section class="panel panel-right">`  (Tools)

### 3.2 Layout Rules

* The app fills the viewport height.
* `app-main` uses a **three-column layout** (CSS flex or grid).
* Scroll behavior:

  * Primary scroll happens inside the editor and tool bodies.
  * The overall viewport should avoid horizontal scroll.
* Columns:

  * Left and right panels: approximately 22–25% each.
  * Center panel: takes remaining width and is visually dominant.

---

## 4. Sticky Header (Top Bar)

### 4.1 Layout & Style

* **Position:** Sticky at top of viewport.
* **Height:** ~64px.
* **Style:** Glassmorphism:

  * Semi-transparent background
  * Backdrop blur
  * Border and subtle drop shadow
  * Rounded corners

Contained elements:

1. **Left (Logo & Name)**

   * `img src="assets/logo-textMan.svg"` with class `logo-icon`
   * `span.logo-text` with text: `textMan`
   * Optional tooltip on hover: `"textMan · Bend text to your will"`

2. **Right (Icon Buttons)**

   * Three circular icon buttons:

     * Settings
     * Theme Toggle
     * Help
   * All share:

     * Circular shape
     * Hover lift, border accent, glow

### 4.2 Button Behaviors

* **Settings button:**

  * Opens Settings modal (see Modals section).

* **Theme toggle:**

  * Toggles between dark and light themes.
  * Applies corresponding CSS theme file.
  * Persists choice to LocalStorage.

* **Help button:**

  * Opens Help modal explaining layout, shortcuts, and tool overview.

---

## 5. Panels: Shared Behavior

All three panels share these features:

* **Panel structure:**

  * `header.panel-header`
  * `div.panel-content`
  * `footer.panel-footer`

* **Header:**

  * Contains title text (e.g. `Workspace`, `Editor`, `Tools`)
  * Sidebars (left & right) have a chevron in the header to collapse the entire panel.
  * Visual effect:

    * Gradient background
    * Border
    * Diagonal reflection on hover (subtle sheen).

* **Content:**

  * Flexible, vertical layout.
  * Scrollable internal sections.

* **Footer:**

  * Small status/info strip at bottom of each panel.
  * Equal height across panels.

* **Collapse behavior (side panels only):**

  * Clicking the header chevron toggles:

    * `panel-content` visibility
    * `panel-footer` visibility
  * Panel header remains visible.

---

## 6. Left Panel: Workspace

### 6.1 Panel Header

* Title: `Workspace`
* Right-aligned chevron icon:

  * Toggles `Workspace` panel collapsed/expanded.

### 6.2 Panel Content

Contains **five stacked tool sections**, equal vertical share, all visually consistent:

1. Templates
2. Saved Snippets
3. History
4. Favorites
5. Analytics

Each section is a “tool card” with:

* `div.tool-header`

  * `h4` with section name
  * Chevron icon (rotate on collapse)
  * Diagonal reflection effect on hover
  * Click toggles collapsed/expanded state of that section only

* `div.tool-body`

  * Scrollable content region
  * Holds empty states or lists, depending on data

#### 6.2.1 Templates (Pre-populated)

**Header:** `Templates`

**Body:**
A scrollable list of **template cards**, each with:

* Template Title
* Short description
* Primary action: `Use template`

**Initial templates (examples):**

1. **Bug Report**

   * Description: “Structured bug report with expected vs actual behavior.”
   * Sections in template body:

     * Summary
     * Steps to Reproduce
     * Expected Behavior
     * Actual Behavior
     * Environment
     * Notes

2. **Feature Spec**

   * Description: “Outline for describing a new feature.”
   * Sections:

     * Overview
     * Goals / Non-goals
     * User Stories
     * Requirements
     * Edge Cases
     * Open Questions

3. **Meeting Notes**

   * Description: “Lightweight structure for meetings.”
   * Sections:

     * Date / Time
     * Attendees
     * Agenda
     * Notes
     * Decisions
     * Action Items

4. **Brain Dump**

   * Description: “Unstructured scratchpad for raw thinking.”
   * Sections:

     * Raw Thoughts
     * Patterns / Themes
     * Next Steps

**Behavior:**

* Clicking `Use template`:

  * Inserts the template content into the editor.
  * If editor contains text:

    * Prompt: “Replace current document / Append to bottom?” (future enhancement).
* Templates themselves are persisted in LocalStorage.
* Later, user can create new templates (via modals).

#### 6.2.2 Saved Snippets

**Header:** `Saved Snippets`

**Initial body (empty state):**

* Title: “No snippets saved”
* Description: “Save useful pieces of text you can reuse later.”
* Button: `Save current selection`

  * Opens “Save Snippet” modal:

    * Fields:

      * Snippet name
      * Tags
      * Optional notes
      * Content (pre-populated with current editor selection, if any)

**Once populated:**

* List of snippet cards:

  * Name
  * Short preview
  * Tags
  * Actions:

    * `Insert into editor`
    * `Copy`
    * `Favorite`
    * `Delete`

#### 6.2.3 History

**Header:** `History`

**Initial body (empty):**

* Message: “History is empty.”
* Subtext: “Your recent edits and snapshots will appear here.”

**Future behavior:**

* List of entries:

  * Timestamp
  * Short description (e.g. “Saved document”, “Applied transform: UPPERCASE”)
* Clicking could show:

  * Snapshot preview
  * Undo/restore options

#### 6.2.4 Favorites

**Header:** `Favorites`

**Initial body (empty):**

* Message: “Nothing favorited yet.”
* Subtext: “Mark templates, snippets, or tools you use the most.”

**Future behavior:**

* Cards referencing:

  * Favorite snippets
  * Favorite templates
  * Maybe saved tool presets

#### 6.2.5 Analytics

**Header:** `Analytics`

**Initial body (empty):**

* Message: “No analytics yet.”
* Subtext: “Start typing to see trends and insights.”

**Future behavior:**

* Blocks/cards for:

  * Word count over time
  * Reading grade level
  * Top-used transforms

### 6.3 Panel Footer

Footer content example:

* Left: `Workspace`
* Right: `Templates: X | Snippets: Y`

---

## 7. Center Panel: Editor

### 7.1 Panel Header

* Title: `Editor`
* No collapse chevron (center is always visible).

### 7.2 Editor Shell

Inside the panel content, the editor area consists of:

1. Editor header (toolbar + status)
2. Editor main (textarea + stats footer)

#### 7.2.1 Editor Header (Toolbar)

**Layout:**

* Left-aligned: Tools cluster (generic editor-related icons).
* Right-aligned: File-style actions + status indicator.

**Left side (Tools cluster):**

* Icon buttons (for future expansion):

  * e.g. “Outline”, “Structure view”, “Command palette”
* Each: circle/soft-square, glass-style, with simple line icons.

**Right side (Document controls):**

Buttons:

1. `Open`

   * Opens a document selection UI (future).
2. `Undo`
3. `Redo`
4. `Diff`

   * Shows differences between current and last saved state.
5. `Save`

   * Triggers manual save to LocalStorage.

**Status indicator:**

* A pill-style chip next to the buttons showing:

  * Status dot (colored)
  * Text label

States:

* **Saved**

  * Dot: green glow
  * Label: “Saved”
* **Saving**

  * Dot: yellow glow
  * Label: “Saving…”
* **Not saved**

  * Dot: red/pink glow
  * Label: “Not saved”

**Behavior:**

* On input in editor:

  * Status becomes `Not saved`.
* After a short idle delay:

  * Status becomes `Saving…` briefly.
* After successful LocalStorage save:

  * Status becomes `Saved`.

#### 7.2.2 Editor Main (Notepad + Stats Footer)

**Notepad area:**

* Large, scrollable `<textarea>`:

  * Monospace font
  * Line-height tuned for readability
  * Placeholder: “Start typing here…”

* Behavior:

  * Vertical scrollbar appears within the textarea region if content grows.
  * The stats footer remains fixed at the bottom of the editor container; text never scrolls past it.

**Footer stats strip:**

* A horizontal bar with stat “pills” such as:

  * `Words: N`
  * `Characters: N`
  * `Est. read time: X min`
* Optional extra label like:

  * “Viewport-locked footer”

**Live updates:**

* On editor input:

  * Word count recalculated (words split by whitespace).
  * Character count recalculated.
  * Estimated read time updated (e.g. based on ~200 wpm).

### 7.3 Panel Footer

Footer content example:

* Left: `Editor status`
* Right: `Ready` or brief status summary.

---

## 8. Right Panel: Tools

### 8.1 Panel Header

* Title: `Tools`
* Chevron icon to collapse/expand the entire panel.

### 8.2 Panel Content

Stacked tools, equal-height sections:

1. Transform
2. Search & Replace
3. Prefix / Suffix
4. Encoding / Decoding
5. Text Formatting

Each section uses the same `tool-header + tool-body` pattern as the left workspace.

---

## 9. Right Panel Tools – Detailed

### 9.1 Transform

**Header:** `Transform`

**Body:**
Grid of transformation buttons.

**Button examples:**

* Case:

  * `UPPERCASE`
  * `lowercase`
  * `Title Case`
  * `Sentence case`

* Whitespace / Cleanup:

  * `Trim whitespace`
  * `Collapse spaces`
  * `Remove empty lines`
  * `Deduplicate lines`

* Ordering:

  * `Sort A → Z`
  * `Sort Z → A`

**Behavior:**

* When clicked:

  * If text is selected in editor:

    * Transform only selection.
  * Else:

    * Transform entire document.
  * Mark document dirty (`Not saved`).
* UI:

  * Buttons use glassmorphism styling with hover lift and glow.
  * Label + small category hint (`Case`, `Lines`, etc.).

### 9.2 Search & Replace

**Header:** `Search & Replace`

**Body layout:**

1. **Search field**

   * Label: “Search for”
   * Plain text input

2. **Replace field**

   * Label: “Replace with”
   * Plain text input

3. **Options row**

   * Toggle pills:

     * `Match case`
     * `Whole word`
     * `Regex`
   * Dropdown:

     * Scope:

       * `Selection`
       * `Current document` (default)
       * `All workspace` (future)

4. **Action buttons**

   * `Prev`
   * `Next`
   * `Replace`
   * `Replace all`

**Behavior:**

* `Prev` / `Next`: navigate occurrences.
* `Replace`: replace current occurrence.
* `Replace all`: replace across selected scope.
* All replacements update editor content & dirty state.

### 9.3 Prefix / Suffix

**Header:** `Prefix / Suffix`

**Body layout:**

1. **Prefix input**

   * Label: `Prefix`
   * Example placeholder: `// `

2. **Suffix input**

   * Label: `Suffix`
   * Example placeholder: `;`

3. **Scope selection**

   * Toggle pills (single-select):

     * `Each line` (default)
     * `Selection`
     * `Whole document`

4. **Action buttons**

   * `Preview`
   * `Apply`
   * `Clear`

**Behavior:**

* `Preview`: non-destructive view of what will be applied.
* `Apply`: apply prefix/suffix based on scope.
* `Clear`: remove previously applied prefix/suffix patterns where feasible.
* Changes mark document dirty.

### 9.4 Encoding / Decoding

**Header:** `Encoding / Decoding`

**Initial body (MVP guidance):**

* Empty state:

  * Title: “Encoding tools”
  * Text: “Add buttons for Base64, URL encode/decode, HTML entities, etc.”

**Future expansion:**

* Buttons such as:

  * `Base64 encode`
  * `Base64 decode`
  * `URL encode`
  * `URL decode`
  * `HTML escape`
  * `HTML unescape`

### 9.5 Text Formatting

**Header:** `Text Formatting`

**Initial body (MVP guidance):**

* Empty state:

  * Title: “Formatting tools”
  * Text: “Add heading toggles, bullet lists, indentation, and more.”

**Future expansion:**

* Controls:

  * Convert text to:

    * Heading levels (`H1`, `H2`, `H3`)
    * Bulleted list
    * Numbered list
  * Indentation:

    * `Indent`
    * `Outdent`

### 9.6 Panel Footer

Footer content example:

* Left: `Tools`
* Right: `5 panes`

---

## 10. Modals

Modals share:

* Full-screen backdrop with blur and dark overlay.
* Center glass panel with:

  * Header (title + close “×”)
  * Body (content / form)
  * Footer (buttons)

### 10.1 Settings Modal

* Title: `Settings`
* Content:

  * Theme preference (Dark / Light)
  * Possibly autosave behavior
  * LocalStorage reset option (“Reset local workspace”)
* Buttons:

  * `Close`
  * `Save`

### 10.2 Help Modal

* Title: `Help & Shortcuts`
* Content:

  * Description of layout:

    * What Workspace does
    * What Tools does
    * How the editor behaves
  * Keyboard shortcuts (future)

### 10.3 Save Snippet Modal

* Title: `Save snippet`
* Fields:

  * Name
  * Tags
  * Notes
  * Snippet content (textarea)
* Buttons:

  * `Cancel`
  * `Save snippet`

### 10.4 Create Template Modal

* Title: `Create template`
* Fields:

  * Template name
  * Template body (textarea)
* Buttons:

  * `Cancel`
  * `Save template`

---

## 11. Local Storage Behavior

### 11.1 Data Stored

* **Editor data**

  * Current document content
  * Last active document ID (future multi-doc support)

* **Workspace state**

  * Custom templates
  * Saved snippets
  * Favorites mapping

* **Layout state**

  * Whether left/right panels are collapsed
  * Which tool sections are collapsed
  * Optionally scroll positions

* **Settings**

  * Theme (dark/light)
  * Possibly other preferences

### 11.2 Lifecycles

* **On app load:**

  * Read LocalStorage.
  * If version matches current:

    * Hydrate state.
  * If version mismatched:

    * Run migration logic or reset selective parts (e.g. layout but not content).

* **On change:**

  * Editor input:

    * Debounced save of editor content.
  * Template/snippet add/remove:

    * Immediate save of updated collections.
  * Panel collapse:

    * Save panel state.
  * Theme toggle:

    * Save theme preference.

* **Reset option (Settings):**

  * “Reset local workspace”
  * Confirm prompt before clearing:

    * Editor content
    * Templates & snippets
    * Favorites
    * Layout & settings

---

## 12. File & Directory Structure (Implementation Note)

A suggested project structure:

```text
textman/
├─ index.html
├─ favicon.png
├─ assets/
│  ├─ logo-textMan.svg
│  ├─ loader-logo.svg        # optional stylized version
│  └─ icons/                 # optional individual UI icons
│
├─ css/
│  ├─ base/
│  │  ├─ reset.css
│  │  └─ tokens.css
│  ├─ layout/
│  │  ├─ shell.css
│  │  └─ panels.css
│  ├─ components/
│  │  ├─ header.css
│  │  ├─ sidebar-left.css
│  │  ├─ sidebar-right.css
│  │  ├─ editor.css
│  │  ├─ tools-transform.css
│  │  ├─ tools-search.css
│  │  ├─ tools-prefix.css
│  │  ├─ tools-encoding.css
│  │  ├─ tools-formatting.css
│  │  └─ modals.css
│  └─ themes/
│     ├─ dark.css
│     └─ light.css
│
├─ js/
│  ├─ core/
│  │  ├─ state.js
│  │  ├─ storage.js
│  │  └─ dom.js
│  ├─ ui/
│  │  ├─ header.js
│  │  ├─ layout.js
│  │  ├─ editor.js
│  │  ├─ tools-transform.js
│  │  ├─ tools-search.js
│  │  ├─ tools-prefix.js
│  │  ├─ tools-encoding.js
│  │  ├─ tools-formatting.js
│  │  └─ modals.js
│  ├─ loader/
│  │  └─ loader.js
│  └─ app.js
│
└─ README.md
```

---
