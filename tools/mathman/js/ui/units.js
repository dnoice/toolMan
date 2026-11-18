/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: UnitsUI (mathMan Edition - v1.0)
 *     - File Name: units.js
 *     - Relative Path: tools/mathman/js/ui/units.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Units pane in the Tools rail: a two-way unit converter built on
 *     the same unit tables the worksheet uses. Pick what you are measuring,
 *     type a number on either side, and the other side follows; a table
 *     shows the value in every unit of that kind, and the conversion can be
 *     sent to the worksheet as a line such as "5 km to mi".
 *
 * ✒ Key Features:
 *     - Measure select with every unit category the engine knows (length,
 *       area, volume, mass, time, speed, … temperature, data, electric)
 *     - From and To each have a value field and a unit select; typing in
 *       either side converts into the other (two-way)
 *     - Values accept 1,234.5, 1_000, 1e6, a leading minus, and small
 *       calculations such as 5/8 or 2^10; plain-language errors say what
 *       went wrong (a unit typed into the number, commas used as decimals)
 *     - Only units that measure the same thing are offered as a target
 *       (the electric list mixes volts, amps, ohms, and watts), with a note
 *     - Swap exchanges the two units and keeps the typed number in place
 *     - Result sentence (5 km = 3.106855961 mi) with Copy, formatted with
 *       the visitor's digits, notation, and thousands separator
 *     - "Show all" table of the value in every matching unit, marked From
 *       and To in words; click a row (or its value button) to copy it
 *     - Send to sheet appends "5 km to mi" to the active worksheet
 *     - Category, units, typed value, typed side, and the table toggle are
 *       remembered per browser and validated when restored; each category
 *       remembers its own unit pair
 *
 * ✒ Usage Instructions:
 *     Load after js/engine.js and js/state.js (and js/ui/worksheet.js),
 *     before js/app.js. app.js calls UnitsUI.init() once; the module
 *     renders into #mount-units and keeps itself in step through State
 *     events. Without the engine the pane says so instead of converting.
 *
 * ✒ Examples:
 *     UnitsUI.init()                              → builds the pane in #mount-units
 *     UnitsUI.set({ category: 'length', from: 'km', to: 'mi', value: '5' })
 *     UnitsUI.convert()                           → { from: 5, to: 3.1068…, fromUnit: 'km', toUnit: 'mi' }
 *     UnitsUI.swap()                              → 5 mi = 8.04672 km
 *     UnitsUI.sendToSheet()                       → appends "5 km to mi" to the worksheet
 *     UnitsUI.parseValue('1,234.5')               → { value: 1234.5, plain: '1234.5' }
 *     UnitsUI.parseValue('1,5').error             → "Commas only group thousands, …"
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/engine.js (MathEngine.units, evaluate), js/state.js
 *       (State), js/ui/worksheet.js (WorksheetUI.appendLine, optional),
 *       shared/js/dom.js, toolapp.js, toolman.js; css/tools-a.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: conversions use IEEE doubles (the worksheet line keeps
 *       exact fractions); currencies are not units — the Finance pane
 *       handles money
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'units';
    const MAX_INPUT = 100;
    const MAX_LINES = 2000;

    // A sensible first pair for each category (used when it exists).
    const DEFAULT_PAIRS = {
        length: ['km', 'mi'], area: ['m^2', 'ft^2'], volume: ['L', 'gal'], mass: ['kg', 'lb'],
        time: ['h', 'min'], speed: ['km/h', 'mph'], acceleration: ['m/s^2', 'ft/s^2'], force: ['N', 'lbf'],
        pressure: ['kPa', 'psi'], energy: ['kJ', 'kcal'], power: ['kW', 'hp'], temperature: ['°C', '°F'],
        data: ['GB', 'GiB'], angle: ['deg', 'rad'], frequency: ['MHz', 'kHz'], electric: ['V', 'mV']
    };

    const els = {};
    const compat = Object.create(null);   // category → Map(symbol → Set of matching symbols)
    let model = null;                      // { category, from, to, value, anchor, showAll, pairs }

    /* ── Small helpers ─────────────────────────────────────── */

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const engineReady = () => Boolean(window.MathEngine && MathEngine.units && typeof MathEngine.units.convert === 'function');
    const shortText = (s, max = 24) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

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
        copy: [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
        swap: [['path', { d: 'M7 16V4' }], ['path', { d: 'm3 8 4-4 4 4' }], ['path', { d: 'M17 8v12' }], ['path', { d: 'm21 16-4 4-4-4' }]],
        send: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
        table: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['path', { d: 'M3 10h18M3 15h18M10 4v16' }]]
    };

    /* ── Engine lookups ────────────────────────────────────── */

    function categories() {
        if (!engineReady()) return [];
        try {
            return MathEngine.units.categories().filter((c) => c && typeof c.id === 'string');
        } catch (err) {
            console.error('[UnitsUI] categories failed:', err);
            return [];
        }
    }

    function unitsOf(category) {
        if (!engineReady()) return [];
        try {
            return MathEngine.units.list(category).filter((u) => u && typeof u.symbol === 'string');
        } catch (err) {
            console.error('[UnitsUI] list failed:', err);
            return [];
        }
    }

    function unitName(category, symbol) {
        const u = unitsOf(category).find((x) => x.symbol === symbol);
        return u ? u.name : symbol;
    }

    /** Symbols in the category that convert to and from `symbol`. */
    function compatibleWith(category, symbol) {
        if (!compat[category]) compat[category] = new Map();
        const cache = compat[category];
        if (cache.has(symbol)) return cache.get(symbol);
        const set = new Set();
        unitsOf(category).forEach((u) => {
            try {
                if (Number.isFinite(MathEngine.units.convert(1, symbol, u.symbol))) set.add(u.symbol);
            } catch (_err) { /* a different kind of quantity */ }
        });
        cache.set(symbol, set);
        return set;
    }

    /** Convert, returning { value } or { error } (never throws). */
    function convert(value, from, to) {
        try {
            const v = MathEngine.units.convert(value, from, to);
            if (!Number.isFinite(v)) return { error: 'The answer is too large to show. Try a smaller number.' };
            return { value: v };
        } catch (err) {
            return { error: err && err.message ? `${err.message}.` : 'Those units can\'t be converted.' };
        }
    }

    /* ── Number input ──────────────────────────────────────── */

    /**
     * Read a typed value: plain numbers (1,234.5, 1_000, 1e6, -40) or a
     * small calculation worked out by the engine. Returns { empty: true },
     * { value, plain } (plain is the cleaned text when it was a plain
     * number, else null), or { error }.
     */
    function parseValue(raw) {
        const text = String(raw === null || raw === undefined ? '' : raw).trim();
        if (!text) return { empty: true };
        if (text.length > MAX_INPUT) return { error: `That is too long. Type a number of up to ${MAX_INPUT} characters.` };
        const compact = text.replace(/[\s  _]/g, '').replace(/−/g, '-');
        const m = /^([+-]?)(\d[\d,]*)?(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(compact);
        if (m && (m[2] || m[3])) {
            if (m[2] && m[2].includes(',') && !/^\d{1,3}(?:,\d{3})+$/.test(m[2])) {
                return { error: 'Commas only group thousands, like 1,000. Use a dot for decimals, like 1.5.' };
            }
            const plain = compact.replace(/,/g, '').replace(/^\+/, '').replace(/\.$/, '').replace(/\.(?=[eE])/, '');
            const n = Number(plain);
            if (!Number.isFinite(n)) return { error: 'That number is too large to convert.' };
            return { value: n, plain };
        }
        if (window.MathEngine && typeof MathEngine.evaluate === 'function') {
            let r = null;
            try {
                r = MathEngine.evaluate(text, State.engineOptions());
            } catch (_err) {
                r = null;
            }
            if (r && r.kind !== 'error' && r.unit) {
                return { error: `Type just the number here and pick the unit from the list (this has ${r.unit} in it).` };
            }
            if (r && r.kind !== 'error' && typeof r.numeric === 'number' && Number.isFinite(r.numeric)) {
                return { value: r.numeric, plain: null };
            }
            if (r && r.kind !== 'error') return { error: 'That works out to something that is not a number. Type a number, like 5 or 2.5.' };
        }
        return { error: `Couldn't read “${shortText(text)}” as a number. Type something like 5, 2.5, 1e6, or 5/8.` };
    }

    /** A number as worksheet text with full precision and no separators. */
    function plainNumber(n) {
        const s = String(Number(n.toPrecision(15)));
        return s.replace('e+', 'e');
    }

    const fmt = (n) => State.formatNumber(n);
    const fmtField = (n) => State.formatNumber(n, { thousands: 'none' });

    /** Number text that may wrap only after a thousands separator (no mid-digit breaks). */
    function breakable(text) {
        const frag = document.createDocumentFragment();
        String(text).split(/(?<=[,\u202F ])/).forEach((part, i) => {
            if (i) frag.appendChild(document.createElement('wbr'));
            frag.appendChild(document.createTextNode(part));
        });
        return frag;
    }

    /* ── Pane state ────────────────────────────────────────── */

    function validPair(category, from, to) {
        const syms = unitsOf(category).map((u) => u.symbol);
        if (!syms.includes(from) || !syms.includes(to)) return false;
        return compatibleWith(category, from).has(to);
    }

    function defaultPair(category) {
        const list = unitsOf(category).map((u) => u.symbol);
        const d = has(DEFAULT_PAIRS, category) ? DEFAULT_PAIRS[category] : null;
        if (d && validPair(category, d[0], d[1])) return { from: d[0], to: d[1] };
        const from = list[0] || '';
        const matches = from ? [...compatibleWith(category, from)].filter((s) => s !== from) : [];
        return { from, to: matches[0] || from };
    }

    /** The saved pane state, every field validated, with defaults filled in. */
    function loadModel() {
        const p = State.pane(PANE);
        const cats = categories().map((c) => c.id);
        const category = typeof p.category === 'string' && cats.includes(p.category) ? p.category : (cats.includes('length') ? 'length' : cats[0] || '');
        const pairs = Object.create(null);
        if (p.pairs && typeof p.pairs === 'object' && !Array.isArray(p.pairs)) {
            Object.keys(p.pairs).forEach((cat) => {
                const pr = p.pairs[cat];
                if (cats.includes(cat) && pr && typeof pr === 'object' && validPair(cat, pr.from, pr.to)) {
                    pairs[cat] = { from: pr.from, to: pr.to };
                }
            });
        }
        let pair = { from: p.from, to: p.to };
        if (!category || !validPair(category, pair.from, pair.to)) pair = pairs[category] || defaultPair(category);
        const value = typeof p.value === 'string' ? p.value.slice(0, MAX_INPUT) : '1';
        return {
            category,
            from: pair.from,
            to: pair.to,
            value,
            anchor: p.anchor === 'to' ? 'to' : 'from',
            showAll: p.showAll === true,
            pairs
        };
    }

    function persist() {
        if (!model) return;
        const pairs = {};
        Object.keys(model.pairs).forEach((k) => { pairs[k] = model.pairs[k]; });
        pairs[model.category] = { from: model.from, to: model.to };
        model.pairs[model.category] = { from: model.from, to: model.to };
        const ok = State.setPane(PANE, {
            category: model.category,
            from: model.from,
            to: model.to,
            value: model.value,
            anchor: model.anchor,
            showAll: model.showAll,
            pairs
        });
        if (!ok) notify(State.lastError || 'Could not save the Units settings.', 'warning', 3000);
    }

    /* ── The conversion ────────────────────────────────────── */

    /**
     * Work out both sides from the typed one. Returns { ok, from, to,
     * fromUnit, toUnit, plain } or { ok: false, empty?, error?, side }.
     */
    function compute() {
        if (!model || !model.category) return { ok: false, error: 'There are no units to convert.' };
        const parsed = parseValue(model.value);
        const side = model.anchor;
        if (parsed.empty) return { ok: false, empty: true, side };
        if (parsed.error) return { ok: false, error: parsed.error, side };
        const [src, dst] = side === 'from' ? [model.from, model.to] : [model.to, model.from];
        const out = convert(parsed.value, src, dst);
        if (out.error) return { ok: false, error: out.error, side };
        const fromValue = side === 'from' ? parsed.value : out.value;
        const toValue = side === 'from' ? out.value : parsed.value;
        const fromPlain = side === 'from' && parsed.plain !== null ? parsed.plain : plainNumber(fromValue);
        return { ok: true, from: fromValue, to: toValue, fromUnit: model.from, toUnit: model.to, fromPlain, side };
    }

    function sheetLine(r) {
        return `${r.fromPlain} ${r.fromUnit} to ${r.toUnit}`;
    }

    /* ── Build ─────────────────────────────────────────────── */

    function unitSelect(id, label) {
        return DOM.create('select', { id, className: 'select-input ta-select un-unit', attrs: { 'aria-label': label } });
    }

    function valueInput(id, label) {
        return DOM.create('input', {
            id,
            className: 'text-input mono ta-input un-value',
            attrs: {
                type: 'text',
                inputmode: 'decimal',
                spellcheck: 'false',
                autocomplete: 'off',
                maxlength: String(MAX_INPUT),
                'aria-label': label,
                'aria-describedby': 'un-error'
            }
        });
    }

    function side(title, input, select) {
        return DOM.create('div', {
            className: 'un-side',
            children: [
                DOM.create('label', { className: 'mini-label', text: title, attrs: { for: input.id } }),
                DOM.create('div', { className: 'un-side-row', children: [input, select] })
            ]
        });
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'ta-pane un' });

        if (!engineReady() || !categories().length) {
            root.appendChild(DOM.create('div', {
                className: 'empty-state',
                children: [
                    DOM.create('p', { className: 'empty-title', text: 'Units are unavailable' }),
                    DOM.create('p', { className: 'empty-text', text: 'The math engine did not load, so there is nothing to convert with. Reload the page to try again.' })
                ]
            }));
            mount.appendChild(root);
            els.root = root;
            return false;
        }

        els.category = DOM.create('select', { id: 'un-category', className: 'select-input ta-select' });
        categories().forEach((c) => els.category.appendChild(DOM.create('option', { text: c.label, attrs: { value: c.id } })));
        const catField = DOM.create('div', {
            className: 'ta-field ta-field--inline',
            children: [DOM.create('label', { className: 'mini-label', text: 'Measure', attrs: { for: 'un-category' } }), els.category]
        });
        root.appendChild(catField);

        els.fromValue = valueInput('un-from-value', 'Value to convert from');
        els.fromUnit = unitSelect('un-from-unit', 'Unit to convert from');
        els.toValue = valueInput('un-to-value', 'Converted value');
        els.toUnit = unitSelect('un-to-unit', 'Unit to convert to');

        els.swap = DOM.create('button', {
            className: 'btn btn-secondary btn-sm un-swap',
            attrs: { type: 'button', title: 'Swap the From and To units (the number stays put)', 'aria-label': 'Swap the From and To units' }
        });
        els.swap.appendChild(icon(ICONS.swap, 14));
        els.swap.appendChild(DOM.create('span', { text: 'Swap' }));

        root.appendChild(DOM.create('div', {
            className: 'un-sides',
            children: [
                side('From', els.fromValue, els.fromUnit),
                DOM.create('div', { className: 'un-swap-row', children: [els.swap] }),
                side('To', els.toValue, els.toUnit)
            ]
        }));

        els.error = DOM.create('p', { id: 'un-error', className: 'error-text ta-error', attrs: { role: 'alert' } });
        els.note = DOM.create('p', { className: 'pane-hint un-note' });
        root.appendChild(els.error);
        root.appendChild(els.note);

        // Result sentence, copy, and send
        els.sentence = DOM.create('p', { className: 'un-sentence', attrs: { role: 'status', 'aria-live': 'polite' } });
        els.copy = DOM.create('button', {
            className: 'icon-action',
            attrs: { type: 'button', 'aria-label': 'Copy the converted value', title: 'Copy the converted value' }
        });
        els.copy.appendChild(icon(ICONS.copy, 15));
        els.result = DOM.create('div', { className: 'un-result', children: [els.sentence, els.copy] });
        root.appendChild(els.result);

        els.send = DOM.create('button', {
            className: 'btn btn-primary btn-sm',
            attrs: { type: 'button' }
        });
        els.send.appendChild(icon(ICONS.send, 14));
        els.sendLabel = DOM.create('span', { text: 'Send to sheet' });
        els.send.appendChild(els.sendLabel);

        els.toggleAll = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'un-all' }
        });
        els.toggleAll.appendChild(icon(ICONS.table, 14));
        els.toggleLabel = DOM.create('span', { text: 'Show all' });
        els.toggleAll.appendChild(els.toggleLabel);
        root.appendChild(DOM.create('div', { className: 'ta-actions', children: [els.send, els.toggleAll] }));

        // Every unit of the kind
        els.tbody = DOM.create('tbody');
        els.table = DOM.create('table', {
            className: 'data-table un-table',
            children: [
                DOM.create('caption', { className: 'ta-sr', text: 'The value in every matching unit. Click a row to copy it.' }),
                DOM.create('thead', {
                    children: [DOM.create('tr', {
                        children: [
                            DOM.create('th', { text: 'Unit', attrs: { scope: 'col' } }),
                            DOM.create('th', { className: 'num', text: 'Value', attrs: { scope: 'col' } })
                        ]
                    })]
                }),
                els.tbody
            ]
        });
        els.allHint = DOM.create('p', { className: 'pane-hint', text: 'Click a row to copy its value.' });
        els.all = DOM.create('div', {
            id: 'un-all',
            className: 'un-all',
            children: [DOM.create('div', { className: 'table-wrap un-table-wrap', children: [els.table] }), els.allHint]
        });
        root.appendChild(els.all);

        mount.appendChild(root);
        els.root = root;
        return true;
    }

    /* ── Render ────────────────────────────────────────────── */

    function fillUnits(select, list, value, allowed) {
        const want = list.filter((u) => !allowed || allowed.has(u.symbol));
        const sig = want.map((u) => u.symbol).join('|');
        if (select.dataset.sig !== sig) {
            select.textContent = '';
            want.forEach((u) => select.appendChild(DOM.create('option', { text: `${u.name} (${u.symbol})`, attrs: { value: u.symbol } })));
            select.dataset.sig = sig;
        }
        if (select.value !== value) select.value = value;
    }

    function setInvalid(input, bad) {
        if (bad) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }

    function render() {
        if (!els.category || !model) return;
        const list = unitsOf(model.category);
        if (els.category.value !== model.category) els.category.value = model.category;
        fillUnits(els.fromUnit, list, model.from, null);
        const matching = compatibleWith(model.category, model.from);
        fillUnits(els.toUnit, list, model.to, matching);

        const left = list.length - matching.size;
        els.note.textContent = left > 0
            ? `To lists only units of the same kind as ${unitName(model.category, model.from)} (${model.from}). The other ${left} ${left === 1 ? 'unit here measures' : 'units here measure'} something else.`
            : '';
        els.note.hidden = !left;

        const r = compute();
        const typed = model.anchor === 'from' ? els.fromValue : els.toValue;
        const other = model.anchor === 'from' ? els.toValue : els.fromValue;
        if (document.activeElement !== typed && typed.value !== model.value) typed.value = model.value;
        setInvalid(typed, Boolean(r.error));
        setInvalid(other, false);
        els.error.textContent = r.error || '';

        if (r.ok) {
            other.value = fmtField(model.anchor === 'from' ? r.to : r.from);
            els.sentence.textContent = `${fmt(r.from)} ${r.fromUnit} = ${fmt(r.to)} ${r.toUnit}`;
            els.sentence.dataset.state = 'value';
            els.copy.disabled = false;
            els.send.disabled = false;
            const line = sheetLine(r);
            els.send.title = `Add “${line}” to the worksheet`;
            els.send.setAttribute('aria-label', `Send ${line} to the worksheet`);
        } else {
            other.value = '';
            els.sentence.textContent = r.empty
                ? `Type a number in ${r.side === 'to' ? 'To' : 'From'} to convert it.`
                : 'Fix the number above to see the conversion.';
            els.sentence.dataset.state = 'empty';
            els.copy.disabled = true;
            els.send.disabled = true;
            els.send.title = 'Type a number to convert first';
            els.send.setAttribute('aria-label', 'Send the conversion to the worksheet');
        }
        els.fromValue.placeholder = model.anchor === 'to' ? 'Converted' : 'Type a number';
        els.toValue.placeholder = model.anchor === 'from' ? 'Converted' : 'Type a number';

        els.toggleAll.setAttribute('aria-expanded', String(model.showAll));
        els.toggleLabel.textContent = model.showAll ? 'Hide table' : `Show all ${matching.size}`;
        els.toggleAll.title = model.showAll ? 'Hide the table of every unit' : 'Show the value in every unit of this kind';
        els.all.hidden = !model.showAll;
        if (model.showAll) renderTable(r, list, matching);
    }

    function renderTable(r, list, matching) {
        els.tbody.textContent = '';
        const rows = list.filter((u) => matching.has(u.symbol));
        rows.forEach((u) => {
            let valueText = '—';
            let copyText = '';
            if (r.ok) {
                const out = convert(r.from, r.fromUnit, u.symbol);
                if (out.error) valueText = 'too large';
                else {
                    valueText = fmt(out.value);
                    copyText = `${fmtField(out.value)} ${u.symbol}`;
                }
            }
            const marks = [];
            if (u.symbol === model.from) marks.push('From');
            if (u.symbol === model.to) marks.push('To');
            const nameCell = DOM.create('td', {
                children: [
                    DOM.create('span', { className: 'un-row-name', text: u.name }),
                    ' ',
                    DOM.create('span', { className: 'un-row-sym', text: u.symbol })
                ]
            });
            marks.forEach((m) => {
                nameCell.appendChild(document.createTextNode(' '));
                nameCell.appendChild(DOM.create('span', { className: 'badge un-mark', text: m, attrs: { 'data-tone': 'brand' } }));
            });
            const btn = DOM.create('button', {
                className: 'un-cell-btn',
                attrs: {
                    type: 'button',
                    'data-copy': copyText,
                    'aria-label': copyText ? `Copy ${copyText}` : `No value for ${u.name}`,
                    title: copyText ? `Copy ${copyText}` : 'Type a number to convert first'
                }
            });
            btn.appendChild(breakable(valueText));
            btn.disabled = !copyText;
            const tr = DOM.create('tr', {
                attrs: { 'data-copy': copyText },
                children: [nameCell, DOM.create('td', { className: 'num', children: [btn] })]
            });
            if (u.symbol === model.to) tr.dataset.active = 'true';
            els.tbody.appendChild(tr);
        });
    }

    /* ── Actions ───────────────────────────────────────────── */

    /** Pick the unit pair for a category (remembered pair, else the default). */
    function useCategory(category) {
        if (!categories().some((c) => c.id === category)) return false;
        if (model.category) model.pairs[model.category] = { from: model.from, to: model.to };
        const pair = model.pairs[category] && validPair(category, model.pairs[category].from, model.pairs[category].to)
            ? model.pairs[category]
            : defaultPair(category);
        model.category = category;
        model.from = pair.from;
        model.to = pair.to;
        persist();
        render();
        return true;
    }

    function setUnit(which, symbol) {
        const list = unitsOf(model.category).map((u) => u.symbol);
        if (!list.includes(symbol)) return false;
        if (which === 'from') {
            model.from = symbol;
            if (!compatibleWith(model.category, symbol).has(model.to)) {
                const prev = model.to;
                const options = [...compatibleWith(model.category, symbol)];
                model.to = options.find((s) => s !== symbol) || symbol;
                notify(`To is now ${unitName(model.category, model.to)} (${model.to}), because ${prev} and ${symbol} measure different things.`, 'info', 3200);
            }
        } else {
            if (!compatibleWith(model.category, model.from).has(symbol)) return false;
            model.to = symbol;
        }
        persist();
        render();
        return true;
    }

    function swap() {
        if (!model || !model.category) return false;
        const { from, to } = model;
        model.from = to;
        model.to = from;
        persist();
        render();
        if (window.ToolApp) ToolApp.flash(els.swap);
        return true;
    }

    function setValue(which, text) {
        model.anchor = which === 'to' ? 'to' : 'from';
        model.value = String(text).slice(0, MAX_INPUT);
        persist();
        render();
    }

    function copyResult() {
        const r = compute();
        if (!r.ok) {
            notify(r.error || 'Type a number to convert first.', 'info', 2400);
            return;
        }
        const text = `${fmtField(r.to)} ${r.toUnit}`;
        if (window.ToolApp) ToolApp.copy(text, text, els.copy);
    }

    function sheetLineCount() {
        const text = State.activeSheet().text;
        let n = 1;
        for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
        return n;
    }

    /** Append a line to the active worksheet (WorksheetUI first, State as the fallback). */
    function appendToSheet(line) {
        if (sheetLineCount() >= MAX_LINES) {
            notify(`This sheet has ${MAX_LINES.toLocaleString('en-US')} lines, the most mathMan works out. Start a new sheet to add more.`, 'warning', 4000);
            return false;
        }
        const before = State.activeSheet().text;
        const ws = window.WorksheetUI;
        if (ws && typeof ws.appendLine === 'function') {
            try {
                ws.appendLine(line);
                // The worksheet explains a refusal (a full sheet) itself.
                return State.activeSheet().text !== before;
            } catch (err) {
                console.error('[UnitsUI] WorksheetUI.appendLine failed:', err);
            }
        }
        const sheet = State.activeSheet();
        const body = sheet.text.replace(/\n+$/, '');
        return State.setSheetText(sheet.id, body ? `${body}\n${line}` : line);
    }

    function sendToSheet() {
        const r = compute();
        if (!r.ok) {
            notify(r.error || 'Type a number to convert first.', 'info', 2600);
            return null;
        }
        const line = sheetLine(r);
        if (!appendToSheet(line)) return null;
        notify(`Added to “${State.activeSheet().name}”: ${line}`, 'success', 2200);
        if (window.ToolApp) ToolApp.flash(els.send);
        return line;
    }

    function toggleAll() {
        model.showAll = !model.showAll;
        persist();
        render();
    }

    function copyRow(text, btn) {
        if (!text) {
            notify('Type a number to convert first.', 'info', 2000);
            return;
        }
        if (window.ToolApp) ToolApp.copy(text, text, btn);
    }

    /* ── Events ────────────────────────────────────────────── */

    function bind() {
        DOM.on(els.category, 'change', () => useCategory(els.category.value));
        DOM.on(els.fromUnit, 'change', () => setUnit('from', els.fromUnit.value));
        DOM.on(els.toUnit, 'change', () => setUnit('to', els.toUnit.value));
        DOM.on(els.fromValue, 'input', () => setValue('from', els.fromValue.value));
        DOM.on(els.toValue, 'input', () => setValue('to', els.toValue.value));
        // Leaving a side tidies the computed one; the typed one keeps its text.
        [els.fromValue, els.toValue].forEach((input) => DOM.on(input, 'blur', render));
        DOM.on(els.swap, 'click', swap);
        DOM.on(els.copy, 'click', copyResult);
        DOM.on(els.send, 'click', sendToSheet);
        DOM.on(els.toggleAll, 'click', toggleAll);
        DOM.on(els.tbody, 'click', (e) => {
            const btn = e.target.closest('.un-cell-btn');
            const tr = e.target.closest('tr');
            if (btn) copyRow(btn.dataset.copy, btn);
            else if (tr) copyRow(tr.dataset.copy, DOM.$('.un-cell-btn', tr));
        });

        State.on('settings', () => render());
        const reload = () => {
            model = loadModel();
            els.fromValue.value = model.anchor === 'from' ? model.value : '';
            els.toValue.value = model.anchor === 'to' ? model.value : '';
            render();
        };
        State.on('reset', reload);
        State.on('panes', (p) => {
            if (p && (p.action === 'reset' || p.action === 'import')) reload();
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    const UnitsUI = {
        init() {
            const mount = DOM.id('mount-units');
            if (!mount || els.root) return;
            els.mount = mount;
            if (!build(mount)) return;
            model = loadModel();
            (model.anchor === 'from' ? els.fromValue : els.toValue).value = model.value;
            bind();
            render();
        },

        /** Set any of { category, from, to, value, anchor }; invalid parts are ignored. Returns the state. */
        set(patch = {}) {
            if (!model) return null;
            if (typeof patch.category === 'string' && patch.category !== model.category) useCategory(patch.category);
            if (typeof patch.from === 'string') setUnit('from', patch.from);
            if (typeof patch.to === 'string') setUnit('to', patch.to);
            if (typeof patch.value === 'string' || typeof patch.value === 'number') {
                setValue(patch.anchor === 'to' ? 'to' : 'from', String(patch.value));
            }
            return { ...model, pairs: undefined };
        },

        convert() {
            const r = compute();
            return r.ok ? { from: r.from, to: r.to, fromUnit: r.fromUnit, toUnit: r.toUnit } : null;
        },
        swap,
        sendToSheet,
        parseValue,
        render
    };

    window.UnitsUI = UnitsUI;
})();
