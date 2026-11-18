/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: PickerUI (colorMan Edition - v1.0)
 *     - File Name: picker.js
 *     - Relative Path: tools/colorman/js/ui/picker.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The center of colorMan: the color field in the toolbar, the Picker
 *     card (2D color area, hue and opacity bars, before/now preview, and a
 *     numeric channel editor), the Formats card, and the stat pills under
 *     the stage. Every control reads and writes the active color through
 *     State, so the rails and tools follow whatever is picked here.
 *
 * ✒ Key Features:
 *     - Color field: live parsing 150ms after typing stops, Enter commits
 *       and selects, Escape restores the color you started from, plain
 *       error text, and an "outside sRGB" note when input was mapped; a
 *       whole typing session is one undo step and reaches Recent only when
 *       committed (Enter or leaving the field)
 *     - Picker models HSV, HSL, and OKLCH as a keyboard radio group; the
 *       choice is the Settings picker model, so it persists
 *     - 2D color area drawn on a HiDPI canvas that redraws on resize; the
 *       OKLCH view dims and hatches colors outside sRGB and draws the edge
 *     - Draggable thumbs with pointer capture; a drag is one undo step
 *     - Every thumb is a keyboard slider: arrows 1%, Shift 10%, Home/End,
 *       Page Up/Down, with spoken position text
 *     - Hue bar (OKLCH hues in OKLCH mode) and an opacity bar over a
 *       checkerboard
 *     - Before/now preview: the color when the current change began beside
 *       the color now; clicking Before goes back to it
 *     - Channel editor for RGB, HSL, HWB, OKLCH, and Lab plus alpha: arrows
 *       step, Shift steps ten, out-of-range values are limited with a note
 *     - Formats card: eleven copyable rows with the primary format marked,
 *       Copy all, and black/white text samples with contrast ratios that
 *       are truncated, never rounded up past the level they report
 *     - Stat pills: luminance, contrast against white and black, OKLCH hue
 *       and lightness, and alpha
 *     - Hues survive greys, black, and white, so the area never jumps
 *     - Rendering is batched into one animation frame per burst of changes
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js, before
 *     js/app.js. ToolApp.boot() calls PickerUI.init(), which builds the DOM
 *     inside #mount-picker, #actions-picker, #mount-formats,
 *     #actions-formats, and #mount-stats and takes over #color-input
 *     (it sets data-wired="true" there). Toolbar buttons stay with app.js,
 *     which calls the PickerUI methods below for clicks and shortcuts.
 *
 * ✒ Examples:
 *     PickerUI.focusInput()          → Ctrl+K: focuses and selects the color field
 *     PickerUI.copyPrimary(button)   → copies the color in Settings → Primary format
 *     PickerUI.random()              → a pleasant random OKLCH color
 *     PickerUI.eyedropper()          → screen picker where the browser has one
 *     PickerUI.toggleStar()          → saves or unsaves the active color
 *     PickerUI.addToPalette()        → appends the active color to the working palette
 *     PickerUI.nameLabel('#DAA520')  → 'goldenrod'; '#C9A84C' → '≈ goldenrod'
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (window.Color), js/state.js (State),
 *       js/ui/swatch.js (SwatchUI.textOn), shared/js/dom.js, toolapp.js
 *       (ToolApp.copy), toolman.js (TOOLMAN.notify); css/picker.css
 *     - Compatible platforms: all evergreen browsers; ResizeObserver and
 *       Pointer Events are required; the eyedropper needs the EyeDropper
 *       API (Chrome or Edge on a desktop) and its button hides elsewhere
 *     - Limitations: the chip, star, undo/redo, and footer text belong to
 *       app.js; the canvas uses neutral white and black to draw the HSV and
 *       HSL fields and theme tokens for the gamut edge, redrawn on every
 *       toolman:theme event; output is sRGB only
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /* ── Constants ─────────────────────────────────────────── */

    const CMAX = 0.37;          // OKLCH chroma at the right edge of the area
    const LIVE_MS = 150;        // color field: parse this long after typing stops
    const ERROR_MS = 450;       // …and complain only after a further pause
    const GESTURE_MS = 800;     // changes closer together than this are one gesture
    const NOTE_MS = 6000;
    const EPS = 1e-3;

    const MSG = {
        bad: 'Not a color I recognize — try #C9A84C, rgb(201 168 76), oklch(0.74 0.11 86) or a name.',
        empty: 'Type a color first, such as #C9A84C, rgb(201 168 76), or goldenrod.',
        clipped: 'Mapped into sRGB — the color you typed is outside the standard screen range.'
    };

    const MODES = [
        { id: 'hsv', label: 'HSV', title: 'HSV: saturation across, brightness up' },
        { id: 'hsl', label: 'HSL', title: 'HSL: saturation across, lightness up' },
        { id: 'oklch', label: 'OKLCH', title: 'OKLCH: chroma across, lightness up; even steps to the eye' }
    ];

    const PLANE = {
        hsv: { label: 'Saturation and brightness', x: 'Saturation', y: 'Brightness' },
        hsl: { label: 'Saturation and lightness', x: 'Saturation', y: 'Lightness' },
        oklch: { label: 'Chroma and lightness', x: 'Chroma', y: 'Lightness' }
    };

    const FORMAT_ROWS = [
        { id: 'hex', label: 'HEX' },
        { id: 'rgb', label: 'RGB' },
        { id: 'hsl', label: 'HSL' },
        { id: 'hwb', label: 'HWB' },
        { id: 'hsv', label: 'HSV' },
        { id: 'cmyk', label: 'CMYK' },
        { id: 'lab', label: 'LAB' },
        { id: 'lch', label: 'LCH' },
        { id: 'oklab', label: 'OKLAB' },
        { id: 'oklch', label: 'OKLCH' },
        { id: 'name', label: 'Name' }
    ];

    const PRIMARY_LABEL = {
        hex: 'HEX', rgb: 'RGB', hsl: 'HSL', hwb: 'HWB', lab: 'LAB', lch: 'LCH', oklab: 'OKLAB', oklch: 'OKLCH'
    };

    const H_FIELD = { key: 'h', short: 'H', name: 'Hue', unit: '°', min: 0, max: 360, step: 1, dp: (p) => Math.min(p, 2) };
    const PCT = (key, short, name) => ({ key, short, name, unit: '%', min: 0, max: 100, step: 1, dp: (p) => Math.min(p, 2) });

    const CHANNELS = {
        rgb: {
            label: 'RGB',
            fields: [
                { key: 'r', short: 'R', name: 'Red', unit: '', min: 0, max: 255, step: 1, dp: () => 0 },
                { key: 'g', short: 'G', name: 'Green', unit: '', min: 0, max: 255, step: 1, dp: () => 0 },
                { key: 'b', short: 'B', name: 'Blue', unit: '', min: 0, max: 255, step: 1, dp: () => 0 }
            ]
        },
        hsl: { label: 'HSL', fields: [H_FIELD, PCT('s', 'S', 'Saturation'), PCT('l', 'L', 'Lightness')] },
        hwb: { label: 'HWB', fields: [H_FIELD, PCT('w', 'W', 'Whiteness'), PCT('b', 'B', 'Blackness')] },
        oklch: {
            label: 'OKLCH',
            fields: [
                { key: 'l', short: 'L', name: 'OKLCH lightness', unit: '', min: 0, max: 1, step: 0.01, dp: (p) => Math.min(p + 2, 4) },
                { key: 'c', short: 'C', name: 'Chroma', unit: '', min: 0, max: CMAX, step: 0.005, dp: (p) => Math.min(p + 2, 4) },
                H_FIELD
            ]
        },
        lab: {
            label: 'Lab',
            fields: [
                { key: 'l', short: 'L', name: 'Lab lightness', unit: '', min: 0, max: 100, step: 1, dp: (p) => Math.min(p, 2) },
                { key: 'a', short: 'a', name: 'Lab a (green to red)', unit: '', min: -125, max: 125, step: 1, dp: (p) => Math.min(p, 2) },
                { key: 'b', short: 'b', name: 'Lab b (blue to yellow)', unit: '', min: -125, max: 125, step: 1, dp: (p) => Math.min(p, 2) }
            ]
        }
    };

    const ALPHA_FIELD = { key: 'alpha', short: 'A %', name: 'Alpha', unit: '%', min: 0, max: 100, step: 1, dp: (p) => Math.min(p, 1) };

    const ICON_COPY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    /* ── Module state ──────────────────────────────────────── */

    // The picker's own coordinates. They are kept separately from the color
    // so a hue survives greys, black and white, and a drag is never re-read
    // through 8-bit rounding.
    const M = { h: 0, sv: 0, v: 0, sl: 0, l: 0, okl: 0, okc: 0, okh: 0, okcWant: 0, okClipped: false };

    const els = {};
    let settings = {};
    let initialized = false;
    let raf = 0;
    let lockNext = null;
    let before = null;
    let prevColor = null;
    let lastChangeAt = 0;
    let lastSource = '';
    let dragging = null;
    let planeKey = '';
    let hueTrackKey = '';
    let fieldsFormat = '';
    let tokens = null;
    let offscreen = null;
    let inputDirty = false;
    let editStart = null;
    let editToken = null;       // one undo step per typing session in the color field
    let editSeq = 0;
    let liveTimer = 0;
    let errorTimer = 0;
    let noteTimer = 0;
    let dropperBusy = false;
    let pending = null;
    let pendingRaf = 0;

    /* ── Helpers ───────────────────────────────────────────── */

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const clamp01 = (v) => clamp(v, 0, 1);
    /** Own keys only, so a saved value such as 'constructor' or 'toString' is never a match. */
    const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
    const hasEngine = () => Boolean(window.Color && window.State && typeof Color.parseDetailed === 'function');

    /** Short decimal: rounded to dp places, trailing zeros dropped, never "-0". */
    function fmtNum(v, dp) {
        const n = Number(Number(v).toFixed(clamp(dp, 0, 6)));
        return Object.is(n, -0) || !Number.isFinite(n) ? '0' : String(n);
    }

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const mode = () => (MODES.some((m) => m.id === settings.pickerMode) ? settings.pickerMode : 'hsv');
    const opaque = (c) => ({ r: c.r, g: c.g, b: c.b, a: 1 });
    const hexOf = (c) => Color.toHex(c, { alpha: 'auto', upper: settings.hexUpper !== false });
    const cssHex = (c) => Color.toHex(c, { alpha: 'auto', upper: true });
    const onColor = (hex) => (window.SwatchUI ? SwatchUI.textOn(hex) : Color.textOn(hex));

    function primaryText(c) {
        const fmt = settings.primaryFormat || 'hex';
        let out = '';
        try {
            out = Color.format(c, fmt, { precision: settings.precision, upper: settings.hexUpper !== false });
        } catch (_err) { out = ''; }
        return out || hexOf(c);
    }

    function primaryLabel() {
        return own(PRIMARY_LABEL, settings.primaryFormat) ? PRIMARY_LABEL[settings.primaryFormat] : 'HEX';
    }

    /** 'goldenrod', 'goldenrod at 50% opacity', or '≈ goldenrod' (with ΔE in `detail`). */
    function nameInfo(c) {
        const exact = Color.format(c, 'name');
        if (exact) return { text: exact, copy: exact, label: exact };
        if (c.a < 1) {
            const solid = Color.format(opaque(c), 'name');
            if (solid) {
                const pct = Math.round(c.a * 100);
                return { text: `${solid} at ${pct}% opacity`, copy: solid, label: `${solid} at ${pct}%` };
            }
        }
        const near = Color.nearestName(c);
        if (!near) return { text: '', copy: '', label: '' };
        return { text: `≈ ${near.name} · ΔE ${near.deltaE.toFixed(1)}`, copy: near.name, label: `≈ ${near.name}` };
    }

    /** The best WCAG level a ratio reaches, judged exactly as Color.wcag() does. */
    function wcagWord(ratio) {
        const lv = Color.wcag(ratio);
        if (lv.aaaNormal) return 'AAA';
        if (lv.aaNormal) return 'AA';
        if (lv.aaLarge) return 'AA large';
        return 'fails';
    }

    /** Ratio text that is never rounded up past a threshold (4.4989 → '4.49'). */
    const ratioText = (ratio) => Color.formatRatio(ratio);

    /* ── Model ↔ color ─────────────────────────────────────── */

    /**
     * Re-read the picker coordinates from a color. `lock` keeps the parts
     * the current gesture set itself: { hue, hsv, hsl, ok }.
     */
    function derive(c, lock) {
        const L = lock || {};
        const hsv = Color.toHsv(c);
        const hsl = Color.toHsl(c);
        const ok = Color.toOklch(c);
        if (!L.hue && hsv.s > EPS && hsv.v > EPS) M.h = hsv.h;
        if (!L.hsv) {
            M.v = hsv.v;
            if (hsv.v > EPS) M.sv = hsv.s;
        }
        if (!L.hsl) {
            M.l = hsl.l;
            if (hsl.l > EPS && hsl.l < 100 - EPS) M.sl = hsl.s;
        }
        if (!L.ok) {
            M.okl = ok.l;
            M.okc = ok.c;
            M.okcWant = ok.c;
            M.okClipped = false;
            if (ok.c > 1e-4) M.okh = ok.h;
        }
    }

    /** Set the active color from a picker control; returns true when it changed. */
    function applyColor(color, opts = {}) {
        lockNext = opts.lock || null;
        let changed = false;
        try {
            changed = State.setActive(color, { source: opts.source || 'picker', coalesce: Boolean(opts.coalesce) });
        } finally {
            lockNext = null;
        }
        // Same color (a hue on a grey, say): the coordinates moved even so.
        if (!changed) schedule();
        return changed;
    }

    /** OKLCH request → in-gamut color, recording the chroma actually used. */
    function oklchColor(l, c, h, a) {
        const color = Color.fromOklch(l, c, h, a);
        const inside = Color.inGamutOklch(l, c, h);
        const actual = inside ? c : Math.min(c, Color.toOklch(color).c);
        return { color, actual, clipped: !inside };
    }

    /** Plane position (x, y in 0..1, y = 0 at the top) → active color. */
    function setPlane(x, y, coalesce) {
        const a = State.getActive().a;
        const m = mode();
        if (m === 'hsv') {
            M.sv = x * 100;
            M.v = (1 - y) * 100;
            return applyColor(Color.fromHsv(M.h, M.sv, M.v, a), { lock: { hue: 1, hsv: 1 }, coalesce });
        }
        if (m === 'hsl') {
            M.sl = x * 100;
            M.l = (1 - y) * 100;
            return applyColor(Color.fromHsl(M.h, M.sl, M.l, a), { lock: { hue: 1, hsl: 1 }, coalesce });
        }
        const l = 1 - y;
        const out = oklchColor(l, x * CMAX, M.okh, a);
        M.okl = l;
        M.okc = out.actual;
        M.okcWant = out.actual;
        M.okClipped = out.clipped;
        return applyColor(out.color, { lock: { ok: 1 }, coalesce });
    }

    function planePos() {
        const m = mode();
        if (m === 'hsv') return { x: M.sv / 100, y: 1 - M.v / 100 };
        if (m === 'hsl') return { x: M.sl / 100, y: 1 - M.l / 100 };
        return { x: M.okc / CMAX, y: 1 - M.okl };
    }

    function hueValue() {
        return mode() === 'oklch' ? M.okh : M.h;
    }

    function setHue(h, coalesce) {
        const hue = clamp(h, 0, 360);
        const a = State.getActive().a;
        const m = mode();
        if (m === 'oklch') {
            M.okh = hue;
            const out = oklchColor(M.okl, M.okcWant, hue, a);
            M.okc = out.actual;
            M.okClipped = out.clipped;
            return applyColor(out.color, { lock: { ok: 1 }, coalesce });
        }
        M.h = hue;
        const color = m === 'hsv' ? Color.fromHsv(hue, M.sv, M.v, a) : Color.fromHsl(hue, M.sl, M.l, a);
        return applyColor(color, { lock: m === 'hsv' ? { hue: 1, hsv: 1 } : { hue: 1, hsl: 1 }, coalesce });
    }

    function setAlpha(a, coalesce) {
        const c = State.getActive();
        c.a = clamp01(a);
        return applyColor(c, { lock: { hue: 1, hsv: 1, hsl: 1, ok: 1 }, coalesce });
    }

    /* ── State events ──────────────────────────────────────── */

    function onActive(payload = {}) {
        const color = payload.color || State.getActive();
        const source = payload.source || 'api';
        derive(color, lockNext);

        // A gesture is a run of changes from one source, each within
        // GESTURE_MS of the last; Before is the color it started from.
        const now = performance.now();
        if (source === 'reset' || !prevColor) before = { ...color };
        else if (!dragging && (now - lastChangeAt > GESTURE_MS || source !== lastSource)) before = { ...prevColor };
        lastChangeAt = now;
        lastSource = source;
        prevColor = { ...color };

        if (source !== 'input') {
            setInputMessage('');
            if (document.activeElement !== els.input) inputDirty = false;
        }
        schedule();
    }

    function onSettings() {
        const prevMode = mode();
        settings = State.settings();
        if (mode() !== prevMode) {
            planeKey = '';
            hueTrackKey = '';
        }
        schedule();
    }

    function onReset() {
        settings = State.settings();
        planeKey = '';
        hueTrackKey = '';
        fieldsFormat = '';
        prevColor = null;
        inputDirty = false;
        setInputMessage('');
        showNote('');
        schedule();
    }

    /* ── Rendering ─────────────────────────────────────────── */

    function schedule() {
        if (!raf && initialized) raf = requestAnimationFrame(render);
    }

    function render() {
        raf = 0;
        if (!initialized) return;
        const c = State.getActive();
        try {
            renderInput(c);
            if (els.picker) {
                renderModes();
                renderPlane(c);
                renderSliders(c);
                renderCompare(c);
                renderChannels(c);
            }
            if (els.formatRows) renderFormats(c);
            if (els.stats) renderStats(c);
        } catch (err) {
            console.error('[PickerUI] render failed:', err);
        }
    }

    function renderInput(c) {
        const input = els.input;
        if (!input || (document.activeElement === input && inputDirty)) return;
        const text = primaryText(c);
        if (input.value !== text) input.value = text;
    }

    function renderModes() {
        const m = mode();
        els.picker.dataset.mode = m;
        els.modeChips.forEach((chip) => {
            const on = chip.dataset.mode === m;
            chip.setAttribute('aria-checked', String(on));
            chip.tabIndex = on ? 0 : -1;
        });
    }

    function renderPlane(c) {
        const m = mode();
        const meta = PLANE[m];
        const pos = planePos();
        const thumb = els.planeThumb;
        thumb.style.left = `${clamp01(pos.x) * 100}%`;
        thumb.style.top = `${clamp01(pos.y) * 100}%`;
        thumb.style.setProperty('--c', cssHex(opaque(c)));

        let text;
        if (m === 'oklch') {
            text = `Chroma ${M.okc.toFixed(3)}, lightness ${Math.round(M.okl * 100)}%`;
            if (M.okClipped) text += ', held at the sRGB edge';
        } else {
            const yv = m === 'hsv' ? M.v : M.l;
            text = `${meta.x} ${Math.round(clamp01(pos.x) * 100)}%, ${meta.y.toLowerCase()} ${Math.round(yv)}%`;
        }
        thumb.setAttribute('aria-label', meta.label);
        thumb.setAttribute('aria-valuenow', String(Math.round(clamp01(pos.x) * 100)));
        thumb.setAttribute('aria-valuetext', text);
        thumb.title = `${meta.label}: ${text}`;

        els.axisX.textContent = `${meta.x} →`;
        els.axisY.textContent = `${meta.y} ↑`;
        // One slot, so the caption never changes height mid-drag.
        els.gamutKey.hidden = m !== 'oklch' || M.okClipped;
        els.gamutFlag.hidden = !(m === 'oklch' && M.okClipped);

        drawPlane(false);
    }

    function hueTrack() {
        const m = mode();
        if (m !== 'oklch') {
            const key = 'rgb';
            if (hueTrackKey !== key) {
                hueTrackKey = key;
                const stops = [];
                for (let i = 0; i <= 6; i++) stops.push(`${cssHex(Color.fromHsv(i * 60, 100, 100))} ${fmtNum((i / 6) * 100, 2)}%`);
                els.hueSlider.style.backgroundImage = `linear-gradient(to right, ${stops.join(', ')})`;
            }
            return;
        }
        const l = Math.round(clamp(M.okl, 0.55, 0.82) * 50) / 50;
        const key = `ok${l}`;
        if (hueTrackKey === key) return;
        hueTrackKey = key;
        const stops = [];
        for (let i = 0; i <= 24; i++) {
            stops.push(`${cssHex(Color.fromOklch(l, 0.15, i * 15))} ${fmtNum((i / 24) * 100, 2)}%`);
        }
        els.hueSlider.style.backgroundImage = `linear-gradient(to right, ${stops.join(', ')})`;
        els.hueSlider.dataset.trackL = String(l);
    }

    function renderSliders(c) {
        hueTrack();
        const hue = hueValue();
        const hueThumb = els.hueThumb;
        hueThumb.style.left = `${(clamp(hue, 0, 360) / 360) * 100}%`;
        const pure = mode() === 'oklch'
            ? Color.fromOklch(Number(els.hueSlider.dataset.trackL) || 0.7, 0.15, hue)
            : Color.fromHsv(hue, 100, 100);
        hueThumb.style.setProperty('--c', cssHex(pure));
        hueThumb.setAttribute('aria-valuenow', String(Math.round(hue)));
        hueThumb.setAttribute('aria-valuetext', `${Math.round(hue)} degrees`);
        hueThumb.title = `Hue: ${Math.round(hue)}°`;

        const solid = cssHex(opaque(c));
        els.alphaSlider.style.setProperty('--alpha-to', solid);
        els.alphaSlider.style.setProperty('--alpha-from', `${solid}00`);
        const alphaThumb = els.alphaThumb;
        alphaThumb.style.left = `${c.a * 100}%`;
        alphaThumb.style.setProperty('--c', cssHex(c));
        const pct = Math.round(c.a * 100);
        alphaThumb.setAttribute('aria-valuenow', String(pct));
        alphaThumb.setAttribute('aria-valuetext', `${pct}% opaque`);
        alphaThumb.title = `Opacity: ${pct}%`;
    }

    function renderCompare(c) {
        const was = before || c;
        const wasHex = hexOf(was);
        const nowHex = hexOf(c);
        const same = Color.equals(was, c);

        const b = els.beforeBtn;
        b.style.setProperty('--c', cssHex(was));
        b.style.setProperty('--on', onColor(cssHex(was)));
        b.disabled = same;
        const label = same ? `Before: ${wasHex}, the same as now` : `Before: ${wasHex}. Click to go back to it`;
        b.setAttribute('aria-label', label);
        b.title = same ? `Before: ${wasHex} (unchanged)` : `Before: ${wasHex} — click to go back`;

        const n = els.nowSwatch;
        n.style.setProperty('--c', cssHex(c));
        n.style.setProperty('--on', onColor(cssHex(c)));
        n.title = `Now: ${nowHex}`;
        n.setAttribute('aria-label', `Now: ${nowHex}`);
    }

    /* ── Channel editor ────────────────────────────────────── */

    function channelFormat() {
        // Read without creating the pane entry; setPane() creates it on first choice.
        const panes = window.AppState && AppState.panes;
        const pane = panes && panes.picker;
        return pane && own(CHANNELS, pane.channelFormat) ? pane.channelFormat : 'rgb';
    }

    const fieldsOf = (fmt) => CHANNELS[own(CHANNELS, fmt) ? fmt : 'rgb'].fields.concat([ALPHA_FIELD]);
    const rangeText = (f) => `${f.min}–${f.max}${f.unit === '%' ? '%' : f.unit === '°' ? '°' : ''}`;

    function channelValues(fmt, c) {
        const out = { alpha: c.a * 100 };
        switch (fmt) {
            case 'hsl':
                return Object.assign(out, { h: M.h, s: M.sl, l: M.l });
            case 'hwb': {
                const o = Color.toHwb(c);
                return Object.assign(out, { h: M.h, w: o.w, b: o.b });
            }
            case 'oklch':
                return Object.assign(out, { l: M.okl, c: M.okc, h: M.okh });
            case 'lab': {
                const o = Color.toLab(c);
                return Object.assign(out, { l: o.l, a: o.a, b: o.b });
            }
            case 'rgb':
            default: {
                const o = Color.toRgb255(c);
                return Object.assign(out, { r: o.r, g: o.g, b: o.b });
            }
        }
    }

    function buildFields(fmt) {
        fieldsFormat = fmt;
        els.fieldInputs = {};
        const holder = els.fields;
        holder.querySelectorAll('.picker-field--channel').forEach((n) => n.remove());
        fieldsOf(fmt).forEach((f) => {
            const id = `picker-ch-${f.key}`;
            const wrap = DOM.create('label', { className: 'picker-field picker-field--channel', attrs: { for: id } });
            wrap.appendChild(DOM.create('span', { className: 'mini-label', text: f.short, attrs: { 'aria-hidden': 'true' } }));
            const label = `${f.name} (${rangeText(f)})`;
            const input = DOM.create('input', {
                className: 'text-input mono picker-num',
                id,
                attrs: {
                    type: 'number',
                    inputmode: 'decimal',
                    min: String(f.min),
                    max: String(f.max),
                    step: String(f.step),
                    autocomplete: 'off',
                    'aria-label': label,
                    title: `${label}. Arrow keys step ${f.step}, Shift + arrow steps ${fmtNum(f.step * 10, 4)}`
                },
                data: { key: f.key }
            });
            wrap.appendChild(input);
            holder.appendChild(wrap);
            els.fieldInputs[f.key] = input;
        });
    }

    function renderChannels(c) {
        const fmt = channelFormat();
        if (els.formatSelect.value !== fmt) els.formatSelect.value = fmt;
        if (fieldsFormat !== fmt) buildFields(fmt);
        const values = channelValues(fmt, c);
        const p = Number.isInteger(settings.precision) ? settings.precision : 2;
        fieldsOf(fmt).forEach((f) => {
            const input = els.fieldInputs[f.key];
            if (!input || (document.activeElement === input && input.dataset.dirty === '1')) return;
            const text = fmtNum(values[f.key], f.dp(p));
            if (input.value !== text) input.value = text;
            input.dataset.dirty = '';
        });
    }

    function fieldDef(key) {
        return fieldsOf(fieldsFormat).find((f) => f.key === key);
    }

    function commitFields(changedInput) {
        const fmt = fieldsFormat;
        const current = channelValues(fmt, State.getActive());
        const values = {};
        const notes = [];
        for (const f of fieldsOf(fmt)) {
            const input = els.fieldInputs[f.key];
            const raw = input ? input.value.trim() : '';
            let v = raw === '' ? NaN : Number(raw);
            if (!Number.isFinite(v)) {
                if (input === changedInput) {
                    input.dataset.dirty = '';
                    showNote(`Type a number for ${f.name} (${rangeText(f)}).`, 'warn');
                    schedule();
                    return false;
                }
                v = current[f.key];
            }
            if (v < f.min || v > f.max) {
                v = clamp(v, f.min, f.max);
                notes.push(`${f.name} was limited to ${rangeText(f)}.`);
            }
            values[f.key] = v;
        }
        Object.values(els.fieldInputs).forEach((input) => { input.dataset.dirty = ''; });

        const a = values.alpha / 100;
        let color;
        let lock = null;
        switch (fmt) {
            case 'hsl':
                M.h = values.h;
                M.sl = values.s;
                M.l = values.l;
                color = Color.fromHsl(values.h, values.s, values.l, a);
                lock = { hue: 1, hsl: 1 };
                break;
            case 'hwb':
                M.h = values.h;
                color = Color.fromHwb(values.h, values.w, values.b, a);
                lock = { hue: 1 };
                break;
            case 'oklch': {
                const out = oklchColor(values.l, values.c, values.h, a);
                M.okl = values.l;
                M.okh = values.h;
                M.okc = out.actual;
                M.okcWant = out.actual;
                M.okClipped = out.clipped;
                color = out.color;
                lock = { ok: 1 };
                if (out.clipped) notes.push(`Chroma ${fmtNum(values.c, 4)} is outside sRGB at this lightness and hue, so it was reduced to ${fmtNum(out.actual, 4)}.`);
                break;
            }
            case 'lab': {
                color = Color.fromLab(values.l, values.a, values.b, a);
                const back = Color.toLab(color);
                if (Math.hypot(back.l - values.l, back.a - values.a, back.b - values.b) > 0.75) {
                    notes.push('That Lab color is outside sRGB, so the nearest color inside it was used.');
                }
                break;
            }
            case 'rgb':
            default:
                color = Color.fromRgb(values.r, values.g, values.b, a);
                break;
        }
        applyColor(color, { lock });
        if (notes.length) showNote(notes.join(' '), 'warn');
        else showNote('');
        schedule();
        return true;
    }

    function stepField(input, dir, big) {
        const f = fieldDef(input.dataset.key);
        if (!f) return;
        let v = Number(input.value);
        if (input.value.trim() === '' || !Number.isFinite(v)) v = channelValues(fieldsFormat, State.getActive())[f.key];
        v = clamp(v + dir * f.step * (big ? 10 : 1), f.min, f.max);
        const p = Number.isInteger(settings.precision) ? settings.precision : 2;
        input.value = fmtNum(v, Math.max(f.dp(p), 3));
        commitFields(input);
    }

    function showNote(message, state = 'warn') {
        const note = els.note;
        if (!note) return;
        clearTimeout(noteTimer);
        if (!message) {
            note.textContent = '';
            delete note.dataset.state;
            return;
        }
        note.textContent = message;
        note.dataset.state = state;
        noteTimer = setTimeout(() => showNote(''), NOTE_MS);
    }

    /* ── Formats card and stats ────────────────────────────── */

    function formatValue(id, c) {
        if (id === 'name') return nameInfo(c).text;
        return Color.format(c, id, { precision: settings.precision, upper: settings.hexUpper !== false });
    }

    function renderFormats(c) {
        const primary = settings.primaryFormat || 'hex';
        els.formatRows.forEach((row) => {
            const id = row.dataset.format;
            const text = formatValue(id, c);
            if (row._value.textContent !== text) row._value.textContent = text;
            const isPrimary = id === primary;
            if (isPrimary) row.dataset.primary = 'true';
            else delete row.dataset.primary;
            row._primary.hidden = !isPrimary;
            row.title = isPrimary ? 'Primary format: the field, the copy button and C use it (change it in Settings)' : '';
        });

        // Text samples: black and white on the color.
        const rb = Color.contrast('#000000', c);
        const rw = Color.contrast('#FFFFFF', c);
        const best = rb >= rw ? 'black' : 'white';
        [['black', rb], ['white', rw]].forEach(([ink, ratio]) => {
            const tile = els.tiles[ink];
            tile.style.setProperty('--c', cssHex(c));
            const isBest = ink === best;
            const word = wcagWord(ratio);
            tile._ratio.textContent = `${ratioText(ratio)}:1 · ${word}`;
            tile._best.hidden = !isBest;
            tile.dataset.best = String(isBest);
            const name = ink === 'black' ? 'Black' : 'White';
            tile.setAttribute('aria-label', `${name} text on this color: contrast ${ratioText(ratio)} to 1, ${word === 'fails' ? 'fails WCAG' : `passes ${word}`}${isBest ? '. The better choice' : ''}`);
        });
    }

    function renderStats(c) {
        const ok = Color.toOklch(c);
        const lum = Color.luminance(c);
        const vsWhite = Color.contrast(c, '#FFFFFF');
        const vsBlack = Color.contrast(c, '#000000');
        const hueText = ok.c > 1e-4 ? `${Math.round(ok.h)}°` : 'none';
        const set = (key, text, title) => {
            const pill = els.stats[key];
            if (pill.textContent !== text) pill.textContent = text;
            if (title !== undefined) pill.title = title;
        };
        set('lum', `Luminance ${lum.toFixed(3)}`);
        set('white', `vs white ${ratioText(vsWhite)}:1`, `Contrast with white: ${ratioText(vsWhite)}:1 (${wcagWord(vsWhite)})`);
        set('black', `vs black ${ratioText(vsBlack)}:1`, `Contrast with black: ${ratioText(vsBlack)}:1 (${wcagWord(vsBlack)})`);
        set('hue', `OKLCH hue ${hueText}`, ok.c > 1e-4 ? 'Hue angle in OKLCH' : 'A grey has no hue');
        set('light', `Lightness ${Math.round(ok.l * 100)}%`);
        set('alpha', `Alpha ${Math.round(c.a * 100)}%`);
    }

    /* ── Canvas ────────────────────────────────────────────── */

    function readTokens() {
        const cs = getComputedStyle(document.documentElement);
        const fallback = getComputedStyle(els.canvas).color;
        tokens = {
            line: cs.getPropertyValue('--fg-default').trim() || fallback,
            halo: cs.getPropertyValue('--bg-elevated').trim() || fallback
        };
    }

    function sizeCanvas() {
        const plane = els.plane;
        const canvas = els.canvas;
        const w = plane.clientWidth;
        const h = plane.clientHeight;
        if (!w || !h) return false;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const W = Math.round(w * dpr);
        const H = Math.round(h * dpr);
        if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
            planeKey = '';
        }
        return true;
    }

    function drawPlane(force) {
        const canvas = els.canvas;
        if (!canvas || !canvas.width || !canvas.height) return;
        const m = mode();
        const hue = hueValue();
        const theme = document.documentElement.getAttribute('data-theme') || '';
        const key = `${m}|${hue.toFixed(1)}|${canvas.width}x${canvas.height}|${theme}`;
        if (!force && key === planeKey) return;
        planeKey = key;
        if (!tokens || tokens.theme !== theme) {
            readTokens();
            tokens.theme = theme;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (m === 'oklch') drawOklch(ctx, canvas.width, canvas.height, hue);
        else drawHsx(ctx, canvas.width, canvas.height, m, hue);
    }

    /** HSV and HSL are exact as gradient layers, so they stay crisp at any size. */
    function drawHsx(ctx, W, H, m, hue) {
        ctx.clearRect(0, 0, W, H);
        let g;
        if (m === 'hsv') {
            ctx.fillStyle = cssHex(Color.fromHsv(hue, 100, 100));
            ctx.fillRect(0, 0, W, H);
            g = ctx.createLinearGradient(0, 0, W, 0);
            g.addColorStop(0, 'rgba(255, 255, 255, 1)');
            g.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, 'rgba(0, 0, 0, 0)');
            g.addColorStop(1, 'rgba(0, 0, 0, 1)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            return;
        }
        g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, cssHex(Color.fromHsl(hue, 0, 50)));
        g.addColorStop(1, cssHex(Color.fromHsl(hue, 100, 50)));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        g.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    /** OKLCH: sampled at half resolution, outside-sRGB dimmed and hatched, edge drawn crisp. */
    function drawOklch(ctx, W, H, hue) {
        const dpr = W / Math.max(1, els.plane.clientWidth);
        // Coarser while the hue bar is dragged (redrawn sharp on release).
        const step = Math.max(1, Math.round(dpr * (dragging === 'hue' ? 3 : 2)));
        const sw = Math.max(2, Math.ceil(W / step));
        const sh = Math.max(2, Math.ceil(H / step));
        if (!offscreen) offscreen = document.createElement('canvas');
        if (offscreen.width !== sw || offscreen.height !== sh) {
            offscreen.width = sw;
            offscreen.height = sh;
        }
        const octx = offscreen.getContext('2d');
        const img = octx.createImageData(sw, sh);
        const d = img.data;
        // Same tolerance as the edge line, so dark corners agree with it.
        const lo = -1e-5;
        const hi = 1 + 1e-5;
        for (let y = 0; y < sh; y++) {
            const l = 1 - (y + 0.5) / sh;
            for (let x = 0; x < sw; x++) {
                const rgb = Color.oklchToRgbRaw(l, ((x + 0.5) / sw) * CMAX, hue);
                let r = rgb[0];
                let g = rgb[1];
                let b = rgb[2];
                const inside = r >= lo && r <= hi && g >= lo && g <= hi && b >= lo && b <= hi;
                r = r < 0 ? 0 : r > 1 ? 1 : r;
                g = g < 0 ? 0 : g > 1 ? 1 : g;
                b = b < 0 ? 0 : b > 1 ? 1 : b;
                if (!inside) {
                    // Dim toward mid grey so the reachable area reads first.
                    r = r * 0.4 + 0.3;
                    g = g * 0.4 + 0.3;
                    b = b * 0.4 + 0.3;
                }
                const i = (y * sw + x) * 4;
                d[i] = r * 255 + 0.5;
                d[i + 1] = g * 255 + 0.5;
                d[i + 2] = b * 255 + 0.5;
                d[i + 3] = 255;
            }
        }
        octx.putImageData(img, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offscreen, 0, 0, W, H);

        // The sRGB edge: the largest chroma that fits at each lightness.
        const rows = Math.min(160, Math.max(24, Math.round(H / (2 * dpr))));
        const pts = [];
        for (let i = 0; i <= rows; i++) {
            const l = 1 - i / rows;
            pts.push([Math.min(Color.maxChroma(l, hue) / CMAX, 1) * W, (i / rows) * H]);
        }
        const trace = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        };

        // Hatch the outside so it is not told apart by color alone.
        ctx.save();
        trace();
        ctx.lineTo(W, H);
        ctx.lineTo(W, 0);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = tokens.line;
        ctx.lineWidth = Math.max(1, dpr);
        const gap = 7 * dpr;
        ctx.beginPath();
        for (let k = -H; k < W; k += gap) {
            ctx.moveTo(k, H);
            ctx.lineTo(k + H, 0);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        trace();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = tokens.halo;
        ctx.lineWidth = 3.5 * dpr;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tokens.line;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.restore();
    }

    /* ── Pointer + keyboard for the area and the bars ──────── */

    /** Start a gesture: the Before color is fixed here for its whole length. */
    function startGesture(kind) {
        if (performance.now() - lastChangeAt > GESTURE_MS || lastSource !== 'picker') before = State.getActive();
        dragging = kind;
    }

    function queuePointer(kind, fx, fy) {
        pending = { kind, fx, fy };
        if (!pendingRaf) pendingRaf = requestAnimationFrame(flushPointer);
    }

    function flushPointer() {
        if (pendingRaf) cancelAnimationFrame(pendingRaf);
        pendingRaf = 0;
        const p = pending;
        pending = null;
        if (!p) return;
        if (p.kind === 'plane') setPlane(p.fx, p.fy, true);
        else if (p.kind === 'hue') setHue(p.fx * 360, true);
        else if (p.kind === 'alpha') setAlpha(Math.round(p.fx * 1000) / 1000, true);
    }

    /**
     * The area grows to match the Formats card beside it, and that card
     * changes height as values wrap. Pin the area's height for the length
     * of a drag so nothing moves under the pointer.
     */
    function freezePlane(on) {
        const plane = els.plane;
        if (!plane) return;
        if (on) {
            const height = plane.getBoundingClientRect().height;
            plane.style.height = `${height}px`;
            plane.style.flex = '0 0 auto';
        } else {
            plane.style.removeProperty('flex');
            plane.style.removeProperty('height');
        }
    }

    function bindDrag(surface, thumb, kind) {
        const read = (e) => {
            const r = surface.getBoundingClientRect();
            return {
                fx: clamp01((e.clientX - r.left) / Math.max(1, r.width)),
                fy: clamp01((e.clientY - r.top) / Math.max(1, r.height))
            };
        };
        const end = (e) => {
            if (dragging !== kind) return;
            flushPointer();
            dragging = null;
            surface.classList.remove('is-dragging');
            freezePlane(false);
            if (kind === 'hue' && mode() === 'oklch') {
                planeKey = '';
                schedule();
            }
            if (e && e.pointerId !== undefined && surface.hasPointerCapture(e.pointerId)) {
                surface.releasePointerCapture(e.pointerId);
            }
        };
        surface.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            startGesture(kind);
            freezePlane(true);
            surface.classList.add('is-dragging');
            try { surface.setPointerCapture(e.pointerId); } catch (_err) { /* synthetic events */ }
            thumb.focus({ preventScroll: true });
            const p = read(e);
            queuePointer(kind, p.fx, p.fy);
        });
        surface.addEventListener('pointermove', (e) => {
            if (dragging !== kind) return;
            const p = read(e);
            queuePointer(kind, p.fx, p.fy);
        });
        surface.addEventListener('pointerup', end);
        surface.addEventListener('pointercancel', end);
        surface.addEventListener('lostpointercapture', end);
    }

    function planeKeys(e) {
        const step = e.shiftKey ? 0.1 : 0.01;
        const pos = planePos();
        let x = clamp01(pos.x);
        let y = clamp01(pos.y);
        switch (e.key) {
            case 'ArrowLeft': x -= step; break;
            case 'ArrowRight': x += step; break;
            case 'ArrowUp': y -= step; break;
            case 'ArrowDown': y += step; break;
            case 'Home': x = 0; break;
            case 'End': x = 1; break;
            case 'PageUp': y = 0; break;
            case 'PageDown': y = 1; break;
            default: return;
        }
        e.preventDefault();
        setPlane(clamp01(Math.round(x * 1000) / 1000), clamp01(Math.round(y * 1000) / 1000), true);
    }

    /** Shared keyboard model for the one-dimensional bars. */
    function barKeys(e, value, min, max, small, big, apply) {
        let v = value;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowDown': v -= e.shiftKey ? big : small; break;
            case 'ArrowRight':
            case 'ArrowUp': v += e.shiftKey ? big : small; break;
            case 'PageDown': v -= big; break;
            case 'PageUp': v += big; break;
            case 'Home': v = min; break;
            case 'End': v = max; break;
            default: return;
        }
        e.preventDefault();
        apply(clamp(v, min, max));
    }

    /* ── Building the DOM ──────────────────────────────────── */

    function thumbEl(className, attrs) {
        return DOM.create('div', {
            className: `picker-thumb ${className}`,
            attrs: Object.assign({ role: 'slider', tabindex: '0' }, attrs)
        });
    }

    function buildModes() {
        const host = DOM.id('actions-picker');
        if (!host) return;
        const group = DOM.create('div', {
            className: 'picker-modes',
            attrs: { role: 'radiogroup', 'aria-label': 'Picker model' }
        });
        els.modeChips = MODES.map((m) => {
            const chip = DOM.create('button', {
                className: 'chip-btn picker-mode',
                text: m.label,
                attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', title: m.title },
                data: { mode: m.id }
            });
            group.appendChild(chip);
            return chip;
        });
        const choose = (id, focus) => {
            const chip = els.modeChips.find((c) => c.dataset.mode === id);
            if (focus && chip) chip.focus();
            if (id === mode()) return;
            State.applySettings({ pickerMode: id });
        };
        group.addEventListener('click', (e) => {
            const chip = e.target.closest('.picker-mode');
            if (chip) choose(chip.dataset.mode, false);
        });
        group.addEventListener('keydown', (e) => {
            const i = MODES.findIndex((m) => m.id === mode());
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % MODES.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + MODES.length) % MODES.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = MODES.length - 1;
            if (next < 0) return;
            e.preventDefault();
            choose(MODES[next].id, true);
        });
        host.appendChild(group);
    }

    function buildPicker(mount) {
        const root = DOM.create('div', { className: 'picker' });

        // 2D area
        const plane = DOM.create('div', { className: 'picker-plane' });
        const canvas = DOM.create('canvas', { className: 'picker-canvas', attrs: { 'aria-hidden': 'true' } });
        const planeThumb = thumbEl('picker-thumb--plane', {
            'aria-roledescription': '2D slider',
            'aria-label': 'Saturation and brightness',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-describedby': 'picker-plane-help'
        });
        plane.append(canvas, planeThumb);
        const help = DOM.create('p', {
            className: 'picker-sr',
            id: 'picker-plane-help',
            text: 'Arrow keys move one percent, Shift with an arrow moves ten. Home and End go to the left and right edges; Page Up and Page Down to the top and bottom.'
        });

        const caption = DOM.create('div', { className: 'picker-caption', attrs: { 'aria-hidden': 'true' } });
        const axisX = DOM.create('span', { className: 'picker-axis' });
        const axisY = DOM.create('span', { className: 'picker-axis' });
        const gamutKey = DOM.create('span', { className: 'picker-gamut-key', text: 'Hatched: outside sRGB' });
        const gamutFlag = DOM.create('span', { className: 'picker-gamut-flag', text: 'Held at the sRGB edge' });
        caption.append(axisX, axisY, gamutKey, gamutFlag);

        // Before/now + hue and opacity bars
        const row = DOM.create('div', { className: 'picker-row' });
        const compare = DOM.create('div', { className: 'picker-compare', attrs: { role: 'group', 'aria-label': 'Before and now' } });
        const beforeBtn = DOM.create('button', {
            className: 'picker-compare-half picker-compare-before',
            text: 'Before',
            attrs: { type: 'button' }
        });
        const nowSwatch = DOM.create('span', {
            className: 'picker-compare-half picker-compare-now',
            text: 'Now',
            attrs: { role: 'img' }
        });
        compare.append(beforeBtn, nowSwatch);

        const bars = DOM.create('div', { className: 'picker-bars' });
        const hueSlider = DOM.create('div', { className: 'picker-bar picker-bar--hue' });
        const hueThumb = thumbEl('picker-thumb--bar', {
            'aria-label': 'Hue', 'aria-valuemin': '0', 'aria-valuemax': '360'
        });
        hueSlider.appendChild(hueThumb);
        const alphaSlider = DOM.create('div', { className: 'picker-bar picker-bar--alpha' });
        const alphaThumb = thumbEl('picker-thumb--bar', {
            'aria-label': 'Opacity', 'aria-valuemin': '0', 'aria-valuemax': '100'
        });
        alphaSlider.appendChild(alphaThumb);
        bars.append(hueSlider, alphaSlider);
        row.append(compare, bars);

        // Channel editor
        const fields = DOM.create('div', { className: 'picker-fields' });
        const fmtWrap = DOM.create('label', { className: 'picker-field picker-field--format', attrs: { for: 'picker-format' } });
        fmtWrap.appendChild(DOM.create('span', { className: 'mini-label', text: 'Edit as' }));
        const formatSelect = DOM.create('select', {
            className: 'select-input picker-format',
            id: 'picker-format',
            attrs: { 'aria-label': 'Edit the color as', title: 'Choose which numbers to edit' }
        });
        Object.keys(CHANNELS).forEach((k) => {
            formatSelect.appendChild(DOM.create('option', { text: CHANNELS[k].label, attrs: { value: k } }));
        });
        fmtWrap.appendChild(formatSelect);
        fields.appendChild(fmtWrap);

        const note = DOM.create('div', { className: 'tool-feedback picker-note', attrs: { role: 'status', 'aria-live': 'polite' } });

        root.append(plane, help, caption, row, fields, note);
        mount.appendChild(root);

        Object.assign(els, {
            picker: root, plane, canvas, planeThumb, axisX, axisY, gamutKey, gamutFlag,
            beforeBtn, nowSwatch, hueSlider, hueThumb, alphaSlider, alphaThumb,
            fields, formatSelect, note, fieldInputs: {}
        });

        // Area
        bindDrag(plane, planeThumb, 'plane');
        planeThumb.addEventListener('keydown', planeKeys);

        // Bars
        bindDrag(hueSlider, hueThumb, 'hue');
        hueThumb.addEventListener('keydown', (e) => barKeys(e, hueValue(), 0, 360, 1, 10, (v) => setHue(v, true)));
        bindDrag(alphaSlider, alphaThumb, 'alpha');
        alphaThumb.addEventListener('keydown', (e) => {
            barKeys(e, Math.round(State.getActive().a * 100), 0, 100, 1, 10, (v) => setAlpha(v / 100, true));
        });

        // Before
        beforeBtn.addEventListener('click', () => {
            if (!before) return;
            const target = { ...before };
            lastChangeAt = 0;
            State.setActive(target, { source: 'picker' });
        });

        // Channel editor
        formatSelect.addEventListener('change', () => {
            State.setPane('picker', { channelFormat: formatSelect.value });
            showNote('');
            schedule();
        });
        fields.addEventListener('input', (e) => {
            if (e.target.classList.contains('picker-num')) e.target.dataset.dirty = '1';
        });
        fields.addEventListener('change', (e) => {
            if (e.target.classList.contains('picker-num') && e.target.dataset.dirty === '1') commitFields(e.target);
        });
        fields.addEventListener('keydown', (e) => {
            const input = e.target;
            if (!input.classList || !input.classList.contains('picker-num')) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                commitFields(input);
                input.select();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                stepField(input, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
            } else if (e.key === 'Escape' && input.dataset.dirty === '1') {
                e.preventDefault();
                input.dataset.dirty = '';
                schedule();
            }
        });
        // Mouse wheels must not change numbers by accident.
        fields.addEventListener('wheel', (e) => {
            if (e.target.classList && e.target.classList.contains('picker-num') && document.activeElement === e.target) {
                e.target.blur();
            }
        }, { passive: true });
    }

    function buildFormats(mount) {
        const root = DOM.create('div', { className: 'formats' });
        const list = DOM.create('div', { className: 'readout-list formats-list' });
        els.formatRows = FORMAT_ROWS.map((f) => {
            const row = DOM.create('div', { className: 'readout', data: { format: f.id } });
            const label = DOM.create('span', { className: 'readout-label', text: f.label });
            const mark = DOM.create('span', { className: 'formats-primary picker-sr', text: ' (primary format)' });
            mark.hidden = true;
            label.appendChild(mark);
            const value = DOM.create('code', { className: 'readout-value' });
            const btn = DOM.create('button', {
                className: 'icon-action',
                html: ICON_COPY,
                attrs: { type: 'button', 'aria-label': `Copy ${f.label}`, title: `Copy ${f.label}` },
                data: { format: f.id }
            });
            row.append(label, value, btn);
            row._value = value;
            row._primary = mark;
            list.appendChild(row);
            return row;
        });

        list.addEventListener('click', (e) => {
            const btn = e.target.closest('.icon-action[data-format]');
            if (!btn) return;
            const c = State.getActive();
            const def = FORMAT_ROWS.find((f) => f.id === btn.dataset.format);
            const text = btn.dataset.format === 'name' ? nameInfo(c).copy : formatValue(btn.dataset.format, c);
            if (!text) {
                notify('Nothing to copy for this row.', 'info', 1400);
                return;
            }
            ToolApp.copy(text, `${def.label} ${text.length > 34 ? `${text.slice(0, 34)}…` : text}`, btn);
        });

        // Text on this color
        const textBlock = DOM.create('div', { className: 'formats-text' });
        textBlock.appendChild(DOM.create('h4', { className: 'section-label', text: 'Text on this color' }));
        const grid = DOM.create('div', { className: 'formats-text-grid' });
        els.tiles = {};
        ['black', 'white'].forEach((ink) => {
            const tile = DOM.create('div', {
                className: 'formats-tile',
                attrs: { role: 'img' },
                data: { ink }
            });
            tile.style.setProperty('--ink', ink === 'black' ? '#000000' : '#FFFFFF');
            const sample = DOM.create('span', { className: 'formats-tile-sample', text: 'Aa', attrs: { 'aria-hidden': 'true' } });
            const ratio = DOM.create('span', { className: 'formats-tile-ratio', attrs: { 'aria-hidden': 'true' } });
            const best = DOM.create('span', { className: 'formats-tile-best', text: '✓ Better', attrs: { 'aria-hidden': 'true' } });
            tile.append(sample, ratio, best);
            tile._ratio = ratio;
            tile._best = best;
            grid.appendChild(tile);
            els.tiles[ink] = tile;
        });
        textBlock.appendChild(grid);

        root.append(list, textBlock);
        mount.appendChild(root);

        const actions = DOM.id('actions-formats');
        if (actions) {
            const copyAll = DOM.create('button', {
                className: 'btn btn-ghost btn-sm formats-copy-all',
                html: `${ICON_COPY}<span>Copy all</span>`,
                attrs: { type: 'button', title: 'Copy every format, one per line', 'aria-label': 'Copy all formats' }
            });
            copyAll.addEventListener('click', () => {
                const c = State.getActive();
                const lines = FORMAT_ROWS.map((f) => `${f.label}: ${formatValue(f.id, c)}`);
                ToolApp.copy(lines.join('\n'), `all ${FORMAT_ROWS.length} formats`, copyAll);
            });
            actions.appendChild(copyAll);
        }
    }

    function buildStats(mount) {
        mount.setAttribute('role', 'group');
        const defs = [
            ['lum', 'Relative luminance (WCAG), 0 for black to 1 for white', false],
            ['white', '', false],
            ['black', '', false],
            ['hue', '', true],
            ['light', 'Perceived lightness (OKLCH L)', true],
            ['alpha', 'Opacity', true]
        ];
        els.stats = {};
        defs.forEach(([key, title, extra]) => {
            const pill = DOM.create('span', { className: `stat-pill${extra ? ' stat-pill--extra' : ''}` });
            if (title) pill.title = title;
            mount.appendChild(pill);
            els.stats[key] = pill;
        });
    }

    /* ── Color field (toolbar) ─────────────────────────────── */

    function setInputMessage(message, tone) {
        const out = els.inputError;
        const input = els.input;
        if (!out || !input) return;
        if (out.textContent !== (message || '')) out.textContent = message || '';
        out.title = message || '';
        if (message && tone) out.dataset.tone = tone;
        else delete out.dataset.tone;
        if (message && tone === 'error') input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }

    function readInput(raw) {
        let detail = null;
        try { detail = Color.parseDetailed(raw); } catch (_err) { detail = null; }
        if (detail && detail.color) return detail;
        const color = State.colorOf(raw);
        return color ? { color, clipped: false } : null;
    }

    /** kind 'live' (while typing) or 'commit' (Enter). Returns the parse or null. */
    function parseInput(kind) {
        clearTimeout(liveTimer);
        clearTimeout(errorTimer);
        liveTimer = 0;
        errorTimer = 0;
        const raw = els.input.value.trim();
        if (!raw) {
            setInputMessage(kind === 'commit' ? MSG.empty : '', 'error');
            return null;
        }
        const detail = readInput(raw);
        if (!detail) {
            if (kind === 'commit') setInputMessage(MSG.bad, 'error');
            else errorTimer = setTimeout(() => setInputMessage(MSG.bad, 'error'), ERROR_MS);
            return null;
        }
        // The whole typing session is one undo step, and nothing reaches
        // Recent until the edit is committed (Enter, or leaving the field).
        if (!editToken) editToken = `edit-${++editSeq}`;
        State.setActive(detail.color, { source: 'input', record: false, coalesce: true, gesture: editToken });
        setInputMessage(detail.clipped ? MSG.clipped : '', 'info');
        return detail;
    }

    /** End a typing session; a committed change is recorded in Recent once. */
    function endEdit(commit) {
        const start = editStart;
        inputDirty = false;
        editStart = null;
        editToken = null;
        const now = State.getActive();
        if (commit && start && !Color.equals(start, now) && State.settings().recordHistory) State.addHistory(now);
    }

    function wireInput() {
        const input = DOM.id('color-input');
        if (!input) return;
        input.dataset.wired = 'true';
        els.input = input;
        els.inputError = DOM.id('input-error');

        input.addEventListener('input', () => {
            if (!inputDirty) {
                editStart = State.getActive();
                editToken = `edit-${++editSeq}`;
            }
            inputDirty = true;
            clearTimeout(liveTimer);
            clearTimeout(errorTimer);
            liveTimer = setTimeout(() => parseInput('live'), LIVE_MS);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (parseInput('commit')) {
                    endEdit(true);
                    input.value = primaryText(State.getActive());
                    input.select();
                }
            } else if (e.key === 'Escape') {
                clearTimeout(liveTimer);
                clearTimeout(errorTimer);
                const wasEditing = inputDirty || Boolean(els.inputError && els.inputError.textContent);
                if (editStart && !Color.equals(editStart, State.getActive())) {
                    // Same gesture: going back to the start removes the session's undo step.
                    State.setActive(editStart, { source: 'input', record: false, coalesce: true, gesture: editToken });
                }
                endEdit(false);
                setInputMessage('');
                input.value = primaryText(State.getActive());
                e.preventDefault();
                if (wasEditing) {
                    e.stopPropagation();
                    input.select();
                } else {
                    input.blur();
                }
            }
        });

        input.addEventListener('blur', () => {
            if (liveTimer) parseInput('live');
            clearTimeout(errorTimer);
            errorTimer = 0;
            if (!inputDirty) return;
            const raw = input.value.trim();
            const readable = Boolean(raw && readInput(raw));
            endEdit(readable);
            if (!readable) setInputMessage('');
            input.value = primaryText(State.getActive());
        });
    }

    function wireToolbar() {
        const dropper = DOM.id('btn-eyedropper');
        if (dropper && !('EyeDropper' in window)) dropper.hidden = true;
    }

    /* ── Observers ─────────────────────────────────────────── */

    function observe() {
        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                if (sizeCanvas()) drawPlane(false);
            });
            ro.observe(els.plane);
        } else {
            window.addEventListener('resize', DOM.debounce(() => { if (sizeCanvas()) drawPlane(false); }, 120));
        }
        // The kernel fires this on every painted theme change, including a
        // device switch under System: the gamut edge and halo use theme tokens.
        document.addEventListener('toolman:theme', () => {
            tokens = null;
            planeKey = '';
            schedule();
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    const PickerUI = {
        init() {
            if (initialized) return;
            const pickerMount = DOM.id('mount-picker');
            const formatsMount = DOM.id('mount-formats');
            const statsMount = DOM.id('mount-stats');
            if (!hasEngine()) {
                console.warn('[PickerUI] the color engine (js/color.js) is missing; the picker stays empty');
                return;
            }
            settings = State.settings();
            const c = State.getActive();
            derive(c, null);
            before = { ...c };
            prevColor = { ...c };

            wireInput();
            wireToolbar();
            if (pickerMount) {
                buildModes();
                buildPicker(pickerMount);
            }
            if (formatsMount) buildFormats(formatsMount);
            if (statsMount) buildStats(statsMount);

            State.on('active', onActive);
            State.on('settings', onSettings);
            State.on('reset', onReset);

            initialized = true;
            if (els.picker) {
                observe();
                sizeCanvas();
            }
            render();
        },

        /** Re-render everything on the next frame. */
        refresh() {
            planeKey = '';
            schedule();
        },

        focusInput() {
            const input = els.input || DOM.id('color-input');
            if (!input) return;
            input.focus();
            input.select();
        },

        copyPrimary(button) {
            const text = primaryText(State.getActive());
            const btn = button instanceof Element ? button : DOM.id('btn-copy-primary');
            return ToolApp.copy(text, text.length > 40 ? `${primaryLabel()} value` : text, btn);
        },

        random() {
            let color = null;
            try { color = Color.random(); } catch (_err) { color = null; }
            if (color) State.setActive(color, { source: 'random' });
        },

        async eyedropper() {
            if (!('EyeDropper' in window)) {
                notify('This browser has no eyedropper. Use Chrome or Edge on a desktop, or type the color in the field.', 'warning', 4200);
                return false;
            }
            if (dropperBusy) return false;
            dropperBusy = true;
            try {
                const result = await new window.EyeDropper().open();
                if (result && result.sRGBHex && State.setActive(result.sRGBHex, { source: 'eyedropper' })) {
                    notify(`Picked ${State.activeHex()}`, 'success', 1400);
                }
                return true;
            } catch (err) {
                if (!err || err.name !== 'AbortError') {
                    notify('The eyedropper could not pick a color. Try again, or type the color in the field.', 'warning', 3500);
                }
                return false;
            } finally {
                dropperBusy = false;
            }
        },

        toggleStar() {
            const c = State.getActive();
            const hex = State.activeHex();
            const was = State.hasSwatch(c);
            const now = State.toggleSwatch(c);
            if (was && !now) notify(`Removed ${hex} from Saved Colors`, 'info', 1600);
            else if (now) notify(`Saved ${hex} to Saved Colors`, 'success', 1400);
            else notify(State.lastError || 'Could not save this color.', 'warning', 3500);
            return now;
        },

        addToPalette() {
            const hex = State.activeHex();
            const index = State.addToWorking(State.getActive());
            if (index < 0) notify(State.lastError || 'Could not add this color to the working palette.', 'warning', 3500);
            else notify(`Added ${hex} to working palette`, 'success', 1400);
            return index;
        },

        /** 'goldenrod', 'goldenrod at 50%', or '≈ goldenrod' for any color input. */
        nameLabel(color) {
            const c = State.colorOf(color === undefined ? State.getActive() : color);
            return c ? nameInfo(c).label : '';
        }
    };

    window.PickerUI = PickerUI;
})();
