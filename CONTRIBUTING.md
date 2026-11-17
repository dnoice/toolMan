<!--
✒ Metadata
    - Title: ContributingGuide (toolMan Edition - v1.0)
    - File Name: CONTRIBUTING.md
    - Relative Path: CONTRIBUTING.md
    - Artifact Type: docs
    - Version: 1.0.0
    - Date: 11/17/2026
    - Update: Tuesday, November 17, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Description:
    How to work on toolMan: setting up, the ground rules, how a tool is put
    together on the shared workbench kit, the design, code, accessibility, and
    security conventions, the house file-header standard, testing, and how to
    send a change.

✒ Key Features:
    - Zero-install setup and the two commands CI runs
    - Step-by-step "Adding a tool" walkthrough on Workbench, Dialogs, ToolApp
    - Design-system, code, accessibility, and security checklists
    - The file-header standard with a copy-ready template and the changelog
      retention rule
    - Commit, pull-request, issue, and licensing guidance

✒ Other Important Information:
    - Dependencies: None (documentation only); refers to scripts/check.mjs,
      scripts/e2e.mjs, SECURITY.md, and CHANGELOG.md
    - Compatible platforms: any Markdown renderer; written for GitHub
---------
-->

# Contributing to toolMan

Thanks for helping build toolMan. This guide covers everything from opening
the project for the first time to getting a pull request merged. If something
here is unclear or out of date, that's a bug — please say so.

## Contents

- [Ground rules](#ground-rules)
- [Getting set up](#getting-set-up)
- [Adding a tool](#adding-a-tool)
- [Design system](#design-system)
- [Code conventions](#code-conventions)
- [Accessibility](#accessibility)
- [Security baseline](#security-baseline)
- [File headers](#file-headers)
- [Testing and checks](#testing-and-checks)
- [Commits and pull requests](#commits-and-pull-requests)
- [Bugs, ideas, and security reports](#bugs-ideas-and-security-reports)
- [Licensing](#licensing)

## Ground rules

- **No build, no dependencies.** Every tool is plain HTML, CSS, and JavaScript
  loaded by `<link>` and `<script>` tags, and it must keep working when opened
  straight from disk (`file://`). No bundlers, frameworks, CDNs, or packages
  at runtime.
- **Nothing leaves the browser.** No network requests of any kind. Tool data
  lives in `localStorage` under `toolman.<id>.*`.
- **One design system.** Colors, spacing, and type come from the tokens in
  `shared/css/tokens.css`, and every screen works in both themes.
- **Desktop and phone.** Rails become drawers below 769px; nothing scrolls
  sideways at 320–390px.
- **Keyboard and screen-reader friendly** by default.
- **Every file we own carries the house header** — see
  [File headers](#file-headers).
- **Dev tooling never ships.** Node runs the checks and Playwright drives the
  browser tests, both ad hoc; there is no `package.json` in the repository.

## Getting set up

Clone the repository, then open toolMan any of these ways:

- Double-click `index.html` (it runs from `file://`).
- VS Code's Live Server: **Go Live** serves it on port 5500
  (see `.vscode/settings.json`).
- Any static server from the project root, for example:

  ```bash
  python -m http.server 5500
  ```

For the checks you need **Node.js 20 or newer** (CI uses 22). Nothing to
install:

```bash
node scripts/check.mjs
```

For the browser tests, add Playwright ad hoc once. `--no-save` keeps it out of
the repository, and `.gitignore` covers `node_modules/`:

```bash
npm install --no-save --no-package-lock playwright@1.63.0
```

```bash
npx playwright install chromium
```

```bash
node scripts/e2e.mjs
```

Your editor should pick up `.editorconfig` (UTF-8, LF, final newline, four
spaces for HTML/CSS/JS, two for YAML/JSON/Markdown).

## Adding a tool

A toolMan tool is a three-panel workbench: a **library rail** on the left (the
things you keep), a **stage** in the center (the thing you're working on), and
a **tools rail** on the right (the things you do to it). The shared kit gives
you the rails, dialogs, settings, shortcuts, and saving; a tool supplies its
panes. `tools/colorman/` is the reference implementation.

### 1. Register it

Add an entry to the `tools` array in `shared/js/toolman.js`:

```javascript
{
    id: 'colorman',                      // folder name and storage namespace
    name: 'colorMan',
    tagline: 'Command the spectrum',
    description: 'Palettes, conversions, contrast checks, and gradients.',
    status: 'soon',                      // 'live' once it ships
    path: null                           // 'tools/colorman/index.html' once live
}
```

### 2. Lay out the page

Create `tools/<id>/index.html` with the standard anatomy: the loader, the
`.app-header` (hub link, logo, mobile rail buttons, settings, theme, help), a
left `.panel` with `data-panel` and its `.tool-section[data-section]` panes, the
center stage (toolbar, stage cards, stat pills, footer), the right `.panel`,
and the settings and help modals.

Load order matters:

- **In `<head>`, first:** `../../shared/js/toolman.js`, so the theme applies
  before the first paint.
- **Stylesheets:** `reset.css`, `tokens.css`, `shell.css`, `panels.css`,
  `workbench.css` from `shared/css/`, then the tool's own CSS.
- **Before `</body>`:** `dom.js`, `storage.js`, `loader.js`, `workbench.js`,
  `dialogs.js`, `toolapp.js` from `shared/js/`; then the tool's pure-logic
  engine (for example `js/color.js`), `js/state.js`, each `js/ui/*.js` pane
  module, and `js/app.js` last.

### 3. Own your state

`js/state.js` holds the tool's state object and registers its persistence
contract:

```javascript
Storage.configure({
    key: 'toolman.<id>.state',
    version: '1.0.0',
    getState: () => AppState,
    restore: (saved) => restoreInto(saved)   // validate — never trust saved data
});
```

UI modules change state only through `State` methods and re-render on its
events; they never reach into each other's internals.

### 4. Boot with ToolApp

`js/app.js` makes one call:

```javascript
ToolApp.boot({
    id: 'colorman',
    name: 'colorMan',
    modules: ['PickerUI', 'LibraryUI', 'ContrastUI'],   // each exposes init()
    workbench: {
        getUi: () => AppState.ui,
        left: { id: 'panel-library', name: 'Library' },
        right: { id: 'panel-tools', name: 'Tools' }
    },
    shortcuts: [{ key: 'r', run: () => PickerUI.random() }]
});
```

That restores saved state, starts the rails (`Workbench`: exclusive
accordions, drag-to-reorder panes, phone drawers, Focus mode) and dialogs
(`Dialogs`), initializes each module in isolation so one failing pane never
blanks the page, wires the header, and always hands off from the loader.

- **Standard shortcuts:** `Ctrl+S` save, `Ctrl+,` settings, `Ctrl+[` and
  `Ctrl+]` rails, `Ctrl+\` Focus mode, `?` help.
- **Helpers:** `ToolApp.copy()`, `download()`, `readFile()`, `uid()`,
  `relativeTime()`, `scheduleSave()`.
- **Dialogs:** `Dialogs.confirm()` and `Dialogs.prompt()` replace `confirm` /
  `prompt`. `Dialogs.bindSettings()` drives a settings modal from
  `data-setting` fields, staged until **Save**.

### 5. Test it

- Put pure logic in an engine file that also runs under Node, and cover it
  with `tools/<id>/tests/<name>.test.js`: a standalone script that exits
  non-zero on failure.
- Add `tools/<id>/tests/<id>.e2e.mjs` for the tool's workflows (see
  [Testing and checks](#testing-and-checks)).
- The smoke suite picks the tool up automatically once it is live.

### 6. Ship it

Flip `status` to `'live'` and set `path`. Update the README's ecosystem table
and add a section for the tool. Attach screenshots in both themes at desktop
and phone width to the pull request.

## Design system

- **Tokens only.** Use `--bg-*`, `--fg-*`, `--border-*`, `--color-*` for color,
  `--space-*` and the density tokens (`--pad-rail`, `--pad-card`, `--gap-card`,
  `--pad-stage`, …) for spacing, plus `--radius-*` and `--font-*`. A hard-coded
  hex value is a bug: it breaks one of the two themes.
- **Both themes:** Parchment (`[data-theme="parchment"]`) and Sentinel
  (`[data-theme="sentinel"]`). Check every change in both.
- **The look:**
  - navy-gradient pane headers with gold titles;
  - raised card-gradient tool sections;
  - gold left-rule cards in the library;
  - sheen tool tiles, mono stat pills, and a status pill with a glowing dot.

  Reach for `shared/css/workbench.css` classes (`stage-card`, `list-row`,
  `readout`, `chip-btn`, `tool-action-btn`, `badge`, `data-table`, …) before
  writing new ones.
- **Motion** respects `prefers-reduced-motion`.
- `node scripts/check.mjs` fails on any `var(--x)` that is never defined.

## Code conventions

- One file, one IIFE with `'use strict'`, exposing one global (for example
  `window.PickerUI`) that has an `init()`.
- Use the `DOM` helpers (`DOM.create`, `DOM.$`, `DOM.$$`, `DOM.on`,
  `DOM.delegate`) rather than hand-rolled querying and markup strings.
- Four-space indents, semicolons, single quotes, `const` / `let`.
- Fail soft: catch errors at module boundaries, guard every storage access,
  and tell the user what happened in plain language (`TOOLMAN.notify`).
- Keep the console quiet. The browser suites fail on any error or warning.

## Accessibility

- Every control is reachable and operable by keyboard, with a visible
  `:focus-visible` ring.
- Real `<button>`s for actions, labelled form fields, and `aria-label` on
  icon-only buttons.
- Mutually exclusive choices are radiogroups (one tab stop, arrow keys);
  on/off pills use `aria-pressed`.
- Dialogs trap focus, close on `Escape`, and return focus to their opener.
- State is never shown by color alone: pair it with text, an icon, or a
  pattern. Text meets WCAG AA contrast in both themes.
- Status changes that matter are announced (`aria-live`).

## Security baseline

Read [SECURITY.md](SECURITY.md) for the model. In code:

- Never `eval`, `new Function`, string timers, or `document.write`.
- Insert user text with `textContent` / `DOM.create`. If HTML must be built
  from data, escape every value, and mark the sink
  `// check-allow: html-sink — <why it is safe>`.
- Treat every file, paste, drop, import, and *saved state* as hostile:
  - validate its shape;
  - cap its size;
  - ignore `__proto__` / `constructor` keys.
- Keep long-running work (big inputs, user regexes) off the main thread or in
  bounded chunks, so no input can freeze the tab.
- No network requests, ever.

## File headers

Every file we own starts with the house **✒ Metadata** header. The exceptions
are:

- binary media and `shared/assets/screenshots/`;
- the pull-request template, which is copied into every PR body;
- `fixtures/` test corpora;
- files a strict parser would reject.

The comment syntax follows the language: `/* … */` for JS and CSS,
`<!-- … -->` for HTML, Markdown, and SVG, `#` for YAML and dotfiles, and `//`
for JSONC. A JavaScript header looks like this:

```javascript
/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: PickerPane (colorMan Edition - v1.2)
 *     - File Name: picker.js
 *     - Relative Path: tools/colorman/js/ui/picker.js
 *     - Artifact Type: javascript
 *     - Version: 1.2.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: None
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.2.0 (11/17/2026) [dendogg] — What changed and why.
 *     - 1.1.0 (11/02/2026) [dendogg] — The previous change.
 *     Earlier entries: see CHANGELOG.md
 *
 * ✒ Description:
 *     Two or three plain sentences: what it does, when to use it, what
 *     problem it solves.
 *
 * ✒ Key Features:
 *     - At least three, concrete
 *
 * ✒ Usage Instructions:
 *     How to load or call it.
 *
 * ✒ Examples:
 *     Realistic calls and their results.
 *
 * ✒ Other Important Information:
 *     - Dependencies: …
 *     - Compatible platforms: …
 * ----------------------------------------------------------------------------
 */
```

The rules `node scripts/check.mjs` enforces:

| Field | Rule |
| --- | --- |
| Title | `{Name} ({Project} Edition - vX.Y)`, where `X.Y` matches Version |
| File Name / Relative Path | The file's real name and repo path |
| Artifact Type | One canonical value. Media: `javascript`, `stylesheet`, `markup`, `shell`, `diagram`, `python`, `typescript`, `sql`, `dockerfile`. Roles (earned): `library` (other code calls into it), `CLI`, `test`, `config`, `schema`, `data`, `docs`, `notebook`, `other` |
| Version | `X.Y.Z` |
| Date / Update | `MM/DD/YYYY` and the same day written out (`Tuesday, November 17, 2026`). Older ISO dates stay as written |
| A.I. Acknowledgement | `{Platform} - {Model}` or `None` |
| Signature | Byte-exact: copy it, never retype it |

Changelog rules:

- **Bump on every non-trivial edit.** Update Version, Date, and Update, and add
  an entry: `- X.Y.Z (MM/DD/YYYY) [tag] — what changed and why`.
  - The tag names the human first: `[dendogg]`.
  - Add the AI platform only when one did substantive work:
    `[dendogg + {Platform} - {Model}]`.
- **Newest first.** The top entry matches Version, and a Changelog is required
  once a file is past `1.0.0`.
- **Shipped files** — the JS, CSS, HTML, and SVG under `shared/`, `tools/`,
  and the hub — keep at most **three** entries inline, within 40 lines. When
  an entry falls out of that window, move it verbatim to
  [CHANGELOG.md](CHANGELOG.md) under the file's own `` ## `path` `` heading,
  and keep the line `Earlier entries: see CHANGELOG.md`.
- **Typo-level edits** (spelling, whitespace, a comment fix) don't need a
  bump.

## Testing and checks

**`node scripts/check.mjs`** is exactly what CI runs first:

| Check | What it enforces |
| --- | --- |
| `hygiene` | UTF-8 without BOM, LF endings, final newline, no merge markers |
| `syntax` | `node --check` passes on every script |
| `headers` | The file-header rules above |
| `links` | Local `src` / `href` / `url()` / Markdown links and anchors resolve; registry paths exist |
| `css-vars` | Every fallback-free `var(--x)` is defined |
| `security` | The [security baseline](#security-baseline); HTML sinks reported as warnings |
| `tests` | Every `tests/*.test.js` / `*.test.mjs` script exits 0 |

Use `--only` and `--skip` to focus, for example
`node scripts/check.mjs --only headers`. To suppress one rule on one line,
put `check-allow: <rule> — <reason>` on that line or the line above, and give
the reason.

**`node scripts/e2e.mjs`** runs the browser suites in headless Chromium,
opening the real pages from disk:

- `tests/e2e/smoke.e2e.mjs`:
  - the hub and every live tool, in both themes at desktop and phone size;
  - clean console, no network, theme applied, no sideways scroll.
- `tools/<id>/tests/<id>.e2e.mjs`: that tool's own workflows.

A suite exports a `name` and a default async function that receives the
harness `t`:

- `t.open(path, { theme, mobile, seed })` returns a session with `page`,
  `errors`, `external`, and `close()`.
- `t.check(name, ok, detail)` records a check.
- `t.step(name, fn)` reports an exception as a failure instead of crashing.
- `t.assertClean(session, label)` asserts no console errors and no network
  requests.
- `t.shot(page, name)` takes a screenshot.

Use `--only`, `--shots <dir>`, and `--headed`; `--list` shows every suite.

**CI** (`.github/workflows/ci.yml`) runs on every pull request and every push
to `main`:

1. The checks.
2. The browser suites, with screenshots uploaded as an artifact.
3. A `toolman-site` ZIP of the runnable app. `.gitattributes` export-ignore
   drops the dev-only paths from it.

## Commits and pull requests

- Branch from `main`, using a short descriptive branch name.
- One logical change per commit. Start the summary line with its area and
  keep it under about 72 characters: `colorMan: add APCA readout`,
  `shared: fix drawer focus trap`, `ci: cache Playwright browsers`. Use the
  body to explain *why*.
- Fill in the pull-request template. Any visible change needs screenshots in
  both themes, at desktop and phone width.
- Draft pull requests are welcome for early feedback.
- CI must be green before review. `node scripts/check.mjs` locally catches
  nearly everything.

## Bugs, ideas, and security reports

- **Bugs:** use the *Bug report* issue form.
- **Ideas and new tools:** use the *Idea or new tool* form. Proposals should
  fit the ground rules above.
- **Security problems:** report them privately, as described in
  [SECURITY.md](SECURITY.md). Please don't open a public issue.

## Licensing

toolMan does not currently carry an open-source license, and all rights are
reserved by its author (see the README's Credits). By opening a pull request,
you confirm the work is yours to contribute and agree it may be incorporated
into toolMan under the terms the project uses.
