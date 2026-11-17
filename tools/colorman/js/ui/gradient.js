/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: GradientUI (colorMan Edition - v1.0)
 *     - File Name: gradient.js
 *     - Relative Path: tools/colorman/js/ui/gradient.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Gradient pane in the Tools rail: a live preview and an editor for
 *     linear, radial, and conic CSS gradients, with editable color stops and
 *     a choice of interpolation space. It writes CSS you can paste straight
 *     into a stylesheet (a modern line plus an sRGB fallback) and saves
 *     linear and radial gradients as SVG files.
 *
 * ✒ Key Features:
 *     - 80px preview strip over a checkerboard so translucent stops show
 *     - Type chips (Linear, Radial, Conic) with arrow-key selection
 *     - Angle slider and number field (0–360°) for linear and conic, hidden
 *       for radial; Circle / Ellipse shape chips for radial only
 *     - Interpolation select: sRGB, OKLab, OKLCH, HSL
 *     - Stop rows: swatch (click sets the stop to the current color), color
 *       field (any CSS color, previews while typing, Enter keeps, Escape
 *       reverts), position 0–100%, and remove (never below two stops)
 *     - Stops stay sorted by position; focus follows a stop that moves
 *     - Add current color (into the widest gap), Distribute evenly,
 *       Reverse, and From working palette (up to 16 stops)
 *     - Undo strip after replacing, spacing out, or removing stops
 *     - Output block: an sRGB fallback line with extra stops that imitate
 *       the chosen space, then the modern "in <space>" line
 *     - Copy CSS, and Download SVG for linear and radial gradients (conic
 *       explains why it cannot)
 *     - Saved in State.gradient; reset and backup import redraw the pane
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js, before
 *     js/app.js. app.js calls GradientUI.init() once; the module renders
 *     into #mount-gradient and listens for State 'gradient', 'active',
 *     'settings', and 'reset' events.
 *
 * ✒ Examples:
 *     GradientUI.init()            → builds the pane inside #mount-gradient
 *     GradientUI.css()             → { modern, fallback } CSS gradient values
 *     GradientUI.cssText()         → the two "background: …;" lines
 *     GradientUI.svg()             → SVG markup, or '' for a conic gradient
 *     GradientUI.addCurrent()      → true when a stop was added
 *     GradientUI.fromWorking()     → true when the stops were replaced
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State.gradient, State.updateGradient),
 *       js/ui/swatch.js (SwatchUI), js/color.js (Color.mix, Color.deltaEOK
 *       for fallback stops), shared/js/dom.js, toolapp.js, toolman.js;
 *       css/tools-b.css
 *     - Compatible platforms: all evergreen browsers; browsers without CSS
 *       color-space interpolation use the sRGB fallback line
 *     - Limitations: at most 16 stops (State limit); SVG gradients always
 *       blend in sRGB, so the export bakes the chosen space in as extra
 *       stops; SVG has no conic gradient
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const MAX_STOPS = (window.State && State.LIMITS && State.LIMITS.stops) || 16;
    const UNDO_MS = 8000;
    const SVG_W = 1200;
    const SVG_H = 600;

    const TYPES = [
        { id: 'linear', label: 'Linear', title: 'Colors change along a straight line' },
        { id: 'radial', label: 'Radial', title: 'Colors spread out from the center' },
        { id: 'conic', label: 'Conic', title: 'Colors sweep around the center' }
    ];
    const SHAPES = [
        { id: 'circle', label: 'Circle', title: 'A round gradient' },
        { id: 'ellipse', label: 'Ellipse', title: 'A gradient stretched to the box' }
    ];
    const SPACES = [
        { id: 'srgb', label: 'sRGB' },
        { id: 'oklab', label: 'OKLab' },
        { id: 'oklch', label: 'OKLCH' },
        { id: 'hsl', label: 'HSL' }
    ];
    const EXTRA_SPACES = { 'srgb-linear': 'Linear sRGB', lab: 'Lab', lch: 'LCH' };

    const svgIcon = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        remove: svgIcon('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'),
        copy: svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        download: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>')
    };

    const els = {};
    const supportCache = new Map();
    let frame = 0;
    let stale = false;
    let undoTimer = 0;
    let undoSnapshot = null;
    let pendingFocus = null;    // { index, field } applied after the next stop render
    let draft = null;           // { index, hex?, pos? } previewed but not yet kept

    /* ── Small helpers ─────────────────────────────────────── */

    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const round1 = (n) => Math.round(n * 10) / 10;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function displayHex(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function fmtPos(n) {
        const r = round1(n);
        return Number.isInteger(r) ? String(r) : r.toFixed(1);
    }

    function spaceLabel(id) {
        const s = SPACES.find((x) => x.id === id);
        return s ? s.label : (EXTRA_SPACES[id] || id);
    }

    function typeLabel(id) {
        const t = TYPES.find((x) => x.id === id);
        return t ? t.label : id;
    }

    /** Parse any CSS color to '#RRGGBB(AA)' or null. */
    function readHex(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        return State.hexOf(raw);
    }

    /** Stops in position order (stable for equal positions). */
    function sorted(stops) {
        return stops.map((s, i) => ({ ...s, _i: i }))
            .sort((a, b) => (a.pos - b.pos) || (a._i - b._i))
            .map(({ hex, pos }) => ({ hex, pos }));
    }

    function sameStops(a, b) {
        return a.length === b.length && a.every((s, i) => s.hex === b[i].hex && s.pos === b[i].pos);
    }

    /** The gradient with any in-progress field edit applied (for live preview). */
    function viewGradient() {
        const g = State.gradient();
        if (draft && g.stops[draft.index]) {
            const s = g.stops[draft.index];
            if (draft.hex) s.hex = draft.hex;
            if (Number.isFinite(draft.pos)) s.pos = draft.pos;
        }
        return g;
    }

    /* ── CSS and SVG output ────────────────────────────────── */

    function hexOut(hex) {
        return displayHex(hex);
    }

    function leadFor(g, withSpace) {
        const space = withSpace ? `in ${g.space} ` : '';
        if (g.type === 'radial') return `${space}${g.shape}`;
        if (g.type === 'conic') return `${space}from ${g.angle}deg`;
        return `${space}${g.angle}deg`;
    }

    function stopText(stops) {
        return stops.map((s) => `${hexOut(s.hex)} ${fmtPos(s.pos)}%`).join(', ');
    }

    /**
     * sRGB stops that imitate the chosen space: between each pair of stops,
     * extra stops are mixed in that space (more where the colors differ more).
     */
    function bakedStops(g) {
        const stops = sorted(g.stops);
        const canMix = window.Color && typeof Color.mix === 'function';
        if (g.space === 'srgb' || !canMix) return stops;
        const out = [stops[0]];
        for (let i = 0; i < stops.length - 1; i++) {
            const a = stops[i];
            const b = stops[i + 1];
            const span = b.pos - a.pos;
            if (span > 0 && a.hex !== b.hex) {
                let parts = 4;
                try {
                    if (typeof Color.deltaEOK === 'function') parts = clamp(Math.ceil(Color.deltaEOK(a.hex, b.hex) / 6), 1, 8);
                } catch (_err) { parts = 4; }
                for (let k = 1; k < parts; k++) {
                    const t = k / parts;
                    let hex = null;
                    try { hex = State.hexOf(Color.mix(a.hex, b.hex, t, g.space)); } catch (_err) { hex = null; }
                    if (hex) out.push({ hex, pos: round1(a.pos + span * t) });
                }
            }
            out.push(b);
        }
        return out;
    }

    function css(g = State.gradient()) {
        const stops = sorted(g.stops);
        return {
            modern: `${g.type}-gradient(${leadFor(g, true)}, ${stopText(stops)})`,
            fallback: `${g.type}-gradient(${leadFor(g, false)}, ${stopText(bakedStops(g))})`
        };
    }

    function cssText(g = State.gradient()) {
        const out = css(g);
        return `background: ${out.fallback};\nbackground: ${out.modern};`;
    }

    function supports(value) {
        const key = value.replace(/#[0-9A-Fa-f]+/g, '#0').replace(/[\d.]+%/g, '0%');
        if (!supportCache.has(key)) {
            let ok = false;
            try { ok = Boolean(window.CSS && CSS.supports && CSS.supports('background-image', value)); } catch (_err) { ok = false; }
            supportCache.set(key, ok);
        }
        return supportCache.get(key);
    }

    function xmlEscape(text) {
        return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
    }

    const num = (n) => String(Math.round(n * 100) / 100);

    /** SVG markup for linear and radial gradients ('' for conic). */
    function svg(g = State.gradient()) {
        if (g.type === 'conic') return '';
        const stops = bakedStops(g).map((s) => {
            const hex = s.hex.toUpperCase();
            const rgb = hex.slice(0, 7);
            const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
            const opacity = alpha < 1 ? ` stop-opacity="${Math.round(alpha * 1000) / 1000}"` : '';
            return `      <stop offset="${fmtPos(s.pos)}%" stop-color="${rgb}"${opacity}/>`;
        }).join('\n');

        let def;
        if (g.type === 'linear') {
            const rad = (g.angle * Math.PI) / 180;
            const dx = Math.sin(rad);
            const dy = -Math.cos(rad);
            const len = Math.abs(SVG_W * Math.sin(rad)) + Math.abs(SVG_H * Math.cos(rad));
            const cx = SVG_W / 2;
            const cy = SVG_H / 2;
            def = `    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${num(cx - (dx * len) / 2)}" y1="${num(cy - (dy * len) / 2)}" x2="${num(cx + (dx * len) / 2)}" y2="${num(cy + (dy * len) / 2)}">\n${stops}\n    </linearGradient>`;
        } else if (g.shape === 'circle') {
            def = `    <radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${SVG_W / 2}" cy="${SVG_H / 2}" r="${num(Math.hypot(SVG_W / 2, SVG_H / 2))}">\n${stops}\n    </radialGradient>`;
        } else {
            def = `    <radialGradient id="g" cx="0.5" cy="0.5" r="0.7071">\n${stops}\n    </radialGradient>`;
        }
        const title = xmlEscape(`${typeLabel(g.type)} gradient, ${plural(g.stops.length, 'stop')}, blended in ${spaceLabel(g.space)} — colorMan`);
        return [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">`,
            `  <title>${title}</title>`,
            '  <defs>',
            def,
            '  </defs>',
            `  <rect width="${SVG_W}" height="${SVG_H}" fill="url(#g)"/>`,
            '</svg>',
            ''
        ].join('\n');
    }

    /* ── Scheduling ────────────────────────────────────────── */

    function section() {
        return els.mount ? els.mount.closest('.tool-section') : null;
    }

    function isOpen() {
        const s = section();
        return !s || s.dataset.collapsed !== 'true';
    }

    let wantStops = false;

    function schedule(opts = {}) {
        if (opts.stops) wantStops = true;
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!isOpen()) { stale = true; return; }
            stale = false;
            const stops = wantStops;
            wantStops = false;
            render({ stops });
        });
    }

    function watchOpen() {
        const s = section();
        if (!s || !window.MutationObserver) return;
        new MutationObserver(() => { if (stale && isOpen()) schedule({ stops: true }); })
            .observe(s, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    /* ── Build ─────────────────────────────────────────────── */

    /** A row of chip radios with roving focus and arrow keys. */
    function chipGroup(label, options, onPick) {
        const group = DOM.create('div', { className: 'chip-row tb-chips', attrs: { role: 'radiogroup', 'aria-label': label } });
        const chips = options.map((o) => DOM.create('button', {
            className: 'chip-btn',
            text: o.label,
            attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', title: o.title || o.label, tabindex: '-1' },
            data: { value: o.id }
        }));
        chips.forEach((c) => group.appendChild(c));
        group.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip-btn');
            if (chip) onPick(chip.dataset.value);
        });
        group.addEventListener('keydown', (e) => {
            const i = chips.findIndex((c) => c.getAttribute('aria-checked') === 'true');
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % chips.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + chips.length) % chips.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = chips.length - 1;
            if (next < 0) return;
            e.preventDefault();
            chips[next].focus();
            onPick(chips[next].dataset.value);
        });
        return {
            el: group,
            set(value) {
                chips.forEach((c) => {
                    const on = c.dataset.value === value;
                    c.setAttribute('aria-checked', String(on));
                    c.tabIndex = on ? 0 : -1;
                });
            }
        };
    }

    function labelled(text, control, id) {
        const wrap = DOM.create('div', { className: 'tb-field tb-field--inline' });
        wrap.appendChild(DOM.create(id ? 'label' : 'span', { className: 'mini-label', text, attrs: id ? { for: id } : {} }));
        wrap.appendChild(control);
        return wrap;
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'tb-pane gr' });

        // Preview
        els.fill = DOM.create('div', { className: 'gr-preview-fill' });
        els.preview = DOM.create('div', {
            className: 'gr-preview checker',
            attrs: { role: 'img' },
            children: [els.fill]
        });
        root.appendChild(els.preview);

        // Type
        els.type = chipGroup('Gradient type', TYPES, (v) => update({ type: v }));
        root.appendChild(labelled('Type', els.type.el));

        // Angle
        els.angleRange = DOM.create('input', {
            className: 'range-input',
            attrs: { type: 'range', min: '0', max: '360', step: '1', 'aria-label': 'Angle in degrees' }
        });
        els.angleNum = DOM.create('input', {
            id: 'gr-angle',
            className: 'text-input mono tb-num',
            attrs: { type: 'number', min: '0', max: '360', step: '1', inputmode: 'numeric' }
        });
        els.angleLabel = DOM.create('label', { className: 'mini-label', text: 'Angle', attrs: { for: 'gr-angle' } });
        els.angleRow = DOM.create('div', {
            className: 'tb-field',
            children: [
                els.angleLabel,
                DOM.create('div', {
                    className: 'gr-angle',
                    children: [els.angleRange, els.angleNum, DOM.create('span', { className: 'muted', text: '°', attrs: { 'aria-hidden': 'true' } })]
                })
            ]
        });
        root.appendChild(els.angleRow);

        // Shape
        els.shape = chipGroup('Radial shape', SHAPES, (v) => update({ shape: v }));
        els.shapeRow = labelled('Shape', els.shape.el);
        root.appendChild(els.shapeRow);

        // Interpolation
        els.space = DOM.create('select', { id: 'gr-space', className: 'select-input tb-select' });
        SPACES.forEach((s) => els.space.appendChild(DOM.create('option', { text: s.label, attrs: { value: s.id } })));
        root.appendChild(labelled('Blend in', els.space, 'gr-space'));

        // Stops
        els.stopsCount = DOM.create('span', { className: 'tool-count gr-count' });
        root.appendChild(DOM.create('div', {
            className: 'tb-head',
            children: [DOM.create('span', { className: 'section-label', id: 'gr-stops-label', text: 'Color stops' }), els.stopsCount]
        }));
        els.stops = DOM.create('ol', { className: 'gr-stops', attrs: { 'aria-labelledby': 'gr-stops-label' } });
        root.appendChild(els.stops);
        els.error = DOM.create('p', { className: 'error-text tb-error', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.error);

        const mk = (text, title) => DOM.create('button', { className: 'btn btn-secondary btn-sm', text, attrs: { type: 'button', title } });
        els.addCurrent = mk('Add current color', 'Add the current color as a new stop in the widest gap');
        els.distribute = mk('Distribute evenly', 'Space the stops evenly from 0% to 100%');
        els.reverse = mk('Reverse', 'Flip the gradient so it runs the other way');
        els.fromWorking = mk('From working palette', 'Replace the stops with the working palette colors');
        root.appendChild(DOM.create('div', {
            className: 'tb-actions gr-actions',
            children: [els.addCurrent, els.distribute, els.reverse, els.fromWorking]
        }));

        els.undoText = DOM.create('span', { className: 'tb-undo-text' });
        els.undoBtn = DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Undo', attrs: { type: 'button' } });
        els.undo = DOM.create('div', {
            className: 'tool-feedback tb-undo',
            attrs: { role: 'status', 'aria-live': 'polite' },
            children: [els.undoText, els.undoBtn]
        });
        els.undo.hidden = true;
        root.appendChild(els.undo);

        // Output
        root.appendChild(DOM.create('span', { className: 'section-label', id: 'gr-css-label', text: 'CSS' }));
        els.code = DOM.create('pre', {
            className: 'code-block tb-code gr-code',
            attrs: { tabindex: '0', 'aria-labelledby': 'gr-css-label' }
        });
        root.appendChild(els.code);
        els.copy = DOM.create('button', {
            className: 'btn btn-primary btn-sm',
            html: `${ICONS.copy}<span>Copy CSS</span>`,
            attrs: { type: 'button', title: 'Copy both lines of CSS' }
        });
        els.download = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            html: `${ICONS.download}<span>Download SVG</span>`,
            attrs: { type: 'button' }
        });
        root.appendChild(DOM.create('div', { className: 'action-buttons tb-buttons', children: [els.copy, els.download] }));
        els.note = DOM.create('p', { className: 'pane-hint tb-note' });
        root.appendChild(els.note);

        mount.appendChild(root);
        els.root = root;
    }

    /* ── Render ────────────────────────────────────────────── */

    function render({ stops = true } = {}) {
        if (!els.root) return;
        const g = State.gradient();
        const view = viewGradient();

        paintPreview(view);

        els.type.set(g.type);
        els.shape.set(g.shape);
        els.shapeRow.hidden = g.type !== 'radial';
        els.angleRow.hidden = g.type === 'radial';
        els.angleLabel.textContent = g.type === 'conic' ? 'Start angle' : 'Angle';
        els.angleRange.setAttribute('aria-label', g.type === 'conic' ? 'Start angle in degrees' : 'Angle in degrees');
        if (document.activeElement !== els.angleRange) els.angleRange.value = String(g.angle);
        if (document.activeElement !== els.angleNum) els.angleNum.value = String(g.angle);
        els.angleRange.setAttribute('aria-valuetext', `${g.angle} degrees`);

        if (!Array.from(els.space.options).some((o) => o.value === g.space)) {
            els.space.appendChild(DOM.create('option', { text: spaceLabel(g.space), attrs: { value: g.space } }));
        }
        if (els.space.value !== g.space) els.space.value = g.space;

        els.stopsCount.textContent = `${g.stops.length} / ${MAX_STOPS}`;
        els.stopsCount.title = `${plural(g.stops.length, 'stop')}; a gradient can have up to ${MAX_STOPS}`;
        if (stops) renderStops(g);
        const full = g.stops.length >= MAX_STOPS;
        els.addCurrent.disabled = full;
        els.addCurrent.title = full ? `A gradient can have up to ${MAX_STOPS} stops. Remove one to add another.` : 'Add the current color as a new stop in the widest gap';

        els.code.textContent = cssText(g);
        const conic = g.type === 'conic';
        els.download.disabled = conic;
        els.download.title = conic ? 'SVG has no conic gradient. Copy the CSS instead.' : `Download a ${SVG_W} × ${SVG_H} SVG of this gradient`;
        els.note.textContent = conic
            ? 'SVG has no conic gradient, so Download SVG works only for linear and radial gradients. Copy the CSS instead.'
            : 'The first line is an sRGB fallback with extra stops that imitate the chosen blend; browsers that support the second line use it instead.';
    }

    function paintPreview(g) {
        const out = css(g);
        const value = supports(out.modern) ? out.modern : out.fallback;
        els.fill.style.backgroundImage = value;
        const detail = g.type === 'radial' ? `${g.shape}` : `${g.angle} degrees`;
        els.preview.setAttribute('aria-label', `${typeLabel(g.type)} gradient preview, ${detail}, ${plural(g.stops.length, 'stop')}: ${sorted(g.stops).map((s) => `${s.hex} at ${fmtPos(s.pos)}%`).join(', ')}`);
    }

    function renderStops(g) {
        // Remember focus so a redraw does not drop the user's place.
        let focus = pendingFocus;
        pendingFocus = null;
        if (!focus && els.stops.contains(document.activeElement)) {
            const li = document.activeElement.closest('li');
            focus = { index: Number(li && li.dataset.index), field: document.activeElement.dataset.field };
        }

        els.stops.textContent = '';
        const canRemove = g.stops.length > 2;
        g.stops.forEach((s, i) => {
            const n = i + 1;
            const li = DOM.create('li', { className: 'gr-stop', data: { index: String(i) } });
            const sw = SwatchUI.create({
                hex: s.hex,
                title: `Set stop ${n} to the current color`,
                ariaLabel: `Stop ${n}, ${s.hex}. Set it to the current color`,
                onClick: () => setStopToCurrent(i)
            });
            sw.dataset.field = 'swatch';
            const hexInput = DOM.create('input', {
                className: 'text-input mono tb-input gr-hex',
                attrs: {
                    type: 'text',
                    spellcheck: 'false',
                    autocomplete: 'off',
                    'aria-label': `Stop ${n} color`,
                    title: 'Any CSS color; press Enter to keep it'
                },
                data: { field: 'hex' }
            });
            hexInput.value = displayHex(s.hex);
            const posInput = DOM.create('input', {
                className: 'text-input mono tb-num gr-pos',
                attrs: {
                    type: 'number',
                    min: '0',
                    max: '100',
                    step: '1',
                    inputmode: 'decimal',
                    'aria-label': `Stop ${n} position in percent`,
                    title: 'Position along the gradient, 0 to 100%'
                },
                data: { field: 'pos' }
            });
            posInput.value = fmtPos(s.pos);
            const remove = DOM.create('button', {
                className: 'icon-action icon-action--danger',
                html: ICONS.remove,
                attrs: {
                    type: 'button',
                    'aria-label': `Remove stop ${n}`,
                    title: canRemove ? `Remove stop ${n}` : 'A gradient needs at least two stops'
                },
                data: { field: 'remove' }
            });
            remove.disabled = !canRemove;
            li.append(sw, hexInput, posInput, DOM.create('span', { className: 'muted gr-pct', text: '%', attrs: { 'aria-hidden': 'true' } }), remove);
            els.stops.appendChild(li);
        });

        if (focus && Number.isInteger(focus.index)) {
            const li = els.stops.children[Math.min(focus.index, els.stops.children.length - 1)];
            if (li) {
                let target = li.querySelector(`[data-field="${focus.field || 'hex'}"]`);
                if (!target || target.disabled) target = li.querySelector('[data-field="hex"]');
                if (target) target.focus();
            }
        }
    }

    /* ── Changes ───────────────────────────────────────────── */

    function update(patch) {
        const g = State.updateGradient(patch);
        return g;
    }

    function setError(message, input) {
        els.error.textContent = message || '';
        els.stops.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
        if (message && input) input.setAttribute('aria-invalid', 'true');
    }

    /** Replace the stops, keeping them in position order; focus follows `trackIndex`. */
    function commitStops(stops, { trackIndex = -1, field = 'hex' } = {}) {
        const tagged = stops.map((s, i) => ({ ...s, _i: i }));
        const order = tagged.slice().sort((a, b) => (a.pos - b.pos) || (a._i - b._i));
        if (trackIndex >= 0) {
            const newIndex = order.findIndex((s) => s._i === trackIndex);
            if (newIndex >= 0) pendingFocus = { index: newIndex, field };
        }
        draft = null;
        update({ stops: order.map(({ hex, pos }) => ({ hex, pos: round1(clamp(pos, 0, 100)) })) });
    }

    function snapshotUndo(message) {
        undoSnapshot = State.gradient().stops;
        els.undoText.textContent = message;
        els.undo.dataset.state = 'info';
        els.undo.hidden = false;
        clearTimeout(undoTimer);
        undoTimer = setTimeout(hideUndo, UNDO_MS);
    }

    function hideUndo() {
        clearTimeout(undoTimer);
        els.undo.hidden = true;
        delete els.undo.dataset.state;
        undoSnapshot = null;
    }

    function undo() {
        if (!undoSnapshot) return;
        const stops = undoSnapshot;
        hideUndo();
        draft = null;
        update({ stops });
        notify('Stops restored', 'info', 1200);
    }

    function setStopToCurrent(index) {
        const g = State.gradient();
        if (!g.stops[index]) return;
        const hex = State.hexOf(State.getActive());
        if (!hex) return;
        g.stops[index].hex = hex;
        pendingFocus = { index, field: 'swatch' };
        setError('');
        draft = null;
        update({ stops: g.stops });
    }

    function commitHex(input) {
        input.dataset.committed = input.value;
        const li = input.closest('li');
        const index = Number(li && li.dataset.index);
        const g = State.gradient();
        if (!g.stops[index]) return;
        const raw = input.value.trim();
        const hex = readHex(raw);
        if (!hex) {
            const shown = raw.length > 20 ? `${raw.slice(0, 20)}…` : raw;
            setError(raw
                ? `Stop ${index + 1}: couldn't read “${shown}” as a color. Try #C9A84C or goldenrod.`
                : `Stop ${index + 1} needs a color, such as #C9A84C.`, input);
            draft = null;
            paintPreview(State.gradient());
            return;
        }
        setError('');
        draft = null;
        if (hex === g.stops[index].hex) {
            input.value = displayHex(hex);
            paintPreview(g);
            return;
        }
        g.stops[index].hex = hex;
        pendingFocus = document.activeElement === input ? { index, field: 'hex' } : null;
        update({ stops: g.stops });
    }

    function commitPos(input) {
        input.dataset.committed = input.value;
        const li = input.closest('li');
        const index = Number(li && li.dataset.index);
        const g = State.gradient();
        if (!g.stops[index]) return;
        const raw = input.value.trim();
        const pos = Number(raw);
        if (raw === '' || !Number.isFinite(pos) || pos < 0 || pos > 100) {
            setError(`Stop ${index + 1}: position must be a number from 0 to 100.`, input);
            draft = null;
            paintPreview(State.gradient());
            return;
        }
        setError('');
        if (round1(pos) === g.stops[index].pos) {
            input.value = fmtPos(pos);
            draft = null;
            paintPreview(g);
            return;
        }
        g.stops[index].pos = round1(pos);
        commitStops(g.stops, { trackIndex: document.activeElement === input ? index : -1, field: 'pos' });
    }

    function removeStop(index) {
        const g = State.gradient();
        if (g.stops.length <= 2 || !g.stops[index]) {
            notify('A gradient needs at least two stops.', 'info', 2000);
            return;
        }
        const removed = g.stops[index];
        snapshotUndo(`Removed stop ${index + 1} (${displayHex(removed.hex)}).`);
        g.stops.splice(index, 1);
        pendingFocus = { index: Math.min(index, g.stops.length - 1), field: 'remove' };
        setError('');
        draft = null;
        update({ stops: g.stops });
    }

    function addCurrent() {
        const g = State.gradient();
        if (g.stops.length >= MAX_STOPS) {
            notify(`A gradient can have up to ${MAX_STOPS} stops. Remove one to add another.`, 'warning', 3000);
            return false;
        }
        const hex = State.hexOf(State.getActive());
        const stops = sorted(g.stops);
        // Put the new stop in the middle of the widest gap (including the ends).
        let best = { gap: stops[0].pos, pos: 0 };
        for (let i = 0; i < stops.length - 1; i++) {
            const gap = stops[i + 1].pos - stops[i].pos;
            if (gap > best.gap) best = { gap, pos: stops[i].pos + gap / 2 };
        }
        const tail = 100 - stops[stops.length - 1].pos;
        if (tail > best.gap) best = { gap: tail, pos: 100 };
        if (best.gap <= 0) best.pos = 100;
        stops.push({ hex, pos: round1(best.pos) });
        commitStops(stops, { trackIndex: stops.length - 1, field: 'hex' });
        notify(`Added ${displayHex(hex)} at ${fmtPos(best.pos)}%`, 'success', 1400);
        return true;
    }

    function distribute() {
        const g = State.gradient();
        const stops = sorted(g.stops);
        const even = stops.map((s, i) => ({ hex: s.hex, pos: round1((i / (stops.length - 1)) * 100) }));
        if (sameStops(even, g.stops)) {
            notify('The stops are already evenly spaced.', 'info', 1600);
            return;
        }
        snapshotUndo('Spaced the stops evenly.');
        draft = null;
        update({ stops: even });
    }

    function reverse() {
        const g = State.gradient();
        const flipped = sorted(g.stops).reverse().map((s) => ({ hex: s.hex, pos: round1(100 - s.pos) }));
        draft = null;
        update({ stops: flipped });
        notify('Gradient reversed', 'info', 1200);
    }

    function fromWorking() {
        const colors = State.working().colors;
        if (colors.length < 2) {
            notify(colors.length
                ? 'The working palette has only one color. A gradient needs at least two.'
                : 'The working palette is empty. Add colors to it first.', 'warning', 3200);
            return false;
        }
        const take = colors.slice(0, MAX_STOPS);
        const stops = take.map((c, i) => ({ hex: c.hex, pos: round1((i / (take.length - 1)) * 100) }));
        snapshotUndo(`Replaced the stops with ${plural(take.length, 'color')} from the working palette.`);
        draft = null;
        update({ stops });
        if (colors.length > MAX_STOPS) {
            notify(`Used the first ${MAX_STOPS} of ${colors.length} colors; a gradient can have up to ${MAX_STOPS} stops.`, 'warning', 4000);
        }
        return true;
    }

    function copyCss() {
        if (window.ToolApp) ToolApp.copy(cssText(), 'gradient CSS', els.copy);
    }

    function downloadSvg() {
        const g = State.gradient();
        const markup = svg(g);
        if (!markup) {
            notify('SVG has no conic gradient. Copy the CSS instead.', 'info', 3000);
            return;
        }
        const detail = g.type === 'radial' ? g.shape : `${g.angle}deg`;
        if (window.ToolApp) ToolApp.download(`gradient-${g.type}-${detail}.svg`, markup, 'image/svg+xml');
    }

    /* ── Events ────────────────────────────────────────────── */

    function bind() {
        DOM.on(els.angleRange, 'input', () => update({ angle: Number(els.angleRange.value) }));
        DOM.on(els.angleNum, 'input', () => {
            const v = Number(els.angleNum.value);
            if (els.angleNum.value !== '' && Number.isFinite(v) && v >= 0 && v <= 360) update({ angle: v });
        });
        DOM.on(els.angleNum, 'change', () => {
            const v = Number(els.angleNum.value);
            if (els.angleNum.value === '' || !Number.isFinite(v)) {
                els.angleNum.value = String(State.gradient().angle);
                notify('The angle must be a number from 0 to 360.', 'warning', 2400);
                return;
            }
            update({ angle: clamp(v, 0, 360) });
            els.angleNum.value = String(State.gradient().angle);
        });
        DOM.on(els.space, 'change', () => update({ space: els.space.value }));

        // Stop rows (delegated; rows are rebuilt on each change)
        DOM.delegate(els.stops, 'input', '.gr-hex', (_e, input) => {
            const index = Number(input.closest('li').dataset.index);
            const hex = readHex(input.value);
            draft = hex ? { index, hex } : null;
            if (hex) setError('');
            paintPreview(viewGradient());
        });
        DOM.delegate(els.stops, 'input', '.gr-pos', (_e, input) => {
            const index = Number(input.closest('li').dataset.index);
            const pos = Number(input.value);
            draft = input.value !== '' && Number.isFinite(pos) && pos >= 0 && pos <= 100 ? { index, pos } : null;
            paintPreview(viewGradient());
        });
        // A row rebuilt after a commit can still fire 'change' from its old,
        // detached input; skip those and anything already committed.
        const fresh = (input) => input.isConnected && input.dataset.committed !== input.value;
        DOM.delegate(els.stops, 'change', '.gr-hex', (_e, input) => { if (fresh(input)) commitHex(input); });
        DOM.delegate(els.stops, 'change', '.gr-pos', (_e, input) => { if (fresh(input)) commitPos(input); });
        DOM.delegate(els.stops, 'keydown', '.gr-hex, .gr-pos', (e, input) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (input.classList.contains('gr-hex')) commitHex(input);
                else commitPos(input);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                const index = Number(input.closest('li').dataset.index);
                const s = State.gradient().stops[index];
                if (s) input.value = input.classList.contains('gr-hex') ? displayHex(s.hex) : fmtPos(s.pos);
                draft = null;
                setError('');
                paintPreview(State.gradient());
            }
        });
        DOM.delegate(els.stops, 'click', '[data-field="remove"]', (_e, btn) => {
            removeStop(Number(btn.closest('li').dataset.index));
        });

        DOM.on(els.addCurrent, 'click', addCurrent);
        DOM.on(els.distribute, 'click', distribute);
        DOM.on(els.reverse, 'click', reverse);
        DOM.on(els.fromWorking, 'click', fromWorking);
        DOM.on(els.undoBtn, 'click', undo);
        DOM.on(els.copy, 'click', copyCss);
        DOM.on(els.download, 'click', downloadSvg);

        State.on('gradient', (payload = {}) => {
            const keys = Array.isArray(payload.patch) ? payload.patch : null;
            schedule({ stops: !keys || keys.includes('stops') });
        });
        State.on('settings', () => schedule({ stops: true }));
        State.on('reset', () => {
            hideUndo();
            draft = null;
            setError('');
            schedule({ stops: true });
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    const GradientUI = {
        init() {
            const mount = DOM.id('mount-gradient');
            if (!mount || els.root) return;
            els.mount = mount;
            build(mount);
            bind();
            render({ stops: true });
            watchOpen();
        },
        css: (g) => css(g || State.gradient()),
        cssText: (g) => cssText(g || State.gradient()),
        svg: (g) => svg(g || State.gradient()),
        addCurrent,
        distribute,
        reverse,
        fromWorking,
        render
    };

    window.GradientUI = GradientUI;
})();
