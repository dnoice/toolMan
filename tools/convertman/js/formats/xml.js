/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: XmlFormat (convertMan Edition - v1.0)
 *     - File Name: xml.js
 *     - Relative Path: tools/convertman/js/formats/xml.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Reads and writes XML for convertMan's converter. Parsing maps a
 *     document onto convertMan's data model (attributes as "@name", text as
 *     "#text", repeated elements as lists), and writing does the reverse
 *     with escaping and indentation. It is built for untrusted input: no
 *     DTD is ever processed and no entity other than the five built-in ones
 *     is expanded, so entity tricks cannot read files or exhaust memory.
 *
 * ✒ Key Features:
 *     - Hand-written, non-recursive parser for elements, attributes, text,
 *       CDATA, comments and processing instructions (both skipped)
 *     - DOCTYPE skipped without processing — internal subsets included —
 *       and any custom or external entity reference (&xxe;, &lol9;) refused
 *       with an error that names it
 *     - Only &amp; &lt; &gt; &quot; &apos; and numeric references such as
 *       &#169; / &#x1F600; are decoded, each checked against XML's allowed
 *       characters
 *     - Mapping: attributes → "@name", text → "#text", repeated child
 *       elements → lists, text-only element → its string, empty element → ""
 *     - Options: always use arrays for child elements; infer numbers and
 *       booleans from text (off by default)
 *     - xml:space="preserve" keeps whitespace; otherwise text is trimmed
 *     - Errors name what was expected and where (line and column): a
 *       mismatched closing tag names the tag it should close and the line
 *       it was opened on
 *     - Writer: root element from a single top-level key or the root-name
 *       option, lists → repeated elements, "@x" → attributes, "#text" →
 *       text, invalid names sanitised with a warning, every value escaped
 *     - Writer options: indent (2 spaces, 4 spaces, tab or one line) and the
 *       XML declaration
 *     - Caps: 20 MB of text, nesting depth 512, 1,000 attributes per element,
 *       2,000,000 nodes
 *
 * ✒ Usage Instructions:
 *     Browser: load before js/convert.js; the file registers the xml module
 *     on window.ConvertFormats. Node: require('./xml.js') returns { xml }.
 *     parse(text, { alwaysArrays, inferTypes }) → { value, warnings } where
 *     value is a Map with one key, the root element's name.
 *     stringify(value, { rootName, indent, declaration }) → { text,
 *     warnings }. Errors are Error objects with plain messages and line,
 *     column, offset and format fields.
 *
 * ✒ Examples:
 *     xml.parse('<a x="1"><b>hi</b></a>').value     → Map { a: Map { '@x': '1', b: 'hi' } }
 *     xml.parse('<l><i>1</i><i>2</i></l>').value     → Map { l: Map { i: ['1', '2'] } }
 *     xml.parse('<l><i>1</i></l>', { alwaysArrays: true }).value → Map { l: Map { i: ['1'] } }
 *     xml.parse('<n>42</n>', { inferTypes: true }).value → Map { n: 42 }
 *     xml.parse('<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>') → throws "Line 1, column 37: the entity &e; is not supported …"
 *     xml.stringify(new Map([['a', 1], ['b', 2]])).text → '<?xml …?>\n<root>\n  <a>1</a>\n  <b>2</b>\n</root>\n'
 *     xml.stringify(new Map([['p', new Map([['@id', 7], ['#text', 'x < y']])]])).text → '… <p id="7">x &lt; y</p>'
 *     xml.detect('<?xml version="1.0"?><a/>')        → 0.95
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (no DOM access; safe in Node and in the browser)
 *     - Compatible platforms: all evergreen browsers; Node 16+
 *     - Security: no DTD processing, no external or custom entities (XXE and
 *       billion-laughs inputs are refused), bounded depth, attributes and
 *       nodes; names become Map keys, so __proto__ is an ordinary key
 *     - Limitations: comments, processing instructions and namespaces'
 *       meaning are not kept (prefixed names stay as written); in mixed
 *       content the text pieces are joined into "#text" and their position
 *       among the child elements is lost; null and "" both write as an empty
 *       element; XML 1.0 forbids some control characters, which are written
 *       as U+FFFD with a warning
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
        attributes: 1000,
        bigDigits: 400
    });
    const DETECT_CHARS = 4096;
    const FORMAT = 'xml';

    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isMap = (v) => v instanceof Map;
    const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => `${commas(n)} ${n === 1 ? one : (many || `${one}s`)}`;
    const verb = (n, one, many) => (n === 1 ? one : many);
    const isWs = (c) => c === 32 || c === 9 || c === 10 || c === 13;
    const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

    function fail(message, pos) {
        const err = new Error(message);
        err.format = FORMAT;
        if (pos) {
            err.line = pos.line;
            err.column = pos.column;
            err.offset = pos.offset;
        }
        return err;
    }

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
            if (s === '0' || s === 'none' || s === '') s = 'minified';
            const hit = def.choices.find((c) => String(c.value).toLowerCase() === s);
            return hit ? hit.value : def.default;
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

    function jsonText(v, depth) {
        const d = depth || 0;
        if (d > LIMITS.depth) throw fail('The data is nested more than 512 levels deep.');
        if (v === null || v === undefined) return 'null';
        const t = typeof v;
        if (t === 'string') return JSON.stringify(v);
        if (t === 'number') return Number.isFinite(v) ? String(v) : 'null';
        if (t === 'bigint') return v.toString();
        if (t === 'boolean') return v ? 'true' : 'false';
        if (Array.isArray(v)) return `[${v.map((x) => jsonText(x, d + 1)).join(',')}]`;
        const entries = v instanceof Map ? [...v.entries()] : Object.keys(v).map((k) => [k, v[k]]);
        return `{${entries.map(([k, x]) => `${JSON.stringify(String(k))}:${jsonText(x, d + 1)}`).join(',')}}`;
    }

    function scalarText(v) {
        if (v === null || v === undefined) return '';
        const t = typeof v;
        if (t === 'string') return v;
        if (t === 'number' || t === 'bigint' || t === 'boolean') return String(v);
        return jsonText(v);
    }

    /* ── Names ────────────────────────────────────────────────────────── */

    // XML 1.0 (fifth edition) name characters; astral planes allowed via surrogates.
    const NAME_RE = /[A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF][A-Za-z0-9_:.\-·À-ÖØ-öø-ͽͿ-῿‌‍‿⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF]*/y;
    const VALID_NAME = /^[A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF][A-Za-z0-9_:.\-·À-ÖØ-öø-ͽͿ-῿‌‍‿⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF]*$/;
    const NAME_START = /^[A-Za-z_:À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF]/;
    const NOT_NAME_CHAR = /[^A-Za-z0-9_:.\-·À-ÖØ-öø-ͽͿ-῿‌‍‿⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\uD800-\uDFFF]/g;

    function readName(src, at) {
        NAME_RE.lastIndex = at;
        const m = NAME_RE.exec(src);
        return m ? m[0] : '';
    }

    /* ── Reading ──────────────────────────────────────────────────────── */

    const PREDEFINED = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', '\'']]);
    const REF_RE = /^(?:#[0-9]{1,8}|#x[0-9A-Fa-f]{1,8}|[A-Za-z_:À-￿][A-Za-z0-9_:.\-·À-￿]{0,127})$/;

    const allowedChar = (cp) => cp === 9 || cp === 10 || cp === 13
        || (cp >= 0x20 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);

    const textEol = (s) => (s.indexOf('\r') >= 0 ? s.replace(/\r\n?/g, '\n') : s);
    const attrWs = (s) => s.replace(/\r\n|[\t\n\r]/g, ' ');

    function parseXml(text, o) {
        if (typeof text !== 'string') throw fail('There is no text to read.');
        if (text.length > LIMITS.textChars) {
            throw fail(`This text is ${(text.length / 1048576).toFixed(1)} MB — larger than 20 MB, the most convertMan reads at a time.`);
        }
        const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        const n = src.length;
        const W = warnings();
        const locate = makeLocator(src);
        const err = (msg, offset) => {
            const p = locate(offset);
            return fail(`Line ${p.line}, column ${p.column}: ${msg}`, p);
        };
        const conv = o.inferTypes ? inferScalar : (s) => s;
        const stack = [];
        let result = null;
        let nodes = 0;
        let mixed = 0;
        let mixedName = '';

        const bump = (offset) => {
            if (++nodes > LIMITS.nodes) throw err(`this XML has more than ${commas(LIMITS.nodes)} elements, attributes and text pieces, which is convertMan's limit.`, offset);
        };

        function decode(raw, base, literal) {
            let amp = raw.indexOf('&');
            if (amp < 0) return literal(raw);
            let out = '';
            let last = 0;
            while (amp >= 0) {
                out += literal(raw.slice(last, amp));
                const semi = raw.indexOf(';', amp + 1);
                const ref = semi < 0 ? '' : raw.slice(amp + 1, Math.min(semi, amp + 140));
                if (semi < 0 || semi > amp + 139 || !REF_RE.test(ref)) {
                    throw err('a bare "&" must be written as &amp; (or start a reference such as &lt; or &#169;).', base + amp);
                }
                if (ref.charCodeAt(0) === 35) {
                    const cp = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
                    if (!allowedChar(cp)) throw err(`&${ref}; is not a character XML allows.`, base + amp);
                    out += String.fromCodePoint(cp);
                } else if (PREDEFINED.has(ref)) {
                    out += PREDEFINED.get(ref);
                } else {
                    throw err(`the entity &${ref}; is not supported. Only the five built-in XML entities (&amp; &lt; &gt; &quot; &apos;) and numeric references such as &#169; are read — custom and external entities are refused for safety.`, base + amp);
                }
                last = semi + 1;
                amp = raw.indexOf('&', last);
            }
            return out + literal(raw.slice(last));
        }

        function skipDoctype(start) {
            let j = start + 9;
            let subset = false;
            let entities = 0;
            while (j < n) {
                const c = src.charCodeAt(j);
                if (c === 34 || c === 39) {
                    const close = src.indexOf(c === 34 ? '"' : '\'', j + 1);
                    if (close < 0) throw err('a quoted value in the DOCTYPE never ends.', j);
                    j = close + 1;
                    continue;
                }
                if (subset) {
                    if (c === 60 && src.startsWith('<!--', j)) {
                        const close = src.indexOf('-->', j + 4);
                        if (close < 0) throw err('a comment inside the DOCTYPE never ends — expected "-->".', j);
                        j = close + 3;
                        continue;
                    }
                    if (c === 60 && src.startsWith('<!ENTITY', j)) entities++;
                    else if (c === 93) subset = false;
                } else if (c === 91) {
                    subset = true;
                } else if (c === 62) {
                    if (entities) {
                        W.add(`The DOCTYPE declares ${plural(entities, 'entity', 'entities')}; ${verb(entities, 'it was', 'they were')} not read, because convertMan never expands custom or external entities.`);
                    } else {
                        W.add('The DOCTYPE was skipped; convertMan does not read DTDs.');
                    }
                    return j + 1;
                }
                j++;
            }
            throw err('the DOCTYPE never ends — expected ">".', start);
        }

        function close(frame) {
            let textValue = '';
            const segs = frame.text;
            if (segs) {
                if (frame.kids) {
                    const parts = [];
                    segs.forEach((sg) => {
                        const t = sg.cdata || frame.preserve ? sg.s : sg.s.trim();
                        if (t) parts.push(t);
                    });
                    textValue = parts.join(frame.preserve ? '' : ' ');
                    if (textValue && !mixed++) mixedName = frame.name;
                } else {
                    textValue = segs.map((sg) => sg.s).join('');
                    if (!frame.preserve) {
                        if (!segs[0].cdata) textValue = textValue.replace(/^[ \t\n\r]+/, '');
                        if (!segs[segs.length - 1].cdata) textValue = textValue.replace(/[ \t\n\r]+$/, '');
                    }
                }
            }
            let value;
            if (frame.value) {
                if (textValue !== '') frame.value.set('#text', conv(textValue));
                value = frame.value;
            } else {
                value = conv(textValue);
            }
            const parent = stack[stack.length - 1];
            if (!parent) {
                result = new Map([[frame.name, value]]);
                return;
            }
            parent.kids = true;
            if (!parent.value) parent.value = new Map();
            const existing = parent.value.get(frame.name);
            if (existing === undefined) parent.value.set(frame.name, o.alwaysArrays ? [value] : value);
            else if (Array.isArray(existing)) existing.push(value);
            else parent.value.set(frame.name, [existing, value]);
        }

        let i = 0;
        while (i < n) {
            const lt = src.indexOf('<', i);
            const end = lt < 0 ? n : lt;
            if (end > i) {
                const raw = src.slice(i, end);
                if (!stack.length) {
                    const k = raw.search(/[^ \t\n\r]/);
                    if (k >= 0) {
                        throw err(result
                            ? 'text after the root element is not allowed — XML has exactly one top-level element.'
                            : 'text before the root element is not allowed — XML must start with an element such as <data>.', i + k);
                    }
                } else {
                    const top = stack[stack.length - 1];
                    if (top.preserve || /[^ \t\n\r]/.test(raw)) {
                        bump(i);
                        (top.text || (top.text = [])).push({ s: decode(raw, i, textEol), cdata: false });
                    }
                }
            }
            if (lt < 0) break;
            i = lt;
            const c2 = src.charCodeAt(i + 1);
            if (c2 === 63) {
                const closeAt = src.indexOf('?>', i + 2);
                if (closeAt < 0) throw err('this processing instruction never ends — expected "?>".', i);
                i = closeAt + 2;
                continue;
            }
            if (c2 === 33) {
                if (src.startsWith('<!--', i)) {
                    const closeAt = src.indexOf('-->', i + 4);
                    if (closeAt < 0) throw err('this comment never ends — expected "-->".', i);
                    i = closeAt + 3;
                    continue;
                }
                if (src.startsWith('<![CDATA[', i)) {
                    if (!stack.length) throw err('a CDATA section must be inside the root element.', i);
                    const closeAt = src.indexOf(']]>', i + 9);
                    if (closeAt < 0) throw err('this CDATA section never ends — expected "]]>".', i);
                    const top = stack[stack.length - 1];
                    bump(i);
                    (top.text || (top.text = [])).push({ s: textEol(src.slice(i + 9, closeAt)), cdata: true });
                    i = closeAt + 3;
                    continue;
                }
                if (src.slice(i, i + 9).toUpperCase() === '<!DOCTYPE') {
                    if (stack.length || result) throw err('a DOCTYPE is only allowed before the root element.', i);
                    i = skipDoctype(i);
                    continue;
                }
                throw err('unexpected "<!" — expected a comment (<!-- … -->), a CDATA section or a DOCTYPE.', i);
            }
            if (c2 === 47) {
                const name = readName(src, i + 2);
                if (!name) throw err('expected an element name after "</".', i + 2);
                let j = i + 2 + name.length;
                while (j < n && isWs(src.charCodeAt(j))) j++;
                if (src.charCodeAt(j) !== 62) throw err(`expected ">" to finish the closing tag </${name}>.`, j);
                const top = stack.pop();
                if (!top) throw err(`found the closing tag </${name}>, but no element is open.`, i);
                if (top.name !== name) {
                    const opened = locate(top.offset);
                    throw err(`expected </${top.name}> to close the <${top.name}> opened on line ${opened.line}, but found </${name}>.`, i);
                }
                close(top);
                i = j + 1;
                continue;
            }
            const name = readName(src, i + 1);
            if (!name) throw err('expected an element name after "<". A "<" inside text must be written as &lt;.', i + 1);
            if (!stack.length && result) {
                throw err(`found a second top-level element, <${clip(name, 60)}>. XML allows only one root element — wrap them in a single parent element.`, i);
            }
            if (stack.length >= LIMITS.depth) throw err('elements are nested more than 512 levels deep, which is convertMan\'s limit.', i);
            bump(i);
            const parent = stack[stack.length - 1];
            const frame = { name, offset: i, value: null, text: null, kids: false, preserve: parent ? parent.preserve : false };
            let j = i + 1 + name.length;
            let selfClosing = false;
            let attrs = 0;
            let seen = null;
            for (;;) {
                const gap = j;
                while (j < n && isWs(src.charCodeAt(j))) j++;
                if (j >= n) throw err(`the tag <${clip(name, 60)}> never ends — expected ">".`, i);
                const c = src.charCodeAt(j);
                if (c === 62) { j++; break; }
                if (c === 47 && src.charCodeAt(j + 1) === 62) { selfClosing = true; j += 2; break; }
                if (j === gap) throw err(`expected a space before the next attribute in <${clip(name, 60)}>.`, j);
                const an = readName(src, j);
                if (!an) throw err(`expected an attribute name, ">" or "/>" in <${clip(name, 60)}>, but found "${src[j]}".`, j);
                const at = j;
                j += an.length;
                while (j < n && isWs(src.charCodeAt(j))) j++;
                if (src.charCodeAt(j) !== 61) throw err(`expected "=" after the attribute name ${an} in <${clip(name, 60)}>.`, j);
                j++;
                while (j < n && isWs(src.charCodeAt(j))) j++;
                const q = src.charCodeAt(j);
                if (q !== 34 && q !== 39) throw err(`expected a quoted value for the attribute ${an} — XML attribute values need " or ' around them.`, j);
                const closeAt = src.indexOf(q === 34 ? '"' : '\'', j + 1);
                if (closeAt < 0) throw err(`the value of the attribute ${an} never ends — expected a closing quote.`, j);
                const raw = src.slice(j + 1, closeAt);
                const lt2 = raw.indexOf('<');
                if (lt2 >= 0) throw err(`"<" is not allowed inside the attribute ${an}; write it as &lt;.`, j + 1 + lt2);
                if (++attrs > LIMITS.attributes) throw err(`<${clip(name, 60)}> has more than ${commas(LIMITS.attributes)} attributes, which is convertMan's limit.`, at);
                if (!seen) seen = new Set();
                if (seen.has(an)) throw err(`the attribute ${an} appears twice in <${clip(name, 60)}>.`, at);
                seen.add(an);
                bump(at);
                const val = decode(raw, j + 1, attrWs);
                if (an === 'xml:space') frame.preserve = val === 'preserve';
                if (!frame.value) frame.value = new Map();
                frame.value.set(`@${an}`, conv(val));
                j = closeAt + 1;
            }
            if (selfClosing) close(frame);
            else stack.push(frame);
            i = j;
        }

        if (stack.length) {
            const top = stack[stack.length - 1];
            const opened = locate(top.offset);
            throw err(`the element <${top.name}> opened on line ${opened.line} is never closed — expected </${top.name}> before the end of the text.`, n);
        }
        if (!result) throw fail('No XML element was found. XML needs one root element, such as <data>…</data>.');
        if (mixed) {
            W.add(`${plural(mixed, 'element')} (such as <${clip(mixedName, 40)}>) mixed text with child elements; the text was joined into "#text" and its position among the elements was not kept.`);
        }
        return { value: result, warnings: W.list };
    }

    /* ── Writing ──────────────────────────────────────────────────────── */

    const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
    const NEEDS_TEXT_ESCAPE = /[&<>\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF￾￿]/;
    const NEEDS_ATTR_ESCAPE = /[&<>"\t\n\r\u0000-\u001F\uD800-\uDFFF￾￿]/;
    const TEXT_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
    const ATTR_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' };

    function stringifyXml(value, o) {
        const W = warnings();
        const unit = o.indent === '4' ? '    ' : o.indent === 'tab' ? '\t' : o.indent === 'minified' ? '' : '  ';
        const pretty = unit !== '';
        const out = [];
        let badChars = 0;
        let renamed = 0;
        let renamedExample = null;
        let emptyLists = 0;
        let nestedAttrs = 0;
        let dupAttrs = 0;
        const nameCache = new Map();

        const clean = (raw) => {
            const s = String(raw);
            if (nameCache.has(s)) return nameCache.get(s);
            let t = s;
            if (!VALID_NAME.test(s)) {
                t = s.replace(NOT_NAME_CHAR, '_');
                if (!NAME_START.test(t)) t = `_${t}`;
                renamed++;
                if (!renamedExample) renamedExample = [s, t];
            }
            if (nameCache.size < 10000) nameCache.set(s, t);
            return t;
        };
        const fixChars = (s) => s.replace(BAD_CHARS, () => { badChars++; return '�'; });
        const escText = (s) => (NEEDS_TEXT_ESCAPE.test(s) ? fixChars(s).replace(/[&<>]/g, (c) => TEXT_ESC[c]) : s);
        const escAttr = (s) => (NEEDS_ATTR_ESCAPE.test(s) ? fixChars(s).replace(/[&<>"\t\n\r]/g, (c) => ATTR_ESC[c]) : s);

        function element(name, v, depth) {
            if (depth > LIMITS.depth) throw fail('The data is nested more than 512 levels deep, which is convertMan\'s limit.');
            const pad = pretty ? unit.repeat(depth) : '';
            if (Array.isArray(v)) {
                if (!v.length) { out.push(`${pad}<${name}/>`); return; }
                out.push(`${pad}<${name}>`);
                v.forEach((item) => element('item', item, depth + 1));
                out.push(`${pad}</${name}>`);
                return;
            }
            if (isMap(v)) {
                let attrs = '';
                let text = null;
                const kids = [];
                const seen = new Set();
                v.forEach((x, k) => {
                    const key = String(k);
                    if (key.length > 1 && key[0] === '@') {
                        const an = clean(key.slice(1));
                        if (seen.has(an)) { dupAttrs++; return; }
                        seen.add(an);
                        if (x instanceof Map || Array.isArray(x)) nestedAttrs++;
                        attrs += ` ${an}="${escAttr(scalarText(x))}"`;
                    } else if (key === '#text') {
                        text = (text || '') + scalarText(x);
                    } else if (Array.isArray(x) && !x.length) {
                        emptyLists++;
                    } else {
                        kids.push([key, x]);
                    }
                });
                if (!kids.length) {
                    out.push(text ? `${pad}<${name}${attrs}>${escText(text)}</${name}>` : `${pad}<${name}${attrs}/>`);
                    return;
                }
                out.push(`${pad}<${name}${attrs}>`);
                if (text) out.push(`${pretty ? pad + unit : ''}${escText(text)}`);
                kids.forEach(([k, x]) => {
                    const cn = clean(k);
                    if (Array.isArray(x)) {
                        x.forEach((item) => element(cn, item, depth + 1));
                    } else {
                        element(cn, x, depth + 1);
                    }
                });
                out.push(`${pad}</${name}>`);
                return;
            }
            const s = scalarText(v);
            out.push(s === '' ? `${pad}<${name}/>` : `${pad}<${name}>${escText(s)}</${name}>`);
        }

        let rootName = null;
        let rootValue = value;
        if (isMap(value) && value.size === 1) {
            const [k, v] = value.entries().next().value;
            const key = String(k);
            if (!Array.isArray(v) && key !== '#text' && !(key.length > 1 && key[0] === '@')) {
                rootName = key;
                rootValue = v;
            }
        }
        if (rootName === null) rootName = o.rootName && o.rootName.trim() ? o.rootName.trim() : 'root';
        if (o.declaration) out.push('<?xml version="1.0" encoding="UTF-8"?>');
        element(clean(rootName), rootValue, 0);

        if (renamed) {
            W.add(`${plural(renamed, 'name')} ${verb(renamed, 'was', 'were')} not valid in XML and ${verb(renamed, 'was', 'were')} changed (for example "${clip(renamedExample[0], 40)}" became "${clip(renamedExample[1], 40)}").`);
        }
        if (emptyLists) W.add(`${plural(emptyLists, 'empty list')} ${verb(emptyLists, 'has', 'have')} no XML form and ${verb(emptyLists, 'was', 'were')} left out.`);
        if (nestedAttrs) W.add(`${plural(nestedAttrs, 'attribute')} held a list or record, which XML attributes cannot; ${verb(nestedAttrs, 'it was', 'they were')} written as JSON text.`);
        if (dupAttrs) W.add(`${plural(dupAttrs, 'attribute')} had the same name as another after cleaning and ${verb(dupAttrs, 'was', 'were')} left out.`);
        if (badChars) W.add(`${plural(badChars, 'character')} that XML 1.0 does not allow ${verb(badChars, 'was', 'were')} replaced with �.`);
        return { text: pretty ? `${out.join('\n')}\n` : out.join(''), warnings: W.list };
    }

    /* ── Detection ────────────────────────────────────────────────────── */

    function detectXml(text) {
        if (typeof text !== 'string' || !text) return 0;
        let s = text.slice(0, DETECT_CHARS);
        if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
        s = s.trimStart();
        if (s[0] !== '<') return 0;
        if (/^<\?xml[\s?]/.test(s)) return 0.95;
        if (/^<!doctype\s+html/i.test(s) || /^<html[\s>]/i.test(s)) return 0.4;
        if (/^<!(--|DOCTYPE)/.test(s)) return 0.7;
        const m = /^<([A-Za-z_:][\w.:-]*)[\s>/]/.exec(s);
        if (!m) return 0;
        if (s.indexOf(`</${m[1]}`) >= 0 || /\/>/.test(s)) return 0.85;
        return 0.5;
    }

    /* ── Module ───────────────────────────────────────────────────────── */

    const inputOptions = [
        { key: 'alwaysArrays', label: 'Always use arrays', type: 'checkbox', default: false, help: 'Put every child element in an array (a list), even when it appears once, so the shape stays the same from one document to the next.' },
        { key: 'inferTypes', label: 'Infer types', type: 'checkbox', default: false, help: 'Read text such as 42, 3.5, true and false as numbers and booleans. Off keeps every value as text, as XML does.' }
    ];
    const outputOptions = [
        { key: 'rootName', label: 'Root element name', type: 'text', default: 'root', help: 'Used when the data does not have exactly one top-level key to serve as the root element. List items are written as <item>.' },
        { key: 'indent', label: 'Indent', type: 'select', choices: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }, { value: 'minified', label: 'None (one line)' }], default: '2', help: 'How far each nested element is indented.' },
        { key: 'declaration', label: 'XML declaration', type: 'checkbox', default: true, help: 'Start with <?xml version="1.0" encoding="UTF-8"?>.' }
    ];

    const sample = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<library>',
        '  <book id="b1" lang="en">',
        '    <title>The Pragmatic Programmer</title>',
        '    <author>David Thomas</author>',
        '    <author>Andrew Hunt</author>',
        '    <year>1999</year>',
        '    <tags>',
        '      <tag>craft</tag>',
        '      <tag>career</tag>',
        '    </tags>',
        '  </book>',
        '  <book id="b2" lang="en">',
        '    <title>Refactoring &amp; Design</title>',
        '    <author>Martin Fowler</author>',
        '    <year>2018</year>',
        '    <note><![CDATA[Second edition uses <JavaScript> examples.]]></note>',
        '  </book>',
        '</library>',
        ''
    ].join('\n');

    const xml = {
        id: 'xml',
        label: 'XML',
        extensions: ['xml'],
        mime: 'application/xml',
        kind: 'tree',
        canParse: true,
        canStringify: true,
        detect(text) {
            try { return detectXml(text); } catch (err) { return 0; }
        },
        parse(text, opts) {
            return parseXml(text, readOptions(inputOptions, opts));
        },
        stringify(value, opts) {
            return stringifyXml(value, readOptions(outputOptions, opts));
        },
        inputOptions,
        outputOptions,
        sample,
        notes: 'XML holds nested elements with attributes and text; attributes become "@name" keys and text becomes "#text". Types, null versus empty, comments, and the order of text mixed in among elements are not kept.'
    };

    return { xml };
});
