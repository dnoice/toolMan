<!--
✒ Metadata
    - Title: ImprovementsProposal (toolMan Edition - v1.0)
    - File Name: IMPROVEMENTS.md
    - Relative Path: IMPROVEMENTS.md
    - Artifact Type: docs
    - Version: 1.0.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Description:
    Curated quality-of-life improvements for every major area of the hub and
    textMan, plus the roadmap of additional text tools that turn textMan into
    a comprehensive all-in-one manipulation toolkit. Each item is tagged
    Impact (H/M/L) × Effort (S/M/L); the Next Five shortlist is the
    recommended starting order. Proposal only — nothing here is implemented
    until green-lit.

✒ Key Features:
    - Hub: five areas, 12 improvements
    - textMan: eight areas, ~40 improvements
    - Five proposed NEW right-sidebar panes for textMan
    - Ecosystem scoping for the four planned tools + two new tool proposals
    - Impact×Effort tags throughout and a Next Five shortlist

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer
---------
-->

# toolMan / textMan — QoL Improvements & Toolkit Roadmap

Tags: **Impact** H/M/L × **Effort** S/M/L. Everything honors the house rules:
viewport-fit, manipulate-first, LocalStorage-only, zero dependencies.

## The Next Five (recommended order)

1. **Editor line/col + Go-to-line + word-wrap toggle** (H×S) — table stakes
   for a text IDE feel.
2. **Settings surfaces what Storage already does** (H×S) — Export/Import
   workspace buttons + storage usage meter; `Storage.export/import/
   getUsageInfo` exist and are invisible today.
3. **Case family transforms** (H×S) — camelCase / PascalCase / snake_case /
   kebab-case / CONSTANT_CASE; the single most-requested class of text op.
4. **Snippet & template search/filter** (H×S) — one input above each list;
   both lists become unusable past ~15 items without it.
5. **History restore points** (H×M) — snapshot on save (keep last 10),
   click to restore with a confirm diff; turns History from a log into a
   safety net.

## Hub

### Loader
- **Returning-visitor fast path** (M×S): after the first visit of the day
  (sessionStorage flag), shorten MIN_DISPLAY to ~1.2s — ceremony for
  arrivals, speed for regulars.

### Header
- **Tool search** (M×S): type-ahead filter over the registry; `/` focuses it.
- **Keyboard grid nav** (M×S): arrow keys move card focus, Enter launches.

### Hero
- **"Continue where you left off" chip** (H×S): reads each tool's storage
  stamp; one click reopens textMan with your document intact.

### Tool grid
- **Last-used ordering + pin** (M×S): live tools float to their usage order;
  manipulate-first says the user can pin.
- **Per-card data badge** (M×S): "3 snippets · 12 KB" from getUsageInfo —
  makes local-first tangible.
- **Card-level data reset** (M×S): per-tool "clear my data" on the card
  (confirm-guarded), instead of only inside each tool.

### Footer
- **Version stamp + GitHub link** (L×S): TOOLMAN.VERSION and the repo,
  quietly in the footer.

## textMan

### Header
- **Editable document title** (H×S): name the doc inline; persists, feeds
  the download filename and the browser tab.
- **Zen mode** (M×S): Ctrl+\ collapses both panels; again restores the
  previous layout.

### Editor
- **Line/col indicator + Go-to-line (Ctrl+G)** (H×S)
- **Word-wrap toggle + font-size stepper** (H×S): persisted in settings.
- **Download .txt/.md + Copy All** (H×S): the missing exits.
- **Selection-aware stats** (M×S): stats pills show selection counts while
  a selection exists ("Words 14 / 1,204").
- **Restore caret/scroll after transforms** (M×S): keep the viewport where
  the user was working.

### Templates
- **Edit + duplicate existing** (H×M): seeds become starting points.
- **Search/filter + use-count badge** (H×S)
- **Import/export templates JSON** (M×S)

### Snippets
- **Search + tag-click filtering** (H×S)
- **Sort recent/name, pinned favorites first** (M×S)
- **Inline expanding preview** (M×S): click the preview to see all of it.

### History
- **Restore points** (H×M): see Next Five #5.
- **Absolute timestamp on hover + Clear history** (L×S)

### Analytics
- **Top-3 transforms table + words-per-session average** (M×S)
- **Readability score (Flesch)** (M×S): pure function, no deps.

### Tools panes (existing)
- **Transform**: case family (Next Five #3); smart↔straight quotes; strip
  accents/diacritics (H×S, `String.normalize`).
- **Search & Replace**: match count per scope before replacing (M×S);
  last-5 search history dropdown (M×S); replace-all preview diff reusing
  the LCS renderer (M×M).
- **Prefix/Suffix**: `{n}` numbering token with padding (`{n:03}`) (M×S);
  skip-lines-matching filter (L×S).
- **Encoding**: Base64URL variant (M×S); JWT payload decode — decode only,
  clearly labeled no-verify (M×S); hex encode/decode (L×S).
- **Formatting**: markdown table formatter (H×M); code-fence wrap with
  language prompt (M×S); strip-markdown (M×S).

### Settings
- **Export/Import + usage meter** (Next Five #2).
- **Tab size + autosave delay controls** (L×S).

## New textMan panes (the all-in-one toolkit)

Five additional right-sidebar accordion panes, each honoring
selection-or-document and the EditorUI pipeline:

| Pane | Contents | Tag |
| ---- | -------- | --- |
| **Inspect** | word frequency top-10, char classes, line lengths, readability, longest line | H×M |
| **Extract** | pull emails / URLs / numbers / IPs / regex-matches into the editor or clipboard | H×M |
| **Compare** | paste a second text, LCS diff against the document (renderer exists), copy patch | H×M |
| **Generate** | lorem ipsum (words/sentences/paragraphs), UUIDs, sequential/random numbers | M×S |
| **Clean** | strip HTML tags, normalize unicode (NFC/NFD), collapse blank lines to N, trim trailing per line, tabs↔spaces | H×S |

Accordion + drag-reorder means new panes cost no vertical real estate —
users arrange the toolkit they actually use. Registry note: each pane is a
`data-section` + PANEL_SECTIONS entry + one JS module + one CSS file.

## Ecosystem tools (the -Man roster)

Scopes for the planned four, so panes land in the right tool instead of
bloating textMan:

- **devMan** — JSON format/minify/validate, regex tester with live matches,
  hashes (SubtleCrypto SHA-256/512), JWT inspector, UUID/ULID, cron reader.
- **convertMan** — units, number bases, timestamps/epochs, CSV ↔ JSON ↔
  markdown table.
- **colorMan** — conversions, palette builder, WCAG contrast, gradients.
- **mathMan** — expression evaluator, arbitrary precision, stats over a
  pasted number list.

Two NEW tool proposals:

- **markMan** (H×L) — markdown workbench: live preview, TOC, heading
  navigator, export HTML. Justifies itself the moment preview is wanted —
  preview inside textMan would break the three-panel contract.
- **diffMan** (M×M) — dedicated two-pane compare with word-level diff and
  patch export; textMan's Compare pane is the gateway, diffMan is the
  destination.

Boundary rule: if an operation *transforms the current document*, it's a
textMan pane. If it's *its own workspace* (preview, two-pane compare,
palette), it's a tool.

`︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!`
