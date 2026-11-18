/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MathManBoot (mathMan Edition - v1.0)
 *     - File Name: app.js
 *     - Relative Path: tools/mathman/js/app.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Starts mathMan: one ToolApp.boot() call that restores saved state,
 *     brings up the rails and dialogs, initialises every pane module, and
 *     registers the worksheet shortcuts. It also runs the shell's own chrome
 *     (sheet name, new sheet, copy result, DEG / RAD, stat pills, section
 *     counts, footers) from State, and gives each action a working fallback
 *     so the page stays usable if a pane module is missing.
 *
 * ✒ Key Features:
 *     - Boots the ten pane modules in contract order; a missing or failing
 *       module is logged and skipped, never fatal
 *     - Shortcuts: Ctrl+Shift+C copy the current line's result, Ctrl+/
 *       toggle // notes, Ctrl+Enter add the result to History, Ctrl+Alt+N
 *       new sheet, Ctrl+Alt+D degrees / radians (Alt combinations also match
 *       by physical key, so macOS Option characters still work)
 *     - Every action asks WorksheetUI first (currentResult, selectionSummary,
 *       focus, toggleComment) and falls back to the worksheet's textarea and
 *       State.result() when the module or method is missing
 *     - Toolbar controls that no module claimed (data-wired) get handlers
 *       here, so nothing is ever bound twice
 *     - Sheet name field: Enter keeps, Escape reverts, an empty name is
 *       explained inline and never saved
 *     - Chrome sync from State events: stat pills (lines, values, errors,
 *       selection sum and mean), rail counts, Library and Workbench footers,
 *       the DEG / RAD button, and the sheet name
 *     - Settings binder with live labels and previews (digits, notation),
 *       inline checks that hold Save on an unusable value, a History trim
 *       warning, and a guarded reset
 *     - Backup import report: what was added, and a confirm before the
 *       backup's differing settings replace the visitor's own
 *     - Stray file drops are refused with a hint instead of navigating away
 *     - Loader messages in the mathMan voice
 *
 * ✒ Usage Instructions:
 *     Load last, after the shared libraries, js/engine.js, js/numerics.js,
 *     js/finance.js, js/state.js, and every js/ui/*.js module. Nothing to
 *     call: the IIFE boots on DOMContentLoaded through ToolApp.boot(). A
 *     module that binds one of the shell's toolbar controls itself should
 *     set data-wired="true" on that element during init() so the fallback
 *     here stays out of the way.
 *
 * ✒ Examples:
 *     Ctrl+Shift+C on "2 + 3 * 4"      → copies 14 and toasts "Copied 14 (line 6)"
 *     Ctrl+/ on two selected lines     → both become "// …" notes; again restores them
 *     Ctrl+Enter                       → State.pushHistory({ expr, display, plain })
 *     Ctrl+Alt+D                       → State.applySettings({ angle: 'deg' }); the button reads DEG
 *     Stat pills                       → 'Lines: 47', 'Values: 30', 'Errors: 0', 'Sum 1,830 · Mean 610 · 3 values'
 *     MathManApp.sync()                → re-reads State into the pills, counts, and footers
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, dom.js, storage.js, loader.js,
 *       workbench.js, dialogs.js, toolapp.js; js/state.js; optional
 *       js/engine.js (window.MathEngine) and the js/ui/*.js pane modules
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the textarea fallbacks assume the worksheet edits text
 *       in a <textarea> inside #mount-worksheet; a module that binds a
 *       toolbar control without setting data-wired would run two handlers
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    if (window.Loader) {
        Loader.messages = ['Sharpening pencils…', 'Carrying the ones…', 'Checking the units…', 'Almost ready…'];
    }

    const MODULES = [
        'WorksheetUI', 'LibraryUI',
        'KeypadUI', 'UnitsUI', 'GraphUI',
        'StatsUI', 'SolverUI', 'NumTheoryUI',
        'PercentUI', 'MoneyUI'
    ];

    const KIND_WORDS = { blank: 'blank line', comment: 'note', heading: 'heading', function: 'function definition' };

    const SETTING_HINTS = {
        precision: 'Significant digits must be a whole number from 4 to 16.',
        historySize: 'Results to keep in History must be a whole number from 20 to 500.'
    };

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word, many) => `${n.toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;

    function joinList(parts) {
        if (parts.length < 2) return parts.join('');
        return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    }

    function setText(id, text) {
        const el = DOM.id(id);
        if (el && el.textContent !== text) el.textContent = text;
        return el;
    }

    function shorten(text, max = 32) {
        const s = String(text);
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    /* ── Module access (never throws) ──────────────────────── */

    /** A read-only query: { ok, value }; a missing method or a throw means ok:false (use the fallback). */
    function query(mod, method, ...args) {
        const m = window[mod];
        if (!m || typeof m[method] !== 'function') return { ok: false };
        try {
            return { ok: true, value: m[method](...args) };
        } catch (err) {
            console.error(`[mathMan] ${mod}.${method} failed:`, err);
            return { ok: false };
        }
    }

    /** An action with side effects: true when the module handled it (even if it then threw). */
    function invoke(mod, method, ...args) {
        const m = window[mod];
        if (!m || typeof m[method] !== 'function') return false;
        try {
            m[method](...args);
        } catch (err) {
            console.error(`[mathMan] ${mod}.${method} failed:`, err);
        }
        return true;
    }

    /* ── Worksheet fallbacks ───────────────────────────────── */

    /** The worksheet's editing surface, if the module renders a textarea. */
    function editor() {
        const mount = DOM.id('mount-worksheet');
        return mount ? DOM.$('textarea', mount) : null;
    }

    const lineOf = (text, offset) => {
        let n = 0;
        for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) n++;
        return n;
    };

    const hasValue = (line) => Boolean(line) && (line.kind === 'value' || line.kind === 'assignment')
        && Boolean(line.plain || line.display);

    let lastResult = null;

    function currentResultObj() {
        return lastResult || State.result();
    }

    /** The LineResult under the caret (WorksheetUI first), or null. */
    function currentLine() {
        const q = query('WorksheetUI', 'currentResult');
        if (q.ok) return q.value || null;
        const result = currentResultObj();
        const ta = editor();
        if (ta) return result.lines[lineOf(ta.value, ta.selectionStart)] || null;
        for (let i = result.lines.length - 1; i >= 0; i--) {
            if (hasValue(result.lines[i])) return result.lines[i];
        }
        return null;
    }

    /** Selected value lines → { count, sum, mean, unit } (sum null for mixed units), or null. */
    function fallbackSelection() {
        const ta = editor();
        if (!ta || ta.selectionStart === ta.selectionEnd) return null;
        const text = ta.value;
        let end = ta.selectionEnd;
        if (text[end - 1] === '\n') end--;
        const first = lineOf(text, ta.selectionStart);
        const last = lineOf(text, end);
        const lines = currentResultObj().lines.slice(first, last + 1)
            .filter((l) => hasValue(l) && typeof l.numeric === 'number' && Number.isFinite(l.numeric));
        if (!lines.length) return null;
        const unit = lines[0].unit || '';
        const same = lines.every((l) => (l.unit || '') === unit);
        const sum = same ? lines.reduce((acc, l) => acc + l.numeric, 0) : null;
        return { count: lines.length, sum, mean: same ? sum / lines.length : null, unit: same ? unit : null };
    }

    function selectionSummary() {
        const q = query('WorksheetUI', 'selectionSummary');
        return q.ok ? (q.value || null) : fallbackSelection();
    }

    function focusWorksheet() {
        if (invoke('WorksheetUI', 'focus')) return;
        const ta = editor();
        if (ta) ta.focus();
    }

    /** Replace [start, end) in the textarea, keeping the browser's undo history when it can. */
    function replaceRange(ta, start, end, text) {
        ta.focus();
        ta.setSelectionRange(start, end);
        let done = false;
        try {
            done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
        } catch (_err) {
            done = false;
        }
        if (!done || ta.value.slice(start, start + text.length) !== text) {
            ta.setRangeText(text, start, end, 'end');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /** Ctrl+/ without WorksheetUI: add or remove '// ' at the start of every touched line. */
    function fallbackToggleComment() {
        const ta = editor();
        if (!ta) {
            notify('The worksheet did not load, so there is no line to turn into a note.', 'warning', 3000);
            return;
        }
        const text = ta.value;
        const selStart = ta.selectionStart;
        const selEnd = ta.selectionEnd;
        let end = selEnd;
        if (end > selStart && text[end - 1] === '\n') end--;
        const blockStart = text.lastIndexOf('\n', selStart - 1) + 1;
        let blockEnd = text.indexOf('\n', end);
        if (blockEnd === -1) blockEnd = text.length;

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
        replaceRange(ta, blockStart, blockEnd, next);
        if (selStart === selEnd) {
            const caret = Math.max(blockStart, selStart + firstDelta);
            ta.setSelectionRange(caret, caret);
        } else {
            ta.setSelectionRange(blockStart, blockStart + next.length);
        }
    }

    /* ── Actions ───────────────────────────────────────────── */

    /** Why a line has no copyable result, or '' when it has one. */
    function lineProblem(line) {
        if (!line) return 'Put the caret on a line with a result first.';
        const n = (Number(line.index) || 0) + 1;
        if (line.kind === 'error') {
            const why = line.error && line.error.message ? line.error.message : 'it could not be worked out';
            return `Line ${n} has an error: ${why}`;
        }
        if (!hasValue(line)) {
            const kind = Object.prototype.hasOwnProperty.call(KIND_WORDS, line.kind) ? KIND_WORDS[line.kind] : 'line without a value';
            return `Line ${n} is a ${kind}, so it has no result. Put the caret on a line with a result.`;
        }
        return '';
    }

    const actions = {
        /** Copy the current line's result (plain form: no separators, unit appended). */
        copyResult(button) {
            const line = currentLine();
            const problem = lineProblem(line);
            if (problem) {
                notify(problem, line && line.kind === 'error' ? 'warning' : 'info', 3600);
                return Promise.resolve(false);
            }
            const text = line.plain || line.display;
            const btn = button instanceof Element ? button : DOM.id('btn-copy-result');
            return ToolApp.copy(text, `${shorten(text)} (line ${line.index + 1})`, btn);
        },

        /** Add the current line's calculation and result to History. */
        addToHistory() {
            const line = currentLine();
            const problem = lineProblem(line);
            if (problem) {
                notify(problem, line && line.kind === 'error' ? 'warning' : 'info', 3600);
                return null;
            }
            const expr = String(line.source || '').replace(/\/\/.*$/, '').trim() || line.display;
            const entry = State.pushHistory({ expr, display: line.display || line.plain, plain: line.plain || line.display });
            if (entry) notify(`Added to History: ${shorten(expr, 40)} = ${shorten(entry.display, 40)}`, 'success', 1800);
            else notify(State.lastError || 'Could not add that result to History.', 'warning', 3600);
            return entry;
        },

        /** Ctrl+/: only for the worksheet (or when no field has focus), never another tool's field. */
        toggleComment() {
            const active = document.activeElement;
            const mount = DOM.id('mount-worksheet');
            const inField = Boolean(active) && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
            if (inField && !(mount && mount.contains(active))) return;
            if (invoke('WorksheetUI', 'toggleComment')) return;
            fallbackToggleComment();
        },

        newSheet() {
            const sheet = State.addSheet();
            if (!sheet) {
                notify(State.lastError || 'Could not add a sheet.', 'warning', 4000);
                return null;
            }
            if (window.Workbench && Workbench.isMobile()) Workbench.setMobileOpen(null);
            notify(`New sheet: ${sheet.name}`, 'success', 1500);
            focusWorksheet();
            return sheet;
        },

        toggleAngle() {
            const next = State.settings().angle === 'deg' ? 'rad' : 'deg';
            const result = State.applySettings({ angle: next });
            if (!result.applied.includes('angle')) {
                notify('Could not change the angle unit.', 'warning', 2400);
                return;
            }
            notify(next === 'deg' ? 'Angles in degrees: sin(90) is 1' : 'Angles in radians: sin(pi/2) is 1', 'info', 1800);
        },

        focusWorksheet
    };

    /* ── Toolbar wiring (only for controls no module claimed) ── */

    function claim(id, event, handler) {
        const el = DOM.id(id);
        if (!el || el.dataset.wired === 'true') return null;
        el.dataset.wired = 'true';
        DOM.on(el, event, handler);
        return el;
    }

    function wireToolbar() {
        claim('btn-new-sheet', 'click', () => actions.newSheet());
        claim('btn-copy-result', 'click', (e) => actions.copyResult(e.currentTarget));
        claim('btn-angle', 'click', () => actions.toggleAngle());
        wireSheetTitle();
    }

    /** The sheet name field: Enter keeps, Escape reverts, an empty name is explained, not saved. */
    function wireSheetTitle() {
        const input = DOM.id('sheet-title');
        const error = DOM.id('sheet-title-error');
        if (!input || input.dataset.wired === 'true') return;
        input.dataset.wired = 'true';

        const show = (msg) => {
            if (error && error.textContent !== msg) error.textContent = msg;
            if (msg) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        };
        const current = () => State.activeSheet().name;
        let reverting = false;

        const commit = () => {
            if (reverting) return;
            const name = current();
            if (!input.value.trim()) {
                input.value = name;
                show('');
                notify(`Kept the name “${name}” — a sheet needs a name.`, 'info', 2400);
                return;
            }
            const saved = State.renameSheet(State.activeSheet().id, input.value);
            if (saved) {
                input.value = saved;
                show('');
            } else {
                show(State.lastError || 'That name could not be saved.');
            }
        };

        DOM.on(input, 'input', () => {
            show(input.value.trim() ? '' : `A sheet needs a name. Type one, or press Escape to keep “${current()}”.`);
        });
        DOM.on(input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                focusWorksheet();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                reverting = true;
                input.value = current();
                show('');
                input.blur();
                reverting = false;
            }
        });
        DOM.on(input, 'change', commit);
    }

    /* ── Chrome sync: pills, counts, footers, angle, title ──── */

    function syncTitle() {
        const input = DOM.id('sheet-title');
        if (!input) return;
        const name = State.activeSheet().name;
        if (document.activeElement !== input && input.value !== name) input.value = name;
        input.title = `Sheet name: ${name} — type a new name and press Enter to keep it`;
    }

    function syncAngle() {
        const btn = DOM.id('btn-angle');
        if (!btn) return;
        const deg = State.settings().angle === 'deg';
        const text = deg ? 'DEG' : 'RAD';
        if (btn.textContent !== text) btn.textContent = text;
        btn.setAttribute('aria-pressed', String(deg));
        btn.title = deg
            ? 'Angles in degrees — click for radians (Ctrl+Alt+D)'
            : 'Angles in radians — click for degrees (Ctrl+Alt+D)';
    }

    function syncStats(result = currentResultObj()) {
        const c = result.counts || {};
        const lines = Number(c.lines) || 0;
        const values = Number(c.values) || 0;
        const errors = Number(c.errors) || 0;
        setText('stat-lines', `Lines: ${lines.toLocaleString('en-US')}`);
        setText('stat-values', `Values: ${values.toLocaleString('en-US')}`);
        const pill = setText('stat-errors', `Errors: ${errors.toLocaleString('en-US')}`);
        if (pill) {
            pill.dataset.errors = String(errors);
            pill.title = result.engineError
                ? result.engineError
                : errors ? `${plural(errors, 'line')} ${errors === 1 ? 'has an error' : 'have errors'}` : 'No lines have errors';
        }
        const valuesPill = DOM.id('stat-values');
        if (valuesPill) valuesPill.title = `${plural(values, 'line')} with a value`;
        const linesPill = DOM.id('stat-lines');
        if (linesPill) linesPill.title = `${plural(lines, 'line')} in this sheet (up to 2,000)`;
    }

    function syncSelection() {
        const pill = DOM.id('stat-selection');
        if (!pill) return;
        const s = selectionSummary();
        let text = 'No selection';
        let title = 'Select several lines in the worksheet to see their sum and mean';
        if (s && Number(s.count) > 0) {
            const unit = s.unit ? ` ${s.unit}` : '';
            const fmt = (n) => `${State.formatNumber(n)}${unit}`;
            if (s.sum === null || s.sum === undefined || !Number.isFinite(Number(s.sum))) {
                text = `${plural(Number(s.count), 'value')} · mixed units`;
                title = 'The selected lines use different units, so they are not added up';
            } else if (Number(s.count) === 1) {
                text = `Selection: ${fmt(Number(s.sum))}`;
                title = 'One selected line has a value';
            } else {
                text = `Sum ${fmt(Number(s.sum))} · Mean ${fmt(Number(s.mean))} · ${plural(Number(s.count), 'value')}`;
                title = `Sum and mean of the ${Number(s.count)} selected values`;
            }
        }
        setText('stat-selection', text);
        pill.title = title;
        pill.dataset.active = String(Boolean(s && Number(s.count) > 0));
    }

    let selectionFrame = 0;
    function scheduleSelection() {
        if (!selectionFrame) {
            selectionFrame = requestAnimationFrame(() => {
                selectionFrame = 0;
                syncSelection();
            });
        }
    }

    function wireSelectionWatch() {
        const mount = DOM.id('mount-worksheet');
        if (!mount) return;
        ['select', 'keyup', 'mouseup', 'input', 'focusin', 'focusout', 'selectionchange'].forEach((evt) => {
            mount.addEventListener(evt, scheduleSelection, evt === 'selectionchange');
        });
        document.addEventListener('selectionchange', () => {
            if (mount.contains(document.activeElement)) scheduleSelection();
        });
    }

    function nameCount(result) {
        return (result.variables ? result.variables.length : 0) + (result.functions ? result.functions.length : 0);
    }

    function syncCounts(result = currentResultObj()) {
        const sheets = State.sheets().length;
        const vars = result.variables ? result.variables.length : 0;
        const fns = result.functions ? result.functions.length : 0;
        const names = vars + fns;
        const history = State.history().length;
        const sheetName = State.activeSheet().name;

        setText('count-sheets', String(sheets));
        setText('count-variables', String(names));
        setText('count-history', String(history));
        const countVars = DOM.id('count-variables');
        if (countVars) countVars.title = `${plural(vars, 'variable')} and ${plural(fns, 'function')} on “${sheetName}”`;
        const countHistory = DOM.id('count-history');
        if (countHistory) countHistory.title = `${plural(history, 'result')} in History`;

        const stats = setText('library-stats', `Sheets: ${sheets} | Variables: ${names}`);
        if (stats) stats.title = `${plural(sheets, 'sheet')} in this browser; ${plural(vars, 'variable')} and ${plural(fns, 'function')} on “${sheetName}”`;
    }

    function syncReferenceCount() {
        const el = DOM.id('count-reference');
        const ref = window.MathEngine && MathEngine.reference;
        const fns = ref && Array.isArray(ref.functions) ? ref.functions.length : 0;
        if (!el) return;
        el.hidden = !fns;
        el.textContent = String(fns);
        if (fns) {
            const units = Array.isArray(ref.units) ? ref.units.length : 0;
            el.title = `${plural(fns, 'function')}${units ? ` and ${plural(units, 'unit')}` : ''} you can use in a sheet`;
        }
    }

    function syncStageFooter(result = currentResultObj()) {
        const c = result.counts || {};
        const errors = Number(c.errors) || 0;
        const lines = Number(c.lines) || 0;
        const angle = State.settings().angle === 'deg' ? 'Degrees' : 'Radians';
        const sheet = State.activeSheet().name;
        const health = result.engineError
            ? 'math engine missing — reload the page'
            : errors ? plural(errors, 'error') : 'no errors';
        const text = `${sheet} · ${plural(lines, 'line')} · ${health} · ${angle}`;
        const el = setText('stage-footer-status', text);
        if (el && el.title !== text) el.title = text;
    }

    function sync() {
        lastResult = State.result();
        syncTitle();
        syncAngle();
        syncStats(lastResult);
        syncCounts(lastResult);
        syncStageFooter(lastResult);
        syncReferenceCount();
        syncSelection();
    }

    function subscribeChrome() {
        State.on('results', ({ result } = {}) => {
            if (result) lastResult = result;
            syncStats(lastResult);
            syncCounts(lastResult);
            syncStageFooter(lastResult);
            scheduleSelection();
        });
        State.on('sheets', () => {
            syncTitle();
            syncCounts();
            syncStageFooter();
        });
        State.on('active', () => {
            syncTitle();
            scheduleSelection();
        });
        State.on('history', () => syncCounts());
        State.on('settings', () => {
            syncAngle();
            syncStageFooter();
            scheduleSelection();
        });
        State.on('reset', sync);
    }

    /* ── File drops outside a drop zone ────────────────────── */

    /**
     * A file dropped where no pane takes it would make the browser leave
     * mathMan and open it. The page refuses it and says what to do instead;
     * a pane that accepts files calls preventDefault() first and is left
     * alone, and text drags into fields are untouched.
     */
    function guardFileDrops() {
        const carriesFiles = (e) => Boolean(e.dataTransfer)
            && Array.from(e.dataTransfer.types || []).includes('Files');
        let lastHint = 0;

        window.addEventListener('dragover', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'none';
        });
        window.addEventListener('drop', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            if (Date.now() - lastHint < 1500) return;
            lastHint = Date.now();
            notify('mathMan does not open dropped files here. Paste the numbers into the worksheet or the Statistics pane instead.', 'info', 4000);
        });
    }

    /* ── Settings ──────────────────────────────────────────── */

    const NOTATION_WORDS = { auto: 'automatic', fixed: 'fixed', scientific: 'scientific', engineering: 'engineering' };
    const SEPARATOR_WORDS = { comma: 'comma', space: 'space', none: 'none' };

    function settingText(key, v) {
        const pick = (map) => (Object.prototype.hasOwnProperty.call(map, v) ? map[v] : String(v));
        switch (key) {
            case 'angle': return v === 'deg' ? 'degrees' : 'radians';
            case 'precision': return `${v} digits`;
            case 'notation': return pick(NOTATION_WORDS);
            case 'thousands': return pick(SEPARATOR_WORDS);
            case 'fractions': return v === 'auto' ? 'shown' : 'decimals only';
            case 'implicitMult': return v ? 'on' : 'off';
            case 'historySize': return `${v} results`;
            default: return String(v);
        }
    }

    /** Format a preview number with the options being edited (not yet saved). */
    function previewNumber(n, values) {
        return State.formatNumber(n, {
            precision: Number(values.precision),
            notation: values.notation,
            thousands: values.thousands
        });
    }

    function readField(el) {
        if (el.type === 'checkbox') return el.checked;
        if (el.type === 'range' || el.type === 'number' || el.dataset.type === 'number') return Number(el.value);
        return el.value;
    }

    /**
     * Inline checks: an unusable value (only possible if a field was
     * tampered with) is explained and holds Save; lowering the History size
     * below what History holds is flagged before it trims anything.
     */
    function wireSettingsChecks() {
        const modal = DOM.id('modal-settings');
        const save = modal ? DOM.$('[data-settings-save]', modal) : null;
        const error = DOM.id('settings-error');
        const trim = DOM.id('history-trim-note');
        if (!modal || !save) return;

        const problems = () => DOM.$$('[data-setting]', modal)
            .filter((el) => el.type !== 'radio' || el.checked)
            .filter((el) => State.validSetting(el.dataset.setting, readField(el)) === undefined)
            .map((el) => {
                const key = el.dataset.setting;
                if (Object.prototype.hasOwnProperty.call(SETTING_HINTS, key)) return SETTING_HINTS[key];
                return `Choose one of the listed options for ${State.SETTING_LABELS[key] || key}.`;
            });

        const refresh = () => {
            const list = problems();
            if (error) {
                const msg = list.join(' ');
                if (error.textContent !== msg) error.textContent = msg;
                error.hidden = !list.length;
            }
            if (list.length) save.disabled = true;

            const sizeEl = DOM.$('[data-setting="historySize"]', modal);
            const size = sizeEl ? Number(sizeEl.value) : NaN;
            const have = State.history().length;
            if (trim) {
                const msg = Number.isFinite(size) && have > size
                    ? `Heads up: History holds ${have} results. Saving keeps the newest ${size} and removes the oldest ${have - size}.`
                    : '';
                if (trim.textContent !== msg) trim.textContent = msg;
                trim.hidden = !msg;
            }
        };

        DOM.on(modal, 'input', refresh);
        DOM.on(modal, 'change', refresh);
        DOM.on(modal, 'click', refresh);
        modal.addEventListener('dialog:open', refresh);
        modal.addEventListener('click', (e) => {
            if (!e.target.closest('[data-settings-save]') || !problems().length) return;
            e.preventDefault();
            e.stopPropagation();
            refresh();
        }, true);
    }

    function importSummary(r) {
        const parts = [];
        if (r.sheetsAdded) parts.push(plural(r.sheetsAdded, 'sheet'));
        if (r.historyAdded) parts.push(plural(r.historyAdded, 'History result'));
        let text = parts.length
            ? `Added ${joinList(parts)} from the backup.`
            : 'Nothing new to add: everything in that backup is already here.';
        if (r.sheetsRenamed) {
            text += ` ${plural(r.sheetsRenamed, 'added sheet')} shared a name with one of yours, so “(from backup)” was added to ${r.sheetsRenamed === 1 ? 'its name' : 'their names'}.`;
        }
        if (r.sheetsFull) text += ` ${plural(r.sheetsFull, 'sheet')} did not fit; mathMan keeps ${State.LIMITS.sheets}.`;
        if (r.historyFull) {
            text += ` ${plural(r.historyFull, 'History result')} did not fit; raise “Results to keep in History” in Settings and import again to add them.`;
        }
        return text;
    }

    /** After Settings → Import: say what was added and ask before using the backup's settings. */
    async function reportImport(r) {
        const summary = importSummary(r);
        if (!r.settings) {
            notify(`${summary} Your current sheet and settings were kept.`, 'info', 6000);
            return;
        }
        const mine = State.settings();
        const lines = Object.keys(r.settings).map((key) => (
            `• ${State.SETTING_LABELS[key] || key}: ${settingText(key, r.settings[key])} (yours: ${settingText(key, mine[key])})`
        ));
        const use = await Dialogs.confirm({
            title: 'Use the backup’s settings too?',
            message: `${summary}\n\nThe backup’s settings differ from yours:\n${lines.join('\n')}\n\nYour settings stay as they are unless you choose the backup’s.`,
            confirmLabel: 'Use backup settings',
            cancelLabel: 'Keep my settings'
        });
        if (!use) {
            notify('Kept your settings', 'info', 1800);
            return;
        }
        const result = State.applySettings(r.settings);
        notify(result.changed.length
            ? `Now using the backup’s settings (${plural(result.changed.length, 'change')})`
            : 'Settings unchanged', 'success', 2400);
    }

    function bindSettings() {
        Dialogs.bindSettings({
            getSettings: () => State.settings(),
            applySettings: (values) => {
                const before = State.history().length;
                const result = State.applySettings(values);
                if (result.rejected.length) {
                    const detail = result.rejected.map((key) => SETTING_HINTS[key]
                        || `${State.SETTING_LABELS[key] || key} kept its previous value.`).join(' ');
                    notify(`Some settings were not changed. ${detail}`, 'warning', 5000);
                }
                const removed = before - State.history().length;
                if (removed > 0) notify(`Removed the ${plural(removed, 'oldest History result')} to fit the new size.`, 'info', 3200);
            },
            formats: {
                precision: (v) => `${v} digits`,
                precisionPreview: (_v, values) => `π shows as ${previewNumber(Math.PI, values)}`,
                notationPreview: (_v, values) => (
                    `12345.678 shows as ${previewNumber(12345.678, values)}; 0.00000042 as ${previewNumber(4.2e-7, values)}`
                ),
                historySize: (v) => `${v} results`
            },
            onReset: () => State.reset(),
            onImported: () => {
                sync();
                const report = State.lastImport;
                State.lastImport = null;
                // After the kit's own "Backup merged" toast, so the detail reads second.
                if (report) {
                    setTimeout(() => {
                        reportImport(report).catch((err) => console.error('[mathMan] import report failed:', err));
                    }, 0);
                }
            },
            resetConfirm: {
                title: 'Reset mathMan?',
                message: 'This deletes your sheets, History, and settings in this browser, then brings back the Welcome sheet.\n\nDownload a backup first if you might want them later. This cannot be undone.',
                confirmLabel: 'Reset mathMan'
            }
        });
    }

    /* ── Option-key fallback for Ctrl+Alt shortcuts ────────── */

    /**
     * On macOS, Option turns N and D into other characters, so the key
     * ToolApp sees is not 'n' or 'd'. Match the physical key instead, only
     * when ToolApp's own match could not have fired.
     */
    function wireAltFallback() {
        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return;
            if (window.Dialogs && Dialogs.activeModal) return;
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (key === 'n' || key === 'd') return;
            if (e.code === 'KeyN') {
                e.preventDefault();
                actions.newSheet();
            } else if (e.code === 'KeyD') {
                e.preventDefault();
                actions.toggleAngle();
            }
        });
    }

    /* ── Boot ──────────────────────────────────────────────── */

    ToolApp.boot({
        id: 'mathman',
        name: 'mathMan',
        modules: MODULES,
        workbench: {
            getUi: () => AppState.ui,
            left: { id: 'panel-library', name: 'Library' },
            right: { id: 'panel-tools', name: 'Tools' }
        },
        shortcuts: [
            { key: 'c', mod: true, shift: true, allowInFields: true, run: () => actions.copyResult() },
            { key: '/', mod: true, allowInFields: true, run: () => actions.toggleComment() },
            { key: 'Enter', mod: true, allowInFields: true, run: () => actions.addToHistory() },
            { key: 'n', mod: true, alt: true, allowInFields: true, run: () => actions.newSheet() },
            { key: 'd', mod: true, alt: true, allowInFields: true, run: () => actions.toggleAngle() }
        ],
        onReady() {
            bindSettings();
            wireSettingsChecks();
            guardFileDrops();
            wireToolbar();
            wireSelectionWatch();
            wireAltFallback();
            subscribeChrome();
            sync();
        }
    });

    window.MathManApp = { actions, sync, modules: MODULES.slice() };
})();
