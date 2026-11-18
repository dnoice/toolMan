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

- 2.2.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Loader token family so the load screen tracks the theme instead of drifting from it: --loader-card-bg/-border, --loader-title, --loader-text, --loader-track, --loader-accent/-bright/-rgb, and --loader-sat-bg, defined per theme. Parchment's --loader-bg flipped from the shared navy gradient to a warm cream one, so a light-theme visitor no longer watches a dark loader hand off to a light landing page.
- 2.1.1 (2026-07-23) [Anthropic - Claude Opus 4.8] — Softened the reflection-gradient sheen: lower peak alpha (0.35->0.16 parchment, 0.08->0.055 sentinel) and a narrower band, so the panel/tool-header hover glint glides rather than flashes (pairs with panels.css 2.4.2).
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added per-theme depth tokens (card-gradient, card-inset, card-shadow, card-shadow-hover, vignette) so cards and tool sections separate cleanly from the canvas — sharpens contrast in Sentinel Obsidian especially.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Replaced the original cyan/purple glassmorphism palette with the digiSpace house token system (Parchment Dossier light theme + Sentinel Obsidian dark theme) sourced from token.txt. Themes now switch via [data-theme] on <html> instead of swapping theme stylesheets. Added app-layer tokens (glass, panels, buttons, glows) derived from the house palette, plus legacy aliases so existing layout CSS keeps resolving. Relocated to shared/css/ as the ecosystem-wide design layer for all toolMan tools.
- 1.0.0 (2025-11-18) [model not recorded] — Initial design system with cyan/purple palette, spacing, typography, shadows, and utilities.

## `shared/css/panels.css`

- 2.4.2 (2026-07-23) [Anthropic - Claude Opus 4.8] — Refined the header sheen sweep (owner feedback): a single soft opacity peak at mid-cross instead of a bright hold, on a slower 900ms ease-out glide (was 650ms), so the reflection glides rather than flashes. Pairs with the lowered reflection-gradient alpha in tokens.css 2.1.1.
- 2.4.1 (2026-07-23) [Anthropic - Claude Opus 4.8] — Removed the stale .tool-section { flex: 0 0 auto } override in the <=768px block — a leftover from the pre-accordion equal-panes layout that fought the accordion's own sizing (open = 1 1 auto, collapsed = 0 0 auto) on mobile. The accordion now governs pane height at every width.
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

- 2.4.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Tool-pane additions: transform case family + strip-accents + smart/straight quotes, encoding Base64URL/hex/JWT, and formatting code-fence + strip-markdown buttons.
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

- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Settings QoL: autosave-delay and tab-size range controls (live labels), a storage usage meter, and Export/Import workspace wired to the shared Storage.export/import — editor prefs re-apply after save/import.
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial dialog controller: focus trap, Escape/backdrop close, submit flows.

## `tools/textman/js/ui/editor.js`

- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial editor engine: undo/redo, stats, file open/drop, diff, autosave, applyToSelectionOrAll.

## `tools/textman/css/modals.css`

- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Settings QoL styles: brand-accented range sliders and the local-storage usage meter (track + gold fill).
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial modal styles.

## `shared/css/shell.css`

- 2.5.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — The loading screen now tracks the theme instead of holding a fixed navy/gold look. Every hardcoded loader colour (card glass, title, tagline, status, bar track, progress fill and its glow, logo tint) resolves from the new --loader-* tokens in tokens.css 2.2.0, so a parchment visitor gets a warm cream loader handing off to a warm cream page — the drift between intro and app is gone.
- 2.4.1 (2026-07-23) [Anthropic - Claude Opus 4.8] — Scoped the .loader-logo pulse/sizing rule to the direct child (.loader-logo > svg/img) so the hub loader's nested orbiting tool-icon satellites do not inherit the central mark's fill sizing or pulse. Corrected the stale title version tag (v2.2 -> v2.4).
- 2.4.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Theme toggle now shows a moon in the light (parchment) theme and a sun in the dark (sentinel) theme, swapped purely by data-theme so it flips the instant the theme changes.
- 2.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Mobile reachability (audit finding F5): .mobile-only header buttons appear under 768px, and a .mobile-scrim overlay dims the stage behind a slid-in panel and closes it on tap.
- 2.2.1 (2026-07-22) [Anthropic - Claude Opus 4.8] — Narrowed the header icon buttons' transition:all to the named properties that actually animate (motion-polish pass).
- 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Viewport-fit hardening (audit findings F1/F2): 100dvh fallbacks on the app frame and loader so dynamic-chrome mobile browsers never clip the bottom band, and min-height/min-width:0 guards on the grid's panel children so content can never inflate the height chain past the viewport.
- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Layered the per-theme vignette token into the canvas washes for stronger figure/ground separation, most visibly in Sentinel Obsidian.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to shared/css/ for the toolMan ecosystem. All colors now resolve from the house token system (navy/gold, parchment/sentinel themes). Loader background and progress bar recolored to the digiSpace identity.
- 1.0.0 (2025-11-18) [model not recorded] — Initial app shell: sticky header, three-column grid, loading screen, responsive breakpoints.

## `index.html`

- 1.3.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Theme toggle carries both sun and moon icons (CSS swaps by data-theme). Card icons come from shared/js/hub.js, where textMan now uses its real pen mark.
- 1.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Hub QoL batch: tool-search input in the header, "Continue where you left off" hero slot, and the version + GitHub footer line (grid enrichments live in shared/js/hub.js 1.1.0).
- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Replaced the fountain-pen mark (textMan's identity) with the placeholder toolbox mark (logo-toolMan.svg) in the loader, header, hero, and favicon.
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial hub page: loading screen, registry-driven tool grid, theme toggle.

## `shared/css/hub.css`

- 1.3.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Viewport-fit landing page: the hub used to overflow on any monitor shorter than ~1536px tall (the footer and part of the grid pushed off-screen — 126px clipped at 1440x900, 306px at 1280x720). Added a height-keyed breakpoint ladder — 900px compresses the hero, 780px tightens card density and drops the subtitle, 680px sheds the logo and tagline — so the grid and footer stay in view as the viewport shrinks, while a tall reference monitor keeps the full spacing. The footer now anchors to the viewport bottom (margin-top:auto, collapsing to 0 under overflow), and the base main/hero paddings dropped 2xl->xl. Verified 0 overflow from 2560x1440 down to 1024x600. (Also folds in the earlier search- field shrink at <=480 from the media-query pass.)
- 1.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Hub QoL batch: header tool-search field, continue chip, card overlay launch link (cards are now articles), pin/reset card actions, stored-data and last-used badges, empty-filter message, and the footer meta line.
- 1.1.1 (2026-07-22) [Anthropic - Claude Opus 4.8] — Narrowed the tool-card transition:all to named properties (motion-polish pass).
- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Tool cards now ride the theme depth tokens (card gradient, inset edge highlight, layered shadows, stronger hover elevation) for real figure/ground contrast on the Sentinel canvas; icon tiles gain a hairline border.
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial hub styles: hero, tool card grid, live/coming-soon states, footer.

## `shared/js/dom.js`

- 1.0.0 (2025-11-18) [model not recorded] — Initial DOM helpers and text utilities.

## `shared/js/loader.js`

- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to shared/js/ for the toolMan ecosystem and hardened: added a fail-safe timeout that force-completes the loader if the app never reports ready (the exact failure mode that used to strand users on the load screen), configurable status messages, guarded double-init, reduced-motion support, and full timer cleanup on hide.
- 1.0.0 (2025-11-18) [model not recorded] — Initial loading screen with progress bar and rotating status messages.

## `tools/textman/js/state.js`

- 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added ui.sectionOrder (workspace/tools) with the setSectionOrder helper and restore-merge support, persisting the user's drag-and-drop section arrangement — the first "manipulate your workspace" feature.
- 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Moved into the toolMan ecosystem (tools/textman/). Storage now namespaced under 'toolman.textman.state' with automatic migration from the legacy 'textman-state' key. Hardened: collision-proof IDs via crypto.randomUUID, input validation on all mutators, allowlisted restore merge, transform usage tallies for analytics, and theme moved to the ecosystem level.
- 1.0.0 (2025-11-18) [model not recorded] — Initial centralized state with four seed templates and CRUD helpers.

## `shared/js/toolman.js`

- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Ecosystem usage layer: stampLastUsed/getLastUsed (per-tool timestamps), pinned-tool persistence (getPinned/togglePinned), getToolDataInfo (stored bytes plus textMan snippet/template counts), and clearToolData — all consumed by the hub's card ordering, badges, and reset actions.
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial kernel: registry, theme management, toasts.

## `shared/js/hub.js`

- 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Hub QoL batch: type-ahead tool search ('/' focuses it), arrow-key navigation across launch links, a "Continue where you left off" hero chip, card ordering by pinned → last-used → registry, per-card stored-data badges, pin and confirm-guarded data-reset actions, and the version + GitHub footer line. Cards are now <article> elements with an overlay launch link (valid markup with interactive children).
- 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial hub boot: registry-driven cards, theme toggle, loader handoff.
