<!--
✒ Metadata
    - Title: ChangelogArchive (toolMan Edition - v1.0)
    - File Name: CHANGELOG.md
    - Relative Path: CHANGELOG.md
    - Artifact Type: docs
    - Version: 1.0.0
    - Date: 11/17/2026
    - Update: Tuesday, November 17, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Description:
    The long-form changelog archive for toolMan's browser-shipped files.
    Shipped JavaScript, CSS, and HTML keep only their three newest changelog
    entries in their own headers; every older entry moves here verbatim, so
    the header and this file together form one complete record per file.

✒ Key Features:
    - One section per source file, headed by its repository-relative path
    - Entries newest first within each section, exactly as they were logged
    - Original dates and attribution tags preserved, never rewritten
    - Grows only when a file's header rolls an entry out of its window

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer
---------
-->

# Changelog archive

Older changelog entries for toolMan's browser-shipped files. Each file's own
header carries its three newest entries; this archive holds the rest, newest
first, under the file's path.

## `shared/css/tokens.css`

- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added per-theme depth tokens (card-gradient, card-inset, card-shadow, card-shadow-hover, vignette) so cards and tool sections separate cleanly from the canvas — sharpens contrast in Sentinel Obsidian especially.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Replaced the original cyan/purple glassmorphism palette with the digiSpace house token system (Parchment Dossier light theme + Sentinel Obsidian dark theme) sourced from token.txt. Themes now switch via [data-theme] on <html> instead of swapping theme stylesheets. Added app-layer tokens (glass, panels, buttons, glows) derived from the house palette, plus legacy aliases so existing layout CSS keeps resolving. Relocated to shared/css/ as the ecosystem-wide design layer for all toolMan tools.
- 1.0.0 (2025-11-18) [model not recorded] — Initial design system with cyan/purple palette, spacing, typography, shadows, and utilities.

## `shared/css/panels.css`

- 2.4.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Glitch-free sheen (owner complaint #2): the reflection sweep is now a one-shot sheenSweep keyframe played on hover-in — leaving mid-sweep snaps it invisible instead of replaying it backwards; suppressed on dragging sections. Narrowed every transition:all in the hot paths to named properties.
- 2.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Accordion pane sizing: sections are grid rows (header auto + body 0fr↔1fr) with an animated reveal; the open section takes the sidebar's remaining height and scrolls internally, closed sections shrink to their headers. Removed the empty-state min-height that inflated unpopulated panes past the viewport; added scrollbar-gutter so opening a scrolling pane never shifts layout.
- 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Collapsed-rail redesign (audit finding F3): a collapsed panel's header becomes a true 48px vertical rail — zero horizontal padding, vertical-writing title, centered chevron, full-height click-to-expand target with hover affordance. Previously the 24px paddings left a 0px content box that clipped the expand button entirely off-canvas.
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Tool sections now ride the theme depth tokens (card gradient, inset highlight, layered shadows) for sharper contrast; added the manipulate-your-workspace drag styling (grab cursor on section headers, dashed gold ghost state while a section is being dragged).
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to shared/css/ for the toolMan ecosystem. Panel headers now wear the house navy-gradient with gold titles; tool sections, buttons, form controls, and empty states recolored from the token system. Added shared form control styles (text-input, select-input, toggle-pill) used by every tool pane.
- 1.0.0 (2025-11-18) [model not recorded] — Initial shared panel structure: headers, collapsible sections, footers, buttons.

## `tools/textman/css/editor.css`

- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Editor QoL batch styling: editable document-title input, font-size label, toolbar divider, word-wrap active state, no-wrap textarea variant, the line/col caret pill, and the selection-aware stats accent.
- 1.0.1 (2026-07-22) [Anthropic - Claude Opus 4.8] — Narrowed the control-button and stat-pill transition:all declarations to named properties (motion-polish pass).
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial editor styles.

## `tools/textman/css/sidebar-left.css`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial workspace sidebar styles.

## `tools/textman/index.html`

- 2.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Editor QoL batch: editable document title, font-size stepper, word-wrap toggle, download and copy-all controls, a line/col stat pill, and the Ctrl+G / Ctrl+\ shortcuts documented in Help.
- 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Mobile reachability (audit finding F5): header gains Workspace/Tools toggle buttons that appear under 768px and drive the slide-in panels via data-mobile-open.
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Help modal documents the new panel-toggle shortcuts (Ctrl/Cmd+[ and Ctrl/Cmd+]) added by the collapse-recovery overhaul (audit finding F4).
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Rebuilt for the toolMan ecosystem: relocated to tools/textman/, all asset paths point at shared/, theme switching via data-theme (no theme stylesheets), logos inlined so currentColor theming works, Encoding and Formatting panes implemented (were placeholders), Transform pane expanded to 12 operations, Diff modal added, back-to-hub breadcrumb, and every script the page references now actually exists (v1 loaded 13 missing files — the loader never handed off).
- 1.0.0 (2025-11-18) [model not recorded] — Initial three-panel layout.

## `tools/textman/js/app.js`

- 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — applyPanelStates delegates section state to LayoutUI.applyAccordionState (exclusive accordion model) instead of iterating the removed collapsedSections booleans.
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Panel recovery shortcuts (audit finding F4): Ctrl/Cmd+[ toggles the Workspace panel and Ctrl/Cmd+] the Tools panel; applyPanelStates now routes panel collapse through LayoutUI.setPanelCollapsed so aria and tooltips stay in sync on restore.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Rebuilt for the toolMan ecosystem: boots every UI module through an error-isolated registry (one failing module no longer kills the app), removed the fake loading delays, theme handling delegated to TOOLMAN, save flow unified through EditorUI, and the loader handoff now actually fires (the v1 bug: missing scripts meant init never ran).
- 1.0.0 (2025-11-18) [model not recorded] — Initial five-step initialization skeleton.

## `tools/textman/js/ui/layout.js`

- 1.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Collapse recovery overhaul (audit findings F3/F4): extracted a public togglePanel/setPanelCollapsed API consumed by app.js's new Ctrl/Cmd+[ and Ctrl/Cmd+] shortcuts, made the entire collapsed rail a click-to-expand target, and kept aria-expanded plus button/header tooltips in sync with every state change.
- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added drag-and-drop section reordering in both sidebars (grab a section header, drop it where you want it), persisted per panel through ui.sectionOrder and reapplied on boot — the first "manipulate your workspace" feature. Collapse clicks are suppressed briefly after a drag so dropping a section never accidentally collapses it.
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial layout controller: panel and section collapse with persistence.

## `tools/textman/js/ui/modals.js`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial dialog controller: focus trap, Escape/backdrop close, submit flows.

## `tools/textman/js/ui/editor.js`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial editor engine: undo/redo, stats, file open/drop, diff, autosave, applyToSelectionOrAll.

## `tools/textman/css/modals.css`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial modal styles.

## `shared/css/shell.css`

- 2.4.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Theme toggle now shows a moon in the light (parchment) theme and a sun in the dark (sentinel) theme, swapped purely by data-theme so it flips the instant the theme changes.
- 2.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Mobile reachability (audit finding F5): .mobile-only header buttons appear under 768px, and a .mobile-scrim overlay dims the stage behind a slid-in panel and closes it on tap.
- 2.2.1 (2026-07-22) [Anthropic - Claude Opus 4.8] — Narrowed the header icon buttons' transition:all to the named properties that actually animate (motion-polish pass).
- 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Viewport-fit hardening (audit findings F1/F2): 100dvh fallbacks on the app frame and loader so dynamic-chrome mobile browsers never clip the bottom band, and min-height/min-width:0 guards on the grid's panel children so content can never inflate the height chain past the viewport.
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Layered the per-theme vignette token into the canvas washes for stronger figure/ground separation, most visibly in Sentinel Obsidian.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to shared/css/ for the toolMan ecosystem. All colors now resolve from the house token system (navy/gold, parchment/sentinel themes). Loader background and progress bar recolored to the digiSpace identity.
- 1.0.0 (2025-11-18) [model not recorded] — Initial app shell: sticky header, three-column grid, loading screen, responsive breakpoints.
