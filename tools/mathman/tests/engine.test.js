/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: MathEngineTests (mathMan Edition - v1.0)
 *     - File Name: engine.test.js
 *     - Relative Path: tools/mathman/tests/engine.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for the mathMan expression engine (js/engine.js). They
 *     cover every syntax rule in the engine contract — numbers, operators
 *     and precedence, implicit multiplication, percentages, units, labels,
 *     line references, conversions, functions and formatting — plus the
 *     safety budgets, so a change to the engine cannot quietly break a
 *     worksheet. Run them after any edit to engine.js.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus a twelve-line runner
 *     - Exact arithmetic checks: 1/3 + 1/6 is exactly 1/2, 0.1 + 0.2 is 0.3,
 *       2^-1 is exactly 1/2, factorial(1000) keeps all 2,568 digits
 *     - Precedence and associativity: -2^2, 2^3^2, postfix ! and %, the
 *       conversion operators below comparison
 *     - Units: prefixes, long names, plurals, multi-word names, compound
 *       units, dimension errors, affine temperatures and data sizes
 *     - Sheets: labels, comments, headings, ans, lineN, total and average
 *       blocks, variables, user functions and the recursion cap
 *     - Every contract function evaluated at least once and listed in the
 *       reference with a signature, description, category and example
 *     - Formatting: precision, notations, thousands separators, fractions
 *     - Safety: reserved names, 9^9^9 in under 200 ms, nesting and step
 *       budgets, a 2,000-line sheet in under a second
 *     - compile() for graphs and the solver, and the units API
 *     - Prints a pass/fail line per test and an assertion total; exits 1 on
 *       any failure so it can gate a commit
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/mathman/tests/engine.test.js
 *     A clean run ends with "All N tests passed (M assertions)".
 *
 * ✒ Examples:
 *     node tools/mathman/tests/engine.test.js           → full run
 *     node tools/mathman/tests/engine.test.js units     → only tests whose
 *                                                          name contains "units"
 *     eq(show('1/3 + 1/6'), '0.5')
 *     eq(run('1/3 + 1/6').exact, '1/2')
 *     near(num('60 mph to km/h'), 96.56064, 1e-9)
 *     ok(/length and mass/.test(err('3 km + 2 kg')))
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+ and ../js/engine.js
 *     - Compatible platforms: any OS with Node
 *     - Limitations: the timing tests (9^9^9, 2,000 lines) use generous
 *       bounds; the browser UI around the engine is covered by the e2e suite
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));

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

const RAD = { angle: 'rad' };
const DEG = { angle: 'deg' };
const run = (expr, O) => E.evaluate(expr, O || RAD);
function show(expr, O) {
    const r = run(expr, O);
    assert.ok(!r.error, `${expr} → unexpected error: ${r.error && r.error.message}`);
    return r.display;
}
function num(expr, O) {
    const r = run(expr, O);
    assert.ok(!r.error, `${expr} → unexpected error: ${r.error && r.error.message}`);
    return r.numeric;
}
function err(expr, O) {
    const r = run(expr, O);
    assert.ok(r.error, `${expr} should fail but gave ${r.display}`);
    eq(r.kind, 'error');
    return r.error.message;
}
const sheet = (text, O) => E.evaluateSheet(text, O || RAD);
const displays = (text, O) => sheet(text, O).lines.map((l) => (l.error ? `ERR ${l.error.message}` : l.display));

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

test('numbers: integers, decimals, leading dot, exponents', () => {
    eq(show('42'), '42');
    eq(show('3.14'), '3.14');
    eq(show('.5'), '0.5');
    eq(show('1e-3'), '0.001');
    eq(show('2.5E3'), '2,500');
    eq(show('7.'), '7');
});

test('numbers: underscores and comma groups outside brackets', () => {
    eq(show('1_000_000'), '1,000,000');
    eq(run('1_000_000').plain, '1000000');
    eq(show('1,234,567 + 1'), '1,234,568');
    eq(show('max(1,000)'), '1', 'inside brackets the comma separates values: max(1, 0)');
    ok(/comma/i.test(err('1,23')), 'a bad group is a comma error');
});

test('numbers: hex, binary and octal literals', () => {
    eq(show('0xFF'), '255');
    eq(show('0b1010'), '10');
    eq(show('0o17'), '15');
    eq(show('0x1_0000'), '65,536');
    ok(/binary/.test(err('0b102')));
});

/* ------------------------------------------------------------------ */
/* Exact arithmetic                                                    */
/* ------------------------------------------------------------------ */

test('exact: 1/3 + 1/6 is exactly 1/2', () => {
    const r = run('1/3 + 1/6');
    eq(r.kind, 'value');
    eq(r.display, '0.5');
    eq(r.exact, '1/2');
    eq(r.numeric, 0.5);
});

test('exact: 0.1 + 0.2 shows 0.3', () => {
    const r = run('0.1 + 0.2');
    eq(r.display, '0.3');
    eq(r.numeric, 0.3);
    eq(r.exact, '3/10');
    eq(show('0.1 + 0.2 == 0.3'), 'true');
});

test('exact: big integers keep every digit in plain', () => {
    const r = run('2^100');
    eq(r.plain, '1267650600228229401496703205376');
    eq(r.display, '1.2676506e30');
    eq(run('2^53 + 1').plain, '9007199254740993');
    eq(show('2^53 + 1'), '9.007199255e15', 'auto notation switches to scientific from 1e15');
    eq(show('2^53 + 1', { notation: 'fixed' }), '9,007,199,254,740,993');
    eq(run('1/3').exact, '1/3');
    eq(run('6/3').exact, '', 'whole results have no fraction');
});

test('exact: decimals round exactly (round(1.005, 2) is 1.01)', () => {
    eq(show('round(1.005, 2)'), '1.01');
    eq(show('1/3 * 3'), '1');
    eq(show('2/3'), '0.6666666667');
});

/* ------------------------------------------------------------------ */
/* Operators and precedence                                            */
/* ------------------------------------------------------------------ */

test('precedence: -2^2 is -4, 2^-1 is exactly 1/2, 2^3^2 is 512', () => {
    eq(show('-2^2'), '-4');
    eq(show('(-2)^2'), '4');
    eq(show('2^-1'), '0.5');
    eq(run('2^-1').exact, '1/2');
    eq(show('2^3^2'), '512');
});

test('precedence: arithmetic order and left associativity', () => {
    eq(show('2 + 3 * 4'), '14');
    eq(show('(2 + 3) * 4'), '20');
    eq(show('10 - 4 - 3'), '3');
    eq(show('100 / 10 / 5'), '2');
    eq(show('2 * 3^2'), '18');
    eq(show('2 ** 3'), '8');
});

test('postfix: factorial binds tighter than ^', () => {
    eq(show('5!'), '120');
    eq(show('0!'), '1');
    eq(show('3!^2'), '36');
    eq(show('2^3!'), '64');
    ok(/0 or more/.test(err('(-1)!')));
    near(num('0.5!'), 0.886226925452758, 1e-12, 'gamma for fractions');
});

test('comparison: true/false results and unit-aware equality', () => {
    eq(show('3 > 2'), 'true');
    eq(show('3 < 2'), 'false');
    eq(show('2 == 2.0'), 'true');
    eq(show('3 != 3'), 'false');
    eq(show('2 <= 2'), 'true');
    eq(show('1 km == 1000 m'), 'true');
    eq(show('12 in == 1 ft'), 'true');
    eq(run('3 > 2').numeric, null);
    ok(/don't mix/.test(err('1 km > 2 kg')));
});

test('conversion binds loosest: 1 + 1 to hex', () => {
    eq(show('1 + 1 to hex'), '0x2');
    eq(show('2 km + 500 m to m'), '2,500 m');
});

test('mod operator and function', () => {
    eq(show('10 mod 3'), '1');
    eq(show('-7 mod 3'), '2');
    eq(show('mod(-7, 3)'), '2');
    eq(show('rem(-7, 3)'), '-1');
    eq(show('7.5 mod 2'), '1.5');
});

test('unicode operators: × ÷ − √ ² ≤', () => {
    eq(show('6 × 7'), '42');
    eq(show('8 ÷ 2'), '4');
    eq(show('2 − 3'), '-1');
    eq(show('√16'), '4');
    eq(show('3²'), '9');
    eq(show('2 ≤ 3'), 'true');
});

/* ------------------------------------------------------------------ */
/* Implicit multiplication                                             */
/* ------------------------------------------------------------------ */

test('implicit: 2(3+4) is 14 and the other forms', () => {
    eq(show('2(3+4)'), '14');
    eq(show('(1+2)(3+4)'), '21');
    near(num('2pi'), 2 * Math.PI, 1e-12);
    eq(show('3 sqrt(4)'), '6');
    eq(displays('x = 3\ny = 4\n2x\nx y\n1/2x\nx(2)'), ['3', '4', '6', '12', '1.5', '6']);
});

test('implicit: off makes 2(3+4) an error but units still attach', () => {
    const O = { implicitMult: false };
    ok(/implicit multiplication/.test(err('2(3+4)', O)));
    ok(/Missing operator/.test(err('2pi', O)));
    eq(show('5 km', O), '5 km');
    eq(show('2*(3+4)', O), '14');
});

test('implicit: two bare numbers are a missing operator, not a product', () => {
    eq(err('2 3'), "Missing operator before '3'");
});

/* ------------------------------------------------------------------ */
/* Variables and functions                                             */
/* ------------------------------------------------------------------ */

test('variables: assign, use below, reassign', () => {
    const r = sheet('rate = 0.05\nprincipal = 1000\nprincipal * rate\nrate = 0.1\nprincipal * rate');
    eq(r.lines.map((l) => l.kind), ['assignment', 'assignment', 'value', 'assignment', 'value']);
    eq(r.lines[2].display, '50');
    eq(r.lines[4].display, '100');
    eq(r.variables.map((v) => [v.name, v.display, v.line]), [['principal', '1,000', 2], ['rate', '0.1', 4]]);
});

test('variables: unknown names give a positioned, friendly error', () => {
    const r = run('2 + foo');
    eq(r.error.message, "Unknown name 'foo' — define it first, like foo = 5");
    eq([r.error.start, r.error.end], [4, 7]);
});

test('names: __proto__, constructor and prototype are rejected', () => {
    ok(/can't be used as a name/.test(err('__proto__ = 1')));
    ok(/can't be used as a name/.test(err('constructor = 1')));
    ok(/can't be used as a name/.test(err('prototype = 1')));
    ok(/Unknown name 'constructor'/.test(err('constructor + 1')));
    ok(/Unknown function 'hasOwnProperty'/.test(err('hasOwnProperty(1)')));
    ok(/can't be used as a name/.test(sheet('f(__proto__) = 1').lines[0].error.message));
});

test('names: built-in functions, constants, units and keywords are taken', () => {
    ok(/built-in function/.test(err('sin = 1')));
    ok(/built-in constant/.test(err('pi = 3')));
    ok(/is a unit/.test(err('km = 5')));
    ok(/keyword/.test(err('total = 5')));
    ok(/keyword/.test(err('line3 = 5')));
    eq(E.checkName('rent_2026'), null);
});

test('functions: f(x) = x^2 + 1 then f(3) is 10', () => {
    const r = sheet('f(x) = x^2 + 1\nf(3)\narea(width, height) = width * height\narea(3, 4)\nf(1, 2)\nbad(h) = h');
    eq(r.lines[0].kind, 'function');
    eq(r.lines[1].display, '10');
    eq(r.lines[3].display, '12');
    ok(/takes 1 value \(x\), but got 2/.test(r.lines[4].error.message));
    ok(/'h' is a unit/.test(r.lines[5].error.message), 'unit names cannot be inputs');
    eq(r.functions.map((f) => [f.name, f.params, f.body, f.line]), [['f', ['x'], 'x^2 + 1', 1], ['area', ['width', 'height'], 'width * height', 3]]);
});

test('functions: recursion works and is capped at 64 levels', () => {
    const r = sheet('fact2(n) = if(n <= 1, 1, n * fact2(n - 1))\nfact2(20)\nloop(n) = loop(n + 1)\nloop(1)');
    eq(r.lines[1].plain, '2432902008176640000');
    ok(/Too many nested calls/.test(r.lines[3].error.message));
    ok(/64/.test(r.lines[3].error.message));
    eq([r.lines[3].error.start, r.lines[3].error.end], [0, 7], 'the error points at the call on this line');
});

test('functions: runaway work hits the step budget quickly', () => {
    const t0 = Date.now();
    const r = sheet('fib(n) = if(n < 2, n, fib(n - 1) + fib(n - 2))\nfib(15)\nfib(40)');
    eq(r.lines[1].display, '610');
    ok(/too many steps/.test(r.lines[2].error.message));
    ok(Date.now() - t0 < 1500, 'budget stops it in time');
});

test('if() is lazy and accepts numbers as conditions', () => {
    eq(show('if(3 > 2, 10, 20)'), '10');
    eq(show('if(0, 10, 20)'), '20');
    eq(show('if(true, 1, 1/0)'), '1');
});

/* ------------------------------------------------------------------ */
/* Labels, comments, headings                                          */
/* ------------------------------------------------------------------ */

test('labels: "Rent: 1200" names the line', () => {
    const r = sheet('Rent: 1200\nCar loan (May): 300\nTax rate: rate = 8%\nGroceries:');
    eq([r.lines[0].label, r.lines[0].display, r.lines[0].kind], ['Rent', '1,200', 'value']);
    eq([r.lines[1].label, r.lines[1].display], ['Car loan (May)', '300']);
    eq([r.lines[2].label, r.lines[2].kind, r.lines[2].display], ['Tax rate', 'assignment', '0.08']);
    eq([r.lines[3].label, r.lines[3].kind], ['Groceries', 'comment']);
});

test('comments: // ends the expression anywhere', () => {
    const r = sheet('// a note\n5 + 5 // ten\nRent: 100 // monthly');
    eq(r.lines[0].kind, 'comment');
    eq(r.lines[1].display, '10');
    eq(r.lines[2].display, '100');
});

test('headings: lines starting with # are headings', () => {
    const r = sheet('# Budget\n  ## Sub heading');
    eq(r.lines.map((l) => l.kind), ['heading', 'heading']);
    eq(r.lines[0].display, '');
});

test('blank lines are blank and counted', () => {
    const r = sheet('1\n\n   \n2 +\n3');
    eq(r.lines.map((l) => l.kind), ['value', 'blank', 'blank', 'error', 'value']);
    eq(r.counts, { lines: 5, values: 2, errors: 1 });
});

/* ------------------------------------------------------------------ */
/* Line references and totals                                          */
/* ------------------------------------------------------------------ */

test('ans: the previous value line', () => {
    eq(displays('10\n// note\n\nans * 2\nx = 7\nans + 1'), ['10', '', '', '20', '7', '8']);
    ok(/no earlier result/.test(err('ans + 1')));
});

test('line3: the value on line 3 (1-based)', () => {
    const r = sheet('100\n200\n300\nline3 / line1\nline9\nline8\n# h\nline7');
    eq(r.lines[3].display, '3');
    ok(/no line 9/.test(r.lines[4].error.message));
    ok(/isn't above this line/.test(r.lines[5].error.message));
    ok(/has no result/.test(r.lines[7].error.message));
});

test('total: sums the block above, ending at a blank line or heading', () => {
    const r = sheet('# Budget\nRent: 1200\nFood: 300\nFun: 150\nTotal: total\nAverage: average\n\n5\n6\nsum\navg');
    eq(r.lines[4].display, '1,650');
    eq(r.lines[5].display, '550', 'an earlier total is not counted again');
    eq(r.lines[9].display, '11');
    eq(r.lines[10].display, '5.5');
    ok(/no values above/.test(sheet('# h\ntotal').lines[1].error.message));
});

test('total: units convert to the first value, mismatches explain why', () => {
    eq(displays('2 km\n500 m\ntotal')[2], '2.5 km');
    const r = sheet('3 km\n2 kg\ntotal');
    ok(/Can't total 3 km and 2 kg — length and mass don't mix/.test(r.lines[2].error.message));
});

/* ------------------------------------------------------------------ */
/* Percentages                                                         */
/* ------------------------------------------------------------------ */

test('percent: 20% of 150 is 30, 150 + 10% is 165', () => {
    eq(show('15%'), '0.15');
    eq(show('20% of 150'), '30');
    eq(show('150 + 10%'), '165');
    eq(show('150 - 10%'), '135');
    eq(show('100 km + 10%'), '110 km');
    eq(show('15% + 5%'), '0.2');
});

test('percent: to % and as % show a percentage', () => {
    eq(show('0.25 to %'), '25%');
    eq(show('0.125 as %'), '12.5%');
    eq(run('0.25 to %').numeric, 25);
    ok(/percentage/.test(err('5 km to %')));
});

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

test('units: 5 km + 300 m is 5.3 km', () => {
    const r = run('5 km + 300 m');
    eq(r.display, '5.3 km');
    eq(r.plain, '5.3 km');
    eq(r.unit, 'km');
    eq(r.numeric, 5.3);
});

test('units: 60 mph to km/h is about 96.56', () => {
    near(num('60 mph to km/h'), 96.56064, 1e-9);
    near(num('60 miles per hour to km/h'), 96.56064, 1e-9);
    eq(run('60 mph to km/h').unit, 'km/h');
    eq(show('60 mph * 2 h'), '120 mi');
});

test('units: 98.6 °F to °C is 37 (affine temperatures)', () => {
    eq(num('98.6 °F to °C'), 37);
    eq(show('100 degC to degF'), '212 °F');
    eq(show('212 fahrenheit to celsius'), '100 °C');
    eq(show('0 K to °C'), '-273.15 °C');
    eq(show('20 °C + 5 °C'), '25 °C');
    eq(show('2 * 20 °C'), '40 °C');
    ok(/convert one/.test(err('20 °C + 5 K')));
    ok(/Temperatures/.test(err('20 °C * 2 m')));
});

test('units: 1 GiB to MB is about 1073.74 (data sizes)', () => {
    near(num('1 GiB to MB'), 1073.741824, 1e-9);
    eq(show('1 MiB to KiB'), '1,024 KiB');
    eq(show('8 bit to B'), '1 B');
    near(num('1 GB to GiB'), 0.931322574615, 1e-9);
});

test('units: 100 kg * 9.8 m/s^2 to N is 980', () => {
    eq(num('100 kg * 9.8 m/s^2 to N'), 980);
    eq(show('100 kg * 9.8 m/s^2'), '980 N', 'coherent SI products simplify to N');
});

test('units: 3 ft * 2 ft is 6 ft^2, sq and cu forms', () => {
    eq(show('3 ft * 2 ft'), '6 ft^2');
    eq(show('3 sq ft'), '3 ft^2');
    eq(show('6 sqft'), '6 ft^2');
    near(num('1 cu ft to L'), 28.316846592, 1e-9);
    eq(show('1 acre to ft^2'), '43,560 ft^2');
});

test('units: in is inches unless it converts a quantity', () => {
    near(num('100 km in miles'), 62.137119223733, 1e-9);
    eq(run('100 km in miles').unit, 'mi');
    eq(show('5 in to cm'), '12.7 cm');
    eq(show('5 in'), '5 in');
});

test('units: compound units and dimensionless results', () => {
    eq(show('10 m / 2 s'), '5 m/s');
    eq(show('100 km / 2 h'), '50 km/h');
    eq(show('1/2 cup'), '0.5 cup');
    eq(show('1 km / 1 m'), '1,000');
    eq(show('50 Hz * 2 s'), '100');
    eq(show('sqrt(16 m^2)'), '4 m');
    ok(/whole numbers/.test(err('sqrt(2 m)')));
});

test('units: prefixes, long names, plurals and aliases', () => {
    eq(show('2 kilometers to m'), '2,000 m');
    eq(show('3 metres + 1 meter'), '4 m');
    eq(show('1 kWh to kJ'), '3,600 kJ');
    eq(show('500 mL to L'), '0.5 L');
    eq(show('500 ml to l'), '0.5 L');
    eq(show('1 µs to ns'), '1,000 ns');
    eq(show('2 lbs + 1 pound'), '3 lb');
    eq(show('2 fl oz + 1 fluid ounce'), '3 fl oz');
    eq(show('1 nautical mile to m'), '1,852 m');
    eq(show('30 min + 1 hour'), '90 min');
    eq(show('1 atm to kPa'), '101.325 kPa');
});

test('units: incompatible units give the contract message', () => {
    eq(err('3 km + 2 kg'), "Can't add 3 km and 2 kg — length and mass don't mix");
    eq(err('3 km - 2 kg'), "Can't subtract 2 kg from 3 km — length and mass don't mix");
    ok(/length and mass don't match/.test(err('3 km to kg')));
    ok(/Unknown unit 'zz'/.test(err('3 km to zz')));
    ok(/no unit to convert/.test(err('5 to km')));
});

test('units: min, max and sums keep the first unit', () => {
    eq(show('min(3 km, 2000 m)'), '2 km');
    eq(show('max(1 h, 90 min)'), '1.5 h');
    eq(show('sum(1 m, 50 cm)'), '1.5 m');
});

/* ------------------------------------------------------------------ */
/* Conversion targets                                                  */
/* ------------------------------------------------------------------ */

test('targets: 255 to hex is 0xFF, plus bin, oct and dec', () => {
    eq(show('255 to hex'), '0xFF');
    eq(show('10 to bin'), '0b1010');
    eq(show('8 to oct'), '0o10');
    eq(show('-255 to hex'), '-0xFF');
    eq(show('0xFF to dec'), '255');
    eq(run('255 to hex').numeric, 255);
    ok(/whole numbers/.test(err('2.5 to hex')));
});

test('targets: 0.75 to fraction is 3/4; sci and eng notation', () => {
    eq(show('0.75 to fraction'), '3/4');
    eq(show('1.5 km to fraction'), '3/2 km');
    eq(show('pi to fraction'), '≈ 355/113');
    eq(show('1234 to sci'), '1.234e3');
    eq(show('12345 to eng'), '12.345e3');
    eq(show('1e20 to dec'), '100,000,000,000,000,000,000');
});

/* ------------------------------------------------------------------ */
/* Angles and functions                                                */
/* ------------------------------------------------------------------ */

test('angles: sin(30 deg) is 0.5 and sin(pi/2) is 1 in rad mode', () => {
    eq(show('sin(30 deg)', RAD), '0.5');
    eq(num('sin(30 deg)', RAD), 0.5);
    eq(show('sin(pi/2)', RAD), '1');
    eq(show('sin(30)', DEG), '0.5');
    eq(show('sin(30 deg)', DEG), '0.5', 'explicit units win in either mode');
    eq(show('sin(pi/2 rad)', DEG), '1');
    eq(show('asin(0.5)', DEG), '30');
    eq(show('cos(90 deg)'), '0');
    ok(/undefined/.test(err('tan(90 deg)')));
});

test('angles: deg() and rad() functions vs units', () => {
    eq(show('deg(pi)'), '180');
    near(num('rad(180)'), Math.PI, 1e-12);
    eq(show('pi rad to deg'), '180 deg');
    eq(show('pi to deg', RAD), '180 deg', 'plain numbers follow the angle setting');
    eq(show('90 to rad', DEG).slice(0, 9), '1.5707963');
});

test('functions: every contract function evaluates', () => {
    const cases = {
        'sqrt(2)': Math.SQRT2, 'cbrt(-27)': -3, 'root(32, 5)': 2, 'abs(-5)': 5, 'sign(-3)': -1, 'floor(2.7)': 2,
        'ceil(2.1)': 3, 'round(2.5)': 3, 'round(-2.5)': -3, 'round(1234, -2)': 1200, 'trunc(-2.7)': -2,
        'min(4, 2, 8)': 2, 'max(4, 2, 8)': 8, 'sum(1, 2, 3)': 6, 'avg(2, 4, 9)': 5, 'mean(2, 4, 9)': 5,
        'median(3, 1, 4, 1, 5)': 3, 'median(1, 2, 3, 4)': 2.5, 'mode(1, 2, 2, 3)': 2,
        'stdev(2, 4, 4, 4, 5, 5, 7, 9)': 2.138089935299395, 'var(2, 4, 4, 4, 5, 5, 7, 9)': 32 / 7,
        'gcd(12, 18)': 6, 'lcm(4, 6)': 12, 'fact(5)': 120, 'factorial(10)': 3628800, 'nCr(5, 2)': 10, 'nPr(5, 2)': 20,
        'ln(e)': 1, 'log(1000)': 3, 'log(8, 2)': 3, 'log2(1024)': 10, 'log10(0.001)': -3, 'exp(0)': 1,
        'sin(0)': 0, 'cos(0)': 1, 'tan(pi/4)': 1, 'asin(1)': Math.PI / 2, 'acos(1)': 0, 'atan(1)': Math.PI / 4,
        'atan2(1, 1)': Math.PI / 4, 'sinh(0)': 0, 'cosh(0)': 1, 'tanh(0)': 0, 'sec(0)': 1, 'csc(pi/2)': 1,
        'cot(pi/4)': 1, 'hypot(3, 4)': 5, 'clamp(15, 0, 10)': 10, 'lerp(10, 20, 0.25)': 12.5, 'mod(10, 3)': 1,
        'rem(10, 3)': 1, 'deg(pi)': 180, 'rad(180)': Math.PI, 'if(1 < 2, 7, 8)': 7
    };
    for (const [expr, want] of Object.entries(cases)) near(num(expr), want, 1e-9, expr);
    eq(show('isprime(97)'), 'true');
    eq(show('isprime(91)'), 'false');
    eq(show('isprime(2^127 - 1)'), 'true');
});

test('functions: friendly argument errors', () => {
    ok(/sqrt needs a number 0 or more/.test(err('sqrt(-1)')));
    ok(/ln needs a number above 0/.test(err('ln(0)')));
    ok(/asin needs a number from -1 to 1/.test(err('asin(2)')));
    ok(/takes 2 values, but got 1/.test(err('nCr(5)')));
    ok(/Use brackets after sqrt/.test(err('sqrt 4')));
    ok(/Unknown function 'foo'/.test(err('foo(2)')));
    ok(/whole numbers/.test(err('gcd(1.5, 2)')));
});

test('constants: pi, π, tau, e, phi', () => {
    near(num('pi'), Math.PI, 0);
    near(num('π'), Math.PI, 0);
    near(num('tau'), 2 * Math.PI, 0);
    near(num('e'), Math.E, 0);
    near(num('phi'), 1.618033988749895, 1e-15);
});

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

test('format: precision, trimming and auto scientific notation', () => {
    eq(show('1/3', { precision: 4 }), '0.3333');
    eq(show('1.50'), '1.5');
    eq(show('10^15'), '1e15');
    eq(show('123456789012345'), '123,456,789,012,345');
    eq(show('0.000001'), '0.000001');
    eq(show('0.0000001'), '1e-7');
    eq(show('2^0.5', { precision: 16 }), '1.414213562373095');
});

test('format: thousands separators and notations', () => {
    eq(show('1234567', { thousands: 'space' }), '1 234 567');
    eq(show('1234567', { thousands: 'none' }), '1234567');
    eq(show('1234.5', { notation: 'fixed' }), '1,234.5');
    eq(show('1234.5', { notation: 'scientific' }), '1.2345e3');
    eq(show('0.00012', { notation: 'engineering' }), '120e-6');
    eq(run('1/4', { fractions: 'off' }).exact, '');
});

test('format: formatNumber for other panes', () => {
    eq(E.formatNumber(1234567.891, { precision: 6 }), '1,234,570');
    eq(E.formatNumber(0.1 + 0.2), '0.3');
    eq(E.formatNumber(-0.000001234), '-0.000001234');
    eq(E.formatNumber(1e21), '1e21');
    eq(E.formatNumber(2n ** 64n), '1.844674407e19');
});

/* ------------------------------------------------------------------ */
/* Errors and limits                                                   */
/* ------------------------------------------------------------------ */

test('errors: positioned and plain', () => {
    eq(err('1/0'), 'Division by zero');
    const r = run('(2 + 3');
    eq(r.error.message, "Missing ')'");
    eq(r.error.start, 0);
    eq(err('2 + '), "Something is missing after '+'");
    ok(/use ==/.test(err('2 + 2 = 4')));
    ok(/Currency/.test(err('$5')));
    ok(/Empty brackets/.test(err('()')));
});

test('limits: 9^9^9 fails clearly in under 200 ms', () => {
    const t0 = Date.now();
    eq(err('9^9^9'), 'That number is too large to show');
    ok(Date.now() - t0 < 200, `took ${Date.now() - t0} ms`);
    eq(err('2^30000'), 'That number is too large to show');
    eq(err('1/9^9^9'), 'That number is too large to show');
    eq(err('0.5^100000'), 'That number is too close to zero to show');
});

test('limits: factorial(1000) is exact with 2568 digits', () => {
    const r = run('factorial(1000)');
    eq(r.plain.length, 2568);
    ok(r.plain.startsWith('402387260077'));
    ok(r.plain.endsWith('0'.repeat(249)));
    eq(run('factorial(1000) to dec').plain.length, 2568);
    eq(err('factorial(1001)'), 'That number is too large to show');
});

test('limits: a 2000-line sheet evaluates in under 1 second', () => {
    const lines = [];
    for (let i = 0; i < 2000; i++) {
        if (i % 40 === 39) lines.push('total');
        else if (i % 40 === 0) lines.push('');
        else if (i % 3 === 0) lines.push(`Item ${i}: ${i} km + 300 m // note`);
        else lines.push(`v${i} = ${i} km * 2 to mi`);
    }
    const t0 = Date.now();
    const r = sheet(lines.join('\n'));
    const ms = Date.now() - t0;
    ok(ms < 1000, `took ${ms} ms`);
    eq(r.lines.length, 2000);
    eq(r.counts.errors, 0);
});

test('limits: line length, line count and nesting caps', () => {
    ok(/too long/.test(run('1+'.repeat(1100) + '1').error.message));
    const big = sheet(Array(2005).fill('1').join('\n'));
    eq(big.lines.length, 2001);
    ok(/first 2,000 lines/.test(big.lines[2000].error.message));
    ok(/nested too deeply/.test(err('('.repeat(150) + '1' + ')'.repeat(150))));
    ok(/nested too deeply/.test(err('-'.repeat(500) + '1')));
});

test('evaluate: LineResult shape', () => {
    const r = run('Total: 2 km');
    eq(Object.keys(r).sort(), ['display', 'error', 'exact', 'index', 'kind', 'label', 'numeric', 'plain', 'source', 'unit']);
    eq(r.index, 0);
    eq(r.source, 'Total: 2 km');
    eq(r.label, 'Total');
    eq(r.error, null);
});

/* ------------------------------------------------------------------ */
/* compile(), reference and the units API                              */
/* ------------------------------------------------------------------ */

test('compile: x^2 - 2 at 2 is 2', () => {
    const c = E.compile('x^2 - 2');
    eq(c.error, null);
    eq(c.fn(2), 2);
    eq(c.fn(0), -2);
    ok(Number.isNaN(E.compile('sqrt(x)').fn(-1)), 'NaN outside the domain');
    eq(E.compile('x^(1/3)').fn(-8), -2, 'odd roots of negatives');
    near(E.compile('sin(x)', { angle: 'deg' }).fn(30), 0.5, 1e-12);
    eq(E.compile('t^2', { variable: 't' }).fn(3), 9);
});

test('compile: sheet functions, equations and clear errors', () => {
    eq(E.compile('f(x) + a', { sheet: 'a = 10\nf(t) = t^2' }).fn(3), 19);
    eq(E.compile('y = 2x + 1').fn(3), 7);
    eq(E.compile('x^2 = 2').fn(2), 2, 'an equation compiles as left minus right');
    ok(/Units can't be used/.test(E.compile('x km').error));
    ok(/Unknown name 'foo'/.test(E.compile('foo + x').error));
    ok(/Line references/.test(E.compile('ans + x').error));
    ok(/Type an expression/.test(E.compile('  ').error));
    const fib = E.compile('fib(x)', { sheet: 'fib(n) = if(n < 2, n, fib(n - 1) + fib(n - 2))' });
    eq(fib.fn(10), 55);
    ok(Number.isNaN(fib.fn(40)), 'the budget turns runaway work into NaN');
    eq(typeof E.compile(null).fn, 'function');
});

test('reference: every contract function, constant and keyword is listed', () => {
    const want = ['sqrt', 'cbrt', 'root', 'abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'min', 'max', 'sum', 'avg',
        'mean', 'median', 'mode', 'stdev', 'var', 'gcd', 'lcm', 'fact', 'factorial', 'nCr', 'nPr', 'ln', 'log', 'log2',
        'log10', 'exp', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'sec', 'csc', 'cot',
        'hypot', 'clamp', 'lerp', 'mod', 'rem', 'isprime', 'deg', 'rad', 'if'];
    const byName = new Map(E.reference.functions.map((f) => [f.name, f]));
    for (const name of want) {
        const f = byName.get(name);
        ok(f, `reference lists ${name}`);
        ok(f.signature && f.description && f.category && f.example, `${name} has every field`);
        ok(!run(f.example).error, `${name} example works: ${f.example}`);
    }
    const consts = E.reference.constants.map((c) => c.name);
    for (const c of ['pi', 'π', 'tau', 'e', 'phi']) ok(consts.includes(c), `constant ${c}`);
    const words = E.reference.keywords.map((k) => k.word);
    for (const w of ['to', 'as', 'in', 'of', 'ans', 'total', 'hex', 'fraction']) ok(words.includes(w), `keyword ${w}`);
});

test('reference: units cover every category and their symbols parse', () => {
    const cats = E.units.categories().map((c) => c.id);
    eq(cats.length, 16);
    for (const id of cats) ok(E.reference.units.some((u) => u.category === id), `units in ${id}`);
    for (const u of E.reference.units) {
        ok(!run(`1 ${u.symbol}`).error, `1 ${u.symbol} parses`);
        ok(Array.isArray(u.aliases), `${u.symbol} aliases`);
    }
});

test('units API: categories, list and convert', () => {
    const length = E.units.list('length');
    ok(length.some((u) => u.symbol === 'km' && u.name === 'kilometer'));
    eq(E.units.list('nope'), []);
    near(E.units.convert(1, 'GiB', 'MB'), 1073.741824, 1e-9);
    eq(E.units.convert(98.6, '°F', '°C'), 37);
    near(E.units.convert(1, 'sq ft', 'm^2'), 0.09290304, 1e-12);
    near(E.units.convert(60, 'mph', 'km/h'), 96.56064, 1e-9);
    assert.throws(() => E.units.convert(1, 'km', 'kg'), /length and mass don't match/);
    assert.throws(() => E.units.convert(1, 'zz', 'm'), /Unknown unit/);
    assert.throws(() => E.units.convert('abc', 'm', 'km'), /Enter a number/);
    assertions += 3;
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
