/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StateManager (convertMan Edition - v1.0)
 *     - File Name: state.js
 *     - Relative Path: tools/convertman/js/state.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     convertMan's single source of truth: the input text and its From / To
 *     formats, per-format options, saved recipes, the Recent list, pane
 *     preferences, the rail layout, and settings. It also runs the
 *     conversion through window.Convert and keeps the last result, so every
 *     pane reads the same answer without converting the input again. Every
 *     change goes through this API, which validates it, emits an event, and
 *     schedules a save.
 *
 * ✒ Key Features:
 *     - Event bus: State.on(evt, fn) returns an unsubscribe function; events
 *       are input, formats, options, result, saved, recent, settings,
 *       panes, sync (another tab's changes merged in), and reset
 *     - Conversion: live after a short, size-aware pause when "Convert as
 *       you type" is on and the input is 512 KB or less; otherwise only
 *       convert({ force: true }) runs it, and the last result is marked
 *       stale with the reason ('manual' or 'large'). Auto-detect picks the
 *       format first so its own input options apply; identical requests
 *       are not converted twice; a missing converter or a thrown error
 *       becomes a plain-language result, never an exception
 *     - Per-format options with defaults from each format module, validated
 *       against the module's declared choices; the Indent, Line endings and
 *       Protect formula cells settings supply the output defaults
 *     - Saved recipes (formats, options, and the input up to 100 KB): add
 *       (names unique, ignoring case), rename, update, delete, restore,
 *       apply; capped at 100
 *     - Recent conversions recorded on their own, newest first, merged into
 *       the newest entry for the same formats within two minutes, and
 *       capped by settings.recentSize (10–200); snippets only while
 *       "Remember the input" is on and never for input that looks secret
 *     - Privacy: the input is kept in this browser only while "Remember
 *       the input" is on and it is 2 MB or less; stopRememberingInput()
 *       turns that off and wipes the stored copy at once; a backup never
 *       carries the current input
 *     - Allowlisted restore: id and name rules, format ids, option values,
 *       string and size caps, time ranges, reserved key names; anything
 *       malformed is dropped
 *     - Add-only backup merge: recipes and Recent entries are added, never
 *       replaced; settings that differ are reported, not applied
 *     - Several tabs at once: each save first merges what another tab
 *       stored (three-way, by id and update time), and a 'storage' event
 *       merges another tab's save as it lands, so no tab's stale copy can
 *       erase another tab's recipes, Recent entries, options, or settings
 *
 * ✒ Usage Instructions:
 *     Load after shared/js/storage.js and shared/js/workbench.js, after the
 *     js/formats/*.js modules and js/convert.js, and before every UI module.
 *     No init() call is needed: Storage.configure() runs at load time and
 *     ToolApp.boot() restores saved state before the modules start. UI code
 *     changes state only through State methods and re-renders on events.
 *     Objects handed out are copies, except result(), which is the shared
 *     last result and must be treated as read-only.
 *     Options: formatOptions(id, 'input' | 'output') returns the values for
 *     one direction, keyed by the module's option keys. With no direction
 *     it returns every stored key at once; when a format declares the same
 *     key for reading and writing (CSV's delimiter and header), the writing
 *     value is listed as 'output.<key>'. setFormatOptions(id, partial,
 *     direction) takes the same keys.
 *
 * ✒ Examples:
 *     State.setInput('a,b\n1,2', { name: 'data.csv', from: 'csv' })  → true; emits 'input', then 'result'
 *     State.setFormats('auto', 'json')            → true; emits 'formats'
 *     State.convert({ force: true })              → { ok, output, error, from, detected, to, warnings, stats, … }
 *     State.result().stale                        → true while the output is older than the input
 *     State.formatOptions('csv', 'output')        → { delimiter: ',', header: true, quote: 'needed', … }
 *     State.setFormatOptions('json', { indent: '4' }, 'output') → { applied: ['indent'], rejected: [], changed: ['indent'] }
 *     State.swap()                                → { from: 'yaml', to: 'json', usedOutput: true }
 *     State.addSaved('CSV to JSON')               → { id, name, from, to, options, text, created, updated }
 *     State.addSaved('csv to json')               → null; State.lastError: "You already have a recipe called …"
 *     State.applySettings({ recentSize: 20 })     → { applied: ['recentSize'], rejected: [], changed: ['recentSize'] }
 *     State.inputPersistence()                    → { remembered: false, reason: 'large', bytes: 3145728 }
 *     State.mergeBackup(backup.state)             → { savedAdded: 2, recentAdded: 5, settings: { … } | null, … }
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/storage.js (window.Storage), shared/js/
 *       workbench.js (uiDefaults / mergeUi); optional: shared/js/toolapp.js
 *       (debounced saves, ids), js/convert.js (window.Convert) and the
 *       js/formats/*.js modules (window.ConvertFormats)
 *     - Compatible platforms: all evergreen browsers
 *     - Security: restored and imported data is re-validated field by
 *       field; '__proto__', 'constructor' and 'prototype' are refused as
 *       keys at every depth; user text is never run, parsed as markup, or
 *       sent anywhere; the secrets check is this file's own linear scan of
 *       the first 1 MB, so no input can make it backtrack
 *     - Limitations: the localStorage quota applies (the trim hook drops
 *       the stored input and Recent first); input over 20 MB is refused;
 *       when two tabs edit the same recipe, the later edit wins; the input,
 *       its formats, pane fields, and the rail layout are kept per tab
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'toolman.convertman.state';
    const STATE_VERSION = '1.0.0';

    const KB = 1024;
    const MB = 1024 * 1024;

    const LIMITS = Object.freeze({
        inputBytes: 20 * MB,      // the most text convertMan takes at once
        liveBytes: 512 * KB,      // converted as you type up to this size
        persistBytes: 2 * MB,     // remembered in this browser up to this size
        fileBytes: 25 * MB,       // the most a picked or dropped file may weigh
        saved: 100,
        savedTextBytes: 100 * KB, // input kept with one recipe
        savedTextTotal: 2 * MB,   // input kept across every recipe
        recentMin: 10,
        recentMax: 200,
        name: 80,
        fileName: 200,
        snippet: 80,
        optionText: 200,
        optionKeys: 40,
        formats: 40,
        panes: 40,
        paneBytes: 20000
    });

    const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];
    const OUT_PREFIX = 'output.';
    const DEFAULT_FROM = 'auto';
    const DEFAULT_TO = 'yaml';
    const RECENT_MERGE_MS = 2 * 60 * 1000;
    const DAY_MS = 86400000;

    const INDENTS = ['2', '4', 'tab'];
    const LINE_ENDINGS = ['LF', 'CRLF'];
    const HOUR_CYCLES = ['auto', '12', '24'];
    const WEEK_STARTS = ['monday', 'sunday'];
    const NUMBER_LOCALES = ['auto', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'ja-JP', 'zh-CN', 'hi-IN', 'ar-EG'];

    /* A small, friendly first input: every line converts cleanly to every
       tree format, and nothing in it looks like a secret. */
    const SAMPLE_TEXT = [
        '{',
        '  "project": "convertMan",',
        '  "tagline": "From anything, to anything",',
        '  "version": 1,',
        '  "offline": true,',
        '  "formats": ["JSON", "YAML", "TOML", "CSV", "XML"],',
        '  "author": {',
        '    "name": "Ada Lovelace",',
        '    "since": 1843',
        '  }',
        '}',
        ''
    ].join('\n');

    /* The contract's formats, used only when no format module loaded, so a
       restored From / To survives a missing script. */
    const FALLBACK_FORMATS = [
        ['json', 'JSON', 'tree', true], ['jsonl', 'JSON Lines', 'tree', true], ['yaml', 'YAML', 'tree', true],
        ['toml', 'TOML', 'tree', true], ['csv', 'CSV', 'table', true], ['tsv', 'TSV', 'table', true],
        ['xml', 'XML', 'tree', true], ['ini', 'INI', 'flat', true], ['env', '.env', 'flat', true],
        ['query', 'Query string', 'flat', true], ['markdown', 'Markdown table', 'table', true],
        ['html', 'HTML table', 'table', false], ['sql', 'SQL INSERT', 'table', false]
    ].map(([id, label, kind, canParse]) => Object.freeze({
        id, label, kind, canParse, canStringify: true, extensions: [], fallback: true
    }));

    /* ── Small helpers ─────────────────────────────────────── */

    const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const now = () => Date.now();
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

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

    const validFormatId = (v) => typeof v === 'string' && /^[a-z][a-z0-9-]{0,19}$/.test(v) && !RESERVED_KEYS.includes(v);
    const validOptionKey = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(v) && !RESERVED_KEYS.includes(v);
    const validStoreKey = (v) => typeof v === 'string'
        && validOptionKey(v.startsWith(OUT_PREFIX) ? v.slice(OUT_PREFIX.length) : v);

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

    /** A file name for display only: no folders, no control characters, capped. */
    function cleanFileName(v) {
        if (typeof v !== 'string') return '';
        // eslint-disable-next-line no-control-regex
        const base = v.replace(/[\u0000-\u001F\u007F]/g, '').split(/[\\/]/).pop().trim();
        return base.slice(0, LIMITS.fileName);
    }

    /** First words of an input, on one line, for the Recent list. */
    function cleanSnippet(v) {
        if (typeof v !== 'string') return '';
        // eslint-disable-next-line no-control-regex
        const s = v.slice(0, 400).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
        return s.length > LIMITS.snippet ? `${s.slice(0, LIMITS.snippet - 1)}…` : s;
    }

    const byteCount = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e10 ? v : 0);

    /** UTF-8 length of a string without encoding it (cached for the last string). */
    let bytesMemo = { text: null, bytes: 0 };
    function utf8Bytes(text) {
        if (typeof text !== 'string') return 0;
        if (bytesMemo.text === text) return bytesMemo.bytes;
        let n = text.length;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            if (c < 0x80) continue;
            if (c < 0x800) n += 1;
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
                const d = text.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) { n += 2; i++; } else n += 2;
            } else n += 2;
        }
        bytesMemo = { text, bytes: n };
        return n;
    }

    /** '1.5 MB', '512 KB', '120 bytes' — for messages. */
    function formatBytes(n) {
        if (!Number.isFinite(n) || n < 0) return '0 bytes';
        if (n < KB) return `${n} ${n === 1 ? 'byte' : 'bytes'}`;
        if (n < MB) return `${(n / KB).toFixed(n < 10 * KB ? 1 : 0).replace(/\.0$/, '')} KB`;
        return `${(n / MB).toFixed(1).replace(/\.0$/, '')} MB`;
    }

    /* ── Format registry access (never throws) ─────────────── */

    let registryCache = null;

    /** Every format module: Convert.list() first, then window.ConvertFormats, then the contract list. */
    function registry() {
        if (registryCache) return registryCache;
        try {
            if (window.Convert && typeof Convert.list === 'function') {
                const list = Convert.list();
                if (Array.isArray(list) && list.length) {
                    registryCache = list.filter((m) => m && validFormatId(m.id));
                    return registryCache;
                }
            }
        } catch (err) {
            console.error('[State] Convert.list failed:', err);
        }
        const reg = window.ConvertFormats;
        if (reg && typeof reg === 'object') {
            const mods = Object.keys(reg).filter((k) => !RESERVED_KEYS.includes(k)).map((k) => reg[k])
                .filter((m) => m && typeof m === 'object' && validFormatId(m.id));
            if (mods.length) {
                registryCache = mods;
                return mods;
            }
        }
        return FALLBACK_FORMATS;
    }

    const moduleOf = (id) => (validFormatId(id) ? registry().find((m) => m.id === id) || null : null);
    const parses = (id) => { const m = moduleOf(id); return Boolean(m) && m.canParse !== false; };
    const writes = (id) => { const m = moduleOf(id); return Boolean(m) && m.canStringify !== false; };
    const labelOf = (id) => { const m = moduleOf(id); return m && typeof m.label === 'string' ? m.label : String(id || ''); };

    /* ── Format options ────────────────────────────────────── */

    function optionList(m, dir) {
        const list = m && (dir === 'input' ? m.inputOptions : m.outputOptions);
        return Array.isArray(list) ? list.filter((o) => o && validOptionKey(o.key)) : [];
    }

    const declaresOptions = (m) => Boolean(m) && (Array.isArray(m.inputOptions) || Array.isArray(m.outputOptions));
    const findOption = (m, dir, key) => optionList(m, dir).find((o) => o.key === key) || null;

    /** Where an option's value is stored: an output key the input also declares gets the 'output.' prefix. */
    function storeKey(m, dir, key) {
        if (dir !== 'output') return key;
        return findOption(m, 'input', key) ? `${OUT_PREFIX}${key}` : key;
    }

    /** The value as the option would hold it, or undefined when the option cannot take it. */
    function validOptionValue(opt, v) {
        switch (opt.type) {
            case 'checkbox':
                return typeof v === 'boolean' ? v : undefined;
            case 'select': {
                if (!Array.isArray(opt.choices) || (typeof v !== 'string' && typeof v !== 'number')) return undefined;
                const hit = opt.choices.find((c) => c && String(c.value) === String(v));
                return hit ? hit.value : undefined;
            }
            case 'number': {
                if ((typeof v !== 'number' && typeof v !== 'string') || v === '') return undefined;
                const n = Number(v);
                if (!Number.isFinite(n)) return undefined;
                if (typeof opt.min === 'number' && n < opt.min) return undefined;
                if (typeof opt.max === 'number' && n > opt.max) return undefined;
                if (Number.isInteger(opt.default) && !Number.isInteger(n)) return undefined;
                return n;
            }
            case 'text':
                if (typeof v !== 'string' || v.length > LIMITS.optionText) return undefined;
                // eslint-disable-next-line no-control-regex
                return v.replace(/[\u0000-\u001F\u007F]/g, ' ');
            default:
                return undefined;
        }
    }

    /** A value of a format nobody can check right now (its module did not load). */
    function looseValue(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.length <= LIMITS.optionText) return v;
        return undefined;
    }

    /** The global settings that act as output defaults: Indent, Line endings, Protect formula cells. */
    function settingDefault(opt) {
        const s = AppState.settings;
        if (opt.key === 'indent' && opt.type === 'select') return validOptionValue(opt, s.indent);
        if (opt.key === 'lineEnding' && opt.type === 'select') return validOptionValue(opt, s.lineEnding);
        if (opt.key === 'protectFormulas' && opt.type === 'checkbox') return s.csvProtect;
        return undefined;
    }

    function optionDefault(opt, dir) {
        if (dir === 'output') {
            const fromSettings = settingDefault(opt);
            if (fromSettings !== undefined) return fromSettings;
        }
        return opt.default;
    }

    function storedOptions(id) {
        return validFormatId(id) && has(AppState.options, id) && isPlainObject(AppState.options[id])
            ? AppState.options[id]
            : null;
    }

    /** Defaults merged with stored values for one direction, keyed by the module's option keys. */
    function resolveOptions(id, dir) {
        const m = moduleOf(id);
        const stored = storedOptions(id) || {};
        const out = {};
        optionList(m, dir).forEach((opt) => {
            const sk = storeKey(m, dir, opt.key);
            const v = has(stored, sk) ? validOptionValue(opt, stored[sk]) : undefined;
            out[opt.key] = v !== undefined ? v : optionDefault(opt, dir);
        });
        return out;
    }

    /** A stored option map, checked against the module when it loaded (loosely when it did not). */
    function sanitizeFormatOptions(id, raw) {
        if (!isPlainObject(raw)) return null;
        const m = moduleOf(id);
        const strict = declaresOptions(m);
        const out = {};
        Object.keys(raw).slice(0, LIMITS.optionKeys * 2).forEach((sk) => {
            if (!validStoreKey(sk)) return;
            if (!strict) {
                const v = looseValue(raw[sk]);
                if (v !== undefined) out[sk] = v;
                return;
            }
            const isOut = sk.startsWith(OUT_PREFIX);
            const key = isOut ? sk.slice(OUT_PREFIX.length) : sk;
            let opt = null;
            if (isOut) {
                opt = findOption(m, 'output', key);
                if (opt && storeKey(m, 'output', key) !== sk) opt = null;
            } else {
                opt = findOption(m, 'input', key) || findOption(m, 'output', key);
            }
            if (!opt) return;
            const v = validOptionValue(opt, raw[sk]);
            if (v !== undefined) out[sk] = v;
        });
        return out;
    }

    function sanitizeOptions(raw) {
        if (!isPlainObject(raw)) return null;
        const out = {};
        Object.keys(raw).slice(0, LIMITS.formats).forEach((id) => {
            if (!validFormatId(id)) return;
            const clean = sanitizeFormatOptions(id, raw[id]);
            if (clean && Object.keys(clean).length) out[id] = clean;
        });
        return out;
    }

    /* ── Secrets ───────────────────────────────────────────── */

    // Linear by construction: keys are found by a bounded scan that starts
    // only at a key's first character, and each short key is then tested for
    // a secret word, so no input can make the check backtrack.
    const SECRET_SCAN_CHARS = MB;
    const SECRET_SCAN_KEYS = 50000;
    const SECRET_WORD = /pass(?:word|wd|phrase)|pwd|secret|token|api[_.-]?key|access[_.-]?key|private[_.-]?key|client[_.-]?secret|credential|auth[_.-]?key/i;
    const KEY_SCAN = /(?<![A-Za-z0-9_.-])([A-Za-z_][A-Za-z0-9_.-]{0,63})["']?[ \t]*(?:[:=]|>)/g;
    const SECRET_SHAPES = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,255}\b|\bxox[abprs]-[A-Za-z0-9-]{10,255}|\bsk_live_[A-Za-z0-9]{16,255}|\bAIza[0-9A-Za-z_-]{35}\b/;
    const ENV_LINE = /^[ \t]*(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=/gm;

    let secretMemo = { text: null, value: false };

    /**
     * True when the text looks like a .env file, a private key or a known
     * token, or holds password / secret / token / key fields. Only the first
     * 1 MB is read.
     */
    function isSecretLike(text) {
        if (typeof text !== 'string' || !text) return false;
        if (secretMemo.text === text) return secretMemo.value;
        const head = text.length > SECRET_SCAN_CHARS ? text.slice(0, SECRET_SCAN_CHARS) : text;
        let value = SECRET_SHAPES.test(head);
        if (!value) {
            KEY_SCAN.lastIndex = 0;
            let m;
            let n = 0;
            while (!value && n++ < SECRET_SCAN_KEYS && (m = KEY_SCAN.exec(head))) value = SECRET_WORD.test(m[1]);
        }
        if (!value) {
            const sample = head.slice(0, 64 * KB);
            const lines = sample.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
            const envLines = (sample.match(ENV_LINE) || []).length;
            value = lines.length > 0 && envLines >= 2 && envLines >= lines.length * 0.8;
        }
        secretMemo = { text, value };
        return value;
    }

    /* ── Defaults ──────────────────────────────────────────── */

    function defaultSettings() {
        return {
            liveConvert: true,
            rememberInput: true,
            indent: '2',
            lineEnding: 'LF',
            csvProtect: false,
            recentSize: 50,
            timeZone: 'device',
            hourCycle: 'auto',
            weekStart: 'monday',
            numberLocale: 'auto'
        };
    }

    const defaultInput = () => ({ text: SAMPLE_TEXT, from: DEFAULT_FROM, to: DEFAULT_TO, name: '' });

    const AppState = {
        version: STATE_VERSION,
        // Changes on every save; lets a tab tell its own writes from another tab's.
        rev: '',
        input: defaultInput(),
        options: {},
        saved: [],
        recent: [],
        panes: {},
        ui: window.Workbench
            ? Workbench.uiDefaults({ library: 'saved', tools: 'time' })
            : { leftPanelCollapsed: false, rightPanelCollapsed: false, openSection: { library: 'saved', tools: 'time' }, sectionOrder: {} },
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

    /** Save at once (privacy changes must not wait for the debounce). */
    function saveNow() {
        if (window.ToolApp && ToolApp.config && typeof ToolApp.saveNow === 'function') return ToolApp.saveNow(false);
        return window.Storage ? Storage.save() : false;
    }

    function fail(message) {
        State.lastError = message;
        return message;
    }

    /* ── Settings rules ────────────────────────────────────── */

    const oneOf = (list) => (v) => {
        const s = typeof v === 'number' ? String(v) : v;
        return typeof s === 'string' && list.includes(s) ? s : undefined;
    };
    const bool = (v) => (typeof v === 'boolean' ? v : undefined);

    function intIn(lo, hi) {
        return (v) => {
            if (v === '' || v === null || typeof v === 'boolean') return undefined;
            const n = Number(v);
            return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
        };
    }

    const zoneMemo = new Map();
    /** 'device', 'UTC', or an IANA zone this browser knows. */
    function validZone(v) {
        if (v === 'device' || v === 'UTC') return v;
        if (typeof v !== 'string' || v.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(v)) return undefined;
        if (!zoneMemo.has(v)) {
            let ok = false;
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: v }).format(0);
                ok = true;
            } catch (_err) {
                ok = false;
            }
            if (zoneMemo.size < 500) zoneMemo.set(v, ok);
            else return ok ? v : undefined;
        }
        return zoneMemo.get(v) ? v : undefined;
    }

    const SETTING_RULES = {
        liveConvert: bool,
        rememberInput: bool,
        indent: oneOf(INDENTS),
        lineEnding: oneOf(LINE_ENDINGS),
        csvProtect: bool,
        recentSize: intIn(LIMITS.recentMin, LIMITS.recentMax),
        timeZone: validZone,
        hourCycle: oneOf(HOUR_CYCLES),
        weekStart: oneOf(WEEK_STARTS),
        numberLocale: oneOf(NUMBER_LOCALES)
    };

    const SETTING_LABELS = {
        liveConvert: 'Convert as you type',
        rememberInput: 'Remember the input',
        indent: 'Indent',
        lineEnding: 'Line endings',
        csvProtect: 'Protect formula cells',
        recentSize: 'Conversions to keep in Recent',
        timeZone: 'Time zone',
        hourCycle: 'Clock',
        weekStart: 'Week starts on',
        numberLocale: 'Number format'
    };

    // Settings that change what a conversion writes.
    const OUTPUT_SETTINGS = ['indent', 'lineEnding', 'csvProtect'];

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

    /* ── Sanitizers (restore and merge) ────────────────────── */

    function sanitizeInput(raw) {
        if (!isPlainObject(raw)) return null;
        const text = typeof raw.text === 'string' && raw.text.length <= LIMITS.persistBytes
            && utf8Bytes(raw.text) <= LIMITS.persistBytes ? raw.text : '';
        return {
            text,
            from: raw.from === 'auto' || parses(raw.from) ? raw.from : DEFAULT_FROM,
            to: writes(raw.to) ? raw.to : DEFAULT_TO,
            name: text ? cleanFileName(raw.name) : ''
        };
    }

    function sanitizeRecipe(s) {
        if (!isPlainObject(s)) return null;
        const name = cleanName(s.name);
        const from = s.from === 'auto' || validFormatId(s.from) ? s.from : null;
        const to = validFormatId(s.to) ? s.to : null;
        if (!name || !from || !to) return null;
        const text = typeof s.text === 'string' && s.text.length <= LIMITS.savedTextBytes
            && utf8Bytes(s.text) <= LIMITS.savedTextBytes ? s.text : '';
        const created = validTime(s.created) || now();
        return {
            id: validId(s.id) ? s.id : uid('recipe'),
            name,
            from,
            to,
            options: sanitizeOptions(s.options) || {},
            text,
            created,
            updated: Math.max(created, validTime(s.updated) || created)
        };
    }

    function sanitizeSavedList(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const ids = new Set();
        const names = new Set();
        for (const item of list) {
            if (out.length >= LIMITS.saved) break;
            const s = sanitizeRecipe(item);
            if (!s) continue;
            if (ids.has(s.id)) s.id = uid('recipe');
            if (names.has(s.name.toLowerCase())) continue;
            ids.add(s.id);
            names.add(s.name.toLowerCase());
            out.push(s);
        }
        return out.sort((a, b) => b.created - a.created);
    }

    function sanitizeRecent(r) {
        if (!isPlainObject(r) || !validFormatId(r.from) || !validFormatId(r.to)) return null;
        return {
            id: validId(r.id) ? r.id : uid('recent'),
            from: r.from,
            to: r.to,
            inBytes: byteCount(r.inBytes),
            outBytes: byteCount(r.outBytes),
            at: validTime(r.at) || now(),
            snippet: AppState.settings.rememberInput ? cleanSnippet(r.snippet) : ''
        };
    }

    function sanitizeRecentList(list, cap = LIMITS.recentMax) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const ids = new Set();
        for (const item of list) {
            if (out.length >= cap) break;
            const r = sanitizeRecent(item);
            if (!r) continue;
            if (ids.has(r.id)) r.id = uid('recent');
            ids.add(r.id);
            out.push(r);
        }
        return out.sort((a, b) => b.at - a.at);
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

    /* ── Copies ────────────────────────────────────────────── */

    const copyRecipe = (s) => ({
        id: s.id, name: s.name, from: s.from, to: s.to, options: clone(s.options), text: s.text, created: s.created, updated: s.updated
    });
    const copyRecent = (r) => ({ id: r.id, from: r.from, to: r.to, inBytes: r.inBytes, outBytes: r.outBytes, at: r.at, snippet: r.snippet });
    const copyInput = () => ({ text: AppState.input.text, from: AppState.input.from, to: AppState.input.to, name: AppState.input.name });

    /* ── Saved recipe helpers ──────────────────────────────── */

    const findSaved = (id) => AppState.saved.find((s) => s.id === id) || null;

    function nameTaken(name, exceptId) {
        const lower = name.toLowerCase();
        return AppState.saved.some((s) => s.id !== exceptId && s.name.toLowerCase() === lower);
    }

    /** name, or "name 2", "name 3" … when it is taken. */
    function uniqueName(base) {
        if (!nameTaken(base)) return base;
        for (let n = 2; n < 1000; n++) {
            const suffix = ` ${n}`;
            const candidate = `${base.slice(0, LIMITS.name - suffix.length)}${suffix}`;
            if (!nameTaken(candidate)) return candidate;
        }
        return base;
    }

    const sortSaved = () => AppState.saved.sort((a, b) => b.created - a.created);
    const savedTextBytes = (exceptId) => AppState.saved.reduce((n, s) => (s.id === exceptId ? n : n + utf8Bytes(s.text)), 0);

    /** The options a recipe needs: the From format (or the detected one), and the To format. */
    function recipeOptions(from, to) {
        const ids = new Set([to]);
        if (from !== 'auto') ids.add(from);
        else if (lastResult && lastResult.from && !lastResult.stale) ids.add(lastResult.from);
        const out = {};
        ids.forEach((id) => {
            const stored = storedOptions(id);
            if (stored && Object.keys(stored).length) out[id] = { ...stored };
        });
        return out;
    }

    /** The current input when it can travel with a recipe; '' with State.lastNote saying why not. */
    function recipeText(exceptId) {
        const text = AppState.input.text;
        if (!text) return '';
        if (isSecretLike(text)) {
            State.lastNote = 'The input looks like it holds passwords or keys, so the recipe keeps only the formats and options.';
            return '';
        }
        const bytes = utf8Bytes(text);
        if (bytes > LIMITS.savedTextBytes) {
            State.lastNote = `The input is ${formatBytes(bytes)}; a recipe keeps input up to ${formatBytes(LIMITS.savedTextBytes)}, so this one keeps only the formats and options.`;
            return '';
        }
        if (savedTextBytes(exceptId) + bytes > LIMITS.savedTextTotal) {
            State.lastNote = `Saved recipes already hold ${formatBytes(LIMITS.savedTextTotal)} of input, so this one keeps only the formats and options.`;
            return '';
        }
        return text;
    }

    /* ── Recent ────────────────────────────────────────────── */

    /** Add or refresh a Recent entry; opts.secret drops the snippet. Returns the stored entry. */
    function recordRecent(entry, opts = {}) {
        if (!isPlainObject(entry) || !validFormatId(entry.from) || !validFormatId(entry.to)) return null;
        const keepSnippet = AppState.settings.rememberInput && !opts.secret;
        const snippetText = keepSnippet && typeof entry.snippet === 'string' && !isSecretLike(entry.snippet)
            ? cleanSnippet(entry.snippet) : '';
        const at = now();
        const top = AppState.recent[0];
        if (top && top.from === entry.from && top.to === entry.to && at - top.at < RECENT_MERGE_MS) {
            top.at = at;
            top.inBytes = byteCount(entry.inBytes);
            top.outBytes = byteCount(entry.outBytes);
            top.snippet = snippetText;
            emit('recent', { action: 'touch', id: top.id });
            save();
            return copyRecent(top);
        }
        const r = {
            id: uid('recent'),
            from: entry.from,
            to: entry.to,
            inBytes: byteCount(entry.inBytes),
            outBytes: byteCount(entry.outBytes),
            at,
            snippet: snippetText
        };
        AppState.recent.unshift(r);
        if (AppState.recent.length > AppState.settings.recentSize) AppState.recent.length = AppState.settings.recentSize;
        emit('recent', { action: 'add', id: r.id });
        save();
        return copyRecent(r);
    }

    function stripSnippets() {
        let changed = false;
        AppState.recent.forEach((r) => {
            if (r.snippet) {
                r.snippet = '';
                changed = true;
            }
        });
        if (changed) emit('recent', { action: 'privacy' });
        return changed;
    }

    /* ── Conversion ────────────────────────────────────────── */

    const MISSING = 'The converter did not load, so nothing can be converted. Reload the page to try again.';
    const FAILED = 'Something went wrong converting this input. Change the input or the formats, or reload the page.';

    let lastResult = null;       // what result() returns (may be a stale marker)
    let lastFresh = null;        // the last real conversion (never stale)
    let lastKey = null;          // { text, from, to, rev } of lastFresh
    let optionsRev = 0;          // bumps on any change that alters output for the same text
    let convertTimer = null;
    let userTouched = false;     // a user change since the last Recent entry

    const emptyStats = (inBytes = 0) => ({ inBytes, outBytes: 0, records: 0, keys: 0, depth: 0, ms: 0 });

    function baseResult(extra) {
        return Object.assign({
            ok: false,
            output: '',
            error: null,
            from: null,
            detected: false,
            candidates: [],
            to: AppState.input.to,
            warnings: [],
            stats: emptyStats(),
            at: now(),
            empty: false,
            stale: false,
            reason: ''
        }, extra);
    }

    function publish(result, key) {
        lastResult = result;
        lastFresh = result;
        lastKey = key;
        emit('result', result);
        return result;
    }

    /** The Error a format threw, as a plain object the UI can show. */
    function errorInfo(err, fallbackFormat, stage) {
        const e = err && typeof err === 'object' ? err : {};
        const message = typeof e.message === 'string' && e.message.trim() ? e.message.trim().slice(0, 600) : FAILED;
        const num = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
        return {
            message,
            line: num(e.line),
            column: num(e.column),
            offset: num(e.offset),
            format: validFormatId(e.format) ? e.format : fallbackFormat,
            stage: e.stage === 'parse' || e.stage === 'stringify' || e.stage === 'detect' ? e.stage : stage
        };
    }

    function detectFormats(text) {
        try {
            if (!window.Convert || typeof Convert.detect !== 'function') return [];
            const list = Convert.detect(text);
            return Array.isArray(list)
                ? list.filter((c) => c && parses(c.id)).slice(0, 3).map((c) => ({
                    id: c.id,
                    label: typeof c.label === 'string' ? c.label : labelOf(c.id),
                    confidence: Number.isFinite(Number(c.confidence)) ? Number(c.confidence) : 0
                }))
                : [];
        } catch (err) {
            console.error('[State] Convert.detect failed:', err);
            return [];
        }
    }

    /** LF to CRLF for formats that do not write line endings themselves. */
    function applyLineEnding(text, toId) {
        if (AppState.settings.lineEnding !== 'CRLF' || !text.includes('\n')) return text;
        if (findOption(moduleOf(toId), 'output', 'lineEnding')) return text;
        return text.replace(/\r?\n/g, '\r\n');
    }

    function sameKey(key) {
        return Boolean(lastKey) && lastKey.text === key.text && lastKey.from === key.from
            && lastKey.to === key.to && lastKey.rev === key.rev;
    }

    /** Convert the input now, or mark the last result stale when live conversion should not run. */
    function runConvert(force) {
        clearTimeout(convertTimer);
        convertTimer = null;
        const input = AppState.input;
        const text = input.text;
        const key = { text, from: input.from, to: input.to, rev: optionsRev };

        if (sameKey(key) && lastFresh) {
            // Nothing changed since the last conversion: its output is current.
            if (force || lastResult !== lastFresh) {
                lastResult = lastFresh;
                emit('result', lastFresh);
            }
            return lastFresh;
        }

        const bytes = utf8Bytes(text);
        if (!text.trim()) {
            return publish(baseResult({ ok: true, empty: true, stats: emptyStats(bytes) }), key);
        }
        if (bytes > LIMITS.inputBytes) {
            return publish(baseResult({
                stats: emptyStats(bytes),
                reason: 'too-big',
                error: {
                    message: `The input is ${formatBytes(bytes)}; convertMan works with up to ${formatBytes(LIMITS.inputBytes)} at a time. Split it into smaller parts.`,
                    line: null, column: null, offset: null, format: null, stage: 'parse'
                }
            }), key);
        }

        if (!force && (!AppState.settings.liveConvert || bytes > LIMITS.liveBytes)) {
            const reason = AppState.settings.liveConvert ? 'large' : 'manual';
            const prev = lastFresh && !lastFresh.empty ? lastFresh : null;
            const stale = Object.assign({}, prev || baseResult({ stats: emptyStats(bytes) }), { stale: true, reason });
            lastResult = stale;
            emit('result', stale);
            return stale;
        }

        if (!window.Convert || typeof Convert.convert !== 'function') {
            return publish(baseResult({
                stats: emptyStats(bytes),
                reason: 'missing',
                error: { message: MISSING, line: null, column: null, offset: null, format: null, stage: 'parse' }
            }), key);
        }

        let fromId = input.from;
        let detected = false;
        let candidates = [];
        if (fromId === 'auto') {
            candidates = detectFormats(text);
            if (!candidates.length) {
                return publish(baseResult({
                    stats: emptyStats(bytes),
                    error: {
                        message: 'convertMan could not tell what format this is. Choose the input format in the From list.',
                        line: null, column: null, offset: null, format: null, stage: 'detect'
                    }
                }), key);
            }
            fromId = candidates[0].id;
            detected = true;
        }

        const started = clock();
        try {
            const res = Convert.convert(text, fromId, input.to, {
                input: resolveOptions(fromId, 'input'),
                output: resolveOptions(input.to, 'output')
            });
            if (!res || typeof res.text !== 'string') throw new Error(FAILED);
            const output = applyLineEnding(res.text, input.to);
            const s = isPlainObject(res.stats) ? res.stats : {};
            const count = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
            const result = baseResult({
                ok: true,
                output,
                from: validFormatId(res.from) ? res.from : fromId,
                detected,
                candidates,
                to: input.to,
                warnings: Array.isArray(res.warnings) ? res.warnings.filter((w) => typeof w === 'string').slice(0, 50) : [],
                stats: {
                    inBytes: count(s.inBytes) || bytes,
                    outBytes: output === res.text && count(s.outBytes) ? count(s.outBytes) : utf8Bytes(output),
                    records: count(s.records),
                    keys: count(s.keys),
                    depth: count(s.depth),
                    ms: Number.isFinite(Number(s.ms)) ? Number(s.ms) : Math.round(clock() - started)
                }
            });
            publish(result, key);
            if (userTouched || force) {
                userTouched = false;
                recordRecent({
                    from: result.from, to: result.to, inBytes: result.stats.inBytes, outBytes: result.stats.outBytes, snippet: text
                }, { secret: isSecretLike(text) });
            }
            return result;
        } catch (err) {
            const stage = err && err.stage === 'stringify' ? 'stringify' : 'parse';
            return publish(baseResult({
                from: fromId,
                detected,
                candidates,
                stats: Object.assign(emptyStats(bytes), { ms: Math.round(clock() - started) }),
                error: errorInfo(err, stage === 'stringify' ? input.to : fromId, stage)
            }), key);
        }
    }

    /** Debounced live conversion; the pause grows with the input so typing stays smooth. */
    function scheduleConvert(delay) {
        clearTimeout(convertTimer);
        let wait = delay;
        if (wait === undefined) {
            const n = AppState.input.text.length;
            wait = n < 20000 ? 180 : n < 200000 ? 350 : 600;
        }
        convertTimer = setTimeout(() => {
            convertTimer = null;
            try {
                runConvert(false);
            } catch (err) {
                console.error('[State] conversion failed:', err);
            }
        }, wait);
    }

    /** Does a change to this format's options alter the current conversion? */
    function affectsConversion(id) {
        const input = AppState.input;
        return id === input.to || id === input.from || (input.from === 'auto' && Boolean(lastResult) && lastResult.from === id);
    }

    /* ── Restore / merge ───────────────────────────────────── */

    function backupCopyName(name) {
        const suffix = ' (from backup)';
        return `${cleanName(name, 'Recipe').slice(0, LIMITS.name - suffix.length)}${suffix}`;
    }

    const recipeSignature = (s) => JSON.stringify([s.from, s.to, s.text, s.options]);

    /**
     * Merge an imported backup without replacing anything this browser
     * holds. Recipes and Recent entries are added; a recipe that is already
     * here (same formats, options and input under the same name or its
     * "(from backup)" name) is skipped, one whose id is taken gets a new id,
     * and one whose name is taken is renamed "{name} (from backup)". Format
     * options are added only for formats this browser has never set. The
     * input, settings, panes already set, and the layout stay as they are;
     * settings that differ are returned in report.settings. Recipes past
     * the 2 MB input budget are added without their input.
     */
    function mergeBackup(saved) {
        const report = {
            savedAdded: 0, savedSkipped: 0, savedRenamed: 0, savedFull: 0, savedTextDropped: 0,
            recentAdded: 0, recentFull: 0, optionsAdded: 0, settings: null
        };
        if (!isPlainObject(saved)) {
            State.lastImport = report;
            return report;
        }

        const recipes = sanitizeSavedList(saved.saved) || [];
        const isHere = (s) => {
            const copyName = backupCopyName(s.name);
            const sig = recipeSignature(s);
            return AppState.saved.some((q) => recipeSignature(q) === sig
                && (q.name === s.name || q.name === copyName || q.name.startsWith(`${copyName} `)));
        };
        let textRoom = Math.max(0, LIMITS.savedTextTotal - savedTextBytes());
        recipes.forEach((s) => {
            if (isHere(s)) {
                report.savedSkipped++;
                return;
            }
            if (AppState.saved.length >= LIMITS.saved) {
                report.savedFull++;
                return;
            }
            // Recipes keep up to 2 MB of input in all; past that they keep only formats and options.
            if (s.text) {
                const bytes = utf8Bytes(s.text);
                if (bytes > textRoom) {
                    s.text = '';
                    report.savedTextDropped++;
                } else {
                    textRoom -= bytes;
                }
            }
            if (findSaved(s.id)) s.id = uid('recipe');
            if (nameTaken(s.name)) {
                s.name = uniqueName(backupCopyName(s.name));
                report.savedRenamed++;
            }
            AppState.saved.push(s);
            report.savedAdded++;
        });
        if (report.savedAdded) sortSaved();

        const recent = sanitizeRecentList(saved.recent) || [];
        const room = Math.max(0, AppState.settings.recentSize - AppState.recent.length);
        const ids = new Set(AppState.recent.map((r) => r.id));
        const known = new Set(AppState.recent.map((r) => `${r.from}\u0000${r.to}\u0000${r.at}`));
        const fresh = recent.filter((r) => !ids.has(r.id) && !known.has(`${r.from}\u0000${r.to}\u0000${r.at}`));
        const taken = fresh.slice(0, room);
        report.recentAdded = taken.length;
        report.recentFull = fresh.length - taken.length;
        if (taken.length) AppState.recent = AppState.recent.concat(taken).sort((a, b) => b.at - a.at);

        const options = sanitizeOptions(saved.options);
        if (options) {
            Object.keys(options).forEach((id) => {
                if (storedOptions(id) && Object.keys(AppState.options[id]).length) return;
                AppState.options[id] = options[id];
                report.optionsAdded++;
            });
        }

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
        if (report.savedAdded) emit('saved', { action: 'import' });
        if (report.recentAdded) emit('recent', { action: 'import' });
        if (report.optionsAdded) {
            optionsRev++;
            emit('options', { action: 'import' });
        }
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
            if (!Array.isArray(saved.saved) && !Array.isArray(saved.recent)) {
                throw new Error("that file is not a convertMan backup — it has no saved recipes or Recent list. Choose a file made by convertMan's Download backup.");
            }
            return mergeBackup(saved);
        }

        if (isPlainObject(saved.settings)) writeSettings(saved.settings);

        const input = sanitizeInput(saved.input);
        State.restoredDrop = isPlainObject(saved.input) && (saved.input.dropped === 'large' || saved.input.dropped === 'quota')
            && AppState.settings.rememberInput ? saved.input.dropped : '';
        if (input) {
            if (!AppState.settings.rememberInput) {
                input.text = '';
                input.name = '';
            }
            AppState.input = input;
        }

        const options = sanitizeOptions(saved.options);
        if (options) AppState.options = options;

        const recipes = sanitizeSavedList(saved.saved);
        if (recipes) AppState.saved = recipes;

        const recent = sanitizeRecentList(saved.recent, AppState.settings.recentSize);
        if (recent) AppState.recent = recent;

        const panes = sanitizePanes(saved.panes);
        if (panes) AppState.panes = panes;

        // Layout is a per-browser preference: only the boot restore applies it.
        if (window.Workbench) Workbench.mergeUi(AppState.ui, saved.ui);

        lastResult = null;
        lastFresh = null;
        lastKey = null;
        optionsRev++;
        // What was read is the base the next save or another tab's save is merged against.
        storedRev = revOf(saved);
        storedBase = snapshotBase(AppState);
        pending = null;
        return null;
    }

    /* ── Other tabs ────────────────────────────────────────── */

    // Two convertMan tabs share one localStorage key. Each save first reads
    // what is stored; when another tab wrote it since this tab last looked,
    // the two are merged before writing, and a 'storage' event merges
    // another tab's save as soon as it lands. The merge is three-way
    // against the stored state this tab last knew for sure: a recipe
    // another tab added is added here, one it deleted is deleted here unless
    // this tab edited it since, the newer edit of a recipe wins, and Recent,
    // format options, and settings follow the same rules. The input, its
    // formats, pane fields, and the rail layout stay per tab.

    // storedRev / storedBase: the stored state this tab last knew for sure
    // (read at boot, merged from another tab, or its own write once seen in
    // storage). pending: this tab's latest write, until it is seen there.
    let storedRev = '';
    // Until a restore reads something, the store is empty, which reads back
    // as the defaults: another tab's first save then merges against them.
    let storedBase = null;
    let pending = null;

    const newRev = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    function snapshotBase(state) {
        const saved = Array.isArray(state.saved) ? state.saved : [];
        const recent = Array.isArray(state.recent) ? state.recent : [];
        const options = new Map();
        if (isPlainObject(state.options)) {
            Object.keys(state.options).forEach((id) => options.set(id, JSON.stringify(state.options[id])));
        }
        return {
            saved: new Map(saved.map((s) => [s.id, s.updated])),
            recent: new Set(recent.map((r) => r.id)),
            settings: isPlainObject(state.settings) ? { ...state.settings } : null,
            options
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
     * { savedAdded, savedRemoved, savedUpdated, recent, settings: [keys],
     * options: [format ids] }.
     */
    function mergeFromStore(saved) {
        const report = { savedAdded: 0, savedRemoved: 0, savedUpdated: 0, recent: false, settings: [], options: [] };

        const incoming = sanitizeSavedList(saved.saved);
        if (incoming) {
            const seen = new Set();
            incoming.forEach((s) => {
                seen.add(s.id);
                const mine = findSaved(s.id);
                if (mine) {
                    if (s.updated > mine.updated && (s.name !== mine.name || recipeSignature(s) !== recipeSignature(mine))) {
                        mine.name = nameTaken(s.name, s.id) ? mine.name : s.name;
                        mine.from = s.from;
                        mine.to = s.to;
                        mine.options = s.options;
                        mine.text = s.text;
                        mine.updated = s.updated;
                        report.savedUpdated++;
                    }
                } else if (!storedBase.saved.has(s.id) && AppState.saved.length < LIMITS.saved) {
                    // New in the other tab (a recipe this tab deleted stays deleted).
                    if (nameTaken(s.name)) s.name = uniqueName(s.name);
                    AppState.saved.push(s);
                    report.savedAdded++;
                }
            });
            // Deleted in the other tab, and not edited here since.
            const keep = AppState.saved.filter((s) => seen.has(s.id) || !storedBase.saved.has(s.id)
                || s.updated > storedBase.saved.get(s.id));
            report.savedRemoved = AppState.saved.length - keep.length;
            if (report.savedRemoved) AppState.saved = keep;
            if (report.savedAdded) sortSaved();
        }

        const recent = sanitizeRecentList(saved.recent);
        if (recent) {
            const ids = new Set(recent.map((r) => r.id));
            const before = AppState.recent.map((r) => r.id).join('|');
            const kept = AppState.recent.filter((r) => ids.has(r.id) || !storedBase.recent.has(r.id));
            const known = new Set(kept.map((r) => r.id));
            recent.forEach((r) => {
                if (!known.has(r.id) && !storedBase.recent.has(r.id)) kept.push(r);
            });
            kept.sort((a, b) => b.at - a.at);
            if (kept.length > AppState.settings.recentSize) kept.length = AppState.settings.recentSize;
            if (kept.map((r) => r.id).join('|') !== before) {
                AppState.recent = kept;
                report.recent = true;
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
            if (report.settings.includes('rememberInput') && !AppState.settings.rememberInput) stripSnippets();
            if (report.settings.includes('recentSize') && AppState.recent.length > AppState.settings.recentSize) {
                AppState.recent.length = AppState.settings.recentSize;
                report.recent = true;
            }
        }

        const options = sanitizeOptions(saved.options);
        if (options) {
            const ids = new Set(Object.keys(options).concat(Object.keys(AppState.options)));
            ids.forEach((id) => {
                const theirs = has(options, id) ? JSON.stringify(options[id]) : undefined;
                const base = storedBase.options.get(id);
                const mine = storedOptions(id) ? JSON.stringify(AppState.options[id]) : undefined;
                if (theirs === base || mine !== base || theirs === mine) return;
                if (theirs === undefined) delete AppState.options[id];
                else AppState.options[id] = options[id];
                report.options.push(id);
            });
        }

        const panes = sanitizePanes(saved.panes);
        if (panes) {
            Object.keys(panes).forEach((name) => {
                if (!isPlainObject(AppState.panes[name])) AppState.panes[name] = panes[name];
            });
        }

        if (report.savedAdded || report.savedRemoved || report.savedUpdated) emit('saved', { action: 'sync' });
        if (report.recent) emit('recent', { action: 'sync' });
        if (report.settings.length) {
            emit('settings', { settings: { ...AppState.settings }, changed: report.settings.slice() });
        }
        if (report.options.length) emit('options', { action: 'sync', ids: report.options.slice() });
        if (report.options.length || report.settings.some((k) => OUTPUT_SETTINGS.includes(k) || k === 'liveConvert')) {
            optionsRev++;
            scheduleConvert(0);
        }
        const touched = report.savedAdded || report.savedRemoved || report.savedUpdated || report.recent
            || report.settings.length || report.options.length;
        if (touched) emit('sync', report);
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
            saved: sanitizeSavedList(saved.saved) || [],
            recent: sanitizeRecentList(saved.recent) || [],
            options: sanitizeOptions(saved.options) || {},
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
        const differs = AppState.saved.length !== storedBase.saved.size
            || AppState.saved.some((s) => storedBase.saved.get(s.id) !== s.updated)
            || AppState.recent.some((r) => !storedBase.recent.has(r.id))
            || Object.keys(AppState.options).some((id) => storedBase.options.get(id) !== JSON.stringify(AppState.options[id]));
        if (differs) save();
    }

    storedBase = snapshotBase(AppState);

    if (typeof window.addEventListener === 'function') window.addEventListener('storage', onStorage);

    /* ── What gets stored ──────────────────────────────────── */

    let exporting = false;       // true while Storage.export() builds a backup
    let quotaDroppedInput = false;

    /** Why the input is or is not kept in this browser. */
    function inputPersistence() {
        const bytes = utf8Bytes(AppState.input.text);
        if (!AppState.settings.rememberInput) return { remembered: false, reason: 'off', bytes };
        if (bytes > LIMITS.persistBytes) return { remembered: false, reason: 'large', bytes };
        if (quotaDroppedInput) return { remembered: false, reason: 'quota', bytes };
        return { remembered: true, reason: '', bytes };
    }

    /**
     * The object Storage writes. The input text is left out when it is not
     * to be remembered (setting off, over 2 MB) and from every backup file.
     */
    function persistable() {
        if (!exporting) syncBeforeSave();
        const tooLarge = utf8Bytes(AppState.input.text) > LIMITS.persistBytes;
        const keep = !exporting && AppState.settings.rememberInput && !tooLarge;
        if (keep) quotaDroppedInput = false;
        return {
            version: AppState.version,
            rev: AppState.rev,
            input: {
                text: keep ? AppState.input.text : '',
                from: AppState.input.from,
                to: AppState.input.to,
                name: keep ? AppState.input.name : '',
                // Lets the next visit say why the input is empty.
                dropped: !exporting && AppState.settings.rememberInput && tooLarge ? 'large' : ''
            },
            options: AppState.options,
            saved: AppState.saved,
            recent: AppState.recent,
            panes: AppState.panes,
            ui: AppState.ui,
            settings: AppState.settings
        };
    }

    /* ── Public API ────────────────────────────────────────── */

    const removedSaved = new Map();   // id → index, for restoreSaved()

    const State = {
        VERSION: STATE_VERSION,
        LIMITS,
        SAMPLE_TEXT,
        SETTING_LABELS: { ...SETTING_LABELS },
        NUMBER_LOCALES: NUMBER_LOCALES.slice(),
        lastError: '',
        /** An informational note from the last call (a recipe saved without its input, …). */
        lastNote: '',
        /** What the last backup import added (see mergeBackup). */
        lastImport: null,
        /** Set at boot when the last visit's input was not kept: 'large' (over 2 MB), 'quota' (storage full), or ''. */
        restoredDrop: '',

        on,
        emit,
        save,

        /** A snapshot of the whole state (copies; strings are shared, not cloned). */
        get() {
            return {
                version: AppState.version,
                input: copyInput(),
                options: clone(AppState.options),
                saved: AppState.saved.map(copyRecipe),
                recent: AppState.recent.map(copyRecent),
                panes: clone(AppState.panes),
                ui: clone(AppState.ui),
                settings: { ...AppState.settings }
            };
        },

        settings() {
            return { ...AppState.settings };
        },

        /* ── Formats ────────────────────────────── */

        /** [{ id, label, kind, extensions, mime, canParse, canStringify, notes }] in display order. */
        formats() {
            return registry().map((m) => ({
                id: m.id,
                label: typeof m.label === 'string' ? m.label : m.id,
                kind: typeof m.kind === 'string' ? m.kind : 'tree',
                extensions: Array.isArray(m.extensions) ? m.extensions.slice() : [],
                mime: typeof m.mime === 'string' ? m.mime : 'text/plain',
                canParse: m.canParse !== false,
                canStringify: m.canStringify !== false,
                notes: typeof m.notes === 'string' ? m.notes : ''
            }));
        },

        formatLabel(id) {
            return id === 'auto' ? 'Auto-detect' : labelOf(id);
        },

        /** True when no real format module loaded (the lists are the contract's names only). */
        formatsMissing() {
            return registry() === FALLBACK_FORMATS;
        },

        /* ── Input ──────────────────────────────── */

        input() {
            return copyInput();
        },

        /**
         * Replace the input text; opts.name (file name or '') and opts.from
         * (a format id or 'auto') are optional. Emits 'input' (and 'formats'
         * when From changed), saves after a pause, and converts after a
         * size-aware pause when live conversion applies. Returns false (with
         * State.lastError) when the text is over 20 MB or not text.
         */
        setInput(text, opts = {}) {
            if (typeof text !== 'string') {
                fail('The input must be text.');
                return false;
            }
            // Every character is 1 to 3 bytes, so only text near the cap needs an exact count.
            const tooBig = text.length > LIMITS.inputBytes
                || (text.length * 3 > LIMITS.inputBytes && utf8Bytes(text) > LIMITS.inputBytes);
            if (tooBig) {
                const bytes = text.length > LIMITS.inputBytes ? text.length : utf8Bytes(text);
                fail(`That text is ${formatBytes(bytes)}; convertMan works with up to ${formatBytes(LIMITS.inputBytes)} at a time. Split it into smaller parts.`);
                return false;
            }
            const o = isPlainObject(opts) ? opts : {};
            const input = AppState.input;
            let formatsChanged = false;
            if (has(o, 'from') && (o.from === 'auto' || parses(o.from)) && o.from !== input.from) {
                input.from = o.from;
                formatsChanged = true;
            }
            const textChanged = input.text !== text;
            const name = has(o, 'name') ? cleanFileName(o.name) : input.name;
            const nameChanged = name !== input.name;
            input.text = text;
            input.name = name;
            if (!textChanged && !nameChanged && !formatsChanged) return true;
            userTouched = true;
            if (formatsChanged) emit('formats', { from: input.from, to: input.to });
            emit('input', { name: input.name, length: text.length, source: typeof o.source === 'string' ? o.source.slice(0, 20) : 'set' });
            save();
            scheduleConvert(formatsChanged ? 0 : undefined);
            return true;
        },

        /** Is the input kept in this browser? { remembered, reason: '' | 'off' | 'large' | 'quota', bytes }. */
        inputPersistence,

        /** Set From ('auto' or a readable format) and To (a writable format); null / undefined keeps one. */
        setFormats(from, to) {
            const input = AppState.input;
            const nextFrom = from === undefined || from === null ? input.from : from;
            const nextTo = to === undefined || to === null ? input.to : to;
            if (nextFrom !== 'auto' && !parses(nextFrom)) {
                fail(writes(nextFrom)
                    ? `${labelOf(nextFrom)} can be written but not read. Choose another From format.`
                    : 'That input format is not available.');
                return false;
            }
            if (!writes(nextTo)) {
                fail('That output format is not available.');
                return false;
            }
            if (nextFrom === input.from && nextTo === input.to) return true;
            input.from = nextFrom;
            input.to = nextTo;
            userTouched = true;
            emit('formats', { from: nextFrom, to: nextTo });
            save();
            scheduleConvert(0);
            return true;
        },

        /**
         * From ← To and To ← the chosen (or detected) From; the last output
         * becomes the input when there is a current one. Returns
         * { from, to, usedOutput } or null (State.lastError says why).
         */
        swap() {
            const input = AppState.input;
            const res = lastResult;
            const newFrom = input.to;
            if (!parses(newFrom)) {
                fail(`${labelOf(newFrom)} can be written but not read, so the formats can't be swapped. Choose another To format first.`);
                return null;
            }
            let newTo = input.from;
            if (newTo === 'auto') {
                newTo = res && res.from && !res.stale ? res.from : null;
                if (!newTo && input.text.trim()) {
                    const found = detectFormats(input.text);
                    newTo = found.length ? found[0].id : null;
                }
                if (!newTo) {
                    fail('Choose the input format in the From list first: convertMan could not tell what the input is, so it does not know what to swap to.');
                    return null;
                }
            }
            if (!writes(newTo)) {
                fail(`${labelOf(newTo)} can't be written, so the formats can't be swapped.`);
                return null;
            }
            const usedOutput = Boolean(res && res.ok && !res.stale && !res.empty && res.to === input.to
                && typeof res.output === 'string' && res.output.length > 0 && res.output.length <= LIMITS.inputBytes);
            input.from = newFrom;
            input.to = newTo;
            userTouched = true;
            if (usedOutput) {
                input.text = res.output;
                input.name = '';
                emit('input', { name: '', length: input.text.length, source: 'swap' });
            }
            emit('formats', { from: newFrom, to: newTo });
            save();
            runConvert(false);
            return { from: newFrom, to: newTo, usedOutput };
        },

        /* ── Format options ─────────────────────── */

        /**
         * Option values with defaults merged. direction 'input' or 'output'
         * gives that side keyed by option key; none gives every stored key
         * (a writing key the reading side also declares is 'output.<key>').
         */
        formatOptions(id, direction) {
            if (!validFormatId(id)) return {};
            if (direction === 'input' || direction === 'output') return resolveOptions(id, direction);
            const m = moduleOf(id);
            if (!declaresOptions(m)) return { ...(storedOptions(id) || {}) };
            const flat = resolveOptions(id, 'input');
            const out = resolveOptions(id, 'output');
            Object.keys(out).forEach((k) => { flat[storeKey(m, 'output', k)] = out[k]; });
            return flat;
        },

        /**
         * Store option values for a format (validated against its declared
         * choices). Without a direction a plain key is the reading option
         * when the format has one, else the writing option; 'output.<key>'
         * always means writing. A value equal to its default is not stored,
         * so the Indent / Line endings settings keep applying. Returns
         * { applied, rejected, changed } or null; emits 'options' and
         * converts again when the change affects the current conversion.
         */
        setFormatOptions(id, partial, direction) {
            const m = moduleOf(id);
            if (!declaresOptions(m)) {
                fail('That format has no options to change.');
                return null;
            }
            if (!isPlainObject(partial)) {
                fail('Format options need an object of option names and values.');
                return null;
            }
            const report = { applied: [], rejected: [], changed: [] };
            const stored = { ...(storedOptions(id) || {}) };
            let firstBad = null;
            Object.keys(partial).slice(0, LIMITS.optionKeys * 2).forEach((rawKey) => {
                let dir = direction === 'input' || direction === 'output' ? direction : null;
                let key = rawKey;
                if (!dir && typeof key === 'string' && key.startsWith(OUT_PREFIX)) {
                    dir = 'output';
                    key = key.slice(OUT_PREFIX.length);
                }
                let opt = null;
                if (validOptionKey(key)) {
                    if (dir) opt = findOption(m, dir, key);
                    else {
                        opt = findOption(m, 'input', key);
                        dir = 'input';
                        if (!opt) {
                            opt = findOption(m, 'output', key);
                            dir = 'output';
                        }
                    }
                }
                const v = opt ? validOptionValue(opt, partial[rawKey]) : undefined;
                if (v === undefined) {
                    report.rejected.push(rawKey);
                    if (!firstBad) firstBad = opt;
                    return;
                }
                const sk = storeKey(m, dir, key);
                const fallback = optionDefault(opt, dir);
                const prev = has(stored, sk) ? validOptionValue(opt, stored[sk]) : undefined;
                const before = prev !== undefined ? prev : fallback;
                if (v === fallback) delete stored[sk];
                else stored[sk] = v;
                report.applied.push(rawKey);
                if (before !== v) report.changed.push(rawKey);
            });
            if (report.rejected.length) {
                fail(firstBad && typeof firstBad.label === 'string'
                    ? `That value can't be used for “${firstBad.label}”. Choose one of the listed options.`
                    : `${labelOf(id)} has no option called “${String(report.rejected[0]).slice(0, 40)}”.`);
            }
            if (Object.keys(stored).length) AppState.options[id] = stored;
            else delete AppState.options[id];
            if (report.changed.length) {
                optionsRev++;
                userTouched = true;
                emit('options', { id, changed: report.changed.slice() });
                save();
                if (affectsConversion(id)) scheduleConvert(0);
            }
            return report;
        },

        /** Forget every stored option of a format (back to its defaults). */
        resetFormatOptions(id) {
            if (!storedOptions(id)) return true;
            delete AppState.options[id];
            optionsRev++;
            userTouched = true;
            emit('options', { id, changed: ['*'] });
            save();
            if (affectsConversion(id)) scheduleConvert(0);
            return true;
        },

        /* ── Conversion ─────────────────────────── */

        /** The last conversion (read-only) or null: { ok, output, error, from, detected, candidates, to, warnings, stats, at, empty, stale, reason }. */
        result() {
            return lastResult;
        },

        /**
         * Convert now. Without force it only runs when live conversion is
         * on and the input is 512 KB or less; otherwise the last result is
         * re-emitted with stale: true and reason 'manual' or 'large'.
         * Emits 'result' and returns the result.
         */
        convert(opts = {}) {
            const force = isPlainObject(opts) && Boolean(opts.force);
            if (force) userTouched = true;
            try {
                return runConvert(force);
            } catch (err) {
                console.error('[State] conversion failed:', err);
                return publish(baseResult({
                    error: { message: FAILED, line: null, column: null, offset: null, format: null, stage: 'parse' }
                }), null);
            }
        },

        /** Would the next conversion run by itself? { live, reason: '' | 'manual' | 'large' | 'too-big' }. */
        liveStatus() {
            const bytes = utf8Bytes(AppState.input.text);
            if (bytes > LIMITS.inputBytes) return { live: false, reason: 'too-big', bytes };
            if (!AppState.settings.liveConvert) return { live: false, reason: 'manual', bytes };
            if (bytes > LIMITS.liveBytes) return { live: false, reason: 'large', bytes };
            return { live: true, reason: '', bytes };
        },

        /* ── Saved recipes ──────────────────────── */

        saved() {
            return AppState.saved.map(copyRecipe);
        },

        savedRecipe(id) {
            const s = findSaved(id);
            return s ? copyRecipe(s) : null;
        },

        /**
         * Save the current formats, their options, and the input (up to
         * 100 KB, never input that looks secret) under a name. A name another
         * recipe has (ignoring case) is refused. Returns the recipe or null
         * (State.lastError says why); State.lastNote says when the input was
         * left out.
         */
        addSaved(name) {
            State.lastNote = '';
            const clean = cleanName(name);
            if (!clean) {
                fail('A saved recipe needs a name. Type at least one letter or number.');
                return null;
            }
            const other = AppState.saved.find((s) => s.name.toLowerCase() === clean.toLowerCase());
            if (other) {
                fail(`You already have a recipe called “${other.name}”. Choose another name.`);
                return null;
            }
            if (AppState.saved.length >= LIMITS.saved) {
                fail(`You have ${LIMITS.saved} saved recipes, the most convertMan keeps. Delete one to save another.`);
                return null;
            }
            const at = now();
            const input = AppState.input;
            const recipe = {
                id: uid('recipe'),
                name: clean,
                from: input.from,
                to: input.to,
                options: recipeOptions(input.from, input.to),
                text: recipeText(),
                created: at,
                updated: at
            };
            AppState.saved.unshift(recipe);
            emit('saved', { action: 'add', id: recipe.id });
            save();
            return copyRecipe(recipe);
        },

        /** Rename a recipe; empty or taken names are refused. Returns the stored name or null. */
        renameSaved(id, name) {
            const recipe = findSaved(id);
            const clean = cleanName(name);
            if (!recipe) {
                fail('That recipe no longer exists.');
                return null;
            }
            if (!clean) {
                fail('A saved recipe needs a name. Type at least one letter or number.');
                return null;
            }
            if (nameTaken(clean, id)) {
                const other = AppState.saved.find((s) => s.id !== id && s.name.toLowerCase() === clean.toLowerCase());
                fail(`You already have a recipe called “${other ? other.name : clean}”. Each recipe needs its own name.`);
                return null;
            }
            if (recipe.name !== clean) {
                recipe.name = clean;
                recipe.updated = now();
                emit('saved', { action: 'rename', id });
                save();
            }
            return clean;
        },

        /** Overwrite a recipe with the current formats, options, and input. Returns it or null. */
        updateSaved(id) {
            State.lastNote = '';
            const recipe = findSaved(id);
            if (!recipe) {
                fail('That recipe no longer exists.');
                return null;
            }
            const input = AppState.input;
            recipe.from = input.from;
            recipe.to = input.to;
            recipe.options = recipeOptions(input.from, input.to);
            recipe.text = recipeText(id);
            recipe.updated = now();
            emit('saved', { action: 'update', id });
            save();
            return copyRecipe(recipe);
        },

        /** Remove a recipe and return it (State.restoreSaved() puts it back). */
        deleteSaved(id) {
            const index = AppState.saved.findIndex((s) => s.id === id);
            if (index === -1) {
                fail('That recipe no longer exists.');
                return null;
            }
            const [removed] = AppState.saved.splice(index, 1);
            removedSaved.set(removed.id, index);
            emit('saved', { action: 'delete', id });
            save();
            return copyRecipe(removed);
        },

        /** Put a deleted recipe back where it was. */
        restoreSaved(obj) {
            const recipe = sanitizeRecipe(obj);
            if (!recipe) {
                fail('That recipe could not be restored.');
                return null;
            }
            if (AppState.saved.length >= LIMITS.saved) {
                fail(`You have ${LIMITS.saved} saved recipes, the most convertMan keeps.`);
                return null;
            }
            if (findSaved(recipe.id)) recipe.id = uid('recipe');
            if (nameTaken(recipe.name)) recipe.name = uniqueName(recipe.name);
            const index = isPlainObject(obj) && removedSaved.has(obj.id) ? removedSaved.get(obj.id) : 0;
            if (isPlainObject(obj)) removedSaved.delete(obj.id);
            AppState.saved.splice(Math.min(Math.max(0, index), AppState.saved.length), 0, recipe);
            emit('saved', { action: 'restore', id: recipe.id });
            save();
            return copyRecipe(recipe);
        },

        /**
         * Use a recipe: its formats, its options for them, and its input
         * when it kept one. Converts when live conversion applies. Returns
         * the recipe or null (State.lastError says why).
         */
        applySaved(id) {
            const recipe = findSaved(id);
            if (!recipe) {
                fail('That recipe no longer exists.');
                return null;
            }
            if ((recipe.from !== 'auto' && !parses(recipe.from)) || !writes(recipe.to)) {
                fail(`This recipe uses a format that is not available here (${labelOf(recipe.from === 'auto' ? recipe.to : recipe.from)}).`);
                return null;
            }
            const input = AppState.input;
            const formatsChanged = input.from !== recipe.from || input.to !== recipe.to;
            input.from = recipe.from;
            input.to = recipe.to;
            const ids = Object.keys(recipe.options);
            ids.forEach((fid) => {
                const clean = sanitizeFormatOptions(fid, recipe.options[fid]);
                if (clean && Object.keys(clean).length) AppState.options[fid] = clean;
                else delete AppState.options[fid];
            });
            // Formats the recipe kept no options for go back to their defaults.
            [recipe.from, recipe.to].forEach((fid) => {
                if (fid !== 'auto' && !ids.includes(fid)) delete AppState.options[fid];
            });
            optionsRev++;
            userTouched = true;
            if (formatsChanged) emit('formats', { from: input.from, to: input.to });
            emit('options', { id: recipe.to, changed: ['*'], action: 'recipe' });
            if (recipe.text) {
                input.text = recipe.text;
                input.name = '';
                emit('input', { name: '', length: recipe.text.length, source: 'recipe' });
            }
            save();
            runConvert(false);
            return copyRecipe(recipe);
        },

        /* ── Recent ─────────────────────────────── */

        recent() {
            return AppState.recent.map(copyRecent);
        },

        /**
         * Record a conversion: { from, to, inBytes, outBytes, snippet }.
         * State already records each successful conversion a person asked
         * for, so modules rarely need this. The same formats within two
         * minutes refresh the newest entry instead of adding one; the
         * snippet is kept only while "Remember the input" is on.
         */
        pushRecent(entry) {
            const r = recordRecent(entry);
            if (!r) fail('Recent needs the From and To formats of a conversion.');
            return r;
        },

        removeRecent(id) {
            const index = AppState.recent.findIndex((r) => r.id === id);
            if (index === -1) return null;
            const [removed] = AppState.recent.splice(index, 1);
            emit('recent', { action: 'remove', id });
            save();
            return copyRecent(removed);
        },

        clearRecent() {
            AppState.recent = [];
            emit('recent', { action: 'clear' });
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

        /** Validated merge. Returns { applied, rejected, changed } (setting keys). */
        applySettings(values) {
            const result = writeSettings(values);
            if (!result.changed.length) return result;
            const changed = result.changed;
            if (changed.includes('recentSize') && AppState.recent.length > AppState.settings.recentSize) {
                AppState.recent.length = AppState.settings.recentSize;
                emit('recent', { action: 'trim' });
            }
            if (changed.includes('rememberInput') && !AppState.settings.rememberInput) stripSnippets();
            emit('settings', { settings: { ...AppState.settings }, changed: changed.slice() });
            if (changed.includes('rememberInput')) saveNow();
            else save();
            if (changed.some((k) => OUTPUT_SETTINGS.includes(k))) optionsRev++;
            if (changed.some((k) => OUTPUT_SETTINGS.includes(k) || k === 'liveConvert')) scheduleConvert(0);
            return result;
        },

        /** Turn "Remember the input" off and remove the stored copy (and Recent snippets) right away. */
        stopRememberingInput() {
            const result = writeSettings({ rememberInput: false });
            stripSnippets();
            if (result.changed.length) emit('settings', { settings: { ...AppState.settings }, changed: ['rememberInput'] });
            return saveNow();
        },

        /** The IANA time zone the Time tools use ('device' resolves to this device's zone). */
        timeZone() {
            const z = AppState.settings.timeZone;
            if (z !== 'device') return z;
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
            } catch (_err) {
                return 'UTC';
            }
        },

        /** The locale for number formatting ('auto' resolves to this browser's language). */
        numberLocale() {
            const l = AppState.settings.numberLocale;
            if (l !== 'auto') return l;
            try {
                const lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
                return Intl.NumberFormat.supportedLocalesOf([lang]).length ? lang : 'en-US';
            } catch (_err) {
                return 'en-US';
            }
        },

        /** Intl's hour12: undefined (locale default), true, or false. */
        hour12() {
            const c = AppState.settings.hourCycle;
            return c === '12' ? true : c === '24' ? false : undefined;
        },

        /* ── Helpers ────────────────────────────── */

        isSecretLike,
        byteLength: utf8Bytes,
        formatBytes,

        /* ── Lifecycle ──────────────────────────── */

        /**
         * Add a backup's recipes and Recent entries without replacing
         * anything. Returns { savedAdded, savedSkipped, savedRenamed,
         * savedFull, savedTextDropped, recentAdded, recentFull, optionsAdded,
         * settings }.
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

        /** Back to first-run data (the sample input, default settings). The rail layout is kept. */
        reset() {
            removedSaved.clear();
            clearTimeout(convertTimer);
            convertTimer = null;
            AppState.input = defaultInput();
            AppState.options = {};
            AppState.saved = [];
            AppState.recent = [];
            // Empty each pane object in place so references held by modules stay live.
            Object.values(AppState.panes).forEach((p) => { Object.keys(p).forEach((k) => { delete p[k]; }); });
            AppState.settings = defaultSettings();
            lastResult = null;
            lastFresh = null;
            lastKey = null;
            optionsRev++;
            userTouched = false;
            quotaDroppedInput = false;
            emit('reset', { source: 'reset' });
            emit('input', { name: '', length: AppState.input.text.length, source: 'reset' });
            emit('formats', { from: AppState.input.from, to: AppState.input.to });
            emit('options', { action: 'reset' });
            emit('saved', { action: 'reset' });
            emit('recent', { action: 'reset' });
            emit('panes', { action: 'reset' });
            emit('settings', { settings: { ...AppState.settings }, changed: Object.keys(SETTING_RULES) });
            runConvert(false);
            save();
            return true;
        }
    };

    if (window.Storage) {
        Storage.configure({
            key: STORAGE_KEY,
            version: STATE_VERSION,
            getState: () => persistable(),
            restore: (saved) => restoreInto(saved),
            // Over quota: the input (which can be pasted again) and Recent go first.
            trim: (state) => {
                if (state && state.input && state.input.text) {
                    state.input.text = '';
                    state.input.name = '';
                    state.input.dropped = 'quota';
                    quotaDroppedInput = true;
                }
                if (state) state.recent = [];
            }
        });

        // A backup file never carries the current input: it may hold secrets.
        if (typeof Storage.export === 'function' && !Storage.export.convertManWrapped) {
            const kitExport = Storage.export.bind(Storage);
            const wrapped = () => {
                exporting = true;
                try {
                    return kitExport();
                } finally {
                    exporting = false;
                }
            };
            wrapped.convertManWrapped = true;
            Storage.export = wrapped;
        }
    }

    window.State = State;
    window.AppState = AppState;
})();
