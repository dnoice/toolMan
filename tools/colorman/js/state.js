/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StateManager (colorMan Edition - v1.0)
 *     - File Name: state.js
 *     - Relative Path: tools/colorman/js/state.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     colorMan's single source of truth: the active color, the working
 *     palette, the palette library, saved colors, recent colors, the
 *     gradient, per-pane preferences, and settings. Every UI module reads
 *     and changes state through the State API, which validates input, emits
 *     an event, and schedules a save, so panes stay in step without talking
 *     to each other directly.
 *
 * ✒ Key Features:
 *     - Event bus: State.on(evt, fn) returns an unsubscribe function; events
 *       are active, working, library, history, gradient, settings, reset
 *     - Active color with session undo/redo (cap 100); a drag gesture sent
 *       with coalesce:true collapses into one undo step (500ms window)
 *     - Recent colors recorded 900ms after the color settles, de-duplicated,
 *       capped by settings.historySize, flushed when the page is hidden
 *     - Working palette: add, remove, move, recolor, rename, replace, clear,
 *       and sort by hue, lightness, chroma, or reverse (OKLCH)
 *     - Palette library linked to the working palette: save, save as, open,
 *       rename, duplicate, delete with restore, and import
 *     - Saved colors de-duplicated by hex, with toggle, rename, and restore
 *     - Gradient model (linear, radial, conic) with validated stops
 *     - Free-form per-pane preference objects (State.pane / State.setPane)
 *     - Validated settings with a list of rejected keys for friendly errors
 *     - Allowlisted restore: hex regex, size caps, name limits, and range
 *       checks; backups imported after boot merge instead of replacing
 *     - Works without the color engine: hex parsing, formatting, and the
 *       OKLCH sort math are built in, and window.Color is used when present
 *     - Failure reasons for the UI in State.lastError (plain sentences)
 *
 * ✒ Usage Instructions:
 *     Load after shared/js/storage.js and shared/js/workbench.js (and after
 *     js/color.js when it exists), before every UI module. No init() call is
 *     needed: the Storage.configure() contract runs at load time and
 *     ToolApp.boot() restores saved state before the modules start. UI code
 *     changes state only through State methods and re-renders on events.
 *
 * ✒ Examples:
 *     State.setActive('#C9A84C', { source: 'input' })     → true; emits 'active'
 *     State.setActive(color, { source: 'picker', coalesce: true })
 *     State.undo()                                          → true when a step was undone
 *     State.addToWorking('#1B2A4A', 'Navy')                 → 0 (index), or -1 when full
 *     State.saveWorkingToLibrary()                          → { id, name, colors, ... }
 *     State.toggleSwatch(State.activeHex())                 → true when now saved
 *     State.on('library', ({ kind, action }) => render())   → unsubscribe function
 *     State.applySettings({ precision: 3 })                 → { applied: ['precision'], rejected: [] }
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/storage.js (window.Storage), shared/js/
 *       workbench.js (uiDefaults / mergeUi); optional: shared/js/toolapp.js
 *       (debounced saves, ids) and js/color.js (window.Color, for parsing
 *       non-hex strings)
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: undo/redo is session-only and is not persisted;
 *       localStorage quota applies (the trim hook drops recent colors first)
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'toolman.colorman.state';
    const STATE_VERSION = '1.0.0';

    const LIMITS = Object.freeze({
        palettes: 200,
        colors: 256,
        swatches: 500,
        name: 80,
        historyMin: 10,
        historyMax: 100,
        undo: 100,
        stops: 16,
        panes: 40,
        paneBytes: 20000
    });

    const HEX_RE = /^#(?:[0-9A-F]{6}|[0-9A-F]{8})$/;
    const FORMATS = ['hex', 'rgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch'];
    const PICKER_MODES = ['hsv', 'hsl', 'oklch'];
    const MIX_SPACES = ['srgb', 'srgb-linear', 'hsl', 'lab', 'lch', 'oklab', 'oklch'];
    const GRADIENT_TYPES = ['linear', 'radial', 'conic'];
    const GRADIENT_SHAPES = ['circle', 'ellipse'];
    const SORT_MODES = ['hue', 'lightness', 'chroma', 'reverse'];
    const DEFAULT_NAME = 'Untitled palette';
    const COALESCE_MS = 500;
    const HISTORY_DELAY_MS = 900;

    const SEED_PALETTE_ID = 'pal-toolman-house';
    const SEED_COLORS = [
        { hex: '#1B2A4A', name: 'Navy' },
        { hex: '#2A3D5F', name: 'Navy mid' },
        { hex: '#C9A84C', name: 'Identity gold' },
        { hex: '#E8C878', name: 'Bright gold' },
        { hex: '#F5F0E8', name: 'Parchment' },
        { hex: '#0E1014', name: 'Obsidian' }
    ];

    /* ── Small helpers ─────────────────────────────────────── */

    const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const nowIso = () => new Date().toISOString();
    const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

    function uid(prefix) {
        if (window.ToolApp && typeof ToolApp.uid === 'function') return ToolApp.uid(prefix);
        const core = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}-${core}`;
    }

    function validId(v) {
        return typeof v === 'string' && v.length > 0 && v.length <= 60 && /^[A-Za-z0-9_-]+$/.test(v);
    }

    function validIso(v) {
        return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
    }

    /** Trimmed single-line name, control characters removed, max 80 chars. */
    function cleanName(v, fallback = '') {
        if (typeof v !== 'string') return fallback;
        // eslint-disable-next-line no-control-regex
        const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
        return s || fallback;
    }

    /** '#rgb' | '#rgba' | '#rrggbb' | '#rrggbbaa' (with or without '#') → '#RRGGBB' / '#RRGGBBAA'. */
    function normHex(input) {
        if (typeof input !== 'string') return null;
        let s = input.trim().replace(/^#/, '');
        if (!/^[0-9a-f]+$/i.test(s)) return null;
        if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
        if (s.length !== 6 && s.length !== 8) return null;
        s = s.toUpperCase();
        if (s.length === 8 && s.endsWith('FF')) s = s.slice(0, 6);
        return `#${s}`;
    }

    function hexToColor(input) {
        const hex = normHex(input);
        if (!hex) return null;
        const n = hex.slice(1);
        const byte = (i) => parseInt(n.slice(i, i + 2), 16) / 255;
        return { r: byte(0), g: byte(2), b: byte(4), a: n.length === 8 ? byte(6) : 1 };
    }

    function colorToHex(c) {
        const byte = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0').toUpperCase();
        const alpha = Math.round(clamp01(c.a) * 255);
        return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${alpha < 255 ? byte(c.a) : ''}`;
    }

    /** A clamped {r,g,b,a} copy, or null when any channel is not a finite number. */
    function sanitizeColor(c) {
        if (!isPlainObject(c)) return null;
        const r = Number(c.r);
        const g = Number(c.g);
        const b = Number(c.b);
        if (![r, g, b].every(Number.isFinite)) return null;
        let a = (c.a === undefined || c.a === null) ? 1 : Number(c.a);
        if (!Number.isFinite(a)) a = 1;
        return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
    }

    /** Any accepted input (Color object, hex, or a CSS string via the engine) → Color or null. */
    function toColor(input) {
        if (isPlainObject(input)) return sanitizeColor(input);
        if (typeof input !== 'string') return null;
        const viaHex = hexToColor(input);
        if (viaHex) return viaHex;
        if (window.Color && typeof Color.parse === 'function') {
            try {
                const parsed = Color.parse(input);
                if (parsed) return sanitizeColor(parsed);
            } catch (_err) { /* unreadable — fall through to null */ }
        }
        return null;
    }

    function toHex(input) {
        const c = toColor(input);
        return c ? colorToHex(c) : null;
    }

    function sameColor(a, b) {
        const eps = 1e-4;
        return Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps
            && Math.abs(a.b - b.b) < eps && Math.abs(a.a - b.a) < eps;
    }

    /** OKLCH from sRGB (Björn Ottosson's matrices) — used for palette sorting. */
    function oklchOf(c) {
        const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const r = lin(c.r);
        const g = lin(c.g);
        const b = lin(c.b);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        const C = Math.hypot(A, B);
        const H = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
        return { l: L, c: C, h: H };
    }

    /** '#hex' string or { hex, name } → validated { hex, name } or null. */
    function cleanEntry(item) {
        if (typeof item === 'string') {
            const hex = toHex(item);
            return hex ? { hex, name: '' } : null;
        }
        if (!isPlainObject(item)) return null;
        const hex = toHex(typeof item.hex === 'string' ? item.hex : item);
        return hex ? { hex, name: cleanName(item.name) } : null;
    }

    function cleanEntries(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        for (const item of list) {
            if (out.length >= LIMITS.colors) break;
            const entry = cleanEntry(item);
            if (entry) out.push(entry);
        }
        return out;
    }

    const copyEntries = (list) => list.map((e) => ({ hex: e.hex, name: e.name }));
    const copyPalette = (p) => ({ ...p, colors: copyEntries(p.colors) });
    const clone = (v) => JSON.parse(JSON.stringify(v));

    /* ── Defaults ──────────────────────────────────────────── */

    function defaultSettings() {
        return {
            primaryFormat: 'hex',
            hexUpper: true,
            precision: 2,
            recordHistory: true,
            historySize: 40,
            contrastTarget: 'AA',
            exportPrefix: 'color',
            pickerMode: 'hsv'
        };
    }

    function defaultGradient() {
        return {
            type: 'linear',
            angle: 90,
            shape: 'circle',
            space: 'oklab',
            stops: [{ hex: '#1B2A4A', pos: 0 }, { hex: '#C9A84C', pos: 100 }]
        };
    }

    function seedPalette() {
        const at = nowIso();
        return { id: SEED_PALETTE_ID, name: 'toolMan House', colors: copyEntries(SEED_COLORS), createdAt: at, updatedAt: at };
    }

    function emptyWorking() {
        return { id: null, name: DEFAULT_NAME, colors: [] };
    }

    const AppState = {
        version: STATE_VERSION,
        active: hexToColor('#C9A84C'),
        working: emptyWorking(),
        palettes: [seedPalette()],
        swatches: [],
        history: [],
        gradient: defaultGradient(),
        panes: {},
        ui: Workbench.uiDefaults({ library: 'palettes', tools: 'contrast' }),
        settings: defaultSettings()
    };

    /* ── Events ────────────────────────────────────────────── */

    const listeners = {};

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

    /* ── Active color, undo/redo, recent colors ────────────── */

    const undoStack = [];
    const redoStack = [];
    let lastCoalesceAt = 0;
    let historyTimer = null;
    let pendingHistoryHex = null;

    function pushUndo(color) {
        undoStack.push({ ...color });
        if (undoStack.length > LIMITS.undo) undoStack.shift();
    }

    function queueHistory(hex) {
        pendingHistoryHex = hex;
        clearTimeout(historyTimer);
        historyTimer = setTimeout(flushHistory, HISTORY_DELAY_MS);
    }

    function flushHistory() {
        clearTimeout(historyTimer);
        historyTimer = null;
        const hex = pendingHistoryHex;
        pendingHistoryHex = null;
        if (hex && AppState.settings.recordHistory) addHistory(hex);
    }

    function cancelHistory() {
        clearTimeout(historyTimer);
        historyTimer = null;
        pendingHistoryHex = null;
    }

    function addHistory(input) {
        const hex = toHex(input);
        if (!hex) return false;
        if (AppState.history[0] === hex) return false;
        AppState.history = [hex].concat(AppState.history.filter((h) => h !== hex))
            .slice(0, AppState.settings.historySize);
        emit('history', { action: 'add', hex });
        save();
        return true;
    }

    function applyActive(color, source) {
        AppState.active = { ...color };
        emit('active', { color: { ...color }, source });
        save();
    }

    /* ── Restore / validation ──────────────────────────────── */

    const SETTING_RULES = {
        primaryFormat: (v) => (FORMATS.includes(v) ? v : undefined),
        hexUpper: (v) => (typeof v === 'boolean' ? v : undefined),
        precision: (v) => {
            const n = Number(v);
            return (v !== '' && Number.isInteger(n) && n >= 0 && n <= 4) ? n : undefined;
        },
        recordHistory: (v) => (typeof v === 'boolean' ? v : undefined),
        historySize: (v) => {
            const n = Math.round(Number(v) / 10) * 10;
            return (v !== '' && Number.isFinite(n) && n >= LIMITS.historyMin && n <= LIMITS.historyMax) ? n : undefined;
        },
        contrastTarget: (v) => (v === 'AA' || v === 'AAA' ? v : undefined),
        exportPrefix: (v) => {
            if (typeof v !== 'string') return undefined;
            const s = v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
            return /^[a-z][a-z0-9_-]*$/.test(s) ? s : undefined;
        },
        pickerMode: (v) => (PICKER_MODES.includes(v) ? v : undefined)
    };

    const SETTING_LABELS = {
        primaryFormat: 'Primary format',
        hexUpper: 'Uppercase hex',
        precision: 'Decimal places',
        recordHistory: 'Record recent colors',
        historySize: 'Recent colors to keep',
        contrastTarget: 'Contrast target',
        exportPrefix: 'Export name prefix',
        pickerMode: 'Picker model'
    };

    /** Validate settings into AppState.settings; returns { applied, rejected, changed }. */
    function writeSettings(values) {
        const result = { applied: [], rejected: [], changed: [] };
        if (!isPlainObject(values)) return result;
        Object.keys(SETTING_RULES).forEach((key) => {
            if (!(key in values)) return;
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

    function sanitizeWorking(w) {
        if (!isPlainObject(w)) return null;
        const colors = cleanEntries(w.colors);
        if (!colors) return null;
        return {
            id: validId(w.id) ? w.id : null,
            name: cleanName(w.name, DEFAULT_NAME),
            colors
        };
    }

    function sanitizePalette(p) {
        if (!isPlainObject(p)) return null;
        const colors = cleanEntries(p.colors);
        if (!colors || !colors.length) return null;
        const at = nowIso();
        return {
            id: validId(p.id) ? p.id : uid('pal'),
            name: cleanName(p.name, DEFAULT_NAME),
            colors,
            createdAt: validIso(p.createdAt) ? p.createdAt : at,
            updatedAt: validIso(p.updatedAt) ? p.updatedAt : at
        };
    }

    function sanitizePalettes(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const seen = new Set();
        for (const item of list) {
            if (out.length >= LIMITS.palettes) break;
            const p = sanitizePalette(item);
            if (!p) continue;
            if (seen.has(p.id)) p.id = uid('pal');
            seen.add(p.id);
            out.push(p);
        }
        return out;
    }

    function sanitizeSwatch(s) {
        if (!isPlainObject(s)) return null;
        const hex = toHex(typeof s.hex === 'string' ? s.hex : '');
        if (!hex) return null;
        return {
            id: validId(s.id) ? s.id : uid('sw'),
            hex,
            name: cleanName(s.name),
            createdAt: validIso(s.createdAt) ? s.createdAt : nowIso()
        };
    }

    function sanitizeSwatches(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        const hexes = new Set();
        const ids = new Set();
        for (const item of list) {
            if (out.length >= LIMITS.swatches) break;
            const s = sanitizeSwatch(item);
            if (!s || hexes.has(s.hex)) continue;
            if (ids.has(s.id)) s.id = uid('sw');
            hexes.add(s.hex);
            ids.add(s.id);
            out.push(s);
        }
        return out;
    }

    function sanitizeHistory(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        for (const item of list) {
            if (out.length >= LIMITS.historyMax) break;
            const hex = typeof item === 'string' ? normHex(item) : null;
            if (hex && HEX_RE.test(hex) && !out.includes(hex)) out.push(hex);
        }
        return out;
    }

    function sanitizeStops(list) {
        if (!Array.isArray(list)) return null;
        const out = [];
        for (const s of list) {
            if (out.length >= LIMITS.stops) break;
            if (!isPlainObject(s)) continue;
            const hex = toHex(typeof s.hex === 'string' ? s.hex : '');
            const pos = Number(s.pos);
            if (!hex || !Number.isFinite(pos)) continue;
            out.push({ hex, pos: Math.round(clamp(pos, 0, 100) * 10) / 10 });
        }
        return out.length >= 2 ? out : null;
    }

    function sanitizeGradient(g, base) {
        if (!isPlainObject(g)) return null;
        const out = clone(base || defaultGradient());
        if (GRADIENT_TYPES.includes(g.type)) out.type = g.type;
        if (g.angle !== undefined && g.angle !== null && g.angle !== '' && Number.isFinite(Number(g.angle))) {
            out.angle = ((Math.round(Number(g.angle)) % 360) + 360) % 360;
        }
        if (GRADIENT_SHAPES.includes(g.shape)) out.shape = g.shape;
        if (MIX_SPACES.includes(g.space)) out.space = g.space;
        const stops = sanitizeStops(g.stops);
        if (stops) out.stops = stops;
        return out;
    }

    function sanitizePaneValue(value) {
        if (!isPlainObject(value)) return null;
        try {
            const json = JSON.stringify(value);
            if (!json || json.length > LIMITS.paneBytes) return null;
            return JSON.parse(json);
        } catch (_err) {
            return null;
        }
    }

    const validPaneName = (name) => typeof name === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(name);

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

    /**
     * Allowlisted restore. At boot (ToolApp not yet initialized) saved data
     * replaces the defaults; afterwards (Settings → Import) collections merge
     * into what this browser already holds and every pane is told to redraw.
     */
    function restoreInto(saved, opts = {}) {
        if (!isPlainObject(saved)) return;
        const merge = opts.merge !== undefined
            ? Boolean(opts.merge)
            : Boolean(window.ToolApp && ToolApp.initialized);

        if (isPlainObject(saved.settings)) writeSettings(saved.settings);

        const active = sanitizeColor(saved.active);
        if (active) AppState.active = active;

        const working = sanitizeWorking(saved.working);
        if (working) AppState.working = working;

        const palettes = sanitizePalettes(saved.palettes);
        if (palettes) {
            if (merge) {
                const byId = new Map(AppState.palettes.map((p) => [p.id, p]));
                palettes.forEach((p) => {
                    if (byId.has(p.id)) Object.assign(byId.get(p.id), p);
                    else if (AppState.palettes.length < LIMITS.palettes) AppState.palettes.push(p);
                });
            } else {
                AppState.palettes = palettes;
            }
        }

        const swatches = sanitizeSwatches(saved.swatches);
        if (swatches) {
            if (merge) {
                const have = new Set(AppState.swatches.map((s) => s.hex));
                const ids = new Set(AppState.swatches.map((s) => s.id));
                swatches.forEach((s) => {
                    if (have.has(s.hex) || AppState.swatches.length >= LIMITS.swatches) return;
                    if (ids.has(s.id)) s.id = uid('sw');
                    AppState.swatches.push(s);
                    have.add(s.hex);
                    ids.add(s.id);
                });
            } else {
                AppState.swatches = swatches;
            }
        }

        const history = sanitizeHistory(saved.history);
        if (history) {
            const merged = merge ? AppState.history.concat(history.filter((h) => !AppState.history.includes(h))) : history;
            AppState.history = merged.slice(0, AppState.settings.historySize);
        } else {
            AppState.history = AppState.history.slice(0, AppState.settings.historySize);
        }

        const gradient = sanitizeGradient(saved.gradient);
        if (gradient) AppState.gradient = gradient;

        const panes = sanitizePanes(saved.panes);
        if (panes) {
            if (merge) {
                Object.keys(panes).forEach((name) => {
                    AppState.panes[name] = Object.assign(AppState.panes[name] || {}, panes[name]);
                });
            } else {
                AppState.panes = panes;
            }
        }

        // Layout is a per-browser preference: only the boot restore applies it.
        if (!merge && window.Workbench) Workbench.mergeUi(AppState.ui, saved.ui);

        if (merge) announceAll('import');
    }

    function announceAll(source) {
        emit('active', { color: { ...AppState.active }, source });
        emit('working', { action: source });
        emit('library', { kind: 'palettes', action: source });
        emit('library', { kind: 'swatches', action: source });
        emit('history', { action: source });
        emit('gradient', { source });
        emit('settings', { settings: { ...AppState.settings }, changed: Object.keys(SETTING_RULES), source });
    }

    /* ── Public API ────────────────────────────────────────── */

    const removedPaletteIndex = new Map();
    const removedSwatchIndex = new Map();

    const State = {
        VERSION: STATE_VERSION,
        LIMITS,
        FORMATS: FORMATS.slice(),
        MIX_SPACES: MIX_SPACES.slice(),
        SETTING_LABELS: { ...SETTING_LABELS },
        lastError: '',

        on,
        emit,
        save,

        /** Normalise any accepted color input to '#RRGGBB' / '#RRGGBBAA' (upper), or null. */
        hexOf: toHex,

        /** Parse any accepted color input to a clamped Color object, or null. */
        colorOf: toColor,

        /* ── Active color ───────────────────────── */

        getActive() {
            return { ...AppState.active };
        },

        /**
         * Set the active color. opts: { source='api', record=true, coalesce=false }.
         * Returns false (and changes nothing) for unreadable input or the same color.
         */
        setActive(color, opts = {}) {
            const { source = 'api', record = true, coalesce = false } = opts;
            const next = toColor(color);
            if (!next) {
                fail("That isn't a color colorMan can read.");
                return false;
            }
            if (sameColor(next, AppState.active)) return false;

            const now = Date.now();
            const merging = coalesce && lastCoalesceAt && (now - lastCoalesceAt) <= COALESCE_MS;
            if (!merging) pushUndo(AppState.active);
            lastCoalesceAt = coalesce ? now : 0;
            redoStack.length = 0;

            applyActive(next, source);
            if (AppState.settings.recordHistory && record) queueHistory(colorToHex(next));
            return true;
        },

        undo() {
            if (!undoStack.length) return false;
            redoStack.push({ ...AppState.active });
            lastCoalesceAt = 0;
            applyActive(undoStack.pop(), 'undo');
            return true;
        },

        redo() {
            if (!redoStack.length) return false;
            pushUndo(AppState.active);
            lastCoalesceAt = 0;
            applyActive(redoStack.pop(), 'redo');
            return true;
        },

        canUndo() {
            return undoStack.length > 0;
        },

        canRedo() {
            return redoStack.length > 0;
        },

        /** Active color as hex, honouring settings.hexUpper; alpha only when translucent. */
        activeHex() {
            const c = AppState.active;
            if (window.Color && typeof Color.toHex === 'function') {
                try {
                    const out = Color.toHex(c, { alpha: 'auto', upper: AppState.settings.hexUpper });
                    if (typeof out === 'string' && out) return out;
                } catch (_err) { /* fall back to the built-in formatter */ }
            }
            const hex = colorToHex(c);
            return AppState.settings.hexUpper ? hex : hex.toLowerCase();
        },

        /* ── Working palette ────────────────────── */

        working() {
            const w = AppState.working;
            return { id: w.id, name: w.name, colors: copyEntries(w.colors) };
        },

        /** Append a color; returns its index, or -1 (State.lastError says why). */
        addToWorking(hexOrColor, name) {
            const hex = toHex(hexOrColor);
            if (!hex) {
                fail("That isn't a color colorMan can read.");
                return -1;
            }
            const colors = AppState.working.colors;
            if (colors.length >= LIMITS.colors) {
                fail(`The working palette is full (${LIMITS.colors} colors). Remove a color to add another.`);
                return -1;
            }
            colors.push({ hex, name: cleanName(name) });
            const index = colors.length - 1;
            emit('working', { action: 'add', index });
            save();
            return index;
        },

        removeFromWorking(index) {
            const colors = AppState.working.colors;
            if (!Number.isInteger(index) || index < 0 || index >= colors.length) return null;
            const [removed] = colors.splice(index, 1);
            emit('working', { action: 'remove', index });
            save();
            return { ...removed };
        },

        moveWorking(from, to) {
            const colors = AppState.working.colors;
            const n = colors.length;
            if (![from, to].every(Number.isInteger) || from < 0 || from >= n || to < 0 || to >= n) return false;
            if (from === to) return true;
            const [item] = colors.splice(from, 1);
            colors.splice(to, 0, item);
            emit('working', { action: 'move', from, to });
            save();
            return true;
        },

        updateWorkingColor(index, hexOrColor) {
            const colors = AppState.working.colors;
            const hex = toHex(hexOrColor);
            if (!Number.isInteger(index) || index < 0 || index >= colors.length || !hex) return false;
            if (colors[index].hex === hex) return true;
            colors[index].hex = hex;
            emit('working', { action: 'update', index });
            save();
            return true;
        },

        renameWorkingColor(index, name) {
            const colors = AppState.working.colors;
            if (!Number.isInteger(index) || index < 0 || index >= colors.length) return false;
            colors[index].name = cleanName(name);
            emit('working', { action: 'rename-color', index });
            save();
            return true;
        },

        /** Replace the working palette. colors: hex strings or { hex, name }. Unlinks unless id is given. */
        setWorking(colors, name, id = null) {
            const entries = cleanEntries(colors);
            if (!entries) {
                fail('A palette needs a list of colors.');
                return false;
            }
            AppState.working = {
                id: validId(id) ? id : null,
                name: cleanName(name, DEFAULT_NAME),
                colors: entries
            };
            emit('working', { action: 'set' });
            save();
            return true;
        },

        /** Empty the working palette and unlink it, so a later save never overwrites a library palette with nothing. */
        clearWorking() {
            AppState.working = emptyWorking();
            emit('working', { action: 'clear' });
            save();
            return true;
        },

        renameWorking(name) {
            AppState.working.name = cleanName(name, DEFAULT_NAME);
            emit('working', { action: 'rename' });
            save();
            return AppState.working.name;
        },

        /** 'hue' (greys last), 'lightness' (light → dark), 'chroma' (vivid first), 'reverse'. */
        sortWorking(mode) {
            if (!SORT_MODES.includes(mode)) return false;
            const colors = AppState.working.colors;
            if (mode === 'reverse') {
                colors.reverse();
            } else {
                const keyed = colors.map((entry, i) => ({ entry, i, o: oklchOf(hexToColor(entry.hex)) }));
                const grey = (k) => k.o.c < 0.02;
                keyed.sort((a, b) => {
                    if (mode === 'lightness') return (b.o.l - a.o.l) || (a.i - b.i);
                    if (mode === 'chroma') return (b.o.c - a.o.c) || (a.i - b.i);
                    if (grey(a) !== grey(b)) return grey(a) ? 1 : -1;
                    if (grey(a)) return (b.o.l - a.o.l) || (a.i - b.i);
                    return (a.o.h - b.o.h) || (a.i - b.i);
                });
                AppState.working.colors = keyed.map((k) => k.entry);
            }
            emit('working', { action: 'sort', mode });
            save();
            return true;
        },

        /* ── Palette library ────────────────────── */

        palettes() {
            return AppState.palettes.map(copyPalette);
        },

        palette(id) {
            const p = AppState.palettes.find((x) => x.id === id);
            return p ? copyPalette(p) : null;
        },

        /** Save the working palette: updates its linked palette, or creates and links a new one. */
        saveWorkingToLibrary() {
            const w = AppState.working;
            if (!w.colors.length) {
                fail('Add at least one color to the working palette before saving it.');
                return null;
            }
            const at = nowIso();
            let pal = w.id ? AppState.palettes.find((p) => p.id === w.id) : null;
            let action = 'update';
            if (pal) {
                pal.name = w.name;
                pal.colors = copyEntries(w.colors);
                pal.updatedAt = at;
            } else {
                if (AppState.palettes.length >= LIMITS.palettes) {
                    fail(`The library is full (${LIMITS.palettes} palettes). Delete one to save another.`);
                    return null;
                }
                pal = { id: uid('pal'), name: w.name || DEFAULT_NAME, colors: copyEntries(w.colors), createdAt: at, updatedAt: at };
                AppState.palettes.unshift(pal);
                w.id = pal.id;
                action = 'create';
                emit('working', { action: 'link', id: pal.id });
            }
            emit('library', { kind: 'palettes', action, id: pal.id });
            save();
            return copyPalette(pal);
        },

        /** Always creates a new palette from the working colors and links it. */
        savePaletteAs(name) {
            const w = AppState.working;
            if (!w.colors.length) {
                fail('Add at least one color to the working palette before saving it.');
                return null;
            }
            if (AppState.palettes.length >= LIMITS.palettes) {
                fail(`The library is full (${LIMITS.palettes} palettes). Delete one to save another.`);
                return null;
            }
            const at = nowIso();
            const pal = {
                id: uid('pal'),
                name: cleanName(name, w.name || DEFAULT_NAME),
                colors: copyEntries(w.colors),
                createdAt: at,
                updatedAt: at
            };
            AppState.palettes.unshift(pal);
            w.id = pal.id;
            w.name = pal.name;
            emit('working', { action: 'link', id: pal.id });
            emit('library', { kind: 'palettes', action: 'create', id: pal.id });
            save();
            return copyPalette(pal);
        },

        /** Copy a library palette into the working palette, linked to it. */
        openPalette(id) {
            const pal = AppState.palettes.find((p) => p.id === id);
            if (!pal) {
                fail('That palette no longer exists.');
                return null;
            }
            AppState.working = { id: pal.id, name: pal.name, colors: copyEntries(pal.colors) };
            emit('working', { action: 'open', id });
            save();
            return State.working();
        },

        renamePalette(id, name) {
            const pal = AppState.palettes.find((p) => p.id === id);
            const clean = cleanName(name);
            if (!pal || !clean) return false;
            pal.name = clean;
            pal.updatedAt = nowIso();
            emit('library', { kind: 'palettes', action: 'rename', id });
            if (AppState.working.id === id) {
                AppState.working.name = clean;
                emit('working', { action: 'rename' });
            }
            save();
            return true;
        },

        duplicatePalette(id) {
            const index = AppState.palettes.findIndex((p) => p.id === id);
            if (index === -1) return null;
            if (AppState.palettes.length >= LIMITS.palettes) {
                fail(`The library is full (${LIMITS.palettes} palettes). Delete one to make a copy.`);
                return null;
            }
            const src = AppState.palettes[index];
            const at = nowIso();
            const copy = {
                id: uid('pal'),
                name: cleanName(`${src.name} copy`, DEFAULT_NAME),
                colors: copyEntries(src.colors),
                createdAt: at,
                updatedAt: at
            };
            AppState.palettes.splice(index + 1, 0, copy);
            emit('library', { kind: 'palettes', action: 'duplicate', id: copy.id });
            save();
            return copyPalette(copy);
        },

        /** Remove a palette; returns the removed palette so the UI can offer restorePalette(). */
        deletePalette(id) {
            const index = AppState.palettes.findIndex((p) => p.id === id);
            if (index === -1) return null;
            const [removed] = AppState.palettes.splice(index, 1);
            removedPaletteIndex.set(removed.id, index);
            emit('library', { kind: 'palettes', action: 'delete', id });
            if (AppState.working.id === id) {
                AppState.working.id = null;
                emit('working', { action: 'unlink', id });
            }
            save();
            return copyPalette(removed);
        },

        restorePalette(obj) {
            const pal = sanitizePalette(obj);
            if (!pal) return null;
            if (AppState.palettes.length >= LIMITS.palettes) {
                fail(`The library is full (${LIMITS.palettes} palettes).`);
                return null;
            }
            if (AppState.palettes.some((p) => p.id === pal.id)) pal.id = uid('pal');
            const at = removedPaletteIndex.has(obj.id) ? removedPaletteIndex.get(obj.id) : 0;
            removedPaletteIndex.delete(obj.id);
            AppState.palettes.splice(clamp(at, 0, AppState.palettes.length), 0, pal);
            emit('library', { kind: 'palettes', action: 'restore', id: pal.id });
            save();
            return copyPalette(pal);
        },

        /** Add a palette from outside ({ name, colors }); does not touch the working palette. */
        importPalette(data) {
            const src = isPlainObject(data) ? data : {};
            const colors = cleanEntries(src.colors);
            if (!colors || !colors.length) {
                fail('No readable colors were found to import.');
                return null;
            }
            if (AppState.palettes.length >= LIMITS.palettes) {
                fail(`The library is full (${LIMITS.palettes} palettes). Delete one to import another.`);
                return null;
            }
            const at = nowIso();
            const pal = { id: uid('pal'), name: cleanName(src.name, 'Imported palette'), colors, createdAt: at, updatedAt: at };
            AppState.palettes.unshift(pal);
            emit('library', { kind: 'palettes', action: 'import', id: pal.id });
            save();
            return copyPalette(pal);
        },

        /* ── Saved colors (swatches) ────────────── */

        swatches() {
            return AppState.swatches.map((s) => ({ ...s }));
        },

        /** Save a color; an existing entry with the same hex is returned unchanged. */
        addSwatch(hexOrColor, name) {
            const hex = toHex(hexOrColor);
            if (!hex) {
                fail("That isn't a color colorMan can read.");
                return null;
            }
            const existing = AppState.swatches.find((s) => s.hex === hex);
            if (existing) return { ...existing };
            if (AppState.swatches.length >= LIMITS.swatches) {
                fail(`Saved colors are full (${LIMITS.swatches}). Remove some to save more.`);
                return null;
            }
            const sw = { id: uid('sw'), hex, name: cleanName(name), createdAt: nowIso() };
            AppState.swatches.unshift(sw);
            emit('library', { kind: 'swatches', action: 'add', id: sw.id });
            save();
            return { ...sw };
        },

        removeSwatch(id) {
            const index = AppState.swatches.findIndex((s) => s.id === id);
            if (index === -1) return null;
            const [removed] = AppState.swatches.splice(index, 1);
            removedSwatchIndex.set(removed.id, index);
            emit('library', { kind: 'swatches', action: 'remove', id });
            save();
            return { ...removed };
        },

        restoreSwatch(obj) {
            const sw = sanitizeSwatch(obj);
            if (!sw) return null;
            const existing = AppState.swatches.find((s) => s.hex === sw.hex);
            if (existing) return { ...existing };
            if (AppState.swatches.length >= LIMITS.swatches) {
                fail(`Saved colors are full (${LIMITS.swatches}).`);
                return null;
            }
            if (AppState.swatches.some((s) => s.id === sw.id)) sw.id = uid('sw');
            const at = removedSwatchIndex.has(obj.id) ? removedSwatchIndex.get(obj.id) : 0;
            removedSwatchIndex.delete(obj.id);
            AppState.swatches.splice(clamp(at, 0, AppState.swatches.length), 0, sw);
            emit('library', { kind: 'swatches', action: 'restore', id: sw.id });
            save();
            return { ...sw };
        },

        renameSwatch(id, name) {
            const sw = AppState.swatches.find((s) => s.id === id);
            if (!sw) return false;
            sw.name = cleanName(name);
            emit('library', { kind: 'swatches', action: 'rename', id });
            save();
            return true;
        },

        hasSwatch(hexOrColor) {
            const hex = toHex(hexOrColor);
            return Boolean(hex) && AppState.swatches.some((s) => s.hex === hex);
        },

        /** Save or unsave a color; returns true when it is saved afterwards. */
        toggleSwatch(hexOrColor) {
            const hex = toHex(hexOrColor);
            if (!hex) {
                fail("That isn't a color colorMan can read.");
                return false;
            }
            const existing = AppState.swatches.find((s) => s.hex === hex);
            if (existing) {
                State.removeSwatch(existing.id);
                return false;
            }
            return Boolean(State.addSwatch(hex));
        },

        /* ── Recent colors ──────────────────────── */

        history() {
            return AppState.history.slice();
        },

        /** Record a color in Recent right away (setActive does this on its own, debounced). */
        addHistory(hexOrColor) {
            return addHistory(hexOrColor);
        },

        clearHistory() {
            cancelHistory();
            AppState.history = [];
            emit('history', { action: 'clear' });
            save();
            return true;
        },

        /* ── Gradient ───────────────────────────── */

        gradient() {
            return clone(AppState.gradient);
        },

        /** Merge a validated patch ({ type, angle, shape, space, stops }) into the gradient. */
        updateGradient(patch) {
            if (!isPlainObject(patch)) return State.gradient();
            const next = sanitizeGradient({ ...AppState.gradient, ...patch }, AppState.gradient);
            if (patch.stops !== undefined && !sanitizeStops(patch.stops)) {
                fail('A gradient needs at least two valid color stops.');
            }
            AppState.gradient = next;
            emit('gradient', { patch: Object.keys(patch) });
            save();
            return clone(next);
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
            if (!validPaneName(name) || !isPlainObject(patch)) return null;
            const live = State.pane(name);
            const clean = sanitizePaneValue(patch);
            if (!clean || !sanitizePaneValue({ ...live, ...clean })) {
                fail('Those pane preferences are too large to store.');
                return null;
            }
            Object.assign(live, clean);
            save();
            return live;
        },

        /* ── Settings ───────────────────────────── */

        settings() {
            return { ...AppState.settings };
        },

        /** Validated merge. Returns { applied, rejected, changed } (setting keys). */
        applySettings(values) {
            const result = writeSettings(values);
            if (result.changed.length) {
                if (result.changed.includes('historySize') && AppState.history.length > AppState.settings.historySize) {
                    AppState.history = AppState.history.slice(0, AppState.settings.historySize);
                    emit('history', { action: 'trim' });
                }
                if (result.changed.includes('recordHistory') && !AppState.settings.recordHistory) cancelHistory();
                emit('settings', { settings: { ...AppState.settings }, changed: result.changed.slice() });
                save();
            }
            return result;
        },

        /* ── Lifecycle ──────────────────────────── */

        /** Restore a saved/imported payload. opts.merge forces merge (true) or replace (false). */
        restore(saved, opts) {
            restoreInto(saved, opts);
        },

        /** Back to first-run data (starter palette, default settings). The rail layout is kept. */
        reset() {
            cancelHistory();
            undoStack.length = 0;
            redoStack.length = 0;
            lastCoalesceAt = 0;
            removedPaletteIndex.clear();
            removedSwatchIndex.clear();
            AppState.active = hexToColor('#C9A84C');
            AppState.working = emptyWorking();
            AppState.palettes = [seedPalette()];
            AppState.swatches = [];
            AppState.history = [];
            AppState.gradient = defaultGradient();
            // Empty each pane object in place so references held by modules stay live.
            Object.values(AppState.panes).forEach((p) => { Object.keys(p).forEach((k) => { delete p[k]; }); });
            AppState.settings = defaultSettings();
            emit('reset', { source: 'reset' });
            announceAll('reset');
            save();
            return true;
        }
    };

    // Record a pending recent color before the page goes away; this runs
    // ahead of ToolApp's own pagehide save, which then persists it.
    window.addEventListener('pagehide', () => { if (historyTimer) flushHistory(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && historyTimer) flushHistory(); });

    if (window.Storage) {
        Storage.configure({
            key: STORAGE_KEY,
            version: STATE_VERSION,
            getState: () => AppState,
            restore: (saved) => restoreInto(saved),
            trim: (state) => { state.history = []; }
        });
    }

    window.State = State;
    window.AppState = AppState;
})();
