/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: TextManBrowserSuite (textMan Edition - v1.0)
 *     - File Name: textman.e2e.mjs
 *     - Relative Path: tools/textman/tests/textman.e2e.mjs
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     End-to-end checks for textMan's interactive workflows, driven in a real
 *     browser: search, go-to-line, staged settings, the encoding and prefix
 *     pickers, Focus and Zen modes, and the platform-aware help chips. It
 *     guards the features re-ported onto the restored 07/23 design.
 *
 * ✒ Key Features:
 *     - Ctrl+F reveals the collapsed Search pane and focuses its field
 *     - Ctrl+G opens the styled go-to-line prompt, validates the range, and
 *       moves the caret
 *     - Settings stage changes: Save stays disabled until something changes,
 *       the autosave delay hides for manual mode, the tab-size stepper saves
 *     - Encoding All / Encode / Decode filter, including arrow-key movement
 *     - Prefix scope pills behave as a radiogroup
 *     - Focus mode collapses and restores both rails; Zen mode enters,
 *       peeks its chrome at the top edge, and exits on Escape
 *     - Help chips rewritten for the platform; the caret pill is a button
 *     - Ends with a clean console and zero network requests
 *
 * ✒ Usage Instructions:
 *     Runs under scripts/e2e.mjs:
 *         node scripts/e2e.mjs --only textman
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs --only textman --shots e2e-shots
 *         → screenshots of any failing check land in e2e-shots/
 *
 * ✒ Other Important Information:
 *     - Dependencies: scripts/e2e.mjs (harness), Playwright with Chromium;
 *       reads textMan's globals (State, EncodingUI, PrefixUI)
 *     - Compatible platforms: wherever scripts/e2e.mjs runs
 * ----------------------------------------------------------------------------
 */

export const name = 'textman';
export const description = 'textMan workflows: search, go-to-line, settings, panes, Focus/Zen';

export default async function textman(t) {
    const s = await t.open('tools/textman/index.html', { theme: 'sentinel' });
    const { page } = s;

    await page.fill('#editor-textarea', Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));

    await t.step('Ctrl+F opens Search and focuses the field', async () => {
        await page.click('.tool-section[data-section="transform"] .tool-header'); // close the open pane
        await page.click('#editor-textarea');
        await page.keyboard.press('Control+f');
        await page.waitForTimeout(400);
        const open = await page.evaluate(() => document.querySelector('.tool-section[data-section="search"]').dataset.collapsed);
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        t.check('Ctrl+F opens Search and focuses the field', open === 'false' && focused === 'search-input', `${open} / ${focused}`);
    });

    await t.step('Go-to-line validates and jumps', async () => {
        await page.click('#editor-textarea');
        await page.keyboard.press('Control+g');
        await page.waitForTimeout(250);
        const opened = await page.evaluate(() => Boolean(document.querySelector('#modal-prompt.is-open')));
        await page.fill('#prompt-input', '999');
        await page.keyboard.press('Enter');
        const error = await page.evaluate(() => document.querySelector('.prompt-error').textContent);
        await page.fill('#prompt-input', '12');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        const caret = await page.evaluate(() => document.getElementById('stat-caret').textContent);
        t.check('Go-to-line validates and jumps', opened && /1 to 30/.test(error) && /Ln 12/.test(caret), `${error} | ${caret}`);
    });

    await t.step('Settings are staged until Save', async () => {
        await page.click('#btn-settings');
        await page.waitForTimeout(200);
        const disabledBefore = await page.evaluate(() => document.getElementById('btn-save-settings').disabled);
        await page.click('#tab-size-inc');
        const disabledAfter = await page.evaluate(() => document.getElementById('btn-save-settings').disabled);
        await page.selectOption('#setting-autosave', 'manual');
        const delayHidden = await page.evaluate(() => document.getElementById('autosave-delay-group').hidden);
        await page.selectOption('#setting-autosave', 'debounced');
        const delayLabel = await page.evaluate(() => document.getElementById('autosave-delay-label').textContent);
        await page.click('#btn-save-settings');
        const tabSize = await page.evaluate(() => window.State.get().settings.tabSize);
        t.check('Settings are staged until Save',
            disabledBefore && !disabledAfter && delayHidden && /s$/.test(delayLabel) && tabSize === 5,
            `${disabledBefore}/${disabledAfter}/${delayHidden}/${delayLabel}/${tabSize}`);
    });

    await t.step('Encoding direction filter', async () => {
        await page.click('.tool-section[data-section="encoding"] .tool-header');
        await page.waitForTimeout(300);
        await page.click('.encoding-filter [data-direction="decode"]');
        const encodersHidden = await page.evaluate(() => [...document.querySelectorAll('[data-encode-dir="encode"]')].every((b) => b.hidden));
        const decodersShown = await page.evaluate(() => [...document.querySelectorAll('[data-encode-dir="decode"]')].every((b) => !b.hidden && b.offsetParent));
        await page.keyboard.press('ArrowLeft');
        const direction = await page.evaluate(() => window.EncodingUI.direction);
        t.check('Encoding filter hides tiles and moves with arrow keys', encodersHidden && decodersShown && direction === 'encode', direction);
    });

    await t.step('Prefix scope radiogroup', async () => {
        await page.click('.tool-section[data-section="prefix"] .tool-header');
        await page.waitForTimeout(300);
        await page.focus('.scope-pills .scope-btn[data-active="true"]');
        await page.keyboard.press('ArrowRight');
        const scope = await page.evaluate(() => [window.PrefixUI.scope, document.querySelector('.scope-pills').getAttribute('role')]);
        t.check('Prefix scope pills behave as a radiogroup', scope[0] === 'selection' && scope[1] === 'radiogroup', scope.join(' / '));
    });

    await t.step('Focus mode', async () => {
        await page.click('#editor-textarea');
        await page.keyboard.press('Control+\\');
        await page.waitForTimeout(300);
        const collapsed = await page.evaluate(() => [window.State.get().ui.leftPanelCollapsed, window.State.get().ui.rightPanelCollapsed]);
        await page.keyboard.press('Control+\\');
        await page.waitForTimeout(300);
        const restored = await page.evaluate(() => [window.State.get().ui.leftPanelCollapsed, window.State.get().ui.rightPanelCollapsed]);
        t.check('Focus mode collapses and restores both rails', collapsed.every(Boolean) && restored.every((v) => !v), JSON.stringify([collapsed, restored]));
    });

    await t.step('Zen mode', async () => {
        await page.keyboard.press('Control+Shift+\\');
        await page.waitForTimeout(400);
        const zen = await page.evaluate(() => document.documentElement.dataset.zen);
        await page.mouse.move(700, 2);
        await page.waitForTimeout(400);
        const peek = await page.evaluate(() => document.documentElement.dataset.zenChrome);
        await page.mouse.move(700, 500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const off = await page.evaluate(() => document.documentElement.dataset.zen === undefined);
        t.check('Zen mode enters, peeks, and exits on Escape', zen === 'true' && peek === 'true' && off, `${zen}/${peek}/${off}`);
    });

    await t.step('Help and caret affordances', async () => {
        const chip = await page.evaluate(() => document.querySelector('.kbd-shortcut[data-key="S"]').textContent);
        t.check('Help chips show the platform shortcut', /Ctrl\+S|⌘S/.test(chip), chip);
        const tag = await page.evaluate(() => document.getElementById('stat-caret').tagName);
        t.check('Caret pill is a keyboard-reachable button', tag === 'BUTTON', tag);
    });

    t.assertClean(s, 'textMan');
    await s.close();
}
