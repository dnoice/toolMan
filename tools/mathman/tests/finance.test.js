/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: FinanceTests (mathMan Edition - v1.0)
 *     - File Name: finance.test.js
 *     - Relative Path: tools/mathman/tests/finance.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for mathMan's money and percentage library (js/finance.js).
 *     They pin the textbook answers — a 30-year mortgage, ten years of
 *     monthly compounding, a doubling CAGR, a 16:9 screen — and every
 *     validation message, so a change to the formulas or the parsing cannot
 *     quietly move a number. Run them after any edit to finance.js.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus a twelve-line runner
 *     - Loans: payment for 200,000 at 6% over 30 years (1,199.10), the
 *       schedule's total interest (231,676.38) and final zero balance, 0%
 *       loans, other payment frequencies, extra payments ending the loan
 *       early, the yearly summary, and the CSV export
 *     - Savings: 10,000 at 5% compounded monthly for 10 years (16,470.09),
 *       contributions at the start vs the end of each period, mixed
 *       compounding and contribution frequencies, partial years, APY
 *     - Simple interest, CAGR (100 → 200 in 5 years is 14.87%), discount,
 *       sales tax, and tip split
 *     - Percent helpers with float-noise tidying and their zero guards
 *     - Ratios with exact BigInt simplification and aspect scaling
 *     - parseNumber: currency signs, thousands commas, %, underscores, the
 *       Unicode minus, and friendly errors for decimal commas and junk
 *     - Validation: field names and error codes on bad input, size caps,
 *       and a 100-year daily schedule finishing well under a second
 *     - Prints a pass/fail line per test and an assertion total; exits 1 on
 *       any failure so it can gate a commit
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/mathman/tests/finance.test.js
 *     A clean run ends with "All N tests passed (M assertions)".
 *
 * ✒ Examples:
 *     node tools/mathman/tests/finance.test.js          → full run
 *     node tools/mathman/tests/finance.test.js loan     → only tests whose
 *                                                         name contains "loan"
 *     near(F.payment(MORTGAGE), 1199.10, 0.005)
 *     eq(F.ratio(1920, 1080), '16:9')
 *     throwsLike(() => F.whatPercent(5, 0), /can't be 0/, 'whole')
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+ and ../js/finance.js
 *     - Compatible platforms: any OS with Node
 *     - Limitations: the timing test uses a generous bound; the panes
 *       around the library are covered by the e2e suite
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const F = require(path.join(__dirname, '..', 'js', 'finance.js'));

/* ------------------------------------------------------------------ */
/* Tiny runner                                                         */
/* ------------------------------------------------------------------ */

let assertions = 0;
const results = [];
const filter = process.argv[2] ? process.argv[2].toLowerCase() : '';

function test(name, fn) {
    if (filter && !name.toLowerCase().includes(filter)) return;
    try { fn(); results.push({ name, ok: true }); }
    catch (err) { results.push({ name, ok: false, err }); }
}

function ok(value, msg) { assertions++; assert.ok(value, msg); }
function eq(actual, expected, msg) { assertions++; assert.deepStrictEqual(actual, expected, msg); }
function near(actual, expected, tol, msg) {
    assertions++;
    assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol,
        `${msg || 'value'}: expected ${expected} ± ${tol}, got ${actual}`);
}
function throwsLike(fn, re, field) {
    assertions++;
    let caught = null;
    try { fn(); } catch (err) { caught = err; }
    assert.ok(caught, `expected an error matching ${re}`);
    assert.ok(re.test(caught.message), `message "${caught.message}" should match ${re}`);
    if (field !== undefined) assert.strictEqual(caught.field, field, `error field for "${caught.message}"`);
    return caught;
}

const MORTGAGE = Object.freeze({ principal: 200000, annualRate: 6, years: 30, periodsPerYear: 12 });
const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

/* ------------------------------------------------------------------ */
/* Loans                                                               */
/* ------------------------------------------------------------------ */

test('loan payment: 200,000 at 6% for 30 years is 1,199.10 a month', () => {
    near(F.payment(MORTGAGE), 1199.10, 0.005);
    near(F.payment({ principal: 200000, annualRate: 6, years: 30 }), 1199.10, 0.005, 'periodsPerYear defaults to 12');
    near(F.payment({ principal: '200,000', annualRate: '6%', years: '30' }), 1199.10, 0.005, 'strings are parsed');
});

test('loan payment: other frequencies and short terms', () => {
    near(F.payment({ principal: 10000, annualRate: 5, years: 5, periodsPerYear: 1 }), 2309.75, 0.005, 'yearly');
    near(F.payment({ principal: 25000, annualRate: 7, years: 5 }), 495.03, 0.005, 'car loan');
    near(F.payment({ principal: 1000, annualRate: 12, years: 1 }), 88.85, 0.005, 'one year');
    ok(F.payment({ principal: 200000, annualRate: 6, years: 30, periodsPerYear: 26 }) < 600, 'biweekly is about half a monthly payment');
});

test('loan payment: a 0% loan is principal divided by the count', () => {
    eq(F.payment({ principal: 12000, annualRate: 0, years: 1 }), 1000);
    const s = F.amortization({ principal: 12000, annualRate: 0, years: 1 });
    eq(s.periods, 12);
    eq(s.totalInterest, 0);
    eq(s.rows[11].balance, 0);
    ok(s.rows.every((r) => r.interest === 0 && r.payment === 1000));
});

test('loan payment: a tiny rate stays accurate (no cancellation)', () => {
    const p = F.payment({ principal: 100000, annualRate: 1e-9, years: 30 });
    near(p, 100000 / 360, 1e-6);
    ok(Number.isFinite(p));
});

test('amortization: 30-year schedule ends at exactly 0 with 231,676.38 interest', () => {
    const s = F.amortization(MORTGAGE);
    eq(s.periods, 360);
    eq(s.rows.length, 360);
    eq(s.rows[359].balance, 0);
    near(s.totalInterest, 231676.38, 0.01);
    near(s.totalPaid, 431676.38, 0.01);
    near(s.rows[0].interest, 1000, 1e-9, 'first month interest is 0.5% of 200,000');
    near(s.rows[0].principal, 199.10, 0.005);
    near(sum(s.rows, 'principal'), 200000, 1e-6, 'principal parts add up to the loan');
    eq(s.periodsSaved, 0);
    near(s.interestSaved, 0, 1e-6);
});

test('amortization: balances fall every period and rows carry their year', () => {
    const s = F.amortization(MORTGAGE);
    for (let k = 1; k < s.rows.length; k++) ok(s.rows[k].balance < s.rows[k - 1].balance, `period ${k + 1}`);
    eq(s.rows[0].year, 1);
    eq(s.rows[11].year, 1);
    eq(s.rows[12].year, 2);
    eq(s.rows[359].year, 30);
    eq(s.rows[0].period, 1);
});

test('amortization: extra payments shorten the schedule and save interest', () => {
    const base = F.amortization(MORTGAGE);
    const fast = F.amortization({ ...MORTGAGE, extraPayment: 200 });
    eq(fast.periods, 252);
    eq(fast.periodsSaved, 108);
    ok(fast.totalInterest < base.totalInterest);
    near(fast.interestSaved, base.totalInterest - fast.totalInterest, 0.01);
    near(fast.rows[0].payment, 1399.10, 0.005, 'the payment includes the extra');
    eq(fast.rows[0].extra, 200);
    const last = fast.rows[fast.rows.length - 1];
    eq(last.balance, 0);
    ok(last.payment < fast.payment + 200, 'the final payment only clears what is left');
    near(sum(fast.rows, 'principal'), 200000, 1e-6);
});

test('amortization: an extra payment larger than the loan ends it in one period', () => {
    const s = F.amortization({ principal: 1000, annualRate: 12, years: 1, extraPayment: 5000 });
    eq(s.periods, 1);
    near(s.rows[0].payment, 1010, 1e-9);
    eq(s.rows[0].balance, 0);
});

test('amortization: yearly summary and CSV', () => {
    const s = F.amortization(MORTGAGE);
    const years = F.yearlySummary(s);
    eq(years.length, 30);
    eq(years[0].fromPeriod, 1);
    eq(years[0].toPeriod, 12);
    near(years[0].interest, 11933.19, 0.01);
    near(years[0].payment, 1199.10105 * 12, 0.01);
    eq(years[29].balance, 0);
    near(sum(years, 'interest'), s.totalInterest, 1e-6);
    const csv = F.amortizationCsv(s);
    const lines = csv.trim().split('\n');
    eq(lines.length, 361);
    eq(lines[0], 'Period,Year,Payment,Principal,Interest,Extra,Balance');
    eq(lines[1], '1,1,1199.10,199.10,1000.00,0.00,199800.90');
    ok(/,0\.00$/.test(lines[360]), 'last row balance 0.00');
    ok(csv.endsWith('\n'));
    assert.throws(() => F.yearlySummary(null), /amortization/);
    assertions++;
});

test('amortization: validation names the bad field', () => {
    throwsLike(() => F.payment({ principal: 0, annualRate: 6, years: 30 }), /loan amount must be more than 0/, 'principal');
    throwsLike(() => F.payment({ principal: '', annualRate: 6, years: 30 }), /Enter the loan amount/, 'principal');
    throwsLike(() => F.payment({ principal: 1000, annualRate: -1, years: 30 }), /interest rate can't be negative/, 'annualRate');
    throwsLike(() => F.payment({ principal: 1000, annualRate: 6, years: 0 }), /number of years must be more than 0/, 'years');
    throwsLike(() => F.payment({ principal: 1000, annualRate: 6, years: 101 }), /at most 100/, 'years');
    throwsLike(() => F.payment({ principal: 1000, annualRate: 6, years: 30, periodsPerYear: 2.5 }), /whole number/, 'periodsPerYear');
    throwsLike(() => F.payment({ principal: 1000, annualRate: 6, years: 0.01 }), /shorter than one payment/, 'years');
    throwsLike(() => F.payment({ principal: 2e12, annualRate: 6, years: 30 }), /at most 1,000,000,000,000/, 'principal');
    throwsLike(() => F.amortization({ ...MORTGAGE, extraPayment: -5 }), /extra payment can't be negative/, 'extraPayment');
    throwsLike(() => F.payment(null), /as an object/);
    const e = throwsLike(() => F.payment({ principal: 'lots', annualRate: 6, years: 30 }), /isn't a number/, 'principal');
    eq(e.code, 'invalid');
});

test('amortization: a 100-year daily schedule is capped and fast', () => {
    const t0 = Date.now();
    const s = F.amortization({ principal: 1e6, annualRate: 5, years: 100, periodsPerYear: 365 });
    ok(Date.now() - t0 < 1000, 'under a second');
    eq(s.periods, 36500);
    eq(s.rows[s.rows.length - 1].balance, 0);
    throwsLike(() => F.payment({ principal: 1000, annualRate: 6, years: 30, periodsPerYear: 366 }), /at most 365/, 'periodsPerYear');
});

/* ------------------------------------------------------------------ */
/* Savings                                                             */
/* ------------------------------------------------------------------ */

test('compound: 10,000 at 5% monthly for 10 years is 16,470.09', () => {
    const c = F.compound({ principal: 10000, annualRate: 5, years: 10, compoundsPerYear: 12 });
    near(c.futureValue, 16470.09, 0.005);
    eq(c.totalContributions, 0);
    near(c.totalInterest, 6470.09, 0.005);
    eq(c.rows.length, 10);
    eq(c.rows[9].year, 10);
    near(c.rows[9].balance, c.futureValue, 1e-9);
    near(c.rows[0].balance, 10511.62, 0.005);
    near(c.effectiveAnnualRate, 5.116189788, 1e-8);
});

test('compound: yearly and daily compounding', () => {
    near(F.compound({ principal: 1000, annualRate: 10, years: 2, compoundsPerYear: 1 }).futureValue, 1210, 1e-9);
    near(F.compound({ principal: 1000, annualRate: 5, years: 1, compoundsPerYear: 365 }).futureValue, 1051.27, 0.005);
    near(F.compound({ principal: 1000, annualRate: 0, years: 5 }).futureValue, 1000, 0);
});

test('compound: contributions at the start earn one more period than at the end', () => {
    const base = { principal: 0, annualRate: 6, years: 1, contribution: 100, contributionsPerYear: 12, compoundsPerYear: 12 };
    const end = F.compound({ ...base, timing: 'end' });
    const start = F.compound({ ...base, timing: 'start' });
    near(end.futureValue, 1233.56, 0.005);
    near(start.futureValue, 1239.72, 0.005);
    near(start.futureValue, end.futureValue * 1.005, 1e-9);
    eq(end.totalContributions, 1200);
    eq(start.totalContributions, 1200);
    near(end.totalInterest, 33.56, 0.005);
    near(F.compound(base).futureValue, end.futureValue, 0, "timing defaults to 'end'");
});

test('compound: starting amount plus contributions, mixed frequencies, totals add up', () => {
    const c = F.compound({ principal: 10000, annualRate: 5, years: 10, compoundsPerYear: 12, contribution: 100, contributionsPerYear: 12 });
    near(c.futureValue, 31998.32, 0.01);
    eq(c.totalContributions, 12000);
    eq(c.totalDeposited, 22000);
    near(c.principal + c.totalContributions + c.totalInterest, c.futureValue, 1e-6);
    near(c.rows[0].contributions, 1200, 1e-9);
    near(c.rows[9].totalContributions, 12000, 1e-9);
    const mixed = F.compound({ principal: 5000, annualRate: 4, years: 3, compoundsPerYear: 365, contribution: 500, contributionsPerYear: 4 });
    near(mixed.principal * Math.pow(1 + 0.04 / 365, 365 * 3) <= mixed.futureValue ? 1 : 0, 1, 0, 'principal grows at the daily rate');
    eq(mixed.totalContributions, 6000);
});

test('compound: partial years add a final row and validation is plain', () => {
    const c = F.compound({ principal: 10000, annualRate: 5, years: 2.5, contribution: 100, contributionsPerYear: 1 });
    eq(c.rows.map((r) => r.year), [1, 2, 2.5]);
    eq(c.rows[2].contributions, 0);
    near(F.compound({ principal: 1000, annualRate: 12, years: 0.5, compoundsPerYear: 12 }).futureValue, 1000 * Math.pow(1.01, 6), 1e-9);
    throwsLike(() => F.compound({ principal: 0, annualRate: 5, years: 10 }), /starting amount, a regular contribution/, 'principal');
    throwsLike(() => F.compound({ principal: 100, annualRate: 5, years: 10, timing: 'middle' }), /Timing must be/, 'timing');
    throwsLike(() => F.compound({ principal: 1e12, annualRate: 1000, years: 100, compoundsPerYear: 365 }), /too large to show/);
    throwsLike(() => F.compound({ principal: 100, annualRate: 5, years: 10, compoundsPerYear: 0 }), /at least 1/, 'compoundsPerYear');
});

/* ------------------------------------------------------------------ */
/* Simple interest, CAGR, everyday money                               */
/* ------------------------------------------------------------------ */

test('simple interest: positional and object forms', () => {
    eq(F.simpleInterest(1000, 5, 3), { principal: 1000, interest: 150, total: 1150 });
    eq(F.simpleInterest({ principal: 2500, annualRate: 4, years: 0.5 }).interest, 50);
    eq(F.simpleInterest(1000, 0, 10).interest, 0);
    throwsLike(() => F.simpleInterest(-1, 5, 3), /can't be negative/, 'principal');
});

test('cagr: 100 to 200 in 5 years is 14.87% a year', () => {
    near(F.cagr(100, 200, 5), 14.87, 0.005);
    near(F.cagr(100, 200, 5), (Math.pow(2, 0.2) - 1) * 100, 1e-9);
    eq(F.cagr(100, 100, 3), 0);
    near(F.cagr(200, 100, 1), -50, 1e-9);
    eq(F.cagr(100, 0, 4), -100);
    throwsLike(() => F.cagr(0, 100, 5), /starting value must be more than 0/, 'start');
    throwsLike(() => F.cagr(100, 200, 0), /number of years must be more than 0/, 'years');
});

test('discount, sales tax, and tip split', () => {
    eq(F.discount(80, 25), { saved: 20, final: 60 });
    eq(F.discount(19.99, 10), { saved: 1.999, final: 17.991 });
    eq(F.salesTax(80, 8.25), { tax: 6.6, total: 86.6 });
    eq(F.tipSplit(120, 18, 4), { tip: 21.6, total: 141.6, perPerson: 35.4, tipPerPerson: 5.4, people: 4 });
    eq(F.tipSplit({ bill: 50, tipPercent: 20 }).perPerson, 60, 'one person by default');
    throwsLike(() => F.discount(80, 120), /at most 100/, 'percent');
    throwsLike(() => F.tipSplit(100, 15, 0), /at least 1/, 'people');
    throwsLike(() => F.tipSplit(100, 15, 2.5), /whole number/, 'people');
});

/* ------------------------------------------------------------------ */
/* Percentages                                                         */
/* ------------------------------------------------------------------ */

test('percent helpers: of, what percent, change', () => {
    eq(F.percentOf(20, 150), 30);
    eq(F.percentOf(15, 80), 12);
    eq(F.percentOf(-5, 20), -1);
    eq(F.whatPercent(30, 150), 20);
    eq(F.whatPercent(1, 3), 33.3333333333333);
    eq(F.percentChange(80, 100), 25);
    eq(F.percentChange(100, 80), -20);
    eq(F.percentChange(-50, -25), 50, 'measured from |from|: -50 → -25 is up 50%');
    throwsLike(() => F.whatPercent(5, 0), /can't be 0/, 'whole');
    throwsLike(() => F.percentChange(0, 5), /from 0 isn't defined/, 'from');
});

test('percent helpers: apply and reverse', () => {
    eq(F.applyPercent(150, 20), 180);
    eq(F.applyPercent(150, -20), 120);
    eq(F.applyPercent(0.1, 200), 0.3, 'tidied: no 0.30000000000000004');
    eq(F.reversePercent(180, 20), 150);
    eq(F.reversePercent(120, -20), 150);
    eq(F.reversePercent(F.applyPercent(73.5, 12.5), 12.5), 73.5, 'round trip');
    throwsLike(() => F.reversePercent(0, -100), /100% decrease/, 'percent');
    throwsLike(() => F.percentOf('ten', 5), /isn't a number/, 'percent');
});

/* ------------------------------------------------------------------ */
/* Ratios                                                              */
/* ------------------------------------------------------------------ */

test('ratio: simplifies whole numbers and decimals exactly', () => {
    eq(F.ratio(1920, 1080), '16:9');
    eq(F.ratio(1280, 720), '16:9');
    eq(F.ratio(2560, 1080), '64:27');
    eq(F.ratio(1.5, 2), '3:4');
    eq(F.ratio(0.1, 0.3), '1:3');
    eq(F.ratio('1,920', '1,080'), '16:9');
    eq(F.ratio(7, 7), '1:1');
    eq(F.ratio(0, 5), '0:1');
    eq(F.ratio('1.50', '0.5'), '3:1');
    eq(F.ratio(1e-7, 1), '1:10000000');
    eq(F.ratio('123456789012345678901234567890', 3), '41152263004115226300411522630:1');
    throwsLike(() => F.ratio(0, 0), /Both sides are 0/);
    throwsLike(() => F.ratio(-4, 3), /can't be negative/, 'a');
    throwsLike(() => F.ratio('1234567890123456789012345678901', 1), /too many digits/, 'a');
});

test('scaleRatio: keeps the shape for a new width or height', () => {
    eq(F.scaleRatio(1920, 1080, { width: 1280 }), { width: 1280, height: 720 });
    eq(F.scaleRatio(1920, 1080, { height: 720 }), { width: 1280, height: 720 });
    eq(F.scaleRatio(1920, 1080, 3840), { width: 3840, height: 2160 });
    eq(F.scaleRatio(1920, 1080, null, 1440), { width: 2560, height: 1440 });
    eq(F.scaleRatio(4, 3, { width: 10 }), { width: 10, height: 7.5 });
    throwsLike(() => F.scaleRatio(1920, 1080, { width: 1, height: 1 }), /not both/);
    throwsLike(() => F.scaleRatio(1920, 1080, {}), /new width or the new height/);
    throwsLike(() => F.scaleRatio(0, 1080, { width: 5 }), /original width must be more than 0/, 'width');
});

/* ------------------------------------------------------------------ */
/* Parsing and helpers                                                 */
/* ------------------------------------------------------------------ */

test('parseNumber: reads what people type', () => {
    eq(F.parseNumber('1,200.50'), 1200.5);
    eq(F.parseNumber('$1,200'), 1200);
    eq(F.parseNumber('-$5'), -5);
    eq(F.parseNumber('$-5'), -5);
    eq(F.parseNumber('€ 99.95'), 99.95);
    eq(F.parseNumber('USD 100'), 100);
    eq(F.parseNumber('7.5%'), 7.5);
    eq(F.parseNumber('1_000_000'), 1000000);
    eq(F.parseNumber('−5'), -5, 'Unicode minus');
    eq(F.parseNumber(' +.5 '), 0.5);
    eq(F.parseNumber('2.5e3'), 2500);
    eq(F.parseNumber(42), 42);
    eq(F.parseNumber('-0'), 0);
});

test('parseNumber: plain errors with codes', () => {
    eq(throwsLike(() => F.parseNumber('', 'the price'), /Enter the price/).code, 'missing');
    eq(throwsLike(() => F.parseNumber(null), /Enter a number/).code, 'missing');
    eq(throwsLike(() => F.parseNumber('1,5'), /decimal comma/).code, 'invalid');
    throwsLike(() => F.parseNumber('1,23,4'), /commas in the wrong places/);
    throwsLike(() => F.parseNumber('12abc'), /isn't a number/);
    throwsLike(() => F.parseNumber(NaN), /regular number/);
    throwsLike(() => F.parseNumber('9'.repeat(80)), /too long/);
    throwsLike(() => F.parseNumber('1e999'), /too large/);
    throwsLike(() => F.parseNumber({}), /as a number/);
});

test('durationText: payoff times in years and months', () => {
    eq(F.durationText(360, 12), '30 years');
    eq(F.durationText(279, 12), '23 years 3 months');
    eq(F.durationText(13, 12), '1 year 1 month');
    eq(F.durationText(780, 26), '30 years');
    eq(F.durationText(3, 52), '3 weeks');
    eq(F.durationText(10, 365), '10 days');
    eq(F.durationText(0, 12), '0 months');
    eq(F.durationText(8, 4), '2 years');
    eq(F.durationText(1, 26), '2 weeks');
    eq(F.durationText(1, 24), '2 weeks');
});

test('library shape: frozen, Node-exportable, no DOM use', () => {
    ok(Object.isFrozen(F));
    for (const fn of ['payment', 'amortization', 'compound', 'simpleInterest', 'cagr', 'percentOf', 'whatPercent', 'percentChange',
        'applyPercent', 'reversePercent', 'ratio', 'scaleRatio', 'parseNumber', 'yearlySummary', 'amortizationCsv', 'tipSplit']) {
        eq(typeof F[fn], 'function', fn);
    }
    eq(F.tidy(0.1 + 0.2), 0.3);
    eq(Object.is(F.tidy(-0), 0), true);
    eq(F.LIMITS.periods, 36500);
});

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
    console.log(`${r.ok ? '  pass' : '  FAIL'}  ${r.name}`);
    if (!r.ok) console.log(`        ${String(r.err && r.err.message).split('\n').join('\n        ')}`);
});
if (failed.length) {
    console.log(`\n${failed.length} of ${results.length} tests failed (${assertions} assertions ran).`);
    process.exit(1);
}
console.log(`\nAll ${results.length} tests passed (${assertions} assertions).`);
