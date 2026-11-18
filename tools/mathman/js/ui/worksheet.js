/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: WorksheetUI (mathMan Edition - v1.0)
 *     - File Name: worksheet.js
 *     - Relative Path: tools/mathman/js/ui/worksheet.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The worksheet editor in the center of mathMan and the Result card
 *     beside it. Visitors type one calculation per line in a plain text
 *     area; each line's answer appears in a results column that stays level
 *     with its line, and the Result card explains the line the caret is on.
 *     It keeps typing fast by evaluating through State on a short debounce.
 *
 * ✒ Key Features:
 *     - Monospace <textarea> (no wrapping, no spellcheck) with a line-number
 *       gutter and a results column that follow its scroll position exactly
 *     - Re-evaluates 120 ms after typing stops, at once on paste, on a new or
 *       removed line, when the editor loses focus, and before a Ctrl / Cmd
 *       shortcut, Copy all, or a sheet switch reads the results
 *     - Results are real buttons: click, Enter, or Space copies the plain
 *       value with its unit; arrow keys move between them (one Tab stop)
 *     - Exact fractions as a muted suffix when the decimal is rounded or the
 *       fraction is a half, quarter, eighth, or sixteenth
 *     - Errors show a "⚠ Error" marker with the message on hover and focus,
 *       a wavy underline under the faulty part of the line, and a jump to it
 *     - Current-line band and gutter highlight; "Ln, Col" status under the
 *       editor; clicking a line number selects that line
 *     - Result card: the line's value large, its label and kind, the exact
 *       fraction, copy buttons (value, with unit, fraction), Add to History,
 *       error explanations, and plain notes for headings, notes, and blanks
 *     - Selection summary for several selected lines: count, sum, and mean,
 *       converting compatible units to the first line's unit, or a clear
 *       note when the units cannot be added
 *     - Ctrl+/ comment toggle that keeps the browser's undo history
 *     - Remembers the caret and scroll position of each sheet while the page
 *       is open; saves pending typing when the sheet changes or the tab hides
 *     - Copy all: the whole sheet with each line's result, ready to paste
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js and before js/app.js. app.js calls
 *     WorksheetUI.init() once through ToolApp.boot(); the module renders
 *     into #mount-worksheet, #mount-result, and #actions-worksheet and keeps
 *     them current from State events. Other panes send text to the sheet
 *     with WorksheetUI.insert() (at the caret) or WorksheetUI.appendLine()
 *     (a new last line). app.js owns the keyboard shortcuts and calls
 *     currentResult(), selectionSummary(), focus(), and toggleComment().
 *
 * ✒ Examples:
 *     WorksheetUI.init()                    → builds the editor and the Result card
 *     WorksheetUI.insert('sqrt(')           → typed at the caret, selection replaced, editor focused
 *     WorksheetUI.insert('7', { focus: false })   → typed at the caret without moving focus
 *     WorksheetUI.appendLine('15% of 80')   → new last line, evaluated; returns its LineResult (display '12')
 *     WorksheetUI.currentResult()           → the LineResult under the caret (cheap; safe on every caret move)
 *     WorksheetUI.currentResult({ fresh: true })  → the same, after evaluating typing still waiting on the debounce
 *     WorksheetUI.selectionSummary()        → { count: 3, sum: 1830, mean: 610, unit: '' } or null
 *     WorksheetUI.toggleComment()           → '// ' added to (or removed from) the selected lines
 *     WorksheetUI.goToLine(16)              → caret at the end of line 16, scrolled into view
 *     WorksheetUI.focus()                   → focuses the editor (closing a phone drawer first)
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/engine.js (MathEngine, for
 *       unit conversion in selection sums), shared/js/dom.js, toolapp.js,
 *       toolman.js, workbench.js
 *     - Compatible platforms: all evergreen browsers; the line alignment
 *       relies on wrap="off" and a fixed line height
 *     - Limitations: very long lines scroll sideways rather than wrapping;
 *       the browser's undo history restarts when another sheet is opened or
 *       a tool appends a line; the stat pills under the stage are drawn by
 *       app.js from selectionSummary()
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const EVAL_DELAY = 120;
    const MAX_MARKS = 200;
    const MAX_LINES = (window.MathEngine && MathEngine.limits && MathEngine.limits.lines) || 2000;
    const MAX_CHARS = (window.State && State.LIMITS && State.LIMITS.sheetChars) || 200000;

    const PLACEHOLDER = [
        'Type one calculation per line, for example:',
        '2 + 2',
        'Rent: 1200',
        '5 km to mi',
        '15% of 80'
    ].join('\n');

    const KIND_BADGE = {
        value: ['Value', 'brand'],
        assignment: ['Variable', 'brand'],
        function: ['Function', 'info'],
        error: ['Error', 'fail'],
        comment: ['Note', ''],
        heading: ['Heading', ''],
        blank: ['Blank line', '']
    };

    const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const HISTORY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v5h5"></path><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path><path d="M12 7v5l4 2"></path></svg>';
    const TARGET_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle></svg>';

    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const plural = (n, word, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function shorten(text, max = 40) {
        const s = String(text);
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    function btn(className, text, attrs = {}) {
        return DOM.create('button', { className, text, attrs: Object.assign({ type: 'button' }, attrs) });
    }

    function iconBtn(className, icon, text, attrs = {}) {
        const b = DOM.create('button', { className, html: icon, attrs: Object.assign({ type: 'button' }, attrs) });
        b.appendChild(DOM.create('span', { text }));
        return b;
    }

    /* ── Text helpers (pure) ───────────────────────────────── */

    /** 0-based line index of a character offset. */
    function lineOf(text, offset) {
        let n = 0;
        for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) n++;
        return n;
    }

    /** Character offset where 0-based line `index` starts (text length when past the end). */
    function lineStart(text, index) {
        let pos = 0;
        for (let n = 0; n < index; n++) {
            const nl = text.indexOf('\n', pos);
            if (nl === -1) return text.length;
            pos = nl + 1;
        }
        return pos;
    }

    function lineEnd(text, start) {
        const nl = text.indexOf('\n', start);
        return nl === -1 ? text.length : nl;
    }

    function countLines(text) {
        let n = 1;
        for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
        return n;
    }

    /** Text from outside the editor: LF line endings, no control characters except tab and newline. */
    function cleanInput(text) {
        if (text === null || text === undefined) return '';
        // eslint-disable-next-line no-control-regex
        return String(text).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
    }

    const hasValue = (l) => Boolean(l) && (l.kind === 'value' || l.kind === 'assignment') && Boolean(l.display || l.plain);

    /** The plain value without its unit ('1234.5 km' → '1234.5'). */
    function valueOnly(l) {
        const p = String(l.plain || l.display || '');
        if (l.unit && p.endsWith(` ${l.unit}`)) return p.slice(0, -(l.unit.length + 1));
        return p;
    }

    /**
     * The exact fraction worth showing in the narrow results column: only
     * when the decimal is rounded (a repeating decimal) or the fraction is a
     * half, quarter, eighth, or sixteenth. The Result card always shows it.
     */
    function columnFraction(l) {
        const ex = l && l.exact ? String(l.exact) : '';
        if (!ex) return '';
        const frac = ex.split(' ')[0];
        const m = /^-?(\d+)\/(\d+)$/.exec(frac);
        if (!m || frac.length > 15) return '';
        let d = Number(m[2]);
        if (!Number.isSafeInteger(d) || d < 2) return '';
        if (d === 2 || d === 4 || d === 8 || d === 16) return frac;
        while (d % 2 === 0) d /= 2;
        while (d % 5 === 0) d /= 5;
        return d === 1 ? '' : frac;
    }

    /** "area(r)" from a function definition line. */
    function functionHead(source) {
        const s = String(source || '');
        const eq = s.indexOf('=');
        const head = (eq === -1 ? s : s.slice(0, eq)).replace(/^[^:]*:\s*(?=\S+\s*\()/, '').trim();
        return shorten(head || 'function', 40);
    }

    /* ── Module state ──────────────────────────────────────── */

    const el = {};
    const S = {
        loadedId: null,
        pending: false,
        timer: 0,
        pasteNext: false,
        writing: false,
        result: null,
        lineCount: 1,
        caretLine: 0,
        caretCol: 0,
        activeLine: 0,
        activeSource: 'caret',
        rowKeys: [],
        btnLines: [],
        roving: -1,
        carets: new Map(),
        initialCaret: false,
        metrics: { lh: 24, pt: 8 },
        frame: 0,
        cardKey: '',
        tipFor: null,
        warnedLines: false
    };

    /* ── DOM construction ──────────────────────────────────── */

    function build() {
        const mount = DOM.id('mount-worksheet');
        if (!mount) return false;
        DOM.empty(mount);

        const wrap = DOM.create('div', { className: 'ws-wrap' });
        const ws = DOM.create('div', { className: 'ws' });
        const band = DOM.create('div', { className: 'ws-band', attrs: { 'aria-hidden': 'true' } });

        const gutter = DOM.create('div', { className: 'ws-gutter', attrs: { 'aria-hidden': 'true', title: 'Click a line number to select that line' } });
        const gutterInner = DOM.create('div', { className: 'ws-gutter-inner' });
        gutter.appendChild(gutterInner);

        const editor = DOM.create('div', { className: 'ws-editor' });
        const marks = DOM.create('div', { className: 'ws-marks', attrs: { 'aria-hidden': 'true' } });
        const marksInner = DOM.create('div', { className: 'ws-marks-inner' });
        marks.appendChild(marksInner);
        const ta = DOM.create('textarea', {
            className: 'ws-input',
            id: 'ws-input',
            attrs: {
                'aria-label': 'Worksheet',
                'aria-describedby': 'ws-desc',
                wrap: 'off',
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
                autocorrect: 'off',
                translate: 'no',
                'data-gramm': 'false'
            }
        });
        ta.placeholder = PLACEHOLDER;
        editor.append(marks, ta);

        const results = DOM.create('div', {
            className: 'ws-results',
            attrs: { role: 'group', 'aria-label': 'Line results — arrow keys move between them, Enter copies' }
        });
        const resultsInner = DOM.create('div', { className: 'ws-results-inner' });
        results.appendChild(resultsInner);

        ws.append(band, gutter, editor, results);

        const tip = DOM.create('div', { className: 'ws-tip', id: 'ws-tip', attrs: { role: 'tooltip' } });
        tip.hidden = true;

        const foot = DOM.create('div', { className: 'ws-foot' });
        const pos = DOM.create('span', { className: 'ws-pos', attrs: { 'aria-hidden': 'true' } });
        const hint = DOM.create('span', { className: 'ws-hint', text: 'Click a result to copy it · Ctrl + Enter adds it to History' });
        foot.append(pos, hint);

        const desc = DOM.create('span', { className: 'ws-sr', id: 'ws-desc' });

        wrap.append(ws, tip, foot, desc);
        mount.appendChild(wrap);

        Object.assign(el, { mount, wrap, ws, band, gutter, gutterInner, editor, marks, marksInner, ta, results, resultsInner, tip, foot, pos, desc });
        el.rows = [];
        el.lns = [];

        const actions = DOM.id('actions-worksheet');
        if (actions) {
            DOM.empty(actions);
            const copyAll = iconBtn('btn btn-ghost btn-sm ws-copy-all', COPY_ICON, 'Copy all', {
                title: 'Copy every line with its result, ready to paste into a message or document',
                'aria-label': 'Copy the whole sheet with each line’s result'
            });
            DOM.on(copyAll, 'click', () => copyAllLines(copyAll));
            actions.appendChild(copyAll);
        }

        el.card = DOM.id('mount-result');
        if (el.card) DOM.empty(el.card);
        return true;
    }

    /* ── Layout metrics and scroll sync ────────────────────── */

    function readMetrics() {
        if (!el.ta) return;
        const cs = getComputedStyle(el.ta);
        const lh = parseFloat(cs.lineHeight);
        const pt = parseFloat(cs.paddingTop);
        S.metrics.lh = Number.isFinite(lh) && lh > 0 ? lh : 24;
        S.metrics.pt = Number.isFinite(pt) ? pt : 8;
    }

    function syncScroll() {
        if (!el.ta) return;
        const st = el.ta.scrollTop;
        const sl = el.ta.scrollLeft;
        el.gutterInner.style.transform = `translateY(${-st}px)`;
        el.resultsInner.style.transform = `translateY(${-st}px)`;
        el.marksInner.style.transform = `translate(${-sl}px, ${-st}px)`;
        // Focus can scroll an overflow:hidden box; these must never move on their own.
        if (el.gutter.scrollTop) el.gutter.scrollTop = 0;
        if (el.results.scrollTop) el.results.scrollTop = 0;
        placeBand();
        if (S.tipFor) hideTip();
    }

    function placeBand() {
        const { lh, pt } = S.metrics;
        const top = pt + S.activeLine * lh - el.ta.scrollTop;
        const visible = top > -lh && top < el.ws.clientHeight;
        el.band.hidden = !visible;
        if (visible) el.band.style.transform = `translateY(${top}px)`;
    }

    /** Scroll the editor so 0-based line `i` is in view. */
    function ensureLineVisible(i) {
        const { lh, pt } = S.metrics;
        const ta = el.ta;
        const top = pt + i * lh;
        const view = ta.clientHeight;
        if (top - pt < ta.scrollTop) ta.scrollTop = Math.max(0, top - pt);
        else if (top + lh > ta.scrollTop + view) ta.scrollTop = top + lh - view + pt;
        syncScroll();
    }

    /* ── Gutter ────────────────────────────────────────────── */

    function syncGutter(n) {
        const inner = el.gutterInner;
        const lns = el.lns;
        if (lns.length !== n) {
            if (lns.length < n) {
                const frag = document.createDocumentFragment();
                for (let i = lns.length; i < n; i++) {
                    const d = DOM.create('div', { className: 'ws-ln', text: String(i + 1), data: { line: String(i) } });
                    lns.push(d);
                    frag.appendChild(d);
                }
                inner.appendChild(frag);
            } else {
                while (lns.length > n) lns.pop().remove();
            }
            el.ws.dataset.digits = String(String(n).length);
        }
        markGutterCurrent();
    }

    let gutterCurrent = null;
    function markGutterCurrent() {
        const d = el.lns[S.activeLine] || null;
        if (gutterCurrent === d) return;
        if (gutterCurrent) delete gutterCurrent.dataset.current;
        if (d) d.dataset.current = 'true';
        gutterCurrent = d;
    }

    /* ── Results column ────────────────────────────────────── */

    function rowKey(l) {
        if (!l) return '';
        if (hasValue(l)) return `v\u0000${l.display || l.plain}\u0000${columnFraction(l)}\u0000${l.plain}`;
        if (l.kind === 'function') return `f\u0000${functionHead(l.source)}`;
        if (l.kind === 'error') return `e\u0000${l.error ? l.error.message : ''}`;
        return '';
    }

    function fillRow(row, l, i) {
        DOM.empty(row);
        row.dataset.kind = l ? l.kind : 'blank';
        if (!l) return;
        const n = i + 1;
        if (hasValue(l)) {
            const display = l.display || l.plain;
            const frac = columnFraction(l);
            const b = DOM.create('button', {
                className: 'ws-res',
                attrs: {
                    type: 'button',
                    tabindex: '-1',
                    'data-line': String(i),
                    'aria-label': `Line ${n}${l.label ? ` (${l.label})` : ''}: ${display}${l.exact ? `, exactly ${l.exact}` : ''}. Press Enter to copy.`,
                    title: `${display}${l.exact ? `  (exactly ${l.exact})` : ''} — click to copy ${shorten(l.plain || display, 60)}`
                }
            });
            b.appendChild(DOM.create('span', { className: 'ws-val', text: display }));
            if (frac) b.appendChild(DOM.create('span', { className: 'ws-frac', text: frac }));
            row.appendChild(b);
        } else if (l.kind === 'function') {
            row.appendChild(DOM.create('span', {
                className: 'ws-fn',
                text: `ƒ ${functionHead(l.source)} defined`,
                attrs: { title: `Line ${n} defines ${functionHead(l.source)}; use it on a later line` }
            }));
        } else if (l.kind === 'error') {
            const msg = l.error && l.error.message ? l.error.message : 'This line could not be worked out';
            const b = DOM.create('button', {
                className: 'ws-res ws-err',
                attrs: {
                    type: 'button',
                    tabindex: '-1',
                    'data-line': String(i),
                    'aria-label': `Line ${n} has an error: ${msg}. Press Enter to select the problem in the worksheet.`
                }
            });
            b.append(
                DOM.create('span', { className: 'ws-err-glyph', text: '⚠', attrs: { 'aria-hidden': 'true' } }),
                DOM.create('span', { className: 'ws-err-word', text: 'Error' })
            );
            b.dataset.message = msg;
            row.appendChild(b);
        }
    }

    function renderRows() {
        const lines = S.result ? S.result.lines : [];
        const n = Math.max(S.lineCount, lines.length);
        syncGutter(S.lineCount);

        const rows = el.rows;
        if (rows.length < n) {
            const frag = document.createDocumentFragment();
            for (let i = rows.length; i < n; i++) {
                const r = DOM.create('div', { className: 'ws-row', data: { line: String(i) } });
                rows.push(r);
                S.rowKeys.push(null);
                frag.appendChild(r);
            }
            el.resultsInner.appendChild(frag);
        } else {
            while (rows.length > n) {
                rows.pop().remove();
                S.rowKeys.pop();
            }
        }

        const btnLines = [];
        for (let i = 0; i < n; i++) {
            const l = lines[i] || null;
            const key = rowKey(l);
            if (S.rowKeys[i] !== key) {
                fillRow(rows[i], l, i);
                S.rowKeys[i] = key;
            }
            if (l && (hasValue(l) || l.kind === 'error')) btnLines.push(i);
            if (el.lns[i]) {
                if (l && l.kind === 'error') el.lns[i].dataset.error = 'true';
                else delete el.lns[i].dataset.error;
            }
        }
        S.btnLines = btnLines;
        // Rows that kept their content keep their button: reset every Tab stop, then pick one.
        DOM.$$('.ws-res[tabindex="0"]', el.resultsInner).forEach((b) => { b.tabIndex = -1; });
        S.roving = -1;
        setRoving(S.activeLine);
        renderMarks(lines);
    }

    /** Make the result nearest to line `i` the results column's single Tab stop. */
    function setRoving(i) {
        const list = S.btnLines;
        let target = -1;
        if (list.length) {
            target = list.find((x) => x >= i);
            if (target === undefined) target = list[list.length - 1];
        }
        if (target === S.roving) return;
        const old = S.roving >= 0 && el.rows[S.roving] ? DOM.$('.ws-res', el.rows[S.roving]) : null;
        if (old) old.tabIndex = -1;
        S.roving = target;
        const next = target >= 0 && el.rows[target] ? DOM.$('.ws-res', el.rows[target]) : null;
        if (next) next.tabIndex = 0;
    }

    function focusResult(i) {
        const row = el.rows[i];
        const b = row ? DOM.$('.ws-res', row) : null;
        if (!b) return;
        ensureLineVisible(i);
        setRoving(i);
        b.focus({ preventScroll: true });
        syncScroll();
    }

    /* ── Error underlines ──────────────────────────────────── */

    function renderMarks(lines) {
        DOM.empty(el.marksInner);
        const { lh, pt } = S.metrics;
        let shown = 0;
        for (let i = 0; i < lines.length && shown < MAX_MARKS; i++) {
            const l = lines[i];
            if (!l || l.kind !== 'error' || !l.error) continue;
            const src = String(l.source || '');
            let { start, end } = l.error;
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > src.length || start > end) continue;
            if (src.length > 2000) continue;
            const hit = src.slice(start, end) || ' ';
            const mark = DOM.create('div', { className: 'ws-mark' });
            mark.style.top = `${pt + i * lh}px`;
            mark.append(
                DOM.create('span', { className: 'ws-mark-pre', text: src.slice(0, start) }),
                DOM.create('span', { className: 'ws-mark-hit', text: hit })
            );
            el.marksInner.appendChild(mark);
            shown++;
        }
    }

    /* ── Error tooltip ─────────────────────────────────────── */

    function showTip(b) {
        const msg = b && b.dataset.message;
        if (!msg) return;
        const tip = el.tip;
        tip.textContent = msg;
        tip.hidden = false;
        const wrapRect = el.wrap.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        const tr = tip.getBoundingClientRect();
        let top = r.bottom - wrapRect.top + 6;
        if (top + tr.height > wrapRect.height) top = r.top - wrapRect.top - tr.height - 6;
        top = Math.max(0, Math.min(top, wrapRect.height - tr.height));
        let left = r.right - wrapRect.left - tr.width;
        left = Math.max(0, Math.min(left, wrapRect.width - tr.width));
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
        b.setAttribute('aria-describedby', 'ws-tip');
        S.tipFor = b;
    }

    function hideTip() {
        if (S.tipFor) S.tipFor.removeAttribute('aria-describedby');
        S.tipFor = null;
        if (el.tip) el.tip.hidden = true;
    }

    /* ── Caret tracking ────────────────────────────────────── */

    function caretOffset() {
        const ta = el.ta;
        return ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
    }

    function scheduleCaret() {
        if (S.frame) return;
        S.frame = requestAnimationFrame(() => {
            S.frame = 0;
            updateCaret();
        });
    }

    function updateCaret() {
        if (!el.ta) return;
        const text = el.ta.value;
        const off = caretOffset();
        const line = lineOf(text, off);
        S.caretLine = line;
        S.caretCol = off - lineStart(text, line) + 1;
        if (S.activeSource === 'caret' && S.activeLine !== line) {
            S.activeLine = line;
            setRoving(line);
        }
        markGutterCurrent();
        placeBand();
        updateFoot();
        renderCard();
    }

    function selectedLineRange() {
        const ta = el.ta;
        if (!ta || ta.selectionStart === ta.selectionEnd) return null;
        const text = ta.value;
        let end = ta.selectionEnd;
        if (end > ta.selectionStart && text[end - 1] === '\n') end--;
        const first = lineOf(text, ta.selectionStart);
        const last = lineOf(text, end);
        return { first, last };
    }

    function updateFoot() {
        if (!el.pos) return;
        const range = selectedLineRange();
        let text = `Ln ${S.caretLine + 1}, Col ${S.caretCol}`;
        if (range && range.last > range.first) text += ` · ${range.last - range.first + 1} lines selected`;
        if (el.pos.textContent !== text) el.pos.textContent = text;
    }

    /* ── Evaluation (debounced through State) ──────────────── */

    function scheduleEval() {
        S.pending = true;
        clearTimeout(S.timer);
        S.timer = setTimeout(commit, EVAL_DELAY);
    }

    /** Store the editor's text in State; evaluate when it is the active sheet. */
    function commit(opts = {}) {
        clearTimeout(S.timer);
        S.timer = 0;
        if (!el.ta || !S.loadedId) {
            S.pending = false;
            return;
        }
        const wasPending = S.pending;
        S.pending = false;
        const id = S.loadedId;
        if (wasPending) {
            S.writing = true;
            const ok = State.setSheetText(id, el.ta.value);
            S.writing = false;
            if (!ok) return;
            const stored = State.sheet(id);
            if (stored && stored.text !== el.ta.value) {
                // State cut an over-long sheet: show what was kept.
                const caret = Math.min(el.ta.selectionEnd, stored.text.length);
                el.ta.value = stored.text;
                el.ta.setSelectionRange(caret, caret);
                S.lineCount = countLines(stored.text);
                syncGutter(S.lineCount);
                notify(State.lastError || 'The sheet was too long, so the end was left out.', 'warning', 5000);
            }
        }
        if (opts.evaluate === false) return;
        if (wasPending && State.activeSheet().id === id) State.evaluate();
    }

    /** Evaluate any typing that is still waiting on the debounce. */
    function flush() {
        if (S.pending) commit();
    }

    function onInput() {
        const n = countLines(el.ta.value);
        const linesChanged = n !== S.lineCount;
        S.lineCount = n;
        if (linesChanged) syncGutter(n);
        S.activeSource = 'caret';
        if (S.pasteNext || linesChanged) {
            S.pasteNext = false;
            S.pending = true;
            commit();
        } else {
            scheduleEval();
        }
        if (n > MAX_LINES && !S.warnedLines) {
            S.warnedLines = true;
            notify(`Only the first ${MAX_LINES.toLocaleString('en-US')} lines of a sheet are worked out. Move the rest to another sheet.`, 'warning', 5000);
        } else if (n <= MAX_LINES) {
            S.warnedLines = false;
        }
        scheduleCaret();
    }

    /* ── Loading sheets ────────────────────────────────────── */

    function rememberCaret() {
        if (!S.loadedId || !el.ta) return;
        S.carets.set(S.loadedId, {
            start: el.ta.selectionStart,
            end: el.ta.selectionEnd,
            top: el.ta.scrollTop,
            left: el.ta.scrollLeft
        });
    }

    function loadSheet(sheet) {
        if (!sheet || !el.ta) return;
        S.loadedId = sheet.id;
        S.pending = false;
        clearTimeout(S.timer);
        el.ta.value = sheet.text;
        S.lineCount = countLines(sheet.text);
        syncGutter(S.lineCount);
        const saved = S.carets.get(sheet.id);
        if (saved) {
            const len = sheet.text.length;
            el.ta.setSelectionRange(Math.min(saved.start, len), Math.min(saved.end, len));
            el.ta.scrollTop = saved.top;
            el.ta.scrollLeft = saved.left;
            S.initialCaret = false;
        } else {
            el.ta.setSelectionRange(0, 0);
            el.ta.scrollTop = 0;
            el.ta.scrollLeft = 0;
            S.initialCaret = true;
        }
        S.activeSource = 'caret';
        S.cardKey = '';
        syncScroll();
        updateCaret();
    }

    /** First visit to a sheet: put the caret at the end of its first value line. */
    function placeInitialCaret() {
        S.initialCaret = false;
        if (!S.result || document.activeElement === el.ta) return;
        const first = S.result.lines.find(hasValue);
        if (!first) return;
        const start = lineStart(el.ta.value, first.index);
        const end = lineEnd(el.ta.value, start);
        el.ta.setSelectionRange(end, end);
        S.activeLine = first.index;
        updateCaret();
    }

    /* ── Result card ───────────────────────────────────────── */

    function sourceWithoutComment(src) {
        const s = String(src || '');
        const i = s.indexOf('//');
        return (i === -1 ? s : s.slice(0, i)).trim();
    }

    function lineSourceAt(i) {
        const text = el.ta ? el.ta.value : '';
        const start = lineStart(text, i);
        return text.slice(start, lineEnd(text, start));
    }

    function cardSection(cls) {
        return DOM.create('div', { className: cls });
    }

    function copyButton(label, value, title) {
        const b = iconBtn('btn btn-secondary btn-sm rc-copy', COPY_ICON, label, { title });
        DOM.on(b, 'click', () => ToolApp.copy(value, shorten(value, 40), b));
        return b;
    }

    function addHistory(line) {
        const l = line || activeLineResult();
        if (!hasValue(l)) {
            notify('Put the caret on a line with a result first.', 'info', 2400);
            return null;
        }
        const expr = sourceWithoutComment(l.source) || l.display;
        const entry = State.pushHistory({ expr, display: l.display || l.plain, plain: l.plain || l.display });
        if (entry) notify(`Added to History: ${shorten(expr)} = ${shorten(entry.display)}`, 'success', 1800);
        else notify(State.lastError || 'Could not add that result to History.', 'warning', 3600);
        return entry;
    }

    function activeLineResult() {
        const lines = S.result ? S.result.lines : [];
        return lines[S.activeLine] || null;
    }

    /** Select the faulty part of an error line in the editor. */
    function selectError(i) {
        const lines = S.result ? S.result.lines : [];
        const l = lines[i];
        const text = el.ta.value;
        const start = lineStart(text, i);
        const end = lineEnd(text, start);
        let a = end;
        let b = end;
        if (l && l.error && Number.isInteger(l.error.start) && Number.isInteger(l.error.end)) {
            a = Math.min(end, start + l.error.start);
            b = Math.min(end, start + l.error.end);
        }
        S.activeSource = 'caret';
        el.ta.focus({ preventScroll: true });
        el.ta.setSelectionRange(a, b);
        ensureLineVisible(i);
        updateCaret();
    }

    function badge(kind) {
        const [word, tone] = has(KIND_BADGE, kind) ? KIND_BADGE[kind] : ['Line', ''];
        const b = DOM.create('span', { className: 'badge rc-kind', text: word });
        if (tone) b.dataset.tone = tone;
        return b;
    }

    function noteFor(l, i) {
        const n = i + 1;
        if (!l) return [`Line ${n} is empty.`, 'Type a calculation, like 2 + 2, 15% of 80, or 5 km to mi.'];
        switch (l.kind) {
            case 'blank':
                return [`Line ${n} is empty.`, 'Type a calculation, like 2 + 2, 15% of 80, or 5 km to mi. A blank line also ends the block that total adds up.'];
            case 'heading':
                return [`Line ${n} is a heading.`, 'Headings start with #. They also end the block above, so total below a heading adds only the lines under it.'];
            case 'comment':
                return l.label
                    ? [`Line ${n} is a label without a value.`, `Type a number or calculation after “${shorten(l.label, 30)}:” to give it one.`]
                    : [`Line ${n} is a note.`, 'mathMan skips everything after //. Press Ctrl + / to turn a note back into a calculation.'];
            default:
                return [`Line ${n} has no result.`, 'Put the caret on a line with a calculation.'];
        }
    }

    function renderValue(box, l) {
        const display = l.display || l.plain;
        const value = DOM.create('output', { className: 'rc-value', text: display, attrs: { title: display } });
        box.appendChild(value);

        const facts = DOM.create('div', { className: 'readout-list rc-facts' });
        const fact = (label, text, primary) => {
            const row = DOM.create('div', { className: 'readout' });
            if (primary) row.dataset.primary = 'true';
            row.append(
                DOM.create('span', { className: 'readout-label', text: label }),
                DOM.create('code', { className: 'readout-value', text })
            );
            facts.appendChild(row);
        };
        if (l.exact) fact('Exact', l.exact, true);
        const plain = String(l.plain || '');
        // Only when it says more than the display (all digits of a big number), not just no separators.
        if (plain && plain !== display.replace(/[, ]/g, '')) {
            fact('Digits', plain.length > 120 ? `${plain.slice(0, 117)}…` : plain);
        }
        const calc = sourceWithoutComment(l.source);
        // A labelled line ("Rent: 1200") shows only the calculation after the colon.
        if (calc) fact('Input', l.label && calc.includes(':') ? calc.slice(calc.indexOf(':') + 1).trim() : calc);
        box.appendChild(facts);

        const digits = (valueOnly(l).match(/\d/g) || []).length;
        if (digits > 40) {
            box.appendChild(DOM.create('p', {
                className: 'help-text rc-note',
                text: `The full value has ${digits.toLocaleString('en-US')} digits. Copy value copies every one of them.`
            }));
        }

        const actions = DOM.create('div', { className: 'rc-actions' });
        const only = valueOnly(l);
        actions.appendChild(copyButton('Copy value', only, `Copy ${shorten(only, 40)}${l.unit ? ' without the unit' : ''}`));
        if (l.unit) actions.appendChild(copyButton('With unit', l.plain || display, `Copy ${shorten(l.plain || display, 40)}`));
        if (l.exact) actions.appendChild(copyButton('Fraction', l.exact, `Copy the exact fraction ${shorten(l.exact, 40)}`));
        const hist = iconBtn('btn btn-ghost btn-sm rc-history', HISTORY_ICON, 'Add to History', {
            title: 'Save this calculation and its result to History (Ctrl+Enter)'
        });
        DOM.on(hist, 'click', () => addHistory(l));
        actions.appendChild(hist);
        box.appendChild(actions);
    }

    function renderError(box, l, i) {
        const msg = l.error && l.error.message ? l.error.message : 'This line could not be worked out.';
        box.appendChild(DOM.create('div', {
            className: 'tool-feedback rc-error',
            text: msg,
            attrs: { 'data-state': 'error' }
        }));
        const src = String(l.source || '');
        const e = l.error || {};
        if (src.trim() && src.length <= 2000) {
            const code = DOM.create('code', { className: 'rc-source' });
            if (Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end <= src.length && e.start <= e.end) {
                code.append(
                    document.createTextNode(src.slice(0, e.start)),
                    DOM.create('mark', { className: 'rc-mark', text: src.slice(e.start, e.end) || ' ', attrs: { title: 'The problem is here' } }),
                    document.createTextNode(src.slice(e.end))
                );
            } else {
                code.textContent = src;
            }
            box.appendChild(code);
        }
        const actions = DOM.create('div', { className: 'rc-actions' });
        const jump = iconBtn('btn btn-secondary btn-sm', TARGET_ICON, 'Show in worksheet', {
            title: `Select the part of line ${i + 1} that needs fixing`
        });
        DOM.on(jump, 'click', () => selectError(i));
        actions.appendChild(jump);
        box.appendChild(actions);
    }

    function renderFunction(box, l) {
        const head = functionHead(l.source);
        const fn = (S.result && S.result.functions || []).find((f) => f.index === l.index);
        const body = fn ? fn.body : sourceWithoutComment(String(l.source).slice(String(l.source).indexOf('=') + 1));
        box.appendChild(DOM.create('code', { className: 'rc-source', text: `${head} = ${body}` }));
        const sample = fn ? `${fn.name}(${fn.params.map((_, k) => String(k + 2)).join(', ')})` : head;
        box.appendChild(DOM.create('p', {
            className: 'rc-text',
            text: `Defines ${head}. Use it on any later line, for example ${sample}.`
        }));
    }

    function renderSelection(box, s) {
        const sec = cardSection('rc-sel');
        sec.appendChild(DOM.create('p', {
            className: 'section-label',
            text: `Selection · ${plural(s.count, 'value')} in ${plural(s.lines, 'line')}`
        }));
        if (s.sum === null) {
            sec.appendChild(DOM.create('div', {
                className: 'tool-feedback rc-sel-note',
                text: `These lines use units that can't be added together (${s.units.join(', ')}), so there is no sum. Select lines that measure the same thing.`,
                attrs: { 'data-state': 'warn' }
            }));
        } else {
            const unit = s.unit ? ` ${s.unit}` : '';
            const fmt = (n) => `${State.formatNumber(n)}${unit}`;
            const list = DOM.create('div', { className: 'stat-list rc-stats' });
            const block = (label, value, wide) => {
                const b = DOM.create('div', { className: `stat-block${wide ? ' stat-block--wide' : ''}` });
                b.append(
                    DOM.create('span', { className: 'stat-value', text: value }),
                    DOM.create('span', { className: 'stat-label', text: label })
                );
                list.appendChild(b);
            };
            block('Sum', fmt(s.sum), true);
            block('Mean', fmt(s.mean));
            block('Count', s.count.toLocaleString('en-US'));
            sec.appendChild(list);
            if (s.converted) {
                sec.appendChild(DOM.create('p', { className: 'help-text', text: `Lines in other units were converted to ${s.unit} first.` }));
            }
            const actions = DOM.create('div', { className: 'rc-actions' });
            const plainSum = `${State.formatNumber(s.sum, { thousands: 'none' })}${unit}`;
            actions.appendChild(copyButton('Copy sum', plainSum, `Copy ${plainSum}`));
            const add = btn('btn btn-ghost btn-sm', 'Add sum as a line', {
                title: 'Add a new last line with this sum'
            });
            DOM.on(add, 'click', () => appendLine(plainSum));
            actions.appendChild(add);
            sec.appendChild(actions);
        }
        box.appendChild(sec);
    }

    function renderCard(force) {
        const mount = el.card;
        if (!mount) return;
        const lines = S.result ? S.result.lines : [];
        const i = S.activeLine;
        const l = lines[i] || null;
        const sel = selectionSummary();
        const key = [i, rowKey(l), l ? l.source : lineSourceAt(i), l && l.label, l && l.exact,
            sel ? `${sel.count}|${sel.sum}|${sel.unit}|${sel.lines}` : '', S.lineCount].join('\u0001');
        if (!force && key === S.cardKey) return;
        S.cardKey = key;

        const box = DOM.create('div', { className: 'rc' });
        const head = DOM.create('div', { className: 'rc-head' });
        head.appendChild(DOM.create('span', {
            className: 'rc-line',
            text: `Line ${(i + 1).toLocaleString('en-US')} of ${S.lineCount.toLocaleString('en-US')}`
        }));
        head.appendChild(badge(l ? l.kind : 'blank'));
        if (l && l.label) head.appendChild(DOM.create('span', { className: 'rc-label', text: l.label, attrs: { title: `Label: ${l.label}` } }));
        box.appendChild(head);

        if (S.result && S.result.engineError && (!l || l.kind === 'error')) {
            box.appendChild(DOM.create('div', { className: 'tool-feedback', text: S.result.engineError, attrs: { 'data-state': 'error' } }));
        } else if (hasValue(l)) {
            renderValue(box, l);
        } else if (l && l.kind === 'error') {
            renderError(box, l, i);
        } else if (l && l.kind === 'function') {
            renderFunction(box, l);
        } else {
            const [title, text] = noteFor(l, i);
            const empty = DOM.create('div', { className: 'empty-state rc-empty' });
            empty.append(
                DOM.create('p', { className: 'empty-title', text: title }),
                DOM.create('p', { className: 'empty-text', text })
            );
            box.appendChild(empty);
        }

        if (sel) renderSelection(box, sel);

        // Keep focus on a card button that is about to be replaced.
        const focused = mount.contains(document.activeElement) ? document.activeElement.textContent : null;
        DOM.empty(mount);
        mount.appendChild(box);
        if (focused) {
            const again = DOM.$$('button', mount).find((b) => b.textContent === focused);
            if (again) again.focus({ preventScroll: true });
        }
        updateDescription(l, i);
    }

    function updateDescription(l, i) {
        if (!el.desc) return;
        let text = `Line ${i + 1}`;
        if (hasValue(l)) text += ` result: ${l.display || l.plain}`;
        else if (l && l.kind === 'error') text += ` has an error: ${l.error ? l.error.message : ''}`;
        else text += ' has no result';
        if (el.desc.textContent !== text) el.desc.textContent = text;
    }

    /* ── Copy all ──────────────────────────────────────────── */

    function copyAllLines(button) {
        flush();
        const lines = S.result ? S.result.lines : [];
        if (!lines.some((l) => l.source && l.source.trim())) {
            notify('This sheet is empty, so there is nothing to copy.', 'info', 2400);
            return;
        }
        const width = Math.min(48, lines.reduce((w, l) => Math.max(w, String(l.source || '').trimEnd().length), 0));
        const out = lines.map((l) => {
            const src = String(l.source || '').trimEnd();
            if (hasValue(l)) return `${src.padEnd(width)}  = ${l.plain || l.display}`;
            if (l.kind === 'error') return `${src.padEnd(width)}  ⚠ ${l.error ? l.error.message : 'error'}`;
            return src;
        }).join('\n');
        ToolApp.copy(out, `${plural(lines.length, 'line')} with results`, button);
    }

    /* ── Public actions ────────────────────────────────────── */

    function closeDrawer() {
        if (window.Workbench && Workbench.isMobile && Workbench.isMobile()) Workbench.setMobileOpen(null);
    }

    /** Replace [start, end) keeping the browser's undo history when it can. */
    function replaceRange(start, end, text) {
        const ta = el.ta;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(start, end);
        let done = false;
        try {
            done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
        } catch (_err) {
            done = false;
        }
        if (!done || ta.value.slice(start, start + text.length) !== text) {
            ta.setRangeText(text, start, end, 'end');
            onInput();
        }
    }

    /**
     * Type text at the caret, replacing any selection, then focus the
     * editor. opts.focus = false leaves focus where it is (no phone
     * keyboard, no drawer change); the browser's undo history then restarts.
     */
    function insert(text, opts = {}) {
        if (!el.ta) return false;
        const s = cleanInput(text);
        if (!s) return false;
        const ta = el.ta;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (ta.value.length - (end - start) + s.length > MAX_CHARS) {
            notify(`A sheet holds up to ${MAX_CHARS.toLocaleString('en-US')} characters, so that text was not added. Start a new sheet for it.`, 'warning', 4500);
            return false;
        }
        S.activeSource = 'caret';
        if (opts && opts.focus === false) {
            ta.setRangeText(s, start, end, 'end');
            onInput();
        } else {
            closeDrawer();
            replaceRange(start, end, s);
        }
        flush();
        ensureLineVisible(lineOf(ta.value, ta.selectionEnd));
        updateCaret();
        return true;
    }

    function appendLine(text) {
        if (!el.ta) return null;
        const s = cleanInput(text).replace(/^\n+|\n+$/g, '');
        if (!s.trim()) return null;
        flush();
        const ta = el.ta;
        const cur = ta.value;
        let next;
        if (!cur.trim()) next = s;
        else if (/\n[ \t]*$/.test(cur)) next = cur.replace(/[ \t]*$/, '') + s;
        else next = `${cur}\n${s}`;
        if (next.length > MAX_CHARS) {
            notify(`This sheet is full (${MAX_CHARS.toLocaleString('en-US')} characters). Start a new sheet to keep adding lines.`, 'warning', 4500);
            return null;
        }
        const lineCount = countLines(next);
        if (lineCount > MAX_LINES) {
            notify(`This sheet already has ${MAX_LINES.toLocaleString('en-US')} lines, the most mathMan works out. Start a new sheet to keep adding lines.`, 'warning', 4500);
            return null;
        }
        ta.value = next;
        ta.setSelectionRange(next.length, next.length);
        S.lineCount = lineCount;
        S.activeSource = 'caret';
        S.pending = true;
        commit();
        const index = lineCount - 1;
        ta.scrollTop = ta.scrollHeight;
        ensureLineVisible(index);
        updateCaret();
        const row = el.rows[index];
        if (row) {
            row.classList.remove('ws-row--new');
            void row.offsetWidth;
            row.classList.add('ws-row--new');
            setTimeout(() => row.classList.remove('ws-row--new'), 1200);
        }
        const lines = S.result ? S.result.lines : [];
        return lines[index] || null;
    }

    function focus() {
        if (!el.ta) return;
        closeDrawer();
        el.ta.focus();
        scheduleCaret();
    }

    /** The line the Result card follows: the caret's (worked out now) or a focused result's. */
    function currentLineIndex() {
        if (S.activeSource === 'caret' && el.ta) return lineOf(el.ta.value, caretOffset());
        return S.activeLine;
    }

    /**
     * The LineResult under the caret, or null. Cheap enough to call on every
     * caret move: typing still waiting on the debounce is not evaluated
     * unless opts.fresh is true (shortcuts flush it before they run).
     */
    function currentResult(opts = {}) {
        if (opts && opts.fresh) flush();
        const lines = S.result ? S.result.lines : [];
        return lines[currentLineIndex()] || null;
    }

    /** Move the caret to the end of 1-based line `n` and scroll it into view. */
    function goToLine(n) {
        if (!el.ta) return false;
        const i = Math.max(0, Math.min(Math.floor(Number(n)) - 1, S.lineCount - 1));
        if (!Number.isFinite(i)) return false;
        const text = el.ta.value;
        const start = lineStart(text, i);
        const end = lineEnd(text, start);
        closeDrawer();
        S.activeSource = 'caret';
        el.ta.focus({ preventScroll: true });
        el.ta.setSelectionRange(end, end);
        ensureLineVisible(i);
        updateCaret();
        return true;
    }

    /**
     * Sum and mean of the value lines touched by a selection that spans two
     * or more lines. Units are converted to the first value's unit when they
     * measure the same thing; otherwise sum and mean are null.
     */
    function selectionSummary() {
        const range = selectedLineRange();
        if (!range || range.last === range.first || !S.result) return null;
        const values = S.result.lines.slice(range.first, range.last + 1)
            .filter((l) => hasValue(l) && typeof l.numeric === 'number' && Number.isFinite(l.numeric));
        if (!values.length) return null;
        const unit = values[0].unit || '';
        const units = [];
        let sum = 0;
        let converted = false;
        let mixed = false;
        values.forEach((l) => {
            const u = l.unit || '';
            if (!units.includes(u || 'no unit')) units.push(u || 'no unit');
            if (mixed) return;
            if (u === unit) {
                sum += l.numeric;
                return;
            }
            if (!u || !unit || !window.MathEngine || !MathEngine.units) {
                mixed = true;
                return;
            }
            try {
                const v = MathEngine.units.convert(l.numeric, u, unit);
                if (!Number.isFinite(v)) throw new Error('not finite');
                sum += v;
                converted = true;
            } catch (_err) {
                mixed = true;
            }
        });
        const count = values.length;
        if (mixed || !Number.isFinite(sum)) {
            return { count, sum: null, mean: null, unit: null, units, lines: range.last - range.first + 1, converted: false };
        }
        return { count, sum, mean: sum / count, unit, units, lines: range.last - range.first + 1, converted };
    }

    /** Ctrl+/: add or remove '// ' at the start of every touched line. */
    function toggleComment() {
        if (!el.ta) return false;
        const ta = el.ta;
        const text = ta.value;
        const selStart = ta.selectionStart;
        const selEnd = ta.selectionEnd;
        let end = selEnd;
        if (end > selStart && text[end - 1] === '\n') end--;
        const blockStart = text.lastIndexOf('\n', selStart - 1) + 1;
        const blockEnd = lineEnd(text, end);

        const lines = text.slice(blockStart, blockEnd).split('\n');
        const filled = lines.filter((l) => l.trim());
        let next;
        if (!filled.length) {
            next = lines.map((l, i) => (i === 0 ? `${l}// ` : l)).join('\n');
        } else {
            const allNotes = filled.every((l) => /^\s*\/\//.test(l));
            next = lines.map((l) => {
                if (!l.trim()) return l;
                return allNotes ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.replace(/^(\s*)/, '$1// ');
            }).join('\n');
        }
        const firstDelta = next.split('\n')[0].length - lines[0].length;
        S.activeSource = 'caret';
        replaceRange(blockStart, blockEnd, next);
        if (selStart === selEnd) {
            const caret = Math.max(blockStart, selStart + firstDelta);
            ta.setSelectionRange(caret, caret);
        } else {
            ta.setSelectionRange(blockStart, blockStart + next.length);
        }
        S.pending = true;
        commit();
        updateCaret();
        return true;
    }

    /* ── Wiring ────────────────────────────────────────────── */

    function wireEditor() {
        const ta = el.ta;
        DOM.on(ta, 'input', onInput);
        DOM.on(ta, 'paste', () => { S.pasteNext = true; });
        DOM.on(ta, 'drop', () => { S.pasteNext = true; });
        DOM.on(ta, 'scroll', syncScroll);
        ['keyup', 'mouseup', 'select', 'focus'].forEach((evt) => DOM.on(ta, evt, () => {
            S.activeSource = 'caret';
            scheduleCaret();
        }));
        DOM.on(ta, 'keydown', (e) => {
            if (e.key === 'Escape' && S.tipFor) hideTip();
        });
        DOM.on(ta, 'blur', () => {
            commit();
            rememberCaret();
        });
        document.addEventListener('selectionchange', () => {
            if (document.activeElement === ta) scheduleCaret();
        });

        // Line numbers: click selects the line (mouse convenience; keyboard users use Home / Shift+End).
        DOM.on(el.gutter, 'mousedown', (e) => {
            const ln = e.target.closest('.ws-ln');
            if (!ln) return;
            e.preventDefault();
            const i = Number(ln.dataset.line);
            const text = ta.value;
            const start = lineStart(text, i);
            const end = lineEnd(text, start);
            S.activeSource = 'caret';
            ta.focus({ preventScroll: true });
            ta.setSelectionRange(start, end < text.length ? end + 1 : end);
            updateCaret();
        });

        // Results column: click copies, arrows move, Escape returns to the line.
        DOM.on(el.results, 'click', (e) => {
            const b = e.target.closest('.ws-res');
            if (!b) return;
            const i = Number(b.dataset.line);
            const l = S.result ? S.result.lines[i] : null;
            if (!l) return;
            if (l.kind === 'error') {
                selectError(i);
                return;
            }
            const text = l.plain || l.display;
            ToolApp.copy(text, `${shorten(text, 32)} (line ${i + 1})`, b);
        });
        DOM.on(el.results, 'keydown', (e) => {
            const b = e.target.closest('.ws-res');
            if (!b) return;
            const i = Number(b.dataset.line);
            const list = S.btnLines;
            const k = list.indexOf(i);
            let to = null;
            if (e.key === 'ArrowDown') to = list[Math.min(list.length - 1, k + 1)];
            else if (e.key === 'ArrowUp') to = list[Math.max(0, k - 1)];
            else if (e.key === 'Home') to = list[0];
            else if (e.key === 'End') to = list[list.length - 1];
            else if (e.key === 'Escape') {
                e.preventDefault();
                hideTip();
                goToLine(i + 1);
                return;
            } else {
                return;
            }
            e.preventDefault();
            if (to !== undefined && to !== null) focusResult(to);
        });
        DOM.on(el.results, 'focusin', (e) => {
            const b = e.target.closest('.ws-res');
            if (!b) return;
            const i = Number(b.dataset.line);
            S.activeSource = 'result';
            S.activeLine = i;
            setRoving(i);
            markGutterCurrent();
            placeBand();
            renderCard();
            if (b.classList.contains('ws-err')) showTip(b);
        });
        DOM.on(el.results, 'focusout', (e) => {
            if (S.tipFor && S.tipFor === e.target) hideTip();
        });
        DOM.on(el.results, 'mouseover', (e) => {
            const b = e.target.closest('.ws-err');
            if (b && b !== S.tipFor) showTip(b);
        });
        DOM.on(el.results, 'mouseout', (e) => {
            const b = e.target.closest('.ws-err');
            if (b && !b.contains(e.relatedTarget) && document.activeElement !== b) hideTip();
        });
        [el.results, el.gutter].forEach((box) => DOM.on(box, 'scroll', () => {
            if (box.scrollTop) box.scrollTop = 0;
        }));

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                readMetrics();
                syncScroll();
            });
            ro.observe(el.ws);
        }
        window.addEventListener('resize', DOM.debounce(() => {
            readMetrics();
            renderMarks(S.result ? S.result.lines : []);
            syncScroll();
        }, 150));

        // A Ctrl / Cmd shortcut (copy result, add to History, comment…) reads
        // results: evaluate waiting typing first. Capture phase runs before
        // ToolApp's own keydown listener.
        window.addEventListener('keydown', (e) => {
            if (S.pending && (e.ctrlKey || e.metaKey) && e.key !== 'Control' && e.key !== 'Meta') commit();
        }, true);

        // Never lose typing that is still waiting on the debounce.
        window.addEventListener('pagehide', () => commit({ evaluate: false }));
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) commit({ evaluate: false });
        });
    }

    function subscribe() {
        State.on('reset', () => {
            clearTimeout(S.timer);
            S.pending = false;
            S.loadedId = null;
            S.carets.clear();
        });
        State.on('active', () => {
            if (S.loadedId) {
                if (S.pending) {
                    S.writing = true;
                    State.setSheetText(S.loadedId, el.ta.value);
                    S.writing = false;
                    S.pending = false;
                }
                rememberCaret();
            }
            hideTip();
            loadSheet(State.activeSheet());
        });
        State.on('text', (p = {}) => {
            if (S.writing || !p || p.id !== S.loadedId || S.pending) return;
            const sheet = State.sheet(p.id);
            if (!sheet || sheet.text === el.ta.value) return;
            const caret = Math.min(el.ta.selectionEnd, sheet.text.length);
            el.ta.value = sheet.text;
            el.ta.setSelectionRange(caret, caret);
            S.lineCount = countLines(sheet.text);
            syncGutter(S.lineCount);
        });
        State.on('results', (p = {}) => {
            if (!p.result) return;
            if (p.sheetId && p.sheetId !== S.loadedId) loadSheet(State.activeSheet());
            S.result = p.result;
            renderRows();
            if (S.initialCaret) placeInitialCaret();
            S.cardKey = '';
            updateCaret();
            syncScroll();
        });
    }

    /* ── Init ──────────────────────────────────────────────── */

    function init() {
        if (!window.State || !build()) return;
        readMetrics();
        wireEditor();
        subscribe();
        loadSheet(State.activeSheet());
        S.result = State.result();
        renderRows();
        if (S.initialCaret) placeInitialCaret();
        renderCard(true);
        syncScroll();
        // Fonts can settle after first paint; re-measure once they have.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                readMetrics();
                renderMarks(S.result ? S.result.lines : []);
                syncScroll();
            }).catch(() => {});
        }
    }

    window.WorksheetUI = {
        init,
        insert,
        appendLine,
        focus,
        currentResult,
        selectionSummary,
        toggleComment,
        goToLine,
        flush,
        addToHistory: () => addHistory(currentResult({ fresh: true })),
        /** Pure helpers, exposed for tests. */
        _lineOf: lineOf,
        _columnFraction: columnFraction
    };
})();
