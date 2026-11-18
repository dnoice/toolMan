/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: WebFormats (convertMan Edition - v1.0)
 *     - File Name: web.js
 *     - Relative Path: tools/convertman/js/formats/web.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Four web-flavoured formats for convertMan's converter: URL query
 *     strings and Markdown tables (read and write), HTML tables and SQL
 *     INSERT statements (write only). Each speaks convertMan's data model,
 *     so a JSON list of records can become a Markdown table for a README,
 *     an HTML table for an email, or INSERT statements for a database.
 *
 * ✒ Key Features:
 *     - Query strings: a leading "?" or a whole URL accepted, + as a space,
 *       bad %-escapes kept as typed with a warning, repeated keys → lists,
 *       bracket nesting a[b][c]=1 and a[]=1 (optional)
 *     - Query safety caps: brackets nest at most 20 deep (the rest stays one
 *       key name) and list indexes above 1,000 become record keys, so
 *       a[99999999]=1 never allocates a huge list
 *     - Query writer: percent-encoding, nested records as brackets, lists as
 *       a[]=x, repeated keys or a[0]=x, optional leading "?"
 *     - Markdown: GitHub-style tables with optional outer pipes, escaped \|
 *       pipes, alignment rows and <br> line breaks; the first table in a
 *       document is read, with type inference
 *     - Markdown writer: padded columns, alignment (auto right-aligns number
 *       columns, or left / center / right), pipes escaped, newlines → <br>
 *     - HTML writer: <table> with <thead> and <tbody>, an optional caption,
 *       every cell and heading escaped (a <script> cell stays text)
 *     - SQL writer: ANSI, MySQL, PostgreSQL and SQLite identifier quoting
 *       and booleans, quotes doubled (and backslashes doubled for MySQL),
 *       NULL for null, rows per statement, optional CREATE TABLE with
 *       inferred column types
 *     - Shared tabular rules: records → rows with the union of keys, nested
 *       values as dot-path columns or JSON text, lists of lists with an
 *       optional header row, lists of plain values as a "value" column
 *     - Caps: 20 MB of text, 2,000,000 query values, 5,000,000 table cells
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the file registers the query,
 *     markdown, html and sql modules on window.ConvertFormats. Node:
 *     require('./web.js') returns { query, markdown, html, sql }. Modules
 *     with canParse false throw a plain error from parse() and detect() as
 *     0. Option keys are listed in each module's inputOptions and
 *     outputOptions; missing or invalid values fall back to the defaults.
 *
 * ✒ Examples:
 *     query.parse('?a=1&b=x+y').value               → Map { a: '1', b: 'x y' }
 *     query.parse('tag=a&tag=b').value              → Map { tag: ['a', 'b'] }
 *     query.parse('user[name]=Ada&ids[]=1&ids[]=2').value → Map { user: Map { name: 'Ada' }, ids: ['1', '2'] }
 *     query.stringify(new Map([['q', 'a b'], ['p', new Map([['x', 1]])]])).text → 'q=a%20b&p[x]=1'
 *     markdown.parse('| a | b |\n|---|--:|\n| 1 | x \\| y |').value → [Map { a: 1, b: 'x | y' }]
 *     markdown.stringify([new Map([['n', 1]])]).text   → '|   n |\n| --: |\n|   1 |\n'
 *     html.stringify([new Map([['x', '<script>']])]).text → '… <td>&lt;script&gt;</td> …'
 *     sql.stringify([new Map([['name', "O'Brien"]])], { dialect: 'mysql' }).text → "INSERT INTO `data` (`name`) VALUES\n  ('O''Brien');\n"
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers; Node 16+
 *     - Security: hand-written bounded parsers; query keys become Map keys,
 *       so __proto__ and constructor are ordinary names; every HTML cell is
 *       escaped; SQL strings and identifiers are quoted per dialect
 *     - Limitations: query strings hold only text (null and empty both
 *       write as "key="); Markdown and HTML tables hold one flat table;
 *       HTML and SQL cannot be read back here; CREATE TABLE types are a
 *       best guess from the values present
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
        nodes: 2000000,
        cells: 5000000,
        bracketDepth: 20,
        arrayIndex: 1000,
        bigDigits: 400
    });
    const DETECT_CHARS = 4096;

    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isMap = (v) => v instanceof Map;
    const isContainer = (v) => v instanceof Map || Array.isArray(v);
    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const verb = (n, one, many) => (n === 1 ? one : many);
    const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

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
            const s = String(v).toLowerCase();
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

    const INT_RE = /^-?(?:0|[1-9]\d*)$/;
    const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

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

    /* ── Tabular rules (same shape as csv.js; kept local by design) ───── */

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

    /** Any value → { columns, rows } with scalar cells (see the contract's tabular rules). */
    function tabulate(value, o, W, format) {
        const nested = o.nested === 'json' ? 'json' : 'dot';
        const header = o.header !== false;
        if (!isContainer(value)) throw fail('A table needs rows — this data is a single value.', null, format);
        const items = isMap(value) ? [value] : value;
        if (!items.length) return { columns: [], rows: [] };
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
            return { columns, rows: flats.map((f) => columns.map((c) => (f.has(c) ? f.get(c) : null))) };
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
                fill(all[0]).forEach((h, i) => columns.push(h === null || h === '' ? `column${i + 1}` : scalarText(h)));
                return { columns, rows: all.slice(1).map(fill) };
            }
            for (let i = 0; i < width; i++) columns.push(`column${i + 1}`);
            return { columns, rows: all.map(fill) };
        }

        if (items.length > LIMITS.cells) throw tooManyCells(items.length, format);
        return { columns: ['value'], rows: items.map((x) => [x === undefined ? null : x]) };
    }

    const NESTED_OPTION = { key: 'nested', label: 'Nested values', type: 'select', choices: [{ value: 'dot', label: 'Dot-path columns (a.b)' }, { value: 'json', label: 'JSON text in one cell' }], default: 'dot', help: 'How records inside records, and lists inside records, become columns.' };
    const HEADER_OPTION = { key: 'header', label: 'First row is the header', type: 'checkbox', default: true, help: 'For a list of lists, use the first list as the column names. Off names the columns column1, column2, and so on.' };

    /* ── Query string: reading ────────────────────────────────────────── */

    const HEX = /^[0-9A-Fa-f]{2}$/;

    function decodePart(s, counter) {
        let t = s.indexOf('+') >= 0 ? s.replace(/\+/g, ' ') : s;
        if (t.indexOf('%') < 0) return t;
        try { return decodeURIComponent(t); } catch (err) { /* fall through to the careful path */ }
        let out = '';
        let i = 0;
        while (i < t.length) {
            if (t[i] !== '%') {
                const next = t.indexOf('%', i);
                const end = next < 0 ? t.length : next;
                out += t.slice(i, end);
                i = end;
                continue;
            }
            let j = i;
            while (j < t.length && t[j] === '%' && HEX.test(t.slice(j + 1, j + 3))) j += 3;
            if (j === i) { out += '%'; counter.bad++; i++; continue; }
            const run = t.slice(i, j);
            try { out += decodeURIComponent(run); } catch (err) { out += run; counter.bad++; }
            i = j;
        }
        t = out;
        return t;
    }

    /** "a[b][]" → ['a', 'b', ''] within the depth cap; malformed keys stay whole. */
    function splitKey(key, state) {
        const open = key.indexOf('[');
        if (open <= 0) return [key];
        const segs = [key.slice(0, open)];
        let i = open;
        while (i < key.length) {
            if (key[i] !== '[') return [key];
            const closeAt = key.indexOf(']', i + 1);
            if (closeAt < 0) return [key];
            if (segs.length > LIMITS.bracketDepth) {
                segs.push(key.slice(i));
                state.deep++;
                return segs;
            }
            segs.push(key.slice(i + 1, closeAt));
            i = closeAt + 1;
        }
        return segs;
    }

    const INDEX_RE = /^(?:0|[1-9]\d{0,3})$/;

    function parseQuery(text, o) {
        const src = prepare(text, 'query').trim();
        const W = warnings();
        let s = src;
        const isUrl = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(s);
        const q = s.indexOf('?');
        const firstEq = s.indexOf('=');
        if (q >= 0 && (isUrl || firstEq < 0 || q < firstEq)) s = s.slice(q + 1);
        else if (isUrl) {
            W.add('This URL has no query string (nothing after "?").');
            s = '';
        }
        const hash = s.indexOf('#');
        if (hash >= 0) {
            if (hash < s.length - 1) W.add('The #fragment at the end was left out — it is not part of the query string.');
            s = s.slice(0, hash);
        }
        const counter = { bad: 0 };
        const state = { deep: 0, gaps: 0, conflicts: 0, dupIndex: 0, nodes: 0 };
        const rootNode = { kind: 'obj', map: new Map() };
        const bump = () => {
            if (++state.nodes > LIMITS.nodes) throw fail(`This query string has more than ${commas(LIMITS.nodes)} values, which is convertMan's limit.`, null, 'query');
        };
        const pairs = s.split(/[&\r\n]+/);
        pairs.forEach((pair) => {
            if (!pair) return;
            bump();
            const eq = pair.indexOf('=');
            const rawKey = eq < 0 ? pair : pair.slice(0, eq);
            const rawValue = eq < 0 ? '' : pair.slice(eq + 1);
            const key = decodePart(rawKey, counter);
            const value = decodePart(rawValue, counter);
            const segs = o.brackets ? splitKey(key, state) : [key];
            assign(rootNode, segs, value, state, bump);
        });
        if (counter.bad) W.add(`${plural(counter.bad, '%-escape')} ${verb(counter.bad, 'was', 'were')} not valid (such as %zz, a lone %, or a broken UTF-8 sequence) and ${verb(counter.bad, 'was', 'were')} kept as typed.`);
        if (state.deep) W.add(`${plural(state.deep, 'key')} nested more than ${LIMITS.bracketDepth} brackets deep; the rest of ${verb(state.deep, 'that key', 'those keys')} was kept as one name.`);
        if (state.gaps) W.add('Some list positions were skipped (such as a[2] with nothing at a[0]); the items were kept in order without gaps.');
        if (state.conflicts) W.add(`${plural(state.conflicts, 'name')} ${verb(state.conflicts, 'was', 'were')} used both as a single value and as a group; the group was kept.`);
        if (state.dupIndex) W.add(`${plural(state.dupIndex, 'list position')} ${verb(state.dupIndex, 'was', 'were')} given more than once; the last value was kept.`);
        return { value: finish(rootNode), warnings: W.list };
    }

    function toObj(node) {
        if (node.kind === 'obj') return;
        const map = new Map();
        [...node.slots.keys()].sort((a, b) => a - b).forEach((k) => map.set(String(k), node.slots.get(k)));
        node.kind = 'obj';
        node.map = map;
        delete node.slots;
        delete node.max;
    }

    function assign(rootNode, segs, value, state, bump) {
        let node = rootNode;
        for (let d = 0; d < segs.length; d++) {
            const seg = segs[d];
            const last = d === segs.length - 1;
            let kind = 'key';
            if (d > 0 && seg === '') kind = 'push';
            else if (d > 0 && INDEX_RE.test(seg) && Number(seg) <= LIMITS.arrayIndex) kind = 'index';
            if (node.kind === 'arr' && kind === 'key') toObj(node);
            let slot;
            if (node.kind === 'obj') {
                if (kind === 'push') {
                    // A counter that only grows keeps a long run of pushes linear.
                    let k = node.next || 0;
                    while (node.map.has(String(k))) k++;
                    node.next = k + 1;
                    slot = String(k);
                } else {
                    slot = seg;
                }
            } else if (kind === 'push') {
                slot = node.max + 1;
            } else {
                slot = Number(seg);
            }
            const get = () => (node.kind === 'obj' ? node.map.get(slot) : node.slots.get(slot));
            const set = (v) => {
                if (node.kind === 'obj') node.map.set(slot, v);
                else {
                    node.slots.set(slot, v);
                    if (slot > node.max) node.max = slot;
                }
            };
            const existing = get();
            if (last) {
                if (existing === undefined) { set(value); return; }
                if (typeof existing === 'string') {
                    if (node.kind === 'arr' && kind === 'index') { state.dupIndex++; set(value); return; }
                    bump();
                    set({ kind: 'arr', slots: new Map([[0, existing], [1, value]]), max: 1 });
                    return;
                }
                if (existing.kind === 'arr') { existing.max += 1; existing.slots.set(existing.max, value); return; }
                state.conflicts++;
                return;
            }
            const nextSeg = segs[d + 1];
            const wantsList = nextSeg === '' || (INDEX_RE.test(nextSeg) && Number(nextSeg) <= LIMITS.arrayIndex);
            if (existing === undefined || typeof existing === 'string') {
                if (typeof existing === 'string') state.conflicts++;
                bump();
                const child = wantsList ? { kind: 'arr', slots: new Map(), max: -1 } : { kind: 'obj', map: new Map() };
                set(child);
                node = child;
            } else {
                node = existing;
            }
        }
    }

    function finish(node) {
        if (typeof node === 'string') return node;
        if (node.kind === 'obj') {
            const out = new Map();
            node.map.forEach((v, k) => out.set(k, finish(v)));
            return out;
        }
        return [...node.slots.keys()].sort((a, b) => a - b).map((k) => finish(node.slots.get(k)));
    }

    /* ── Query string: writing ────────────────────────────────────────── */

    function stringifyQuery(value, o) {
        const W = warnings();
        let data = value;
        if (!isMap(value)) {
            data = new Map([['data', value]]);
            W.add('A query string needs named values, so the data was put under the name "data".');
        }
        const parts = [];
        let empties = 0;
        let nulls = 0;
        const enc = (s) => encodeURIComponent(s);
        const walk = (prefix, v, depth) => {
            if (depth > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.', null, 'query');
            if (isMap(v)) {
                if (!v.size) { empties++; return; }
                v.forEach((x, k) => walk(`${prefix}[${enc(String(k))}]`, x, depth + 1));
                return;
            }
            if (Array.isArray(v)) {
                if (!v.length) { empties++; return; }
                const complex = v.some(isContainer);
                v.forEach((x, i) => {
                    if (complex || o.arrays === 'index') walk(`${prefix}[${i}]`, x, depth + 1);
                    else if (o.arrays === 'repeat') walk(prefix, x, depth + 1);
                    else walk(`${prefix}[]`, x, depth + 1);
                });
                return;
            }
            if (v === null || v === undefined) nulls++;
            parts.push(`${prefix}=${enc(scalarText(v))}`);
        };
        data.forEach((x, k) => walk(enc(String(k)), x, 1));
        if (nulls) W.add(`A query string has no null — ${plural(nulls, 'null value was', 'null values were')} written as empty.`);
        if (empties) W.add(`${plural(empties, 'empty list or record', 'empty lists or records')} ${verb(empties, 'has', 'have')} no query-string form and ${verb(empties, 'was', 'were')} left out.`);
        const text = parts.join('&');
        return { text: o.questionMark && text ? `?${text}` : text, warnings: W.list };
    }

    function detectQuery(text) {
        if (typeof text !== 'string') return 0;
        const s = text.slice(0, DETECT_CHARS).replace(/^﻿/, '').trim();
        if (!s || /^[{[<"'#]/.test(s)) return 0;
        if (/[\r\n]/.test(s)) return 0.02;
        if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#]*\?[^\s]*=/.test(s)) return 0.85;
        if (/\s/.test(s)) return 0.02;
        if (s[0] === '?' && s.indexOf('=') > 0) return 0.9;
        if (/^[^=&]+=[^&]*(?:&[^&]*)+$/.test(s)) return 0.8;
        if (/^[^=&]+=[^&]*$/.test(s)) return 0.3;
        return 0;
    }

    /* ── Markdown tables ──────────────────────────────────────────────── */

    /** Split a table row on unescaped pipes; \| becomes |, outer pipes dropped. */
    function splitRow(line) {
        const t = line.trim();
        const cells = [];
        let cur = '';
        for (let i = 0; i < t.length; i++) {
            const c = t[i];
            if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
            if (c === '|') { cells.push(cur); cur = ''; continue; }
            cur += c;
        }
        cells.push(cur);
        if (t[0] === '|') cells.shift();
        if (cells.length && t.length > 1 && t[t.length - 1] === '|' && t[t.length - 2] !== '\\') cells.pop();
        return cells.map((c) => c.trim());
    }

    const ALIGN_CELL = /^:?-+:?$/;

    function tableStart(lines, i) {
        const head = lines[i];
        const div = lines[i + 1];
        if (head === undefined || div === undefined) return null;
        if (head.indexOf('|') < 0 || div.indexOf('|') < 0 || div.indexOf('-') < 0) return null;
        const aligns = splitRow(div);
        if (!aligns.length || !aligns.every((c) => ALIGN_CELL.test(c))) return null;
        const names = splitRow(head);
        if (names.length !== aligns.length) return null;
        return { names, aligns };
    }

    const BR = /<br\s*\/?>/gi;

    function parseMarkdown(text, o) {
        const src = prepare(text, 'markdown');
        const W = warnings();
        const lines = src.split(/\r\n|\n|\r/);
        let start = -1;
        let table = null;
        for (let i = 0; i + 1 < lines.length; i++) {
            table = tableStart(lines, i);
            if (table) { start = i; break; }
        }
        if (!table) {
            throw fail('No Markdown table was found. A table needs a header row such as | Name | Age | followed by a divider row such as | --- | --- |.', null, 'markdown');
        }
        const used = new Set();
        let repeated = 0;
        let blank = 0;
        const names = table.names.map((raw, i) => {
            const base = raw.replace(BR, ' ') || `column${i + 1}`;
            if (!raw) blank++;
            let name = base;
            let k = 2;
            while (used.has(name)) name = `${base}_${k++}`;
            if (name !== base) repeated++;
            used.add(name);
            return name;
        });
        const conv = o.inferTypes ? (s) => inferScalar(s, null) : (s) => s;
        const rows = [];
        let extra = 0;
        let cells = 0;
        let j = start + 2;
        for (; j < lines.length; j++) {
            const line = lines[j];
            if (!line.trim() || line.indexOf('|') < 0) break;
            const parts = splitRow(line);
            if (parts.length > names.length) extra++;
            cells += names.length;
            if (cells > LIMITS.cells) throw fail(`This table has more than ${commas(LIMITS.cells)} cells, which is convertMan's limit.`, null, 'markdown');
            const m = new Map();
            names.forEach((name, c) => m.set(name, conv(c < parts.length ? parts[c].replace(BR, '\n') : '')));
            rows.push(m);
        }
        let more = 0;
        for (let i = j; i + 1 < lines.length; i++) if (tableStart(lines, i)) { more++; i++; }
        if (blank) W.add(`${plural(blank, 'header cell')} ${verb(blank, 'was', 'were')} empty and got a name such as column1.`);
        if (repeated) W.add(`${plural(repeated, 'column name')} ${verb(repeated, 'was', 'were')} repeated and got a suffix such as _2.`);
        if (extra) W.add(`${plural(extra, 'row')} had more cells than the header; the extra cells were left out, as GitHub does.`);
        if (more) W.add(`Only the first table was read; ${plural(more, 'more table was', 'more tables were')} found after it.`);
        if (!rows.length) W.add('The table has a header but no rows.');
        return { value: rows, warnings: W.list };
    }

    function stringifyMarkdown(value, o) {
        const W = warnings();
        const t = tabulate(value, o, W, 'markdown');
        if (!t.columns.length) {
            W.add('There are no rows to write.');
            return { text: '', warnings: W.list };
        }
        const esc = (s) => s.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
        const head = t.columns.map((c) => esc(c));
        const body = t.rows.map((r) => r.map((v) => esc(scalarText(v))));
        const aligns = t.columns.map((_, c) => {
            if (o.align !== 'auto') return o.align;
            let numbers = 0;
            let others = 0;
            t.rows.forEach((r) => {
                const v = r[c];
                if (typeof v === 'number' || typeof v === 'bigint') numbers++;
                else if (v !== null && v !== undefined && v !== '') others++;
            });
            return numbers && !others ? 'right' : 'none';
        });
        const widths = head.map((h, c) => {
            let w = Math.max(3, h.length);
            body.forEach((r) => { if (r[c].length > w) w = r[c].length; });
            return Math.min(w, 40);
        });
        const pad = (s, c) => {
            const gap = widths[c] - s.length;
            if (gap <= 0) return s;
            if (aligns[c] === 'right') return ' '.repeat(gap) + s;
            if (aligns[c] === 'center') {
                const left = Math.floor(gap / 2);
                return ' '.repeat(left) + s + ' '.repeat(gap - left);
            }
            return s + ' '.repeat(gap);
        };
        const rule = (c) => {
            const w = widths[c];
            if (aligns[c] === 'left') return `:${'-'.repeat(w - 1)}`;
            if (aligns[c] === 'right') return `${'-'.repeat(w - 1)}:`;
            if (aligns[c] === 'center') return `:${'-'.repeat(w - 2)}:`;
            return '-'.repeat(w);
        };
        const line = (cells) => `| ${cells.map(pad).join(' | ')} |`;
        const out = [line(head), `| ${t.columns.map((_, c) => rule(c)).join(' | ')} |`];
        body.forEach((r) => out.push(line(r)));
        if (!t.rows.length) W.add('There are no rows to write; only the header was written.');
        return { text: `${out.join('\n')}\n`, warnings: W.list };
    }

    function detectMarkdown(text) {
        if (typeof text !== 'string' || !text) return 0;
        const lines = text.slice(0, DETECT_CHARS).replace(/^﻿/, '').split(/\r\n|\n|\r/).slice(0, 120);
        for (let i = 0; i + 1 < lines.length; i++) {
            if (tableStart(lines, i)) {
                const before = lines.slice(0, i).filter((l) => l.trim()).length;
                return before ? 0.85 : 0.95;
            }
        }
        return 0;
    }

    /* ── HTML tables (write only) ─────────────────────────────────────── */

    const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
    const escHtml = (s) => s.replace(/[&<>"']/g, (c) => HTML_ESC[c]);

    function stringifyHtml(value, o) {
        const W = warnings();
        const t = tabulate(value, o, W, 'html');
        if (!t.columns.length) {
            W.add('There are no rows to write.');
            return { text: '', warnings: W.list };
        }
        const cell = (v) => escHtml(scalarText(v)).replace(/\r\n|\r|\n/g, '<br>');
        const out = ['<table>'];
        const caption = o.caption.trim();
        if (caption) out.push(`  <caption>${escHtml(caption)}</caption>`);
        out.push('  <thead>');
        out.push(`    <tr>${t.columns.map((c) => `<th scope="col">${cell(c)}</th>`).join('')}</tr>`);
        out.push('  </thead>');
        out.push('  <tbody>');
        t.rows.forEach((r) => out.push(`    <tr>${r.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`));
        out.push('  </tbody>');
        out.push('</table>');
        if (!t.rows.length) W.add('There are no rows to write; only the header was written.');
        return { text: `${out.join('\n')}\n`, warnings: W.list };
    }

    /* ── SQL INSERT (write only) ──────────────────────────────────────── */

    const INT32 = 2147483647;
    const INT64 = 9223372036854775807n;

    function sqlType(dialect, info) {
        const { ints, floats, bools, strings, big, huge, maxLen } = info;
        const text = () => {
            if (dialect === 'ansi') return maxLen > 4000 ? 'CLOB' : `VARCHAR(${Math.max(1, maxLen)})`;
            if (dialect === 'mysql') return maxLen <= 255 ? 'VARCHAR(255)' : maxLen <= 65535 ? 'TEXT' : 'LONGTEXT';
            return 'TEXT';
        };
        if (strings || (bools && (ints || floats))) return text();
        if (bools) return dialect === 'sqlite' ? 'INTEGER' : 'BOOLEAN';
        if (floats) {
            if (dialect === 'sqlite') return 'REAL';
            return dialect === 'mysql' ? 'DOUBLE' : 'DOUBLE PRECISION';
        }
        if (ints) {
            if (dialect === 'sqlite') return huge ? 'NUMERIC' : 'INTEGER';
            if (huge) return dialect === 'mysql' ? 'DECIMAL(65,0)' : 'NUMERIC';
            if (big) return 'BIGINT';
            return dialect === 'mysql' ? 'INT' : 'INTEGER';
        }
        return text();
    }

    function stringifySql(value, o) {
        const W = warnings();
        const t = tabulate(value, o, W, 'sql');
        const dialect = o.dialect;
        const mysql = dialect === 'mysql';
        let nonFinite = 0;
        let nuls = 0;
        let blankNames = 0;

        const ident = (name) => {
            const s = String(name).replace(/\u0000/g, '');
            return mysql ? `\`${s.replace(/`/g, '``')}\`` : `"${s.replace(/"/g, '""')}"`;
        };
        const literal = (v) => {
            if (v === null || v === undefined) return 'NULL';
            const ty = typeof v;
            if (ty === 'boolean') {
                if (mysql || dialect === 'sqlite') return v ? '1' : '0';
                return v ? 'TRUE' : 'FALSE';
            }
            if (ty === 'number') {
                if (!Number.isFinite(v)) { nonFinite++; return 'NULL'; }
                return String(v);
            }
            if (ty === 'bigint') return v.toString();
            let s = scalarText(v);
            if (s.indexOf('\u0000') >= 0) { nuls++; s = s.replace(/\u0000/g, ''); }
            if (mysql) s = s.replace(/\\/g, '\\\\');
            return `'${s.replace(/'/g, '\'\'')}'`;
        };

        const rawTable = o.table.trim();
        let table = rawTable.replace(/[^A-Za-z0-9_]/g, '_');
        if (!table || /^_+$/.test(table)) table = 'data';
        if (/^[0-9]/.test(table)) table = `t_${table}`;
        if (rawTable && table !== rawTable) W.add(`The table name "${clip(rawTable, 40)}" was changed to "${table}" (letters, digits and _ only).`);

        const columns = t.columns.map((c, i) => {
            if (String(c).replace(/\u0000/g, '') === '') { blankNames++; return `column${i + 1}`; }
            return c;
        });
        const out = [];
        if (o.createTable) {
            if (!columns.length) {
                W.add('There are no columns, so no CREATE TABLE statement was written.');
            } else {
                const defs = columns.map((c, col) => {
                    const info = { ints: 0, floats: 0, bools: 0, strings: 0, big: false, huge: false, maxLen: 0 };
                    t.rows.forEach((r) => {
                        const v = r[col];
                        const ty = typeof v;
                        if (v === null || v === undefined) return;
                        if (ty === 'boolean') info.bools++;
                        else if (ty === 'number') {
                            if (Number.isInteger(v)) {
                                info.ints++;
                                if (Math.abs(v) > INT32) info.big = true;
                            } else info.floats++;
                        } else if (ty === 'bigint') {
                            info.ints++;
                            info.big = true;
                            if (v > INT64 || v < -INT64 - 1n) info.huge = true;
                        } else {
                            info.strings++;
                            const len = scalarText(v).length;
                            if (len > info.maxLen) info.maxLen = len;
                        }
                    });
                    return `  ${ident(c)} ${sqlType(dialect, info)}`;
                });
                out.push(`CREATE TABLE ${ident(table)} (\n${defs.join(',\n')}\n);`);
            }
        }
        if (t.rows.length && columns.length) {
            const head = `INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')}) VALUES`;
            const per = o.rowsPerStatement;
            for (let i = 0; i < t.rows.length; i += per) {
                const chunk = t.rows.slice(i, i + per).map((r) => `  (${r.map(literal).join(', ')})`);
                out.push(`${head}\n${chunk.join(',\n')};`);
            }
        } else {
            W.add('There are no rows to insert.');
        }
        if (blankNames) W.add(`${plural(blankNames, 'column')} had no name and ${verb(blankNames, 'was', 'were')} named column1, column2, and so on.`);
        if (nonFinite) W.add(`SQL has no NaN or Infinity — ${plural(nonFinite, 'value was', 'values were')} written as NULL.`);
        if (nuls) W.add(`${plural(nuls, 'text value')} held a NUL character, which databases reject; ${verb(nuls, 'it was', 'they were')} removed.`);
        return { text: out.length ? `${out.join('\n\n')}\n` : '', warnings: W.list };
    }

    /* ── Modules ──────────────────────────────────────────────────────── */

    const writeOnly = (label) => () => {
        throw fail(`${label} can only be written here, not read. Pick it as the output format instead.`, null, label === 'SQL INSERT' ? 'sql' : 'html');
    };

    const query = {
        id: 'query',
        label: 'Query string',
        extensions: ['txt'],
        mime: 'application/x-www-form-urlencoded',
        kind: 'flat',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectQuery(text); } catch (err) { return 0; }
        },
        parse(text, opts) {
            return parseQuery(text, readOptions(query.inputOptions, opts));
        },
        stringify(value, opts) {
            return stringifyQuery(value, readOptions(query.outputOptions, opts));
        },
        inputOptions: [
            { key: 'brackets', label: 'Read brackets as nesting', type: 'checkbox', default: true, help: 'a[b]=1 becomes "b" inside "a", and a[]=1 adds to a list. Off keeps "a[b]" as one name.' }
        ],
        outputOptions: [
            { key: 'arrays', label: 'Lists', type: 'select', choices: [{ value: 'brackets', label: 'Brackets: a[]=1&a[]=2' }, { value: 'repeat', label: 'Repeated keys: a=1&a=2' }, { value: 'index', label: 'Positions: a[0]=1&a[1]=2' }], default: 'brackets', help: 'How a list of plain values is written. Lists of records always use positions.' },
            { key: 'questionMark', label: 'Start with ?', type: 'checkbox', default: false, help: 'Put a "?" in front, ready to paste after a URL path.' }
        ],
        sample: 'https://shop.example.com/search?q=wireless+headphones&category=audio&price[min]=50&price[max]=200&tags[]=bluetooth&tags[]=noise%20cancelling&sort=rating&page=2',
        notes: 'A query string holds text values under names, with brackets (a[b]=1, a[]=1) for nesting and lists. Every value becomes text, null becomes empty, and empty lists or records are left out.'
    };

    const markdown = {
        id: 'markdown',
        label: 'Markdown table',
        extensions: ['md', 'markdown'],
        mime: 'text/markdown',
        kind: 'table',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectMarkdown(text); } catch (err) { return 0; }
        },
        parse(text, opts) {
            return parseMarkdown(text, readOptions(markdown.inputOptions, opts));
        },
        stringify(value, opts) {
            return stringifyMarkdown(value, readOptions(markdown.outputOptions, opts));
        },
        inputOptions: [
            { key: 'inferTypes', label: 'Infer types', type: 'checkbox', default: true, help: 'Read 42 and 3.5 as numbers, true and false as booleans, and empty cells as null.' }
        ],
        outputOptions: [
            { key: 'align', label: 'Alignment', type: 'select', choices: [{ value: 'auto', label: 'Auto (numbers right)' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], default: 'auto', help: 'How the divider row aligns each column. Auto right-aligns columns that hold only numbers.' },
            NESTED_OPTION,
            HEADER_OPTION
        ],
        sample: [
            '| Planet  | Moons | Rings | Distance (AU) | Notes                     |',
            '| :------ | ----: | :---: | ------------: | ------------------------- |',
            '| Mercury |     0 | false |          0.39 | Closest to the Sun        |',
            '| Earth   |     1 | false |          1.00 | Home                      |',
            '| Jupiter |    95 | true  |          5.20 | Largest \\| gas giant      |',
            '| Saturn  |   146 | true  |          9.58 | Rings<br>are mostly ice   |',
            ''
        ].join('\n'),
        notes: 'A Markdown table holds one flat table of text with optional column alignment. Nested data becomes dot-path columns (or JSON text), line breaks become <br>, and numbers and true / false are guessed when read back.'
    };

    const html = {
        id: 'html',
        label: 'HTML table',
        extensions: ['html', 'htm'],
        mime: 'text/html',
        kind: 'table',
        canParse: false,
        canStringify: true,
        detect() { return 0; },
        parse: writeOnly('HTML table'),
        stringify(value, opts) {
            return stringifyHtml(value, readOptions(html.outputOptions, opts));
        },
        inputOptions: [],
        outputOptions: [
            { key: 'caption', label: 'Caption', type: 'text', default: '', help: 'Optional title shown above the table.' },
            NESTED_OPTION,
            HEADER_OPTION
        ],
        sample: [
            '<table>',
            '  <caption>Team</caption>',
            '  <thead>',
            '    <tr><th scope="col">name</th><th scope="col">role</th></tr>',
            '  </thead>',
            '  <tbody>',
            '    <tr><td>Ada</td><td>Engineer</td></tr>',
            '    <tr><td>Grace</td><td>Admiral &amp; teacher</td></tr>',
            '  </tbody>',
            '</table>',
            ''
        ].join('\n'),
        notes: 'An HTML table shows one flat table in a web page or email, with every cell escaped. It can only be written here; nested data becomes dot-path columns (or JSON text) and types become plain text.'
    };

    const sql = {
        id: 'sql',
        label: 'SQL INSERT',
        extensions: ['sql'],
        mime: 'application/sql',
        kind: 'table',
        canParse: false,
        canStringify: true,
        detect() { return 0; },
        parse: writeOnly('SQL INSERT'),
        stringify(value, opts) {
            return stringifySql(value, readOptions(sql.outputOptions, opts));
        },
        inputOptions: [],
        outputOptions: [
            { key: 'table', label: 'Table name', type: 'text', default: 'data', help: 'Letters, digits and _ only; anything else becomes _.' },
            { key: 'dialect', label: 'Dialect', type: 'select', choices: [{ value: 'ansi', label: 'ANSI SQL' }, { value: 'mysql', label: 'MySQL / MariaDB' }, { value: 'postgresql', label: 'PostgreSQL' }, { value: 'sqlite', label: 'SQLite' }], default: 'ansi', help: 'Sets how names are quoted ("name" or `name`), how true / false are written, and the column types.' },
            { key: 'rowsPerStatement', label: 'Rows per statement', type: 'number', min: 1, max: 10000, default: 100, help: 'How many rows each INSERT holds (1 to 10,000).' },
            { key: 'createTable', label: 'Include CREATE TABLE', type: 'checkbox', default: false, help: 'Start with a CREATE TABLE statement whose column types are guessed from the values.' },
            NESTED_OPTION,
            HEADER_OPTION
        ],
        sample: [
            'INSERT INTO "people" ("id", "name", "active") VALUES',
            '  (1, \'Ada Lovelace\', TRUE),',
            '  (2, \'Grace O\'\'Hopper\', FALSE);',
            ''
        ].join('\n'),
        notes: 'SQL INSERT statements load one flat table into a database. They can only be written here; nested data becomes dot-path columns (or JSON text), and column types are guessed only when CREATE TABLE is on.'
    };

    return { query, markdown, html, sql };
});
