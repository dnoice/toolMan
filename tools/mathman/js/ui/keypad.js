/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: KeypadUI (mathMan Edition - v1.0)
 *     - File Name: keypad.js
 *     - Relative Path: tools/mathman/js/ui/keypad.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Keypad pane in the Tools rail: a scientific calculator keypad
 *     whose keys type into the worksheet at the caret. It is for touch
 *     screens, for people who prefer clicking, and for finding a function
 *     without remembering its name; a small display above the keys shows
 *     the current line and its answer, so the keypad works even when a
 *     phone drawer covers the worksheet.
 *
 * ✒ Key Features:
 *     - Real buttons for digits, . , ( ) + − × ÷ ^ % !, ans, √, x², π, e,
 *       sin cos tan, ln log, abs; × types *, ÷ types /, − types -
 *     - A 2nd toggle swaps the function row for asin acos atan, eˣ 10ˣ,
 *       ∛ x³, round, τ and φ; it is remembered per browser
 *     - With text selected in the worksheet, a function key wraps it:
 *       select 2 + 2 and press √ to get sqrt(2 + 2)
 *     - Readable spacing: binary operators get spaces (2 + 3), a minus at
 *       the start of a line or after an operator stays unary (-5)
 *     - = finishes the line and starts a new one below it; ⌫ deletes the
 *       character before the caret (or the selection); AC clears the
 *       current line (Ctrl+Z brings it back)
 *     - Unit shortcuts (km, m, ft, mi, kg, lb, L, °C, °F, h, km/h) and to
 *     - DEG / RAD toggle that mirrors the toolbar button and the setting
 *     - Display: the current line and its answer, its exact fraction, or
 *       its error; on a blank line, the nearest answer above; copy button
 *     - Keyboard: every key is a real button; arrow keys move between keys
 *       (one tab stop per grid); typing 0-9 + - * / ^ ( ) . , = or
 *       Backspace while the keypad has focus presses the matching key
 *     - Touch: 40px minimum keys at phone width; pressing a key by touch
 *       or keyboard keeps focus on the keypad so no on-screen keyboard
 *       pops up; a mouse click leaves the caret in the worksheet
 *     - Five-column grid that scales its type with the rail width
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js and js/ui/worksheet.js, before js/app.js.
 *     app.js calls KeypadUI.init() once; the module renders into
 *     #mount-keypad and keeps itself in step through State events. Text
 *     goes in through WorksheetUI.insert(); without the worksheet module
 *     it edits the worksheet's <textarea> directly, or the sheet text.
 *
 * ✒ Examples:
 *     KeypadUI.init()              → builds the pane inside #mount-keypad
 *     KeypadUI.press('7')          → types 7 at the worksheet caret
 *     KeypadUI.press('add')        → types " + " (no extra space after one)
 *     KeypadUI.press('sqrt')       → types sqrt( or wraps the selection
 *     KeypadUI.press('equals')     → ends the line and starts a new one
 *     KeypadUI.setSecond(true)     → sin becomes sin⁻¹ (asin), and so on
 *     KeypadUI.refresh()           → redraws the display from the worksheet
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/ui/worksheet.js (WorksheetUI,
 *       optional), shared/js/dom.js, toolapp.js, toolman.js; css/tools-a.css
 *     - Compatible platforms: all evergreen browsers, mouse, touch, and
 *       keyboard
 *     - Limitations: ⌫, AC, wrapping, and smart spacing read the
 *       worksheet's <textarea>; if the worksheet uses another kind of
 *       editor those keys fall back to plain typing at the caret
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'keypad';
    const COLS = 5;
    const MAX_LINES = 2000;

    /* ── Key definitions ───────────────────────────────────── */

    // kind: digit | op | fn | edit | equals. A key with `alt` changes when
    // 2nd is on. `wrap` wraps a one-line selection: 'call' → name(sel),
    // 'pow' → (sel)^n.
    const SCI_KEYS = [
        { id: 'sin', label: 'sin', text: 'sin(', wrap: 'call', name: 'Sine', kind: 'fn',
            alt: { id: 'asin', label: 'sin⁻¹', text: 'asin(', wrap: 'call', name: 'Inverse sine (asin)' } },
        { id: 'cos', label: 'cos', text: 'cos(', wrap: 'call', name: 'Cosine', kind: 'fn',
            alt: { id: 'acos', label: 'cos⁻¹', text: 'acos(', wrap: 'call', name: 'Inverse cosine (acos)' } },
        { id: 'tan', label: 'tan', text: 'tan(', wrap: 'call', name: 'Tangent', kind: 'fn',
            alt: { id: 'atan', label: 'tan⁻¹', text: 'atan(', wrap: 'call', name: 'Inverse tangent (atan)' } },
        { id: 'ln', label: 'ln', text: 'ln(', wrap: 'call', name: 'Natural logarithm (ln)', kind: 'fn',
            alt: { id: 'exp', label: 'eˣ', text: 'exp(', wrap: 'call', name: 'e to the power of (exp)' } },
        { id: 'log', label: 'log', text: 'log(', wrap: 'call', name: 'Logarithm, base 10 (log)', kind: 'fn',
            alt: { id: 'pow10', label: '10ˣ', text: '10^', name: '10 to the power of' } },
        { id: 'sqrt', label: '√', text: 'sqrt(', wrap: 'call', name: 'Square root (sqrt)', kind: 'fn',
            alt: { id: 'cbrt', label: '∛', text: 'cbrt(', wrap: 'call', name: 'Cube root (cbrt)' } },
        { id: 'square', label: 'x²', text: '^2', wrap: 'pow', name: 'Square (^2)', kind: 'fn',
            alt: { id: 'cube', label: 'x³', text: '^3', wrap: 'pow', name: 'Cube (^3)' } },
        { id: 'abs', label: '|x|', text: 'abs(', wrap: 'call', name: 'Absolute value (abs)', kind: 'fn',
            alt: { id: 'round', label: 'rnd', text: 'round(', wrap: 'call', name: 'Round (round)' } },
        { id: 'pi', label: 'π', text: 'π', name: 'Pi', kind: 'fn', word: true,
            alt: { id: 'tau', label: 'τ', text: 'τ', name: 'Tau, two pi', word: true } },
        { id: 'e', label: 'e', text: 'e', name: "Euler's number e", kind: 'fn', word: true,
            alt: { id: 'phi', label: 'φ', text: 'φ', name: 'Phi, the golden ratio', word: true } }
    ];

    const MAIN_KEYS = [
        { id: 'open', label: '(', text: '(', name: 'Open bracket', kind: 'op' },
        { id: 'close', label: ')', text: ')', name: 'Close bracket', kind: 'op' },
        { id: 'comma', label: ',', text: ', ', name: 'Comma between function inputs', kind: 'op' },
        { id: 'back', label: '⌫', name: 'Delete the character before the caret', kind: 'edit', action: 'back' },
        { id: 'clear', label: 'AC', name: 'Clear the current line', kind: 'edit', action: 'clear' },

        { id: '7', label: '7', kind: 'digit' }, { id: '8', label: '8', kind: 'digit' }, { id: '9', label: '9', kind: 'digit' },
        { id: 'divide', label: '÷', text: '/', binary: true, name: 'Divide (/)', kind: 'op' },
        { id: 'power', label: '^', text: '^', name: 'Power (^)', kind: 'op' },

        { id: '4', label: '4', kind: 'digit' }, { id: '5', label: '5', kind: 'digit' }, { id: '6', label: '6', kind: 'digit' },
        { id: 'multiply', label: '×', text: '*', binary: true, name: 'Multiply (*)', kind: 'op' },
        { id: 'percent', label: '%', text: '%', name: 'Percent (%)', kind: 'op' },

        { id: '1', label: '1', kind: 'digit' }, { id: '2', label: '2', kind: 'digit' }, { id: '3', label: '3', kind: 'digit' },
        { id: 'subtract', label: '−', text: '-', binary: true, name: 'Minus (-)', kind: 'op' },
        { id: 'factorial', label: '!', text: '!', name: 'Factorial (!)', kind: 'op' },

        { id: '0', label: '0', kind: 'digit' },
        { id: 'point', label: '.', text: '.', name: 'Decimal point', kind: 'digit' },
        { id: 'ans', label: 'ans', text: 'ans', name: 'The answer on the line above (ans)', kind: 'fn', word: true },
        { id: 'add', label: '+', text: '+', binary: true, name: 'Plus (+)', kind: 'op' },
        { id: 'equals', label: '=', name: 'Finish this line and start a new one', kind: 'equals', action: 'equals' }
    ];

    const UNIT_KEYS = [
        { id: 'to', label: 'to', text: 'to', name: 'Convert to another unit (to)', spaced: true },
        { id: 'u-km', label: 'km', text: 'km', name: 'kilometers' },
        { id: 'u-m', label: 'm', text: 'm', name: 'meters' },
        { id: 'u-ft', label: 'ft', text: 'ft', name: 'feet' },
        { id: 'u-mi', label: 'mi', text: 'mi', name: 'miles' },
        { id: 'u-kg', label: 'kg', text: 'kg', name: 'kilograms' },
        { id: 'u-lb', label: 'lb', text: 'lb', name: 'pounds' },
        { id: 'u-L', label: 'L', text: 'L', name: 'liters' },
        { id: 'u-C', label: '°C', text: '°C', name: 'degrees Celsius' },
        { id: 'u-F', label: '°F', text: '°F', name: 'degrees Fahrenheit' },
        { id: 'u-h', label: 'h', text: 'h', name: 'hours' },
        { id: 'u-kmh', label: 'km/h', text: 'km/h', name: 'kilometers per hour' }
    ];

    // Physical keys that press a keypad key while the keypad has focus.
    const TYPED = {
        '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        '.': 'point', ',': 'comma', '(': 'open', ')': 'close', '+': 'add', '-': 'subtract',
        '*': 'multiply', '/': 'divide', '^': 'power', '%': 'percent', '!': 'factorial',
        '=': 'equals', Backspace: 'back'
    };

    const els = { keys: Object.create(null) };
    let second = false;
    let lastPointer = 'mouse';
    let frame = 0;
    let stale = false;
    let speak = false;

    /* ── Small helpers ─────────────────────────────────────── */

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** A stroked 24-unit icon built from [tag, attrs] pairs (no HTML parsing). */
    function icon(shapes, size = 16) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        const attrs = {
            width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            'aria-hidden': 'true', focusable: 'false'
        };
        Object.keys(attrs).forEach((k) => svg.setAttribute(k, String(attrs[k])));
        shapes.forEach(([tag, a]) => {
            const el = document.createElementNS(SVG_NS, tag);
            Object.keys(a).forEach((k) => el.setAttribute(k, String(a[k])));
            svg.appendChild(el);
        });
        return svg;
    }

    const ICON_COPY = [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]];

    function prefs() {
        const p = State.pane(PANE);
        return { second: p.second === true };
    }

    function save(patch) {
        if (!State.setPane(PANE, patch)) notify(State.lastError || 'Could not save the Keypad settings.', 'warning', 3000);
    }

    /* ── The worksheet bridge ──────────────────────────────── */

    /** The worksheet's editing surface, if the worksheet renders a textarea. */
    function editor() {
        const mount = DOM.id('mount-worksheet');
        return mount ? DOM.$('textarea', mount) : null;
    }

    /** Replace [start, end) in the textarea, keeping the browser's undo history when it can. */
    function replaceRange(ta, start, end, text) {
        ta.focus();
        ta.setSelectionRange(start, end);
        let done = false;
        try {
            if (typeof document.execCommand === 'function') {
                done = text
                    ? document.execCommand('insertText', false, text)
                    : (start === end || document.execCommand('delete', false));
            }
        } catch (_err) {
            done = false;
        }
        const ok = done && ta.value.slice(start, start + text.length) === text;
        if (!ok) {
            ta.setRangeText(text, start, end, 'end');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /** Type text at the worksheet caret (WorksheetUI first, then the textarea, then the sheet). */
    function insertText(text) {
        const ws = window.WorksheetUI;
        if (ws && typeof ws.insert === 'function') {
            try {
                ws.insert(text);
                return true;
            } catch (err) {
                console.error('[KeypadUI] WorksheetUI.insert failed:', err);
            }
        }
        const ta = editor();
        if (ta) {
            replaceRange(ta, ta.selectionStart, ta.selectionEnd, text);
            return true;
        }
        const sheet = State.activeSheet();
        return State.setSheetText(sheet.id, sheet.text + text);
    }

    /** The text of the caret's line before the caret, and the one-line selection (or ''). */
    function caretContext() {
        const ta = editor();
        if (!ta) return { before: null, selection: '' };
        const v = ta.value;
        const start = ta.selectionStart;
        const lineStart = v.lastIndexOf('\n', start - 1) + 1;
        const sel = v.slice(start, ta.selectionEnd);
        return { before: v.slice(lineStart, start), selection: sel.includes('\n') ? '' : sel };
    }

    function lineCount() {
        const text = State.activeSheet().text;
        let n = 1;
        for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
        return n;
    }

    /* ── Key actions ───────────────────────────────────────── */

    function activeDef(base) {
        return second && base.alt ? Object.assign({ kind: base.kind }, base.alt) : base;
    }

    /**
     * The text a key types, given the caret line's text before the caret
     * (null when unknown) and a one-line selection. Spacing keeps the line
     * readable and stops a key from gluing onto a name: x then sin types
     * " sin(", never "xsin(".
     */
    function textFor(def, ctx) {
        const before = ctx.before;
        const known = before !== null;
        const trimmed = known ? before.replace(/\s+$/, '') : '';
        const prev = known ? before.slice(-1) : '';
        const atStart = known && (before === '' || /\s$/.test(before));
        const lead = !known || atStart ? '' : ' ';
        const afterLetter = /\p{L}|_/u.test(prev);
        const afterDigit = /\p{N}/u.test(prev);
        const afterValue = afterLetter || afterDigit || prev === ')' || prev === '!' || prev === '%';

        if (def.kind === 'digit') return def.text || def.label;
        if (def.wrap && ctx.selection) {
            if (def.wrap === 'call') return `${def.text}${ctx.selection})`;
            return `(${ctx.selection})${def.text}`;
        }
        if (def.binary) {
            // A minus at the start of a line or after an operator is a sign, not a subtraction.
            if (def.id === 'subtract' && known && (trimmed === '' || /[(,+\-*/^=:]$|\b(?:to|as|in|of|mod)$/.test(trimmed))) {
                return '-';
            }
            return known ? `${lead}${def.text} ` : ` ${def.text} `;
        }
        if (def.spaced) return known ? `${lead}${def.text} ` : ` ${def.text} `;
        if (def.unit) return known ? `${lead}${def.text}` : ` ${def.text}`;
        if (def.id === 'pow10') return afterValue ? `${lead}* 10^` : def.text;
        if (def.wrap === 'call' && (afterLetter || afterDigit || prev === ')')) return ` ${def.text}`;
        if (def.word && (afterLetter || afterDigit)) {
            // 2π reads fine; e and ans after a digit would look like 2e5 or 2ans.
            return afterDigit && /^[πτφ]$/u.test(def.text) ? def.text : ` ${def.text}`;
        }
        return def.text;
    }

    function typeKey(def) {
        if (lineCount() > MAX_LINES) {
            notify(`This sheet has more than ${MAX_LINES.toLocaleString('en-US')} lines, the most mathMan works out. Start a new sheet to keep going.`, 'warning', 4000);
            return false;
        }
        return insertText(textFor(def, caretContext()));
    }

    function backspace() {
        const ta = editor();
        if (!ta) {
            notify('Backspace needs the worksheet, which did not load. Reload the page to try again.', 'warning', 3600);
            return false;
        }
        let start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start === end) {
            if (start === 0) return false;
            start -= 1;
            // Never split a character made of two UTF-16 units.
            const code = ta.value.charCodeAt(start);
            if (start > 0 && code >= 0xDC00 && code <= 0xDFFF) start -= 1;
        }
        replaceRange(ta, start, end, '');
        return true;
    }

    function clearLine() {
        const ta = editor();
        if (!ta) {
            notify('Clearing a line needs the worksheet, which did not load. Reload the page to try again.', 'warning', 3600);
            return false;
        }
        const v = ta.value;
        const caret = ta.selectionStart;
        const start = v.lastIndexOf('\n', caret - 1) + 1;
        let end = v.indexOf('\n', caret);
        if (end === -1) end = v.length;
        if (start === end) return false;
        const lineNo = v.slice(0, start).split('\n').length;
        replaceRange(ta, start, end, '');
        notify(`Cleared line ${lineNo}. Press Ctrl+Z in the worksheet to bring it back.`, 'info', 2600);
        return true;
    }

    /** = ends the caret's line and starts a new one below it. */
    function equals() {
        const ta = editor();
        if (ta) {
            const v = ta.value;
            const caret = ta.selectionEnd;
            const start = v.lastIndexOf('\n', caret - 1) + 1;
            let end = v.indexOf('\n', caret);
            if (end === -1) end = v.length;
            if (!v.slice(start, end).trim()) {
                notify('This line is empty. Type a calculation, then press = to start the next line.', 'info', 2600);
                return false;
            }
            ta.setSelectionRange(end, end);
        }
        if (lineCount() >= MAX_LINES) {
            notify(`This sheet has ${MAX_LINES.toLocaleString('en-US')} lines, the most mathMan works out. Start a new sheet to keep going.`, 'warning', 4000);
            return false;
        }
        return insertText('\n');
    }

    /** Run a key by id ('7', 'add', 'sqrt', 'equals', 'u-km', …). Returns true when it did something. */
    function press(id) {
        const base = MAIN_KEYS.find((k) => k.id === id)
            || SCI_KEYS.find((k) => k.id === id || (k.alt && k.alt.id === id))
            || UNIT_KEYS.find((k) => k.id === id);
        if (!base) return false;
        let def = base;
        if (SCI_KEYS.includes(base)) def = base.alt && base.alt.id === id ? Object.assign({ kind: base.kind }, base.alt) : activeDef(base);
        if (UNIT_KEYS.includes(base)) def = Object.assign({ unit: !base.spaced }, base);
        let done;
        if (def.action === 'back') done = backspace();
        else if (def.action === 'clear') done = clearLine();
        else if (def.action === 'equals') done = equals();
        else done = typeKey(def);
        speak = Boolean(done);
        schedule();
        return Boolean(done);
    }

    /* ── Display: the current line and its answer ─────────── */

    const lineOf = (text, offset) => {
        let n = 0;
        for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) n++;
        return n;
    };

    const hasValue = (l) => Boolean(l) && (l.kind === 'value' || l.kind === 'assignment') && Boolean(l.display || l.plain);

    function caretLine() {
        const ws = window.WorksheetUI;
        if (ws && typeof ws.currentResult === 'function') {
            try {
                return ws.currentResult() || null;
            } catch (err) {
                console.error('[KeypadUI] WorksheetUI.currentResult failed:', err);
            }
        }
        const result = State.result();
        const ta = editor();
        if (ta) return result.lines[lineOf(ta.value, ta.selectionStart)] || null;
        return null;
    }

    /** The line to show: the caret's line, or on a blank line the nearest answer above it. */
    function shownLine() {
        const line = caretLine();
        const lines = State.result().lines || [];
        if (line && line.kind !== 'blank' && line.kind !== 'comment' && line.kind !== 'heading') return { line, above: false };
        const from = line && Number.isInteger(line.index) ? line.index - 1 : lines.length - 1;
        for (let i = Math.min(from, lines.length - 1); i >= 0; i--) {
            if (hasValue(lines[i])) return { line: lines[i], above: true };
            if (lines[i].kind === 'heading') break;
        }
        return { line: null, above: false };
    }

    function renderDisplay() {
        if (!els.display) return;
        const { line, above } = shownLine();
        const exprText = line ? String(line.source || '').replace(/\/\/.*$/, '').trim() : '';
        els.display.dataset.state = !line ? 'empty' : line.kind === 'error' ? 'error' : 'value';

        if (!line) {
            els.meta.textContent = 'Display';
            els.expr.textContent = '';
            els.value.textContent = 'Press keys to build a calculation';
            els.exact.textContent = '';
            els.copy.disabled = true;
            els.copy.title = 'Nothing to copy yet';
            announce();
            return;
        }
        const n = line.index + 1;
        els.meta.textContent = `${above ? 'Above · ' : ''}Line ${n}${line.label ? ` · ${line.label}` : ''}`;
        els.expr.textContent = exprText;
        els.expr.title = exprText;
        if (line.kind === 'error') {
            const msg = line.error && line.error.message ? line.error.message : 'This line could not be worked out';
            els.value.textContent = `Error: ${msg}`;
            els.exact.textContent = '';
            els.copy.disabled = true;
            els.copy.title = 'This line has an error, so there is no result to copy';
        } else if (line.kind === 'function') {
            els.value.textContent = 'Function defined';
            els.exact.textContent = '';
            els.copy.disabled = true;
            els.copy.title = 'A function definition has no result to copy';
        } else {
            const shown = line.display || line.plain || '';
            els.value.textContent = shown ? `= ${shown}` : '';
            els.exact.textContent = line.exact ? `exactly ${line.exact}` : '';
            els.copy.disabled = !shown;
            els.copy.title = shown ? `Copy ${line.plain || shown}` : 'Nothing to copy yet';
        }
        announce();
    }

    /** After a key press, say the line and its answer once. */
    function announce() {
        if (!speak || !els.live) return;
        speak = false;
        const parts = [els.meta.textContent, els.expr.textContent, els.value.textContent].filter(Boolean);
        els.live.textContent = parts.join(', ');
    }

    function copyShown() {
        const { line } = shownLine();
        if (!hasValue(line)) {
            notify('Put the caret on a line with a result first.', 'info', 2400);
            return;
        }
        const text = line.plain || line.display;
        if (window.ToolApp) ToolApp.copy(text, text.length > 32 ? `${text.slice(0, 31)}…` : text, els.copy);
    }

    /* ── Scheduling: redraw once per frame, only while open ── */

    function section() {
        return els.mount ? els.mount.closest('.tool-section') : null;
    }

    function isOpen() {
        const s = section();
        return !s || s.dataset.collapsed !== 'true';
    }

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!isOpen()) {
                stale = true;
                return;
            }
            stale = false;
            renderDisplay();
        });
    }

    function watchOpen() {
        const s = section();
        if (!s || !window.MutationObserver) return;
        new MutationObserver(() => { if (stale && isOpen()) schedule(); })
            .observe(s, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    /* ── Build ─────────────────────────────────────────────── */

    function keyButton(def, extraClass) {
        const btn = DOM.create('button', {
            className: `tool-action-btn kp-key${extraClass ? ` ${extraClass}` : ''}`,
            attrs: { type: 'button', 'data-key': def.id, 'data-kind': def.kind || 'unit', tabindex: '-1' }
        });
        btn.appendChild(DOM.create('span', { className: 'kp-key-label', text: def.label, attrs: def.name ? { 'aria-hidden': 'true' } : {} }));
        if (def.name) {
            btn.setAttribute('aria-label', def.name);
            btn.title = def.text && def.kind !== 'digit' && !def.action ? `${def.name} — types ${def.text.trim() || def.text}` : def.name;
        }
        els.keys[def.id] = btn;
        return btn;
    }

    function grid(defs, label, className) {
        const g = DOM.create('div', { className: `kp-grid ${className}`, attrs: { role: 'group', 'aria-label': label } });
        defs.forEach((d) => g.appendChild(keyButton(d)));
        const first = g.querySelector('button');
        if (first) first.tabIndex = 0;
        return g;
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'ta-pane kp' });

        // Display
        els.meta = DOM.create('span', { className: 'kp-display-meta' });
        els.copy = DOM.create('button', {
            className: 'icon-action kp-copy',
            attrs: { type: 'button', 'aria-label': 'Copy this result', title: 'Copy this result' }
        });
        els.copy.appendChild(icon(ICON_COPY, 15));
        els.expr = DOM.create('div', { className: 'kp-display-expr' });
        els.value = DOM.create('div', { className: 'kp-display-value' });
        els.exact = DOM.create('div', { className: 'kp-display-exact' });
        els.display = DOM.create('div', {
            className: 'kp-display',
            children: [
                DOM.create('div', { className: 'kp-display-head', children: [els.meta, els.copy] }),
                els.expr,
                els.value,
                els.exact
            ]
        });
        root.appendChild(els.display);
        // Spoken only after a key press, so moving the caret stays quiet.
        els.live = DOM.create('div', { className: 'ta-sr', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.live);

        // Modes: 2nd and DEG / RAD
        els.second = DOM.create('button', {
            className: 'chip-btn kp-mode',
            text: '2nd',
            attrs: {
                type: 'button',
                'aria-pressed': 'false',
                'aria-label': 'Second functions',
                title: 'Second functions: inverse trig, eˣ, 10ˣ, cube root, x³, round, τ, φ'
            }
        });
        els.angle = DOM.create('button', {
            className: 'chip-btn kp-mode kp-angle',
            text: 'RAD',
            attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Degrees mode (DEG / RAD)' }
        });
        els.modeNote = DOM.create('span', { className: 'kp-mode-note', text: 'Keys type at the worksheet caret' });
        root.appendChild(DOM.create('div', { className: 'kp-modes', children: [els.second, els.angle, els.modeNote] }));

        // Function keys, then the main pad
        els.sciGrid = grid(SCI_KEYS, 'Function keys', 'kp-grid--sci');
        els.mainGrid = grid(MAIN_KEYS, 'Number keys', 'kp-grid--main');
        root.appendChild(els.sciGrid);
        root.appendChild(els.mainGrid);

        // Unit shortcuts
        root.appendChild(DOM.create('p', { className: 'section-label', text: 'Units', attrs: { id: 'kp-units-label' } }));
        els.unitRow = DOM.create('div', { className: 'chip-row kp-units', attrs: { role: 'group', 'aria-labelledby': 'kp-units-label' } });
        UNIT_KEYS.forEach((u) => {
            const btn = DOM.create('button', {
                className: 'chip-btn kp-unit',
                text: u.label,
                attrs: {
                    type: 'button',
                    'data-key': u.id,
                    'aria-label': u.spaced ? u.name : `Type the unit ${u.label}, ${u.name}`,
                    title: u.spaced ? `${u.name}: 5 km to mi` : `${u.name} (${u.label})`
                }
            });
            els.keys[u.id] = btn;
            els.unitRow.appendChild(btn);
        });
        root.appendChild(els.unitRow);

        root.appendChild(DOM.create('p', {
            className: 'pane-hint',
            text: '= starts a new line. Select text in the worksheet first and a function key wraps it, like sqrt(2 + 2).'
        }));

        mount.appendChild(root);
        els.root = root;
    }

    /* ── Render ────────────────────────────────────────────── */

    function renderSecond() {
        els.second.setAttribute('aria-pressed', String(second));
        els.second.textContent = second ? '2nd on' : '2nd';
        SCI_KEYS.forEach((base) => {
            const btn = els.keys[base.id];
            if (!btn) return;
            const def = activeDef(base);
            btn.querySelector('.kp-key-label').textContent = def.label;
            btn.setAttribute('aria-label', def.name);
            btn.title = `${def.name} — types ${def.text}`;
            btn.dataset.alt = String(second && Boolean(base.alt));
        });
    }

    function renderAngle() {
        const deg = State.settings().angle === 'deg';
        els.angle.textContent = deg ? 'DEG' : 'RAD';
        els.angle.setAttribute('aria-pressed', String(deg));
        els.angle.title = deg
            ? 'Angles in degrees — click for radians (Ctrl+Alt+D)'
            : 'Angles in radians — click for degrees (Ctrl+Alt+D)';
    }

    function render() {
        if (!els.root) return;
        renderSecond();
        renderAngle();
        renderDisplay();
    }

    /* ── Events ────────────────────────────────────────────── */

    function setSecond(on) {
        second = Boolean(on);
        save({ second });
        renderSecond();
        return second;
    }

    function toggleAngle() {
        const next = State.settings().angle === 'deg' ? 'rad' : 'deg';
        const result = State.applySettings({ angle: next });
        if (!result.applied.includes('angle')) {
            notify('Could not change the angle unit.', 'warning', 2400);
            return;
        }
        notify(next === 'deg' ? 'Angles in degrees: sin(90) is 1' : 'Angles in radians: sin(pi/2) is 1', 'info', 1800);
    }

    /** Arrow keys move between keys in a grid; one tab stop per grid. */
    function moveFocus(gridEl, current, key) {
        const keys = DOM.$$('button', gridEl);
        const i = keys.indexOf(current);
        if (i === -1) return false;
        let next = i;
        if (key === 'ArrowRight') next = Math.min(keys.length - 1, i + 1);
        else if (key === 'ArrowLeft') next = Math.max(0, i - 1);
        else if (key === 'ArrowDown') next = i + COLS < keys.length ? i + COLS : i;
        else if (key === 'ArrowUp') next = i - COLS >= 0 ? i - COLS : i;
        else if (key === 'Home') next = i - (i % COLS);
        else if (key === 'End') next = Math.min(keys.length - 1, i - (i % COLS) + COLS - 1);
        else return false;
        keys.forEach((k) => { k.tabIndex = -1; });
        keys[next].tabIndex = 0;
        keys[next].focus();
        return true;
    }

    function onKeyClick(e) {
        const btn = e.target.closest('button[data-key]');
        if (!btn || !els.root.contains(btn)) return;
        const id = btn.dataset.key;
        const byKeyboard = e.detail === 0;
        const gridEl = btn.closest('.kp-grid');
        if (gridEl) {
            DOM.$$('button', gridEl).forEach((k) => { k.tabIndex = -1; });
            btn.tabIndex = 0;
        }
        // Resolve the visible meaning of a function key (2nd may be on).
        const base = SCI_KEYS.find((k) => k.id === id);
        press(base ? activeDef(base).id : id);
        // Keyboard and touch keep focus on the keypad (no on-screen keyboard
        // pops up); a mouse click leaves the caret in the worksheet.
        if (byKeyboard || lastPointer !== 'mouse') btn.focus({ preventScroll: true });
    }

    function onRootKeydown(e) {
        const btn = e.target.closest ? e.target.closest('button') : null;
        if (!btn || !els.root.contains(btn)) return;
        const gridEl = btn.closest('.kp-grid');
        if (gridEl && !e.altKey && !e.ctrlKey && !e.metaKey && moveFocus(gridEl, btn, e.key)) {
            e.preventDefault();
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!Object.prototype.hasOwnProperty.call(TYPED, e.key)) return;
        const id = TYPED[e.key];
        e.preventDefault();
        const target = els.keys[id];
        if (target && window.ToolApp) ToolApp.flash(target);
        press(id);
        btn.focus({ preventScroll: true });
    }

    function watchWorksheetCaret() {
        const mount = DOM.id('mount-worksheet');
        if (!mount) return;
        ['keyup', 'mouseup', 'focusin'].forEach((evt) => mount.addEventListener(evt, schedule));
        document.addEventListener('selectionchange', () => {
            if (mount.contains(document.activeElement)) schedule();
        });
    }

    function bind() {
        // A mouse press must not steal focus from the worksheet's caret.
        els.root.addEventListener('mousedown', (e) => {
            if (e.target.closest('button[data-key]')) e.preventDefault();
        });
        els.root.addEventListener('pointerdown', (e) => {
            lastPointer = e.pointerType || 'mouse';
        });
        els.root.addEventListener('click', onKeyClick);
        els.root.addEventListener('keydown', onRootKeydown);

        DOM.on(els.second, 'click', () => setSecond(!second));
        DOM.on(els.angle, 'click', toggleAngle);
        DOM.on(els.copy, 'click', copyShown);

        State.on('results', schedule);
        State.on('active', schedule);
        State.on('settings', () => {
            renderAngle();
            schedule();
        });
        const reload = () => {
            second = prefs().second;
            render();
        };
        State.on('reset', reload);
        State.on('panes', (p) => {
            if (p && (p.action === 'reset' || p.action === 'import')) reload();
        });
        watchWorksheetCaret();
    }

    /* ── Public API ────────────────────────────────────────── */

    const KeypadUI = {
        init() {
            const mount = DOM.id('mount-keypad');
            if (!mount || els.root) return;
            els.mount = mount;
            second = prefs().second;
            build(mount);
            bind();
            render();
            watchOpen();
        },
        press,
        setSecond,
        refresh: render,
        /** For tests: the text a key would type after `before` with `selection` selected. */
        textFor(id, before = '', selection = '') {
            const base = MAIN_KEYS.find((k) => k.id === id) || SCI_KEYS.find((k) => k.id === id) || UNIT_KEYS.find((k) => k.id === id);
            if (!base) return null;
            let def = SCI_KEYS.includes(base) ? activeDef(base) : base;
            if (UNIT_KEYS.includes(base)) def = Object.assign({ unit: !base.spaced }, base);
            return def.action ? null : textFor(def, { before, selection });
        }
    };

    window.KeypadUI = KeypadUI;
})();
