/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ThemeSuite (toolMan Edition - v1.0)
 *     - File Name: theme.e2e.mjs
 *     - Relative Path: tests/e2e/theme.e2e.mjs
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Browser checks for the ecosystem theme: Light, Dark, and System. It
 *     proves that System follows the device (live), that the toggle and the
 *     Settings radios save the right choice, that retired theme names migrate,
 *     that open tabs stay in step, and that no page shows the retired names.
 *
 * ✒ Key Features:
 *     - System is the default and resolves from the device color scheme
 *     - System follows a live device switch and fires 'toolman:theme'
 *     - Legacy 'parchment' / 'sentinel' values migrate to 'light' / 'dark'
 *     - Unknown stored values fall back to System
 *     - The header toggle makes an explicit choice that stops following the
 *       device, with a "Light theme" / "Dark theme" toast
 *     - Every live tool's Settings offers exactly Light, Dark, and System, and
 *       saving a choice persists and paints it
 *     - A change in one tab repaints another open tab
 *     - No page text, label, or tooltip mentions the retired theme names
 *
 * ✒ Usage Instructions:
 *     Runs under scripts/e2e.mjs:
 *         node scripts/e2e.mjs --only theme
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs --only theme --shots e2e-shots
 *
 * ✒ Other Important Information:
 *     - Dependencies: scripts/e2e.mjs (harness), Playwright with Chromium
 *     - Compatible platforms: wherever scripts/e2e.mjs runs
 * ----------------------------------------------------------------------------
 */

export const name = 'theme';
export const description = 'Light / Dark / System: device following, migration, toggle, settings, tabs';

const RETIRED = /parchment|sentinel|obsidian|dossier/i;

const painted = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const saved = (page) => page.evaluate(() => localStorage.getItem('toolman.theme'));

export default async function theme(t) {
    await t.step('System is the default and follows the device', async () => {
        const s = await t.open('index.html', { theme: null, colorScheme: 'dark' });
        const pref = await s.page.evaluate(() => window.TOOLMAN.getThemePreference());
        t.check('no saved choice means System', pref === 'system', pref);
        t.check('System on a dark device paints dark', (await painted(s.page)) === 'dark', await painted(s.page));

        await s.page.evaluate(() => {
            window.__themeEvents = [];
            document.addEventListener('toolman:theme', (e) => window.__themeEvents.push(e.detail.theme));
        });
        await s.page.emulateMedia({ colorScheme: 'light' });
        await s.page.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 3000 }).catch(() => {});
        t.check('System repaints live when the device switches to light', (await painted(s.page)) === 'light', await painted(s.page));
        const events = await s.page.evaluate(() => window.__themeEvents);
        t.check('the switch fires a toolman:theme event', events.includes('light'), JSON.stringify(events));
        t.assertClean(s, 'system default');
        await s.close();
    });

    await t.step('Retired and unknown values', async () => {
        for (const [legacy, expected] of [['sentinel', 'dark'], ['parchment', 'light']]) {
            const s = await t.open('index.html', { theme: legacy, colorScheme: expected === 'dark' ? 'light' : 'dark' });
            t.check(`stored '${legacy}' paints ${expected}`, (await painted(s.page)) === expected, await painted(s.page));
            t.check(`stored '${legacy}' is rewritten to '${expected}'`, (await saved(s.page)) === expected, await saved(s.page));
            await s.close();
        }
        const s = await t.open('index.html', { theme: 'neon', colorScheme: 'dark' });
        const pref = await s.page.evaluate(() => window.TOOLMAN.getThemePreference());
        t.check('an unknown stored value falls back to System', pref === 'system' && (await painted(s.page)) === 'dark', `${pref} / ${await painted(s.page)}`);
        await s.close();
    });

    await t.step('Header toggle makes an explicit choice', async () => {
        const s = await t.open('index.html', { theme: 'system', colorScheme: 'dark' });
        await s.page.click('#btn-theme');
        t.check('toggle from dark paints light', (await painted(s.page)) === 'light', await painted(s.page));
        t.check('toggle saves the explicit choice', (await saved(s.page)) === 'light', await saved(s.page));
        const toast = await s.page.evaluate(() => {
            const all = [...document.querySelectorAll('.toast')];
            return all.length ? all[all.length - 1].textContent : '';
        });
        t.check('toggle announces "Light theme"', toast === 'Light theme', toast);
        await s.page.emulateMedia({ colorScheme: 'dark' });
        await s.page.waitForTimeout(200);
        t.check('an explicit choice ignores later device switches', (await painted(s.page)) === 'light', await painted(s.page));
        t.assertClean(s, 'toggle');
        await s.close();
    });

    await t.step('Open tabs stay in step', async () => {
        const s = await t.open('index.html', { theme: 'light' });
        const other = await s.context.newPage();
        await other.goto(t.url('index.html'));
        await other.waitForFunction(() => !document.getElementById('loader-screen'), null, { timeout: 15000 });
        await other.evaluate(() => window.TOOLMAN.setTheme('dark'));
        await s.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 3000 }).catch(() => {});
        t.check('a change in one tab repaints the other', (await painted(s.page)) === 'dark', await painted(s.page));
        await s.close();
    });

    // Every live tool: Settings radios, saving, and no retired names on screen.
    const hub = await t.open('index.html');
    const tools = await hub.page.evaluate(() => window.TOOLMAN.tools
        .filter((tool) => tool.status === 'live')
        .map((tool) => ({ name: tool.name, path: tool.path })));
    const hubText = await hub.page.evaluate(() => [document.body.innerText,
        ...[...document.querySelectorAll('[aria-label],[title]')].map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`)].join('\n'));
    t.check('hub shows no retired theme names', !RETIRED.test(hubText), (hubText.match(RETIRED) || [''])[0]);
    await hub.close();

    for (const tool of tools) {
        await t.step(`${tool.name}: Settings theme choice`, async () => {
            const s = await t.open(tool.path, { theme: 'system', colorScheme: 'light' });
            const { page } = s;
            const values = await page.evaluate(() => [...document.querySelectorAll('input[name="theme-pref"]')].map((r) => r.value));
            t.check(`${tool.name}: Settings offers Light, Dark, System`, values.join(',') === 'light,dark,system', values.join(','));

            const text = await page.evaluate(() => [document.body.innerText, document.body.textContent,
                ...[...document.querySelectorAll('[aria-label],[title]')].map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`)].join('\n'));
            t.check(`${tool.name}: no retired theme names anywhere on the page`, !RETIRED.test(text), (text.match(RETIRED) || [''])[0]);

            await page.click('#btn-settings');
            await page.waitForTimeout(250);
            const checked = await page.evaluate(() => (document.querySelector('input[name="theme-pref"]:checked') || {}).value);
            t.check(`${tool.name}: Settings shows the saved System choice`, checked === 'system', checked);
            await t.shot(page, `${tool.name}-settings-theme`);

            await page.check('input[name="theme-pref"][value="dark"]');
            await page.click('#btn-save-settings');
            await page.waitForTimeout(250);
            t.check(`${tool.name}: saving Dark paints dark`, (await painted(page)) === 'dark', await painted(page));
            t.check(`${tool.name}: saving Dark stores 'dark'`, (await saved(page)) === 'dark', await saved(page));

            if (await page.evaluate(() => !document.querySelector('#modal-settings.is-open, #modal-settings[open], #modal-settings:not([hidden])[aria-hidden="false"]'))) {
                await page.click('#btn-settings');
                await page.waitForTimeout(250);
            }
            await page.check('input[name="theme-pref"][value="system"]');
            await page.click('#btn-save-settings');
            await page.waitForTimeout(250);
            t.check(`${tool.name}: saving System on a light device paints light`,
                (await painted(page)) === 'light' && (await saved(page)) === 'system', `${await painted(page)} / ${await saved(page)}`);
            t.assertClean(s, `${tool.name} settings`);
            await s.close();
        });
    }
}
