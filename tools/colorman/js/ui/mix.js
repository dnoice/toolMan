/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MixUI (colorMan Edition - v1.0)
 *     - File Name: mix.js
 *     - Relative Path: tools/colorman/js/ui/mix.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Mix pane in the Tools rail: it blends the current color (A) with a
 *     second color (B) in a color space the user picks, and shows the
 *     result plus an even row of steps between the two. Use it to find an
 *     in-between shade or to build a short ramp for the working palette.
 *
 * ✒ Key Features:
 *     - Color A is always the current color and follows every change to it
 *     - Color B field takes any CSS color (hex, rgb(), hsl(), oklch(), a
 *       name, ...); valid input previews as you type, Enter keeps it,
 *       Escape puts back the last good value, bad input explains itself
 *     - "Use current" copies A into B; "Swap" makes B current and A the new B
 *     - Amount-of-B range (0–100%, default 50%) with a live read-out and
 *       arrow-key steps
 *     - Seven mixing spaces: sRGB, Linear sRGB, HSL, Lab, LCH, OKLab, OKLCH
 *       (default OKLab); hue spaces take the shorter way round the wheel
 *     - Result swatch with its hex, a copy button, and "Set as current"
 *     - Steps stepper (3–12) and a blend row from A to B; click any step to
 *       make it the current color
 *     - "Add blend to palette" appends every step to the working palette and
 *       reports how many fit when the palette is nearly full
 *     - B, amount, space, and steps persist per browser via State.pane('mix')
 *     - Redraws once per animation frame, and only while the pane is open
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js, before
 *     js/app.js. app.js calls MixUI.init() once; the module renders into
 *     #mount-mix and keeps itself in step through State events.
 *
 * ✒ Examples:
 *     MixUI.init()                    → builds the pane inside #mount-mix
 *     MixUI.setB('#1B2A4A')           → true; B becomes navy
 *     MixUI.setB('not a color')       → false; the field shows why
 *     MixUI.result()                  → { r, g, b, a } blend at the current amount
 *     MixUI.blend()                   → ['#C9A84C', '#9A8855', …] (the step row)
 *     MixUI.addBlendToPalette()       → number of colors added
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/ui/swatch.js (SwatchUI),
 *       js/color.js (Color.mix, Color.steps, Color.parseDetailed),
 *       shared/js/dom.js, toolapp.js, toolman.js; css/tools-b.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: without js/color.js the pane still works but mixes in
 *       plain sRGB whatever space is selected, and says so
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'mix';
    const MIN_STEPS = 3;
    const MAX_STEPS = 12;

    const SPACES = [
        { id: 'srgb', label: 'sRGB' },
        { id: 'srgb-linear', label: 'Linear sRGB' },
        { id: 'hsl', label: 'HSL' },
        { id: 'lab', label: 'Lab' },
        { id: 'lch', label: 'LCH' },
        { id: 'oklab', label: 'OKLab' },
        { id: 'oklch', label: 'OKLCH' }
    ];
    const SPACE_IDS = SPACES.map((s) => s.id);
    const DEFAULTS = Object.freeze({ b: '#1B2A4A', ratio: 50, space: 'oklab', steps: 5 });

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        swap: svg('<path d="M7 16V4"></path><path d="m3 8 4-4 4 4"></path><path d="M17 8v12"></path><path d="m21 16-4 4-4-4"></path>'),
        target: svg('<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle>')
    };

    const els = {};
    let frame = 0;
    let stale = false;
    let draftB = null;          // a valid color typed into B but not yet kept
    let lastBlend = [];         // hexes of the step row as last drawn
    let previewTimer = 0;

    /* ── Small helpers ─────────────────────────────────────── */

    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const hasColor = () => Boolean(window.Color && typeof Color.mix === 'function');
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function displayHex(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function spaceLabel(id) {
        const s = SPACES.find((x) => x.id === id);
        return s ? s.label : id;
    }

    /** The saved pane preferences, validated, with defaults filled in. */
    function prefs() {
        const p = State.pane(PANE);
        const steps = Math.round(Number(p.steps));
        const ratio = Number(p.ratio);
        return {
            b: State.hexOf(p.b) || DEFAULTS.b,
            ratio: Number.isFinite(ratio) ? clamp(Math.round(ratio), 0, 100) : DEFAULTS.ratio,
            space: SPACE_IDS.includes(p.space) ? p.space : DEFAULTS.space,
            steps: Number.isFinite(steps) ? clamp(steps, MIN_STEPS, MAX_STEPS) : DEFAULTS.steps
        };
    }

    function save(patch) {
        if (!State.setPane(PANE, patch)) notify(State.lastError || 'Could not save the Mix settings.', 'warning', 3000);
    }

    /** Plain sRGB blend, used only when the color engine is missing. */
    function lerp(a, b, t) {
        const mixCh = (x, y) => x + (y - x) * t;
        return { r: mixCh(a.r, b.r), g: mixCh(a.g, b.g), b: mixCh(a.b, b.b), a: mixCh(a.a, b.a) };
    }

    function mixAt(a, b, t, space) {
        if (hasColor()) {
            try { return Color.mix(a, b, t, space); } catch (err) { console.warn('[MixUI] mix failed:', err); }
        }
        return lerp(a, b, t);
    }

    function stepsOf(a, b, n, space) {
        if (hasColor() && typeof Color.steps === 'function') {
            try { return Color.steps(a, b, n, space); } catch (err) { console.warn('[MixUI] steps failed:', err); }
        }
        return Array.from({ length: n }, (_, i) => lerp(a, b, i / (n - 1)));
    }

    /** Parse any CSS color; returns { color, clipped } or null. */
    function readColor(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        if (window.Color && typeof Color.parseDetailed === 'function') {
            try {
                const d = Color.parseDetailed(raw);
                if (d && d.color) return { color: d.color, clipped: Boolean(d.clipped) };
            } catch (_err) { /* fall through */ }
        }
        const c = State.colorOf(raw);
        return c ? { color: c, clipped: false } : null;
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
            if (!isOpen()) { stale = true; return; }
            stale = false;
            render();
        });
    }

    function watchOpen() {
        const s = section();
        if (!s || !window.MutationObserver) return;
        new MutationObserver(() => { if (stale && isOpen()) schedule(); })
            .observe(s, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    /* ── Build ─────────────────────────────────────────────── */

    function field(labelText, forId, control, extra) {
        const wrap = DOM.create('div', { className: 'tb-field' });
        const head = DOM.create('div', { className: 'tb-field-head' });
        head.appendChild(DOM.create('label', { className: 'mini-label', text: labelText, attrs: { for: forId } }));
        if (extra) head.appendChild(extra);
        wrap.appendChild(head);
        wrap.appendChild(control);
        return wrap;
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'tb-pane mx' });

        // Color A (the current color) and color B (any color)
        const pair = DOM.create('div', { className: 'mx-pair' });

        els.aChip = DOM.create('span', { className: 'swatch', attrs: { 'aria-hidden': 'true' } });
        els.aHex = DOM.create('code', { className: 'mx-hex' });
        pair.appendChild(DOM.create('div', {
            className: 'mx-line',
            children: [
                DOM.create('span', { className: 'mx-tag', text: 'A', attrs: { 'aria-hidden': 'true' } }),
                els.aChip,
                DOM.create('div', {
                    className: 'mx-line-body',
                    children: [
                        DOM.create('span', { className: 'mini-label', text: 'Color A · current color' }),
                        els.aHex
                    ]
                })
            ]
        }));

        els.bChip = DOM.create('span', { className: 'swatch', attrs: { 'aria-hidden': 'true' } });
        els.bInput = DOM.create('input', {
            id: 'mx-b-input',
            className: 'text-input mono tb-input',
            attrs: {
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                placeholder: '#1B2A4A, navy, oklch(…)',
                'aria-describedby': 'mx-b-error',
                title: 'Type any CSS color and press Enter'
            }
        });
        pair.appendChild(DOM.create('div', {
            className: 'mx-line',
            children: [
                DOM.create('span', { className: 'mx-tag', text: 'B', attrs: { 'aria-hidden': 'true' } }),
                els.bChip,
                DOM.create('div', {
                    className: 'mx-line-body',
                    children: [
                        DOM.create('label', { className: 'mini-label', text: 'Color B', attrs: { for: 'mx-b-input' } }),
                        els.bInput
                    ]
                })
            ]
        }));

        els.useCurrent = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Use current',
            attrs: { type: 'button', title: 'Copy the current color into Color B' }
        });
        els.swap = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            html: `${ICONS.swap}<span>Swap</span>`,
            attrs: { type: 'button', title: 'Make Color B the current color, and the current color Color B' }
        });
        pair.appendChild(DOM.create('div', { className: 'tb-actions mx-b-actions', children: [els.useCurrent, els.swap] }));
        els.bError = DOM.create('p', { id: 'mx-b-error', className: 'error-text tb-error', attrs: { role: 'status', 'aria-live': 'polite' } });
        pair.appendChild(els.bError);
        root.appendChild(pair);

        // Amount of B
        els.ratio = DOM.create('input', {
            id: 'mx-ratio',
            className: 'range-input',
            attrs: { type: 'range', min: '0', max: '100', step: '1' }
        });
        els.ratioOut = DOM.create('output', { className: 'field-value', attrs: { for: 'mx-ratio' } });
        root.appendChild(field('Amount of B', 'mx-ratio', els.ratio, els.ratioOut));

        // Space
        els.space = DOM.create('select', { id: 'mx-space', className: 'select-input tb-select' });
        SPACES.forEach((s) => els.space.appendChild(DOM.create('option', { text: s.label, attrs: { value: s.id } })));
        const spaceField = field('Mix in', 'mx-space', els.space);
        spaceField.classList.add('tb-field--inline');
        root.appendChild(spaceField);

        // Result
        const result = DOM.create('div', { className: 'mx-result' });
        els.resultSwatch = SwatchUI.create({ hex: DEFAULTS.b, size: 'lg', onClick: () => setResultAsCurrent() });
        els.resultHex = DOM.create('code', { className: 'mx-result-hex' });
        els.resultNote = DOM.create('span', { className: 'mx-result-note' });
        els.copy = DOM.create('button', {
            className: 'icon-action',
            html: ICONS.copy,
            attrs: { type: 'button', 'aria-label': 'Copy the mixed color', title: 'Copy the mixed color' }
        });
        els.setCurrent = DOM.create('button', {
            className: 'btn btn-primary btn-sm',
            html: `${ICONS.target}<span>Set as current</span>`,
            attrs: { type: 'button', title: 'Make the mixed color the current color' }
        });
        result.appendChild(els.resultSwatch);
        result.appendChild(DOM.create('div', {
            className: 'mx-result-body',
            children: [
                DOM.create('div', { className: 'mx-result-top', children: [els.resultHex, els.copy] }),
                els.resultNote,
                els.setCurrent
            ]
        }));
        root.appendChild(result);

        // Steps + blend row
        const stepsHead = DOM.create('div', { className: 'tb-field-head' });
        stepsHead.appendChild(DOM.create('span', { className: 'mini-label', id: 'mx-steps-label', text: 'Blend steps' }));
        els.stepDown = DOM.create('button', { className: 'stepper-btn', text: '−', attrs: { type: 'button', 'data-dir': 'down', 'aria-label': 'One step fewer' } });
        els.stepUp = DOM.create('button', { className: 'stepper-btn', text: '+', attrs: { type: 'button', 'data-dir': 'up', 'aria-label': 'One step more' } });
        els.stepValue = DOM.create('span', { className: 'stepper-value', attrs: { 'aria-live': 'polite' } });
        stepsHead.appendChild(DOM.create('div', {
            className: 'stepper tb-stepper',
            attrs: { role: 'group', 'aria-labelledby': 'mx-steps-label' },
            children: [els.stepDown, els.stepValue, els.stepUp]
        }));
        root.appendChild(stepsHead);

        els.blend = DOM.create('div', { className: 'mx-blend', attrs: { role: 'group', 'aria-label': 'Blend from A to B' } });
        root.appendChild(els.blend);
        root.appendChild(DOM.create('div', {
            className: 'mx-ends',
            attrs: { 'aria-hidden': 'true' },
            children: [DOM.create('span', { text: 'A' }), DOM.create('span', { text: 'B' })]
        }));

        els.addBlend = DOM.create('button', {
            className: 'btn btn-secondary btn-sm btn-block',
            text: 'Add blend to palette',
            attrs: { type: 'button', title: 'Add every step of the blend to the working palette' }
        });
        root.appendChild(els.addBlend);

        els.engineNote = DOM.create('p', {
            className: 'pane-hint',
            text: 'The color engine did not load, so colors mix in plain sRGB whatever space is chosen.'
        });
        els.engineNote.hidden = hasColor();
        root.appendChild(els.engineNote);

        mount.appendChild(root);
        els.root = root;
    }

    /* ── Render ────────────────────────────────────────────── */

    function currentB() {
        return draftB || State.colorOf(prefs().b);
    }

    function render() {
        if (!els.root) return;
        const p = prefs();
        const a = State.getActive();
        const b = currentB() || State.colorOf(DEFAULTS.b);
        const aHex = State.hexOf(a) || '#000000';
        const bHex = State.hexOf(b) || DEFAULTS.b;

        els.aChip.style.setProperty('--c', aHex);
        els.aHex.textContent = displayHex(aHex);
        els.bChip.style.setProperty('--c', bHex);
        if (document.activeElement !== els.bInput && !els.bInput.value) els.bInput.value = displayHex(p.b);

        if (document.activeElement !== els.ratio) els.ratio.value = String(p.ratio);
        els.ratioOut.textContent = `${p.ratio}%`;
        els.ratio.setAttribute('aria-valuetext', `${p.ratio}% B, ${100 - p.ratio}% A`);
        if (els.space.value !== p.space) els.space.value = p.space;

        const mixed = mixAt(a, b, p.ratio / 100, p.space);
        const mixedHex = State.hexOf(mixed) || aHex;
        SwatchUI.update(els.resultSwatch, {
            hex: mixedHex,
            name: 'Mixed color',
            title: `${displayHex(mixedHex)} — click to make it the current color`
        });
        els.resultHex.textContent = displayHex(mixedHex);
        els.resultNote.textContent = `${p.ratio}% B in ${spaceLabel(p.space)}`;
        els.setCurrent.disabled = mixedHex === aHex;
        els.setCurrent.title = mixedHex === aHex ? 'The mix is already the current color' : 'Make the mixed color the current color';

        els.stepValue.textContent = `${p.steps} steps`;
        els.stepDown.disabled = p.steps <= MIN_STEPS;
        els.stepUp.disabled = p.steps >= MAX_STEPS;

        renderBlend(a, b, p);
    }

    function renderBlend(a, b, p) {
        const hexes = stepsOf(a, b, p.steps, p.space).map((c) => State.hexOf(c)).filter(Boolean);
        const same = hexes.length === lastBlend.length && hexes.every((h, i) => h === lastBlend[i])
            && els.blend.childElementCount === hexes.length;
        if (!same) {
            const focusedIndex = Array.prototype.indexOf.call(els.blend.children, document.activeElement);
            els.blend.textContent = '';
            els.blend.style.setProperty('--n', String(hexes.length));
            hexes.forEach((hex, i) => {
                const pct = Math.round((i / (hexes.length - 1)) * 100);
                const shown = displayHex(hex);
                els.blend.appendChild(SwatchUI.create({
                    hex,
                    title: `${pct}% B · ${shown} — click to make it the current color`,
                    ariaLabel: `Step ${i + 1} of ${hexes.length}, ${pct}% B, ${shown}. Make it the current color`,
                    onClick: () => pickStep(hex)
                }));
            });
            if (focusedIndex >= 0 && els.blend.children[focusedIndex]) els.blend.children[focusedIndex].focus();
            lastBlend = hexes;
        }
        els.addBlend.textContent = `Add ${hexes.length} blend colors to palette`;
    }

    /* ── Actions ───────────────────────────────────────────── */

    function setBError(message) {
        els.bError.textContent = message || '';
        if (message) els.bInput.setAttribute('aria-invalid', 'true');
        else els.bInput.removeAttribute('aria-invalid');
    }

    /** Keep a new Color B. Returns true when it was readable. */
    function setB(input, { quiet = false } = {}) {
        const parsed = typeof input === 'string' ? readColor(input) : (State.colorOf(input) ? { color: State.colorOf(input), clipped: false } : null);
        if (!parsed) {
            if (!quiet) {
                const raw = String(input || '').trim();
                const shown = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
                setBError(raw
                    ? `Couldn't read “${shown}” as a color. Try #1B2A4A, rgb(27 42 74), or navy.`
                    : 'Type a color for B first, such as #1B2A4A or navy.');
            }
            return false;
        }
        const hex = State.hexOf(parsed.color);
        clearTimeout(previewTimer);
        draftB = null;
        save({ b: hex });
        els.bInput.value = displayHex(hex);
        setBError(parsed.clipped ? 'That color is outside what screens show (sRGB), so it was brought into range.' : '');
        schedule();
        return true;
    }

    function useCurrent() {
        setB(State.getActive());
        notify(`Color B is now ${State.activeHex()}`, 'success', 1400);
    }

    function swap() {
        const b = State.colorOf(prefs().b);
        const a = State.getActive();
        if (!b) return;
        save({ b: State.hexOf(a) });
        draftB = null;
        els.bInput.value = displayHex(State.hexOf(a));
        setBError('');
        if (!State.setActive(b, { source: 'mix' })) schedule();
    }

    function result() {
        const p = prefs();
        return mixAt(State.getActive(), currentB(), p.ratio / 100, p.space);
    }

    function setResultAsCurrent() {
        const hex = State.hexOf(result());
        if (State.setActive(hex, { source: 'mix' })) notify(`Set ${displayHex(hex)} as the current color`, 'success', 1400);
    }

    function pickStep(hex) {
        if (State.setActive(hex, { source: 'mix' })) notify(`Set ${displayHex(hex)} as the current color`, 'success', 1400);
    }

    function changeSteps(delta) {
        const next = clamp(prefs().steps + delta, MIN_STEPS, MAX_STEPS);
        save({ steps: next });
        render();
    }

    function addBlendToPalette() {
        const hexes = lastBlend.slice();
        if (!hexes.length) return 0;
        let added = 0;
        for (const hex of hexes) {
            if (State.addToWorking(hex) < 0) break;
            added += 1;
        }
        if (added === hexes.length) {
            notify(`Added ${plural(added, 'color')} to the working palette`, 'success', 1600);
        } else if (added > 0) {
            notify(`Added ${added} of ${hexes.length} colors. ${State.lastError || 'The working palette is full.'}`, 'warning', 4000);
        } else {
            notify(State.lastError || 'Could not add the blend to the working palette.', 'warning', 4000);
        }
        if (added && window.ToolApp) ToolApp.flash(els.addBlend);
        return added;
    }

    /* ── Events ────────────────────────────────────────────── */

    function bind() {
        DOM.on(els.bInput, 'input', () => {
            clearTimeout(previewTimer);
            previewTimer = setTimeout(() => {
                const parsed = readColor(els.bInput.value);
                draftB = parsed ? parsed.color : null;
                if (parsed) setBError('');
                schedule();
            }, 150);
        });
        DOM.on(els.bInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                setB(els.bInput.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(previewTimer);
                draftB = null;
                els.bInput.value = displayHex(prefs().b);
                setBError('');
                schedule();
            }
        });
        DOM.on(els.bInput, 'change', () => {
            if (!setB(els.bInput.value)) { clearTimeout(previewTimer); draftB = null; schedule(); }
        });

        DOM.on(els.useCurrent, 'click', useCurrent);
        DOM.on(els.swap, 'click', swap);

        DOM.on(els.ratio, 'input', () => {
            save({ ratio: clamp(Math.round(Number(els.ratio.value)), 0, 100) });
            render();
        });
        DOM.on(els.space, 'change', () => {
            if (SPACE_IDS.includes(els.space.value)) save({ space: els.space.value });
            render();
        });

        DOM.on(els.copy, 'click', () => {
            const hex = displayHex(State.hexOf(result()));
            if (window.ToolApp) ToolApp.copy(hex, hex, els.copy);
        });
        DOM.on(els.setCurrent, 'click', setResultAsCurrent);
        DOM.on(els.stepDown, 'click', () => changeSteps(-1));
        DOM.on(els.stepUp, 'click', () => changeSteps(1));
        DOM.on(els.addBlend, 'click', addBlendToPalette);

        State.on('active', schedule);
        State.on('settings', () => {
            if (document.activeElement !== els.bInput && !draftB) els.bInput.value = displayHex(prefs().b);
            schedule();
        });
        State.on('reset', () => {
            draftB = null;
            lastBlend = [];
            els.bInput.value = displayHex(prefs().b);
            setBError('');
            schedule();
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    const MixUI = {
        init() {
            const mount = DOM.id('mount-mix');
            if (!mount || els.root) return;
            els.mount = mount;
            build(mount);
            bind();
            els.bInput.value = displayHex(prefs().b);
            render();
            watchOpen();
        },
        setB(value) { return setB(value); },
        result,
        blend() { return lastBlend.slice(); },
        addBlendToPalette,
        render
    };

    window.MixUI = MixUI;
})();
