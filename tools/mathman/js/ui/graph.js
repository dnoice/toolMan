/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: GraphUI (mathMan Edition - v1.0)
 *     - File Name: graph.js
 *     - Relative Path: tools/mathman/js/ui/graph.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Graph pane in the Tools rail: plots up to four expressions in x on
 *     a canvas you can pan, zoom, and trace. Use it to see the shape of a
 *     formula, to read values off a curve, or to check a function defined
 *     on the worksheet, since expressions may call the active sheet's own
 *     functions and variables.
 *
 * ✒ Key Features:
 *     - Up to 4 expressions (sin(x), y = 2x + 1, area(x) from the sheet),
 *       each with a numbered colour swatch that shows or hides it; colours
 *       come from the house palette tokens and each series also has its own
 *       line style (solid, dashed, dotted, dash-dot), so colour is never the
 *       only signal
 *     - Compiled once per change with MathEngine.compile (no eval); the
 *       sheet's functions are picked up again whenever they change, and
 *       one-input sheet functions are offered as quick-add chips
 *     - Canvas sized to the pane and scaled by devicePixelRatio; redraws on
 *       resize, on a pixel-ratio change, and on the toolman:theme event
 *     - Axes, minor and major grid lines with nice 1-2-5 tick steps and
 *       mono tick labels that stay on screen when an axis is off view
 *     - Pan by dragging (mouse, pen, or one finger), zoom with the wheel,
 *       a two-finger pinch, the + and − buttons, or the keyboard; Reset
 *       view; a Window form for exact x and y ranges
 *     - Trace: the x under the pointer and each graph's y, with dots on the
 *       curves; with the canvas focused, ←/→ trace, Shift + arrows (or
 *       ↑/↓) pan, + and − zoom, 0 resets, Esc clears the trace
 *     - Focusable canvas with an aria-label and a polite live summary of
 *       the window and the traced values
 *     - Breaks at discontinuities (tan, 1/x, floor) by bisecting each big
 *       jump instead of joining it with a false vertical line
 *     - Sample cap (one sample per CSS pixel, at most 2,000) and a time
 *       budget per curve that thins out slow recursive functions instead of
 *       freezing the page, with a note when it does
 *     - Send traced values to the worksheet as labelled lines, and
 *       Download PNG with a legend under the plot
 *     - Expressions, visibility, the view, and the Window form toggle are
 *       remembered per browser and validated when restored
 *
 * ✒ Usage Instructions:
 *     Load after js/engine.js and js/state.js (and js/ui/worksheet.js),
 *     before js/app.js. app.js calls GraphUI.init() once; the module renders
 *     into #mount-graph, draws only while its pane is open, and keeps itself
 *     in step through State events.
 *
 * ✒ Examples:
 *     GraphUI.init()                         → builds the pane in #mount-graph
 *     GraphUI.setExpression(0, 'x^3 - 2x')   → redraws graph 1
 *     GraphUI.setView({ xMin: -2, xMax: 2, yMin: -1, yMax: 1 })  → true
 *     GraphUI.resetView()                    → x from −10 to 10, square units
 *     GraphUI.traceAt(1.25)                  → [{ series: 1, y: 0.9489846194 }, …]
 *     GraphUI.sendTrace()                    → appends "sin(x) at x 1.25: 0.9489846194"
 *     GraphUI.downloadPng()                  → saves mathman-graph.png
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/engine.js (MathEngine.compile), js/state.js
 *       (State), js/ui/worksheet.js (WorksheetUI.appendLine, optional),
 *       shared/js/dom.js, dialogs.js, toolapp.js, toolman.js;
 *       css/tools-a.css
 *     - Compatible platforms: all evergreen browsers (canvas 2D, pointer
 *       events, ResizeObserver)
 *     - Limitations: plots y as a function of x only (no parametric or
 *       implicit curves); floating point only, with no units; very steep
 *       curves near a pole may show a small gap where the bisection decides
 *       the jump is a break
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'graph';
    const MAX_SERIES = 4;
    const MAX_EXPR = 500;
    const SAMPLE_CAP = 2000;
    const SERIES_BUDGET_MS = 90;      // time to sample one curve per draw
    const BISECT_CAP = 600;           // extra evaluations per curve for breaks
    const SPAN_MIN = 1e-9;
    const SPAN_MAX = 1e9;
    const COORD_MAX = 1e9;
    const ZOOM_STEP = 1.5;
    const MAX_LINES = 2000;

    const SERIES_TOKENS = ['--color-brand', '--color-info', '--color-math', '--color-success'];
    const DASHES = [[], [7, 4], [1.5, 3.5], [10, 3, 2, 3]];
    const DASH_WORDS = ['solid line', 'dashed line', 'dotted line', 'dash-dot line'];
    const PLACEHOLDERS = ['sin(x)', 'x^2 / 4 - 2', 'y = 2x + 1', 'a sheet function, like f(x)'];
    const DEFAULT_SERIES = [{ expr: 'sin(x)', visible: true }, { expr: 'x^2 / 4 - 2', visible: true }];
    const TRIG_RE = /\b(?:a?(?:sin|cos|tan|sec|csc|cot)|atan2)\s*\(/;

    const els = { rows: [] };
    let model = null;          // { series: [{ expr, visible }], view, windowOpen }
    let compiled = [];         // per series: { key, fn, error }
    let needCompile = true;
    let sheetSig = '';
    let sheetText = '';
    let size = { w: 0, h: 0, dpr: 1 };
    let colors = null;
    let trace = null;          // { x, source: 'pointer' | 'key' }
    let frame = 0;
    let stale = false;
    let lastNotes = { coarse: [], cut: [] };
    let compileTimer = 0;
    let saveTimer = 0;
    let liveTimer = 0;
    const pointers = new Map();
    let gesture = null;

    /* ── Small helpers ─────────────────────────────────────── */

    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const engineReady = () => Boolean(window.MathEngine && typeof MathEngine.compile === 'function');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';

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

    const ICONS = {
        zoomIn: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-3.5-3.5M11 8v6M8 11h6' }]],
        zoomOut: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-3.5-3.5M8 11h6' }]],
        reset: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7' }], ['path', { d: 'M3 4v5h5' }]],
        download: [['path', { d: 'M12 3v12' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M5 21h14' }]],
        window: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['path', { d: 'M3 9h18M9 21V9' }]],
        remove: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
        add: [['path', { d: 'M12 5v14M5 12h14' }]],
        send: [['path', { d: 'M12 5v14M5 12h14' }]]
    };

    /** A short sample of a series' line style for its swatch. */
    function dashSample(i) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'gr-dash');
        svg.setAttribute('viewBox', '0 0 24 6');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', '1');
        line.setAttribute('y1', '3');
        line.setAttribute('x2', '23');
        line.setAttribute('y2', '3');
        if (DASHES[i].length) line.setAttribute('stroke-dasharray', DASHES[i].map((d) => d * 0.6).join(' '));
        svg.appendChild(line);
        return svg;
    }

    /** A plain number with up to `digits` significant digits, for labels and the sheet. */
    function plain(n, digits = 12) {
        if (!isNum(n)) return String(n);
        const s = String(Number(n.toPrecision(digits)));
        return s.replace('e+', 'e');
    }

    const fmt = (n) => State.formatNumber(n);

    /* ── Pane state ────────────────────────────────────────── */

    function validView(v) {
        if (!v || typeof v !== 'object') return null;
        const { xMin, xMax, yMin, yMax } = v;
        if (![xMin, xMax, yMin, yMax].every(isNum)) return null;
        if (!(xMin < xMax && yMin < yMax)) return null;
        const xs = xMax - xMin;
        const ys = yMax - yMin;
        if (xs < SPAN_MIN || ys < SPAN_MIN || xs > SPAN_MAX || ys > SPAN_MAX) return null;
        if ([xMin, xMax, yMin, yMax].some((n) => Math.abs(n) > COORD_MAX * 2)) return null;
        return { xMin, xMax, yMin, yMax };
    }

    function loadModel() {
        const p = State.pane(PANE);
        let series = Array.isArray(p.series) ? p.series.slice(0, MAX_SERIES)
            .filter((s) => s && typeof s === 'object' && typeof s.expr === 'string')
            .map((s) => ({ expr: s.expr.slice(0, MAX_EXPR), visible: s.visible !== false })) : [];
        if (!series.length) series = DEFAULT_SERIES.map((s) => ({ ...s }));
        return { series, view: validView(p.view), windowOpen: p.windowOpen === true };
    }

    function persist() {
        clearTimeout(saveTimer);
        saveTimer = 0;
        if (!model) return;
        const ok = State.setPane(PANE, {
            series: model.series.map((s) => ({ expr: s.expr, visible: s.visible })),
            view: model.view ? { ...model.view } : null,
            windowOpen: model.windowOpen
        });
        if (!ok) notify(State.lastError || 'Could not save the Graph settings.', 'warning', 3000);
    }

    function persistSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 400);
    }

    /* ── Compiling against the active sheet ────────────────── */

    /** Signature of what the sheet defines; when it changes, every series recompiles. */
    function readSheet() {
        let result = null;
        try {
            result = State.result();
        } catch (_err) {
            result = null;
        }
        const fns = result && Array.isArray(result.functions) ? result.functions : [];
        const vars = result && Array.isArray(result.variables) ? result.variables : [];
        const sig = JSON.stringify([
            State.activeSheet().id,
            fns.map((f) => [f.name, f.params, f.body]),
            vars.map((v) => [v.name, v.display])
        ]);
        return { sig, defines: fns.length + vars.length > 0, functions: fns };
    }

    function compileAll() {
        needCompile = false;
        if (!engineReady()) {
            compiled = model.series.map(() => ({ key: '', fn: null, error: 'The math engine did not load. Reload the page to draw graphs.' }));
            return;
        }
        const sheet = readSheet();
        if (sheet.sig !== sheetSig) {
            sheetSig = sheet.sig;
            sheetText = sheet.defines ? State.activeSheet().text : '';
        }
        const angle = State.settings().angle === 'deg' ? 'deg' : 'rad';
        compiled = model.series.map((s, i) => {
            const key = `${s.expr}\u0000${angle}\u0000${sheetSig}`;
            if (compiled[i] && compiled[i].key === key) return compiled[i];
            const expr = s.expr.trim();
            if (!expr) return { key, fn: null, error: null, empty: true };
            let r;
            try {
                r = MathEngine.compile(expr, { variable: 'x', angle, sheet: sheetText || undefined });
            } catch (err) {
                r = { fn: null, error: 'That expression could not be read.' };
            }
            return { key, fn: r.error ? null : r.fn, error: r.error || null };
        });
    }

    function compileSoon() {
        clearTimeout(compileTimer);
        compileTimer = setTimeout(() => {
            needCompile = true;
            schedule();
        }, 180);
    }

    /** y at x for series i (NaN when undefined; never throws). */
    function valueAt(i, x) {
        const c = compiled[i];
        if (!c || !c.fn) return NaN;
        try {
            const y = c.fn(x);
            return typeof y === 'number' ? y : NaN;
        } catch (_err) {
            return NaN;
        }
    }

    /* ── View math ─────────────────────────────────────────── */

    function defaultView(w = size.w, h = size.h) {
        const ratio = w > 0 && h > 0 ? h / w : 0.75;
        const half = 10 * ratio;
        return { xMin: -10, xMax: 10, yMin: -half, yMax: half };
    }

    function ensureView() {
        if (!model.view) model.view = defaultView();
        return model.view;
    }

    const toPx = (v, x) => ((x - v.xMin) / (v.xMax - v.xMin)) * size.w;
    const toPy = (v, y) => size.h - ((y - v.yMin) / (v.yMax - v.yMin)) * size.h;
    const fromPx = (v, px) => v.xMin + (px / size.w) * (v.xMax - v.xMin);
    const fromPy = (v, py) => v.yMin + ((size.h - py) / size.h) * (v.yMax - v.yMin);

    /** Clamp a view to the zoom and coordinate limits, keeping its centre. */
    function limitView(v) {
        let { xMin, xMax, yMin, yMax } = v;
        const fix = (lo, hi) => {
            let c = clamp((lo + hi) / 2, -COORD_MAX, COORD_MAX);
            const minSpan = Math.max(SPAN_MIN, Math.abs(c) * 1e-8);
            const span = clamp(hi - lo, minSpan, SPAN_MAX);
            if (!isNum(c)) c = 0;
            return [c - span / 2, c + span / 2];
        };
        [xMin, xMax] = fix(xMin, xMax);
        [yMin, yMax] = fix(yMin, yMax);
        return { xMin, xMax, yMin, yMax };
    }

    function setViewTo(v, { save = true } = {}) {
        model.view = limitView(v);
        if (save) persistSoon();
        schedule();
        announceSoon();
    }

    /** Zoom by factor f (below 1 zooms in) around the pixel (px, py). */
    function zoomAt(px, py, f) {
        const v = ensureView();
        const x0 = fromPx(v, px);
        const y0 = fromPy(v, py);
        setViewTo({
            xMin: x0 - (x0 - v.xMin) * f,
            xMax: x0 + (v.xMax - x0) * f,
            yMin: y0 - (y0 - v.yMin) * f,
            yMax: y0 + (v.yMax - y0) * f
        });
    }

    function zoomCentre(f) {
        const v = ensureView();
        const px = trace && trace.x >= v.xMin && trace.x <= v.xMax ? toPx(v, trace.x) : size.w / 2;
        zoomAt(px, size.h / 2, f);
    }

    function panBy(dxPx, dyPx) {
        const v = ensureView();
        const kx = (v.xMax - v.xMin) / size.w;
        const ky = (v.yMax - v.yMin) / size.h;
        setViewTo({ xMin: v.xMin - dxPx * kx, xMax: v.xMax - dxPx * kx, yMin: v.yMin + dyPx * ky, yMax: v.yMax + dyPx * ky });
    }

    /** A 1-2-5 step near span / target. */
    function niceStep(span, target) {
        const raw = span / Math.max(1, target);
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        const m = raw / p;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    }

    /** Round x to the precision of a step and drop float noise. */
    function snap(x, step) {
        const r = Math.round(x / step) * step;
        return Number(r.toPrecision(12));
    }

    function tickLabel(v, step) {
        if (Math.abs(v) < step * 1e-6) return '0';
        let s;
        if (Math.abs(v) >= 1e6 || step < 1e-4) {
            s = v.toExponential(Math.max(0, Math.min(6, Math.round(Math.log10(Math.abs(v) / step)))));
            s = s.replace(/\.?0+e/, 'e').replace('e+', 'e');
        } else {
            const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
            s = v.toFixed(decimals);
        }
        return s.replace(/^-/, '−');
    }

    /* ── Colours from the theme ───────────────────────────── */

    function readColors() {
        const target = els.canvas || document.documentElement;
        const cs = getComputedStyle(target);
        const fallback = cs.color;
        const get = (name) => (cs.getPropertyValue(name) || '').trim() || fallback;
        colors = {
            bg: get('--bg-input'),
            minor: get('--border-muted'),
            major: get('--border-default'),
            axis: get('--fg-subtle'),
            label: get('--fg-muted'),
            text: get('--fg-default'),
            focus: get('--border-focus'),
            font: get('--font-mono') || 'monospace',
            series: SERIES_TOKENS.map(get)
        };
        return colors;
    }

    /* ── Painting ──────────────────────────────────────────── */

    function paintGrid(ctx, w, h, v, c) {
        const xs = v.xMax - v.xMin;
        const ys = v.yMax - v.yMin;
        const stepX = niceStep(xs, w / 80);
        const stepY = niceStep(ys, h / 64);
        const minorX = stepX / (Math.round(stepX / Math.pow(10, Math.floor(Math.log10(stepX)))) === 2 ? 4 : 5);
        const minorY = stepY / (Math.round(stepY / Math.pow(10, Math.floor(Math.log10(stepY)))) === 2 ? 4 : 5);
        const crisp = (p) => Math.round(p) + 0.5;
        const px = (x) => ((x - v.xMin) / xs) * w;
        const py = (y) => h - ((y - v.yMin) / ys) * h;

        const lines = (step, from, to, cap, each) => {
            const k0 = Math.ceil(from / step);
            const k1 = Math.floor(to / step);
            for (let n = 0, k = k0; k <= k1 && n < cap; n++, k++) each(k * step, k);
        };

        ctx.lineWidth = 1;
        ctx.strokeStyle = c.minor;
        ctx.beginPath();
        if (w / (xs / minorX) >= 6) lines(minorX, v.xMin, v.xMax, 600, (x) => { ctx.moveTo(crisp(px(x)), 0); ctx.lineTo(crisp(px(x)), h); });
        if (h / (ys / minorY) >= 6) lines(minorY, v.yMin, v.yMax, 600, (y) => { ctx.moveTo(0, crisp(py(y))); ctx.lineTo(w, crisp(py(y))); });
        ctx.stroke();

        ctx.strokeStyle = c.major;
        ctx.beginPath();
        lines(stepX, v.xMin, v.xMax, 300, (x) => { ctx.moveTo(crisp(px(x)), 0); ctx.lineTo(crisp(px(x)), h); });
        lines(stepY, v.yMin, v.yMax, 300, (y) => { ctx.moveTo(0, crisp(py(y))); ctx.lineTo(w, crisp(py(y))); });
        ctx.stroke();

        // Axes, when on view.
        const ax = px(0);
        const ay = py(0);
        ctx.strokeStyle = c.axis;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        if (ay >= 0 && ay <= h) { ctx.moveTo(0, crisp(ay)); ctx.lineTo(w, crisp(ay)); }
        if (ax >= 0 && ax <= w) { ctx.moveTo(crisp(ax), 0); ctx.lineTo(crisp(ax), h); }
        ctx.stroke();

        // Tick labels: along the axes, or pinned to the edge when an axis is off view.
        ctx.font = `11px ${c.font}`;
        ctx.fillStyle = c.label;
        const labelY = clamp(ay + 4, 4, h - 15);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        lines(stepX, v.xMin, v.xMax, 300, (x) => {
            if (Math.abs(x) < stepX * 1e-6) return;
            const p = px(x);
            if (p < 14 || p > w - 14) return;
            ctx.fillText(tickLabel(x, stepX), p, labelY);
        });
        const leftSide = ax + 5;
        const pinnedRight = ax > w - 40;
        ctx.textAlign = pinnedRight ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        const labelX = pinnedRight ? w - 4 : clamp(leftSide, 4, w - 40);
        lines(stepY, v.yMin, v.yMax, 300, (y) => {
            if (Math.abs(y) < stepY * 1e-6) return;
            const p = py(y);
            if (p < 10 || p > h - 10) return;
            ctx.fillText(tickLabel(y, stepY), labelX, p);
        });
        if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('0', ax + 4, ay + 4);
        }
    }

    /**
     * Sample series i across the width: one sample per CSS pixel (capped),
     * thinned when the curve is slow to work out. Returns { xs, ys, coarse, cut }.
     */
    function sample(i, w, v) {
        const n = Math.min(SAMPLE_CAP, Math.max(2, Math.round(w)));
        const xs = [];
        const ys = [];
        const t0 = performance.now();
        let stride = 1;
        let coarse = false;
        let cut = false;
        for (let k = 0; k <= n; k += stride) {
            const x = v.xMin + (k / n) * (v.xMax - v.xMin);
            xs.push(x);
            ys.push(valueAt(i, x));
            if ((xs.length & 7) === 0) {
                const spent = performance.now() - t0;
                if (spent > SERIES_BUDGET_MS * 2) {
                    cut = true;
                    break;
                }
                const projected = (spent / (k + 1)) * n;
                if (projected > SERIES_BUDGET_MS && stride < 64) {
                    stride *= 2;
                    coarse = true;
                }
            }
        }
        return { xs, ys, coarse, cut };
    }

    /** Does the curve break between two samples (a pole or a jump)? */
    function breaksBetween(i, x1, y1, x2, y2, h, v, budget) {
        const jump = Math.abs(toPy(v, y2) - toPy(v, y1));
        if (jump < h * 0.4) return false;
        let a = x1;
        let ya = y1;
        let b = x2;
        let yb = y2;
        for (let t = 0; t < 10; t++) {
            if (budget.left-- <= 0) return true;
            const m = (a + b) / 2;
            const ym = valueAt(i, m);
            if (!isNum(ym)) return true;
            if (Math.abs(ym - ya) > Math.abs(yb - ym)) {
                b = m;
                yb = ym;
            } else {
                a = m;
                ya = ym;
            }
        }
        return Math.abs(yb - ya) > Math.abs(y2 - y1) * 0.5;
    }

    function paintSeries(ctx, i, w, h, v, c, notes) {
        const data = sample(i, w, v);
        if (data.coarse) notes.coarse.push(i);
        if (data.cut) notes.cut.push(i);
        const budget = { left: BISECT_CAP };
        const lim = (p) => clamp(p, -4 * h, 5 * h);
        ctx.save();
        ctx.strokeStyle = c.series[i];
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(DASHES[i]);
        ctx.beginPath();
        let pen = false;
        let px0 = 0;
        let py0 = 0;
        for (let k = 0; k < data.xs.length; k++) {
            const x = data.xs[k];
            const y = data.ys[k];
            if (!isNum(y)) {
                pen = false;
                continue;
            }
            if (pen && breaksBetween(i, px0, py0, x, y, h, v, budget)) pen = false;
            const X = toPx(v, x);
            const Y = lim(toPy(v, y));
            if (pen) ctx.lineTo(X, Y);
            else ctx.moveTo(X, Y);
            pen = true;
            px0 = x;
            py0 = y;
        }
        ctx.stroke();
        ctx.restore();
    }

    function paintTrace(ctx, w, h, v, c) {
        if (!trace || trace.x < v.xMin || trace.x > v.xMax) return;
        const X = Math.round(toPx(v, trace.x)) + 0.5;
        ctx.save();
        ctx.strokeStyle = c.focus;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(X, 0);
        ctx.lineTo(X, h);
        ctx.stroke();
        ctx.setLineDash([]);
        model.series.forEach((s, i) => {
            if (!s.visible || !compiled[i] || !compiled[i].fn) return;
            const y = valueAt(i, trace.x);
            if (!isNum(y)) return;
            const Y = toPy(v, y);
            if (Y < -6 || Y > h + 6) return;
            ctx.beginPath();
            ctx.arc(X, Y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = c.series[i];
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = c.bg;
            ctx.stroke();
        });
        ctx.restore();
    }

    /** Paint the whole plot into ctx (already scaled to CSS pixels). */
    function paint(ctx, w, h, v, c, { withTrace = true } = {}) {
        const notes = { coarse: [], cut: [], drawn: 0 };
        ctx.save();
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, w, h);
        paintGrid(ctx, w, h, v, c);
        model.series.forEach((s, i) => {
            if (!s.visible || !compiled[i] || !compiled[i].fn) return;
            notes.drawn += 1;
            paintSeries(ctx, i, w, h, v, c, notes);
        });
        if (!model.series.some((s, i) => compiled[i] && compiled[i].fn)) {
            ctx.fillStyle = c.label;
            ctx.font = `12px ${c.font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Type an expression in x above, like sin(x)', w / 2, h / 2);
        }
        if (withTrace) paintTrace(ctx, w, h, v, c);
        ctx.restore();
        return notes;
    }

    /* ── Drawing the live canvas ───────────────────────────── */

    function fitCanvas() {
        if (!els.frame) return false;
        const rect = els.frame.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w < 2 || h < 2) return false;
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        if (w === size.w && h === size.h && dpr === size.dpr) return true;
        // Keep the units-per-pixel ratio of y to x when the box changes shape.
        if (model.view && size.w && size.h) {
            const v = model.view;
            const ratio = ((v.yMax - v.yMin) / size.h) / ((v.xMax - v.xMin) / size.w);
            const ky = ratio * ((v.xMax - v.xMin) / w);
            const cy = (v.yMin + v.yMax) / 2;
            model.view = limitView({ xMin: v.xMin, xMax: v.xMax, yMin: cy - (ky * h) / 2, yMax: cy + (ky * h) / 2 });
        }
        size = { w, h, dpr };
        els.canvas.width = Math.round(w * dpr);
        els.canvas.height = Math.round(h * dpr);
        return true;
    }

    function draw() {
        if (!els.canvas || !model) return;
        if (needCompile) {
            compileAll();
            renderRows();
        }
        if (!fitCanvas()) return;
        ensureView();
        if (!colors) readColors();
        const ctx = els.canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
        lastNotes = paint(ctx, size.w, size.h, model.view, colors);
        renderReadout();
        renderNotes();
        renderWindowFields();
        renderSummary();
    }

    /* ── Scheduling: draw once per frame, only while open ──── */

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
            draw();
        });
    }

    function watchOpen() {
        const s = section();
        if (!s || !window.MutationObserver) return;
        new MutationObserver(() => { if (stale && isOpen()) schedule(); })
            .observe(s, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    function watchSize() {
        if (window.ResizeObserver) new ResizeObserver(() => schedule()).observe(els.frame);
        else window.addEventListener('resize', schedule);
        const watchDpr = () => {
            if (!window.matchMedia) return;
            const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
            const onChange = () => {
                mq.removeEventListener('change', onChange);
                schedule();
                watchDpr();
            };
            mq.addEventListener('change', onChange);
        };
        watchDpr();
    }

    /* ── Build ─────────────────────────────────────────────── */

    function toolButton(label, title, shapes) {
        const b = DOM.create('button', { className: 'icon-action gr-tool', attrs: { type: 'button', 'aria-label': label, title } });
        b.appendChild(icon(shapes, 16));
        return b;
    }

    function windowField(key, label) {
        const id = `gr-win-${key}`;
        const input = DOM.create('input', {
            id,
            className: 'text-input mono ta-input',
            attrs: { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', maxlength: '40', 'data-win': key, 'aria-describedby': 'gr-win-error' }
        });
        els[`win_${key}`] = input;
        return DOM.create('div', {
            className: 'ta-field',
            children: [DOM.create('label', { className: 'mini-label', text: label, attrs: { for: id } }), input]
        });
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'ta-pane gr' });

        if (!engineReady()) {
            root.appendChild(DOM.create('div', {
                className: 'empty-state',
                children: [
                    DOM.create('p', { className: 'empty-title', text: 'Graphs are unavailable' }),
                    DOM.create('p', { className: 'empty-text', text: 'The math engine did not load, so there is nothing to draw with. Reload the page to try again.' })
                ]
            }));
            mount.appendChild(root);
            els.root = root;
            return false;
        }

        els.list = DOM.create('ol', { className: 'gr-series', attrs: { 'aria-label': 'Expressions to graph' } });
        root.appendChild(els.list);

        els.add = DOM.create('button', { className: 'btn btn-secondary btn-sm', attrs: { type: 'button' } });
        els.add.appendChild(icon(ICONS.add, 14));
        els.add.appendChild(DOM.create('span', { text: 'Add graph' }));
        els.chips = DOM.create('div', { className: 'chip-row gr-chips', attrs: { role: 'group', 'aria-label': 'Functions on this sheet' } });
        root.appendChild(DOM.create('div', { className: 'ta-actions gr-add-row', children: [els.add] }));
        root.appendChild(els.chips);

        // The plot
        els.canvas = DOM.create('canvas', {
            className: 'gr-canvas',
            attrs: {
                tabindex: '0',
                role: 'application',
                'aria-roledescription': 'graph',
                'aria-describedby': 'gr-summary gr-keys'
            }
        });
        els.frame = DOM.create('div', { className: 'gr-frame', children: [els.canvas] });
        root.appendChild(els.frame);

        els.zoomIn = toolButton('Zoom in', 'Zoom in (+)', ICONS.zoomIn);
        els.zoomOut = toolButton('Zoom out', 'Zoom out (−)', ICONS.zoomOut);
        els.reset = toolButton('Reset the view', 'Reset view: x from −10 to 10 (0)', ICONS.reset);
        els.windowBtn = toolButton('Set the window', 'Type exact x and y ranges', ICONS.window);
        els.windowBtn.setAttribute('aria-expanded', 'false');
        els.windowBtn.setAttribute('aria-controls', 'gr-window');
        els.png = toolButton('Download the graph as a PNG image', 'Download PNG', ICONS.download);
        els.summary = DOM.create('p', { id: 'gr-summary', className: 'gr-summary', attrs: { 'aria-live': 'polite' } });
        root.appendChild(DOM.create('div', {
            className: 'gr-toolbar',
            children: [els.summary, DOM.create('div', { className: 'gr-tools', children: [els.zoomIn, els.zoomOut, els.reset, els.windowBtn, els.png] })]
        }));

        // Window form
        els.winError = DOM.create('p', { id: 'gr-win-error', className: 'error-text ta-error', attrs: { role: 'alert' } });
        els.winApply = DOM.create('button', { className: 'btn btn-secondary btn-sm', text: 'Apply', attrs: { type: 'submit' } });
        els.window = DOM.create('form', {
            id: 'gr-window',
            className: 'gr-window',
            attrs: { 'aria-label': 'Graph window', novalidate: 'novalidate' },
            children: [
                DOM.create('div', {
                    className: 'gr-window-grid',
                    children: [windowField('xMin', 'x from'), windowField('xMax', 'x to'), windowField('yMin', 'y from'), windowField('yMax', 'y to')]
                }),
                els.winError,
                DOM.create('div', { className: 'ta-actions', children: [els.winApply] })
            ]
        });
        root.appendChild(els.window);

        // Trace readout
        els.readout = DOM.create('div', { className: 'readout-list gr-readout', attrs: { 'aria-label': 'Traced values' } });
        els.sendTrace = DOM.create('button', { className: 'btn btn-primary btn-sm', attrs: { type: 'button' } });
        els.sendTrace.appendChild(icon(ICONS.send, 14));
        els.sendTrace.appendChild(DOM.create('span', { text: 'Send values to sheet' }));
        els.clearTrace = DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Clear trace', attrs: { type: 'button' } });
        els.traceActions = DOM.create('div', { className: 'ta-actions', children: [els.sendTrace, els.clearTrace] });
        root.appendChild(els.readout);
        root.appendChild(els.traceActions);

        els.notes = DOM.create('p', { className: 'pane-hint gr-notes', attrs: { role: 'status' } });
        root.appendChild(els.notes);
        root.appendChild(DOM.create('p', {
            id: 'gr-keys',
            className: 'pane-hint',
            text: 'Drag to pan, scroll or pinch to zoom. With the graph focused: ←/→ trace, Shift + arrows pan, + and − zoom, 0 resets, Esc clears the trace.'
        }));

        mount.appendChild(root);
        els.root = root;
        return true;
    }

    /* ── Series rows ───────────────────────────────────────── */

    function buildRow(i) {
        const n = i + 1;
        const swatch = DOM.create('button', {
            className: 'gr-swatch',
            attrs: { type: 'button', 'data-series': String(n), 'data-act': 'toggle', 'data-index': String(i) }
        });
        swatch.appendChild(DOM.create('span', { className: 'gr-swatch-num', text: String(n), attrs: { 'aria-hidden': 'true' } }));
        swatch.appendChild(dashSample(i));
        const input = DOM.create('input', {
            id: `gr-expr-${n}`,
            className: 'text-input mono ta-input gr-input',
            attrs: {
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
                maxlength: String(MAX_EXPR),
                placeholder: PLACEHOLDERS[i],
                'data-index': String(i),
                'aria-label': `Graph ${n} expression in x`,
                'aria-describedby': `gr-err-${n}`
            }
        });
        const remove = DOM.create('button', {
            className: 'icon-action icon-action--danger',
            attrs: { type: 'button', 'data-act': 'remove', 'data-index': String(i), 'aria-label': `Remove graph ${n}`, title: `Remove graph ${n}` }
        });
        remove.appendChild(icon(ICONS.remove, 14));
        const error = DOM.create('p', { id: `gr-err-${n}`, className: 'error-text ta-error gr-error' });
        const li = DOM.create('li', {
            className: 'gr-row',
            attrs: { 'data-series': String(n) },
            children: [
                DOM.create('div', {
                    className: 'gr-row-main',
                    children: [swatch, DOM.create('span', { className: 'gr-y', text: 'y =', attrs: { 'aria-hidden': 'true' } }), input, remove]
                }),
                error
            ]
        });
        return { li, swatch, input, remove, error };
    }

    function renderRows() {
        if (!els.list) return;
        while (els.rows.length > model.series.length) els.rows.pop().li.remove();
        while (els.rows.length < model.series.length) {
            const row = buildRow(els.rows.length);
            els.rows.push(row);
            els.list.appendChild(row.li);
        }
        model.series.forEach((s, i) => {
            const row = els.rows[i];
            const n = i + 1;
            if (document.activeElement !== row.input && row.input.value !== s.expr) row.input.value = s.expr;
            row.swatch.setAttribute('aria-pressed', String(s.visible));
            row.swatch.setAttribute('aria-label', `${s.visible ? 'Hide' : 'Show'} graph ${n} (${DASH_WORDS[i]})`);
            row.swatch.title = `${s.visible ? 'Showing' : 'Hidden'}: graph ${n}, ${DASH_WORDS[i]} — click to ${s.visible ? 'hide' : 'show'} it`;
            row.li.dataset.hidden = String(!s.visible);
            const c = compiled[i];
            const err = c && c.error ? c.error : '';
            if (row.error.textContent !== err) row.error.textContent = err;
            if (err) row.input.setAttribute('aria-invalid', 'true');
            else row.input.removeAttribute('aria-invalid');
            row.remove.disabled = model.series.length === 1 && !s.expr;
        });
        els.add.disabled = model.series.length >= MAX_SERIES;
        els.add.title = els.add.disabled ? `Up to ${MAX_SERIES} graphs at once` : 'Add another expression to graph';
        renderChips();
        renderLabel();
    }

    /** Quick-add chips for the sheet's one-input functions. */
    function renderChips() {
        if (!els.chips) return;
        const fns = readSheet().functions.filter((f) => Array.isArray(f.params) && f.params.length === 1).slice(0, 12);
        const sig = fns.map((f) => f.name).join('|');
        if (els.chips.dataset.sig === sig) return;
        els.chips.dataset.sig = sig;
        els.chips.textContent = '';
        if (!fns.length) {
            els.chips.hidden = true;
            return;
        }
        els.chips.hidden = false;
        els.chips.appendChild(DOM.create('span', { className: 'mini-label gr-chips-label', text: 'From this sheet' }));
        fns.forEach((f) => {
            els.chips.appendChild(DOM.create('button', {
                className: 'chip-btn',
                text: `${f.name}(x)`,
                attrs: { type: 'button', 'data-fn': f.name, title: `Graph ${f.name}(x), defined on this sheet` }
            }));
        });
    }

    function renderLabel() {
        const shown = model.series.filter((s, i) => s.visible && s.expr.trim() && compiled[i] && compiled[i].fn).map((s) => s.expr.trim());
        const what = shown.length ? `Graph of ${shown.slice(0, 4).join('; ')}` : 'Empty graph';
        els.canvas.setAttribute('aria-label', `${what}. Arrow keys trace, Shift and arrows pan, plus and minus zoom, 0 resets the view.`);
    }

    /* ── Readout, notes, summary ───────────────────────────── */

    function traceValues(x) {
        return model.series.map((s, i) => {
            const c = compiled[i];
            if (!s.visible || !c || !c.fn) return null;
            return { index: i, series: i + 1, expr: s.expr.trim(), y: valueAt(i, x) };
        }).filter(Boolean);
    }

    function describeY(y) {
        if (isNum(y)) return fmt(y);
        if (y === Infinity) return 'infinite';
        if (y === -Infinity) return 'minus infinite';
        return 'not defined here';
    }

    function renderReadout() {
        const box = els.readout;
        box.textContent = '';
        if (!trace) {
            box.appendChild(DOM.create('p', {
                className: 'gr-readout-empty',
                text: 'Point at the graph, tap it, or focus it and press ← or → to read values.'
            }));
            els.traceActions.hidden = true;
            return;
        }
        const row = (label, value, series) => {
            const r = DOM.create('div', { className: 'readout', attrs: series ? { 'data-series': String(series) } : {} });
            const lab = DOM.create('span', { className: 'readout-label' });
            if (series) lab.appendChild(DOM.create('span', { className: 'gr-key-chip', text: String(series), attrs: { 'aria-hidden': 'true' } }));
            lab.appendChild(document.createTextNode(label));
            r.appendChild(lab);
            r.appendChild(DOM.create('code', { className: 'readout-value', text: value }));
            box.appendChild(r);
        };
        row('x', fmt(trace.x));
        const vals = traceValues(trace.x);
        vals.forEach((t) => row(` y${t.series}`, describeY(t.y), t.series));
        if (!vals.length) box.appendChild(DOM.create('p', { className: 'gr-readout-empty', text: 'No graph is showing.' }));
        els.traceActions.hidden = false;
        els.sendTrace.disabled = !vals.some((t) => isNum(t.y));
    }

    function renderNotes() {
        const parts = [];
        const deg = State.settings().angle === 'deg';
        if (deg && model.series.some((s, i) => s.visible && compiled[i] && compiled[i].fn && TRIG_RE.test(s.expr))) {
            parts.push('Angles are in degrees, so sin(x) repeats every 360. Switch DEG / RAD for radians.');
        }
        if (lastNotes.cut.length) {
            parts.push(`Graph ${lastNotes.cut.map((i) => i + 1).join(' and ')} took too long to work out, so only part of it is drawn.`);
        } else if (lastNotes.coarse.length) {
            parts.push(`Graph ${lastNotes.coarse.map((i) => i + 1).join(' and ')} is slow to work out, so it is drawn with fewer points.`);
        }
        const text = parts.join(' ');
        if (els.notes.textContent !== text) els.notes.textContent = text;
        els.notes.hidden = !text;
    }

    function rangeText(lo, hi) {
        return `${fmt(lo)} to ${fmt(hi)}`;
    }

    function summaryText() {
        const v = model.view;
        if (!v) return '';
        const drawn = model.series.filter((s, i) => s.visible && compiled[i] && compiled[i].fn).length;
        return `x ${rangeText(v.xMin, v.xMax)} · y ${rangeText(v.yMin, v.yMax)} · ${drawn} ${drawn === 1 ? 'graph' : 'graphs'}`;
    }

    function renderSummary() {
        const text = summaryText();
        if (els.summary.dataset.full !== text) {
            els.summary.dataset.full = text;
            els.summary.title = text;
        }
    }

    /** Update the live summary a moment after things settle (not on every drag frame). */
    function announceSoon() {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => {
            if (!model || !model.view) return;
            let text = summaryText();
            if (trace && trace.source === 'key') {
                const vals = traceValues(trace.x).map((t) => `y${t.series} ${describeY(t.y)}`);
                text = `x ${fmt(trace.x)}${vals.length ? `: ${vals.join(', ')}` : ''}. ${text}`;
            }
            if (els.summary.textContent !== text) els.summary.textContent = text;
        }, 350);
    }

    function renderWindowFields() {
        const v = model.view;
        els.windowBtn.setAttribute('aria-expanded', String(model.windowOpen));
        els.windowBtn.setAttribute('aria-pressed', String(model.windowOpen));
        els.window.hidden = !model.windowOpen;
        if (!v || !model.windowOpen) return;
        ['xMin', 'xMax', 'yMin', 'yMax'].forEach((k) => {
            const input = els[`win_${k}`];
            if (document.activeElement !== input && !els.window.contains(document.activeElement)) input.value = plain(v[k], 6);
        });
    }

    /* ── Actions ───────────────────────────────────────────── */

    function setExpression(i, text) {
        if (!model || !Number.isInteger(i) || i < 0 || i >= model.series.length) return false;
        model.series[i].expr = String(text).slice(0, MAX_EXPR);
        persistSoon();
        compileSoon();
        return true;
    }

    function addSeries(expr = '') {
        if (model.series.length >= MAX_SERIES) {
            notify(`Up to ${MAX_SERIES} graphs at once. Clear or remove one first.`, 'info', 2600);
            return -1;
        }
        model.series.push({ expr: String(expr).slice(0, MAX_EXPR), visible: true });
        needCompile = true;
        persist();
        renderRows();
        schedule();
        return model.series.length - 1;
    }

    async function removeSeries(i) {
        const s = model.series[i];
        if (!s) return false;
        if (s.expr.trim() && window.Dialogs && typeof Dialogs.confirm === 'function') {
            const ok = await Dialogs.confirm({
                title: `Remove graph ${i + 1}?`,
                message: `This removes “${s.expr.trim().slice(0, 80)}” from the graph. The worksheet is not changed.`,
                confirmLabel: 'Remove graph',
                cancelLabel: 'Keep it'
            });
            if (!ok) return false;
        }
        if (model.series.length === 1) model.series[0] = { expr: '', visible: true };
        else model.series.splice(i, 1);
        compiled.splice(i, 1);
        needCompile = true;
        persist();
        renderRows();
        schedule();
        const next = els.rows[Math.min(i, els.rows.length - 1)];
        if (next) next.input.focus();
        return true;
    }

    function toggleSeries(i) {
        const s = model.series[i];
        if (!s) return;
        s.visible = !s.visible;
        persist();
        renderRows();
        schedule();
        announceSoon();
    }

    function addSheetFunction(name) {
        const expr = `${name}(x)`;
        const empty = model.series.findIndex((s) => !s.expr.trim());
        let i = empty;
        if (i === -1) i = addSeries(expr);
        else {
            model.series[i].expr = expr;
            model.series[i].visible = true;
            needCompile = true;
            persist();
            renderRows();
            schedule();
        }
        if (i >= 0) {
            notify(`Graph ${i + 1}: ${expr}`, 'success', 1400);
            if (els.rows[i]) els.rows[i].input.value = expr;
        }
    }

    function resetView() {
        model.view = null;
        trace = null;
        persist();
        schedule();
        announceSoon();
    }

    function setView(v) {
        const ok = validView(v);
        if (!ok) return false;
        setViewTo(ok);
        return true;
    }

    function setTrace(x, source) {
        if (!isNum(x)) {
            trace = null;
        } else {
            trace = { x, source };
        }
        schedule();
        if (source === 'key') announceSoon();
    }

    /** Move the keyboard trace one step (or `steps`) and keep it in view. */
    function stepTrace(dir) {
        const v = ensureView();
        const span = v.xMax - v.xMin;
        const step = niceStep(span, 80);
        let x = trace ? trace.x : snap((v.xMin + v.xMax) / 2, step);
        if (trace) x = snap(x + dir * step, step);
        if (x < v.xMin || x > v.xMax) {
            const shift = x < v.xMin ? x - v.xMin - span * 0.1 : x - v.xMax + span * 0.1;
            setViewTo({ xMin: v.xMin + shift, xMax: v.xMax + shift, yMin: v.yMin, yMax: v.yMax });
        }
        setTrace(x, 'key');
    }

    function traceLabel(t, xText) {
        const expr = t.expr.replace(/\s+/g, ' ');
        const safe = expr.length <= 60 && /^[\p{L}\p{N}][\p{L}\p{N} _'’()\-.,/+]*$/u.test(expr) && /\p{L}/u.test(expr);
        return `${safe ? expr : `Graph ${t.series}`} at x ${xText}`;
    }

    /** Append the traced values as labelled worksheet lines. */
    function sendTrace() {
        if (!trace) {
            notify('Trace a point on the graph first.', 'info', 2200);
            return [];
        }
        const xText = plain(trace.x, 12);
        const lines = traceValues(trace.x).filter((t) => isNum(t.y)).map((t) => `${traceLabel(t, xText)}: ${plain(t.y, 15)}`);
        if (!lines.length) {
            notify('No graph has a value at this x.', 'info', 2200);
            return [];
        }
        const text = State.activeSheet().text;
        const count = text ? text.split('\n').length : 0;
        if (count + lines.length > MAX_LINES) {
            notify(`This sheet is nearly at ${MAX_LINES.toLocaleString('en-US')} lines, the most mathMan works out. Start a new sheet to add more.`, 'warning', 4000);
            return [];
        }
        lines.forEach(appendToSheet);
        notify(lines.length === 1 ? `Added to “${State.activeSheet().name}”: ${lines[0]}` : `Added ${lines.length} lines to “${State.activeSheet().name}”`, 'success', 2400);
        if (window.ToolApp) ToolApp.flash(els.sendTrace);
        return lines;
    }

    function appendToSheet(line) {
        const ws = window.WorksheetUI;
        if (ws && typeof ws.appendLine === 'function') {
            try {
                ws.appendLine(line);
                return true;
            } catch (err) {
                console.error('[GraphUI] WorksheetUI.appendLine failed:', err);
            }
        }
        const sheet = State.activeSheet();
        const body = sheet.text.replace(/\n+$/, '');
        return State.setSheetText(sheet.id, body ? `${body}\n${line}` : line);
    }

    function downloadPng() {
        if (!size.w || !size.h || !model.view) {
            notify('Open the graph first so it has a size to save.', 'info', 2400);
            return false;
        }
        const scale = 2;
        const shown = model.series.map((s, i) => ({ s, i })).filter(({ s, i }) => s.visible && compiled[i] && compiled[i].fn);
        const legendH = shown.length ? 12 + shown.length * 20 : 0;
        const out = document.createElement('canvas');
        out.width = Math.round(size.w * scale);
        out.height = Math.round((size.h + legendH) * scale);
        const ctx = out.getContext('2d');
        if (!ctx) {
            notify('This browser could not make the image.', 'error', 3000);
            return false;
        }
        const c = colors || readColors();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, size.w, size.h + legendH);
        paint(ctx, size.w, size.h, model.view, c, { withTrace: false });
        // Legend: line style, number, and expression for each curve.
        ctx.font = `12px ${c.font}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        shown.forEach(({ s, i }, row) => {
            const y = size.h + 16 + row * 20;
            ctx.save();
            ctx.strokeStyle = c.series[i];
            ctx.lineWidth = 2;
            ctx.setLineDash(DASHES[i]);
            ctx.beginPath();
            ctx.moveTo(10, y);
            ctx.lineTo(40, y);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = c.text;
            const label = `${i + 1}  y = ${s.expr.trim()}`;
            ctx.fillText(label.length > 90 ? `${label.slice(0, 89)}…` : label, 48, y);
        });
        const save = (blob) => {
            if (!blob) {
                notify('This browser could not make the image.', 'error', 3000);
                return;
            }
            if (window.ToolApp && ToolApp.download('mathman-graph.png', blob, 'image/png')) {
                notify('Saved mathman-graph.png', 'success', 1600);
            }
        };
        if (typeof out.toBlob === 'function') out.toBlob(save, 'image/png');
        else save(null);
        return true;
    }

    function applyWindow() {
        const read = (k) => {
            const raw = els[`win_${k}`].value.trim().replace(/[\s,_]/g, '').replace(/−/g, '-');
            return raw === '' ? NaN : Number(raw);
        };
        const v = { xMin: read('xMin'), xMax: read('xMax'), yMin: read('yMin'), yMax: read('yMax') };
        let error = '';
        const bad = Object.keys(v).filter((k) => !isNum(v[k]));
        if (bad.length) error = 'Type a number in each box, like -10 or 2.5.';
        else if (!(v.xMin < v.xMax)) error = '“x from” must be smaller than “x to”.';
        else if (!(v.yMin < v.yMax)) error = '“y from” must be smaller than “y to”.';
        else if ([v.xMin, v.xMax, v.yMin, v.yMax].some((n) => Math.abs(n) > COORD_MAX)) error = `Keep every value between −${fmt(COORD_MAX)} and ${fmt(COORD_MAX)}.`;
        else if (v.xMax - v.xMin < SPAN_MIN || v.yMax - v.yMin < SPAN_MIN) error = 'That window is too narrow to draw. Widen the range.';
        els.winError.textContent = error;
        ['xMin', 'xMax', 'yMin', 'yMax'].forEach((k) => {
            if (error && (!isNum(v[k]) || /x/.test(k) === /x from|x to/.test(error))) els[`win_${k}`].setAttribute('aria-invalid', 'true');
            else els[`win_${k}`].removeAttribute('aria-invalid');
        });
        if (error) return false;
        setViewTo(v);
        notify('Window set', 'success', 1200);
        return true;
    }

    /* ── Pointer and keyboard on the canvas ────────────────── */

    function localPoint(e) {
        const rect = els.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function pointerTrace(p) {
        const v = ensureView();
        const step = niceStep(v.xMax - v.xMin, size.w);
        setTrace(snap(fromPx(v, p.x), step), 'pointer');
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        els.canvas.focus({ preventScroll: true });
        try { els.canvas.setPointerCapture(e.pointerId); } catch (_err) { /* not capturable */ }
        const p = localPoint(e);
        pointers.set(e.pointerId, p);
        if (pointers.size === 1) {
            gesture = { type: 'pan', last: p, moved: 0, start: p };
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
        }
        e.preventDefault();
    }

    function onPointerMove(e) {
        const p = localPoint(e);
        if (!pointers.has(e.pointerId)) {
            if (e.pointerType !== 'touch' && !gesture) pointerTrace(p);
            return;
        }
        pointers.set(e.pointerId, p);
        if (gesture && gesture.type === 'pan' && pointers.size === 1) {
            const dx = p.x - gesture.last.x;
            const dy = p.y - gesture.last.y;
            gesture.moved += Math.abs(dx) + Math.abs(dy);
            gesture.last = p;
            if (gesture.moved > 3) {
                els.canvas.dataset.dragging = 'true';
                panBy(dx, dy);
            }
        } else if (gesture && gesture.type === 'pinch' && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const f = gesture.dist / dist;
            gesture.dist = dist;
            if (isNum(f) && f > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, f);
        }
    }

    function onPointerUp(e) {
        if (!pointers.has(e.pointerId)) return;
        const p = localPoint(e);
        pointers.delete(e.pointerId);
        if (gesture && gesture.type === 'pan' && gesture.moved <= 3 && e.type === 'pointerup') pointerTrace(p);
        if (pointers.size === 1) {
            const [only] = [...pointers.values()];
            gesture = { type: 'pan', last: only, moved: 10, start: only };
        } else if (!pointers.size) {
            gesture = null;
            delete els.canvas.dataset.dragging;
            announceSoon();
        }
    }

    function onWheel(e) {
        e.preventDefault();
        const p = localPoint(e);
        const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0015;
        const f = Math.exp(clamp(e.deltaY * unit, -1, 1));
        zoomAt(p.x, p.y, f);
    }

    function onCanvasKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const v = ensureView();
        const k = e.key;
        let handled = true;
        if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.shiftKey) stepTrace(k === 'ArrowLeft' ? -1 : 1);
        else if (k === 'ArrowLeft' || k === 'ArrowRight') panBy((k === 'ArrowLeft' ? 1 : -1) * size.w * 0.1, 0);
        else if (k === 'ArrowUp' || k === 'ArrowDown') panBy(0, (k === 'ArrowUp' ? 1 : -1) * size.h * 0.1);
        else if (k === '+' || k === '=') zoomCentre(1 / ZOOM_STEP);
        else if (k === '-' || k === '_') zoomCentre(ZOOM_STEP);
        else if (k === '0') resetView();
        else if (k === 'Home') setTrace(v.xMin <= 0 && v.xMax >= 0 ? 0 : snap((v.xMin + v.xMax) / 2, niceStep(v.xMax - v.xMin, 80)), 'key');
        else if (k === 'Escape' && trace) setTrace(NaN, 'key');
        else handled = false;
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function onSeriesInput(e) {
        const input = e.target.closest('.gr-input');
        if (!input) return;
        setExpression(Number(input.dataset.index), input.value);
    }

    function onSeriesClick(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const i = Number(btn.dataset.index);
        if (btn.dataset.act === 'toggle') toggleSeries(i);
        else if (btn.dataset.act === 'remove') removeSeries(i);
    }

    function bind() {
        DOM.on(els.list, 'input', onSeriesInput);
        DOM.on(els.list, 'click', onSeriesClick);
        DOM.on(els.list, 'keydown', (e) => {
            const input = e.target.closest('.gr-input');
            if (input && e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(compileTimer);
                needCompile = true;
                schedule();
            }
        });
        DOM.on(els.add, 'click', () => {
            const i = addSeries('');
            if (i >= 0 && els.rows[i]) els.rows[i].input.focus();
        });
        DOM.on(els.chips, 'click', (e) => {
            const chip = e.target.closest('[data-fn]');
            if (chip) addSheetFunction(chip.dataset.fn);
        });

        els.canvas.addEventListener('pointerdown', onPointerDown);
        els.canvas.addEventListener('pointermove', onPointerMove);
        els.canvas.addEventListener('pointerup', onPointerUp);
        els.canvas.addEventListener('pointercancel', onPointerUp);
        els.canvas.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse' && !pointers.size && trace && trace.source === 'pointer') setTrace(NaN, 'pointer');
        });
        els.canvas.addEventListener('wheel', onWheel, { passive: false });
        els.canvas.addEventListener('keydown', onCanvasKey);
        els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        DOM.on(els.zoomIn, 'click', () => zoomCentre(1 / ZOOM_STEP));
        DOM.on(els.zoomOut, 'click', () => zoomCentre(ZOOM_STEP));
        DOM.on(els.reset, 'click', resetView);
        DOM.on(els.png, 'click', downloadPng);
        DOM.on(els.windowBtn, 'click', () => {
            model.windowOpen = !model.windowOpen;
            els.winError.textContent = '';
            persist();
            schedule();
            if (model.windowOpen) {
                renderWindowFields();
                requestAnimationFrame(() => els.win_xMin.focus());
            }
        });
        DOM.on(els.window, 'submit', (e) => {
            e.preventDefault();
            applyWindow();
        });
        DOM.on(els.sendTrace, 'click', sendTrace);
        DOM.on(els.clearTrace, 'click', () => setTrace(NaN, 'pointer'));

        document.addEventListener('toolman:theme', () => {
            readColors();
            schedule();
        });

        State.on('results', () => {
            const sig = readSheet().sig;
            if (sig !== sheetSig) {
                needCompile = true;
                schedule();
            } else {
                renderChips();
            }
        });
        State.on('active', () => {
            needCompile = true;
            schedule();
        });
        State.on('settings', (p) => {
            if (!p || !Array.isArray(p.changed) || p.changed.includes('angle')) needCompile = true;
            schedule();
        });
        const reload = () => {
            model = loadModel();
            compiled = [];
            trace = null;
            needCompile = true;
            renderRows();
            schedule();
        };
        State.on('reset', reload);
        State.on('panes', (p) => {
            if (p && (p.action === 'reset' || p.action === 'import')) reload();
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    const GraphUI = {
        init() {
            const mount = DOM.id('mount-graph');
            if (!mount || els.root) return;
            els.mount = mount;
            if (!build(mount)) return;
            model = loadModel();
            compileAll();
            renderRows();
            bind();
            watchSize();
            watchOpen();
            schedule();
        },
        setExpression(i, text) {
            const ok = setExpression(i, text);
            if (ok && els.rows[i]) els.rows[i].input.value = model.series[i].expr;
            return ok;
        },
        addSeries,
        setView,
        resetView,
        view() {
            return model && model.view ? { ...model.view } : null;
        },
        /** Trace at x and return each shown graph's value there. */
        traceAt(x) {
            if (!model || !isNum(x)) return [];
            if (needCompile) compileAll();
            setTrace(x, 'key');
            return traceValues(x).map((t) => ({ series: t.series, y: t.y }));
        },
        sendTrace,
        downloadPng,
        redraw: schedule
    };

    window.GraphUI = GraphUI;
})();
