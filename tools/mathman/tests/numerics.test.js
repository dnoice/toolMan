/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: NumericsTests (mathMan Edition - v1.0)
 *     - File Name: numerics.test.js
 *     - Relative Path: tools/mathman/tests/numerics.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for mathMan's numerics library (js/numerics.js), the code
 *     behind the Statistics, Solver, and Number Theory panes. They pin down
 *     the textbook answers (mean, standard deviations, quartiles, primes,
 *     factors, roots, linear systems) and the safety caps, so a change to
 *     the library cannot quietly give a visitor a wrong number or a frozen
 *     tab. Run them after any edit to numerics.js.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus the same small runner as
 *       engine.test.js
 *     - List parsing: separators, quoted CSV cells, skipped entries with
 *       samples, column picking, and the 100,000-value cap
 *     - Statistics: the [2, 4, 4, 4, 5, 5, 7, 9] reference set (mean 5,
 *       population SD 2, sample SD 2.138), median-of-halves quartiles,
 *       Tukey outliers, modes, empty and one-value lists
 *     - Histograms: tidy auto bins, exact bin counts, every value counted
 *     - Primes: 2^61 − 1, Carmichael 561, strong pseudoprimes that fool
 *       weaker tests, next / previous prime, the 300-digit cap
 *     - Factorization: 600851475143, Pollard-rho semiprimes, perfect
 *       powers, signs, and the time budget on a hard number
 *     - GCD / LCM, base conversion (prefixes, signs, digit errors)
 *     - findRoots (√2, touching roots, poles, jumps, zero stretches),
 *       polyRoots (±i, multiple roots, degree 8), solveLinear (unique,
 *       none, infinite, exact fractions)
 *     - Prints a pass/fail line per test and an assertion total; exits 1 on
 *       any failure so it can gate a commit
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/mathman/tests/numerics.test.js
 *     A clean run ends with "All N tests passed (M assertions)".
 *
 * ✒ Examples:
 *     node tools/mathman/tests/numerics.test.js           → full run
 *     node tools/mathman/tests/numerics.test.js prime     → only tests whose
 *                                                            name contains "prime"
 *     eq(N.convertBase('ff', 16, 2), '11111111')
 *     near(N.stats(SET).stdev.sample, 2.13808993529, 1e-9)
 *     throwsLike(() => N.factorize(0), /no prime factorization/)
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+ and ../js/numerics.js
 *     - Compatible platforms: any OS with Node
 *     - Limitations: timing tests use generous bounds so slow CI machines
 *       still pass; the panes around the library are covered by the e2e
 *       suite
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const N = require(path.join(__dirname, '..', 'js', 'numerics.js'));

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
function throwsLike(fn, re, msg) {
    assertions++;
    assert.throws(fn, (err) => re.test(err.message), msg);
}
function fast(fn, ms, msg) {
    const start = Date.now();
    const out = fn();
    const took = Date.now() - start;
    assertions++;
    assert.ok(took < ms, `${msg || 'call'} took ${took} ms (limit ${ms} ms)`);
    return out;
}

const SET = [2, 4, 4, 4, 5, 5, 7, 9];
const primes = (f) => f.factors.map((x) => (x.exponent > 1 ? `${x.prime}^${x.exponent}` : x.prime)).join(' × ');
const residual = (cs, z) => {
    let re = 0;
    let im = 0;
    for (const c of cs) {
        const r = re * z.re - im * z.im + c;
        im = re * z.im + im * z.re;
        re = r;
    }
    return Math.hypot(re, im);
};

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

test('parseNumberList: commas, spaces, tabs, semicolons and new lines', () => {
    const r = N.parseNumberList('4, 8\n15\t16; 23 | 42');
    eq(r.values, [4, 8, 15, 16, 23, 42]);
    eq(r.skipped, 0);
    eq(r.truncated, false);
});

test('parseNumberList: skipped entries are counted with samples', () => {
    const r = N.parseNumberList('Price\n3.5\nabc\n-2\n1e3\n.5\nn/a');
    eq(r.values, [3.5, -2, 1000, 0.5]);
    eq(r.skipped, 3);
    eq(r.skippedSamples, ['Price', 'abc', 'n/a']);
});

test('parseNumberList: quoted CSV cells, currency, percent, unicode minus', () => {
    const r = N.parseNumberList('"1,234.5", $12, 45%, −3, 1_000');
    eq(r.values, [1234.5, 12, 45, -3, 1000]);
    eq(N.parseNumberList('').values, []);
    eq(N.parseNumberList(null).values, []);
});

test('parseNumberList: columns are detected and one can be picked', () => {
    const csv = 'Name,Price,Qty\nApple,1.5,3\nPear,2,4\nKiwi,"1,200",5';
    const layout = N.detectColumns(csv);
    eq(layout.delimiter, ',');
    eq(layout.headers, ['Name', 'Price', 'Qty']);
    eq(layout.numeric, [false, true, true]);
    eq(N.parseNumberList(csv, { column: 2 }).values, [1.5, 2, 1200]);
    eq(N.parseNumberList(csv, { column: 3 }).values, [3, 4, 5]);
    eq(N.detectColumns('1, 2, 3'), null, 'one line is a list, not a table');
    eq(N.detectColumns('a\tb\n1\t2\n3\t4').delimiter, '\t');
    throwsLike(() => N.parseNumberList(csv, { column: 0 }), /column from 1 to 50/);
});

test('parseNumberList: the 100,000-value cap is reported, not exceeded', () => {
    const text = Array.from({ length: 100050 }, (_, i) => i).join('\n');
    const r = fast(() => N.parseNumberList(text), 2000, 'parsing 100k values');
    eq(r.values.length, 100000);
    eq(r.truncated, true);
    eq(r.limit, 100000);
    const exact = N.parseNumberList(Array.from({ length: 100000 }, () => 1).join(','));
    eq(exact.truncated, false, 'exactly at the cap is not truncated');
    eq(N.parseNumberList('1 2 3 4', { max: 2 }).values, [1, 2]);
});

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

test('stats: the reference set [2,4,4,4,5,5,7,9]', () => {
    const s = N.stats(SET);
    eq(s.count, 8);
    eq(s.sum, 40);
    eq(s.mean, 5);
    eq(s.median, 4.5);
    eq(s.stdev.population, 2);
    near(s.stdev.sample, 2.13808993529, 1e-9, 'sample stdev');
    eq(s.variance.population, 4);
    near(s.variance.sample, 32 / 7, 1e-12, 'sample variance');
    eq(s.min, 2);
    eq(s.max, 9);
    eq(s.range, 7);
    eq(s.modes, [4]);
    eq(s.modeFrequency, 3);
});

test('stats: quartiles by the median of halves, Tukey outliers', () => {
    const s = N.stats(SET);
    eq([s.q1, s.q3, s.iqr], [4, 6, 2]);
    eq(s.outliers, []);
    const odd = N.stats([1, 2, 3, 4, 5, 6, 7]);
    eq([odd.q1, odd.median, odd.q3], [2, 4, 6], 'odd count leaves the median out of both halves');
    const out = N.stats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    eq(out.outliers, [100]);
    eq(out.fences, { low: -4.5, high: 15.5 });
    eq(N.stats([-50, 1, 2, 3, 4, 5, 6]).outliers, [-50]);
});

test('stats: modes, ties, and lists with no repeats', () => {
    eq(N.stats([1, 1, 2, 2, 3]).modes, [1, 2]);
    eq(N.stats([1, 2, 3]).modes, [], 'no value repeats, so no mode');
    eq(N.stats([5, 5, 5]).modes, [5]);
});

test('stats: empty, single value, and non-finite entries', () => {
    const empty = N.stats([]);
    eq(empty.count, 0);
    eq(empty.mean, null);
    eq(empty.stdev, { sample: null, population: null });
    const one = N.stats([7]);
    eq([one.mean, one.median, one.q1, one.q3, one.range], [7, 7, 7, 7, 0]);
    eq(one.stdev.sample, null, 'sample SD needs two values');
    eq(one.stdev.population, 0);
    eq(N.stats([1, NaN, 3, Infinity, 'x']).count, 2);
    throwsLike(() => N.stats('1,2,3'), /need a list of numbers/);
});

test('stats: compensated sums stay accurate', () => {
    const s = N.stats([0.1, 0.2, 0.3]);
    near(s.sum, 0.6, 1e-15, 'sum');
    const big = N.stats([1e16, 1, -1e16]);
    eq(big.sum, 1, 'Neumaier summation keeps the 1');
    const huge = N.stats([1e308, 1e308]);
    eq(huge.mean, 1e308, 'mean survives an overflowing sum');
    eq(N.stats([-0, 0]).min, 0, 'no negative zero');
});

test('stats: 100,000 values in well under a second', () => {
    const xs = Array.from({ length: 100000 }, (_, i) => (i * 7919) % 1000);
    const s = fast(() => N.stats(xs), 1000, 'stats of 100k values');
    eq(s.count, 100000);
    eq(s.min, 0);
    eq(s.max, 999);
});

test('histogram: tidy auto bins count every value', () => {
    const h = N.histogram(SET);
    eq(h, [
        { from: 2, to: 4, count: 1 },
        { from: 4, to: 6, count: 5 },
        { from: 6, to: 8, count: 1 },
        { from: 8, to: 10, count: 1 }
    ]);
    const xs = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 37.3);
    const auto = N.histogram(xs);
    eq(auto.reduce((s, b) => s + b.count, 0), 500, 'every value lands in a bin');
    ok(auto.length <= 30);
});

test('histogram: an exact number of equal-width bins', () => {
    const h = N.histogram([1, 2, 2, 3, 9], 3);
    eq(h.length, 3);
    eq(h.map((b) => b.count), [4, 0, 1]);
    eq(h[0].from, 1);
    eq(h[2].to, 9, 'the last bin closes at the maximum');
    eq(N.histogram([5, 5, 5]), [{ from: 5, to: 5, count: 3 }]);
    eq(N.histogram([]), []);
    throwsLike(() => N.histogram([1, 2], 0), /from 1 to 100/);
    throwsLike(() => N.histogram([1, 2], 101), /from 1 to 100/);
});

/* ------------------------------------------------------------------ */
/* Primes                                                              */
/* ------------------------------------------------------------------ */

test('isPrime: small numbers and edge cases', () => {
    const small = [];
    for (let n = -5; n <= 60; n++) if (N.isPrime(n)) small.push(n);
    eq(small, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59]);
    eq(N.isPrime(997), true);
    eq(N.isPrime('1,000,003'), true, 'grouping commas are allowed');
    eq(N.isPrime(1000001), false);
});

test('isPrime: 2^61 − 1 is prime, Carmichael 561 is not', () => {
    eq(N.isPrime(2n ** 61n - 1n), true);
    eq(N.isPrime('2305843009213693951'), true);
    eq(N.isPrime(561), false);
    eq(N.isPrime(41041), false, 'another Carmichael number');
    eq(N.primality(2n ** 61n - 1n), { prime: true, certain: true });
});

test('isPrime: strong pseudoprimes to several bases are caught', () => {
    eq(N.isPrime(3215031751), false, 'strong pseudoprime to bases 2, 3, 5, 7');
    eq(N.isPrime('3825123056546413051'), false, 'strong pseudoprime to bases 2 … 23');
    eq(N.isPrime('318665857834031151167461'), false, 'strong pseudoprime to bases 2 … 37');
    eq(N.isPrime('3317044064679887385961981'), false, 'strong pseudoprime to bases 2 … 41');
});

test('primality: big primes above the deterministic limit are "probable"', () => {
    const m127 = 2n ** 127n - 1n;
    eq(N.primality(m127), { prime: true, certain: false });
    eq(N.isPrime(m127 * 3n), false);
    eq(N.primality(2n ** 128n + 1n).prime, false);
});

test('isPrime: invalid input explains itself', () => {
    throwsLike(() => N.isPrime(2.5), /isn't a whole number/);
    throwsLike(() => N.isPrime('abc'), /isn't a whole number/);
    throwsLike(() => N.isPrime(''), /Type a whole number/);
    throwsLike(() => N.isPrime(2 ** 60), /too large to be exact/);
    throwsLike(() => N.isPrime('1'.repeat(301)), /300 digits/);
});

test('nextPrime / prevPrime', () => {
    eq(N.nextPrime(100), '101');
    eq(N.prevPrime(100), '97');
    eq(N.nextPrime(-5), '2');
    eq(N.nextPrime(2), '3');
    eq(N.prevPrime(3), '2');
    eq(N.prevPrime(2), null);
    eq(N.nextPrime('1000000000000'), '1000000000039');
    const big = fast(() => N.prevPrime(`1${'0'.repeat(99)}`), 1500, 'previous prime below 10^99');
    eq(big.length, 99);
    eq(N.isPrime(big), true);
});

/* ------------------------------------------------------------------ */
/* Factorization, GCD, LCM                                             */
/* ------------------------------------------------------------------ */

test('factorize: 600851475143 = 71 × 839 × 1471 × 6857', () => {
    const f = N.factorize(600851475143);
    eq(primes(f), '71 × 839 × 1471 × 6857');
    eq(f.complete, true);
    eq(f.remainder, null);
    eq(f.sign, 1);
});

test('factorize: exponents, signs, and 1', () => {
    eq(primes(N.factorize(120)), '2^3 × 3 × 5');
    const neg = N.factorize(-360);
    eq(neg.sign, -1);
    eq(primes(neg), '2^3 × 3^2 × 5');
    eq(N.factorize(1).factors, []);
    eq(primes(N.factorize(2n ** 64n)), '2^64');
    throwsLike(() => N.factorize(0), /no prime factorization/);
});

test('factorize: Pollard rho splits large semiprimes and perfect powers', () => {
    eq(primes(N.factorize(1000000007n * 998244353n)), '998244353 × 1000000007');
    eq(primes(N.factorize(2n ** 64n + 1n)), '274177 × 67280421310721');
    eq(primes(N.factorize(1000000007n ** 3n)), '1000000007^3');
    eq(primes(N.factorize('2305843009213693951')), '2305843009213693951');
});

test('factorize: the time budget is honoured on a hard number', () => {
    const hard = (2n ** 61n - 1n) * (2n ** 89n - 1n) * ((2n ** 127n - 1n) ** 1n) + 2n;
    const f = fast(() => N.factorize(1000000000000000003n * 1000000000000000009n, { timeMs: 100 }), 1000, 'budgeted factorization');
    eq(f.complete, false);
    eq(f.remainder, (1000000000000000003n * 1000000000000000009n).toString());
    const g = fast(() => N.factorize(hard, { timeMs: 50 }), 1000, 'another budgeted factorization');
    ok(typeof g.complete === 'boolean');
});

test('gcd and lcm of lists', () => {
    eq(N.gcd([12, 18, 24]), '6');
    eq(N.lcm([12, 18, 24]), '72');
    eq(N.gcd('48, 180 -24'), '12');
    eq(N.lcm('4 6 10'), '60');
    eq(N.gcd([0, 0]), '0');
    eq(N.lcm([0, 5]), '0');
    eq(N.gcd([7]), '7');
    eq(N.lcm(['123456789012345678901234567891', 2n]), '246913578024691357802469135782');
    eq(N.lcm(['123456789012345678901234567890', 7n]), '123456789012345678901234567890', 'already a multiple of 7');
    throwsLike(() => N.gcd([]), /at least one whole number/);
    throwsLike(() => N.gcd([1.5, 3]), /isn't a whole number/);
    throwsLike(() => N.gcd(new Array(1001).fill(1)), /at most 1,000/);
});

/* ------------------------------------------------------------------ */
/* Bases                                                               */
/* ------------------------------------------------------------------ */

test('convertBase: ff → 11111111 and friends', () => {
    eq(N.convertBase('ff', 16, 2), '11111111');
    eq(N.convertBase('0xFF', 16, 10), '255');
    eq(N.convertBase('-255', 10, 16), '-FF');
    eq(N.convertBase('0b1010', 2, 8), '12');
    eq(N.convertBase('zz', 36, 10), '1295');
    eq(N.convertBase('1_0000 0000', 2, 10), '256');
    eq(N.convertBase('0', 10, 36), '0');
    const big = `9${'0'.repeat(200)}`;
    eq(N.convertBase(N.convertBase(big, 10, 7), 7, 10), big, 'round trip through base 7');
    eq(N.formatInBase(255n, 16), 'FF');
    eq(N.parseInBase('777', 8), 511n);
});

test('convertBase: invalid digits and bases explain themselves', () => {
    throwsLike(() => N.convertBase('102', 2, 10), /'2' isn't a binary digit — binary uses only 0 and 1/);
    throwsLike(() => N.convertBase('G1', 16, 10), /'G' isn't a hexadecimal digit .* A to F/);
    throwsLike(() => N.convertBase('19', 8, 10), /octal uses only the digits 0 to 7/);
    throwsLike(() => N.convertBase('1.5', 10, 2), /Only whole numbers/);
    throwsLike(() => N.convertBase('', 10, 2), /Type a number/);
    throwsLike(() => N.convertBase('1', 1, 2), /from 2 to 36/);
    throwsLike(() => N.convertBase('1', 10, 37), /from 2 to 36/);
    throwsLike(() => N.convertBase('1'.repeat(5000), 2, 10), /4,096 characters/);
});

/* ------------------------------------------------------------------ */
/* Roots                                                               */
/* ------------------------------------------------------------------ */

test('findRoots: x^2 − 2 on [−3, 3] gives ±1.41421356', () => {
    const r = N.findRoots((x) => x * x - 2, { min: -3, max: 3 });
    eq(r.length, 2);
    near(r[0], -1.41421356, 1e-8);
    near(r[1], 1.41421356, 1e-8);
});

test('findRoots: many roots, touching roots, exact snaps', () => {
    const sin = N.findRoots(Math.sin, { min: -10, max: 10 });
    eq(sin.length, 7);
    near(sin[4], Math.PI, 1e-12);
    eq(N.findRoots((x) => (x - 1) ** 2, { min: -3, max: 3 }), [1], 'a touching root without a sign change');
    eq(N.findRoots((x) => x ** 3, { min: -3, max: 3 }), [0]);
    near(N.findRoots((x) => Math.cos(x) - x, { min: -10, max: 10 })[0], 0.7390851332, 1e-9);
});

test('findRoots: poles, jumps, domain gaps, and zero stretches', () => {
    eq(N.findRoots(Math.tan, { min: -2, max: 2 }), [0], 'the poles at ±π/2 are not roots');
    eq(N.findRoots((x) => 1 / x, { min: -1, max: 1 }), []);
    eq(N.findRoots((x) => Math.floor(x) - 0.5, { min: -3, max: 3 }), [], 'a jump is not a root');
    const sq = N.findRootsDetailed((x) => Math.sqrt(x) - 1, { min: -3, max: 3 });
    eq(sq.roots, [1]);
    ok(sq.undefinedSamples > 900, 'samples outside the domain are counted');
    const flat = N.findRootsDetailed((x) => Math.max(0, x), { min: -3, max: 3 });
    eq(flat.intervals, [{ from: -3, to: 0 }]);
    eq(flat.roots, []);
    eq(N.findRoots((x) => x * x + 1, { min: -3, max: 3 }), []);
    eq(N.findRoots(() => { throw new Error('boom'); }, { min: 0, max: 1 }), [], 'a throwing function is treated as undefined');
});

test('findRoots: validation and the time budget', () => {
    throwsLike(() => N.findRoots((x) => x, { min: 3, max: 1 }), /minimum must be less/);
    throwsLike(() => N.findRoots((x) => x, { min: 'a', max: 1 }), /finite minimum/);
    throwsLike(() => N.findRoots('x', { min: 0, max: 1 }), /function of x/);
    throwsLike(() => N.findRoots((x) => x, { min: -1e308, max: 1e308 }), /too wide/);
    const slow = (x) => { const end = Date.now() + 2; while (Date.now() < end) { /* busy */ } return x - 0.5; };
    const r = fast(() => N.findRootsDetailed(slow, { min: 0, max: 1, timeMs: 150 }), 1500, 'budgeted root search');
    eq(r.timedOut, true);
    ok(r.evaluated < r.samples);
});

test('polyRoots: x^2 + 1 gives ±i, x^2 − 3x + 2 gives 1 and 2', () => {
    eq(N.polyRoots([1, 0, 1]), [{ re: 0, im: 1 }, { re: 0, im: -1 }]);
    eq(N.polyRoots([1, -3, 2]), [{ re: 1, im: 0 }, { re: 2, im: 0 }]);
    eq(N.polyRoots([2, 3]), [{ re: -1.5, im: 0 }]);
    eq(N.polyRoots([0, 0, 1, -4]), [{ re: 4, im: 0 }], 'leading zeros are dropped');
    eq(N.polyRoots([5]), [], 'a non-zero constant has no roots');
    throwsLike(() => N.polyRoots([0, 0]), /every x is a root/);
    throwsLike(() => N.polyRoots(new Array(10).fill(1)), /degree 8/);
    throwsLike(() => N.polyRoots([1, NaN]), /Coefficient 2/);
    throwsLike(() => N.polyRoots([1, '']), /Coefficient 2 is empty/);
});

test('polyRoots: cubics to degree 8, multiple roots, conjugate pairs', () => {
    eq(N.polyRoots([1, -6, 11, -6]).map((z) => z.re), [1, 2, 3]);
    eq(N.polyRoots([1, -3, 3, -1]), [{ re: 1, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 0 }], 'triple root');
    eq(N.polyRoots([1, -8, 28, -56, 70, -56, 28, -8, 1]).every((z) => z.re === 1 && z.im === 0), true, '(x − 1)^8');
    const unity = N.polyRoots([1, 0, 0, -1]);
    eq(unity[0], { re: 1, im: 0 });
    near(unity[1].re, -0.5, 1e-15);
    near(unity[1].im, Math.sqrt(3) / 2, 1e-15);
    eq(unity[2].im, -unity[1].im, 'exact conjugate');
    const cs = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const r8 = N.polyRoots(cs);
    eq(r8.length, 8);
    for (const z of r8) ok(residual(cs, z) < 1e-9, `residual at ${z.re}, ${z.im}`);
    eq(N.polyRoots([1, 0, 0]), [{ re: 0, im: 0 }, { re: 0, im: 0 }], 'x^2 has a double root at 0');
});

/* ------------------------------------------------------------------ */
/* Linear systems                                                      */
/* ------------------------------------------------------------------ */

test('solveLinear: a 3×3 system with one solution', () => {
    const r = N.solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
    eq(r.status, 'unique');
    eq(r.solution, [2, 3, -1]);
    eq(r.exact, ['2', '3', '-1']);
    eq(r.rank, 3);
});

test('solveLinear: singular 3×3 systems — no solution or infinitely many', () => {
    const A = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    const none = N.solveLinear(A, [1, 2, 4]);
    eq(none.status, 'none');
    eq(none.solution, null);
    eq(none.rank, 2);
    const many = N.solveLinear(A, [1, 2, 3]);
    eq(many.status, 'infinite');
    eq(many.solution, null);
    eq(N.solveLinear([[0, 0], [0, 0]], [0, 0]).rank, 0);
});

test('solveLinear: exact fractions and decimal coefficients', () => {
    const third = N.solveLinear([[3, 1], [1, 2]], ['1', '1/3']);
    eq(third.exact, ['1/3', '0']);
    near(third.solution[0], 1 / 3, 1e-16);
    eq(N.solveLinear([[0.1, 0.2], [0.3, 0.4]], [0.5, 0.6]).exact, ['-4', '9/2'], 'no rounding drift');
    const five = N.solveLinear(
        [[1, 1, 1, 1, 1], [1, 2, 3, 4, 5], [1, 4, 9, 16, 25], [1, 8, 27, 64, 125], [1, 16, 81, 256, 625]],
        [5, 15, 55, 225, 979]
    );
    eq(five.status, 'unique');
    eq(five.exact, ['1', '1', '1', '1', '1']);
});

test('solveLinear: validation', () => {
    throwsLike(() => N.solveLinear([[1]], [1]), /2 to 5 equations/);
    throwsLike(() => N.solveLinear([[1, 2], [3]], [1, 2]), /Equation 2 needs exactly 2/);
    throwsLike(() => N.solveLinear([[1, 2], [3, 4]], [1]), /give 2 constants/);
    throwsLike(() => N.solveLinear([[1, 'x'], [3, 4]], [1, 2]), /Equation 1, coefficient 2 isn't a number/);
    throwsLike(() => N.solveLinear([[1, ''], [3, 4]], [1, 2]), /use 0 for a missing term/);
    throwsLike(() => N.solveLinear([[1, 2], [3, 4]], [1, '1/0']), /divides by zero/);
});

/* ------------------------------------------------------------------ */
/* Module shape                                                        */
/* ------------------------------------------------------------------ */

test('module: frozen API with every contract function', () => {
    ok(Object.isFrozen(N));
    for (const name of ['parseNumberList', 'stats', 'histogram', 'isPrime', 'factorize', 'gcd', 'lcm',
        'convertBase', 'findRoots', 'polyRoots', 'solveLinear']) {
        eq(typeof N[name], 'function', name);
    }
    eq(N.limits.values, 100000);
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
