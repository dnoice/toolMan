/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: Numerics (mathMan Edition - v1.0)
 *     - File Name: numerics.js
 *     - Relative Path: tools/mathman/js/numerics.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The number-crunching behind mathMan's Statistics, Solver, and Number
 *     Theory panes: list parsing, descriptive statistics, histograms, prime
 *     tests, factorization, GCD / LCM, base conversion, root finding, and
 *     small linear systems. It is pure (no DOM), so the panes and the Node
 *     tests share one implementation, and every routine has size caps and
 *     time budgets so no input can lock up the page.
 *
 * ✒ Key Features:
 *     - parseNumberList: numbers separated by commas, spaces, tabs,
 *       semicolons, pipes, or new lines; quoted CSV cells ("1,234.5"),
 *       currency signs and trailing % are read; anything else is counted as
 *       skipped, with up to three samples; capped at 100,000 values
 *     - detectColumns + the column option: pick one column out of a pasted
 *       CSV or spreadsheet block (tab, semicolon, or comma separated)
 *     - stats: count, compensated sum, mean, median, modes, min, max, range,
 *       sample and population variance and standard deviation, Q1, Q3, IQR,
 *       and Tukey outliers (beyond 1.5 × IQR from the quartiles)
 *     - Quartiles use the median-of-halves method: the sorted values are
 *       split into a lower and an upper half (the middle value is left out
 *       of both halves when the count is odd), and Q1 / Q3 are the medians
 *       of those halves — the method most school courses and TI
 *       calculators teach
 *     - histogram: tidy auto bins (Sturges' count, with the width rounded
 *       to the nearest 1-2-2.5-5 step) or an exact number of equal-width
 *       bins
 *     - isPrime / primality: trial division, then deterministic Miller-Rabin
 *       (the first 13 prime bases) for every n below 3.317 × 10^24, and a
 *       24-base strong probable-prime test above that; BigInt throughout
 *     - nextPrime / prevPrime with a one-second search budget
 *     - factorize: trial division by the primes below 10,000, perfect-power
 *       detection, and Pollard's rho (Brent's variant) under a time budget;
 *       reports the unfactored remainder when the budget runs out
 *     - gcd / lcm of up to 1,000 integers as BigInt strings
 *     - convertBase between any bases 2–36 with signs, 0x / 0b / 0o
 *       prefixes, _ and space separators, and digit-by-digit validation
 *     - findRoots: sign changes refined with Brent's method, pole
 *       rejection, touching roots found from local minima of |f|, dedupe,
 *       and a time budget; findRootsDetailed adds diagnostics
 *     - polyRoots: closed forms for degree 1–2, Durand-Kerner for 3–8 with
 *       Newton polishing, multiple-root clustering, and conjugate pairing
 *     - solveLinear: exact rational Gauss-Jordan elimination with partial
 *       pivoting for 2–5 unknowns — unique, none, or infinitely many, never
 *       fooled by rounding
 *
 * ✒ Usage Instructions:
 *     Browser: load after js/engine.js and before js/state.js; everything is
 *     on window.Numerics. Node: const Numerics = require('./numerics.js').
 *     Functions that take whole numbers accept a safe-integer Number, a
 *     BigInt, or a decimal string (digits with optional _ , or spaces).
 *     Invalid input throws an Error whose message is a plain sentence that
 *     can be shown to the visitor as is. Polynomial coefficients are listed
 *     highest power first. Results never contain -0.
 *
 * ✒ Examples:
 *     Numerics.parseNumberList('4, 8\n15 abc 16') → { values: [4, 8, 15, 16], skipped: 1, … }
 *     Numerics.stats([2, 4, 4, 4, 5, 5, 7, 9]).stdev → { sample: 2.138…, population: 2 }
 *     Numerics.histogram([1, 2, 2, 3, 9], 3)       → [{ from: 1, to: 3.67, count: 4 }, …]
 *     Numerics.isPrime('2305843009213693951')      → true (2^61 − 1)
 *     Numerics.factorize(600851475143).factors     → [{ prime: '71', exponent: 1 }, … '6857']
 *     Numerics.gcd([12, 18, 24])                   → '6'
 *     Numerics.lcm('4 6 10')                       → '60'
 *     Numerics.convertBase('ff', 16, 2)            → '11111111'
 *     Numerics.findRoots((x) => x * x - 2, { min: -3, max: 3 }) → [-1.414…, 1.414…]
 *     Numerics.polyRoots([1, 0, 1])                → [{ re: 0, im: 1 }, { re: 0, im: -1 }]
 *     Numerics.solveLinear([[1, 1], [1, -1]], [3, 1]) → { status: 'unique', solution: [2, 1], … }
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM; safe in Node 16+ and the browser)
 *     - Compatible platforms: all evergreen browsers with BigInt
 *     - Limitations: prime tests and factorization take up to 300 digits;
 *       above 3.317 × 10^24 a "prime" verdict is a strong probable prime;
 *       Pollard's rho finds factors up to about 20 digits within its budget;
 *       findRoots only sees roots that the sample grid can bracket or touch;
 *       polyRoots works in doubles, so clustered roots of high degree carry
 *       a few digits of error
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const Numerics = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = Numerics;
    if (root) root.Numerics = Numerics;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /* ================================================================== */
    /* Limits and small helpers                                            */
    /* ================================================================== */

    const LIMITS = Object.freeze({
        textChars: 2000000,     // characters read by parseNumberList
        values: 100000,         // numbers kept by parseNumberList
        statsValues: 1000000,   // numbers accepted by stats / histogram
        bins: 100,              // most histogram bins
        digits: 300,            // digits for prime tests and factorization
        listItems: 1000,        // numbers in one gcd / lcm call
        lcmBits: 20000,         // largest LCM before it is refused
        baseChars: 4096,        // characters in one base-conversion input
        primeSearchMs: 1000,    // nextPrime / prevPrime budget
        factorMs: 200,          // default factorization budget
        factorMsMax: 5000,      // largest factorization budget allowed
        samplesMin: 10,
        samplesMax: 20000,
        rootsMs: 2000,          // default findRoots budget
        roots: 200,             // most roots returned
        degree: 8,              // highest polynomial degree
        unknownsMin: 2,
        unknownsMax: 5
    });

    const MR_LIMIT = 3317044064679887385961981n;
    const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
    const MR_EXTRA = [43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n];
    const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
    const BASE_NAMES = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hexadecimal' };

    const now = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now());
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const noNegZero = (x) => (x === 0 ? 0 : x);
    const fmtInt = (n) => Number(n).toLocaleString('en-US');

    /** Throw a plain-language error the panes can show as is. */
    function fail(message) {
        const err = new Error(message);
        err.isNumerics = true;
        throw err;
    }

    /** A short, quoted echo of what the visitor typed, for messages. */
    function echo(s) {
        const t = String(s);
        return t.length > 24 ? `${t.slice(0, 23)}…` : t;
    }

    /** Primes below `limit` (sieve of Eratosthenes). */
    function sieve(limit) {
        const mark = new Uint8Array(limit + 1);
        const out = [];
        for (let i = 2; i <= limit; i++) {
            if (mark[i]) continue;
            out.push(i);
            for (let j = i * i; j <= limit; j += i) mark[j] = 1;
        }
        return out;
    }

    const SMALL_PRIMES = sieve(10000);
    const SMALL_PRIMES_BIG = SMALL_PRIMES.map((p) => BigInt(p));
    const TRIAL_BIG = SMALL_PRIMES_BIG.slice(0, 168); // primes below 1,000

    /** Neumaier-compensated sum (optionally of f(v)). */
    function fsum(values, f) {
        let s = 0;
        let c = 0;
        for (let i = 0; i < values.length; i++) {
            const x = f ? f(values[i]) : values[i];
            const t = s + x;
            if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x;
            else c += (x - t) + s;
            s = t;
        }
        return s + c;
    }

    /* ================================================================== */
    /* Lists of numbers                                                    */
    /* ================================================================== */

    const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    const GROUPED_RE = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

    /**
     * Read one cell as a number, or return null. Accepts a sign, a leading
     * currency sign, a trailing %, digit-group marks (_ ' and narrow
     * spaces), and comma groups inside quoted cells.
     */
    function readCell(raw, quoted) {
        let t = raw.trim();
        if (!t) return null;
        t = t.replace(/−/g, '-');
        let sign = 1;
        if (t[0] === '-' || t[0] === '+') {
            if (t[0] === '-') sign = -1;
            t = t.slice(1).trim();
        }
        t = t.replace(/^[$€£¥₹]\s*/, '');
        if (t.endsWith('%')) t = t.slice(0, -1).trim();
        t = t.replace(/(\d)[_'  ](?=\d)/g, '$1');
        if (quoted && GROUPED_RE.test(t)) t = t.replace(/,/g, '');
        if (!NUM_RE.test(t)) return null;
        const v = sign * Number(t);
        return Number.isFinite(v) ? noNegZero(v) : null;
    }

    /** Split one line into cells. `delims` is a test for separator characters; quotes group a cell. */
    function splitCells(line, isDelim) {
        const cells = [];
        let cur = '';
        let quoted = false;
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuote) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { cur += '"'; i++; } else inQuote = false;
                } else cur += ch;
                continue;
            }
            if (ch === '"' && !cur.trim()) {
                inQuote = true;
                quoted = true;
                cur = '';
                continue;
            }
            if (isDelim(ch)) {
                cells.push({ text: cur, quoted });
                cur = '';
                quoted = false;
                continue;
            }
            cur += ch;
        }
        cells.push({ text: cur, quoted });
        return cells;
    }

    const LIST_DELIM = (ch) => ch === ',' || ch === ';' || ch === '|' || /\s/.test(ch);

    /** Cut text at the last separator before `max` characters. */
    function capText(text, max) {
        if (text.length <= max) return { text, cut: false };
        let end = max;
        while (end > 0 && !LIST_DELIM(text[end])) end--;
        return { text: text.slice(0, end || max), cut: true };
    }

    /**
     * Guess the column layout of a pasted CSV / spreadsheet block. Returns
     * { delimiter, count, headers: [string|null], numeric: [bool] } when at
     * least two lines share two or more cells, else null.
     */
    function detectColumns(text) {
        if (typeof text !== 'string' || !text.trim()) return null;
        const lines = capText(text, 200000).text.split(/\r\n|\r|\n/).filter((l) => l.trim()).slice(0, 60);
        if (lines.length < 2) return null;
        for (const delimiter of ['\t', ';', ',']) {
            const counts = lines.map((l) => splitCells(l, (ch) => ch === delimiter).length);
            const tally = new Map();
            counts.forEach((c) => tally.set(c, (tally.get(c) || 0) + 1));
            let best = 0;
            let bestN = 0;
            tally.forEach((n, c) => { if (n > bestN || (n === bestN && c > best)) { best = c; bestN = n; } });
            if (best < 2 || bestN < 2 || bestN / lines.length < 0.8) continue;
            const first = splitCells(lines[0], (ch) => ch === delimiter);
            const firstIsHeader = first.some((c) => c.text.trim() && readCell(c.text, c.quoted) === null);
            const headers = [];
            const numeric = [];
            for (let i = 0; i < Math.min(best, 50); i++) {
                const cell = first[i];
                headers.push(firstIsHeader && cell && cell.text.trim() ? cell.text.trim().slice(0, 40) : null);
                let nums = 0;
                lines.slice(firstIsHeader ? 1 : 0).forEach((l) => {
                    const c = splitCells(l, (ch) => ch === delimiter)[i];
                    if (c && readCell(c.text, c.quoted) !== null) nums++;
                });
                numeric.push(nums > 0);
            }
            return { delimiter, count: headers.length, headers, numeric };
        }
        return null;
    }

    /**
     * Read every number in pasted text. opts.column (1-based) reads only that
     * column, splitting lines on opts.delimiter (or the detected one).
     * Returns { values, skipped, skippedSamples, truncated, limit }.
     */
    function parseNumberList(text, opts = {}) {
        const out = { values: [], skipped: 0, skippedSamples: [], truncated: false, limit: LIMITS.values };
        if (text === null || text === undefined) return out;
        if (typeof text !== 'string') text = String(text);
        const max = clamp(Math.floor(Number(opts.max) || LIMITS.values), 1, LIMITS.values);
        out.limit = max;
        const capped = capText(text, LIMITS.textChars);
        if (capped.cut) out.truncated = true;
        const lines = capped.text.split(/\r\n|\r|\n/);

        let column = 0;
        let delimiter = null;
        if (opts.column !== undefined && opts.column !== null && opts.column !== 'all') {
            column = Math.floor(Number(opts.column));
            if (!Number.isFinite(column) || column < 1 || column > 50) fail('Pick a column from 1 to 50.');
            delimiter = typeof opts.delimiter === 'string' && opts.delimiter.length === 1 ? opts.delimiter : null;
            if (!delimiter) {
                const layout = detectColumns(capped.text);
                delimiter = layout ? layout.delimiter : ',';
            }
        }
        const isDelim = delimiter ? (ch) => ch === delimiter : LIST_DELIM;

        const skip = (cellText) => {
            out.skipped++;
            if (out.skippedSamples.length < 3) out.skippedSamples.push(echo(cellText.trim()));
        };

        outer:
        for (const line of lines) {
            if (!line.trim()) continue;
            const cells = splitCells(line, isDelim);
            const pick = column ? [cells[column - 1]].filter(Boolean) : cells;
            for (const cell of pick) {
                if (!cell.text.trim()) continue;
                const v = readCell(cell.text, cell.quoted);
                if (v === null) { skip(cell.text); continue; }
                if (out.values.length >= max) {
                    out.truncated = true;
                    break outer;
                }
                out.values.push(v);
            }
        }
        return out;
    }

    /* ================================================================== */
    /* Statistics                                                          */
    /* ================================================================== */

    function finiteList(values, what) {
        if (!Array.isArray(values) && !(ArrayBuffer.isView(values) && !(values instanceof DataView))) {
            fail(`${what} need a list of numbers.`);
        }
        if (values.length > LIMITS.statsValues) fail(`${what} work with up to ${fmtInt(LIMITS.statsValues)} numbers at a time.`);
        const xs = [];
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (typeof v === 'number' && Number.isFinite(v)) xs.push(v);
        }
        return xs;
    }

    /** Median of sorted[lo, hi). */
    function medianOf(sorted, lo, hi) {
        const n = hi - lo;
        if (n <= 0) return null;
        const mid = lo + Math.floor(n / 2);
        return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Descriptive statistics. Non-finite entries are ignored. Quartiles use
     * the median-of-halves method; outliers lie beyond 1.5 × IQR from Q1 /
     * Q3 (Tukey's fences). Fields are null when they need more values.
     */
    function stats(values) {
        const xs = finiteList(values, 'Statistics');
        const n = xs.length;
        if (!n) {
            return {
                count: 0, sum: 0, mean: null, median: null, modes: [], modeFrequency: 0,
                min: null, max: null, range: null,
                variance: { sample: null, population: null }, stdev: { sample: null, population: null },
                q1: null, q3: null, iqr: null, outliers: [], fences: { low: null, high: null }
            };
        }
        const sorted = Float64Array.from(xs).sort();
        let sum = fsum(xs);
        let mean = sum / n;
        if (!Number.isFinite(sum)) {
            mean = fsum(xs, (x) => x / n);
            sum = mean * n;
        }
        let population = null;
        let sample = null;
        if (Number.isFinite(mean)) {
            const m2 = fsum(xs, (x) => (x - mean) * (x - mean));
            if (Number.isFinite(m2)) {
                population = m2 / n;
                sample = n > 1 ? m2 / (n - 1) : null;
            }
        }

        const median = medianOf(sorted, 0, n);
        let q1;
        let q3;
        if (n === 1) {
            q1 = sorted[0];
            q3 = sorted[0];
        } else {
            const half = Math.floor(n / 2);
            q1 = medianOf(sorted, 0, half);
            q3 = medianOf(sorted, n - half, n);
        }
        const iqr = q3 - q1;
        const low = q1 - 1.5 * iqr;
        const high = q3 + 1.5 * iqr;
        const outliers = [];
        for (let i = 0; i < n; i++) if (sorted[i] < low || sorted[i] > high) outliers.push(noNegZero(sorted[i]));

        // Modes from runs of equal values in the sorted list.
        let best = 1;
        let modes = [];
        for (let i = 0; i < n;) {
            let j = i + 1;
            while (j < n && sorted[j] === sorted[i]) j++;
            const run = j - i;
            if (run > best) { best = run; modes = [noNegZero(sorted[i])]; } else if (run === best && best > 1) modes.push(noNegZero(sorted[i]));
            i = j;
        }
        if (best === 1) modes = [];

        const nz = (x) => (x === null ? null : noNegZero(x));
        return {
            count: n,
            sum: nz(sum),
            mean: nz(mean),
            median: nz(median),
            modes,
            modeFrequency: modes.length ? best : 0,
            min: nz(sorted[0]),
            max: nz(sorted[n - 1]),
            range: nz(sorted[n - 1] - sorted[0]),
            variance: { sample: nz(sample), population: nz(population) },
            stdev: {
                sample: sample === null ? null : Math.sqrt(sample),
                population: population === null ? null : Math.sqrt(population)
            },
            q1: nz(q1),
            q3: nz(q3),
            iqr: nz(iqr),
            outliers,
            fences: { low: nz(low), high: nz(high) }
        };
    }

    /** The 1-2-2.5-5 × 10^k step closest to x (on a log scale). */
    function niceStep(x) {
        if (!(x > 0) || !Number.isFinite(x)) return 1;
        const exp = Math.floor(Math.log10(x));
        const base = Math.pow(10, exp);
        const f = x / base;
        let best = 1;
        for (const nf of [1, 2, 2.5, 5, 10]) {
            if (Math.abs(Math.log(f / nf)) < Math.abs(Math.log(f / best))) best = nf;
        }
        return best * base;
    }

    const tidy = (x) => noNegZero(Number(x.toPrecision(12)));

    /**
     * Bins for a histogram: [{ from, to, count }]. With no `bins`, the count
     * follows Sturges' rule and the edges land on tidy steps; with a number
     * (1–100), exactly that many equal-width bins span min to max. Every bin
     * includes its lower edge; the last bin also includes its upper edge.
     */
    function histogram(values, bins) {
        const xs = finiteList(values, 'Histograms');
        if (!xs.length) return [];
        let min = Infinity;
        let max = -Infinity;
        for (const x of xs) {
            if (x < min) min = x;
            if (x > max) max = x;
        }
        let k = null;
        if (bins !== undefined && bins !== null && bins !== 'auto' && bins !== '') {
            k = Math.round(Number(bins));
            if (!Number.isFinite(k) || k < 1 || k > LIMITS.bins) fail(`Bins must be a whole number from 1 to ${LIMITS.bins}.`);
        }
        if (min === max) return [{ from: noNegZero(min), to: noNegZero(max), count: xs.length }];

        let start;
        let step;
        let count;
        if (k === null) {
            const want = clamp(Math.ceil(Math.log2(xs.length)) + 1, 1, 30);
            step = niceStep((max - min) / want);
            start = Math.floor(min / step) * step;
            count = Math.max(1, Math.ceil((max - start) / step - 1e-9));
            if (start + count * step < max) count++;
            count = Math.min(count, LIMITS.bins);
        } else {
            start = min;
            step = (max - min) / k;
            count = k;
        }
        if (!Number.isFinite(step) || step <= 0) return [{ from: noNegZero(min), to: noNegZero(max), count: xs.length }];

        const edges = [];
        for (let i = 0; i <= count; i++) edges.push(k !== null && i === count ? max : tidy(start + i * step));
        const tally = new Array(count).fill(0);
        for (const x of xs) {
            let i = Math.floor((x - start) / step);
            if (i < 0) i = 0;
            if (i >= count) i = count - 1;
            if (i > 0 && x < edges[i]) i--;
            if (i < count - 1 && x >= edges[i + 1]) i++;
            tally[i]++;
        }
        return tally.map((c, i) => ({ from: edges[i], to: edges[i + 1], count: c }));
    }

    /* ================================================================== */
    /* Whole numbers                                                       */
    /* ================================================================== */

    const bitLength = (n) => (n === 0n ? 0 : (n < 0n ? -n : n).toString(2).length);
    const digitCount = (n) => (n < 0n ? -n : n).toString().length;
    const absBig = (n) => (n < 0n ? -n : n);

    /**
     * A whole number from a safe-integer Number, a BigInt, or a decimal
     * string (spaces, _, commas, and apostrophes between digits allowed).
     */
    function toBigInt(value) {
        if (typeof value === 'bigint') return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) fail('Enter a whole number, like 97.');
            if (!Number.isInteger(value)) fail(`${value} isn't a whole number — prime tests and factors need whole numbers.`);
            if (!Number.isSafeInteger(value)) fail('That number is too large to be exact as a plain number — type it as text instead.');
            return BigInt(value);
        }
        if (typeof value === 'string') {
            let s = value.trim().replace(/−/g, '-');
            if (!s) fail('Type a whole number, like 97.');
            if (s.length > 2000) fail(`Keep whole numbers to ${LIMITS.digits} digits or fewer.`);
            s = s.replace(/[\s_,'  ]/g, '');
            if (/^[+-]?\d+\.0*$/.test(s)) s = s.replace(/\.0*$/, '');
            if (!/^[+-]?\d+$/.test(s)) {
                if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(s)) fail(`${echo(s)} isn't a whole number — remove the decimal part.`);
                fail(`'${echo(value.trim())}' isn't a whole number — use digits only, like 97.`);
            }
            return BigInt(s);
        }
        fail('Enter a whole number, like 97.');
        return 0n;
    }

    function checkDigits(n) {
        if (digitCount(n) > LIMITS.digits) fail(`Keep numbers to ${LIMITS.digits} digits or fewer.`);
        return n;
    }

    function gcdBig(a, b) {
        a = absBig(a);
        b = absBig(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }

    function modPow(base, exp, mod) {
        let result = 1n;
        let b = base % mod;
        let e = exp;
        while (e > 0n) {
            if (e & 1n) result = (result * b) % mod;
            e >>= 1n;
            b = (b * b) % mod;
        }
        return result;
    }

    function strongProbablePrime(n, a, d, s) {
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) return true;
        for (let r = 1; r < s; r++) {
            x = (x * x) % n;
            if (x === n - 1n) return true;
            if (x === 1n) return false;
        }
        return false;
    }

    /** { prime, certain } for a BigInt n (n may be any size; callers cap it). */
    function primalityBig(n) {
        if (n < 2n) return { prime: false, certain: true };
        for (const p of TRIAL_BIG) {
            if (n === p) return { prime: true, certain: true };
            if (n % p === 0n) return { prime: false, certain: true };
        }
        if (n < 1000000n) return { prime: true, certain: true };
        let d = n - 1n;
        let s = 0;
        while ((d & 1n) === 0n) { d >>= 1n; s++; }
        for (const a of MR_BASES) if (!strongProbablePrime(n, a, d, s)) return { prime: false, certain: true };
        if (n < MR_LIMIT) return { prime: true, certain: true };
        for (const a of MR_EXTRA) if (!strongProbablePrime(n, a, d, s)) return { prime: false, certain: true };
        return { prime: true, certain: false };
    }

    /**
     * Prime test with its certainty: { prime, certain }. certain is false only
     * for "prime" verdicts above 3.317 × 10^24 (strong probable primes).
     */
    function primality(value) {
        return primalityBig(checkDigits(toBigInt(value)));
    }

    /** True when the whole number is prime (see primality for certainty). */
    function isPrime(value) {
        return primality(value).prime;
    }

    function searchPrime(start, dir) {
        const deadline = now() + LIMITS.primeSearchMs;
        let n = start;
        if (dir > 0 && n <= 2n) return 2n;
        if ((n & 1n) === 0n) n += dir > 0 ? 1n : -1n;
        for (let i = 0; ; i++) {
            if (n < 2n) return null;
            if (n === 2n || primalityBig(n).prime) return n;
            n += dir > 0 ? 2n : -2n;
            if (n === 1n && dir < 0) return 2n;
            if ((i & 15) === 15 && now() > deadline) {
                fail('No prime turned up within a second of searching — try a smaller number.');
            }
        }
    }

    /** The smallest prime greater than n, as a decimal string. */
    function nextPrime(value) {
        const n = checkDigits(toBigInt(value));
        const p = searchPrime(n + 1n, 1);
        if (digitCount(p) > LIMITS.digits) fail(`Keep numbers to ${LIMITS.digits} digits or fewer.`);
        return p.toString();
    }

    /** The largest prime less than n, as a decimal string, or null when n ≤ 2. */
    function prevPrime(value) {
        const n = checkDigits(toBigInt(value));
        if (n <= 2n) return null;
        if (n === 3n) return '2';
        const p = searchPrime(n - 1n, -1);
        return p === null ? null : p.toString();
    }

    /** floor(n^(1/k)) for n ≥ 0n, k ≥ 2. */
    function iroot(n, k) {
        if (n < 2n) return n;
        const K = BigInt(k);
        let x = 1n << BigInt(Math.ceil(bitLength(n) / k));
        for (;;) {
            const y = ((K - 1n) * x + n / (x ** (K - 1n))) / K;
            if (y >= x) return x;
            x = y;
        }
    }

    /** { root, k } when n = root^k for a prime k (n has no factor below 10,000), else null. */
    function perfectPower(n) {
        const bits = bitLength(n);
        for (const k of SMALL_PRIMES) {
            if (k > bits / 13 + 1) break;
            const r = iroot(n, k);
            if (r > 1n && r ** BigInt(k) === n) return { root: r, k };
        }
        return null;
    }

    /** A non-trivial factor of the odd composite n by Pollard's rho (Brent), or null when time runs out. */
    function pollardBrent(n, deadline) {
        if ((n & 1n) === 0n) return 2n;
        for (let c = 1n; c < 64n; c++) {
            const f = (v) => (v * v + c) % n;
            let y = 2n;
            let x = 2n;
            let ys = 2n;
            let g = 1n;
            let q = 1n;
            let r = 1;
            const m = 128;
            while (g === 1n) {
                x = y;
                for (let i = 0; i < r; i++) y = f(y);
                let k = 0;
                while (k < r && g === 1n) {
                    ys = y;
                    const lim = Math.min(m, r - k);
                    for (let i = 0; i < lim; i++) {
                        y = f(y);
                        q = (q * (x > y ? x - y : y - x)) % n;
                    }
                    g = gcdBig(q, n);
                    k += m;
                    if (now() > deadline) return null;
                }
                r *= 2;
            }
            if (g === n) {
                let guard = 0;
                do {
                    ys = f(ys);
                    g = gcdBig(x > ys ? x - ys : ys - x, n);
                    if ((++guard & 255) === 0 && now() > deadline) return null;
                } while (g === 1n);
            }
            if (g !== n && g !== 1n) return g;
        }
        return null;
    }

    /**
     * Prime factorization of a non-zero whole number. Returns { factors:
     * [{ prime, exponent, probable? }], complete, remainder, sign }, where
     * remainder is the unfactored part (a decimal string) when the time
     * budget (opts.timeMs, default 200, at most 5,000) ran out.
     */
    function factorize(value, opts = {}) {
        const budget = clamp(Number(opts && opts.timeMs) || LIMITS.factorMs, 10, LIMITS.factorMsMax);
        let n = checkDigits(toBigInt(value));
        if (n === 0n) fail('0 has no prime factorization — every whole number divides 0.');
        const sign = n < 0n ? -1 : 1;
        if (n < 0n) n = -n;

        const found = new Map();
        const probable = new Set();
        const add = (p, times = 1) => {
            const key = p.toString();
            found.set(key, (found.get(key) || 0) + times);
        };

        for (const p of SMALL_PRIMES_BIG) {
            if (p * p > n) break;
            while (n % p === 0n) {
                add(p);
                n /= p;
            }
        }
        if (n > 1n && n < 100000000n) {
            add(n);
            n = 1n;
        }

        const deadline = now() + budget;
        const stack = n > 1n ? [n] : [];
        let remainder = 1n;
        while (stack.length) {
            const m = stack.pop();
            if (m === 1n) continue;
            const test = primalityBig(m);
            if (test.prime) {
                add(m);
                if (!test.certain) probable.add(m.toString());
                continue;
            }
            const pp = perfectPower(m);
            if (pp) {
                for (let i = 0; i < pp.k; i++) stack.push(pp.root);
                continue;
            }
            const d = now() > deadline ? null : pollardBrent(m, deadline);
            if (!d) {
                remainder *= m;
                continue;
            }
            stack.push(d, m / d);
        }

        const factors = Array.from(found.entries())
            .map(([prime, exponent]) => {
                const f = { prime, exponent };
                if (probable.has(prime)) f.probable = true;
                return f;
            })
            .sort((a, b) => {
                const x = BigInt(a.prime);
                const y = BigInt(b.prime);
                return x < y ? -1 : x > y ? 1 : 0;
            });
        const complete = remainder === 1n;
        return { factors, complete, remainder: complete ? null : remainder.toString(), sign };
    }

    /** Parse a gcd / lcm list: an array, or text separated by commas, spaces, or semicolons. */
    function intList(list) {
        let items = list;
        if (typeof items === 'string') items = items.split(/[\s,;]+/).filter(Boolean);
        if (!Array.isArray(items)) fail('Give a list of whole numbers, like 12, 18, 24.');
        if (!items.length) fail('Type at least one whole number, like 12, 18, 24.');
        if (items.length > LIMITS.listItems) fail(`Use at most ${fmtInt(LIMITS.listItems)} numbers at a time.`);
        return items.map((v) => absBig(checkDigits(toBigInt(typeof v === 'string' ? v.replace(/,/g, '') : v))));
    }

    /** Greatest common divisor of a list, as a decimal string ('0' when every entry is 0). */
    function gcd(list) {
        const xs = intList(list);
        let g = 0n;
        for (const x of xs) {
            g = gcdBig(g, x);
            if (g === 1n) break;
        }
        return g.toString();
    }

    /** Least common multiple of a list, as a decimal string ('0' when any entry is 0). */
    function lcm(list) {
        const xs = intList(list);
        if (xs.some((x) => x === 0n)) return '0';
        let l = 1n;
        for (const x of xs) {
            l = (l / gcdBig(l, x)) * x;
            if (bitLength(l) > LIMITS.lcmBits) fail('That LCM has more than 6,000 digits — too large to show.');
        }
        return l.toString();
    }

    /* ================================================================== */
    /* Bases                                                               */
    /* ================================================================== */

    function checkBase(b, which) {
        const n = typeof b === 'string' ? Number(b.trim()) : Number(b);
        if (!Number.isInteger(n) || n < 2 || n > 36) fail(`The ${which} base must be a whole number from 2 to 36.`);
        return n;
    }

    const baseName = (base) => BASE_NAMES[base] || `base-${base}`;

    function digitRange(base) {
        if (base === 2) return 'only 0 and 1';
        if (base <= 10) return `only the digits 0 to ${base - 1}`;
        if (base === 11) return '0 to 9 and A';
        return `0 to 9 and A to ${DIGITS[base - 1].toUpperCase()}`;
    }

    /** A BigInt from text written in `base` (2–36). Throws a plain message naming the first bad digit. */
    function parseInBase(text, base = 10) {
        const b = checkBase(base, 'input');
        let s = String(text === null || text === undefined ? '' : text).trim().replace(/−/g, '-');
        if (!s) fail('Type a number to convert.');
        if (s.length > LIMITS.baseChars) fail(`Keep numbers to ${fmtInt(LIMITS.baseChars)} characters or fewer.`);
        let negative = false;
        if (s[0] === '-' || s[0] === '+') {
            negative = s[0] === '-';
            s = s.slice(1);
        }
        s = s.replace(/[\s_  ]/g, '');
        if ((b === 16 && /^0x/i.test(s)) || (b === 2 && /^0b/i.test(s)) || (b === 8 && /^0o/i.test(s))) s = s.slice(2);
        if (!s) fail('Type a number to convert.');
        if (/[.,]/.test(s)) fail('Only whole numbers convert between bases — remove the fractional part.');
        const lower = s.toLowerCase();
        for (let i = 0; i < lower.length; i++) {
            const d = DIGITS.indexOf(lower[i]);
            if (d < 0 || d >= b) {
                const ch = s[i];
                fail(`'${ch}' isn't a ${baseName(b)} digit — ${baseName(b)} uses ${digitRange(b)}.`);
            }
        }
        let v;
        if (b === 10) v = BigInt(lower);
        else if (b === 16) v = BigInt(`0x${lower}`);
        else if (b === 8) v = BigInt(`0o${lower}`);
        else if (b === 2) v = BigInt(`0b${lower}`);
        else {
            const chunk = Math.max(1, Math.floor(Math.log(2 ** 52) / Math.log(b)));
            const B = BigInt(b);
            v = 0n;
            for (let i = 0; i < lower.length; i += chunk) {
                const part = lower.slice(i, i + chunk);
                let pv = 0;
                for (const ch of part) pv = pv * b + DIGITS.indexOf(ch);
                v = v * (B ** BigInt(part.length)) + BigInt(pv);
            }
        }
        return negative && v !== 0n ? -v : v;
    }

    /** Digits of a whole number in `base` (2–36), upper-case letters, '-' for negatives. */
    function formatInBase(value, base = 10) {
        const b = checkBase(base, 'output');
        return toBigInt(value).toString(b).toUpperCase();
    }

    /** Convert whole-number text from one base to another: convertBase('ff', 16, 2) → '11111111'. */
    function convertBase(text, fromBase, toBase) {
        const from = checkBase(fromBase, 'input');
        const to = checkBase(toBase, 'output');
        return parseInBase(text, from).toString(to).toUpperCase();
    }

    /* ================================================================== */
    /* Roots of f(x)                                                       */
    /* ================================================================== */

    /** Brent's method on a bracket [a, b] with f(a), f(b) of opposite signs; null if f leaves its domain. */
    function brent(f, a, b, fa, fb) {
        let c = b;
        let fc = fb;
        let d = b - a;
        let e = d;
        for (let iter = 0; iter < 200; iter++) {
            if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
                c = a;
                fc = fa;
                d = b - a;
                e = d;
            }
            if (Math.abs(fc) < Math.abs(fb)) {
                a = b; b = c; c = a;
                fa = fb; fb = fc; fc = fa;
            }
            const tol = 2 * Number.EPSILON * Math.abs(b) + 1e-300;
            const m = 0.5 * (c - b);
            if (Math.abs(m) <= tol || fb === 0) return b;
            if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
                const s = fb / fa;
                let p;
                let q;
                if (a === c) {
                    p = 2 * m * s;
                    q = 1 - s;
                } else {
                    const qq = fa / fc;
                    const r = fb / fc;
                    p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
                    q = (qq - 1) * (r - 1) * (s - 1);
                }
                if (p > 0) q = -q;
                else p = -p;
                if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
                    e = d;
                    d = p / q;
                } else {
                    d = m;
                    e = m;
                }
            } else {
                d = m;
                e = m;
            }
            a = b;
            fa = fb;
            b += Math.abs(d) > tol ? d : (m > 0 ? tol : -tol);
            fb = f(b);
            if (!Number.isFinite(fb)) return null;
        }
        return b;
    }

    /** Golden-section search for the smallest |f| on [a, b]. */
    function minimizeAbs(f, a, b) {
        const g = (Math.sqrt(5) - 1) / 2;
        let c = b - g * (b - a);
        let d = a + g * (b - a);
        let fc = Math.abs(f(c));
        let fd = Math.abs(f(d));
        for (let i = 0; i < 90; i++) {
            if (b - a <= 4 * Number.EPSILON * (Math.abs(a) + Math.abs(b)) + 1e-300) break;
            if (fc < fd) {
                b = d; d = c; fd = fc;
                c = b - g * (b - a);
                fc = Math.abs(f(c));
            } else {
                a = c; c = d; fc = fd;
                d = a + g * (b - a);
                fd = Math.abs(f(d));
            }
        }
        return fc < fd ? c : d;
    }

    /** Replace r with a rounder nearby value when f is no worse there. */
    function snapRoot(f, r) {
        let best = r;
        let fb = Math.abs(f(r));
        const tryX = (x) => {
            if (!Number.isFinite(x) || x === best) return;
            const fx = Math.abs(f(x));
            if (Number.isFinite(fx) && fx <= fb) { best = x; fb = fx; }
        };
        const scale = Math.max(1, Math.abs(r));
        const int = Math.round(r);
        if (Math.abs(r - int) <= 1e-9 * scale) tryX(int);
        tryX(Number(best.toPrecision(12)));
        tryX(Number(best.toPrecision(10)));
        return noNegZero(best);
    }

    /**
     * Roots of fn on [min, max] with diagnostics: { roots, intervals,
     * truncated, timedOut, samples, evaluated, undefinedSamples }.
     * intervals lists stretches where fn is exactly 0 at several samples in
     * a row (every x there is a root).
     */
    function findRootsDetailed(fn, opts = {}) {
        if (typeof fn !== 'function') fail('Root finding needs a function of x.');
        const o = opts && typeof opts === 'object' ? opts : {};
        const min = Number(o.min);
        const max = Number(o.max);
        if (!Number.isFinite(min) || !Number.isFinite(max)) fail('The range needs a finite minimum and maximum.');
        if (!(min < max)) fail('The minimum must be less than the maximum.');
        if (!Number.isFinite(max - min)) fail('That range is too wide — keep both ends within ±1e300.');
        let samples = o.samples === undefined || o.samples === null ? 2000 : Math.round(Number(o.samples));
        if (!Number.isFinite(samples)) fail('Samples must be a whole number.');
        samples = clamp(samples, LIMITS.samplesMin, LIMITS.samplesMax);
        const budget = clamp(Number(o.timeMs) || LIMITS.rootsMs, 50, 10000);
        const deadline = now() + budget;

        const f = (x) => {
            let y;
            try { y = fn(x); } catch (_err) { return NaN; }
            return typeof y === 'number' ? y : NaN;
        };

        const xs = new Float64Array(samples + 1);
        const ys = new Float64Array(samples + 1);
        const step = (max - min) / samples;
        let evaluated = 0;
        let undefinedSamples = 0;
        let timedOut = false;
        for (let i = 0; i <= samples; i++) {
            const x = i === samples ? max : min + i * step;
            xs[i] = x;
            ys[i] = f(x);
            if (!Number.isFinite(ys[i])) undefinedSamples++;
            evaluated = i + 1;
            if ((i & 31) === 31 && now() > deadline) {
                timedOut = i < samples;
                break;
            }
        }

        const found = [];
        const intervals = [];
        for (let i = 0; i < evaluated; i++) {
            const fa = ys[i];
            if (fa === 0) {
                let j = i;
                while (j + 1 < evaluated && ys[j + 1] === 0) j++;
                if (j - i >= 2) intervals.push({ from: noNegZero(xs[i]), to: noNegZero(xs[j]) });
                else for (let k = i; k <= j; k++) found.push(xs[k]);
                i = j;
                continue;
            }
            if (i + 1 >= evaluated) break;
            const fb = ys[i + 1];
            if (!Number.isFinite(fa) || !Number.isFinite(fb) || fb === 0) continue;
            if ((fa < 0) === (fb < 0)) continue;
            const r = brent(f, xs[i], xs[i + 1], fa, fb);
            if (r === null) continue;
            const fr = Math.abs(f(r));
            // A sign change across a pole or a jump is not a root.
            if (!Number.isFinite(fr) || fr > 1e-3 * Math.min(Math.abs(fa), Math.abs(fb))) {
                if (!(fr <= 1e-12)) continue;
            }
            found.push(r);
            if (found.length > LIMITS.roots * 4) break;
        }

        // Touching roots: local minima of |f| that reach zero without a sign change.
        for (let i = 1; i + 1 < evaluated && found.length <= LIMITS.roots * 4; i++) {
            const y0 = ys[i - 1];
            const y1 = ys[i];
            const y2 = ys[i + 1];
            if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2) || y1 === 0) continue;
            if ((y0 < 0) !== (y1 < 0) || (y1 < 0) !== (y2 < 0)) continue;
            if (!(Math.abs(y1) <= Math.abs(y0) && Math.abs(y1) <= Math.abs(y2))) continue;
            if (Math.abs(y1) === Math.abs(y0) && Math.abs(y1) === Math.abs(y2)) continue;
            const xm = minimizeAbs(f, xs[i - 1], xs[i + 1]);
            const fm = Math.abs(f(xm));
            if (Number.isFinite(fm) && fm <= 1e-10 * Math.max(1, Math.abs(y0), Math.abs(y2))) found.push(xm);
        }

        const cleaned = found.filter(Number.isFinite).map((r) => snapRoot(f, r)).sort((a, b) => a - b);
        const roots = [];
        const span = max - min;
        for (const r of cleaned) {
            const prev = roots[roots.length - 1];
            if (prev !== undefined && Math.abs(r - prev) <= Math.max(span * 1e-9, Math.abs(r) * 1e-12)) {
                if (Math.abs(f(r)) < Math.abs(f(prev))) roots[roots.length - 1] = r;
                continue;
            }
            if (intervals.some((iv) => r >= iv.from - step && r <= iv.to + step)) continue;
            roots.push(r);
        }
        const truncated = roots.length > LIMITS.roots;
        return {
            roots: truncated ? roots.slice(0, LIMITS.roots) : roots,
            intervals,
            truncated,
            timedOut,
            samples,
            evaluated,
            undefinedSamples
        };
    }

    /** Real roots of fn between opts.min and opts.max (sorted, deduplicated). */
    function findRoots(fn, opts) {
        return findRootsDetailed(fn, opts).roots;
    }

    /* ================================================================== */
    /* Polynomial roots                                                    */
    /* ================================================================== */

    const cAbs = (z) => Math.hypot(z.re, z.im);
    const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
    const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    function cDiv(a, b) {
        const d = b.re * b.re + b.im * b.im;
        return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    }

    /** Horner evaluation of real coefficients (highest first) at complex z. */
    function polyAt(cs, z) {
        let re = 0;
        let im = 0;
        for (const c of cs) {
            const r = re * z.re - im * z.im + c;
            im = re * z.im + im * z.re;
            re = r;
        }
        return { re, im };
    }

    /** Σ |c_i| |z|^i — the size p(z) is measured against. */
    function polyScale(cs, z) {
        const r = cAbs(z);
        let s = 0;
        for (const c of cs) s = s * r + Math.abs(c);
        return s;
    }

    function derivative(cs) {
        const n = cs.length - 1;
        return cs.slice(0, -1).map((c, i) => c * (n - i));
    }

    function durandKerner(cs) {
        const n = cs.length - 1;
        const a = cs.map((c) => c / cs[0]);
        let bound = 0;
        for (let i = 1; i <= n; i++) bound = Math.max(bound, Math.abs(a[i]));
        const radius = Math.min(1 + bound, 1e150);
        const zs = [];
        for (let k = 0; k < n; k++) {
            const t = (2 * Math.PI * k) / n + 0.4;
            zs.push({ re: radius * 0.5 * Math.cos(t), im: radius * 0.5 * Math.sin(t) });
        }
        for (let iter = 0; iter < 2000; iter++) {
            let worst = 0;
            for (let i = 0; i < n; i++) {
                let den = { re: 1, im: 0 };
                for (let j = 0; j < n; j++) if (j !== i) den = cMul(den, cSub(zs[i], zs[j]));
                if (den.re === 0 && den.im === 0) den = { re: 1e-12, im: 1e-12 };
                const delta = cDiv(polyAt(a, zs[i]), den);
                if (!Number.isFinite(delta.re) || !Number.isFinite(delta.im)) continue;
                zs[i] = cSub(zs[i], delta);
                worst = Math.max(worst, cAbs(delta) / Math.max(1, cAbs(zs[i])));
            }
            if (worst < 1e-15) break;
        }
        return zs;
    }

    /** Newton polishing that only accepts steps that shrink |p|. */
    function polish(cs, dcs, z) {
        let best = z;
        let fb = cAbs(polyAt(cs, z));
        for (let i = 0; i < 12 && fb > 0; i++) {
            const dp = polyAt(dcs, best);
            if (dp.re === 0 && dp.im === 0) break;
            const next = cSub(best, cDiv(polyAt(cs, best), dp));
            const fn = cAbs(polyAt(cs, next));
            if (!(fn < fb)) break;
            best = next;
            fb = fn;
        }
        return best;
    }

    /** True when p, p', …, p^(m-1) all vanish at c (relative to their size there). */
    function isMultipleRoot(ders, c, m) {
        for (let k = 0; k < m; k++) {
            const tol = (k === 0 ? 1e-12 : 1e-8) * polyScale(ders[k], c);
            if (cAbs(polyAt(ders[k], c)) > tol) return false;
        }
        return true;
    }

    /**
     * Resolve one cluster of nearby Durand-Kerner roots. A root of
     * multiplicity j is a simple root of p^(j-1), so Newton on that
     * derivative pins it down to full precision; the largest multiplicity
     * that checks out wins and the rest of the cluster is resolved again.
     */
    function resolveCluster(ders, members, out) {
        if (members.length === 1) {
            out.push({ z: members[0], merged: false });
            return;
        }
        const len = members.length;
        const mean = {
            re: members.reduce((s, z) => s + z.re, 0) / len,
            im: members.reduce((s, z) => s + z.im, 0) / len
        };
        for (let j = len; j >= 2; j--) {
            const starts = j === len ? [mean] : members;
            for (const start of starts) {
                const c = polish(ders[j - 1], ders[j], start);
                if (!isMultipleRoot(ders, c, j)) continue;
                const byDistance = members.slice().sort((x, y) => cAbs(cSub(x, c)) - cAbs(cSub(y, c)));
                for (let i = 0; i < j; i++) out.push({ z: c, merged: true });
                resolveCluster(ders, byDistance.slice(j), out);
                return;
            }
        }
        members.forEach((z) => out.push({ z, merged: false }));
    }

    /** Group Durand-Kerner roots that sit close together and resolve each group. */
    function mergeClusters(cs, zs) {
        const n = zs.length;
        const ders = [cs];
        for (let k = 1; k <= n; k++) ders.push(derivative(ders[k - 1]));
        const group = zs.map((_, i) => i);
        const findG = (i) => (group[i] === i ? i : (group[i] = findG(group[i])));
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (cAbs(cSub(zs[i], zs[j])) <= 0.05 * Math.max(1, cAbs(zs[i]))) group[findG(i)] = findG(j);
            }
        }
        const clusters = new Map();
        zs.forEach((z, i) => {
            const g = findG(i);
            if (!clusters.has(g)) clusters.set(g, []);
            clusters.get(g).push(z);
        });
        const out = [];
        clusters.forEach((members) => resolveCluster(ders, members, out));
        return out;
    }

    function snapPart(cs, z, part) {
        const v = z[part];
        const fz = cAbs(polyAt(cs, z));
        const scale = Math.max(1, cAbs(z));
        const options = [];
        if (Math.abs(v - Math.round(v)) <= 1e-9 * scale) options.push(Math.round(v));
        options.push(Number(v.toPrecision(12)));
        for (const cand of options) {
            if (cand === v) continue;
            const t = Object.assign({}, z, { [part]: cand });
            if (cAbs(polyAt(cs, t)) <= fz) return t;
        }
        return z;
    }

    /**
     * Roots of a real polynomial, coefficients highest power first:
     * polyRoots([1, -3, 2]) is x² − 3x + 2. Returns [{ re, im }], real roots
     * first in ascending order, then complex pairs (positive imaginary part
     * first). A non-zero constant has no roots ([]); degree is at most 8.
     */
    function polyRoots(coeffs) {
        if (!Array.isArray(coeffs)) fail('Give the coefficients as a list, highest power first, like [1, -3, 2].');
        if (coeffs.length > 64) fail(`Polynomials up to degree ${LIMITS.degree} are supported.`);
        const cs = coeffs.map((c, i) => {
            if (typeof c === 'string' && !c.trim()) fail(`Coefficient ${i + 1} is empty — use 0 for a missing term.`);
            const v = typeof c === 'number' ? c : Number(c);
            if (!Number.isFinite(v)) fail(`Coefficient ${i + 1} isn't a finite number.`);
            return v;
        });
        while (cs.length && cs[0] === 0) cs.shift();
        if (!cs.length) fail('Every coefficient is 0, so every x is a root.');
        if (cs.length - 1 > LIMITS.degree) fail(`Polynomials up to degree ${LIMITS.degree} are supported.`);
        if (cs.length === 1) return [];

        const roots = [];
        while (cs[cs.length - 1] === 0) {
            cs.pop();
            roots.push({ re: 0, im: 0 });
        }
        const deg = cs.length - 1;
        const lead = cs[0];
        const mon = cs.map((c) => c / lead);
        if (mon.some((c) => !Number.isFinite(c))) fail('Those coefficients are too extreme to solve — try scaling them.');

        if (deg === 1) {
            roots.push({ re: -mon[1], im: 0 });
        } else if (deg === 2) {
            const b = mon[1];
            const c = mon[2];
            const disc = b * b - 4 * c;
            if (disc >= 0) {
                const s = Math.sqrt(disc);
                const q = -0.5 * (b + (b >= 0 ? s : -s));
                const r1 = q;
                const r2 = q !== 0 ? c / q : 0;
                roots.push({ re: r1, im: 0 }, { re: r2, im: 0 });
            } else {
                const re = -b / 2;
                const im = Math.sqrt(-disc) / 2;
                roots.push({ re, im }, { re, im: -im });
            }
        } else if (deg >= 3) {
            const dcs = derivative(mon);
            const raw = durandKerner(mon);
            mergeClusters(mon, raw).forEach(({ z, merged }) => {
                let r = merged ? z : polish(mon, dcs, z);
                if (Math.abs(r.im) <= 1e-10 * Math.max(1, Math.abs(r.re))) {
                    r = { re: r.re, im: 0 };
                    if (!merged) r = polish(mon, dcs, r);
                    r = { re: r.re, im: 0 };
                }
                roots.push(r);
            });
        }

        let cleaned = roots.map((z) => {
            let r = { re: z.re, im: z.im };
            if (deg >= 2) {
                r = snapPart(mon, r, 're');
                if (r.im !== 0) r = snapPart(mon, r, 'im');
            } else {
                r.re = snapRoot((x) => mon[0] * x + mon[1], r.re);
            }
            return { re: noNegZero(r.re), im: noNegZero(r.im) };
        });
        if (cleaned.some((z) => !Number.isFinite(z.re) || !Number.isFinite(z.im))) {
            fail('Those coefficients are too extreme to solve — try scaling them.');
        }

        // Real coefficients: complex roots come in exact conjugate pairs.
        const used = new Set();
        cleaned = cleaned.map((z, i) => {
            if (z.im <= 0 || used.has(i)) return z;
            let best = -1;
            let dist = Infinity;
            cleaned.forEach((w, j) => {
                if (j === i || used.has(j) || w.im >= 0) return;
                const d = Math.hypot(w.re - z.re, w.im + z.im);
                if (d < dist) { dist = d; best = j; }
            });
            if (best >= 0) {
                used.add(i);
                used.add(best);
                const w = cleaned[best];
                const re = noNegZero((z.re + w.re) / 2);
                const im = (z.im - w.im) / 2;
                cleaned[best] = { re, im: -im };
                return { re, im };
            }
            return z;
        });

        return cleaned.sort((a, b) => {
            const ar = a.im === 0;
            const br = b.im === 0;
            if (ar !== br) return ar ? -1 : 1;
            if (a.re !== b.re) return a.re - b.re;
            return b.im - a.im;
        });
    }

    /* ================================================================== */
    /* Linear systems (exact rationals)                                    */
    /* ================================================================== */

    function rat(n, d = 1n) {
        if (d === 0n) fail('Division by zero in a coefficient.');
        if (d < 0n) { n = -n; d = -d; }
        const g = gcdBig(n, d) || 1n;
        return { n: n / g, d: d / g };
    }

    const R0 = { n: 0n, d: 1n };
    const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
    const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
    const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
    const rDiv = (a, b) => rat(a.n * b.d, a.d * b.n);
    const rAbsGreater = (a, b) => absBig(a.n) * b.d > absBig(b.n) * a.d;

    /** An exact rational from a number, BigInt, decimal string, or 'p/q' string. */
    function ratOf(v, where) {
        if (typeof v === 'bigint') return rat(v);
        let s;
        if (typeof v === 'number') {
            if (!Number.isFinite(v)) fail(`${where} isn't a finite number.`);
            s = String(v);
        } else if (typeof v === 'string') {
            s = v.trim().replace(/−/g, '-');
            if (!s) fail(`${where} is empty — use 0 for a missing term.`);
        } else {
            fail(`${where} isn't a number.`);
        }
        const frac = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(s);
        if (frac) {
            if (BigInt(frac[2]) === 0n) fail(`${where} divides by zero.`);
            return rat(BigInt(frac[1]), BigInt(frac[2]));
        }
        const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
        if (!m || !(m[2] || m[3])) fail(`${where} isn't a number.`);
        const exp = (m[4] ? Number(m[4]) : 0) - (m[3] ? m[3].length : 0);
        if (Math.abs(exp) > 400) fail(`${where} is too large or too small.`);
        let num = BigInt((m[2] || '0') + (m[3] || ''));
        let den = 1n;
        if (exp >= 0) num *= 10n ** BigInt(exp);
        else den = 10n ** BigInt(-exp);
        if (m[1] === '-') num = -num;
        return rat(num, den);
    }

    /** A rational as the nearest double. */
    function ratToNumber(r) {
        if (r.n === 0n) return 0;
        const x = Number(r.n) / Number(r.d);
        if (Number.isFinite(x) && x !== 0) return x;
        const shift = bitLength(r.d) - bitLength(r.n) + 64;
        if (shift >= 0) return Number((r.n << BigInt(shift)) / r.d) * Math.pow(2, -shift);
        return Number(r.n / (r.d << BigInt(-shift))) * Math.pow(2, -shift);
    }

    const ratString = (r) => (r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`);

    /**
     * Solve A·x = b for 2–5 unknowns with exact rational Gauss-Jordan
     * elimination (largest pivot first). Entries may be numbers, BigInts,
     * or strings ('0.1', '1/3'). Returns { status: 'unique' | 'none' |
     * 'infinite', solution: number[] | null, exact: string[] | null, rank }.
     */
    function solveLinear(A, b) {
        if (!Array.isArray(A) || !Array.isArray(b)) fail('A linear system needs a square grid of coefficients and a list of constants.');
        const n = A.length;
        if (n < LIMITS.unknownsMin || n > LIMITS.unknownsMax) {
            fail(`Linear systems need ${LIMITS.unknownsMin} to ${LIMITS.unknownsMax} equations and unknowns.`);
        }
        if (b.length !== n) fail(`There are ${n} equations, so give ${n} constants.`);
        const M = A.map((row, i) => {
            if (!Array.isArray(row) || row.length !== n) fail(`Equation ${i + 1} needs exactly ${n} coefficients.`);
            const r = row.map((v, j) => ratOf(v, `Equation ${i + 1}, coefficient ${j + 1}`));
            r.push(ratOf(b[i], `Equation ${i + 1}, constant`));
            return r;
        });

        let rank = 0;
        const pivotCol = [];
        for (let col = 0; col < n && rank < n; col++) {
            let best = -1;
            for (let r = rank; r < n; r++) {
                if (M[r][col].n !== 0n && (best < 0 || rAbsGreater(M[r][col], M[best][col]))) best = r;
            }
            if (best < 0) continue;
            [M[rank], M[best]] = [M[best], M[rank]];
            const piv = M[rank][col];
            for (let c = col; c <= n; c++) M[rank][c] = rDiv(M[rank][c], piv);
            for (let r = 0; r < n; r++) {
                if (r === rank || M[r][col].n === 0n) continue;
                const factor = M[r][col];
                for (let c = col; c <= n; c++) M[r][c] = rSub(M[r][c], rMul(factor, M[rank][c]));
            }
            pivotCol.push(col);
            rank++;
        }

        for (let r = rank; r < n; r++) {
            if (M[r][n].n !== 0n) return { status: 'none', solution: null, exact: null, rank };
        }
        if (rank < n) return { status: 'infinite', solution: null, exact: null, rank };
        const exactVals = new Array(n).fill(R0);
        pivotCol.forEach((col, r) => { exactVals[col] = M[r][n]; });
        return {
            status: 'unique',
            solution: exactVals.map((r) => noNegZero(ratToNumber(r))),
            exact: exactVals.map(ratString),
            rank
        };
    }

    /* ================================================================== */
    /* Public API                                                          */
    /* ================================================================== */

    return Object.freeze({
        parseNumberList,
        detectColumns,
        stats,
        histogram,
        isPrime,
        primality,
        nextPrime,
        prevPrime,
        factorize,
        gcd,
        lcm,
        convertBase,
        parseInBase,
        formatInBase,
        toBigInt,
        findRoots,
        findRootsDetailed,
        polyRoots,
        solveLinear,
        limits: LIMITS
    });
});
