/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MoneyUI (mathMan Edition - v1.0)
 *     - File Name: money.js
 *     - Relative Path: tools/mathman/js/ui/money.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Finance pane in the Tools rail: a loan calculator with its
 *     amortization schedule, a savings calculator with compound growth and
 *     regular deposits, and quick money calculators for discounts, sales
 *     tax, tips, simple interest, and CAGR. Use it to answer a money
 *     question in plain words, export the schedule, or send the figures to
 *     the worksheet as labelled lines.
 *
 * ✒ Key Features:
 *     - Chip tabs (arrow keys, Home and End): Loan, Savings, Quick
 *     - Loan: amount, annual rate, term, payment frequency (monthly,
 *       every two weeks, twice a month, weekly, quarterly, yearly), and an
 *       optional extra payment; shows the payment, total interest, total
 *       paid, payoff time, and what the extra payment saves
 *     - Amortization table by year; each year expands to its payments
 *       (aria-expanded), and Export CSV downloads every period
 *     - Savings: starting amount, rate, years, compounding, a contribution
 *       with its own frequency, and End / Start timing; shows the future
 *       value, totals, the effective annual rate, and a yearly table with
 *       its own CSV export
 *     - Share bars with a written legend (amount and percent for principal,
 *       contributions, and interest), so color is never the only signal
 *     - Quick calculators: discount, sales tax, tip split, simple interest,
 *       and CAGR, each with a sentence and its supporting figures
 *     - Money shows in the currency chosen in Settings (Intl.NumberFormat,
 *       JPY and KRW without cents) and follows the thousands-separator
 *       setting; everything re-formats when Settings change
 *     - Fields accept $200,000, 6%, 1_000; missing fields give a hint,
 *       wrong ones a plain message under the field and a red border
 *     - Copy summary, Send to sheet (a heading plus labelled lines the
 *       worksheet evaluates), and Reset (asks first)
 *     - Every field, the open tab, and the open quick calculator are
 *       remembered per browser through State.pane('finance') and validated
 *       when read back
 *
 * ✒ Usage Instructions:
 *     Load after js/finance.js and js/state.js (and js/ui/worksheet.js),
 *     before js/app.js. app.js calls MoneyUI.init() once through
 *     ToolApp.boot(); the module renders into #mount-finance and keeps
 *     itself current from State events.
 *
 * ✒ Examples:
 *     MoneyUI.init()                                  → builds the pane inside #mount-finance
 *     MoneyUI.show('savings')                         → opens the Savings tab
 *     MoneyUI.set('loan', { principal: '300000', rate: '5.5', years: '15' })
 *     MoneyUI.loan()                                  → the current Finance.amortization() result, or null
 *     MoneyUI.showQuick('tip')                        → opens Quick → Tip split
 *     MoneyUI.formatMoney(1199.1)                     → '$1,199.10' (currency from Settings)
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/finance.js (Finance), js/state.js (State),
 *       js/ui/worksheet.js (WorksheetUI, optional), shared/js/dom.js,
 *       toolapp.js, toolman.js, dialogs.js; css/tools-c.css
 *     - Compatible platforms: all evergreen browsers with Intl
 *     - Limitations: figures are not rounded to cents each period the way
 *       a lender's ledger is, so a statement can differ by a few cents; a
 *       schedule holds at most 36,500 payments; amounts go up to
 *       1,000,000,000,000
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'finance';
    const MAX_CHARS = 40;
    const SAVE_DELAY = 400;
    const CALC_DELAY = 120;

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        send: svg('<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>'),
        download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'),
        reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 3 3 9 9 9"></polyline>'),
        chevron: svg('<polyline points="9 6 15 12 9 18"></polyline>', 12)
    };

    const TABS = [
        { id: 'loan', label: 'Loan', title: 'Loan payment, total interest, and the amortization schedule' },
        { id: 'savings', label: 'Savings', title: 'Compound growth of savings with regular deposits' },
        { id: 'quick', label: 'Quick', title: 'Discount, sales tax, tip split, simple interest, and CAGR' }
    ];
    const TAB_IDS = TABS.map((t) => t.id);

    const PAY_FREQ = [
        { value: '12', label: 'Monthly', adj: 'Monthly', per: 'a month' },
        { value: '26', label: 'Every two weeks', adj: 'Biweekly', per: 'every two weeks' },
        { value: '24', label: 'Twice a month', adj: 'Semi-monthly', per: 'twice a month' },
        { value: '52', label: 'Weekly', adj: 'Weekly', per: 'a week' },
        { value: '4', label: 'Quarterly', adj: 'Quarterly', per: 'a quarter' },
        { value: '1', label: 'Yearly', adj: 'Yearly', per: 'a year' }
    ];
    const COMPOUND_FREQ = [
        { value: '365', label: 'Daily', adj: 'daily' },
        { value: '12', label: 'Monthly', adj: 'monthly' },
        { value: '4', label: 'Quarterly', adj: 'quarterly' },
        { value: '2', label: 'Twice a year', adj: 'twice a year' },
        { value: '1', label: 'Yearly', adj: 'yearly' }
    ];
    const CONTRIB_FREQ = [
        { value: '52', label: 'Weekly', per: 'a week' },
        { value: '26', label: 'Every two weeks', per: 'every two weeks' },
        { value: '12', label: 'Monthly', per: 'a month' },
        { value: '4', label: 'Quarterly', per: 'a quarter' },
        { value: '1', label: 'Yearly', per: 'a year' }
    ];
    const TIMING = [
        { id: 'end', label: 'End of period', title: 'Deposits go in at the end of each period' },
        { id: 'start', label: 'Start of period', title: 'Deposits go in at the start of each period and earn one more period of interest' }
    ];
    const QUICK = [
        { id: 'discount', label: 'Discount', title: 'Sale price after a percentage off' },
        { id: 'tax', label: 'Sales tax', title: 'Tax and total on a price before tax' },
        { id: 'tip', label: 'Tip split', title: 'The tip and each person’s share of a bill' },
        { id: 'simple', label: 'Simple interest', title: 'Interest that does not compound' },
        { id: 'cagr', label: 'CAGR', title: 'Compound annual growth rate between two values' }
    ];
    const QUICK_IDS = QUICK.map((q) => q.id);

    /* Each form: its fields (word = how messages name it), and how Finance's field names map onto them. */
    const FORMS = {
        loan: {
            what: 'payment',
            fields: [
                { key: 'principal', label: 'Loan amount', word: 'loan amount', money: true, example: '200000' },
                { key: 'rate', label: 'Interest rate', word: 'interest rate', suffix: '% / yr', example: '6' },
                { key: 'years', label: 'Term', word: 'term', suffix: 'years', example: '30' },
                { key: 'ppy', label: 'Payments', word: 'payment frequency', select: PAY_FREQ, example: '12' },
                { key: 'extra', label: 'Extra each payment', word: 'extra payment', money: true, example: '', placeholder: '0', optional: true, wide: true }
            ],
            map: { principal: 'principal', annualRate: 'rate', years: 'years', periodsPerYear: 'ppy', extraPayment: 'extra' }
        },
        savings: {
            what: 'future value',
            fields: [
                { key: 'principal', label: 'Starting amount', word: 'starting amount', money: true, example: '10000', placeholder: '0', optional: true },
                { key: 'rate', label: 'Interest rate', word: 'interest rate', suffix: '% / yr', example: '5' },
                { key: 'years', label: 'Years', word: 'number of years', suffix: 'years', example: '10' },
                { key: 'm', label: 'Compounding', word: 'compounding', select: COMPOUND_FREQ, example: '12' },
                { key: 'contribution', label: 'Deposit', word: 'deposit', money: true, example: '100', placeholder: '0', optional: true },
                { key: 'k', label: 'Deposit every', word: 'deposit frequency', select: CONTRIB_FREQ, example: '12' }
            ],
            map: { principal: 'principal', annualRate: 'rate', years: 'years', compoundsPerYear: 'm', contribution: 'contribution', contributionsPerYear: 'k' }
        },
        discount: {
            what: 'sale price',
            fields: [
                { key: 'price', label: 'Price', word: 'price', money: true, example: '80' },
                { key: 'pct', label: 'Discount', word: 'discount', suffix: '%', example: '25' }
            ],
            map: { price: 'price', percent: 'pct' }
        },
        tax: {
            what: 'total',
            fields: [
                { key: 'price', label: 'Price before tax', word: 'price', money: true, example: '80' },
                { key: 'rate', label: 'Tax rate', word: 'tax rate', suffix: '%', example: '8.25' }
            ],
            map: { price: 'price', rate: 'rate' }
        },
        tip: {
            what: 'split',
            fields: [
                { key: 'bill', label: 'Bill', word: 'bill', money: true, example: '120' },
                { key: 'pct', label: 'Tip', word: 'tip', suffix: '%', example: '18' },
                { key: 'people', label: 'People', word: 'number of people', example: '4' }
            ],
            map: { bill: 'bill', tipPercent: 'pct', people: 'people' }
        },
        simple: {
            what: 'interest',
            fields: [
                { key: 'principal', label: 'Principal', word: 'principal', money: true, example: '1000' },
                { key: 'rate', label: 'Interest rate', word: 'interest rate', suffix: '% / yr', example: '5' },
                { key: 'years', label: 'Years', word: 'number of years', suffix: 'years', example: '3' }
            ],
            map: { principal: 'principal', annualRate: 'rate', years: 'years' }
        },
        cagr: {
            what: 'growth rate',
            fields: [
                { key: 'start', label: 'Start value', word: 'start value', example: '100' },
                { key: 'end', label: 'End value', word: 'end value', example: '200' },
                { key: 'years', label: 'Years', word: 'number of years', suffix: 'years', example: '5' }
            ],
            map: { start: 'start', end: 'end', years: 'years' }
        }
    };
    const FORM_IDS = Object.keys(FORMS);

    const els = { tabs: [], panels: Object.create(null), quickPanels: Object.create(null) };
    const forms = Object.create(null);   // form id → live UI parts and the last result
    const expandedYears = new Set();
    let activeTab = 'loan';
    let activeQuick = 'discount';
    let saveTimer = 0;
    let ready = false;
    const calcTimers = Object.create(null);

    /* ── Small helpers ─────────────────────────────────────── */

    const hasFinance = () => Boolean(window.Finance && typeof Finance.amortization === 'function');
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function copy(text, label, btn) {
        if (!text) return;
        if (window.ToolApp && typeof ToolApp.copy === 'function') ToolApp.copy(text, label, btn);
        else if (window.DOM && DOM.copyText) DOM.copyText(text);
    }

    /** A plain number as results are shown (digits, notation, separators from Settings). */
    function fmt(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        try { return State.formatNumber(n); } catch (_err) { return String(n); }
    }

    const listJoin = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
    const yearsText = (y) => `${fmt(y)} year${y === 1 ? '' : 's'}`;

    /* ── Currency ──────────────────────────────────────────── */

    const cur = { code: 'USD', thousands: 'comma', digits: 2, symbol: '$', money: null, num: null, pct: null };

    function settings() {
        try { return window.State ? State.settings() : {}; } catch (_err) { return {}; }
    }

    /** Rebuild the formatters from Settings (currency and thousands separator). */
    function refreshCurrency() {
        const s = settings();
        const allowed = window.State && Array.isArray(State.CURRENCIES) ? State.CURRENCIES : ['USD'];
        let code = allowed.includes(s.currency) ? s.currency : 'USD';
        const thousands = ['comma', 'space', 'none'].includes(s.thousands) ? s.thousands : 'comma';
        const grouping = thousands !== 'none';
        let money;
        try {
            money = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, useGrouping: grouping });
        } catch (_err) {
            code = 'USD';
            money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', useGrouping: grouping });
        }
        const digits = money.resolvedOptions().maximumFractionDigits;
        cur.code = code;
        cur.thousands = thousands;
        cur.digits = digits;
        cur.money = money;
        cur.num = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping });
        cur.pct = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: grouping });
        const part = money.formatToParts(1).find((p) => p.type === 'currency');
        cur.symbol = part ? part.value : code;
    }

    /** Intl output with the narrow no-break space as the group separator when Settings ask for it. */
    function withGroups(formatter, n) {
        if (cur.thousands !== 'space') return formatter.format(n);
        return formatter.formatToParts(n).map((p) => (p.type === 'group' ? ' ' : p.value)).join('');
    }

    /** Snap amounts smaller than half the currency's smallest unit to 0 (no "-$0.00"). */
    const snap = (n) => (Math.abs(n) < 0.5 * Math.pow(10, -cur.digits) ? 0 : n);

    function formatMoney(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        return withGroups(cur.money, snap(n));
    }

    /** Money without the symbol, for table cells (the caption names the currency). */
    function formatAmount(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        return withGroups(cur.num, snap(n));
    }

    function formatPct(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
        const v = Math.abs(n) < 0.005 ? 0 : n;
        return `${withGroups(cur.pct, v)}%`;
    }

    /** Money as the worksheet and CSV get it: fixed currency digits, no separators. */
    const plainMoney = (n) => snap(n).toFixed(cur.digits);
    const plainPct = (n) => String(Finance.tidy(Math.round(n * 100) / 100));

    /* ── Preferences ───────────────────────────────────────── */

    const cleanStr = (v, fallback) => (typeof v === 'string' && v.length <= MAX_CHARS ? v : fallback);

    function prefsFor(id, saved) {
        const def = FORMS[id];
        const src = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
        const out = {};
        def.fields.forEach((f) => {
            if (f.select) {
                const v = src && typeof src[f.key] === 'string' ? src[f.key] : f.example;
                out[f.key] = f.select.some((o) => o.value === v) ? v : f.example;
            } else {
                out[f.key] = cleanStr(src && src[f.key], src ? '' : f.example);
            }
        });
        if (id === 'savings') out.timing = src && src.timing === 'start' ? 'start' : 'end';
        return out;
    }

    function prefs() {
        const p = (window.State && State.pane(PANE)) || {};
        const out = {
            tab: TAB_IDS.includes(p.tab) ? p.tab : 'loan',
            quick: QUICK_IDS.includes(p.quick) ? p.quick : 'discount'
        };
        FORM_IDS.forEach((id) => { out[id] = prefsFor(id, has(p, id) ? p[id] : null); });
        return out;
    }

    function readRaw(id) {
        const f = forms[id];
        const out = {};
        FORMS[id].fields.forEach((fd) => {
            out[fd.key] = (fd.select ? f.selects[fd.key].value : f.inputs[fd.key].value).slice(0, MAX_CHARS);
        });
        if (f.timing) out.timing = f.timing.value;
        return out;
    }

    function persist() {
        clearTimeout(saveTimer);
        saveTimer = 0;
        if (!window.State || !ready) return;
        const patch = { tab: activeTab, quick: activeQuick };
        FORM_IDS.forEach((id) => { patch[id] = readRaw(id); });
        if (!State.setPane(PANE, patch)) console.warn('[MoneyUI] could not save pane preferences:', State.lastError);
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
            if (res.kind === 'error' && res.error) notify(`Sent ${what}, but the sheet shows an error on the last line: ${res.error.message}`, 'warning', 4500);
            else notify(`Sent ${what} to the sheet.`, 'success', 2200);
            return true;
        }
        if (!window.State) return false;
        const sheet = State.activeSheet();
        const next = sheet.text.trim() ? `${sheet.text.replace(/\s+$/, '')}\n${text}` : text;
        if (!State.setSheetText(sheet.id, next)) {
            notify(State.lastError || 'Could not add those lines to the sheet.', 'error', 4000);
            return false;
        }
        State.evaluate();
        notify(`Sent ${what} to the sheet.`, 'success', 2200);
        return true;
    }

    /* ── Build helpers ─────────────────────────────────────── */

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

    /** The labelled fields of one form, in a two-column grid. */
    function buildFields(id, saved) {
        const def = FORMS[id];
        const f = { inputs: Object.create(null), selects: Object.create(null), wraps: Object.create(null), errs: Object.create(null), prefixes: [] };
        const grid = DOM.create('div', { className: 'tc-fields' });
        def.fields.forEach((fd) => {
            const ctlId = `fn-${id}-${fd.key}`;
            const errId = `${ctlId}-err`;
            const box = DOM.create('div', { className: `tc-field${fd.wide ? ' tc-field--wide' : ''}` });
            box.appendChild(DOM.create('label', { className: 'mini-label', text: fd.label, attrs: { for: ctlId, title: fd.label } }));
            if (fd.select) {
                const sel = DOM.create('select', { className: 'select-input tc-select', attrs: { id: ctlId } });
                fd.select.forEach((o) => sel.appendChild(DOM.create('option', { text: o.label, attrs: { value: o.value } })));
                sel.value = saved[fd.key];
                f.selects[fd.key] = sel;
                box.appendChild(sel);
            } else {
                const input = DOM.create('input', {
                    className: 'tc-input',
                    attrs: {
                        id: ctlId,
                        type: 'text',
                        inputmode: 'decimal',
                        autocomplete: 'off',
                        spellcheck: 'false',
                        maxlength: String(MAX_CHARS),
                        placeholder: fd.placeholder !== undefined ? fd.placeholder : fd.example,
                        'aria-describedby': errId
                    }
                });
                input.value = saved[fd.key];
                const wrap = DOM.create('div', { className: 'tc-input-wrap', children: [input] });
                if (fd.money) {
                    const pre = DOM.create('span', { className: 'tc-affix tc-affix--prefix', text: cur.symbol, attrs: { 'aria-hidden': 'true' } });
                    f.prefixes.push(pre);
                    wrap.appendChild(pre);
                } else if (fd.suffix) {
                    wrap.appendChild(DOM.create('span', { className: 'tc-affix', text: fd.suffix, attrs: { 'aria-hidden': 'true' } }));
                }
                const err = DOM.create('p', { className: 'tc-field-error', attrs: { id: errId } });
                f.inputs[fd.key] = input;
                f.wraps[fd.key] = wrap;
                f.errs[fd.key] = err;
                box.appendChild(wrap);
                box.appendChild(err);
            }
            grid.appendChild(box);
        });
        f.grid = grid;
        return f;
    }

    /** The answer card: label, big value, copy button, and the sentence. */
    function answerCard(id) {
        const label = DOM.create('span', { className: 'tc-answer-label', text: 'Answer', attrs: { id: `fn-${id}-label` } });
        const copyBtn = iconButton(ICONS.copy, 'Copy the answer', 'icon-action tc-answer-copy');
        const value = DOM.create('output', { className: 'tc-answer-value', attrs: { 'aria-labelledby': `fn-${id}-label` } });
        const sentence = DOM.create('p', { className: 'tc-sentence', attrs: { 'aria-live': 'polite' } });
        const card = DOM.create('div', {
            className: 'tc-answer',
            children: [DOM.create('div', { className: 'tc-answer-head', children: [label, copyBtn] }), value, sentence]
        });
        return { card, label, value, sentence, copyBtn };
    }

    /** A readout list whose rows are filled by setReadouts(). */
    function readoutList() {
        return DOM.create('div', { className: 'readout-list tc-readouts' });
    }

    function setReadouts(list, rows) {
        DOM.empty(list);
        rows.forEach((r) => {
            const btn = iconButton(ICONS.copy, `Copy the ${r.words}`);
            btn.addEventListener('click', () => copy(r.copy, `the ${r.words}`, btn));
            const row = DOM.create('div', {
                className: 'readout',
                children: [
                    DOM.create('span', { className: 'readout-label', text: r.label, attrs: r.help ? { title: r.help } : {} }),
                    DOM.create('code', { className: 'readout-value', text: r.display }),
                    btn
                ]
            });
            if (r.primary) row.dataset.primary = 'true';
            list.appendChild(row);
        });
        list.hidden = !rows.length;
    }

    /** Share bar plus a legend that names every part with its amount and percent. */
    function shareBar(label) {
        const bar = DOM.create('div', { className: 'tc-split', attrs: { role: 'img', 'aria-label': label } });
        const legend = DOM.create('ul', { className: 'tc-legend' });
        const wrap = DOM.create('div', { className: 'tc-share', children: [bar, legend] });
        return { wrap, bar, legend, label };
    }

    function setShares(share, parts) {
        const total = parts.reduce((t, p) => t + Math.max(0, p.value), 0);
        DOM.empty(share.bar);
        DOM.empty(share.legend);
        const spoken = [];
        parts.forEach((p) => {
            const frac = total > 0 ? Math.max(0, p.value) / total : 0;
            const pctText = formatPct(frac * 100);
            if (frac > 0) {
                share.bar.appendChild(DOM.create('span', {
                    className: 'tc-split-seg',
                    attrs: { 'data-part': p.part },
                    style: { width: `${(frac * 100).toFixed(3)}%` }
                }));
            }
            share.legend.appendChild(DOM.create('li', {
                className: 'tc-legend-item',
                attrs: { 'data-part': p.part },
                children: [
                    DOM.create('span', { className: 'tc-legend-swatch', attrs: { 'aria-hidden': 'true' } }),
                    DOM.create('span', { text: p.label }),
                    DOM.create('span', {
                        className: 'tc-legend-value',
                        children: [
                            document.createTextNode(`${formatMoney(p.value)} `),
                            DOM.create('span', { className: 'tc-legend-share', text: `· ${pctText}` })
                        ]
                    })
                ]
            }));
            spoken.push(`${p.label} ${pctText}`);
        });
        share.bar.setAttribute('aria-label', `${share.label}: ${spoken.join(', ')}`);
    }

    function actionsRow(id, extra) {
        const row = DOM.create('div', { className: 'tc-actions' });
        const f = forms[id];
        f.copyBtn = textButton(ICONS.copy, 'Copy', 'btn btn-secondary btn-sm', 'Copy a one-line summary');
        f.sendBtn = textButton(ICONS.send, 'Send to sheet', 'btn btn-primary btn-sm', 'Add these figures to the end of the worksheet as labelled lines');
        f.resetBtn = textButton(ICONS.reset, 'Reset', 'btn btn-ghost btn-sm tc-push', 'Put back the example numbers');
        row.appendChild(f.copyBtn);
        row.appendChild(f.sendBtn);
        (extra || []).forEach((b) => row.appendChild(b));
        row.appendChild(f.resetBtn);
        f.copyBtn.addEventListener('click', () => {
            if (!f.result) { notify(f.problem || 'Fill in the fields first.', 'warning', 2500); return; }
            copy(f.result.summary, 'the summary', f.copyBtn);
        });
        f.sendBtn.addEventListener('click', () => sendForm(id));
        f.resetBtn.addEventListener('click', () => resetForm(id));
        return row;
    }

    /* ── Build: tabs and panels ────────────────────────────── */

    function buildTabs(root) {
        const list = DOM.create('div', { className: 'chip-row tc-tabs', attrs: { role: 'tablist', 'aria-label': 'Finance calculators' } });
        els.tabs = TABS.map((t) => {
            const tab = DOM.create('button', {
                className: 'chip-btn tc-tab',
                text: t.label,
                attrs: {
                    type: 'button',
                    role: 'tab',
                    id: `fn-tab-${t.id}`,
                    'aria-selected': 'false',
                    'aria-controls': `fn-panel-${t.id}`,
                    title: t.title,
                    tabindex: '-1'
                },
                data: { tab: t.id }
            });
            list.appendChild(tab);
            return tab;
        });
        list.addEventListener('click', (e) => {
            const tab = e.target.closest('.tc-tab');
            if (tab) show(tab.dataset.tab);
        });
        list.addEventListener('keydown', (e) => {
            const i = TAB_IDS.indexOf(activeTab);
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % TAB_IDS.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = TAB_IDS.length - 1;
            if (next < 0) return;
            e.preventDefault();
            show(TAB_IDS[next]);
            els.tabs[next].focus();
        });
        root.appendChild(list);
    }

    function panelShell(tabId) {
        return DOM.create('div', {
            className: 'tc-panel',
            attrs: { role: 'tabpanel', id: `fn-panel-${tabId}`, 'aria-labelledby': `fn-tab-${tabId}`, tabindex: '-1' }
        });
    }

    /** A schedule table with a caption, a head row, and a body; returns its parts. */
    function scheduleTable(id, caption, heads) {
        const tbody = DOM.create('tbody');
        const table = DOM.create('table', { className: 'data-table tc-table' });
        const cap = DOM.create('caption', { text: caption });
        table.appendChild(cap);
        const thead = DOM.create('thead');
        thead.appendChild(DOM.create('tr', {
            children: heads.map((h, i) => DOM.create('th', { className: i ? 'num' : '', text: h, attrs: { scope: 'col' } }))
        }));
        table.appendChild(thead);
        table.appendChild(tbody);
        const wrap = DOM.create('div', { className: 'table-wrap tc-table-wrap', attrs: { id: `fn-${id}-table` }, children: [table] });
        return { wrap, table, tbody, caption: cap };
    }

    function buildLoan(panel, saved) {
        const f = forms.loan = buildFields('loan', saved);
        panel.appendChild(f.grid);
        Object.assign(f, { answer: answerCard('loan') });
        panel.appendChild(f.answer.card);

        f.results = DOM.create('div', { className: 'tc-stack' });
        f.readouts = readoutList();
        f.results.appendChild(f.readouts);
        f.share = shareBar('Where the money goes');
        f.results.appendChild(f.share.wrap);

        const head = DOM.create('div', { className: 'tc-table-head' });
        head.appendChild(DOM.create('h5', { className: 'section-label', text: 'Schedule by year' }));
        f.csvBtn = textButton(ICONS.download, 'Export CSV', 'btn btn-secondary btn-sm', 'Download every payment as a CSV file');
        f.csvBtn.addEventListener('click', exportLoanCsv);
        head.appendChild(f.csvBtn);
        f.results.appendChild(head);
        f.table = scheduleTable('loan', 'Amounts by year', ['Year', 'Principal', 'Interest', 'Balance']);
        f.table.tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.tc-expand');
            if (btn) toggleYear(Number(btn.dataset.year), btn);
        });
        f.results.appendChild(f.table.wrap);
        f.results.appendChild(DOM.create('p', { className: 'tc-note', text: 'Press a year to see each payment in it.' }));
        panel.appendChild(f.results);
        panel.appendChild(actionsRow('loan'));
    }

    function buildSavings(panel, saved) {
        const f = forms.savings = buildFields('savings', saved);
        panel.appendChild(f.grid);
        f.timing = chipGroup('When deposits go in', TIMING, () => { recalc('savings'); schedulePersist(); });
        f.timing.set(saved.timing);
        panel.appendChild(f.timing.el);
        Object.assign(f, { answer: answerCard('savings') });
        panel.appendChild(f.answer.card);

        f.results = DOM.create('div', { className: 'tc-stack' });
        f.readouts = readoutList();
        f.results.appendChild(f.readouts);
        f.share = shareBar('What the balance is made of');
        f.results.appendChild(f.share.wrap);
        const head = DOM.create('div', { className: 'tc-table-head' });
        head.appendChild(DOM.create('h5', { className: 'section-label', text: 'Growth by year' }));
        f.csvBtn = textButton(ICONS.download, 'Export CSV', 'btn btn-secondary btn-sm', 'Download the yearly table as a CSV file');
        f.csvBtn.addEventListener('click', exportSavingsCsv);
        head.appendChild(f.csvBtn);
        f.results.appendChild(head);
        f.table = scheduleTable('savings', 'Amounts by year', ['Year', 'Deposits', 'Interest', 'Balance']);
        f.results.appendChild(f.table.wrap);
        panel.appendChild(f.results);
        panel.appendChild(actionsRow('savings'));
    }

    function buildQuick(panel, saved) {
        els.quickPick = chipGroup('Quick calculator', QUICK, (v) => showQuick(v), 'tc-subtabs');
        panel.appendChild(els.quickPick.el);
        QUICK.forEach((q) => {
            const sub = DOM.create('div', { className: 'tc-panel', attrs: { id: `fn-quick-${q.id}`, role: 'group', 'aria-label': q.label } });
            const f = forms[q.id] = buildFields(q.id, saved[q.id]);
            sub.appendChild(f.grid);
            Object.assign(f, { answer: answerCard(q.id) });
            sub.appendChild(f.answer.card);
            f.results = DOM.create('div', { className: 'tc-stack' });
            f.readouts = readoutList();
            f.results.appendChild(f.readouts);
            sub.appendChild(f.results);
            sub.appendChild(actionsRow(q.id));
            els.quickPanels[q.id] = sub;
            panel.appendChild(sub);
        });
    }

    function build(mount) {
        refreshCurrency();
        const saved = prefs();
        const root = DOM.create('div', { className: 'tc-pane fn' });
        buildTabs(root);
        TABS.forEach((t) => {
            const panel = panelShell(t.id);
            if (t.id === 'loan') buildLoan(panel, saved.loan);
            else if (t.id === 'savings') buildSavings(panel, saved.savings);
            else buildQuick(panel, saved);
            els.panels[t.id] = panel;
            root.appendChild(panel);
        });
        FORM_IDS.forEach((id) => {
            const f = forms[id];
            f.answer.copyBtn.addEventListener('click', () => {
                if (f.result) copy(f.result.copy, f.result.copyLabel || 'the answer', f.answer.copyBtn);
            });
            const onEdit = () => { scheduleRecalc(id); schedulePersist(); };
            f.grid.addEventListener('input', onEdit);
            f.grid.addEventListener('change', (e) => { if (e.target.matches('select')) onEdit(); });
        });
        activeTab = saved.tab;
        activeQuick = saved.quick;
        els.root = root;
        mount.appendChild(root);
    }

    /* ── Reading and validating ────────────────────────────── */

    function markField(f, key, message) {
        if (!f.wraps[key]) return;
        if (message) {
            f.wraps[key].dataset.invalid = 'true';
            f.inputs[key].setAttribute('aria-invalid', 'true');
            f.errs[key].textContent = message;
        } else {
            delete f.wraps[key].dataset.invalid;
            f.inputs[key].removeAttribute('aria-invalid');
            f.errs[key].textContent = '';
        }
    }

    /** Raw strings plus the missing required fields and the unreadable ones. */
    function readForm(id) {
        const def = FORMS[id];
        const f = forms[id];
        const raw = readRaw(id);
        const missing = [];
        const invalid = [];
        def.fields.forEach((fd) => {
            if (fd.select) return;
            const v = raw[fd.key].trim();
            raw[fd.key] = v;
            if (!v) {
                if (!fd.optional) missing.push(fd);
                markField(f, fd.key, '');
                return;
            }
            try {
                Finance.parseNumber(v, `the ${fd.word}`);
                markField(f, fd.key, '');
            } catch (err) {
                invalid.push({ key: fd.key, message: err.message });
                markField(f, fd.key, err.message);
            }
        });
        return { raw, missing, invalid };
    }

    function setAnswer(f, state, label, value, sentence) {
        f.answer.card.dataset.state = state;
        f.answer.label.textContent = label;
        f.answer.value.textContent = value;
        f.answer.sentence.textContent = sentence || '';
        const ok = state === 'ok';
        f.answer.copyBtn.disabled = !ok;
        f.copyBtn.disabled = !ok;
        f.sendBtn.disabled = !ok;
        if (f.csvBtn) f.csvBtn.disabled = !ok;
        f.results.hidden = !ok;
    }

    /* ── Solvers: one per form, each returns what the card and the sheet need ── */

    function freq(list, value) {
        return list.find((o) => o.value === value) || list[0];
    }

    function solveLoan(raw) {
        const schedule = Finance.amortization({
            principal: raw.principal,
            annualRate: raw.rate,
            years: raw.years,
            periodsPerYear: Number(raw.ppy),
            extraPayment: raw.extra || 0
        });
        const fq = freq(PAY_FREQ, raw.ppy);
        const s = schedule;
        const ppy = s.periodsPerYear;
        const full = Finance.durationText(s.scheduledPeriods, ppy);
        const payoff = Finance.durationText(s.periods, ppy);
        const extra = s.extraPayment > 0;
        let sentence = `Borrowing ${formatMoney(s.principal)} at ${formatPct(s.annualRate)} for ${yearsText(s.years)} costs ${formatMoney(s.payment)} ${fq.per}, with ${formatMoney(s.totalInterest)} in interest.`;
        if (extra) {
            sentence += s.periodsSaved > 0
                ? ` Paying ${formatMoney(s.extraPayment)} extra each time clears it in ${payoff} instead of ${full} and saves ${formatMoney(s.interestSaved)} in interest.`
                : ` Paying ${formatMoney(s.extraPayment)} extra each time saves ${formatMoney(s.interestSaved)} in interest.`;
        }
        const rows = [
            { label: 'Total interest', display: formatMoney(s.totalInterest), copy: plainMoney(s.totalInterest), words: 'total interest' },
            { label: 'Total paid', display: formatMoney(s.totalPaid), copy: plainMoney(s.totalPaid), words: 'total paid', help: 'Every payment added up: the loan plus all the interest.' },
            {
                label: 'Payoff',
                display: s.periodsSaved > 0 ? `${payoff} (${Finance.durationText(s.periodsSaved, ppy)} sooner)` : payoff,
                copy: payoff,
                words: 'payoff time',
                help: `${s.periods.toLocaleString('en-US')} payments`
            }
        ];
        if (extra) {
            rows.unshift({ label: 'With extra', display: formatMoney(s.payment + s.extraPayment), copy: plainMoney(s.payment + s.extraPayment), words: 'payment with the extra', help: 'The regular payment plus your extra payment.' });
            rows.push({ label: 'Saved', display: formatMoney(s.interestSaved), copy: plainMoney(s.interestSaved), words: 'interest saved', help: 'Interest you avoid by paying extra, compared with the regular schedule.' });
        }
        const lines = [
            `# Loan: ${s.principal} at ${s.annualRate}% for ${s.years} year${s.years === 1 ? '' : 's'}`,
            `${fq.adj} payment: ${plainMoney(s.payment)}`
        ];
        if (extra) lines.push(`Extra each payment: ${plainMoney(s.extraPayment)}`);
        lines.push(`Total interest: ${plainMoney(s.totalInterest)}`);
        lines.push(`Total paid: ${plainMoney(s.totalPaid)}`);
        if (extra && s.interestSaved > 0) lines.push(`Interest saved: ${plainMoney(s.interestSaved)}`);
        lines.push(`// Paid off in ${payoff}${s.periodsSaved > 0 ? ` (${Finance.durationText(s.periodsSaved, ppy)} sooner)` : ''}`);
        return {
            label: `${fq.adj} payment`,
            display: formatMoney(s.payment),
            copy: plainMoney(s.payment),
            copyLabel: 'the payment',
            sentence,
            rows,
            shares: [
                { part: 'principal', label: 'Principal', value: s.principal },
                { part: 'interest', label: 'Interest', value: s.totalInterest }
            ],
            summary: `${fq.adj} payment ${formatMoney(s.payment)}${extra ? ` (+ ${formatMoney(s.extraPayment)} extra)` : ''} · Total interest ${formatMoney(s.totalInterest)} · Total paid ${formatMoney(s.totalPaid)} · Paid off in ${payoff}`,
            lines,
            what: 'the loan figures',
            schedule: s
        };
    }

    function solveSavings(raw) {
        const fq = freq(CONTRIB_FREQ, raw.k);
        const cq = freq(COMPOUND_FREQ, raw.m);
        const c = Finance.compound({
            principal: raw.principal || 0,
            annualRate: raw.rate,
            years: raw.years,
            compoundsPerYear: Number(raw.m),
            contribution: raw.contribution || 0,
            contributionsPerYear: Number(raw.k),
            timing: raw.timing
        });
        const years = Finance.parseNumber(raw.years);
        const rate = Finance.parseNumber(raw.rate);
        const deposit = raw.contribution ? Finance.parseNumber(raw.contribution) : 0;
        let sentence;
        if (deposit > 0 && c.principal > 0) {
            sentence = `After ${yearsText(years)}, ${formatMoney(c.principal)} plus ${formatMoney(deposit)} ${fq.per} at ${formatPct(rate)} grows to ${formatMoney(c.futureValue)}.`;
        } else if (deposit > 0) {
            sentence = `Saving ${formatMoney(deposit)} ${fq.per} at ${formatPct(rate)} for ${yearsText(years)} grows to ${formatMoney(c.futureValue)}.`;
        } else {
            sentence = `After ${yearsText(years)} at ${formatPct(rate)} compounded ${cq.adj}, ${formatMoney(c.principal)} grows to ${formatMoney(c.futureValue)}.`;
        }
        const rows = [
            { label: 'Deposits', display: formatMoney(c.totalContributions), copy: plainMoney(c.totalContributions), words: 'total deposits', help: 'Every regular deposit added up, not counting the starting amount.' },
            { label: 'Interest', display: formatMoney(c.totalInterest), copy: plainMoney(c.totalInterest), words: 'interest earned' },
            { label: 'You put in', display: formatMoney(c.totalDeposited), copy: plainMoney(c.totalDeposited), words: 'total put in', help: 'The starting amount plus every deposit.' },
            { label: 'APY', display: formatPct(c.effectiveAnnualRate), copy: `${plainPct(c.effectiveAnnualRate)}%`, words: 'effective annual rate', help: 'Effective annual rate (APY): what the rate earns in a year once compounding is counted.' }
        ];
        const lines = [
            `# Savings: ${c.principal} at ${rate}% for ${years} year${years === 1 ? '' : 's'}${deposit > 0 ? `, ${deposit} ${fq.per}` : ''}`,
            `Future value: ${plainMoney(c.futureValue)}`,
            `Total deposits: ${plainMoney(c.totalContributions)}`,
            `Interest earned: ${plainMoney(c.totalInterest)}`
        ];
        return {
            label: 'Future value',
            display: formatMoney(c.futureValue),
            copy: plainMoney(c.futureValue),
            copyLabel: 'the future value',
            sentence,
            rows,
            shares: [
                { part: 'principal', label: 'Starting amount', value: c.principal },
                { part: 'contrib', label: 'Deposits', value: c.totalContributions },
                { part: 'interest', label: 'Interest', value: c.totalInterest }
            ],
            summary: `Future value ${formatMoney(c.futureValue)} · Deposits ${formatMoney(c.totalContributions)} · Interest ${formatMoney(c.totalInterest)} · APY ${formatPct(c.effectiveAnnualRate)}`,
            lines,
            what: 'the savings figures',
            growth: c
        };
    }

    function solveQuick(id, raw) {
        const n = (k) => Finance.parseNumber(raw[k]);
        switch (id) {
            case 'discount': {
                const r = Finance.discount(raw.price, raw.pct);
                const price = n('price');
                const pct = n('pct');
                return {
                    label: 'Sale price',
                    display: formatMoney(r.final),
                    copy: plainMoney(r.final),
                    copyLabel: 'the sale price',
                    sentence: `${formatPct(pct)} off ${formatMoney(price)} saves ${formatMoney(r.saved)}, so you pay ${formatMoney(r.final)}.`,
                    rows: [{ label: 'You save', display: formatMoney(r.saved), copy: plainMoney(r.saved), words: 'saving' }],
                    summary: `Sale price ${formatMoney(r.final)} (${formatPct(pct)} off ${formatMoney(price)}, you save ${formatMoney(r.saved)})`,
                    lines: [`Sale price: ${price} - ${pct}%`, `You save: ${pct}% of ${price}`],
                    what: 'the discount'
                };
            }
            case 'tax': {
                const r = Finance.salesTax(raw.price, raw.rate);
                const price = n('price');
                const rate = n('rate');
                return {
                    label: 'Total with tax',
                    display: formatMoney(r.total),
                    copy: plainMoney(r.total),
                    copyLabel: 'the total',
                    sentence: `${formatPct(rate)} tax on ${formatMoney(price)} is ${formatMoney(r.tax)}, for a total of ${formatMoney(r.total)}.`,
                    rows: [{ label: 'Tax', display: formatMoney(r.tax), copy: plainMoney(r.tax), words: 'tax' }],
                    summary: `Total ${formatMoney(r.total)} (${formatMoney(price)} + ${formatPct(rate)} tax of ${formatMoney(r.tax)})`,
                    lines: [`Sales tax: ${rate}% of ${price}`, `Total with tax: ${price} + ${rate}%`],
                    what: 'the sales tax'
                };
            }
            case 'tip': {
                const r = Finance.tipSplit({ bill: raw.bill, tipPercent: raw.pct, people: raw.people });
                const bill = n('bill');
                const pct = n('pct');
                const split = r.people > 1;
                return {
                    label: split ? 'Each person pays' : 'Total with tip',
                    display: formatMoney(split ? r.perPerson : r.total),
                    copy: plainMoney(split ? r.perPerson : r.total),
                    copyLabel: split ? 'each share' : 'the total',
                    sentence: split
                        ? `The ${formatPct(pct)} tip on ${formatMoney(bill)} is ${formatMoney(r.tip)}; split ${r.people} ways, each person pays ${formatMoney(r.perPerson)}.`
                        : `The ${formatPct(pct)} tip on ${formatMoney(bill)} is ${formatMoney(r.tip)}, for a total of ${formatMoney(r.total)}.`,
                    rows: [
                        { label: 'Tip', display: formatMoney(r.tip), copy: plainMoney(r.tip), words: 'tip' },
                        { label: 'Total', display: formatMoney(r.total), copy: plainMoney(r.total), words: 'total with tip' }
                    ].concat(split ? [{ label: 'Tip each', display: formatMoney(r.tipPerPerson), copy: plainMoney(r.tipPerPerson), words: 'tip per person' }] : []),
                    summary: split
                        ? `Each of ${r.people} pays ${formatMoney(r.perPerson)} (bill ${formatMoney(bill)} + ${formatPct(pct)} tip ${formatMoney(r.tip)} = ${formatMoney(r.total)})`
                        : `Total ${formatMoney(r.total)} (bill ${formatMoney(bill)} + ${formatPct(pct)} tip ${formatMoney(r.tip)})`,
                    lines: split
                        ? [`Tip: ${pct}% of ${bill}`, `Each person pays: (${bill} + ${pct}%) / ${r.people}`]
                        : [`Tip: ${pct}% of ${bill}`, `Total with tip: ${bill} + ${pct}%`],
                    what: 'the tip'
                };
            }
            case 'simple': {
                const r = Finance.simpleInterest({ principal: raw.principal, annualRate: raw.rate, years: raw.years });
                const rate = n('rate');
                const years = n('years');
                return {
                    label: 'Interest',
                    display: formatMoney(r.interest),
                    copy: plainMoney(r.interest),
                    copyLabel: 'the interest',
                    sentence: `${formatMoney(r.principal)} at ${formatPct(rate)} simple interest for ${yearsText(years)} earns ${formatMoney(r.interest)}, for a total of ${formatMoney(r.total)}.`,
                    rows: [{ label: 'Total', display: formatMoney(r.total), copy: plainMoney(r.total), words: 'total' }],
                    summary: `Simple interest ${formatMoney(r.interest)} on ${formatMoney(r.principal)} at ${formatPct(rate)} for ${yearsText(years)} (total ${formatMoney(r.total)})`,
                    lines: [`Simple interest: ${r.principal} * ${rate}% * ${years}`, `Total: ${r.principal} + ${r.principal} * ${rate}% * ${years}`],
                    what: 'the simple interest'
                };
            }
            case 'cagr': {
                const g = Finance.cagr(raw.start, raw.end, raw.years);
                const start = n('start');
                const end = n('end');
                const years = n('years');
                const growth = g >= 0;
                const multiple = end / start;
                return {
                    label: growth ? '▲ Growth per year' : '▼ Decline per year',
                    display: growth ? formatPct(g) : `−${formatPct(-g)}`,
                    copy: `${plainPct(g)}%`,
                    copyLabel: 'the growth rate',
                    sentence: g === 0
                        ? `${fmt(start)} to ${fmt(end)} is no change over ${yearsText(years)}.`
                        : `Going from ${fmt(start)} to ${fmt(end)} in ${yearsText(years)} is ${growth ? 'growth' : 'a decline'} of ${formatPct(Math.abs(g))} a year, compounded.`,
                    rows: [
                        { label: 'Total change', display: formatPct((multiple - 1) * 100), copy: `${plainPct((multiple - 1) * 100)}%`, words: 'total change' },
                        { label: 'Multiple', display: `${fmt(Finance.tidy(multiple))}×`, copy: String(Finance.tidy(multiple)), words: 'multiple' }
                    ],
                    summary: `CAGR ${formatPct(g)} (${fmt(start)} → ${fmt(end)} over ${yearsText(years)})`,
                    lines: [`CAGR: ((${end} / ${start})^(1/${years}) - 1) to %`],
                    what: 'the growth rate'
                };
            }
            default:
                return null;
        }
    }

    /* ── Recalculate and paint ─────────────────────────────── */

    function recalc(id) {
        clearTimeout(calcTimers[id]);
        calcTimers[id] = 0;
        const f = forms[id];
        const def = FORMS[id];
        if (!f) return null;
        f.result = null;
        f.problem = '';
        if (!hasFinance()) {
            f.problem = 'The finance library did not load. Reload the page to try again.';
            setAnswer(f, 'error', 'Unavailable', 'Finance did not load.', f.problem);
            return null;
        }
        const read = readForm(id);
        if (read.invalid.length) {
            f.problem = read.invalid[0].message;
            setAnswer(f, 'error', 'Check the numbers', read.invalid.length > 1 ? `${read.invalid.length} fields need fixing.` : 'One field needs fixing.', f.problem);
            return null;
        }
        if (read.missing.length) {
            f.problem = `Enter the ${listJoin(read.missing.map((m) => m.word))} to see the ${def.what}.`;
            setAnswer(f, 'empty', 'Answer', f.problem, '');
            return null;
        }
        let res;
        try {
            if (id === 'loan') res = solveLoan(read.raw);
            else if (id === 'savings') res = solveSavings(read.raw);
            else res = solveQuick(id, read.raw);
        } catch (err) {
            const message = err && err.message ? err.message : 'Those numbers could not be worked out.';
            f.problem = message;
            const key = err && err.field && def.map[err.field] ? def.map[err.field] : null;
            if (key && f.wraps[key] && err.code !== 'missing') markField(f, key, message);
            if (err && err.code === 'missing') setAnswer(f, 'empty', 'Answer', message, '');
            else setAnswer(f, 'error', 'Check the numbers', 'No answer for these numbers.', message);
            return null;
        }
        f.result = res;
        setAnswer(f, 'ok', res.label, res.display, res.sentence);
        setReadouts(f.readouts, res.rows);
        if (f.share && res.shares) setShares(f.share, res.shares);
        if (id === 'loan') renderLoanTable(res.schedule);
        if (id === 'savings') renderSavingsTable(res.growth);
        return res;
    }

    function scheduleRecalc(id) {
        clearTimeout(calcTimers[id]);
        calcTimers[id] = setTimeout(() => recalc(id), id === 'loan' || id === 'savings' ? CALC_DELAY : 0);
    }

    function recalcAll() {
        FORM_IDS.forEach((id) => recalc(id));
    }

    /* ── Tables ────────────────────────────────────────────── */

    const numCell = (text) => DOM.create('td', { className: 'num', text });

    function periodRows(schedule, year) {
        return schedule.rows.filter((r) => r.year === year).map((r) => DOM.create('tr', {
            className: 'tc-subrow',
            data: { year: String(year) },
            children: [
                DOM.create('td', { text: `#${r.period}`, attrs: { title: `Payment ${r.period}: ${formatMoney(r.payment)}` } }),
                numCell(formatAmount(r.principal)),
                numCell(formatAmount(r.interest)),
                numCell(formatAmount(r.balance))
            ]
        }));
    }

    function expandLabel(year, count, open) {
        return `${open ? 'Hide' : 'Show'} the ${count} payment${count === 1 ? '' : 's'} in year ${year}`;
    }

    function renderLoanTable(schedule) {
        const t = forms.loan.table;
        DOM.empty(t.tbody);
        t.caption.textContent = `Amounts in ${cur.code} by year`;
        const years = Finance.yearlySummary(schedule);
        const frag = document.createDocumentFragment();
        years.forEach((y) => {
            const count = y.toPeriod - y.fromPeriod + 1;
            const open = expandedYears.has(y.year);
            const btn = DOM.create('button', {
                className: 'tc-expand',
                html: ICONS.chevron,
                attrs: { type: 'button', 'aria-expanded': String(open), 'aria-label': expandLabel(y.year, count, open), title: expandLabel(y.year, count, open) },
                data: { year: String(y.year), count: String(count) }
            });
            btn.appendChild(DOM.create('span', { text: String(y.year) }));
            frag.appendChild(DOM.create('tr', {
                className: 'tc-year-row',
                data: { year: String(y.year) },
                children: [
                    DOM.create('td', { children: [btn] }),
                    numCell(formatAmount(y.principal)),
                    numCell(formatAmount(y.interest)),
                    numCell(formatAmount(y.balance))
                ]
            }));
            if (open) periodRows(schedule, y.year).forEach((tr) => frag.appendChild(tr));
        });
        t.tbody.appendChild(frag);
    }

    function toggleYear(year, btn) {
        const f = forms.loan;
        const schedule = f.result && f.result.schedule;
        if (!schedule || !Number.isInteger(year)) return;
        const row = btn.closest('tr');
        const count = Number(btn.dataset.count) || 0;
        if (expandedYears.has(year)) {
            expandedYears.delete(year);
            let next = row.nextElementSibling;
            while (next && next.classList.contains('tc-subrow')) {
                const gone = next;
                next = next.nextElementSibling;
                gone.remove();
            }
            btn.setAttribute('aria-expanded', 'false');
        } else {
            expandedYears.add(year);
            const frag = document.createDocumentFragment();
            periodRows(schedule, year).forEach((tr) => frag.appendChild(tr));
            row.after(frag);
            btn.setAttribute('aria-expanded', 'true');
        }
        const label = expandLabel(year, count, expandedYears.has(year));
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function renderSavingsTable(growth) {
        const t = forms.savings.table;
        DOM.empty(t.tbody);
        t.caption.textContent = `Amounts in ${cur.code} by year`;
        const frag = document.createDocumentFragment();
        growth.rows.forEach((r) => {
            frag.appendChild(DOM.create('tr', {
                children: [
                    DOM.create('td', { className: 'mono', text: String(r.year) }),
                    numCell(formatAmount(r.contributions)),
                    numCell(formatAmount(r.interest)),
                    numCell(formatAmount(r.balance))
                ]
            }));
        });
        t.tbody.appendChild(frag);
    }

    /* ── Export, send, reset ───────────────────────────────── */

    function download(name, text) {
        if (window.ToolApp && typeof ToolApp.download === 'function') {
            if (ToolApp.download(name, text, 'text/csv')) notify(`Downloaded ${name}.`, 'success', 2200);
            return true;
        }
        notify('Downloads are not available here.', 'error', 3000);
        return false;
    }

    function exportLoanCsv() {
        const r = forms.loan.result;
        if (!r) { notify(forms.loan.problem || 'Fill in the loan first.', 'warning', 2500); return false; }
        return download('mathman-loan-schedule.csv', Finance.amortizationCsv(r.schedule));
    }

    function exportSavingsCsv() {
        const r = forms.savings.result;
        if (!r) { notify(forms.savings.problem || 'Fill in the savings first.', 'warning', 2500); return false; }
        const lines = ['Year,Deposits,Interest,Balance,Total deposits,Total interest'];
        r.growth.rows.forEach((row) => {
            lines.push([row.year, row.contributions, row.interest, row.balance, row.totalContributions, row.totalInterest]
                .map((v, i) => (i === 0 ? String(v) : v.toFixed(2))).join(','));
        });
        return download('mathman-savings-growth.csv', `${lines.join('\n')}\n`);
    }

    function sendForm(id) {
        const f = forms[id];
        if (!f || !f.result) {
            notify(f && f.problem ? f.problem : 'Fill in the fields first.', 'warning', 3000);
            return false;
        }
        return sendToSheet(f.result.lines, f.result.what);
    }

    function fillForm(id, values) {
        const f = forms[id];
        FORMS[id].fields.forEach((fd) => {
            if (!has(values, fd.key)) return;
            const v = String(values[fd.key]).slice(0, MAX_CHARS);
            if (fd.select) {
                if (fd.select.some((o) => o.value === v)) f.selects[fd.key].value = v;
            } else {
                f.inputs[fd.key].value = v;
            }
        });
        if (f.timing && has(values, 'timing')) f.timing.set(values.timing);
    }

    const RESET_NAMES = { loan: 'loan', savings: 'savings', discount: 'discount', tax: 'sales tax', tip: 'tip split', simple: 'simple interest', cagr: 'CAGR' };

    async function resetForm(id) {
        const name = RESET_NAMES[id] || 'this';
        let ok = true;
        if (window.Dialogs && typeof Dialogs.confirm === 'function') {
            ok = await Dialogs.confirm({
                title: `Reset the ${name} calculator?`,
                message: 'This puts back the example numbers and replaces what you typed here.',
                confirmLabel: 'Reset',
                danger: true
            });
        }
        if (!ok) return false;
        fillForm(id, prefsFor(id, null));
        if (id === 'loan') expandedYears.clear();
        recalc(id);
        persist();
        notify('Example numbers are back.', 'info', 1800);
        return true;
    }

    /* ── Tabs ──────────────────────────────────────────────── */

    function show(id) {
        if (!TAB_IDS.includes(id)) return false;
        activeTab = id;
        els.tabs.forEach((t) => {
            const on = t.dataset.tab === id;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
        });
        TAB_IDS.forEach((tid) => { els.panels[tid].hidden = tid !== id; });
        if (ready) schedulePersist();
        return true;
    }

    function showQuick(id) {
        if (!QUICK_IDS.includes(id)) return false;
        activeQuick = id;
        els.quickPick.set(id);
        QUICK_IDS.forEach((q) => { els.quickPanels[q].hidden = q !== id; });
        if (ready) schedulePersist();
        return true;
    }

    function refreshSymbols() {
        FORM_IDS.forEach((id) => forms[id].prefixes.forEach((p) => { p.textContent = cur.symbol; }));
    }

    /** Put saved or example values back into every field (after a reset or an import). */
    function reload() {
        const saved = prefs();
        FORM_IDS.forEach((id) => fillForm(id, saved[id]));
        expandedYears.clear();
        show(saved.tab);
        showQuick(saved.quick);
        recalcAll();
    }

    /* ── Public API ────────────────────────────────────────── */

    function init() {
        const mount = DOM.id('mount-finance');
        if (!mount || ready) return;
        build(mount);
        show(activeTab);
        showQuick(activeQuick);
        recalcAll();
        ready = true;
        if (window.State && typeof State.on === 'function') {
            State.on('settings', () => {
                refreshCurrency();
                refreshSymbols();
                recalcAll();
            });
            State.on('panes', (e) => {
                if (e && (e.action === 'reset' || e.action === 'import')) reload();
            });
            State.on('reset', () => reload());
        }
        window.addEventListener('pagehide', () => { if (saveTimer) persist(); });
    }

    window.MoneyUI = {
        init,
        show,
        showQuick,
        /** Fill a form's fields and recalculate: MoneyUI.set('loan', { principal: '300000' }). */
        set(id, values) {
            if (!ready || !has(FORMS, id) || !values || typeof values !== 'object') return null;
            fillForm(id, values);
            show(QUICK_IDS.includes(id) ? 'quick' : id);
            if (QUICK_IDS.includes(id)) showQuick(id);
            const res = recalc(id);
            schedulePersist();
            return res ? { label: res.label, display: res.display, copy: res.copy, sentence: res.sentence } : null;
        },
        /** The current loan schedule (Finance.amortization result) or null. */
        loan: () => (forms.loan && forms.loan.result ? forms.loan.result.schedule : null),
        /** The current savings result (Finance.compound) or null. */
        savings: () => (forms.savings && forms.savings.result ? forms.savings.result.growth : null),
        /** The answer of a quick calculator: { label, display, copy, sentence } or null. */
        quick(id) {
            const f = forms[id || activeQuick];
            return f && f.result ? { label: f.result.label, display: f.result.display, copy: f.result.copy, sentence: f.result.sentence } : null;
        },
        formatMoney,
        send: (id) => sendForm(id || (activeTab === 'quick' ? activeQuick : activeTab)),
        active: () => ({ tab: activeTab, quick: activeQuick })
    };
})();
