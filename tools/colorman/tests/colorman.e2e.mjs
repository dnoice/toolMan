/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ColorManBrowserSuite (colorMan Edition - v1.0)
 *     - File Name: colorman.e2e.mjs
 *     - Relative Path: tools/colorman/tests/colorman.e2e.mjs
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     End-to-end checks for colorMan's core workflows, driven in a real
 *     browser the way a visitor uses them: enter a color and read its
 *     conversions, check contrast against a preset, build a scale and a
 *     harmony, save to the working palette and the library, export, change
 *     settings, and undo or redo. It runs once at desktop size and once at
 *     phone size so both layouts stay usable.
 *
 * ✒ Key Features:
 *     - Color field: a typed CSS name becomes the active color and every
 *       Formats row (HEX, RGB, OKLCH, Name) follows it
 *     - Typing with a pause is one undo step and records one Recent color;
 *       Ctrl+Z and Ctrl+Y move between colors once focus leaves the field
 *     - Contrast pane: the Near-black preset, a pass verdict, and a ratio
 *       that is truncated at a threshold (4.49:1 fails AA, never "4.50")
 *     - Shades & Tints gives 11 Tailwind steps; Harmonies' triadic set goes
 *       to the working palette
 *     - Working palette: add the active color, sort with Undo, save to the
 *       library through the name prompt
 *     - Export: CSS variables preview and a real .css download
 *     - Settings: an invalid export prefix holds Save with an inline note;
 *       Primary format OKLCH rewrites the color field; Light / Dark /
 *       System radios save and paint the theme
 *     - Backup import only adds: local work and settings survive, and the
 *       backup's settings wait for a confirm
 *     - No retired theme names anywhere on the page
 *     - Phone (390px): no sideways scroll, drawers open and close, a scale
 *       step picked from the Tools drawer becomes the active color
 *     - Each session ends with a clean console and zero network requests
 *
 * ✒ Usage Instructions:
 *     Runs under scripts/e2e.mjs:
 *         node scripts/e2e.mjs --only colorman
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs --only colorman
 *         → desktop and phone sessions, one line per check
 *     node scripts/e2e.mjs --only colorman --shots e2e-shots
 *         → screenshots of any failing check land in e2e-shots/
 *     node scripts/e2e.mjs --only colorman --headed
 *         → watch the workflows run
 *
 * ✒ Other Important Information:
 *     - Dependencies: scripts/e2e.mjs (harness), Playwright with Chromium;
 *       reads colorMan's globals (State, ExportUI, HarmonyUI)
 *     - Compatible platforms: wherever scripts/e2e.mjs runs
 *     - Limitations: clipboard copies are not asserted (headless Chromium
 *       has no clipboard permission on file:// pages); the eyedropper needs
 *       a real screen and is not exercised
 * ----------------------------------------------------------------------------
 */

export const name = 'colorman';
export const description = 'colorMan workflows: convert, contrast, scale, harmony, palettes, export, settings, undo';

const PAGE = 'tools/colorman/index.html';
const RETIRED = /parchment|sentinel|obsidian|dossier/i;

const active = (page) => page.evaluate(() => window.State.activeHex());
const formatRow = (page, id) => page.evaluate((f) => {
    const row = document.querySelector(`#mount-formats [data-format="${f}"] .readout-value`);
    return row ? row.textContent : null;
}, id);

/** Open a rail pane by its data-section id unless it is already open. */
async function openPane(page, id) {
    const open = await page.evaluate((s) => document.querySelector(`.tool-section[data-section="${s}"]`).dataset.collapsed !== 'true', id);
    if (!open) await page.click(`.tool-section[data-section="${id}"] .tool-header`);
    await page.waitForTimeout(300);
}

async function blurField(page) {
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
}

async function desktop(t) {
    const s = await t.open(PAGE, { theme: 'light' });
    const { page } = s;

    await t.step('Color field converts any CSS color', async () => {
        await page.fill('#color-input', 'rebeccapurple');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const hex = await active(page);
        const rows = [await formatRow(page, 'hex'), await formatRow(page, 'rgb'), await formatRow(page, 'oklch'), await formatRow(page, 'name')];
        t.check('a typed name becomes the active color', hex === '#663399', hex);
        t.check('Formats rows follow it', rows[0] === '#663399' && rows[1] === 'rgb(102 51 153)'
            && /^oklch\(0\.\d+ 0\.\d+ \d+(\.\d+)?\)$/.test(rows[2]) && rows[3] === 'rebeccapurple', rows.join(' | '));
    });

    await t.step('Typing is one undo step; Ctrl+Z and Ctrl+Y', async () => {
        await page.click('#color-input');
        await page.keyboard.press('Control+a');
        await page.keyboard.type('#336');
        await page.waitForTimeout(1100);
        await page.keyboard.type('699');
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        const recent = await page.evaluate(() => window.State.history());
        t.check('only the committed color reaches Recent', recent[0] === '#336699' && !recent.includes('#333366'), recent.join(' '));
        await blurField(page);
        await page.keyboard.press('Control+z');
        const undone = await active(page);
        await page.keyboard.press('Control+y');
        const redone = await active(page);
        t.check('Ctrl+Z skips the half-typed color, Ctrl+Y returns', undone === '#663399' && redone === '#336699', `${undone} / ${redone}`);
        const redoDisabled = await page.evaluate(() => document.getElementById('btn-redo').disabled);
        t.check('Redo button disables when there is nothing to redo', redoDisabled, String(redoDisabled));
    });

    await t.step('Contrast with a preset', async () => {
        await openPane(page, 'contrast');
        await page.evaluate(() => window.State.setActive('#F5F0E8'));
        await page.click('#mount-contrast .con-preset:has-text("Near-black")');
        await page.waitForTimeout(250);
        const r = await page.evaluate(() => ({
            ratio: document.querySelector('#mount-contrast .con-ratio').textContent,
            verdict: document.querySelector('#mount-contrast .con-verdict').textContent,
            pressed: document.querySelector('#mount-contrast .con-preset[aria-pressed="true"]').textContent
        }));
        t.check('Near-black preset sets the background and passes', r.pressed === 'Near-black' && /^1[0-9]\.\d\d:1$/.test(r.ratio) && r.verdict === 'Passes AA', JSON.stringify(r));

        await page.evaluate(() => window.State.setActive('#0078D7'));
        await page.click('#mount-contrast .con-preset:has-text("White")');
        await page.waitForTimeout(250);
        const edge = await page.evaluate(() => [
            document.querySelector('#mount-contrast .con-ratio').textContent,
            document.querySelector('#mount-contrast .con-verdict').textContent,
            [...document.querySelectorAll('#mount-stats .stat-pill')].map((p) => p.textContent).find((x) => /white/.test(x))
        ]);
        t.check('a ratio just under 4.5 reads 4.49 everywhere and fails AA', edge[0] === '4.49:1' && edge[1] === 'Fails AA' && /4\.49:1/.test(edge[2]), edge.join(' | '));
    });

    await t.step('Shades & Tints and Harmonies', async () => {
        await page.evaluate(() => window.State.setActive('#3B82F6'));
        await openPane(page, 'scale');
        const steps = await page.evaluate(() => [...document.querySelectorAll('#mount-scale .scl-label')].map((l) => l.textContent.replace(/Base$/, '').trim()));
        t.check('Tailwind scale has 11 steps, 50 to 950', steps.length === 11 && steps[0] === '50' && steps[10] === '950', steps.join(','));

        await openPane(page, 'harmony');
        await page.click('#mount-harmony .ta-radio[data-value="triadic"]');
        await page.waitForTimeout(250);
        const set = await page.evaluate(() => window.HarmonyUI.colors());
        const before = await page.evaluate(() => window.State.working().colors.length);
        await page.click('#mount-harmony .ta-actions .btn:has-text("Add to palette")');
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => window.State.working().colors.map((c) => c.hex));
        t.check('triadic set (3 colors) goes to the working palette', set.length === 3 && after.length === before + 3 && after.includes(set[1]), `${set.join(' ')} → ${after.length}`);
    });

    await t.step('Working palette: add, sort with Undo, save to library', async () => {
        await page.evaluate(() => window.State.setActive('#C9A84C'));
        await page.click('#btn-add-to-palette');
        await page.waitForTimeout(150);
        const order = await page.evaluate(() => window.State.working().colors.map((c) => c.hex).join(' '));
        await page.selectOption('#actions-working select', 'lightness');
        await page.waitForTimeout(200);
        const sorted = await page.evaluate(() => window.State.working().colors.map((c) => c.hex).join(' '));
        await page.click('#mount-working .cm-undo-btn');
        await page.waitForTimeout(150);
        const restored = await page.evaluate(() => window.State.working().colors.map((c) => c.hex).join(' '));
        t.check('active color added last', order.endsWith('#C9A84C'), order);
        t.check('sort changes the order and Undo brings yours back', sorted !== order && restored === order, `${sorted} → ${restored}`);

        const libBefore = await page.evaluate(() => window.State.palettes().length);
        await page.click('#actions-working .wp-save');
        await page.waitForSelector('#modal-prompt.is-open');
        await page.fill('#prompt-input', 'E2E Blues');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const lib = await page.evaluate(() => window.State.palettes().map((p) => p.name));
        const linked = await page.evaluate(() => window.State.working().id !== null);
        t.check('Save to library adds a linked palette', lib.length === libBefore + 1 && lib.includes('E2E Blues') && linked, lib.join(', '));
    });

    await t.step('Export CSS variables and download', async () => {
        await openPane(page, 'export');
        await page.selectOption('#ex-format', 'css');
        await page.waitForTimeout(200);
        const preview = await page.evaluate(() => document.querySelector('#mount-export .ex-code').textContent);
        t.check('preview lists CSS custom properties', /--color-[\w-]+: #[0-9A-F]{6};/.test(preview), preview.split('\n').slice(0, 3).join(' '));
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            page.click('#mount-export .tb-buttons .btn:has-text("Download")')
        ]);
        t.check('Download saves a .css file', /\.css$/.test(download.suggestedFilename()), download.suggestedFilename());
    });

    await t.step('Settings: inline prefix check, primary format, theme', async () => {
        const values = await page.evaluate(() => [...document.querySelectorAll('input[name="theme-pref"]')].map((r) => r.value).join(','));
        t.check('Settings offers Light, Dark, System', values === 'light,dark,system', values);

        await page.click('#btn-settings');
        await page.waitForTimeout(250);
        const checked = await page.evaluate(() => (document.querySelector('input[name="theme-pref"]:checked') || {}).value);
        t.check('the saved Light choice is selected', checked === 'light', checked);

        await page.fill('#setting-export-prefix', '9 bad!');
        const held = await page.evaluate(() => [document.getElementById('btn-save-settings').disabled, document.getElementById('export-prefix-error').textContent]);
        t.check('a bad export prefix explains itself and holds Save', held[0] === true && /letter/.test(held[1]), held.join(' | '));
        await page.fill('#setting-export-prefix', 'brand');
        await page.selectOption('#setting-primary-format', 'oklch');
        await page.check('input[name="theme-pref"][value="dark"]');
        await page.click('#btn-save-settings');
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => ({
            fmt: window.State.settings().primaryFormat,
            prefix: window.State.settings().exportPrefix,
            field: document.getElementById('color-input').value,
            theme: document.documentElement.dataset.theme,
            saved: localStorage.getItem('toolman.theme')
        }));
        t.check('Save applies format and prefix; the field shows OKLCH', after.fmt === 'oklch' && after.prefix === 'brand' && /^oklch\(/.test(after.field), JSON.stringify(after));
        t.check('saving Dark paints and stores dark', after.theme === 'dark' && after.saved === 'dark', `${after.theme} / ${after.saved}`);
    });

    await t.step('Backup import only adds', async () => {
        const local = await page.evaluate(() => ({ w: window.State.working(), n: window.State.palettes().length }));
        const backup = {
            version: '1.0.0',
            state: {
                working: { name: 'Old work', colors: [{ hex: '#ABCDEF', name: '' }] },
                palettes: [{ id: 'pal-toolman-house', name: 'toolMan House', colors: [{ hex: '#1B2A4A', name: 'Navy' }] }],
                gradient: { type: 'conic' },
                settings: { primaryFormat: 'hex', precision: 3 }
            }
        };
        await page.click('#btn-settings');
        await page.waitForTimeout(250);
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-settings-import]')]);
        await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
        await page.waitForSelector('#modal-confirm.is-open', { timeout: 3000 });
        const mid = await page.evaluate(() => ({
            w: window.State.working(),
            names: window.State.palettes().map((p) => p.name),
            house: window.State.palettes().find((p) => p.id === 'pal-toolman-house').colors.length,
            g: window.State.gradient().type,
            fmt: window.State.settings().primaryFormat
        }));
        t.check('local work, starter palette, gradient, and settings are untouched',
            JSON.stringify(mid.w) === JSON.stringify(local.w) && mid.house === 6 && mid.g === 'linear' && mid.fmt === 'oklch', JSON.stringify(mid));
        t.check('the backup arrives as new palettes', mid.names.length === local.n + 2
            && mid.names.includes('toolMan House (from backup)') && mid.names.includes('Old work (from backup)'), mid.names.join(', '));
        await page.click('#modal-confirm .modal-footer .btn-secondary');
        await page.waitForTimeout(200);
        t.check('declining keeps your settings', (await page.evaluate(() => window.State.settings().primaryFormat)) === 'oklch');
    });

    await t.step('No retired theme names on the page', async () => {
        const text = await page.evaluate(() => [document.body.textContent,
            ...[...document.querySelectorAll('[aria-label],[title],[placeholder]')].map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('placeholder') || ''}`)].join('\n'));
        t.check('no Parchment, Sentinel, Obsidian, or Dossier', !RETIRED.test(text), (text.match(RETIRED) || [''])[0]);
    });

    await t.shot(page, 'colorman-desktop');
    t.assertClean(s, 'colorMan desktop');
    await s.close();
}

async function phone(t) {
    const s = await t.open(PAGE, { theme: 'system', colorScheme: 'dark', mobile: true });
    const { page } = s;

    await t.step('Phone layout', async () => {
        const theme = await page.evaluate(() => document.documentElement.dataset.theme);
        t.check('System on a dark phone paints dark', theme === 'dark', theme);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        t.check('no sideways scroll at 390px', overflow <= 0, `${overflow}px`);

        await page.fill('#color-input', 'oklch(0.7 0.15 30)');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const hex = await active(page);
        t.check('typing a color works on a phone', /^#[0-9A-F]{6}$/.test(hex) && hex !== '#C9A84C', hex);

        await page.click('#btn-mobile-right');
        await page.waitForTimeout(400);
        const drawer = await page.evaluate(() => {
            const r = document.getElementById('panel-tools').getBoundingClientRect();
            return [document.getElementById('btn-mobile-right').getAttribute('aria-expanded'), Math.round(r.left), Math.round(r.right)];
        });
        t.check('the Tools drawer slides in', drawer[0] === 'true' && drawer[1] >= 0 && drawer[2] <= 390, drawer.join(' / '));

        await openPane(page, 'scale');
        await page.click('#mount-scale .scl-row:nth-child(2) .scl-pick');
        await page.waitForTimeout(250);
        const picked = await active(page);
        t.check('a scale step picked in the drawer becomes active', picked !== hex, `${hex} → ${picked}`);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const closed = await page.evaluate(() => document.getElementById('btn-mobile-right').getAttribute('aria-expanded'));
        t.check('Escape closes the drawer', closed === 'false', closed);

        await page.click('#btn-add-to-palette');
        await page.waitForTimeout(150);
        const count = await page.evaluate(() => window.State.working().colors.length);
        t.check('add to working palette from the phone toolbar', count === 1, String(count));
    });

    await t.shot(page, 'colorman-phone');
    t.assertClean(s, 'colorMan phone');
    await s.close();
}

export default async function colorman(t) {
    await desktop(t);
    await phone(t);
}
