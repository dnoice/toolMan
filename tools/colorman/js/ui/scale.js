/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ScaleUI (colorMan Edition - v1.0)
 *     - File Name: scale.js
 *     - Relative Path: tools/colorman/js/ui/scale.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Shades & Tints pane in the Tools rail: it turns the active color
 *     into a ready-to-use scale, either an 11-step 50–950 ramp in the style
 *     of Tailwind or even tints and shades. Each step shows its contrast
 *     against white and black, can become the active color with a click,
 *     and the whole scale can go to the working palette or the clipboard as
 *     CSS custom properties.
 *
 * ✒ Key Features:
 *     - Four modes as a radio group (arrow keys move): Tailwind 50–950,
 *       Tints, Shades, and Tints + shades
 *     - Steps stepper, 3 to 15 (per side for Tints + shades); disabled with
 *       an explanation for Tailwind, which always has 11 steps
 *     - Vertical list: swatch, step label, hex, and ratios against white and
 *       black (two decimals, truncated like every colorMan ratio), each
 *       marked when it reaches AA (4.5:1)
 *     - The step that is the active color is marked "Base" with a gold rule,
 *       not by color alone
 *     - Click a step to make it the active color; copy any single hex
 *     - "Add all to palette" (skips colors already there), "Replace
 *       palette" (asks first when unsaved work would be lost)
 *     - "Copy as CSS variables": one --{prefix}-{step}: #hex; line per step,
 *       using the export prefix from Settings
 *     - Mode and steps persist via State.pane('scale'); the list updates in
 *       place so keyboard focus is kept, and only while the pane is open
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js. ToolApp.boot
 *     calls ScaleUI.init(), which builds the pane inside #mount-scale.
 *     ScaleUI.setMode('tints') and ScaleUI.setSteps(7) change it from code.
 *
 * ✒ Examples:
 *     ScaleUI.setMode('tailwind')          → 50, 100, … 900, 950
 *     ScaleUI.setMode('both'); ScaleUI.setSteps(4)  → 7 steps, dark to light
 *     ScaleUI.entries()                    → [{ label: '50', hex: '#F8F5EB', … }, …]
 *     ScaleUI.cssVariables()               → '--color-50: #F8F5EB;\n--color-100: …'
 *     ScaleUI.copyCss()                    → the same text on the clipboard
 *     ScaleUI.addAll()                     → appends every step to the working palette
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (Color.scale, Color.contrast,
 *       Color.formatRatio), js/state.js (State), shared/js/dom.js,
 *       dialogs.js (Dialogs.confirm), toolapp.js (ToolApp.copy,
 *       ToolApp.flash), toolman.js; js/ui/working.js
 *       (WorkingUI.confirmReplace) when present
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the Tailwind-style ramp is fitted from OKLCH lightness
 *       targets, so it resembles Tailwind's palette without matching its
 *       hand-tuned values exactly
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'scale';
    const STEPS_MIN = 3;
    const STEPS_MAX = 15;
    const STEPS_DEFAULT = 5;
    const WHITE = { r: 1, g: 1, b: 1, a: 1 };
    const BLACK = { r: 0, g: 0, b: 0, a: 1 };

    const MODES = [
        { id: 'tailwind', label: 'Tailwind 50–950', title: 'Eleven steps from 50 (lightest) to 950 (darkest)' },
        { id: 'tints', label: 'Tints', title: 'The color mixed toward white in even steps' },
        { id: 'shades', label: 'Shades', title: 'The color mixed toward black in even steps' },
        { id: 'both', label: 'Tints + shades', title: 'Shades below the color and tints above it' }
    ];

    const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    const els = {};
    let current = [];           // [{ label, display, cssKey, name, hex, base, onWhite, onBlack }]
    let schedule = () => {};

    /* ── Helpers ───────────────────────────────────────────── */

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const engineReady = () => Boolean(window.Color && typeof Color.scale === 'function'
        && typeof Color.contrast === 'function' && typeof Color.formatRatio === 'function');

    const hexOf = (c) => State.hexOf(c) || '';

    function shown(hex) {
        if (!hex) return '';
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    /** The shared truncating formatter, so a ratio here matches the Picker and Contrast panes. */
    const ratioText = (r) => Color.formatRatio(r);

    function prefs() {
        const p = State.pane(PANE);
        const steps = Math.round(Number(p.steps));
        return {
            mode: MODES.some((m) => m.id === p.mode) ? p.mode : 'tailwind',
            steps: Number.isFinite(steps) ? Math.min(STEPS_MAX, Math.max(STEPS_MIN, steps)) : STEPS_DEFAULT
        };
    }

    function makeScheduler(section, render) {
        let frame = 0;
        let stale = false;
        const open = () => !section || section.dataset.collapsed !== 'true';
        const run = () => {
            frame = 0;
            if (!open()) { stale = true; return; }
            stale = false;
            render();
        };
        if (section && 'MutationObserver' in window) {
            new MutationObserver(() => { if (stale && open() && !frame) frame = requestAnimationFrame(run); })
                .observe(section, { attributes: true, attributeFilter: ['data-collapsed'] });
        }
        return () => { if (!frame) frame = requestAnimationFrame(run); };
    }

    function setFeedback(state, text) {
        if (!els.feedback) return;
        if (!state) {
            delete els.feedback.dataset.state;
            els.feedback.textContent = '';
            return;
        }
        els.feedback.dataset.state = state;
        els.feedback.textContent = text;
    }

    /** Engine entries → display rows with readable labels and CSS-safe keys. */
    function computeScale(color, mode, steps) {
        const raw = Color.scale(color, { mode, steps });
        return raw.map((e) => {
            const hex = hexOf(e.color);
            let display;
            let cssKey;
            let base;
            if (mode === 'tailwind') {
                display = e.label;
                cssKey = e.label;
                base = Boolean(e.anchor);
            } else {
                const pct = Math.round(Number(e.percent) || 0);
                base = e.kind === 'base';
                if (base) {
                    display = 'Base';
                    cssKey = 'base';
                } else if (e.kind === 'tint') {
                    display = `Tint ${pct}%`;
                    cssKey = `tint-${pct}`;
                } else {
                    display = `Shade ${pct}%`;
                    cssKey = `shade-${pct}`;
                }
            }
            const c = State.colorOf(hex);
            return {
                label: e.label,
                display,
                cssKey,
                name: display,
                hex,
                base,
                onWhite: Color.contrast(c, WHITE),
                onBlack: Color.contrast(c, BLACK)
            };
        });
    }

    /* ── Build ─────────────────────────────────────────────── */

    function build(mount) {
        mount.textContent = '';
        const root = DOM.create('div', { className: 'ta-pane scl' });

        root.appendChild(DOM.create('span', { className: 'mini-label', text: 'Scale', attrs: { 'aria-hidden': 'true' } }));
        els.modeGroup = DOM.create('div', {
            className: 'chip-row ta-radios scl-modes',
            attrs: { role: 'radiogroup', 'aria-label': 'Scale type' }
        });
        els.modeChips = MODES.map((m) => {
            const b = DOM.create('button', {
                className: 'chip-btn ta-radio',
                text: m.label,
                attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1', title: m.title },
                data: { value: m.id }
            });
            els.modeGroup.appendChild(b);
            return b;
        });
        root.appendChild(els.modeGroup);

        // Steps stepper
        const stepsRow = DOM.create('div', { className: 'ta-row scl-steps' });
        stepsRow.appendChild(DOM.create('span', { className: 'mini-label', text: 'Steps', attrs: { id: 'scl-steps-label' } }));
        const stepper = DOM.create('div', {
            className: 'stepper scl-stepper',
            attrs: { role: 'group', 'aria-labelledby': 'scl-steps-label' }
        });
        els.minus = DOM.create('button', {
            className: 'stepper-btn',
            text: '−',
            attrs: { type: 'button', 'aria-label': 'Fewer steps', title: 'Fewer steps' },
            data: { dir: 'down' }
        });
        els.stepsValue = DOM.create('span', { className: 'stepper-value', attrs: { 'aria-live': 'polite' } });
        els.plus = DOM.create('button', {
            className: 'stepper-btn',
            text: '+',
            attrs: { type: 'button', 'aria-label': 'More steps', title: 'More steps' },
            data: { dir: 'up' }
        });
        stepper.appendChild(els.minus);
        stepper.appendChild(els.stepsValue);
        stepper.appendChild(els.plus);
        stepsRow.appendChild(stepper);
        els.stepsNote = DOM.create('span', { className: 'ta-note scl-steps-note' });
        stepsRow.appendChild(els.stepsNote);
        root.appendChild(stepsRow);

        // List
        els.list = DOM.create('ol', { className: 'scl-list', attrs: { 'aria-label': 'Scale steps' } });
        root.appendChild(els.list);
        root.appendChild(DOM.create('p', {
            className: 'ta-note scl-legend',
            text: 'Ratios are against white and black text; ✓ reaches AA (4.5:1). Click a step to make it the active color.'
        }));

        const actions = DOM.create('div', { className: 'ta-row ta-actions' });
        els.addAll = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Add all to palette',
            attrs: { type: 'button', title: 'Append every step to the working palette' }
        });
        els.replace = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Replace palette',
            attrs: { type: 'button', title: 'Make this scale the whole working palette' }
        });
        els.copyCss = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Copy as CSS variables',
            attrs: { type: 'button' }
        });
        actions.appendChild(els.addAll);
        actions.appendChild(els.replace);
        actions.appendChild(els.copyCss);
        root.appendChild(actions);

        els.feedback = DOM.create('div', { className: 'tool-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.feedback);

        mount.appendChild(root);
        els.root = root;
    }

    function wire() {
        DOM.on(els.modeGroup, 'click', (e) => {
            const b = e.target.closest('.ta-radio');
            if (b) ScaleUI.setMode(b.dataset.value);
        });
        DOM.on(els.modeGroup, 'keydown', (e) => {
            const i = els.modeChips.indexOf(document.activeElement);
            if (i < 0) return;
            let next = -1;
            const n = els.modeChips.length;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = n - 1;
            if (next < 0) return;
            e.preventDefault();
            els.modeChips[next].focus();
            ScaleUI.setMode(els.modeChips[next].dataset.value);
        });

        DOM.on(els.minus, 'click', () => ScaleUI.setSteps(prefs().steps - 1));
        DOM.on(els.plus, 'click', () => ScaleUI.setSteps(prefs().steps + 1));

        DOM.on(els.list, 'click', (e) => {
            const copy = e.target.closest('.scl-copy');
            if (copy) {
                if (window.ToolApp) ToolApp.copy(shown(copy.dataset.hex), shown(copy.dataset.hex), copy);
                return;
            }
            const row = e.target.closest('.scl-pick');
            if (row) pick(row.dataset.hex, row);
        });

        DOM.on(els.addAll, 'click', () => ScaleUI.addAll());
        DOM.on(els.replace, 'click', () => ScaleUI.replacePalette());
        DOM.on(els.copyCss, 'click', () => ScaleUI.copyCss());
    }

    /* ── Render ────────────────────────────────────────────── */

    function ratioSpan(prefix, r) {
        const ok = r + 1e-9 >= 4.5;
        const span = DOM.create('span', {
            className: 'scl-ratio',
            text: `${prefix} ${ratioText(r)}${ok ? ' ✓' : ''}`
        });
        span.dataset.tone = ok ? 'pass' : 'fail';
        return span;
    }

    function rowItem() {
        const li = DOM.create('li', { className: 'scl-row' });
        const pickBtn = DOM.create('button', { className: 'scl-pick', attrs: { type: 'button' } });
        const sw = DOM.create('span', { className: 'swatch scl-swatch', attrs: { 'aria-hidden': 'true' } });
        const label = DOM.create('span', { className: 'scl-label' });
        const hex = DOM.create('span', { className: 'scl-hex' });
        const ratios = DOM.create('span', { className: 'scl-ratios' });
        pickBtn.appendChild(sw);
        pickBtn.appendChild(label);
        pickBtn.appendChild(hex);
        pickBtn.appendChild(ratios);
        const copy = DOM.create('button', {
            className: 'icon-action scl-copy',
            html: COPY_ICON,
            attrs: { type: 'button' }
        });
        li.appendChild(pickBtn);
        li.appendChild(copy);
        return li;
    }

    function renderList(rows) {
        const host = els.list;
        while (host.children.length < rows.length) host.appendChild(rowItem());
        while (host.children.length > rows.length) host.lastElementChild.remove();
        const activeHex = hexOf(State.getActive());
        rows.forEach((r, i) => {
            const li = host.children[i];
            const [pickBtn, copy] = li.children;
            const [sw, label, hex, ratios] = pickBtn.children;
            sw.style.setProperty('--c', r.hex);
            label.textContent = r.display;
            if (r.base) {
                label.appendChild(DOM.create('span', { className: 'badge scl-base', text: 'Base', attrs: { 'data-tone': 'brand' } }));
            }
            hex.textContent = shown(r.hex);
            ratios.textContent = '';
            ratios.appendChild(ratioSpan('W', r.onWhite));
            ratios.appendChild(ratioSpan('B', r.onBlack));
            ratios.title = `Against white ${ratioText(r.onWhite)}:1 · against black ${ratioText(r.onBlack)}:1`;
            li.dataset.base = String(r.base);
            const isActive = r.hex === activeHex;
            pickBtn.dataset.hex = r.hex;
            if (isActive) pickBtn.setAttribute('aria-current', 'true');
            else pickBtn.removeAttribute('aria-current');
            const what = `${r.display}${r.base ? ' (base)' : ''}, ${shown(r.hex)}, ${ratioText(r.onWhite)} to 1 against white, ${ratioText(r.onBlack)} to 1 against black`;
            pickBtn.setAttribute('aria-label', isActive ? `${what}. This is the active color` : `${what}. Make it the active color`);
            pickBtn.title = isActive ? `${shown(r.hex)} is the active color` : `Make ${shown(r.hex)} the active color`;
            copy.dataset.hex = r.hex;
            copy.setAttribute('aria-label', `Copy ${shown(r.hex)}`);
            copy.title = `Copy ${shown(r.hex)}`;
        });
    }

    function render() {
        if (!els.root) return;
        const p = prefs();
        els.modeChips.forEach((b) => {
            const on = b.dataset.value === p.mode;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });

        const tw = p.mode === 'tailwind';
        els.minus.disabled = tw || p.steps <= STEPS_MIN;
        els.plus.disabled = tw || p.steps >= STEPS_MAX;
        if (tw) {
            els.stepsValue.textContent = '11 steps';
            els.stepsNote.textContent = 'Tailwind always has 11.';
        } else if (p.mode === 'both') {
            els.stepsValue.textContent = `${p.steps} per side`;
            els.stepsNote.textContent = `${2 * p.steps - 1} colors in all.`;
        } else {
            els.stepsValue.textContent = plural(p.steps, 'step');
            els.stepsNote.textContent = p.mode === 'tints' ? 'From the color toward white.' : 'From the color toward black.';
        }

        let rows = [];
        try {
            rows = computeScale(State.getActive(), p.mode, p.steps);
        } catch (err) {
            console.error('[ScaleUI] scale failed:', err);
        }
        current = rows;
        renderList(rows);

        const prefix = State.settings().exportPrefix || 'color';
        els.copyCss.title = `Copy ${plural(rows.length, 'line')} such as --${prefix}-${rows[0] ? rows[0].cssKey : '500'}: ${rows[0] ? shown(rows[0].hex) : '#…'};`;
        els.addAll.disabled = !rows.length;
        els.replace.disabled = !rows.length;
        els.copyCss.disabled = !rows.length;
    }

    /* ── Actions ───────────────────────────────────────────── */

    function pick(hex, row) {
        if (!hex) return;
        const before = hexOf(State.getActive());
        if (hex === before) {
            setFeedback('info', `${shown(hex)} is already the active color.`);
            return;
        }
        if (window.ToolApp && row) ToolApp.flash(row);
        if (State.setActive(hex, { source: 'scale' })) {
            setFeedback('success', `Active color is now ${shown(hex)} (was ${shown(before)}). The scale is rebuilt around it; Ctrl+Z goes back.`);
        } else {
            setFeedback('error', State.lastError || 'That color could not be used.');
        }
    }

    function uniqueEntries() {
        const seen = new Set();
        const out = [];
        current.forEach((r) => {
            if (!r.hex || seen.has(r.hex)) return;
            seen.add(r.hex);
            out.push({ hex: r.hex, name: r.name });
        });
        return out;
    }

    function modeLabel() {
        const m = MODES.find((x) => x.id === prefs().mode) || MODES[0];
        return m.id === 'tailwind' ? 'Tailwind scale' : m.label;
    }

    /* ── Public API ────────────────────────────────────────── */

    const ScaleUI = {
        init() {
            const mount = DOM.id('mount-scale');
            if (!mount) return;
            if (!engineReady()) {
                mount.textContent = '';
                mount.appendChild(DOM.create('div', {
                    className: 'empty-state ta-empty',
                    children: [
                        DOM.create('p', { className: 'empty-title', text: 'Shades & Tints are unavailable' }),
                        DOM.create('p', { className: 'empty-text', text: 'The color engine (js/color.js) did not load. Reload the page to try again.' })
                    ]
                }));
                return;
            }
            build(mount);
            wire();
            schedule = makeScheduler(mount.closest('.tool-section'), render);
            State.on('active', ({ source } = {}) => {
                if (source !== 'scale') setFeedback(null);
                schedule();
            });
            State.on('settings', schedule);
            State.on('reset', () => { setFeedback(null); schedule(); });
            render();
        },

        refresh() {
            render();
        },

        /** 'tailwind' | 'tints' | 'shades' | 'both'. Persists. */
        setMode(mode) {
            if (!MODES.some((m) => m.id === mode)) return false;
            if (prefs().mode !== mode) {
                State.setPane(PANE, { mode });
                setFeedback(null);
            }
            render();
            return true;
        },

        /** 3–15 (per side in 'both'). Ignored by Tailwind. Persists. */
        setSteps(n) {
            const v = Math.round(Number(n));
            if (!Number.isFinite(v)) return false;
            const steps = Math.min(STEPS_MAX, Math.max(STEPS_MIN, v));
            State.setPane(PANE, { steps });
            render();
            return steps;
        },

        /** The current scale: [{ label, display, cssKey, hex, base, onWhite, onBlack }]. */
        entries() {
            if (!els.root) return [];
            render();
            return current.map((r) => ({ ...r }));
        },

        /** '--{prefix}-{step}: #hex;' lines for the current scale. */
        cssVariables() {
            if (!els.root) return '';
            render();
            const prefix = State.settings().exportPrefix || 'color';
            return current.map((r) => `--${prefix}-${r.cssKey}: ${shown(r.hex)};`).join('\n');
        },

        copyCss() {
            const text = ScaleUI.cssVariables();
            if (!text) return Promise.resolve(false);
            if (!window.ToolApp) return Promise.resolve(false);
            return ToolApp.copy(text, `${plural(current.length, 'CSS variable')}`, els.copyCss).then((ok) => {
                if (ok) {
                    const first = text.split('\n')[0];
                    setFeedback('success', `Copied ${plural(current.length, 'CSS variable')}, starting ${first}`);
                } else {
                    setFeedback('error', 'Copying failed. Your browser blocked the clipboard; try again after clicking the page.');
                }
                return ok;
            });
        },

        /** Append every step to the working palette, skipping colors already there. */
        addAll() {
            if (!els.root) return 0;
            render();
            const entries = uniqueEntries();
            if (!entries.length) return 0;
            const w = State.working();
            const have = new Set(w.colors.map((c) => c.hex));
            const fresh = entries.filter((e) => !have.has(e.hex));
            const skipped = entries.length - fresh.length;
            if (!fresh.length) {
                setFeedback('info', `The working palette already has all ${plural(entries.length, 'color')} of this scale.`);
                return 0;
            }
            const room = State.LIMITS.colors - w.colors.length;
            if (fresh.length > room) {
                setFeedback('warn', `The working palette has room for ${plural(Math.max(0, room), 'more color')} (the limit is ${State.LIMITS.colors}). Remove some colors first.`);
                return 0;
            }
            if (!State.setWorking(w.colors.concat(fresh), w.name, w.id)) {
                setFeedback('error', State.lastError || 'The colors could not be added.');
                return 0;
            }
            if (window.ToolApp) ToolApp.flash(els.addAll);
            const tail = skipped ? ` (${skipped} already there)` : '';
            setFeedback('success', `Added ${plural(fresh.length, 'color')} to “${w.name}”${tail}.`);
            return fresh.length;
        },

        /** Make the scale the whole working palette; asks first when unsaved work would be lost. */
        async replacePalette() {
            if (!els.root) return false;
            render();
            const entries = uniqueEntries();
            if (!entries.length) return false;
            const w = State.working();
            const label = modeLabel();
            /* Ask only when unsaved work would be lost (WorkingUI knows); without
               it, ask whenever the palette has colors. */
            if (window.WorkingUI && typeof WorkingUI.confirmReplace === 'function') {
                const ok = await WorkingUI.confirmReplace({
                    title: 'Replace the working palette?',
                    action: `Using this ${label === 'Tints + shades' ? 'tints and shades scale' : label.toLowerCase()}`,
                    confirmLabel: 'Replace palette'
                });
                if (!ok) return false;
            } else if (w.colors.length && window.Dialogs) {
                const ok = await Dialogs.confirm({
                    title: 'Replace the working palette?',
                    message: `This swaps the ${plural(w.colors.length, 'color')} in “${w.name}” for the ${plural(entries.length, 'color')} of this ${label.toLowerCase()}. Palettes saved in the library are not changed.`,
                    confirmLabel: 'Replace palette',
                    danger: true
                });
                if (!ok) return false;
            }
            const base = shown(hexOf(State.getActive()));
            if (!State.setWorking(entries, `${label} of ${base}`)) {
                setFeedback('error', State.lastError || 'The working palette could not be replaced.');
                return false;
            }
            if (window.ToolApp) ToolApp.flash(els.replace);
            setFeedback('success', `The working palette is now the ${plural(entries.length, 'color')} of this ${label.toLowerCase()}.`);
            notify('Working palette replaced', 'success', 1400);
            return true;
        }
    };

    window.ScaleUI = ScaleUI;
})();
