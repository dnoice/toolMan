/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: VisionUI (colorMan Edition - v1.0)
 *     - File Name: vision.js
 *     - Relative Path: tools/colorman/js/ui/vision.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Color Vision pane in the Tools rail: it shows how the working
 *     palette, or the current color, may look to people with each common
 *     color vision deficiency. For a palette it also flags pairs of colors
 *     that become hard to tell apart, so a palette can be checked before it
 *     is used for charts, status colors, or anything that relies on hue.
 *
 * ✒ Key Features:
 *     - Source chips: Working palette or Current color (arrow keys move
 *       between them); the choice is saved per browser
 *     - Eight rows: Normal, Protanopia, Deuteranopia, Tritanopia,
 *       Protanomaly, Deuteranomaly, Tritanomaly, Achromatopsia
 *     - Palette rows are flush color bars; hovering a slice shows the
 *       original and simulated hex, and each bar has a full text label
 *     - Collision check: a pair that was distinct (CIEDE2000 10 or more)
 *       but drops below 10 after simulation is flagged with a "2 pairs
 *       collide" warning badge that opens the list of pairs
 *     - The Normal row flags pairs that are already close for everyone
 *     - Current-color rows show the simulated swatch, its hex, and how far
 *       it moved from the original (ΔE)
 *     - A plain note that simulation is an approximation (Machado et al.
 *       2009) and that real perception varies
 *     - Empty state with a one-click switch when the palette has no colors
 *     - Results are cached by palette content and drawn only while the pane
 *       is open, so large palettes stay responsive
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js, before
 *     js/app.js. app.js calls VisionUI.init() once; the module renders into
 *     #mount-vision and follows the working palette and the current color
 *     through State events.
 *
 * ✒ Examples:
 *     VisionUI.init()                         → builds the pane inside #mount-vision
 *     VisionUI.setSource('active')            → preview the current color
 *     VisionUI.analyze(['#FF0000', '#008000']) → [{ id, label, colors, pairs }, …]
 *     VisionUI.analyze(hexes)[2].pairs        → deuteranopia collisions [{ i, j, deltaE }]
 *     VisionUI.collisionThreshold             → 10 (CIEDE2000)
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (Color.simulate, Color.toLab,
 *       Color.deltaE2000Lab, Color.CVD_TYPES), js/state.js (State),
 *       js/ui/swatch.js (SwatchUI), shared/js/dom.js, toolman.js;
 *       css/tools-b.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: simulations model typical cases only; the -omaly rows
 *       use a fixed severity of 0.6; the pair list shows the first 40 pairs
 *       per row; without js/color.js the pane explains that it cannot run
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'vision';
    const THRESHOLD = 10;
    const MAX_LISTED = 40;

    const TYPES = [
        { id: 'normal', label: 'Normal', description: 'Typical color vision, for comparison.' },
        { id: 'protanopia', label: 'Protanopia', description: 'No red-sensitive cones; reds look dark and merge with greens.' },
        { id: 'deuteranopia', label: 'Deuteranopia', description: 'No green-sensitive cones; reds and greens are hard to tell apart.' },
        { id: 'tritanopia', label: 'Tritanopia', description: 'No blue-sensitive cones; blues and greens, yellows and pinks blur together.' },
        { id: 'protanomaly', label: 'Protanomaly', description: 'Weak red-sensitive cones; reds look muted.' },
        { id: 'deuteranomaly', label: 'Deuteranomaly', description: 'Weak green-sensitive cones; the most common type.' },
        { id: 'tritanomaly', label: 'Tritanomaly', description: 'Weak blue-sensitive cones; blue and yellow lose contrast.' },
        { id: 'achromatopsia', label: 'Achromatopsia', description: 'No color vision; only lightness remains.' }
    ];
    const SOURCES = [
        { id: 'working', label: 'Working palette', title: 'Preview every color in the working palette' },
        { id: 'active', label: 'Current color', title: 'Preview the current color' }
    ];

    const els = {};
    const openRows = new Set();
    let frame = 0;
    let stale = false;
    let cache = { key: '', rows: null };

    /* ── Small helpers ─────────────────────────────────────── */

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const hasEngine = () => Boolean(window.Color && typeof Color.simulate === 'function'
        && typeof Color.toLab === 'function' && typeof Color.deltaE2000Lab === 'function');

    function displayHex(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function source() {
        const s = State.pane(PANE).source;
        return s === 'active' ? 'active' : 'working';
    }

    function describe(type) {
        const fromEngine = window.Color && Array.isArray(Color.CVD_TYPES)
            ? Color.CVD_TYPES.find((t) => t.id === type.id) : null;
        return (fromEngine && fromEngine.description) || type.description;
    }

    /* ── Analysis ──────────────────────────────────────────── */

    function simulateHex(hex, type) {
        if (type === 'normal') return hex;
        try {
            return State.hexOf(Color.simulate(hex, type)) || hex;
        } catch (err) {
            console.warn(`[VisionUI] simulate ${type} failed:`, err);
            return hex;
        }
    }

    /**
     * For each vision type: simulated hexes and the pairs that collide.
     * Normal lists pairs already closer than the threshold; the others list
     * pairs that were distinct but fall below it after simulation.
     */
    function analyze(hexes) {
        const list = (Array.isArray(hexes) ? hexes : []).map((h) => State.hexOf(h)).filter(Boolean);
        const key = list.join(',');
        if (cache.key === key && cache.rows) return cache.rows;
        if (!hasEngine()) return [];

        const labOf = (hex) => Color.toLab(hex);
        const baseLab = list.map(labOf);
        const n = list.length;
        const baseDist = [];
        for (let i = 0; i < n; i++) {
            baseDist.push(new Float64Array(n));
            for (let j = i + 1; j < n; j++) baseDist[i][j] = Color.deltaE2000Lab(baseLab[i], baseLab[j]);
        }

        const rows = TYPES.map((t) => {
            const colors = list.map((hex) => simulateHex(hex, t.id));
            const labs = t.id === 'normal' ? baseLab : colors.map(labOf);
            const pairs = [];
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    if (list[i] === list[j]) continue;          // the same color twice is not a collision
                    const d = t.id === 'normal' ? baseDist[i][j] : Color.deltaE2000Lab(labs[i], labs[j]);
                    if (d >= THRESHOLD) continue;
                    if (t.id !== 'normal' && baseDist[i][j] < THRESHOLD) continue;   // already close in normal vision
                    pairs.push({ i, j, deltaE: d });
                }
            }
            pairs.sort((a, b) => a.deltaE - b.deltaE);
            return { id: t.id, label: t.label, colors, pairs };
        });
        cache = { key, rows };
        return rows;
    }

    /* ── Scheduling ────────────────────────────────────────── */

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

    function build(mount) {
        const root = DOM.create('div', { className: 'tb-pane cv' });
        els.source = chipGroup('Preview source', SOURCES, (v) => setSource(v));
        root.appendChild(els.source.el);
        els.summary = DOM.create('p', { className: 'cv-summary', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.summary);
        els.body = DOM.create('div', { className: 'cv-body' });
        root.appendChild(els.body);
        root.appendChild(DOM.create('p', {
            className: 'pane-hint tb-note cv-note',
            text: 'These previews approximate color vision deficiency with the Machado et al. (2009) model. Real perception varies from person to person and with the screen and light, so check important designs with real users, and never rely on color alone.'
        }));
        mount.appendChild(root);
        els.root = root;

        DOM.delegate(els.body, 'click', '.cv-pairs-btn', (_e, btn) => {
            const id = btn.dataset.type;
            const list = DOM.id(btn.getAttribute('aria-controls'));
            const open = btn.getAttribute('aria-expanded') !== 'true';
            btn.setAttribute('aria-expanded', String(open));
            if (list) list.hidden = !open;
            if (open) openRows.add(id);
            else openRows.delete(id);
        });
        DOM.delegate(els.body, 'click', '[data-action="use-active"]', () => setSource('active'));
        DOM.delegate(els.body, 'click', '[data-action="add-active"]', () => {
            const index = State.addToWorking(State.getActive());
            if (index < 0 && window.TOOLMAN) TOOLMAN.notify(State.lastError || 'Could not add the color.', 'warning', 3000);
        });
    }

    /* ── Render ────────────────────────────────────────────── */

    function render() {
        if (!els.root) return;
        const src = source();
        els.source.set(src);

        if (!hasEngine()) {
            els.summary.textContent = '';
            els.body.replaceChildren(emptyState('The preview could not start',
                'Color vision simulation needs the color engine (js/color.js), which did not load. Reload the page to try again.'));
            return;
        }
        if (src === 'active') renderActive();
        else renderPalette();
    }

    function emptyState(title, text, action) {
        const box = DOM.create('div', { className: 'empty-state tb-empty' });
        box.appendChild(DOM.create('p', { className: 'empty-title', text: title }));
        box.appendChild(DOM.create('p', { className: 'empty-text', text }));
        if (action) box.appendChild(action);
        return box;
    }

    function renderPalette() {
        const colors = State.working().colors;
        if (!colors.length) {
            els.summary.textContent = '';
            const actions = DOM.create('div', {
                className: 'tb-actions tb-actions--center',
                children: [
                    DOM.create('button', { className: 'btn btn-secondary btn-sm', text: 'Add current color', attrs: { type: 'button', 'data-action': 'add-active' } }),
                    DOM.create('button', { className: 'btn btn-ghost btn-sm', text: 'Preview current color', attrs: { type: 'button', 'data-action': 'use-active' } })
                ]
            });
            els.body.replaceChildren(emptyState('The working palette is empty',
                'Add colors to the working palette to see how they read with each type of color vision, or preview the current color instead.', actions));
            return;
        }

        const hexes = colors.map((c) => c.hex);
        const rows = analyze(hexes);
        const names = colors.map((c, i) => c.name || `Color ${i + 1}`);
        const flagged = rows.filter((r) => r.id !== 'normal' && r.pairs.length);
        const normal = rows.find((r) => r.id === 'normal');
        if (hexes.length < 2) {
            els.summary.textContent = 'Add at least two colors to check which pairs become hard to tell apart.';
        } else if (!flagged.length) {
            els.summary.textContent = `${plural(hexes.length, 'color')}: no pairs collide in any simulation.`;
        } else {
            els.summary.textContent = `${plural(hexes.length, 'color')}: pairs collide in ${plural(flagged.length, 'simulation')}.`;
        }
        if (normal && normal.pairs.length) {
            els.summary.textContent += ` ${plural(normal.pairs.length, 'pair')} already look close for everyone.`;
        }

        const list = DOM.create('ul', { className: 'cv-rows' });
        rows.forEach((row) => {
            const type = TYPES.find((t) => t.id === row.id);
            const li = DOM.create('li', { className: 'cv-row', data: { type: row.id } });
            const head = DOM.create('div', { className: 'cv-row-head' });
            head.appendChild(DOM.create('span', { className: 'cv-name', text: row.label, attrs: { title: describe(type) } }));

            const listId = `cv-pairs-${row.id}`;
            if (hexes.length >= 2) {
                if (row.pairs.length) {
                    const open = openRows.has(row.id);
                    const isNormal = row.id === 'normal';
                    head.appendChild(DOM.create('button', {
                        className: 'badge cv-pairs-btn',
                        text: isNormal
                            ? `${plural(row.pairs.length, 'pair')} already close`
                            : `${plural(row.pairs.length, 'pair')} collide`,
                        attrs: {
                            type: 'button',
                            'data-tone': isNormal ? 'info' : 'warn',
                            'aria-expanded': String(open),
                            'aria-controls': listId,
                            title: isNormal
                                ? 'Show the pairs that are hard to tell apart even with typical color vision'
                                : `Show the pairs that become hard to tell apart with ${row.label.toLowerCase()}`
                        },
                        data: { type: row.id }
                    }));
                } else {
                    head.appendChild(DOM.create('span', {
                        className: 'badge',
                        text: 'Distinct',
                        attrs: { 'data-tone': 'pass', title: 'Every pair stays distinct (ΔE 10 or more)' }
                    }));
                }
            }
            li.appendChild(head);

            const bar = DOM.create('div', {
                className: 'swatch-strip swatch-strip--joined cv-bar',
                attrs: {
                    role: 'img',
                    'aria-label': `${row.label}. ${describe(type)} Colors: ${barLabel(row.colors)}`
                }
            });
            row.colors.forEach((hex, i) => {
                const slice = DOM.create('span', { className: 'swatch' });
                slice.style.setProperty('--c', hex);
                slice.title = row.id === 'normal'
                    ? `${names[i]} · ${displayHex(hex)}`
                    : `${names[i]} · ${displayHex(hexes[i])} looks like ${displayHex(hex)}`;
                bar.appendChild(slice);
            });
            li.appendChild(bar);

            if (row.pairs.length && hexes.length >= 2) {
                const pairList = DOM.create('ul', { className: 'cv-pairs', id: listId, attrs: { 'aria-label': `${row.label} pairs` } });
                pairList.hidden = !openRows.has(row.id);
                row.pairs.slice(0, MAX_LISTED).forEach((p) => {
                    const item = DOM.create('li', { className: 'cv-pair' });
                    item.appendChild(DOM.create('span', {
                        className: 'swatch-strip cv-pair-chips',
                        attrs: { 'aria-hidden': 'true' },
                        children: [chip(row.colors[p.i]), chip(row.colors[p.j])]
                    }));
                    item.appendChild(DOM.create('span', {
                        className: 'cv-pair-text',
                        text: `${names[p.i]} ${displayHex(hexes[p.i])} and ${names[p.j]} ${displayHex(hexes[p.j])}`
                    }));
                    item.appendChild(DOM.create('span', { className: 'cv-pair-de', text: `ΔE ${p.deltaE.toFixed(1)}` }));
                    pairList.appendChild(item);
                });
                if (row.pairs.length > MAX_LISTED) {
                    pairList.appendChild(DOM.create('li', {
                        className: 'cv-pair cv-pair--more',
                        text: `and ${plural(row.pairs.length - MAX_LISTED, 'more pair')}`
                    }));
                }
                li.appendChild(pairList);
            }
            list.appendChild(li);
        });
        els.body.replaceChildren(list);
    }

    function chip(hex) {
        const el = DOM.create('span', { className: 'swatch swatch--sm' });
        el.style.setProperty('--c', hex);
        return el;
    }

    function barLabel(hexes) {
        const shown = hexes.slice(0, 24).map(displayHex);
        const extra = hexes.length - shown.length;
        return `${shown.join(', ')}${extra > 0 ? `, and ${extra} more` : ''}`;
    }

    function renderActive() {
        const hex = State.hexOf(State.getActive()) || '#000000';
        els.summary.textContent = `How ${displayHex(hex)} may look with each type of color vision.`;
        const baseLab = Color.toLab(hex);
        const list = DOM.create('ul', { className: 'cv-rows cv-rows--single' });
        TYPES.forEach((t) => {
            const sim = simulateHex(hex, t.id);
            const de = t.id === 'normal' ? 0 : Color.deltaE2000Lab(baseLab, Color.toLab(sim));
            const li = DOM.create('li', { className: 'cv-row cv-row--single', data: { type: t.id } });
            const sw = DOM.create('span', {
                className: 'swatch',
                attrs: { role: 'img', 'aria-label': `${t.label}. ${describe(t)} Shown as ${displayHex(sim)}`, title: `${t.label} · ${displayHex(sim)}` }
            });
            sw.style.setProperty('--c', sim);
            li.appendChild(sw);
            li.appendChild(DOM.create('span', { className: 'cv-name', text: t.label, attrs: { title: describe(t) } }));
            li.appendChild(DOM.create('code', { className: 'cv-hex', text: displayHex(sim) }));
            const shift = t.id === 'normal'
                ? 'original'
                : de < 2 ? 'no visible change' : `ΔE ${de.toFixed(1)}`;
            li.appendChild(DOM.create('span', {
                className: 'cv-shift',
                text: shift,
                attrs: { title: t.id === 'normal' ? 'The color as picked' : 'How far the color moves from the original (CIEDE2000; under 2 is hard to notice)' }
            }));
            list.appendChild(li);
        });
        els.body.replaceChildren(list);
    }

    /* ── Actions ───────────────────────────────────────────── */

    function setSource(value) {
        const next = value === 'active' ? 'active' : 'working';
        if (next !== source()) State.setPane(PANE, { source: next });
        render();
    }

    /* ── Public API ────────────────────────────────────────── */

    const VisionUI = {
        collisionThreshold: THRESHOLD,

        init() {
            const mount = DOM.id('mount-vision');
            if (!mount || els.root) return;
            els.mount = mount;
            build(mount);
            render();
            watchOpen();
            State.on('working', () => { if (source() === 'working') schedule(); });
            State.on('active', () => { if (source() === 'active') schedule(); });
            State.on('settings', schedule);
            State.on('reset', () => { openRows.clear(); schedule(); });
        },
        setSource,
        analyze(hexes) {
            return analyze(hexes).map((r) => ({ id: r.id, label: r.label, colors: r.colors.slice(), pairs: r.pairs.map((p) => ({ ...p })) }));
        },
        render
    };

    window.VisionUI = VisionUI;
})();
