/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MathEngine (mathMan Edition - v1.0)
 *     - File Name: engine.js
 *     - Relative Path: tools/mathman/js/engine.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The expression engine behind every mathMan worksheet line: it reads a
 *     sheet of plain-text calculations top to bottom and returns a formatted
 *     result, or a positioned plain-language error, for each line. The
 *     worksheet, the tool panes and the Node tests all share this one pure
 *     implementation, so a number shown anywhere in mathMan is worked out
 *     the same way.
 *
 * ✒ Key Features:
 *     - Tokenizer with character positions, a Pratt parser that builds an
 *       AST, and a tree-walking evaluator; no eval, no Function, no string
 *       is ever turned into code
 *     - Exact BigInt rationals for + - * / and integer powers (1/3 + 1/6 is
 *       exactly 1/2, 0.1 + 0.2 shows 0.3), exact roots and exact logs when
 *       the answer is rational, floats for everything transcendental
 *     - Numbers: 42, 3.14, .5, 1e-3, 1_000_000, 1,000 (outside brackets),
 *       0xFF, 0b1010, 0o17; booleans from comparisons
 *     - Operators low to high: to / as / in conversion, comparison, + -,
 *       * / mod of and implicit multiplication, unary minus, ^ (right
 *       associative), postfix ! and %
 *     - Percent arithmetic: 15%, 150 + 10%, 150 - 10%, 20% of 150, 0.25 to %
 *     - Dimensioned units: dimension vectors, exact scale factors, SI and
 *       binary prefixes, long names, plurals, aliases, two- to four-word
 *       names (fl oz, miles per hour), compound units (km/h, kg*m/s^2),
 *       affine temperatures, and plain-language mismatch errors
 *     - Variables, user functions with recursion (lazy if()), labels,
 *       // comments, # headings, ans, line3, total / sum, average / avg
 *     - Conversion targets: hex, bin, oct, dec, sci, eng, fraction, % and
 *       any unit expression
 *     - Formatting by significant digits with auto / fixed / scientific /
 *       engineering notation, thousands separators and exact fractions
 *     - compile(): a float-only closure for graphs and the solver that can
 *       call the sheet's own functions and variables
 *     - Reference metadata for every function, constant, unit and keyword
 *     - Safety budgets: 2,000 lines, 2,000 characters per line, exact
 *       integers up to 20,000 bits, nesting depth 100, recursion depth 64,
 *       a per-line step and time budget and a per-sheet time budget
 *
 * ✒ Usage Instructions:
 *     Browser: load after the shared scripts and before js/state.js:
 *         <script src="js/engine.js"></script>
 *     then call window.MathEngine.*. Node: require('./engine.js').
 *     Options O = { angle: 'deg'|'rad', precision: 1..16 significant
 *     digits, notation: 'auto'|'fixed'|'scientific'|'engineering',
 *     thousands: 'comma'|'space'|'none', fractions: 'auto'|'off',
 *     implicitMult: true|false }; anything missing or invalid falls back to
 *     rad / 10 / auto / comma / auto / true. Nothing here throws on user
 *     input: errors come back inside the LineResult. In evaluateSheet()
 *     output, LineResult.index is 0-based while variables[].line and
 *     functions[].line are 1-based (the number shown in the gutter); both
 *     also carry a 0-based index.
 *
 * ✒ Examples:
 *     MathEngine.evaluate('1/3 + 1/6')            → display '0.5', exact '1/2'
 *     MathEngine.evaluate('5 km + 300 m')         → display '5.3 km', plain '5.3 km'
 *     MathEngine.evaluate('60 mph to km/h')       → display '96.56064 km/h'
 *     MathEngine.evaluate('98.6 °F to °C')        → numeric 37, unit '°C'
 *     MathEngine.evaluate('255 to hex')           → display '0xFF'
 *     MathEngine.evaluate('sin(30 deg)')          → display '0.5' in either angle mode
 *     MathEngine.evaluate('foo + 1').error        → { message: "Unknown name 'foo' — …", start: 0, end: 3 }
 *     MathEngine.evaluateSheet('Rent: 1200\nFood: 300\ntotal').lines[2].display → '1,500'
 *     MathEngine.compile('x^2 - 2').fn(2)          → 2
 *     MathEngine.units.convert(1, 'GiB', 'MB')     → 1073.741824
 *     MathEngine.formatNumber(1234567.891, { precision: 6 }) → '1,234,570'
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers (BigInt and Unicode
 *       property escapes); Node 16+
 *     - Limitations: exact arithmetic stops at about 20,000 bits and falls
 *       back to doubles; trig, logs and roots of non-perfect powers are
 *       IEEE doubles; temperatures in °C / °F convert, add in the same unit
 *       and scale by plain numbers, but cannot be multiplied by other units;
 *       month and year are average Gregorian lengths; currencies are not
 *       units (the Finance pane handles money)
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const MathEngine = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = MathEngine;
    if (root) root.MathEngine = MathEngine;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /* ================================================================== */
    /* Limits, errors and small helpers                                    */
    /* ================================================================== */

    const LIMITS = Object.freeze({
        lines: 2000,        // lines worked out per sheet
        lineChars: 2000,    // characters per line
        bits: 20000,        // exact integer size before the float fallback
        factorial: 1000,    // largest exact factorial
        recursion: 64,      // nested user-function calls
        nesting: 100,       // nested brackets and operators while parsing
        ops: 200000,        // evaluation steps per line
        lineMs: 250,        // time budget per line
        sheetMs: 4000,      // time budget per sheet
        nameLength: 64,     // characters in a variable or function name
        args: 500,          // values passed to one function call
        params: 16,         // inputs of one user function
        compileOps: 50000   // user-function calls per compiled evaluation
    });

    const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const dict = () => Object.create(null);

    const TOO_LARGE = 'That number is too large to show';
    const NO_REAL = 'No real result — the answer is not a real number';
    const BUDGET = 'This line takes too many steps to work out — try smaller numbers or fewer repeats';
    const AFFINE = 'Temperatures in °C or °F can only be converted, added in the same unit, or scaled by a plain number — convert to K first';

    /** An error with a plain-language message and a character span in the line. */
    class EngineError extends Error {
        constructor(message, start, end) {
            super(message);
            this.name = 'EngineError';
            this.isEngine = true;
            this.start = start;
            this.end = end;
        }
    }

    function fail(message, node) {
        throw new EngineError(message, node ? node.s : undefined, node ? node.e : undefined);
    }

    /** Run fn; give a position-less engine error the span of node. */
    function at(node, fn) {
        try {
            return fn();
        } catch (err) {
            if (err && err.isEngine && err.start === undefined && node) {
                err.start = node.s;
                err.end = node.e;
            }
            throw err;
        }
    }

    const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    /* ================================================================== */
    /* Exact rationals: { n: BigInt, d: BigInt > 0 } or a plain float      */
    /* ================================================================== */

    const SAFE = 9007199254740992n;          // 2^53
    const BIG_FLOAT = 2n ** 1000n;           // below this Number(x) is finite
    const ONE = Object.freeze({ n: 1n, d: 1n });
    const ZERO = Object.freeze({ n: 0n, d: 1n });
    const HALF = Object.freeze({ n: 1n, d: 2n });
    const HUNDRED = Object.freeze({ n: 100n, d: 1n });

    const isR = (x) => typeof x === 'object' && x !== null;

    /** Bit length of a BigInt (approximate below 2^53, exact above). */
    function bitLen(x) {
        if (x < 0n) x = -x;
        if (x < SAFE) return x === 0n ? 0 : Math.floor(Math.log2(Number(x))) + 1;
        const h = x.toString(16);
        return (h.length - 1) * 4 + parseInt(h[0], 16).toString(2).length;
    }

    function bgcd(a, b) {
        if (a < 0n) a = -a;
        if (b < 0n) b = -b;
        while (b) {
            const t = a % b;
            a = b;
            b = t;
        }
        return a;
    }

    /** n / d as a correctly scaled double, even when both are huge. */
    function ratToFloat(n, d) {
        if (d === 1n) return Number(n);
        const neg = n < 0n;
        const a = neg ? -n : n;
        if (a < BIG_FLOAT && d < BIG_FLOAT) return Number(n) / Number(d);
        const shift = bitLen(a) - bitLen(d) - 64;
        const q = shift >= 0 ? a / (d << BigInt(shift)) : (a << BigInt(-shift)) / d;
        const h = Math.trunc(shift / 2);
        const f = Number(q) * Math.pow(2, h) * Math.pow(2, shift - h);
        return neg ? -f : f;
    }

    /** Keep a reduced rational exact unless it outgrows the bit budget. */
    function guard(n, d) {
        if (n > -SAFE && n < SAFE && d < SAFE) return { n, d };
        if (bitLen(n) > LIMITS.bits || bitLen(d) > LIMITS.bits) return ratToFloat(n, d);
        return { n, d };
    }

    function rat(n, d) {
        if (d === 0n) throw new EngineError('Division by zero');
        if (d < 0n) { n = -n; d = -d; }
        if (d !== 1n) {
            const g = bgcd(n, d);
            if (g !== 1n) { n /= g; d /= g; }
        }
        return guard(n, d);
    }

    const toF = (x) => (isR(x) ? ratToFloat(x.n, x.d) : x);
    const isZero = (x) => (isR(x) ? x.n === 0n : x === 0);
    const sgn = (x) => (isR(x) ? (x.n > 0n ? 1 : x.n < 0n ? -1 : 0) : Math.sign(x));
    const isInt = (x) => (isR(x) ? x.d === 1n : Number.isInteger(x));
    const fromNum = (x) => (Number.isSafeInteger(x) ? { n: BigInt(x), d: 1n } : x);
    const toBig = (x) => (isR(x) ? x.n / x.d : BigInt(Math.trunc(x)));

    function nNeg(a) { return isR(a) ? { n: -a.n, d: a.d } : -a; }
    function nAbs(a) { return sgn(a) < 0 ? nNeg(a) : a; }

    function nAdd(a, b) {
        if (!isR(a) || !isR(b)) return toF(a) + toF(b);
        if (a.d === b.d) return rat(a.n + b.n, a.d);
        return rat(a.n * b.d + b.n * a.d, a.d * b.d);
    }
    function nSub(a, b) { return nAdd(a, nNeg(b)); }
    function nMul(a, b) {
        if (!isR(a) || !isR(b)) return toF(a) * toF(b);
        return rat(a.n * b.n, a.d * b.d);
    }
    function nDiv(a, b) {
        if (isZero(b)) throw new EngineError('Division by zero');
        if (!isR(a) || !isR(b)) return toF(a) / toF(b);
        return rat(a.n * b.d, a.d * b.n);
    }
    function nCmp(a, b) {
        if (isR(a) && isR(b)) {
            const l = a.n * b.d;
            const r = b.n * a.d;
            return l < r ? -1 : l > r ? 1 : 0;
        }
        const x = toF(a);
        const y = toF(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    function nFloor(a) {
        if (!isR(a)) return Math.floor(a);
        let q = a.n / a.d;
        if (a.n < 0n && q * a.d !== a.n) q -= 1n;
        return { n: q, d: 1n };
    }
    function nCeil(a) { return nNeg(nFloor(nNeg(a))); }
    function nTrunc(a) { return isR(a) ? { n: a.n / a.d, d: 1n } : Math.trunc(a); }
    function pow10(k) { return k >= 0 ? { n: 10n ** BigInt(k), d: 1n } : { n: 1n, d: 10n ** BigInt(-k) }; }

    /** Exact decimal text ('0.3048', '-1.6e-19') as a rational. */
    function decimalRat(s) {
        const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(s).trim());
        if (!m || !(m[2] || m[3])) return NaN;
        const frac = m[3] || '';
        const scale = (m[4] ? Number(m[4]) : 0) - frac.length;
        if (Math.abs(scale) > 6000) return Number(s);
        let n = BigInt((m[2] || '') + frac || '0');
        if (m[1] === '-') n = -n;
        return scale >= 0 ? rat(n * 10n ** BigInt(scale), 1n) : rat(n, 10n ** BigInt(-scale));
    }

    /** Exact integer q-th root of a BigInt, or null. */
    function iroot(x, q) {
        if (x < 2n) return x;
        if (x >= BIG_FLOAT) return null;
        const est = BigInt(Math.round(Math.pow(Number(x), 1 / q)));
        const Q = BigInt(q);
        for (const c of [est, est - 1n, est + 1n]) if (c >= 0n && c ** Q === x) return c;
        return null;
    }

    /** a ^ k for a BigInt k; exact while the result fits the bit budget. */
    function nPowInt(a, k) {
        if (!isR(a)) return Math.pow(a, Number(k));
        if (k === 0n) return ONE;
        if (a.n === 0n) {
            if (k < 0n) throw new EngineError('Division by zero');
            return ZERO;
        }
        let n = a.n;
        let d = a.d;
        if (k < 0n) {
            k = -k;
            const t = n; n = d; d = t;
            if (d < 0n) { n = -n; d = -d; }
        }
        if (d === 1n && (n === 1n || n === -1n)) return { n: n === -1n && k % 2n === 1n ? -1n : 1n, d: 1n };
        const bits = Math.max(bitLen(n), bitLen(d));
        if (k > 1000000n || bits * Number(k) > LIMITS.bits + 64) return Math.pow(ratToFloat(n, d), Number(k));
        return guard(n ** k, d ** k);
    }

    /** a ^ b; exact for integer powers and for rational roots of perfect powers. */
    function nPow(a, b) {
        if (isR(b) && b.d === 1n) return nPowInt(a, b.n);
        if (isR(a) && isR(b) && b.d <= 64n && (a.n >= 0n || b.d % 2n === 1n)) {
            const neg = a.n < 0n;
            const rn = iroot(neg ? -a.n : a.n, Number(b.d));
            const rd = rn === null ? null : iroot(a.d, Number(b.d));
            if (rn !== null && rd !== null) return nPowInt({ n: neg ? -rn : rn, d: rd }, b.n);
        }
        const x = toF(a);
        const y = toF(b);
        if (x < 0 && !Number.isInteger(y)) {
            if (isR(b) && b.d % 2n === 1n) {
                const m = Math.pow(-x, y);
                return b.n % 2n === 0n ? m : -m;
            }
            return NaN;
        }
        if (isR(b) && b.n === 1n && b.d === 2n) return Math.sqrt(x);
        if (isR(b) && b.n === 1n && b.d === 3n) return Math.cbrt(x);
        return Math.pow(x, y);
    }

    /** Natural log of a positive exact or float value, even beyond 1e308. */
    function lnBig(x) {
        if (x < BIG_FLOAT) return Math.log(Number(x));
        const shift = bitLen(x) - 64;
        return Math.log(Number(x >> BigInt(shift))) + shift * Math.LN2;
    }
    function nLn(a) { return isR(a) ? lnBig(a.n) - lnBig(a.d) : Math.log(a); }

    /* ================================================================== */
    /* Units: dimension vectors, exact scales, prefixes, names             */
    /* ================================================================== */

    // Dimensions: L length, M mass, T time, I current, K temperature,
    // D data, A angle.
    const DIM_LETTERS = 'LMTIKDA';
    const NDIM = DIM_LETTERS.length;

    function dimv(spec) {
        const v = new Array(NDIM).fill(0);
        if (!spec) return v;
        for (const part of spec.split(' ')) {
            const m = /^([LMTIKDA])(-?\d+)?$/.exec(part);
            v[DIM_LETTERS.indexOf(m[1])] += m[2] ? Number(m[2]) : 1;
        }
        return v;
    }
    const DIM_L = dimv('L');
    const DIM_ANGLE = dimv('A');
    const DIM_TEMP = dimv('K');
    const dimEq = (a, b) => a.every((x, i) => x === b[i]);
    const dimZero = (d) => d.every((x) => x === 0);

    function scaleOf(spec) {
        if (typeof spec === 'number') return fromNum(spec);
        const parts = String(spec).split('/');
        return parts.length === 2 ? nDiv(decimalRat(parts[0]), decimalRat(parts[1])) : decimalRat(parts[0]);
    }

    const PI = Math.PI;

    // [category, symbol, name, plural, scale to SI base, dimension, options]
    const UNIT_SPECS = [
        ['length', 'm', 'meter', 'meters', 1, 'L', { names: ['metre', 'metres'], prefix: 'si' }],
        ['length', 'in', 'inch', 'inches', '0.0254', 'L'],
        ['length', 'ft', 'foot', 'feet', '0.3048', 'L'],
        ['length', 'yd', 'yard', 'yards', '0.9144', 'L'],
        ['length', 'mi', 'mile', 'miles', '1609.344', 'L'],
        ['length', 'nmi', 'nautical mile', 'nautical miles', 1852, 'L'],
        ['area', 'acre', 'acre', 'acres', '4046.8564224', 'L2'],
        ['area', 'ha', 'hectare', 'hectares', 10000, 'L2'],
        ['volume', 'L', 'liter', 'liters', '0.001', 'L3', { aliases: ['l'], names: ['litre', 'litres'], prefix: 'si' }],
        ['volume', 'gal', 'gallon', 'gallons', '0.003785411784', 'L3'],
        ['volume', 'qt', 'quart', 'quarts', '0.000946352946', 'L3'],
        ['volume', 'pt', 'pint', 'pints', '0.000473176473', 'L3'],
        ['volume', 'cup', 'cup', 'cups', '0.0002365882365', 'L3'],
        ['volume', 'fl oz', 'fluid ounce', 'fluid ounces', '0.0000295735295625', 'L3', { aliases: ['floz'] }],
        ['volume', 'tbsp', 'tablespoon', 'tablespoons', '0.00001478676478125', 'L3'],
        ['volume', 'tsp', 'teaspoon', 'teaspoons', '0.00000492892159375', 'L3'],
        ['mass', 'g', 'gram', 'grams', '0.001', 'M', { names: ['gramme', 'grammes'], prefix: 'si' }],
        ['mass', 'tonne', 'tonne', 'tonnes', 1000, 'M', { names: ['metric ton', 'metric tons'] }],
        ['mass', 'lb', 'pound', 'pounds', '0.45359237', 'M', { aliases: ['lbs'] }],
        ['mass', 'oz', 'ounce', 'ounces', '0.028349523125', 'M'],
        ['mass', 'ton', 'ton', 'tons', '907.18474', 'M', { names: ['short ton', 'short tons'] }],
        ['mass', 'st', 'stone', 'stone', '6.35029318', 'M'],
        ['time', 's', 'second', 'seconds', 1, 'T', { aliases: ['sec', 'secs'], prefix: 'si' }],
        ['time', 'min', 'minute', 'minutes', 60, 'T', { aliases: ['mins'] }],
        ['time', 'h', 'hour', 'hours', 3600, 'T', { aliases: ['hr', 'hrs'] }],
        ['time', 'day', 'day', 'days', 86400, 'T'],
        ['time', 'week', 'week', 'weeks', 604800, 'T', { aliases: ['wk', 'wks'] }],
        ['time', 'month', 'month', 'months', 2629746, 'T'],
        ['time', 'year', 'year', 'years', 31556952, 'T', { aliases: ['yr', 'yrs'] }],
        ['speed', 'mph', 'mile per hour', 'miles per hour', '0.44704', 'L T-1', { expand: [['mi', 1], ['h', -1]] }],
        ['speed', 'kph', 'kilometer per hour', 'kilometers per hour', '5/18', 'L T-1', { aliases: ['kmh'], expand: [['km', 1], ['h', -1]] }],
        ['speed', 'kn', 'knot', 'knots', '1852/3600', 'L T-1', { aliases: ['kt'], expand: [['nmi', 1], ['h', -1]] }],
        ['acceleration', 'gn', 'standard gravity', 'standard gravities', '9.80665', 'L T-2', { names: ['gee'] }],
        ['force', 'N', 'newton', 'newtons', 1, 'M L T-2', { prefix: 'si' }],
        ['force', 'lbf', 'pound-force', 'pounds-force', '4.4482216152605', 'M L T-2', { names: ['pound force', 'pounds force'] }],
        ['force', 'kgf', 'kilogram-force', 'kilograms-force', '9.80665', 'M L T-2', { names: ['kilogram force', 'kilograms force'] }],
        ['pressure', 'Pa', 'pascal', 'pascals', 1, 'M L-1 T-2', { prefix: 'si' }],
        ['pressure', 'bar', 'bar', 'bars', 100000, 'M L-1 T-2', { prefix: 'si' }],
        ['pressure', 'psi', 'pound per square inch', 'pounds per square inch', '4.4482216152605/0.00064516', 'M L-1 T-2'],
        ['pressure', 'atm', 'atmosphere', 'atmospheres', 101325, 'M L-1 T-2'],
        ['pressure', 'mmHg', 'millimeter of mercury', 'millimeters of mercury', '133.322387415', 'M L-1 T-2'],
        ['pressure', 'torr', 'torr', 'torr', '101325/760', 'M L-1 T-2'],
        ['energy', 'J', 'joule', 'joules', 1, 'M L2 T-2', { prefix: 'si' }],
        ['energy', 'cal', 'calorie', 'calories', '4.184', 'M L2 T-2', { prefix: 'si' }],
        ['energy', 'Wh', 'watt-hour', 'watt-hours', 3600, 'M L2 T-2', { names: ['watt hour', 'watt hours'], prefix: 'si' }],
        ['energy', 'eV', 'electronvolt', 'electronvolts', '1.602176634e-19', 'M L2 T-2', { prefix: 'si' }],
        ['energy', 'BTU', 'British thermal unit', 'British thermal units', '1055.05585262', 'M L2 T-2', { aliases: ['Btu', 'btu'] }],
        ['power', 'W', 'watt', 'watts', 1, 'M L2 T-3', { prefix: 'si' }],
        ['power', 'hp', 'horsepower', 'horsepower', '745.69987158227022', 'M L2 T-3'],
        ['temperature', 'K', 'kelvin', 'kelvins', 1, 'K'],
        ['temperature', '°C', 'degree Celsius', 'degrees Celsius', 1, 'K', { aliases: ['degC', '℃'], names: ['celsius'], offset: '273.15' }],
        ['temperature', '°F', 'degree Fahrenheit', 'degrees Fahrenheit', '5/9', 'K', { aliases: ['degF', '℉'], names: ['fahrenheit'], offset: '459.67' }],
        ['data', 'b', 'bit', 'bits', 1, 'D', { prefix: 'data' }],
        ['data', 'B', 'byte', 'bytes', 8, 'D', { prefix: 'data' }],
        ['angle', 'rad', 'radian', 'radians', 1, 'A', { prefix: 'si' }],
        ['angle', 'deg', 'degree', 'degrees', PI / 180, 'A', { aliases: ['°'] }],
        ['angle', 'grad', 'gradian', 'gradians', PI / 200, 'A', { aliases: ['gon'] }],
        ['angle', 'turn', 'turn', 'turns', 2 * PI, 'A', { aliases: ['rev', 'revs'], names: ['revolution', 'revolutions'] }],
        ['angle', 'arcmin', 'arcminute', 'arcminutes', PI / 10800, 'A'],
        ['angle', 'arcsec', 'arcsecond', 'arcseconds', PI / 648000, 'A'],
        ['frequency', 'Hz', 'hertz', 'hertz', 1, 'T-1', { prefix: 'si' }],
        ['frequency', 'rpm', 'revolution per minute', 'revolutions per minute', '1/60', 'T-1'],
        ['electric', 'A', 'ampere', 'amperes', 1, 'I', { names: ['amp', 'amps'], prefix: 'si' }],
        ['electric', 'V', 'volt', 'volts', 1, 'M L2 T-3 I-1', { prefix: 'si' }],
        ['electric', 'Ω', 'ohm', 'ohms', 1, 'M L2 T-3 I-2', { prefix: 'si' }],
        ['electric', 'Ah', 'ampere-hour', 'ampere-hours', 3600, 'I T', { names: ['amp hour', 'amp hours'], prefix: 'si' }]
    ];

    function makeUnit(spec) {
        const [cat, sym, name, plural, scale, dim, opts = {}] = spec;
        return {
            sym, name, plural, cat,
            dim: dimv(dim),
            scale: scaleOf(scale),
            offset: opts.offset ? decimalRat(opts.offset) : ZERO,
            affine: !!opts.offset,
            prefix: opts.prefix || null,
            aliases: opts.aliases || [],
            names: opts.names || [],
            expandSpec: opts.expand || null,
            expand: null,
            base: null
        };
    }

    const UNITS = UNIT_SPECS.map(makeUnit);
    const UNIT_SYM = new Map();
    const UNIT_NAME = new Map();
    for (const u of UNITS) {
        UNIT_SYM.set(u.sym, u);
        u.aliases.forEach((a) => UNIT_SYM.set(a, u));
        [u.name, u.plural, ...u.names].forEach((n) => UNIT_NAME.set(n.toLowerCase(), u));
    }
    const unitBySym = (s) => UNIT_SYM.get(s);
    const DEG_UNIT = unitBySym('deg');
    const RAD_UNIT = unitBySym('rad');
    const NAMED_DERIVED = ['N', 'J', 'W', 'Pa', 'V', 'Ω'].map(unitBySym);

    // [symbol, long name, power of ten (or of two for binary), kind]
    const PREFIXES = [
        ['da', 'deca', 1, 'si'], ['Ki', 'kibi', 10, 'bin'], ['Mi', 'mebi', 20, 'bin'], ['Gi', 'gibi', 30, 'bin'],
        ['Ti', 'tebi', 40, 'bin'], ['Pi', 'pebi', 50, 'bin'], ['Ei', 'exbi', 60, 'bin'],
        ['Y', 'yotta', 24, 'si'], ['Z', 'zetta', 21, 'si'], ['E', 'exa', 18, 'si'], ['P', 'peta', 15, 'si'],
        ['T', 'tera', 12, 'si'], ['G', 'giga', 9, 'si'], ['M', 'mega', 6, 'si'], ['k', 'kilo', 3, 'si'],
        ['K', 'kilo', 3, 'data'], ['h', 'hecto', 2, 'si'], ['d', 'deci', -1, 'si'], ['c', 'centi', -2, 'si'],
        ['m', 'milli', -3, 'si'], ['µ', 'micro', -6, 'si'], ['u', 'micro', -6, 'si'], ['n', 'nano', -9, 'si'],
        ['p', 'pico', -12, 'si'], ['f', 'femto', -15, 'si']
    ].map(([sym, long, exp, kind]) => ({
        sym, long, exp, kind,
        factor: kind === 'bin' ? { n: 2n ** BigInt(exp), d: 1n } : pow10(exp)
    }));
    const LONG_PREFIXES = PREFIXES.filter((p) => p.sym !== 'u' && p.sym !== 'K')
        .concat([{ sym: 'da', long: 'deka', exp: 1, kind: 'si', factor: pow10(1) }]);

    function prefixAllowed(base, p) {
        if (base.prefix === 'si') return p.kind === 'si';
        if (base.prefix === 'data') return p.kind === 'bin' || p.kind === 'data' || (p.kind === 'si' && p.exp > 0);
        return false;
    }

    const DERIVED = new Map();
    function derive(base, p) {
        const sym = (p.sym === 'u' ? 'µ' : p.sym) + base.sym;
        let u = DERIVED.get(sym);
        if (!u) {
            u = {
                sym, name: p.long + base.name, plural: p.long + base.plural, cat: base.cat,
                dim: base.dim, scale: nMul(p.factor, base.scale), offset: ZERO, affine: false,
                prefix: null, aliases: [], names: [], expandSpec: null, expand: null, base
            };
            DERIVED.set(sym, u);
        }
        return u;
    }

    function prefixedUnit(text) {
        for (const p of PREFIXES) {
            if (text.length <= p.sym.length || !text.startsWith(p.sym)) continue;
            const base = UNIT_SYM.get(text.slice(p.sym.length));
            if (base && prefixAllowed(base, p)) return derive(base, p);
        }
        const lower = text.toLowerCase();
        for (const p of LONG_PREFIXES) {
            if (lower.length <= p.long.length || !lower.startsWith(p.long)) continue;
            const base = UNIT_NAME.get(lower.slice(p.long.length));
            if (base && prefixAllowed(base, p)) return derive(base, p);
        }
        return null;
    }

    const LOOKUP_CACHE = new Map();
    /** The unit a single word names (symbol, alias, long name, prefixed), or null. */
    function findUnit(text) {
        if (LOOKUP_CACHE.has(text)) return LOOKUP_CACHE.get(text);
        const u = UNIT_SYM.get(text) || UNIT_NAME.get(text.toLowerCase()) || prefixedUnit(text) || null;
        if (LOOKUP_CACHE.size < 4000) LOOKUP_CACHE.set(text, u);
        return u;
    }

    /** A word as a unit expression: 'km' → [km^1], 'sqft' → [ft^2]; or null. */
    function lookupUE(word) {
        const u = findUnit(word);
        if (u) return [{ def: u, p: 1 }];
        const m = /^(sq|cu)(.+)$/.exec(word);
        if (m) {
            const b = findUnit(m[2]);
            if (b && dimEq(b.dim, DIM_L)) return [{ def: b, p: m[1] === 'sq' ? 2 : 3 }];
        }
        return null;
    }

    /* Unit expressions: arrays of { def, p } factors ------------------- */

    function ueDim(ue) {
        const d = new Array(NDIM).fill(0);
        if (ue) for (const f of ue) for (let i = 0; i < NDIM; i++) d[i] += f.def.dim[i] * f.p;
        return d;
    }
    function ueScale(ue) {
        let s = ONE;
        if (ue) for (const f of ue) s = nMul(s, nPowInt(f.def.scale, BigInt(f.p)));
        return s;
    }
    const ueHasAffine = (ue) => !!ue && ue.some((f) => f.def.affine);
    const isTempSingle = (ue) => !!ue && ue.length === 1 && ue[0].p === 1 && dimEq(ue[0].def.dim, DIM_TEMP);
    function ueEq(a, b) {
        if (!a || !b) return !a && !b;
        if (a.length !== b.length) return false;
        return a.every((f) => b.some((g) => g.def === f.def && g.p === f.p));
    }
    /** Product of two unit expressions, merging identical units only. */
    function ueMul(a, b, sign) {
        const out = a.map((f) => ({ def: f.def, p: f.p }));
        for (const g of b) {
            const f = out.find((x) => x.def === g.def);
            if (f) f.p += g.p * sign;
            else out.push({ def: g.def, p: g.p * sign });
        }
        return out.filter((f) => f.p !== 0);
    }
    /** Replace composite units (mph → mi/h) by their parts. */
    function ueExpand(ue) {
        if (!ue || !ue.some((f) => f.def.expandSpec)) return ue;
        let out = [];
        for (const f of ue) {
            if (!f.def.expandSpec) { out = ueMul(out, [f], 1); continue; }
            if (!f.def.expand) f.def.expand = f.def.expandSpec.map(([s, p]) => ({ def: findUnit(s), p }));
            out = ueMul(out, f.def.expand.map((g) => ({ def: g.def, p: g.p * f.p })), 1);
        }
        return out;
    }

    function ueStr(ue) {
        if (!ue || !ue.length) return '';
        const part = (f, p) => (p === 1 ? f.def.sym : `${f.def.sym}^${p}`);
        const num = ue.filter((f) => f.p > 0).map((f) => part(f, f.p));
        const den = ue.filter((f) => f.p < 0);
        if (!num.length) return ue.map((f) => part(f, f.p)).join('*');
        if (!den.length) return num.join('*');
        const d = den.map((f) => part(f, -f.p));
        return `${num.join('*')}/${d.length === 1 ? d[0] : `(${d.join('*')})`}`;
    }

    const DIM_NAMES = new Map([
        ['L', 'length'], ['L2', 'area'], ['L3', 'volume'], ['M', 'mass'], ['T', 'time'],
        ['L T-1', 'speed'], ['L T-2', 'acceleration'], ['M L T-2', 'force'], ['M L-1 T-2', 'pressure'],
        ['M L2 T-2', 'energy'], ['M L2 T-3', 'power'], ['K', 'temperature'], ['D', 'data size'],
        ['A', 'angle'], ['T-1', 'frequency'], ['I', 'electric current'], ['M L2 T-3 I-1', 'voltage'],
        ['M L2 T-3 I-2', 'resistance'], ['I T', 'electric charge'], ['D T-1', 'data rate'],
        ['M L-3', 'density'], ['L3 T-1', 'flow rate'], ['A T-1', 'angular speed']
    ].map(([k, v]) => [dimv(k).join(','), v]));

    function dimNameOf(ue) {
        if (!ue || !ue.length) return 'a plain number';
        const d = ueDim(ue);
        if (dimZero(d)) return 'a plain number';
        return DIM_NAMES.get(d.join(',')) || `${ueStr(ue)} units`;
    }

    /* ================================================================== */
    /* Tokenizer                                                           */
    /* ================================================================== */

    const ID_RE = /[\p{L}_°℃℉][\p{L}\d_]*/uy;
    const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
    const OP_CHARS = {
        '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '⋅': '*', '/': '/', '÷': '/',
        '^': '^', '(': '(', ')': ')', ',': ',', '!': '!', '%': '%', '=': '=', '<': '<', '>': '>',
        '≠': '!=', '≤': '<=', '≥': '>=', '√': '√'
    };
    const OP_PAIRS = { '==': '==', '!=': '!=', '<=': '<=', '>=': '>=', '**': '^' };
    const SPACES = new Set([' ', '\t', ' ', ' ', ' ', ' ']);
    const isDigit = (c) => c >= '0' && c <= '9';

    const normId = (s) => s.replace(/μ/g, 'µ').replace(/Ω/g, 'Ω');

    function readNumber(src, i, to, depth) {
        const s = i;
        const c1 = src[i + 1] || '';
        if (src[i] === '0' && /[xXbBoO]/.test(c1)) {
            const radix = { x: 16, b: 2, o: 8 }[c1.toLowerCase()];
            const ok = radix === 16 ? /[0-9a-fA-F]/ : radix === 2 ? /[01]/ : /[0-7]/;
            const label = { 16: 'hex', 2: 'binary', 8: 'octal' }[radix];
            let j = i + 2;
            let digits = '';
            while (j < to && (ok.test(src[j]) || (src[j] === '_' && digits && ok.test(src[j + 1] || '')))) {
                if (src[j] !== '_') digits += src[j];
                j++;
            }
            if (digits) {
                if (j < to && /[0-9A-Za-z]/.test(src[j])) {
                    throw new EngineError(`'${src.slice(s, j + 1)}' isn't a valid ${label} number`, s, j + 1);
                }
                if (digits.length > 7000) throw new EngineError(TOO_LARGE, s, j);
                const n = BigInt(`0${c1.toLowerCase()}${digits}`);
                return { type: 'num', value: guard(n, 1n), radix, text: src.slice(s, j), s, e: j };
            }
        }
        let j = i;
        const run = () => {
            let out = '';
            while (j < to && (isDigit(src[j]) || (src[j] === '_' && out && isDigit(src[j + 1] || '')))) {
                if (src[j] !== '_') out += src[j];
                j++;
            }
            return out;
        };
        let intDigits = run();
        // 1,234,567 groups are read as one number outside brackets only.
        if (depth === 0 && intDigits.length >= 1 && intDigits.length <= 3 && !src.slice(s, j).includes('_')) {
            while (src[j] === ',' && /^\d{3}(?!\d)/.test(src.slice(j + 1, Math.min(j + 5, to)))) {
                intDigits += src.slice(j + 1, j + 4);
                j += 4;
            }
        }
        let frac = '';
        if (src[j] === '.' && isDigit(src[j + 1] || '')) {
            j++;
            frac = run();
        } else if (src[j] === '.' && intDigits && src[j + 1] !== '.') {
            j++;
        }
        let exp = 0;
        if ((src[j] === 'e' || src[j] === 'E') && j + 1 < to) {
            const k = (src[j + 1] === '+' || src[j + 1] === '-') ? j + 2 : j + 1;
            if (isDigit(src[k] || '')) {
                let m = k;
                while (m < to && isDigit(src[m])) m++;
                exp = Number(src.slice(j + 1, m));
                j = m;
            }
        }
        const text = src.slice(s, j);
        const scale = exp - frac.length;
        let value;
        if (!Number.isFinite(exp) || Math.abs(scale) > 6000) {
            value = Number(`${intDigits || '0'}.${frac || '0'}e${exp}`);
            if (!Number.isFinite(value)) throw new EngineError(TOO_LARGE, s, j);
        } else {
            const n = BigInt((intDigits + frac) || '0');
            value = scale >= 0 ? rat(n * 10n ** BigInt(scale), 1n) : rat(n, 10n ** BigInt(-scale));
        }
        return { type: 'num', value, radix: 10, text, s, e: j };
    }

    /** Tokens of src[from, to) with positions relative to the whole line. */
    function tokenize(src, from, to) {
        const toks = [];
        let i = from;
        let depth = 0;
        while (i < to) {
            const ch = src[i];
            if (SPACES.has(ch)) { i++; continue; }
            if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] || ''))) {
                const t = readNumber(src, i, to, depth);
                toks.push(t);
                i = t.e;
                continue;
            }
            ID_RE.lastIndex = i;
            const m = ID_RE.exec(src);
            if (m && m.index === i) {
                const text = m[0].slice(0, to - i);
                toks.push({ type: 'id', value: normId(text), text, s: i, e: i + text.length });
                i += text.length;
                continue;
            }
            if (SUPERSCRIPT[ch] || ch === '⁻') {
                let j = i;
                let neg = false;
                if (src[j] === '⁻') { neg = true; j++; }
                let digits = '';
                while (j < to && SUPERSCRIPT[src[j]]) digits += SUPERSCRIPT[src[j++]];
                if (!digits) throw new EngineError("A superscript minus needs a digit after it, like s⁻¹", i, j);
                toks.push({ type: 'op', value: '^', text: src.slice(i, j), s: i, e: i });
                if (neg) toks.push({ type: 'op', value: '-', text: '⁻', s: i, e: i + 1 });
                toks.push({ type: 'num', value: { n: BigInt(digits), d: 1n }, radix: 10, text: src.slice(i, j), s: i, e: j });
                i = j;
                continue;
            }
            const pair = OP_PAIRS[src.slice(i, i + 2)];
            if (pair && i + 1 < to) {
                toks.push({ type: 'op', value: pair, text: src.slice(i, i + 2), s: i, e: i + 2 });
                i += 2;
                continue;
            }
            const op = OP_CHARS[ch];
            if (op) {
                if (op === '(') depth++;
                else if (op === ')') depth = Math.max(0, depth - 1);
                toks.push({ type: 'op', value: op, text: ch, s: i, e: i + 1 });
                i++;
                continue;
            }
            if (/[$€£¥₹₩]/.test(ch)) {
                throw new EngineError("Currency symbols aren't worked out here — type the plain amount, like 1200", i, i + 1);
            }
            if (ch === ':') throw new EngineError("Unexpected ':' — a label goes at the start of a line, like Rent: 1200", i, i + 1);
            const cp = String.fromCodePoint(src.codePointAt(i));
            throw new EngineError(`Unexpected character '${cp}'`, i, i + cp.length);
        }
        toks.push({ type: 'end', value: '', text: '', s: to, e: to });
        return toks;
    }

    /* ================================================================== */
    /* Parser (Pratt) → AST                                                */
    /* ================================================================== */

    const FORMAT_WORDS = Object.assign(dict(), {
        hex: 'hex', hexadecimal: 'hex', bin: 'bin', binary: 'bin', oct: 'oct', octal: 'oct',
        dec: 'dec', decimal: 'dec', sci: 'sci', scientific: 'sci', eng: 'eng', engineering: 'eng',
        fraction: 'frac', fractions: 'frac', frac: 'frac', percent: 'pct', percentage: 'pct'
    });
    const KEYWORDS = new Set(['to', 'as', 'in', 'of', 'mod', 'ans', 'total', 'sum', 'average', 'avg',
        'true', 'false', 'sq', 'cu']);
    const LINE_REF = /^[Ll]ine(\d{1,6})$/;

    const isOp = (t, v) => !!t && t.type === 'op' && t.value === v;
    function peek(P, k) { return P.toks[Math.min(P.i + (k || 0), P.toks.length - 1)]; }
    function next(P) {
        const t = P.toks[P.i];
        if (P.i < P.toks.length - 1) P.i++;
        return t;
    }

    function leftoverError(t) {
        if (t.type === 'op') {
            if (t.value === '=') return new EngineError('To compare, use ==. To store a value, put a name on the left, like x = 5', t.s, t.e);
            if (t.value === ')') return new EngineError("Unexpected ')' — there's no '(' for it to close", t.s, t.e);
            if (t.value === ',') return new EngineError('Unexpected comma — commas separate values inside brackets, like max(1, 2)', t.s, t.e);
            if (t.value === '(') return new EngineError("Missing operator before '(' — write 2*(3+4), or turn on implicit multiplication in Settings", t.s, t.e);
            return new EngineError(`Unexpected '${t.text}'`, t.s, t.e);
        }
        if (t.type === 'num') return new EngineError(`Missing operator before '${t.text}'`, t.s, t.e);
        if (t.type === 'id') return new EngineError(`Missing operator before '${t.text}' — write 2*${t.text}, or turn on implicit multiplication in Settings`, t.s, t.e);
        return new EngineError('Unexpected text', t.s, t.e);
    }

    /** A unit (possibly two to four words, or sq/cu + length) starting at token idx. */
    function unitAt(P, idx) {
        const t = P.toks[idx];
        if (!t || t.type !== 'id') return null;
        const w = t.value;
        if (P.scope.isVar(w)) return null;
        for (let k = 4; k >= 2; k--) {
            const words = [];
            for (let j = 0; j < k; j++) {
                const tj = P.toks[idx + j];
                if (!tj || tj.type !== 'id') break;
                words.push(tj.value);
            }
            if (words.length !== k) continue;
            const joined = words.join(' ');
            const u = UNIT_SYM.get(joined) || UNIT_NAME.get(joined.toLowerCase());
            if (u) return { ue: [{ def: u, p: 1 }], next: idx + k, e: P.toks[idx + k - 1].e };
        }
        const lw = w.toLowerCase();
        if (lw === 'sq' || lw === 'square' || lw === 'cu' || lw === 'cubic') {
            const n = P.toks[idx + 1];
            if (n && n.type === 'id') {
                const u = findUnit(n.value);
                if (u && dimEq(u.dim, DIM_L)) return { ue: [{ def: u, p: lw[0] === 's' ? 2 : 3 }], next: idx + 2, e: n.e };
            }
        }
        if (KEYWORDS.has(w) && w !== 'in') return null;
        const ue = lookupUE(w);
        return ue ? { ue, next: idx + 1, e: t.e } : null;
    }

    function implicitBp(P) {
        if (P.scope.implicit) return 40;
        return unitAt(P, P.i) ? 40 : 0;
    }

    const isBareNumber = (n) => n.t === 'num' || (n.t === 'neg' && n.a.t === 'num');

    /** 'in' converts only after a quantity and before a unit or format word. */
    function isConversionIn(P, left) {
        if (isBareNumber(left)) return false;
        const nx = peek(P, 1);
        if (!nx || nx.type !== 'id') return false;
        return !!FORMAT_WORDS[nx.value.toLowerCase()] || !!unitAt(P, P.i + 1);
    }

    function leftBp(P, t, left) {
        if (t.type === 'op') {
            switch (t.value) {
                case '+': case '-': return 30;
                case '*': case '/': return 40;
                case '^': return 60;
                case '!': case '%': return 70;
                case '==': case '!=': case '<': case '<=': case '>': case '>=': return 20;
                case '(': case '√': return P.scope.implicit ? 40 : 0;
                default: return 0;
            }
        }
        if (t.type === 'id') {
            const w = t.value;
            if (w === 'to' || w === 'as') return 10;
            if (w === 'in') return isConversionIn(P, left) ? 10 : implicitBp(P);
            if (w === 'mod' || w === 'of') return 40;
            return implicitBp(P);
        }
        return 0;
    }

    function expr(P, rbp) {
        if (++P.depth > LIMITS.nesting) {
            const t = peek(P);
            throw new EngineError('This line is nested too deeply — split it into smaller steps', t.s, t.e);
        }
        let left = nud(P);
        for (;;) {
            const t = peek(P);
            const lbp = leftBp(P, t, left);
            if (lbp <= rbp) break;
            left = led(P, t, left, lbp);
        }
        P.depth--;
        return left;
    }

    const bin = (op, a, b, implicit) => ({ t: 'bin', op, a, b, implicit: !!implicit, s: a.s, e: b.e });

    function led(P, t, left, lbp) {
        if (t.type === 'op') {
            switch (t.value) {
                case '+': case '-': next(P); return bin(t.value, left, expr(P, 30));
                case '*': next(P); return bin('*', left, expr(P, 40));
                case '/': {
                    next(P);
                    let right = expr(P, 40);
                    if (right.t === 'num' && unitAt(P, P.i)) {
                        const unit = expr(P, 40);
                        right = { t: 'numunit', num: right, unit, s: right.s, e: unit.e };
                    }
                    return bin('/', left, right);
                }
                case '^': next(P); return bin('^', left, expr(P, 59));
                case '!': next(P); return { t: 'fact', a: left, s: left.s, e: t.e };
                case '%': next(P); return { t: 'pct', a: left, s: left.s, e: t.e };
                case '(': case '√': return bin('*', left, expr(P, 40), true);
                default: {
                    next(P);
                    const right = expr(P, 20);
                    return { t: 'cmp', op: t.value, a: left, b: right, s: left.s, e: right.e };
                }
            }
        }
        const w = t.value;
        if (lbp === 10) {
            next(P);
            const target = parseTarget(P, t);
            return { t: 'conv', a: left, target, s: left.s, e: target.e };
        }
        if (w === 'mod' || w === 'of') { next(P); return bin(w, left, expr(P, 40)); }
        return bin('*', left, expr(P, 40), true);
    }

    function parseCall(P, t) {
        const open = next(P);
        const args = [];
        if (isOp(peek(P), ')')) {
            next(P);
        } else {
            for (;;) {
                if (args.length >= LIMITS.args) {
                    const x = peek(P);
                    throw new EngineError(`A function can take at most ${LIMITS.args} values`, x.s, x.e);
                }
                args.push(expr(P, 0));
                const sep = peek(P);
                if (isOp(sep, ',')) { next(P); continue; }
                if (isOp(sep, ')')) { next(P); break; }
                if (sep.type === 'end') throw new EngineError("Missing ')'", open.s, sep.s);
                throw leftoverError(sep);
            }
        }
        const close = P.toks[P.i - 1];
        return { t: 'call', name: t.value, user: !FN[t.value], args, s: t.s, e: close.e };
    }

    function nud(P) {
        const t = next(P);
        if (t.type === 'num') return { t: 'num', v: t.value, radix: t.radix, s: t.s, e: t.e };
        if (t.type === 'end') {
            const prev = P.toks.length > 1 ? P.toks[P.toks.length - 2] : null;
            if (prev) throw new EngineError(`Something is missing after '${prev.text}'`, prev.s, prev.e);
            throw new EngineError('Type something to work out', t.s, t.e);
        }
        if (t.type === 'op') {
            switch (t.value) {
                case '(': {
                    if (isOp(peek(P), ')')) throw new EngineError('Empty brackets — put a value inside', t.s, peek(P).e);
                    const inner = expr(P, 0);
                    const close = peek(P);
                    if (close.type === 'end') throw new EngineError("Missing ')'", t.s, close.s);
                    if (!isOp(close, ')')) throw leftoverError(close);
                    next(P);
                    return { t: 'group', a: inner, s: t.s, e: close.e };
                }
                case '-': {
                    const a = expr(P, 50);
                    return { t: 'neg', a, s: t.s, e: a.e };
                }
                case '+': return expr(P, 50);
                case '√': {
                    const a = expr(P, 60);
                    return { t: 'call', name: 'sqrt', user: false, args: [a], s: t.s, e: a.e };
                }
                default: throw leftoverError(t);
            }
        }
        return nudId(P, t);
    }

    function nudId(P, t) {
        const w = t.value;
        const s = t.s;
        const e = t.e;
        const nx = peek(P);
        if (w === 'true' || w === 'false') return { t: 'bool', v: w === 'true', s, e };
        if (isOp(nx, '(') && (P.scope.isFunc(w) || FN[w])) return parseCall(P, t);
        if (P.scope.isVar(w)) return { t: 'var', name: w, s, e };
        if (CONST[w]) return { t: 'const', name: w, s, e };
        if (w === 'ans') return { t: 'ref', kind: 'ans', s, e };
        if (w === 'total' || w === 'sum') return { t: 'ref', kind: 'total', word: w, s, e };
        if (w === 'average' || w === 'avg') return { t: 'ref', kind: 'avg', word: w, s, e };
        const lm = LINE_REF.exec(w);
        if (lm) return { t: 'ref', kind: 'line', n: Number(lm[1]), s, e };
        const u = unitAt(P, P.i - 1);
        if (u) {
            P.i = u.next;
            return { t: 'unit', ue: u.ue, s, e: u.e };
        }
        const examples = { to: '5 km to mi', as: '0.25 as %', of: '20% of 150', mod: '10 mod 3', in: '100 km in mi' };
        if (hasOwn(examples, w)) throw new EngineError(`'${w}' needs a value before it, like ${examples[w]}`, s, e);
        if (FN[w] || P.scope.isFunc(w)) {
            throw new EngineError(`Use brackets after ${w}, like ${FN[w] ? FN[w].example : `${w}(2)`}`, s, e);
        }
        if (isOp(nx, '(')) throw new EngineError(`Unknown function '${w}' — define it first, like ${w}(x) = x * 2`, s, e);
        return { t: 'var', name: w, s, e };
    }

    /* Conversion targets and unit expressions --------------------------- */

    function unitTerm(P) {
        const t = peek(P);
        let base;
        if (isOp(t, '(')) {
            const save = P.i;
            next(P);
            const inner = parseUnitExpr(P);
            if (!inner || !isOp(peek(P), ')')) { P.i = save; return null; }
            const close = next(P);
            base = { ue: inner.ue, s: t.s, e: close.e };
        } else if (t.type === 'num' && isR(t.value) && t.value.n === 1n && t.value.d === 1n && isOp(peek(P, 1), '/')) {
            next(P);
            base = { ue: [], s: t.s, e: t.e };
        } else {
            const u = unitAt(P, P.i);
            if (!u) return null;
            P.i = u.next;
            base = { ue: u.ue, s: t.s, e: u.e };
        }
        if (isOp(peek(P), '^')) {
            const caret = next(P);
            let sign = 1;
            if (isOp(peek(P), '-')) { next(P); sign = -1; }
            const n = next(P);
            if (n.type !== 'num' || !isR(n.value) || n.value.d !== 1n || n.value.n > 12n || n.value.n < 1n) {
                throw new EngineError('Unit powers must be small whole numbers, like m^2 or s^-1', caret.s, n.e);
            }
            const k = sign * Number(n.value.n);
            base = { ue: base.ue.map((f) => ({ def: f.def, p: f.p * k })), s: base.s, e: n.e };
        }
        return base;
    }

    function parseUnitExpr(P) {
        const first = unitTerm(P);
        if (!first) return null;
        let ue = first.ue.filter((f) => f.p !== 0);
        let e = first.e;
        for (;;) {
            const t = peek(P);
            if (isOp(t, '*') || isOp(t, '/')) {
                const save = P.i;
                next(P);
                const term = unitTerm(P);
                if (!term) {
                    const bad = peek(P);
                    if (bad.type === 'id') throw new EngineError(`Unknown unit '${bad.text}' — check the units list in Reference`, bad.s, bad.e);
                    P.i = save;
                    break;
                }
                ue = ueMul(ue, term.ue, isOp(t, '/') ? -1 : 1);
                e = term.e;
                continue;
            }
            if (t.type === 'id' && !KEYWORDS.has(t.value)) {
                const term = unitTerm(P);
                if (term) { ue = ueMul(ue, term.ue, 1); e = term.e; continue; }
            }
            break;
        }
        return { ue, s: first.s, e };
    }

    function parseTarget(P, opTok) {
        const t = peek(P);
        if (isOp(t, '%')) { next(P); return { kind: 'fmt', fmt: 'pct', s: t.s, e: t.e }; }
        if (t.type === 'id' && FORMAT_WORDS[t.value.toLowerCase()]) {
            next(P);
            return { kind: 'fmt', fmt: FORMAT_WORDS[t.value.toLowerCase()], s: t.s, e: t.e };
        }
        const r = parseUnitExpr(P);
        if (!r) {
            if (t.type === 'end') throw new EngineError(`Say what to convert to, like ${opTok.text} km or ${opTok.text} hex`, opTok.s, opTok.e);
            if (t.type === 'id') throw new EngineError(`Unknown unit '${t.text}' — check the units list in Reference`, t.s, t.e);
            throw new EngineError(`'${opTok.text}' needs a unit or format after it, like ${opTok.text} km or ${opTok.text} hex`, t.s, t.e);
        }
        if (!r.ue.length) throw new EngineError('That unit cancels out to a plain number — pick a unit to convert to', r.s, r.e);
        return { kind: 'unit', ue: r.ue, s: r.s, e: r.e };
    }

    /* Statements --------------------------------------------------------- */

    function scanSignature(toks) {
        let i = 2;
        const params = [];
        const ptoks = [];
        if (isOp(toks[i], ')')) {
            i++;
        } else {
            for (;;) {
                const t = toks[i];
                if (!t || t.type !== 'id') return null;
                params.push(t.value);
                ptoks.push(t);
                i++;
                if (isOp(toks[i], ',')) { i++; continue; }
                if (isOp(toks[i], ')')) { i++; break; }
                return null;
            }
        }
        if (!isOp(toks[i], '=')) return null;
        return { params, toks: ptoks, eq: toks[i], next: i + 1 };
    }

    function parseRest(P, eqTok) {
        if (peek(P).type === 'end' && eqTok) {
            throw new EngineError("Put a value after '=', like x = 5", eqTok.s, eqTok.e);
        }
        const node = expr(P, 0);
        const t = peek(P);
        if (t.type !== 'end') throw leftoverError(t);
        return node;
    }

    function parseStatement(toks, scope) {
        const t0 = toks[0];
        const t1 = toks[1];
        if (t0.type === 'id' && isOp(t1, '=')) {
            return { type: 'assign', name: t0.value, nameTok: t0, expr: parseRest({ toks, i: 2, scope, depth: 0 }, t1) };
        }
        if (t0.type === 'id' && isOp(t1, '(')) {
            const sig = scanSignature(toks);
            if (sig) return { type: 'func', name: t0.value, nameTok: t0, params: sig.params, paramToks: sig.toks, eq: sig.eq, bodyStart: sig.next };
        }
        return { type: 'expr', expr: parseRest({ toks, i: 0, scope, depth: 0 }, null) };
    }

    /* ================================================================== */
    /* Values and quantity arithmetic                                      */
    /* ================================================================== */

    // A value is { k: 'n', v: rational|float, u: unit expression|null, fmt }
    // or { k: 'b', v: boolean }.
    const qty = (v, u) => ({ k: 'n', v, u: u && u.length ? u : null, fmt: null });
    const boolV = (b) => ({ k: 'b', v: !!b });

    let CUR_O = null;   // options of the line being worked out (for messages)

    function describe(v) {
        try {
            return present(v, CUR_O || DEFAULTS).display || 'that value';
        } catch (_) {
            return 'that value';
        }
    }
    const kindOf = (v) => (v.k === 'b' ? 'true/false' : dimNameOf(v.u));

    function reqN(v, node) {
        if (v.k === 'b') fail("true/false can't be used in arithmetic — use if(condition, a, b) to choose a value", node);
        return v;
    }

    function simplify(v, ue) {
        if (!ue.length) return qty(v, null);
        const d = ueDim(ue);
        if (dimZero(d)) return qty(nMul(v, ueScale(ue)), null);
        if (ue.length >= 2 && !ueHasAffine(ue)) {
            const s = ueScale(ue);
            if (isR(s) && s.n === 1n && s.d === 1n) {
                const named = NAMED_DERIVED.find((u) => dimEq(u.dim, d));
                if (named) return qty(v, [{ def: named, p: 1 }]);
            }
        }
        return qty(v, ue);
    }

    function addQ(a, b, sign, node, verb) {
        if (!a.u && !b.u) return qty(sign > 0 ? nAdd(a.v, b.v) : nSub(a.v, b.v), null);
        if (!dimEq(ueDim(a.u), ueDim(b.u))) {
            const word = verb || (sign > 0 ? 'add' : 'subtract');
            if (word === 'subtract') fail(`Can't subtract ${describe(b)} from ${describe(a)} — ${kindOf(a)} and ${kindOf(b)} don't mix`, node);
            fail(`Can't ${word} ${describe(a)} and ${describe(b)} — ${kindOf(a)} and ${kindOf(b)} don't mix`, node);
        }
        let bv = b.v;
        if (!ueEq(a.u, b.u)) {
            if (ueHasAffine(a.u) || ueHasAffine(b.u)) {
                fail(`Can't ${sign > 0 ? 'add' : 'subtract'} ${describe(a)} and ${describe(b)} directly — convert one to the other's unit first`, node);
            }
            bv = nMul(bv, nDiv(ueScale(b.u), ueScale(a.u)));
        }
        return qty(sign > 0 ? nAdd(a.v, bv) : nSub(a.v, bv), a.u);
    }

    function mulQ(a, b, node) {
        if (!b.u) return qty(nMul(a.v, b.v), a.u);
        if (!a.u) return qty(nMul(a.v, b.v), b.u);
        if (ueHasAffine(a.u) || ueHasAffine(b.u)) fail(AFFINE, node);
        let v = nMul(a.v, b.v);
        const ue = ueExpand(a.u).map((f) => ({ def: f.def, p: f.p }));
        for (const fb of ueExpand(b.u)) {
            let idx = ue.findIndex((f) => f.def === fb.def);
            if (idx === -1) idx = ue.findIndex((f) => dimEq(f.def.dim, fb.def.dim));
            if (idx === -1) { ue.push({ def: fb.def, p: fb.p }); continue; }
            const fa = ue[idx];
            if (fa.def !== fb.def) v = nMul(v, nPowInt(nDiv(fb.def.scale, fa.def.scale), BigInt(fb.p)));
            fa.p += fb.p;
            if (fa.p === 0) ue.splice(idx, 1);
        }
        return simplify(v, ue);
    }

    function divQ(a, b, node) {
        if (isZero(b.v)) fail('Division by zero', node);
        if (b.u && ueHasAffine(b.u)) fail(AFFINE, node);
        const inv = qty(nDiv(ONE, b.v), b.u ? b.u.map((f) => ({ def: f.def, p: -f.p })) : null);
        return mulQ(a, inv, node);
    }

    function powQ(a, b, node) {
        if (b.u) fail(`A power can't have a unit — ${describe(b)} has one`, node);
        if (!a.u) {
            const r = nPow(a.v, b.v);
            if (typeof r === 'number' && Number.isNaN(r)) fail('No real result — a negative number has no real root of that kind', node);
            return qty(r, null);
        }
        if (ueHasAffine(a.u)) fail(AFFINE, node);
        if (!isR(b.v)) fail('Units can only be raised to whole-number or simple fraction powers, like m^2', node);
        const ue = [];
        for (const f of a.u) {
            const p = nMul({ n: BigInt(f.p), d: 1n }, b.v);
            if (!isR(p) || p.d !== 1n) fail(`Can't raise ${ueStr(a.u)} to that power — the unit's powers wouldn't be whole numbers`, node);
            const pn = Number(p.n);
            if (Math.abs(pn) > 60) fail('That unit power is too large', node);
            if (pn) ue.push({ def: f.def, p: pn });
        }
        const r = nPow(a.v, b.v);
        if (typeof r === 'number' && Number.isNaN(r)) fail('No real result — a negative number has no real root of that kind', node);
        return simplify(r, ue);
    }

    function modQ(a, b, node, kind) {
        if (isZero(b.v)) fail('Division by zero', node);
        let bv = b.v;
        if (a.u || b.u) {
            if (!dimEq(ueDim(a.u), ueDim(b.u))) fail(`Can't take ${describe(a)} ${kind} ${describe(b)} — ${kindOf(a)} and ${kindOf(b)} don't mix`, node);
            if (!ueEq(a.u, b.u)) bv = convertQ(b, a.u, node).v;
        }
        const q = nDiv(a.v, bv);
        const whole = kind === 'rem' ? nTrunc(q) : nFloor(q);
        return qty(nSub(a.v, nMul(bv, whole)), a.u);
    }

    /** Convert a quantity to a target unit expression (affine-aware). */
    function convertQ(a, tue, node, O) {
        let src = a.u;
        if (!src) {
            if (dimEq(ueDim(tue), DIM_ANGLE)) {
                src = [{ def: (O || CUR_O || DEFAULTS).angle === 'deg' ? DEG_UNIT : RAD_UNIT, p: 1 }];
            } else {
                fail(`${describe(a)} has no unit to convert — give it one first, like ${describe(a)} m to ${ueStr(tue)}`, node);
            }
        }
        if (!dimEq(ueDim(src), ueDim(tue))) {
            fail(`Can't convert ${describe(a)} to ${ueStr(tue)} — ${dimNameOf(src)} and ${dimNameOf(tue)} don't match`, node);
        }
        if (ueEq(src, tue)) return qty(a.v, tue);
        if (ueHasAffine(src) || ueHasAffine(tue)) {
            if (!isTempSingle(src) || !isTempSingle(tue)) fail(AFFINE, node);
            const fs = src[0].def;
            const ft = tue[0].def;
            const si = nMul(nAdd(a.v, fs.offset), fs.scale);
            return qty(nSub(nDiv(si, ft.scale), ft.offset), tue);
        }
        return qty(nMul(a.v, nDiv(ueScale(src), ueScale(tue))), tue);
    }

    /** Values of several arguments in the first argument's unit. */
    function sameUnits(vals, name, node) {
        const first = vals[0];
        const u = first.u;
        const out = [];
        for (const v of vals) {
            if (v.k === 'b') fail(`${name} needs numbers, not true/false`, node);
            if (!dimEq(ueDim(v.u), ueDim(u))) {
                fail(`${name} needs values of the same kind — ${describe(first)} and ${describe(v)} don't mix`, node);
            }
            out.push(ueEq(v.u, u) ? v.v : convertQ(v, u, node).v);
        }
        return { u, vs: out };
    }

    /* ================================================================== */
    /* Evaluator                                                           */
    /* ================================================================== */

    function tick(ctx, n) {
        ctx.ops += n || 1;
        if (ctx.ops > LIMITS.ops) throw new EngineError(BUDGET);
        if (ctx.ops >= ctx.nextCheck) {
            ctx.nextCheck = ctx.ops + 256;
            if (Date.now() - ctx.t0 > LIMITS.lineMs) throw new EngineError(BUDGET);
        }
    }

    function ev(node, ctx, env) {
        tick(ctx, 1);
        switch (node.t) {
            case 'num': return qty(node.v, null);
            case 'bool': return boolV(node.v);
            case 'group': return ev(node.a, ctx, env);
            case 'var': return lookupVar(node, ctx, env);
            case 'const': return qty(CONST[node.name].value, null);
            case 'unit': return qty(ONE, node.ue);
            case 'neg': {
                const a = reqN(ev(node.a, ctx, env), node);
                return qty(nNeg(a.v), a.u);
            }
            case 'pct': {
                const a = reqN(ev(node.a, ctx, env), node);
                return qty(nDiv(a.v, HUNDRED), a.u);
            }
            case 'fact': return at(node, () => factQ(ev(node.a, ctx, env), ctx, node));
            case 'bin': return at(node, () => evBin(node, ctx, env));
            case 'cmp': return at(node, () => evCmp(node, ctx, env));
            case 'call': return evCall(node, ctx, env);
            case 'ref': return evRef(node, ctx);
            case 'conv': return at(node, () => evConv(node, ctx, env));
            case 'numunit': return mulQ(reqN(ev(node.num, ctx, env), node), reqN(ev(node.unit, ctx, env), node), node);
            default: return fail('Something went wrong reading this line', node);
        }
    }

    function lookupVar(node, ctx, env) {
        const name = node.name;
        if (env && hasOwn(env, name)) return env[name];
        if (hasOwn(ctx.vars, name)) return ctx.vars[name].value;
        return fail(`Unknown name '${name}' — define it first, like ${name} = 5`, node);
    }

    function evBin(node, ctx, env) {
        const op = node.op;
        if (op === '+' || op === '-') {
            const a = reqN(ev(node.a, ctx, env), node.a);
            if (node.b.t === 'pct' && node.a.t !== 'pct') {
                const p = reqN(ev(node.b.a, ctx, env), node.b);
                if (p.u) fail(`A percentage can't have a unit — ${describe(p)}%`, node.b);
                const f = nDiv(p.v, HUNDRED);
                return qty(nMul(a.v, op === '+' ? nAdd(ONE, f) : nSub(ONE, f)), a.u);
            }
            const b = reqN(ev(node.b, ctx, env), node.b);
            return addQ(a, b, op === '+' ? 1 : -1, node);
        }
        if (op === '/' && node.b.t === 'numunit') {
            const a = reqN(ev(node.a, ctx, env), node.a);
            const n = reqN(ev(node.b.num, ctx, env), node.b);
            const u = reqN(ev(node.b.unit, ctx, env), node.b);
            if (!a.u) return mulQ(divQ(a, n, node), u, node);
            return divQ(a, mulQ(n, u, node), node);
        }
        const a = reqN(ev(node.a, ctx, env), node.a);
        const b = reqN(ev(node.b, ctx, env), node.b);
        switch (op) {
            case '*': case 'of': return mulQ(a, b, node);
            case '/': return divQ(a, b, node);
            case '^': return powQ(a, b, node);
            case 'mod': return modQ(a, b, node, 'mod');
            default: return fail('Something went wrong reading this line', node);
        }
    }

    function evCmp(node, ctx, env) {
        const op = node.op;
        const a = ev(node.a, ctx, env);
        const b = ev(node.b, ctx, env);
        if (a.k === 'b' || b.k === 'b') {
            if (a.k === b.k && (op === '==' || op === '!=')) return boolV((a.v === b.v) === (op === '=='));
            fail("Can't compare true/false with a number", node);
        }
        let bv = b.v;
        if (a.u || b.u) {
            if (!dimEq(ueDim(a.u), ueDim(b.u))) {
                fail(`Can't compare ${describe(a)} with ${describe(b)} — ${kindOf(a)} and ${kindOf(b)} don't mix`, node);
            }
            if (!ueEq(a.u, b.u)) bv = convertQ(b, a.u, node).v;
        }
        let c;
        if (isR(a.v) && isR(bv)) {
            c = nCmp(a.v, bv);
        } else {
            const x = toF(a.v);
            const y = toF(bv);
            if (Number.isNaN(x) || Number.isNaN(y)) return boolV(op === '!=');
            c = Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(x), Math.abs(y)) ? 0 : (x < y ? -1 : 1);
        }
        switch (op) {
            case '==': return boolV(c === 0);
            case '!=': return boolV(c !== 0);
            case '<': return boolV(c < 0);
            case '<=': return boolV(c <= 0);
            case '>': return boolV(c > 0);
            default: return boolV(c >= 0);
        }
    }

    function evConv(node, ctx, env) {
        const a = ev(node.a, ctx, env);
        if (a.k === 'b') fail("true/false can't be converted", node);
        const tg = node.target;
        if (tg.kind === 'unit') return convertQ(a, tg.ue, node, ctx.O);
        const label = { hex: 'hex', bin: 'binary', oct: 'octal' }[tg.fmt];
        if (label) {
            if (a.u) fail(`Remove the unit before showing ${describe(a)} in ${label}`, node);
            if (!isInt(a.v)) fail(`Only whole numbers can be shown in ${label} — ${describe(a)} isn't whole`, node);
            if (!isR(a.v) && !Number.isFinite(a.v)) fail(TOO_LARGE, node);
        }
        if (tg.fmt === 'pct' && a.u) fail(`Only plain numbers can be shown as a percentage — ${describe(a)} has a unit`, node);
        return { k: 'n', v: a.v, u: a.u, fmt: tg.fmt };
    }

    function evRef(node, ctx) {
        const sheet = ctx.sheet;
        const i = ctx.index;
        if (node.kind === 'ans') {
            for (let j = i - 1; j >= 0; j--) if (sheet.values[j]) return sheet.values[j].v;
            return fail("There's no earlier result for ans to use yet", node);
        }
        if (node.kind === 'line') {
            const n = node.n;
            if (n < 1 || n > sheet.count) fail(`There's no line ${n} in this sheet`, node);
            if (n - 1 >= i) fail(`line${n} isn't above this line — a line can only use results above it`, node);
            const val = sheet.values[n - 1];
            if (!val) fail(`Line ${n} has no result to use`, node);
            return val.v;
        }
        ctx.aggregate = true;
        const items = [];
        for (let j = i - 1; j >= 0; j--) {
            const k = sheet.kinds[j];
            if (k === 'blank' || k === 'heading') break;
            const val = sheet.values[j];
            if (val && !val.aggregate && val.v.k === 'n') items.push(val.v);
        }
        const word = node.word || node.kind;
        if (!items.length) {
            fail(`There are no values above to ${node.kind === 'total' ? 'add up' : 'average'} — ${word} uses the lines above it, up to a blank line or heading`, node);
        }
        items.reverse();
        let acc = qty(items[0].v, items[0].u);
        for (let k = 1; k < items.length; k++) {
            tick(ctx, 1);
            const it = items[k];
            if (!dimEq(ueDim(acc.u), ueDim(it.u))) {
                fail(`Can't ${node.kind === 'total' ? 'total' : 'average'} ${describe(items[0])} and ${describe(it)} — ${kindOf(items[0])} and ${kindOf(it)} don't mix`, node);
            }
            acc = at(node, () => addQ(acc, it, 1, node));
        }
        if (node.kind === 'avg') acc = qty(nDiv(acc.v, fromNum(items.length)), acc.u);
        return acc;
    }

    function evCall(node, ctx, env) {
        const name = node.name;
        if (!node.user && name === 'if') {
            if (node.args.length !== 3) fail('if takes 3 values: if(condition, value if true, value if false)', node);
            const c = ev(node.args[0], ctx, env);
            let truth;
            if (c.k === 'b') truth = c.v;
            else {
                if (c.u) fail(`if needs a condition such as x > 5, not ${describe(c)}`, node.args[0]);
                truth = !isZero(c.v) && !Number.isNaN(toF(c.v));
            }
            return ev(node.args[truth ? 1 : 2], ctx, env);
        }
        if (node.user || !FN[name]) return callUser(node, ctx, env);
        const def = FN[name];
        const n = node.args.length;
        if (n < def.min || n > def.max) fail(`${name} takes ${arityText(def)}, but got ${n}`, node);
        const args = node.args.map((a) => ev(a, ctx, env));
        return at(node, () => def.f(args, ctx, node));
    }

    function arityText(def) {
        const v = (k) => `${k} value${k === 1 ? '' : 's'}`;
        if (def.max === Infinity) return `at least ${v(def.min)}`;
        if (def.min === def.max) return v(def.min);
        return `${def.min} or ${v(def.max)}`;
    }

    function callUser(node, ctx, env) {
        const name = node.name;
        const fn = hasOwn(ctx.funcs, name) ? ctx.funcs[name] : null;
        if (!fn) return fail(`Unknown function '${name}' — define it first, like ${name}(x) = x * 2`, node);
        const want = fn.params.length;
        if (node.args.length !== want) {
            fail(`${name} takes ${want} value${want === 1 ? '' : 's'}${want ? ` (${fn.params.join(', ')})` : ''}, but got ${node.args.length}`, node);
        }
        if (ctx.depth >= LIMITS.recursion) {
            fail(`Too many nested calls — a function can call itself at most ${LIMITS.recursion} levels deep`, node);
        }
        const scope = dict();
        fn.params.forEach((p, k) => { scope[p] = ev(node.args[k], ctx, env); });
        ctx.depth++;
        try {
            return ev(fn.body, ctx, scope);
        } catch (err) {
            if (err && err.isEngine) {
                if (!err.prefixed) {
                    err.message = `In ${name}: ${err.message}`;
                    err.prefixed = true;
                }
                if (ctx.depth === 1) {
                    err.start = node.s;
                    err.end = node.e;
                }
            }
            throw err;
        } finally {
            ctx.depth--;
        }
    }

    /* ================================================================== */
    /* Built-in functions and constants                                    */
    /* ================================================================== */

    const CONST = dict();
    [
        ['pi', PI, 'Pi, the ratio of a circle\'s circumference to its diameter'],
        ['π', PI, 'Pi (the Greek letter form)'],
        ['tau', 2 * PI, 'Tau, one full turn in radians (2π)'],
        ['τ', 2 * PI, 'Tau (the Greek letter form)'],
        ['e', Math.E, 'Euler\'s number, the base of natural logarithms'],
        ['phi', (1 + Math.sqrt(5)) / 2, 'Phi, the golden ratio'],
        ['φ', (1 + Math.sqrt(5)) / 2, 'Phi (the Greek letter form)']
    ].forEach(([name, value, description]) => { CONST[name] = { name, value, description }; });

    const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

    function gamma(x) {
        if (x < 0.5) return PI / (Math.sin(PI * x) * gamma(1 - x));
        x -= 1;
        let a = LANCZOS[0];
        const t = x + 7.5;
        for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
        return Math.sqrt(2 * PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
    }
    function lgamma(x) {
        if (x < 0.5) return Math.log(PI / Math.abs(Math.sin(PI * x))) - lgamma(1 - x);
        x -= 1;
        let a = LANCZOS[0];
        const t = x + 7.5;
        for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
        return 0.5 * Math.log(2 * PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    }

    const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n];
    const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
    function modPow(b, e, m) {
        let r = 1n;
        b %= m;
        while (e > 0n) {
            if (e & 1n) r = (r * b) % m;
            b = (b * b) % m;
            e >>= 1n;
        }
        return r;
    }
    /** Deterministic Miller-Rabin below 3.3e24 (13 prime bases); very strong above. */
    function isPrimeBig(n) {
        if (n < 2n) return false;
        for (const p of SMALL_PRIMES) {
            if (n === p) return true;
            if (n % p === 0n) return false;
        }
        let d = n - 1n;
        let s = 0;
        while ((d & 1n) === 0n) { d >>= 1n; s++; }
        outer: for (const a of MR_BASES) {
            let x = modPow(a, d, n);
            if (x === 1n || x === n - 1n) continue;
            for (let i = 1; i < s; i++) {
                x = (x * x) % n;
                if (x === n - 1n) continue outer;
            }
            return false;
        }
        return true;
    }

    function plainArg(v, name, node) {
        if (v.k === 'b') fail(`${name} needs a number, not true/false`, node);
        if (v.u) fail(`${name} needs a plain number, not ${describe(v)}`, node);
        return v.v;
    }
    function intArg(v, name, node) {
        const x = plainArg(v, name, node);
        if (!isInt(x)) fail(`${name} needs whole numbers — ${describe(v)} isn't whole`, node);
        if (!isR(x) && !Number.isFinite(x)) fail(TOO_LARGE, node);
        return isR(x) ? x.n : BigInt(x);
    }
    const realOr = (r, node, msg) => {
        if (Number.isNaN(r)) fail(`No real result — ${msg}`, node);
        return r;
    };

    /** Snap trig noise: sin(pi) → 0, sin(30 deg) → 0.5. */
    function snapTrig(v) {
        const r = Math.round(v * 2) / 2;
        return Math.abs(v - r) < 1e-14 ? r + 0 : v;
    }
    /** Snap a degree result to a whole number when it is within float noise. */
    function snapNice(v) {
        const r = Math.round(v);
        return Math.abs(v - r) < 1e-10 * Math.max(1, Math.abs(v)) ? r + 0 : v;
    }

    function angleRad(v, name, ctx, node) {
        if (v.k === 'b') fail(`${name} needs an angle or a number, not true/false`, node);
        if (v.u) {
            if (!dimEq(ueDim(v.u), DIM_ANGLE)) fail(`${name} needs an angle or a plain number, not ${describe(v)}`, node);
            return toF(nMul(v.v, ueScale(v.u)));
        }
        const x = toF(v.v);
        return ctx.O.angle === 'deg' ? x * PI / 180 : x;
    }
    const outAngle = (r, ctx) => qty(ctx.O.angle === 'deg' ? snapNice(r * 180 / PI) : r, null);

    function rootQ(v, n, name, node) {
        if (v.k === 'b') fail(`${name} needs a number, not true/false`, node);
        if (!v.u && sgn(v.v) < 0 && n % 2 === 0) fail(`No real result — ${name} needs a number 0 or more`, node);
        return powQ(v, qty({ n: 1n, d: BigInt(n) }, null), node);
    }

    function roundN(x, digits) {
        const f = pow10(digits);
        const y = nMul(x, f);
        let r;
        if (isR(y)) r = sgn(y) >= 0 ? nFloor(nAdd(y, HALF)) : nNeg(nFloor(nAdd(nNeg(y), HALF)));
        else r = Math.sign(y) * Math.round(Math.abs(y));
        return nDiv(r, f);
    }

    function factQ(v, ctx, node) {
        const x = plainArg(reqN(v, node), 'factorial', node);
        if (isInt(x)) {
            const n = isR(x) ? x.n : BigInt(x);
            if (n < 0n) fail('Factorial needs a whole number 0 or more', node);
            if (n > BigInt(LIMITS.factorial)) fail(TOO_LARGE, node);
            let r = 1n;
            for (let i = 2n; i <= n; i++) {
                r *= i;
                if ((i & 63n) === 0n) tick(ctx, 4);
            }
            return qty(guard(r, 1n), null);
        }
        const g = gamma(toF(x) + 1);
        if (Number.isNaN(g)) fail('No real result — factorial is undefined there', node);
        if (!Number.isFinite(g)) fail(TOO_LARGE, node);
        return qty(g, null);
    }

    function combin(nv, kv, perm, ctx, node) {
        const name = perm ? 'nPr' : 'nCr';
        const n = intArg(nv, name, node);
        const k = intArg(kv, name, node);
        if (n < 0n || k < 0n) fail(`${name} needs whole numbers 0 or more`, node);
        if (k > n) return qty(ZERO, null);
        const kk = perm ? k : (k < n - k ? k : n - k);
        const nf = Number(n);
        const kf = Number(kk);
        const ln2 = perm ? lgamma(nf + 1) - lgamma(nf - Number(k) + 1)
            : lgamma(nf + 1) - lgamma(kf + 1) - lgamma(nf - kf + 1);
        if (ln2 / Math.LN2 > LIMITS.bits) fail(TOO_LARGE, node);
        let r = 1n;
        for (let i = 1n; i <= kk; i++) {
            r = perm ? r * (n - i + 1n) : (r * (n - kk + i)) / i;
            if ((i & 63n) === 0n) tick(ctx, 4);
        }
        return qty(guard(r, 1n), null);
    }

    function logQ(v, base, name, node) {
        const x = plainArg(v, name, node);
        if (sgn(x) <= 0) fail(`No real result — ${name} needs a number above 0`, node);
        if (base !== null) {
            if (sgn(base) <= 0 || nCmp(base, ONE) === 0) fail('The log base must be above 0 and not 1', node);
            if (isR(x) && isR(base)) {
                const guess = Math.round(nLn(x) / nLn(base));
                if (Number.isFinite(guess) && Math.abs(guess) <= 4000) {
                    const p = nPowInt(base, BigInt(guess));
                    if (isR(p) && nCmp(p, x) === 0) return qty(fromNum(guess), null);
                }
            }
        }
        const lx = nLn(x);
        if (base === null) return qty(lx, null);
        if (isR(base) && base.d === 1n && base.n === 10n && !isR(x)) return qty(Math.log10(x), null);
        if (isR(base) && base.d === 1n && base.n === 2n && !isR(x)) return qty(Math.log2(x), null);
        return qty(lx / nLn(base), null);
    }

    function sorted(vs) { return vs.slice().sort(nCmp); }

    function sumOf(vs) { return vs.reduce((acc, x) => nAdd(acc, x), ZERO); }

    function varianceOf(vs) {
        const mean = nDiv(sumOf(vs), fromNum(vs.length));
        let ss = ZERO;
        for (const x of vs) {
            const d = nSub(x, mean);
            ss = nAdd(ss, nMul(d, d));
        }
        return nDiv(ss, fromNum(vs.length - 1));
    }

    const FN = dict();
    function def(name, min, max, example, f) { FN[name] = { name, min, max, example, f }; }

    // Powers and roots
    def('sqrt', 1, 1, 'sqrt(2)', (a, c, n) => rootQ(a[0], 2, 'sqrt', n));
    def('cbrt', 1, 1, 'cbrt(27)', (a, c, n) => rootQ(a[0], 3, 'cbrt', n));
    def('root', 2, 2, 'root(32, 5)', (a, c, n) => {
        const k = plainArg(a[1], 'root', n);
        if (isInt(k) && sgn(k) > 0 && toF(k) <= 1000) return rootQ(a[0], Number(toF(k)), 'root', n);
        if (isZero(k)) fail('root needs a non-zero root number', n);
        return powQ(reqN(a[0], n), qty(nDiv(ONE, k), null), n);
    });
    def('exp', 1, 1, 'exp(1)', (a, c, n) => {
        const x = plainArg(a[0], 'exp', n);
        return qty(isZero(x) ? ONE : Math.exp(toF(x)), null);
    });
    def('ln', 1, 1, 'ln(10)', (a, c, n) => {
        const x = plainArg(a[0], 'ln', n);
        if (isR(x) && x.n === 1n && x.d === 1n) return qty(ZERO, null);
        return logQ(a[0], null, 'ln', n);
    });
    def('log', 1, 2, 'log(1000)', (a, c, n) => logQ(a[0], a.length > 1 ? plainArg(a[1], 'log', n) : { n: 10n, d: 1n }, 'log', n));
    def('log2', 1, 1, 'log2(1024)', (a, c, n) => logQ(a[0], { n: 2n, d: 1n }, 'log2', n));
    def('log10', 1, 1, 'log10(1000)', (a, c, n) => logQ(a[0], { n: 10n, d: 1n }, 'log10', n));

    // Rounding and sign (keep units)
    const keepUnit = (fn) => (a, c, n) => {
        const v = reqN(a[0], n);
        return qty(fn(v.v), v.u);
    };
    def('abs', 1, 1, 'abs(-5)', keepUnit(nAbs));
    def('floor', 1, 1, 'floor(2.7)', keepUnit(nFloor));
    def('ceil', 1, 1, 'ceil(2.1)', keepUnit(nCeil));
    def('trunc', 1, 1, 'trunc(-2.7)', keepUnit(nTrunc));
    def('sign', 1, 1, 'sign(-3)', (a, c, n) => qty(fromNum(sgn(reqN(a[0], n).v)), null));
    def('round', 1, 2, 'round(3.14159, 2)', (a, c, n) => {
        const v = reqN(a[0], n);
        let digits = 0;
        if (a.length > 1) {
            const d = intArg(a[1], 'round', n);
            if (d < -300n || d > 300n) fail('round can keep between -300 and 300 decimal places', n);
            digits = Number(d);
        }
        return qty(roundN(v.v, digits), v.u);
    });

    // Lists and statistics
    def('min', 1, Infinity, 'min(4, 2, 8)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'min', n);
        return qty(vs.reduce((m, x) => (nCmp(x, m) < 0 ? x : m)), u);
    });
    def('max', 1, Infinity, 'max(4, 2, 8)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'max', n);
        return qty(vs.reduce((m, x) => (nCmp(x, m) > 0 ? x : m)), u);
    });
    def('sum', 1, Infinity, 'sum(1, 2, 3)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'sum', n);
        return qty(sumOf(vs), u);
    });
    const meanFn = (name) => (a, c, n) => {
        const { u, vs } = sameUnits(a, name, n);
        return qty(nDiv(sumOf(vs), fromNum(vs.length)), u);
    };
    def('avg', 1, Infinity, 'avg(2, 4, 9)', meanFn('avg'));
    def('mean', 1, Infinity, 'mean(2, 4, 9)', meanFn('mean'));
    def('median', 1, Infinity, 'median(3, 1, 4, 1, 5)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'median', n);
        const s = sorted(vs);
        const m = s.length >> 1;
        return qty(s.length % 2 ? s[m] : nDiv(nAdd(s[m - 1], s[m]), fromNum(2)), u);
    });
    def('mode', 1, Infinity, 'mode(1, 2, 2, 3)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'mode', n);
        const s = sorted(vs);
        let best = s[0];
        let bestCount = 0;
        for (let i = 0; i < s.length;) {
            let j = i;
            while (j < s.length && nCmp(s[j], s[i]) === 0) j++;
            if (j - i > bestCount) { best = s[i]; bestCount = j - i; }
            i = j;
        }
        return qty(best, u);
    });
    def('var', 2, Infinity, 'var(2, 4, 4, 4, 5, 5, 7, 9)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'var', n);
        const v = varianceOf(vs);
        return u ? simplify(v, u.map((f) => ({ def: f.def, p: f.p * 2 }))) : qty(v, null);
    });
    def('stdev', 2, Infinity, 'stdev(2, 4, 4, 4, 5, 5, 7, 9)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'stdev', n);
        return qty(nPow(varianceOf(vs), HALF), u);
    });
    def('hypot', 1, Infinity, 'hypot(3, 4)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'hypot', n);
        const ss = vs.reduce((acc, x) => nAdd(acc, nMul(x, x)), ZERO);
        return qty(nPow(ss, HALF), u);
    });

    // Number theory
    def('gcd', 1, Infinity, 'gcd(12, 18)', (a, c, n) => {
        let g = 0n;
        for (const v of a) g = bgcd(g, intArg(v, 'gcd', n));
        return qty(guard(g, 1n), null);
    });
    def('lcm', 1, Infinity, 'lcm(4, 6)', (a, c, n) => {
        let l = 1n;
        for (const v of a) {
            const x = intArg(v, 'lcm', n);
            if (x === 0n) return qty(ZERO, null);
            const ax = x < 0n ? -x : x;
            l = (l / bgcd(l, ax)) * ax;
            if (bitLen(l) > LIMITS.bits) fail(TOO_LARGE, n);
        }
        return qty(guard(l, 1n), null);
    });
    def('fact', 1, 1, 'fact(5)', (a, c, n) => factQ(a[0], c, n));
    def('factorial', 1, 1, 'factorial(10)', (a, c, n) => factQ(a[0], c, n));
    def('nCr', 2, 2, 'nCr(5, 2)', (a, c, n) => combin(a[0], a[1], false, c, n));
    def('nPr', 2, 2, 'nPr(5, 2)', (a, c, n) => combin(a[0], a[1], true, c, n));
    def('mod', 2, 2, 'mod(-7, 3)', (a, c, n) => modQ(reqN(a[0], n), reqN(a[1], n), n, 'mod'));
    def('rem', 2, 2, 'rem(-7, 3)', (a, c, n) => modQ(reqN(a[0], n), reqN(a[1], n), n, 'rem'));
    def('isprime', 1, 1, 'isprime(97)', (a, c, n) => {
        const x = intArg(a[0], 'isprime', n);
        if (bitLen(x) > 1024) fail('isprime works with whole numbers up to about 300 digits', n);
        return boolV(isPrimeBig(x));
    });

    // Trigonometry
    const trig = (name, f) => def(name, 1, 1, `${name}(30 deg)`, (a, c, n) => {
        const x = angleRad(a[0], name, c, n);
        return qty(realOr(f(x, n), n, `${name} is undefined there`), null);
    });
    const cosS = (x) => snapTrig(Math.cos(x));
    const sinS = (x) => snapTrig(Math.sin(x));
    const divOrFail = (p, q, n, name) => {
        if (q === 0) fail(`No real result — ${name} is undefined at that angle`, n);
        return snapTrig(p / q);
    };
    trig('sin', sinS);
    trig('cos', cosS);
    trig('tan', (x, n) => divOrFail(sinS(x), cosS(x), n, 'tan'));
    trig('sec', (x, n) => divOrFail(1, cosS(x), n, 'sec'));
    trig('csc', (x, n) => divOrFail(1, sinS(x), n, 'csc'));
    trig('cot', (x, n) => divOrFail(cosS(x), sinS(x), n, 'cot'));
    const inv = (name, f, lo, hi) => def(name, 1, 1, `${name}(0.5)`, (a, c, n) => {
        const x = toF(plainArg(a[0], name, n));
        if (lo !== null && (x < lo || x > hi)) fail(`No real result — ${name} needs a number from ${lo} to ${hi}`, n);
        return outAngle(f(x), c);
    });
    inv('asin', Math.asin, -1, 1);
    inv('acos', Math.acos, -1, 1);
    inv('atan', Math.atan, null, null);
    def('atan2', 2, 2, 'atan2(1, 1)', (a, c, n) => {
        const { vs } = sameUnits(a, 'atan2', n);
        return outAngle(Math.atan2(toF(vs[0]), toF(vs[1])), c);
    });
    const hyper = (name, f) => def(name, 1, 1, `${name}(1)`, (a, c, n) => qty(f(toF(plainArg(a[0], name, n))), null));
    hyper('sinh', Math.sinh);
    hyper('cosh', Math.cosh);
    hyper('tanh', Math.tanh);
    def('deg', 1, 1, 'deg(pi)', (a, c, n) => {
        const v = reqN(a[0], n);
        if (v.u) return qty(convertQ(v, [{ def: DEG_UNIT, p: 1 }], n, c.O).v, null);
        return qty(snapNice(toF(v.v) * 180 / PI), null);
    });
    def('rad', 1, 1, 'rad(180)', (a, c, n) => {
        const v = reqN(a[0], n);
        if (v.u) return qty(convertQ(v, [{ def: RAD_UNIT, p: 1 }], n, c.O).v, null);
        return qty(toF(v.v) * PI / 180, null);
    });

    // Ranges and logic
    def('clamp', 3, 3, 'clamp(15, 0, 10)', (a, c, n) => {
        const { u, vs } = sameUnits(a, 'clamp', n);
        const [x, lo, hi] = vs;
        if (nCmp(lo, hi) > 0) fail('clamp needs the low limit before the high one, like clamp(x, 0, 10)', n);
        return qty(nCmp(x, lo) < 0 ? lo : nCmp(x, hi) > 0 ? hi : x, u);
    });
    def('lerp', 3, 3, 'lerp(10, 20, 0.25)', (a, c, n) => {
        const { u, vs } = sameUnits([a[0], a[1]], 'lerp', n);
        const t = plainArg(a[2], 'lerp', n);
        return qty(nAdd(vs[0], nMul(nSub(vs[1], vs[0]), t)), u);
    });
    def('if', 3, 3, 'if(5 > 3, 1, 0)', () => fail('if must be called directly'));

    /* ================================================================== */
    /* Formatting                                                          */
    /* ================================================================== */

    const DEFAULTS = Object.freeze({
        angle: 'rad', precision: 10, notation: 'auto', thousands: 'comma', fractions: 'auto', implicitMult: true
    });
    const NOTATIONS = ['auto', 'fixed', 'scientific', 'engineering'];
    const SEPS = { comma: ',', space: ' ', none: '' };

    function normOptions(o) {
        const src = o && typeof o === 'object' ? o : {};
        const p = Number(src.precision);
        return {
            angle: src.angle === 'deg' ? 'deg' : 'rad',
            precision: Number.isFinite(p) ? Math.min(16, Math.max(1, Math.round(p))) : DEFAULTS.precision,
            notation: NOTATIONS.includes(src.notation) ? src.notation : 'auto',
            thousands: hasOwn(SEPS, src.thousands) ? src.thousands : 'comma',
            fractions: src.fractions === 'off' ? 'off' : 'auto',
            implicitMult: src.implicitMult !== false
        };
    }

    /** P significant digits of x: { neg, digits (trailing zeros trimmed), exp } with x ≈ d.ddd × 10^exp. */
    function digitsOf(x, P) {
        if (isR(x)) {
            if (x.n === 0n) return null;
            const a = x.n < 0n ? -x.n : x.n;
            const b = x.d;
            let e = a.toString().length - b.toString().length;
            const below = e >= 0 ? a < b * 10n ** BigInt(e) : a * 10n ** BigInt(-e) < b;
            if (below) e -= 1;
            const k = P - 1 - e;
            const num = k >= 0 ? a * 10n ** BigInt(k) : a;
            const den = k >= 0 ? b : b * 10n ** BigInt(-k);
            let q = num / den;
            if ((num % den) * 2n >= den) q += 1n;
            let s = q.toString();
            if (s.length > P) { s = s.slice(0, P); e += 1; }
            return { neg: x.n < 0n, digits: s.replace(/0+$/, '') || '0', exp: e };
        }
        if (x === 0) return null;
        const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(Math.abs(x).toExponential(P - 1));
        return { neg: x < 0, digits: (m[1] + (m[2] || '')).replace(/0+$/, '') || '0', exp: Number(m[3]) };
    }

    function group(s, sep) {
        if (!sep || s.length <= 3) return s;
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    }

    function positional(digits, exp, sep) {
        let intPart;
        let frac;
        if (exp >= 0) {
            intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
            frac = digits.slice(exp + 1);
        } else {
            intPart = '0';
            frac = '0'.repeat(-exp - 1) + digits;
        }
        return group(intPart, sep) + (frac ? `.${frac}` : '');
    }

    /** Format a rational or float with P significant digits in a notation. */
    function fmtN(x, P, notation, sep) {
        if (!isR(x)) {
            if (Number.isNaN(x)) return 'NaN';
            if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
        }
        if (isR(x) && x.d === 1n) {
            const neg = x.n < 0n;
            const s = (neg ? -x.n : x.n).toString();
            if (notation === 'fixed' || (notation === 'auto' && s.length <= 15)) return (neg ? '-' : '') + group(s, sep);
        }
        const dg = digitsOf(x, P);
        if (!dg) return '0';
        let mode = notation;
        if (mode === 'auto') mode = dg.exp >= 15 || dg.exp < -6 ? 'scientific' : 'fixed';
        if (mode === 'fixed' && Math.abs(dg.exp) > 100) mode = 'scientific';
        let body;
        if (mode === 'fixed') {
            body = positional(dg.digits, dg.exp, sep);
        } else if (mode === 'scientific') {
            body = `${dg.digits[0]}${dg.digits.length > 1 ? `.${dg.digits.slice(1)}` : ''}e${dg.exp}`;
        } else {
            const e3 = Math.floor(dg.exp / 3) * 3;
            const lead = dg.exp - e3 + 1;
            const d = dg.digits.padEnd(lead, '0');
            body = `${d.slice(0, lead)}${d.length > lead ? `.${d.slice(lead)}` : ''}e${e3}`;
        }
        return (dg.neg ? '-' : '') + body;
    }

    function baseString(x, fmt) {
        const n = isR(x) ? x.n : BigInt(x);
        const radix = { hex: 16, bin: 2, oct: 8 }[fmt];
        const prefix = { hex: '0x', bin: '0b', oct: '0o' }[fmt];
        const a = n < 0n ? -n : n;
        let s = a.toString(radix);
        if (radix === 16) s = s.toUpperCase();
        return `${n < 0n ? '-' : ''}${prefix}${s}`;
    }

    /** Continued-fraction approximation of a float: { n, d, exact }. */
    function approxFraction(x, maxDen) {
        const neg = x < 0;
        const ax = Math.abs(x);
        let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
        let y = ax;
        for (let i = 0; i < 64; i++) {
            const a = Math.floor(y);
            const h2 = a * h1 + h0;
            const k2 = a * k1 + k0;
            if (k2 > maxDen || !Number.isFinite(h2)) break;
            h0 = h1; h1 = h2; k0 = k1; k1 = k2;
            if (Math.abs(ax - h1 / k1) <= 4e-15 * Math.max(1, ax)) break;
            const f = y - a;
            if (f < 1e-15) break;
            y = 1 / f;
        }
        if (k1 === 0) return null;
        return { n: neg ? -h1 : h1, d: k1, exact: Math.abs(ax - h1 / k1) <= 4e-15 * Math.max(1, ax) };
    }

    function fracString(x) {
        if (isR(x)) return x.d === 1n ? x.n.toString() : `${x.n}/${x.d}`;
        if (Number.isInteger(x)) return String(x);
        const close = approxFraction(x, 1e6);
        if (close && close.exact) return close.d === 1 ? String(close.n) : `${close.n}/${close.d}`;
        const rough = approxFraction(x, 10000);
        if (!rough) return String(x);
        return `≈ ${rough.d === 1 ? rough.n : `${rough.n}/${rough.d}`}`;
    }

    /** The display fields of a value: { display, plain, exact, unit, numeric }. */
    function present(V, O) {
        if (V.k === 'b') {
            const s = V.v ? 'true' : 'false';
            return { display: s, plain: s, exact: '', unit: '', numeric: null };
        }
        const x = V.v;
        if (!isR(x)) {
            if (Number.isNaN(x)) throw new EngineError(NO_REAL);
            if (!Number.isFinite(x)) throw new EngineError(TOO_LARGE);
        }
        const unit = V.u ? ueStr(V.u) : '';
        const sep = SEPS[O.thousands];
        const P = O.precision;
        const withUnit = (s) => (unit ? `${s} ${unit}` : s);
        const numeric = (y) => {
            const f = toF(y);
            return Number.isFinite(f) ? f : null;
        };
        if (V.fmt === 'hex' || V.fmt === 'bin' || V.fmt === 'oct') {
            const s = baseString(x, V.fmt);
            return { display: s, plain: s, exact: '', unit: '', numeric: numeric(x) };
        }
        if (V.fmt === 'pct') {
            const y = nMul(x, HUNDRED);
            return { display: `${fmtN(y, P, O.notation, sep)}%`, plain: `${fmtN(y, P, O.notation, '')}%`, exact: '', unit: '', numeric: numeric(y) };
        }
        if (V.fmt === 'frac') {
            const s = withUnit(fracString(x));
            return { display: s, plain: s, exact: '', unit, numeric: numeric(x) };
        }
        const notation = V.fmt === 'sci' ? 'scientific' : V.fmt === 'eng' ? 'engineering' : V.fmt === 'dec' ? 'fixed' : O.notation;
        const display = withUnit(fmtN(x, P, notation, sep));
        const plainNum = isR(x) && x.d === 1n && notation !== 'scientific' && notation !== 'engineering'
            ? x.n.toString() : fmtN(x, P, notation, '');
        const exact = O.fractions === 'auto' && isR(x) && x.d !== 1n && x.d < 10n ** 20n && x.n < 10n ** 21n && x.n > -(10n ** 21n)
            ? withUnit(`${x.n}/${x.d}`) : '';
        return { display, plain: withUnit(plainNum), exact, unit, numeric: numeric(x) };
    }

    /** Public: format a plain JS number (or BigInt) with the options. */
    function formatNumber(n, options) {
        const O = normOptions(options);
        let x;
        if (typeof n === 'bigint') x = guard(n, 1n);
        else if (typeof n === 'number') x = Number.isFinite(n) ? fromNum(n) : n;
        else x = Number(n);
        if (typeof x === 'number' && Number.isFinite(x)) {
            const r = decimalRat(String(x));
            if (isR(r)) x = r;
        }
        return fmtN(x, O.precision, O.notation, SEPS[O.thousands]);
    }

    /* ================================================================== */
    /* Names, lines and sheets                                             */
    /* ================================================================== */

    const NAME_RE = /^[\p{L}_][\p{L}\d_]*$/u;

    /** Why a name can't hold a variable or function, or null when it can. */
    function nameProblem(name) {
        if (typeof name !== 'string' || !name) return 'Give it a name, like x = 5';
        if (RESERVED.has(name)) return `'${name}' can't be used as a name — pick another one, like value1`;
        if (!NAME_RE.test(name)) return `'${name}' isn't a valid name — use letters, digits and _, starting with a letter`;
        if (name.length > LIMITS.nameLength) return `Names can be at most ${LIMITS.nameLength} characters long`;
        if (FN[name]) return `'${name}' is a built-in function — pick another name`;
        if (CONST[name]) return `'${name}' is a built-in constant — pick another name`;
        if (KEYWORDS.has(name) || LINE_REF.test(name) || FORMAT_WORDS[name]) return `'${name}' is a keyword — pick another name`;
        const ue = lookupUE(name);
        if (ue) return `'${name}' is a unit (${ue[0].def.name}) — pick another name, like ${name}1`;
        return null;
    }

    const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{N} _'’&()\-.,/#+]*$/u;

    function blankResult(index, source) {
        return { index, source, kind: 'blank', label: null, display: '', plain: '', exact: '', unit: '', numeric: null, error: null };
    }

    function setError(res, message, start, end) {
        res.kind = 'error';
        res.display = '';
        res.plain = '';
        res.exact = '';
        res.unit = '';
        res.numeric = null;
        res.error = { message, start, end };
        return res;
    }

    function fromError(res, err, start, end, source) {
        let msg;
        let s;
        let e;
        if (err && err.isEngine) {
            msg = err.message;
            s = err.start;
            e = err.end;
        } else if (err instanceof RangeError) {
            msg = 'This line is too complex to work out — split it into smaller steps';
        } else {
            msg = 'Something went wrong working out this line';
        }
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > source.length || s > e) {
            s = start;
            e = end;
            while (s < e && /\s/.test(source[s])) s++;
            while (e > s && /\s/.test(source[e - 1])) e--;
        }
        return setError(res, msg, s, e);
    }

    function newSheet(O, count) {
        return { O, vars: dict(), funcs: dict(), values: [], kinds: [], count, t0: Date.now() };
    }

    function defineFunction(st, toks, sheet, index, source) {
        const problem = nameProblem(st.name);
        if (problem) throw new EngineError(problem, st.nameTok.s, st.nameTok.e);
        if (st.params.length > LIMITS.params) {
            throw new EngineError(`A function can have at most ${LIMITS.params} inputs`, st.nameTok.s, st.eq.e);
        }
        const params = new Set();
        st.params.forEach((p, k) => {
            const pt = st.paramToks[k];
            const pr = nameProblem(p);
            if (pr) throw new EngineError(pr, pt.s, pt.e);
            if (params.has(p)) throw new EngineError(`'${p}' is listed twice — each input needs its own name`, pt.s, pt.e);
            params.add(p);
        });
        const scope = {
            implicit: sheet.O.implicitMult,
            isVar: (n) => params.has(n) || hasOwn(sheet.vars, n),
            isFunc: (n) => !params.has(n) && (n === st.name || hasOwn(sheet.funcs, n))
        };
        const body = parseRest({ toks, i: st.bodyStart, scope, depth: 0 }, st.eq);
        const last = toks[toks.length - 1];
        const bodyText = source.slice(toks[st.bodyStart].s, last.s).trim();
        if (hasOwn(sheet.vars, st.name)) delete sheet.vars[st.name];
        sheet.funcs[st.name] = { name: st.name, params: st.params.slice(), body, bodyText, line: index };
    }

    function evalLine(source, index, sheet) {
        const res = blankResult(index, source);
        if (source.length > LIMITS.lineChars) {
            return setError(res, `This line is too long — keep each line under ${fmtInt(LIMITS.lineChars)} characters`, 0, source.length);
        }
        const trimmed = source.trim();
        if (!trimmed) return res;
        if (trimmed[0] === '#') { res.kind = 'heading'; return res; }
        if (trimmed.startsWith('//')) { res.kind = 'comment'; return res; }
        let end = source.indexOf('//');
        if (end === -1) end = source.length;
        let start = 0;
        const colon = source.indexOf(':');
        if (colon !== -1 && colon < end) {
            const lab = source.slice(0, colon).trim();
            if (lab.length <= 120 && LABEL_RE.test(lab) && /\p{L}/u.test(lab)) {
                res.label = lab;
                start = colon + 1;
            }
        }
        if (!source.slice(start, end).trim()) { res.kind = 'comment'; return res; }
        const O = sheet.O;
        CUR_O = O;
        const ctx = { O, sheet, index, ops: 0, nextCheck: 256, t0: Date.now(), depth: 0, aggregate: false, vars: sheet.vars, funcs: sheet.funcs };
        try {
            const toks = tokenize(source, start, end);
            const scope = { implicit: O.implicitMult, isVar: (n) => hasOwn(sheet.vars, n), isFunc: (n) => hasOwn(sheet.funcs, n) };
            const st = parseStatement(toks, scope);
            if (st.type === 'func') {
                defineFunction(st, toks, sheet, index, source);
                res.kind = 'function';
                return res;
            }
            if (st.type === 'assign') {
                const problem = nameProblem(st.name);
                if (problem) throw new EngineError(problem, st.nameTok.s, st.nameTok.e);
            }
            const v = ev(st.expr, ctx, null);
            const out = present(v, O);
            const stored = v.fmt ? { k: v.k, v: v.v, u: v.u, fmt: null } : v;
            sheet.values[index] = { v: stored, aggregate: ctx.aggregate };
            if (st.type === 'assign') {
                sheet.vars[st.name] = { value: stored, line: index };
                if (hasOwn(sheet.funcs, st.name)) delete sheet.funcs[st.name];
                res.kind = 'assignment';
            } else {
                res.kind = 'value';
            }
            Object.assign(res, out);
            return res;
        } catch (err) {
            if (!(err && err.isEngine) && typeof process !== 'undefined' && process.env && process.env.MATHMAN_DEBUG) {
                console.error(err);
            }
            return fromError(res, err, start, end, source);
        }
    }

    function runSheet(text, options) {
        const O = normOptions(options);
        const src = typeof text === 'string' ? text : (text === null || text === undefined ? '' : String(text));
        const all = src.split(/\r\n|\r|\n/);
        const count = Math.min(all.length, LIMITS.lines);
        const sheet = newSheet(O, count);
        const lines = [];
        for (let i = 0; i < count; i++) {
            let r;
            if (Date.now() - sheet.t0 > LIMITS.sheetMs) {
                r = setError(blankResult(i, all[i]), 'Stopped here — this sheet takes too long to work out. Split it into smaller sheets.', 0, all[i].length);
            } else {
                r = evalLine(all[i], i, sheet);
            }
            sheet.kinds[i] = r.kind;
            lines.push(r);
        }
        if (all.length > LIMITS.lines) {
            const rest = all[LIMITS.lines];
            lines.push(setError(blankResult(LIMITS.lines, rest), `Only the first ${fmtInt(LIMITS.lines)} lines are worked out — move the rest to another sheet`, 0, rest.length));
        }
        CUR_O = O;
        const variables = Object.keys(sheet.vars).map((name) => {
            const rec = sheet.vars[name];
            let display = '';
            try { display = present(rec.value, O).display; } catch (_) { display = ''; }
            return { name, display, line: rec.line + 1, index: rec.line };
        }).sort((a, b) => a.index - b.index || (a.name < b.name ? -1 : 1));
        const functions = Object.keys(sheet.funcs).map((name) => {
            const f = sheet.funcs[name];
            return { name, params: f.params.slice(), body: f.bodyText, line: f.line + 1, index: f.line };
        }).sort((a, b) => a.index - b.index);
        const counts = {
            lines: all.length,
            values: lines.filter((l) => l.kind === 'value' || l.kind === 'assignment').length,
            errors: lines.filter((l) => l.kind === 'error').length
        };
        return { output: { lines, variables, functions, counts }, sheet };
    }

    function evaluateSheet(text, options) {
        return runSheet(text, options).output;
    }

    function evaluate(expr, options) {
        const O = normOptions(options);
        const src = (typeof expr === 'string' ? expr : (expr === null || expr === undefined ? '' : String(expr))).replace(/[\r\n]+/g, ' ');
        return evalLine(src, 0, newSheet(O, 1));
    }

    /* ================================================================== */
    /* compile(): float-only closures for graphs and the solver           */
    /* ================================================================== */

    const NAN_FN = () => NaN;
    const UNITS_HERE = "Units can't be used here — graphs and the solver work with plain numbers";

    function floorMod(a, b) { return a - b * Math.floor(a / b); }
    function roundF(x, n) {
        const f = Math.pow(10, n || 0);
        return Math.sign(x) * Math.round(Math.abs(x) * f) / f;
    }
    function factF(x) {
        if (Number.isInteger(x)) {
            if (x < 0) return NaN;
            if (x > 170) return Infinity;
            let r = 1;
            for (let i = 2; i <= x; i++) r *= i;
            return r;
        }
        return gamma(x + 1);
    }
    function gcdF(a, b) {
        if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN;
        a = Math.abs(a); b = Math.abs(b);
        while (b) { const t = a % b; a = b; b = t; }
        return a;
    }
    function isPrimeF(x) {
        if (!Number.isInteger(x) || x < 2) return false;
        if (!Number.isSafeInteger(x)) return isPrimeBig(BigInt(x));
        if (x % 2 === 0) return x === 2;
        for (let i = 3; i * i <= x; i += 2) {
            if (x % i === 0) return false;
            if (i > 100000) return isPrimeBig(BigInt(x));
        }
        return true;
    }
    function statsF(vs) {
        const n = vs.length;
        const mean = vs.reduce((s, x) => s + x, 0) / n;
        const variance = n > 1 ? vs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1) : NaN;
        return { mean, variance };
    }

    function makeFloatFns(angle) {
        const toRad = angle === 'deg' ? (x) => x * PI / 180 : (x) => x;
        const outA = angle === 'deg' ? (r) => r * 180 / PI : (r) => r;
        const F = dict();
        const put = (name, f) => { F[name] = f; };
        put('sqrt', (a) => Math.sqrt(a[0]));
        put('cbrt', (a) => Math.cbrt(a[0]));
        put('root', (a) => {
            const [x, n] = a;
            if (x < 0 && Number.isInteger(n) && Math.abs(n % 2) === 1) return -Math.pow(-x, 1 / n);
            return Math.pow(x, 1 / n);
        });
        put('exp', (a) => Math.exp(a[0]));
        put('ln', (a) => Math.log(a[0]));
        put('log', (a) => (a.length > 1 ? Math.log(a[0]) / Math.log(a[1]) : Math.log10(a[0])));
        put('log2', (a) => Math.log2(a[0]));
        put('log10', (a) => Math.log10(a[0]));
        put('abs', (a) => Math.abs(a[0]));
        put('floor', (a) => Math.floor(a[0]));
        put('ceil', (a) => Math.ceil(a[0]));
        put('trunc', (a) => Math.trunc(a[0]));
        put('sign', (a) => Math.sign(a[0]));
        put('round', (a) => roundF(a[0], a.length > 1 ? Math.trunc(a[1]) : 0));
        put('min', (a) => Math.min(...a));
        put('max', (a) => Math.max(...a));
        put('sum', (a) => a.reduce((s, x) => s + x, 0));
        put('avg', (a) => statsF(a).mean);
        put('mean', (a) => statsF(a).mean);
        put('median', (a) => {
            const s = a.slice().sort((x, y) => x - y);
            const m = s.length >> 1;
            return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
        });
        put('mode', (a) => {
            const s = a.slice().sort((x, y) => x - y);
            let best = s[0];
            let bestCount = 0;
            for (let i = 0; i < s.length;) {
                let j = i;
                while (j < s.length && s[j] === s[i]) j++;
                if (j - i > bestCount) { best = s[i]; bestCount = j - i; }
                i = j;
            }
            return best;
        });
        put('var', (a) => statsF(a).variance);
        put('stdev', (a) => Math.sqrt(statsF(a).variance));
        put('hypot', (a) => Math.hypot(...a));
        put('gcd', (a) => a.reduce((g, x) => gcdF(g, x), 0));
        put('lcm', (a) => a.reduce((l, x) => {
            const g = gcdF(l, x);
            return x === 0 || l === 0 ? 0 : Math.abs(l / g * x);
        }, 1));
        put('fact', (a) => factF(a[0]));
        put('factorial', (a) => factF(a[0]));
        put('nCr', (a) => {
            const [n, k] = a;
            if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0) return NaN;
            if (k > n) return 0;
            return Math.round(Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)));
        });
        put('nPr', (a) => {
            const [n, k] = a;
            if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0) return NaN;
            if (k > n) return 0;
            return Math.round(Math.exp(lgamma(n + 1) - lgamma(n - k + 1)));
        });
        put('mod', (a) => (a[1] === 0 ? NaN : floorMod(a[0], a[1])));
        put('rem', (a) => (a[1] === 0 ? NaN : a[0] % a[1]));
        put('isprime', (a) => (isPrimeF(a[0]) ? 1 : 0));
        put('sin', (a) => Math.sin(toRad(a[0])));
        put('cos', (a) => Math.cos(toRad(a[0])));
        put('tan', (a) => Math.tan(toRad(a[0])));
        put('sec', (a) => 1 / Math.cos(toRad(a[0])));
        put('csc', (a) => 1 / Math.sin(toRad(a[0])));
        put('cot', (a) => 1 / Math.tan(toRad(a[0])));
        put('asin', (a) => outA(Math.asin(a[0])));
        put('acos', (a) => outA(Math.acos(a[0])));
        put('atan', (a) => outA(Math.atan(a[0])));
        put('atan2', (a) => outA(Math.atan2(a[0], a[1])));
        put('sinh', (a) => Math.sinh(a[0]));
        put('cosh', (a) => Math.cosh(a[0]));
        put('tanh', (a) => Math.tanh(a[0]));
        put('deg', (a) => a[0] * 180 / PI);
        put('rad', (a) => a[0] * PI / 180);
        put('clamp', (a) => (a[1] > a[2] ? NaN : Math.min(Math.max(a[0], a[1]), a[2])));
        put('lerp', (a) => a[0] + (a[1] - a[0]) * a[2]);
        return F;
    }

    const STOP = { stop: true };

    /** A constant subtree's exact value (for odd roots like x^(1/3)), or null. */
    function constValue(node) {
        const pure = (n) => {
            if (n.t === 'num') return true;
            if (n.t === 'group' || n.t === 'neg') return pure(n.a);
            if (n.t === 'bin') return ['+', '-', '*', '/'].includes(n.op) && pure(n.a) && pure(n.b);
            return false;
        };
        if (!pure(node)) return null;
        try {
            const v = ev(node, { O: DEFAULTS, sheet: newSheet(DEFAULTS, 0), index: 0, ops: 0, nextCheck: 256, t0: Date.now(), depth: 0, vars: dict(), funcs: dict() }, null);
            return v.k === 'n' && !v.u ? v.v : null;
        } catch (_) {
            return null;
        }
    }

    function makeCompiler(variable, angle, vars, funcs) {
        const state = { ops: 0, depth: 0 };
        const F = makeFloatFns(angle);
        const bodies = new Map();

        function body(name) {
            if (bodies.has(name)) return bodies.get(name);
            const holder = { f: null };
            bodies.set(name, holder);
            const fd = funcs[name];
            holder.f = build(fd.body, fd.params);
            return holder;
        }

        function build(n, params) {
            switch (n.t) {
                case 'num': { const c = toF(n.v); return () => c; }
                case 'bool': { const c = n.v ? 1 : 0; return () => c; }
                case 'group': return build(n.a, params);
                case 'const': { const c = CONST[n.name].value; return () => c; }
                case 'var': {
                    if (params) {
                        const k = params.indexOf(n.name);
                        if (k !== -1) return (x, fr) => fr[k];
                    }
                    if (n.name === variable) return (x) => x;
                    if (hasOwn(vars, n.name)) {
                        const v = vars[n.name].value;
                        if (v.k === 'b') { const c = v.v ? 1 : 0; return () => c; }
                        if (v.u) fail(`'${n.name}' has a unit (${ueStr(v.u)}) — graphs and the solver need plain numbers`, n);
                        const c = toF(v.v);
                        return () => c;
                    }
                    return fail(`Unknown name '${n.name}' — define it first, like ${n.name} = 5`, n);
                }
                case 'unit': case 'numunit': return fail(UNITS_HERE, n);
                case 'ref': return fail("Line references like ans, total or line3 can't be used here", n);
                case 'conv': return fail("Conversions like 'to km' can't be used here", n);
                case 'neg': { const a = build(n.a, params); return (x, fr) => -a(x, fr); }
                case 'pct': { const a = build(n.a, params); return (x, fr) => a(x, fr) / 100; }
                case 'fact': { const a = build(n.a, params); return (x, fr) => factF(a(x, fr)); }
                case 'cmp': {
                    const a = build(n.a, params);
                    const b = build(n.b, params);
                    const cmp = {
                        '==': (p, q) => p === q, '!=': (p, q) => p !== q, '<': (p, q) => p < q,
                        '<=': (p, q) => p <= q, '>': (p, q) => p > q, '>=': (p, q) => p >= q
                    }[n.op];
                    return (x, fr) => (cmp(a(x, fr), b(x, fr)) ? 1 : 0);
                }
                case 'bin': return buildBin(n, params);
                case 'call': return buildCall(n, params);
                default: return fail('Something went wrong reading this expression', n);
            }
        }

        function buildBin(n, params) {
            if ((n.op === '+' || n.op === '-') && n.b.t === 'pct' && n.a.t !== 'pct') {
                const a = build(n.a, params);
                const p = build(n.b.a, params);
                const s = n.op === '+' ? 1 : -1;
                return (x, fr) => a(x, fr) * (1 + s * p(x, fr) / 100);
            }
            const a = build(n.a, params);
            const b = build(n.b, params);
            switch (n.op) {
                case '+': return (x, fr) => a(x, fr) + b(x, fr);
                case '-': return (x, fr) => a(x, fr) - b(x, fr);
                case '*': case 'of': return (x, fr) => a(x, fr) * b(x, fr);
                case '/': return (x, fr) => a(x, fr) / b(x, fr);
                case 'mod': return (x, fr) => {
                    const q = b(x, fr);
                    return q === 0 ? NaN : floorMod(a(x, fr), q);
                };
                case '^': {
                    const k = constValue(n.b);
                    if (k && isR(k) && k.d % 2n === 1n && k.d !== 1n) {
                        const y = toF(k);
                        const odd = k.n % 2n !== 0n;
                        return (x, fr) => {
                            const base = a(x, fr);
                            if (base >= 0) return Math.pow(base, y);
                            const m = Math.pow(-base, y);
                            return odd ? -m : m;
                        };
                    }
                    return (x, fr) => Math.pow(a(x, fr), b(x, fr));
                }
                default: return fail('Something went wrong reading this expression', n);
            }
        }

        function buildCall(n, params) {
            const name = n.name;
            if (!n.user && name === 'if') {
                if (n.args.length !== 3) fail('if takes 3 values: if(condition, value if true, value if false)', n);
                const [c, t, f] = n.args.map((a) => build(a, params));
                return (x, fr) => {
                    const v = c(x, fr);
                    return v !== 0 && !Number.isNaN(v) ? t(x, fr) : f(x, fr);
                };
            }
            if (!n.user && FN[name]) {
                const def0 = FN[name];
                if (n.args.length < def0.min || n.args.length > def0.max) fail(`${name} takes ${arityText(def0)}, but got ${n.args.length}`, n);
                const fs = n.args.map((a) => build(a, params));
                const f = F[name];
                if (!f) return fail(`${name} can't be used in a graph or solver expression`, n);
                return (x, fr) => f(fs.map((g) => g(x, fr)));
            }
            if (!hasOwn(funcs, name)) return fail(`Unknown function '${name}' — define it first, like ${name}(x) = x * 2`, n);
            const fd = funcs[name];
            if (n.args.length !== fd.params.length) {
                fail(`${name} takes ${fd.params.length} value${fd.params.length === 1 ? '' : 's'}, but got ${n.args.length}`, n);
            }
            const argFns = n.args.map((a) => build(a, params));
            const holder = body(name);
            return (x, fr) => {
                if (++state.ops > LIMITS.compileOps || state.depth >= LIMITS.recursion) throw STOP;
                const frame = argFns.map((g) => g(x, fr));
                state.depth++;
                try {
                    return holder.f(x, frame);
                } finally {
                    state.depth--;
                }
            };
        }

        return { state, build };
    }

    function compile(expr, opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        let variable = typeof o.variable === 'string' && NAME_RE.test(o.variable) && !RESERVED.has(o.variable) ? o.variable : 'x';
        const angle = o.angle === 'deg' ? 'deg' : 'rad';
        const failed = (message) => ({ fn: NAN_FN, error: message });
        try {
            const raw = typeof expr === 'string' ? expr : (expr === null || expr === undefined ? '' : String(expr));
            if (raw.length > LIMITS.lineChars) return failed(`That expression is too long — keep it under ${fmtInt(LIMITS.lineChars)} characters`);
            const src = raw.replace(/[\r\n]+/g, ' ');
            const cut = src.indexOf('//');
            const end = cut === -1 ? src.length : cut;
            if (!src.slice(0, end).trim()) return failed(`Type an expression in ${variable}, like ${variable}^2 - 2`);
            let vars = dict();
            let funcs = dict();
            if (typeof o.sheet === 'string' && o.sheet.trim()) {
                const run = runSheet(o.sheet, { angle });
                vars = run.sheet.vars;
                funcs = run.sheet.funcs;
            }
            const toks = tokenize(src, 0, end);
            const eqAt = toks.findIndex((t) => isOp(t, '='));
            const scopeFor = (v) => ({
                implicit: true,
                isVar: (n) => n === v || hasOwn(vars, n),
                isFunc: (n) => n !== v && hasOwn(funcs, n)
            });
            let node;
            if (eqAt === -1) {
                node = parseRest({ toks, i: 0, scope: scopeFor(variable), depth: 0 }, null);
            } else {
                if (toks.slice(eqAt + 1).some((t) => isOp(t, '='))) return failed("Use only one '=', like x^2 = 2");
                const eqTok = toks[eqAt];
                const sig = toks[0].type === 'id' && isOp(toks[1], '(') ? scanSignature(toks) : null;
                if (sig && sig.next === eqAt + 1 && sig.params.length === 1) {
                    variable = sig.params[0];
                    node = parseRest({ toks: toks.slice(eqAt + 1), i: 0, scope: scopeFor(variable), depth: 0 }, eqTok);
                } else if (eqAt === 1 && toks[0].type === 'id' && toks[0].value !== variable) {
                    node = parseRest({ toks: toks.slice(2), i: 0, scope: scopeFor(variable), depth: 0 }, eqTok);
                } else {
                    const lhsToks = toks.slice(0, eqAt).concat([{ type: 'end', value: '', text: '', s: eqTok.s, e: eqTok.s }]);
                    const lhs = parseRest({ toks: lhsToks, i: 0, scope: scopeFor(variable), depth: 0 }, null);
                    const rhs = parseRest({ toks: toks.slice(eqAt + 1), i: 0, scope: scopeFor(variable), depth: 0 }, eqTok);
                    node = bin('-', lhs, rhs);
                }
            }
            const C = makeCompiler(variable, angle, vars, funcs);
            const f = C.build(node, null);
            const fn = (x) => {
                C.state.ops = 0;
                C.state.depth = 0;
                try {
                    const r = f(Number(x), null);
                    return typeof r === 'number' ? r : NaN;
                } catch (_) {
                    return NaN;
                }
            };
            return { fn, error: null };
        } catch (err) {
            return failed(err && err.isEngine ? err.message : 'That expression could not be read');
        }
    }

    /* ================================================================== */
    /* Reference metadata                                                  */
    /* ================================================================== */

    // [name, signature, description, category, example]
    const FN_DOCS = [
        ['sqrt', 'sqrt(x)', 'Square root. Exact for perfect squares and keeps units: sqrt(16 m^2) is 4 m.', 'Powers & roots', 'sqrt(2)'],
        ['cbrt', 'cbrt(x)', 'Cube root; works for negative numbers too.', 'Powers & roots', 'cbrt(-27)'],
        ['root', 'root(x, n)', 'The n-th root of x; odd roots of negative numbers are allowed.', 'Powers & roots', 'root(32, 5)'],
        ['exp', 'exp(x)', 'e raised to the power x.', 'Logarithms', 'exp(1)'],
        ['ln', 'ln(x)', 'Natural logarithm (base e) of a number above 0.', 'Logarithms', 'ln(10)'],
        ['log', 'log(x[, base])', 'Logarithm, base 10 unless you give a base. Exact when the answer is a whole number.', 'Logarithms', 'log(8, 2)'],
        ['log2', 'log2(x)', 'Base-2 logarithm.', 'Logarithms', 'log2(1024)'],
        ['log10', 'log10(x)', 'Base-10 logarithm.', 'Logarithms', 'log10(1000)'],
        ['abs', 'abs(x)', 'Distance from zero; keeps units.', 'Rounding & sign', 'abs(-5)'],
        ['sign', 'sign(x)', '-1 for negative, 0 for zero, 1 for positive.', 'Rounding & sign', 'sign(-3)'],
        ['floor', 'floor(x)', 'Rounds down to a whole number.', 'Rounding & sign', 'floor(2.7)'],
        ['ceil', 'ceil(x)', 'Rounds up to a whole number.', 'Rounding & sign', 'ceil(2.1)'],
        ['round', 'round(x[, n])', 'Rounds half away from zero, to n decimal places (0 by default; negative n rounds to tens, hundreds…).', 'Rounding & sign', 'round(3.14159, 2)'],
        ['trunc', 'trunc(x)', 'Drops the fractional part, rounding toward zero.', 'Rounding & sign', 'trunc(-2.7)'],
        ['min', 'min(a, b, …)', 'The smallest value; values with units are compared in the first one\'s unit.', 'Lists & statistics', 'min(4, 2, 8)'],
        ['max', 'max(a, b, …)', 'The largest value.', 'Lists & statistics', 'max(4, 2, 8)'],
        ['sum', 'sum(a, b, …)', 'Adds the values. Bare sum (no brackets) totals the lines above.', 'Lists & statistics', 'sum(1, 2, 3)'],
        ['avg', 'avg(a, b, …)', 'Arithmetic mean. Bare avg (no brackets) averages the lines above.', 'Lists & statistics', 'avg(2, 4, 9)'],
        ['mean', 'mean(a, b, …)', 'Arithmetic mean (same as avg).', 'Lists & statistics', 'mean(2, 4, 9)'],
        ['median', 'median(a, b, …)', 'The middle value; the mean of the two middle values for an even count.', 'Lists & statistics', 'median(3, 1, 4, 1, 5)'],
        ['mode', 'mode(a, b, …)', 'The most frequent value (the smallest one on a tie).', 'Lists & statistics', 'mode(1, 2, 2, 3)'],
        ['stdev', 'stdev(a, b, …)', 'Sample standard deviation (divides by n - 1); needs at least 2 values.', 'Lists & statistics', 'stdev(2, 4, 4, 4, 5, 5, 7, 9)'],
        ['var', 'var(a, b, …)', 'Sample variance (divides by n - 1); needs at least 2 values.', 'Lists & statistics', 'var(2, 4, 4, 4, 5, 5, 7, 9)'],
        ['hypot', 'hypot(a, b, …)', 'Square root of the sum of squares, such as the long side of a right triangle.', 'Lists & statistics', 'hypot(3, 4)'],
        ['gcd', 'gcd(a, b, …)', 'Greatest common divisor of whole numbers.', 'Number theory', 'gcd(12, 18)'],
        ['lcm', 'lcm(a, b, …)', 'Least common multiple of whole numbers.', 'Number theory', 'lcm(4, 6)'],
        ['fact', 'fact(n)', 'Factorial, the same as n!; exact up to 1000!, gamma function for fractions.', 'Number theory', 'fact(5)'],
        ['factorial', 'factorial(n)', 'Factorial, the same as n!.', 'Number theory', 'factorial(10)'],
        ['nCr', 'nCr(n, k)', 'Combinations: ways to choose k items from n when order does not matter.', 'Number theory', 'nCr(5, 2)'],
        ['nPr', 'nPr(n, k)', 'Permutations: ways to arrange k items from n when order matters.', 'Number theory', 'nPr(5, 2)'],
        ['mod', 'mod(a, b)', 'Remainder with the sign of b (floored), the same as a mod b.', 'Number theory', 'mod(-7, 3)'],
        ['rem', 'rem(a, b)', 'Remainder with the sign of a (truncated division).', 'Number theory', 'rem(-7, 3)'],
        ['isprime', 'isprime(n)', 'true when n is a prime number (whole numbers up to about 300 digits).', 'Number theory', 'isprime(97)'],
        ['sin', 'sin(x)', 'Sine. Plain numbers use the angle setting; an angle unit always wins: sin(30 deg) is 0.5.', 'Trigonometry', 'sin(30 deg)'],
        ['cos', 'cos(x)', 'Cosine.', 'Trigonometry', 'cos(pi)'],
        ['tan', 'tan(x)', 'Tangent.', 'Trigonometry', 'tan(45 deg)'],
        ['sec', 'sec(x)', 'Secant, 1 / cos(x).', 'Trigonometry', 'sec(60 deg)'],
        ['csc', 'csc(x)', 'Cosecant, 1 / sin(x).', 'Trigonometry', 'csc(30 deg)'],
        ['cot', 'cot(x)', 'Cotangent, cos(x) / sin(x).', 'Trigonometry', 'cot(45 deg)'],
        ['asin', 'asin(x)', 'Inverse sine; the answer is in degrees or radians per the angle setting.', 'Trigonometry', 'asin(0.5)'],
        ['acos', 'acos(x)', 'Inverse cosine.', 'Trigonometry', 'acos(0)'],
        ['atan', 'atan(x)', 'Inverse tangent.', 'Trigonometry', 'atan(1)'],
        ['atan2', 'atan2(y, x)', 'Angle of the point (x, y) from the positive x axis, in the right quadrant.', 'Trigonometry', 'atan2(1, -1)'],
        ['deg', 'deg(x)', 'Radians to degrees: deg(pi) is 180. With brackets it is a function; without, deg is the degree unit.', 'Trigonometry', 'deg(pi)'],
        ['rad', 'rad(x)', 'Degrees to radians: rad(180) is pi.', 'Trigonometry', 'rad(180)'],
        ['sinh', 'sinh(x)', 'Hyperbolic sine.', 'Hyperbolic', 'sinh(1)'],
        ['cosh', 'cosh(x)', 'Hyperbolic cosine.', 'Hyperbolic', 'cosh(1)'],
        ['tanh', 'tanh(x)', 'Hyperbolic tangent.', 'Hyperbolic', 'tanh(1)'],
        ['clamp', 'clamp(x, low, high)', 'Keeps x between low and high.', 'Ranges & logic', 'clamp(15, 0, 10)'],
        ['lerp', 'lerp(a, b, t)', 'The point a fraction t of the way from a to b.', 'Ranges & logic', 'lerp(10, 20, 0.25)'],
        ['if', 'if(condition, a, b)', 'a when the condition is true (or not 0), otherwise b; only the chosen value is worked out.', 'Ranges & logic', 'if(5 > 3, 1, 0)']
    ];

    const KEYWORD_DOCS = [
        ['to', 'Converts to a unit or format: hex, bin, oct, dec, sci, eng, fraction or %.', '5 km to mi'],
        ['as', 'Same as to.', '0.25 as %'],
        ['in', 'Converts when it follows a quantity and comes before a unit; otherwise it means inches.', '100 km in miles'],
        ['of', 'Percent of a value.', '20% of 150'],
        ['%', 'Percent: 15% is 0.15. a + b% and a - b% raise or lower a by b percent.', '150 + 10%'],
        ['mod', 'Remainder after division (the sign follows the divisor).', '10 mod 3'],
        ['ans', 'The result of the nearest line above that has one.', 'ans * 2'],
        ['total', 'Adds the values in the block of lines above, up to a blank line or heading (sum without brackets works too).', 'total'],
        ['average', 'Averages the block of lines above (avg without brackets works too).', 'average'],
        ['lineN', 'The result on line N of the sheet (1-based); it must be above the current line.', 'line3 * 2'],
        ['hex', 'Conversion target: base 16 with a 0x prefix (whole numbers only).', '255 to hex'],
        ['bin', 'Conversion target: base 2 with a 0b prefix (whole numbers only).', '10 to bin'],
        ['oct', 'Conversion target: base 8 with a 0o prefix (whole numbers only).', '8 to oct'],
        ['dec', 'Conversion target: ordinary decimal digits, never scientific notation.', '0xFF to dec'],
        ['sci', 'Conversion target: scientific notation.', '1234 to sci'],
        ['eng', 'Conversion target: engineering notation (powers of ten in steps of 3).', '12345 to eng'],
        ['fraction', 'Conversion target: an exact fraction (≈ marks an approximation).', '0.75 to fraction'],
        ['sq / cu', 'Square and cubic units before a length unit.', '3 sq ft'],
        ['true / false', 'The results of comparisons such as 3 > 2; use them with if().', 'if(true, 1, 2)'],
        ['name = value', 'Stores a value in a variable for the lines below.', 'rate = 0.05'],
        ['f(x) = …', 'Defines a function; it may call itself up to 64 levels deep.', 'f(x) = x^2 + 1'],
        ['Label:', 'Words before a colon name the line; the value follows.', 'Rent: 1200'],
        ['# heading', 'A line starting with # is a heading; it also ends a total block.', '# Budget'],
        ['// comment', 'Everything after // is ignored.', '5 * 3 // note']
    ];

    const UNIT_CATEGORIES = [
        ['length', 'Length'], ['area', 'Area'], ['volume', 'Volume'], ['mass', 'Mass'], ['time', 'Time'],
        ['speed', 'Speed'], ['acceleration', 'Acceleration'], ['force', 'Force'], ['pressure', 'Pressure'],
        ['energy', 'Energy'], ['power', 'Power'], ['temperature', 'Temperature'], ['data', 'Data'],
        ['angle', 'Angle'], ['frequency', 'Frequency'], ['electric', 'Electric']
    ];

    const UNIT_ORDER = {
        length: ['m', 'km', 'cm', 'mm', 'µm', 'nm', 'in', 'ft', 'yd', 'mi', 'nmi'],
        area: ['m^2', 'km^2', 'cm^2', 'ha', 'acre', 'in^2', 'ft^2', 'yd^2', 'mi^2'],
        volume: ['L', 'mL', 'cL', 'dL', 'm^3', 'cm^3', 'gal', 'qt', 'pt', 'cup', 'fl oz', 'tbsp', 'tsp', 'in^3', 'ft^3'],
        mass: ['kg', 'g', 'mg', 'µg', 'tonne', 'lb', 'oz', 'ton', 'st'],
        time: ['s', 'ms', 'µs', 'ns', 'min', 'h', 'day', 'week', 'month', 'year'],
        speed: ['m/s', 'km/h', 'kph', 'mph', 'kn', 'ft/s'],
        acceleration: ['m/s^2', 'ft/s^2', 'gn'],
        force: ['N', 'kN', 'lbf', 'kgf'],
        pressure: ['Pa', 'kPa', 'MPa', 'hPa', 'bar', 'mbar', 'psi', 'atm', 'mmHg', 'torr'],
        energy: ['J', 'kJ', 'MJ', 'cal', 'kcal', 'Wh', 'kWh', 'MWh', 'eV', 'BTU'],
        power: ['W', 'mW', 'kW', 'MW', 'GW', 'hp'],
        temperature: ['°C', '°F', 'K'],
        data: ['b', 'kb', 'Mb', 'Gb', 'B', 'kB', 'MB', 'GB', 'TB', 'PB', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'],
        angle: ['deg', 'rad', 'grad', 'turn', 'arcmin', 'arcsec'],
        frequency: ['Hz', 'kHz', 'MHz', 'GHz', 'rpm'],
        electric: ['A', 'mA', 'V', 'mV', 'kV', 'Ω', 'kΩ', 'MΩ', 'W', 'Ah', 'mAh']
    };

    // Compound entries: symbol → [name, aliases]
    const COMPOUND_NAMES = {
        'm^2': ['square meter', ['sq m', 'sqm']], 'km^2': ['square kilometer', ['sq km']], 'cm^2': ['square centimeter', ['sq cm']],
        'in^2': ['square inch', ['sq in']], 'ft^2': ['square foot', ['sq ft', 'sqft']], 'yd^2': ['square yard', ['sq yd']],
        'mi^2': ['square mile', ['sq mi']], 'm^3': ['cubic meter', ['cu m']], 'cm^3': ['cubic centimeter', ['cu cm']],
        'in^3': ['cubic inch', ['cu in']], 'ft^3': ['cubic foot', ['cu ft']], 'm/s': ['meter per second', []],
        'km/h': ['kilometer per hour', []], 'ft/s': ['foot per second', []], 'm/s^2': ['meter per second squared', []],
        'ft/s^2': ['foot per second squared', []]
    };

    /** A unit text ('km/h', 'fl oz', 'sq ft', '°C') as a unit expression; throws a plain Error. */
    function parseUnitText(text, role) {
        const s = typeof text === 'string' ? text.trim() : '';
        if (!s) throw new Error(`Choose a unit to convert ${role}`);
        if (s.length > 100) throw new Error('That unit name is too long');
        let toks;
        try {
            toks = tokenize(s, 0, s.length);
        } catch (_) {
            throw new Error(`Unknown unit '${s}' — check the units list in Reference`);
        }
        const P = { toks, i: 0, scope: { implicit: true, isVar: () => false, isFunc: () => false }, depth: 0 };
        let r = null;
        try { r = parseUnitExpr(P); } catch (_) { r = null; }
        if (!r || peek(P).type !== 'end') throw new Error(`Unknown unit '${s}' — check the units list in Reference`);
        if (!r.ue.length) throw new Error(`'${s}' cancels out to a plain number`);
        return r.ue;
    }

    function buildUnitReference() {
        const out = [];
        const seen = new Set();
        for (const [cat] of UNIT_CATEGORIES) {
            for (const sym of UNIT_ORDER[cat]) {
                if (seen.has(sym)) continue;
                seen.add(sym);
                if (COMPOUND_NAMES[sym]) {
                    out.push({ symbol: sym, name: COMPOUND_NAMES[sym][0], aliases: COMPOUND_NAMES[sym][1].slice(), category: cat });
                    continue;
                }
                const u = findUnit(sym);
                if (!u) continue;
                const aliases = [u.plural, ...u.aliases, ...u.names].filter((a, i, arr) => a && a !== u.name && a !== sym && arr.indexOf(a) === i);
                out.push({ symbol: sym, name: u.name, aliases, category: cat });
            }
        }
        return out;
    }

    const REF_UNITS = buildUnitReference();

    const reference = Object.freeze({
        functions: Object.freeze(FN_DOCS.map(([name, signature, description, category, example]) => Object.freeze({ name, signature, description, category, example }))),
        constants: Object.freeze(Object.keys(CONST).map((k) => Object.freeze({ name: k, value: CONST[k].value, description: CONST[k].description }))),
        units: Object.freeze(REF_UNITS.map((u) => Object.freeze({ symbol: u.symbol, name: u.name, aliases: Object.freeze(u.aliases.slice()), category: u.category }))),
        keywords: Object.freeze(KEYWORD_DOCS.map(([word, description, example]) => Object.freeze({ word, description, example })))
    });

    const units = Object.freeze({
        categories() {
            return UNIT_CATEGORIES.map(([id, label]) => ({ id, label }));
        },
        list(categoryId) {
            const order = typeof categoryId === 'string' && hasOwn(UNIT_ORDER, categoryId) ? UNIT_ORDER[categoryId] : [];
            return order.map((sym) => {
                const r = REF_UNITS.find((u) => u.symbol === sym);
                return r ? { symbol: r.symbol, name: r.name } : null;
            }).filter(Boolean);
        },
        convert(value, fromSymbol, toSymbol) {
            const x = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(x)) throw new Error('Enter a number to convert');
            const from = parseUnitText(fromSymbol, 'from');
            const to = parseUnitText(toSymbol, 'to');
            const exact = decimalRat(String(x));
            const v = qty(isR(exact) ? exact : x, from);
            let r;
            try {
                r = convertQ(v, to, null, DEFAULTS);
            } catch (err) {
                const fu = ueStr(from);
                const tu = ueStr(to);
                if (err && err.isEngine && /don't match|°C or °F/.test(err.message)) {
                    throw new Error(`Can't convert ${fu} to ${tu} — ${dimNameOf(from)} and ${dimNameOf(to)} don't match`);
                }
                throw new Error(err && err.message ? err.message : 'Those units can\'t be converted');
            }
            return toF(r.v);
        }
    });

    return Object.freeze({
        evaluateSheet,
        evaluate,
        compile,
        formatNumber,
        reference,
        units,
        limits: LIMITS,
        defaults: DEFAULTS,
        normalizeOptions: normOptions,
        checkName: nameProblem
    });
});
