<!--
✒ Metadata
    - Title: SharedLayerGuide (toolMan Edition - v1.0)
    - File Name: README.md
    - Relative Path: shared/README.md
    - Artifact Type: docs
    - Version: 1.0.0
    - Date: 2026-07-22
    - Update: Wednesday, July 22, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Description:
    Documentation for the toolMan shared layer — the CSS design system and
    JavaScript libraries every tool consumes. Explains load order, the
    contract each module offers, and how a new tool plugs in.

✒ Key Features:
    - CSS load-order table: reset → tokens → shell → panels (+ hub-only styles)
    - Documents the data-theme switching model (parchment | sentinel on <html>,
      no per-theme stylesheets)
    - JavaScript contract table: TOOLMAN kernel, DOM/Text helpers,
      Storage/Autosave, Loader fail-safe, hub boot
    - Five-step checklist for plugging a new tool into the ecosystem

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer (GitHub-flavored tables used)
---------
-->

# shared/ — the toolMan common layer

Everything in this directory is consumed by **every** tool. Changing a file
here changes the whole ecosystem — aim twice.

## CSS (load in this order)

| File | Role |
| ---- | ---- |
| `css/reset.css` | Browser normalization, token-driven scrollbars/focus rings |
| `css/tokens.css` | **The design system.** Brand anchors + both themes (Parchment Dossier / Sentinel Obsidian) + structural scales. Sourced from `token.txt`. |
| `css/shell.css` | App skeleton: header, three-column grid, loading screen, toasts |
| `css/panels.css` | Panel chrome: headers, collapsible sections, buttons, form controls |
| `css/hub.css` | Hub-only: hero + tool card grid |

Themes switch via `data-theme="parchment" | "sentinel"` on `<html>` — there
are **no** per-theme stylesheets.

## JavaScript

| File | Global | Contract |
| ---- | ------ | -------- |
| `js/toolman.js` | `TOOLMAN` | Ecosystem kernel: tool registry, theme get/set/toggle (persisted at `toolman.theme`, applied pre-paint — load this in `<head>`, first), toast notifications (`TOOLMAN.notify`) |
| `js/dom.js` | `DOM`, `Text` | Null-safe DOM helpers, event delegation, debounce/throttle, clipboard, text measurement/escaping |
| `js/storage.js` | `Storage`, `Autosave` | Namespaced LocalStorage persistence. Tools call `Storage.configure({key, version, getState, restore, trim, migrations})` once; parsing is prototype-pollution safe; autosave flushes on `pagehide` |
| `js/loader.js` | `Loader` | Loading-screen controller with an 8s fail-safe — the app can never be stranded behind the loader |
| `js/hub.js` | — | Hub page boot: renders launcher cards from `TOOLMAN.tools` |

## Plugging in a new tool

1. Create `tools/<toolid>/` with its own `index.html`, `css/`, `js/`.
2. In `<head>`: `<script src="../../shared/js/toolman.js"></script>` first,
   then shared CSS (reset → tokens → shell → panels), then tool CSS.
3. Register the tool in `TOOLMAN.tools` (`js/toolman.js`) — the hub picks it
   up automatically.
4. Configure persistence: `Storage.configure({ key: 'toolman.<toolid>.state', ... })`.
5. Give every file the house ✒ Metadata header.

`︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!`
