/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: AdjustUI (colorMan Edition - v1.0)
 *     - File Name: adjust.js
 *     - Relative Path: tools/colorman/js/ui/adjust.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Adjust pane in the Tools rail: a grid of tiles that lighten,
 *     darken, saturate, desaturate, rotate, invert, grey out, complement, or
 *     make opaque the active color in perceptual OKLCH steps. A toggle
 *     points the same tiles at every color in the working palette instead,
 *     so a whole palette can be shifted in one click and undone just as fast.
 *
 * ✒ Key Features:
 *     - Amount slider (1–50%, arrow keys step by 1) that sets the lightness
 *       step, the chroma step, and the hue rotation (amount × 3.6°)
 *     - Ten tiles in the house tool-tile style: Lighten, Darken, Saturate,
 *       Desaturate, Hue +, Hue −, Invert, Grayscale, Complement, Opaque
 *     - Each tile previews its result for the active color in a small chip
 *       and in its tooltip and accessible name, before you click
 *     - Feedback line after every change: "Lighten 10%: #C9A84C → #D8B65A"
 *     - Plain explanations when a tile changes nothing (already white,
 *       already grey, already opaque)
 *     - "Apply to working palette" maps every working color, keeps names
 *       and the library link, and reports "Adjusted 6 colors"
 *     - One-click Undo for a palette-wide change; active-color changes use
 *       the shared Ctrl+Z history (source 'adjust')
 *     - Amount and target persist per browser through State.pane('adjust')
 *     - Renders only while the pane is open; catches up when it opens
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js. ToolApp.boot
 *     calls AdjustUI.init(), which builds the pane inside #mount-adjust and
 *     subscribes to State events. AdjustUI.apply(id) runs a tile from code.
 *
 * ✒ Examples:
 *     AdjustUI.apply('lighten')             → active #C9A84C becomes #EAC86D (10%)
 *     AdjustUI.setAmount(25)                → tiles now step by 25% (hue ±90°)
 *     AdjustUI.setScope('working')          → tiles now change every palette color
 *     AdjustUI.apply('grayscale')           → "Adjusted 6 colors" in working mode
 *     AdjustUI.apply('opaque')              → #1B2A4A80 becomes #1B2A4A
 *     AdjustUI.undoWorking()                → puts the palette back after a change
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (Color.lighten/darken/saturate/desaturate/
 *       rotate/invert/grayscale/complement/setAlpha), js/state.js (State),
 *       shared/js/dom.js, toolapp.js (ToolApp.flash), toolman.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: palette Undo covers the most recent palette-wide change
 *       only, and is cleared when anything else edits the working palette
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'adjust';
    const AMOUNT_MIN = 1;
    const AMOUNT_MAX = 50;
    const AMOUNT_DEFAULT = 10;

    const degrees = (amount) => {
        const d = Math.round(amount * 3.6 * 10) / 10;
        return Number.isInteger(d) ? String(d) : d.toFixed(1);
    };

    /**
     * Tiles. run(color, amount%) → Color. noop(hex) explains a change that
     * did nothing. usesAmount marks the tiles the slider affects.
     */
    const OPS = [
        {
            id: 'lighten', cat: 'Lightness', usesAmount: true,
            label: () => 'Lighten', verb: (a) => `Lighten ${a}%`,
            run: (c, a) => Color.lighten(c, a / 100),
            noop: (hex) => `${hex} is already as light as it can get.`
        },
        {
            id: 'darken', cat: 'Lightness', usesAmount: true,
            label: () => 'Darken', verb: (a) => `Darken ${a}%`,
            run: (c, a) => Color.darken(c, a / 100),
            noop: (hex) => `${hex} is already as dark as it can get.`
        },
        {
            id: 'saturate', cat: 'Chroma', usesAmount: true,
            label: () => 'Saturate', verb: (a) => `Saturate ${a}%`,
            run: (c, a) => Color.saturate(c, a / 100),
            noop: (hex) => `${hex} has no hue to strengthen, or is already as vivid as screens can show.`
        },
        {
            id: 'desaturate', cat: 'Chroma', usesAmount: true,
            label: () => 'Desaturate', verb: (a) => `Desaturate ${a}%`,
            run: (c, a) => Color.desaturate(c, a / 100),
            noop: (hex) => `${hex} is already a neutral grey.`
        },
        {
            id: 'hue-up', cat: 'Hue', usesAmount: true,
            label: (a) => `Hue +${degrees(a)}°`, verb: (a) => `Hue +${degrees(a)}°`,
            run: (c, a) => Color.rotate(c, a * 3.6),
            noop: (hex) => `${hex} is a neutral grey, so rotating its hue changes nothing.`
        },
        {
            id: 'hue-down', cat: 'Hue', usesAmount: true,
            label: (a) => `Hue −${degrees(a)}°`, verb: (a) => `Hue −${degrees(a)}°`,
            run: (c, a) => Color.rotate(c, -a * 3.6),
            noop: (hex) => `${hex} is a neutral grey, so rotating its hue changes nothing.`
        },
        {
            id: 'invert', cat: 'Tone',
            label: () => 'Invert', verb: () => 'Invert',
            run: (c) => Color.invert(c),
            noop: (hex) => `${hex} is its own inverse.`
        },
        {
            id: 'grayscale', cat: 'Tone',
            label: () => 'Grayscale', verb: () => 'Grayscale',
            run: (c) => Color.grayscale(c),
            noop: (hex) => `${hex} is already grey.`
        },
        {
            id: 'complement', cat: 'Tone',
            label: () => 'Complement', verb: () => 'Complement',
            run: (c) => Color.complement(c),
            noop: (hex) => `${hex} is a neutral grey, so its complement is itself.`
        },
        {
            id: 'opaque', cat: 'Alpha',
            label: () => 'Opaque', verb: () => 'Opaque',
            run: (c) => Color.setAlpha(c, 1),
            noop: (hex) => `${hex} is already fully opaque.`
        }
    ];

    const els = {};
    let undoSnapshot = null;    // { colors, name, id } before the last palette-wide change
    let ownWrite = false;       // true while this pane writes the working palette
    let schedule = () => {};

    /* ── Helpers ───────────────────────────────────────────── */

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const engineReady = () => Boolean(window.Color && typeof Color.lighten === 'function'
        && typeof Color.setAlpha === 'function');

    /** '#RRGGBB' / '#RRGGBBAA' (upper) for any color, or ''. */
    const hexOf = (c) => State.hexOf(c) || '';

    /** A hex in the case Settings asks for. */
    function shown(hex) {
        if (!hex) return '';
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function prefs() {
        const p = State.pane(PANE);
        const amount = Math.round(Number(p.amount));
        return {
            amount: Number.isFinite(amount) ? Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, amount)) : AMOUNT_DEFAULT,
            scope: p.scope === 'working' ? 'working' : 'active'
        };
    }

    /** Render through rAF, and only while the pane is open; catch up when it opens. */
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

    function setFeedback(state, text, withUndo = false) {
        const fb = els.feedback;
        if (!fb) return;
        if (!state) {
            delete fb.dataset.state;
            els.feedbackText.textContent = '';
            els.undo.hidden = true;
            return;
        }
        fb.dataset.state = state;
        els.feedbackText.textContent = text;
        els.undo.hidden = !withUndo;
    }

    function safeRun(op, color, amount) {
        try {
            return op.run(color, amount);
        } catch (err) {
            console.error(`[AdjustUI] ${op.id} failed:`, err);
            return null;
        }
    }

    /* ── Build ─────────────────────────────────────────────── */

    function build(mount) {
        mount.textContent = '';
        const root = DOM.create('div', { className: 'ta-pane adj' });

        root.appendChild(DOM.create('p', {
            className: 'pane-hint',
            text: 'Each tile changes the active color in even perceptual (OKLCH) steps. Ctrl+Z undoes a change.'
        }));

        // Amount slider
        const amountWrap = DOM.create('div', { className: 'adj-amount' });
        const head = DOM.create('div', { className: 'ta-field-head' });
        head.appendChild(DOM.create('label', { className: 'mini-label', text: 'Amount', attrs: { for: 'adj-amount' } }));
        els.amountOut = DOM.create('output', { className: 'ta-value', attrs: { for: 'adj-amount', id: 'adj-amount-value' } });
        head.appendChild(els.amountOut);
        amountWrap.appendChild(head);
        els.amount = DOM.create('input', {
            className: 'range-input adj-range',
            id: 'adj-amount',
            attrs: {
                type: 'range', min: String(AMOUNT_MIN), max: String(AMOUNT_MAX), step: '1',
                'aria-describedby': 'adj-amount-detail'
            }
        });
        amountWrap.appendChild(els.amount);
        els.amountDetail = DOM.create('p', { className: 'ta-note', id: 'adj-amount-detail' });
        amountWrap.appendChild(els.amountDetail);
        root.appendChild(amountWrap);

        // Scope toggle + target line
        const scopeRow = DOM.create('div', { className: 'ta-row adj-scope' });
        els.scope = DOM.create('button', {
            className: 'chip-btn ta-toggle',
            text: 'Apply to working palette',
            attrs: {
                type: 'button',
                'aria-pressed': 'false',
                title: 'When on, the tiles change every color in the working palette instead of the active color'
            }
        });
        scopeRow.appendChild(els.scope);
        root.appendChild(scopeRow);
        els.target = DOM.create('p', { className: 'ta-note adj-target', attrs: { 'aria-live': 'polite' } });
        root.appendChild(els.target);

        // Tiles
        els.grid = DOM.create('div', { className: 'tool-grid-buttons adj-grid', attrs: { role: 'group', 'aria-label': 'Adjustments' } });
        els.tiles = {};
        OPS.forEach((op) => {
            const tile = DOM.create('button', {
                className: 'tool-action-btn adj-tile',
                attrs: { type: 'button' },
                data: { op: op.id }
            });
            const label = DOM.create('span', { className: 'btn-label' });
            const cat = DOM.create('span', { className: 'btn-category', text: op.cat });
            const dot = DOM.create('span', { className: 'adj-preview', attrs: { 'aria-hidden': 'true' } });
            tile.appendChild(label);
            tile.appendChild(cat);
            tile.appendChild(dot);
            els.grid.appendChild(tile);
            els.tiles[op.id] = { tile, label, dot };
        });
        root.appendChild(els.grid);

        // Feedback with an Undo for palette-wide changes
        els.feedback = DOM.create('div', { className: 'tool-feedback ta-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        els.feedbackText = DOM.create('span', { className: 'ta-feedback-text' });
        els.undo = DOM.create('button', {
            className: 'row-btn ta-feedback-action',
            text: 'Undo',
            attrs: { type: 'button', title: 'Put the working palette back the way it was' }
        });
        els.undo.hidden = true;
        els.feedback.appendChild(els.feedbackText);
        els.feedback.appendChild(els.undo);
        root.appendChild(els.feedback);

        mount.appendChild(root);
        els.root = root;
    }

    function wire() {
        DOM.on(els.amount, 'input', () => {
            const v = Number(els.amount.value);
            State.pane(PANE).amount = v;   // live value; persisted on 'change'
            renderAmount(v);
            schedule();
        });
        DOM.on(els.amount, 'change', () => AdjustUI.setAmount(Number(els.amount.value)));

        DOM.on(els.scope, 'click', () => {
            AdjustUI.setScope(prefs().scope === 'working' ? 'active' : 'working');
        });

        DOM.on(els.grid, 'click', (e) => {
            const tile = e.target.closest('.adj-tile');
            if (tile && els.grid.contains(tile)) AdjustUI.apply(tile.dataset.op, tile);
        });

        DOM.on(els.undo, 'click', () => AdjustUI.undoWorking());
    }

    /* ── Render ────────────────────────────────────────────── */

    function renderAmount(amount) {
        if (els.amount.value !== String(amount)) els.amount.value = String(amount);
        els.amountOut.textContent = `${amount}%`;
        els.amount.setAttribute('aria-valuetext', `${amount} percent`);
        const chroma = (amount / 100) * 0.4;
        els.amountDetail.textContent = `Lightness ±${(amount / 100).toFixed(2)} · Chroma ±${chroma.toFixed(3)} · Hue ±${degrees(amount)}°`;
    }

    function renderScope(p, w) {
        const working = p.scope === 'working';
        els.scope.setAttribute('aria-pressed', String(working));
        els.root.dataset.scope = p.scope;
        if (!working) {
            els.target.textContent = `Changing the active color, ${shown(hexOf(State.getActive()))}.`;
        } else if (!w.colors.length) {
            els.target.textContent = 'Changing the working palette, which is empty. Add colors with the + button or the A key.';
        } else {
            els.target.textContent = `Changing all ${plural(w.colors.length, 'color')} in “${w.name}”.`;
        }
    }

    function render() {
        if (!els.root) return;
        const p = prefs();
        const w = State.working();
        renderAmount(p.amount);
        renderScope(p, w);

        const active = State.getActive();
        const fromHex = hexOf(active);
        OPS.forEach((op) => {
            const { tile, label, dot } = els.tiles[op.id];
            const text = op.label(p.amount);
            if (label.textContent !== text) label.textContent = text;
            if (p.scope === 'working') {
                const n = w.colors.length;
                const name = `${op.verb(p.amount)} every color in the working palette`;
                tile.setAttribute('aria-label', n ? `${name} (${plural(n, 'color')})` : `${name} (the palette is empty)`);
                tile.title = tile.getAttribute('aria-label');
                dot.style.removeProperty('--c');
                return;
            }
            const out = safeRun(op, active, p.amount);
            const toHex = out ? hexOf(out) : '';
            if (toHex) dot.style.setProperty('--c', toHex);
            const same = !toHex || toHex === fromHex;
            tile.dataset.noop = String(same);
            const desc = same
                ? `${op.verb(p.amount)}: no change for ${shown(fromHex)}`
                : `${op.verb(p.amount)}: ${shown(fromHex)} → ${shown(toHex)}`;
            tile.setAttribute('aria-label', desc);
            tile.title = desc;
        });
    }

    /* ── Actions ───────────────────────────────────────────── */

    function applyToActive(op, amount) {
        const before = State.getActive();
        const fromHex = hexOf(before);
        const out = safeRun(op, before, amount);
        const toHex = out ? hexOf(out) : '';
        if (!toHex) {
            setFeedback('error', `${op.verb(amount)} could not be applied to ${shown(fromHex)}.`);
            return false;
        }
        if (toHex === fromHex) {
            setFeedback('info', `No change. ${op.noop(shown(fromHex))}`);
            return false;
        }
        if (!State.setActive(out, { source: 'adjust' })) {
            setFeedback('error', State.lastError || `${op.verb(amount)} could not be applied.`);
            return false;
        }
        setFeedback('success', `${op.verb(amount)}: ${shown(fromHex)} → ${shown(toHex)}`);
        return true;
    }

    function applyToWorking(op, amount) {
        const w = State.working();
        if (!w.colors.length) {
            setFeedback('warn', 'The working palette is empty. Add colors with the + button or the A key, or turn off “Apply to working palette”.');
            return false;
        }
        let changed = 0;
        let failed = 0;
        const next = w.colors.map((entry) => {
            const c = State.colorOf(entry.hex);
            const out = c ? safeRun(op, c, amount) : null;
            const hex = out ? hexOf(out) : '';
            if (!hex) { failed++; return { hex: entry.hex, name: entry.name }; }
            if (hex !== entry.hex) changed++;
            return { hex, name: entry.name };
        });
        if (!changed) {
            setFeedback('info', failed
                ? `${op.verb(amount)} could not change any color in the working palette.`
                : `No change. Every color in the working palette is already at the limit for ${op.verb(amount).toLowerCase()}.`);
            return false;
        }
        ownWrite = true;
        let ok = false;
        try {
            ok = State.setWorking(next, w.name, w.id);
        } finally {
            ownWrite = false;
        }
        if (!ok) {
            setFeedback('error', State.lastError || 'The working palette could not be changed.');
            return false;
        }
        undoSnapshot = { colors: w.colors, name: w.name, id: w.id };
        const unchanged = w.colors.length - changed;
        const tail = unchanged ? ` (${unchanged} already at the limit)` : '';
        setFeedback('success', `${op.verb(amount)}: adjusted ${plural(changed, 'color')}${tail}.`, true);
        return true;
    }

    /* ── Public API ────────────────────────────────────────── */

    const AdjustUI = {
        init() {
            const mount = DOM.id('mount-adjust');
            if (!mount) return;
            if (!engineReady()) {
                mount.textContent = '';
                mount.appendChild(DOM.create('div', {
                    className: 'empty-state ta-empty',
                    children: [
                        DOM.create('p', { className: 'empty-title', text: 'Adjust is unavailable' }),
                        DOM.create('p', { className: 'empty-text', text: 'The color engine (js/color.js) did not load. Reload the page to try again.' })
                    ]
                }));
                return;
            }
            build(mount);
            wire();
            schedule = makeScheduler(mount.closest('.tool-section'), render);

            State.on('active', schedule);
            State.on('settings', schedule);
            State.on('working', () => {
                if (!ownWrite && undoSnapshot) {
                    undoSnapshot = null;
                    if (!els.undo.hidden) setFeedback(null);
                }
                schedule();
            });
            State.on('reset', () => {
                undoSnapshot = null;
                setFeedback(null);
                schedule();
            });
            render();
        },

        /** Re-render now (for example after the pane becomes visible). */
        refresh() {
            render();
        },

        /** Set the step size, 1–50 (%). Persists. */
        setAmount(value) {
            const n = Math.round(Number(value));
            if (!Number.isFinite(n)) return false;
            const amount = Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, n));
            State.setPane(PANE, { amount });
            render();
            return amount;
        },

        /** 'active' (the active color) or 'working' (every working palette color). Persists. */
        setScope(scope) {
            const next = scope === 'working' ? 'working' : 'active';
            State.setPane(PANE, { scope: next });
            setFeedback(null);
            render();
            return next;
        },

        /** Run a tile by id ('lighten', 'hue-up', 'opaque', …); tile is the button to flash. */
        apply(id, tile) {
            const op = OPS.find((o) => o.id === id);
            if (!op || !els.root) return false;
            const p = prefs();
            if (window.ToolApp && tile) ToolApp.flash(tile);
            const ok = p.scope === 'working' ? applyToWorking(op, p.amount) : applyToActive(op, p.amount);
            render();
            return ok;
        },

        /** Put the working palette back as it was before the last palette-wide change. */
        undoWorking() {
            if (!undoSnapshot) {
                setFeedback('info', 'There is no palette change to undo.');
                return false;
            }
            const snap = undoSnapshot;
            ownWrite = true;
            let ok = false;
            try {
                ok = State.setWorking(snap.colors, snap.name, snap.id);
            } finally {
                ownWrite = false;
            }
            undoSnapshot = null;
            if (ok) {
                setFeedback('info', `Restored the working palette (${plural(snap.colors.length, 'color')}).`);
                notify('Working palette restored', 'info', 1400);
            } else {
                setFeedback('error', State.lastError || 'The working palette could not be restored.');
            }
            render();
            return ok;
        },

        ops: OPS.map((op) => op.id)
    };

    window.AdjustUI = AdjustUI;
})();
