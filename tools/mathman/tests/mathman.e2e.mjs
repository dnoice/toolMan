/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MathManBrowserSuite (mathMan Edition - v1.0)
 *     - File Name: mathman.e2e.mjs
 *     - Relative Path: tools/mathman/tests/mathman.e2e.mjs
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     End-to-end checks for mathMan's core workflows, driven in a real
 *     browser the way a visitor uses them: type a worksheet and read its
 *     answers, manage sheets, insert from the Library, and use every pane in
 *     the Tools rail. It runs once at desktop size and once at phone size so
 *     both layouts stay usable.
 *
 * ✒ Key Features:
 *     - Worksheet: a typed sheet with a heading, labels, total, an exact
 *       fraction, a variable, a function, units and conversion, a
 *       percentage, and a line reference shows the right answer beside each
 *       line; an unknown name shows an Error marker, a tooltip, and the
 *       message on the Result card
 *     - Copying: a click on a result, the Result card's Copy value, and
 *       Ctrl+Shift+C hand the plain value to the clipboard (recorded at
 *       DOM.copyText)
 *     - Selection summary: two selected lines give a sum and mean in the
 *       stat pill and on the Result card; Ctrl+/ turns lines into notes and
 *       back; Ctrl+Enter adds the line to History
 *     - Sheets: new, rename (prompt and the toolbar name), duplicate, delete
 *       with a confirm and Undo, and everything kept across a reload
 *     - Library: a variable and a Reference function inserted at the caret
 *       and worked out; a History entry inserted back into the sheet
 *     - Tools: keypad typing, Units two-way conversion, a Graph that draws
 *       and traces, Statistics readouts, Solver roots, prime factors and
 *       the base converter, an X% of Y calculator, and a loan payment
 *     - Settings: significant digits, degrees, and Light / Dark / System;
 *       Ctrl+Alt+D switches back to radians
 *     - Review guards: a heavy sheet answers in slices with "working…"
 *       rows and re-works only an edited line; sheet names stay unique; a
 *       sheet saved in a second tab survives this tab's next save
 *     - No retired theme names anywhere on the page
 *     - Phone (390px): no sideways scroll, the Tools drawer opens, keypad
 *       taps type into the sheet with the drawer still open, Escape closes it
 *     - Each session ends with a clean console and zero network requests
 *
 * ✒ Usage Instructions:
 *     Runs under scripts/e2e.mjs:
 *         node scripts/e2e.mjs --only mathman
 *
 * ✒ Examples:
 *     node scripts/e2e.mjs --only mathman
 *         → desktop and phone sessions, one line per check
 *     node scripts/e2e.mjs --only mathman --shots e2e-shots
 *         → screenshots of any failing check land in e2e-shots/
 *     node scripts/e2e.mjs --only mathman --headed
 *         → watch the workflows run
 *
 * ✒ Other Important Information:
 *     - Dependencies: scripts/e2e.mjs (harness), Playwright with Chromium;
 *       reads mathMan's globals (State, WorksheetUI, GraphUI, StatsUI,
 *       MoneyUI) for assertions
 *     - Compatible platforms: wherever scripts/e2e.mjs runs
 *     - Limitations: the system clipboard is not read (headless Chromium has
 *       no clipboard permission on file:// pages), so DOM.copyText is
 *       replaced with a recorder; graph pixels are read once from a copy of
 *       the canvas so Chromium logs no readback warning
 * ----------------------------------------------------------------------------
 */

export const name = 'mathman';
export const description = 'mathMan workflows: worksheet, sheets, library, keypad, units, graph, stats, solver, number theory, percent, finance, settings';

const PAGE = 'tools/mathman/index.html';
const RETIRED = /parchment|sentinel|obsidian|dossier/i;

const SHEET = [
    '# Trip',
    'Rent: 1200',
    'Food: 300',
    'total',
    '1/3 + 1/6',
    'speed = 90',
    'cube(n) = n^3',
    'cube(3)',
    '5 km + 300 m',
    '100 km/h to mph',
    '200 + 15%',
    'line2 * 2',
    'oops + 1'
];

/** The results-column text for a 0-based line (value, function note, or the Error word). */
const cell = (page, i) => page.evaluate((n) => {
    const row = document.querySelector(`#mount-worksheet .ws-row[data-line="${n}"]`);
    if (!row) return null;
    const parts = [...row.querySelectorAll('.ws-val, .ws-frac, .ws-fn, .ws-err-word')].map((s) => s.textContent);
    return parts.join(' ');
}, i);

/** Open a rail pane by its data-section id unless it is already open. */
async function openPane(page, id) {
    const open = await page.evaluate((s) => document.querySelector(`.tool-section[data-section="${s}"]`).dataset.collapsed !== 'true', id);
    if (!open) await page.click(`.tool-section[data-section="${id}"] .tool-header`);
    await page.waitForTimeout(350);
}

/** Replace DOM.copyText with a recorder so copies can be asserted without the system clipboard. */
async function recordCopies(page) {
    await page.evaluate(() => {
        window.__copied = [];
        DOM.copyText = async (text) => {
            window.__copied.push(String(text));
            return true;
        };
    });
}
const lastCopy = (page) => page.evaluate(() => window.__copied[window.__copied.length - 1] || null);

/** Caret to the end of a 1-based worksheet line. */
const goToLine = (page, n) => page.evaluate((line) => window.WorksheetUI.goToLine(line), n);

/** Caret on a fresh last line of the sheet. */
async function newLastLine(page) {
    await page.evaluate(() => {
        const ta = document.getElementById('ws-input');
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
}

const lastLine = (page) => page.evaluate(() => {
    const lines = window.State.result().lines;
    const l = lines[lines.length - 1];
    return { source: l.source, kind: l.kind, display: l.display };
});

/** The value beside a readout label inside a mount. */
const readout = (page, mount, label) => page.evaluate(([m, l]) => {
    const row = [...document.querySelectorAll(`${m} .readout`)].find((r) => {
        const lab = r.querySelector('.readout-label');
        return lab && lab.textContent.trim() === l;
    });
    return row ? row.querySelector('.readout-value').textContent : null;
}, [mount, label]);

async function desktop(t) {
    const s = await t.open(PAGE, { theme: 'light' });
    const { page } = s;
    await recordCopies(page);

    await t.step('Welcome sheet works out cleanly', async () => {
        const r = await page.evaluate(() => ({
            errors: window.State.result().counts.errors,
            lines: window.State.result().counts.lines,
            pill: document.getElementById('stat-errors').textContent,
            name: document.getElementById('sheet-title').value
        }));
        t.check('the seeded Welcome sheet has no errors', r.name === 'Welcome' && r.errors === 0 && r.pill === 'Errors: 0' && r.lines > 30, JSON.stringify(r));
    });

    await t.step('Type a multi-line sheet', async () => {
        await page.click('#btn-new-sheet');
        await page.waitForFunction(() => window.State.sheets().length === 2);
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        t.check('New sheet opens an empty sheet with the editor focused', focused === 'ws-input', focused);
        await page.keyboard.type(SHEET.join('\n'));
        await page.waitForTimeout(400);
        const cells = [];
        for (let i = 0; i < SHEET.length; i++) cells.push(await cell(page, i));
        const want = {
            1: '1,200', 2: '300', 3: '1,500', 4: '0.5 1/2', 5: '90', 6: 'ƒ cube(n) defined', 7: '27',
            8: '5.3 km', 9: '62.13711922 mph', 10: '230', 11: '2,400', 12: 'Error'
        };
        const wrong = Object.keys(want).filter((k) => cells[k] !== want[k]).map((k) => `line ${Number(k) + 1}: ${cells[k]}`);
        t.check('every line shows its answer beside it', wrong.length === 0, wrong.join(' | '));
        const r = await page.evaluate(() => window.State.result());
        t.check('labels, total, and the line reference are understood',
            r.lines[1].label === 'Rent' && r.lines[3].numeric === 1500 && r.lines[11].numeric === 2400, `${r.lines[1].label} ${r.lines[3].numeric} ${r.lines[11].numeric}`);
        const pills = await page.evaluate(() => ['stat-lines', 'stat-values', 'stat-errors'].map((id) => document.getElementById(id).textContent));
        t.check('stat pills count lines, values, and errors', pills.join('|') === 'Lines: 13|Values: 10|Errors: 1', pills.join(' | '));
        const vars = await page.evaluate(() => window.State.result().variables.map((v) => v.name).concat(window.State.result().functions.map((f) => f.name)));
        t.check('the variable and the function are defined for later lines', vars.includes('speed') && vars.includes('cube'), vars.join(','));
    });

    await t.step('An error line explains itself', async () => {
        await page.hover('#mount-worksheet .ws-row[data-line="12"] .ws-err');
        await page.waitForTimeout(150);
        const tip = await page.evaluate(() => {
            const el = document.getElementById('ws-tip');
            return { hidden: el.hidden, text: el.textContent };
        });
        t.check('hovering the Error marker shows the message', !tip.hidden && /Unknown name 'oops'/.test(tip.text), JSON.stringify(tip));
        await page.click('#mount-worksheet .ws-row[data-line="12"] .ws-err');
        await page.waitForTimeout(200);
        const card = await page.evaluate(() => {
            const ta = document.getElementById('ws-input');
            return {
                kind: document.querySelector('#mount-result .rc-kind').textContent,
                msg: (document.querySelector('#mount-result .rc-error') || {}).textContent,
                selected: ta.value.slice(ta.selectionStart, ta.selectionEnd)
            };
        });
        t.check('clicking it selects the unknown name and the Result card explains',
            card.kind === 'Error' && /define it first, like oops = 5/.test(card.msg) && card.selected === 'oops', JSON.stringify(card));
        const pill = await page.evaluate(() => document.getElementById('stat-errors').dataset.errors);
        t.check('the Errors pill is marked', pill === '1', pill);
    });

    await t.step('Result card and copying', async () => {
        await page.click('#mount-worksheet .ws-row[data-line="4"] .ws-res');
        await page.waitForTimeout(200);
        const clicked = await lastCopy(page);
        const card = await page.evaluate(() => ({
            value: document.querySelector('#mount-result .rc-value').textContent,
            exact: [...document.querySelectorAll('#mount-result .readout')].map((r) => r.textContent).find((x) => /^Exact/.test(x)) || ''
        }));
        t.check('clicking a result copies its plain value', clicked === '0.5', clicked);
        t.check('the Result card shows the value and its exact fraction', card.value === '0.5' && /1\/2/.test(card.exact), JSON.stringify(card));

        await goToLine(page, 9);
        await page.waitForTimeout(150);
        await page.click('#mount-result .rc-copy');
        const value = await lastCopy(page);
        await page.click('#mount-result .rc-copy:has-text("With unit")');
        const withUnit = await lastCopy(page);
        t.check('Copy value drops the unit; With unit keeps it', value === '5.3' && withUnit === '5.3 km', `${value} / ${withUnit}`);

        await goToLine(page, 10);
        await page.keyboard.press('Control+Shift+C');
        await page.waitForTimeout(150);
        const shortcut = await lastCopy(page);
        t.check('Ctrl+Shift+C copies the current line with its unit', shortcut === '62.13711922 mph', shortcut);

        await newLastLine(page);
        await page.keyboard.type('1.414213562');
        await page.waitForTimeout(400);
        const labels = await page.evaluate(() => [...document.querySelectorAll('#mount-result .readout-label')].map((n) => n.textContent));
        t.check('a typed decimal is not repeated as a long fraction', labels.includes('Input') && !labels.includes('Exact'), labels.join(','));
    });

    await t.step('Selection summary, notes, and History', async () => {
        await goToLine(page, 1);
        await page.keyboard.press('End');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(250);
        const sel = await page.evaluate(() => ({
            pill: document.getElementById('stat-selection').textContent,
            api: window.WorksheetUI.selectionSummary(),
            card: (document.querySelector('#mount-result .rc-sel') || {}).textContent || ''
        }));
        t.check('two selected lines give a sum and a mean', sel.api && sel.api.count === 2 && sel.api.sum === 1500
            && sel.pill === 'Sum 1,500 · Mean 750 · 2 values' && /Sum/.test(sel.card), JSON.stringify(sel));

        await page.keyboard.press('Control+/');
        await page.waitForTimeout(250);
        const noted = await page.evaluate(() => window.State.activeSheet().text.split('\n').slice(1, 3));
        await page.keyboard.press('Control+/');
        await page.waitForTimeout(250);
        const back = await page.evaluate(() => window.State.activeSheet().text.split('\n').slice(1, 3));
        t.check('Ctrl+/ turns the lines into notes and back',
            noted[0] === '// Rent: 1200' && noted[1] === '// Food: 300' && back[0] === 'Rent: 1200' && back[1] === 'Food: 300', `${noted.join(',')} → ${back.join(',')}`);

        await goToLine(page, 8);
        await page.keyboard.press('Control+Enter');
        await page.waitForTimeout(200);
        const hist = await page.evaluate(() => window.State.history());
        t.check('Ctrl+Enter adds the line to History', hist.length === 1 && hist[0].expr === 'cube(3)' && hist[0].plain === '27', JSON.stringify(hist[0] || null));
    });

    await t.step('Shortcuts stay out of other panes\' fields', async () => {
        await openPane(page, 'units');
        await page.click('#un-from-value');
        await page.keyboard.press('Control+Enter');
        await page.waitForTimeout(150);
        const count = await page.evaluate(() => window.State.history().length);
        t.check('Ctrl+Enter in a Units field does not add the worksheet line', count === 1, String(count));
    });

    await t.step('Sheets: rename, duplicate, delete with Undo', async () => {
        await openPane(page, 'sheets');
        await page.click('#mount-sheets .lib-sheet[data-active="true"] [data-act="rename"]');
        await page.waitForSelector('#modal-prompt.is-open');
        await page.fill('#prompt-input', 'E2E Trip');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const renamed = await page.evaluate(() => [window.State.activeSheet().name, document.getElementById('sheet-title').value]);
        t.check('Rename through the prompt updates the sheet and the toolbar', renamed[0] === 'E2E Trip' && renamed[1] === 'E2E Trip', renamed.join(' / '));

        await page.fill('#sheet-title', '');
        await page.keyboard.type('Trip budget');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        const titled = await page.evaluate(() => window.State.activeSheet().name);
        t.check('the toolbar name field renames on Enter', titled === 'Trip budget', titled);

        await page.click('#mount-sheets .lib-sheet[data-active="true"] [data-act="duplicate"]');
        await page.waitForTimeout(250);
        const dup = await page.evaluate(() => ({ names: window.State.sheets().map((x) => x.name), active: window.State.activeSheet() }));
        t.check('Duplicate adds an open copy', dup.names.length === 3 && dup.active.name === 'Trip budget copy'
            && dup.active.text.startsWith('# Trip'), dup.names.join(', '));

        await page.click('#mount-sheets .lib-sheet[data-active="true"] [data-act="delete"]');
        await page.waitForSelector('#modal-confirm.is-open');
        await page.click('#modal-confirm .btn-danger');
        await page.waitForTimeout(250);
        const afterDelete = await page.evaluate(() => window.State.sheets().map((x) => x.name));
        t.check('Delete asks first, then removes the sheet', afterDelete.length === 2 && !afterDelete.includes('Trip budget copy'), afterDelete.join(', '));
        await page.click('#mount-sheets .lib-undo-btn');
        await page.waitForTimeout(250);
        const undone = await page.evaluate(() => window.State.sheets().map((x) => x.name));
        t.check('Undo brings it back', undone.length === 3 && undone.includes('Trip budget copy'), undone.join(', '));

        await page.click('#mount-sheets .lib-sheet[data-active="true"] [data-act="delete"]');
        await page.waitForSelector('#modal-confirm.is-open');
        await page.click('#modal-confirm .btn-danger');
        await page.waitForTimeout(250);
        const active = await page.evaluate(() => [window.State.activeSheet().name, document.getElementById('sheet-title').value,
            (document.querySelector('#mount-sheets .lib-sheet[data-active="true"] .row-title') || {}).textContent]);
        t.check('deleting the open sheet opens its neighbour', active.every((n) => n === 'Trip budget'), active.join(' / '));
    });

    await t.step('Variables and Reference insert at the caret', async () => {
        await openPane(page, 'variables');
        const names = await page.evaluate(() => [...document.querySelectorAll('#mount-variables .lib-var-name')].map((n) => n.textContent));
        t.check('Variables lists the sheet\'s variable and function', names.includes('speed') && names.some((n) => /^cube/.test(n)), names.join(', '));
        await newLastLine(page);
        await page.click('#mount-variables .lib-var:has(.lib-var-name:text-is("speed"))');
        await page.waitForTimeout(150);
        await page.keyboard.type(' * 2');
        await page.waitForTimeout(400);
        const v = await lastLine(page);
        t.check('a variable inserts its name and the line works out', v.source === 'speed * 2' && v.display === '180', JSON.stringify(v));

        await openPane(page, 'reference');
        await page.fill('#mount-reference .lib-filter', 'sqrt');
        await page.waitForTimeout(300);
        const rows = await page.evaluate(() => [...document.querySelectorAll('#mount-reference .lib-ref .lib-ref-sig')].map((n) => n.textContent));
        t.check('Reference search finds sqrt', rows.some((r) => /^sqrt/.test(r)), rows.slice(0, 4).join(' | '));
        await newLastLine(page);
        await page.click('#mount-reference .lib-ref:has(.lib-ref-sig:text-matches("^sqrt"))');
        await page.waitForTimeout(150);
        await page.keyboard.type('144)');
        await page.waitForTimeout(400);
        const r = await lastLine(page);
        t.check('a Reference function inserts "sqrt(" and works out', r.source === 'sqrt(144)' && r.display === '12', JSON.stringify(r));
    });

    await t.step('History inserts a saved result', async () => {
        await openPane(page, 'history');
        const rows = await page.evaluate(() => [...document.querySelectorAll('#mount-history .lib-hist-main')].map((n) => n.textContent));
        t.check('History shows the saved calculation', rows.length === 1 && /cube\(3\)/.test(rows[0]) && /27/.test(rows[0]), rows.join(' | '));
        await newLastLine(page);
        await page.click('#mount-history .lib-hist-main');
        await page.waitForTimeout(150);
        await page.keyboard.type(' + 3');
        await page.waitForTimeout(400);
        const l = await lastLine(page);
        t.check('clicking it inserts the result at the caret', l.source === '27 + 3' && l.display === '30', JSON.stringify(l));
    });

    await t.step('Keypad types into the sheet', async () => {
        await openPane(page, 'keypad');
        await newLastLine(page);
        for (const key of ['7', 'multiply', '6']) await page.click(`#mount-keypad [data-key="${key}"]`);
        await page.waitForTimeout(400);
        const l = await lastLine(page);
        const display = await page.evaluate(() => document.querySelector('#mount-keypad .kp-display-value').textContent);
        t.check('keypad presses type 7 * 6 and the display shows 42', l.source === '7 * 6' && l.display === '42' && /42/.test(display), `${JSON.stringify(l)} / ${display}`);
    });

    await t.step('Units convert both ways', async () => {
        await openPane(page, 'units');
        const pair = await page.evaluate(() => [document.getElementById('un-from-unit').value, document.getElementById('un-to-unit').value]);
        await page.fill('#un-from-value', '5');
        await page.waitForTimeout(200);
        const to = await page.inputValue('#un-to-value');
        t.check('5 km reads as 3.106855961 mi', pair.join('→') === 'km→mi' && to === '3.106855961', `${pair.join('→')} ${to}`);
        await page.fill('#un-to-value', '10');
        await page.waitForTimeout(200);
        const from = await page.inputValue('#un-from-value');
        t.check('typing on the To side converts back', from === '16.09344', from);
    });

    await t.step('Graph draws and traces', async () => {
        await openPane(page, 'graph');
        await page.fill('#gr-expr-1', 'x^2 - 4');
        await page.waitForTimeout(500);
        const painted = await page.evaluate(() => {
            const src = document.querySelector('#mount-graph .gr-canvas');
            const copy = document.createElement('canvas');
            copy.width = src.width;
            copy.height = src.height;
            const ctx = copy.getContext('2d');
            ctx.drawImage(src, 0, 0);
            const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
            const colors = new Set();
            for (let i = 0; i < data.length; i += 4 * 97) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
            return { w: src.width, h: src.height, colors: colors.size };
        });
        t.check('the canvas is sized and painted', painted.w > 100 && painted.h > 100 && painted.colors > 3, JSON.stringify(painted));
        const traced = await page.evaluate(() => window.GraphUI.traceAt(3));
        t.check('tracing x = 3 gives y = 5', Array.isArray(traced) && traced.length >= 1 && Math.abs(traced[0].y - 5) < 1e-9, JSON.stringify(traced));
        const box = await page.locator('#mount-graph .gr-canvas').boundingBox();
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        await page.waitForTimeout(250);
        const readout = await page.evaluate(() => document.querySelector('#mount-graph .gr-readout').textContent);
        t.check('clicking the graph shows an x and y readout', /x/.test(readout) && /\d/.test(readout), readout);
    });

    await t.step('Statistics readouts', async () => {
        await openPane(page, 'stats');
        await page.fill('#st-data', '2, 4, 4, 4, 5, 5, 7, 9');
        await page.waitForTimeout(400);
        const got = {
            count: await readout(page, '#mount-stats', 'Count'),
            mean: await readout(page, '#mount-stats', 'Mean'),
            median: await readout(page, '#mount-stats', 'Median'),
            sd: await readout(page, '#mount-stats', 'SD population')
        };
        t.check('count 8, mean 5, median 4.5, population SD 2', got.count === '8' && got.mean === '5' && got.median === '4.5' && got.sd === '2', JSON.stringify(got));
    });

    await t.step('Solver finds roots', async () => {
        await openPane(page, 'solver');
        await page.click('#sv-tab-equation');
        await page.fill('#sv-eq', 'x^2 = 2');
        await page.fill('#sv-min', '-3');
        await page.fill('#sv-max', '3');
        await page.press('#sv-eq', 'Enter');
        await page.waitForTimeout(400);
        const roots = await page.evaluate(() => [...document.querySelectorAll('#sv-panel-equation .sv-roots .readout-value')].map((n) => n.textContent));
        t.check('x^2 = 2 gives ±1.414213562', roots.length === 2 && /-1\.414213562/.test(roots[0].replace('−', '-')) && /^1\.414213562/.test(roots[1]), roots.join(' | '));
    });

    await t.step('Number theory: factors and bases', async () => {
        await openPane(page, 'numtheory');
        await page.fill('#nt-factor', '360');
        await page.press('#nt-factor', 'Enter');
        await page.waitForTimeout(300);
        const factors = await page.evaluate(() => [...document.querySelectorAll('#mount-numtheory .nt-expr .nt-p')]
            .map((p) => [...p.childNodes].filter((n) => !(n.classList && n.classList.contains('tb-sr'))).map((n) => n.textContent).join('')).join(' × '));
        t.check('360 factors as 2³ × 3² × 5', factors === '23 × 32 × 5', factors);
        const spoken = await page.evaluate(() => document.querySelector('#mount-numtheory .nt-expr .nt-p').textContent);
        t.check('an exponent is read as "to the power"', spoken === '2 to the power 3', spoken);
        await page.fill('#nt-base-10', '255');
        await page.waitForTimeout(250);
        const bases = await page.evaluate(() => ['#nt-base-2', '#nt-base-8', '#nt-base-16'].map((s) => document.querySelector(s).value));
        t.check('255 converts to binary, octal, and hex', bases.join(' ') === '11111111 377 FF', bases.join(' '));
    });

    await t.step('Percentages: X% of Y', async () => {
        await openPane(page, 'percent');
        await page.click('#pc-tab-of');
        await page.fill('#pc-of-p', '20');
        await page.fill('#pc-of-x', '150');
        await page.waitForTimeout(300);
        const answer = await page.evaluate(() => document.querySelector('#pc-panel-of .tc-answer-value').textContent);
        t.check('20% of 150 is 30', answer.trim() === '30', answer);
    });

    await t.step('Finance: loan payment', async () => {
        await openPane(page, 'finance');
        await page.click('#fn-tab-loan');
        await page.fill('#fn-loan-principal', '300000');
        await page.fill('#fn-loan-rate', '6.5');
        await page.fill('#fn-loan-years', '30');
        await page.waitForTimeout(400);
        const shown = await page.evaluate(() => document.querySelector('#fn-panel-loan .tc-answer-value').textContent);
        const api = await page.evaluate(() => {
            const loan = window.MoneyUI.loan();
            return loan ? Math.round(loan.payment * 100) / 100 : null;
        });
        t.check('a 30-year $300,000 loan at 6.5% costs $1,896.20 a month', api === 1896.2 && /1,896\.20/.test(shown), `${api} / ${shown}`);
    });

    await t.step('Settings: digits, degrees, theme', async () => {
        const values = await page.evaluate(() => [...document.querySelectorAll('input[name="theme-pref"]')].map((r) => r.value).join(','));
        t.check('Settings offers Light, Dark, System', values === 'light,dark,system', values);
        await page.click('#btn-settings');
        await page.waitForSelector('#modal-settings.is-open');
        const checked = await page.evaluate(() => (document.querySelector('input[name="theme-pref"]:checked') || {}).value);
        t.check('the saved Light choice is selected', checked === 'light', checked);
        for (let i = 0; i < 4; i++) await page.click('#modal-settings [data-stepper="precision"] [data-dir="down"]');
        await page.selectOption('#setting-angle', 'deg');
        await page.check('input[name="theme-pref"][value="dark"]');
        const preview = await page.evaluate(() => document.getElementById('precision-preview').textContent);
        t.check('the digits preview follows the stepper', preview === 'π shows as 3.14159', preview);
        await page.click('#btn-save-settings');
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => ({
            precision: window.State.settings().precision,
            angle: window.State.settings().angle,
            button: document.getElementById('btn-angle').textContent,
            pressed: document.getElementById('btn-angle').getAttribute('aria-pressed'),
            theme: document.documentElement.dataset.theme,
            saved: localStorage.getItem('toolman.theme'),
            third: window.State.evaluate().lines[4].display
        }));
        t.check('Save applies 6 digits and degrees; DEG shows pressed', after.precision === 6 && after.angle === 'deg'
            && after.button === 'DEG' && after.pressed === 'true', JSON.stringify(after));
        t.check('saving Dark paints and stores dark', after.theme === 'dark' && after.saved === 'dark', `${after.theme} / ${after.saved}`);
        await newLastLine(page);
        await page.keyboard.type('sin(90) + 1/3');
        await page.waitForTimeout(400);
        const deg = await lastLine(page);
        t.check('results follow the new settings', deg.display === '1.33333', deg.display);

        await page.click('#btn-settings');
        await page.waitForSelector('#modal-settings.is-open');
        await page.check('input[name="theme-pref"][value="system"]');
        await page.click('#btn-save-settings');
        await page.waitForTimeout(300);
        const sys = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('toolman.theme')]);
        t.check('System follows the light device setting', sys[0] === 'light' && sys[1] === 'system', sys.join(' / '));

        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.keyboard.press('Control+Alt+d');
        await page.waitForTimeout(200);
        const rad = await page.evaluate(() => [window.State.settings().angle, document.getElementById('btn-angle').textContent]);
        t.check('Ctrl+Alt+D switches back to radians', rad[0] === 'rad' && rad[1] === 'RAD', rad.join(' / '));
    });

    await t.step('Everything is kept across a reload', async () => {
        const before = await page.evaluate(() => ({ sheets: window.State.sheets().map((x) => x.name), text: window.State.activeSheet().text }));
        await page.reload();
        await page.waitForFunction(() => !document.getElementById('loader-screen'), null, { timeout: 15000 });
        await page.waitForTimeout(300);
        await recordCopies(page);
        const after = await page.evaluate(() => ({
            sheets: window.State.sheets().map((x) => x.name),
            active: window.State.activeSheet(),
            history: window.State.history().length,
            precision: window.State.settings().precision,
            title: document.getElementById('sheet-title').value,
            cell: (document.querySelector('#mount-worksheet .ws-row[data-line="3"] .ws-val') || {}).textContent
        }));
        t.check('sheets, the open sheet, History, and settings survive a reload',
            JSON.stringify(after.sheets) === JSON.stringify(before.sheets) && after.active.name === 'Trip budget'
            && after.active.text === before.text && after.history === 1 && after.precision === 6 && after.title === 'Trip budget'
            && after.cell === '1,500', JSON.stringify({ ...after, active: after.active.name }));
    });

    await t.step('A heavy sheet never freezes typing', async () => {
        const first = await page.evaluate(() => {
            const text = ['fib(n) = if(n < 2, n, fib(n - 1) + fib(n - 2))']
                .concat(Array.from({ length: 600 }, (_, k) => `fib(${12 + (k % 8)}) + ${k}`)).join('\n');
            const t0 = performance.now();
            window.State.addSheet('Heavy', text);
            return { ms: performance.now() - t0, pending: window.State.result().pending };
        });
        await page.waitForTimeout(100);
        const working = await page.evaluate(() => document.querySelectorAll('#mount-worksheet .ws-pending').length);
        t.check('a slow sheet answers in slices, with "working…" rows meanwhile',
            first.ms < 400 && (first.pending === 0 || working > 0), `${Math.round(first.ms)} ms, ${first.pending} pending, ${working} working rows`);
        await page.waitForFunction(() => window.State.result().pending === 0, null, { timeout: 30000 });
        const edit = await page.evaluate(() => {
            const id = window.State.activeSheet().id;
            const t0 = performance.now();
            window.State.setSheetText(id, `${window.State.activeSheet().text}\nans + 1`);
            const r = window.State.evaluate();
            return { ms: performance.now() - t0, pending: r.pending, last: r.lines[r.lines.length - 1].display };
        });
        t.check('an edit re-works only the changed line', edit.ms < 150 && edit.pending === 0 && edit.last !== '', `${Math.round(edit.ms)} ms, last = ${edit.last}`);
        await page.evaluate(() => {
            const heavy = window.State.sheets().find((x) => x.name === 'Heavy');
            window.State.deleteSheet(heavy.id);
            window.State.setActiveSheet(window.State.sheets().find((x) => x.name === 'Trip budget').id);
        });
    });

    await t.step('Sheet names stay unique', async () => {
        await page.fill('#sheet-title', 'welcome');
        await page.press('#sheet-title', 'Enter');
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => ({ name: window.State.activeSheet().name, error: document.getElementById('sheet-title-error').textContent }));
        t.check('a name another sheet has is refused with a reason', r.name === 'Trip budget' && /already called/.test(r.error), JSON.stringify(r));
        await page.press('#sheet-title', 'Escape');
    });

    await t.step('Two tabs keep each other\'s sheets', async () => {
        const other = await page.context().newPage();
        await other.goto(page.url());
        await other.waitForFunction(() => !document.getElementById('loader-screen') && window.State, null, { timeout: 15000 });
        await other.evaluate(() => {
            window.State.addSheet('From tab two', 'answer = 42');
            window.Storage.save();
        });
        await page.waitForTimeout(400);
        const here = await page.evaluate(() => window.State.sheets().map((x) => x.name));
        await page.evaluate(() => window.Storage.save());
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toolman.mathman.state')).state.sheets.map((x) => x.name));
        await other.close();
        t.check('a sheet saved in another tab appears here and survives this tab\'s next save',
            here.includes('From tab two') && stored.includes('From tab two') && stored.includes('Trip budget'), stored.join(', '));
        await page.evaluate(() => {
            const extra = window.State.sheets().find((x) => x.name === 'From tab two');
            if (extra) window.State.deleteSheet(extra.id);
            window.State.setActiveSheet(window.State.sheets().find((x) => x.name === 'Trip budget').id);
        });
    });

    await t.step('No retired theme names on the page', async () => {
        const text = await page.evaluate(() => [document.body.textContent,
            ...[...document.querySelectorAll('[aria-label],[title],[placeholder]')].map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('placeholder') || ''}`)].join('\n'));
        t.check('no Parchment, Sentinel, Obsidian, or Dossier', !RETIRED.test(text), (text.match(RETIRED) || [''])[0]);
    });

    await t.shot(page, 'mathman-desktop');
    t.assertClean(s, 'mathMan desktop');
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

        await page.tap('#ws-input');
        await page.evaluate(() => {
            const ta = document.getElementById('ws-input');
            ta.setSelectionRange(ta.value.length, ta.value.length);
        });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        await page.evaluate(() => document.activeElement && document.activeElement.blur());

        await page.tap('#btn-mobile-right');
        await page.waitForTimeout(400);
        const drawer = await page.evaluate(() => {
            const r = document.getElementById('panel-tools').getBoundingClientRect();
            return [document.getElementById('btn-mobile-right').getAttribute('aria-expanded'), Math.round(r.left), Math.round(r.right)];
        });
        t.check('the Tools drawer slides in', drawer[0] === 'true' && drawer[1] >= 0 && drawer[2] <= 390, drawer.join(' / '));

        await openPane(page, 'keypad');
        for (const key of ['9', 'add', '1']) {
            await page.tap(`#mount-keypad [data-key="${key}"]`);
            await page.waitForTimeout(60);
        }
        await page.waitForTimeout(400);
        const l = await lastLine(page);
        const still = await page.evaluate(() => document.getElementById('btn-mobile-right').getAttribute('aria-expanded'));
        t.check('keypad taps type 9 + 1 into the sheet and the drawer stays open', l.source === '9 + 1' && l.display === '10' && still === 'true', `${JSON.stringify(l)} / ${still}`);
        const keyOverflow = await page.evaluate(() => {
            const r = document.querySelector('#mount-keypad').getBoundingClientRect();
            return Math.round(r.right);
        });
        t.check('the keypad fits inside the drawer', keyOverflow <= 390, `${keyOverflow}px`);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const closed = await page.evaluate(() => document.getElementById('btn-mobile-right').getAttribute('aria-expanded'));
        t.check('Escape closes the drawer', closed === 'false', closed);

        await page.tap('#btn-mobile-left');
        await page.waitForTimeout(400);
        const left = await page.evaluate(() => {
            const r = document.getElementById('panel-library').getBoundingClientRect();
            return [document.getElementById('btn-mobile-left').getAttribute('aria-expanded'), Math.round(r.left), Math.round(r.right)];
        });
        t.check('the Library drawer slides in', left[0] === 'true' && left[1] >= 0 && left[2] <= 390, left.join(' / '));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        t.check('still no sideways scroll after using the drawers', overflowAfter <= 0, `${overflowAfter}px`);
    });

    await t.shot(page, 'mathman-phone');
    t.assertClean(s, 'mathMan phone');
    await s.close();
}

export default async function mathman(t) {
    await desktop(t);
    await phone(t);
}
