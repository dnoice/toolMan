/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ColorEngineTests (colorMan Edition - v1.0)
 *     - File Name: color.test.js
 *     - Relative Path: tools/colorman/tests/color.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for the colorMan color engine (js/color.js). They check
 *     every function family against published reference values (CSS Color 4
 *     conversions, WCAG and APCA contrast, the Sharma CIEDE2000 data set) so
 *     a change to the maths cannot slip through unnoticed. Run them after
 *     any edit to color.js.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus a twelve-line runner
 *     - Reference values: #C9A84C channels, OKLCH and Lab of pure red,
 *       white in OKLCH, contrast 21 and 4.48, APCA ±106/108
 *     - Sharma et al. CIEDE2000 pairs checked to four decimals
 *     - Every named color and every output format round-trips
 *     - Parser coverage: legacy and modern syntax, units, none, percent
 *       forms, wide-gamut input with the clipped flag, and garbage input
 *     - Mixing, adjustment, harmonies, scales and color vision checks
 *     - ensureContrast() verified after 8-bit rounding
 *     - Deterministic palette extraction on a synthetic pixel buffer
 *     - Prints a pass/fail line per test and an assertion total; exits 1 on
 *       any failure so it can gate a commit
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/colorman/tests/color.test.js
 *     A clean run ends with "All N tests passed (M assertions)".
 *
 * ✒ Examples:
 *     node tools/colorman/tests/color.test.js            → full run
 *     node tools/colorman/tests/color.test.js contrast   → only tests whose
 *                                                           name contains "contrast"
 *     near(Color.contrast('#777777', '#FFFFFF'), 4.48, 0.005)
 *     eq(Color.toHex('rebeccapurple'), '#663399')
 *     ok(Color.parse('not a color') === null)
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+ and ../js/color.js
 *     - Compatible platforms: any OS with Node
 *     - Limitations: browser-only behaviour (canvas pixel reads for the
 *       eyedropper and image import) is not covered here
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const Color = require(path.join(__dirname, '..', 'js', 'color.js'));

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
    assert.ok(Math.abs(actual - expected) <= tol,
        `${msg || 'value'}: expected ${expected} ± ${tol}, got ${actual}`);
}
function throws(fn, type, msg) { assertions++; assert.throws(fn, type, msg); }

const hex = (c) => Color.toHex(c);
const rgb255 = (c) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
const SAMPLES = ['#C9A84C', '#1B2A4A', '#2A3D5F', '#E8C878', '#F5F0E8', '#0E1014', '#FF0000', '#00FF00',
    '#0000FF', '#FFFFFF', '#000000', '#808080', '#663399', '#3B82F6', '#10B981', '#F59E0B'];

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

test('parse: #C9A84C gives 201 / 168 / 76', () => {
    const c = Color.parse('#C9A84C');
    eq(rgb255(c), [201, 168, 76]);
    eq(c.a, 1);
    eq(rgb255(Color.parse('c9a84c')), [201, 168, 76], 'without #');
    eq(rgb255(Color.parse('0xC9A84C')), [201, 168, 76], '0x prefix');
});

test('parse: hex lengths and alpha', () => {
    eq(hex(Color.parse('#abc')), '#AABBCC');
    near(Color.parse('#abcd').a, 0xdd / 255, 1e-9, '#rgba alpha');
    near(Color.parse('#C9A84C80').a, 128 / 255, 1e-9, '#rrggbbaa alpha');
    eq(Color.parseDetailed('#C9A84C').format, 'hex');
    eq(Color.parseDetailed('#C9A84C80').format, 'hex8');
    eq(Color.parse('#12345'), null, 'five digits is not a hex color');
});

test('parse: rgb() legacy, modern, percent, none', () => {
    eq(rgb255(Color.parse('rgb(201, 168, 76)')), [201, 168, 76]);
    eq(rgb255(Color.parse('rgb(201 168 76)')), [201, 168, 76]);
    eq(rgb255(Color.parse('rgb(100% 0% 50%)')), [255, 0, 128]);
    eq(rgb255(Color.parse('rgb(none 255 0)')), [0, 255, 0]);
    const half = Color.parse('rgba(0 0 0 / 50%)');
    eq(half.a, 0.5, 'rgba(0 0 0 / 50%) alpha');
    eq(Color.parse('rgba(0, 0, 0, 0.25)').a, 0.25, 'legacy comma alpha');
    eq(Color.parse('rgb(1 2 3 / .4)').a, 0.4);
});

test('parse: case and whitespace tolerant, pasted declarations', () => {
    eq(hex(Color.parse('  RGB( 201 , 168 , 76 )  ')), '#C9A84C');
    eq(hex(Color.parse('--brand: #C9A84C;')), '#C9A84C');
    eq(hex(Color.parse('background-color: rgb(1 2 3) !important')), '#010203');
    eq(hex(Color.parse('"#abc"')), '#AABBCC');
    eq(hex(Color.parse('Light Goldenrod Yellow')), '#FAFAD2');
});

test('parse: bare 0-255 triples', () => {
    eq(hex(Color.parse('201, 168, 76')), '#C9A84C');
    eq(hex(Color.parse('201 168 76')), '#C9A84C');
    eq(Color.parseDetailed('201 168 76').format, 'rgb');
});

test('parse: hsl() / hwb() / hsv() and hue units', () => {
    eq(hex(Color.parse('hsl(120 100% 50%)')), '#00FF00', 'hsl(120 100% 50%) is lime');
    eq(hex(Color.parse('hsl(120 100% 50%)')), Color.NAMED.lime);
    eq(hex(Color.parse('hsla(120, 100%, 50%, 1)')), '#00FF00');
    eq(hex(Color.parse('hsl(120 100 50)')), '#00FF00', 'CSS 4 bare numbers');
    const ref = hex(Color.parse('hsl(180deg 50% 50%)'));
    eq(hex(Color.parse(`hsl(${Math.PI}rad 50% 50%)`)), ref, 'rad');
    eq(hex(Color.parse('hsl(200grad 50% 50%)')), ref, 'grad');
    eq(hex(Color.parse('hsl(0.5turn 50% 50%)')), ref, 'turn');
    eq(hex(Color.parse('hwb(0 0% 0%)')), '#FF0000');
    eq(hex(Color.parse('hwb(0 60% 60%)')), '#808080', 'w + b > 100% normalises to grey');
    eq(hex(Color.parse('hsv(0 100% 100%)')), '#FF0000');
});

test('parse: lab / lch / oklab / oklch', () => {
    eq(hex(Color.parse('lab(54.29 80.8 69.89)')), '#FF0000');
    eq(hex(Color.parse('lch(54.29 106.84 40.85)')), '#FF0000');
    eq(hex(Color.parse('oklab(0.62796 0.22486 0.12585)')), '#FF0000');
    eq(hex(Color.parse('oklch(0.62796 0.25768 29.234)')), '#FF0000');
    eq(hex(Color.parse('oklch(62.796% 64.42% 29.234)')), '#FF0000', 'percent forms');
    eq(hex(Color.parse('lab(100 0 0)')), '#FFFFFF');
    eq(Color.parse('oklch(0.5 0.1 120 / 0.3)').a, 0.3);
});

test('parse: color() spaces and wide-gamut flag', () => {
    eq(hex(Color.parse('color(srgb 1 0 0)')), '#FF0000');
    eq(hex(Color.parse('color(srgb 100% 50% 0%)')), '#FF8000');
    eq(hex(Color.parse('color(srgb-linear 1 1 1)')), '#FFFFFF');
    eq(hex(Color.parse('color(display-p3 0.6 0.6 0.6)')), hex(Color.parse('color(srgb 0.6 0.6 0.6)')),
        'P3 and sRGB greys match');
    eq(hex(Color.parse('color(xyz-d65 0.9504559 1 1.0890578)')), '#FFFFFF');
    const p3 = Color.parseDetailed('color(display-p3 1 0 0)');
    ok(p3.clipped, 'P3 red is outside sRGB');
    eq(p3.format, 'color');
    ok(['r', 'g', 'b'].every((k) => p3.color[k] >= 0 && p3.color[k] <= 1), 'mapped into range');
    eq(Color.parseDetailed('color(srgb 0.5 0.5 0.5)').clipped, false);
    eq(Color.parse('color(rec2020 1 0 0)'), null, 'unsupported space');
});

test('parse: out-of-gamut OKLCH is gamut mapped and flagged', () => {
    const d = Color.parseDetailed('oklch(0.7 0.4 150)');
    ok(d.clipped);
    const back = Color.toOklch(d.color);
    near(back.l, 0.7, 0.02, 'lightness held');
    near(back.h, 150, 3, 'hue held');
    ok(back.c < 0.4, 'chroma reduced');
    ok(Color.parseDetailed('rgb(300 0 0)').clipped, 'rgb over 255 is flagged');
    eq(Color.parseDetailed('#C9A84C').clipped, false);
});

test('parse: cmyk() and device-cmyk()', () => {
    eq(hex(Color.parse('cmyk(0% 100% 100% 0%)')), '#FF0000');
    eq(hex(Color.parse('device-cmyk(0 1 1 0)')), '#FF0000');
    eq(hex(Color.parse('cmyk(0 0 0 100)')), '#000000');
});

test('parse: named colors and transparent', () => {
    eq(Object.keys(Color.NAMED).length, 148);
    eq(hex(Color.parse('rebeccapurple')), '#663399');
    eq(hex(Color.parse('RebeccaPurple')), '#663399');
    eq(Color.parse('transparent'), { r: 0, g: 0, b: 0, a: 0 });
    eq(Color.parseDetailed('navy').format, 'name');
    Object.keys(Color.NAMED).forEach((name) => {
        eq(hex(Color.parse(name)), Color.NAMED[name], `${name} round-trips`);
    });
});

test('parse: garbage returns null', () => {
    ['', '   ', 'hello', 'not a color', '#12', '#ggg', 'rgb(1,2)', 'rgb(a b c)', 'hsl(10%, 50%, 50%)',
        'rgb(1 2 3 / 4 / 5)', 'rgb(1 2 3 4 5)', '12', 'rgb(', 'oklch(0.5 0.1)', 'lab(1 2 3deg)']
        .forEach((s) => eq(Color.parse(s), null, JSON.stringify(s)));
    eq(Color.parse(null), null);
    eq(Color.parse(42), null);
    eq(Color.parse(undefined), null);
    eq(Color.isValid('#fff'), true);
    eq(Color.isValid('nope'), false);
});

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

test('format: house examples and alpha', () => {
    const gold = Color.parse('#C9A84C');
    eq(Color.format(gold, 'hex'), '#C9A84C');
    eq(Color.format(gold, 'hex', { upper: false }), '#c9a84c');
    eq(Color.format(gold, 'hex8'), '#C9A84CFF');
    eq(Color.format(gold, 'rgb'), 'rgb(201 168 76)');
    eq(Color.format(Color.setAlpha(gold, 0.5), 'rgb'), 'rgb(201 168 76 / 50%)');
    eq(Color.format(Color.setAlpha(gold, 0.5), 'hex'), '#C9A84C80');
    eq(Color.format(gold, 'hsl', { precision: 0 }), 'hsl(44 54% 54%)');
    eq(Color.format(gold, 'hsv', { precision: 0 }), 'hsv(44 62% 79%)');
    eq(Color.format(gold, 'cmyk', { precision: 0 }), 'cmyk(0% 16% 62% 21%)');
    ok(/^oklch\(0\.\d{4} 0\.\d{1,4} \d+(\.\d{1,2})?\)$/.test(Color.format(gold, 'oklch')), Color.format(gold, 'oklch'));
    eq(Color.format('#FFFFFF', 'oklch'), 'oklch(1 0 0)', 'achromatic hue prints 0');
    eq(Color.format('#808080', 'hsl'), 'hsl(0 0% 50.2%)');
});

test('format: names', () => {
    eq(Color.format('#663399', 'name'), 'rebeccapurple');
    eq(Color.format('#C9A84C', 'name'), '');
    eq(Color.format('transparent', 'name'), 'transparent');
    eq(Color.format('#00FFFF', 'name'), 'aqua', 'first alphabetical alias');
    eq(Color.format('rgb(255 0 0 / 50%)', 'name'), '', 'translucent colors have no name');
});

test('format: every format round-trips through parse', () => {
    const fmts = ['hex', 'hex8', 'rgb', 'hsl', 'hwb', 'hsv', 'cmyk', 'lab', 'lch', 'oklab', 'oklch', 'p3', 'srgb'];
    SAMPLES.forEach((h) => {
        fmts.forEach((f) => {
            const text = Color.format(h, f, { precision: 2 });
            const back = Color.parse(text);
            ok(back, `${f} output parses: ${text}`);
            eq(hex(back), h, `${h} via ${f} (${text})`);
        });
    });
});

test('format: oklch() round trips with alpha', () => {
    const c = Color.parse('oklch(0.7 0.12 250 / 40%)');
    const text = Color.format(c, 'oklch');
    ok(/\/ 40%\)$/.test(text), text);
    ok(Color.equals(Color.parse(text), c, 2e-3), 'oklch alpha round trip');
});

test('format: bad input yields empty string, unknown format falls back to hex', () => {
    eq(Color.format('nope', 'hex'), '');
    eq(Color.format(null, 'rgb'), '');
    eq(Color.format('#C9A84C', 'mystery'), '#C9A84C');
});

test('toHex: alpha modes', () => {
    const c = Color.parse('rgb(201 168 76 / 50%)');
    eq(Color.toHex(c), '#C9A84C80');
    eq(Color.toHex(c, { alpha: 'never' }), '#C9A84C');
    eq(Color.toHex('#C9A84C', { alpha: 'always' }), '#C9A84CFF');
    eq(Color.toHex('#C9A84C', { upper: false }), '#c9a84c');
});

/* ------------------------------------------------------------------ */
/* Model conversions                                                   */
/* ------------------------------------------------------------------ */

test('conversions: OKLCH reference values', () => {
    const w = Color.toOklch('#FFFFFF');
    near(w.l, 1, 1e-6, 'white L');
    near(w.c, 0, 1e-6, 'white C');
    eq(w.h, 0, 'achromatic hue is 0');
    const r = Color.toOklch('#FF0000');
    near(r.l, 0.62796, 5e-5, 'red L');
    near(r.c, 0.25768, 5e-5, 'red C');
    near(r.h, 29.234, 5e-3, 'red h');
    const k = Color.toOklch('#000000');
    near(k.l, 0, 1e-9, 'black L');
});

test('conversions: Lab (D50) reference values', () => {
    const r = Color.toLab('#FF0000');
    near(r.l, 54.29, 0.01, 'red L');
    near(r.a, 80.80, 0.01, 'red a');
    near(r.b, 69.89, 0.01, 'red b');
    const w = Color.toLab('#FFFFFF');
    near(w.l, 100, 1e-6, 'white L');
    near(w.a, 0, 1e-9, 'white a');
    const lch = Color.toLch('#FF0000');
    near(lch.c, 106.84, 0.02, 'red LCH chroma');
    near(lch.h, 40.85, 0.02, 'red LCH hue');
});

test('conversions: HSL / HSV / HWB / CMYK values and round trips', () => {
    const hsl = Color.toHsl('#C9A84C');
    near(hsl.h, 44.16, 0.01);
    near(hsl.s, 53.65, 0.01);
    near(hsl.l, 54.31, 0.01);
    const hsv = Color.toHsv('#C9A84C');
    near(hsv.s, 62.19, 0.01);
    near(hsv.v, 78.82, 0.01);
    const hwb = Color.toHwb('#C9A84C');
    near(hwb.w, 29.80, 0.01);
    near(hwb.b, 21.18, 0.01);
    const cmyk = Color.toCmyk('#C9A84C');
    near(cmyk.c, 0, 1e-9);
    near(cmyk.k, 21.18, 0.01);
    eq(Color.toCmyk('#000000'), { c: 0, m: 0, y: 0, k: 100, a: 1, alpha: 1 });
    SAMPLES.forEach((h) => {
        const c = Color.parse(h);
        ok(Color.equals(Color.fromHsl(Color.toHsl(c)), c, 1e-9), `hsl ${h}`);
        ok(Color.equals(Color.fromHsv(Color.toHsv(c)), c, 1e-9), `hsv ${h}`);
        ok(Color.equals(Color.fromHwb(Color.toHwb(c)), c, 1e-9), `hwb ${h}`);
        ok(Color.equals(Color.fromCmyk(Color.toCmyk(c)), c, 1e-9), `cmyk ${h}`);
    });
    eq(hex(Color.fromHsl(120, 100, 50)), '#00FF00');
    eq(Color.toHsl('#808080').h, 0, 'grey hue is 0');
});

test('conversions: Lab / LCH / OKLab / OKLCH round trips', () => {
    SAMPLES.forEach((h) => {
        const c = Color.parse(h);
        const lab = Color.toLab(c);
        ok(Color.equals(Color.fromLab(lab.l, lab.a, lab.b), c, 1e-6), `lab ${h}`);
        ok(Color.equals(Color.fromLch(Color.toLch(c)), c, 1e-6), `lch ${h}`);
        const ok2 = Color.toOklab(c);
        ok(Color.equals(Color.fromOklab(ok2.l, ok2.a, ok2.b), c, 1e-6), `oklab ${h}`);
        ok(Color.equals(Color.fromOklch(Color.toOklch(c)), c, 1e-6), `oklch ${h}`);
    });
});

test('conversions: gamut helpers', () => {
    const m = Color.fromOklch(0.7, 0.4, 150);
    ok(['r', 'g', 'b'].every((k) => m[k] >= 0 && m[k] <= 1));
    eq(Color.inGamutOklch(0.7, 0.05, 150), true);
    eq(Color.inGamutOklch(0.7, 0.4, 150), false);
    const max = Color.maxChroma(0.7, 150);
    ok(max > 0.05 && max < 0.4, `maxChroma ${max}`);
    ok(Color.inGamutOklch(0.7, max, 150), 'max chroma is in gamut');
    eq(Color.toRgb255('#C9A84C'), { r: 201, g: 168, b: 76, a: 1 });
    eq(hex(Color.fromRgb(201, 168, 76)), '#C9A84C');
});

/* ------------------------------------------------------------------ */
/* Contrast                                                            */
/* ------------------------------------------------------------------ */

test('contrast: WCAG 2.x ratios and levels', () => {
    eq(Color.contrast('#000', '#FFF'), 21);
    eq(Color.contrast('#FFF', '#000'), 21, 'order does not matter');
    near(Color.contrast('#777777', '#FFFFFF'), 4.48, 0.005);
    eq(Color.contrast('#C9A84C', '#C9A84C'), 1);
    near(Color.luminance('#FFFFFF'), 1, 1e-12);
    eq(Color.luminance('#000000'), 0);
    const lv = Color.wcag(4.48);
    eq(lv, { aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false, ui: true });
    eq(Color.wcag(7).aaaNormal, true);
    eq(Color.wcag(4.5).aaNormal, true);
    eq(Color.wcag(2.9).ui, false);
});

test('contrast: compositing translucent colors', () => {
    const c = Color.composite('rgba(0, 0, 0, 0.5)', '#FFFFFF');
    near(c.r, 0.5, 1e-9);
    eq(c.a, 1);
    const viaComposite = Color.contrast(Color.composite('rgb(0 0 0 / 50%)', '#FFF'), '#FFF');
    near(Color.contrast('rgb(0 0 0 / 50%)', '#FFF'), viaComposite, 1e-12, 'fg composited over bg');
    near(Color.contrast('#000', 'rgb(255 255 255 / 0)'), 21, 1e-9, 'transparent bg sits on white');
});

test('contrast: APCA 0.0.98G-4g', () => {
    near(Color.apca('#000000', '#FFFFFF'), 106.04, 0.5, 'black on white');
    near(Color.apca('#FFFFFF', '#000000'), -107.88, 0.5, 'white on black');
    eq(Color.apca('#777777', '#777777'), 0);
    ok(Color.apca('#777777', '#FFFFFF') > 60, 'grey on white is readable');
});

test('contrast: textOn / isDark', () => {
    eq(Color.textOn('#FFFF00'), '#000000');
    eq(Color.textOn('#1B2A4A'), '#FFFFFF');
    eq(Color.isDark('#0E1014'), true);
    eq(Color.isDark('#F5F0E8'), false);
});

test('contrast: ensureContrast reaches the target after 8-bit rounding', () => {
    const r = Color.ensureContrast('#C9A84C', '#FFFFFF', 4.5);
    eq(r.changed, true);
    ok(r.ratio >= 4.5, `ratio ${r.ratio}`);
    ok(Color.contrast(Color.toHex(r.color), '#FFFFFF') >= 4.5, 'hex result still passes');
    near(Color.toOklch(r.color).h, Color.toOklch('#C9A84C').h, 6, 'hue kept');
    const dark = Color.ensureContrast('#C9A84C', '#1B2A4A', 7);
    ok(dark.ratio >= 7 && Color.toOklch(dark.color).l > Color.toOklch('#C9A84C').l, 'lightens on navy');
    const same = Color.ensureContrast('#000000', '#FFFFFF', 4.5);
    eq(same.changed, false);
    eq(hex(same.color), '#000000');
    const stuck = Color.ensureContrast('#808080', '#808080', 7);
    eq(stuck.changed, true);
    eq(hex(stuck.color), '#000000', 'unreachable: best of black and white');
});

/* ------------------------------------------------------------------ */
/* Color difference and names                                         */
/* ------------------------------------------------------------------ */

test('deltaE2000: Sharma et al. reference pairs', () => {
    const pairs = [
        [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
        [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
        [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
        [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
        [[50, 0, 0], [50, -1, 2], 2.3669],
        [[50, 2.4900, -0.0010], [50, -2.4900, 0.0009], 7.1792],
        [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195],
        [[50, 2.5, 0], [73, 25, -18], 27.1492],
        [[50, 2.5, 0], [61, -5, 29], 22.8977],
        [[50, 2.5, 0], [56, -27, -3], 31.9030],
        [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
        [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
        [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082]
    ];
    pairs.forEach(([a, b, expected]) => {
        near(Color.deltaE2000Lab(a, b), expected, 1e-4, `${a} vs ${b}`);
        near(Color.deltaE2000Lab(b, a), expected, 1e-4, 'symmetric');
    });
    near(Color.deltaE2000Lab({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }), 2.0425, 1e-4, 'object form');
});

test('deltaE: color-level helpers and nearest name', () => {
    eq(Color.deltaE2000('#C9A84C', '#C9A84C'), 0);
    eq(Color.deltaEOK('#C9A84C', '#C9A84C'), 0);
    near(Color.deltaEOK('#000000', '#FFFFFF'), 100, 1e-6);
    ok(Color.deltaE2000('#FF0000', '#FE0000') < 1, 'one step is barely visible');
    const n = Color.nearestName('#FF0000');
    eq(n.name, 'red');
    eq(n.hex, '#FF0000');
    near(n.deltaE, 0, 1e-9);
    const g = Color.nearestName('#C9A84C');
    ok(typeof g.name === 'string' && Color.NAMED[g.name] === g.hex && g.deltaE > 0);
});

/* ------------------------------------------------------------------ */
/* Mixing                                                              */
/* ------------------------------------------------------------------ */

test('mix: sRGB midpoint and endpoints', () => {
    const mid = rgb255(Color.mix('#000000', '#FFFFFF', 0.5, 'srgb'));
    mid.forEach((v) => near(v, 128, 1, 'mix black/white srgb ≈ #808080'));
    eq(hex(Color.mix('#1B2A4A', '#C9A84C', 0)), '#1B2A4A');
    eq(hex(Color.mix('#1B2A4A', '#C9A84C', 1)), '#C9A84C');
    eq(hex(Color.mix('red', 'blue', 0.5, 'srgb')), '#800080');
});

test('mix: every space works and stays in range', () => {
    Color.MIX_SPACES.forEach((space) => {
        const m = Color.mix('#FF0000', '#0000FF', 0.5, space);
        ok(['r', 'g', 'b'].every((k) => m[k] >= 0 && m[k] <= 1), space);
    });
    throws(() => Color.mix('#000', '#fff', 0.5, 'cmyk'), RangeError);
});

test('mix: polar hue takes the shorter arc and greys borrow hue', () => {
    const a = Color.fromOklch(0.7, 0.1, 350);
    const b = Color.fromOklch(0.7, 0.1, 10);
    const h = Color.toOklch(Color.mix(a, b, 0.5, 'oklch')).h;
    ok(h < 2 || h > 358, `hue ${h} sits near 0, not 180`);
    const pink = Color.mix('#FFFFFF', '#FF0000', 0.5, 'oklch');
    near(Color.toOklch(pink).h, Color.toOklch('#FF0000').h, 1.5, 'white borrows red hue');
});

test('mix: premultiplied alpha', () => {
    const m = Color.mix('rgb(255 0 0 / 0)', '#0000FF', 0.5, 'srgb');
    eq(hex(m), '#0000FF80', 'transparent red adds no red');
    near(Color.mix('rgb(0 0 0 / 0.2)', 'rgb(0 0 0 / 0.6)', 0.5).a, 0.4, 1e-9);
});

test('steps: count and endpoints', () => {
    const s = Color.steps('#1B2A4A', '#C9A84C', 5, 'oklch');
    eq(s.length, 5);
    eq(hex(s[0]), '#1B2A4A');
    eq(hex(s[4]), '#C9A84C');
    eq(Color.steps('#000', '#fff', 1).length, 1);
    eq(Color.steps('#000', '#fff', 0).length, 0);
});

/* ------------------------------------------------------------------ */
/* Adjustments                                                         */
/* ------------------------------------------------------------------ */

test('adjust: lighten / darken / saturate / desaturate / rotate', () => {
    const base = Color.toOklch('#3B82F6');
    near(Color.toOklch(Color.lighten('#3B82F6', 0.1)).l, base.l + 0.1, 0.01);
    near(Color.toOklch(Color.darken('#3B82F6', 0.1)).l, base.l - 0.1, 0.01);
    ok(Color.toOklch(Color.saturate('#C9A84C', 0.1)).c > Color.toOklch('#C9A84C').c);
    ok(Color.toOklch(Color.desaturate('#C9A84C', 0.1)).c < Color.toOklch('#C9A84C').c);
    ok(Color.isAchromatic(Color.desaturate('#C9A84C', 1)), 'full desaturate is grey');
    eq(hex(Color.saturate('#808080', 0.5)), '#808080', 'grey has no hue to saturate');
    near(Color.toOklch(Color.rotate('#3B82F6', 40)).h, (base.h + 40) % 360, 1.5);
    eq(hex(Color.lighten('#FFFFFF', 0.2)), '#FFFFFF', 'clamped at white');
});

test('adjust: invert / grayscale / complement / setAlpha', () => {
    eq(hex(Color.invert('#C9A84C')), '#3657B3');
    ok(Color.isAchromatic(Color.grayscale('#C9A84C')));
    near(Color.toOklch(Color.grayscale('#C9A84C')).l, Color.toOklch('#C9A84C').l, 1e-6, 'grayscale keeps L');
    // Angular gap between two hues, 0..180.
    const gap = (h1, h2) => { const d = (((h1 - h2) % 360) + 360) % 360; return d > 180 ? 360 - d : d; };
    const soft = Color.fromOklch(0.65, 0.08, 250);
    near(gap(Color.toOklch(Color.complement(soft)).h, 250), 180, 0.5, 'in-gamut complement is exactly opposite');
    // A vivid blue's opposite yellow is out of gamut; mapping may nudge hue a few degrees.
    near(gap(Color.toOklch(Color.complement('#3B82F6')).h, Color.toOklch('#3B82F6').h), 180, 8, 'vivid complement');
    eq(Color.setAlpha('#C9A84C', 0.25).a, 0.25);
    eq(Color.setAlpha('#C9A84C', 7).a, 1, 'alpha clamps');
});

/* ------------------------------------------------------------------ */
/* Harmonies and scales                                                */
/* ------------------------------------------------------------------ */

test('harmony: counts, input first, both spaces', () => {
    const counts = { complementary: 2, analogous: 5, triadic: 3, split: 3, tetradic: 4, square: 4, monochromatic: 5 };
    Object.keys(counts).forEach((kind) => {
        const set = Color.harmony('#C9A84C', kind);
        eq(set.length, counts[kind], kind);
        eq(hex(set[0]), '#C9A84C', `${kind} starts with the input`);
        eq(Color.harmony('#C9A84C', kind, { space: 'hsl' }).length, counts[kind], `${kind} hsl`);
    });
    const tri = Color.harmony('#FF0000', 'triadic', { space: 'hsl' }).map(hex);
    eq(tri, ['#FF0000', '#00FF00', '#0000FF']);
    throws(() => Color.harmony('#C9A84C', 'pentagram'), RangeError);
});

test('scale: tailwind has 11 monotonic steps with the input anchored', () => {
    const s = Color.scale('#3B82F6', { mode: 'tailwind' });
    eq(s.length, 11);
    eq(s.map((e) => e.label), ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
    const L = s.map((e) => Color.toOklch(e.color).l);
    for (let i = 1; i < L.length; i++) ok(L[i] < L[i - 1], `lightness falls at ${s[i].label}`);
    const anchors = s.filter((e) => e.anchor);
    eq(anchors.length, 1);
    eq(hex(anchors[0].color), '#3B82F6');
    eq(Color.scale('#C9A84C').length, 11, 'tailwind is the default');
});

test('scale: tints / shades / both', () => {
    const t = Color.scale('#C9A84C', { mode: 'tints', steps: 5 });
    eq(t.length, 5);
    eq(t[0].label, '0%');
    eq(t[1].label, '20%');
    ok(Color.luminance(t[4].color) > Color.luminance(t[0].color), 'tints get lighter');
    const sh = Color.scale('#C9A84C', { mode: 'shades', steps: 4 });
    eq(sh.length, 4);
    ok(Color.luminance(sh[3].color) < Color.luminance(sh[0].color), 'shades get darker');
    const both = Color.scale('#C9A84C', { mode: 'both', steps: 4 });
    eq(both.length, 7);
    eq(hex(both[3].color), '#C9A84C', 'base sits in the middle');
    eq(Color.scale('#C9A84C', { mode: 'tints', steps: 99 }).length, 15, 'steps clamp to 15');
    eq(Color.scale('#C9A84C', { mode: 'tints', steps: 1 }).length, 3, 'steps clamp to 3');
});

/* ------------------------------------------------------------------ */
/* Color vision                                                       */
/* ------------------------------------------------------------------ */

test('simulate: Machado 2009 types', () => {
    Color.CVD_TYPES.forEach((t) => {
        const white = Color.simulate('#FFFFFF', t.id);
        rgb255(white).forEach((v) => near(v, 255, 1, `${t.id} keeps white`));
        eq(hex(Color.simulate('#000000', t.id)), '#000000', `${t.id} keeps black`);
    });
    const red = Color.simulate('#FF0000', 'protanopia');
    ok(red.r < 0.6 && red.g > 0.2, 'protanopes see red as a dark olive');
    ok(Color.isAchromatic(Color.simulate('#C9A84C', 'achromatopsia')), 'achromatopsia is grey');
    eq(hex(Color.simulate('#C9A84C', 'deuteranopia', 0)), '#C9A84C', 'severity 0 is identity');
    eq(hex(Color.simulate('#C9A84C', 'deuteranomaly', 1)), hex(Color.simulate('#C9A84C', 'deuteranopia')));
    eq(hex(Color.simulate('#C9A84C', 'normal')), '#C9A84C');
    throws(() => Color.simulate('#C9A84C', 'x-ray'), RangeError);
});

/* ------------------------------------------------------------------ */
/* Random, equality, extraction                                        */
/* ------------------------------------------------------------------ */

test('random: pleasant range and seeded repeatability', () => {
    let seed = 42;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 25; i++) {
        const o = Color.toOklch(Color.random(rng));
        ok(o.l >= 0.44 && o.l <= 0.86, `L ${o.l}`);
        ok(o.c <= 0.201, `C ${o.c}`);
    }
    seed = 7; const a = hex(Color.random(rng));
    seed = 7; const b = hex(Color.random(rng));
    eq(a, b);
});

test('equals and normalize', () => {
    eq(Color.equals('#C9A84C', { r: 201 / 255, g: 168 / 255, b: 76 / 255, a: 1 }), true);
    eq(Color.equals('#C9A84C', '#C9A84D'), false);
    eq(Color.equals('#C9A84C', 'bogus'), false);
    eq(Color.normalize({ r: 2, g: -1, b: 0.5 }), { r: 1, g: 0, b: 0.5, a: 1 });
    throws(() => Color.normalize(null), TypeError);
    throws(() => Color.contrast('bogus', '#fff'), TypeError);
});

test('extractPalette: synthetic two-color buffer', () => {
    const w = 40;
    const h = 25;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const navy = i % 10 < 7;
        data[p] = navy ? 0x1B : 0xC9;
        data[p + 1] = navy ? 0x2A : 0xA8;
        data[p + 2] = navy ? 0x4A : 0x4C;
        data[p + 3] = i % 50 === 0 ? 0 : 255;   // a few transparent pixels to skip
    }
    const pal = Color.extractPalette({ data, width: w, height: h }, 6);
    eq(pal.length, 2, 'two colors in, two colors out');
    eq(pal.map(hex), ['#1B2A4A', '#C9A84C'], 'sorted by population');
    eq(JSON.stringify(Color.extractPalette({ data }, 6)), JSON.stringify(pal), 'deterministic');
    const detail = Color.extractPaletteDetailed({ data }, 6);
    near(detail[0].share, 0.7, 0.02);
    eq(Color.extractPalette({ data: new Uint8ClampedArray(16) }), [], 'fully transparent');
    eq(Color.extractPalette(null), []);
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
