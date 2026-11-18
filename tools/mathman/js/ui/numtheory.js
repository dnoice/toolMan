/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: NumTheoryUI (mathMan Edition - v1.0)
 *     - File Name: numtheory.js
 *     - Relative Path: tools/mathman/js/ui/numtheory.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Number Theory pane in the Tools rail: a prime check with the next
 *     and previous prime, prime factorization, the GCD and LCM of a list,
 *     and a live base converter. Use it for whole-number questions that
 *     the worksheet's functions answer one value at a time, and send any
 *     answer back to the sheet as a line that re-computes it.
 *
 * ✒ Key Features:
 *     - Every number field takes digits (with , _ or spaces between them) or
 *       an expression such as 2^61 - 1, worked out exactly by the engine;
 *       up to 300 digits
 *     - Prime check: a "✓ Prime" / "✕ Not prime" badge in words as well as
 *       colour, the reason (91 = 7 × 13, or its smallest factor), the note
 *       that numbers above 3.3 × 10^24 are strong probable primes, and
 *       Previous / Next prime buttons that step through the primes
 *     - Prime factors in 2³ × 3 × 5 form with superscripts, the divisor
 *       count, a copyable 2^3 × 3 × 5 text form, and a "Keep trying" button
 *       when the 200 ms budget leaves part of the number unfactored
 *     - GCD & LCM of up to 1,000 whole numbers, worked out as you type
 *     - Base converter with binary, octal, decimal, hexadecimal, and a
 *       custom base (2–36) field; editing any field updates the others, and
 *       a bad digit is named in plain words while the other fields keep the
 *       last good value
 *     - Copy buttons on every answer; "Send to sheet" adds isprime(),
 *       a factor product, gcd() / lcm(), or a decimal value with its other
 *       bases as a note
 *     - Inputs and the custom base are remembered per browser through
 *       State.pane('numtheory'); digit grouping follows the thousands
 *       separator setting
 *
 * ✒ Usage Instructions:
 *     Load after js/engine.js, js/numerics.js, and js/state.js, before
 *     js/app.js. app.js calls NumTheoryUI.init() once through
 *     ToolApp.boot(); the module renders into #mount-numtheory. Enter in a
 *     field runs that section.
 *
 * ✒ Examples:
 *     NumTheoryUI.init()                     → builds the pane inside #mount-numtheory
 *     NumTheoryUI.checkPrime('2^61 - 1')     → { prime: true, certain: true, value: '2305843009213693951' }
 *     NumTheoryUI.factor('600851475143')     → { factors: [{ prime: '71', exponent: 1 }, …], complete: true, … }
 *     NumTheoryUI.gcdLcm('12, 18, 24')       → { gcd: '6', lcm: '72', count: 3 }
 *     NumTheoryUI.setBase('ff', 16)          → every base field shows 255 in its own base
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/numerics.js (Numerics), js/engine.js (MathEngine,
 *       for expression input), js/state.js (State), js/ui/worksheet.js
 *       (WorksheetUI, optional), shared/js/dom.js, toolapp.js, toolman.js;
 *       css/tools-b.css
 *     - Compatible platforms: all evergreen browsers (BigInt)
 *     - Limitations: factorization runs on the page for at most 200 ms (2
 *       seconds when asked to keep trying), so a product of two large
 *       primes may stay partly unfactored; base conversion takes whole
 *       numbers of up to 4,096 characters
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'numtheory';
    const FIELD_MAX = 2000;
    const LINE_MAX = 1900;
    const SUPERS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const BASE_FIELDS = [
        { base: 2, label: 'Binary', words: 'the binary value' },
        { base: 8, label: 'Octal', words: 'the octal value' },
        { base: 10, label: 'Decimal', words: 'the decimal value' },
        { base: 16, label: 'Hex', words: 'the hexadecimal value' }
    ];
    const DEFAULTS = Object.freeze({ prime: '97', factor: '360', list: '12, 18, 24', base: '255', customBase: 36 });

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        send: svg('<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>'),
        prev: svg('<path d="m15 18-6-6 6-6"></path>'),
        next: svg('<path d="m9 18 6-6-6-6"></path>')
    };

    const els = { bases: [] };
    const last = { prime: null, factor: null, gcd: null };
    let baseValue = null;
    let gcdTimer = 0;

    /* ── Small helpers ─────────────────────────────────────── */

    const plural = (n, word, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;
    const hasNumerics = () => Boolean(window.Numerics && typeof Numerics.factorize === 'function');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function copy(text, label, btn) {
        if (!text) return;
        if (window.ToolApp && typeof ToolApp.copy === 'function') ToolApp.copy(text, label, btn);
        else if (window.DOM && DOM.copyText) DOM.copyText(text);
    }

    function separator() {
        const t = window.State ? State.settings().thousands : 'comma';
        return t === 'space' ? ' ' : t === 'none' ? '' : ',';
    }

    /** Group the digits of an integer string per the thousands setting (− for negatives). */
    function groupInt(str) {
        const s = String(str);
        const neg = s[0] === '-';
        const digits = neg ? s.slice(1) : s;
        const sep = separator();
        if (!sep || digits.length <= 3) return `${neg ? '−' : ''}${digits}`;
        const parts = [];
        let end = digits.length;
        while (end > 0) {
            parts.unshift(digits.slice(Math.max(0, end - 3), end));
            end -= 3;
        }
        return `${neg ? '−' : ''}${parts.join(sep)}`;
    }

    const supText = (n) => String(n).split('').map((d) => SUPERS[d] || d).join('');

    function prefs() {
        const p = (window.State && State.pane(PANE)) || {};
        const str = (v, d) => (typeof v === 'string' ? v.slice(0, FIELD_MAX) : d);
        const cb = Number(p.customBase);
        return {
            prime: str(p.prime, DEFAULTS.prime),
            factor: str(p.factor, DEFAULTS.factor),
            list: str(p.list, DEFAULTS.list),
            base: typeof p.base === 'string' && /^-?\d{0,1300}$/.test(p.base) ? p.base : DEFAULTS.base,
            customBase: Number.isInteger(cb) && cb >= 2 && cb <= 36 ? cb : DEFAULTS.customBase
        };
    }

    function save(patch) {
        if (!window.State) return;
        if (!State.setPane(PANE, patch)) console.warn('[NumTheoryUI] could not save pane preferences:', State.lastError);
    }

    function sendLines(lines, what) {
        const text = lines.join('\n');
        if (window.WorksheetUI && typeof WorksheetUI.appendLine === 'function') {
            const res = WorksheetUI.appendLine(text);
            if (!res) return false;
            if (res.kind === 'error') notify(`Sent ${what}, but the last line shows an error: ${res.error.message}`, 'warning', 4500);
            else notify(`Sent ${what} to the sheet.`, 'success', 2200);
            return true;
        }
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

    /**
     * A whole number from a field: digits (with , _ ' or spaces between
     * them) or an expression the engine works out exactly. Throws a plain
     * message.
     */
    function readWhole(text) {
        const s = String(text || '').trim();
        if (!s) throw new Error('Type a whole number, like 97 or 2^61 - 1.');
        const compact = s.replace(/[\s_,'  ]/g, '').replace(/−/g, '-');
        if (/^[+-]?\d+$/.test(compact)) return Numerics.toBigInt(compact);
        if (!window.MathEngine) throw new Error('Type digits only, like 97 (the math engine did not load).');
        const opts = Object.assign({}, window.State ? State.engineOptions() : {}, { notation: 'auto', fractions: 'auto' });
        const r = MathEngine.evaluate(s, opts);
        if (r.error) throw new Error(r.error.message);
        if (r.unit) throw new Error('Use a plain number here, without units.');
        if (!/^-?\d+$/.test(r.plain)) {
            if (/e/i.test(r.plain) || (typeof r.numeric === 'number' && Math.abs(r.numeric) > 1e300)) {
                throw new Error('That number is too large — keep it to 300 digits or fewer.');
            }
            throw new Error(`That works out to ${r.display || r.plain}, which isn't a whole number.`);
        }
        return Numerics.toBigInt(r.plain);
    }

    function setFeedback(el, message, state) {
        el.textContent = message || '';
        if (message) el.dataset.state = state || 'info';
        else delete el.dataset.state;
    }

    /* ── Builders ──────────────────────────────────────────── */

    function group(title, id) {
        const section = DOM.create('section', { className: 'tb-group', attrs: { 'aria-labelledby': id } });
        section.appendChild(DOM.create('h5', { className: 'section-label', text: title, attrs: { id } }));
        return section;
    }

    function textInput(id, placeholder, label) {
        return DOM.create('input', {
            className: 'text-input mono tb-input',
            attrs: {
                id,
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
                maxlength: String(FIELD_MAX),
                placeholder,
                'aria-label': label
            }
        });
    }

    function iconButton(icon, label, cls = 'icon-action') {
        return DOM.create('button', { className: cls, html: icon, attrs: { type: 'button', 'aria-label': label, title: label } });
    }

    function textButton(label, cls, title, icon, after) {
        const html = icon ? (after ? `<span></span>${icon}` : `${icon}<span></span>`) : '';
        const btn = DOM.create('button', { className: cls, html, text: icon ? '' : label, attrs: { type: 'button', title } });
        const span = btn.querySelector('span');
        if (span) span.textContent = label;
        return btn;
    }

    function sendButton(title) {
        const btn = textButton('Send to sheet', 'btn btn-secondary btn-sm', title, ICONS.send);
        btn.hidden = true;
        return btn;
    }

    /* ── Prime check ───────────────────────────────────────── */

    function buildPrime(root) {
        const sec = group('Prime check', 'nt-prime-title');
        const form = DOM.create('form', { className: 'tb-inline', attrs: { novalidate: 'novalidate' } });
        els.prime = textInput('nt-prime', '97 or 2^61 - 1', 'Number to check');
        form.appendChild(els.prime);
        form.appendChild(DOM.create('button', { className: 'btn btn-primary btn-sm', text: 'Check', attrs: { type: 'submit', title: 'Check whether this number is prime' } }));
        form.addEventListener('submit', (e) => { e.preventDefault(); checkPrimeUI(); });
        sec.appendChild(form);

        const steps = DOM.create('div', { className: 'tb-actions' });
        els.prevPrime = textButton('Previous prime', 'btn btn-ghost btn-sm', 'Step to the largest prime below this number', ICONS.prev);
        els.nextPrime = textButton('Next prime', 'btn btn-ghost btn-sm', 'Step to the smallest prime above this number', ICONS.next, true);
        steps.appendChild(els.prevPrime);
        steps.appendChild(els.nextPrime);
        sec.appendChild(steps);

        els.primeOut = DOM.create('div', { className: 'nt-verdict', attrs: { role: 'status', 'aria-live': 'polite' } });
        sec.appendChild(els.primeOut);
        els.primeError = DOM.create('div', { className: 'tool-feedback tb-feedback', attrs: { role: 'alert' } });
        sec.appendChild(els.primeError);
        els.primeSend = sendButton('Add isprime(…) for this number to the end of the sheet');
        sec.appendChild(els.primeSend);
        root.appendChild(sec);

        els.prime.addEventListener('input', () => {
            els.prime.removeAttribute('aria-invalid');
            save({ prime: els.prime.value.slice(0, FIELD_MAX) });
        });
        els.prevPrime.addEventListener('click', () => stepPrime(-1));
        els.nextPrime.addEventListener('click', () => stepPrime(1));
        els.primeSend.addEventListener('click', () => {
            if (last.prime) sendLines([`isprime(${last.prime.value})`], 'the prime check');
        });
    }

    function primeFailure(err) {
        els.prime.setAttribute('aria-invalid', 'true');
        setFeedback(els.primeError, err && err.message ? err.message : 'That number could not be checked.', 'error');
        DOM.empty(els.primeOut);
        els.primeSend.hidden = true;
        last.prime = null;
    }

    /** Work out the verdict for a BigInt n. */
    function primeVerdict(n, note) {
        const value = n.toString();
        const result = { value, prime: false, certain: true, reason: '', kind: 'not', note: note || '' };
        if (n < 2n) {
            result.kind = 'neither';
            result.reason = n === 1n
                ? '1 is neither prime nor composite: a prime needs exactly two divisors, and 1 has only one.'
                : `${n === 0n ? '0' : 'Negative numbers'} ${n === 0n ? 'is' : 'are'} not prime: primes are whole numbers above 1.`;
            return result;
        }
        const t = Numerics.primality(n);
        result.prime = t.prime;
        result.certain = t.certain;
        if (t.prime) {
            result.kind = 'prime';
            result.reason = t.certain
                ? `${groupInt(value)} is prime: its only divisors are 1 and itself.`
                : `${groupInt(value)} is a strong probable prime. Above 3.3 × 10²⁴ mathMan runs 24 strong pseudoprime tests; no composite number is known to pass them all.`;
            return result;
        }
        const f = Numerics.factorize(n, { timeMs: 120 });
        if (f.complete && f.factors.length <= 8) {
            result.reason = `${groupInt(value)} is not prime: ${groupInt(value)} = ${factorText(f, false)}.`;
        } else if (f.factors.length) {
            result.reason = `${groupInt(value)} is not prime: it is divisible by ${groupInt(f.factors[0].prime)}.`;
        } else {
            result.reason = `${groupInt(value)} is not prime — a strong pseudoprime test proves it composite — but no factor turned up quickly. Try Prime factors below with Keep trying.`;
        }
        return result;
    }

    function renderPrime() {
        DOM.empty(els.primeOut);
        const r = last.prime;
        if (!r) return;
        const tone = r.kind === 'prime' ? 'pass' : r.kind === 'not' ? 'fail' : 'info';
        const word = r.kind === 'prime' ? (r.certain ? 'Prime' : 'Probable prime') : r.kind === 'not' ? 'Not prime' : 'Neither';
        els.primeOut.appendChild(DOM.create('span', { className: 'badge', text: word, attrs: { 'data-tone': tone } }));
        const text = r.note ? `${r.note} ${r.reason}` : r.reason;
        els.primeOut.appendChild(DOM.create('p', { className: 'nt-reason', text }));
        els.primeSend.hidden = false;
    }

    function checkPrimeUI(note) {
        setFeedback(els.primeError, '');
        if (!hasNumerics()) {
            primeFailure(new Error('The number theory library did not load. Reload the page to try again.'));
            return null;
        }
        try {
            const n = readWhole(els.prime.value);
            last.prime = primeVerdict(n, note);
            els.prime.removeAttribute('aria-invalid');
            renderPrime();
            return last.prime;
        } catch (err) {
            primeFailure(err);
            return null;
        }
    }

    function stepPrime(dir) {
        setFeedback(els.primeError, '');
        if (!hasNumerics()) return;
        let n;
        try {
            n = readWhole(els.prime.value || '0');
        } catch (err) {
            primeFailure(err);
            return;
        }
        try {
            const p = dir > 0 ? Numerics.nextPrime(n) : Numerics.prevPrime(n);
            if (p === null) {
                primeFailure(new Error(`There is no prime below ${groupInt(n.toString())} — 2 is the smallest prime.`));
                return;
            }
            els.prime.value = p;
            save({ prime: p });
            checkPrimeUI(dir > 0 ? `The next prime after ${groupInt(n.toString())}.` : `The largest prime below ${groupInt(n.toString())}.`);
        } catch (err) {
            primeFailure(err);
        }
    }

    /* ── Prime factors ─────────────────────────────────────── */

    function buildFactor(root) {
        const sec = group('Prime factors', 'nt-factor-title');
        const form = DOM.create('form', { className: 'tb-inline', attrs: { novalidate: 'novalidate' } });
        els.factor = textInput('nt-factor', '360 or 2^64 + 1', 'Number to factor');
        form.appendChild(els.factor);
        form.appendChild(DOM.create('button', { className: 'btn btn-primary btn-sm', text: 'Factor', attrs: { type: 'submit', title: 'Split this number into prime factors' } }));
        form.addEventListener('submit', (e) => { e.preventDefault(); factorUI(); });
        sec.appendChild(form);

        els.factorOut = DOM.create('div', { className: 'nt-factor-out', attrs: { 'aria-live': 'polite' } });
        els.factorOut.hidden = true;
        els.factorExpr = DOM.create('p', { className: 'nt-expr' });
        els.factorCopy = iconButton(ICONS.copy, 'Copy the factorization');
        els.factorOut.appendChild(DOM.create('div', { className: 'nt-expr-row', children: [els.factorExpr, els.factorCopy] }));
        els.factorFacts = DOM.create('p', { className: 'tb-meta' });
        els.factorOut.appendChild(els.factorFacts);
        sec.appendChild(els.factorOut);

        els.factorFeedback = DOM.create('div', { className: 'tool-feedback tb-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        sec.appendChild(els.factorFeedback);
        const actions = DOM.create('div', { className: 'tb-actions' });
        els.factorMore = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Keep trying (2 s)',
            attrs: { type: 'button', title: 'Search for the remaining factors for up to 2 seconds' }
        });
        els.factorMore.hidden = true;
        els.factorSend = sendButton('Add the product of these factors to the end of the sheet');
        actions.appendChild(els.factorMore);
        actions.appendChild(els.factorSend);
        sec.appendChild(actions);
        root.appendChild(sec);

        els.factor.addEventListener('input', () => {
            els.factor.removeAttribute('aria-invalid');
            save({ factor: els.factor.value.slice(0, FIELD_MAX) });
        });
        els.factorCopy.addEventListener('click', () => {
            if (last.factor) copy(factorText(last.factor.result, true, true), 'the factorization', els.factorCopy);
        });
        els.factorMore.addEventListener('click', () => factorUI(2000));
        els.factorSend.addEventListener('click', sendFactor);
    }

    /**
     * The factor product as text: pretty ("2³ × 3 × 5", grouped digits) by
     * default; with plainText, "2^3 × 3 × 5" (keepTimes, for copying) or
     * "2^3 * 3 * 5" (for the sheet).
     */
    function factorText(f, plainText, keepTimes) {
        const parts = f.factors.map((x) => {
            const p = plainText ? x.prime : groupInt(x.prime);
            if (x.exponent === 1) return p;
            return plainText ? `${p}^${x.exponent}` : `${p}${supText(x.exponent)}`;
        });
        if (f.remainder) parts.push(plainText ? `(${f.remainder})` : `(${groupInt(f.remainder)})`);
        const joiner = plainText && !keepTimes ? ' * ' : ' × ';
        const body = parts.join(joiner);
        if (f.sign < 0) return plainText && !keepTimes ? `-(${body})` : `−1 × ${body}`;
        return body;
    }

    function factorUI(timeMs) {
        setFeedback(els.factorFeedback, '');
        els.factorMore.hidden = true;
        if (!hasNumerics()) {
            setFeedback(els.factorFeedback, 'The number theory library did not load. Reload the page to try again.', 'error');
            return null;
        }
        let n;
        let result;
        try {
            n = readWhole(els.factor.value);
            result = Numerics.factorize(n, { timeMs: timeMs || 200 });
        } catch (err) {
            els.factor.setAttribute('aria-invalid', 'true');
            setFeedback(els.factorFeedback, err && err.message ? err.message : 'That number could not be factored.', 'error');
            els.factorOut.hidden = true;
            els.factorSend.hidden = true;
            last.factor = null;
            return null;
        }
        els.factor.removeAttribute('aria-invalid');
        last.factor = { value: n.toString(), result, extended: Boolean(timeMs) };
        renderFactor();
        return result;
    }

    function renderFactor() {
        const lf = last.factor;
        if (!lf) {
            els.factorOut.hidden = true;
            els.factorSend.hidden = true;
            return;
        }
        const f = lf.result;
        DOM.empty(els.factorExpr);
        els.factorExpr.appendChild(DOM.create('span', { className: 'nt-n', text: groupInt(lf.value) }));
        els.factorExpr.appendChild(document.createTextNode(' = '));
        if (!f.factors.length && !f.remainder) {
            els.factorExpr.appendChild(document.createTextNode(lf.value === '-1' ? '−1' : '1'));
        } else {
            if (f.sign < 0) els.factorExpr.appendChild(document.createTextNode('−1 × '));
            f.factors.forEach((x, i) => {
                if (i) els.factorExpr.appendChild(document.createTextNode(' × '));
                const span = DOM.create('span', { className: 'nt-p', text: groupInt(x.prime) });
                if (x.exponent > 1) span.appendChild(DOM.create('sup', { text: String(x.exponent) }));
                if (x.probable) span.title = 'A strong probable prime (too large for a guaranteed test)';
                els.factorExpr.appendChild(span);
            });
            if (f.remainder) {
                if (f.factors.length) els.factorExpr.appendChild(document.createTextNode(' × '));
                els.factorExpr.appendChild(DOM.create('span', { className: 'nt-rest', text: `(${groupInt(f.remainder)})`, attrs: { title: 'Not factored yet' } }));
            }
        }
        const facts = [];
        if (!f.factors.length && !f.remainder) {
            facts.push(`${lf.value.replace('-', '−')} has no prime factors.`);
        } else if (f.complete) {
            let divisors = 1n;
            f.factors.forEach((x) => { divisors *= BigInt(x.exponent + 1); });
            const total = f.factors.reduce((s, x) => s + x.exponent, 0);
            if (f.factors.length === 1 && f.factors[0].exponent === 1) facts.push('It is prime.');
            else facts.push(`${plural(total, 'prime factor')} (${plural(f.factors.length, 'distinct prime')})`);
            facts.push(`${groupInt(divisors.toString())} positive divisors`);
            if (f.factors.some((x) => x.probable)) facts.push('large factors are strong probable primes');
        }
        els.factorFacts.textContent = facts.join(' · ');
        els.factorFacts.hidden = !facts.length;
        els.factorOut.hidden = false;
        els.factorSend.hidden = false;
        if (!f.complete) {
            setFeedback(els.factorFeedback, lf.extended
                ? `Still not fully factored after 2 seconds. The part in brackets has no factor small enough to find quickly — it is likely the product of two large primes.`
                : `Stopped after 0.2 seconds. The part in brackets is composite but has no small factors yet.`, 'warn');
            els.factorMore.hidden = lf.extended;
        }
    }

    function sendFactor() {
        const lf = last.factor;
        if (!lf) return false;
        const f = lf.result;
        let line;
        if (!f.factors.length && !f.remainder) line = `// ${lf.value} has no prime factors`;
        else if (!f.complete) line = `// ${lf.value} = ${factorText(f, true, true)} (the bracketed part is not factored yet)`;
        else line = `${factorText(f, true, false)} // prime factors of ${lf.value}`;
        if (line.length > LINE_MAX && f.complete) line = factorText(f, true, false);
        return sendLines([line], 'the factorization');
    }

    /* ── GCD & LCM ─────────────────────────────────────────── */

    function buildGcd(root) {
        const sec = group('GCD & LCM', 'nt-gcd-title');
        els.list = textInput('nt-list', '12, 18, 24', 'Whole numbers, separated by commas or spaces');
        els.list.setAttribute('aria-describedby', 'nt-list-hint');
        sec.appendChild(els.list);
        sec.appendChild(DOM.create('p', { className: 'pane-hint', attrs: { id: 'nt-list-hint' }, text: 'Separate whole numbers with commas or spaces; up to 1,000 numbers.' }));
        const list = DOM.create('div', { className: 'readout-list tb-readouts' });
        els.gcdValue = DOM.create('code', { className: 'readout-value', text: '—' });
        els.lcmValue = DOM.create('code', { className: 'readout-value', text: '—' });
        els.gcdCopy = iconButton(ICONS.copy, 'Copy the GCD');
        els.lcmCopy = iconButton(ICONS.copy, 'Copy the LCM');
        list.appendChild(DOM.create('div', {
            className: 'readout',
            children: [DOM.create('span', { className: 'readout-label', text: 'GCD', attrs: { title: 'Greatest common divisor: the largest whole number that divides every entry' } }), els.gcdValue, els.gcdCopy]
        }));
        list.appendChild(DOM.create('div', {
            className: 'readout',
            children: [DOM.create('span', { className: 'readout-label', text: 'LCM', attrs: { title: 'Least common multiple: the smallest whole number every entry divides' } }), els.lcmValue, els.lcmCopy]
        }));
        els.gcdList = list;
        sec.appendChild(list);
        els.gcdFeedback = DOM.create('div', { className: 'tool-feedback tb-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        sec.appendChild(els.gcdFeedback);
        els.gcdSend = sendButton('Add gcd(…) and lcm(…) for these numbers to the end of the sheet');
        sec.appendChild(DOM.create('div', { className: 'tb-actions', children: [els.gcdSend] }));
        root.appendChild(sec);

        els.list.addEventListener('input', () => {
            els.list.removeAttribute('aria-invalid');
            save({ list: els.list.value.slice(0, FIELD_MAX) });
            clearTimeout(gcdTimer);
            gcdTimer = setTimeout(gcdUI, 220);
        });
        els.list.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(gcdTimer);
                gcdUI();
            }
        });
        els.gcdCopy.addEventListener('click', () => { if (last.gcd) copy(last.gcd.gcd, 'the GCD', els.gcdCopy); });
        els.lcmCopy.addEventListener('click', () => { if (last.gcd) copy(last.gcd.lcm, 'the LCM', els.lcmCopy); });
        els.gcdSend.addEventListener('click', sendGcd);
    }

    function gcdUI() {
        gcdTimer = 0;
        setFeedback(els.gcdFeedback, '');
        const text = els.list.value.trim();
        if (!text) {
            last.gcd = null;
            renderGcd();
            setFeedback(els.gcdFeedback, 'Type two or more whole numbers to compare, like 12, 18, 24.', 'info');
            return null;
        }
        if (!hasNumerics()) {
            setFeedback(els.gcdFeedback, 'The number theory library did not load. Reload the page to try again.', 'error');
            return null;
        }
        try {
            const items = text.split(/[\s,;]+/).filter(Boolean);
            const g = Numerics.gcd(items);
            let l = null;
            let lcmError = '';
            try { l = Numerics.lcm(items); } catch (err) { lcmError = err.message; }
            last.gcd = { gcd: g, lcm: l, count: items.length, items: items.map((s) => Numerics.toBigInt(s).toString()) };
            els.list.removeAttribute('aria-invalid');
            renderGcd();
            if (lcmError) setFeedback(els.gcdFeedback, lcmError, 'warn');
            else if (items.length === 1) setFeedback(els.gcdFeedback, 'With one number, the GCD and LCM are the number itself (ignoring its sign).', 'info');
            return last.gcd;
        } catch (err) {
            els.list.setAttribute('aria-invalid', 'true');
            last.gcd = null;
            renderGcd();
            setFeedback(els.gcdFeedback, err && err.message ? err.message : 'Those numbers could not be read.', 'error');
            return null;
        }
    }

    function renderGcd() {
        const r = last.gcd;
        els.gcdValue.textContent = r ? groupInt(r.gcd) : '—';
        els.lcmValue.textContent = r && r.lcm !== null ? groupInt(r.lcm) : '—';
        els.gcdCopy.disabled = !r;
        els.lcmCopy.disabled = !r || r.lcm === null;
        els.gcdSend.hidden = !r;
    }

    function sendGcd() {
        const r = last.gcd;
        if (!r) return false;
        const args = r.items.join(', ');
        const lines = [];
        if (r.items.length <= 500 && args.length + 6 <= LINE_MAX) {
            lines.push(`gcd(${args})`);
            if (r.lcm !== null) lines.push(`lcm(${args})`);
        } else {
            lines.push(`GCD: ${r.gcd}`);
            if (r.lcm !== null && r.lcm.length + 6 <= LINE_MAX) lines.push(`LCM: ${r.lcm}`);
        }
        if (r.lcm !== null && lines.length < 2) lines.push(`// The LCM has ${r.lcm.length.toLocaleString('en-US')} digits — copy it from the Number Theory pane`);
        return sendLines(lines, 'the GCD and LCM');
    }

    /* ── Base converter ────────────────────────────────────── */

    function baseRow(spec, labelEl) {
        const inp = DOM.create('input', {
            className: 'text-input mono tb-input nt-base-input',
            attrs: {
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'characters',
                maxlength: '4100',
                id: `nt-base-${spec.id}`,
                'aria-describedby': 'nt-base-error'
            }
        });
        const btn = iconButton(ICONS.copy, `Copy ${spec.words}`);
        const row = DOM.create('div', { className: 'nt-base-row', children: [labelEl, inp, btn] });
        const entry = { spec, inp, btn, row };
        inp.addEventListener('input', () => onBaseInput(entry));
        btn.addEventListener('click', () => copy(inp.value.trim(), spec.words, btn));
        return entry;
    }

    function buildBases(root) {
        const sec = group('Base converter', 'nt-base-title');
        sec.appendChild(DOM.create('p', { className: 'pane-hint', text: 'Type a whole number in any field; the others follow. Prefixes like 0x and separators like _ are fine.' }));
        const grid = DOM.create('div', { className: 'nt-bases' });
        BASE_FIELDS.forEach((b) => {
            const spec = { id: String(b.base), base: () => b.base, words: b.words, label: b.label };
            const label = DOM.create('label', { className: 'mini-label', text: `${b.label} (${b.base})`, attrs: { for: `nt-base-${spec.id}` } });
            const entry = baseRow(spec, label);
            els.bases.push(entry);
            grid.appendChild(entry.row);
        });
        els.customBase = DOM.create('select', {
            className: 'select-input tb-select nt-base-select',
            attrs: { 'aria-label': 'Custom base', title: 'Pick any base from 2 to 36' }
        });
        for (let b = 2; b <= 36; b++) els.customBase.appendChild(DOM.create('option', { text: `Base ${b}`, attrs: { value: String(b) } }));
        const customSpec = { id: 'custom', base: () => Number(els.customBase.value), words: 'the value in the custom base', label: 'Custom base' };
        const custom = baseRow(customSpec, els.customBase);
        custom.inp.setAttribute('aria-label', 'Value in the custom base');
        els.bases.push(custom);
        grid.appendChild(custom.row);
        sec.appendChild(grid);

        els.baseError = DOM.create('p', { className: 'error-text tb-error', attrs: { id: 'nt-base-error', role: 'alert' } });
        sec.appendChild(els.baseError);
        els.baseMeta = DOM.create('p', { className: 'tb-meta' });
        sec.appendChild(els.baseMeta);
        els.baseSend = sendButton('Add this value, with its other bases as a note, to the end of the sheet');
        sec.appendChild(DOM.create('div', { className: 'tb-actions', children: [els.baseSend] }));
        root.appendChild(sec);

        els.customBase.addEventListener('change', () => {
            save({ customBase: Number(els.customBase.value) });
            renderBases(null);
        });
        els.baseSend.addEventListener('click', sendBase);
    }

    function onBaseInput(entry) {
        const text = entry.inp.value;
        els.bases.forEach((e) => e.inp.removeAttribute('aria-invalid'));
        if (!text.trim()) {
            baseValue = null;
            els.baseError.textContent = '';
            save({ base: '' });
            renderBases(entry);
            return;
        }
        try {
            baseValue = Numerics.parseInBase(text, entry.spec.base());
            els.baseError.textContent = '';
            save({ base: baseValue.toString().slice(0, 1300) });
            renderBases(entry);
        } catch (err) {
            entry.inp.setAttribute('aria-invalid', 'true');
            els.baseError.textContent = `${entry.spec.label}: ${err && err.message ? err.message : 'that is not a valid number.'}`;
        }
    }

    /** Write baseValue into every field except `source` (the one being typed in). */
    function renderBases(source) {
        els.bases.forEach((e) => {
            if (e === source) return;
            e.inp.value = baseValue === null ? '' : baseValue.toString(e.spec.base()).toUpperCase();
            e.inp.removeAttribute('aria-invalid');
            e.btn.disabled = baseValue === null;
        });
        if (source) source.btn.disabled = baseValue === null;
        if (baseValue === null) {
            els.baseMeta.textContent = '';
            els.baseSend.hidden = true;
            return;
        }
        const abs = baseValue < 0n ? -baseValue : baseValue;
        const bits = abs === 0n ? 1 : abs.toString(2).length;
        const digits = abs.toString().length;
        els.baseMeta.textContent = `${plural(bits, 'bit')} · ${plural(digits, 'decimal digit')}${baseValue < 0n ? ' · negative values keep a minus sign (no two’s complement)' : ''}`;
        els.baseSend.hidden = false;
    }

    function sendBase() {
        if (baseValue === null) return false;
        const dec = baseValue.toString();
        const notes = [
            `0x${baseValue.toString(16).toUpperCase()}`,
            `0o${baseValue.toString(8)}`,
            `0b${baseValue.toString(2)}`
        ].map((s) => s.replace(/^0([xob])-/, '-0$1'));
        const cb = Number(els.customBase.value);
        if (![2, 8, 10, 16].includes(cb)) notes.push(`${baseValue.toString(cb).toUpperCase()} in base ${cb}`);
        let line = dec;
        const extra = notes.filter((n) => n.length < LINE_MAX);
        for (let i = 0; i < extra.length; i++) {
            const next = `${dec} // = ${extra.slice(0, i + 1).join(' = ')}`;
            if (next.length > LINE_MAX) break;
            line = next;
        }
        return sendLines([line], 'the value');
    }

    /* ── Init ──────────────────────────────────────────────── */

    function load() {
        const p = prefs();
        els.prime.value = p.prime;
        els.factor.value = p.factor;
        els.list.value = p.list;
        els.customBase.value = String(p.customBase);
        last.prime = null;
        last.factor = null;
        DOM.empty(els.primeOut);
        setFeedback(els.primeError, '');
        els.primeSend.hidden = true;
        setFeedback(els.factorFeedback, '');
        els.factorOut.hidden = true;
        els.factorSend.hidden = true;
        els.factorMore.hidden = true;
        try {
            baseValue = p.base ? BigInt(p.base) : null;
        } catch (_err) {
            baseValue = null;
        }
        els.baseError.textContent = '';
        renderBases(null);
        if (p.list.trim()) gcdUI();
        else {
            last.gcd = null;
            renderGcd();
        }
    }

    function rerender() {
        if (last.prime && els.prime.value.trim()) checkPrimeUI(last.prime.note);
        renderFactor();
        renderGcd();
    }

    const NumTheoryUI = {
        init() {
            const mount = DOM.id('mount-numtheory');
            if (!mount || els.root) return;
            const root = DOM.create('div', { className: 'tb-pane nt' });
            buildPrime(root);
            buildFactor(root);
            buildGcd(root);
            buildBases(root);
            mount.appendChild(root);
            els.root = root;
            load();
            if (window.State) {
                State.on('settings', rerender);
                State.on('reset', load);
            }
        },

        /** Check a number (digits or an expression); returns the verdict or null with the error shown. */
        checkPrime(text) {
            if (!els.root) return null;
            els.prime.value = String(text);
            save({ prime: els.prime.value.slice(0, FIELD_MAX) });
            const r = checkPrimeUI();
            return r ? { prime: r.prime, certain: r.certain, value: r.value } : null;
        },

        /** Factor a number; returns the Numerics.factorize() result or null. */
        factor(text) {
            if (!els.root) return null;
            els.factor.value = String(text);
            save({ factor: els.factor.value.slice(0, FIELD_MAX) });
            return factorUI();
        },

        /** GCD and LCM of a list; returns { gcd, lcm, count } or null. */
        gcdLcm(text) {
            if (!els.root) return null;
            els.list.value = String(text);
            save({ list: els.list.value.slice(0, FIELD_MAX) });
            const r = gcdUI();
            return r ? { gcd: r.gcd, lcm: r.lcm, count: r.count } : null;
        },

        /** Type a value into the base field for `base` (2, 8, 10, 16, or the custom base). */
        setBase(text, base = 10) {
            if (!els.root) return false;
            let entry = els.bases.find((e) => e.spec.base() === Number(base) && e.spec.id !== 'custom');
            if (!entry) {
                const b = Number(base);
                if (!Number.isInteger(b) || b < 2 || b > 36) return false;
                els.customBase.value = String(b);
                save({ customBase: b });
                entry = els.bases[els.bases.length - 1];
            }
            entry.inp.value = String(text);
            onBaseInput(entry);
            return baseValue === null ? null : baseValue.toString();
        }
    };

    window.NumTheoryUI = NumTheoryUI;
})();
