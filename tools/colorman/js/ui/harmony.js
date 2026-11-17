/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HarmonyUI (colorMan Edition - v1.0)
 *     - File Name: harmony.js
 *     - Relative Path: tools/colorman/js/ui/harmony.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Harmonies pane in the Tools rail: it builds a color scheme from the
 *     active color (complementary, analogous, triadic, split complementary,
 *     tetradic, square, or monochromatic) and shows it as large labelled
 *     swatches beside a small hue wheel. Click a swatch to make it the active
 *     color, or send the whole set to the working palette.
 *
 * ✒ Key Features:
 *     - Seven harmony kinds as a radio group: arrow keys, Home, and End move
 *       and choose; the choice persists
 *     - Hue math in OKLCH (even perceived steps) or HSL (the classic color
 *       wheel), switchable the same way
 *     - Large swatches labelled with hex and their hue offset (+120°) or
 *       lightness (L 52%); the base color is marked "Base", not by color alone
 *     - Hue wheel showing where each color sits and the shape they make;
 *       monochromatic sets are placed by lightness instead
 *     - Click any swatch to make it the active color (Ctrl+Z goes back)
 *     - "Add to palette" appends the set and skips colors already there
 *     - "Replace palette" swaps the working palette for the set, after a
 *       confirmation when unsaved work would be lost
 *     - A plain note when the active color is a neutral grey, whose hue
 *       harmonies all repeat the same grey
 *     - Renders only while the pane is open and updates swatches in place,
 *       so keyboard focus is kept
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js. ToolApp.boot
 *     calls HarmonyUI.init(), which builds the pane inside #mount-harmony.
 *     HarmonyUI.setKind('triadic') and HarmonyUI.setSpace('hsl') change the
 *     scheme from code; HarmonyUI.colors() returns the current set as hex.
 *
 * ✒ Examples:
 *     HarmonyUI.setKind('complementary')    → base plus its opposite hue
 *     HarmonyUI.setKind('analogous')        → −60°, −30°, base, +30°, +60°
 *     HarmonyUI.setSpace('hsl')             → offsets on the HSL wheel
 *     HarmonyUI.colors()                    → ['#C9A84C', '#33C0D4', '#D590D0'] (triadic)
 *     HarmonyUI.addToPalette()              → appends the set to the working palette
 *     HarmonyUI.replacePalette()            → asks first when unsaved work would be lost
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (Color.harmony, HARMONIES, toOklch, toHsl,
 *       fromOklch, fromHsl, isAchromatic), js/state.js (State), shared/js/
 *       dom.js, dialogs.js (Dialogs.confirm), toolapp.js, toolman.js;
 *       js/ui/working.js (WorkingUI.confirmReplace) when present
 *     - Compatible platforms: all evergreen browsers; the wheel's ring uses
 *       CSS masks (it shows as a full disc behind the dots without them)
 *     - Limitations: colors that land outside sRGB are brought into range
 *       by the engine, so a very vivid base can give softer partners
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'harmony';

    const KINDS = [
        { id: 'complementary', label: 'Complementary', hint: 'The opposite hue: the strongest contrast two hues can make.' },
        { id: 'analogous', label: 'Analogous', hint: 'Neighbours 30° and 60° either side: calm and cohesive.' },
        { id: 'triadic', label: 'Triadic', hint: 'Three hues 120° apart: balanced and lively.' },
        { id: 'split', label: 'Split', hint: 'The base plus the two hues beside its opposite: contrast with less tension.' },
        { id: 'tetradic', label: 'Tetradic', hint: 'Two complementary pairs 60° apart: rich, so let one color lead.' },
        { id: 'square', label: 'Square', hint: 'Four hues 90° apart: even and bold.' },
        { id: 'monochromatic', label: 'Monochromatic', hint: 'One hue at five lightness steps: quiet and unified.' }
    ];

    const SPACES = [
        { id: 'oklch', label: 'OKLCH', title: 'Perceptual hue: even-looking steps around the wheel' },
        { id: 'hsl', label: 'HSL', title: 'The classic color wheel used by most design tools' }
    ];

    const els = {};
    const ringCache = {};
    let current = [];           // [{ hex, tag, name, base, hue, l }]
    let schedule = () => {};

    /* ── Helpers ───────────────────────────────────────────── */

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const engineReady = () => Boolean(window.Color && typeof Color.harmony === 'function'
        && typeof Color.toOklch === 'function' && typeof Color.toHsl === 'function');

    const hexOf = (c) => State.hexOf(c) || '';

    function shown(hex) {
        if (!hex) return '';
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function prefs() {
        const p = State.pane(PANE);
        return {
            kind: KINDS.some((k) => k.id === p.kind) ? p.kind : 'complementary',
            space: p.space === 'hsl' ? 'hsl' : 'oklch'
        };
    }

    const kindDef = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

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

    const signed = (deg) => `${deg > 0 ? '+' : '−'}${Math.abs(deg)}°`;

    /** The harmony set for a color, in display order, with tags and wheel positions. */
    function computeSet(color, kind, space) {
        const list = Color.harmony(color, kind, { space });
        const def = Color.HARMONIES && Color.HARMONIES[kind];
        const label = kindDef(kind).label;
        const hueOf = (c) => {
            const v = space === 'hsl' ? Color.toHsl(c).h : Color.toOklch(c).h;
            return Number.isFinite(v) ? v : 0;
        };
        const lightOf = (c) => (space === 'hsl' ? Color.toHsl(c).l / 100 : Color.toOklch(c).l);

        if (def && Array.isArray(def.offsets)) {
            const items = list.map((c, i) => ({ color: c, offset: def.offsets[i] || 0, base: i === 0 }));
            if (kind === 'analogous') items.sort((a, b) => a.offset - b.offset);
            return items.map((it) => {
                const tag = it.base ? 'Base' : signed(it.offset);
                return {
                    hex: hexOf(it.color),
                    base: it.base,
                    tag,
                    name: it.base ? `${label} base` : `${label} ${tag}`,
                    hue: hueOf(it.color),
                    l: lightOf(it.color)
                };
            });
        }
        // Monochromatic: dark → light, tagged by lightness.
        return list
            .map((c, i) => ({ color: c, base: i === 0, l: lightOf(c) }))
            .sort((a, b) => a.l - b.l)
            .map((it) => {
                const tag = it.base ? 'Base' : `L ${Math.round(it.l * 100)}%`;
                return {
                    hex: hexOf(it.color),
                    base: it.base,
                    tag,
                    name: it.base ? `${label} base` : `${label} ${tag}`,
                    hue: hueOf(it.color),
                    l: it.l
                };
            });
    }

    /** Conic-gradient hue ring for the wheel, computed once per space. */
    function ringFor(space) {
        if (ringCache[space]) return ringCache[space];
        const stops = [];
        for (let h = 0; h <= 360; h += 20) {
            const c = space === 'hsl' ? Color.fromHsl(h % 360, 80, 55) : Color.fromOklch(0.72, 0.13, h % 360);
            stops.push(`${hexOf(c)} ${h}deg`);
        }
        ringCache[space] = `conic-gradient(${stops.join(', ')})`;
        return ringCache[space];
    }

    /* ── Build ─────────────────────────────────────────────── */

    function radioGroup(className, label, options, onPick) {
        const group = DOM.create('div', {
            className: `chip-row ta-radios ${className}`,
            attrs: { role: 'radiogroup', 'aria-label': label }
        });
        const chips = options.map((o) => {
            const b = DOM.create('button', {
                className: 'chip-btn ta-radio',
                text: o.label,
                attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1', title: o.title || o.hint || o.label },
                data: { value: o.id }
            });
            group.appendChild(b);
            return b;
        });
        DOM.on(group, 'click', (e) => {
            const b = e.target.closest('.ta-radio');
            if (b) onPick(b.dataset.value);
        });
        DOM.on(group, 'keydown', (e) => {
            const i = chips.indexOf(document.activeElement);
            if (i < 0) return;
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
        return { group, chips };
    }

    function syncRadios(chips, value) {
        chips.forEach((b) => {
            const on = b.dataset.value === value;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });
    }

    function build(mount) {
        mount.textContent = '';
        const root = DOM.create('div', { className: 'ta-pane har' });

        root.appendChild(DOM.create('span', { className: 'mini-label', text: 'Harmony', attrs: { id: 'har-kind-label', 'aria-hidden': 'true' } }));
        const kinds = radioGroup('har-kinds', 'Harmony', KINDS, (id) => HarmonyUI.setKind(id));
        els.kindChips = kinds.chips;
        root.appendChild(kinds.group);

        const top = DOM.create('div', { className: 'har-top' });
        els.wheel = DOM.create('div', { className: 'har-wheel', attrs: { 'aria-hidden': 'true' } });
        els.ring = DOM.create('div', { className: 'har-ring' });
        els.wheel.appendChild(els.ring);
        els.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        els.lines.setAttribute('class', 'har-lines');
        els.lines.setAttribute('viewBox', '0 0 100 100');
        els.poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        els.lines.appendChild(els.poly);
        els.wheel.appendChild(els.lines);
        els.dots = DOM.create('div', { className: 'har-dots' });
        els.wheel.appendChild(els.dots);
        top.appendChild(els.wheel);

        const side = DOM.create('div', { className: 'har-side' });
        els.hint = DOM.create('p', { className: 'ta-note har-hint' });
        side.appendChild(els.hint);
        side.appendChild(DOM.create('span', { className: 'mini-label', text: 'Hue model', attrs: { 'aria-hidden': 'true' } }));
        const spaces = radioGroup('har-spaces', 'Hue model', SPACES, (id) => HarmonyUI.setSpace(id));
        els.spaceChips = spaces.chips;
        side.appendChild(spaces.group);
        top.appendChild(side);
        root.appendChild(top);

        els.grey = DOM.create('p', { className: 'ta-note har-grey' });
        els.grey.hidden = true;
        root.appendChild(els.grey);

        els.items = DOM.create('div', { className: 'har-items', attrs: { role: 'group', 'aria-label': 'Harmony colors' } });
        root.appendChild(els.items);

        const actions = DOM.create('div', { className: 'ta-row ta-actions' });
        els.add = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Add to palette',
            attrs: { type: 'button', title: 'Append these colors to the working palette' }
        });
        els.replace = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Replace palette',
            attrs: { type: 'button', title: 'Make these colors the whole working palette' }
        });
        actions.appendChild(els.add);
        actions.appendChild(els.replace);
        root.appendChild(actions);

        els.feedback = DOM.create('div', { className: 'tool-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.feedback);

        mount.appendChild(root);
        els.root = root;

        DOM.on(els.items, 'click', (e) => {
            const item = e.target.closest('.har-item');
            if (item) pick(item.dataset.hex, item);
        });
        DOM.on(els.add, 'click', () => HarmonyUI.addToPalette());
        DOM.on(els.replace, 'click', () => HarmonyUI.replacePalette());
    }

    /* ── Render ────────────────────────────────────────────── */

    function itemButton() {
        const b = DOM.create('button', { className: 'har-item', attrs: { type: 'button' } });
        const sw = DOM.create('span', { className: 'swatch har-swatch', attrs: { 'aria-hidden': 'true' } });
        const hex = DOM.create('span', { className: 'har-hex' });
        const tag = DOM.create('span', { className: 'har-tag' });
        b.appendChild(sw);
        b.appendChild(hex);
        b.appendChild(tag);
        return b;
    }

    function renderItems(set, kindLabel) {
        const host = els.items;
        while (host.children.length < set.length) host.appendChild(itemButton());
        while (host.children.length > set.length) host.lastElementChild.remove();
        host.dataset.count = String(set.length);
        host.style.setProperty('--n', String(Math.max(1, set.length)));
        set.forEach((it, i) => {
            const b = host.children[i];
            const [sw, hex, tag] = b.children;
            sw.style.setProperty('--c', it.hex);
            hex.textContent = shown(it.hex);
            tag.textContent = it.tag;
            b.dataset.hex = it.hex;
            b.dataset.base = String(it.base);
            const label = it.base
                ? `${kindLabel} base, ${shown(it.hex)} (the active color)`
                : `${kindLabel} ${it.tag}, ${shown(it.hex)}. Make it the active color`;
            b.setAttribute('aria-label', label);
            b.title = it.base ? `${shown(it.hex)}: the active color` : `Make ${shown(it.hex)} the active color`;
        });
    }

    function renderWheel(set, kind, space) {
        els.ring.style.backgroundImage = ringFor(space);
        const mono = kind === 'monochromatic';
        const pts = set.map((it) => {
            const r = mono ? 10 + it.l * 30 : 40;
            const a = (it.hue * Math.PI) / 180;
            return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a), it };
        });
        while (els.dots.children.length < pts.length) els.dots.appendChild(DOM.create('span', { className: 'har-dot' }));
        while (els.dots.children.length > pts.length) els.dots.lastElementChild.remove();
        pts.forEach((p, i) => {
            const d = els.dots.children[i];
            d.style.left = `${p.x}%`;
            d.style.top = `${p.y}%`;
            d.style.setProperty('--c', p.it.hex);
            d.dataset.base = String(p.it.base);
        });
        // Lines in wheel order, so the shape (triangle, square…) reads clearly.
        const ordered = mono ? pts.slice() : pts.slice().sort((a, b) => a.it.hue - b.it.hue);
        els.poly.setAttribute('points', ordered.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
        els.poly.dataset.shape = mono ? 'line' : (pts.length > 2 ? 'polygon' : 'line');
    }

    function render() {
        if (!els.root) return;
        const p = prefs();
        const def = kindDef(p.kind);
        syncRadios(els.kindChips, p.kind);
        syncRadios(els.spaceChips, p.space);
        els.hint.textContent = def.hint;

        const active = State.getActive();
        let set = [];
        try {
            set = computeSet(active, p.kind, p.space);
        } catch (err) {
            console.error('[HarmonyUI] harmony failed:', err);
        }
        current = set;

        const grey = typeof Color.isAchromatic === 'function' ? Color.isAchromatic(active) : false;
        els.grey.hidden = !(grey && p.kind !== 'monochromatic');
        if (!els.grey.hidden) {
            els.grey.textContent = `${shown(hexOf(active))} is a neutral grey with no hue, so every hue harmony repeats it. Pick a color with some chroma, or try Monochromatic.`;
        }

        renderItems(set, def.label);
        renderWheel(set, p.kind, p.space);
        els.add.disabled = !set.length;
        els.replace.disabled = !set.length;
    }

    /* ── Actions ───────────────────────────────────────────── */

    function pick(hex, item) {
        if (!hex) return;
        const before = hexOf(State.getActive());
        if (hex === before) {
            setFeedback('info', `${shown(hex)} is already the active color.`);
            return;
        }
        if (window.ToolApp && item) ToolApp.flash(item);
        if (State.setActive(hex, { source: 'harmony' })) {
            setFeedback('success', `Active color is now ${shown(hex)} (was ${shown(before)}). Ctrl+Z goes back.`);
        } else {
            setFeedback('error', State.lastError || 'That color could not be used.');
        }
    }

    /** The unique colors of the current set, in display order. */
    function uniqueEntries() {
        const seen = new Set();
        const out = [];
        current.forEach((it) => {
            if (!it.hex || seen.has(it.hex)) return;
            seen.add(it.hex);
            out.push({ hex: it.hex, name: it.name });
        });
        return out;
    }

    /* ── Public API ────────────────────────────────────────── */

    const HarmonyUI = {
        init() {
            const mount = DOM.id('mount-harmony');
            if (!mount) return;
            if (!engineReady()) {
                mount.textContent = '';
                mount.appendChild(DOM.create('div', {
                    className: 'empty-state ta-empty',
                    children: [
                        DOM.create('p', { className: 'empty-title', text: 'Harmonies are unavailable' }),
                        DOM.create('p', { className: 'empty-text', text: 'The color engine (js/color.js) did not load. Reload the page to try again.' })
                    ]
                }));
                return;
            }
            build(mount);
            schedule = makeScheduler(mount.closest('.tool-section'), render);
            State.on('active', ({ source } = {}) => {
                if (source !== 'harmony') setFeedback(null);
                schedule();
            });
            State.on('settings', schedule);
            State.on('reset', () => { setFeedback(null); schedule(); });
            render();
        },

        refresh() {
            render();
        },

        /** complementary | analogous | triadic | split | tetradic | square | monochromatic. Persists. */
        setKind(kind) {
            if (!KINDS.some((k) => k.id === kind)) return false;
            if (prefs().kind !== kind) {
                State.setPane(PANE, { kind });
                setFeedback(null);
            }
            render();
            return true;
        },

        /** 'oklch' or 'hsl'. Persists. */
        setSpace(space) {
            if (space !== 'oklch' && space !== 'hsl') return false;
            if (prefs().space !== space) {
                State.setPane(PANE, { space });
                setFeedback(null);
            }
            render();
            return true;
        },

        /** The current set as hex strings, in display order. */
        colors() {
            if (!els.root) return [];
            render();
            return current.map((it) => it.hex);
        },

        /** Append the set to the working palette, skipping colors it already has. */
        addToPalette() {
            if (!els.root) return 0;
            render();
            const entries = uniqueEntries();
            if (!entries.length) return 0;
            const w = State.working();
            const have = new Set(w.colors.map((c) => c.hex));
            const fresh = entries.filter((e) => !have.has(e.hex));
            const skipped = entries.length - fresh.length;
            if (!fresh.length) {
                setFeedback('info', `The working palette already has all ${plural(entries.length, 'color')} of this harmony.`);
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
            if (window.ToolApp) ToolApp.flash(els.add);
            const tail = skipped ? ` (${skipped} already there)` : '';
            setFeedback('success', `Added ${plural(fresh.length, 'color')} to “${w.name}”${tail}.`);
            return fresh.length;
        },

        /** Make the set the whole working palette; asks first when unsaved work would be lost. */
        async replacePalette() {
            if (!els.root) return false;
            render();
            const entries = uniqueEntries();
            if (!entries.length) return false;
            const w = State.working();
            const label = kindDef(prefs().kind).label;
            /* Ask only when unsaved work would be lost (WorkingUI knows); without
               it, ask whenever the palette has colors. */
            if (window.WorkingUI && typeof WorkingUI.confirmReplace === 'function') {
                const ok = await WorkingUI.confirmReplace({
                    title: 'Replace the working palette?',
                    action: `Using this ${label.toLowerCase()} harmony`,
                    confirmLabel: 'Replace palette'
                });
                if (!ok) return false;
            } else if (w.colors.length && window.Dialogs) {
                const ok = await Dialogs.confirm({
                    title: 'Replace the working palette?',
                    message: `This swaps the ${plural(w.colors.length, 'color')} in “${w.name}” for the ${plural(entries.length, 'color')} of this ${label.toLowerCase()} harmony. Palettes saved in the library are not changed.`,
                    confirmLabel: 'Replace palette',
                    danger: true
                });
                if (!ok) return false;
            }
            if (!State.setWorking(entries, `${label} harmony`)) {
                setFeedback('error', State.lastError || 'The working palette could not be replaced.');
                return false;
            }
            if (window.ToolApp) ToolApp.flash(els.replace);
            setFeedback('success', `The working palette is now the ${plural(entries.length, 'color')} of this ${label.toLowerCase()} harmony.`);
            notify('Working palette replaced', 'success', 1400);
            return true;
        }
    };

    window.HarmonyUI = HarmonyUI;
})();
