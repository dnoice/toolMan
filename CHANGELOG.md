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

- 1.0.1 (2026-07-22) [Anthropic - Claude Opus 4.8] — Narrowed the control-button and stat-pill transition:all declarations to named properties (motion-polish pass).
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial editor styles.

## `tools/textman/css/sidebar-left.css`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial workspace sidebar styles.
