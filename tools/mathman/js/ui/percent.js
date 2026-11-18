/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: PercentUI (mathMan Edition - v1.0)
 *     - File Name: percent.js
 *     - Relative Path: tools/mathman/js/ui/percent.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Percentages pane in the Tools rail: six small calculators for the
 *     percent and ratio questions people ask most, each answering as you
 *     type with the number and a plain sentence ("30 is 20% of 150"). Use
 *     it for a quick answer, then copy it or send the matching expression
 *     to the worksheet so the working stays on the sheet.
 *
 * ✒ Key Features:
 *     - Chip tabs (arrow keys, Home and End move between them): X% of Y,
 *       X is what % of Y, % change, add or remove a %, reverse %, and ratio
 *     - Live answers with a sentence under each one; increases and
 *       decreases are named in words and marked ▲ / ▼, never by color alone
 *     - Add / remove % and reverse % have Increase / Decrease chips, so the
 *       percent is always typed as a positive number
 *     - Ratio simplifier (1920 × 1080 → 16:9, with the decimal form) and an
 *       aspect scaler that keeps the shape for a new width or height
 *     - Inputs accept 1,250.5, $80, 7.5%, 1_000, and the Unicode minus;
 *       a bad entry marks its field and explains itself in plain words
 *     - Copy puts the answer on the clipboard; Send to sheet appends the
 *       worksheet expression that gives the same answer (20% of 150,
 *       30 / 150 to %, 180 / (1 + 20%), Aspect ratio: 1920/1080 to fraction)
 *     - Numbers follow the visitor's digits, notation, and separator
 *       settings and re-format when those settings change
 *     - The open calculator and every field are remembered per browser
 *       through State.pane('percent') and validated when read back
 *
 * ✒ Usage Instructions:
 *     Load after js/finance.js and js/state.js (and js/ui/worksheet.js),
 *     before js/app.js. app.js calls PercentUI.init() once through
 *     ToolApp.boot(); the module renders into #mount-percent and keeps
 *     itself current from State events.
 *
 * ✒ Examples:
 *     PercentUI.init()                          → builds the pane inside #mount-percent
 *     PercentUI.show('change')                  → opens the % change calculator
 *     PercentUI.set('of', { p: '15', x: '80' }) → the answer reads 12
 *     PercentUI.answer()                        → { value: 12, copy: '12', sentence: '15% of 80 is 12.', … }
 *     PercentUI.send()                          → appends "15% of 80" to the sheet
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/finance.js (Finance), js/state.js (State),
 *       js/ui/worksheet.js (WorksheetUI, optional), shared/js/dom.js,
 *       toolapp.js, toolman.js; css/tools-c.css
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: values are limited to ±1e15 and percents to ±1e9;
 *       ratios take up to 30 digits per side
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'percent';
    const MAX_CHARS = 40;
    const SAVE_DELAY = 400;

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        send: svg('<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>')
    };

    const DIRS = [
        { id: 'increase', label: 'Increase', title: 'The value goes up by the percentage' },
        { id: 'decrease', label: 'Decrease', title: 'The value goes down by the percentage' }
    ];
    const SCALE_BY = [
        { id: 'width', label: 'New width', title: 'Type a new width; the height is worked out' },
        { id: 'height', label: 'New height', title: 'Type a new height; the width is worked out' }
    ];

    /* The six calculators: tab chip, its hover title, the question it answers, and its fields. */
    const CALCS = [
        {
            id: 'of', chip: 'X% of Y', title: 'Find a percentage of a number',
            question: 'What is X% of Y?',
            fields: [
                { key: 'p', label: 'Percent', suffix: '%', example: '20' },
                { key: 'x', label: 'Of', example: '150' }
            ]
        },
        {
            id: 'what', chip: 'X is ?% of Y', title: 'Find what percent one number is of another',
            question: 'X is what percent of Y?',
            fields: [
                { key: 'part', label: 'Part (X)', example: '30' },
                { key: 'whole', label: 'Whole (Y)', example: '150' }
            ]
        },
        {
            id: 'change', chip: '% change', title: 'Percent increase or decrease from one value to another',
            question: 'By what percent did X change to Y?',
            fields: [
                { key: 'from', label: 'From', example: '80' },
                { key: 'to', label: 'To', example: '100' }
            ]
        },
        {
            id: 'adjust', chip: 'Add / remove %', title: 'Increase or decrease a number by a percentage',
            question: 'What is X after adding or removing Y%?',
            dir: true,
            fields: [
                { key: 'x', label: 'Value', example: '150' },
                { key: 'p', label: 'By', suffix: '%', example: '20' }
            ]
        },
        {
            id: 'reverse', chip: 'Reverse %', title: 'Find the original number before a percentage change',
            question: 'X is the result after a Y% change — what was the original?',
            dir: true,
            fields: [
                { key: 'x', label: 'Result (X)', example: '180' },
                { key: 'p', label: 'Change (Y)', suffix: '%', example: '20' }
            ]
        },
        {
            id: 'ratio', chip: 'Ratio', title: 'Simplify a ratio and scale it to a new size',
            question: 'Simplify W : H, then scale it to a new size.',
            fields: [
                { key: 'w', label: 'Width (W)', example: '1920' },
                { key: 'h', label: 'Height (H)', example: '1080' }
            ]
        }
    ];
    const CALC_IDS = CALCS.map((c) => c.id);

    /* Finance names its inputs generically; these map them onto each calculator's fields. */
    const FIELD_MAP = {
        of: { percent: 'p', value: 'x' },
        adjust: { value: 'x', percent: 'p' },
        reverse: { result: 'x', percent: 'p' },
        ratio: { a: 'w', b: 'h' }
    };
    const byId = Object.create(null);
    CALCS.forEach((c) => { byId[c.id] = c; });

    const els = { panels: Object.create(null) };
    const ui = Object.create(null);   // calc id → { inputs, wraps, errs, answer…, dir, … }
    let active = 'of';
    let saveTimer = 0;
    let lastAnswer = null;
    let ready = false;

    /* ── Small helpers ─────────────────────────────────────── */

    const hasFinance = () => Boolean(window.Finance && typeof Finance.percentOf === 'function');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    /** A number as results are shown (digits, notation, separators from Settings). */
    function fmt(n, overrides) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        try { return State.formatNumber(n, overrides); } catch (_err) { return String(n); }
    }

    /** The same number without separators, for the clipboard. */
    function plain(n) {
        return fmt(n, { thousands: 'none' });
    }

    /** A number typed into an expression for the worksheet. */
    function lit(n) {
        const s = String(n);
        return n < 0 ? `(${s})` : s;
    }

    function copy(text, label, btn) {
        if (!text) return;
        if (window.ToolApp && typeof ToolApp.copy === 'function') ToolApp.copy(text, label, btn);
        else if (window.DOM && DOM.copyText) DOM.copyText(text);
    }

    const cleanStr = (v, fallback) => (typeof v === 'string' && v.length <= MAX_CHARS ? v : fallback);

    /** Saved values for one calculator, each checked; examples fill the gaps on first use. */
    function prefsFor(id, saved) {
        const calc = byId[id];
        const src = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
        const out = {};
        calc.fields.forEach((f) => { out[f.key] = cleanStr(src && src[f.key], src ? '' : f.example); });
        if (calc.dir) out.dir = src && src.dir === 'decrease' ? 'decrease' : 'increase';
        if (id === 'ratio') {
            out.by = src && src.by === 'height' ? 'height' : 'width';
            out.target = cleanStr(src && src.target, src ? '' : '1280');
        }
        return out;
    }

    function prefs() {
        const p = (window.State && State.pane(PANE)) || {};
        const out = { tab: CALC_IDS.includes(p.tab) ? p.tab : 'of' };
        CALC_IDS.forEach((id) => { out[id] = prefsFor(id, Object.prototype.hasOwnProperty.call(p, id) ? p[id] : null); });
        return out;
    }

    function readCalc(id) {
        const u = ui[id];
        const out = {};
        Object.keys(u.inputs).forEach((k) => { out[k] = u.inputs[k].value.slice(0, MAX_CHARS); });
        if (u.dir) out.dir = u.dir.value;
        if (u.by) out.by = u.by.value;
        return out;
    }

    function persist() {
        clearTimeout(saveTimer);
        saveTimer = 0;
        if (!window.State) return;
        const patch = { tab: active };
        CALC_IDS.forEach((id) => { patch[id] = readCalc(id); });
        if (!State.setPane(PANE, patch)) console.warn('[PercentUI] could not save pane preferences:', State.lastError);
    }

    function schedulePersist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, SAVE_DELAY);
    }

    /** Append lines to the active sheet (through the worksheet when it is there). */
    function sendToSheet(lines, what) {
        const text = lines.join('\n');
        if (window.WorksheetUI && typeof WorksheetUI.appendLine === 'function') {
            const res = WorksheetUI.appendLine(text);
            if (!res) return false;
            if (res.kind === 'error' && res.error) notify(`Sent ${what}, but the sheet shows an error on it: ${res.error.message}`, 'warning', 4500);
            else notify(`Sent ${what} to the sheet.`, 'success', 2200);
            return true;
        }
        if (!window.State) return false;
        const sheet = State.activeSheet();
        const next = sheet.text.trim() ? `${sheet.text.replace(/\s+$/, '')}\n${text}` : text;
        if (!State.setSheetText(sheet.id, next)) {
            notify(State.lastError || 'Could not add that to the sheet.', 'error', 4000);
            return false;
        }
        State.evaluate();
        notify(`Sent ${what} to the sheet.`, 'success', 2200);
        return true;
    }

    /* ── Build ─────────────────────────────────────────────── */

    function iconButton(icon, label, cls) {
        return DOM.create('button', {
            className: cls || 'icon-action',
            html: icon,
            attrs: { type: 'button', 'aria-label': label, title: label }
        });
    }

    function textButton(icon, label, cls, title) {
        const btn = DOM.create('button', {
            className: cls,
            html: icon || '',
            attrs: { type: 'button', title: title || label }
        });
        btn.appendChild(DOM.create('span', { text: label }));
        return btn;
    }

    /** A labelled number field with an optional suffix (%), its own error line, and an input id. */
    function field(id, f) {
        const inputId = `pc-${id}-${f.key}`;
        const errId = `${inputId}-err`;
        const input = DOM.create('input', {
            className: 'tc-input',
            attrs: {
                id: inputId,
                type: 'text',
                inputmode: 'decimal',
                autocomplete: 'off',
                spellcheck: 'false',
                maxlength: String(MAX_CHARS),
                placeholder: f.example,
                'aria-describedby': errId
            }
        });
        const wrap = DOM.create('div', { className: 'tc-input-wrap', children: [input] });
        if (f.suffix) wrap.appendChild(DOM.create('span', { className: 'tc-affix', text: f.suffix, attrs: { 'aria-hidden': 'true' } }));
        const err = DOM.create('p', { className: 'tc-field-error', attrs: { id: errId } });
        const box = DOM.create('div', {
            className: 'tc-field',
            children: [DOM.create('label', { className: 'mini-label', text: f.label, attrs: { for: inputId } }), wrap, err]
        });
        return { box, input, wrap, err };
    }

    /** A radiogroup of chips with roving focus; returns { el, value, set(v) }. */
    function chipGroup(label, options, onPick, cls) {
        const group = DOM.create('div', { className: `chip-row tc-chips ${cls || ''}`.trim(), attrs: { role: 'radiogroup', 'aria-label': label } });
        const chips = options.map((o) => DOM.create('button', {
            className: 'chip-btn',
            text: o.label,
            attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', title: o.title || o.label, tabindex: '-1' },
            data: { value: o.id }
        }));
        chips.forEach((c) => group.appendChild(c));
        const api = {
            el: group,
            value: options[0].id,
            set(value) {
                api.value = options.some((o) => o.id === value) ? value : options[0].id;
                chips.forEach((c) => {
                    const on = c.dataset.value === api.value;
                    c.setAttribute('aria-checked', String(on));
                    c.tabIndex = on ? 0 : -1;
                });
            }
        };
        group.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip-btn');
            if (!chip || chip.dataset.value === api.value) return;
            api.set(chip.dataset.value);
            onPick(api.value);
        });
        group.addEventListener('keydown', (e) => {
            const i = chips.findIndex((c) => c.dataset.value === api.value);
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % chips.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + chips.length) % chips.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = chips.length - 1;
            if (next < 0) return;
            e.preventDefault();
            chips[next].focus();
            api.set(chips[next].dataset.value);
            onPick(api.value);
        });
        api.set(options[0].id);
        return api;
    }

    /** A visible label beside a chip group; the group is labelled by it. */
    function labelledRow(id, text, group) {
        const label = DOM.create('span', { className: 'mini-label', text, attrs: { id } });
        group.setAttribute('aria-labelledby', id);
        group.removeAttribute('aria-label');
        return DOM.create('div', { className: 'tc-inline', children: [label, group] });
    }

    /** The tab strip: chips with role="tab", arrow keys move and select. */
    function buildTabs(root) {
        const list = DOM.create('div', { className: 'chip-row tc-tabs', attrs: { role: 'tablist', 'aria-label': 'Percentage calculators' } });
        els.tabs = CALCS.map((c) => {
            const tab = DOM.create('button', {
                className: 'chip-btn tc-tab',
                text: c.chip,
                attrs: {
                    type: 'button',
                    role: 'tab',
                    id: `pc-tab-${c.id}`,
                    'aria-selected': 'false',
                    'aria-controls': `pc-panel-${c.id}`,
                    title: c.title,
                    tabindex: '-1'
                },
                data: { calc: c.id }
            });
            list.appendChild(tab);
            return tab;
        });
        list.addEventListener('click', (e) => {
            const tab = e.target.closest('.tc-tab');
            if (tab) show(tab.dataset.calc);
        });
        list.addEventListener('keydown', (e) => {
            const i = CALC_IDS.indexOf(active);
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % CALC_IDS.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + CALC_IDS.length) % CALC_IDS.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = CALC_IDS.length - 1;
            if (next < 0) return;
            e.preventDefault();
            show(CALC_IDS[next]);
            els.tabs[next].focus();
        });
        root.appendChild(list);
    }

    /** The answer card: label, big value, copy button, and the sentence. */
    function answerCard(id, labelText) {
        const label = DOM.create('span', { className: 'tc-answer-label', text: labelText, attrs: { id: `pc-${id}-label` } });
        const copyBtn = iconButton(ICONS.copy, 'Copy the answer', 'icon-action tc-answer-copy');
        const value = DOM.create('output', {
            className: 'tc-answer-value',
            attrs: { 'aria-labelledby': `pc-${id}-label` }
        });
        const sentence = DOM.create('p', { className: 'tc-sentence', attrs: { 'aria-live': 'polite' } });
        const card = DOM.create('div', {
            className: 'tc-answer',
            children: [DOM.create('div', { className: 'tc-answer-head', children: [label, copyBtn] }), value, sentence]
        });
        return { card, label, value, sentence, copyBtn };
    }

    function buildPanel(calc, saved) {
        const panel = DOM.create('div', {
            className: 'tc-panel',
            attrs: { role: 'tabpanel', id: `pc-panel-${calc.id}`, 'aria-labelledby': `pc-tab-${calc.id}`, tabindex: '-1' }
        });
        panel.appendChild(DOM.create('p', { className: 'tc-question', text: calc.question }));
        const u = { inputs: Object.create(null), wraps: Object.create(null), errs: Object.create(null) };
        const grid = DOM.create('div', { className: 'tc-fields' });
        calc.fields.forEach((f) => {
            const fl = field(calc.id, f);
            fl.input.value = saved[f.key];
            u.inputs[f.key] = fl.input;
            u.wraps[f.key] = fl.wrap;
            u.errs[f.key] = fl.err;
            grid.appendChild(fl.box);
        });
        panel.appendChild(grid);

        if (calc.dir) {
            u.dir = chipGroup('Direction of the change', DIRS, () => { update(calc.id); schedulePersist(); });
            u.dir.set(saved.dir);
            panel.appendChild(labelledRow(`pc-${calc.id}-dir`, calc.id === 'reverse' ? 'The change was' : 'Direction', u.dir.el));
        }

        const ans = answerCard(calc.id, 'Answer');
        Object.assign(u, ans);
        panel.appendChild(ans.card);

        u.extras = DOM.create('div', { className: 'readout-list tc-readouts' });
        panel.appendChild(u.extras);

        if (calc.id === 'ratio') buildScaler(panel, u, saved);

        const actions = DOM.create('div', { className: 'tc-actions' });
        u.copyMain = textButton(ICONS.copy, 'Copy', 'btn btn-secondary btn-sm', 'Copy the answer');
        u.send = textButton(ICONS.send, 'Send to sheet', 'btn btn-primary btn-sm', 'Add the calculation to the end of the worksheet');
        actions.appendChild(u.copyMain);
        actions.appendChild(u.send);
        panel.appendChild(actions);

        const onCopy = (btn) => {
            const a = u.answer;
            if (!a) { notify(u.problem || 'Enter both numbers first.', 'warning', 2500); return; }
            copy(a.copy, a.copyLabel || 'the answer', btn);
        };
        ans.copyBtn.addEventListener('click', () => onCopy(ans.copyBtn));
        u.copyMain.addEventListener('click', () => onCopy(u.copyMain));
        u.send.addEventListener('click', () => sendCalc(calc.id));

        panel.addEventListener('input', (e) => {
            if (e.target.matches('input')) { update(calc.id); schedulePersist(); }
        });

        ui[calc.id] = u;
        els.panels[calc.id] = panel;
        return panel;
    }

    function buildScaler(panel, u, saved) {
        panel.appendChild(DOM.create('h5', { className: 'section-label tc-subhead', text: 'Scale to a new size' }));
        u.by = chipGroup('Scale by', SCALE_BY, () => { syncScaleLabel(u); update('ratio'); schedulePersist(); });
        u.by.set(saved.by);
        panel.appendChild(labelledRow('pc-ratio-by', 'Keep the shape for a', u.by.el));
        const fl = field('ratio', { key: 'target', label: 'New width', example: '1280' });
        fl.input.value = saved.target;
        u.inputs.target = fl.input;
        u.wraps.target = fl.wrap;
        u.errs.target = fl.err;
        u.targetLabel = fl.box.querySelector('label');
        panel.appendChild(DOM.create('div', { className: 'tc-fields tc-fields--single', children: [fl.box] }));
        const label = DOM.create('span', { className: 'readout-label', text: 'Scaled' });
        u.scaledValue = DOM.create('code', { className: 'readout-value', text: '—' });
        u.scaledCopy = iconButton(ICONS.copy, 'Copy the scaled size');
        u.scaledCopy.addEventListener('click', () => {
            if (u.scaled) copy(u.scaled.copy, 'the scaled size', u.scaledCopy);
            else notify(u.scaleProblem || 'Enter a new width or height first.', 'warning', 2500);
        });
        panel.appendChild(DOM.create('div', {
            className: 'readout-list tc-readouts',
            children: [DOM.create('div', { className: 'readout', attrs: { 'data-primary': 'true' }, children: [label, u.scaledValue, u.scaledCopy] })]
        }));
        u.scaleSentence = DOM.create('p', { className: 'tc-note', attrs: { 'aria-live': 'polite' } });
        panel.appendChild(u.scaleSentence);
        syncScaleLabel(u);
    }

    function syncScaleLabel(u) {
        const by = u.by.value;
        u.targetLabel.textContent = by === 'height' ? 'New height' : 'New width';
        u.inputs.target.placeholder = by === 'height' ? '720' : '1280';
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'tc-pane pc' });
        buildTabs(root);
        const saved = prefs();
        CALCS.forEach((c) => root.appendChild(buildPanel(c, saved[c.id])));
        els.root = root;
        mount.appendChild(root);
        active = saved.tab;
    }

    /* ── Compute ───────────────────────────────────────────── */

    /** Read the named fields as numbers: { values } or { missing, invalid:[{key, message}] }. */
    function readNumbers(id, keys) {
        const u = ui[id];
        const values = {};
        const invalid = [];
        let missing = false;
        keys.forEach((k) => {
            const raw = u.inputs[k].value.trim();
            if (!raw) { missing = true; return; }
            try {
                values[k] = Finance.parseNumber(raw, 'a number');
            } catch (err) {
                invalid.push({ key: k, message: err.message });
            }
        });
        return { values, missing, invalid };
    }

    function markField(u, key, message) {
        const wrap = u.wraps[key];
        const err = u.errs[key];
        if (!wrap) return;
        if (message) {
            wrap.dataset.invalid = 'true';
            u.inputs[key].setAttribute('aria-invalid', 'true');
            err.textContent = message;
        } else {
            delete wrap.dataset.invalid;
            u.inputs[key].removeAttribute('aria-invalid');
            err.textContent = '';
        }
    }

    const signWord = (eff) => (eff < 0 ? 'decreased' : 'increased');

    /** The answer for one calculator from its numbers; throws Finance errors. */
    function solve(id, v, dir) {
        switch (id) {
            case 'of': {
                const r = Finance.percentOf(v.p, v.x);
                return {
                    label: 'Answer',
                    value: r,
                    display: fmt(r),
                    copy: plain(r),
                    sentence: `${fmt(v.p)}% of ${fmt(v.x)} is ${fmt(r)}.`,
                    lines: [`${lit(v.p)}% of ${lit(v.x)}`]
                };
            }
            case 'what': {
                const r = Finance.whatPercent(v.part, v.whole);
                return {
                    label: 'Percent',
                    value: r,
                    display: `${fmt(r)}%`,
                    copy: `${plain(r)}%`,
                    sentence: `${fmt(v.part)} is ${fmt(r)}% of ${fmt(v.whole)}.`,
                    lines: [`${lit(v.part)} / ${lit(v.whole)} to %`]
                };
            }
            case 'change': {
                const r = Finance.percentChange(v.from, v.to);
                const diff = Finance.tidy(v.to - v.from);
                let label = 'No change';
                let display = '0%';
                let sentence = `${fmt(v.from)} to ${fmt(v.to)} is no change.`;
                if (r > 0) {
                    label = '▲ Increase';
                    display = `+${fmt(r)}%`;
                    sentence = `From ${fmt(v.from)} to ${fmt(v.to)} is a ${fmt(r)}% increase (up ${fmt(diff)}).`;
                } else if (r < 0) {
                    label = '▼ Decrease';
                    display = `−${fmt(-r)}%`;
                    sentence = `From ${fmt(v.from)} to ${fmt(v.to)} is a ${fmt(-r)}% decrease (down ${fmt(-diff)}).`;
                }
                return {
                    label,
                    value: r,
                    display,
                    copy: `${plain(r)}%`,
                    sentence,
                    extras: [['Difference', diff > 0 ? `+${fmt(diff)}` : fmt(diff), plain(diff), 'the difference']],
                    lines: [`(${lit(v.to)} - ${lit(v.from)}) / abs(${lit(v.from)}) to %`]
                };
            }
            case 'adjust': {
                const eff = dir === 'decrease' ? -v.p : v.p;
                const r = Finance.applyPercent(v.x, eff);
                const delta = Finance.tidy(r - v.x);
                const op = eff < 0 ? '-' : '+';
                const more = delta >= 0 ? 'more' : 'less';
                return {
                    label: eff < 0 ? '▼ Decreased' : '▲ Increased',
                    value: r,
                    display: fmt(r),
                    copy: plain(r),
                    sentence: `${fmt(v.x)} ${signWord(eff)} by ${fmt(Math.abs(eff))}% is ${fmt(r)} — ${fmt(Math.abs(delta))} ${more}.`,
                    extras: [['Change', delta > 0 ? `+${fmt(delta)}` : fmt(delta), plain(delta), 'the change']],
                    lines: [`${lit(v.x)} ${op} ${lit(Math.abs(eff))}%`]
                };
            }
            case 'reverse': {
                const eff = dir === 'decrease' ? -v.p : v.p;
                const r = Finance.reversePercent(v.x, eff);
                const op = eff < 0 ? '-' : '+';
                return {
                    label: 'Original',
                    value: r,
                    display: fmt(r),
                    copy: plain(r),
                    sentence: `The original was ${fmt(r)}: ${fmt(r)} ${signWord(eff)} by ${fmt(Math.abs(eff))}% is ${fmt(v.x)}.`,
                    extras: [['Change', fmt(Finance.tidy(v.x - r)), plain(Finance.tidy(v.x - r)), 'the change']],
                    lines: [`${lit(v.x)} / (1 ${op} ${lit(Math.abs(eff))}%)`]
                };
            }
            case 'ratio': {
                const r = Finance.ratio(v.w, v.h);
                const decimal = v.h === 0 ? null : v.w / v.h;
                const decText = decimal === null ? '' : `${fmt(decimal, { precision: 4 })}\u00A0:\u00A01`;
                return {
                    label: 'Simplest ratio',
                    value: r,
                    display: r.replace(':', '\u00A0:\u00A0'),
                    copy: r,
                    copyLabel: 'the ratio',
                    sentence: decimal === null
                        ? `${fmt(v.w)} : ${fmt(v.h)} simplifies to ${r}.`
                        : `${fmt(v.w)} × ${fmt(v.h)} simplifies to ${r}, or ${decText}.`,
                    extras: decimal === null ? [] : [['Decimal', decText, plain(decimal), 'the decimal ratio']],
                    lines: decimal === null ? [] : [`Aspect ratio: ${lit(v.w)}/${lit(v.h)} to fraction`]
                };
            }
            default:
                return null;
        }
    }

    function renderExtras(u, extras) {
        DOM.empty(u.extras);
        (extras || []).forEach(([label, display, copyText, words]) => {
            const btn = iconButton(ICONS.copy, `Copy ${words}`);
            btn.addEventListener('click', () => copy(copyText, words, btn));
            u.extras.appendChild(DOM.create('div', {
                className: 'readout',
                children: [
                    DOM.create('span', { className: 'readout-label', text: label }),
                    DOM.create('code', { className: 'readout-value', text: display }),
                    btn
                ]
            }));
        });
        u.extras.hidden = !(extras && extras.length);
    }

    function setAnswerState(u, state, labelText, valueText, sentence) {
        u.card.dataset.state = state;
        u.label.textContent = labelText;
        u.value.textContent = valueText;
        u.sentence.textContent = sentence;
        u.copyBtn.disabled = state !== 'ok';
        u.copyMain.disabled = state !== 'ok';
        u.send.disabled = state !== 'ok';
    }

    /** Recompute one calculator from its fields and paint the result. */
    function update(id) {
        const u = ui[id];
        const calc = byId[id];
        if (!u) return null;
        if (!hasFinance()) {
            setAnswerState(u, 'error', 'Unavailable', 'The percentage library did not load.', 'Reload the page to try again.');
            renderExtras(u, []);
            return null;
        }
        const keys = calc.fields.map((f) => f.key);
        const read = readNumbers(id, keys);
        keys.forEach((k) => {
            const bad = read.invalid.find((x) => x.key === k);
            markField(u, k, bad ? bad.message : '');
        });
        u.answer = null;
        u.problem = '';
        if (read.invalid.length) {
            u.problem = read.invalid[0].message;
            setAnswerState(u, 'error', 'Check the numbers', read.invalid.length > 1 ? 'Two fields need fixing.' : 'One field needs fixing.', u.problem);
            renderExtras(u, []);
        } else if (read.missing) {
            u.problem = calc.fields.length === 2 ? 'Enter both numbers to see the answer.' : 'Fill in every field to see the answer.';
            setAnswerState(u, 'empty', 'Answer', u.problem, '');
            renderExtras(u, []);
        } else {
            try {
                const a = solve(id, read.values, u.dir ? u.dir.value : '');
                u.answer = a;
                setAnswerState(u, 'ok', a.label, a.display, a.sentence);
                renderExtras(u, a.extras);
            } catch (err) {
                let message = err && err.message ? err.message : 'Those numbers could not be worked out.';
                if (id === 'ratio') message = message.replace('first number', 'width').replace('second number', 'height');
                u.problem = message;
                const mapped = err && err.field ? ((FIELD_MAP[id] && FIELD_MAP[id][err.field]) || err.field) : null;
                const key = mapped && u.inputs[mapped] ? mapped : null;
                if (key) markField(u, key, message);
                setAnswerState(u, 'error', 'Check the numbers', 'No answer for these numbers.', message);
                renderExtras(u, []);
            }
        }
        if (id === 'ratio') updateScale(u, read);
        if (id === active) lastAnswer = u.answer;
        return u.answer;
    }

    function updateScale(u, read) {
        u.scaled = null;
        u.scaleProblem = '';
        const raw = u.inputs.target.value.trim();
        markField(u, 'target', '');
        const by = u.by.value;
        if (!raw) {
            u.scaleProblem = `Type a ${by === 'height' ? 'new height' : 'new width'} to scale ${read.missing || read.invalid.length ? 'the size' : 'it'}.`;
            u.scaledValue.textContent = '—';
            u.scaleSentence.textContent = u.scaleProblem;
            u.scaledCopy.disabled = true;
            return;
        }
        if (read.missing || read.invalid.length || !u.answer) {
            u.scaleProblem = 'Enter a valid width and height above first.';
            u.scaledValue.textContent = '—';
            u.scaleSentence.textContent = u.scaleProblem;
            u.scaledCopy.disabled = true;
            return;
        }
        try {
            const target = Finance.parseNumber(raw, 'a number');
            const s = by === 'height'
                ? Finance.scaleRatio(read.values.w, read.values.h, { height: target })
                : Finance.scaleRatio(read.values.w, read.values.h, { width: target });
            const w = read.values.w;
            const h = read.values.h;
            u.scaled = {
                width: s.width,
                height: s.height,
                copy: `${plain(s.width)} × ${plain(s.height)}`,
                line: by === 'height'
                    ? `Scaled width: ${lit(target)} * ${lit(w)} / ${lit(h)}`
                    : `Scaled height: ${lit(target)} * ${lit(h)} / ${lit(w)}`
            };
            u.scaledValue.textContent = `${fmt(s.width)} × ${fmt(s.height)}`;
            u.scaleSentence.textContent = by === 'height'
                ? `At a height of ${fmt(s.height)}, the width is ${fmt(s.width)}.`
                : `At a width of ${fmt(s.width)}, the height is ${fmt(s.height)}.`;
            u.scaledCopy.disabled = false;
        } catch (err) {
            const message = err && err.message ? err.message.replace('the target', `the ${by === 'height' ? 'new height' : 'new width'}`) : 'That size could not be worked out.';
            u.scaleProblem = message;
            markField(u, 'target', message);
            u.scaledValue.textContent = '—';
            u.scaleSentence.textContent = '';
            u.scaledCopy.disabled = true;
        }
    }

    function updateAll() {
        CALC_IDS.forEach((id) => update(id));
    }

    function sendCalc(id) {
        const u = ui[id];
        const a = u && u.answer;
        if (!a) {
            notify(u && u.problem ? u.problem : 'Enter both numbers first.', 'warning', 3000);
            return false;
        }
        const lines = a.lines.slice();
        if (id === 'ratio' && u.scaled) lines.push(u.scaled.line);
        if (!lines.length) {
            notify('There is nothing to send for these numbers.', 'warning', 2500);
            return false;
        }
        return sendToSheet(lines, lines.length > 1 ? 'the ratio lines' : `“${lines[0]}”`);
    }

    /* ── Tabs ──────────────────────────────────────────────── */

    function show(id) {
        if (!CALC_IDS.includes(id)) return false;
        active = id;
        els.tabs.forEach((t) => {
            const on = t.dataset.calc === id;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
        });
        CALC_IDS.forEach((cid) => { els.panels[cid].hidden = cid !== id; });
        lastAnswer = ui[id] ? ui[id].answer : null;
        if (ready) schedulePersist();
        return true;
    }

    /** Put saved or default values back into every field (after a reset or an import). */
    function reload() {
        const saved = prefs();
        CALCS.forEach((c) => {
            const u = ui[c.id];
            c.fields.forEach((f) => { u.inputs[f.key].value = saved[c.id][f.key]; });
            if (u.dir) u.dir.set(saved[c.id].dir);
            if (c.id === 'ratio') {
                u.by.set(saved.ratio.by);
                u.inputs.target.value = saved.ratio.target;
                syncScaleLabel(u);
            }
        });
        show(saved.tab);
        updateAll();
    }

    /* ── Public API ────────────────────────────────────────── */

    function init() {
        const mount = DOM.id('mount-percent');
        if (!mount || ready) return;
        build(mount);
        show(active);
        updateAll();
        ready = true;
        if (window.State && typeof State.on === 'function') {
            State.on('settings', () => updateAll());
            State.on('panes', (e) => {
                if (e && (e.action === 'reset' || e.action === 'import')) reload();
            });
            State.on('reset', () => reload());
        }
        window.addEventListener('pagehide', () => { if (saveTimer) persist(); });
    }

    /** Fill a calculator's fields: PercentUI.set('of', { p: '15', x: '80' }). */
    function set(id, values) {
        if (!ready || !CALC_IDS.includes(id) || !values || typeof values !== 'object') return null;
        const u = ui[id];
        Object.keys(values).forEach((k) => {
            if (Object.prototype.hasOwnProperty.call(u.inputs, k)) u.inputs[k].value = String(values[k]).slice(0, MAX_CHARS);
            if (k === 'dir' && u.dir) u.dir.set(values[k]);
            if (k === 'by' && u.by) { u.by.set(values[k]); syncScaleLabel(u); }
        });
        show(id);
        const a = update(id);
        schedulePersist();
        return a;
    }

    window.PercentUI = {
        init,
        show,
        set,
        /** The active calculator's answer: { label, value, display, copy, sentence, lines } or null. */
        answer() {
            return lastAnswer ? { ...lastAnswer, lines: lastAnswer.lines.slice() } : null;
        },
        /** Send the active calculator's expression to the sheet. */
        send() {
            return sendCalc(active);
        },
        active: () => active
    };
})();
