/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StatsUI (mathMan Edition - v1.0)
 *     - File Name: stats.js
 *     - Relative Path: tools/mathman/js/ui/stats.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Statistics pane in the Tools rail: paste a list of numbers or a
 *     spreadsheet column, or take the results of lines selected in the
 *     worksheet, and it shows the usual summary figures and a histogram.
 *     Use it to describe a data set quickly and send the summary back to
 *     the sheet as labelled lines.
 *
 * ✒ Key Features:
 *     - Data box that reads commas, spaces, tabs, semicolons, and new lines;
 *       quoted CSV cells, currency signs, and % are understood
 *     - A live note under the box: how many values were read, how many
 *       entries were skipped and which, and when the 100,000-value cap cut
 *       the data short
 *     - A paste larger than the box holds (600,000 characters) or than the
 *       statistics use (100,000 numbers) is cut before it lands, with a
 *       note saying how much was left out, so a huge paste never freezes
 *       the page
 *     - Column picker that appears when the paste looks like a table with
 *       several columns (headers are used as the names)
 *     - "Use selected lines" takes the numeric results of the worksheet
 *       lines under the selection (through WorksheetUI.selectedLines()),
 *       converting compatible units to the first line's unit; a line shown
 *       as a percentage (0.35 to %) counts as its value, 0.35
 *     - Readouts with copy buttons: count, sum, mean, median, modes, min,
 *       max, range, sample and population variance and standard deviation,
 *       Q1, Q3, IQR, and outliers; each label explains itself on hover
 *     - Histogram drawn as SVG from theme tokens (it follows Light / Dark),
 *       with a text summary for screen readers, a bins picker (auto, 5, 10,
 *       20, 50), and an expandable table of bin counts
 *     - "Send summary to sheet" appends a heading and labelled lines that
 *       the worksheet evaluates
 *     - Data (up to 15,000 characters), column, and bins are remembered per
 *       browser through State.pane('stats'); Clear asks first
 *     - Numbers follow the visitor's digits, notation, and separator
 *       settings and re-format when those settings change
 *
 * ✒ Usage Instructions:
 *     Load after js/numerics.js, js/state.js, and js/ui/worksheet.js, before
 *     js/app.js. app.js calls StatsUI.init() once through ToolApp.boot();
 *     the module renders into #mount-stats and keeps itself current from
 *     State events ('settings', 'reset', and 'panes' after a backup
 *     import).
 *
 * ✒ Examples:
 *     StatsUI.init()                       → builds the pane inside #mount-stats
 *     StatsUI.setData('2 4 4 4 5 5 7 9')   → mean 5, population SD 2
 *     StatsUI.useSelection()               → fills the box from the worksheet selection
 *     StatsUI.summary()                    → the current Numerics.stats() result, or null
 *     StatsUI.sendSummary()                → appends "# Statistics of 8 values" and labelled lines
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/numerics.js (Numerics), js/state.js (State),
 *       js/engine.js (MathEngine.units, for unit conversion of selected
 *       lines), js/ui/worksheet.js (WorksheetUI, optional), shared/js/dom.js,
 *       toolapp.js, toolman.js, dialogs.js; css/tools-b.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: data longer than 15,000 characters is used but not
 *       remembered after a reload; the histogram shows at most 100 bins
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'stats';
    const KEEP_CHARS = 15000;
    // The data box holds at most 600,000 characters (laying out more text
    // than that stalls the page for most of a second); a bigger paste is
    // cut there, or at the first PASTE_VALUES numbers (the most the
    // statistics use), before it reaches the box.
    const INPUT_MAX = 600000;
    const PASTE_VALUES = 100000;
    const BIN_CHOICES = ['auto', '5', '10', '20', '50'];
    const LIST_SHOWN = 8;
    const EXAMPLE = '72, 85, 90, 66, 85, 78, 92, 88, 85, 70, 95, 61, 79, 84, 99, 45';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        lines: svg('<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>'),
        send: svg('<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>')
    };

    /* Readout rows: key, label, the words used in copy toasts, hover help. */
    const GROUPS = [
        {
            title: 'Center',
            rows: [
                ['count', 'Count', 'count', 'How many numbers were read.'],
                ['sum', 'Sum', 'sum', 'All the values added together.'],
                ['mean', 'Mean', 'mean', 'The average: the sum divided by the count.'],
                ['median', 'Median', 'median', 'The middle value once the data is sorted (the average of the two middle values for an even count).'],
                ['modes', 'Mode', 'mode', 'The value or values that occur most often. There is no mode when no value repeats.']
            ]
        },
        {
            title: 'Spread',
            rows: [
                ['min', 'Min', 'minimum', 'The smallest value.'],
                ['max', 'Max', 'maximum', 'The largest value.'],
                ['range', 'Range', 'range', 'Max minus min.'],
                ['sdSample', 'SD sample', 'sample standard deviation', 'Sample standard deviation (divides by n − 1). Use it when the data is a sample of a larger group.'],
                ['sdPop', 'SD population', 'population standard deviation', 'Population standard deviation (divides by n). Use it when the data is the whole group.'],
                ['varSample', 'Var sample', 'sample variance', 'Sample variance: the sample standard deviation squared.'],
                ['varPop', 'Var population', 'population variance', 'Population variance: the population standard deviation squared.']
            ]
        },
        {
            title: 'Quartiles',
            rows: [
                ['q1', 'Q1', 'first quartile', 'First quartile: the median of the lower half of the sorted data (the middle value is left out of both halves when the count is odd).'],
                ['q3', 'Q3', 'third quartile', 'Third quartile: the median of the upper half of the sorted data.'],
                ['iqr', 'IQR', 'interquartile range', 'Interquartile range: Q3 minus Q1, the spread of the middle half of the data.'],
                ['outliers', 'Outliers', 'outliers', 'Values more than 1.5 × IQR below Q1 or above Q3 (Tukey’s fences).']
            ]
        }
    ];

    const els = {};
    const rows = Object.create(null);
    const copyValues = Object.create(null);
    let current = { parsed: null, stats: null, bins: [], layout: null, source: '' };
    let timer = 0;
    let layoutKey = '';

    /* ── Small helpers ─────────────────────────────────────── */

    const plural = (n, word, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;
    const hasNumerics = () => Boolean(window.Numerics && typeof Numerics.stats === 'function');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    /** A number as results are shown (digits, notation, separators from Settings). */
    function fmt(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        try { return State.formatNumber(n); } catch (_err) { return String(n); }
    }

    /** The same number without thousands separators, for copying and the sheet. */
    function plain(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '';
        try { return State.formatNumber(n, { thousands: 'none' }); } catch (_err) { return String(n); }
    }

    function copy(text, label, btn) {
        if (!text) return;
        if (window.ToolApp && typeof ToolApp.copy === 'function') ToolApp.copy(text, label, btn);
        else if (window.DOM && DOM.copyText) DOM.copyText(text);
    }

    function prefs() {
        const p = (window.State && State.pane(PANE)) || {};
        const column = Number.isInteger(p.column) && p.column >= 1 && p.column <= 50 ? p.column : 0;
        return {
            text: typeof p.text === 'string' ? p.text.slice(0, KEEP_CHARS) : '',
            bins: BIN_CHOICES.includes(p.bins) ? p.bins : 'auto',
            column
        };
    }

    function save(patch) {
        if (!window.State) return;
        if (!State.setPane(PANE, patch)) console.warn('[StatsUI] could not save pane preferences:', State.lastError);
    }

    function feedback(message, state) {
        els.feedback.textContent = message || '';
        if (message) els.feedback.dataset.state = state || 'info';
        else delete els.feedback.dataset.state;
    }

    /** Append lines to the active sheet (through the worksheet when it is there). */
    function sendToSheet(lines, what) {
        const text = lines.join('\n');
        if (window.WorksheetUI && typeof WorksheetUI.appendLine === 'function') {
            const res = WorksheetUI.appendLine(text);
            if (!res) return false;
            if (res.kind === 'error') notify(`Sent ${what}, but the last line shows an error: ${res.error.message}`, 'warning', 4500);
            else notify(`Sent ${what} to the sheet.`, 'success', 2200);
            return true;
        }
        const sheet = State.activeSheet();
        const next = sheet.text.trim() ? `${sheet.text.replace(/\s+$/, '')}\n${text}` : text;
        if (!State.setSheetText(sheet.id, next)) {
            notify(State.lastError || 'Could not add those lines to the sheet.', 'error', 4000);
            return false;
        }
        State.evaluate();
        notify(`Sent ${what} to the sheet.`, 'success', 2200);
        return true;
    }

    /* ── Build ─────────────────────────────────────────────── */

    function button(label, cls, title, icon) {
        return DOM.create('button', {
            className: cls,
            html: icon ? `${icon}<span></span>` : '',
            text: icon ? '' : label,
            attrs: { type: 'button', title }
        });
    }

    function labelButton(btn, label) {
        const span = btn.querySelector('span');
        if (span) span.textContent = label;
        return btn;
    }

    function buildReadouts(root) {
        els.results = DOM.create('div', { className: 'tb-results', attrs: { id: 'st-results' } });
        GROUPS.forEach((group) => {
            els.results.appendChild(DOM.create('h5', { className: 'section-label', text: group.title }));
            const list = DOM.create('div', { className: 'readout-list tb-readouts' });
            group.rows.forEach(([key, label, words, help]) => {
                const value = DOM.create('code', { className: 'readout-value', text: '—' });
                const btn = DOM.create('button', {
                    className: 'icon-action',
                    html: ICONS.copy,
                    attrs: { type: 'button', 'aria-label': `Copy the ${words}`, title: `Copy the ${words}` }
                });
                btn.addEventListener('click', () => copy(copyValues[key], `the ${words}`, btn));
                const row = DOM.create('div', {
                    className: 'readout',
                    children: [
                        DOM.create('span', { className: 'readout-label', text: label, attrs: { title: help } }),
                        value,
                        btn
                    ]
                });
                rows[key] = { row, value, btn };
                list.appendChild(row);
            });
            els.results.appendChild(list);
        });

        // Histogram
        const head = DOM.create('div', { className: 'tb-head' });
        head.appendChild(DOM.create('h5', { className: 'section-label', text: 'Histogram' }));
        els.bins = DOM.create('select', {
            className: 'select-input tb-select st-bins',
            attrs: { 'aria-label': 'Number of histogram bins', title: 'How many bars the histogram uses' }
        });
        BIN_CHOICES.forEach((b) => els.bins.appendChild(DOM.create('option', {
            text: b === 'auto' ? 'Auto bins' : `${b} bins`,
            attrs: { value: b }
        })));
        head.appendChild(els.bins);
        els.results.appendChild(head);

        els.hist = DOM.create('figure', { className: 'st-hist' });
        els.histSvg = document.createElementNS(SVG_NS, 'svg');
        els.histSvg.setAttribute('class', 'st-hist-svg');
        els.histSvg.setAttribute('role', 'img');
        els.histSvg.setAttribute('preserveAspectRatio', 'none');
        els.hist.appendChild(els.histSvg);
        els.histMin = DOM.create('span', { className: 'st-hist-edge' });
        els.histNote = DOM.create('span', { className: 'st-hist-note' });
        els.histMax = DOM.create('span', { className: 'st-hist-edge' });
        els.hist.appendChild(DOM.create('figcaption', {
            className: 'st-hist-axis',
            children: [els.histMin, els.histNote, els.histMax]
        }));
        els.results.appendChild(els.hist);

        els.binTable = DOM.create('tbody');
        const details = DOM.create('details', { className: 'tb-details' });
        details.appendChild(DOM.create('summary', { text: 'Bin counts' }));
        const table = DOM.create('table', { className: 'data-table' });
        const thead = DOM.create('thead');
        thead.appendChild(DOM.create('tr', {
            children: [
                DOM.create('th', { text: 'From', attrs: { scope: 'col' } }),
                DOM.create('th', { text: 'To', attrs: { scope: 'col' } }),
                DOM.create('th', { className: 'num', text: 'Count', attrs: { scope: 'col' } })
            ]
        }));
        table.appendChild(thead);
        table.appendChild(els.binTable);
        details.appendChild(DOM.create('div', { className: 'table-wrap tb-table', children: [table] }));
        els.results.appendChild(details);

        els.send = labelButton(button('', 'btn btn-primary btn-sm btn-block', 'Add a heading and labelled lines with these figures to the end of the sheet', ICONS.send), 'Send summary to sheet');
        els.results.appendChild(els.send);
        root.appendChild(els.results);
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'tb-pane st' });

        const field = DOM.create('div', { className: 'tb-field' });
        const head = DOM.create('div', { className: 'tb-head' });
        head.appendChild(DOM.create('label', { className: 'mini-label', text: 'Data', attrs: { for: 'st-data' } }));
        els.count = DOM.create('span', { className: 'tool-count', attrs: { title: 'Numbers read from the data box' } });
        head.appendChild(els.count);
        field.appendChild(head);
        els.data = DOM.create('textarea', {
            className: 'code-area st-data',
            attrs: {
                id: 'st-data',
                rows: '5',
                spellcheck: 'false',
                autocomplete: 'off',
                maxlength: String(INPUT_MAX),
                placeholder: 'Paste numbers: 4, 8, 15, 16, 23, 42 — or a column copied from a spreadsheet',
                'aria-describedby': 'st-meta'
            }
        });
        field.appendChild(els.data);
        els.meta = DOM.create('p', { className: 'tb-meta', attrs: { id: 'st-meta', role: 'status', 'aria-live': 'polite' } });
        field.appendChild(els.meta);
        root.appendChild(field);

        els.colWrap = DOM.create('div', { className: 'tb-field tb-field--inline' });
        els.colWrap.appendChild(DOM.create('label', { className: 'mini-label', text: 'Column', attrs: { for: 'st-column' } }));
        els.column = DOM.create('select', {
            className: 'select-input tb-select',
            attrs: { id: 'st-column', title: 'Which column of the pasted table to use' }
        });
        els.colWrap.appendChild(els.column);
        els.colWrap.hidden = true;
        root.appendChild(els.colWrap);

        const actions = DOM.create('div', { className: 'tb-actions' });
        els.useSel = labelButton(button('', 'btn btn-secondary btn-sm', 'Use the numeric results of the lines selected in the worksheet', ICONS.lines), 'Use selected lines');
        els.example = button('Example', 'btn btn-ghost btn-sm', 'Fill the box with a sample set of test scores');
        els.clear = button('Clear', 'btn btn-ghost btn-sm', 'Empty the data box');
        actions.appendChild(els.useSel);
        actions.appendChild(els.example);
        actions.appendChild(els.clear);
        root.appendChild(actions);

        els.feedback = DOM.create('div', { className: 'tool-feedback tb-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.feedback);

        els.empty = DOM.create('div', {
            className: 'empty-state tb-empty',
            children: [
                DOM.create('p', { className: 'empty-title', text: 'No numbers yet' }),
                DOM.create('p', {
                    className: 'empty-text',
                    text: 'Paste a list or a spreadsheet column above, or select lines in the worksheet and press Use selected lines.'
                })
            ]
        });
        root.appendChild(els.empty);

        buildReadouts(root);
        mount.appendChild(root);
        els.root = root;
    }

    /* ── Data in ───────────────────────────────────────────── */

    function selectedColumn() {
        if (els.colWrap.hidden) return 0;
        const v = Number(els.column.value);
        return Number.isInteger(v) && v >= 1 ? v : 0;
    }

    /** Show or hide the column picker for the pasted text's layout. */
    function syncColumns(layout) {
        const key = layout ? `${layout.delimiter}|${layout.headers.join('\u0001')}|${layout.count}` : '';
        if (key === layoutKey) return;
        layoutKey = key;
        DOM.empty(els.column);
        if (!layout) {
            els.colWrap.hidden = true;
            return;
        }
        els.column.appendChild(DOM.create('option', { text: 'All numbers', attrs: { value: '0' } }));
        layout.headers.forEach((h, i) => {
            const label = h ? `${i + 1} · ${h}` : `Column ${i + 1}`;
            const opt = DOM.create('option', { text: label, attrs: { value: String(i + 1) } });
            if (!layout.numeric[i]) opt.textContent = `${label} (no numbers)`;
            els.column.appendChild(opt);
        });
        const want = prefs().column;
        els.column.value = want && want <= layout.count ? String(want) : '0';
        els.colWrap.hidden = false;
    }

    function analyze() {
        timer = 0;
        if (!hasNumerics()) {
            feedback('The statistics library did not load. Reload the page to try again.', 'error');
            return;
        }
        const text = els.data.value;
        let layout = null;
        let parsed;
        try {
            layout = text.length > 2 ? Numerics.detectColumns(text) : null;
            syncColumns(layout);
            const column = selectedColumn();
            parsed = Numerics.parseNumberList(text, column && layout ? { column, delimiter: layout.delimiter } : {});
        } catch (err) {
            feedback(err && err.message ? err.message : 'That data could not be read.', 'error');
            return;
        }
        let stats = null;
        let bins = [];
        try {
            if (parsed.values.length) {
                stats = Numerics.stats(parsed.values);
                bins = Numerics.histogram(parsed.values, binChoice());
            }
        } catch (err) {
            feedback(err && err.message ? err.message : 'Those numbers could not be summarised.', 'error');
        }
        current = { parsed, stats, bins, layout, source: current.source };
        render();
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(analyze, els.data.value.length > 200000 ? 450 : 180);
    }

    function binChoice() {
        const v = els.bins.value;
        return v === 'auto' ? undefined : Number(v);
    }

    function persistText() {
        const text = els.data.value;
        save({ text: text.length <= KEEP_CHARS ? text : '' });
    }

    /** Put text in the data box and analyse it now. */
    function setData(text, source) {
        els.data.value = String(text === null || text === undefined ? '' : text).slice(0, INPUT_MAX);
        current.source = source || '';
        layoutKey = '\u0000';
        save({ column: 0 });
        persistText();
        feedback('');
        analyze();
    }

    /**
     * Where to cut pasted text so it keeps at most `max` numbers: after the
     * line holding the max-th entry (or right after that entry when the
     * list is one long line). Returns { cut }, with cut === -1 when nothing
     * needs cutting.
     */
    function pasteCut(text, max) {
        const re = /[^\s,;|]+/g;
        let entries = 0;
        let m;
        while ((m = re.exec(text))) {
            entries++;
            if (entries === max) {
                const end = m.index + m[0].length;
                const nl = text.indexOf('\n', end);
                const lineCut = nl === -1 ? text.length : nl;
                // A table row keeps its other columns; a one-line list stops at the entry.
                const cut = lineCut - end <= 2000 ? lineCut : end;
                return { cut: cut >= text.length ? -1 : cut };
            }
        }
        return { cut: -1 };
    }

    /** A paste bigger than the box can hold or the statistics use is cut before it lands. */
    function onPaste(e) {
        const data = e.clipboardData;
        if (!data) return;
        const text = data.getData('text/plain');
        if (!text || text.length <= 50000) return;
        const ta = els.data;
        const room = INPUT_MAX - (ta.value.length - (ta.selectionEnd - ta.selectionStart));
        let keep = text;
        const counted = pasteCut(text, PASTE_VALUES);
        if (counted.cut !== -1) keep = text.slice(0, counted.cut);
        if (keep.length > room) {
            const at = Math.max(keep.lastIndexOf('\n', room), keep.lastIndexOf(',', room), keep.lastIndexOf(' ', room));
            keep = keep.slice(0, Math.max(0, at));
        }
        if (keep.length === text.length) return;
        e.preventDefault();
        ta.setRangeText(keep, ta.selectionStart, ta.selectionEnd, 'end');
        current.source = '';
        persistText();
        // Work the numbers out in the next task, so the pasted text shows first.
        clearTimeout(timer);
        timer = setTimeout(analyze, 0);
        const dropped = text.length - keep.length;
        const kb = (n) => `${Math.max(1, Math.round(n / 1024)).toLocaleString('en-US')} KB`;
        feedback(`That paste was large, so only the first part was kept (${kb(keep.length)} of ${kb(text.length)}; ${kb(dropped)} left out). The statistics use at most ${PASTE_VALUES.toLocaleString('en-US')} numbers.`, 'warn');
    }

    /** Values of the worksheet lines under the selection, converted to the first unit. */
    const NO_SELECTION = 'Select the lines you want in the worksheet first (drag across them, or Shift+click), then press Use selected lines.';

    /** The selected worksheet lines: WorksheetUI.selectedLines(), or the textarea when that is missing. */
    function selectedWorksheetLines() {
        if (window.WorksheetUI && typeof WorksheetUI.selectedLines === 'function') {
            try {
                const sel = WorksheetUI.selectedLines();
                return sel ? sel : { error: NO_SELECTION };
            } catch (_err) { /* fall through to the textarea */ }
        }
        const ta = document.querySelector('#mount-worksheet textarea');
        const res = window.State ? State.result() : null;
        if (!ta || !res || !Array.isArray(res.lines)) return { error: 'The worksheet is not ready yet. Reload the page and try again.' };
        const text = ta.value;
        const start = ta.selectionStart;
        let end = ta.selectionEnd;
        if (start === end) return { error: NO_SELECTION };
        if (end > start && text[end - 1] === '\n') end--;
        const lineAt = (offset) => {
            let n = 0;
            for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) n++;
            return n;
        };
        const first = lineAt(start);
        const last = lineAt(end);
        return { first, last, lines: res.lines.slice(first, last + 1) };
    }

    function readSelection() {
        const sel = selectedWorksheetLines();
        if (sel.error) return sel;
        const { first, last } = sel;
        const picked = sel.lines
            .filter((l) => (l.kind === 'value' || l.kind === 'assignment') && typeof l.numeric === 'number' && Number.isFinite(l.numeric));
        if (!picked.length) {
            return { error: `The selected ${first === last ? 'line has' : 'lines have'} no numeric results. Select lines that show a number.` };
        }
        // A line shown as a percentage (0.35 to %) has numeric 35 for its value 0.35:
        // it counts as 0.35 unless every picked line is a percentage (then all stay in %).
        const allPct = picked.every((l) => l.percent);
        const valueOf = (l) => (l.percent && !allPct ? l.numeric / 100 : l.numeric);
        const unitOf = (l) => (l.percent ? (allPct ? '%' : '') : (l.unit || ''));
        const unit = unitOf(picked[0]);
        const values = [];
        let mismatched = 0;
        picked.forEach((l) => {
            const u = unitOf(l);
            if (u === unit) {
                values.push(valueOf(l));
                return;
            }
            try {
                if (!u || !unit || u === '%' || !window.MathEngine || !MathEngine.units) throw new Error('no unit');
                const v = MathEngine.units.convert(valueOf(l), u, unit);
                if (!Number.isFinite(v)) throw new Error('not finite');
                values.push(v);
            } catch (_err) {
                mismatched++;
            }
        });
        return { values, unit, first, last, mismatched };
    }

    function useSelection() {
        const sel = readSelection();
        if (sel.error) {
            feedback(sel.error, 'warn');
            return false;
        }
        const lineWords = sel.first === sel.last ? `line ${sel.first + 1}` : `lines ${sel.first + 1}–${sel.last + 1}`;
        const where = `${plural(sel.values.length, 'value')} from ${lineWords}${sel.unit ? ` (in ${sel.unit})` : ''}`;
        setData(sel.values.map((v) => String(v)).join('\n'), where);
        if (sel.mismatched) {
            feedback(`Took ${where}. Left out ${plural(sel.mismatched, 'line')} whose units can't be converted to ${sel.unit || 'plain numbers'}.`, 'warn');
        } else {
            feedback(`Took ${where}.`, 'success');
        }
        return true;
    }

    /* ── Render ────────────────────────────────────────────── */

    function listText(values, shown) {
        const head = values.slice(0, shown).map(fmt).join(', ');
        return values.length > shown ? `${head} … +${(values.length - shown).toLocaleString('en-US')} more` : head;
    }

    function setRow(key, display, copyText) {
        const r = rows[key];
        if (!r) return;
        r.value.textContent = display;
        copyValues[key] = copyText || '';
        r.btn.disabled = !copyText;
    }

    function renderMeta() {
        const p = current.parsed;
        const n = p ? p.values.length : 0;
        els.count.textContent = n ? n.toLocaleString('en-US') : '0';
        if (!els.data.value.trim()) {
            els.meta.textContent = 'Separate numbers with commas, spaces, tabs, or new lines.';
            return;
        }
        const parts = [plural(n, 'value')];
        if (p && p.skipped) {
            const samples = p.skippedSamples.map((s) => `'${s}'`).join(', ');
            parts.push(`skipped ${plural(p.skipped, 'entry', 'entries')} that ${p.skipped === 1 ? "isn't a number" : "aren't numbers"} (${samples}${p.skipped > p.skippedSamples.length ? ', …' : ''})`);
        }
        if (p && p.truncated) parts.push(`only the first ${p.limit.toLocaleString('en-US')} values are used`);
        if (els.data.value.length > KEEP_CHARS) parts.push('too long to remember after a reload');
        els.meta.textContent = `${parts.join(' · ')}.`;
    }

    function svgEl(tag, attrs) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs).forEach((k) => el.setAttribute(k, String(attrs[k])));
        return el;
    }

    function renderHistogram() {
        const bins = current.bins;
        const s = current.stats;
        while (els.histSvg.firstChild) els.histSvg.removeChild(els.histSvg.firstChild);
        DOM.empty(els.binTable);
        if (!bins.length || !s) return;
        const W = bins.length * 10;
        const H = 100;
        const top = Math.max(...bins.map((b) => b.count));
        els.histSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        els.histSvg.appendChild(svgEl('line', { class: 'st-hist-base', x1: 0, y1: H - 0.5, x2: W, y2: H - 0.5 }));
        let tallest = bins[0];
        bins.forEach((b, i) => {
            if (b.count > tallest.count) tallest = b;
            const h = top ? (b.count / top) * (H - 6) : 0;
            const rect = svgEl('rect', {
                class: b.count ? 'st-hist-bar' : 'st-hist-bar st-hist-bar--empty',
                x: i * 10 + 0.8,
                y: H - Math.max(h, b.count ? 1.5 : 0.6),
                width: 8.4,
                height: Math.max(h, b.count ? 1.5 : 0.6)
            });
            const title = svgEl('title', {});
            title.textContent = `${fmt(b.from)} to ${fmt(b.to)}: ${plural(b.count, 'value')}`;
            rect.appendChild(title);
            els.histSvg.appendChild(rect);

            els.binTable.appendChild(DOM.create('tr', {
                children: [
                    DOM.create('td', { className: 'mono', text: fmt(b.from) }),
                    DOM.create('td', { className: 'mono', text: fmt(b.to) }),
                    DOM.create('td', { className: 'num', text: b.count.toLocaleString('en-US') })
                ]
            }));
        });
        const first = bins[0];
        const last = bins[bins.length - 1];
        els.histMin.textContent = fmt(first.from);
        els.histMax.textContent = fmt(last.to);
        els.histNote.textContent = `${plural(bins.length, 'bin')} · tallest ${plural(tallest.count, 'value')}`;
        els.histSvg.setAttribute('aria-label', `Histogram of ${plural(s.count, 'value')} in ${plural(bins.length, 'bin')} from ${fmt(first.from)} to ${fmt(last.to)}. The tallest bar, ${fmt(tallest.from)} to ${fmt(tallest.to)}, holds ${plural(tallest.count, 'value')}.`);
    }

    function render() {
        if (!els.root) return;
        renderMeta();
        els.clear.disabled = !els.data.value;
        const s = current.stats;
        const has = Boolean(s && s.count);
        els.empty.hidden = has;
        els.results.hidden = !has;
        els.send.disabled = !has;
        if (!has) {
            if (els.data.value.trim() && current.parsed && !current.parsed.values.length) {
                els.empty.querySelector('.empty-title').textContent = 'No numbers found';
                els.empty.querySelector('.empty-text').textContent = 'Nothing in the box reads as a number. Use digits like 3.5 or -2, separated by commas, spaces, or new lines.';
            } else {
                els.empty.querySelector('.empty-title').textContent = 'No numbers yet';
                els.empty.querySelector('.empty-text').textContent = 'Paste a list or a spreadsheet column above, or select lines in the worksheet and press Use selected lines.';
            }
            return;
        }
        setRow('count', s.count.toLocaleString('en-US'), String(s.count));
        setRow('sum', fmt(s.sum), plain(s.sum));
        setRow('mean', fmt(s.mean), plain(s.mean));
        setRow('median', fmt(s.median), plain(s.median));
        if (s.modes.length) {
            const times = s.modes.length === 1 ? `${plural(s.modeFrequency, 'time')}` : `each ${plural(s.modeFrequency, 'time')}`;
            setRow('modes', `${listText(s.modes, LIST_SHOWN)} (${times})`, s.modes.map(plain).join(', '));
        } else {
            setRow('modes', 'None — no value repeats', '');
        }
        setRow('min', fmt(s.min), plain(s.min));
        setRow('max', fmt(s.max), plain(s.max));
        setRow('range', fmt(s.range), plain(s.range));
        if (s.stdev.sample === null) {
            setRow('sdSample', '— needs 2 or more values', '');
            setRow('varSample', '— needs 2 or more values', '');
        } else {
            setRow('sdSample', fmt(s.stdev.sample), plain(s.stdev.sample));
            setRow('varSample', fmt(s.variance.sample), plain(s.variance.sample));
        }
        setRow('sdPop', fmt(s.stdev.population), plain(s.stdev.population));
        setRow('varPop', fmt(s.variance.population), plain(s.variance.population));
        setRow('q1', fmt(s.q1), plain(s.q1));
        setRow('q3', fmt(s.q3), plain(s.q3));
        setRow('iqr', fmt(s.iqr), plain(s.iqr));
        if (s.outliers.length) {
            setRow('outliers', `${listText(s.outliers, LIST_SHOWN)} (${plural(s.outliers.length, 'value')})`, s.outliers.map(plain).join(', '));
        } else {
            setRow('outliers', `None — all within ${fmt(s.fences.low)} to ${fmt(s.fences.high)}`, '');
        }
        renderHistogram();
    }

    /* ── Send ──────────────────────────────────────────────── */

    function sendSummary() {
        const s = current.stats;
        if (!s || !s.count) {
            notify('There are no statistics to send yet — add some numbers first.', 'warning', 3000);
            return false;
        }
        const lines = [`# Statistics of ${plural(s.count, 'value')}`];
        const add = (label, n) => { if (typeof n === 'number' && Number.isFinite(n)) lines.push(`${label}: ${plain(n)}`); };
        add('Count', s.count);
        add('Sum', s.sum);
        add('Mean', s.mean);
        add('Median', s.median);
        if (s.modes.length === 1) add('Mode', s.modes[0]);
        add('Min', s.min);
        add('Max', s.max);
        add('Range', s.range);
        add('Sample std dev', s.stdev.sample);
        add('Population std dev', s.stdev.population);
        add('Q1', s.q1);
        add('Q3', s.q3);
        add('IQR', s.iqr);
        if (s.modes.length > 1) lines.push(`// Modes: ${s.modes.slice(0, 20).map(plain).join(', ')}${s.modes.length > 20 ? ', …' : ''}`);
        if (s.outliers.length) lines.push(`// Outliers: ${s.outliers.slice(0, 20).map(plain).join(', ')}${s.outliers.length > 20 ? ', …' : ''}`);
        return sendToSheet(lines, 'the statistics summary');
    }

    /* ── Wiring ────────────────────────────────────────────── */

    function wire() {
        els.data.addEventListener('input', () => {
            current.source = '';
            feedback('');
            persistText();
            schedule();
        });
        els.data.addEventListener('blur', () => { if (timer) { clearTimeout(timer); analyze(); } });
        els.data.addEventListener('paste', onPaste);
        els.column.addEventListener('change', () => {
            save({ column: selectedColumn() });
            analyze();
        });
        els.bins.addEventListener('change', () => {
            save({ bins: els.bins.value });
            analyze();
        });
        els.useSel.addEventListener('click', useSelection);
        els.example.addEventListener('click', () => {
            setData(EXAMPLE, 'example');
            feedback('Filled in 16 sample test scores. Edit them or paste your own.', 'info');
        });
        els.clear.addEventListener('click', async () => {
            if (!els.data.value) return;
            const n = current.parsed ? current.parsed.values.length : 0;
            const sure = n <= 3 || !window.Dialogs ? true : await Dialogs.confirm({
                title: 'Clear the data?',
                message: `This empties the data box (${plural(n, 'value')}). It can't be undone.`,
                confirmLabel: 'Clear data',
                danger: true
            });
            if (!sure) return;
            setData('', '');
            els.data.focus();
        });
        els.send.addEventListener('click', sendSummary);

        if (window.State) {
            State.on('settings', () => render());
            State.on('reset', () => load());
            // A backup import can fill in preferences this pane never had.
            State.on('panes', (e) => { if (e && e.action === 'import') load(); });
        }
    }

    function load() {
        const p = prefs();
        els.data.value = p.text;
        els.bins.value = p.bins;
        layoutKey = '\u0000';
        current = { parsed: null, stats: null, bins: [], layout: null, source: '' };
        feedback('');
        analyze();
    }

    const StatsUI = {
        init() {
            const mount = DOM.id('mount-stats');
            if (!mount || els.root) return;
            build(mount);
            wire();
            load();
        },

        /** Replace the data box text and analyse it. */
        setData(text) {
            if (!els.root) return null;
            setData(text, '');
            return StatsUI.summary();
        },

        /** Fill the data box from the worksheet selection; false (with a message) when there is none. */
        useSelection() {
            return els.root ? useSelection() : false;
        },

        /** The current Numerics.stats() result, or null when there is no data. */
        summary() {
            return current.stats && current.stats.count ? current.stats : null;
        },

        /** The current histogram bins. */
        bins() {
            return current.bins.slice();
        },

        sendSummary() {
            return els.root ? sendSummary() : false;
        }
    };

    window.StatsUI = StatsUI;
})();
