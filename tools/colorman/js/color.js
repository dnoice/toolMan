/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ColorEngine (colorMan Edition - v1.0)
 *     - File Name: color.js
 *     - Relative Path: tools/colorman/js/color.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The color math behind every colorMan pane: it reads any CSS color
 *     string, converts between sRGB, HSL, HWB, HSV, CMYK, CIE Lab/LCH and
 *     OKLab/OKLCH, and measures contrast, color difference and color vision
 *     deficiency. Every function is pure and works on plain { r, g, b, a }
 *     objects, so the interface, the state layer and the Node tests share one
 *     implementation whose numbers match CSS Color 4 and the browser.
 *
 * ✒ Key Features:
 *     - Forgiving parser: hex (3/4/6/8 digits, with or without #), rgb(),
 *       hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(srgb |
 *       srgb-linear | display-p3 | xyz-d65 | xyz-d50), cmyk(), hsv(), all 148
 *       named colors, transparent, bare "201 168 76" triples, and pasted
 *       declarations such as "--brand: #C9A84C;"
 *     - CSS Color 4 math: exact sRGB matrices, Bradford D65 to D50 for
 *       Lab/LCH, OKLab matrices, and the CSS gamut-mapping algorithm
 *       (OKLCH chroma reduction) with a clipped flag on out-of-gamut input
 *     - format() for hex, hex8, rgb, hsl, hwb, hsv, cmyk, lab, lch, oklab,
 *       oklch, Display P3, color(srgb) and exact CSS names
 *     - WCAG 2.x contrast with alpha compositing, the five pass/fail levels,
 *       APCA 0.0.98G-4g lightness contrast, and best text color
 *     - ensureContrast(): nudges OKLCH lightness until a target ratio passes
 *       even after the result is rounded to 8-bit hex
 *     - CIEDE2000 (Sharma et al.) and OKLab color difference, nearest name
 *     - Mixing in seven spaces with premultiplied alpha and shorter-arc hue
 *     - Lighten, darken, saturate, desaturate, rotate, invert, grayscale and
 *       complement in OKLCH, always returned inside sRGB
 *     - Harmonies (seven kinds, OKLCH or HSL) and Tailwind-style, tint and
 *       shade scales
 *     - Color vision simulation with Machado 2009 matrices on linear RGB
 *     - extractPalette(): deterministic k-means++ in OKLab over image pixels
 *
 * ✒ Usage Instructions:
 *     Browser: load after the shared scripts and before js/state.js:
 *         <script src="js/color.js"></script>
 *     then call window.Color.*. Node: const Color = require('./color.js').
 *     A color is { r, g, b, a } with each value 0..1 (sRGB, gamma encoded,
 *     a = 1 opaque). Functions that take a color also accept a CSS color
 *     string; an unreadable string throws a TypeError (parse() and format()
 *     never throw: they return null and '' instead).
 *
 * ✒ Examples:
 *     Color.parse('#C9A84C')                    → { r: 0.788, g: 0.659, b: 0.298, a: 1 }
 *     Color.format(Color.parse('gold'), 'oklch') → 'oklch(0.8868 0.1822 95.33)'
 *     Color.contrast('#777777', '#FFFFFF')      → 4.478 (passes AA large only)
 *     Color.mix('#000', '#FFF', 0.5, 'srgb')    → mid grey #808080
 *     Color.harmony('#C9A84C', 'triadic')       → [input, +120°, +240°]
 *     Color.scale('#3B82F6', { mode: 'tailwind' }) → 11 steps labelled 50…950
 *     Color.simulate('#FF0000', 'deuteranopia') → how red reads without green cones
 *     Color.ensureContrast('#C9A84C', '#FFFFFF', 4.5).color → a darker gold
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers; Node 16+
 *     - Limitations: output is sRGB only (wide-gamut input is gamut mapped);
 *       CMYK uses the plain device formula, not an ICC print profile; color
 *       vision severities between Machado's 0, 0.6 and 1.0 tables are
 *       linearly interpolated
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const Color = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = Color;
    if (root) root.Color = Color;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /* ================================================================== */
    /* Numeric helpers                                                     */
    /* ================================================================== */

    const DEG = Math.PI / 180;

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const clamp01 = (v) => clamp(v, 0, 1);

    /** A finite number from anything, or the fallback. */
    function num(v, fallback = 0) {
        const n = typeof v === 'number' ? v : (v === null || v === '' ? NaN : Number(v));
        return Number.isFinite(n) ? n : fallback;
    }

    /** Hue folded into [0, 360); -0 becomes 0. */
    function normHue(h) {
        const r = num(h) % 360;
        return (r < 0 ? r + 360 : r) + 0;
    }

    function mul3(m, v) {
        return [
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
        ];
    }

    /** Short decimal string: rounded to p places, trailing zeros dropped. */
    function fmtNum(v, p) {
        const r = Number(num(v).toFixed(clamp(p, 0, 6)));
        return Object.is(r, -0) ? '0' : String(r);
    }

    /* ================================================================== */
    /* CSS Color 4 matrices                                                */
    /* ================================================================== */

    // Linear sRGB <-> CIE XYZ (D65), exact rational forms from CSS Color 4.
    const LIN_SRGB_TO_XYZ = [
        [506752 / 1228815, 87881 / 245763, 12673 / 70218],
        [87098 / 409605, 175762 / 245763, 12673 / 175545],
        [7918 / 409605, 87881 / 737289, 1001167 / 1053270]
    ];
    const XYZ_TO_LIN_SRGB = [
        [12831 / 3959, -329 / 214, -1974 / 3959],
        [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
        [705 / 12673, -2585 / 12673, 705 / 667]
    ];

    // Linear Display P3 <-> XYZ (D65). P3 shares the sRGB transfer curve.
    const LIN_P3_TO_XYZ = [
        [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
        [35783 / 156275, 247089 / 357200, 198249 / 2500400],
        [0, 32229 / 714400, 5220557 / 5000800]
    ];
    const XYZ_TO_LIN_P3 = [
        [446124 / 178915, -333277 / 357830, -72051 / 178915],
        [-14852 / 17905, 63121 / 35810, 423 / 17905],
        [11844 / 330415, -50337 / 660830, 316169 / 330415]
    ];

    // Bradford chromatic adaptation between D65 and D50 (CSS Color 4).
    const D65_TO_D50 = [
        [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
        [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
        [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371]
    ];
    const D50_TO_D65 = [
        [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
        [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
        [0.012314014864481998, -0.020507649298898964, 1.330365926242124]
    ];

    // OKLab (Ottosson), at the double precision CSS Color 4 publishes.
    const XYZ_TO_LMS = [
        [0.8190224379967030, 0.3619062600528904, -0.1288737815209879],
        [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
        [0.0481771893596242, 0.2642395317527308, 0.6335478284694309]
    ];
    const LMS_TO_OKLAB = [
        [0.2104542683093140, 0.7936177747023054, -0.0040720430116193],
        [1.9779985324311684, -2.4285922420485799, 0.4505937096174110],
        [0.0259040424655478, 0.7827717124575296, -0.8086757549230774]
    ];
    const OKLAB_TO_LMS = [
        [1.0, 0.3963377773761749, 0.2158037573099136],
        [1.0, -0.1055613458156586, -0.0638541728258133],
        [1.0, -0.0894841775298119, -1.2914855480194092]
    ];
    const LMS_TO_XYZ = [
        [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
        [-0.0405757452148008, 1.1122868032803170, -0.0717110580655164],
        [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816]
    ];

    const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
    const LAB_E = 216 / 24389;
    const LAB_K = 24389 / 27;

    /* ================================================================== */
    /* Space conversions (arrays, internal)                                */
    /* ================================================================== */

    function srgbToLinear(c) {
        const a = Math.abs(c);
        return a <= 0.04045 ? c / 12.92 : Math.sign(c) * Math.pow((a + 0.055) / 1.055, 2.4);
    }

    function linearToSrgb(c) {
        const a = Math.abs(c);
        return a <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.pow(a, 1 / 2.4) - 0.055);
    }

    const rgbToXyz65 = (rgb) => mul3(LIN_SRGB_TO_XYZ, rgb.map(srgbToLinear));

    function xyz65ToOklab(xyz) {
        const lms = mul3(XYZ_TO_LMS, xyz).map((v) => Math.cbrt(v));
        return mul3(LMS_TO_OKLAB, lms);
    }

    function oklabToXyz65(lab) {
        const lms = mul3(OKLAB_TO_LMS, lab).map((v) => v * v * v);
        return mul3(LMS_TO_XYZ, lms);
    }

    function xyz50ToLab(xyz) {
        const f = [xyz[0] / D50_WHITE[0], xyz[1] / D50_WHITE[1], xyz[2] / D50_WHITE[2]]
            .map((v) => (v > LAB_E ? Math.cbrt(v) : (LAB_K * v + 16) / 116));
        return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
    }

    function labToXyz50(lab) {
        const [L, a, b] = lab;
        const f1 = (L + 16) / 116;
        const f0 = a / 500 + f1;
        const f2 = f1 - b / 200;
        const x = f0 * f0 * f0 > LAB_E ? f0 * f0 * f0 : (116 * f0 - 16) / LAB_K;
        const y = L > LAB_K * LAB_E ? f1 * f1 * f1 : L / LAB_K;
        const z = f2 * f2 * f2 > LAB_E ? f2 * f2 * f2 : (116 * f2 - 16) / LAB_K;
        return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
    }

    const xyz65ToLab = (xyz) => xyz50ToLab(mul3(D65_TO_D50, xyz));
    const labToXyz65 = (lab) => mul3(D50_TO_D65, labToXyz50(lab));

    function rectToPolar(v) {
        const c = Math.hypot(v[1], v[2]);
        return [v[0], c, normHue(Math.atan2(v[2], v[1]) / DEG)];
    }

    function polarToRect(v) {
        return [v[0], v[1] * Math.cos(v[2] * DEG), v[1] * Math.sin(v[2] * DEG)];
    }

    const rgbToOklab = (rgb) => xyz65ToOklab(rgbToXyz65(rgb));

    function oklchToSrgbRaw(L, C, H) {
        const lin = mul3(XYZ_TO_LIN_SRGB, oklabToXyz65(polarToRect([L, C, H])));
        return lin.map(linearToSrgb);
    }

    /* ================================================================== */
    /* Color objects and gamut mapping                                    */
    /* ================================================================== */

    const FLAG_EPS = 0.5 / 255;   // inside half an 8-bit step counts as in gamut
    const WHITE = Object.freeze({ r: 1, g: 1, b: 1, a: 1 });
    const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });

    function make(rgb, a = 1) {
        return { r: clamp01(num(rgb[0])), g: clamp01(num(rgb[1])), b: clamp01(num(rgb[2])), a: clamp01(num(a, 1)) };
    }

    const inGamutRgb = (rgb, eps) => rgb.every((v) => v >= -eps && v <= 1 + eps);
    const clipRgb = (rgb) => rgb.map(clamp01);

    function isAchromatic(c) {
        return Math.abs(c.r - c.g) < 1e-7 && Math.abs(c.g - c.b) < 1e-7;
    }

    /** CSS Color 4 gamut mapping: reduce OKLCH chroma until the clip is invisible. */
    function gamutMapOklch(L, C, H) {
        if (L >= 1) return [1, 1, 1];
        if (L <= 0) return [0, 0, 0];
        const JND = 0.02;
        const EPS = 0.0001;
        const target = (chroma) => polarToRect([L, chroma, H]);
        const dist = (rgb, lab) => {
            const p = rgbToOklab(rgb);
            return Math.hypot(p[0] - lab[0], p[1] - lab[1], p[2] - lab[2]);
        };

        let current = oklchToSrgbRaw(L, C, H);
        if (inGamutRgb(current, 1e-7)) return clipRgb(current);
        let clipped = clipRgb(current);
        if (dist(clipped, target(C)) < JND) return clipped;

        let min = 0;
        let max = C;
        let minInGamut = true;
        while (max - min > EPS) {
            const chroma = (min + max) / 2;
            current = oklchToSrgbRaw(L, chroma, H);
            if (minInGamut && inGamutRgb(current, 1e-7)) {
                min = chroma;
                continue;
            }
            clipped = clipRgb(current);
            const E = dist(clipped, target(chroma));
            if (E < JND) {
                if (JND - E < EPS) return clipped;
                minInGamut = false;
                min = chroma;
            } else {
                max = chroma;
            }
        }
        return clipRgb(oklchToSrgbRaw(L, min, H));
    }

    function fromLinearDetailed(lin, alpha) {
        const rgb = lin.map(linearToSrgb);
        if (inGamutRgb(rgb, FLAG_EPS)) return { color: make(rgb, alpha), clipped: false };
        const lch = rectToPolar(xyz65ToOklab(mul3(LIN_SRGB_TO_XYZ, lin)));
        return { color: make(gamutMapOklch(lch[0], lch[1], lch[2]), alpha), clipped: true };
    }

    const fromXyz65Detailed = (xyz, alpha) => fromLinearDetailed(mul3(XYZ_TO_LIN_SRGB, xyz), alpha);

    function fromOklchDetailed(L, C, H, alpha) {
        L = clamp01(num(L));
        C = Math.max(0, num(C));
        H = normHue(H);
        if (C < 1e-12) {
            const g = linearToSrgb(L * L * L);
            return { color: make([g, g, g], alpha), clipped: false };
        }
        const rgb = oklchToSrgbRaw(L, C, H);
        if (inGamutRgb(rgb, FLAG_EPS)) return { color: make(rgb, alpha), clipped: false };
        return { color: make(gamutMapOklch(L, C, H), alpha), clipped: true };
    }

    /**
     * Normalise any color-ish input to a fresh { r, g, b, a } (0..1, clamped).
     * Accepts color objects and CSS strings; anything else throws.
     */
    function norm(c) {
        if (typeof c === 'string') {
            const p = parse(c);
            if (!p) throw new TypeError(`Color: "${c}" is not a color this engine can read`);
            return p;
        }
        if (c && typeof c === 'object' && 'r' in c && 'g' in c && 'b' in c) {
            return {
                r: clamp01(num(c.r)),
                g: clamp01(num(c.g)),
                b: clamp01(num(c.b)),
                a: c.a === undefined || c.a === null ? 1 : clamp01(num(c.a, 1))
            };
        }
        throw new TypeError('Color: expected a color object { r, g, b, a } or a CSS color string');
    }

    function quantize(c) {
        const q = (v) => Math.round(v * 255) / 255;
        return { r: q(c.r), g: q(c.g), b: q(c.b), a: q(c.a) };
    }

    /* ================================================================== */
    /* Named colors                                                       */
    /* ================================================================== */

    const NAMED = Object.freeze({
        aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4',
        azure: '#F0FFFF', beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000',
        blanchedalmond: '#FFEBCD', blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A',
        burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00', chocolate: '#D2691E',
        coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C',
        cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B',
        darkgray: '#A9A9A9', darkgreen: '#006400', darkgrey: '#A9A9A9', darkkhaki: '#BDB76B',
        darkmagenta: '#8B008B', darkolivegreen: '#556B2F', darkorange: '#FF8C00', darkorchid: '#9932CC',
        darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F', darkslateblue: '#483D8B',
        darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F', darkturquoise: '#00CED1', darkviolet: '#9400D3',
        deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969',
        dodgerblue: '#1E90FF', firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22',
        fuchsia: '#FF00FF', gainsboro: '#DCDCDC', ghostwhite: '#F8F8FF', gold: '#FFD700',
        goldenrod: '#DAA520', gray: '#808080', green: '#008000', greenyellow: '#ADFF2F',
        grey: '#808080', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C',
        indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA',
        lavenderblush: '#FFF0F5', lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6',
        lightcoral: '#F08080', lightcyan: '#E0FFFF', lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3',
        lightgreen: '#90EE90', lightgrey: '#D3D3D3', lightpink: '#FFB6C1', lightsalmon: '#FFA07A',
        lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899',
        lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32',
        linen: '#FAF0E6', magenta: '#FF00FF', maroon: '#800000', mediumaquamarine: '#66CDAA',
        mediumblue: '#0000CD', mediumorchid: '#BA55D3', mediumpurple: '#9370DB', mediumseagreen: '#3CB371',
        mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC', mediumvioletred: '#C71585',
        midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5',
        navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000',
        olivedrab: '#6B8E23', orange: '#FFA500', orangered: '#FF4500', orchid: '#DA70D6',
        palegoldenrod: '#EEE8AA', palegreen: '#98FB98', paleturquoise: '#AFEEEE', palevioletred: '#DB7093',
        papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F', pink: '#FFC0CB',
        plum: '#DDA0DD', powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399',
        red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513',
        salmon: '#FA8072', sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE',
        sienna: '#A0522D', silver: '#C0C0C0', skyblue: '#87CEEB', slateblue: '#6A5ACD',
        slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA', springgreen: '#00FF7F',
        steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8',
        tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3',
        white: '#FFFFFF', whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32'
    });

    // Reverse lookup: first name (alphabetical) wins for shared values.
    const NAME_BY_HEX = Object.create(null);
    Object.keys(NAMED).forEach((name) => {
        if (!NAME_BY_HEX[NAMED[name]]) NAME_BY_HEX[NAMED[name]] = name;
    });

    function hexDigitsToColor(h) {
        if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
        const v = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
        return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) : 1 };
    }

    /* ================================================================== */
    /* Parser                                                              */
    /* ================================================================== */

    const TOKEN_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/;
    const FUNC_RE = /^([a-z][a-z-]*)\s*\(([\s\S]*)\)$/;

    function token(s) {
        if (s === 'none') return { v: 0, unit: 'none' };
        const m = TOKEN_RE.exec(s);
        return m ? { v: parseFloat(m[1]), unit: m[2] || '' } : null;
    }

    /** Split function arguments; commas, spaces and one slash are all accepted. */
    function splitArgs(inner) {
        const raw = inner.trim().match(/\/|[^\s,/]+/g) || [];
        const slash = raw.indexOf('/');
        if (slash < 0) return { parts: raw, alpha: null };
        const after = raw.slice(slash + 1);
        if (after.length !== 1 || after[0] === '/') return null;
        return { parts: raw.slice(0, slash), alpha: after[0] };
    }

    /** Pull an alpha that arrived comma-separated (legacy rgba/hsla). */
    function takeChannels(args, count) {
        let parts = args.parts;
        let alpha = args.alpha;
        if (alpha === null && parts.length === count + 1) {
            alpha = parts[count];
            parts = parts.slice(0, count);
        }
        if (parts.length !== count) return null;
        const toks = parts.map(token);
        if (toks.some((t) => !t)) return null;
        let a = 1;
        if (alpha !== null) {
            const t = token(alpha);
            if (!t) return null;
            if (t.unit === '%') a = t.v / 100;
            else if (t.unit === '' || t.unit === 'none') a = t.v;
            else return null;
        }
        return { toks, alpha: clamp01(a) };
    }

    function hueOfToken(t) {
        switch (t.unit) {
            case '': case 'deg': case 'none': return t.v;
            case 'rad': return t.v / DEG;
            case 'grad': return t.v * 0.9;
            case 'turn': return t.v * 360;
            default: return NaN;
        }
    }

    /** A plain number or a percentage, with the percentage scaled by pctScale. */
    function scalar(t, pctScale) {
        if (t.unit === 'none') return 0;
        if (t.unit === '') return t.v;
        if (t.unit === '%') return (t.v / 100) * pctScale;
        return NaN;
    }

    const outside = (v, lo, hi) => v < lo - 1e-9 || v > hi + 1e-9;

    function parseRgbTokens(toks, alpha) {
        const vals = toks.map((t) => {
            if (t.unit === 'none') return 0;
            if (t.unit === '%') return t.v / 100;
            if (t.unit === '') return t.v / 255;
            return NaN;
        });
        if (vals.some(Number.isNaN)) return null;
        return { color: make(vals, alpha), clipped: vals.some((v) => outside(v, 0, 1)) };
    }

    /** Forgiving OKLab/OKLCH lightness: 0..1, a percentage, or 0..100 typed bare. */
    function okLightness(t) {
        let v = scalar(t, 1);
        if (t.unit === '' && v > 1 && v <= 100) v /= 100;
        return v;
    }

    function parseFunction(name, inner) {
        const args = splitArgs(inner);
        if (!args) return null;

        if (name === 'color') {
            const space = args.parts[0];
            const ch = takeChannels({ parts: args.parts.slice(1), alpha: args.alpha }, 3);
            if (!ch || !space) return null;
            const vals = ch.toks.map((t) => scalar(t, 1));
            if (vals.some(Number.isNaN)) return null;
            let out;
            switch (space) {
                case 'srgb':
                    out = inGamutRgb(vals, FLAG_EPS)
                        ? { color: make(vals, ch.alpha), clipped: false }
                        : fromLinearDetailed(vals.map(srgbToLinear), ch.alpha);
                    break;
                case 'srgb-linear': out = fromLinearDetailed(vals, ch.alpha); break;
                case 'display-p3': out = fromXyz65Detailed(mul3(LIN_P3_TO_XYZ, vals.map(srgbToLinear)), ch.alpha); break;
                case 'xyz': case 'xyz-d65': out = fromXyz65Detailed(vals, ch.alpha); break;
                case 'xyz-d50': out = fromXyz65Detailed(mul3(D50_TO_D65, vals), ch.alpha); break;
                default: return null;
            }
            return { color: out.color, format: 'color', clipped: out.clipped };
        }

        if (name === 'cmyk' || name === 'device-cmyk') {
            const ch = takeChannels(args, 4);
            if (!ch) return null;
            if (ch.toks.some((t) => t.unit !== '' && t.unit !== '%' && t.unit !== 'none')) return null;
            const bareScale = ch.toks.some((t) => t.unit === '' && t.v > 1) ? 100 : 1;
            const vals = ch.toks.map((t) => (t.unit === '%' ? t.v / 100 : t.unit === 'none' ? 0 : t.v / bareScale));
            const color = fromCmyk(vals[0] * 100, vals[1] * 100, vals[2] * 100, vals[3] * 100, ch.alpha);
            return { color, format: 'cmyk', clipped: vals.some((v) => outside(v, 0, 1)) };
        }

        const ch = takeChannels(args, 3);
        if (!ch) return null;
        const [t0, t1, t2] = ch.toks;
        const alpha = ch.alpha;

        switch (name) {
            case 'rgb': case 'rgba': {
                const out = parseRgbTokens(ch.toks, alpha);
                return out && { color: out.color, format: 'rgb', clipped: out.clipped };
            }
            case 'hsl': case 'hsla': case 'hsv': case 'hsb': case 'hwb': {
                const h = hueOfToken(t0);
                const x = scalar(t1, 100);
                const y = scalar(t2, 100);
                if ([h, x, y].some(Number.isNaN)) return null;
                const clipped = outside(x, 0, 100) || outside(y, 0, 100);
                if (name === 'hwb') return { color: fromHwb(h, x, y, alpha), format: 'hwb', clipped };
                if (name === 'hsv' || name === 'hsb') return { color: fromHsv(h, x, y, alpha), format: 'hsv', clipped };
                return { color: fromHsl(h, x, y, alpha), format: 'hsl', clipped };
            }
            case 'lab': case 'lch': {
                const L = clamp(scalar(t0, 100), 0, 100);
                if (name === 'lab') {
                    const a = scalar(t1, 125);
                    const b = scalar(t2, 125);
                    if ([L, a, b].some(Number.isNaN)) return null;
                    const out = fromXyz65Detailed(labToXyz65([L, a, b]), alpha);
                    return { color: out.color, format: 'lab', clipped: out.clipped };
                }
                const C = Math.max(0, scalar(t1, 150));
                const H = hueOfToken(t2);
                if ([L, C, H].some(Number.isNaN)) return null;
                const out = fromXyz65Detailed(labToXyz65(polarToRect([L, C, H])), alpha);
                return { color: out.color, format: 'lch', clipped: out.clipped };
            }
            case 'oklab': case 'oklch': {
                const L = clamp01(okLightness(t0));
                if (name === 'oklab') {
                    const a = scalar(t1, 0.4);
                    const b = scalar(t2, 0.4);
                    if ([L, a, b].some(Number.isNaN)) return null;
                    const out = fromXyz65Detailed(oklabToXyz65([L, a, b]), alpha);
                    return { color: out.color, format: 'oklab', clipped: out.clipped };
                }
                const C = Math.max(0, scalar(t1, 0.4));
                const H = hueOfToken(t2);
                if ([L, C, H].some(Number.isNaN)) return null;
                const out = fromOklchDetailed(L, C, H, alpha);
                return { color: out.color, format: 'oklch', clipped: out.clipped };
            }
            default:
                return null;
        }
    }

    /**
     * Parse a color string. Returns { color, format, clipped } or null.
     * format is one of hex hex8 rgb hsl hwb hsv cmyk lab lch oklab oklch color
     * name, or 'object' when a color object was passed in. clipped is true
     * when the input lay outside sRGB and was gamut mapped or clamped.
     */
    function parseDetailed(input) {
        if (input && typeof input === 'object' && 'r' in input && 'g' in input && 'b' in input) {
            return { color: norm(input), format: 'object', clipped: false };
        }
        if (typeof input !== 'string' || input.length > 400) return null;

        let s = input.trim().toLowerCase();
        s = s.replace(/^(['"`])([\s\S]*)\1$/, '$2').trim();
        s = s.replace(/\s*!important\s*$/, '').replace(/[;,\s]+$/, '').trim();
        const decl = /^-{0,2}[a-z][a-z0-9-]*\s*:\s*([\s\S]+)$/.exec(s);
        if (decl) s = decl[1].trim();
        if (!s) return null;

        if (s === 'transparent') return { color: { r: 0, g: 0, b: 0, a: 0 }, format: 'name', clipped: false };

        const compact = s.replace(/[\s_-]+/g, '');
        if (/^[a-z]+$/.test(compact) && Object.prototype.hasOwnProperty.call(NAMED, compact)) {
            return { color: hexDigitsToColor(NAMED[compact].slice(1)), format: 'name', clipped: false };
        }

        const hex = /^(?:#|0x)?([0-9a-f]+)$/.exec(s);
        if (hex) {
            const d = hex[1];
            if (d.length === 3 || d.length === 6) return { color: hexDigitsToColor(d), format: 'hex', clipped: false };
            if (d.length === 4 || d.length === 8) return { color: hexDigitsToColor(d), format: 'hex8', clipped: false };
            return null;
        }

        const fn = FUNC_RE.exec(s);
        if (fn) return parseFunction(fn[1], fn[2]);

        // Bare "201, 168, 76" / "201 168 76" (optionally a fourth alpha value).
        if (/^[0-9.+\-e%\s,/]+$/.test(s)) {
            const args = splitArgs(s);
            if (!args) return null;
            const ch = takeChannels(args, 3);
            if (!ch) return null;
            const out = parseRgbTokens(ch.toks, ch.alpha);
            return out && { color: out.color, format: 'rgb', clipped: out.clipped };
        }
        return null;
    }

    function parse(input) {
        const out = parseDetailed(input);
        return out ? out.color : null;
    }

    const isValid = (input) => parseDetailed(input) !== null;

    /* ================================================================== */
    /* Model conversions (public)                                          */
    /* ================================================================== */

    /** True when the first argument is an object carrying the named channels. */
    const isObj = (v) => v !== null && typeof v === 'object';

    function hueOfRgb(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        if (d < 1e-9) return 0;
        let h;
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return normHue(h * 60);
    }

    function toHsl(color) {
        const c = norm(color);
        const max = Math.max(c.r, c.g, c.b);
        const min = Math.min(c.r, c.g, c.b);
        const l = (max + min) / 2;
        const d = max - min;
        const s = d < 1e-9 || l <= 0 || l >= 1 ? 0 : (max - l) / Math.min(l, 1 - l);
        return { h: s === 0 ? 0 : hueOfRgb(c.r, c.g, c.b), s: s * 100, l: l * 100, a: c.a, alpha: c.a };
    }

    function hslToRgb(h, s, l) {
        const f = (n) => {
            const k = (n + h / 30) % 12;
            return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return [f(0), f(8), f(4)];
    }

    function fromHsl(h, s, l, a = 1) {
        if (isObj(h)) { const o = h; h = o.h; s = o.s; l = o.l; a = o.alpha ?? o.a ?? 1; }
        return make(hslToRgb(normHue(h), clamp(num(s), 0, 100) / 100, clamp(num(l), 0, 100) / 100), a);
    }

    function toHsv(color) {
        const c = norm(color);
        const max = Math.max(c.r, c.g, c.b);
        const d = max - Math.min(c.r, c.g, c.b);
        const s = max <= 0 || d < 1e-9 ? 0 : d / max;
        return { h: s === 0 ? 0 : hueOfRgb(c.r, c.g, c.b), s: s * 100, v: max * 100, a: c.a, alpha: c.a };
    }

    function fromHsv(h, s, v, a = 1) {
        if (isObj(h)) { const o = h; h = o.h; s = o.s; v = o.v; a = o.alpha ?? o.a ?? 1; }
        h = normHue(h);
        s = clamp(num(s), 0, 100) / 100;
        v = clamp(num(v), 0, 100) / 100;
        const f = (n) => {
            const k = (n + h / 60) % 6;
            return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
        };
        return make([f(5), f(3), f(1)], a);
    }

    function toHwb(color) {
        const c = norm(color);
        const max = Math.max(c.r, c.g, c.b);
        const min = Math.min(c.r, c.g, c.b);
        return { h: max - min < 1e-9 ? 0 : hueOfRgb(c.r, c.g, c.b), w: min * 100, b: (1 - max) * 100, a: c.a, alpha: c.a };
    }

    function fromHwb(h, w, b, a = 1) {
        if (isObj(h)) { const o = h; h = o.h; w = o.w; b = o.b; a = o.alpha ?? o.a ?? 1; }
        h = normHue(h);
        w = clamp(num(w), 0, 100) / 100;
        b = clamp(num(b), 0, 100) / 100;
        if (w + b >= 1) {
            const grey = w / (w + b);
            return make([grey, grey, grey], a);
        }
        return make(hslToRgb(h, 1, 0.5).map((v) => v * (1 - w - b) + w), a);
    }

    function toCmyk(color) {
        const c = norm(color);
        const k = 1 - Math.max(c.r, c.g, c.b);
        if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 100, a: c.a, alpha: c.a };
        const f = (v) => ((1 - v - k) / (1 - k)) * 100;
        return { c: f(c.r), m: f(c.g), y: f(c.b), k: k * 100, a: c.a, alpha: c.a };
    }

    function fromCmyk(c, m, y, k, a = 1) {
        if (isObj(c)) { const o = c; c = o.c; m = o.m; y = o.y; k = o.k; a = o.alpha ?? o.a ?? 1; }
        const p = (v) => clamp(num(v), 0, 100) / 100;
        const kk = p(k);
        return make([(1 - p(c)) * (1 - kk), (1 - p(m)) * (1 - kk), (1 - p(y)) * (1 - kk)], a);
    }

    function labArrOf(c) {
        const lab = xyz65ToLab(rgbToXyz65([c.r, c.g, c.b]));
        if (isAchromatic(c)) { lab[1] = 0; lab[2] = 0; }
        return lab;
    }

    function oklabArrOf(c) {
        const lab = rgbToOklab([c.r, c.g, c.b]);
        if (isAchromatic(c)) { lab[1] = 0; lab[2] = 0; }
        return lab;
    }

    /** CIE Lab (D50, CSS Color 4). Alpha is returned as `alpha` because `a` is a channel. */
    function toLab(color) {
        const c = norm(color);
        const [l, a, b] = labArrOf(c);
        return { l, a, b, alpha: c.a };
    }

    function fromLab(l, a, b, alpha = 1) {
        if (isObj(l)) { const o = l; l = o.l; a = o.a; b = o.b; alpha = o.alpha ?? 1; }
        return fromXyz65Detailed(labToXyz65([clamp(num(l), 0, 100), num(a), num(b)]), alpha).color;
    }

    function toLch(color) {
        const c = norm(color);
        const [l, ch, h] = rectToPolar(labArrOf(c));
        const achromatic = isAchromatic(c);
        return { l, c: achromatic ? 0 : ch, h: achromatic ? 0 : h, a: c.a, alpha: c.a };
    }

    function fromLch(l, c, h, alpha = 1) {
        if (isObj(l)) { const o = l; l = o.l; c = o.c; h = o.h; alpha = o.alpha ?? o.a ?? 1; }
        const lab = polarToRect([clamp(num(l), 0, 100), Math.max(0, num(c)), normHue(h)]);
        return fromXyz65Detailed(labToXyz65(lab), alpha).color;
    }

    function toOklab(color) {
        const c = norm(color);
        const [l, a, b] = oklabArrOf(c);
        return { l, a, b, alpha: c.a };
    }

    function fromOklab(l, a, b, alpha = 1) {
        if (isObj(l)) { const o = l; l = o.l; a = o.a; b = o.b; alpha = o.alpha ?? 1; }
        const [L, C, H] = rectToPolar([clamp01(num(l)), num(a), num(b)]);
        return fromOklchDetailed(L, C, H, alpha).color;
    }

    function toOklch(color) {
        const c = norm(color);
        const [l, ch, h] = rectToPolar(oklabArrOf(c));
        const achromatic = isAchromatic(c);
        return { l, c: achromatic ? 0 : ch, h: achromatic ? 0 : h, a: c.a, alpha: c.a };
    }

    function fromOklch(l, c, h, alpha = 1) {
        if (isObj(l)) { const o = l; l = o.l; c = o.c; h = o.h; alpha = o.alpha ?? o.a ?? 1; }
        return fromOklchDetailed(l, c, h, alpha).color;
    }

    /** True when OKLCH (l, c, h) sits inside sRGB without any chroma reduction. */
    function inGamutOklch(l, c, h) {
        return inGamutRgb(oklchToSrgbRaw(clamp01(num(l)), Math.max(0, num(c)), normHue(h)), 1e-6);
    }

    /** Largest in-gamut OKLCH chroma at a given lightness and hue (to within 1e-6). */
    function maxChroma(l, h) {
        l = clamp01(num(l));
        if (l <= 0 || l >= 1) return 0;
        let lo = 0;
        let hi = 0.5;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamutOklch(l, mid, h)) lo = mid; else hi = mid;
        }
        return lo;
    }

    /**
     * Unmapped OKLCH to gamma-encoded sRGB as [r, g, b]; values may fall
     * outside 0..1. Cheap enough for per-pixel canvas drawing, where the
     * caller decides how to show out-of-gamut areas.
     */
    function oklchToRgbRaw(l, c, h) {
        return oklchToSrgbRaw(clamp01(num(l)), Math.max(0, num(c)), normHue(h));
    }

    function toRgb255(color) {
        const c = norm(color);
        return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: c.a };
    }

    function fromRgb(r, g, b, a = 1) {
        if (isObj(r)) { const o = r; r = o.r; g = o.g; b = o.b; a = o.a ?? 1; }
        return make([num(r) / 255, num(g) / 255, num(b) / 255], a);
    }

    /* ================================================================== */
    /* Output                                                              */
    /* ================================================================== */

    function toHex(color, opts = {}) {
        const c = norm(color);
        const mode = opts.alpha === 'always' || opts.alpha === 'never' ? opts.alpha : 'auto';
        const two = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
        let s = '#' + two(c.r) + two(c.g) + two(c.b);
        if (mode === 'always' || (mode === 'auto' && Math.round(c.a * 255) < 255)) s += two(c.a);
        return opts.upper === false ? s : s.toUpperCase();
    }

    /** Exact CSS name for a color, or '' when none matches. */
    function nameOf(c) {
        if (c.a <= 1e-9 && c.r === 0 && c.g === 0 && c.b === 0) return 'transparent';
        if (Math.round(c.a * 255) < 255) return '';
        return NAME_BY_HEX[toHex(c, { alpha: 'never' })] || '';
    }

    const FORMATS = Object.freeze([
        { id: 'hex', label: 'HEX' },
        { id: 'hex8', label: 'HEX8' },
        { id: 'rgb', label: 'RGB' },
        { id: 'hsl', label: 'HSL' },
        { id: 'hwb', label: 'HWB' },
        { id: 'hsv', label: 'HSV' },
        { id: 'cmyk', label: 'CMYK' },
        { id: 'lab', label: 'Lab' },
        { id: 'lch', label: 'LCH' },
        { id: 'oklab', label: 'OKLab' },
        { id: 'oklch', label: 'OKLCH' },
        { id: 'p3', label: 'Display P3' },
        { id: 'srgb', label: 'color(srgb)' },
        { id: 'name', label: 'Name' }
    ]);

    /**
     * Format a color as text. fmt: hex hex8 rgb hsl hwb hsv cmyk lab lch oklab
     * oklch p3 srgb name. opts: { precision = 2, upper = true }. Alpha appears
     * only when a < 1. Returns '' when the color cannot be read.
     */
    function format(color, fmt = 'hex', opts = {}) {
        let c;
        try { c = norm(color); } catch (e) { return ''; }
        const p = clamp(Math.round(num(opts.precision, 2)), 0, 6);
        const fine = Math.min(p + 2, 6);       // 0..1-range channels get two extra places
        const upper = opts.upper !== false;
        const alphaPct = fmtNum(c.a * 100, Math.min(p, 2));
        const ap = c.a < 1 && alphaPct !== '100' ? ` / ${alphaPct}%` : '';
        // Hue reads 0 whenever the colorfulness rounds away.
        const hue = (h, strength, sp) => (fmtNum(strength, sp) === '0' ? '0' : fmtNum(normHue(Number(fmtNum(h, p))), p));

        switch (fmt) {
            case 'hex8': return toHex(c, { alpha: 'always', upper });
            case 'rgb': {
                const v = toRgb255(c);
                return `rgb(${v.r} ${v.g} ${v.b}${ap})`;
            }
            case 'hsl': {
                const o = toHsl(c);
                return `hsl(${hue(o.h, o.s, p)} ${fmtNum(o.s, p)}% ${fmtNum(o.l, p)}%${ap})`;
            }
            case 'hwb': {
                const o = toHwb(c);
                return `hwb(${hue(o.h, 100 - o.w - o.b, p)} ${fmtNum(o.w, p)}% ${fmtNum(o.b, p)}%${ap})`;
            }
            case 'hsv': {
                const o = toHsv(c);
                return `hsv(${hue(o.h, o.s, p)} ${fmtNum(o.s, p)}% ${fmtNum(o.v, p)}%${ap})`;
            }
            case 'cmyk': {
                const o = toCmyk(c);
                return `cmyk(${fmtNum(o.c, p)}% ${fmtNum(o.m, p)}% ${fmtNum(o.y, p)}% ${fmtNum(o.k, p)}%${ap})`;
            }
            case 'lab': {
                const o = toLab(c);
                return `lab(${fmtNum(o.l, p)} ${fmtNum(o.a, p)} ${fmtNum(o.b, p)}${ap})`;
            }
            case 'lch': {
                const o = toLch(c);
                return `lch(${fmtNum(o.l, p)} ${fmtNum(o.c, p)} ${hue(o.h, o.c, p)}${ap})`;
            }
            case 'oklab': {
                const o = toOklab(c);
                return `oklab(${fmtNum(o.l, fine)} ${fmtNum(o.a, fine)} ${fmtNum(o.b, fine)}${ap})`;
            }
            case 'oklch': {
                const o = toOklch(c);
                return `oklch(${fmtNum(o.l, fine)} ${fmtNum(o.c, fine)} ${hue(o.h, o.c, fine)}${ap})`;
            }
            case 'p3': {
                const v = mul3(XYZ_TO_LIN_P3, rgbToXyz65([c.r, c.g, c.b])).map(linearToSrgb);
                return `color(display-p3 ${v.map((x) => fmtNum(clamp01(x), fine)).join(' ')}${ap})`;
            }
            case 'srgb':
                return `color(srgb ${[c.r, c.g, c.b].map((x) => fmtNum(x, fine)).join(' ')}${ap})`;
            case 'name':
                return nameOf(c);
            case 'hex':
            default:
                return toHex(c, { alpha: 'auto', upper });
        }
    }

    /* ================================================================== */
    /* Contrast and legibility                                             */
    /* ================================================================== */

    /** Source-over in gamma space onto an opaque backdrop. */
    function over(f, b) {
        const a = f.a;
        return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 };
    }

    /** Opaque result of fg over bg; a translucent bg is first laid over white. */
    function composite(fg, bg = WHITE) {
        const f = norm(fg);
        let b = norm(bg);
        if (b.a < 1) b = over(b, WHITE);
        return over(f, b);
    }

    /** WCAG 2.x relative luminance of the color's RGB (alpha ignored). */
    function luminance(color) {
        const c = norm(color);
        return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
    }

    /** WCAG 2.x contrast ratio, 1..21, with fg composited over bg. */
    function contrast(fg, bg) {
        const b = composite(bg, WHITE);
        const f = composite(fg, b);
        const L1 = luminance(f);
        const L2 = luminance(b);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    }

    function wcag(ratio) {
        const r = num(ratio, 1) + 1e-9;
        return { aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5, ui: r >= 3 };
    }

    /** APCA 0.0.98G-4g lightness contrast Lc: positive for dark text on light. */
    function apca(text, bg) {
        const b = composite(bg, WHITE);
        const t = composite(text, b);
        const Y = (c) => {
            const y = 0.2126729 * Math.pow(c.r, 2.4) + 0.7151522 * Math.pow(c.g, 2.4) + 0.0721750 * Math.pow(c.b, 2.4);
            return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
        };
        const Yt = Y(t);
        const Yb = Y(b);
        if (Math.abs(Yb - Yt) < 0.0005) return 0;
        let out;
        if (Yb > Yt) {
            const sapc = (Math.pow(Yb, 0.56) - Math.pow(Yt, 0.57)) * 1.14;
            out = sapc < 0.1 ? 0 : sapc - 0.027;
        } else {
            const sapc = (Math.pow(Yb, 0.65) - Math.pow(Yt, 0.62)) * 1.14;
            out = sapc > -0.1 ? 0 : sapc + 0.027;
        }
        return out * 100;
    }

    /** '#000000' or '#FFFFFF', whichever reads with more contrast on c. */
    function textOn(color) {
        const bg = composite(color, WHITE);
        return contrast(BLACK, bg) >= contrast(WHITE, bg) ? '#000000' : '#FFFFFF';
    }

    const isDark = (color) => textOn(color) === '#FFFFFF';

    /**
     * Adjust fg's OKLCH lightness (hue and chroma kept) until it reaches the
     * target ratio against bg; the result passes even after 8-bit rounding.
     * When neither direction can reach it, returns black or white, whichever
     * scores higher.
     */
    function ensureContrast(fg, bg, target = 4.5) {
        const F = norm(fg);
        const B = composite(bg, WHITE);
        target = clamp(num(target, 4.5), 1, 21);
        const start = contrast(F, B);
        if (start >= target) return { color: { ...F }, ratio: start, changed: false };

        const o = toOklch(F);
        const Yb = luminance(B);
        const at = (L) => quantize(fromOklch(L, o.c, o.h, F.a));
        const passes = (col, dir) => {
            if (contrast(col, B) < target) return false;
            const y = luminance(composite(col, B));
            return dir > 0 ? y >= Yb : y <= Yb;
        };

        const found = [];
        [1, -1].forEach((dir) => {
            const end = dir > 0 ? 1 : 0;
            if (!passes(at(end), dir)) return;
            let bad = o.l;
            let good = end;
            for (let i = 0; i < 40 && Math.abs(good - bad) > 1e-5; i++) {
                const mid = (bad + good) / 2;
                if (passes(at(mid), dir)) good = mid; else bad = mid;
            }
            const color = at(good);
            found.push({ color, ratio: contrast(color, B), dist: Math.abs(good - o.l) });
        });

        if (found.length) {
            found.sort((x, y) => x.dist - y.dist);
            return { color: found[0].color, ratio: found[0].ratio, changed: true };
        }
        const cb = contrast(BLACK, B);
        const cw = contrast(WHITE, B);
        return cb >= cw
            ? { color: { ...BLACK }, ratio: cb, changed: true }
            : { color: { ...WHITE }, ratio: cw, changed: true };
    }

    /* ================================================================== */
    /* Color difference and names                                         */
    /* ================================================================== */

    const labTriple = (v) => (Array.isArray(v) ? v : [num(v.l ?? v.L), num(v.a), num(v.b)]);

    /** CIEDE2000 between two Lab values ({ l, a, b } or [L, a, b]); Sharma et al. 2005. */
    function deltaE2000Lab(lab1, lab2) {
        const [L1, a1, b1] = labTriple(lab1);
        const [L2, a2, b2] = labTriple(lab2);
        const C1 = Math.hypot(a1, b1);
        const C2 = Math.hypot(a2, b2);
        const Cbar7 = Math.pow((C1 + C2) / 2, 7);
        const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
        const a1p = (1 + G) * a1;
        const a2p = (1 + G) * a2;
        const C1p = Math.hypot(a1p, b1);
        const C2p = Math.hypot(a2p, b2);
        const hp = (b, ap) => (b === 0 && ap === 0 ? 0 : normHue(Math.atan2(b, ap) / DEG));
        const h1p = hp(b1, a1p);
        const h2p = hp(b2, a2p);

        const dLp = L2 - L1;
        const dCp = C2p - C1p;
        let dhp = 0;
        if (C1p * C2p !== 0) {
            dhp = h2p - h1p;
            if (dhp > 180) dhp -= 360;
            else if (dhp < -180) dhp += 360;
        }
        const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * DEG) / 2);

        const Lbp = (L1 + L2) / 2;
        const Cbp = (C1p + C2p) / 2;
        let hbp;
        if (C1p * C2p === 0) hbp = h1p + h2p;
        else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
        else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
        else hbp = (h1p + h2p - 360) / 2;

        const T = 1
            - 0.17 * Math.cos((hbp - 30) * DEG)
            + 0.24 * Math.cos(2 * hbp * DEG)
            + 0.32 * Math.cos((3 * hbp + 6) * DEG)
            - 0.20 * Math.cos((4 * hbp - 63) * DEG);
        const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
        const Cbp7 = Math.pow(Cbp, 7);
        const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + Math.pow(25, 7)));
        const Lm = (Lbp - 50) * (Lbp - 50);
        const SL = 1 + (0.015 * Lm) / Math.sqrt(20 + Lm);
        const SC = 1 + 0.045 * Cbp;
        const SH = 1 + 0.015 * Cbp * T;
        const RT = -Math.sin(2 * dTheta * DEG) * RC;
        const l = dLp / SL;
        const c = dCp / SC;
        const h = dHp / SH;
        return Math.sqrt(l * l + c * c + h * h + RT * c * h);
    }

    const deltaE2000 = (a, b) => deltaE2000Lab(labArrOf(norm(a)), labArrOf(norm(b)));

    /** Euclidean OKLab distance × 100 (≈ 2 is a just-noticeable difference). */
    function deltaEOK(a, b) {
        const p = oklabArrOf(norm(a));
        const q = oklabArrOf(norm(b));
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
    }

    let namedLab = null;

    function nearestName(color) {
        const c = norm(color);
        if (!namedLab) {
            namedLab = Object.keys(NAMED).map((name) => ({
                name, hex: NAMED[name], lab: labArrOf(hexDigitsToColor(NAMED[name].slice(1)))
            }));
        }
        const lab = labArrOf(c);
        let best = null;
        namedLab.forEach((e) => {
            const d = deltaE2000Lab(lab, e.lab);
            if (!best || d < best.deltaE - 1e-12) best = { name: e.name, hex: e.hex, deltaE: d };
        });
        return best;
    }

    /* ================================================================== */
    /* Mixing                                                              */
    /* ================================================================== */

    const MIX_SPACES = Object.freeze(['srgb', 'srgb-linear', 'hsl', 'lab', 'lch', 'oklab', 'oklch']);
    const HUE_INDEX = { hsl: 0, lch: 2, oklch: 2 };

    function coordsIn(c, space) {
        switch (space) {
            case 'srgb': return [c.r, c.g, c.b];
            case 'srgb-linear': return [c.r, c.g, c.b].map(srgbToLinear);
            case 'hsl': { const o = toHsl(c); return [o.h, o.s, o.l]; }
            case 'lab': return labArrOf(c);
            case 'lch': { const o = toLch(c); return [o.l, o.c, o.h]; }
            case 'oklab': return oklabArrOf(c);
            default: { const o = toOklch(c); return [o.l, o.c, o.h]; }
        }
    }

    function fromCoords(v, space, alpha) {
        switch (space) {
            case 'srgb': return make(v, alpha);
            case 'srgb-linear': return fromLinearDetailed(v, alpha).color;
            case 'hsl': return fromHsl(v[0], v[1], v[2], alpha);
            case 'lab': return fromLab(v[0], v[1], v[2], alpha);
            case 'lch': return fromLch(v[0], v[1], v[2], alpha);
            case 'oklab': return fromOklab(v[0], v[1], v[2], alpha);
            default: return fromOklch(v[0], v[1], v[2], alpha);
        }
    }

    function checkSpace(space, fn) {
        if (!MIX_SPACES.includes(space)) {
            throw new RangeError(`Color.${fn}: unknown space "${space}" (use ${MIX_SPACES.join(', ')})`);
        }
    }

    /**
     * Interpolate from a (t = 0) to b (t = 1) in a CSS color space, with
     * premultiplied alpha and the shorter hue arc; a grey borrows the other
     * color's hue.
     */
    function mix(a, b, t = 0.5, space = 'oklab') {
        const A = norm(a);
        const B = norm(b);
        checkSpace(space, 'mix');
        t = clamp01(num(t, 0.5));
        if (t === 0) return A;
        if (t === 1) return B;

        const ca = coordsIn(A, space);
        const cb = coordsIn(B, space);
        const hi = space in HUE_INDEX ? HUE_INDEX[space] : -1;
        if (hi >= 0) {
            const greyA = isAchromatic(A);
            const greyB = isAchromatic(B);
            if (greyA && !greyB) ca[hi] = cb[hi];
            else if (greyB && !greyA) cb[hi] = ca[hi];
            const d = cb[hi] - ca[hi];
            if (d > 180) ca[hi] += 360;
            else if (d < -180) cb[hi] += 360;
        }
        const alpha = A.a + (B.a - A.a) * t;
        const out = [0, 1, 2].map((i) => {
            if (i === hi || alpha <= 0) return ca[i] + (cb[i] - ca[i]) * t;
            const pa = ca[i] * A.a;
            const pb = cb[i] * B.a;
            return (pa + (pb - pa) * t) / alpha;
        });
        if (hi >= 0) out[hi] = normHue(out[hi]);
        return fromCoords(out, space, alpha);
    }

    /** n colors from a to b inclusive. */
    function steps(a, b, n = 5, space = 'oklab') {
        const A = norm(a);
        const B = norm(b);
        checkSpace(space, 'steps');
        n = Math.round(num(n, 5));
        if (n <= 0) return [];
        if (n === 1) return [A];
        const out = [];
        for (let i = 0; i < n; i++) out.push(mix(A, B, i / (n - 1), space));
        return out;
    }

    /* ================================================================== */
    /* Adjustments (OKLCH, gamut mapped)                                   */
    /* ================================================================== */

    function adjust(color, fn) {
        const c = norm(color);
        const o = toOklch(c);
        const [L, C, H] = fn(o.l, o.c, o.h, isAchromatic(c));
        return fromOklch(L, C, H, c.a);
    }

    const lighten = (c, amt = 0.1) => adjust(c, (L, C, H) => [clamp01(L + num(amt)), C, H]);
    const darken = (c, amt = 0.1) => adjust(c, (L, C, H) => [clamp01(L - num(amt)), C, H]);
    // A grey has no hue to strengthen, so saturate() leaves it unchanged.
    const saturate = (c, amt = 0.1) => adjust(c, (L, C, H, grey) => [L, grey ? 0 : Math.max(0, C + num(amt) * 0.4), H]);
    const desaturate = (c, amt = 0.1) => adjust(c, (L, C, H) => [L, Math.max(0, C - num(amt) * 0.4), H]);
    const rotate = (c, deg = 0) => adjust(c, (L, C, H) => [L, C, H + num(deg)]);
    const complement = (c) => rotate(c, 180);

    function invert(color) {
        const c = norm(color);
        return make([1 - c.r, 1 - c.g, 1 - c.b], c.a);
    }

    function grayscale(color) {
        const c = norm(color);
        const L = toOklch(c).l;
        const g = linearToSrgb(L * L * L);
        return make([g, g, g], c.a);
    }

    function setAlpha(color, a) {
        const c = norm(color);
        c.a = clamp01(num(a, c.a));
        return c;
    }

    /* ================================================================== */
    /* Harmonies and scales                                                */
    /* ================================================================== */

    const HARMONIES = Object.freeze({
        complementary: { label: 'Complementary', offsets: [0, 180] },
        analogous: { label: 'Analogous', offsets: [0, -60, -30, 30, 60] },
        triadic: { label: 'Triadic', offsets: [0, 120, 240] },
        split: { label: 'Split complementary', offsets: [0, 150, 210] },
        tetradic: { label: 'Tetradic', offsets: [0, 60, 180, 240] },
        square: { label: 'Square', offsets: [0, 90, 180, 270] },
        monochromatic: { label: 'Monochromatic', offsets: null }
    });

    function monochrome(c, hsl) {
        const o = hsl ? toHsl(c) : toOklch(c);
        const lo = hsl ? 15 : 0.22;
        const hi = hsl ? 92 : 0.96;
        const step = hsl ? 14 : 0.14;
        const start = clamp(o.l - 2 * step, lo, hi - 4 * step);
        const levels = [0, 1, 2, 3, 4].map((i) => start + i * step);
        let nearest = 0;
        levels.forEach((v, i) => { if (Math.abs(v - o.l) < Math.abs(levels[nearest] - o.l)) nearest = i; });
        const out = [{ ...c }];
        levels.forEach((v, i) => {
            if (i === nearest) return;
            out.push(hsl ? fromHsl(o.h, o.s, v, c.a) : fromOklch(v, o.c, o.h, c.a));
        });
        return out;
    }

    /**
     * Color harmony with the input first. kind: complementary analogous
     * triadic split tetradic square monochromatic. opts.space: 'oklch' | 'hsl'.
     */
    function harmony(color, kind = 'complementary', opts = {}) {
        const c = norm(color);
        const def = HARMONIES[kind];
        if (!def) throw new RangeError(`Color.harmony: unknown kind "${kind}"`);
        const hsl = opts && opts.space === 'hsl';
        if (!def.offsets) return monochrome(c, hsl);
        const base = hsl ? toHsl(c) : toOklch(c);
        return def.offsets.map((off, i) => {
            if (i === 0) return { ...c };
            return hsl ? fromHsl(base.h + off, base.s, base.l, c.a) : fromOklch(base.l, base.c, base.h + off, c.a);
        });
    }

    const TW_LABELS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
    const TW_L = [0.97, 0.932, 0.875, 0.79, 0.70, 0.62, 0.54, 0.46, 0.38, 0.30, 0.22];
    const TW_C = [0.10, 0.22, 0.42, 0.68, 0.90, 1.00, 1.00, 0.92, 0.80, 0.66, 0.50];

    function tailwindScale(c) {
        const o = toOklch(c);
        let anchor = 0;
        TW_L.forEach((L, i) => { if (Math.abs(L - o.l) < Math.abs(TW_L[anchor] - o.l)) anchor = i; });
        const delta = o.l - TW_L[anchor];
        const grey = isAchromatic(c);
        return TW_LABELS.map((label, i) => {
            if (i === anchor) return { label, color: { ...c }, anchor: true };
            const w = Math.max(0, 1 - Math.abs(i - anchor) / 3);
            const L = clamp(TW_L[i] + delta * w, 0.01, 0.995);
            const C = grey ? 0 : Math.min(o.c * (TW_C[i] / TW_C[anchor]), o.c * 2.2, 0.37);
            return { label, color: fromOklch(L, C, o.h, c.a), anchor: false };
        });
    }

    /**
     * Shade/tint scale. opts.mode: 'tailwind' (11 steps, 50…950, input
     * anchored at its nearest step) | 'tints' | 'shades' | 'both';
     * opts.steps 3..15 per side for tints/shades/both. Entries are
     * { label, color } plus anchor (tailwind) or kind/percent (others).
     */
    function scale(color, opts = {}) {
        const c = norm(color);
        const mode = (opts && opts.mode) || 'tailwind';
        if (mode === 'tailwind') return tailwindScale(c);
        if (!['tints', 'shades', 'both'].includes(mode)) throw new RangeError(`Color.scale: unknown mode "${mode}"`);
        const n = clamp(Math.round(num(opts.steps, 5)), 3, 15);
        const solid = { ...c, a: 1 };
        const toward = (target, i) => setAlpha(mix(solid, target, i / n, 'oklab'), c.a);
        const pct = (i) => (i / n) * 100;
        const base = { label: '0%', color: { ...c }, kind: 'base', percent: 0 };

        if (mode === 'tints' || mode === 'shades') {
            const tint = mode === 'tints';
            const out = [base];
            for (let i = 1; i < n; i++) {
                out.push({ label: `${Math.round(pct(i))}%`, color: toward(tint ? WHITE : BLACK, i), kind: tint ? 'tint' : 'shade', percent: pct(i) });
            }
            return out;
        }
        const out = [];
        for (let i = n - 1; i >= 1; i--) out.push({ label: `-${Math.round(pct(i))}%`, color: toward(BLACK, i), kind: 'shade', percent: pct(i) });
        out.push(base);
        for (let i = 1; i < n; i++) out.push({ label: `+${Math.round(pct(i))}%`, color: toward(WHITE, i), kind: 'tint', percent: pct(i) });
        return out;
    }

    /* ================================================================== */
    /* Color vision deficiency (Machado, Oliveira & Fernandes 2009)       */
    /* ================================================================== */

    const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const CVD_MATRICES = {
        protan: {
            0.6: [[0.385450, 0.769005, -0.154455], [0.100526, 0.829802, 0.069673], [-0.007442, -0.022190, 1.029632]],
            1.0: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
        },
        deutan: {
            0.6: [[0.547494, 0.607765, -0.155259], [0.181692, 0.781742, 0.036566], [-0.010410, 0.027275, 0.983136]],
            1.0: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]
        },
        tritan: {
            0.6: [[1.104996, -0.046633, -0.058363], [-0.032137, 0.971635, 0.060503], [0.001336, 0.317922, 0.680742]],
            1.0: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
        }
    };

    const CVD_TYPES = Object.freeze([
        { id: 'protanopia', family: 'protan', severity: 1, label: 'Protanopia', description: 'No red-sensitive cones; reds look dark and merge with greens.' },
        { id: 'deuteranopia', family: 'deutan', severity: 1, label: 'Deuteranopia', description: 'No green-sensitive cones; reds and greens are hard to tell apart.' },
        { id: 'tritanopia', family: 'tritan', severity: 1, label: 'Tritanopia', description: 'No blue-sensitive cones; blues and greens, yellows and pinks blur together.' },
        { id: 'protanomaly', family: 'protan', severity: 0.6, label: 'Protanomaly', description: 'Weak red-sensitive cones; reds look muted.' },
        { id: 'deuteranomaly', family: 'deutan', severity: 0.6, label: 'Deuteranomaly', description: 'Weak green-sensitive cones; the most common type.' },
        { id: 'tritanomaly', family: 'tritan', severity: 0.6, label: 'Tritanomaly', description: 'Weak blue-sensitive cones; blue and yellow lose contrast.' },
        { id: 'achromatopsia', family: 'achroma', severity: 1, label: 'Achromatopsia', description: 'No color vision; only lightness remains.' }
    ]);

    const lerpMatrix = (m1, m2, t) => m1.map((row, i) => row.map((v, j) => v + (m2[i][j] - v) * t));

    function cvdMatrix(family, s) {
        const t = CVD_MATRICES[family];
        if (s <= 0.6) return lerpMatrix(IDENTITY, t[0.6], s / 0.6);
        return lerpMatrix(t[0.6], t[1.0], (s - 0.6) / 0.4);
    }

    /**
     * Simulate how a color reads with a color vision deficiency. type: see
     * CVD_TYPES ('normal' returns the color). severity 0..1 (1 for -opia and
     * achromatopsia, 0.6 for -omaly by default).
     */
    function simulate(color, type, severity) {
        const c = norm(color);
        if (type === 'normal' || type === 'none') return c;
        const def = CVD_TYPES.find((t) => t.id === type);
        if (!def) throw new RangeError(`Color.simulate: unknown type "${type}"`);
        const s = clamp01(num(severity, def.severity));
        const lin = [c.r, c.g, c.b].map(srgbToLinear);
        let out;
        if (def.family === 'achroma') {
            const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
            out = lin.map((v) => v + (y - v) * s);
        } else {
            out = mul3(cvdMatrix(def.family, s), lin);
        }
        return make(out.map((v) => linearToSrgb(clamp01(v))), c.a);
    }

    /* ================================================================== */
    /* Random, comparison, palette extraction                              */
    /* ================================================================== */

    /** A pleasant random color: OKLCH L 0.45..0.85, C 0.05..0.20, any hue. */
    function random(rng = Math.random) {
        const r = typeof rng === 'function' ? rng : Math.random;
        return fromOklch(0.45 + r() * 0.4, 0.05 + r() * 0.15, r() * 360, 1);
    }

    function equals(a, b, eps = 1e-3) {
        let A;
        let B;
        try { A = norm(a); B = norm(b); } catch (e) { return false; }
        const e = num(eps, 1e-3);
        return Math.abs(A.r - B.r) <= e && Math.abs(A.g - B.g) <= e && Math.abs(A.b - B.b) <= e && Math.abs(A.a - B.a) <= e;
    }

    /** Small deterministic PRNG so palette extraction repeats exactly. */
    function mulberry32(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const dist2 = (p, q) => {
        const a = p[0] - q[0];
        const b = p[1] - q[1];
        const c = p[2] - q[2];
        return a * a + b * b + c * c;
    };

    /**
     * Dominant colors with population: [{ color, count, share }], largest
     * first. imageData is an ImageData or { data } RGBA byte array.
     */
    function extractPaletteDetailed(imageData, k = 6) {
        const data = imageData && (imageData.data || imageData);
        if (!data || typeof data.length !== 'number' || data.length < 4) return [];
        k = clamp(Math.round(num(k, 6)), 1, 32);

        const total = Math.floor(data.length / 4);
        const stride = Math.max(1, Math.ceil(total / 10000));
        const counts = new Map();
        for (let p = 0; p < total; p += stride) {
            const i = p * 4;
            if (data[i + 3] < 128) continue;
            const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        if (!counts.size) return [];

        const keys = Array.from(counts.keys()).sort((x, y) => x - y);
        const pts = keys.map((key) => rgbToOklab([(key >> 16) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255]));
        const wts = keys.map((key) => counts.get(key));
        const n = pts.length;
        const rand = mulberry32(0x5EED + n);

        // k-means++ seeding, starting from the most common color.
        let first = 0;
        for (let i = 1; i < n; i++) if (wts[i] > wts[first]) first = i;
        const centers = [pts[first].slice()];
        const d2 = pts.map((p) => dist2(p, centers[0]));
        while (centers.length < k) {
            let sum = 0;
            for (let i = 0; i < n; i++) sum += d2[i] * wts[i];
            if (sum <= 1e-12) break;
            let r = rand() * sum;
            let pick = n - 1;
            for (let i = 0; i < n; i++) {
                r -= d2[i] * wts[i];
                if (r <= 0 && d2[i] > 0) { pick = i; break; }
            }
            centers.push(pts[pick].slice());
            for (let i = 0; i < n; i++) d2[i] = Math.min(d2[i], dist2(pts[i], centers[centers.length - 1]));
        }

        // Lloyd iterations (weighted).
        const assign = new Array(n).fill(-1);
        for (let iter = 0; iter < 30; iter++) {
            let moved = false;
            for (let i = 0; i < n; i++) {
                let best = 0;
                let bestD = Infinity;
                for (let j = 0; j < centers.length; j++) {
                    const d = dist2(pts[i], centers[j]);
                    if (d < bestD) { bestD = d; best = j; }
                }
                if (assign[i] !== best) { assign[i] = best; moved = true; }
            }
            const sums = centers.map(() => [0, 0, 0, 0]);
            for (let i = 0; i < n; i++) {
                const s = sums[assign[i]];
                s[0] += pts[i][0] * wts[i]; s[1] += pts[i][1] * wts[i]; s[2] += pts[i][2] * wts[i]; s[3] += wts[i];
            }
            sums.forEach((s, j) => { if (s[3] > 0) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
            if (!moved) break;
        }

        const pop = centers.map(() => 0);
        for (let i = 0; i < n; i++) pop[assign[i]] += wts[i];
        const sampled = pop.reduce((x, y) => x + y, 0);
        return centers
            .map((ctr, j) => ({ ctr, count: pop[j], j }))
            .filter((e) => e.count > 0)
            .sort((x, y) => y.count - x.count || x.j - y.j)
            .map((e) => ({ color: fromOklab(e.ctr[0], e.ctr[1], e.ctr[2], 1), count: e.count, share: e.count / sampled }));
    }

    const extractPalette = (imageData, k = 6) => extractPaletteDetailed(imageData, k).map((e) => e.color);

    /* ================================================================== */
    /* Public API                                                          */
    /* ================================================================== */

    return Object.freeze({
        version: '1.0.0',
        NAMED,
        FORMATS,
        HARMONIES,
        CVD_TYPES,
        MIX_SPACES,

        // parsing and output
        parse, parseDetailed, isValid, format, toHex, normalize: norm,

        // models
        toHsl, fromHsl, toHsv, fromHsv, toHwb, fromHwb, toCmyk, fromCmyk,
        toLab, fromLab, toLch, fromLch, toOklab, fromOklab, toOklch, fromOklch,
        toRgb255, fromRgb, inGamutOklch, maxChroma, oklchToRgbRaw,

        // contrast
        luminance, composite, contrast, wcag, apca, textOn, isDark, ensureContrast,

        // difference and names
        deltaE2000, deltaE2000Lab, deltaEOK, nearestName,

        // mixing and adjustment
        mix, steps, lighten, darken, saturate, desaturate, rotate, invert, grayscale, complement, setAlpha,

        // generators
        harmony, scale, simulate, random, extractPalette, extractPaletteDetailed,

        // helpers
        equals, clamp, clamp01, isAchromatic: (c) => isAchromatic(norm(c)),
        srgbToLinear, linearToSrgb
    });
});
