/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StateManager (mathMan Edition - v1.0)
 *     - File Name: state.js
 *     - Relative Path: tools/mathman/js/state.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     mathMan's single source of truth: the sheets, which one is active, the
 *     result History, per-pane preferences, the rail layout, and settings.
 *     Every UI module reads and changes state through the State API, which
 *     validates input, emits an event, and schedules a save; it also runs
 *     the math engine over the active sheet and caches the result, so every
 *     pane reads the same answers without evaluating the sheet itself.
 *
 * ✒ Key Features:
 *     - Event bus: State.on(evt, fn) returns an unsubscribe function; events
 *       are sheets, active, text, results, history, settings, panes, reset,
 *       and sync (another tab's changes merged in)
 *     - Sheets: add, rename (names stay unique, ignoring case), duplicate,
 *       delete (never leaves zero sheets), restore after delete, and
 *       switch; capped at 200 sheets of 200,000 characters each
 *     - A seeded "Welcome" sheet that shows headings, labels, arithmetic,
 *       exact fractions, variables, a function, units, percentages, total,
 *       line references, bases, and notes — every line evaluates cleanly
 *     - Time-sliced, cached evaluation: the active sheet runs as an engine
 *       job with a per-sheet memo (100 ms at once, then 30 ms slices in
 *       separate tasks), so a heavy sheet never freezes typing; unreached
 *       lines are 'pending' and 'results' repeats as they fill in. result()
 *       re-runs only when the active sheet, its text, or the options
 *       changed, and a missing or failing engine yields a plain-language
 *       error result instead of an exception
 *     - Engine options (State.engineOptions) built from the settings
 *     - History of saved results, newest first, de-duplicated against the
 *       newest entry and capped by settings.historySize (20–500)
 *     - Validated settings with a list of rejected keys for friendly errors
 *     - Allowlisted restore: id patterns, string caps, time ranges, setting
 *       rules, and reserved pane names; anything malformed is dropped
 *     - Add-only backup merge: sheets and History entries are added, never
 *       replaced; settings that differ are reported, not applied
 *     - Several tabs at once: each save first merges what another tab
 *       stored (three-way, by sheet id and update time), and a 'storage'
 *       event merges another tab's save as it lands, so no tab's stale
 *       copy can erase another tab's sheets, edits, or History
 *     - Free-form per-pane preference objects (State.pane / State.setPane)
 *       with a size cap per pane
 *     - Failure reasons for the UI in State.lastError (plain sentences)
 *
 * ✒ Usage Instructions:
 *     Load after shared/js/storage.js and shared/js/workbench.js and after
 *     js/engine.js, before every UI module. No init() call is needed: the
 *     Storage.configure() contract runs at load time and ToolApp.boot()
 *     restores saved state before the modules start. UI code changes state
 *     only through State methods and re-renders on events. Objects handed
 *     out are copies, except result(), which is the shared cached result
 *     and must be treated as read-only. While a slow sheet is worked out,
 *     result().pending counts the lines still to come; listen for 'results'
 *     rather than polling.
 *
 * ✒ Examples:
 *     State.addSheet('Groceries', 'Milk: 3.49\nBread: 2.99\ntotal')  → { id, name, text, created, updated }
 *     State.setSheetText(id, '2 + 2')            → true; emits 'text', then 'results'
 *     State.result().lines[0].display            → '4'
 *     State.engineOptions()                      → { angle: 'rad', precision: 10, notation: 'auto', … }
 *     State.applySettings({ angle: 'deg' })      → { applied: ['angle'], rejected: [], changed: ['angle'] }
 *     State.pushHistory({ expr: '2 + 2', display: '4', plain: '4' })
 *     State.deleteSheet(id)                      → the removed sheet (State.restoreSheet(it) brings it back)
 *     State.on('results', ({ result, pending }) => render(result))   → unsubscribe function
 *     State.renameSheet(id, 'welcome')           → null; State.lastError: "Another sheet is already called …"
 *     State.mergeBackup(backup.state)            → { sheetsAdded: 2, historyAdded: 5, settings: { … } | null, … }
 *     State.formatNumber(1234.5)                 → '1,234.5' (engine formatter when present)
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/storage.js (window.Storage), shared/js/
 *       workbench.js (uiDefaults / mergeUi); optional: shared/js/toolapp.js
 *       (debounced saves, ids) and js/engine.js (window.MathEngine)
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the localStorage quota applies (the trim hook drops
 *       History first); a sheet longer than 200,000 characters is cut to
 *       that length, and State.lastError says so; when two tabs edit the
 *       same sheet at once, the later edit of that sheet wins; pane fields
 *       and the rail layout are kept per tab
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'toolman.mathman.state';
    const STATE_VERSION = '1.0.0';

    const LIMITS = Object.freeze({
        sheets: 200,
        sheetChars: 200000,
        name: 80,
        expr: 2000,
        resultChars: 12000,
        historyMin: 20,
        historyMax: 500,
        panes: 40,
        paneBytes: 20000
    });

    const ANGLES = ['deg', 'rad'];
    const NOTATIONS = ['auto', 'fixed', 'scientific', 'engineering'];
    const SEPARATORS = ['comma', 'space', 'none'];
    const FRACTIONS = ['auto', 'off'];
    const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'KRW', 'SEK', 'NZD', 'ZAR'];
    const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];
    const DAY_MS = 86400000;

    const WELCOME_ID = 'sheet-welcome';
    const WELCOME_NAME = 'Welcome';
    const DEFAULT_SHEET_NAME = 'Untitled sheet';

    /* Every line below evaluates without an error under the default
       settings. Line numbers matter: line6, line7, and line16 refer to them. */
    const WELCOME_TEXT = [
        '# Welcome to mathMan',
        '// Type math on any line; its answer shows →',
        '// # starts a heading and // starts a note',
        '',
        '# Arithmetic',
        '2 + 3 * 4',
        '(2 + 3) * 4',
        '2^10 // powers',
        '1/3 + 1/6',
        '0.1 + 0.2',
        '',
        '# Monthly budget',
        'Rent: 1200',
        'Groceries: 450',
        'Utilities: 180',
        'total',
        '',
        '# Variables and functions',
        'price = 80',
        'tax = price * 8%',
        'price + tax',
        'area(r) = pi * r^2',
        'area(3)',
        '',
        '# Units',
        '5 km + 300 m',
        '100 km/h to mph',
        '26.2 mi in km',
        '3 ft * 2 ft',
        '98.6 °F to °C',
        '',
        '# Percentages',
        '15% of 80',
        '80 + 15%',
        '200 - 25%',
        '0.35 to %',
        '',
        '# Line references',
        'line6 + line7',
        'ans * 2',
        'line16 * 12 // the budget for a year',
        '',
        '# Number bases',
        '0xFF + 0b1010',
        '255 to hex',
        '42 to bin',
        '0.75 to fraction'
    ].join('\n');

    /* ── Small helpers ─────────────────────────────────────── */

    const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const now = () => Date.now();

    function uid(prefix) {
        if (window.ToolApp && typeof ToolApp.uid === 'function') return ToolApp.uid(prefix);
        const core = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}-${core}`;
    }

    function validId(v) {
        return typeof v === 'string' && v.length > 0 && v.length <= 60 && /^[A-Za-z0-9_-]+$/.test(v)
            && !RESERVED_KEYS.includes(v);
    }

    /** Epoch milliseconds from a number or a date string; null when absent or implausible. */
    function validTime(v) {
        let ms = null;
        if (typeof v === 'number') ms = v;
        else if (typeof v === 'string' && v.length <= 40) ms = Date.parse(v);
        if (!Number.isFinite(ms) || ms <= 0 || ms > now() + 366 * DAY_MS) return null;
        return Math.round(ms);
    }

    /** Trimmed single-line name, control characters removed, max 80 chars. */
    function cleanName(v, fallback = '') {
        if (typeof v !== 'string') return fallback;
        // eslint-disable-next-line no-control-regex
        const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
        return s || fallback;
    }

    /** Sheet text with LF line endings, capped; returns { text, cut }. */
    function cleanText(v) {
        if (typeof v !== 'string') return { text: '', cut: false };
        const text = v.replace(/\r\n?/g, '\n');
        if (text.length <= LIMITS.sheetChars) return { text, cut: false };
        return { text: text.slice(0, LIMITS.sheetChars), cut: true };
    }

    /** A capped single string field, or '' when not a string. */
    function cleanString(v, max) {
        return typeof v === 'string' ? v.slice(0, max) : '';
    }

    const copySheet = (s) => ({ id: s.id, name: s.name, text: s.text, created: s.created, updated: s.updated });
    const copyEntry = (h) => ({ id: h.id, expr: h.expr, display: h.display, plain: h.plain, at: h.at, sheetName: h.sheetName });
    const clone = (v) => JSON.parse(JSON.stringify(v));

    /* ── Defaults ──────────────────────────────────────────── */

    function defaultSettings() {
        return {
            angle: 'rad',
            precision: 10,
            notation: 'auto',
            thousands: 'comma',
            fractions: 'auto',
            implicitMult: true,
            currency: 'USD',
            historySize: 100
        };
    }

    function welcomeSheet(id = WELCOME_ID) {
        const at = now();
        return { id, name: WELCOME_NAME, text: WELCOME_TEXT, created: at, updated: at };
    }

    const seed = welcomeSheet();

    const AppState = {
        version: STATE_VERSION,
        // Changes on every save; lets a tab tell its own writes from another tab's.
        rev: '',
        sheets: [seed],
        activeSheetId: seed.id,
        history: [],
        panes: {},
        ui: window.Workbench
            ? Workbench.uiDefaults({ library: 'sheets', tools: 'keypad' })
            : { leftPanelCollapsed: false, rightPanelCollapsed: false, openSection: { library: 'sheets', tools: 'keypad' }, sectionOrder: {} },
        settings: defaultSettings()
    };

    /* ── Events ────────────────────────────────────────────── */

    const listeners = Object.create(null);

    function on(evt, fn) {
        if (typeof evt !== 'string' || typeof fn !== 'function') return () => {};
        (listeners[evt] = listeners[evt] || new Set()).add(fn);
        return () => { if (listeners[evt]) listeners[evt].delete(fn); };
    }

    function emit(evt, payload) {
        const set = listeners[evt];
        if (!set) return;
        Array.from(set).forEach((fn) => {
            try {
                fn(payload);
            } catch (err) {
                console.error(`[State] '${evt}' listener failed:`, err);
            }
        });
    }

    function save() {
        if (window.ToolApp && ToolApp.config && typeof ToolApp.scheduleSave === 'function') {
            ToolApp.scheduleSave();
            return true;
        }
        return window.Storage ? Storage.save() : false;
    }

    function fail(message) {
        State.lastError = message;
        return message;
    }

    /* ── Settings rules ────────────────────────────────────── */

    const oneOf = (list) => (v) => (typeof v === 'string' && list.includes(v) ? v : undefined);

    function intIn(lo, hi) {
        return (v) => {
            if (v === '' || v === null || typeof v === 'boolean') return undefined;
            const n = Number(v);
            return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
        };
    }

    const SETTING_RULES = {
        angle: oneOf(ANGLES),
        precision: intIn(4, 16),
        notation: oneOf(NOTATIONS),
        thousands: oneOf(SEPARATORS),
        fractions: oneOf(FRACTIONS),
        implicitMult: (v) => (typeof v === 'boolean' ? v : undefined),
        currency: oneOf(CURRENCIES),
        historySize: intIn(LIMITS.historyMin, LIMITS.historyMax)
    };

    const SETTING_LABELS = {
        angle: 'Angle unit',
        precision: 'Significant digits',
        notation: 'Number notation',
        thousands: 'Thousands separator',
        fractions: 'Exact fractions',
        implicitMult: 'Implicit multiplication',
        currency: 'Currency',
        historySize: 'Results to keep in History'
    };

    /** Validate settings into AppState.settings; returns { applied, rejected, changed }. */
    function writeSettings(values) {
        const result = { applied: [], rejected: [], changed: [] };
        if (!isPlainObject(values)) return result;
        Object.keys(SETTING_RULES).forEach((key) => {
            if (!has(values, key)) return;
            const v = SETTING_RULES[key](values[key]);
            if (v === undefined) {
                result.rejected.push(key);
                return;
            }
            result.applied.push(key);
            if (AppState.settings[key] !== v) {
                AppState.settings[key] = v;
                result.changed.push(key);
            }
        });
        return result;
    }

    function engineOptions() {
        const s = AppState.settings;
        return {
            angle: s.angle,
            precision: s.precision,
            notation: s.notation,
            thousands: s.thousands,
            fractions: s.fractions,
            implicitMult: s.implicitMult
        };
    }

    /* ── Sanitizers (restore and merge) ────────────────────── */

    function sanitizeSheet(s) {
        if (!isPlainObject(s) || typeof s.text !== 'string') return null;
        const created = validTime(s.created) || now();
        return {
            id: validId(s.id) ? s.id : uid('sheet'),
            name: cleanName(s.name, DEFAULT_SHEET_NAME),
            text: cleanText(s.text).text,
            created,
            updated: Math.max(created, validTime(s.updated) || created)
        };
    }

    function sanitizeSheets(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const ids = new Set();
        for (const item of list) {
            if (out.length >= LIMITS.sheets) break;
            const s = sanitizeSheet(item);
            if (!s) continue;
            if (ids.has(s.id)) s.id = uid('sheet');
            ids.add(s.id);
            out.push(s);
        }
        return out;
    }

    function sanitizeEntry(h) {
        if (!isPlainObject(h)) return null;
        const expr = typeof h.expr === 'string' ? h.expr.trim() : '';
        const display = typeof h.display === 'string' ? h.display : '';
        const plain = typeof h.plain === 'string' ? h.plain : '';
        if (!expr || expr.length > LIMITS.expr) return null;
        if (!display && !plain) return null;
        if (display.length > LIMITS.resultChars || plain.length > LIMITS.resultChars) return null;
        return {
            id: validId(h.id) ? h.id : uid('hist'),
            expr,
            display: display || plain,
            plain: plain || display,
            at: validTime(h.at) || now(),
            sheetName: cleanName(h.sheetName)
        };
    }

    function sanitizeHistory(list, cap = LIMITS.historyMax) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const ids = new Set();
        for (const item of list) {
            if (out.length >= cap) break;
            const h = sanitizeEntry(item);
            if (!h) continue;
            if (ids.has(h.id)) h.id = uid('hist');
            ids.add(h.id);
            out.push(h);
        }
        return out;
    }

    function sanitizePaneValue(value) {
        if (!isPlainObject(value)) return null;
        try {
            const json = JSON.stringify(value);
            if (!json || json.length > LIMITS.paneBytes) return null;
            // Reparse with a reviver that drops prototype keys at any depth.
            return JSON.parse(json, (k, v) => (RESERVED_KEYS.includes(k) ? undefined : v));
        } catch (_err) {
            return null;
        }
    }

    const validPaneName = (name) => typeof name === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(name)
        && !RESERVED_KEYS.includes(name);

    function sanitizePanes(panes) {
        if (!isPlainObject(panes)) return null;
        const out = {};
        Object.keys(panes).slice(0, LIMITS.panes).forEach((name) => {
            if (!validPaneName(name)) return;
            const v = sanitizePaneValue(panes[name]);
            if (v) out[name] = v;
        });
        return out;
    }

    /* ── Sheet helpers ─────────────────────────────────────── */

    const findSheet = (id) => AppState.sheets.find((s) => s.id === id) || null;
    const sheetIndex = (id) => AppState.sheets.findIndex((s) => s.id === id);

    function activeSheetRef() {
        let sheet = findSheet(AppState.activeSheetId);
        if (!sheet) {
            if (!AppState.sheets.length) AppState.sheets.push(welcomeSheet(uid('sheet')));
            sheet = AppState.sheets[0];
            AppState.activeSheetId = sheet.id;
        }
        return sheet;
    }

    function nameTaken(name, exceptId) {
        const lower = name.toLowerCase();
        return AppState.sheets.some((s) => s.id !== exceptId && s.name.toLowerCase() === lower);
    }

    /** "Sheet 3" for the next free number, or "base 2", "base 3" … when base is taken. */
    function uniqueName(base) {
        if (base && !nameTaken(base)) return base;
        if (base) {
            for (let n = 2; n < 1000; n++) {
                const suffix = ` ${n}`;
                const candidate = `${base.slice(0, LIMITS.name - suffix.length)}${suffix}`;
                if (!nameTaken(candidate)) return candidate;
            }
            return base;
        }
        for (let n = AppState.sheets.length + 1; n < AppState.sheets.length + 1000; n++) {
            if (!nameTaken(`Sheet ${n}`)) return `Sheet ${n}`;
        }
        return DEFAULT_SHEET_NAME;
    }

    /* ── Evaluation (time-sliced, memoised) ─────────────────── */

    // The active sheet is worked out by an engine job: up to SYNC_MS at
    // once, then SLICE_MS slices in separate tasks so typing never waits on
    // a heavy sheet. Lines not reached yet come back as kind 'pending'
    // ("working…"); 'results' is emitted at once, every EMIT_MS while the
    // job runs, and when it finishes. A per-sheet engine memo reuses every
    // line whose text and inputs are unchanged, so a keystroke re-works only
    // the lines it affects.
    const SYNC_MS = 100;
    const SLICE_MS = 30;
    const EMIT_MS = 250;
    const MEMO_SHEETS = 6;

    let cache = null;          // { sheetId, text, optsKey, result }
    let flushQueued = false;
    let runToken = 0;          // bumps when a newer run replaces a running job
    const memos = new Map();   // sheetId → engine memo (most recent last)

    const ENGINE_MISSING = 'The math engine did not load, so this line was not worked out. Reload the page to try again.';
    const ENGINE_FAILED = 'Something went wrong working out this sheet. Edit a line or reload the page to try again.';

    /** Run fn in its own task soon (MessageChannel: no 4 ms clamp, input can run in between). */
    const nextTask = (() => {
        if (typeof MessageChannel !== 'function') return (fn) => setTimeout(fn, 0);
        const channel = new MessageChannel();
        const queue = [];
        channel.port1.onmessage = () => {
            const fn = queue.shift();
            if (fn) fn();
        };
        return (fn) => {
            queue.push(fn);
            channel.port2.postMessage(0);
        };
    })();

    function memoForSheet(engine, id) {
        if (typeof engine.createMemo !== 'function') return undefined;
        let memo = memos.get(id);
        if (memo) memos.delete(id);
        else memo = engine.createMemo();
        memos.set(id, memo);
        while (memos.size > MEMO_SHEETS) memos.delete(memos.keys().next().value);
        return memo;
    }

    /** A result in the contract's shape for when the engine is missing or threw. */
    function fallbackResult(text, message) {
        const lines = text.split('\n').map((source, index) => {
            const trimmed = source.trim();
            let kind = 'error';
            if (!trimmed) kind = 'blank';
            else if (trimmed.startsWith('#')) kind = 'heading';
            else if (trimmed.startsWith('//')) kind = 'comment';
            return {
                index,
                source,
                kind,
                label: null,
                display: '',
                plain: '',
                exact: '',
                unit: '',
                numeric: null,
                percent: false,
                error: kind === 'error' ? { message, start: 0, end: source.length } : null
            };
        });
        const errors = lines.filter((l) => l.kind === 'error').length;
        return {
            lines,
            variables: [],
            functions: [],
            counts: { lines: lines.length, values: 0, errors },
            pending: 0,
            engineError: message
        };
    }

    /** Fill in any missing top-level fields so consumers can rely on the shape. */
    function normalizeResult(res, text) {
        if (!isPlainObject(res) || !Array.isArray(res.lines)) return fallbackResult(text, ENGINE_FAILED);
        if (!Array.isArray(res.variables)) res.variables = [];
        if (!Array.isArray(res.functions)) res.functions = [];
        if (!isPlainObject(res.counts)) {
            res.counts = {
                lines: res.lines.length,
                values: res.lines.filter((l) => l && (l.kind === 'value' || l.kind === 'assignment')).length,
                errors: res.lines.filter((l) => l && l.kind === 'error').length
            };
        }
        if (!Number.isInteger(res.pending) || res.pending < 0) res.pending = 0;
        return res;
    }

    function cacheFresh() {
        if (!cache) return false;
        const sheet = activeSheetRef();
        return cache.sheetId === sheet.id && cache.text === sheet.text
            && cache.optsKey === JSON.stringify(engineOptions());
    }

    function publish(result, sheetId, text, optsKey) {
        if (!cache || cache.sheetId !== sheetId || cache.text !== text || cache.optsKey !== optsKey) return;
        cache = { sheetId, text, optsKey, result };
        emit('results', { result, sheetId, pending: result.pending });
    }

    /** Keep working a job in slices until it finishes or a newer run replaces it. */
    function continueJob(job, token, sheetId, text, optsKey) {
        let lastEmit = Date.now();
        const slice = () => {
            if (token !== runToken) return;
            let done = true;
            let result;
            try {
                done = job.step(SLICE_MS);
                if (done || Date.now() - lastEmit >= EMIT_MS) result = normalizeResult(job.output(), text);
            } catch (err) {
                console.error('[State] evaluating the sheet failed:', err);
                result = fallbackResult(text, ENGINE_FAILED);
                done = true;
            }
            if (result) {
                lastEmit = Date.now();
                publish(result, sheetId, text, optsKey);
            }
            if (!done) nextTask(slice);
        };
        nextTask(slice);
    }

    /** Evaluate the active sheet (the first slice now), store it, and emit 'results'. */
    function evaluateNow() {
        const sheet = activeSheetRef();
        const opts = engineOptions();
        const optsKey = JSON.stringify(opts);
        const token = ++runToken;
        const engine = window.MathEngine;
        let result;
        let job = null;
        if (!engine || typeof engine.evaluateSheet !== 'function') {
            result = fallbackResult(sheet.text, ENGINE_MISSING);
        } else {
            try {
                if (typeof engine.startSheet === 'function') {
                    const j = engine.startSheet(sheet.text, opts, { memo: memoForSheet(engine, sheet.id) });
                    const done = j.step(SYNC_MS);
                    result = normalizeResult(j.output(), sheet.text);
                    if (!done) job = j;
                } else {
                    result = normalizeResult(engine.evaluateSheet(sheet.text, opts), sheet.text);
                }
            } catch (err) {
                console.error('[State] evaluateSheet failed:', err);
                result = fallbackResult(sheet.text, ENGINE_FAILED);
                job = null;
            }
        }
        cache = { sheetId: sheet.id, text: sheet.text, optsKey, result };
        emit('results', { result, sheetId: sheet.id, pending: result.pending });
        if (job) continueJob(job, token, sheet.id, sheet.text, optsKey);
        return result;
    }

    /** Re-run only when the active sheet, its text, or the options changed. */
    function refresh() {
        flushQueued = false;
        return cacheFresh() ? cache.result : evaluateNow();
    }

    /** Coalesce bursts of edits into one evaluation at the end of the task. */
    function queueRefresh() {
        if (flushQueued) return;
        flushQueued = true;
        Promise.resolve().then(refresh).catch((err) => console.error('[State] refresh failed:', err));
    }

    /* ── Restore / merge ───────────────────────────────────── */

    /** '{name} (from backup)', trimmed to the name limit. */
    function backupCopyName(name) {
        const suffix = ' (from backup)';
        return `${cleanName(name, DEFAULT_SHEET_NAME).slice(0, LIMITS.name - suffix.length)}${suffix}`;
    }

    /**
     * Merge an imported backup without replacing anything this browser
     * holds. Sheets and History entries are added; a sheet that is already
     * here (same name and text) is skipped, one whose id is taken gets a new
     * id, and one whose name is taken by different text is renamed
     * "{name} (from backup)". The active sheet, settings, pane preferences
     * already set, and layout stay as they are; settings that differ are
     * returned in report.settings so the caller can offer them.
     */
    function mergeBackup(saved) {
        const report = {
            sheetsAdded: 0, sheetsSkipped: 0, sheetsFull: 0, sheetsRenamed: 0,
            historyAdded: 0, historyFull: 0, settings: null
        };
        if (!isPlainObject(saved)) {
            State.lastImport = report;
            return report;
        }

        const sheets = sanitizeSheets(saved.sheets) || [];
        // Already here: same text under the same name, or under the
        // "(from backup)" name an earlier import of this backup gave it.
        const isHere = (s) => {
            const copyName = backupCopyName(s.name);
            return AppState.sheets.some((q) => q.text === s.text
                && (q.name === s.name || q.name === copyName || q.name.startsWith(`${copyName} `)));
        };
        sheets.forEach((s) => {
            if (isHere(s)) {
                report.sheetsSkipped++;
                return;
            }
            if (AppState.sheets.length >= LIMITS.sheets) {
                report.sheetsFull++;
                return;
            }
            if (findSheet(s.id)) s.id = uid('sheet');
            if (nameTaken(s.name)) {
                s.name = uniqueName(backupCopyName(s.name));
                report.sheetsRenamed++;
            }
            AppState.sheets.push(s);
            report.sheetsAdded++;
        });

        const history = sanitizeHistory(saved.history) || [];
        const room = Math.max(0, AppState.settings.historySize - AppState.history.length);
        const ids = new Set(AppState.history.map((h) => h.id));
        const known = new Set(AppState.history.map((h) => `${h.expr}\u0000${h.plain}\u0000${h.at}`));
        const fresh = history.filter((h) => !ids.has(h.id) && !known.has(`${h.expr}\u0000${h.plain}\u0000${h.at}`));
        const taken = fresh.slice(0, room);
        report.historyAdded = taken.length;
        report.historyFull = fresh.length - taken.length;
        if (taken.length) {
            AppState.history = AppState.history.concat(taken).sort((a, b) => b.at - a.at);
        }

        // Pane preferences: only panes this browser has never set.
        const panes = sanitizePanes(saved.panes);
        if (panes) {
            Object.keys(panes).forEach((name) => {
                const live = has(AppState.panes, name) ? AppState.panes[name] : undefined;
                if (isPlainObject(live) && Object.keys(live).length) return;
                if (isPlainObject(live)) Object.assign(live, panes[name]);
                else AppState.panes[name] = panes[name];
            });
        }

        if (isPlainObject(saved.settings)) {
            const offered = {};
            Object.keys(SETTING_RULES).forEach((key) => {
                if (!has(saved.settings, key)) return;
                const v = SETTING_RULES[key](saved.settings[key]);
                if (v !== undefined && v !== AppState.settings[key]) offered[key] = v;
            });
            if (Object.keys(offered).length) report.settings = offered;
        }

        State.lastImport = report;
        if (report.sheetsAdded) emit('sheets', { action: 'import' });
        if (report.historyAdded) emit('history', { action: 'import' });
        emit('panes', { action: 'import' });
        return report;
    }

    /**
     * Allowlisted restore. At boot (ToolApp not yet initialized) saved data
     * replaces the defaults; afterwards (Settings → Import) the backup is
     * merged by mergeBackup(), which adds and never replaces.
     */
    function restoreInto(saved, opts = {}) {
        if (!isPlainObject(saved)) return null;
        const merge = opts.merge !== undefined
            ? Boolean(opts.merge)
            : Boolean(window.ToolApp && ToolApp.initialized);
        if (merge) {
            if (!Array.isArray(saved.sheets) && !Array.isArray(saved.history)) {
                throw new Error("that file is not a mathMan backup — it has no sheets or History. Choose a file made by mathMan's Download backup.");
            }
            return mergeBackup(saved);
        }

        if (isPlainObject(saved.settings)) writeSettings(saved.settings);

        const sheets = sanitizeSheets(saved.sheets);
        if (sheets && sheets.length) AppState.sheets = sheets;

        AppState.activeSheetId = validId(saved.activeSheetId) && findSheet(saved.activeSheetId)
            ? saved.activeSheetId
            : AppState.sheets[0].id;

        const history = sanitizeHistory(saved.history, AppState.settings.historySize);
        if (history) AppState.history = history;

        const panes = sanitizePanes(saved.panes);
        if (panes) AppState.panes = panes;

        // Layout is a per-browser preference: only the boot restore applies it.
        if (window.Workbench) Workbench.mergeUi(AppState.ui, saved.ui);
        cache = null;
        runToken++;
        // What was read is the base the next save or another tab's save is merged against.
        storedRev = revOf(saved);
        storedBase = snapshotBase(AppState);
        pending = null;
        return null;
    }

    /* ── Other tabs ────────────────────────────────────────── */

    // Two mathMan tabs share one localStorage key. Each save first reads
    // what is stored; when another tab wrote it since this tab last looked,
    // the two are merged before writing, and a 'storage' event merges another
    // tab's save as soon as it lands. The merge is three-way against the
    // stored state this tab last knew for sure: a sheet another tab added
    // is added here, one it deleted is deleted here unless this tab edited it
    // since, the newer edit of a sheet wins, and History and settings follow
    // the same rules. Pane fields and the rail layout stay per tab.

    // storedRev / storedBase: the stored state this tab last knew for sure
    // (read at boot, merged from another tab, or its own write once seen in
    // storage). pending: this tab's latest write, until it is seen there.
    let storedRev = '';
    let storedBase = { sheets: new Map(), history: new Set(), settings: null };
    let pending = null;

    const newRev = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    function snapshotBase(state) {
        const sheets = Array.isArray(state.sheets) ? state.sheets : [];
        const history = Array.isArray(state.history) ? state.history : [];
        return {
            sheets: new Map(sheets.map((s) => [s.id, s.updated])),
            history: new Set(history.map((h) => h.id)),
            settings: isPlainObject(state.settings) ? { ...state.settings } : null
        };
    }

    /** The rev a stored payload carries, read from its first bytes when it can be; null when unknown. */
    function peekRev(raw) {
        const m = /^\{"version":"[^"]{0,20}","timestamp":"[^"]{0,40}","state":\{"version":"[^"]{0,20}","rev":"([A-Za-z0-9_-]{0,40})"/.exec(raw.slice(0, 220));
        return m ? m[1] : null;
    }

    const revOf = (saved) => (saved && typeof saved.rev === 'string' ? saved.rev.slice(0, 40) : '');

    /** Parse another tab's stored payload; null when it is malformed. */
    function parseStored(raw) {
        if (typeof raw !== 'string' || !raw || raw.length > 12000000) return null;
        try {
            const data = JSON.parse(raw, (k, v) => (RESERVED_KEYS.includes(k) ? undefined : v));
            return isPlainObject(data) && isPlainObject(data.state) ? data.state : null;
        } catch (_err) {
            return null;
        }
    }

    /**
     * Merge another tab's saved state into this one, three-way against
     * storedBase. Emits the usual events for whatever changed and returns
     * a summary: { sheetsAdded, sheetsRemoved, sheetsUpdated, history,
     * settings: [keys] }.
     */
    function mergeFromStore(saved) {
        const report = { sheetsAdded: 0, sheetsRemoved: 0, sheetsUpdated: 0, history: false, settings: [] };
        const incoming = sanitizeSheets(saved.sheets);
        const seen = new Set();
        const changedText = [];
        const wasActive = AppState.activeSheetId;

        if (incoming && incoming.length) {
            incoming.forEach((s) => {
                seen.add(s.id);
                const mine = findSheet(s.id);
                if (mine) {
                    if (s.updated > mine.updated && (s.text !== mine.text || s.name !== mine.name)) {
                        if (s.text !== mine.text) changedText.push(s.id);
                        mine.text = s.text;
                        mine.name = nameTaken(s.name, s.id) ? mine.name : s.name;
                        mine.updated = s.updated;
                        report.sheetsUpdated++;
                    }
                } else if (!storedBase.sheets.has(s.id) && AppState.sheets.length < LIMITS.sheets) {
                    // New in the other tab (a sheet this tab deleted stays deleted).
                    if (nameTaken(s.name)) s.name = uniqueName(s.name);
                    AppState.sheets.push(s);
                    report.sheetsAdded++;
                }
            });
            // Deleted in the other tab, and not edited here since.
            const keep = AppState.sheets.filter((s) => seen.has(s.id) || !storedBase.sheets.has(s.id)
                || s.updated > storedBase.sheets.get(s.id));
            report.sheetsRemoved = AppState.sheets.length - keep.length;
            if (report.sheetsRemoved) {
                AppState.sheets = keep.length ? keep : [welcomeSheet(uid('sheet'))];
                cache = null;
                runToken++;
            }
        }

        const history = sanitizeHistory(saved.history);
        if (history) {
            const ids = new Set(history.map((h) => h.id));
            const before = AppState.history.map((h) => h.id).join('|');
            const kept = AppState.history.filter((h) => ids.has(h.id) || !storedBase.history.has(h.id));
            const known = new Set(kept.map((h) => h.id));
            history.forEach((h) => {
                if (!known.has(h.id) && !storedBase.history.has(h.id)) kept.push(h);
            });
            kept.sort((a, b) => b.at - a.at);
            if (kept.length > AppState.settings.historySize) kept.length = AppState.settings.historySize;
            if (kept.map((h) => h.id).join('|') !== before) {
                AppState.history = kept;
                report.history = true;
            }
        }

        if (isPlainObject(saved.settings) && storedBase.settings) {
            const theirs = {};
            Object.keys(SETTING_RULES).forEach((key) => {
                if (!has(saved.settings, key)) return;
                const v = SETTING_RULES[key](saved.settings[key]);
                if (v !== undefined && v !== storedBase.settings[key]) theirs[key] = v;
            });
            report.settings = writeSettings(theirs).changed;
        }

        const panes = sanitizePanes(saved.panes);
        if (panes) {
            Object.keys(panes).forEach((name) => {
                if (!isPlainObject(AppState.panes[name])) AppState.panes[name] = panes[name];
            });
        }

        if (!findSheet(AppState.activeSheetId)) AppState.activeSheetId = AppState.sheets[0].id;
        if (report.sheetsAdded || report.sheetsRemoved || report.sheetsUpdated) emit('sheets', { action: 'sync' });
        if (AppState.activeSheetId !== wasActive) emit('active', { id: AppState.activeSheetId });
        changedText.forEach((id) => emit('text', { id, source: 'sync' }));
        if (report.history) emit('history', { action: 'sync' });
        if (report.settings.length) {
            emit('settings', { settings: { ...AppState.settings }, changed: report.settings.slice() });
        }
        const touched = report.sheetsAdded || report.sheetsRemoved || report.sheetsUpdated || report.history || report.settings.length;
        if (touched) {
            refresh();
            emit('sync', report);
        }
        return report;
    }

    /** Merge a stored state another tab wrote; it then becomes what this tab knows is stored. */
    function adoptStored(saved) {
        let report = null;
        try {
            report = mergeFromStore(saved);
        } catch (err) {
            console.error('[State] merging another tab failed:', err);
        }
        storedRev = revOf(saved);
        const settings = defaultSettings();
        if (isPlainObject(saved.settings)) {
            Object.keys(SETTING_RULES).forEach((key) => {
                const v = has(saved.settings, key) ? SETTING_RULES[key](saved.settings[key]) : undefined;
                if (v !== undefined) settings[key] = v;
            });
        }
        storedBase = snapshotBase({
            sheets: sanitizeSheets(saved.sheets) || [],
            history: sanitizeHistory(saved.history) || [],
            settings
        });
        return report;
    }

    /** Before a save: fold in what another tab stored since this tab last looked, then stamp a new rev. */
    function syncBeforeSave() {
        let raw = null;
        try {
            raw = window.localStorage.getItem(STORAGE_KEY);
        } catch (_err) {
            raw = null;
        }
        let rev = raw ? peekRev(raw) : '';
        let saved = null;
        if (raw && rev === null) {
            saved = parseStored(raw);
            rev = revOf(saved);
        }
        if (pending && rev === pending.rev) {
            storedRev = pending.rev;
            storedBase = pending.base;
        }
        pending = null;
        if (raw && rev !== storedRev) {
            saved = saved || parseStored(raw);
            if (saved) adoptStored(saved);
        }
        AppState.rev = newRev();
        pending = { rev: AppState.rev, base: snapshotBase(AppState) };
    }

    /** Another tab saved: merge it now, then save the merge if this tab has changes of its own. */
    function onStorage(e) {
        if (!e || e.key !== STORAGE_KEY || !e.newValue) return;
        if (window.ToolApp && !ToolApp.initialized) return;
        let rev = peekRev(e.newValue);
        let saved = null;
        if (rev === null) {
            saved = parseStored(e.newValue);
            rev = revOf(saved);
        }
        if (rev === storedRev || (pending && rev === pending.rev)) return;
        saved = saved || parseStored(e.newValue);
        if (!saved) return;
        adoptStored(saved);
        // Anything this tab has that the store lacks goes back out.
        const differs = AppState.sheets.length !== storedBase.sheets.size
            || AppState.sheets.some((s) => storedBase.sheets.get(s.id) !== s.updated)
            || AppState.history.some((h) => !storedBase.history.has(h.id));
        if (differs) save();
    }

    if (typeof window.addEventListener === 'function') window.addEventListener('storage', onStorage);

    /* ── Public API ────────────────────────────────────────── */

    const removedSheets = new Map();   // id → { index, wasActive }

    const State = {
        VERSION: STATE_VERSION,
        LIMITS,
        CURRENCIES: CURRENCIES.slice(),
        SETTING_LABELS: { ...SETTING_LABELS },
        WELCOME_TEXT,
        lastError: '',
        /** What the last backup import added (see mergeBackup). */
        lastImport: null,

        on,
        emit,
        save,

        /** A snapshot of the whole state (copies; strings are shared, not cloned). */
        get() {
            return {
                version: AppState.version,
                sheets: AppState.sheets.map(copySheet),
                activeSheetId: activeSheetRef().id,
                history: AppState.history.map(copyEntry),
                panes: clone(AppState.panes),
                ui: clone(AppState.ui),
                settings: { ...AppState.settings }
            };
        },

        settings() {
            return { ...AppState.settings };
        },

        /** The MathEngine options object built from the settings. */
        engineOptions,

        /* ── Sheets ─────────────────────────────── */

        sheets() {
            return AppState.sheets.map(copySheet);
        },

        sheet(id) {
            const s = findSheet(id);
            return s ? copySheet(s) : null;
        },

        activeSheet() {
            return copySheet(activeSheetRef());
        },

        /** Make a sheet the active one; emits 'active' and then 'results'. */
        setActiveSheet(id) {
            const sheet = findSheet(id);
            if (!sheet) {
                fail('That sheet no longer exists.');
                return false;
            }
            if (AppState.activeSheetId === id) return true;
            AppState.activeSheetId = id;
            emit('active', { id });
            save();
            refresh();
            return true;
        },

        /**
         * Add a sheet and make it active (opts.activate=false keeps the
         * current one). Returns the new sheet, or null when the library is
         * full (State.lastError says why).
         */
        addSheet(name, text = '', opts = {}) {
            if (AppState.sheets.length >= LIMITS.sheets) {
                fail(`You have ${LIMITS.sheets} sheets, the most mathMan keeps. Delete one to add another.`);
                return null;
            }
            const clean = cleanText(text);
            if (clean.cut) fail(`That text was longer than ${LIMITS.sheetChars.toLocaleString('en-US')} characters, so the end was left out.`);
            const at = now();
            const sheet = {
                id: uid('sheet'),
                name: uniqueName(cleanName(name)),
                text: clean.text,
                created: at,
                updated: at
            };
            AppState.sheets.push(sheet);
            emit('sheets', { action: 'add', id: sheet.id });
            if (opts.activate !== false) {
                AppState.activeSheetId = sheet.id;
                emit('active', { id: sheet.id });
                refresh();
            }
            save();
            return copySheet(sheet);
        },

        /**
         * Rename a sheet; an empty name, or one another sheet already has
         * (ignoring case), is refused. Returns the stored name or null
         * (State.lastError says why).
         */
        renameSheet(id, name) {
            const sheet = findSheet(id);
            const clean = cleanName(name);
            if (!sheet) {
                fail('That sheet no longer exists.');
                return null;
            }
            if (!clean) {
                fail('A sheet needs a name. Type at least one letter or number.');
                return null;
            }
            if (nameTaken(clean, id)) {
                const other = AppState.sheets.find((s) => s.id !== id && s.name.toLowerCase() === clean.toLowerCase());
                fail(`Another sheet is already called “${other ? other.name : clean}”. Each sheet needs its own name.`);
                return null;
            }
            if (sheet.name !== clean) {
                sheet.name = clean;
                sheet.updated = now();
                emit('sheets', { action: 'rename', id });
                save();
            }
            return clean;
        },

        /** Copy a sheet right after the original and make the copy active. */
        duplicateSheet(id) {
            const index = sheetIndex(id);
            if (index === -1) {
                fail('That sheet no longer exists.');
                return null;
            }
            if (AppState.sheets.length >= LIMITS.sheets) {
                fail(`You have ${LIMITS.sheets} sheets, the most mathMan keeps. Delete one to make a copy.`);
                return null;
            }
            const src = AppState.sheets[index];
            const at = now();
            const suffix = ' copy';
            const copy = {
                id: uid('sheet'),
                name: uniqueName(`${src.name.slice(0, LIMITS.name - suffix.length)}${suffix}`),
                text: src.text,
                created: at,
                updated: at
            };
            AppState.sheets.splice(index + 1, 0, copy);
            emit('sheets', { action: 'duplicate', id: copy.id });
            AppState.activeSheetId = copy.id;
            emit('active', { id: copy.id });
            refresh();
            save();
            return copySheet(copy);
        },

        /**
         * Remove a sheet and return it (State.restoreSheet() brings it back).
         * Deleting the last sheet leaves a fresh empty one in its place; when
         * the active sheet goes, its neighbour becomes active.
         */
        deleteSheet(id) {
            const index = sheetIndex(id);
            if (index === -1) {
                fail('That sheet no longer exists.');
                return null;
            }
            const wasActive = AppState.activeSheetId === id;
            const [removed] = AppState.sheets.splice(index, 1);
            removedSheets.set(removed.id, { index, wasActive });
            if (!AppState.sheets.length) {
                const at = now();
                AppState.sheets.push({ id: uid('sheet'), name: 'Sheet 1', text: '', created: at, updated: at });
            }
            // The active id must never dangle while listeners run, so the
            // neighbour takes over (and is evaluated) before 'sheets' fires.
            if (wasActive) {
                AppState.activeSheetId = AppState.sheets[Math.min(index, AppState.sheets.length - 1)].id;
                emit('active', { id: AppState.activeSheetId });
                refresh();
            }
            emit('sheets', { action: 'delete', id });
            save();
            return copySheet(removed);
        },

        /** Put a deleted sheet back where it was (and make it active again if it was). */
        restoreSheet(obj) {
            const sheet = sanitizeSheet(obj);
            if (!sheet) {
                fail('That sheet could not be restored.');
                return null;
            }
            if (AppState.sheets.length >= LIMITS.sheets) {
                fail(`You have ${LIMITS.sheets} sheets, the most mathMan keeps.`);
                return null;
            }
            if (findSheet(sheet.id)) sheet.id = uid('sheet');
            const info = (isPlainObject(obj) && removedSheets.get(obj.id)) || { index: AppState.sheets.length, wasActive: false };
            if (isPlainObject(obj)) removedSheets.delete(obj.id);
            AppState.sheets.splice(clamp(info.index, 0, AppState.sheets.length), 0, sheet);
            emit('sheets', { action: 'restore', id: sheet.id });
            if (info.wasActive) {
                AppState.activeSheetId = sheet.id;
                emit('active', { id: sheet.id });
                refresh();
            }
            save();
            return copySheet(sheet);
        },

        /** Move a sheet to a new position in the list. */
        moveSheet(from, to) {
            const n = AppState.sheets.length;
            if (![from, to].every(Number.isInteger) || from < 0 || from >= n || to < 0 || to >= n) return false;
            if (from === to) return true;
            const [item] = AppState.sheets.splice(from, 1);
            AppState.sheets.splice(to, 0, item);
            emit('sheets', { action: 'move', from, to });
            save();
            return true;
        },

        /**
         * Store a sheet's text (CRLF becomes LF; capped at 200,000
         * characters, with State.lastError explaining a cut). Emits 'text';
         * the active sheet re-evaluates once at the end of the current task
         * (or at once when result() / evaluate() is called first). Saving is
         * debounced. Returns false only when the sheet does not exist.
         */
        setSheetText(id, text) {
            const sheet = findSheet(id);
            if (!sheet) {
                fail('That sheet no longer exists.');
                return false;
            }
            const clean = cleanText(text);
            if (clean.cut) fail(`A sheet holds up to ${LIMITS.sheetChars.toLocaleString('en-US')} characters, so the end was left out.`);
            if (sheet.text === clean.text) return true;
            sheet.text = clean.text;
            sheet.updated = now();
            emit('text', { id, truncated: clean.cut });
            if (id === AppState.activeSheetId) queueRefresh();
            save();
            return true;
        },

        /* ── Results ────────────────────────────── */

        /** The evaluateSheet output for the active sheet (cached; read-only). */
        result() {
            return refresh();
        },

        /** Re-run the engine on the active sheet now, emit 'results', and return it. */
        evaluate() {
            flushQueued = false;
            return evaluateNow();
        },

        /** Format a plain number the way results are shown (engine formatter when present). */
        formatNumber(n, overrides) {
            const opts = Object.assign(engineOptions(), isPlainObject(overrides) ? overrides : {});
            const engine = window.MathEngine;
            if (engine && typeof engine.formatNumber === 'function') {
                try {
                    const out = engine.formatNumber(n, opts);
                    if (typeof out === 'string') return out;
                } catch (_err) { /* fall back to the built-in formatter */ }
            }
            return fallbackFormat(n, opts);
        },

        /* ── History ────────────────────────────── */

        history() {
            return AppState.history.map(copyEntry);
        },

        /**
         * Save a result: { expr, display, plain, sheetName? }. The same
         * expression and result as the newest entry only refreshes its time.
         * Returns the stored entry, or null (State.lastError says why).
         */
        pushHistory(entry) {
            if (!isPlainObject(entry)) {
                fail('There is no result to add to History.');
                return null;
            }
            const h = sanitizeEntry({
                expr: entry.expr,
                display: entry.display,
                plain: entry.plain,
                sheetName: has(entry, 'sheetName') ? entry.sheetName : activeSheetRef().name
            });
            if (!h) {
                const tooLong = (typeof entry.display === 'string' && entry.display.length > LIMITS.resultChars)
                    || (typeof entry.plain === 'string' && entry.plain.length > LIMITS.resultChars);
                fail(tooLong
                    ? 'That result is too long to keep in History. Copy it instead.'
                    : 'History needs a calculation and its result.');
                return null;
            }
            h.at = now();
            const top = AppState.history[0];
            if (top && top.expr === h.expr && top.plain === h.plain) {
                top.at = h.at;
                emit('history', { action: 'touch', id: top.id });
                save();
                return copyEntry(top);
            }
            AppState.history.unshift(h);
            if (AppState.history.length > AppState.settings.historySize) {
                AppState.history.length = AppState.settings.historySize;
            }
            emit('history', { action: 'add', id: h.id });
            save();
            return copyEntry(h);
        },

        removeHistory(id) {
            const index = AppState.history.findIndex((h) => h.id === id);
            if (index === -1) return null;
            const [removed] = AppState.history.splice(index, 1);
            emit('history', { action: 'remove', id });
            save();
            return copyEntry(removed);
        },

        clearHistory() {
            AppState.history = [];
            emit('history', { action: 'clear' });
            save();
            return true;
        },

        /* ── Per-pane preferences ───────────────── */

        /** The live preference object for a pane (created when missing). Call setPane() to persist changes. */
        pane(name) {
            if (!validPaneName(name)) return {};
            if (!isPlainObject(AppState.panes[name])) AppState.panes[name] = {};
            return AppState.panes[name];
        },

        /** Merge a JSON-safe patch into the pane's live object (references from pane() stay valid). */
        setPane(name, patch) {
            if (!validPaneName(name) || !isPlainObject(patch)) {
                fail('Pane preferences need a pane name and an object.');
                return null;
            }
            const live = State.pane(name);
            const clean = sanitizePaneValue(patch);
            if (!clean || !sanitizePaneValue({ ...live, ...clean })) {
                fail('Those pane preferences are too large to store.');
                return null;
            }
            Object.assign(live, clean);
            emit('panes', { name });
            save();
            return live;
        },

        /* ── Settings ───────────────────────────── */

        /** The value a setting would be saved as, or undefined when applySettings() would reject it. */
        validSetting(key, value) {
            return typeof key === 'string' && has(SETTING_RULES, key) ? SETTING_RULES[key](value) : undefined;
        },

        /** Validated merge. Returns { applied, rejected, changed } (setting keys); re-evaluates when needed. */
        applySettings(values) {
            const result = writeSettings(values);
            if (result.changed.length) {
                if (result.changed.includes('historySize') && AppState.history.length > AppState.settings.historySize) {
                    AppState.history.length = AppState.settings.historySize;
                    emit('history', { action: 'trim' });
                }
                emit('settings', { settings: { ...AppState.settings }, changed: result.changed.slice() });
                save();
                refresh();
            }
            return result;
        },

        /* ── Lifecycle ──────────────────────────── */

        /**
         * Add a backup's sheets and History without replacing anything.
         * Returns { sheetsAdded, sheetsSkipped, sheetsFull, sheetsRenamed,
         * historyAdded, historyFull, settings } — settings holds the backup's
         * differing settings (not applied) or null.
         */
        mergeBackup(backupState) {
            const report = mergeBackup(backupState);
            save();
            return report;
        },

        /**
         * Restore a saved / imported payload. opts.merge forces merge (true:
         * add only, returns the import report) or replace (false: null).
         */
        restore(saved, opts) {
            return restoreInto(saved, opts);
        },

        /** Back to first-run data (the Welcome sheet, default settings). The rail layout is kept. */
        reset() {
            removedSheets.clear();
            const welcome = welcomeSheet();
            AppState.sheets = [welcome];
            AppState.activeSheetId = welcome.id;
            AppState.history = [];
            // Empty each pane object in place so references held by modules stay live.
            Object.values(AppState.panes).forEach((p) => { Object.keys(p).forEach((k) => { delete p[k]; }); });
            AppState.settings = defaultSettings();
            cache = null;
        runToken++;
            emit('reset', { source: 'reset' });
            emit('sheets', { action: 'reset' });
            emit('active', { id: welcome.id });
            emit('history', { action: 'reset' });
            emit('panes', { action: 'reset' });
            emit('settings', { settings: { ...AppState.settings }, changed: Object.keys(SETTING_RULES) });
            refresh();
            save();
            return true;
        }
    };

    /* ── Fallback number formatting (engine absent) ────────── */

    function groupDigits(intPart, thousands) {
        const sep = thousands === 'comma' ? ',' : thousands === 'space' ? ' ' : '';
        return sep ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : intPart;
    }

    const trimZeros = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);

    /** Plain decimal digits of x rounded to `digits` significant digits, never in e-notation. */
    function plainDigits(x, digits) {
        const r = Number(x.toPrecision(digits));
        const abs = Math.abs(r);
        if (abs >= 1e21) return BigInt(r).toString();
        if (abs !== 0 && abs < 1e-6) {
            return trimZeros(r.toFixed(Math.min(100, digits - Math.floor(Math.log10(abs)) - 1)));
        }
        return String(r);
    }

    function fallbackFormat(n, o) {
        if (typeof n === 'boolean') return n ? 'true' : 'false';
        const x = Number(n);
        if (Number.isNaN(x)) return 'not a number';
        if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
        if (x === 0) return '0';
        const digits = clamp(Math.round(Number(o.precision)) || 10, 1, 17);
        const abs = Math.abs(x);
        const sci = o.notation === 'scientific' || o.notation === 'engineering'
            || (o.notation !== 'fixed' && (abs >= 1e15 || abs < 1e-6));
        if (sci) {
            const rounded = Number(x.toPrecision(digits));
            let exp = Math.floor(Math.log10(Math.abs(rounded)));
            if (o.notation === 'engineering') exp -= ((exp % 3) + 3) % 3;
            const mant = trimZeros(Number((rounded / Math.pow(10, exp)).toPrecision(digits)).toString());
            return `${mant}e${exp >= 0 ? '+' : ''}${exp}`;
        }
        const s = plainDigits(x, digits);
        const neg = s.startsWith('-');
        const [int, frac] = (neg ? s.slice(1) : s).split('.');
        return `${neg ? '-' : ''}${groupDigits(int, o.thousands)}${frac ? `.${frac}` : ''}`;
    }

    if (window.Storage) {
        Storage.configure({
            key: STORAGE_KEY,
            version: STATE_VERSION,
            getState: () => {
                syncBeforeSave();
                return AppState;
            },
            restore: (saved) => restoreInto(saved),
            trim: (state) => { state.history = []; }
        });
    }

    window.State = State;
    window.AppState = AppState;
})();
