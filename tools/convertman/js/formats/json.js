/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: JsonFormat (convertMan Edition - v1.0)
 *     - File Name: json.js
 *     - Relative Path: tools/convertman/js/formats/json.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The JSON and JSON Lines formats for convertMan: a hand-written reader
 *     that reports the line and column of every mistake, and a writer with
 *     indent, key-sorting and ASCII-only choices. Both speak convertMan's
 *     data model (Map for objects, BigInt for whole numbers beyond 2^53), so
 *     keys such as "__proto__" are ordinary data and big IDs keep every digit.
 *
 * ✒ Key Features:
 *     - Strict RFC 8259 reading by default, with plain-language errors that
 *       say what was expected and where ("expected ',' or '}' after a value")
 *     - Relaxed mode: // and block comments, trailing commas, single-quoted
 *       strings and unquoted keys, as config files often use
 *     - Whole numbers outside ±2^53 become BigInt and are written back
 *       digit for digit (12345678901234567890 stays exact)
 *     - Objects become Map, so "__proto__", "constructor" and "prototype"
 *       are plain keys and no prototype is ever touched
 *     - Duplicate keys: the last value wins and a warning names the first
 *       duplicate and its line
 *     - Caps: 20 MB of text, nesting 512 levels, 2,000,000 values; the
 *       depth cap stops runaway nesting long before the call stack would
 *     - Writer: 2 / 4 spaces, tab or minified; optional sorted keys and
 *       \uXXXX escapes for everything outside ASCII
 *     - Non-finite numbers (NaN, Infinity) are written as null with a warning
 *     - JSON Lines: one value per line, blank lines skipped, errors name the
 *       line; a list is written one item per line
 *     - detect(): cheap scoring of the first 4 KB that tells JSON from JSON
 *       Lines and from [section] headers in INI / TOML
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the modules register themselves on
 *     window.ConvertFormats as "json" and "jsonl". Node:
 *         const { json, jsonl } = require('./formats/json.js');
 *     parse(text, opts) returns { value, warnings } and throws an Error with
 *     line, column, offset, reason and format fields on bad input.
 *     stringify(value, opts) returns { text, warnings }.
 *
 * ✒ Examples:
 *     json.parse('{"a": [1, 2]}').value              → Map { 'a' → [1, 2] }
 *     json.parse('{"id": 12345678901234567890}').value.get('id') → 12345678901234567890n
 *     json.parse('{"a": 1 "b": 2}')                  → throws "Line 1, column 9: expected ',' or '}' after a value, but found '"'."
 *     json.parse('{a: 1, // note\n}', { relaxed: true }).value → Map { 'a' → 1 }
 *     json.stringify(new Map([['b', 1], ['a', 2]]), { sortKeys: true, indent: 'min' }).text → '{"a":2,"b":1}'
 *     json.stringify(new Map([['ü', 'é']]), { escapeNonAscii: true, indent: 'min' }).text → '{"ü":"é"}'
 *     jsonl.parse('{"a":1}\n\n{"a":2}\n').value      → [Map { a → 1 }, Map { a → 2 }]
 *     jsonl.stringify([1, 'two', null]).text          → '1\n"two"\nnull\n'
 *     json.detect('{"a": 1}')                         → 1
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (pure; no DOM; safe in Node 16+ and the browser)
 *     - Compatible platforms: all evergreen browsers (BigInt, Map)
 *     - Security: no string is ever run as code; every loop is bounded by
 *       the text length and the depth / value caps
 *     - Limitations: columns count UTF-16 code units; relaxed mode does not
 *       accept hex numbers, NaN or Infinity; keys are compared exactly
 *       (no Unicode normalisation)
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

    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const lowerFirst = (s) => (/^(?:[A-Z][a-z]|An? )/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
    const hex4 = (code) => code.toString(16).toUpperCase().padStart(4, '0');

    /** 1-based line and column of a 0-based offset. */
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

    /** A positioned, plain-language parse error. */
    function positioned(text, offset, reason, format) {
        const p = locate(text, offset);
        const err = new Error(`Line ${p.line}, column ${p.column}: ${lowerFirst(reason)}`);
        err.reason = reason;
        err.line = p.line;
        err.column = p.column;
        err.offset = p.offset;
        err.format = format;
        return err;
    }

    function plainError(message, format) {
        const err = new Error(message);
        err.format = format;
        return err;
    }

    /** How to name the character at i in an error message. */
    function found(s, i) {
        if (i >= s.length) return 'the end of the text';
        const cp = s.codePointAt(i);
        if (cp === 10 || cp === 13) return 'a line break';
        if (cp === 9) return 'a tab';
        if (cp < 0x20 || cp === 0x7f) return `the control character U+${hex4(cp)}`;
        return `'${String.fromCodePoint(cp)}'`;
    }

    function checkSize(text, format) {
        if (typeof text !== 'string') throw plainError('There is no text to read.', format);
        if (text.length > LIMITS.inputChars) {
            throw plainError(`This text is ${(text.length / 1048576).toFixed(1)} MB — larger than 20 MB, the most convertMan reads at a time.`, format);
        }
    }

    /* ================================================================== */
    /* Reader                                                              */
    /* ================================================================== */

    const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const IDENT = /[A-Za-z_$][\w$]*/y;
    const WORD = /[A-Za-z_$][\w$]*/y;

    /**
     * Read one JSON text. Returns { value, dupes: { count, first, at } }.
     * Throws a positioned Error.
     */
    function readJSON(s, relaxed, format) {
        const n = s.length;
        let i = s.charCodeAt(0) === 0xFEFF ? 1 : 0;
        let depth = 0;
        let nodes = 0;
        const dupes = { count: 0, first: null, at: 0 };
        const fail = (reason, at) => { throw positioned(s, at === undefined ? i : at, reason, format); };

        function ws() {
            for (;;) {
                const c = s.charCodeAt(i);
                if (c === 32 || c === 10 || c === 13 || c === 9) { i++; continue; }
                if (c === 47 && relaxed) {
                    const d = s.charCodeAt(i + 1);
                    if (d === 47) {
                        i += 2;
                        while (i < n) {
                            const e = s.charCodeAt(i);
                            if (e === 10 || e === 13) break;
                            i++;
                        }
                        continue;
                    }
                    if (d === 42) {
                        const end = s.indexOf('*/', i + 2);
                        if (end === -1) fail('This /* comment is never closed — add */ to end it.');
                        i = end + 2;
                        continue;
                    }
                }
                if (c === 47) {
                    const d = s.charCodeAt(i + 1);
                    if (d === 47 || d === 42) fail('JSON has no comments — remove it, or turn on Relaxed to allow comments.');
                }
                return;
            }
        }

        function value() {
            if (++nodes > LIMITS.nodes) fail(`The data has more than ${commas(LIMITS.nodes)} values — convertMan stops there to stay responsive.`);
            const c = s.charCodeAt(i);
            if (c === 123) return object();
            if (c === 91) return array();
            if (c === 34 || (relaxed && c === 39)) return string();
            if (c === 45 || (c >= 48 && c <= 57)) return number();
            if (i >= n) fail('The text ended where a value was expected.');
            if (c === 39) fail("JSON strings use double quotes — change ' to \" (or turn on Relaxed).");
            WORD.lastIndex = i;
            if (WORD.test(s)) {
                const word = s.slice(i, WORD.lastIndex);
                if (word === 'true') { i += 4; return true; }
                if (word === 'false') { i += 5; return false; }
                if (word === 'null') { i += 4; return null; }
                fail(`Unknown word '${word.length > 40 ? `${word.slice(0, 40)}…` : word}' — JSON knows only true, false and null, and text must be in double quotes.`);
            }
            return fail(`Expected a value (a string, number, object, array, true, false or null), but found ${found(s, i)}.`);
        }

        function number() {
            const start = i;
            NUMBER.lastIndex = i;
            const m = NUMBER.exec(s);
            if (!m) fail("Expected a digit after '-'.", i + 1);
            const text = m[0];
            const end = i + text.length;
            const next = s.charCodeAt(end);
            if (next >= 48 && next <= 57) fail("Numbers can't start with 0 in JSON (write 7, not 07).", start);
            if (next === 46) {
                fail(/[.eE]/.test(text) ? `Unexpected '.' after the number ${text}.` : 'Expected a digit after the decimal point.', end + 1);
            }
            if (next === 101 || next === 69) fail("Expected a digit after the exponent 'e'.", end + 1);
            if ((next >= 65 && next <= 90) || (next >= 97 && next <= 122) || next === 95) {
                fail(`Unexpected ${found(s, end)} right after the number ${text}.`, end);
            }
            i = end;
            if (text.length > 15 && !/[.eE]/.test(text)) {
                const v = Number(text);
                if (!Number.isSafeInteger(v)) return BigInt(text);
                return v;
            }
            return Number(text);
        }

        function string() {
            const quote = s.charCodeAt(i);
            const start = i;
            i++;
            let out = '';
            let chunk = i;
            for (;;) {
                if (i >= n) fail(`This string is never closed — expected a closing ${quote === 34 ? '"' : "'"}.`, start);
                const c = s.charCodeAt(i);
                if (c === quote) {
                    out += s.slice(chunk, i);
                    i++;
                    return out;
                }
                if (c === 92) {
                    out += s.slice(chunk, i);
                    const e = s.charCodeAt(i + 1);
                    if (e === 117) {
                        const hex = s.slice(i + 2, i + 6);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Expected four hex digits after \\u.', i);
                        out += String.fromCharCode(parseInt(hex, 16));
                        i += 6;
                        chunk = i;
                        continue;
                    }
                    switch (e) {
                        case 34: out += '"'; break;
                        case 92: out += '\\'; break;
                        case 47: out += '/'; break;
                        case 98: out += '\b'; break;
                        case 102: out += '\f'; break;
                        case 110: out += '\n'; break;
                        case 114: out += '\r'; break;
                        case 116: out += '\t'; break;
                        default:
                            if (relaxed && e === 39) { out += "'"; break; }
                            if (i + 1 >= n) fail('This string is never closed — expected a closing quote.', start);
                            fail(`Unknown escape '\\${String.fromCodePoint(s.codePointAt(i + 1))}' — JSON allows \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.`);
                    }
                    i += 2;
                    chunk = i;
                    continue;
                }
                if (c < 32) {
                    if (c === 10 || c === 13) fail(`A string can't contain a line break — close it with ${quote === 34 ? '"' : "'"} or write \\n.`);
                    if (!(relaxed && c === 9)) {
                        fail(c === 9 ? 'A string can\'t contain a raw tab — write it as \\t.'
                            : `A string can't contain the control character U+${hex4(c)} — write it as \\u${hex4(c)}.`);
                    }
                }
                i++;
            }
        }

        function key() {
            const c = s.charCodeAt(i);
            if (c === 34 || (relaxed && c === 39)) return string();
            if (relaxed) {
                IDENT.lastIndex = i;
                if (IDENT.test(s)) {
                    const k = s.slice(i, IDENT.lastIndex);
                    i = IDENT.lastIndex;
                    return k;
                }
            }
            if (i >= n) fail("The text ended inside an object — expected a property name or '}'.");
            if (c === 39) fail("Property names use double quotes in JSON — change ' to \" (or turn on Relaxed).");
            IDENT.lastIndex = i;
            if (IDENT.test(s)) fail('Property names must be in double quotes in JSON (or turn on Relaxed for unquoted keys).');
            return fail(`Expected a property name in double quotes, but found ${found(s, i)}.`);
        }

        function enter() {
            if (++depth > LIMITS.depth) {
                fail(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            }
        }

        function object() {
            enter();
            i++;
            const map = new Map();
            ws();
            if (s.charCodeAt(i) === 125) { i++; depth--; return map; }
            for (;;) {
                const keyAt = i;
                const k = key();
                ws();
                if (s.charCodeAt(i) !== 58) {
                    fail(i >= n ? "The text ended after a property name — expected ':'." : `Expected ':' after the property name, but found ${found(s, i)}.`);
                }
                i++;
                ws();
                const v = value();
                if (map.has(k)) {
                    dupes.count++;
                    if (dupes.first === null) { dupes.first = k; dupes.at = keyAt; }
                }
                map.set(k, v);
                ws();
                const d = s.charCodeAt(i);
                if (d === 44) {
                    const commaAt = i;
                    i++;
                    ws();
                    if (s.charCodeAt(i) === 125) {
                        if (!relaxed) fail("Trailing commas aren't allowed in JSON — remove the ',' before '}' (or turn on Relaxed).", commaAt);
                        i++;
                        depth--;
                        return map;
                    }
                    continue;
                }
                if (d === 125) { i++; depth--; return map; }
                if (i >= n) fail("The text ended inside an object — expected ',' or '}'.");
                fail(`Expected ',' or '}' after a value, but found ${found(s, i)}.`);
            }
        }

        function array() {
            enter();
            i++;
            const list = [];
            ws();
            if (s.charCodeAt(i) === 93) { i++; depth--; return list; }
            for (;;) {
                if (s.charCodeAt(i) === 44) fail("Expected a value before ',' — an array can't have empty slots.");
                list.push(value());
                ws();
                const d = s.charCodeAt(i);
                if (d === 44) {
                    const commaAt = i;
                    i++;
                    ws();
                    if (s.charCodeAt(i) === 93) {
                        if (!relaxed) fail("Trailing commas aren't allowed in JSON — remove the ',' before ']' (or turn on Relaxed).", commaAt);
                        i++;
                        depth--;
                        return list;
                    }
                    continue;
                }
                if (d === 93) { i++; depth--; return list; }
                if (i >= n) fail("The text ended inside an array — expected ',' or ']'.");
                fail(`Expected ',' or ']' after a value, but found ${found(s, i)}.`);
            }
        }

        ws();
        if (i >= n) fail('There is no JSON value here — the text is empty.');
        const result = value();
        ws();
        if (i < n) {
            const multi = /[\r\n]\s*$/.test(s.slice(Math.max(0, i - 200), i)) && (s[i] === '{' || s[i] === '[');
            fail(`Expected the end of the JSON after the value, but found ${found(s, i)}${multi ? ' — if there is one value per line, choose JSON Lines' : ''}.`);
        }
        return { value: result, dupes };
    }

    function dupeWarning(text, dupes) {
        if (!dupes.count) return null;
        const where = locate(text, dupes.at).line;
        const name = String(dupes.first).length > 40 ? `${String(dupes.first).slice(0, 40)}…` : dupes.first;
        return dupes.count === 1
            ? `1 duplicate key was found ("${name}" on line ${where}); the last value was kept.`
            : `${commas(dupes.count)} duplicate keys were found (the first is "${name}" on line ${where}); the last value of each was kept.`;
    }

    /* ================================================================== */
    /* Writer                                                              */
    /* ================================================================== */

    const GAPS = { 2: '  ', 4: '    ', tab: '\t', min: '' };

    function quote(str, ascii) {
        const q = JSON.stringify(str);
        return ascii ? q.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) : q;
    }

    function formatNumber(v, counts) {
        if (!Number.isFinite(v)) { counts.nonFinite++; return 'null'; }
        if (Number.isInteger(v) && !Number.isSafeInteger(v)) return v.toExponential();
        return String(v);
    }

    /** Entries of a Map (or, defensively, of a plain object). */
    function entriesOf(v, sort) {
        const list = v instanceof Map ? Array.from(v.entries()) : Object.keys(v).map((k) => [k, v[k]]);
        if (sort) list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        return list;
    }

    function writeJSON(value, opts, format) {
        const gap = GAPS[String(opts.indent)] !== undefined ? GAPS[String(opts.indent)] : '  ';
        const ascii = !!opts.escapeNonAscii;
        const sort = !!opts.sortKeys;
        const counts = { nonFinite: 0, dropped: 0 };
        const colon = gap ? ': ' : ':';

        function write(v, indent, depth) {
            if (v === null || v === undefined) return 'null';
            switch (typeof v) {
                case 'boolean': return v ? 'true' : 'false';
                case 'number': return formatNumber(v, counts);
                case 'bigint': return v.toString();
                case 'string': return quote(v, ascii);
                case 'object': break;
                default: counts.dropped++; return 'null';
            }
            if (depth >= LIMITS.depth) throw plainError(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`, format);
            if (v instanceof Date) return quote(Number.isNaN(v.getTime()) ? '' : v.toISOString(), ascii);
            const inner = indent + gap;
            if (Array.isArray(v)) {
                if (!v.length) return '[]';
                const parts = new Array(v.length);
                for (let k = 0; k < v.length; k++) parts[k] = write(v[k], inner, depth + 1);
                return gap ? `[\n${inner}${parts.join(`,\n${inner}`)}\n${indent}]` : `[${parts.join(',')}]`;
            }
            const list = entriesOf(v, sort);
            if (!list.length) return '{}';
            const parts = list.map(([k, x]) => `${quote(String(k), ascii)}${colon}${write(x, inner, depth + 1)}`);
            return gap ? `{\n${inner}${parts.join(`,\n${inner}`)}\n${indent}}` : `{${parts.join(',')}}`;
        }

        const text = write(value, '', 0);
        const warnings = [];
        if (counts.nonFinite) {
            warnings.push(`JSON has no NaN or Infinity — ${plural(counts.nonFinite, 'value')} ${counts.nonFinite === 1 ? 'was' : 'were'} written as null.`);
        }
        if (counts.dropped) warnings.push(`${plural(counts.dropped, 'value')} with no JSON form ${counts.dropped === 1 ? 'was' : 'were'} written as null.`);
        return { text, warnings };
    }

    /* ================================================================== */
    /* Detection                                                           */
    /* ================================================================== */

    function head(text) {
        if (typeof text !== 'string' || !text) return '';
        return text.slice(0, DETECT_CHARS).replace(/^﻿/, '').replace(/^\s+/, '');
    }

    /** Non-empty lines of the first 4 KB (the last may be cut short). */
    function headLines(text) {
        const h = head(text);
        const lines = h.split(/\r\n|\n|\r/).map((l) => l.trim()).filter(Boolean);
        if (text.length > DETECT_CHARS && lines.length > 1) lines.pop();
        return lines;
    }

    function looksLikeLines(text) {
        const lines = headLines(text);
        if (lines.length < 2) return false;
        const shaped = lines.every((l) => (/^[{[]/.test(l) && /[}\]]$/.test(l)) || /^(?:"|-?\d|true$|false$|null$)/.test(l));
        if (!shaped) return false;
        try { readJSON(lines[0], false, 'jsonl'); return true; } catch (e) { return false; }
    }

    function detectJSON(text) {
        const h = head(text);
        if (!h) return 0;
        const c = h[0];
        if (c === '{' || c === '[') {
            if (c === '[' && !/^\[\s*(?:["\d\-[{\]]|true\b|false\b|null\b|$)/.test(h)) return 0.05;
            if (looksLikeLines(text)) return 0.3;
            if (text.length <= DETECT_CHARS) {
                try { readJSON(text, false, 'json'); return 1; } catch (e) { /* try relaxed */ }
                try { readJSON(text, true, 'json'); return 0.85; } catch (e) { return 0.6; }
            }
            return /^[{[]\s*(?:"|[{[\]}]|-?\d)/.test(h) ? 0.9 : 0.7;
        }
        if (text.length <= DETECT_CHARS && (c === '"' || c === '-' || /\d/.test(c) || /^(?:true|false|null)\s*$/.test(h))) {
            try { readJSON(text, false, 'json'); return 0.5; } catch (e) { return 0; }
        }
        return 0;
    }

    function detectLines(text) {
        return looksLikeLines(text) ? 0.95 : 0;
    }

    /* ================================================================== */
    /* JSON Lines                                                          */
    /* ================================================================== */

    function readLines(text, relaxed) {
        const out = [];
        const warnings = [];
        let dupeTotal = 0;
        let firstDupe = null;
        let start = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
        let lineNo = 1;
        let nodes = 0;
        while (start <= text.length) {
            let end = text.indexOf('\n', start);
            if (end === -1) end = text.length;
            let line = text.slice(start, end);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.trim()) {
                let res;
                try {
                    res = readJSON(line, relaxed, 'jsonl');
                } catch (e) {
                    const col = e.column || 1;
                    const err = new Error(`Line ${lineNo}, column ${col}: line ${lineNo} is not valid JSON — ${lowerFirst(e.reason || e.message)}`);
                    err.reason = `Line ${lineNo} is not valid JSON — ${lowerFirst(e.reason || e.message)}`;
                    err.line = lineNo;
                    err.column = col;
                    err.offset = start + (e.offset || 0);
                    err.format = 'jsonl';
                    throw err;
                }
                if (res.dupes.count) {
                    dupeTotal += res.dupes.count;
                    if (!firstDupe) firstDupe = { name: res.dupes.first, line: lineNo };
                }
                nodes += 1;
                if (nodes > LIMITS.nodes) throw plainError(`This file has more than ${commas(LIMITS.nodes)} lines of data — convertMan stops there to stay responsive.`, 'jsonl');
                out.push(res.value);
            }
            start = end + 1;
            lineNo++;
        }
        if (dupeTotal) {
            warnings.push(dupeTotal === 1
                ? `1 duplicate key was found ("${firstDupe.name}" on line ${firstDupe.line}); the last value was kept.`
                : `${commas(dupeTotal)} duplicate keys were found (the first is "${firstDupe.name}" on line ${firstDupe.line}); the last value of each was kept.`);
        }
        return { value: out, warnings };
    }

    function writeLines(value, opts) {
        const o = { indent: 'min', sortKeys: !!opts.sortKeys, escapeNonAscii: !!opts.escapeNonAscii };
        const warnings = [];
        if (!Array.isArray(value)) {
            const one = writeJSON(value, o, 'jsonl');
            warnings.push('JSON Lines writes one value per line; this data is a single value, so it is one line.');
            return { text: `${one.text}\n`, warnings: warnings.concat(one.warnings) };
        }
        const seen = new Set();
        const lines = value.map((item) => {
            const r = writeJSON(item, o, 'jsonl');
            r.warnings.forEach((w) => seen.add(w));
            return r.text;
        });
        return { text: lines.length ? `${lines.join('\n')}\n` : '', warnings: warnings.concat(Array.from(seen)) };
    }

    /* ================================================================== */
    /* Modules                                                             */
    /* ================================================================== */

    const RELAXED_OPTION = {
        key: 'relaxed',
        label: 'Relaxed (comments, trailing commas, single quotes, unquoted keys)',
        type: 'checkbox',
        default: false,
        help: 'Accept the looser JSON many config files use: // and /* */ comments, a comma after the last item, \'single-quoted\' strings and unquoted keys.'
    };
    const SORT_OPTION = {
        key: 'sortKeys', label: 'Sort keys', type: 'checkbox', default: false,
        help: 'Write the keys of every object in A–Z order instead of their original order.'
    };
    const ASCII_OPTION = {
        key: 'escapeNonAscii', label: 'Escape non-ASCII', type: 'checkbox', default: false,
        help: 'Write every character outside plain ASCII as \\uXXXX, for systems that mangle UTF-8.'
    };

    const JSON_SAMPLE = [
        '{',
        '  "name": "Harbor Lights Café",',
        '  "open": true,',
        '  "rating": 4.6,',
        '  "founded": 1998,',
        '  "tags": ["coffee", "bakery", "wifi"],',
        '  "address": {',
        '    "street": "12 Wharf Road",',
        '    "city": "Portsmouth",',
        '    "postcode": "PO1 3AB"',
        '  },',
        '  "hours": [',
        '    { "days": "Mon–Fri", "open": "07:00", "close": "18:00" },',
        '    { "days": "Sat–Sun", "open": "08:00", "close": "16:00" }',
        '  ],',
        '  "website": null',
        '}',
        ''
    ].join('\n');

    const JSONL_SAMPLE = [
        '{"time": "2026-11-18T09:15:02Z", "level": "info", "user": 1042, "message": "Signed in"}',
        '{"time": "2026-11-18T09:16:40Z", "level": "warn", "user": 1042, "message": "Password expires in 3 days"}',
        '{"time": "2026-11-18T09:20:11Z", "level": "error", "user": 2210, "message": "Upload failed", "retry": true}',
        ''
    ].join('\n');

    const json = {
        id: 'json',
        label: 'JSON',
        extensions: ['json', 'jsonc', 'geojson', 'webmanifest'],
        mime: 'application/json',
        kind: 'tree',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectJSON(text); } catch (e) { return 0; }
        },
        parse(text, opts) {
            checkSize(text, 'json');
            const o = opts || {};
            const res = readJSON(text, !!o.relaxed, 'json');
            const warnings = [];
            const dupe = dupeWarning(text, res.dupes);
            if (dupe) warnings.push(dupe);
            return { value: res.value, warnings };
        },
        stringify(value, opts) {
            const res = writeJSON(value, opts || {}, 'json');
            return { text: `${res.text}\n`, warnings: res.warnings };
        },
        inputOptions: [RELAXED_OPTION],
        outputOptions: [
            {
                key: 'indent', label: 'Indent', type: 'select', default: '2',
                choices: [
                    { value: '2', label: '2 spaces' },
                    { value: '4', label: '4 spaces' },
                    { value: 'tab', label: 'Tab' },
                    { value: 'min', label: 'Minified (one line)' }
                ],
                help: 'How far each level of nesting is indented; Minified writes everything on one line.'
            },
            SORT_OPTION,
            ASCII_OPTION
        ],
        sample: JSON_SAMPLE,
        notes: 'JSON holds objects, arrays, text, numbers, true / false and null, so every other format\'s data fits; comments, YAML anchors and TOML date types are lost (dates become plain text).'
    };

    const jsonl = {
        id: 'jsonl',
        label: 'JSON Lines',
        extensions: ['jsonl', 'ndjson'],
        mime: 'application/jsonl',
        kind: 'tree',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectLines(text); } catch (e) { return 0; }
        },
        parse(text, opts) {
            checkSize(text, 'jsonl');
            return readLines(text, !!(opts && opts.relaxed));
        },
        stringify(value, opts) {
            return writeLines(value, opts || {});
        },
        inputOptions: [RELAXED_OPTION],
        outputOptions: [SORT_OPTION, ASCII_OPTION],
        sample: JSONL_SAMPLE,
        notes: 'One JSON value per line, common for logs and data exports; it reads as a list. Converting into it writes each item of a top-level list on its own line, and anything else as a single line.'
    };

    return { json, jsonl };
});
