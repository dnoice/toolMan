/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: YamlFormat (convertMan Edition - v1.0)
 *     - File Name: yaml.js
 *     - Relative Path: tools/convertman/js/formats/yaml.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The YAML format for convertMan: a hand-written YAML 1.2 reader (core
 *     schema) and a block-style writer. It is used whenever a visitor reads
 *     or writes YAML, so config files, CI pipelines and Kubernetes manifests
 *     convert to and from every other format without a library. The writer
 *     quotes every string another YAML reader might misread.
 *
 * ✒ Key Features:
 *     - Block and flow collections, explicit "? " keys, compact nested lists
 *     - Every scalar style: plain, 'single', "double" (all escapes), literal
 *       | and folded > blocks with keep / strip chomping and indent numbers
 *     - Comments, directives (%YAML, %TAG), several documents (first only,
 *       or all as a list), --- and ... markers
 *     - Anchors, aliases and merge keys (<<), with a 100,000-value cap on
 *       alias expansion so a "billion laughs" document is refused at once
 *     - Core-schema typing: null, true / false, decimal / 0o / 0x integers
 *       (BigInt past 2^53), floats, .inf and .nan; leading-zero numbers
 *       (0755) are read as decimal with a warning
 *     - Tags !!str !!int !!float !!bool !!null !!map !!seq honoured; any
 *       other tag is ignored with a warning
 *     - Mappings become Map, so "__proto__" and "constructor" are plain keys;
 *       duplicate keys keep the last value and are reported
 *     - Errors name the line and column and say what was expected
 *     - Caps: 20 MB of text, nesting 512 levels, 2,000,000 values
 *     - Writer: block style with 2- or 4-space indent, literal blocks for
 *       multi-line text, {} and [] for empty collections, quotes for YAML
 *       1.1 booleans (yes / no / on / off), null-likes, number-likes,
 *       leading or trailing spaces, ': ', ' #', and indicator characters
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the module registers itself on
 *     window.ConvertFormats as "yaml". Node:
 *         const { yaml } = require('./formats/yaml.js');
 *     parse(text, { documents: 'first' | 'all' }) returns { value, warnings }
 *     and throws an Error with line, column, offset, reason and format on
 *     bad input. stringify(value, { indent: '2' | '4', sortKeys, docStart })
 *     returns { text, warnings }.
 *
 * ✒ Examples:
 *     yaml.parse('a: 1\nb: [x, y]').value               → Map { a → 1, b → ['x', 'y'] }
 *     yaml.parse('text: |\n  one\n  two\n').value.get('text') → 'one\ntwo\n'
 *     yaml.parse('base: &b {x: 1}\nuse:\n  <<: *b\n  y: 2').value.get('use') → Map { x → 1, y → 2 }
 *     yaml.parse('---\na: 1\n---\na: 2', { documents: 'all' }).value → [Map { a → 1 }, Map { a → 2 }]
 *     yaml.parse('a: [1, 2')                             → throws "Line 1, column 4: this [ is never closed — expected ']'."
 *     yaml.stringify(new Map([['answer', 'yes']])).text → "answer: 'yes'\n"
 *     yaml.stringify(['a', new Map([['b', 1]])]).text   → "- a\n- b: 1\n"
 *     yaml.stringify(new Map([['poem', 'line 1\nline 2']])).text → 'poem: |-\n  line 1\n  line 2\n'
 *     yaml.detect('name: app\nport: 8080')               → 0.8
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (pure; no DOM; safe in Node 16+ and the browser)
 *     - Compatible platforms: all evergreen browsers (BigInt, Map, sticky
 *       regular expressions)
 *     - Security: no string is ever run as code; aliases share the anchored
 *       value instead of copying it, an alias can never point into its own
 *       node (no cycles), and expansion, depth and value counts are capped
 *     - Limitations: comments and anchors are not kept; tags other than the
 *       core ones are ignored; mapping keys become text (lists or maps used
 *       as keys are written as JSON text, with a warning); dates stay text;
 *       the writer never emits anchors or flow style for non-empty values
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

    const LIMITS = Object.freeze({ inputChars: 20 * 1024 * 1024, depth: 512, nodes: 2000000, aliasNodes: 100000 });
    const DETECT_CHARS = 4096;
    const CORE = 'tag:yaml.org,2002:';

    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const lowerFirst = (s) => (/^(?:[A-Z][a-z]|An? )/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
    const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));
    const hex4 = (code) => code.toString(16).toUpperCase().padStart(4, '0');

    const isEOL = (c) => c === 10 || c === 13;
    const isWS = (c) => c === 32 || c === 9;
    const isWsOrEol = (c) => c === 32 || c === 9 || c === 10 || c === 13;
    const isFlowIndicator = (c) => c === 44 || c === 91 || c === 93 || c === 123 || c === 125;

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
        err.format = 'yaml';
        return err;
    }

    function plainError(message) {
        const err = new Error(message);
        err.format = 'yaml';
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

    /* Core-schema patterns (YAML 1.2). */
    const NULL_RE = /^(?:~|null|Null|NULL)?$/;
    const TRUE_RE = /^(?:true|True|TRUE)$/;
    const FALSE_RE = /^(?:false|False|FALSE)$/;
    const INT_DEC = /^[-+]?[0-9]+$/;
    const INT_OCT = /^0o[0-7]+$/;
    const INT_HEX = /^0x[0-9a-fA-F]+$/;
    const FLOAT_RE = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
    const INF_RE = /^[-+]?\.(?:inf|Inf|INF)$/;
    const NAN_RE = /^\.(?:nan|NaN|NAN)$/;

    function intOf(text) {
        if (INT_OCT.test(text) || INT_HEX.test(text)) {
            const big = BigInt(text);
            return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
        }
        const v = Number(text);
        return Number.isSafeInteger(v) ? v : BigInt(text);
    }

    function floatOf(text) {
        if (INF_RE.test(text)) return text[0] === '-' ? -Infinity : Infinity;
        if (NAN_RE.test(text)) return NaN;
        return Number(text);
    }

    /** Resolve an untagged plain scalar. `note` collects leading-zero numbers. */
    function resolvePlain(text, note) {
        if (!text) return null;
        const c = text.charCodeAt(0);
        // Fast exit: only ~, letters n/N/t/T/f/F, digits, signs and '.' can start a non-string.
        if (!(c === 126 || c === 110 || c === 78 || c === 116 || c === 84 || c === 102 || c === 70
            || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46)) return text;
        if (NULL_RE.test(text)) return null;
        if (TRUE_RE.test(text)) return true;
        if (FALSE_RE.test(text)) return false;
        if (INT_DEC.test(text)) {
            if (note && /^[-+]?0[0-9]/.test(text)) note(text);
            return intOf(text);
        }
        if (INT_OCT.test(text) || INT_HEX.test(text)) return intOf(text);
        if (FLOAT_RE.test(text) || INF_RE.test(text) || NAN_RE.test(text)) return floatOf(text);
        return text;
    }

    /* Escapes in double-quoted scalars. */
    const ESCAPES = new Map([
        [48, '\0'], [97, '\x07'], [98, '\b'], [116, '\t'], [9, '\t'], [110, '\n'], [118, '\v'], [102, '\f'],
        [114, '\r'], [101, '\x1b'], [32, ' '], [34, '"'], [47, '/'], [92, '\\'], [78, '\x85'], [95, '\xa0'],
        [76, ' '], [80, ' ']
    ]);
    const HEX_ESCAPES = new Map([[120, 2], [117, 4], [85, 8]]);

    /** A short JSON-like rendering, for keys that are lists or mappings. */
    function keyText(v, depth) {
        if (depth > 50) return '…';
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return JSON.stringify(v);
        if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (Array.isArray(v)) return `[${v.map((x) => keyText(x, depth + 1)).join(', ')}]`;
        if (v instanceof Map) return `{${Array.from(v, ([k, x]) => `${JSON.stringify(k)}: ${keyText(x, depth + 1)}`).join(', ')}}`;
        return String(v);
    }

    /* ================================================================== */
    /* Reader                                                              */
    /* ================================================================== */

    const FLOW_IN = 1;
    const FLOW_OUT = 2;
    const BLOCK_IN = 3;
    const BLOCK_OUT = 4;
    const TABS = "YAML doesn't allow tabs for indentation — use spaces.";

    /**
     * Read every document in a YAML stream. Returns { docs, warnings }.
     * The structure follows the YAML 1.2 productions: compose() reads one
     * node (properties, then a block collection, flow collection, scalar or
     * alias), and the readers below each handle one node style.
     */
    function readYAML(input) {
        const bad = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F￾￿]/.exec(input);
        if (bad) {
            throw positioned(input, bad.index, `YAML can't contain the control character U+${hex4(bad[0].charCodeAt(0))} — remove it, or write it as an escape inside "double quotes".`);
        }
        const s = input.length && !isEOL(input.charCodeAt(input.length - 1)) ? `${input}\n` : input;
        const n = s.length;
        let pos = 0;
        let line = 0;
        let lineStart = 0;
        let lineIndent = 0;
        let tabAt = -1;
        let depth = 0;
        let nodes = 0;
        let aliasNodes = 0;
        // The node just read: its value, its style, the raw text of an
        // untagged plain scalar (for keys) and whether it is the merge key.
        let result = null;
        let style = '';
        let lastRaw = null;
        let mergeFlag = false;
        const anchors = new Map();
        const pending = new Set();
        const handles = new Map();
        const W = { dupes: 0, firstDupe: null, tags: new Map(), complex: 0, zeros: 0, zeroExample: '', directives: 0 };
        const noteZero = (text) => { W.zeros++; if (!W.zeroExample) W.zeroExample = text; };

        const fail = (reason, at) => { throw positioned(s, at === undefined ? pos : at, reason); };

        if (s.charCodeAt(0) === 0xFEFF) { pos = 1; lineStart = 1; }

        function enter() {
            if (++depth > LIMITS.depth) fail(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
        }
        function leave() { depth--; }
        function count(k) {
            nodes += k;
            if (nodes > LIMITS.nodes) fail(`The data has more than ${commas(LIMITS.nodes)} values — convertMan stops there to stay responsive.`);
        }

        function newline() {
            if (s.charCodeAt(pos) === 13 && s.charCodeAt(pos + 1) === 10) pos += 2;
            else pos++;
            line++;
            lineStart = pos;
        }

        /** Skip spaces, comments and line breaks; returns how many breaks. */
        function skipSpace(allowComments) {
            let breaks = 0;
            let c = s.charCodeAt(pos);
            while (pos < n) {
                while (isWS(c)) c = s.charCodeAt(++pos);
                if (allowComments && c === 35) {
                    do { c = s.charCodeAt(++pos); } while (pos < n && !isEOL(c));
                }
                if (!isEOL(c)) break;
                newline();
                breaks++;
                lineIndent = 0;
                tabAt = -1;
                c = s.charCodeAt(pos);
                while (c === 32) { lineIndent++; c = s.charCodeAt(++pos); }
                if (c === 9) tabAt = pos;
            }
            return breaks;
        }

        function atDocumentBoundary() {
            const c = s.charCodeAt(pos);
            if ((c === 45 || c === 46) && s.charCodeAt(pos + 1) === c && s.charCodeAt(pos + 2) === c) {
                return pos + 3 >= n || isWsOrEol(s.charCodeAt(pos + 3));
            }
            return false;
        }

        const fold = (breaks) => (breaks === 1 ? ' ' : '\n'.repeat(breaks - 1));

        /* ── Scalars ──────────────────────────────────────────────────── */

        function readPlain(nodeIndent, withinFlow) {
            let c = s.charCodeAt(pos);
            if (isWsOrEol(c) || isFlowIndicator(c) || c === 35 || c === 38 || c === 42 || c === 33 || c === 124
                || c === 62 || c === 39 || c === 34 || c === 37 || c === 64 || c === 96) return false;
            if (c === 63 || c === 45 || c === 58) {
                const f = s.charCodeAt(pos + 1);
                if (pos + 1 >= n || isWsOrEol(f) || (withinFlow && isFlowIndicator(f))) return false;
            }
            let out = '';
            let segStart = pos;
            let segEnd = pos;
            let pendingBreak = false;
            let breakLine = line;
            while (pos < n) {
                if (c === 58) {
                    const f = s.charCodeAt(pos + 1);
                    if (pos + 1 >= n || isWsOrEol(f) || (withinFlow && isFlowIndicator(f))) break;
                } else if (c === 35) {
                    if (isWsOrEol(s.charCodeAt(pos - 1))) break;
                } else if ((pos === lineStart && atDocumentBoundary()) || (withinFlow && isFlowIndicator(c))) {
                    break;
                } else if (isEOL(c)) {
                    const saved = [line, lineStart, lineIndent, tabAt];
                    breakLine = line;
                    skipSpace(false);
                    if (lineIndent >= nodeIndent && pos < n) {
                        pendingBreak = true;
                        c = s.charCodeAt(pos);
                        continue;
                    }
                    pos = segEnd;
                    [line, lineStart, lineIndent, tabAt] = saved;
                    break;
                }
                if (pendingBreak) {
                    out += s.slice(segStart, segEnd) + fold(line - breakLine);
                    segStart = segEnd = pos;
                    pendingBreak = false;
                }
                if (!isWS(c)) segEnd = pos + 1;
                c = s.charCodeAt(++pos);
            }
            out += s.slice(segStart, segEnd);
            if (!out) return false;
            result = out;
            style = 'plain';
            return true;
        }

        function readSingle() {
            if (s.charCodeAt(pos) !== 39) return false;
            const start = pos;
            pos++;
            let out = '';
            let segStart = pos;
            let segEnd = pos;
            while (pos < n) {
                const c = s.charCodeAt(pos);
                if (c === 39) {
                    out += s.slice(segStart, pos);
                    pos++;
                    if (s.charCodeAt(pos) !== 39) {
                        result = out;
                        style = 'single';
                        return true;
                    }
                    segStart = pos;
                    pos++;
                    segEnd = pos;
                } else if (isEOL(c)) {
                    out += s.slice(segStart, segEnd) + fold(skipSpace(false));
                    segStart = segEnd = pos;
                } else if (pos === lineStart && atDocumentBoundary()) {
                    fail("This 'single-quoted' text is never closed — add the closing '.", start);
                } else {
                    pos++;
                    if (!isWS(c)) segEnd = pos;
                }
            }
            return fail("This 'single-quoted' text is never closed — add the closing '.", start);
        }

        function readDouble() {
            if (s.charCodeAt(pos) !== 34) return false;
            const start = pos;
            pos++;
            let out = '';
            let segStart = pos;
            let segEnd = pos;
            while (pos < n) {
                let c = s.charCodeAt(pos);
                if (c === 34) {
                    out += s.slice(segStart, pos);
                    pos++;
                    result = out;
                    style = 'double';
                    return true;
                }
                if (c === 92) {
                    out += s.slice(segStart, pos);
                    const escAt = pos;
                    c = s.charCodeAt(++pos);
                    if (isEOL(c)) {
                        skipSpace(false);
                    } else if (ESCAPES.has(c)) {
                        out += ESCAPES.get(c);
                        pos++;
                    } else if (HEX_ESCAPES.has(c)) {
                        const len = HEX_ESCAPES.get(c);
                        const hex = s.slice(pos + 1, pos + 1 + len);
                        if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) {
                            fail(`Expected ${len} hex digits after \\${String.fromCharCode(c)}.`, escAt);
                        }
                        const cp = parseInt(hex, 16);
                        if (cp > 0x10FFFF) fail('This \\U escape is past the last Unicode character (10FFFF).', escAt);
                        out += cp <= 0xFFFF ? String.fromCharCode(cp) : String.fromCodePoint(cp);
                        pos += 1 + len;
                    } else {
                        fail(`Unknown escape '\\${pos < n ? String.fromCodePoint(s.codePointAt(pos)) : ''}' in "double-quoted" text — use \\\\ for a backslash.`, escAt);
                    }
                    segStart = segEnd = pos;
                } else if (isEOL(c)) {
                    out += s.slice(segStart, segEnd) + fold(skipSpace(false));
                    segStart = segEnd = pos;
                } else if (pos === lineStart && atDocumentBoundary()) {
                    fail('This "double-quoted" text is never closed — add the closing ".', start);
                } else {
                    pos++;
                    if (!isWS(c)) segEnd = pos;
                }
            }
            return fail('This "double-quoted" text is never closed — add the closing ".', start);
        }

        function readBlockScalar(nodeIndent) {
            let c = s.charCodeAt(pos);
            let folding;
            if (c === 124) folding = false;
            else if (c === 62) folding = true;
            else return false;
            const start = pos;
            let chomp = 0;
            let detected = false;
            let textIndent = nodeIndent;
            c = s.charCodeAt(++pos);
            for (;;) {
                if (c === 43 || c === 45) {
                    if (chomp !== 0) fail('A block scalar header can have only one chomping sign (+ or -).');
                    chomp = c === 43 ? 1 : -1;
                } else if (c >= 49 && c <= 57) {
                    if (detected) fail('A block scalar header can have only one indentation number.');
                    textIndent = nodeIndent + (c - 48) - 1;
                    detected = true;
                } else if (c === 48) {
                    fail('The indentation number of a block scalar must be 1 to 9.');
                } else break;
                c = s.charCodeAt(++pos);
            }
            if (isWS(c)) {
                do { c = s.charCodeAt(++pos); } while (isWS(c));
                if (c === 35) {
                    do { c = s.charCodeAt(++pos); } while (pos < n && !isEOL(c));
                }
            }
            if (pos < n && !isEOL(c)) {
                fail(`Expected a line break after '${s.slice(start, pos).trim()}', but found ${found(s, pos)} — the text of a ${folding ? '>' : '|'} block starts on the next line.`);
            }
            let out = '';
            let emptyLines = 0;
            let didRead = false;
            let atMore = false;
            while (pos < n) {
                newline();
                lineIndent = 0;
                tabAt = -1;
                c = s.charCodeAt(pos);
                while ((!detected || lineIndent < textIndent) && c === 32) { lineIndent++; c = s.charCodeAt(++pos); }
                if (!detected && lineIndent > textIndent) textIndent = lineIndent;
                if (isEOL(c)) { emptyLines++; continue; }
                if (pos >= n || lineIndent < textIndent || (lineIndent === 0 && atDocumentBoundary())) {
                    if (c === 9 && lineIndent < textIndent) tabAt = pos;
                    break;
                }
                if (folding) {
                    if (isWS(c)) {
                        atMore = true;
                        out += '\n'.repeat(didRead ? 1 + emptyLines : emptyLines);
                    } else if (atMore) {
                        atMore = false;
                        out += '\n'.repeat(emptyLines + 1);
                    } else if (emptyLines === 0) {
                        if (didRead) out += ' ';
                    } else {
                        out += '\n'.repeat(emptyLines);
                    }
                } else {
                    out += '\n'.repeat(didRead ? 1 + emptyLines : emptyLines);
                }
                didRead = true;
                detected = true;
                emptyLines = 0;
                const segStart = pos;
                while (pos < n && !isEOL(c)) c = s.charCodeAt(++pos);
                out += s.slice(segStart, pos);
            }
            if (chomp === 1) out += '\n'.repeat(didRead ? 1 + emptyLines : emptyLines);
            else if (chomp === 0 && didRead) out += '\n';
            result = out;
            style = 'block';
            return true;
        }

        /* ── Properties and aliases ───────────────────────────────────── */

        function readName(start) {
            pos++;
            const nameStart = pos;
            let c = s.charCodeAt(pos);
            while (pos < n && !isWsOrEol(c) && !isFlowIndicator(c)) c = s.charCodeAt(++pos);
            if (pos === nameStart) fail(`Expected a name right after '${s[start]}'.`, start);
            return s.slice(nameStart, pos);
        }

        function readTag() {
            const start = pos;
            let c = s.charCodeAt(++pos);
            if (c === 60) {
                const end = s.indexOf('>', pos);
                const eol = s.slice(pos, end === -1 ? n : end).search(/[\r\n]/);
                if (end === -1 || eol !== -1) fail('This !<…> tag is never closed — expected >.', start);
                pos = end + 1;
                return s.slice(start + 2, end);
            }
            while (pos < n && !isWsOrEol(c) && !isFlowIndicator(c)) c = s.charCodeAt(++pos);
            const text = s.slice(start, pos);
            if (text === '!') return '!';
            const m = /^(!(?:[\w-]*!)?)(.*)$/.exec(text);
            const handle = m[1];
            let suffix = m[2];
            try { suffix = decodeURIComponent(suffix); } catch (e) { /* keep it as written */ }
            if (handles.has(handle)) return handles.get(handle) + suffix;
            if (handle === '!!') return CORE + suffix;
            if (handle === '!') return `!${suffix}`;
            return fail(`The tag handle ${handle} is not declared — add a %TAG directive for it, or use !! or !.`, start);
        }

        function readAlias() {
            if (s.charCodeAt(pos) !== 42) return false;
            const start = pos;
            const name = readName(start);
            const entry = anchors.get(name);
            if (!entry) {
                if (pending.has(name)) fail(`The alias *${clip(name, 40)} points into the node it belongs to, which would never end.`, start);
                fail(`Unknown alias *${clip(name, 40)} — there is no anchor &${clip(name, 40)} before it.`, start);
            }
            aliasNodes += entry.size;
            if (aliasNodes > LIMITS.aliasNodes) {
                fail(`The aliases in this YAML would expand to more than ${commas(LIMITS.aliasNodes)} values (a "billion laughs" document), so it was not loaded.`, start);
            }
            count(entry.size);
            result = entry.value;
            style = 'alias';
            return true;
        }

        /* ── Tags ─────────────────────────────────────────────────────── */

        function ignoreTag(tag) {
            W.tags.set(tag, (W.tags.get(tag) || 0) + 1);
        }

        /** Apply an explicit tag. `raw` is the scalar text, or null for collections. */
        function applyTag(tag, value, raw, at) {
            const shown = tag.startsWith(CORE) ? `!!${tag.slice(CORE.length)}` : tag;
            const scalarText = raw !== null ? raw : (typeof value === 'string' ? value : null);
            switch (tag) {
                case `${CORE}str`:
                    if (scalarText !== null) return scalarText;
                    if (value === null) return '';
                    if (typeof value !== 'object') return String(value);
                    break;
                case `${CORE}int`: {
                    const t = scalarText === null ? '' : scalarText.trim();
                    if (INT_DEC.test(t) || INT_OCT.test(t) || INT_HEX.test(t)) return intOf(t);
                    if (typeof value === 'number' && Number.isInteger(value)) return value;
                    return fail(`${shown} needs a whole number, but this is '${clip(scalarText === null ? keyText(value, 0) : scalarText, 40)}'.`, at);
                }
                case `${CORE}float`: {
                    const t = scalarText === null ? '' : scalarText.trim();
                    if (FLOAT_RE.test(t) || INF_RE.test(t) || NAN_RE.test(t)) return floatOf(t);
                    if (INT_OCT.test(t) || INT_HEX.test(t)) return Number(intOf(t));
                    if (typeof value === 'number') return value;
                    return fail(`${shown} needs a number, but this is '${clip(scalarText === null ? keyText(value, 0) : scalarText, 40)}'.`, at);
                }
                case `${CORE}bool`: {
                    const t = scalarText === null ? '' : scalarText.trim();
                    if (TRUE_RE.test(t)) return true;
                    if (FALSE_RE.test(t)) return false;
                    if (typeof value === 'boolean') return value;
                    return fail(`${shown} needs true or false, but this is '${clip(scalarText === null ? keyText(value, 0) : scalarText, 40)}'.`, at);
                }
                case `${CORE}null`:
                    if (scalarText === null && value !== null) return fail(`${shown} can't be used on a list or mapping.`, at);
                    return null;
                case `${CORE}map`:
                    if (value instanceof Map) return value;
                    if (value === null && (raw === null || raw === '')) return new Map();
                    return fail(`${shown} needs a mapping (key: value pairs).`, at);
                case `${CORE}seq`:
                    if (Array.isArray(value)) return value;
                    if (value === null && (raw === null || raw === '')) return [];
                    return fail(`${shown} needs a list.`, at);
                default:
                    break;
            }
            ignoreTag(shown);
            return undefined;
        }

        /* ── Nodes ────────────────────────────────────────────────────── */

        function compose(parentIndent, ctx, allowToSeek, allowCompact) {
            let tag = null;
            let tagAt = 0;
            let anchor = null;
            let indentStatus = 1;
            let atNewLine = false;
            let hasContent = false;
            const blockStyles = ctx === BLOCK_IN || ctx === BLOCK_OUT;
            let allowBlockCollections = blockStyles;
            const nodesBefore = nodes;
            const statusOf = () => (lineIndent > parentIndent ? 1 : lineIndent === parentIndent ? 0 : -1);
            result = null;
            style = '';

            if (allowToSeek && skipSpace(true)) {
                atNewLine = true;
                indentStatus = statusOf();
            }
            if (indentStatus === 1) {
                for (;;) {
                    const c = s.charCodeAt(pos);
                    if (c === 33) {
                        if (tag !== null) fail('A node can have only one tag.');
                        tagAt = pos;
                        tag = readTag();
                    } else if (c === 38) {
                        if (anchor !== null) fail('A node can have only one anchor.');
                        anchor = readName(pos);
                    } else break;
                    if (skipSpace(true)) {
                        atNewLine = true;
                        allowBlockCollections = blockStyles;
                        indentStatus = statusOf();
                        if (indentStatus !== 1) break;
                    } else {
                        allowBlockCollections = false;
                    }
                }
            }
            if (anchor !== null) pending.add(anchor);
            if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;

            if (indentStatus === 1 || ctx === BLOCK_OUT) {
                const flowIndent = ctx === FLOW_IN || ctx === FLOW_OUT ? parentIndent : parentIndent + 1;
                const blockIndent = pos - lineStart;
                if (indentStatus === 1) {
                    if ((allowBlockCollections && (readBlockSequence(blockIndent) || readBlockMapping(blockIndent, flowIndent)))
                        || readFlow(flowIndent)) {
                        hasContent = true;
                    } else if ((blockStyles && readBlockScalar(flowIndent)) || readSingle() || readDouble()) {
                        hasContent = true;
                    } else if (readAlias()) {
                        hasContent = true;
                        if (tag !== null || anchor !== null) fail("An alias (*name) can't have its own tag or anchor.");
                    } else if (readPlain(flowIndent, ctx === FLOW_IN)) {
                        hasContent = true;
                    }
                } else if (indentStatus === 0) {
                    hasContent = allowBlockCollections && readBlockSequence(blockIndent);
                }
            }

            const st = hasContent ? style : 'empty';
            let value = hasContent ? result : null;
            let raw = null;
            let merge = false;
            if (st === 'plain') raw = value;
            else if (st === 'done') raw = lastRaw;
            else if (st === 'single' || st === 'double' || st === 'block') raw = value;
            else if (st === 'empty') raw = '';

            if (tag !== null && tag !== '!') {
                const tagged = applyTag(tag, value, raw, tagAt);
                if (tagged !== undefined) {
                    value = tagged;
                    raw = null;
                } else if (st === 'plain') {
                    value = resolvePlain(value, noteZero);
                }
            } else if (st === 'plain' && tag === null) {
                if (value === '<<') merge = true;
                value = resolvePlain(value, noteZero);
            } else if (st === 'plain' || st === 'empty') {
                value = st === 'empty' && tag === null ? null : (value === null ? '' : value);
                raw = null;
            }
            if (st !== 'plain' && st !== 'done') raw = null;

            const present = hasContent || tag !== null || anchor !== null;
            if (present) count(1);
            if (anchor !== null) {
                pending.delete(anchor);
                anchors.set(anchor, { value, size: Math.max(1, nodes - nodesBefore) });
            }
            result = value;
            style = 'done';
            lastRaw = tag === null ? raw : null;
            mergeFlag = merge;
            return present;
        }

        /** Turn a key node into the text key a Map entry uses. */
        function keyOf(node, raw) {
            if (typeof node === 'string') return node;
            if (raw !== null && raw !== undefined) return raw;
            if (node === null) return '';
            if (node instanceof Map || Array.isArray(node)) {
                W.complex++;
                return keyText(node, 0);
            }
            return String(node);
        }

        function store(map, merged, keyNode, keyRaw, isMerge, value, at) {
            if (isMerge) {
                const sources = Array.isArray(value) ? value : [value];
                for (const src of sources) {
                    if (!(src instanceof Map)) fail('A merge key (<<) needs a mapping or a list of mappings — usually an alias such as *defaults.', at);
                    for (const [k, v] of src) {
                        if (!map.has(k)) {
                            map.set(k, v);
                            merged.add(k);
                        }
                    }
                    count(src.size);
                }
                return;
            }
            const k = keyOf(keyNode, keyRaw);
            if (map.has(k)) {
                if (merged.has(k)) merged.delete(k);
                else {
                    W.dupes++;
                    if (!W.firstDupe) W.firstDupe = { name: k, at };
                }
            }
            map.set(k, value);
        }

        /* ── Collections ──────────────────────────────────────────────── */

        function readFlow(nodeIndent) {
            let c = s.charCodeAt(pos);
            let isMapping;
            let terminator;
            if (c === 91) { isMapping = false; terminator = 93; }
            else if (c === 123) { isMapping = true; terminator = 125; }
            else return false;
            const start = pos;
            const coll = isMapping ? new Map() : [];
            const merged = new Set();
            enter();
            pos++;
            let readNext = true;
            while (pos < n) {
                skipSpace(true);
                c = s.charCodeAt(pos);
                if (c === terminator) {
                    pos++;
                    leave();
                    result = coll;
                    style = isMapping ? 'map' : 'seq';
                    return true;
                }
                if (pos >= n) break;
                if (!readNext) {
                    fail(isMapping ? `Expected ',' or '}' in this mapping, but found ${found(s, pos)}.` : `Expected ',' or ']' in this list, but found ${found(s, pos)}.`);
                }
                if (c === 44) fail("Expected a value before ',' — remove the extra comma.");
                if (c === 93 || c === 125) fail(`Found '${String.fromCharCode(c)}' where '${String.fromCharCode(terminator)}' was expected.`);
                let isPair = false;
                let isExplicit = false;
                if (c === 63 && isWsOrEol(s.charCodeAt(pos + 1))) {
                    isPair = isExplicit = true;
                    pos++;
                    skipSpace(true);
                }
                const entryLine = line;
                const keyAt = pos;
                compose(nodeIndent, FLOW_IN, false, true);
                const keyNode = result;
                const keyRaw = lastRaw;
                const keyMerge = mergeFlag;
                let valueNode = null;
                skipSpace(true);
                c = s.charCodeAt(pos);
                if ((isExplicit || line === entryLine) && c === 58) {
                    isPair = true;
                    pos++;
                    skipSpace(true);
                    compose(nodeIndent, FLOW_IN, false, true);
                    valueNode = result;
                }
                if (isMapping) store(coll, merged, keyNode, keyRaw, keyMerge, valueNode, keyAt);
                else if (isPair) {
                    const one = new Map();
                    store(one, new Set(), keyNode, keyRaw, keyMerge, valueNode, keyAt);
                    coll.push(one);
                } else coll.push(keyNode);
                skipSpace(true);
                c = s.charCodeAt(pos);
                if (c === 44) { readNext = true; pos++; } else readNext = false;
            }
            return fail(isMapping ? "This { is never closed — expected '}'." : "This [ is never closed — expected ']'.", start);
        }

        function readBlockSequence(nodeIndent) {
            if (tabAt !== -1) return false;
            let c = s.charCodeAt(pos);
            if (c !== 45 || !isWsOrEol(s.charCodeAt(pos + 1))) return false;
            const list = [];
            enter();
            while (pos < n) {
                if (tabAt !== -1) fail(TABS, tabAt);
                if (c !== 45 || !isWsOrEol(s.charCodeAt(pos + 1))) break;
                if (pos === lineStart && atDocumentBoundary()) break;
                pos++;
                if (skipSpace(true) && lineIndent <= nodeIndent) {
                    list.push(null);
                    c = s.charCodeAt(pos);
                    continue;
                }
                const entryLine = line;
                compose(nodeIndent, BLOCK_IN, false, true);
                list.push(result);
                skipSpace(true);
                c = s.charCodeAt(pos);
                if (pos < n && line === entryLine) fail(`Unexpected ${found(s, pos)} after this list item — check its indentation and any ': ' inside it.`);
                if (pos < n && lineIndent > nodeIndent) fail('This line is indented more than the list items around it — check the spaces before it.');
                if (lineIndent < nodeIndent) break;
            }
            leave();
            result = list;
            style = 'seq';
            return true;
        }

        function readBlockMapping(nodeIndent, flowIndent) {
            if (tabAt !== -1) return false;
            const map = new Map();
            const merged = new Set();
            let keyNode = null;
            let keyRaw = null;
            let keyMerge = false;
            let keyAt = pos;
            let atExplicit = false;
            let detected = false;
            let allowCompact = false;
            let c = s.charCodeAt(pos);
            enter();
            while (pos < n) {
                if (!atExplicit && tabAt !== -1) fail(TABS, tabAt);
                const f = s.charCodeAt(pos + 1);
                const entryLine = line;
                if ((c === 63 || c === 58) && isWsOrEol(f)) {
                    if (c === 63) {
                        if (atExplicit) {
                            store(map, merged, keyNode, keyRaw, keyMerge, null, keyAt);
                            keyNode = keyRaw = null;
                            keyMerge = false;
                        }
                        detected = true;
                        atExplicit = true;
                        allowCompact = true;
                    } else if (atExplicit) {
                        atExplicit = false;
                        allowCompact = true;
                    } else {
                        fail("Found ':' with no key before it — write 'key: value'.");
                    }
                    pos++;
                    c = f;
                } else {
                    const at = pos;
                    if (!compose(flowIndent, FLOW_OUT, false, true)) break;
                    if (line === entryLine) {
                        c = s.charCodeAt(pos);
                        while (isWS(c)) c = s.charCodeAt(++pos);
                        if (c === 58) {
                            c = s.charCodeAt(++pos);
                            if (pos < n && !isWsOrEol(c)) fail("Expected a space after ':' in 'key: value'.");
                            if (atExplicit) store(map, merged, keyNode, keyRaw, keyMerge, null, keyAt);
                            detected = true;
                            atExplicit = false;
                            allowCompact = false;
                            keyNode = result;
                            keyRaw = lastRaw;
                            keyMerge = mergeFlag;
                            keyAt = at;
                        } else if (detected) {
                            fail(`Expected 'key: value' here, but found ${found(s, pos)} — the ':' may be missing, or the line may be indented wrongly.`, at);
                        } else {
                            leave();
                            return true;
                        }
                    } else if (detected) {
                        fail("Expected 'key: value' here — the ':' may be missing (a key can't run over several lines).", at);
                    } else {
                        leave();
                        return true;
                    }
                }
                if (line === entryLine || lineIndent > nodeIndent) {
                    if (atExplicit) keyAt = pos;
                    let valueNode = null;
                    if (compose(nodeIndent, BLOCK_OUT, true, allowCompact)) {
                        if (atExplicit) {
                            keyNode = result;
                            keyRaw = lastRaw;
                            keyMerge = false;
                        } else valueNode = result;
                    }
                    if (!atExplicit) {
                        store(map, merged, keyNode, keyRaw, keyMerge, valueNode, keyAt);
                        keyNode = keyRaw = null;
                        keyMerge = false;
                    }
                    skipSpace(true);
                    c = s.charCodeAt(pos);
                }
                if ((line === entryLine || lineIndent > nodeIndent) && pos < n) {
                    fail(line === entryLine
                        ? `Unexpected ${found(s, pos)} after this value — a value can't be followed by more text on the same line.`
                        : "This line's indentation doesn't match the mapping it belongs to — check the spaces before it.");
                } else if (lineIndent < nodeIndent) break;
                if (pos === lineStart && atDocumentBoundary()) break;
            }
            if (atExplicit) store(map, merged, keyNode, keyRaw, keyMerge, null, keyAt);
            leave();
            if (detected) {
                result = map;
                style = 'map';
            }
            return detected;
        }

        /* ── Documents ────────────────────────────────────────────────── */

        const docs = [];

        function readDirectives() {
            let has = false;
            let sawYaml = false;
            handles.clear();
            while (pos < n) {
                skipSpace(true);
                if (lineIndent > 0 || s.charCodeAt(pos) !== 37) break;
                has = true;
                const at = pos;
                let end = pos;
                while (end < n && !isEOL(s.charCodeAt(end))) end++;
                const parts = s.slice(pos + 1, end).replace(/\s#.*$/, '').trim().split(/[ \t]+/);
                if (parts[0] === 'YAML') {
                    if (sawYaml) fail('Only one %YAML directive is allowed per document.', at);
                    sawYaml = true;
                    if (!/^1\.\d+$/.test(parts[1] || '')) fail(`Unsupported YAML version '${clip(parts[1] || '', 20)}' — convertMan reads YAML 1.x.`, at);
                } else if (parts[0] === 'TAG') {
                    if (!/^!(?:[\w-]*!)?$/.test(parts[1] || '') || !parts[2]) fail('A %TAG directive needs a handle and a prefix, for example %TAG !e! tag:example.com,2026:', at);
                    handles.set(parts[1], parts[2]);
                } else {
                    W.directives++;
                }
                pos = end;
            }
            return has;
        }

        function readDocument() {
            const hasDirectives = readDirectives();
            skipSpace(true);
            if (lineIndent === 0 && pos === lineStart && s.startsWith('---', pos) && (pos + 3 >= n || isWsOrEol(s.charCodeAt(pos + 3)))) {
                pos += 3;
                skipSpace(true);
            } else if (hasDirectives) {
                fail("Expected '---' after the directives at the start of this document.");
            }
            compose(lineIndent - 1, BLOCK_OUT, false, true);
            skipSpace(true);
            docs.push(result);
            if (pos === lineStart && atDocumentBoundary()) {
                if (s.charCodeAt(pos) === 46) {
                    pos += 3;
                    skipSpace(true);
                }
                return;
            }
            if (pos < n) {
                fail(`Expected the end of the document, but found ${found(s, pos)} — check the indentation of this line.`);
            }
        }

        while (s.charCodeAt(pos) === 32) { lineIndent++; pos++; }
        while (pos < n) {
            const before = pos;
            readDocument();
            if (pos === before) fail(`Unexpected ${found(s, pos)}.`);
        }
        if (!docs.length) docs.push(null);

        const warnings = [];
        if (W.dupes) {
            const where = locate(s, W.firstDupe.at).line;
            warnings.push(W.dupes === 1
                ? `1 duplicate key was found ("${clip(W.firstDupe.name, 40)}" on line ${where}); the last value was kept.`
                : `${commas(W.dupes)} duplicate keys were found (the first is "${clip(W.firstDupe.name, 40)}" on line ${where}); the last value of each was kept.`);
        }
        W.tags.forEach((k, tag) => {
            warnings.push(`The tag ${clip(tag, 40)} isn't supported, so it was ignored (${plural(k, 'value')}).`);
        });
        if (W.complex) warnings.push(`${plural(W.complex, 'key')} ${W.complex === 1 ? 'was a list or mapping and was' : 'were lists or mappings and were'} turned into text.`);
        if (W.zeros) {
            warnings.push(`${plural(W.zeros, 'number')} with a leading zero (such as ${clip(W.zeroExample, 20)}) ${W.zeros === 1 ? 'was' : 'were'} read as decimal, following YAML 1.2 — quote ${W.zeros === 1 ? 'it' : 'them'} to keep the text as written.`);
        }
        if (W.directives) warnings.push(`${plural(W.directives, 'unknown directive')} ${W.directives === 1 ? 'was' : 'were'} ignored.`);
        return { docs, warnings };
    }

    /* ================================================================== */
    /* Writer                                                              */
    /* ================================================================== */

    /* Characters YAML must escape (non-printable, or line breaks to YAML 1.1). */
    const NEEDS_ESCAPE = /[\x00-\x08\x0B-\x1F\x7F-\x9F\u2028\u2029\uFEFF\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const YAML11_WORDS = /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|~|null|Null|NULL|=|<<)$/;
    const YAML11_INT = /^[-+]?(?:0b[01_]+|0x[0-9a-fA-F_]+|0o?[0-7_]+|[0-9][0-9_]*|[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
    const YAML11_FLOAT = /^(?:[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?:\.[0-9_]*)?[eE][-+]?[0-9]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
    const TIMESTAMP = /^\d{4}-\d\d?-\d\d?(?:(?:[Tt]|[ \t]+)\d\d?:\d\d:\d\d(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d\d?(?::\d\d)?))?)?$/;
    const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`]/;

    /** True when a string written plain would read back as something else. */
    function needsQuotes(str) {
        if (str === '') return true;
        if (YAML11_WORDS.test(str) || YAML11_INT.test(str) || YAML11_FLOAT.test(str) || TIMESTAMP.test(str)) return true;
        if (resolvePlain(str, null) !== str) return true;
        if (INDICATOR_START.test(str) || /^\.\.\./.test(str)) return true;
        if (/^[ \t]|[ \t]$/.test(str)) return true;
        if (/:(?:[ \t]|$)/.test(str) || /[ \t]#/.test(str)) return true;
        if (/[\t\r\n]/.test(str)) return true;
        return NEEDS_ESCAPE.test(str);
    }

    function doubleQuoted(str) {
        return JSON.stringify(str).replace(/[\x7F-\x9F\u2028\u2029\uFEFF\uFFFE\uFFFF]/g,
            (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    }

    function quoted(str) {
        if (/[\t\r\n]/.test(str) || NEEDS_ESCAPE.test(str)) return doubleQuoted(str);
        return `'${str.replace(/'/g, "''")}'`;
    }

    function formatKey(k) {
        const str = String(k);
        return needsQuotes(str) ? quoted(str) : str;
    }

    /** Can this string be written as a literal block (|)? */
    function literalOK(str) {
        return str.includes('\n') && /[^\n]/.test(str) && !/^\n*[ \t]/.test(str) && !/[\r]/.test(str) && !NEEDS_ESCAPE.test(str);
    }

    function writeYAML(value, opts) {
        const step = String(opts.indent) === '4' ? 4 : 2;
        const sort = !!opts.sortKeys;
        const lines = [];
        const counts = { other: 0 };
        const pad = (k) => ' '.repeat(k);

        function entries(m) {
            const list = m instanceof Map ? Array.from(m.entries()) : Object.keys(m).map((k) => [k, m[k]]);
            if (sort) list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            return list;
        }
        const isColl = (v) => v instanceof Map || Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date));
        const sizeOf = (v) => (v instanceof Map ? v.size : Array.isArray(v) ? v.length : Object.keys(v).length);

        /** A scalar (or empty collection) as { head, body } — body lines for a literal block. */
        function scalar(v, bodyIndent) {
            if (v === null || v === undefined) return { head: 'null' };
            switch (typeof v) {
                case 'boolean': return { head: v ? 'true' : 'false' };
                case 'bigint': return { head: v.toString() };
                case 'number':
                    if (Number.isNaN(v)) return { head: '.nan' };
                    if (!Number.isFinite(v)) return { head: v > 0 ? '.inf' : '-.inf' };
                    if (Number.isInteger(v) && !Number.isSafeInteger(v)) return { head: v.toExponential() };
                    return { head: String(v) };
                case 'string': break;
                case 'object':
                    if (v instanceof Date) return scalar(Number.isNaN(v.getTime()) ? '' : v.toISOString(), bodyIndent);
                    if (Array.isArray(v)) return { head: '[]' };
                    return { head: '{}' };
                default:
                    counts.other++;
                    return { head: 'null' };
            }
            if (literalOK(v)) {
                const trailing = /\n*$/.exec(v)[0].length;
                const content = v.slice(0, v.length - trailing);
                const body = content.split('\n').map((l) => (l ? pad(bodyIndent) + l : ''));
                for (let k = 1; k < trailing; k++) body.push('');
                return { head: trailing === 0 ? '|-' : trailing === 1 ? '|' : '|+', body };
            }
            return { head: needsQuotes(v) ? quoted(v) : v };
        }

        function pushScalar(prefix, v, bodyIndent) {
            const sc = scalar(v, bodyIndent);
            lines.push(prefix + sc.head);
            if (sc.body) for (const l of sc.body) lines.push(l);
        }

        function block(v, indent, depth) {
            if (depth > LIMITS.depth) throw plainError(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
            if (Array.isArray(v)) {
                for (const item of v) {
                    if (isColl(item) && sizeOf(item)) {
                        const first = lines.length;
                        block(item, indent + 2, depth + 1);
                        lines[first] = `${pad(indent)}- ${lines[first].slice(indent + 2)}`;
                    } else {
                        pushScalar(`${pad(indent)}- `, item, indent + 2);
                    }
                }
                return;
            }
            for (const [k, x] of entries(v)) {
                const key = `${pad(indent)}${formatKey(k)}:`;
                if (isColl(x) && sizeOf(x)) {
                    lines.push(key);
                    block(x, indent + step, depth + 1);
                } else {
                    pushScalar(`${key} `, x, indent + step);
                }
            }
        }

        if (isColl(value) && sizeOf(value)) block(value, 0, 1);
        else pushScalar('', value, step);
        let text = `${lines.join('\n')}\n`;
        if (opts.docStart) text = `---\n${text}`;
        const warnings = [];
        if (counts.other) warnings.push(`${plural(counts.other, 'value')} with no YAML form ${counts.other === 1 ? 'was' : 'were'} written as null.`);
        return { text, warnings };
    }

    /* ================================================================== */
    /* Detection                                                           */
    /* ================================================================== */

    function detectYAML(text) {
        if (typeof text !== 'string' || !text) return 0;
        let h = text.slice(0, DETECT_CHARS).replace(/^\uFEFF/, '');
        if (text.length > DETECT_CHARS && h.lastIndexOf('\n') > 0) h = h.slice(0, h.lastIndexOf('\n'));
        const trimmed = h.replace(/^\s+/, '');
        if (!trimmed) return 0;
        if (/^(?:%YAML|---(?:\s|$))/.test(trimmed)) return 0.95;
        if (/^[{[]/.test(trimmed)) return 0.3;
        if (/^</.test(trimmed)) return 0;
        const lines = h.split(/\r\n|\n|\r/).filter((l) => l.trim() && !/^\s*#/.test(l)).slice(0, 80);
        if (!lines.length) return 0.05;
        let yamlish = 0;
        let assigns = 0;
        for (const l of lines) {
            if (/^\s*(?:-(?:\s|$)|[^\s#:=,[\]{}][^:=]*:(?:\s|$)|["'][^"']*["']\s*:(?:\s|$))/.test(l)) yamlish++;
            else if (/^\s*[^\s:=]+\s*=/.test(l)) assigns++;
            else if (/^\s+\S/.test(l)) yamlish += 0.5;
        }
        if (assigns > lines.length / 3) return 0.02;
        const ratio = yamlish / lines.length;
        if (ratio >= 0.8) return 0.8;
        if (ratio >= 0.5) return 0.6;
        return 0.05;
    }

    /* ================================================================== */
    /* Module                                                              */
    /* ================================================================== */

    const SAMPLE = [
        '# Deployment settings for the shop front end',
        'service: shop-web',
        'version: 2.3.1',
        'replicas: 3',
        'public: true',
        'owner:',
        '  team: Storefront',
        '  email: storefront@example.com',
        'defaults: &defaults',
        '  region: eu-west-1',
        '  timeout_s: 30',
        'environments:',
        '  - name: staging',
        '    <<: *defaults',
        '    url: https://staging.example.com',
        '  - name: production',
        '    <<: *defaults',
        '    timeout_s: 10',
        '    url: https://shop.example.com',
        'features: [search, wishlist, gift-cards]',
        'release_notes: |',
        '  Faster checkout.',
        '  New gift card page.',
        ''
    ].join('\n');

    const yaml = {
        id: 'yaml',
        label: 'YAML',
        extensions: ['yaml', 'yml'],
        mime: 'application/yaml',
        kind: 'tree',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectYAML(text); } catch (e) { return 0; }
        },
        parse(text, opts) {
            if (typeof text !== 'string') throw plainError('There is no text to read.');
            if (text.length > LIMITS.inputChars) {
                throw plainError(`This text is ${(text.length / 1048576).toFixed(1)} MB — larger than 20 MB, the most convertMan reads at a time.`);
            }
            const all = !!(opts && opts.documents === 'all');
            const res = readYAML(text);
            const warnings = res.warnings.slice();
            if (!all && res.docs.length > 1) {
                warnings.push(`This YAML has ${commas(res.docs.length)} documents; only the first was read. Choose "All documents as a list" to keep them all.`);
            }
            return { value: all ? res.docs : res.docs[0], warnings };
        },
        stringify(value, opts) {
            return writeYAML(value, opts || {});
        },
        inputOptions: [
            {
                key: 'documents', label: 'Multiple documents', type: 'select', default: 'first',
                choices: [
                    { value: 'first', label: 'First document only' },
                    { value: 'all', label: 'All documents as a list' }
                ],
                help: 'A YAML file can hold several documents separated by ---. Read just the first, or all of them as one list.'
            }
        ],
        outputOptions: [
            {
                key: 'indent', label: 'Indent', type: 'select', default: '2',
                choices: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }],
                help: 'How far each level of nesting is indented. YAML never uses tabs.'
            },
            {
                key: 'sortKeys', label: 'Sort keys', type: 'checkbox', default: false,
                help: 'Write the keys of every mapping in A–Z order instead of their original order.'
            },
            {
                key: 'docStart', label: 'Start with ---', type: 'checkbox', default: false,
                help: 'Begin the output with the --- document marker, as some tools expect.'
            }
        ],
        sample: SAMPLE,
        notes: 'YAML holds the same data as JSON plus comments, anchors and multi-line text. Comments are lost and aliases are written out in full; tags other than the standard !!str, !!int, !!float, !!bool, !!null, !!map and !!seq are ignored.'
    };

    return { yaml };
});
