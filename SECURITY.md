<!--
✒ Metadata
    - Title: SecurityPolicy (toolMan Edition - v1.0)
    - File Name: SECURITY.md
    - Relative Path: SECURITY.md
    - Artifact Type: docs
    - Version: 1.0.0
    - Date: 11/17/2026
    - Update: Tuesday, November 17, 2026
    - Author: Dennis 'dendogg' Smaltz
    - A.I. Acknowledgement: Anthropic - Claude
    - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!

✒ Description:
    toolMan's security policy: how to report a vulnerability privately, what
    the security model is, what counts as in scope, and which defenses the
    codebase enforces today. GitHub links it from the repository's Security
    tab and the new-issue chooser.

✒ Key Features:
    - Private reporting route through GitHub, with a fallback
    - Plain-language security model: static pages, local storage, no network
    - Storage caveats for file:// and shared hosting
    - In-scope and out-of-scope lists tailored to file- and text-handling tools
    - The defenses enforced by scripts/check.mjs and the browser suites

✒ Other Important Information:
    - Dependencies: None (documentation only)
    - Compatible platforms: any Markdown renderer; written for GitHub
---------
-->

# Security policy

toolMan runs entirely in your browser, but its tools read files and text you
give them and produce files you take elsewhere. That makes untrusted input the
main thing to defend against, and reports about it are very welcome.

## Reporting a vulnerability

**Please report security problems privately, not in a public issue, pull
request, or discussion.**

1. Open the repository's **Security** tab and choose **Report a
   vulnerability**
   ([direct link](https://github.com/dnoice/toolMan/security/advisories/new)).
2. Include what you can of:
   - the tool (or the hub / shared code) and the browser you used;
   - the steps, plus the exact input — the text, file, or pasted content —
     that triggers the problem;
   - what an attacker gains: script running, data read, the tab freezing, a
     harmful file being produced.

If the **Report a vulnerability** button isn't there, private reporting hasn't
been switched on yet. Open a public issue that says only that you'd like to
report a security problem privately — no details — and a private channel will
be arranged.

toolMan is a personal project, so responses are best effort: your report will
be acknowledged, investigated, fixed on `main`, and credited in the fix if you'd
like.

## Supported versions

toolMan is developed on a rolling basis. Fixes land on the `main` branch; there
are no separately maintained older releases.

## The security model

- **Static pages, no server.** Every tool is plain HTML, CSS, and JavaScript.
  There are no accounts, no backend, and no remote code: no CDNs, web fonts,
  or analytics.
- **No network requests.** toolMan never sends your data anywhere. The repo
  check fails the build on any remote load, and the browser test suites block
  and fail every page that attempts a network request.
- **Your data stays in this browser.** Each tool keeps its state in
  `localStorage` under its own `toolman.<tool>.*` key. Backups and exports are
  plain files you download yourself.

### Storage caveats

`localStorage` belongs to an *origin*, not to toolMan:

- Opened straight from disk (`file://`), some browsers share one storage
  area between every local file you open.
- Hosted on a shared domain, other pages on that same origin can read
  toolMan's storage.

Don't keep secrets — passwords, keys, private notes — in toolMan. If you host
your own copy, give it a dedicated origin (its own subdomain).

## In scope

- Script injection (XSS) through anything toolMan reads: pasted text, opened or
  dropped files, file names, imported palettes, settings or backup imports, and
  previously saved state.
- Malicious SVG or HTML that survives toolMan's cleaning and runs code, loads
  remote content, or tracks the user.
- Inputs that freeze or crash a tab: runaway regular expressions, pathological
  numbers or expressions, nesting or entity bombs in imported data.
- Prototype pollution or state corruption through imported JSON.
- Exported files that misbehave where they are opened next — for example,
  spreadsheet formula injection in CSV exports.
- Anything that makes toolMan send data off the device.

## Out of scope

- Attacks that need a compromised browser, extension, operating system, or
  physical access to the device.
- "Self-XSS" that requires the user to paste code into the browser's
  developer tools.
- Bugs in browsers themselves, and the hosting configuration of copies of
  toolMan that someone else runs.

## Defenses the codebase enforces

These are checked automatically on every pull request (`node scripts/check.mjs`
and `node scripts/e2e.mjs`):

- **No code from text.** `eval`, `new Function`, string timers, and
  `document.write` fail the build.
- **No remote loads.** External scripts, stylesheets, fonts, images,
  `fetch` calls to other hosts, WebSockets, and beacons fail the build; every
  page is also exercised in a browser with the network blocked.
- **No `javascript:` URLs** in markup.
- **HTML sinks are flagged.** Every `innerHTML` / `insertAdjacentHTML` that
  receives anything other than a constant is reported so it gets reviewed.
  User text must be inserted with `textContent` or escaped before it reaches
  HTML; a sink confirmed safe is marked with a `check-allow: html-sink`
  comment that says why.
- **Clean consoles.** Browser suites fail on any console error, warning, or
  uncaught exception.
