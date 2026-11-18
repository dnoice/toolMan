/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: Finance (mathMan Edition - v1.0)
 *     - File Name: finance.js
 *     - Relative Path: tools/mathman/js/finance.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The money and percentage math behind mathMan's Percentages and Finance
 *     panes: loan payments and amortization schedules, compound savings
 *     with regular contributions, simple interest, CAGR, everyday percent
 *     questions, and ratios. It has no DOM, so the panes and the Node tests
 *     share one implementation, and every input is checked so a bad value
 *     comes back as a plain sentence instead of a wrong answer.
 *
 * ✒ Key Features:
 *     - Rates are percents throughout: annualRate 6 means 6% a year, and
 *       cagr / whatPercent / percentChange answer in percent (14.87, not
 *       0.1487)
 *     - payment: the level payment of an amortizing loan, any number of
 *       payments a year (1–365), with 0% loans handled as principal ÷ count
 *     - amortization: every period's payment, principal, interest, extra and
 *       balance; extra payments shorten the schedule, the final row always
 *       clears the balance to exactly 0, and the result reports the interest
 *       and periods the extra payments save
 *     - yearlySummary and amortizationCsv turn a schedule into year rows and
 *       a spreadsheet-ready CSV
 *     - compound: future value with any compounding frequency, regular
 *       contributions on their own frequency, made at the end or the start
 *       of each period, a yearly table, and the effective annual rate (APY)
 *     - simpleInterest, cagr, discount, salesTax, and tipSplit for the quick
 *       calculators
 *     - Percent helpers: percentOf, whatPercent, percentChange (measured
 *       from |from|), applyPercent, reversePercent; results are tidied to 15
 *       significant digits so 0.1 + 0.2 style noise never shows
 *     - ratio simplifies with exact BigInt arithmetic on the decimal digits
 *       (1.5 : 2 is 3:4); scaleRatio keeps the shape for a new width or
 *       height
 *     - parseNumber reads what people type: 1,200.50, $1,200, 7.5%, 1_000,
 *       −5 (Unicode minus), and rejects decimal commas with a hint
 *     - Errors are plain sentences with err.field naming the bad input and
 *       err.code ('missing', 'invalid', 'range') for the UI
 *     - Size caps everywhere: amounts up to 1e12, terms up to 100 years,
 *       36,500 periods per schedule, ratio values up to 30 digits
 *
 * ✒ Usage Instructions:
 *     Browser: load after js/numerics.js and before js/state.js; everything
 *     is on window.Finance. Node: const Finance = require('./finance.js').
 *     Loan and savings functions take one options object; the small helpers
 *     take positional numbers. Every number argument may be a Number or a
 *     numeric string (parsed with parseNumber). Invalid input throws an
 *     Error whose message can be shown to the visitor as is.
 *
 * ✒ Examples:
 *     Finance.payment({ principal: 200000, annualRate: 6, years: 30 })          → 1199.10…
 *     Finance.amortization({ principal: 200000, annualRate: 6, years: 30 }).totalInterest → 231676.38…
 *     Finance.amortization({ principal: 200000, annualRate: 6, years: 30, extraPayment: 200 }).periods → 252
 *     Finance.compound({ principal: 10000, annualRate: 5, years: 10 }).futureValue → 16470.09…
 *     Finance.compound({ principal: 0, annualRate: 6, years: 1, contribution: 100, timing: 'start' }).futureValue → 1239.72…
 *     Finance.cagr(100, 200, 5)                 → 14.8698…
 *     Finance.percentOf(20, 150)                → 30
 *     Finance.whatPercent(30, 150)              → 20
 *     Finance.percentChange(80, 100)            → 25
 *     Finance.applyPercent(150, -20)            → 120
 *     Finance.reversePercent(180, 20)           → 150
 *     Finance.ratio(1920, 1080)                 → '16:9'
 *     Finance.scaleRatio(1920, 1080, { width: 1280 }) → { width: 1280, height: 720 }
 *     Finance.tipSplit({ bill: 120, tipPercent: 18, people: 4 }).perPerson → 35.4
 *     Finance.parseNumber('$1,200.50')          → 1200.5
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM; safe in Node 16+ and the browser)
 *     - Compatible platforms: all evergreen browsers with BigInt
 *     - Limitations: results are IEEE doubles, not rounded to cents per
 *       period the way a lender's ledger is, so a real statement can differ
 *       by a few cents over a long loan; a regular payment that would leave
 *       less than half a cent ends the schedule; annual rates go up to
 *       1,000% and money amounts up to 1,000,000,000,000
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const Finance = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = Finance;
    if (root) root.Finance = Finance;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const LIMITS = Object.freeze({
        amount: 1e12,
        rate: 1000,
        percent: 1e9,
        years: 100,
        cagrYears: 1000,
        perYear: 365,
        periods: 36500,
        people: 1000,
        text: 64,
        ratioDigits: 30
    });

    /** A regular payment that leaves less than this owing ends the schedule. */
    const HALF_CENT = 0.005;

    /* ── Errors and parsing ────────────────────────────────── */

    function fail(message, field, code) {
        const err = new Error(message);
        if (field) err.field = field;
        err.code = code || 'invalid';
        return err;
    }

    const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const show = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 });

    /** Round away binary noise (0.30000000000000004 → 0.3); -0 becomes 0. */
    function tidy(x) {
        if (!Number.isFinite(x)) return x;
        const t = Number(x.toPrecision(15));
        return t === 0 ? 0 : t;
    }

    const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
    const GROUPED_RE = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
    const CURRENCY_RE = /^(?:[A-Z]{2}\$|[A-Z]{3}\s*|[$€£¥₹₩₽₺₪₦₱฿₫]|R\$|kr\.?\s*)/;

    /**
     * Read a number the way people type it. Accepts a finite Number, or a
     * string with optional thousands commas, spaces, underscores, a leading
     * currency sign, a trailing %, a leading + or a Unicode minus. Throws
     * an Error (code 'missing' or 'invalid') with a plain message.
     */
    function parseNumber(value, label, field) {
        const what = label || 'a number';
        if (typeof value === 'number') {
            if (Number.isFinite(value)) return value === 0 ? 0 : value;
            throw fail(`Enter ${what} as a regular number.`, field, 'invalid');
        }
        if (typeof value === 'bigint') {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
            throw fail(`${cap(what)} is too large.`, field, 'range');
        }
        if (value === null || value === undefined) throw fail(`Enter ${what}.`, field, 'missing');
        if (typeof value !== 'string') throw fail(`Enter ${what} as a number.`, field, 'invalid');
        const raw = value.trim();
        if (!raw) throw fail(`Enter ${what}.`, field, 'missing');
        if (raw.length > LIMITS.text) throw fail(`That is too long for ${what}. Use at most ${LIMITS.text} characters.`, field, 'invalid');
        let s = raw.replace(/[−‒–]/g, '-').replace(/[\s  _]/g, '');
        let sign = '';
        if (/^[+-]/.test(s)) { sign = s[0] === '-' ? '-' : ''; s = s.slice(1); }
        s = s.replace(CURRENCY_RE, '');
        if (/^[+-]/.test(s)) { sign = (sign === '-') !== (s[0] === '-') ? '-' : ''; s = s.slice(1); }
        if (s.endsWith('%')) s = s.slice(0, -1);
        if (s.includes(',')) {
            if (!GROUPED_RE.test(s)) {
                const quoted = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
                throw fail(/^\d+,\d{1,2}$/.test(s)
                    ? `'${quoted}' looks like a decimal comma — use a dot for decimals, like 1.5.`
                    : `'${quoted}' has commas in the wrong places — write it like 1,250,000 or 1250000.`, field, 'invalid');
            }
            s = s.replace(/,/g, '');
        }
        if (!NUMBER_RE.test(s)) {
            const quoted = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
            throw fail(`'${quoted}' isn't a number — type digits like 1500 or 12.5.`, field, 'invalid');
        }
        const n = Number(sign + s);
        if (!Number.isFinite(n)) throw fail(`${cap(what)} is too large.`, field, 'range');
        return n === 0 ? 0 : n;
    }

    function cap(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    /** A number in [min, max]; opts.above makes min exclusive. */
    function numberIn(value, field, label, min, max, opts = {}) {
        const n = parseNumber(value, `the ${label}`, field);
        if (opts.integer && !Number.isInteger(n)) throw fail(`The ${label} must be a whole number.`, field, 'range');
        if (opts.above ? n <= min : n < min) {
            if (min === 0 && !opts.above) throw fail(`The ${label} can't be negative.`, field, 'range');
            throw fail(opts.above ? `The ${label} must be more than ${show(min)}.` : `The ${label} must be at least ${show(min)}.`, field, 'range');
        }
        if (n > max) throw fail(`The ${label} must be at most ${show(max)}.`, field, 'range');
        return n;
    }

    const amount = (v, field, label, positive) => numberIn(v, field, label, 0, LIMITS.amount, { above: Boolean(positive) });
    const annualRate = (v, field = 'annualRate') => numberIn(v, field, 'interest rate', 0, LIMITS.rate);
    const term = (v, field = 'years') => numberIn(v, field, 'number of years', 0, LIMITS.years, { above: true });
    const perYear = (v, field, label) => numberIn(v, field, label, 1, LIMITS.perYear, { integer: true });
    const anyPercent = (v, field, label) => numberIn(v, field, label, -LIMITS.percent, LIMITS.percent);
    const anyValue = (v, field, label) => {
        const n = parseNumber(v, `the ${label}`, field);
        if (Math.abs(n) > 1e15) throw fail(`The ${label} must be between -1e15 and 1e15.`, field, 'range');
        return n;
    };

    /** Optional argument: the fallback when it is absent or an empty string. */
    const opt = (o, key, fallback) => (has(o, key) && o[key] !== undefined && o[key] !== null && o[key] !== '' ? o[key] : fallback);

    function needObject(o, what) {
        if (!isObj(o)) throw fail(`Pass the ${what} as an object, like { principal: 200000, annualRate: 6, years: 30 }.`, null, 'invalid');
    }

    function checkResult(x, what) {
        if (!Number.isFinite(x)) throw fail(`The ${what} is too large to show. Try a lower rate or a shorter term.`, null, 'range');
        return x;
    }

    /* ── Loans ─────────────────────────────────────────────── */

    function loanTerms(o) {
        needObject(o, 'loan details');
        const principal = amount(o.principal, 'principal', 'loan amount', true);
        const rate = annualRate(o.annualRate);
        const years = term(o.years);
        const ppy = perYear(opt(o, 'periodsPerYear', 12), 'periodsPerYear', 'number of payments per year');
        const n = Math.round(years * ppy);
        if (n < 1) throw fail('That term is shorter than one payment. Use more years or more payments per year.', 'years', 'range');
        if (n > LIMITS.periods) throw fail(`That is ${show(n)} payments; the most mathMan schedules is ${show(LIMITS.periods)}.`, 'years', 'range');
        const i = rate / 100 / ppy;
        // 1 − (1 + i)^−n, computed without cancellation for tiny rates.
        const pmt = i === 0 ? principal / n : principal * i / -Math.expm1(-n * Math.log1p(i));
        return { principal, rate, years, ppy, n, i, payment: checkResult(pmt, 'payment') };
    }

    /** The level payment per period for an amortizing loan. */
    function payment(o) {
        return loanTerms(o).payment;
    }

    /**
     * The full schedule. Rows: { period, year, payment, principal, interest,
     * extra, balance }, where payment is the total paid that period (extra
     * included). Stops early when extra payments clear the loan.
     */
    function amortization(o) {
        const t = loanTerms(o);
        const extra = amount(opt(o, 'extraPayment', 0), 'extraPayment', 'extra payment', false);
        const rows = [];
        let balance = t.principal;
        let totalInterest = 0;
        let totalPaid = 0;
        for (let k = 1; k <= t.n && balance > 0; k++) {
            const interest = balance * t.i;
            let principalPart = t.payment + extra - interest;
            let paid = t.payment + extra;
            let extraPart = extra;
            if (k === t.n || principalPart >= balance - HALF_CENT) {
                principalPart = balance;
                paid = balance + interest;
                extraPart = Math.max(0, Math.min(extra, paid - t.payment));
                balance = 0;
            } else {
                balance -= principalPart;
            }
            totalInterest += interest;
            totalPaid += paid;
            rows.push({
                period: k,
                year: Math.ceil(k / t.ppy),
                payment: paid,
                principal: principalPart,
                interest,
                extra: extraPart,
                balance
            });
        }
        const baselineInterest = Math.max(0, t.payment * t.n - t.principal);
        return {
            principal: t.principal,
            annualRate: t.rate,
            years: t.years,
            periodsPerYear: t.ppy,
            payment: t.payment,
            extraPayment: extra,
            rows,
            periods: rows.length,
            scheduledPeriods: t.n,
            periodsSaved: t.n - rows.length,
            totalInterest,
            totalPaid,
            baselineInterest,
            interestSaved: Math.max(0, baselineInterest - totalInterest)
        };
    }

    /** Year-by-year totals of an amortization() result. */
    function yearlySummary(schedule) {
        if (!isObj(schedule) || !Array.isArray(schedule.rows)) throw fail('Pass the result of Finance.amortization().', null, 'invalid');
        const years = [];
        let cur = null;
        for (const r of schedule.rows) {
            if (!cur || cur.year !== r.year) {
                cur = { year: r.year, fromPeriod: r.period, toPeriod: r.period, payment: 0, principal: 0, interest: 0, extra: 0, balance: r.balance };
                years.push(cur);
            }
            cur.toPeriod = r.period;
            cur.payment += r.payment;
            cur.principal += r.principal;
            cur.interest += r.interest;
            cur.extra += r.extra || 0;
            cur.balance = r.balance;
        }
        return years;
    }

    const money2 = (n) => (Math.abs(n) < 0.005 ? '0.00' : n.toFixed(2));

    /** A CSV of every period (two decimals, no separators), ready for a spreadsheet. */
    function amortizationCsv(schedule) {
        if (!isObj(schedule) || !Array.isArray(schedule.rows)) throw fail('Pass the result of Finance.amortization().', null, 'invalid');
        const lines = ['Period,Year,Payment,Principal,Interest,Extra,Balance'];
        for (const r of schedule.rows) {
            lines.push([r.period, r.year, money2(r.payment), money2(r.principal), money2(r.interest), money2(r.extra || 0), money2(r.balance)].join(','));
        }
        return `${lines.join('\n')}\n`;
    }

    /* ── Savings ───────────────────────────────────────────── */

    /**
     * Future value of a starting amount plus regular contributions. Growth
     * runs on the contribution schedule at the effective rate per period,
     * so the starting amount grows exactly as (1 + r/m)^(m·years).
     */
    function compound(o) {
        needObject(o, 'savings details');
        const principal = amount(opt(o, 'principal', 0), 'principal', 'starting amount', false);
        const rate = annualRate(o.annualRate);
        const years = term(o.years);
        const m = perYear(opt(o, 'compoundsPerYear', 12), 'compoundsPerYear', 'number of times interest compounds a year');
        const contribution = amount(opt(o, 'contribution', 0), 'contribution', 'contribution', false);
        const k = perYear(opt(o, 'contributionsPerYear', 12), 'contributionsPerYear', 'number of contributions a year');
        const timingRaw = opt(o, 'timing', 'end');
        if (timingRaw !== 'end' && timingRaw !== 'start') {
            throw fail("Timing must be 'end' (deposits at the end of each period) or 'start'.", 'timing', 'invalid');
        }
        const atStart = timingRaw === 'start';
        if (principal === 0 && contribution === 0) {
            throw fail('Enter a starting amount, a regular contribution, or both.', 'principal', 'missing');
        }
        const steps = years * k;
        let whole = Math.floor(steps + 1e-9);
        let frac = steps - whole;
        if (frac < 1e-9) frac = 0;
        if (whole + (frac ? 1 : 0) > LIMITS.periods) {
            throw fail(`That is ${show(Math.ceil(steps))} periods; the most mathMan works out is ${show(LIMITS.periods)}.`, 'years', 'range');
        }
        const r = rate / 100;
        const i = Math.expm1((m / k) * Math.log1p(r / m));
        const rows = [];
        let balance = principal;
        let added = 0;
        let earned = 0;
        let yearAdded = 0;
        let yearEarned = 0;
        const closeYear = (label) => {
            rows.push({
                year: label,
                balance,
                contributions: yearAdded,
                interest: yearEarned,
                totalContributions: added,
                totalInterest: earned
            });
            yearAdded = 0;
            yearEarned = 0;
        };
        for (let p = 1; p <= whole; p++) {
            if (atStart && contribution) { balance += contribution; added += contribution; yearAdded += contribution; }
            const interest = balance * i;
            balance += interest;
            earned += interest;
            yearEarned += interest;
            if (!atStart && contribution) { balance += contribution; added += contribution; yearAdded += contribution; }
            if (p % k === 0) closeYear(p / k);
        }
        if (frac) {
            const interest = balance * Math.expm1(frac * Math.log1p(i));
            balance += interest;
            earned += interest;
            yearEarned += interest;
        }
        if (frac || whole % k !== 0) closeYear(Number(years.toFixed(4)));
        checkResult(balance, 'future value');
        return {
            futureValue: balance,
            principal,
            totalContributions: added,
            totalDeposited: principal + added,
            totalInterest: earned,
            effectiveAnnualRate: tidy(Math.expm1(m * Math.log1p(r / m)) * 100),
            rows
        };
    }

    /** Simple (non-compounding) interest: (principal, annualRate%, years) or one options object. */
    function simpleInterest(a, b, c) {
        const o = isObj(a) ? a : { principal: a, annualRate: b, years: c };
        const principal = amount(o.principal, 'principal', 'principal', false);
        const rate = annualRate(o.annualRate);
        const years = numberIn(o.years, 'years', 'number of years', 0, LIMITS.cagrYears);
        const interest = checkResult(principal * rate * years / 100, 'interest');
        return { principal, interest: tidy(interest), total: tidy(principal + interest) };
    }

    /** Compound annual growth rate, in percent: (end / start)^(1 / years) − 1. */
    function cagr(start, end, years) {
        const s = numberIn(start, 'start', 'starting value', 0, 1e15, { above: true });
        const e = numberIn(end, 'end', 'ending value', 0, 1e15);
        const y = numberIn(years, 'years', 'number of years', 0, LIMITS.cagrYears, { above: true });
        if (e === 0) return -100;
        return tidy(checkResult(Math.expm1(Math.log(e / s) / y) * 100, 'growth rate'));
    }

    /* ── Everyday money ────────────────────────────────────── */

    /** A percentage off a price: { saved, final }. */
    function discount(price, percent) {
        const p = amount(price, 'price', 'price', false);
        const d = numberIn(percent, 'percent', 'discount', 0, 100);
        const saved = tidy(p * d / 100);
        return { saved, final: tidy(p - saved) };
    }

    /** Sales tax on a pre-tax amount: { tax, total }. */
    function salesTax(price, rate) {
        const p = amount(price, 'price', 'price', false);
        const r = numberIn(rate, 'rate', 'tax rate', 0, 100);
        const tax = tidy(p * r / 100);
        return { tax, total: tidy(p + tax) };
    }

    /** A tip on a bill, split evenly: (bill, tipPercent, people) or { bill, tipPercent, people }. */
    function tipSplit(a, b, c) {
        const o = isObj(a) ? a : { bill: a, tipPercent: b, people: c };
        const bill = amount(o.bill, 'bill', 'bill', false);
        const pct = numberIn(o.tipPercent, 'tipPercent', 'tip', 0, 100);
        const people = numberIn(opt(o, 'people', 1), 'people', 'number of people', 1, LIMITS.people, { integer: true });
        const tip = tidy(bill * pct / 100);
        const total = tidy(bill + tip);
        return { tip, total, perPerson: tidy(total / people), tipPerPerson: tidy(tip / people), people };
    }

    /* ── Percentages ───────────────────────────────────────── */

    /** p% of x. */
    function percentOf(p, x) {
        const pp = anyPercent(p, 'percent', 'percent');
        const xx = anyValue(x, 'value', 'value');
        return tidy(pp * xx / 100);
    }

    /** What percent part is of whole. */
    function whatPercent(part, whole) {
        const a = anyValue(part, 'part', 'part');
        const b = anyValue(whole, 'whole', 'whole');
        if (b === 0) throw fail("The whole can't be 0 — nothing is a percentage of zero.", 'whole', 'range');
        return tidy(a * 100 / b);
    }

    /** Percent change from one value to another, measured against |from|. */
    function percentChange(from, to) {
        const a = anyValue(from, 'from', 'starting value');
        const b = anyValue(to, 'to', 'new value');
        if (a === 0) throw fail("A percent change from 0 isn't defined — the starting value can't be 0.", 'from', 'range');
        return tidy((b - a) * 100 / Math.abs(a));
    }

    /** x changed by p% (a negative p decreases). */
    function applyPercent(x, p) {
        const xx = anyValue(x, 'value', 'value');
        const pp = anyPercent(p, 'percent', 'percent');
        return tidy(xx * (100 + pp) / 100);
    }

    /** The original value before a p% change produced result. */
    function reversePercent(result, p) {
        const r = anyValue(result, 'result', 'result');
        const pp = anyPercent(p, 'percent', 'percent');
        if (pp === -100) throw fail("A 100% decrease always ends at 0, so the original can't be worked out.", 'percent', 'range');
        return tidy(r * 100 / (100 + pp));
    }

    /* ── Ratios ────────────────────────────────────────────── */

    /** A non-negative decimal as { digits: BigInt, scale } meaning digits / 10^scale. */
    function decimalParts(value, field, label) {
        const n = parseNumber(value, `the ${label}`, field);
        if (n < 0) throw fail(`The ${label} can't be negative in a ratio.`, field, 'range');
        let s = typeof value === 'string' ? value.replace(/[\s,_]/g, '').replace(/^\+/, '') : String(n);
        if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) s = String(n);
        const m = /^(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
        const int = m[1] || '';
        const dec = m[2] || '';
        const exp = m[3] ? Number(m[3]) : 0;
        let scale = dec.length - exp;
        let digits = (int + dec).replace(/^0+(?=\d)/, '') || '0';
        if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
        // Drop trailing zeros of the fraction so 1.50 and 1.5 scale alike.
        while (scale > 0 && digits.length > 1 && digits.endsWith('0')) { digits = digits.slice(0, -1); scale--; }
        if (digits.replace(/^0+/, '').length > LIMITS.ratioDigits || scale > LIMITS.ratioDigits) {
            throw fail(`The ${label} has too many digits for a ratio. Use at most ${LIMITS.ratioDigits}.`, field, 'range');
        }
        return { digits: BigInt(digits), scale };
    }

    function bigGcd(a, b) {
        while (b) { [a, b] = [b, a % b]; }
        return a;
    }

    /** The simplest whole-number ratio, as 'a:b'. */
    function ratio(a, b) {
        const x = decimalParts(a, 'a', 'first number');
        const y = decimalParts(b, 'b', 'second number');
        if (x.digits === 0n && y.digits === 0n) throw fail("Both sides are 0, so there's no ratio to simplify.", 'a', 'range');
        const scale = Math.max(x.scale, y.scale);
        const A = x.digits * 10n ** BigInt(scale - x.scale);
        const B = y.digits * 10n ** BigInt(scale - y.scale);
        const g = bigGcd(A, B) || 1n;
        return `${A / g}:${B / g}`;
    }

    /**
     * Keep the w:h shape at a new size. The target is { width } or
     * { height }, or positional: scaleRatio(w, h, newWidth) or
     * scaleRatio(w, h, null, newHeight). Returns { width, height }.
     */
    function scaleRatio(w, h, target, maybeHeight) {
        const W = numberIn(w, 'width', 'original width', 0, 1e15, { above: true });
        const H = numberIn(h, 'height', 'original height', 0, 1e15, { above: true });
        let newW = null;
        let newH = null;
        if (isObj(target)) {
            if (has(target, 'width') && target.width !== null && target.width !== undefined && target.width !== '') newW = target.width;
            if (has(target, 'height') && target.height !== null && target.height !== undefined && target.height !== '') newH = target.height;
        } else {
            if (target !== null && target !== undefined && target !== '') newW = target;
            if (maybeHeight !== null && maybeHeight !== undefined && maybeHeight !== '') newH = maybeHeight;
        }
        if (newW !== null && newH !== null) throw fail('Give a new width or a new height, not both — the other one is worked out.', 'target', 'invalid');
        if (newW === null && newH === null) throw fail('Enter the new width or the new height.', 'target', 'missing');
        if (newW !== null) {
            const nw = numberIn(newW, 'target', 'new width', 0, 1e15, { above: true });
            return { width: nw, height: tidy(nw * H / W) };
        }
        const nh = numberIn(newH, 'target', 'new height', 0, 1e15, { above: true });
        return { width: tidy(nh * W / H), height: nh };
    }

    /* ── Durations ─────────────────────────────────────────── */

    /** "29 years 2 months" for a count of periods at a number per year. */
    function durationText(periods, periodsPerYear) {
        const p = numberIn(periods, 'periods', 'number of periods', 0, LIMITS.periods, { integer: true });
        const ppy = perYear(periodsPerYear === undefined ? 12 : periodsPerYear, 'periodsPerYear', 'number of periods per year');
        if (p === 0) return '0 months';
        const exactMonths = p * 12 / ppy;
        if (exactMonths < 1) {
            const days = Math.max(1, Math.round(p * 365 / ppy));
            if (days >= 7 && ppy !== 365) {
                const weeks = Math.round(days / 7);
                return `${weeks} week${weeks === 1 ? '' : 's'}`;
            }
            return `${days} day${days === 1 ? '' : 's'}`;
        }
        let months = Math.round(exactMonths);
        const years = Math.floor(months / 12);
        months -= years * 12;
        const parts = [];
        if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
        if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
        return parts.join(' ');
    }

    return Object.freeze({
        LIMITS,
        parseNumber,
        payment,
        amortization,
        yearlySummary,
        amortizationCsv,
        compound,
        simpleInterest,
        cagr,
        discount,
        salesTax,
        tipSplit,
        percentOf,
        whatPercent,
        percentChange,
        applyPercent,
        reversePercent,
        ratio,
        scaleRatio,
        durationText,
        tidy
    });
});
