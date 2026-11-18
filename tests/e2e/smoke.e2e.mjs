/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EcosystemSmokeSuite (toolMan Edition - v1.0)
 *     - File Name: smoke.e2e.mjs
 *     - Relative Path: tests/e2e/smoke.e2e.mjs
 *     - Artifact Type: test
 *     - Version: 1.0.1
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.0.1 (11/17/2026) [dendogg + Anthropic - Claude] — Matrix runs the
 *       light and dark themes after the rename from parchment / sentinel.
 *
 * ✒ Description:
 *     The ecosystem-wide browser smoke test. It reads the live tools from the
 *     hub's own registry, then opens the hub and every live tool in both
 *     themes at desktop and phone sizes, and checks each one boots cleanly,
 *     stays offline, applies its theme, fits the screen, and can switch
 *     themes. A new tool is covered the moment its registry entry goes live.
 *
 * ✒ Key Features:
 *     - Registry-driven: no list of pages to maintain here
 *     - Matrix: every page × light / dark × desktop / phone
 *     - Clean boot: loader hands off, no console errors or warnings, no
 *       uncaught exceptions, zero network requests
 *     - Theme applied before paint and the header toggle flips it
 *     - No horizontal page scroll at phone width
 *     - Every live tool has a working hub card link
 *     - Screenshots of each combination when run with --shots
 *
 * ✒ Usage Instructions:
 *     Runs under scripts/e2e.mjs:
 *         node scripts/e2e.mjs --only smoke
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs --only smoke --shots e2e-shots
 *         → e2e-shots/textman-dark-phone.png and friends
 *
 * ✒ Other Important Information:
 *     - Dependencies: scripts/e2e.mjs (harness), Playwright with Chromium
 *     - Compatible platforms: wherever scripts/e2e.mjs runs
 * ----------------------------------------------------------------------------
 */

export const name = 'smoke';
export const description = 'hub + every live tool: clean boot, offline, themed, responsive';

const THEMES = ['light', 'dark'];

export default async function smoke(t) {
    // The registry is the source of truth for which pages exist.
    const hub = await t.open('index.html');
    const tools = await hub.page.evaluate(() => window.TOOLMAN.tools
        .filter((tool) => tool.status === 'live')
        .map((tool) => ({ id: tool.id, name: tool.name, path: tool.path })));
    t.check('registry lists at least one live tool', tools.length > 0, tools.map((tool) => tool.name).join(', '));

    for (const tool of tools) {
        const href = await hub.page.evaluate((p) => {
            const link = [...document.querySelectorAll('a.card-link')].find((a) => a.getAttribute('href') === p);
            return link ? link.getAttribute('href') : null;
        }, tool.path);
        t.check(`hub card links to ${tool.name}`, href === tool.path, href || 'no card link');
    }
    await hub.close();

    const pages = [{ name: 'hub', path: 'index.html' }].concat(tools.map((tool) => ({ name: tool.name, path: tool.path })));
    for (const p of pages) {
        for (const theme of THEMES) {
            for (const [size, viewport, mobile] of [['desktop', t.DESKTOP, false], ['phone', t.PHONE, true]]) {
                const label = `${p.name} · ${theme} · ${size}`;
                await t.step(`${label}: opens`, async () => {
                    const s = await t.open(p.path, { theme, viewport, mobile });

                    const applied = await s.page.evaluate(() => document.documentElement.dataset.theme);
                    t.check(`${label}: theme applied before use`, applied === theme, applied);

                    const headerVisible = await s.page.locator('.app-header').first().isVisible();
                    t.check(`${label}: header visible`, headerVisible);

                    const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                    t.check(`${label}: no horizontal scroll`, overflow <= 1, `${overflow}px wider than the viewport`);

                    await t.shot(s.page, `${p.name}-${theme}-${size}`);

                    if (size === 'desktop') {
                        await s.page.click('#btn-theme');
                        const flipped = await s.page.evaluate(() => document.documentElement.dataset.theme);
                        t.check(`${label}: theme toggle switches theme`, flipped && flipped !== theme, flipped);
                    }

                    t.assertClean(s, label);
                    await s.close();
                });
            }
        }
    }
}
