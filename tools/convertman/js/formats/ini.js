/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: IniFormat (convertMan Edition - v1.0)
 *     - File Name: ini.js
 *     - Relative Path: tools/convertman/js/formats/ini.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Reads and writes INI configuration files and .env files for
 *     convertMan's converter. INI sections become records (dotted section
 *     names can nest), and .env lines become one flat record of text
 *     values. Writing flattens deeper data the way each format expects, so
 *     settings can move between these files and JSON, YAML or TOML.
 *
 * ✒ Key Features:
 *     - INI: [section] headers, optional dotted [a.b] nesting, ; and #
 *       comments, key = value and key: value, quoted values with escapes
 *     - INI: inline comments after a space (" ; note"), optional type
 *       inference for numbers and true / false, keys without a value kept
 *     - INI: a repeated key keeps the last value and says so; a repeated
 *       section merges its keys
 *     - INI writer: top-level values first, then one [section] per record,
 *       deeper records as dotted section names, lists as JSON text with a
 *       warning, values quoted when needed
 *     - .env: NAME=value lines, optional "export ", single, double and
 *       backtick quotes, \n escapes in double quotes, multi-line quoted
 *       values, # comments (inline only after a space in unquoted values)
 *     - .env writer: nested keys flattened to UPPER_SNAKE (a.b → A_B,
 *       apiKey → API_KEY), invalid names sanitised with a warning, values
 *       quoted only when needed, optional "export " prefix
 *     - Plain-language errors with line and column, such as a name that is
 *       not a valid variable name or a quote that never closes
 *     - Caps: 20 MB of text and section nesting depth 512
 *     - Pure and self-contained: no DOM, no other format files, Node ready
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the file registers the ini and
 *     env modules on window.ConvertFormats. Node: require('./ini.js')
 *     returns { ini, env }. parse(text, opts) → { value, warnings } with a
 *     Map at the top; stringify(value, opts) → { text, warnings }. Option
 *     keys are listed in each module's inputOptions / outputOptions.
 *
 * ✒ Examples:
 *     ini.parse('[server]\nport = 8080').value      → Map { server: Map { port: '8080' } }
 *     ini.parse('[a.b]\nx=1', { inferTypes: true }).value → Map { a: Map { b: Map { x: 1 } } }
 *     ini.parse('name = "Ada ; Lovelace" ; note').value.get('name') → 'Ada ; Lovelace'
 *     ini.stringify(new Map([['port', 80], ['db', new Map([['host', 'x']])]])).text → 'port = 80\n\n[db]\nhost = x\n'
 *     env.parse('export API_URL="https://x.test"\nDEBUG=1 # on').value → Map { API_URL: 'https://x.test', DEBUG: '1' }
 *     env.parse('KEY="line 1\\nline 2"').value.get('KEY') → 'line 1\nline 2'
 *     env.stringify(new Map([['db', new Map([['host', 'x']])], ['apiKey', 'a b']])).text → 'DB_HOST=x\nAPI_KEY="a b"\n'
 *     env.detect('APP_ENV=production\nPORT=8080')     → 0.8
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers; Node 16+
 *     - Security: hand-written line parsers with no code paths built from
 *       text; keys become Map keys, so __proto__ is an ordinary key; .env
 *       values are never expanded (${VAR} stays as written)
 *     - Limitations: INI has no standard, so lists, null and types do not
 *       survive a round trip (lists become JSON text, null an empty value);
 *       .env holds only text, so every value reads back as a string; line
 *       continuations and INI arrays such as key[] are not supported
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
        bigDigits: 400
    });
    const DETECT_CHARS = 4096;

    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isMap = (v) => v instanceof Map;
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
        return def.default;
    }

    function readOptions(defs, opts) {
        const src = opts && typeof opts === 'object' ? opts : {};
        const out = {};
        defs.forEach((d) => { out[d.key] = normalizeOption(d, hasOwn(src, d.key) ? src[d.key] : undefined); });
        return out;
    }

    /** Split into lines, remembering where each starts (for error offsets). */
    function splitLines(text) {
        const lines = [];
        const starts = [];
        const re = /\r\n|\n|\r/g;
        let last = 0;
        let m;
        while ((m = re.exec(text))) {
            lines.push(text.slice(last, m.index));
            starts.push(last);
            last = m.index + m[0].length;
        }
        lines.push(text.slice(last));
        starts.push(last);
        return { lines, starts };
    }

    const INT_RE = /^-?(?:0|[1-9]\d*)$/;
    const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

    function inferScalar(s) {
        if (s === '') return s;
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

    const DQ_ESCAPES = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

    function escapeDouble(s) {
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    }

    /* ── INI: reading ─────────────────────────────────────────────────── */

    function readIniValue(raw, o) {
        let v = raw.trim();
        if (!v) return { value: '', quoted: false };
        const q = v[0];
        if (q === '"' || q === '\'') {
            let k = 1;
            let buf = '';
            if (q === '"') {
                while (k < v.length) {
                    const c = v[k];
                    if (c === '\\' && k + 1 < v.length) {
                        const e = v[k + 1];
                        buf += hasOwn(DQ_ESCAPES, e) ? DQ_ESCAPES[e] : `\\${e}`;
                        k += 2;
                        continue;
                    }
                    if (c === '"') break;
                    buf += c;
                    k++;
                }
            } else {
                const e = v.indexOf('\'', 1);
                k = e < 0 ? v.length : e;
                buf = v.slice(1, k);
            }
            if (k < v.length) {
                const rest = v.slice(k + 1).trim();
                if (!rest || rest[0] === ';' || rest[0] === '#') return { value: buf, quoted: true };
            }
        }
        if (o.inlineComments) {
            const m = /[ \t][;#]/.exec(v);
            if (m) v = v.slice(0, m.index).trimEnd();
        }
        return { value: v, quoted: false };
    }

    function parseIni(text, o) {
        const src = prepare(text, 'ini');
        const W = warnings();
        const { lines, starts } = splitLines(src);
        const root = new Map();
        let current = root;
        let currentName = '';
        const seenSections = new Set();
        let nodes = 0;
        let dups = 0;
        let dupExample = '';
        let bare = 0;
        let bareLine = 0;
        let merged = 0;
        let replaced = 0;
        const at = (ln, col) => ({ line: ln + 1, column: col + 1, offset: starts[ln] + col });

        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const t = line.trim();
            if (!t || t[0] === ';' || t[0] === '#') continue;
            const lead = line.length - line.trimStart().length;
            if (++nodes > LIMITS.nodes) throw fail(`This file has more than ${commas(LIMITS.nodes)} lines of settings, which is convertMan's limit.`, null, 'ini');
            if (t[0] === '[') {
                const closeAt = t.indexOf(']');
                if (closeAt < 0) {
                    throw fail(`Line ${ln + 1}, column ${lead + 1}: this section header is missing its closing "]".`, at(ln, lead), 'ini');
                }
                const name = t.slice(1, closeAt).trim();
                if (!name) throw fail(`Line ${ln + 1}, column ${lead + 1}: a section needs a name between [ and ].`, at(ln, lead), 'ini');
                const rest = t.slice(closeAt + 1).trim();
                if (rest && rest[0] !== ';' && rest[0] !== '#') {
                    const col = lead + closeAt + 1 + (t.slice(closeAt + 1).length - t.slice(closeAt + 1).trimStart().length);
                    throw fail(`Line ${ln + 1}, column ${col + 1}: unexpected text after the section header [${clip(name, 40)}] — expected the end of the line or a comment.`, at(ln, col), 'ini');
                }
                let path = [name];
                if (o.dottedSections && name.indexOf('.') >= 0) {
                    const parts = name.split('.').map((s) => s.trim());
                    if (parts.every(Boolean)) path = parts;
                }
                if (path.length > LIMITS.depth) {
                    throw fail(`Line ${ln + 1}: the section [${clip(name, 40)}] is nested more than 512 levels deep, which is convertMan's limit.`, at(ln, lead), 'ini');
                }
                if (seenSections.has(name)) merged++;
                seenSections.add(name);
                let node = root;
                path.forEach((seg) => {
                    let next = node.get(seg);
                    if (!isMap(next)) {
                        if (next !== undefined) replaced++;
                        next = new Map();
                        node.set(seg, next);
                    }
                    node = next;
                });
                current = node;
                currentName = name;
                continue;
            }
            const eq = t.indexOf('=');
            const colon = t.indexOf(':');
            const sep = eq < 0 ? colon : colon < 0 ? eq : Math.min(eq, colon);
            let key;
            let value;
            if (sep < 0) {
                key = o.inlineComments ? t.replace(/[ \t][;#].*$/, '') : t;
                value = '';
                if (!bare++) bareLine = ln + 1;
            } else {
                key = t.slice(0, sep).trim();
                if (!key) {
                    throw fail(`Line ${ln + 1}, column ${lead + 1}: there is a value but no key name before "${t[sep]}".`, at(ln, lead), 'ini');
                }
                const r = readIniValue(t.slice(sep + 1), o);
                value = o.inferTypes && !r.quoted ? inferScalar(r.value) : r.value;
            }
            if (current.has(key)) {
                if (isMap(current.get(key))) replaced++;
                else if (!dups++) dupExample = `Line ${ln + 1}: "${clip(key, 40)}"${currentName ? ` in [${clip(currentName, 40)}]` : ''}`;
            }
            current.set(key, value);
        }
        if (dups) W.add(`${dupExample} appears more than once — the last value was kept${dups > 1 ? ` (${commas(dups)} repeated keys in all)` : ''}.`);
        if (merged) W.add(`${plural(merged, 'section')} appeared more than once; ${verb(merged, 'its', 'their')} keys were merged.`);
        if (bare) W.add(`Line ${bareLine} has no "=" or ":", so it was read as a key with an empty value${bare > 1 ? ` (${commas(bare)} lines in all)` : ''}.`);
        if (replaced) W.add(`${plural(replaced, 'name')} ${verb(replaced, 'was', 'were')} used both as a value and as a section; the later one was kept.`);
        return { value: root, warnings: W.list };
    }

    /* ── INI: writing ─────────────────────────────────────────────────── */

    function stringifyIni(value, o) {
        const W = warnings();
        let data = value;
        if (!isMap(value)) {
            data = new Map([['data', value]]);
            W.add('INI needs named keys, so the data was put under the key "data".');
        }
        const eq = o.spaces ? ' = ' : '=';
        const out = [];
        let lists = 0;
        let nulls = 0;
        let fixedKeys = 0;
        let dotted = 0;

        const cleanKey = (k) => {
            const s = String(k);
            let t = s.replace(/[\r\n=:[\]]/g, '_').trim();
            if (/^[;#]/.test(t)) t = `_${t.slice(1)}`;
            if (!t) t = '_';
            if (t !== s) fixedKeys++;
            return t;
        };
        const cleanSection = (k) => {
            const s = String(k);
            let t = s.replace(/[\r\n[\]]/g, '_').trim();
            if (!t) t = '_';
            if (t !== s) fixedKeys++;
            return t;
        };
        const valueText = (v) => {
            if (v === null || v === undefined) { nulls++; return ''; }
            if (Array.isArray(v)) { lists++; return quoteIfNeeded(jsonText(v, 0, 'ini')); }
            return quoteIfNeeded(scalarText(v));
        };
        const quoteIfNeeded = (s) => {
            if (s === '') return '';
            if (/^[ \t]|[ \t]$/.test(s) || /[;#\r\n\t"]/.test(s) || s[0] === '\'') return `"${escapeDouble(s)}"`;
            return s;
        };
        const writeKeys = (map) => {
            map.forEach((v, k) => {
                if (isMap(v)) return;
                out.push(`${cleanKey(k)}${eq}${valueText(v)}`.replace(/[ \t]+$/, ''));
            });
        };
        const hasScalars = (map) => {
            for (const v of map.values()) if (!isMap(v)) return true;
            return false;
        };
        const writeSection = (name, map, depth) => {
            if (depth > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.', null, 'ini');
            if (hasScalars(map) || map.size === 0) {
                if (out.length) out.push('');
                out.push(`[${name}]`);
                writeKeys(map);
            }
            map.forEach((v, k) => {
                if (!isMap(v)) return;
                const part = cleanSection(k);
                if (part.indexOf('.') >= 0) dotted++;
                writeSection(`${name}.${part}`, v, depth + 1);
            });
        };

        writeKeys(data);
        data.forEach((v, k) => {
            if (!isMap(v)) return;
            const part = cleanSection(k);
            if (part.indexOf('.') >= 0) dotted++;
            writeSection(part, v, 1);
        });

        if (lists) W.add(`INI has no lists — ${plural(lists, 'list was', 'lists were')} written as JSON text.`);
        if (nulls) W.add(`INI has no null — ${plural(nulls, 'null value was', 'null values were')} written as an empty value.`);
        if (fixedKeys) W.add(`${plural(fixedKeys, 'name')} contained characters INI cannot hold in a name (= : [ ] or a line break) and ${verb(fixedKeys, 'was', 'were')} changed.`);
        if (dotted) W.add(`${plural(dotted, 'section name')} ${verb(dotted, 'contains', 'contain')} a dot, so ${verb(dotted, 'it', 'they')} will read back as nested sections.`);
        return { text: out.length ? `${out.join('\n')}\n` : '', warnings: W.list };
    }

    function detectIni(text) {
        if (typeof text !== 'string' || !text) return 0;
        const s = text.slice(0, DETECT_CHARS).replace(/^﻿/, '');
        const lines = s.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l && l[0] !== ';' && l[0] !== '#').slice(0, 60);
        if (!lines.length) return 0;
        if (/^[{[<]/.test(lines[0]) && !/^\[[^[\]]+\]$/.test(lines[0])) return 0;
        let sections = 0;
        let pairs = 0;
        let other = 0;
        let typed = 0;
        let colons = 0;
        lines.forEach((l) => {
            if (/^\[[^[\]]+\]$/.test(l)) { sections++; return; }
            const m = /^([^=:\s"'][^=:]*?)\s*([=:])\s*(.*)$/.exec(l);
            if (!m) { other++; return; }
            pairs++;
            if (m[2] === ':') colons++;
            if (/^(?:"[^"]*"|'[^']*'|[-+]?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|\[.*\]|\{.*\}|\d{4}-\d{2}-\d{2}.*)(?:\s*#.*)?$/.test(m[3])) typed++;
        });
        if (!pairs) return sections ? 0.3 : 0;
        const total = lines.length;
        if (other / total > 0.2) return Math.round(0.15 * (pairs / total) * 1000) / 1000;
        let score = sections ? 0.75 : 0.45;
        if (typed === pairs) score -= 0.3;
        if (colons > pairs / 2) score -= 0.25;
        if (other) score -= 0.1;
        return Math.max(0, Math.round(score * 1000) / 1000);
    }

    /* ── .env: reading ────────────────────────────────────────────────── */

    const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

    function parseEnv(text) {
        const src = prepare(text, 'env');
        const W = warnings();
        const n = src.length;
        const out = new Map();
        let dups = 0;
        let dupExample = '';
        let trailing = 0;
        let trailingLine = 0;
        let bareExports = 0;
        let pos = 0;
        let line = 1;
        const lineEndAt = (p) => {
            const nl = src.indexOf('\n', p);
            return nl < 0 ? n : nl;
        };
        const countNl = (a, b) => {
            let c = 0;
            for (let k = src.indexOf('\n', a); k >= 0 && k < b; k = src.indexOf('\n', k + 1)) c++;
            return c;
        };
        const at = (ln, col, off) => ({ line: ln, column: col + 1, offset: off });

        while (pos < n) {
            const eol = lineEndAt(pos);
            const raw = src.slice(pos, eol).replace(/\r$/, '');
            const lineStart = pos;
            let nextPos = eol + 1;
            let nextLine = line + 1;
            const lead = raw.length - raw.trimStart().length;
            let body = raw.slice(lead);
            if (!body.trim() || body[0] === '#') { pos = nextPos; line = nextLine; continue; }
            if (out.size >= LIMITS.nodes) throw fail(`This file has more than ${commas(LIMITS.nodes)} variables, which is convertMan's limit.`, null, 'env');
            let col = lead;
            const ex = /^export[ \t]+/.exec(body);
            if (ex) { body = body.slice(ex[0].length); col += ex[0].length; }
            const eq = body.indexOf('=');
            if (eq < 0) {
                if (ex && ENV_KEY.test(body.trim())) { bareExports++; pos = nextPos; line = nextLine; continue; }
                throw fail(`Line ${line}, column ${col + 1}: expected NAME=value, but this line has no "=".`, at(line, col, lineStart + col), 'env');
            }
            const key = body.slice(0, eq).trim();
            if (!key) throw fail(`Line ${line}, column ${col + 1}: there is a value but no name before "=".`, at(line, col, lineStart + col), 'env');
            if (!ENV_KEY.test(key)) {
                throw fail(`Line ${line}, column ${col + 1}: "${clip(key, 40)}" is not a valid variable name — use letters, digits and underscores, starting with a letter or underscore.`, at(line, col, lineStart + col), 'env');
            }
            const afterEq = lineStart + col + eq + 1;
            let v = afterEq;
            while (v < eol && (src[v] === ' ' || src[v] === '\t')) v++;
            const q = src[v];
            let value;
            if (v < eol && (q === '"' || q === '\'' || q === '`')) {
                let k = v + 1;
                let buf = '';
                if (q === '"') {
                    while (k < n) {
                        const c = src[k];
                        if (c === '\\' && k + 1 < n) {
                            const e = src[k + 1];
                            buf += hasOwn(DQ_ESCAPES, e) ? DQ_ESCAPES[e] : `\\${e}`;
                            k += 2;
                            continue;
                        }
                        if (c === '"') break;
                        buf += c;
                        k++;
                    }
                } else {
                    const closeAt = src.indexOf(q, k);
                    if (closeAt >= 0) buf = src.slice(k, closeAt);
                    k = closeAt < 0 ? n : closeAt;
                }
                if (k >= n) {
                    const name = q === '"' ? 'double' : q === '\'' ? 'single' : 'backtick';
                    throw fail(`Line ${line}, column ${v - lineStart + 1}: the value of ${clip(key, 40)} opens a ${name} quote that never closes.`, at(line, v - lineStart, v), 'env');
                }
                value = buf.replace(/\r\n?/g, '\n');
                const restEnd = lineEndAt(k + 1);
                const rest = src.slice(k + 1, restEnd).replace(/\r$/, '').trim();
                if (rest && rest[0] !== '#' && !trailing++) trailingLine = line + countNl(lineStart, k);
                nextPos = restEnd + 1;
                nextLine = line + countNl(lineStart, restEnd) + 1;
            } else if (src[v] === '#' && v > afterEq) {
                value = '';
            } else {
                let rawValue = src.slice(v, eol).replace(/\r$/, '');
                const hash = rawValue.search(/[ \t]#/);
                if (hash >= 0) rawValue = rawValue.slice(0, hash);
                value = rawValue.trim();
            }
            if (out.has(key) && !dups++) dupExample = `Line ${line}: ${clip(key, 40)}`;
            out.set(key, value);
            pos = nextPos;
            line = nextLine;
        }
        if (dups) W.add(`${dupExample} is set more than once — the last value was kept${dups > 1 ? ` (${commas(dups)} repeats in all)` : ''}.`);
        if (trailing) W.add(`Line ${trailingLine}: text after a closing quote was ignored${trailing > 1 ? ` (${commas(trailing)} lines in all)` : ''}.`);
        if (bareExports) W.add(`${plural(bareExports, 'line')} such as "export NAME" had no value and ${verb(bareExports, 'was', 'were')} skipped.`);
        return { value: out, warnings: W.list };
    }

    /* ── .env: writing ────────────────────────────────────────────────── */

    function envPart(k) {
        const s = String(k);
        const upper = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
        const clean = upper.replace(/[^A-Z0-9_]/g, '_');
        return { part: clean || '_', changed: clean !== upper || !clean };
    }

    function envValue(v) {
        if (v === null || v === undefined) return '';
        const s = scalarText(v);
        if (s === '') return '';
        if (/^[A-Za-z0-9_\-.,:/@+%=~^]+$/.test(s)) return s;
        if (/[\r\n\t]/.test(s)) return `"${escapeDouble(s)}"`;
        if (/[$\\"]/.test(s) && s.indexOf('\'') < 0) return `'${s}'`;
        return `"${escapeDouble(s)}"`;
    }

    function stringifyEnv(value, o) {
        const W = warnings();
        let data = value;
        if (!isMap(value)) {
            data = new Map([['data', value]]);
            W.add('A .env file needs named values, so the data was put under the name DATA.');
        }
        const flat = new Map();
        let changed = 0;
        let changedExample = null;
        let collisions = 0;
        let empties = 0;
        const walk = (prefix, v, depth, path) => {
            if (depth > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.', null, 'env');
            if (isMap(v) || Array.isArray(v)) {
                const size = isMap(v) ? v.size : v.length;
                if (!size) { empties++; return; }
                if (isMap(v)) v.forEach((x, k) => step(prefix, k, x, depth, path));
                else v.forEach((x, i) => step(prefix, String(i), x, depth, path));
                return;
            }
            if (flat.has(prefix)) collisions++;
            flat.set(prefix, v);
        };
        const step = (prefix, k, x, depth, path) => {
            const { part, changed: c } = envPart(k);
            let name = prefix ? `${prefix}_${part}` : part;
            const full = path ? `${path}.${k}` : String(k);
            if (!prefix && /^[0-9]/.test(name)) { name = `_${name}`; }
            if (c || (!prefix && name !== part)) {
                changed++;
                if (!changedExample) changedExample = [full, name];
            }
            walk(name, x, depth + 1, full);
        };
        data.forEach((x, k) => step('', k, x, 1, ''));
        const prefix = o.export ? 'export ' : '';
        const lines = [];
        flat.forEach((v, k) => lines.push(`${prefix}${k}=${envValue(v)}`));
        if (changed) {
            W.add(`${plural(changed, 'name')} had characters a variable name cannot use and ${verb(changed, 'was', 'were')} changed (for example "${clip(changedExample[0], 40)}" became ${clip(changedExample[1], 40)}).`);
        }
        if (collisions) W.add(`${plural(collisions, 'name')} ended up the same as another after flattening; the later value was kept.`);
        if (empties) W.add(`${plural(empties, 'empty list or record', 'empty lists or records')} ${verb(empties, 'has', 'have')} no .env form and ${verb(empties, 'was', 'were')} left out.`);
        return { text: lines.length ? `${lines.join('\n')}\n` : '', warnings: W.list };
    }

    function detectEnv(text) {
        if (typeof text !== 'string' || !text) return 0;
        const s = text.slice(0, DETECT_CHARS).replace(/^﻿/, '');
        const lines = s.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').slice(0, 60);
        if (!lines.length) return 0;
        let ok = 0;
        let upper = 0;
        let exported = 0;
        lines.forEach((l) => {
            const m = /^(export[ \t]+)?([A-Za-z_][A-Za-z0-9_.-]*)=/.exec(l);
            if (!m) return;
            ok++;
            if (m[1]) exported++;
            if (/^[A-Z_][A-Z0-9_]*$/.test(m[2])) upper++;
        });
        if (!ok) return 0;
        const ratio = ok / lines.length;
        if (ratio < 0.8) return Math.round(0.15 * ratio * 1000) / 1000;
        if (lines.length === 1 && /&/.test(lines[0]) && !/\s/.test(lines[0])) return 0.2;
        return Math.min(0.9, Math.round((0.45 + 0.35 * (upper / ok) + (exported ? 0.1 : 0)) * 1000) / 1000);
    }

    /* ── Modules ──────────────────────────────────────────────────────── */

    const INI_SAMPLE = [
        '; Inventory service settings',
        'name = Inventory Service',
        'version = 2.4.1',
        '',
        '[server]',
        'host = 0.0.0.0',
        'port = 8080',
        'log_level = info   ; debug while testing',
        '',
        '[database]',
        'url = postgres://db.internal:5432/inventory',
        'pool_size = 10',
        '',
        '[database.replica]',
        'host = replica.internal',
        'read_only = true',
        ''
    ].join('\n');

    const ENV_SAMPLE = [
        '# Local development settings',
        'APP_NAME="Inventory Service"',
        'APP_ENV=development',
        'PORT=8080',
        'export LOG_LEVEL=debug   # more detail while testing',
        'DATABASE_URL=postgres://localhost:5432/inventory',
        'FEATURE_FLAGS=\'search,export\'',
        'WELCOME_MESSAGE="Hello!\\nThanks for testing."',
        ''
    ].join('\n');

    const iniInput = [
        { key: 'dottedSections', label: 'Dotted sections as nesting', type: 'checkbox', default: true, help: '[server.http] becomes "http" inside "server". Off keeps "server.http" as one name.' },
        { key: 'inferTypes', label: 'Infer types', type: 'checkbox', default: false, help: 'Read 8080 as a number and true / false as booleans. Quoted values always stay text.' },
        { key: 'inlineComments', label: 'Inline comments', type: 'checkbox', default: true, help: 'Treat " ;" or " #" after a value as the start of a comment. Turn off if values contain those characters after a space.' }
    ];
    const iniOutput = [
        { key: 'spaces', label: 'Spaces around =', type: 'checkbox', default: true, help: 'Write "key = value" instead of "key=value".' }
    ];
    const envOutput = [
        { key: 'export', label: 'Add "export"', type: 'checkbox', default: false, help: 'Start each line with "export " so the file can be sourced by a shell.' }
    ];

    const ini = {
        id: 'ini',
        label: 'INI',
        extensions: ['ini', 'cfg', 'conf'],
        mime: 'text/plain',
        kind: 'flat',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectIni(text); } catch (err) { return 0; }
        },
        parse(text, opts) {
            return parseIni(text, readOptions(iniInput, opts));
        },
        stringify(value, opts) {
            return stringifyIni(value, readOptions(iniOutput, opts));
        },
        inputOptions: iniInput,
        outputOptions: iniOutput,
        sample: INI_SAMPLE,
        notes: 'INI holds named sections of key = value text, with dotted section names for nesting. Lists become JSON text, null becomes an empty value, and every value reads back as text unless types are inferred.'
    };

    const env = {
        id: 'env',
        label: '.env',
        extensions: ['env'],
        mime: 'text/plain',
        kind: 'flat',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectEnv(text); } catch (err) { return 0; }
        },
        parse(text) {
            return parseEnv(text);
        },
        stringify(value, opts) {
            return stringifyEnv(value, readOptions(envOutput, opts));
        },
        inputOptions: [],
        outputOptions: envOutput,
        sample: ENV_SAMPLE,
        notes: 'A .env file holds flat NAME=value pairs of text. Nested keys are joined into UPPER_SNAKE names (a.b becomes A_B), and every value reads back as text, so types and structure are not kept.'
    };

    return { ini, env };
});
