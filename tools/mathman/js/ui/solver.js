/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: SolverUI (mathMan Edition - v1.0)
 *     - File Name: solver.js
 *     - Relative Path: tools/mathman/js/ui/solver.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Solver pane in the Tools rail, with three modes: an equation in x
 *     solved numerically over a range, a polynomial of degree 1 to 8 with
 *     real and complex roots, and a linear system of 2 to 5 unknowns. Use it
 *     when a worksheet question needs "what x makes this true?" and send the
 *     answers back to the sheet as labelled lines.
 *
 * ✒ Key Features:
 *     - Mode tabs (Equation, Polynomial, Linear system) in a chip row with
 *       arrow-key navigation; the chosen mode is remembered
 *     - Equation: "left = right" in x (no "=" means "= 0"), compiled once
 *       with MathEngine.compile so the active sheet's functions and
 *       variables work; range ends accept expressions like -2pi
 *     - Equation results: every root in the range with copy buttons,
 *       stretches where both sides are equal, and plain guidance when
 *       there are no roots, the expression has no real value there, it
 *       takes too many steps to work out, or the search ran out of time
 *     - A slow equation (a heavy sheet function) is searched in short
 *       slices with a progress bar and Cancel, within the same 2-second
 *       budget, so the page never stalls
 *     - Polynomial: degree stepper, one labelled field per power (numbers or
 *       expressions like 1/3), a live preview of the equation, and roots as
 *       a or a ± bi with double / triple roots named
 *     - Linear system: unknowns stepper, a coefficient grid with a constants
 *       column, live equation previews, exact answers (fractions shown when
 *       the decimal repeats), and plain explanations of "no solution" and
 *       "infinitely many"
 *     - Example and Clear buttons in each mode; Clear asks first
 *     - "Send to sheet" appends a heading and Root / unknown lines that the
 *       worksheet evaluates (complex roots go in as notes)
 *     - Inputs and the mode are remembered per browser through
 *       State.pane('solver'); results re-format when settings change
 *
 * ✒ Usage Instructions:
 *     Load after js/engine.js, js/numerics.js, and js/state.js, before
 *     js/app.js. app.js calls SolverUI.init() once through ToolApp.boot();
 *     the module renders into #mount-solver. Enter in any field solves the
 *     current mode. The pane reloads its saved fields on State 'reset' and
 *     after a backup import ('panes' with action 'import').
 *
 * ✒ Examples:
 *     SolverUI.init()                                   → builds the pane inside #mount-solver
 *     SolverUI.setMode('poly')                          → shows the Polynomial tab
 *     SolverUI.solveEquation('x^2 = 2', -3, 3)          → [-1.414…, 1.414…]
 *     SolverUI.solvePolynomial([1, 0, 1])               → [{ re: 0, im: 1 }, { re: 0, im: -1 }]
 *     SolverUI.solveSystem([[1, 1], [1, -1]], [3, 1])   → { status: 'unique', solution: [2, 1], … }
 *     SolverUI.sendToSheet()                            → appends the shown answers to the sheet
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/numerics.js (Numerics.findRootsDetailed, polyRoots,
 *       solveLinear), js/engine.js (MathEngine.compile, evaluate),
 *       js/state.js (State), js/ui/worksheet.js (WorksheetUI, optional),
 *       shared/js/dom.js, toolapp.js, toolman.js, dialogs.js; css/tools-b.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the equation solver only finds roots the 2,000-point
 *       sample grid can bracket or touch, shows at most 50 of up to 200,
 *       and stops after 2 seconds; units are not allowed in the solver
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'solver';
    const MODES = [
        { id: 'equation', label: 'Equation', title: 'Solve an equation in x over a range' },
        { id: 'poly', label: 'Polynomial', title: 'Roots of a polynomial of degree 1 to 8' },
        { id: 'linear', label: 'Linear system', title: 'Solve 2 to 5 linear equations at once' }
    ];
    const MODE_IDS = MODES.map((m) => m.id);
    const NAMES = ['x', 'y', 'z', 'w', 'v'];
    const SUPERS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸'];
    const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const SHOWN_ROOTS = 50;
    const FIELD_MAX = 400;
    const EQ_MAX = 1000;
    const MULTIPLICITY = ['', '', 'double root', 'triple root'];
    // An equation search gets 2 s of work in all; slow ones run in short slices so the page never stalls.
    const SOLVE_MS = 2000;
    const FIRST_SLICE_MS = 40;
    const SLICE_MS = 25;

    const DEFAULTS = Object.freeze({
        mode: 'equation',
        eq: 'x^3 = 2x + 1',
        min: '-10',
        max: '10',
        degree: 2,
        coeffs: { 2: '1', 1: '-3', 0: '2' },
        unknowns: 3,
        // Stored rows hold five coefficient slots and the constant in slot 6.
        matrix: [['2', '1', '-1', '', '', '8'], ['-3', '-1', '2', '', '', '-11'], ['-2', '1', '2', '', '', '-3']]
    });

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        send: svg('<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>')
    };

    const els = { tabs: {}, panels: {}, coeffInputs: {}, cells: [] };
    const last = { equation: null, poly: null, linear: null };

    /* ── Small helpers ─────────────────────────────────────── */

    const plural = (n, word, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const sub = (n) => String(n).split('').map((d) => SUBS[Number(d)] || d).join('');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function fmt(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        try { return State.formatNumber(n); } catch (_err) { return String(n); }
    }

    function plain(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '';
        try { return State.formatNumber(n, { thousands: 'none' }); } catch (_err) { return String(n); }
    }

    /** Display form with a real minus sign. */
    const pretty = (s) => s.replace(/^-/, '−');

    function copy(text, label, btn) {
        if (!text) return;
        if (window.ToolApp && typeof ToolApp.copy === 'function') ToolApp.copy(text, label, btn);
        else if (window.DOM && DOM.copyText) DOM.copyText(text);
    }

    function engineOptions() {
        const o = window.State ? State.engineOptions() : {};
        return Object.assign({}, o, { notation: 'auto', fractions: 'auto' });
    }

    function sendLines(lines, what) {
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

    const cleanField = (v, fallback = '') => (typeof v === 'string' ? v.slice(0, FIELD_MAX) : fallback);

    /** Saved preferences, validated, with defaults filled in. */
    function prefs() {
        const p = (window.State && State.pane(PANE)) || {};
        const degree = Number.isInteger(p.degree) ? clamp(p.degree, 1, 8) : DEFAULTS.degree;
        const unknowns = Number.isInteger(p.unknowns) ? clamp(p.unknowns, 2, 5) : DEFAULTS.unknowns;
        const coeffs = {};
        const src = p.coeffs && typeof p.coeffs === 'object' && !Array.isArray(p.coeffs) ? p.coeffs : DEFAULTS.coeffs;
        for (let k = 0; k <= 8; k++) {
            if (Object.prototype.hasOwnProperty.call(src, String(k))) coeffs[k] = cleanField(src[String(k)]);
        }
        const matrix = [];
        const m = Array.isArray(p.matrix) ? p.matrix : DEFAULTS.matrix;
        for (let r = 0; r < 5; r++) {
            const row = Array.isArray(m[r]) ? m[r] : [];
            const out = [];
            for (let c = 0; c < 6; c++) out.push(cleanField(row[c]));
            matrix.push(out);
        }
        return {
            mode: MODE_IDS.includes(p.mode) ? p.mode : DEFAULTS.mode,
            eq: typeof p.eq === 'string' ? p.eq.slice(0, EQ_MAX) : DEFAULTS.eq,
            min: cleanField(p.min, DEFAULTS.min),
            max: cleanField(p.max, DEFAULTS.max),
            degree,
            coeffs,
            unknowns,
            matrix
        };
    }

    function save(patch) {
        if (!window.State) return;
        if (!State.setPane(PANE, patch)) console.warn('[SolverUI] could not save pane preferences:', State.lastError);
    }

    /** Read one field as a plain number (digits, or any unit-free expression). Throws a plain message. */
    function readNumber(text, name, opts = {}) {
        const s = String(text || '').trim();
        if (!s) throw new Error(opts.emptyMessage || `${name} is empty.`);
        if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) {
            const v = Number(s);
            if (!Number.isFinite(v)) throw new Error(`${name} is too large.`);
            return { value: v, exact: /^[+-]?\d+$/.test(s) ? s : (opts.exactDecimal ? s : '') };
        }
        if (!window.MathEngine) throw new Error(`${name} needs a plain number like 2.5 (the math engine did not load).`);
        const r = MathEngine.evaluate(s, engineOptions());
        if (r.error) throw new Error(`${name}: ${r.error.message}`);
        if (r.unit) throw new Error(`${name} must be a plain number, without units.`);
        if (typeof r.numeric !== 'number' || !Number.isFinite(r.numeric)) {
            throw new Error(`${name} must work out to a number${r.display ? ` (it gives ${r.display})` : ''}.`);
        }
        const exact = r.exact || (/^-?\d+$/.test(r.plain) ? r.plain : '');
        return { value: r.numeric, exact };
    }

    /* ── Generic builders ──────────────────────────────────── */

    function field(labelText, id, control, extraClass) {
        const wrap = DOM.create('div', { className: `tb-field${extraClass ? ` ${extraClass}` : ''}` });
        wrap.appendChild(DOM.create('label', { className: 'mini-label', text: labelText, attrs: { for: id } }));
        wrap.appendChild(control);
        return wrap;
    }

    function input(id, placeholder, extra = {}) {
        return DOM.create('input', {
            className: 'text-input mono tb-input',
            attrs: Object.assign({
                id,
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
                maxlength: String(FIELD_MAX),
                placeholder
            }, extra)
        });
    }

    function stepper(labelId, labelText, onStep, downLabel, upLabel) {
        const wrap = DOM.create('div', { className: 'tb-head' });
        wrap.appendChild(DOM.create('span', { className: 'mini-label', text: labelText, attrs: { id: labelId } }));
        const down = DOM.create('button', { className: 'stepper-btn', text: '−', attrs: { type: 'button', 'aria-label': downLabel, title: downLabel } });
        const up = DOM.create('button', { className: 'stepper-btn', text: '+', attrs: { type: 'button', 'aria-label': upLabel, title: upLabel } });
        const value = DOM.create('span', { className: 'stepper-value', attrs: { 'aria-live': 'polite' } });
        down.addEventListener('click', () => onStep(-1));
        up.addEventListener('click', () => onStep(1));
        wrap.appendChild(DOM.create('div', {
            className: 'stepper tb-stepper',
            attrs: { role: 'group', 'aria-labelledby': labelId },
            children: [down, value, up]
        }));
        return { el: wrap, down, up, value };
    }

    function actionRow(solveLabel, onExample, onClear, solveTitle) {
        const solve = DOM.create('button', { className: 'btn btn-primary btn-sm', text: solveLabel, attrs: { type: 'submit', title: solveTitle } });
        const example = DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Example', attrs: { type: 'button', title: 'Fill in a worked example' } });
        const clear = DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Clear', attrs: { type: 'button', title: 'Empty every field in this mode' } });
        example.addEventListener('click', onExample);
        clear.addEventListener('click', onClear);
        return { el: DOM.create('div', { className: 'tb-actions', children: [solve, example, clear] }), solve, example, clear };
    }

    /** A progress row with a Cancel button for a search that runs in slices. */
    function busyRow(label, onCancel) {
        const fill = DOM.create('div', { className: 'usage-fill' });
        const meter = DOM.create('div', {
            className: 'usage-meter tb-busy-meter',
            attrs: { role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
            children: [fill]
        });
        const text = DOM.create('span', { className: 'tb-busy-text', attrs: { role: 'status', 'aria-live': 'polite' } });
        const cancel = DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Cancel', attrs: { type: 'button', title: 'Stop the search' } });
        cancel.addEventListener('click', onCancel);
        const el = DOM.create('div', { className: 'tb-busy', children: [meter, DOM.create('div', { className: 'tb-busy-row', children: [text, cancel] })] });
        el.hidden = true;
        return {
            el,
            show(fraction, message) {
                const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
                fill.style.width = `${Math.max(1, pct)}%`;
                meter.setAttribute('aria-valuenow', String(pct));
                if (text.textContent !== message) text.textContent = message;
                if (el.hidden) {
                    el.hidden = false;
                    el.scrollIntoView({ block: 'nearest' });
                }
            },
            hide() { el.hidden = true; }
        };
    }

    function resultBlock() {
        const feedback = DOM.create('div', { className: 'tool-feedback tb-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        const list = DOM.create('div', { className: 'readout-list tb-readouts sv-roots' });
        list.hidden = true;
        const more = DOM.create('p', { className: 'pane-hint' });
        more.hidden = true;
        const send = DOM.create('button', {
            className: 'btn btn-secondary btn-sm btn-block',
            html: `${ICONS.send}<span>Send to sheet</span>`,
            attrs: { type: 'button', title: 'Add these answers to the end of the sheet' }
        });
        send.hidden = true;
        return { feedback, list, more, send, nodes: [feedback, list, more, send] };
    }

    function showFeedback(block, message, state) {
        block.feedback.textContent = message || '';
        if (message) block.feedback.dataset.state = state || 'info';
        else delete block.feedback.dataset.state;
    }

    function resetResult(block) {
        showFeedback(block, '');
        DOM.empty(block.list);
        block.list.hidden = true;
        block.more.hidden = true;
        block.send.hidden = true;
    }

    /** One answer row: label, value, optional note, copy button. */
    function answerRow(block, label, value, copyText, copyWords, note) {
        const valueEl = DOM.create('code', { className: 'readout-value', text: value });
        if (note) valueEl.appendChild(DOM.create('span', { className: 'sv-note', text: ` ${note}` }));
        const btn = DOM.create('button', {
            className: 'icon-action',
            html: ICONS.copy,
            attrs: { type: 'button', 'aria-label': `Copy ${copyWords}`, title: `Copy ${copyWords}` }
        });
        btn.addEventListener('click', () => copy(copyText, copyWords, btn));
        block.list.appendChild(DOM.create('div', {
            className: 'readout',
            children: [DOM.create('span', { className: 'readout-label sv-name', text: label }), valueEl, btn]
        }));
        block.list.hidden = false;
    }

    async function confirmClear(what) {
        if (!window.Dialogs) return true;
        return Dialogs.confirm({
            title: `Clear the ${what}?`,
            message: `This empties every field in the ${what} mode. It can't be undone.`,
            confirmLabel: 'Clear fields',
            danger: true
        });
    }

    /* ── Tabs ──────────────────────────────────────────────── */

    function buildTabs(root) {
        const list = DOM.create('div', { className: 'chip-row tb-tabs', attrs: { role: 'tablist', 'aria-label': 'Solver mode' } });
        MODES.forEach((m) => {
            const tab = DOM.create('button', {
                className: 'chip-btn',
                text: m.label,
                attrs: {
                    type: 'button',
                    role: 'tab',
                    id: `sv-tab-${m.id}`,
                    'aria-controls': `sv-panel-${m.id}`,
                    'aria-selected': 'false',
                    tabindex: '-1',
                    title: m.title
                },
                data: { mode: m.id }
            });
            tab.addEventListener('click', () => setMode(m.id, true));
            els.tabs[m.id] = tab;
            list.appendChild(tab);
        });
        list.addEventListener('keydown', (e) => {
            const i = MODE_IDS.indexOf(currentMode());
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % MODE_IDS.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + MODE_IDS.length) % MODE_IDS.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = MODE_IDS.length - 1;
            if (next < 0) return;
            e.preventDefault();
            setMode(MODE_IDS[next], true);
            els.tabs[MODE_IDS[next]].focus();
        });
        root.appendChild(list);
    }

    function panel(id) {
        const p = DOM.create('form', {
            className: 'tb-pane sv-panel',
            attrs: { id: `sv-panel-${id}`, role: 'tabpanel', 'aria-labelledby': `sv-tab-${id}`, novalidate: 'novalidate' }
        });
        els.panels[id] = p;
        return p;
    }

    let mode = DEFAULTS.mode;
    const currentMode = () => mode;

    function setMode(id, persist) {
        if (!MODE_IDS.includes(id)) return false;
        mode = id;
        MODE_IDS.forEach((m) => {
            const on = m === id;
            els.tabs[m].setAttribute('aria-selected', String(on));
            els.tabs[m].tabIndex = on ? 0 : -1;
            els.panels[m].hidden = !on;
        });
        if (persist) save({ mode: id });
        return true;
    }

    /* ── Equation mode ─────────────────────────────────────── */

    function buildEquation(root) {
        const p = panel('equation');
        els.eq = input('sv-eq', 'x^3 = 2x + 1', { maxlength: String(EQ_MAX), 'aria-describedby': 'sv-eq-hint' });
        p.appendChild(field('Equation in x', 'sv-eq', els.eq));
        p.appendChild(DOM.create('p', {
            className: 'pane-hint',
            attrs: { id: 'sv-eq-hint' },
            text: 'Use x for the unknown. Without "=", mathMan finds where the expression is 0. Functions and variables from the current sheet work here too.'
        }));
        els.min = input('sv-min', '-10', { inputmode: 'text' });
        els.max = input('sv-max', '10', { inputmode: 'text' });
        p.appendChild(DOM.create('div', {
            className: 'field-pair',
            children: [field('From x =', 'sv-min', els.min), field('To x =', 'sv-max', els.max)]
        }));
        const actions = actionRow('Solve', exampleEquation, clearEquation, 'Find every x in the range that makes both sides equal');
        p.appendChild(actions.el);
        els.eqResult = resultBlock();
        els.eqBusy = busyRow('Solver progress', () => stopSolve(true));
        p.appendChild(els.eqBusy.el);
        els.eqResult.nodes.forEach((n) => p.appendChild(n));
        els.eqResult.send.addEventListener('click', () => sendEquation());
        p.addEventListener('submit', (e) => { e.preventDefault(); solveEquationUI(); });
        [els.eq, els.min, els.max].forEach((el) => el.addEventListener('input', () => {
            el.removeAttribute('aria-invalid');
            save({ eq: els.eq.value.slice(0, EQ_MAX), min: els.min.value, max: els.max.value });
        }));
        root.appendChild(p);
    }

    /** Split "left = right" (ignoring ==, <=, >=, !=). Returns { left, right } or throws. */
    function splitEquation(text) {
        const cut = text.indexOf('//');
        const src = (cut === -1 ? text : text.slice(0, cut)).trim();
        if (!src) throw new Error('Type an equation in x, like x^2 = 2.');
        const re = /(?<![=!<>])=(?!=)/g;
        const hits = [];
        let m;
        while ((m = re.exec(src))) hits.push(m.index);
        if (hits.length > 1) throw new Error("Use one '=' sign, like x^2 = 2.");
        if (!hits.length) return { left: src, right: '' };
        const left = src.slice(0, hits[0]).trim();
        const right = src.slice(hits[0] + 1).trim();
        if (!left) throw new Error("Put something before the '=' sign, like x^2 = 2.");
        if (!right) throw new Error("Put something after the '=' sign, like x^2 = 2.");
        return { left, right };
    }

    /** Compile the equation text in x: { fn, stats } (stats.stops counts step-budget stops) or throws a plain message. */
    function prepareEquation(text) {
        if (!window.MathEngine || typeof MathEngine.compile !== 'function') throw new Error('The math engine did not load. Reload the page to try again.');
        if (!window.Numerics) throw new Error('The solver library did not load. Reload the page to try again.');
        const { left, right } = splitEquation(String(text || ''));
        const expr = right ? `(${left}) - (${right})` : left;
        const opts = {
            variable: 'x',
            angle: window.State ? State.engineOptions().angle : 'rad',
            sheet: window.State ? State.activeSheet().text : ''
        };
        const compiled = MathEngine.compile(expr, opts);
        if (compiled.error) {
            if (right) {
                const l = MathEngine.compile(left, opts);
                if (l.error) throw new Error(`Left side: ${l.error}`);
                const r = MathEngine.compile(right, opts);
                if (r.error) throw new Error(`Right side: ${r.error}`);
            }
            throw new Error(compiled.error);
        }
        return { fn: compiled.fn, stats: compiled.stats || { stops: 0 } };
    }

    /** Solve text in x over [min, max] now: { roots, detail, fn, stops } or throws a plain message. */
    function solveEquation(text, min, max) {
        const prep = prepareEquation(text);
        const detail = Numerics.findRootsDetailed(prep.fn, { min, max, samples: 2000, timeMs: SOLVE_MS });
        return { roots: detail.roots, detail, fn: prep.fn, stops: prep.stats.stops };
    }

    let solveRun = null;   // { job, prep, text, min, max } while a search runs in slices

    /** Stop a running search; cancelled says so and leaves the fields as they are. */
    function stopSolve(cancelled) {
        const run = solveRun;
        solveRun = null;
        els.eqBusy.hide();
        if (!run || !cancelled) return;
        showFeedback(els.eqResult, 'Stopped before the search finished. Narrow the range or simplify the equation, then Solve again.', 'info');
    }

    function finishSolve(run) {
        const d = run.job.result();
        last.equation = { text: run.text, min: run.min, max: run.max, roots: d.roots, detail: d, stops: run.prep.stats.stops };
        renderEquation();
    }

    function solveEquationUI() {
        stopSolve(false);
        const block = els.eqResult;
        resetResult(block);
        last.equation = null;
        let min;
        let max;
        try {
            min = readNumber(els.min.value, 'From', { emptyMessage: 'Enter where the search starts, like -10.' }).value;
        } catch (err) {
            els.min.setAttribute('aria-invalid', 'true');
            showFeedback(block, err.message, 'error');
            return;
        }
        try {
            max = readNumber(els.max.value, 'To', { emptyMessage: 'Enter where the search ends, like 10.' }).value;
        } catch (err) {
            els.max.setAttribute('aria-invalid', 'true');
            showFeedback(block, err.message, 'error');
            return;
        }
        let run;
        try {
            if (!(min < max)) throw new Error(`"From" (${fmt(min)}) must be less than "To" (${fmt(max)}).`);
            const prep = prepareEquation(els.eq.value);
            const job = Numerics.findRootsJob(prep.fn, { min, max, samples: 2000, timeMs: SOLVE_MS });
            run = { job, prep, text: els.eq.value.trim(), min, max };
        } catch (err) {
            if (!/From|To|range/.test(err.message)) els.eq.setAttribute('aria-invalid', 'true');
            showFeedback(block, err.message, 'error');
            return;
        }
        // Most equations finish at once; a slow one works in slices with progress and Cancel.
        if (run.job.step(FIRST_SLICE_MS)) {
            finishSolve(run);
            return;
        }
        solveRun = run;
        const slice = () => {
            if (solveRun !== run) return;
            let done;
            try {
                done = run.job.step(SLICE_MS);
            } catch (err) {
                stopSolve(false);
                showFeedback(block, err && err.message ? err.message : 'That equation could not be solved.', 'error');
                return;
            }
            if (done) {
                solveRun = null;
                els.eqBusy.hide();
                finishSolve(run);
                return;
            }
            els.eqBusy.show(run.job.progress(), `Solving… ${Math.round(run.job.progress() * 100)}%`);
            setTimeout(slice, 0);
        };
        els.eqBusy.show(run.job.progress(), `Solving… ${Math.round(run.job.progress() * 100)}%`);
        setTimeout(slice, 0);
    }

    function renderEquation() {
        const block = els.eqResult;
        const res = last.equation;
        resetResult(block);
        if (!res) return;
        const d = res.detail;
        const range = `${pretty(fmt(res.min))} and ${pretty(fmt(res.max))}`;
        const notes = [];
        const stops = res.stops || 0;
        if (d.timedOut) notes.push(`The search stopped after 2 seconds, part way through the range. Narrow the range or simplify the equation to search all of it.`);
        if (d.undefinedSamples && d.undefinedSamples < d.evaluated) {
            notes.push(stops
                ? 'Parts of the range were skipped because the equation takes too many steps to work out there.'
                : 'Parts of the range were skipped because the equation has no real value there.');
        }
        d.intervals.forEach((iv) => {
            answerRow(block, 'every x', `${pretty(fmt(iv.from))} to ${pretty(fmt(iv.to))}`, `${plain(iv.from)} to ${plain(iv.to)}`, 'the stretch where both sides are equal', '(both sides are equal throughout)');
        });
        if (!res.roots.length && !d.intervals.length) {
            if (d.evaluated && d.undefinedSamples >= d.evaluated && stops) {
                showFeedback(block, `This equation takes too many steps to work out between ${range} — simplify it (a function that calls itself twice per step grows very fast) or narrow the range.`, 'warn');
            } else if (d.evaluated && d.undefinedSamples >= d.evaluated) {
                showFeedback(block, `The equation has no real value anywhere between ${range}. Check its domain — for example, sqrt and ln need inputs above 0.`, 'warn');
            } else {
                showFeedback(block, `No solutions between ${range}. Try a wider range, or graph both sides to see whether they meet.${notes.length ? ` ${notes.join(' ')}` : ''}`, 'info');
            }
            return;
        }
        const total = res.roots.length;
        const head = total
            ? `${plural(total, 'solution')}${d.truncated ? ' or more' : ''} between ${range}.`
            : `Solved between ${range}.`;
        showFeedback(block, [head].concat(notes).join(' '), notes.length ? 'warn' : 'success');
        res.roots.slice(0, SHOWN_ROOTS).forEach((r, i) => {
            answerRow(block, `x${sub(i + 1)}`, pretty(fmt(r)), plain(r), `x${i + 1}`);
        });
        if (total > SHOWN_ROOTS || d.truncated) {
            block.more.textContent = `Showing ${SHOWN_ROOTS} of ${total}${d.truncated ? '+' : ''} solutions. Narrow the range to see the rest.`;
            block.more.hidden = false;
        }
        block.send.hidden = false;
    }

    function sendEquation() {
        const res = last.equation;
        if (!res) return false;
        const title = res.text.replace(/\s+/g, ' ').slice(0, 120);
        const lines = [`# Solutions of ${title}`];
        res.roots.slice(0, SHOWN_ROOTS).forEach((r, i) => lines.push(`Root ${i + 1}: ${plain(r)}`));
        res.detail.intervals.forEach((iv) => lines.push(`// Every x from ${plain(iv.from)} to ${plain(iv.to)} is a solution`));
        if (lines.length === 1) lines.push(`// No solutions between ${plain(res.min)} and ${plain(res.max)}`);
        return sendLines(lines, res.roots.length === 1 ? 'the solution' : 'the solutions');
    }

    function exampleEquation() {
        els.eq.value = 'cos(x) = x';
        els.min.value = '-2pi';
        els.max.value = '2pi';
        save({ eq: els.eq.value, min: els.min.value, max: els.max.value });
        solveEquationUI();
    }

    async function clearEquation() {
        if ((els.eq.value || els.min.value || els.max.value) && !(await confirmClear('equation'))) return;
        stopSolve(false);
        els.eq.value = '';
        els.min.value = DEFAULTS.min;
        els.max.value = DEFAULTS.max;
        save({ eq: '', min: DEFAULTS.min, max: DEFAULTS.max });
        last.equation = null;
        resetResult(els.eqResult);
        els.eq.focus();
    }

    /* ── Polynomial mode ───────────────────────────────────── */

    function powerLabel(k) {
        if (k === 0) return 'Constant';
        if (k === 1) return 'x';
        return `x${SUPERS[k]}`;
    }

    function buildPoly(root) {
        const p = panel('poly');
        els.degree = stepper('sv-degree-label', 'Degree', (d) => setDegree(currentDegree() + d, true), 'Lower the degree by one', 'Raise the degree by one');
        p.appendChild(els.degree.el);
        els.coeffGrid = DOM.create('div', { className: 'sv-coeffs', attrs: { role: 'group', 'aria-label': 'Coefficients, highest power first' } });
        p.appendChild(els.coeffGrid);
        els.polyPreview = DOM.create('p', { className: 'sv-preview', attrs: { 'aria-live': 'polite' } });
        p.appendChild(els.polyPreview);
        const actions = actionRow('Find roots', examplePoly, clearPoly, 'Find every real and complex root');
        p.appendChild(actions.el);
        els.polyResult = resultBlock();
        els.polyResult.nodes.forEach((n) => p.appendChild(n));
        els.polyResult.send.addEventListener('click', () => sendPoly());
        p.addEventListener('submit', (e) => { e.preventDefault(); solvePolyUI(); });
        root.appendChild(p);
    }

    let degree = DEFAULTS.degree;
    const currentDegree = () => degree;

    function coeffValues() {
        const out = {};
        Object.keys(els.coeffInputs).forEach((k) => { out[k] = els.coeffInputs[k].value.slice(0, FIELD_MAX); });
        return out;
    }

    function setDegree(d, persist) {
        const next = clamp(d, 1, 8);
        const keep = Object.assign({}, prefs().coeffs, coeffValues());
        degree = next;
        DOM.empty(els.coeffGrid);
        els.coeffInputs = {};
        for (let k = next; k >= 0; k--) {
            const id = `sv-c${k}`;
            const inp = input(id, k === next ? '1' : '0', { inputmode: 'text', 'aria-label': `Coefficient of ${k === 0 ? 'the constant term' : powerLabel(k)}` });
            inp.classList.add('sv-coeff');
            inp.value = Object.prototype.hasOwnProperty.call(keep, k) ? keep[k] : '';
            inp.addEventListener('input', () => {
                inp.removeAttribute('aria-invalid');
                save({ coeffs: Object.assign({}, prefs().coeffs, coeffValues()) });
                renderPolyPreview();
            });
            els.coeffInputs[k] = inp;
            els.coeffGrid.appendChild(DOM.create('div', {
                className: 'sv-coeff-field',
                children: [DOM.create('label', { className: 'mini-label', text: powerLabel(k), attrs: { for: id } }), inp]
            }));
        }
        els.degree.value.textContent = `Degree ${next}`;
        els.degree.down.disabled = next <= 1;
        els.degree.up.disabled = next >= 8;
        if (persist) save({ degree: next, coeffs: Object.assign({}, prefs().coeffs, coeffValues()) });
        renderPolyPreview();
        if (last.poly && last.poly.degree !== next) {
            last.poly = null;
            resetResult(els.polyResult);
        }
    }

    /** A readable equation from coefficients (highest first); `ascii` uses ^ and * for the sheet. */
    function polyText(cs, ascii) {
        const n = cs.length - 1;
        const parts = [];
        cs.forEach((c, i) => {
            const k = n - i;
            if (c === 0) return;
            const neg = c < 0;
            const mag = Math.abs(c);
            const num = ascii ? plain(mag) : fmt(mag);
            let term;
            if (k === 0) term = num;
            else {
                const pow = k === 1 ? 'x' : (ascii ? `x^${k}` : `x${SUPERS[k]}`);
                term = mag === 1 ? pow : `${num}${pow}`;
            }
            if (!parts.length) parts.push(neg ? `${ascii ? '-' : '−'}${term}` : term);
            else parts.push(`${neg ? (ascii ? '-' : '−') : '+'} ${term}`);
        });
        return `${parts.length ? parts.join(' ') : '0'} = 0`;
    }

    /** Read the coefficient fields, highest power first. Throws with the field marked. */
    function readCoeffs() {
        const cs = [];
        for (let k = degree; k >= 0; k--) {
            const inp = els.coeffInputs[k];
            try {
                cs.push(readNumber(inp.value, `The ${k === 0 ? 'constant' : powerLabel(k)} coefficient`, {
                    emptyMessage: `Fill in the ${k === 0 ? 'constant' : powerLabel(k)} coefficient (use 0 for a missing term).`
                }).value);
            } catch (err) {
                inp.setAttribute('aria-invalid', 'true');
                err.field = inp;
                throw err;
            }
        }
        return cs;
    }

    function renderPolyPreview() {
        const cs = [];
        for (let k = degree; k >= 0; k--) {
            const s = els.coeffInputs[k] ? els.coeffInputs[k].value.trim() : '';
            const v = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s) ? Number(s) : null;
            if (v === null && s) {
                try { cs.push(readNumber(s, 'c').value); } catch (_err) { els.polyPreview.textContent = 'Preview appears when every field holds a number.'; return; }
            } else cs.push(v === null ? 0 : v);
        }
        els.polyPreview.textContent = polyText(cs, false);
    }

    function solvePolyUI() {
        const block = els.polyResult;
        resetResult(block);
        last.poly = null;
        let cs;
        try {
            cs = readCoeffs();
        } catch (err) {
            showFeedback(block, err.message, 'error');
            return;
        }
        let roots;
        try {
            roots = Numerics.polyRoots(cs);
        } catch (err) {
            showFeedback(block, err.message, 'error');
            return;
        }
        last.poly = { coeffs: cs, roots, degree };
        renderPoly();
    }

    /** Group equal roots: [{ re, im, count }]. */
    function groupRoots(roots) {
        const out = [];
        roots.forEach((z) => {
            const g = out.find((o) => o.re === z.re && o.im === z.im);
            if (g) g.count++;
            else out.push({ re: z.re, im: z.im, count: 1 });
        });
        return out;
    }

    function complexText(z, ascii) {
        const re = ascii ? plain(z.re) : pretty(fmt(z.re));
        if (z.im === 0) return re;
        const im = ascii ? plain(Math.abs(z.im)) : fmt(Math.abs(z.im));
        const sign = z.im < 0 ? (ascii ? '-' : '−') : '+';
        return `${re} ${sign} ${im === '1' ? '' : im}i`;
    }

    function renderPoly() {
        const block = els.polyResult;
        resetResult(block);
        const res = last.poly;
        if (!res) return;
        const lead = res.coeffs.findIndex((c) => c !== 0);
        const effective = lead < 0 ? 0 : res.coeffs.length - 1 - lead;
        if (!res.roots.length) {
            showFeedback(block, effective === 0
                ? 'Every x coefficient is 0 and the constant is not, so there are no roots.'
                : 'No roots were found.', 'info');
            return;
        }
        const real = res.roots.filter((z) => z.im === 0).length;
        const complex = res.roots.length - real;
        const parts = [];
        if (real) parts.push(`${real} real`);
        if (complex) parts.push(`${complex} complex${complex === 2 ? ' (a conjugate pair)' : complex > 2 ? ' (conjugate pairs)' : ''}`);
        let message = `${plural(res.roots.length, 'root')}: ${parts.join(', ')}.`;
        if (effective < res.degree) message += ` The leading coefficient is 0, so this is really degree ${effective}.`;
        showFeedback(block, message, 'success');
        groupRoots(res.roots).forEach((g, i) => {
            const label = `x${sub(i + 1)}`;
            const note = g.count > 1 ? `(${MULTIPLICITY[g.count] || `repeated ${g.count} times`})` : (g.im !== 0 ? '(complex)' : '');
            answerRow(block, label, complexText(g, false), complexText(g, true), `root ${i + 1}`, note);
        });
        block.send.hidden = false;
    }

    function sendPoly() {
        const res = last.poly;
        if (!res) return false;
        const lines = [`# Roots of ${polyText(res.coeffs, true)}`];
        groupRoots(res.roots).forEach((g, i) => {
            const many = g.count > 1 ? ` (${MULTIPLICITY[g.count] || `repeated ${g.count} times`})` : '';
            if (g.im === 0) lines.push(`Root ${i + 1}: ${plain(g.re)}${many ? ` //${many.replace(/[()]/g, '')}` : ''}`);
            else lines.push(`// Root ${i + 1}: ${complexText(g, true)} (complex${many ? `, ${many.replace(/[()\s]+/g, ' ').trim()}` : ''})`);
        });
        return sendLines(lines, 'the roots');
    }

    function examplePoly() {
        const cs = { 3: '1', 2: '-6', 1: '11', 0: '-6' };
        save({ degree: 3, coeffs: cs });
        setDegree(3, false);
        Object.keys(cs).forEach((k) => { els.coeffInputs[k].value = cs[k]; });
        renderPolyPreview();
        solvePolyUI();
    }

    async function clearPoly() {
        const filled = Object.keys(els.coeffInputs).some((k) => els.coeffInputs[k].value.trim());
        if (filled && !(await confirmClear('polynomial'))) return;
        Object.keys(els.coeffInputs).forEach((k) => { els.coeffInputs[k].value = ''; });
        save({ coeffs: {} });
        last.poly = null;
        resetResult(els.polyResult);
        renderPolyPreview();
        const first = els.coeffInputs[degree];
        if (first) first.focus();
    }

    /* ── Linear system mode ────────────────────────────────── */

    function buildLinear(root) {
        const p = panel('linear');
        els.unknowns = stepper('sv-unknowns-label', 'Unknowns', (d) => setUnknowns(currentUnknowns() + d, true), 'One unknown fewer', 'One unknown more');
        p.appendChild(els.unknowns.el);
        els.matrixWrap = DOM.create('div', { className: 'sv-matrix-wrap' });
        p.appendChild(els.matrixWrap);
        els.linPreview = DOM.create('div', { className: 'sv-preview sv-preview--lines', attrs: { 'aria-live': 'polite' } });
        p.appendChild(els.linPreview);
        const actions = actionRow('Solve', exampleLinear, clearLinear, 'Solve every equation at once');
        p.appendChild(actions.el);
        els.linResult = resultBlock();
        els.linResult.nodes.forEach((n) => p.appendChild(n));
        els.linResult.send.addEventListener('click', () => sendLinear());
        p.addEventListener('submit', (e) => { e.preventDefault(); solveLinearUI(); });
        root.appendChild(p);
    }

    let unknowns = DEFAULTS.unknowns;
    const currentUnknowns = () => unknowns;

    function matrixValues() {
        const saved = prefs().matrix;
        els.cells.forEach((row, r) => row.forEach((inp, c) => {
            const col = c === row.length - 1 ? 5 : c;
            saved[r][col] = inp.value.slice(0, FIELD_MAX);
        }));
        return saved;
    }

    function setUnknowns(n, persist) {
        const next = clamp(n, 2, 5);
        const keep = els.cells.length ? matrixValues() : prefs().matrix;
        unknowns = next;
        DOM.empty(els.matrixWrap);
        els.cells = [];
        const table = DOM.create('table', { className: 'sv-matrix' });
        const caption = DOM.create('caption', { className: 'tb-sr', text: `Coefficients of ${next} equations in ${NAMES.slice(0, next).join(', ')}, with the constant after the = sign` });
        table.appendChild(caption);
        const head = DOM.create('tr');
        head.appendChild(DOM.create('th', { text: '#', attrs: { scope: 'col', title: 'Equation number' } }));
        NAMES.slice(0, next).forEach((name) => head.appendChild(DOM.create('th', { text: name, attrs: { scope: 'col' } })));
        head.appendChild(DOM.create('th', { text: '=', attrs: { scope: 'col', title: 'The constant on the right-hand side' } }));
        table.appendChild(DOM.create('thead', { children: [head] }));
        const body = DOM.create('tbody');
        for (let r = 0; r < next; r++) {
            const tr = DOM.create('tr');
            tr.appendChild(DOM.create('th', { text: String(r + 1), attrs: { scope: 'row' } }));
            const row = [];
            for (let c = 0; c <= next; c++) {
                const isConst = c === next;
                const col = isConst ? 5 : c;
                const inp = DOM.create('input', {
                    className: 'text-input mono sv-cell',
                    attrs: {
                        type: 'text',
                        inputmode: 'text',
                        spellcheck: 'false',
                        autocomplete: 'off',
                        maxlength: String(FIELD_MAX),
                        placeholder: '0',
                        'aria-label': isConst ? `Equation ${r + 1}: constant` : `Equation ${r + 1}: coefficient of ${NAMES[c]}`
                    }
                });
                inp.value = keep[r] && typeof keep[r][col] === 'string' ? keep[r][col] : '';
                inp.addEventListener('input', () => {
                    inp.removeAttribute('aria-invalid');
                    save({ matrix: matrixValues() });
                    renderLinearPreview();
                });
                row.push(inp);
                tr.appendChild(DOM.create('td', { className: isConst ? 'sv-const' : '', children: [inp] }));
            }
            els.cells.push(row);
            body.appendChild(tr);
        }
        table.appendChild(body);
        els.matrixWrap.appendChild(table);
        els.unknowns.value.textContent = `${next} unknowns`;
        els.unknowns.down.disabled = next <= 2;
        els.unknowns.up.disabled = next >= 5;
        if (persist) save({ unknowns: next, matrix: keep });
        renderLinearPreview();
        if (last.linear && last.linear.n !== next) {
            last.linear = null;
            resetResult(els.linResult);
        }
    }

    function cellNumber(s) {
        const t = s.trim();
        if (!t) return 0;
        if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t)) return Number(t);
        try { return readNumber(t, 'cell').value; } catch (_err) { return null; }
    }

    function renderLinearPreview() {
        DOM.empty(els.linPreview);
        els.cells.forEach((row) => {
            const coeffs = row.slice(0, -1).map((inp) => cellNumber(inp.value));
            const rhs = cellNumber(row[row.length - 1].value);
            let text;
            if (coeffs.includes(null) || rhs === null) text = '… (a field is not a number yet)';
            else {
                const parts = [];
                coeffs.forEach((c, i) => {
                    if (c === 0) return;
                    const mag = Math.abs(c);
                    const term = `${mag === 1 ? '' : fmt(mag)}${NAMES[i]}`;
                    if (!parts.length) parts.push(c < 0 ? `−${term}` : term);
                    else parts.push(`${c < 0 ? '−' : '+'} ${term}`);
                });
                text = `${parts.length ? parts.join(' ') : '0'} = ${pretty(fmt(rhs))}`;
            }
            els.linPreview.appendChild(DOM.create('span', { text }));
        });
    }

    function readMatrix() {
        const n = unknowns;
        const A = [];
        const b = [];
        for (let r = 0; r < n; r++) {
            const row = [];
            for (let c = 0; c <= n; c++) {
                const inp = els.cells[r][c];
                const name = c === n ? `Equation ${r + 1}, constant` : `Equation ${r + 1}, ${NAMES[c]}`;
                let v;
                try {
                    const raw = inp.value.trim() === '' ? '0' : inp.value;
                    const read = readNumber(raw, name, { exactDecimal: true });
                    v = read.exact || read.value;
                } catch (err) {
                    inp.setAttribute('aria-invalid', 'true');
                    throw err;
                }
                if (c === n) b.push(v);
                else row.push(v);
            }
            A.push(row);
        }
        return { A, b };
    }

    /** Show a fraction beside the decimal only when the decimal repeats. */
    function repeatingFraction(exact) {
        const m = /^-?\d+\/(\d+)$/.exec(exact || '');
        if (!m) return '';
        let d = BigInt(m[1]);
        while (d % 2n === 0n) d /= 2n;
        while (d % 5n === 0n) d /= 5n;
        return d > 1n ? exact : '';
    }

    function solveLinearUI() {
        const block = els.linResult;
        resetResult(block);
        last.linear = null;
        const blank = [];
        els.cells.forEach((row, r) => { if (row.every((inp) => !inp.value.trim())) blank.push(r + 1); });
        if (blank.length) {
            const which = blank.length === 1
                ? `Equation ${blank[0]} is empty`
                : `Equations ${blank.slice(0, -1).join(', ')} and ${blank[blank.length - 1]} are empty`;
            const fewer = unknowns - blank.length;
            const trailing = blank.every((r, i) => r === fewer + 1 + i);
            showFeedback(block, `${which}. Fill ${blank.length === 1 ? 'it' : 'them'} in${trailing && fewer >= 2 ? `, or lower the number of unknowns to ${fewer}` : ''}.`, 'warn');
            els.cells[blank[0] - 1][0].focus();
            return;
        }
        let sys;
        try {
            sys = readMatrix();
        } catch (err) {
            showFeedback(block, err.message, 'error');
            return;
        }
        let res;
        try {
            res = Numerics.solveLinear(sys.A, sys.b);
        } catch (err) {
            showFeedback(block, err.message, 'error');
            return;
        }
        last.linear = Object.assign({ n: unknowns }, res);
        renderLinear();
    }

    function renderLinear() {
        const block = els.linResult;
        resetResult(block);
        const res = last.linear;
        if (!res) return;
        const n = res.n;
        if (res.status === 'none') {
            showFeedback(block, 'No solution: the equations contradict each other. After elimination, one of them reduces to 0 = a non-zero number, so no values satisfy them all at once.', 'warn');
            block.send.hidden = false;
            return;
        }
        if (res.status === 'infinite') {
            const free = n - res.rank;
            showFeedback(block, `Infinitely many solutions: only ${res.rank} of the ${n} equations are independent, so ${plural(free, 'unknown')} can take any value and the others follow from ${free === 1 ? 'it' : 'them'}.`, 'info');
            block.send.hidden = false;
            return;
        }
        showFeedback(block, 'One solution — it satisfies every equation.', 'success');
        res.solution.forEach((v, i) => {
            const frac = repeatingFraction(res.exact[i]);
            answerRow(block, NAMES[i], pretty(fmt(v)), plain(v), NAMES[i], frac ? `(exactly ${pretty(frac)})` : '');
        });
        block.send.hidden = false;
    }

    function sendLinear() {
        const res = last.linear;
        if (!res) return false;
        const lines = [`# Solution of the ${res.n}-unknown system`];
        if (res.status === 'none') lines.push('// No solution: the equations contradict each other');
        else if (res.status === 'infinite') lines.push(`// Infinitely many solutions (${res.rank} of ${res.n} equations are independent)`);
        else {
            res.solution.forEach((v, i) => {
                const frac = repeatingFraction(res.exact[i]);
                lines.push(frac ? `${NAMES[i]}: ${frac}` : `${NAMES[i]}: ${plain(v)}`);
            });
        }
        return sendLines(lines, 'the solution');
    }

    function exampleLinear() {
        save({ unknowns: 3, matrix: DEFAULTS.matrix.map((r) => r.slice()) });
        els.cells = [];
        setUnknowns(3, false);
        solveLinearUI();
    }

    async function clearLinear() {
        const filled = els.cells.some((row) => row.some((inp) => inp.value.trim()));
        if (filled && !(await confirmClear('linear system'))) return;
        els.cells.forEach((row) => row.forEach((inp) => { inp.value = ''; }));
        save({ matrix: [] });
        last.linear = null;
        resetResult(els.linResult);
        renderLinearPreview();
        if (els.cells[0]) els.cells[0][0].focus();
    }

    /* ── Init ──────────────────────────────────────────────── */

    function load() {
        const p = prefs();
        els.eq.value = p.eq;
        els.min.value = p.min;
        els.max.value = p.max;
        els.coeffInputs = {};
        setDegree(p.degree, false);
        els.cells = [];
        setUnknowns(p.unknowns, false);
        setMode(p.mode, false);
        stopSolve(false);
        last.equation = null;
        last.poly = null;
        last.linear = null;
        [els.eqResult, els.polyResult, els.linResult].forEach(resetResult);
    }

    function rerender() {
        if (last.equation) renderEquation();
        if (last.poly) renderPoly();
        if (last.linear) renderLinear();
        renderPolyPreview();
        renderLinearPreview();
    }

    const SolverUI = {
        init() {
            const mount = DOM.id('mount-solver');
            if (!mount || els.root) return;
            const root = DOM.create('div', { className: 'tb-pane sv' });
            buildTabs(root);
            buildEquation(root);
            buildPoly(root);
            buildLinear(root);
            mount.appendChild(root);
            els.root = root;
            load();
            if (window.State) {
                State.on('settings', rerender);
                State.on('reset', load);
                // A backup import can fill in preferences this pane never had.
                State.on('panes', (e) => { if (e && e.action === 'import') load(); });
            }
        },

        /** Show a mode: 'equation', 'poly', or 'linear'. */
        setMode(id) {
            return setMode(id, true);
        },

        mode: currentMode,

        /** Solve an equation in x over [min, max]; returns the roots or throws a plain message. */
        solveEquation(text, min = -10, max = 10) {
            return solveEquation(text, Number(min), Number(max)).roots;
        },

        /** Roots of a polynomial (coefficients highest power first). */
        solvePolynomial(coeffs) {
            return Numerics.polyRoots(coeffs);
        },

        /** Solve A·x = b (2–5 unknowns). */
        solveSystem(A, b) {
            return Numerics.solveLinear(A, b);
        },

        /** Send the current mode's answers to the sheet. */
        sendToSheet() {
            if (mode === 'equation') return sendEquation();
            if (mode === 'poly') return sendPoly();
            return sendLinear();
        }
    };

    window.SolverUI = SolverUI;
})();
