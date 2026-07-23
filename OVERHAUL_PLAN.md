<!--
✒ Metadata
    - Title: UiOverhaulPlan (textMan Edition - v1.1)
    - File Name: OVERHAUL_PLAN.md
    - Relative Path: OVERHAUL_PLAN.md
    - Artifact Type: docs
    - Version: 1.1.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Changelog:
    - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Execution status
      added: P0–P4 shipped and smoke-proven the same day (see Status).
    - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial audited
      blueprint.

✒ Description:
    The audited, phased game plan for overhauling textMan's UI layout and
    behavior. Grounded in a multi-agent audit with live-browser measurements;
    the five critical findings below survived adversarial verification with
    quoted code evidence. Each phase is small, independently testable, and
    maps back to the findings it resolves. Delete this file once every phase
    has shipped.

✒ Key Features:
    - Five verified critical findings with root-cause mechanisms
    - Thirty-one plausible secondary findings (verification interrupted)
    - Six phases in dependency order, each with file list + proof test
    - State-schema migration spec (collapsedSections → accordion openSection)
    - Explicit finding → phase resolution map and deferred list

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer
---------
-->

# textMan UI Overhaul — Game Plan

## Status — EXECUTED 2026-07-22

| Phase | Commit | Proof |
| ----- | ------ | ----- |
| P0 height chain | `62bae4d` | doc == viewport at 1440/1366; stats visible |
| P1 collapsed rail | `987d043` | rail hit-testable; Ctrl+[ / ] round-trip |
| P2 accordion | `f63159b` | exclusive-open; legacy payload migrates |
| P3 sheen | `f4fea94` | animationName sheenSweep→none; no reverse |
| P4 mobile | `c02f855` | 375×667 slide-in + scrim dismiss |
| P5 sweep | this commit | full suite green, zero console errors |

Four owner complaints drove the audit. All four reproduced, all four have
verified root causes.

## Verified findings (adversarially confirmed, code-quoted)

| # | Severity | Root cause | Complaint |
| - | -------- | ---------- | --------- |
| F1 | Critical | `DOM.fadeIn` (shared/js/dom.js:243) stamps inline `display:block` on `#app` at loader handoff, overriding `.app { display:flex }`. The height chain dies; the app renders ~2,100–2,260px tall in a 768–1080px viewport and `overflow:hidden` **amputates** (not scrolls) everything below the fold — favorites/analytics/encoding/formatting panes and the editor stats bar are unreachable at common resolutions. Probe-verified: clearing the inline display instantly restores full viewport fit. | 4 |
| F2 | Critical | `.app` and the loader are `100vh` with no `dvh` fallback — on dynamic-chrome mobile browsers the bottom 40–100px (panel footers, editor stats) sits under the browser UI, unscrollable. | 4 |
| F3 | Critical | Collapsed panel = 48px column, but `.panel-header` keeps `padding: 0 24px` → 0px content box. The unshrinkable title pushes the 32px expand button to x≈113 — fully clipped by `overflow:hidden`. Measured: button box w=2px; `elementFromPoint` at its center hits the `h2`. **No collapsed-rail design exists at all.** | 1 |
| F4 | Critical | No keyboard shortcut toggles panels (only Ctrl+S/F/,/Esc exist). Combined with F3: zero recovery routes, and the dead state **persists across reload**. | 1 |
| F5 | Critical | `data-mobile-open` exists only in CSS — no JS ever sets it, no hamburger exists. Below 768px both sidebars are permanently unreachable. | — |

## Plausible findings (dedupe pass; verification interrupted — treat as design input)

Sheen replays **backwards** on hover-exit (`transition: all` on a two-state
::before — the "glitchy" mechanism, complaint 2); five `flex:1` sections split
sidebar height evenly regardless of content (complaint 3); `.empty-state
min-height:200px` inflates unpopulated panes; `.tool-header` is
simultaneously collapse-toggle and drag-handle with wrong semantics for an
accordion (no button role, no aria-expanded, no keyboard toggle); ten
independent `collapsedSections` booleans can't express exclusive-open;
`cursor:grab` is dead on touch; instant-snap panel collapse (no transition);
`transition: all` stacking on tool buttons; no `scrollbar-gutter`; stale
`draggable=true` when pointerup lands outside; sheen retriggers during drag;
eager rendering into all five panes; 769–780px grid dead band.

## Target design

1. **Viewport contract** — the app NEVER exceeds the viewport. `100dvh` with
   `100vh` fallback; the only scrollable region is the open pane's body.
2. **Collapsed rail** — a collapsed panel becomes a real 48px rail: zero
   header padding, vertical `writing-mode` label, the chevron centered and
   clickable, the whole rail a click-to-expand target with tooltip +
   `aria-expanded`. Plus keyboard: `Ctrl/Cmd+[` toggles left, `Ctrl/Cmd+]`
   toggles right (Help modal updated).
3. **Exclusive accordion** — one open section per sidebar. Closed sections are
   header-only rows; the open section takes all remaining height and scrolls
   internally. Reveal animated via `grid-template-rows: 0fr→1fr` wrapper
   (transform/opacity-free of layout jank, honors reduced-motion). Headers
   become true accordion triggers: `role`/keyboard/`aria-expanded` on a
   real button. Empty-state `min-height` removed in sidebar context.
4. **Glitch-free sheen** — replace the two-way `transition` with a one-shot
   `animation` played on hover-in only (no reverse sweep on exit, no
   mid-sweep jitter), suppressed while dragging and under reduced-motion.
   Narrow every `transition: all` in the hot paths to named properties.
5. **Mobile reachability** — wire `data-mobile-open`: two header toggle
   buttons appear under 768px; panels slide in as designed; backdrop tap
   closes.

## Phases (each: small diff → smoke proof → commit)

**P0 · Hotfix the height chain** — *fixes F1, F2*
`shared/js/dom.js` (fadeIn must not stamp `display:block`; restore `''` or
accept a display argument), `shared/css/shell.css` + loader (`100dvh`
fallback), `min-height:0` guards where the chain needs them.
Proof: scrollHeight == innerHeight at 1920/1366/1280; editor stats visible.

**P1 · Collapsed rail + panel shortcuts** — *fixes F3, F4*
`shared/css/panels.css` (`.panel[data-collapsed] .panel-header` rail rules),
`tools/textman/js/ui/layout.js` (rail click target), `tools/textman/js/app.js`
(Ctrl+[ / Ctrl+]), `tools/textman/index.html` (Help modal), aria sync.
Proof: collapse → click rail → expands; shortcut round-trip; persisted
collapsed state recovers after reload.

**P2 · Accordion conversion** — *fixes complaint 3 + viewport arithmetic*
`tools/textman/js/state.js` (schema: `ui.openSection = {workspace, tools}`;
migration from `collapsedSections` in `migrations` + `mergeRestore`; bump
state version), `layout.js` (exclusive toggle, drag interplay, keyboard),
`app.js` (`applyPanelStates` → apply openSection), `panels.css` (accordion
sizing + 0fr/1fr reveal, empty-state fix, `scrollbar-gutter`),
`index.html` (header button semantics).
Proof: one pane open per sidebar; open pane scrolls internally; drag-reorder
still works and never mis-toggles; persistence survives reload; old saved
payloads migrate cleanly.

**P3 · Sheen + motion polish** — *fixes complaint 2*
`panels.css` (one-shot sheen keyframes; kill reverse sweep), narrowed
transitions in `panels.css`/`sidebar-right.css`/`editor.css`, drag-state
sheen suppression, reduced-motion coverage.
Proof: hover-exit mid-sweep shows no reverse pass (visual + computed check).

**P4 · Mobile reachability** — *fixes F5*
`index.html` (two mobile toggle buttons), `layout.js` (set/clear
`data-mobile-open`, backdrop close), `shell.css` (button visibility, 769–780
dead-band check).
Proof: at 375×667 both panels open/close; nothing overflows.

**P5 · Sweep & ship** — full smoke suite (all P0–P4 proofs + existing
regression tests), SemVer bumps + changelog entries on every touched file
per the house standard, commit + push per phase or as a reviewed batch.

## Resolution map

F1→P0 · F2→P0 · F3→P1 · F4→P1 · complaint 3 cluster→P2 · complaint 2
cluster→P3 · F5→P4 · transitions/scrollbar-gutter/eager-render→P2/P3 ride-alongs.

## Deferred (explicitly out of scope)

Keyboard-accessible drag reorder; touch drag-and-drop; backdrop-filter
performance audit; multi-document editor; the 31 unverified findings not
absorbed above get re-checked opportunistically as their files are touched.

`︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!`
