/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: TomlFormat (convertMan Edition - v1.0)
 *     - File Name: toml.js
 *     - Relative Path: tools/convertman/js/formats/toml.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The TOML format for convertMan: a complete TOML 1.0 reader and a
 *     writer that lays data out as tables and arrays of tables. It is used
 *     whenever a visitor converts a Cargo.toml, pyproject.toml or similar
 *     config file, so the rules TOML enforces (no redefined keys or tables,
 *     64-bit integers, no null) are checked and explained in plain words.
 *
 * ✒ Key Features:
 *     - Bare, quoted and dotted keys; [tables], [[arrays of tables]] and
 *       { inline tables }, with the 1.0 rules on what may be defined twice
 *     - All four string kinds: "basic", """multi-line basic""" (with
 *       line-ending backslashes), 'literal' and '''multi-line literal'''
 *     - Integers with _ separators and 0x / 0o / 0b prefixes, BigInt past
 *       2^53 and a 64-bit range check; floats with exponents, inf and nan
 *     - Offset and local date-times, local dates and local times, checked
 *       for real calendar values and returned as ISO 8601 strings
 *     - Mixed-type and nested arrays across lines, with comments and a
 *       trailing comma
 *     - Tables become Map, so "__proto__" and "constructor" are plain keys
 *     - Errors name the line and column; redefinitions say which key or
 *       table was defined twice
 *     - Caps: 20 MB of text, nesting 512 levels, 2,000,000 values
 *     - Writer: plain keys first, then [tables], then [[arrays of tables]];
 *       keys quoted only when needed; multi-line text as """ blocks
 *     - Writer: ISO date strings become TOML dates (optional), nulls are
 *       dropped with a warning, a non-table top level is wrapped under
 *       "data" with a warning, integers past 64 bits are written as text
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the module registers itself on
 *     window.ConvertFormats as "toml". Node:
 *         const { toml } = require('./formats/toml.js');
 *     parse(text) returns { value, warnings } and throws an Error with line,
 *     column, offset, reason and format on bad input.
 *     stringify(value, { nativeDates, sortKeys }) returns { text, warnings }.
 *
 * ✒ Examples:
 *     toml.parse('a = 1\n[b]\nc = "x"').value                → Map { a → 1, b → Map { c → 'x' } }
 *     toml.parse('[[p]]\nn = 1\n[[p]]\nn = 2').value.get('p') → [Map { n → 1 }, Map { n → 2 }]
 *     toml.parse('hex = 0xDEAD_BEEF').value.get('hex')        → 3735928559
 *     toml.parse('t = 1979-05-27T07:32:00Z').value.get('t')   → '1979-05-27T07:32:00Z'
 *     toml.parse('[a]\n[a]')                                  → throws "Line 2, column 1: the table [a] is defined more than once."
 *     toml.stringify(new Map([['name', 'app'], ['db', new Map([['port', 5432]])]])).text → 'name = "app"\n\n[db]\nport = 5432\n'
 *     toml.stringify(new Map([['a', null]])).warnings         → ['TOML has no null — 1 null value was left out.']
 *     toml.stringify([1, 2]).text                             → 'data = [1, 2]\n'
 *     toml.detect('[server]\nport = 8080')                    → 0.85
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (pure; no DOM; safe in Node 16+ and the browser)
 *     - Compatible platforms: all evergreen browsers (BigInt, Map, sticky
 *       regular expressions)
 *     - Security: no string is ever run as code; every loop is bounded by
 *       the text length, and nesting and value counts are capped
 *     - Limitations: comments and key formatting are not kept; dates are
 *       read as ISO strings (time zones are not converted); the writer puts
 *       arrays on one line unless they are long, and never writes arrays of
 *       tables inside inline tables
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const formats = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = formats;
    if (root) {
        const reg = root.ConvertFormats;
        if (!reg || Object.prototype.toString.call(reg) !== '[object Object]') root.ConvertFormats = {};
        Object.keys(formats).forEach((id) => { root.ConvertFormats[id] = formats[id]; });
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /* ================================================================== */
    /* Limits and small helpers                                            */
    /* ================================================================== */

    const LIMITS = Object.freeze({ inputChars: 20 * 1024 * 1024, depth: 512, nodes: 2000000 });
    const DETECT_CHARS = 4096;
    const I64_MIN = -(2n ** 63n);
    const I64_MAX = 2n ** 63n - 1n;

    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const lowerFirst = (s) => (/^(?:[A-Z][a-z]|An? )/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
    const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));
    const hex4 = (code) => code.toString(16).toUpperCase().padStart(4, '0');
    const isBare = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 45;
    const isControl = (c) => (c < 0x20 && c !== 9) || c === 0x7f;

    function locate(text, offset) {
        const end = Math.max(0, Math.min(offset, text.length));
        let line = 1;
        let last = -1;
        let at = text.indexOf('\n');
        while (at !== -1 && at < end) {
            line++;
            last = at;
            at = text.indexOf('\n', at + 1);
        }
        return { line, column: end - last, offset: end };
    }

    function positioned(text, offset, reason) {
        const p = locate(text, offset);
        const err = new Error(`Line ${p.line}, column ${p.column}: ${lowerFirst(reason)}`);
        err.reason = reason;
        err.line = p.line;
        err.column = p.column;
        err.offset = p.offset;
        err.format = 'toml';
        return err;
    }

    function plainError(message) {
        const err = new Error(message);
        err.format = 'toml';
        return err;
    }

    function found(s, i) {
        if (i >= s.length) return 'the end of the text';
        const cp = s.codePointAt(i);
        if (cp === 10 || cp === 13) return 'a line break';
        if (cp === 9) return 'a tab';
        if (cp < 0x20 || cp === 0x7f) return `the control character U+${hex4(cp)}`;
        return `'${String.fromCodePoint(cp)}'`;
    }

    const showKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
    const showPath = (keys) => keys.map(showKey).join('.');
    const named = (keys) => {
        const p = showPath(keys);
        return /^[A-Za-z0-9_.-]+$/.test(p) ? `"${p}"` : p;
    };

    /* Dates and times (RFC 3339 profiles TOML allows). */
    const DATE_TIME = /(\d{4})-(\d{2})-(\d{2})(?:([Tt ])(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:\d{2})?)?/y;
    const TIME_ONLY = /(\d{2}):(\d{2}):(\d{2})(\.\d+)?/y;

    function validDate(y, mo, d) {
        if (mo < 1 || mo > 12 || d < 1) return false;
        const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
        return d <= days;
    }
    const validTime = (h, mi, sec) => h <= 23 && mi <= 59 && sec <= 60;
    function validOffset(off) {
        if (!off || off === 'Z' || off === 'z') return true;
        return Number(off.slice(1, 3)) <= 23 && Number(off.slice(4, 6)) <= 59;
    }

    /** Is this string an ISO date / time TOML can hold natively? */
    function tomlDateText(str) {
        if (str.length > 40) return null;
        let m = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:\d{2})?)?$/.exec(str);
        if (m) {
            if (!validDate(+m[1], +m[2], +m[3])) return null;
            if (m[4] === undefined) return str;
            if (!validTime(+m[4], +m[5], +m[6]) || !validOffset(m[8])) return null;
            return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}${m[8] ? m[8].toUpperCase() : ''}`;
        }
        m = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(str);
        if (m && validTime(+m[1], +m[2], +m[3])) return str;
        return null;
    }

    /* ================================================================== */
    /* Reader                                                              */
    /* ================================================================== */

    const ESCAPES = new Map([[98, '\b'], [116, '\t'], [110, '\n'], [102, '\f'], [114, '\r'], [34, '"'], [92, '\\']]);
    const NUM_TOKEN = /[0-9A-Za-z_.+-]+/y;
    const DEC_INT = /^[+-]?(?:0|[1-9](?:_?[0-9])*)$/;
    const HEX_INT = /^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/;
    const OCT_INT = /^0o[0-7](?:_?[0-7])*$/;
    const BIN_INT = /^0b[01](?:_?[01])*$/;
    const FLOAT = /^[+-]?(?:0|[1-9](?:_?[0-9])*)(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;
    const SPECIAL_FLOAT = /^[+-]?(?:inf|nan)$/;

    function readTOML(text) {
        const s = text;
        const n = s.length;
        let i = s.charCodeAt(0) === 0xFEFF ? 1 : 0;
        let nodes = 0;
        const root = new Map();
        const kinds = new WeakMap();
        const tableArrays = new WeakSet();
        kinds.set(root, 'root');
        let current = root;

        const fail = (reason, at) => { throw positioned(s, at === undefined ? i : at, reason); };
        const count = () => {
            if (++nodes > LIMITS.nodes) fail(`The data has more than ${commas(LIMITS.nodes)} values — convertMan stops there to stay responsive.`);
        };
        const atEOL = () => i >= n || s.charCodeAt(i) === 10 || (s.charCodeAt(i) === 13 && s.charCodeAt(i + 1) === 10);

        function ws() {
            for (let c = s.charCodeAt(i); c === 32 || c === 9; c = s.charCodeAt(++i)) { /* skip */ }
        }

        function comment() {
            if (s.charCodeAt(i) !== 35) return;
            for (i++; i < n; i++) {
                const c = s.charCodeAt(i);
                if (c === 10 || (c === 13 && s.charCodeAt(i + 1) === 10)) return;
                if (isControl(c)) fail(`Comments can't contain the control character U+${hex4(c)}.`);
            }
        }

        function newline() {
            if (s.charCodeAt(i) === 13) i += 2;
            else i++;
        }

        /** Whitespace, comments and line breaks (inside arrays). */
        function wsAll() {
            for (;;) {
                ws();
                comment();
                if (i < n && atEOL()) { newline(); continue; }
                if (s.charCodeAt(i) === 13) fail('A carriage return must be followed by a line feed.');
                return;
            }
        }

        function endOfLine() {
            ws();
            comment();
            if (i >= n) return;
            if (atEOL()) { newline(); return; }
            fail(`Expected the end of the line, but found ${found(s, i)} — put each key = value on its own line.`);
        }

        /* ── Strings ──────────────────────────────────────────────────── */

        function escape() {
            const at = i;
            const e = s.charCodeAt(i + 1);
            if (ESCAPES.has(e)) { i += 2; return ESCAPES.get(e); }
            if (e === 117 || e === 85) {
                const len = e === 117 ? 4 : 8;
                const hex = s.slice(i + 2, i + 2 + len);
                if (hex.length !== len || !/^[0-9A-Fa-f]+$/.test(hex)) fail(`Expected ${len} hex digits after \\${String.fromCharCode(e)}.`, at);
                const cp = parseInt(hex, 16);
                if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) fail(`\\${String.fromCharCode(e)}${hex} is not a Unicode character TOML can hold.`, at);
                i += 2 + len;
                return String.fromCodePoint(cp);
            }
            const shown = i + 1 < n ? String.fromCodePoint(s.codePointAt(i + 1)) : '';
            return fail(`Unknown escape '\\${shown}' — TOML allows \\b \\t \\n \\f \\r \\" \\\\ \\uXXXX and \\UXXXXXXXX.`, at);
        }

        function basicString() {
            const start = i;
            i++;
            let out = '';
            let chunk = i;
            for (;;) {
                if (i >= n) fail('This "string" is never closed — add the closing ".', start);
                const c = s.charCodeAt(i);
                if (c === 34) {
                    out += s.slice(chunk, i);
                    i++;
                    return out;
                }
                if (c === 92) {
                    out += s.slice(chunk, i);
                    out += escape();
                    chunk = i;
                    continue;
                }
                if (c === 10 || c === 13) fail('A "string" can\'t run onto the next line — close it with ", or use """triple quotes""" for multi-line text.');
                if (isControl(c)) fail(`Strings can't contain the control character U+${hex4(c)} — write it as \\u${hex4(c)}.`);
                i++;
            }
        }

        function multiBasic() {
            const start = i;
            i += 3;
            if (atEOL() && i < n) newline();
            let out = '';
            let chunk = i;
            for (;;) {
                if (i >= n) fail('This """multi-line string""" is never closed — add the closing """.', start);
                const c = s.charCodeAt(i);
                if (c === 34 && s.charCodeAt(i + 1) === 34 && s.charCodeAt(i + 2) === 34) {
                    let run = 3;
                    while (s.charCodeAt(i + run) === 34) run++;
                    if (run > 5) fail('Too many quotes in a row — a """string""" can end with at most two extra quotes.', i);
                    out += s.slice(chunk, i) + '"'.repeat(run - 3);
                    i += run;
                    return out;
                }
                if (c === 92) {
                    out += s.slice(chunk, i);
                    let j = i + 1;
                    while (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9) j++;
                    if (s.charCodeAt(j) === 10 || (s.charCodeAt(j) === 13 && s.charCodeAt(j + 1) === 10)) {
                        i = j;
                        for (let d = s.charCodeAt(i); d === 32 || d === 9 || d === 10 || d === 13; d = s.charCodeAt(++i)) { /* trim */ }
                    } else {
                        out += escape();
                    }
                    chunk = i;
                    continue;
                }
                if (c === 13) {
                    if (s.charCodeAt(i + 1) !== 10) fail('A carriage return must be followed by a line feed.');
                    out += `${s.slice(chunk, i)}\n`;
                    i += 2;
                    chunk = i;
                    continue;
                }
                if (c !== 10 && isControl(c)) fail(`Strings can't contain the control character U+${hex4(c)} — write it as \\u${hex4(c)}.`);
                i++;
            }
        }

        function literalString() {
            const start = i;
            i++;
            for (let j = i; ; j++) {
                if (j >= n) fail("This 'literal string' is never closed — add the closing '.", start);
                const c = s.charCodeAt(j);
                if (c === 39) {
                    const out = s.slice(i, j);
                    i = j + 1;
                    return out;
                }
                if (c === 10 || c === 13) fail("A 'literal string' can't run onto the next line — use '''triple quotes''' for multi-line text.", j);
                if (isControl(c)) fail(`Strings can't contain the control character U+${hex4(c)}.`, j);
            }
        }

        function multiLiteral() {
            const start = i;
            i += 3;
            if (atEOL() && i < n) newline();
            let out = '';
            let chunk = i;
            for (;;) {
                if (i >= n) fail("This '''multi-line literal''' is never closed — add the closing '''.", start);
                const c = s.charCodeAt(i);
                if (c === 39 && s.charCodeAt(i + 1) === 39 && s.charCodeAt(i + 2) === 39) {
                    let run = 3;
                    while (s.charCodeAt(i + run) === 39) run++;
                    if (run > 5) fail("Too many quotes in a row — a '''string''' can end with at most two extra quotes.", i);
                    out += s.slice(chunk, i) + "'".repeat(run - 3);
                    i += run;
                    return out;
                }
                if (c === 13) {
                    if (s.charCodeAt(i + 1) !== 10) fail('A carriage return must be followed by a line feed.');
                    out += `${s.slice(chunk, i)}\n`;
                    i += 2;
                    chunk = i;
                    continue;
                }
                if (c !== 10 && isControl(c)) fail(`Strings can't contain the control character U+${hex4(c)}.`);
                i++;
            }
        }

        /* ── Keys ─────────────────────────────────────────────────────── */

        function parseKey() {
            const keys = [];
            for (;;) {
                ws();
                const c = s.charCodeAt(i);
                if (c === 34) {
                    if (s.startsWith('"""', i)) fail("A key can't be a multi-line string.");
                    keys.push(basicString());
                } else if (c === 39) {
                    if (s.startsWith("'''", i)) fail("A key can't be a multi-line string.");
                    keys.push(literalString());
                } else {
                    const st = i;
                    while (isBare(s.charCodeAt(i))) i++;
                    if (i === st) {
                        fail(atEOL() || c === 61 ? 'Expected a key here.'
                            : `Expected a key, but found ${found(s, i)} — keys use letters, digits, _ and -, or "quotes".`);
                    }
                    keys.push(s.slice(st, i));
                }
                ws();
                if (s.charCodeAt(i) !== 46) return keys;
                i++;
            }
        }

        /* ── Values ───────────────────────────────────────────────────── */

        function delimiterAfter(at) {
            const c = s.charCodeAt(at);
            return at >= n || c === 32 || c === 9 || c === 10 || c === 13 || c === 44 || c === 93 || c === 125 || c === 35;
        }

        function dateValue() {
            DATE_TIME.lastIndex = i;
            const m = DATE_TIME.exec(s);
            if (!m) return undefined;
            const end = DATE_TIME.lastIndex;
            if (!delimiterAfter(end)) fail(`'${clip(s.slice(i, end + 10).split(/\s/)[0], 40)}' is not a valid TOML date-time — write it like 1979-05-27T07:32:00Z.`);
            if (!validDate(+m[1], +m[2], +m[3])) fail(`${m[1]}-${m[2]}-${m[3]} is not a real calendar date.`);
            let out = `${m[1]}-${m[2]}-${m[3]}`;
            if (m[4] !== undefined) {
                if (!validTime(+m[5], +m[6], +m[7])) fail(`${m[5]}:${m[6]}:${m[7]} is not a valid time of day.`);
                if (!validOffset(m[9])) fail(`${m[9]} is not a valid time-zone offset.`);
                out += `T${m[5]}:${m[6]}:${m[7]}${m[8] || ''}${m[9] ? m[9].toUpperCase() : ''}`;
            }
            i = end;
            return out;
        }

        function timeValue() {
            TIME_ONLY.lastIndex = i;
            const m = TIME_ONLY.exec(s);
            if (!m || !delimiterAfter(TIME_ONLY.lastIndex)) return undefined;
            if (!validTime(+m[1], +m[2], +m[3])) fail(`${m[0]} is not a valid time of day.`);
            i = TIME_ONLY.lastIndex;
            return m[0];
        }

        function numberValue() {
            NUM_TOKEN.lastIndex = i;
            const m = NUM_TOKEN.exec(s);
            if (!m) return undefined;
            const tok = m[0];
            const at = i;
            if (SPECIAL_FLOAT.test(tok)) {
                i += tok.length;
                if (tok.endsWith('nan')) return NaN;
                return tok[0] === '-' ? -Infinity : Infinity;
            }
            if (HEX_INT.test(tok) || OCT_INT.test(tok) || BIN_INT.test(tok)) {
                const big = BigInt(tok.replace(/_/g, ''));
                if (big > I64_MAX) fail('This integer is too large for TOML — it must fit in 64 bits.', at);
                i += tok.length;
                return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
            }
            if (DEC_INT.test(tok)) {
                const clean = tok.replace(/_/g, '');
                const big = BigInt(clean);
                if (big > I64_MAX || big < I64_MIN) fail('This integer is too large for TOML — it must fit in 64 bits.', at);
                i += tok.length;
                const v = Number(clean);
                return Number.isSafeInteger(v) ? v : big;
            }
            if (FLOAT.test(tok)) {
                i += tok.length;
                return Number(tok.replace(/_/g, ''));
            }
            if (/^[+-]?\d/.test(tok)) {
                if (/^[+-]?0\d/.test(tok)) fail("Leading zeros aren't allowed in TOML numbers (write 7, not 07).", at);
                if (/^[+-]0[xob]/.test(tok)) fail("Hex, octal and binary numbers can't have a + or - sign.", at);
                if (/_(?:_|$|[.eE])|[.eE]_/.test(tok)) fail('An underscore in a number must sit between two digits.', at);
                if (/\.(?:$|[eE_])|\.\d*\./.test(tok) || /^[+-]?\./.test(tok)) fail('A decimal point needs digits on both sides.', at);
                fail(`'${clip(tok, 40)}' is not a valid TOML number.`, at);
            }
            return undefined;
        }

        function value(depth) {
            const c = s.charCodeAt(i);
            if (c === 34) return s.startsWith('"""', i) ? multiBasic() : basicString();
            if (c === 39) return s.startsWith("'''", i) ? multiLiteral() : literalString();
            if (c === 91) return array(depth);
            if (c === 123) return inlineTable(depth);
            if (s.startsWith('true', i) && delimiterAfter(i + 4)) { i += 4; return true; }
            if (s.startsWith('false', i) && delimiterAfter(i + 5)) { i += 5; return false; }
            if (c >= 48 && c <= 57) {
                const d = dateValue();
                if (d !== undefined) return d;
                const t = timeValue();
                if (t !== undefined) return t;
            }
            const num = numberValue();
            if (num !== undefined) return num;
            if (i >= n || atEOL() || c === 35) fail("Expected a value after '=' — a \"string\", a number, true / false, a date, an [array] or an { inline table }.");
            NUM_TOKEN.lastIndex = i;
            const word = NUM_TOKEN.exec(s);
            if (word) fail(`'${clip(word[0], 40)}' is not a TOML value — text needs quotes: "${clip(word[0], 40)}".`);
            return fail(`Expected a value, but found ${found(s, i)}.`);
        }

        function array(depth) {
            if (depth > LIMITS.depth) fail(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            const start = i;
            i++;
            const list = [];
            for (;;) {
                wsAll();
                if (s.charCodeAt(i) === 93) { i++; return list; }
                if (i >= n) fail("This [ array is never closed — add ']'.", start);
                if (s.charCodeAt(i) === 44) fail("Expected a value before ',' — remove the extra comma.");
                list.push(value(depth + 1));
                count();
                wsAll();
                const c = s.charCodeAt(i);
                if (c === 44) { i++; continue; }
                if (c === 93) { i++; return list; }
                if (i >= n) fail("This [ array is never closed — add ']'.", start);
                fail(`Expected ',' or ']' in this array, but found ${found(s, i)}.`);
            }
        }

        function inlineTable(depth) {
            if (depth > LIMITS.depth) fail(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            const start = i;
            i++;
            const table = new Map();
            kinds.set(table, 'inline');
            ws();
            if (s.charCodeAt(i) === 125) { i++; return table; }
            for (;;) {
                ws();
                if (atEOL()) fail(i >= n ? "This { inline table } is never closed — add '}'." : 'An { inline table } must stay on one line — use a [table] section for longer ones.', i >= n ? start : i);
                keyValue(table, 'inline', depth + 1);
                ws();
                const c = s.charCodeAt(i);
                if (c === 44) {
                    i++;
                    ws();
                    if (s.charCodeAt(i) === 125) fail("A trailing comma isn't allowed in an { inline table } — remove the last ','.");
                    continue;
                }
                if (c === 125) { i++; return table; }
                if (atEOL()) fail(i >= n ? "This { inline table } is never closed — add '}'." : 'An { inline table } must stay on one line — use a [table] section for longer ones.', i >= n ? start : i);
                fail(`Expected ',' or '}' in this inline table, but found ${found(s, i)}.`);
            }
        }

        /* ── Key / value pairs and tables ─────────────────────────────── */

        function keyValue(table, mode, depth) {
            const at = i;
            const keys = parseKey();
            ws();
            if (s.charCodeAt(i) !== 61) {
                fail(atEOL() ? `Expected '=' after the key ${named(keys)}.` : `Expected '=' after the key ${named(keys)}, but found ${found(s, i)}.`);
            }
            i++;
            ws();
            const v = value(depth);
            count();
            let t = table;
            for (let k = 0; k < keys.length - 1; k++) {
                const key = keys[k];
                if (!t.has(key)) {
                    const m = new Map();
                    kinds.set(m, mode === 'inline' ? 'inline' : 'dotted');
                    t.set(key, m);
                    count();
                    t = m;
                    continue;
                }
                const existing = t.get(key);
                const kind = existing instanceof Map ? kinds.get(existing) : null;
                if (kind === 'dotted' || (mode === 'inline' && kind === 'inline')) { t = existing; continue; }
                if (kind === 'implicit' && mode !== 'inline') { kinds.set(existing, 'dotted'); t = existing; continue; }
                if (kind === 'header') fail(`${named(keys.slice(0, k + 1))} was defined as a [table] earlier, so dotted keys can't add to it here.`, at);
                if (kind === 'inline') fail(`${named(keys.slice(0, k + 1))} is an { inline table }, which must be complete where it is written.`, at);
                fail(`The key ${named(keys.slice(0, k + 1))} already holds a value, so it can't also be a table.`, at);
            }
            const last = keys[keys.length - 1];
            if (t.has(last)) fail(`The key ${named(keys)} is defined more than once.`, at);
            t.set(last, v);
        }

        function header() {
            const at = i;
            const isArray = s.charCodeAt(i + 1) === 91;
            i += isArray ? 2 : 1;
            const keys = parseKey();
            ws();
            if (isArray) {
                if (!s.startsWith(']]', i)) fail(`Expected ']]' to close the [[${showPath(keys)}]] header.`);
                i += 2;
            } else {
                if (s.charCodeAt(i) !== 93) fail(`Expected ']' to close the [${showPath(keys)}] header.`);
                i++;
            }
            const name = showPath(keys);
            let t = root;
            for (let k = 0; k < keys.length - 1; k++) {
                const key = keys[k];
                if (!t.has(key)) {
                    const m = new Map();
                    kinds.set(m, 'implicit');
                    t.set(key, m);
                    count();
                    t = m;
                    continue;
                }
                const existing = t.get(key);
                if (existing instanceof Map) {
                    if (kinds.get(existing) === 'inline') fail(`[${name}] can't add to ${named(keys.slice(0, k + 1))} — it is an { inline table }, which must be complete where it is written.`, at);
                    t = existing;
                } else if (Array.isArray(existing) && tableArrays.has(existing)) {
                    t = existing[existing.length - 1];
                } else {
                    fail(`[${name}] can't be a table — ${named(keys.slice(0, k + 1))} already holds a value.`, at);
                }
            }
            const last = keys[keys.length - 1];
            if (isArray) {
                if (!t.has(last)) {
                    const list = [];
                    tableArrays.add(list);
                    t.set(last, list);
                }
                const list = t.get(last);
                if (!Array.isArray(list) || !tableArrays.has(list)) {
                    fail(Array.isArray(list)
                        ? `[[${name}]] can't add to ${name} — it is a fixed [array] written earlier.`
                        : `[[${name}]] can't be an array of tables — ${name} is already defined.`, at);
                }
                const table = new Map();
                kinds.set(table, 'header');
                list.push(table);
                count();
                current = table;
                return;
            }
            if (t.has(last)) {
                const existing = t.get(last);
                const kind = existing instanceof Map ? kinds.get(existing) : null;
                if (kind === 'implicit') {
                    kinds.set(existing, 'header');
                    current = existing;
                    return;
                }
                if (kind === 'header') fail(`The table [${name}] is defined more than once.`, at);
                if (kind === 'dotted') fail(`The table [${name}] was already made by dotted keys, so it can't get a [header] too.`, at);
                if (Array.isArray(existing) && tableArrays.has(existing)) fail(`[${name}] is already an array of tables — use [[${name}]] to add another entry.`, at);
                fail(`[${name}] can't be a table — ${name} already holds a value.`, at);
            }
            const table = new Map();
            kinds.set(table, 'header');
            t.set(last, table);
            count();
            current = table;
        }

        while (i < n) {
            ws();
            if (i >= n) break;
            const c = s.charCodeAt(i);
            if (c === 35) { comment(); continue; }
            if (atEOL()) { newline(); continue; }
            if (c === 13) fail('A carriage return must be followed by a line feed.');
            if (c === 91) header();
            else keyValue(current, 'top', 1);
            endOfLine();
        }
        return root;
    }

    /* ================================================================== */
    /* Writer                                                              */
    /* ================================================================== */

    const STRING_ESCAPES = new Map([['\\', '\\\\'], ['"', '\\"'], ['\b', '\\b'], ['\t', '\\t'], ['\n', '\\n'], ['\f', '\\f'], ['\r', '\\r']]);
    const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g;

    function writeTOML(value, opts) {
        const nativeDates = opts.nativeDates !== false;
        const sort = !!opts.sortKeys;
        const W = { nulls: 0, bigs: 0, surrogates: 0, other: 0, wrapped: false };
        const out = [];

        const isMap = (v) => v instanceof Map;
        const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Date);
        const asMap = (v) => (isPlain(v) ? new Map(Object.keys(v).map((k) => [k, v[k]])) : v);
        const isTable = (v) => isMap(asMap(v));

        function entries(m) {
            const list = Array.from(asMap(m).entries());
            if (sort) list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            return list;
        }

        function clean(str) {
            return str.replace(LONE_SURROGATE, (m, low) => {
                W.surrogates++;
                return low ? `${m.slice(0, m.length - 1)}\uFFFD` : '\uFFFD';
            });
        }

        function basic(str) {
            return `"${clean(str).replace(/[\\"\x00-\x1F\x7F]/g, (c) => STRING_ESCAPES.get(c) || `\\u${hex4(c.charCodeAt(0))}`)}"`;
        }

        function multiline(str) {
            let body = clean(str).replace(/[\\\x00-\x08\x0B-\x1F\x7F]/g, (c) => STRING_ESCAPES.get(c) || `\\u${hex4(c.charCodeAt(0))}`);
            body = body.replace(/"(?=")/g, '\\"').replace(/"$/, '\\"');
            return `"""\n${body}"""`;
        }

        const key = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : basic(String(k)));

        function scalar(v, inline) {
            switch (typeof v) {
                case 'boolean': return v ? 'true' : 'false';
                case 'number':
                    if (Number.isNaN(v)) return 'nan';
                    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
                    if (Number.isInteger(v) && !Number.isSafeInteger(v)) return v.toExponential();
                    return String(v);
                case 'bigint':
                    if (v > I64_MAX || v < I64_MIN) { W.bigs++; return basic(v.toString()); }
                    return v.toString();
                case 'string': {
                    if (nativeDates) {
                        const d = tomlDateText(v);
                        if (d) return d;
                    }
                    if (!inline && v.includes('\n')) return multiline(v);
                    return basic(v);
                }
                default:
                    if (v instanceof Date) return Number.isNaN(v.getTime()) ? '""' : (nativeDates ? v.toISOString() : basic(v.toISOString()));
                    W.other++;
                    return '""';
            }
        }

        function inlineValue(v, depth, inline) {
            if (depth > LIMITS.depth) throw plainError(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            if (Array.isArray(v)) {
                const items = [];
                for (const x of v) {
                    if (x === null || x === undefined) { W.nulls++; continue; }
                    items.push(inlineValue(x, depth + 1, true));
                }
                const one = `[${items.join(', ')}]`;
                if (inline || one.length <= 100 || !items.length) return one;
                return `[\n${items.map((x) => `    ${x},`).join('\n')}\n]`;
            }
            if (isTable(v)) {
                const parts = [];
                for (const [k, x] of entries(v)) {
                    if (x === null || x === undefined) { W.nulls++; continue; }
                    parts.push(`${key(k)} = ${inlineValue(x, depth + 1, true)}`);
                }
                return parts.length ? `{ ${parts.join(', ')} }` : '{}';
            }
            return scalar(v, inline);
        }

        const tableArray = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => isTable(x));

        function table(m, path, isElement, depth) {
            if (depth > LIMITS.depth) throw plainError(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            const simple = [];
            const tables = [];
            const arrays = [];
            for (const [k, v] of entries(m)) {
                if (v === null || v === undefined) { W.nulls++; continue; }
                if (isTable(v) && asMap(v).size > 0) tables.push([k, v]);
                else if (tableArray(v)) arrays.push([k, v]);
                else simple.push([k, v]);
            }
            const name = path.map(key).join('.');
            if (isElement || (path.length && (simple.length || (!tables.length && !arrays.length)))) {
                if (out.length) out.push('');
                out.push(isElement ? `[[${name}]]` : `[${name}]`);
            }
            for (const [k, v] of simple) out.push(`${key(k)} = ${inlineValue(v, depth + 1, false)}`);
            for (const [k, v] of tables) table(v, path.concat(String(k)), false, depth + 1);
            for (const [k, list] of arrays) {
                for (const el of list) table(el, path.concat(String(k)), true, depth + 1);
            }
        }

        let rootValue = asMap(value);
        if (!isMap(rootValue)) {
            rootValue = new Map([['data', value]]);
            W.wrapped = true;
        }
        table(rootValue, [], false, 0);

        const warnings = [];
        if (W.wrapped) warnings.push('TOML needs a table at the top, so the data was put under the key "data".');
        if (W.nulls) warnings.push(`TOML has no null — ${plural(W.nulls, 'null value')} ${W.nulls === 1 ? 'was' : 'were'} left out.`);
        if (W.bigs) warnings.push(`TOML integers must fit in 64 bits — ${plural(W.bigs, 'larger number')} ${W.bigs === 1 ? 'was' : 'were'} written as text.`);
        if (W.surrogates) warnings.push(`${plural(W.surrogates, 'broken character')} (half of an emoji or symbol) ${W.surrogates === 1 ? 'was' : 'were'} replaced with �.`);
        if (W.other) warnings.push(`${plural(W.other, 'value')} with no TOML form ${W.other === 1 ? 'was' : 'were'} written as empty text.`);
        return { text: out.length ? `${out.join('\n')}\n` : '', warnings };
    }

    /* ================================================================== */
    /* Detection                                                           */
    /* ================================================================== */

    const TOML_VALUE = /^(?:"|'|\[|\{|true\b|false\b|[+-]?(?:inf|nan)\b|[+-]?\d)/;

    function detectTOML(text) {
        if (typeof text !== 'string' || !text) return 0;
        let h = text.slice(0, DETECT_CHARS).replace(/^\uFEFF/, '');
        if (text.length > DETECT_CHARS && h.lastIndexOf('\n') > 0) h = h.slice(0, h.lastIndexOf('\n'));
        const lines = h.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').slice(0, 80);
        if (!lines.length) return 0;
        let headers = 0;
        let arrays = 0;
        let typed = 0;
        let untyped = 0;
        let envLike = 0;
        let other = 0;
        for (const l of lines) {
            if (/^\[\[?\s*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*'))*\s*\]\]?\s*(?:#.*)?$/.test(l)) {
                headers++;
                if (l.startsWith('[[')) arrays++;
                continue;
            }
            const m = /^((?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*'))*)(\s*)=(\s*)(.*)$/.exec(l);
            if (m) {
                if (TOML_VALUE.test(m[4])) typed++;
                else untyped++;
                if (/^[A-Z_][A-Z0-9_]*$/.test(m[1]) && !m[2] && !m[3]) envLike++;
                continue;
            }
            if (/^(?:["'\]}\d-]|true|false)/.test(l)) continue;
            other++;
        }
        const pairs = typed + untyped;
        if (!pairs) return headers ? 0.3 : 0;
        if (other / lines.length > 0.2) return 0.05;
        if (untyped) return 0.15;
        if (envLike === pairs) return 0.5;
        if (arrays) return 0.9;
        return headers ? 0.85 : 0.8;
    }

    /* ================================================================== */
    /* Module                                                              */
    /* ================================================================== */

    const SAMPLE = [
        '# Build settings for a small web app',
        'name = "lantern"',
        'version = "0.9.2"',
        'private = true',
        'released = 2026-11-02',
        '',
        '[server]',
        'host = "0.0.0.0"',
        'port = 8080',
        'timeout = 2.5',
        'allowed_origins = ["https://lantern.example", "http://localhost:3000"]',
        '',
        '[database]',
        'url = "postgres://db.internal:5432/lantern"',
        'pool = { min = 2, max = 10 }',
        '',
        '[[workers]]',
        'name = "thumbnails"',
        'concurrency = 4',
        '',
        '[[workers]]',
        'name = "emails"',
        'concurrency = 1',
        'retry_after = 00:05:00',
        ''
    ].join('\n');

    const toml = {
        id: 'toml',
        label: 'TOML',
        extensions: ['toml'],
        mime: 'application/toml',
        kind: 'tree',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectTOML(text); } catch (e) { return 0; }
        },
        parse(text) {
            if (typeof text !== 'string') throw plainError('There is no text to read.');
            if (text.length > LIMITS.inputChars) {
                throw plainError(`This text is ${(text.length / 1048576).toFixed(1)} MB — larger than 20 MB, the most convertMan reads at a time.`);
            }
            return { value: readTOML(text), warnings: [] };
        },
        stringify(value, opts) {
            return writeTOML(value, opts || {});
        },
        inputOptions: [],
        outputOptions: [
            {
                key: 'nativeDates', label: 'Write ISO dates as TOML dates', type: 'checkbox', default: true,
                help: 'Text such as 2026-11-18 or 2026-11-18T09:30:00Z is written as a TOML date instead of a quoted string.'
            },
            {
                key: 'sortKeys', label: 'Sort keys', type: 'checkbox', default: false,
                help: 'Write the keys of every table in A–Z order instead of their original order.'
            }
        ],
        sample: SAMPLE,
        notes: 'TOML holds tables of keys with text, numbers, true / false, dates, arrays and inline tables. It has no null (null values are left out), the top level must be a table, and whole numbers must fit in 64 bits.'
    };

    return { toml };
});
