/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: CsvFormat (convertMan Edition - v1.0)
 *     - File Name: csv.js
 *     - Relative Path: tools/convertman/js/formats/csv.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Reads and writes CSV and TSV for convertMan's converter. Parsing turns
 *     a delimited table into a list of records (or a list of lists), and
 *     writing turns any list, record or nested structure into one flat table
 *     using the shared tabular rules. It exists so spreadsheet data can move
 *     to and from JSON, YAML, XML and the other formats without surprises.
 *
 * ✒ Key Features:
 *     - RFC 4180 reader: quoted fields, doubled quotes, embedded newlines,
 *       CRLF / LF / CR line endings, and a leading byte-order mark stripped
 *     - Delimiter auto-detection (comma, semicolon, tab, pipe) by how evenly
 *       each candidate splits the first rows, quotes respected
 *     - Header row on or off; repeated or blank column names are renamed
 *       (name_2, column3) with a warning, and ragged rows are padded
 *     - Optional type inference: 42 and 3.5 become numbers, true / false
 *       booleans, empty cells null; leading-zero codes such as 007 stay text
 *       and integers past 2^53 become BigInt
 *     - Tabular writer: records become rows with the union of their keys in
 *       first-seen order, nested values become dot-path columns or JSON text,
 *       lists of lists and lists of plain values are handled too
 *     - Output options: delimiter, quote as needed or every field, LF or
 *       CRLF, header row, nested-value style
 *     - Spreadsheet formula-injection guard: cells starting with = + - @ are
 *       counted and warned about, or prefixed with ' when protection is on
 *     - Plain-language errors with line and column, such as a quoted field
 *       that never closes
 *     - Caps: 20 MB of text and 5,000,000 cells in or out
 *     - Pure and self-contained: no DOM, no other format files, Node ready
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the file registers the csv and tsv
 *     modules on window.ConvertFormats. Node: require('./csv.js') returns
 *     { csv, tsv }. Every module follows the convertMan format shape:
 *     detect(text) → 0..1, parse(text, opts) → { value, warnings },
 *     stringify(value, opts) → { text, warnings }. Option objects use the
 *     keys listed in inputOptions / outputOptions; missing or invalid
 *     values fall back to the defaults. Values use the convertMan model:
 *     Map for records, arrays for lists, and plain scalars.
 *
 * ✒ Examples:
 *     csv.parse('name,age\nAda,36').value          → [Map { name: 'Ada', age: 36 }]
 *     csv.parse('a;b\n1;2').value                  → delimiter ';' detected → [Map { a: 1, b: 2 }]
 *     csv.parse('a,b\n1,2', { header: false }).value → [['a', 'b'], [1, 2]]
 *     csv.parse('id\n007', { inferTypes: true }).value[0].get('id') → '007'
 *     csv.stringify([new Map([['a', 1]]), new Map([['b', 'x,y']])]).text → 'a,b\n1,\n,"x,y"\n'
 *     csv.stringify(rows, { protectFormulas: true })  → '=SUM(A1)' is written as "'=SUM(A1)"
 *     tsv.stringify([[1, 2], [3, 4]]).text           → '1\t2\n3\t4\n'
 *     csv.detect('a,b,c\n1,2,3\n4,5,6')             → 0.75
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers; Node 16+
 *     - Security: a hand-written bounded parser — no code is ever built from
 *       text; records are Map objects, so header names such as __proto__ are
 *       ordinary keys; formula-looking cells are flagged on output
 *     - Limitations: CSV has no types, so numbers, true / false and empty
 *       cells are guessed on read; null and empty text both write as an
 *       empty cell; only the first 64 KB are sampled to pick a delimiter
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

    /* ── Limits and small helpers ─────────────────────────────────────── */

    const LIMITS = Object.freeze({
        textChars: 20 * 1024 * 1024,
        depth: 512,
        cells: 5000000,
        bigDigits: 400
    });
    const DETECT_CHARS = 4096;
    const SAMPLE_CHARS = 65536;

    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isMap = (v) => v instanceof Map;
    const isContainer = (v) => v instanceof Map || Array.isArray(v);
    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const verb = (n, one, many) => (n === 1 ? one : many);

    function fail(message, pos, format) {
        const err = new Error(message);
        err.format = format;
        if (pos) {
            err.line = pos.line;
            err.column = pos.column;
            err.offset = pos.offset;
        }
        return err;
    }

    /** Offset → { line, column, offset }, fast for increasing offsets. */
    function makeLocator(text) {
        let pos = 0;
        let line = 1;
        let lineStart = 0;
        return function locate(offset) {
            const target = Math.max(0, Math.min(offset, text.length));
            if (target < pos) { pos = 0; line = 1; lineStart = 0; }
            while (pos < target) {
                const nl = text.indexOf('\n', pos);
                if (nl < 0 || nl >= target) { pos = target; break; }
                line++;
                lineStart = nl + 1;
                pos = nl + 1;
            }
            return { line, column: target - lineStart + 1, offset: target };
        };
    }

    function warnings() {
        const list = [];
        return {
            list,
            add(msg) { if (list.length < 40 && list.indexOf(msg) < 0) list.push(msg); }
        };
    }

    function prepare(text, format) {
        if (typeof text !== 'string') throw fail('There is no text to read.', null, format);
        if (text.length > LIMITS.textChars) {
            throw fail(`This text is ${(text.length / 1048576).toFixed(1)} MB — larger than 20 MB, the most convertMan reads at a time.`, null, format);
        }
        return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    }

    function normalizeOption(def, v) {
        if (v === undefined || v === null) return def.default;
        if (def.type === 'checkbox') {
            if (typeof v === 'boolean') return v;
            if (v === 'true' || v === 1) return true;
            if (v === 'false' || v === 0) return false;
            return def.default;
        }
        if (def.type === 'select') {
            let s = String(v).toLowerCase();
            if (s === '\t') s = 'tab';
            const hit = def.choices.find((c) => String(c.value).toLowerCase() === s);
            return hit ? hit.value : def.default;
        }
        if (def.type === 'number') {
            const x = Number(v);
            if (!Number.isFinite(x)) return def.default;
            return Math.min(def.max, Math.max(def.min, Math.round(x)));
        }
        if (def.type === 'text') return typeof v === 'string' ? v.slice(0, 200) : def.default;
        return def.default;
    }

    function readOptions(defs, opts) {
        const src = opts && typeof opts === 'object' ? opts : {};
        const out = {};
        defs.forEach((d) => { out[d.key] = normalizeOption(d, hasOwn(src, d.key) ? src[d.key] : undefined); });
        return out;
    }

    /* ── Scalars ──────────────────────────────────────────────────────── */

    const INT_RE = /^-?(?:0|[1-9]\d*)$/;
    const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
    const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

    /** Text → number, BigInt, boolean or emptyValue when it plainly is one; else the text. */
    function inferScalar(s, emptyValue) {
        if (s === '') return emptyValue;
        const c = s.charCodeAt(0);
        if (c === 116 || c === 84 || c === 102 || c === 70) {
            const l = s.toLowerCase();
            if (l === 'true') return true;
            if (l === 'false') return false;
            return s;
        }
        if (c !== 45 && (c < 48 || c > 57)) return s;
        if (INT_RE.test(s)) {
            const n = Number(s);
            if (Number.isSafeInteger(n)) return n;
            return s.length <= LIMITS.bigDigits ? BigInt(s) : s;
        }
        if (NUM_RE.test(s)) {
            const digits = s.replace(/[eE].*$/, '').replace(/[-.]/g, '').replace(/^0+/, '');
            if (digits.length > 17) return s;
            const n = Number(s);
            return Number.isFinite(n) ? n : s;
        }
        return s;
    }

    /** Compact JSON for a model value (Map → object, BigInt → digits). */
    function jsonText(v, depth, format) {
        const d = depth || 0;
        if (d > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.', null, format);
        if (v === null || v === undefined) return 'null';
        const t = typeof v;
        if (t === 'string') return JSON.stringify(v);
        if (t === 'number') return Number.isFinite(v) ? String(v) : 'null';
        if (t === 'bigint') return v.toString();
        if (t === 'boolean') return v ? 'true' : 'false';
        if (Array.isArray(v)) return `[${v.map((x) => jsonText(x, d + 1, format)).join(',')}]`;
        const entries = v instanceof Map ? [...v.entries()] : Object.keys(v).map((k) => [k, v[k]]);
        return `{${entries.map(([k, x]) => `${JSON.stringify(String(k))}:${jsonText(x, d + 1, format)}`).join(',')}}`;
    }

    function scalarText(v) {
        if (v === null || v === undefined) return '';
        const t = typeof v;
        if (t === 'string') return v;
        if (t === 'number' || t === 'bigint' || t === 'boolean') return String(v);
        return jsonText(v);
    }

    /* ── Tabular rules (shared shape with the other table writers) ────── */

    function tooManyCells(n, format) {
        return fail(`This table would have ${commas(n)} cells; convertMan writes up to ${commas(LIMITS.cells)}.`, null, format);
    }

    function flattenValue(out, path, v, nested, depth, format) {
        if (depth > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.', null, format);
        if (v instanceof Map) {
            if (nested === 'json' || v.size === 0) { out.set(path, jsonText(v, depth, format)); return; }
            v.forEach((x, k) => flattenValue(out, `${path}.${k}`, x, nested, depth + 1, format));
            return;
        }
        if (Array.isArray(v)) {
            if (nested === 'json' || v.length === 0) { out.set(path, jsonText(v, depth, format)); return; }
            v.forEach((x, i) => flattenValue(out, `${path}.${i}`, x, nested, depth + 1, format));
            return;
        }
        out.set(path, v === undefined ? null : v);
    }

    /**
     * Any value → { columns, head, rows } where rows hold only scalars.
     * head is the row a CSV writer prints as its header (null when there is
     * none); columns always names every column for writers that need names.
     */
    function tabulate(value, o, W, format) {
        const nested = o.nested === 'json' ? 'json' : 'dot';
        const header = o.header !== false;
        if (!isContainer(value)) throw fail('A table needs rows — this data is a single value.', null, format);
        const items = isMap(value) ? [value] : value;
        if (!items.length) return { columns: [], head: null, rows: [] };
        let maps = 0;
        let lists = 0;
        items.forEach((it) => { if (isMap(it)) maps++; else if (Array.isArray(it)) lists++; });

        if (maps) {
            const index = new Map();
            const columns = [];
            const flats = [];
            let wrapped = 0;
            items.forEach((it) => {
                const flat = new Map();
                if (isMap(it)) it.forEach((x, k) => flattenValue(flat, String(k), x, nested, 1, format));
                else { wrapped++; flattenValue(flat, 'value', it, nested, 1, format); }
                flat.forEach((_, k) => { if (!index.has(k)) { index.set(k, columns.length); columns.push(k); } });
                if (columns.length * items.length > LIMITS.cells) throw tooManyCells(columns.length * items.length, format);
                flats.push(flat);
            });
            if (wrapped) W.add(`${plural(wrapped, 'item')} in the list ${verb(wrapped, 'was', 'were')} not a record and went into a "value" column.`);
            const rows = flats.map((f) => columns.map((c) => (f.has(c) ? f.get(c) : null)));
            return { columns, head: columns.slice(), rows };
        }

        if (lists) {
            let wrapped = 0;
            const all = items.map((it) => (Array.isArray(it) ? it : (wrapped++, [it])));
            if (wrapped) W.add(`${plural(wrapped, 'item')} in the list ${verb(wrapped, 'was', 'were')} a single value and became a one-cell row.`);
            let width = 0;
            all.forEach((l) => { if (l.length > width) width = l.length; });
            if (width * all.length > LIMITS.cells) throw tooManyCells(width * all.length, format);
            const cell = (x) => (isContainer(x) ? jsonText(x, 0, format) : (x === undefined ? null : x));
            const fill = (l) => {
                const r = new Array(width);
                for (let i = 0; i < width; i++) r[i] = i < l.length ? cell(l[i]) : null;
                return r;
            };
            const columns = [];
            if (header) {
                const head = fill(all[0]);
                head.forEach((h, i) => columns.push(h === null || h === '' ? `column${i + 1}` : scalarText(h)));
                return { columns, head, rows: all.slice(1).map(fill) };
            }
            for (let i = 0; i < width; i++) columns.push(`column${i + 1}`);
            return { columns, head: null, rows: all.map(fill) };
        }

        if (items.length > LIMITS.cells) throw tooManyCells(items.length, format);
        return { columns: ['value'], head: ['value'], rows: items.map((x) => [x === undefined ? null : x]) };
    }

    /* ── Reading ──────────────────────────────────────────────────────── */

    /** Fields per record for the first records, quotes respected (a heuristic). */
    function sampleCounts(text, delim, maxRecords) {
        const counts = [];
        const d = delim.charCodeAt(0);
        let fields = 1;
        let inQuote = false;
        let atStart = true;
        let content = false;
        for (let i = 0; i < text.length && counts.length < maxRecords; i++) {
            const c = text.charCodeAt(i);
            if (inQuote) {
                if (c === 34) {
                    if (text.charCodeAt(i + 1) === 34) i++;
                    else inQuote = false;
                }
                continue;
            }
            if (c === 34 && atStart) { inQuote = true; atStart = false; content = true; continue; }
            if (c === d) { fields++; atStart = true; content = true; continue; }
            if (c === 10 || c === 13) {
                if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
                if (content) counts.push(fields);
                fields = 1;
                atStart = true;
                content = false;
                continue;
            }
            if (c !== 32) atStart = false;
            content = true;
        }
        if (content && counts.length < maxRecords) counts.push(fields);
        return counts;
    }

    function consistency(counts) {
        if (!counts.length) return { mode: 0, share: 0 };
        const freq = new Map();
        counts.forEach((c) => freq.set(c, (freq.get(c) || 0) + 1));
        let mode = 0;
        let best = 0;
        freq.forEach((n, k) => { if (n > best || (n === best && k > mode)) { mode = k; best = n; } });
        return { mode, share: best / counts.length };
    }

    function autoDelimiter(text) {
        const sample = text.slice(0, SAMPLE_CHARS);
        let best = ',';
        let bestScore = 0;
        [',', ';', '\t', '|'].forEach((d) => {
            const { mode, share } = consistency(sampleCounts(sample, d, 50));
            const score = mode >= 2 ? share : 0;
            if (score > bestScore) { best = d; bestScore = score; }
        });
        return best;
    }

    /** RFC 4180 records → arrays of strings. Blank lines are skipped. */
    function readRows(text, delim, trim, W, format) {
        const n = text.length;
        const d = delim.charCodeAt(0);
        const locate = makeLocator(text);
        const isPad = (c) => c === 32 || (c === 9 && d !== 9);
        const rows = [];
        let row = [];
        let quotedRow = false;
        let cells = 0;
        let junk = 0;
        let firstJunk = null;
        let i = 0;
        for (;;) {
            let j = i;
            if (trim) while (j < n && isPad(text.charCodeAt(j))) j++;
            let value;
            if (j < n && text.charCodeAt(j) === 34) {
                const open = j;
                let buf = '';
                let k = j + 1;
                for (;;) {
                    const q = text.indexOf('"', k);
                    if (q < 0) {
                        const p = locate(open);
                        throw fail(`Line ${p.line}, column ${p.column}: this quoted field never ends — add the closing double quote (").`, p, format);
                    }
                    if (text.charCodeAt(q + 1) === 34) { buf += text.slice(k, q + 1); k = q + 2; continue; }
                    buf += text.slice(k, q);
                    k = q + 1;
                    break;
                }
                let m = k;
                if (trim) while (m < n && isPad(text.charCodeAt(m))) m++;
                if (m < n) {
                    const c = text.charCodeAt(m);
                    if (c !== d && c !== 10 && c !== 13) {
                        let e = m;
                        while (e < n) {
                            const x = text.charCodeAt(e);
                            if (x === d || x === 10 || x === 13) break;
                            e++;
                        }
                        junk++;
                        if (!firstJunk) firstJunk = locate(k);
                        buf += text.slice(k, e);
                        m = e;
                    }
                }
                value = buf;
                i = m;
                quotedRow = true;
            } else {
                let e = j;
                while (e < n) {
                    const c = text.charCodeAt(e);
                    if (c === d || c === 10 || c === 13) break;
                    e++;
                }
                value = text.slice(j, e);
                if (trim) {
                    let end = value.length;
                    while (end > 0 && isPad(value.charCodeAt(end - 1))) end--;
                    value = value.slice(0, end);
                }
                i = e;
            }
            row.push(value);
            if (++cells > LIMITS.cells) throw fail(`This table has more than ${commas(LIMITS.cells)} cells, which is convertMan's limit.`, null, format);
            if (i < n && text.charCodeAt(i) === d) { i++; continue; }
            if (row.length === 1 && row[0] === '' && !quotedRow) cells--;
            else rows.push(row);
            row = [];
            quotedRow = false;
            if (i >= n) break;
            if (text.charCodeAt(i) === 13 && text.charCodeAt(i + 1) === 10) i += 2;
            else i++;
            if (i >= n) break;
        }
        if (junk) {
            W.add(`Line ${firstJunk.line}, column ${firstJunk.column}: text after a closing quote was kept as part of the field${junk > 1 ? ` (${commas(junk)} places in all)` : ''}.`);
        }
        return rows;
    }

    function shapeRows(rows, o, W) {
        if (!rows.length) { W.add('There are no rows in this input.'); return []; }
        const conv = o.inferTypes ? (s) => inferScalar(s, null) : (s) => s;
        if (!o.header) return rows.map((r) => r.map(conv));
        const used = new Set();
        const names = [];
        let blank = 0;
        let repeated = 0;
        const claim = (base) => {
            let name = base;
            let k = 2;
            while (used.has(name)) name = `${base}_${k++}`;
            if (name !== base) repeated++;
            used.add(name);
            return name;
        };
        rows[0].forEach((h, i) => {
            if (h === '') blank++;
            names.push(claim(h === '' ? `column${i + 1}` : h));
        });
        const headerWidth = names.length;
        let width = headerWidth;
        for (let r = 1; r < rows.length; r++) if (rows[r].length > width) width = rows[r].length;
        for (let i = headerWidth; i < width; i++) names.push(claim(`column${i + 1}`));
        const missing = o.inferTypes ? null : '';
        let short = 0;
        let long = 0;
        const out = [];
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (row.length < headerWidth) short++;
            else if (row.length > headerWidth) long++;
            const m = new Map();
            for (let i = 0; i < width; i++) m.set(names[i], i < row.length ? conv(row[i]) : missing);
            out.push(m);
        }
        if (blank) W.add(`${plural(blank, 'header cell')} ${verb(blank, 'was', 'were')} empty and got a name such as column${rows[0].indexOf('') + 1}.`);
        if (repeated) W.add(`${plural(repeated, 'column name')} ${verb(repeated, 'was', 'were')} repeated and got a suffix such as _2 to keep ${verb(repeated, 'it', 'them')} apart.`);
        if (short) W.add(`${plural(short, 'row')} had fewer fields than the header; the missing cells were left empty.`);
        if (long) W.add(`${plural(long, 'row')} had more fields than the header; the extra fields went into columns named column${headerWidth + 1} and on.`);
        if (!out.length) W.add('There is a header row but no data rows.');
        return out;
    }

    /* ── Writing ──────────────────────────────────────────────────────── */

    function isRisky(v, s) {
        if (typeof v !== 'string' || !s) return false;
        const c = s.charCodeAt(0);
        if (c !== 61 && c !== 43 && c !== 45 && c !== 64 && c !== 9 && c !== 13) return false;
        return !PLAIN_NUMBER.test(s);
    }

    function writeDelimited(value, o, delim, format) {
        const W = warnings();
        const t = tabulate(value, o, W, format);
        const eol = o.lineEnding === 'CRLF' ? '\r\n' : '\n';
        const quoteAll = o.quote === 'all';
        let risky = 0;
        const cell = (v) => {
            let s = scalarText(v);
            if (isRisky(v, s)) {
                risky++;
                if (o.protectFormulas) s = `'${s}`;
            }
            if (quoteAll || s.indexOf(delim) >= 0 || /["\r\n]/.test(s) || /^[ \t]|[ \t]$/.test(s)) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };
        const lines = [];
        if (o.header && t.head && t.head.length) lines.push(t.head.map(cell).join(delim) || '""');
        t.rows.forEach((r) => {
            const line = r.map(cell).join(delim);
            lines.push(line === '' ? '""' : line);
        });
        if (!t.rows.length) W.add('There are no rows to write.');
        if (risky && o.protectFormulas) {
            W.add(`${plural(risky, 'cell')} that start${verb(risky, 's', '')} with =, +, - or @ ${verb(risky, 'was', 'were')} prefixed with ' so spreadsheets show ${verb(risky, 'it', 'them')} as text.`);
        } else if (risky) {
            W.add(`${plural(risky, 'cell')} start${verb(risky, 's', '')} with =, +, - or @ and could run as a formula when opened in a spreadsheet. Turn on "Protect formula cells" to make ${verb(risky, 'it', 'them')} plain text.`);
        }
        return { text: lines.length ? lines.join(eol) + eol : '', warnings: W.list };
    }

    /* ── Detection ────────────────────────────────────────────────────── */

    function scoreDelimiter(sample, delim, top) {
        const counts = sampleCounts(sample, delim, 30);
        const { mode, share } = consistency(counts);
        if (mode < 2) return 0;
        let score = counts.length === 1 ? top * 0.4 : top * (0.25 + 0.75 * share * share);
        const lines = sample.split(/\r\n|\n|\r/).filter((l) => l.trim());
        const indented = lines.filter((l) => l[0] === delim).length;
        if (lines.length && indented / lines.length > 0.5) score *= 0.3;
        return score;
    }

    function detectDelimited(text, tsv) {
        if (typeof text !== 'string' || !text) return 0;
        let s = text.slice(0, DETECT_CHARS);
        if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
        const lead = s.trimStart();
        if (!lead) return 0;
        const c0 = lead[0];
        if (c0 === '{' || c0 === '<') return 0.02;
        if (c0 === '[') return 0.05;
        if (text.length > DETECT_CHARS) {
            const nl = s.lastIndexOf('\n');
            if (nl > 0) s = s.slice(0, nl);
        }
        if (tsv) return scoreDelimiter(s, '\t', 0.8);
        const lines = s.split(/\r\n|\n|\r/);
        const markdown = lines.some((l, i) => /\|/.test(l) && i + 1 < lines.length
            && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]) && /\|/.test(lines[i + 1]));
        let best = 0;
        [[',', 0.75], [';', 0.7], ['|', markdown ? 0 : 0.55]].forEach(([d, top]) => {
            if (top) best = Math.max(best, scoreDelimiter(s, d, top));
        });
        return Math.round(best * 1000) / 1000;
    }

    /* ── Options, samples and modules ─────────────────────────────────── */

    const DELIMS = [
        { value: ',', label: 'Comma (,)' },
        { value: ';', label: 'Semicolon (;)' },
        { value: 'tab', label: 'Tab' },
        { value: '|', label: 'Pipe (|)' }
    ];
    const HEADER_IN = { key: 'header', label: 'First row is the header', type: 'checkbox', default: true, help: 'On: each row becomes a record keyed by the column names. Off: each row becomes a plain list.' };
    const INFER = { key: 'inferTypes', label: 'Infer types', type: 'checkbox', default: true, help: 'Read 42 and 3.5 as numbers, true and false as booleans, and empty cells as null. Codes with leading zeros, such as 007, stay text.' };
    const TRIM = { key: 'trim', label: 'Trim spaces', type: 'checkbox', default: false, help: 'Remove spaces around each field, including spaces before an opening quote.' };
    const OUTPUT_COMMON = [
        { key: 'header', label: 'First row is the header', type: 'checkbox', default: true, help: 'Records: write the column names as the first row. Lists of lists: the first list is the header row.' },
        { key: 'quote', label: 'Quote fields', type: 'select', choices: [{ value: 'needed', label: 'Only when needed' }, { value: 'all', label: 'Every field' }], default: 'needed', help: 'Fields that hold the delimiter, a quote, a line break, or leading or trailing spaces are always quoted.' },
        { key: 'lineEnding', label: 'Line ending', type: 'select', choices: [{ value: 'LF', label: 'LF (macOS, Linux)' }, { value: 'CRLF', label: 'CRLF (Windows, Excel)' }], default: 'LF', help: 'The characters that end each row. Some Windows programs expect CRLF.' },
        { key: 'nested', label: 'Nested values', type: 'select', choices: [{ value: 'dot', label: 'Dot-path columns (a.b)' }, { value: 'json', label: 'JSON text in one cell' }], default: 'dot', help: 'How records inside records, and lists inside records, become columns.' },
        { key: 'protectFormulas', label: 'Protect formula cells', type: 'checkbox', default: false, help: "Put ' in front of cells that start with =, +, - or @ so a spreadsheet shows them as text instead of running them as formulas." }
    ];

    const CSV_SAMPLE = [
        'id,name,email,city,joined,active',
        '1,Ada Lovelace,ada@example.com,London,2024-03-01,true',
        '2,"Hopper, Grace",grace@example.com,New York,2023-11-15,false',
        '3,Alan Turing,alan@example.com,Manchester,2025-01-20,true',
        '4,"Katherine ""Kay"" Johnson",kay@example.com,Hampton,2022-08-09,true',
        ''
    ].join('\n');
    const TSV_SAMPLE = [
        'sku\tproduct\tprice\tin_stock\tnotes',
        'A-100\tDesk lamp\t24.99\t12\tWarm white, dimmable',
        'A-101\tMonitor arm\t89.00\t0\tBack in stock next week',
        'B-205\tUSB-C hub\t39.50\t48\t',
        ''
    ].join('\n');

    function makeModule(id) {
        const tsv = id === 'tsv';
        const inputOptions = tsv
            ? [HEADER_IN, INFER, TRIM]
            : [{ key: 'delimiter', label: 'Delimiter', type: 'select', choices: [{ value: 'auto', label: 'Auto-detect' }].concat(DELIMS), default: 'auto', help: 'The character between fields. Auto-detect picks the one that splits the first rows most evenly.' }, HEADER_IN, INFER, TRIM];
        const outputOptions = tsv
            ? OUTPUT_COMMON
            : [{ key: 'delimiter', label: 'Delimiter', type: 'select', choices: DELIMS, default: ',', help: 'The character written between fields.' }].concat(OUTPUT_COMMON);
        return {
            id,
            label: tsv ? 'TSV' : 'CSV',
            extensions: tsv ? ['tsv', 'tab'] : ['csv'],
            mime: tsv ? 'text/tab-separated-values' : 'text/csv',
            kind: 'table',
            canParse: true,
            canStringify: true,
            detect(text) {
                try { return detectDelimited(text, tsv); } catch (err) { return 0; }
            },
            parse(text, opts) {
                const o = readOptions(inputOptions, opts);
                const src = prepare(text, id);
                const W = warnings();
                let delim = '\t';
                if (!tsv) delim = o.delimiter === 'auto' ? autoDelimiter(src) : (o.delimiter === 'tab' ? '\t' : o.delimiter);
                const rows = readRows(src, delim, o.trim, W, id);
                return { value: shapeRows(rows, o, W), warnings: W.list };
            },
            stringify(value, opts) {
                const o = readOptions(outputOptions, opts);
                const delim = tsv || o.delimiter === 'tab' ? '\t' : o.delimiter;
                return writeDelimited(value, o, delim, id);
            },
            inputOptions,
            outputOptions,
            sample: tsv ? TSV_SAMPLE : CSV_SAMPLE,
            notes: tsv
                ? 'TSV holds one flat table with tab-separated fields, as spreadsheets copy it. Nested data becomes dot-path columns (or JSON text), and numbers and true / false are guessed when it is read back.'
                : 'CSV holds one flat table of text. Nested data becomes dot-path columns (or JSON text), and types such as numbers, true / false and null are guessed when it is read back.'
        };
    }

    return { csv: makeModule('csv'), tsv: makeModule('tsv') };
});
