/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ConvertCore (convertMan Edition - v1.0)
 *     - File Name: convert.js
 *     - Relative Path: tools/convertman/js/convert.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The conversion core of convertMan: a registry of every format module
 *     and the pipeline that turns text in one format into text in another
 *     (detect, parse, measure, stringify). Every pane and the Node tests go
 *     through it, so options are validated, errors carry their stage and
 *     position, and the same caps apply wherever a conversion starts.
 *
 * ✒ Key Features:
 *     - Registry: picks up whatever modules are on window.ConvertFormats (or,
 *       in Node, every ./formats/*.js file that loads) and lists them in a
 *       stable display order: JSON, JSON Lines, YAML, TOML, CSV, TSV, XML,
 *       INI, .env, query string, Markdown, HTML, SQL
 *     - detect(): asks every readable format how sure it is about the first
 *       4 KB and returns the candidates best first ([] for empty text)
 *     - convert(): auto-detect (falling back to the next likely format when
 *       the best guess fails to read), parse, measure and stringify, with
 *       merged warnings and stats (bytes in and out, records, keys, depth,
 *       milliseconds)
 *     - Errors are annotated with stage ('parse' or 'stringify') and format;
 *       a runaway call stack becomes a plain sentence
 *     - Option values are checked against each module's declared options
 *       (checkbox, number, select, text) and fall back to the defaults
 *     - Data-model helpers: toPlainJSON (for display), fromPlain (plain JS
 *       to the Map model, cycle-safe), flatten / unflatten with dot paths,
 *       measure (records, keys, depth, nodes) without recursion
 *     - isSecretLike(): spots .env files, private keys, well-known token
 *       shapes and keys such as password, secret, token, api_key
 *     - LIMITS: every cap convertMan enforces, for UI messages
 *     - byteLength(): UTF-8 size of a string without allocating a copy
 *
 * ✒ Usage Instructions:
 *     Browser: load after every js/formats/*.js file and before js/state.js;
 *     everything is on window.Convert. Node:
 *         const Convert = require('./convert.js');
 *     (it requires ./formats/*.js itself). Values follow the convertMan
 *     data model: null, boolean, number, bigint, string, arrays, and Map
 *     for objects. Thrown errors have a plain-language message plus stage,
 *     format and, when known, line, column and offset fields.
 *
 * ✒ Examples:
 *     Convert.list().map((m) => m.id)               → ['json', 'jsonl', 'yaml', 'toml', …]
 *     Convert.detect('{"a": 1}')[0]                 → { id: 'json', label: 'JSON', confidence: 1 }
 *     Convert.detect('   ')                         → []
 *     Convert.convert('{"a": 1}', 'auto', 'yaml').text → 'a: 1\n'
 *     Convert.convert('a = 1', 'toml', 'json', { output: { indent: 'min' } }).text → '{"a":1}\n'
 *     Convert.convert('[1, 2', 'json', 'yaml')      → throws, err.stage === 'parse', err.line === 1
 *     Convert.parse('a: [1, 2]', 'yaml').value      → Map { a → [1, 2] }
 *     Convert.stringify(new Map([['a', 1]]), 'toml').text → 'a = 1\n'
 *     Convert.flatten(Convert.fromPlain({ a: { b: 1 } })) → Map { 'a.b' → 1 }
 *     Convert.measure(Convert.fromPlain([{ a: 1 }, { b: 2 }])) → { records: 2, keys: 2, depth: 2, nodes: 5 }
 *     Convert.isSecretLike('DB_PASSWORD=hunter2')   → true
 *
 * ✒ Other Important Information:
 *     - Dependencies: the format modules (js/formats/*.js); none of them is
 *       required — a missing one is simply not listed
 *     - Compatible platforms: all evergreen browsers (BigInt, Map); Node 16+
 *     - Security: pure (no DOM, no network, no string run as code); option
 *       objects are copied key by key and "__proto__", "constructor" and
 *       "prototype" are never copied
 *     - Limitations: detection reads only the first 4 KB, so a file whose
 *       start is ambiguous may need its format chosen by hand; measure()
 *       counts distinct key names up to 100,000; flatten() paths are
 *       ambiguous when a key itself contains the separator
 * ----------------------------------------------------------------------------
 */

(function (root, factory) {
    'use strict';
    const Convert = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = Convert;
    if (root) root.Convert = Convert;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';

    /* ================================================================== */
    /* Limits                                                              */
    /* ================================================================== */

    const MB = 1024 * 1024;
    const LIMITS = Object.freeze({
        inputBytes: 20 * MB,
        liveBytes: 512 * 1024,
        rememberBytes: 2 * MB,
        depth: 512,
        nodes: 2000000,
        aliasNodes: 100000,
        xmlAttributes: 1000,
        queryDepth: 20,
        queryIndex: 1000,
        csvCells: 5000000,
        fileBytes: 25 * MB,
        imageSide: 8192,
        imagePixels: 40000000,
        imagesPerBatch: 20,
        savedRecipes: 100,
        detectChars: 4096
    });

    const ORDER = ['json', 'jsonl', 'yaml', 'toml', 'csv', 'tsv', 'xml', 'ini', 'env', 'query', 'markdown', 'html', 'sql'];
    const FORMAT_FILES = ['json', 'yaml', 'toml', 'csv', 'xml', 'ini', 'web'];
    const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    function plainError(message, extra) {
        const err = new Error(message);
        if (extra) Object.keys(extra).forEach((k) => { err[k] = extra[k]; });
        return err;
    }

    /* ================================================================== */
    /* Registry                                                            */
    /* ================================================================== */

    function isModule(m) {
        return !!m && typeof m === 'object' && typeof m.id === 'string' && /^[a-z0-9_-]{1,32}$/.test(m.id)
            && typeof m.label === 'string' && (typeof m.parse === 'function' || typeof m.stringify === 'function');
    }

    let nodeModules = null;

    /** In Node, require each format file that exists; a broken one is skipped. */
    function nodeRegistry() {
        if (nodeModules) return nodeModules;
        nodeModules = [];
        if (root || typeof require !== 'function' || typeof module === 'undefined') return nodeModules;
        for (const file of FORMAT_FILES) {
            try {
                const mods = require(`./formats/${file}.js`);
                if (mods && typeof mods === 'object') {
                    Object.keys(mods).forEach((id) => { if (isModule(mods[id])) nodeModules.push(mods[id]); });
                }
            } catch (e) {
                /* a missing or broken format file is simply not listed */
            }
        }
        return nodeModules;
    }

    function registry() {
        const reg = new Map();
        nodeRegistry().forEach((m) => reg.set(m.id, m));
        const browser = root && root.ConvertFormats;
        if (browser && typeof browser === 'object') {
            Object.keys(browser).forEach((key) => {
                const m = browser[key];
                if (isModule(m)) reg.set(m.id, m);
            });
        }
        return reg;
    }

    const rank = (id) => {
        const k = ORDER.indexOf(id);
        return k === -1 ? ORDER.length : k;
    };

    /** Every registered module, in display order. */
    function list() {
        return Array.from(registry().values()).sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
    }

    function get(id) {
        if (typeof id !== 'string') return null;
        return registry().get(id) || null;
    }

    /* ================================================================== */
    /* Options                                                             */
    /* ================================================================== */

    /** The value a declared option takes, given what the caller passed. */
    function optionValue(o, has, given) {
        const fallback = o.default;
        switch (o.type) {
            case 'checkbox':
                if (!has || given === undefined || given === null) return !!fallback;
                if (typeof given === 'boolean') return given;
                return given === 'true' || given === 1 || given === '1' || given === 'on';
            case 'number': {
                const v = has ? Number(given) : Number(fallback);
                if (!Number.isFinite(v)) return fallback;
                let out = v;
                if (typeof o.min === 'number') out = Math.max(o.min, out);
                if (typeof o.max === 'number') out = Math.min(o.max, out);
                return out;
            }
            case 'select': {
                const choices = Array.isArray(o.choices) ? o.choices : [];
                if (has) {
                    const hit = choices.find((c) => c && String(c.value) === String(given));
                    if (hit) return hit.value;
                }
                return fallback;
            }
            default:
                if (!has || given === undefined || given === null) return fallback;
                return String(given).slice(0, 1000);
        }
    }

    /**
     * Check `given` against a module's declared options: declared keys are
     * validated (unknown values fall back to the default), other plain
     * values pass through, and reserved names are never copied.
     */
    function normalizeOptions(declared, given) {
        const out = {};
        const src = given && typeof given === 'object' ? given : {};
        const seen = new Set();
        (Array.isArray(declared) ? declared : []).forEach((o) => {
            if (!o || typeof o.key !== 'string' || RESERVED.has(o.key)) return;
            seen.add(o.key);
            out[o.key] = optionValue(o, hasOwn(src, o.key), src[o.key]);
        });
        Object.keys(src).forEach((k) => {
            if (seen.has(k) || RESERVED.has(k)) return;
            const v = src[k];
            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        });
        return out;
    }

    /** Defaults of a module's 'input' or 'output' options. */
    function optionDefaults(id, which) {
        const m = get(id);
        if (!m) return {};
        return normalizeOptions(which === 'input' ? m.inputOptions : m.outputOptions, {});
    }

    /* ================================================================== */
    /* Size                                                                */
    /* ================================================================== */

    /** UTF-8 byte length of a string, without encoding it. */
    function byteLength(str) {
        if (typeof str !== 'string') return 0;
        let bytes = 0;
        const n = str.length;
        for (let k = 0; k < n; k++) {
            const c = str.charCodeAt(k);
            if (c < 0x80) bytes++;
            else if (c < 0x800) bytes += 2;
            else if (c >= 0xD800 && c <= 0xDBFF && k + 1 < n) {
                const d = str.charCodeAt(k + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) { bytes += 4; k++; } else bytes += 3;
            } else bytes += 3;
        }
        return bytes;
    }

    const sizeText = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

    function checkInput(text) {
        if (typeof text !== 'string') throw plainError('There is no text to convert.', { stage: 'parse' });
        if (text.length > LIMITS.inputBytes || (text.length * 3 > LIMITS.inputBytes && byteLength(text) > LIMITS.inputBytes)) {
            const size = text.length > LIMITS.inputBytes ? text.length : byteLength(text);
            throw plainError(`The input is ${sizeText(size)} — larger than 20 MB, the most convertMan converts at a time.`, { stage: 'parse' });
        }
    }

    /* ================================================================== */
    /* Pipeline                                                            */
    /* ================================================================== */

    /** Give every thrown error a stage, a format and a plain message. */
    function annotate(e, stage, mod) {
        let err = e;
        if (!(err instanceof Error)) err = new Error(String(err));
        if (err instanceof RangeError && /call stack/i.test(err.message)) {
            err = new Error('This data is nested too deeply to convert.');
        } else if (!err.format && (err instanceof TypeError || err instanceof ReferenceError)) {
            err = new Error(`convertMan couldn't ${stage === 'parse' ? 'read' : 'write'} this as ${mod ? mod.label : 'that format'} (${err.message}).`);
        }
        if (!err.format && mod) err.format = mod.id;
        err.stage = stage;
        return err;
    }

    function cleanWarnings(list) {
        if (!Array.isArray(list)) return [];
        return list.filter((w) => typeof w === 'string' && w).map((w) => w.slice(0, 500));
    }

    function readable(id) {
        const m = get(id);
        if (!m) throw plainError(`There is no input format called "${String(id).slice(0, 40)}".`, { stage: 'parse' });
        if (!m.canParse || typeof m.parse !== 'function') throw plainError(`${m.label} can only be written, not read — choose another input format.`, { stage: 'parse', format: m.id });
        return m;
    }

    function writable(id) {
        const m = get(id);
        if (!m) throw plainError(`There is no output format called "${String(id).slice(0, 40)}".`, { stage: 'stringify' });
        if (!m.canStringify || typeof m.stringify !== 'function') throw plainError(`${m.label} can only be read, not written — choose another output format.`, { stage: 'stringify', format: m.id });
        return m;
    }

    /** Parse text in a named format → { value, warnings }. */
    function parse(text, id, opts) {
        const m = readable(id);
        checkInput(text);
        let res;
        try {
            res = m.parse(text, normalizeOptions(m.inputOptions, opts));
        } catch (e) {
            throw annotate(e, 'parse', m);
        }
        if (!res || typeof res !== 'object' || !('value' in res)) throw annotate(new Error(`${m.label} returned nothing.`), 'parse', m);
        return { value: res.value === undefined ? null : res.value, warnings: cleanWarnings(res.warnings) };
    }

    /** Write a value in a named format → { text, warnings }. */
    function stringify(value, id, opts) {
        const m = writable(id);
        let res;
        try {
            res = m.stringify(value, normalizeOptions(m.outputOptions, opts));
        } catch (e) {
            throw annotate(e, 'stringify', m);
        }
        if (!res || typeof res.text !== 'string') throw annotate(new Error(`${m.label} returned no text.`), 'stringify', m);
        return { text: res.text, warnings: cleanWarnings(res.warnings) };
    }

    /** Candidate input formats for this text, best first. */
    function detect(text) {
        if (typeof text !== 'string' || !/\S/.test(text)) return [];
        const out = [];
        list().forEach((m) => {
            if (!m.canParse || typeof m.detect !== 'function') return;
            let c = 0;
            try { c = Number(m.detect(text)); } catch (e) { c = 0; }
            if (!(c > 0)) return;
            out.push({ id: m.id, label: m.label, confidence: Math.round(Math.min(1, c) * 1000) / 1000 });
        });
        out.sort((a, b) => b.confidence - a.confidence || rank(a.id) - rank(b.id));
        return out;
    }

    /**
     * Convert text from one format to another.
     * Returns { text, from, detected, to, warnings, stats }.
     */
    function convert(text, fromId, toId, options) {
        const t0 = now();
        const opts = options && typeof options === 'object' ? options : {};
        checkInput(text);
        const to = writable(toId);
        let from = null;
        let parsed = null;
        const auto = !fromId || fromId === 'auto';
        if (auto) {
            const candidates = detect(text);
            if (!candidates.length) {
                throw plainError(/\S/.test(text)
                    ? "convertMan couldn't tell what format this is — choose the input format from the list."
                    : 'There is nothing to convert — the input is empty.', { stage: 'parse' });
            }
            const tries = candidates.filter((c, k) => k === 0 || c.confidence >= 0.3).slice(0, 3);
            let firstError = null;
            for (const c of tries) {
                try {
                    parsed = parse(text, c.id, opts.input);
                    from = get(c.id);
                    break;
                } catch (e) {
                    if (!firstError) firstError = e;
                }
            }
            if (!parsed) throw firstError;
        } else {
            from = readable(fromId);
            parsed = parse(text, from.id, opts.input);
        }
        const m = measure(parsed.value);
        const out = stringify(parsed.value, to.id, opts.output);
        const warnings = Array.from(new Set(parsed.warnings.concat(out.warnings)));
        return {
            text: out.text,
            from: from.id,
            detected: auto,
            to: to.id,
            warnings,
            stats: {
                inBytes: byteLength(text),
                outBytes: byteLength(out.text),
                records: m.records,
                keys: m.keys,
                depth: m.depth,
                ms: Math.round((now() - t0) * 10) / 10
            }
        };
    }

    /* ================================================================== */
    /* Data-model helpers                                                  */
    /* ================================================================== */

    const isContainer = (v) => v instanceof Map || Array.isArray(v);
    const MEASURE_CAP = 10000000;
    const KEY_CAP = 100000;

    /** { records, keys (distinct key names), depth, nodes } — no recursion. */
    function measure(value) {
        let nodes = 0;
        let depth = 0;
        const keys = new Set();
        const values = [value];
        const depths = [0];
        while (values.length && nodes < MEASURE_CAP) {
            const v = values.pop();
            const d = depths.pop();
            nodes++;
            if (Array.isArray(v)) {
                if (d + 1 > depth) depth = d + 1;
                for (let k = v.length - 1; k >= 0; k--) { values.push(v[k]); depths.push(d + 1); }
            } else if (v instanceof Map) {
                if (d + 1 > depth) depth = d + 1;
                v.forEach((x, k) => {
                    if (keys.size < KEY_CAP) keys.add(k);
                    values.push(x);
                    depths.push(d + 1);
                });
            }
        }
        const records = Array.isArray(value) ? value.length : (value === null || value === undefined ? 0 : 1);
        return { records, keys: keys.size, depth, nodes };
    }

    function tooDeep() {
        return plainError(`The data is nested more than ${LIMITS.depth} levels deep — convertMan stops there to stay responsive.`);
    }

    /** Plain JS for display: Map → object (own keys, even "__proto__"), bigint → digits. */
    function toPlainJSON(value) {
        function walk(v, depth) {
            if (depth > LIMITS.depth) throw tooDeep();
            if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
            if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
            if (v instanceof Map) {
                const o = {};
                v.forEach((x, k) => {
                    Object.defineProperty(o, String(k), { value: walk(x, depth + 1), enumerable: true, writable: true, configurable: true });
                });
                return o;
            }
            return v === undefined ? null : v;
        }
        return walk(value, 0);
    }

    /** Plain JS (objects, arrays, Dates) → the Map data model. Cycles throw. */
    function fromPlain(value) {
        const stack = new Set();
        const skip = (x) => x === undefined || typeof x === 'function' || typeof x === 'symbol';
        function walk(v, depth) {
            if (depth > LIMITS.depth) throw tooDeep();
            if (v === null || v === undefined) return null;
            switch (typeof v) {
                case 'boolean': case 'number': case 'bigint': case 'string': return v;
                case 'object': break;
                default: return null;
            }
            if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
            if (stack.has(v)) throw plainError('This data refers back to itself (a cycle), so it has no text form.');
            stack.add(v);
            let out;
            if (Array.isArray(v)) {
                out = v.map((x) => (skip(x) ? null : walk(x, depth + 1)));
            } else if (v instanceof Map) {
                out = new Map();
                v.forEach((x, k) => { if (!skip(x)) out.set(String(k), walk(x, depth + 1)); });
            } else {
                out = new Map();
                Object.keys(v).forEach((k) => { if (!skip(v[k])) out.set(k, walk(v[k], depth + 1)); });
            }
            stack.delete(v);
            return out;
        }
        return walk(value, 0);
    }

    /** Map of path → leaf (scalars and empty collections), in first-seen order. */
    function flatten(value, separator) {
        const sep = typeof separator === 'string' ? separator : '.';
        const out = new Map();
        function walk(v, path, depth) {
            if (depth > LIMITS.depth) throw tooDeep();
            const empty = (v instanceof Map && v.size === 0) || (Array.isArray(v) && v.length === 0);
            if (!isContainer(v) || (empty && depth > 0)) {
                out.set(path, v);
                return;
            }
            const join = (k) => (depth === 0 ? String(k) : `${path}${sep}${k}`);
            if (Array.isArray(v)) v.forEach((x, k) => walk(x, join(k), depth + 1));
            else v.forEach((x, k) => walk(x, join(k), depth + 1));
        }
        walk(value, '', 0);
        return out;
    }

    /** The reverse of flatten(): rebuilds nesting; keys 0..n-1 become arrays. */
    function unflatten(flat, separator) {
        const sep = typeof separator === 'string' ? separator : '.';
        let pairs;
        if (flat instanceof Map) pairs = Array.from(flat.entries());
        else if (Array.isArray(flat)) pairs = flat.filter((p) => Array.isArray(p) && p.length === 2);
        else if (flat && typeof flat === 'object') pairs = Object.keys(flat).map((k) => [k, flat[k]]);
        else return flat === undefined ? null : flat;
        if (pairs.length === 1 && pairs[0][0] === '') return pairs[0][1];
        const top = new Map();
        for (const [path, v] of pairs) {
            const parts = sep ? String(path).split(sep) : [String(path)];
            if (parts.length > LIMITS.depth) throw tooDeep();
            let t = top;
            for (let k = 0; k < parts.length - 1; k++) {
                let next = t.get(parts[k]);
                if (!(next instanceof Map)) {
                    next = new Map();
                    t.set(parts[k], next);
                }
                t = next;
            }
            t.set(parts[parts.length - 1], v);
        }
        function arrays(v, depth) {
            if (!(v instanceof Map) || depth > LIMITS.depth) return v;
            v.forEach((x, k) => { if (x instanceof Map) v.set(k, arrays(x, depth + 1)); });
            if (!v.size) return v;
            let k = 0;
            for (const key of v.keys()) {
                if (key !== String(k)) return v;
                k++;
            }
            return Array.from(v.values());
        }
        return arrays(top, 0);
    }

    /* ================================================================== */
    /* Secrets                                                             */
    /* ================================================================== */

    const SECRET_WORDS = '(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|client[_-]?secret|credentials?|auth[_-]?key)';
    const SECRET_KEY = new RegExp(`(?:^|[\\s"'{,;&?(\\[])(?:[\\w-]*[_.-])?${SECRET_WORDS}(?:s|[_.-][\\w.-]*)?["']?\\s*(?:[:=]|=>)\\s*["']?[^\\s"',}&\\]]`, 'im');
    const SECRET_TAG = new RegExp(`<(?:[\\w-]*[_.-])?${SECRET_WORDS}>\\s*[^<\\s]`, 'i');
    const SECRET_SHAPES = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bsk_live_[A-Za-z0-9]{16,}|\bAIza[0-9A-Za-z_-]{35}\b/;

    /** Does this text look like it holds passwords, keys or tokens (or is a .env file)? */
    function isSecretLike(text) {
        if (typeof text !== 'string' || !text) return false;
        const h = text.length > 65536 ? text.slice(0, 65536) : text;
        if (SECRET_SHAPES.test(h) || SECRET_KEY.test(h) || SECRET_TAG.test(h)) return true;
        const lines = h.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').slice(0, 200);
        if (lines.length < 2) return false;
        const env = lines.filter((l) => /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(l)).length;
        return env >= 2 && env / lines.length >= 0.6;
    }

    /* ================================================================== */
    /* Public API                                                          */
    /* ================================================================== */

    return Object.freeze({
        LIMITS,
        list,
        get,
        detect,
        convert,
        parse,
        stringify,
        measure,
        toPlainJSON,
        fromPlain,
        flatten,
        unflatten,
        isSecretLike,
        byteLength,
        normalizeOptions,
        optionDefaults,
        formatCount: commas
    });
});
