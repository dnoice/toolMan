#!/usr/bin/env node
/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: BrowserTestRunner (toolMan Edition - v1.1)
 *     - File Name: e2e.mjs
 *     - Relative Path: scripts/e2e.mjs
 *     - Artifact Type: CLI
 *     - Version: 1.1.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (11/17/2026) [dendogg + Anthropic - Claude] — Themes are light
 *       / dark / system: t.open() takes theme (null saves none) and
 *       colorScheme (the device setting to emulate); the default seeded theme
 *       is dark.
 *
 * ✒ Description:
 *     Runs toolMan's browser suites in headless Chromium against the real
 *     pages, opened straight from disk the way users open them. It discovers
 *     every *.e2e.mjs suite, hands each one a small harness (open a page in a
 *     theme and viewport, record checks, take screenshots), and fails the run
 *     if any check fails, any page logs an error, or any page tries to reach
 *     the network.
 *
 * ✒ Key Features:
 *     - Suite discovery: tests/e2e/*.e2e.mjs and tools/<id>/tests/*.e2e.mjs
 *     - file:// pages, exactly as a downloaded copy runs
 *     - Theme seeding (light / dark / system, plus an emulated device color
 *       scheme) and loader skip before first paint, applied once per browser
 *       context so reload tests persist
 *     - Network guard: every http(s) / ws(s) request is recorded and blocked
 *       — toolMan promises to work offline, so any attempt is a failure
 *     - Console guard: console errors, warnings, and uncaught exceptions are
 *       collected per page for t.assertClean()
 *     - Desktop (1440×900) and phone (390×844, touch) presets
 *     - Optional screenshots of every t.shot() and of each failing check
 *     - Exceptions inside a suite are reported as failures, never crashes
 *     - Playwright resolved ad hoc (local node_modules or NODE_PATH); no
 *       package.json involved
 *
 * ✒ Usage Instructions:
 *     Install Playwright ad hoc once (never committed):
 *         npm install --no-save --no-package-lock playwright@1.63.0
 *         npx playwright install chromium
 *     Then, from the repository root:
 *         node scripts/e2e.mjs
 *     A suite is an ES module exporting `name` and a default async function
 *     that receives the harness `t`:
 *         export const name = 'colorMan';
 *         export default async function (t) {
 *             const s = await t.open('tools/colorman/index.html', { theme: 'light' });
 *             t.check('picker renders', await s.page.isVisible('#color-input'));
 *             t.assertClean(s, 'colorMan');
 *             await s.close();
 *         }
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs                         → every suite
 *     node scripts/e2e.mjs --only smoke            → the ecosystem smoke suite
 *     node scripts/e2e.mjs --only textman,colorman → two tool suites
 *     node scripts/e2e.mjs --shots e2e-shots       → save screenshots there
 *     node scripts/e2e.mjs --headed                → watch it run
 *     node scripts/e2e.mjs --list                  → name every suite
 *
 * ✒ Command-Line Arguments:
 *     Selection:
 *         --only <a,b>   Run suites whose name or file contains any value
 *     Output:
 *         --shots <dir>  Save screenshots (t.shot + failures) into <dir>
 *         --list         List discovered suites and exit
 *         --help         Show usage and exit
 *     Browser:
 *         --headed       Show the browser window instead of headless
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node.js 20+; Playwright (ad hoc) with Chromium
 *     - Compatible platforms: Linux, macOS, Windows
 *     - Exit codes: 0 all passed, 1 a check failed, 2 setup problem
 *       (Playwright missing, bad arguments)
 * ----------------------------------------------------------------------------
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const LOCAL_URL = /^(?:file|data|blob|about):/i;

/* ── Arguments ───────────────────────────────────────────────────────────── */

function parseArgs(argv) {
    const opts = { only: null, shots: null, headed: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--only') opts.only = (argv[++i] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        else if (a === '--shots') opts.shots = path.resolve(ROOT, argv[++i] || 'e2e-shots');
        else if (a === '--headed') opts.headed = true;
        else if (a === '--list') opts.list = true;
        else if (a === '--help' || a === '-h') opts.help = true;
        else { console.error(`Unknown argument: ${a}`); opts.help = true; opts.bad = true; }
    }
    return opts;
}

/* ── Discovery ───────────────────────────────────────────────────────────── */

function discoverSuites() {
    const found = [];
    const scan = (dir) => {
        const abs = path.join(ROOT, dir);
        if (!existsSync(abs)) return;
        for (const f of readdirSync(abs)) if (f.endsWith('.e2e.mjs')) found.push(`${dir}/${f}`);
    };
    scan('tests/e2e');
    const tools = path.join(ROOT, 'tools');
    if (existsSync(tools)) {
        for (const id of readdirSync(tools).sort()) scan(`tools/${id}/tests`);
    }
    return found;
}

/* ── Harness ─────────────────────────────────────────────────────────────── */

function createHarness(browser, opts) {
    const results = [];
    let lastPage = null;
    let shotCount = 0;
    const pending = new Set(); // failure screenshots still being written

    const safeName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

    const t = {
        root: ROOT,
        DESKTOP,
        PHONE,
        results,

        /** file:// URL for a repository-relative path. */
        url(rel) {
            return pathToFileURL(path.join(ROOT, rel)).href;
        },

        /**
         * Open a page in a fresh browser context.
         * @param {string} rel  repository-relative page path
         * @param {object} [o]  { theme, colorScheme, viewport, mobile, seed, waitForLoader }
         *   theme: the saved preference — 'light' | 'dark' | 'system' (null: none saved)
         *   colorScheme: the device setting to emulate — 'light' | 'dark'
         *   seed: { localStorageKey: value } written once before first paint
         */
        async open(rel, o = {}) {
            const theme = o.theme === undefined ? 'dark' : o.theme;
            const viewport = o.viewport || (o.mobile ? PHONE : DESKTOP);
            const context = await browser.newContext({
                viewport,
                deviceScaleFactor: 1,
                isMobile: Boolean(o.mobile),
                hasTouch: Boolean(o.mobile),
                colorScheme: o.colorScheme || 'light'
            });
            const errors = [];
            const external = [];
            await context.route(/^(?:https?|wss?|ftp):/i, (route) => {
                external.push(route.request().url());
                return route.abort();
            });
            await context.addInitScript(({ theme: th, seed }) => {
                try {
                    if (sessionStorage.getItem('toolman.e2e.seeded') === '1') return;
                    sessionStorage.setItem('toolman.e2e.seeded', '1');
                    sessionStorage.setItem('toolman.loaderSeen', '1');
                    if (th) localStorage.setItem('toolman.theme', th);
                    Object.entries(seed || {}).forEach(([k, v]) => {
                        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                    });
                } catch (_err) { /* storage unavailable: the page must cope */ }
            }, { theme, seed: o.seed || null });

            const page = await context.newPage();
            page.on('console', (m) => {
                if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
            });
            page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
            page.on('websocket', (ws) => external.push(ws.url()));
            page.on('request', (req) => {
                const u = req.url();
                if (!LOCAL_URL.test(u) && !/^(?:https?|wss?|ftp):/i.test(u)) external.push(u);
            });

            await page.goto(t.url(rel));
            if (o.waitForLoader !== false) {
                await page.waitForFunction(() => !document.getElementById('loader-screen'), null, { timeout: 15000 });
            }
            lastPage = page;
            return {
                page,
                context,
                errors,
                external,
                async close() {
                    await Promise.all([...pending]);
                    if (lastPage === page) lastPage = null;
                    await context.close();
                }
            };
        },

        /** Record a check; failing checks capture the most recent page. */
        check(name, ok, detail = '') {
            const passed = Boolean(ok);
            results.push({ name, passed, detail: detail === undefined ? '' : String(detail) });
            if (!passed && opts.shots && lastPage) {
                const file = path.join(opts.shots, `FAIL-${String(++shotCount).padStart(3, '0')}-${safeName(name)}.png`);
                const shot = lastPage.screenshot({ path: file }).catch(() => {});
                pending.add(shot);
                shot.finally(() => pending.delete(shot));
            }
            return passed;
        },

        /** Run a step; an exception becomes a failed check instead of a crash. */
        async step(name, fn) {
            try {
                return await fn();
            } catch (err) {
                t.check(name, false, err && err.message ? err.message.split('\n')[0] : String(err));
                return undefined;
            }
        },

        /** Assert a session logged no errors/warnings and made no network attempt. */
        assertClean(session, label) {
            t.check(`${label}: no console errors or warnings`, session.errors.length === 0, session.errors.slice(0, 5).join(' | '));
            t.check(`${label}: no network requests`, session.external.length === 0, session.external.slice(0, 5).join(' | '));
        },

        /** Screenshot when --shots is set; a no-op otherwise. */
        async shot(page, name) {
            if (!opts.shots) return;
            await page.screenshot({ path: path.join(opts.shots, `${safeName(name)}.png`) });
        }
    };
    return t;
}

/* ── Runner ──────────────────────────────────────────────────────────────── */

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        console.log('Usage: node scripts/e2e.mjs [--only a,b] [--shots dir] [--headed] [--list]');
        process.exit(opts.bad ? 2 : 0);
    }

    let suites = discoverSuites();
    if (opts.list) {
        for (const file of suites) {
            const mod = await import(pathToFileURL(path.join(ROOT, file)).href);
            console.log(`${String(mod.name || file).padEnd(12)} ${file}${mod.description ? ` — ${mod.description}` : ''}`);
        }
        return;
    }

    let playwright;
    try {
        playwright = require('playwright');
    } catch {
        console.error('Playwright is not installed. Add it ad hoc (nothing is committed):');
        console.error('    npm install --no-save --no-package-lock playwright@1.63.0');
        console.error('    npx playwright install chromium');
        process.exit(2);
    }

    const modules = [];
    for (const file of suites) {
        const mod = await import(pathToFileURL(path.join(ROOT, file)).href);
        modules.push({ file, name: mod.name || path.basename(file, '.e2e.mjs'), run: mod.default });
    }
    if (opts.only) {
        modules.splice(0, modules.length, ...modules.filter((m) => opts.only.some((o) => m.name.toLowerCase().includes(o) || m.file.toLowerCase().includes(o))));
        suites = modules.map((m) => m.file);
    }
    if (!modules.length) {
        console.error('No suites matched.');
        process.exit(2);
    }
    if (opts.shots) mkdirSync(opts.shots, { recursive: true });

    const browser = await playwright.chromium.launch({ headless: !opts.headed });
    let failed = 0;
    let total = 0;
    try {
        for (const mod of modules) {
            console.log(`\n▸ ${mod.name}  (${mod.file})`);
            const t = createHarness(browser, opts);
            const started = Date.now();
            try {
                if (typeof mod.run !== 'function') throw new Error('suite has no default export function');
                await mod.run(t);
            } catch (err) {
                t.check('suite ran to completion', false, err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : String(err));
            }
            for (const r of t.results) {
                total++;
                if (!r.passed) failed++;
                const line = `  ${r.passed ? '✓' : '✗'} ${r.name}${!r.passed && r.detail ? ` — ${r.detail}` : ''}`;
                console.log(line);
                if (!r.passed && process.env.GITHUB_ACTIONS === 'true') {
                    console.log(`::error file=${mod.file}::${`${r.name} — ${r.detail}`.replace(/\n/g, ' ')}`);
                }
            }
            const own = t.results.filter((r) => !r.passed).length;
            console.log(`  ${own ? `${own} failed` : 'all passed'} · ${t.results.length} checks · ${((Date.now() - started) / 1000).toFixed(1)}s`);
        }
    } finally {
        await browser.close();
    }
    console.log(`\n${failed ? `✗ ${failed} of ${total} checks failed` : `✓ all ${total} checks passed`}`);
    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
