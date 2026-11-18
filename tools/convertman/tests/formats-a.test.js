/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: FormatsATests (convertMan Edition - v1.0)
 *     - File Name: formats-a.test.js
 *     - Relative Path: tools/convertman/tests/formats-a.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for convertMan's conversion core (js/convert.js) and its
 *     tree formats: JSON, JSON Lines, YAML and TOML. They pin down every
 *     rule in the format contract — positions in error messages, scalar
 *     styles, quoting, tables, caps — so a change to a reader or writer
 *     cannot quietly change what visitors get. Run them after any edit to
 *     those files.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus the same small runner mathMan uses
 *     - JSON: exact line / column errors, relaxed mode, big integers, the
 *       writer's indent / sort / ASCII options, duplicate-key warnings
 *     - JSON Lines: blank lines, CRLF, errors that name the bad line
 *     - YAML: every scalar style and chomping mode, flow collections,
 *       comments, anchors, aliases and merge keys, tags, several documents
 *     - YAML safety: a "billion laughs" document refused in under 200 ms,
 *       self-referencing aliases, tabs, control characters, the depth cap
 *     - YAML writer: quoting of yes / no / on / null / number-like / padded
 *       / ': ' / '#' / empty strings and literal blocks, all read back exact
 *     - TOML: the spec example, arrays of tables, inline tables, dotted
 *       keys, every string kind, 0x / 0o / 0b, inf / nan, date-times,
 *       every redefinition rule, and the writer's null and root warnings
 *     - Prototype safety: "__proto__" and "constructor" keys round-trip
 *       JSON → YAML → TOML → JSON and Object.prototype stays clean
 *     - Pipeline: detect() ranking, convert() stats and error stages,
 *       option validation, data-model helpers and isSecretLike()
 *     - Performance: a 1 MB JSON → YAML → JSON round trip in under a second,
 *       10,000 nested arrays refused without a stack overflow
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/convertman/tests/formats-a.test.js
 *     A clean run ends with "All N tests passed (M assertions)".
 *
 * ✒ Examples:
 *     node tools/convertman/tests/formats-a.test.js          → full run
 *     node tools/convertman/tests/formats-a.test.js yaml     → only tests whose
 *                                                               name contains "yaml"
 *     eq(plain(json.parse('{"a": [1]}').value), { a: [1] })
 *     ok(/line 3, column 5/i.test(fails(() => json.parse(text)).message))
 *     eq(roundYaml('yes'), 'yes')
 *     eq(Convert.detect(''), [])
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+, ../js/convert.js and ../js/formats/json.js,
 *       yaml.js and toml.js (the Formats B modules are loaded when present)
 *     - Compatible platforms: any OS with Node
 *     - Limitations: timing tests use generous bounds; the browser UI is
 *       covered by the e2e suite
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const JS = path.join(__dirname, '..', 'js');
const Convert = require(path.join(JS, 'convert.js'));
const { json, jsonl } = require(path.join(JS, 'formats', 'json.js'));
const { yaml } = require(path.join(JS, 'formats', 'yaml.js'));
const { toml } = require(path.join(JS, 'formats', 'toml.js'));

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

/** Run fn, expect it to throw, return the error. */
function fails(fn, msg) {
    try { fn(); } catch (e) { assertions++; return e; }
    assertions++;
    throw new assert.AssertionError({ message: msg || 'expected an error, but none was thrown' });
}

/** Expect an error at a 1-based line and column whose message matches re. */
function failsAt(fn, line, column, re) {
    const e = fails(fn);
    eq([e.line, e.column], [line, column], `position of "${e.message}"`);
    if (re) ok(re.test(e.message), `message "${e.message}" should match ${re}`);
    ok(e.message.startsWith(`Line ${line}, column ${column}: `), `message "${e.message}" should start with its position`);
    return e;
}

const plain = (v) => Convert.toPlainJSON(v);
const M = (obj) => Convert.fromPlain(obj);
const J = (text, o) => json.parse(text, o).value;
const Y = (text, o) => yaml.parse(text, o).value;
const T = (text) => toml.parse(text).value;
const roundYaml = (v) => Y(yaml.stringify(v).text);

/* ------------------------------------------------------------------ */
/* JSON                                                                */
/* ------------------------------------------------------------------ */

test('json: objects become Map, arrays and scalars stay as they are', () => {
    const v = J('{"name": "Ada", "tags": ["x", "y"], "n": 3, "ok": true, "none": null, "o": {}}');
    ok(v instanceof Map);
    eq(Array.from(v.keys()), ['name', 'tags', 'n', 'ok', 'none', 'o']);
    eq(v.get('tags'), ['x', 'y']);
    eq(v.get('none'), null);
    ok(v.get('o') instanceof Map && v.get('o').size === 0);
    eq(J('[]'), []);
    eq(J('"text"'), 'text');
    eq(J(' 42 '), 42);
    eq(J('null'), null);
});

test('json: every escape, including surrogate pairs', () => {
    eq(J('"a\\"b\\\\c\\/d\\b\\f\\n\\r\\t"'), 'a"b\\c/d\b\f\n\r\t');
    eq(J('"\\u00e9\\uD83D\\uDE00"'), 'é😀');
    eq(J('"\\u0000"'), '\u0000');
});

test('json: numbers — integers, decimals, exponents and -0', () => {
    eq(J('[0, -1, 3.25, 1e3, 2.5E-2, -0]'), [0, -1, 3.25, 1000, 0.025, -0]);
    ok(Object.is(J('-0'), -0));
    eq(J('9007199254740991'), 9007199254740991);
});

test('json: big integer 12345678901234567890 round-trips exactly', () => {
    const v = J('{"id": 12345678901234567890, "neg": -98765432109876543210}');
    eq(v.get('id'), 12345678901234567890n);
    eq(v.get('neg'), -98765432109876543210n);
    eq(json.stringify(v, { indent: 'min' }).text, '{"id":12345678901234567890,"neg":-98765432109876543210}\n');
    const viaYaml = Convert.convert(Convert.convert('{"id": 12345678901234567890}', 'json', 'yaml').text, 'yaml', 'json', { output: { indent: 'min' } });
    eq(viaYaml.text, '{"id":12345678901234567890}\n');
    const viaToml = Convert.convert('{"id": 12345678901234567890}', 'json', 'toml');
    ok(/id = "12345678901234567890"/.test(viaToml.text), 'past 64 bits TOML writes it as text');
    eq(Convert.convert('{"id": 9223372036854775807}', 'json', 'toml').text, 'id = 9223372036854775807\n');
});

test("json: \"Expected ',' or '}' after a value\" with exact line and column", () => {
    const text = '{\n  "a": 1,\n  "b": 2\n  "c": 3\n}';
    const e = failsAt(() => json.parse(text), 4, 3, /expected ',' or '\}' after a value, but found '"'/i);
    eq(e.format, 'json');
    eq(e.offset, text.indexOf('"c"'));
    ok(/^Expected ',' or '\}' after a value/.test(e.reason));
});

test("json: \"Expected ',' or ']'\" and the end of the text inside an array", () => {
    failsAt(() => json.parse('[1, 2 3]'), 1, 7, /expected ',' or '\]' after a value/i);
    failsAt(() => json.parse('[1, 2'), 1, 6, /ended inside an array/i);
    failsAt(() => json.parse('{"a": 1'), 1, 8, /ended inside an object/i);
});

test('json: trailing commas point at the comma; Relaxed accepts them', () => {
    failsAt(() => json.parse('{"a": 1,\n}'), 1, 8, /trailing commas/i);
    failsAt(() => json.parse('[1,]'), 1, 3, /trailing commas/i);
    eq(plain(J('{"a": [1, 2,],}', { relaxed: true })), { a: [1, 2] });
});

test('json: unterminated strings point at the opening quote', () => {
    failsAt(() => json.parse('{"a": "hello}'), 1, 7, /never closed/i);
    failsAt(() => json.parse('"line\nbreak"'), 1, 6, /line break/i);
});

test('json: numbers, escapes and words give specific errors', () => {
    failsAt(() => json.parse('[01]'), 1, 2, /can't start with 0/i);
    failsAt(() => json.parse('[1.]'), 1, 4, /digit after the decimal point/i);
    failsAt(() => json.parse('[-]'), 1, 3, /digit after '-'/i);
    failsAt(() => json.parse('"\\x41"'), 1, 2, /unknown escape '\\x'/i);
    failsAt(() => json.parse('"\\u12G4"'), 1, 2, /four hex digits/i);
    failsAt(() => json.parse('{"a": True}'), 1, 7, /unknown word 'True'/i);
    failsAt(() => json.parse("{'a': 1}"), 1, 2, /double quotes/i);
    failsAt(() => json.parse('{a: 1}'), 1, 2, /double quotes/i);
    failsAt(() => json.parse('"tab\there"'), 1, 5, /raw tab/i);
});

test('json: comments are refused with a hint, and read in Relaxed mode', () => {
    failsAt(() => json.parse('{\n  // note\n  "a": 1\n}'), 2, 3, /no comments/i);
    const v = J('{\n  // note\n  "a": 1, /* block\n comment */ "b": 2\n}', { relaxed: true });
    eq(plain(v), { a: 1, b: 2 });
    failsAt(() => json.parse('/* open', { relaxed: true }), 1, 1, /never closed/i);
});

test('json: Relaxed reads single quotes and unquoted keys', () => {
    eq(plain(J("{name: 'Ada', $id: 1, _x: 'it\\'s'}", { relaxed: true })), { name: 'Ada', $id: 1, _x: "it's" });
});

test('json: empty text and trailing text', () => {
    failsAt(() => json.parse('   '), 1, 4, /empty/i);
    const e = failsAt(() => json.parse('{"a": 1}\n{"a": 2}'), 2, 1, /end of the JSON/i);
    ok(/JSON Lines/.test(e.message), 'suggests JSON Lines');
    failsAt(() => json.parse('[1] x'), 1, 5, /found 'x'/);
});

test('json: duplicate keys keep the last value and warn with the line', () => {
    const r = json.parse('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}');
    eq(plain(r.value), { a: 3, b: 2 });
    eq(Array.from(r.value.keys()), ['a', 'b']);
    eq(r.warnings, ['1 duplicate key was found ("a" on line 4); the last value was kept.']);
    const many = json.parse('{"x": 1, "x": 2, "y": 1, "y": 2}');
    ok(/2 duplicate keys were found \(the first is "x" on line 1\)/.test(many.warnings[0]), many.warnings[0]);
});

test('json: __proto__ and constructor are ordinary keys', () => {
    const v = J('{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}}');
    ok(v instanceof Map);
    eq(Array.from(v.keys()), ['__proto__', 'constructor']);
    eq(v.get('__proto__').get('polluted'), 'yes');
    eq(({}).polluted, undefined);
    eq(Object.prototype.polluted, undefined);
    const p = plain(v);
    ok(Object.prototype.hasOwnProperty.call(p, '__proto__'), 'toPlainJSON keeps it as an own key');
    eq(Object.getPrototypeOf(p), Object.prototype);
});

test('json stringify: indent 2, 4, tab and minified', () => {
    const v = M({ a: [1, { b: null }], c: {} });
    eq(json.stringify(v).text, '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ],\n  "c": {}\n}\n');
    eq(json.stringify(v, { indent: '4' }).text.split('\n')[1], '    "a": [');
    eq(json.stringify(v, { indent: 'tab' }).text.split('\n')[1], '\t"a": [');
    eq(json.stringify(v, { indent: 'min' }).text, '{"a":[1,{"b":null}],"c":{}}\n');
    eq(json.stringify(M([]), {}).text, '[]\n');
});

test('json stringify: sort keys and escape non-ASCII', () => {
    const v = M({ b: 1, a: { d: 1, c: 2 }, é: 'ü😀' });
    eq(json.stringify(v, { indent: 'min', sortKeys: true }).text, '{"a":{"c":2,"d":1},"b":1,"é":"ü😀"}\n');
    eq(json.stringify(v, { indent: 'min', escapeNonAscii: true }).text, '{"b":1,"a":{"d":1,"c":2},"\\u00e9":"\\u00fc\\ud83d\\ude00"}\n');
    eq(J(json.stringify(v, { escapeNonAscii: true }).text).get('é'), 'ü😀');
});

test('json stringify: NaN and Infinity become null with a warning', () => {
    const r = json.stringify([NaN, Infinity, 1], { indent: 'min' });
    eq(r.text, '[null,null,1]\n');
    eq(r.warnings, ['JSON has no NaN or Infinity — 2 values were written as null.']);
    eq(json.stringify(1e21, {}).text, '1e+21\n');
    eq(json.stringify(2 ** 60, {}).text, '1.152921504606847e+18\n', 'a float past 2^53 keeps its float form');
});

test('json: 10,000 nested arrays stop at the depth cap without a stack overflow', () => {
    const deep = `${'['.repeat(10000)}${']'.repeat(10000)}`;
    const e = fails(() => json.parse(deep));
    ok(/nested more than 512 levels/.test(e.message), e.message);
    eq([e.line, e.column], [1, 513]);
    const fine = `${'['.repeat(512)}${']'.repeat(512)}`;
    let v = J(fine);
    let d = 0;
    while (Array.isArray(v) && v.length) { v = v[0]; d++; }
    eq(d, 511);
    const c = fails(() => Convert.convert(deep, 'auto', 'yaml'));
    eq(c.stage, 'parse');
    ok(!(c instanceof RangeError));
});

test('jsonl: one value per line, blank lines skipped, CRLF accepted', () => {
    const r = jsonl.parse('{"a": 1}\r\n\r\n[2]\n"three"\n  \n');
    eq(plain(r.value), [{ a: 1 }, [2], 'three']);
    eq(r.warnings, []);
    eq(jsonl.parse('').value, []);
});

test('jsonl: a bad line is named with its line and column', () => {
    const e = failsAt(() => jsonl.parse('{"a": 1}\n\n{"a": 2,}\n'), 3, 8, /line 3 is not valid JSON/i);
    eq(e.format, 'jsonl');
    ok(/trailing commas/i.test(e.message));
    const relaxed = jsonl.parse('{a: 1}\n{b: 2,}\n', { relaxed: true });
    eq(plain(relaxed.value), [{ a: 1 }, { b: 2 }]);
});

test('jsonl: a list is written one item per line; anything else is one line', () => {
    eq(jsonl.stringify(M([{ a: 1 }, [1, 2], 'x', null])).text, '{"a":1}\n[1,2]\n"x"\nnull\n');
    const one = jsonl.stringify(M({ a: { b: 1 } }));
    eq(one.text, '{"a":{"b":1}}\n');
    ok(/single value/.test(one.warnings[0]));
    eq(jsonl.stringify([]).text, '');
    eq(jsonl.stringify(M([{ b: 1, a: 2 }]), { sortKeys: true }).text, '{"a":2,"b":1}\n');
});

test('json: a 1 MB JSON → YAML → JSON round trip takes under a second', () => {
    const rows = [];
    for (let k = 0; rows.length < 4200; k++) {
        rows.push({
            id: k, name: `User ${k}`, email: `user${k}@example.com`, active: k % 3 === 0, score: k * 1.5,
            tags: ['alpha', 'beta', k % 2 ? 'odd' : 'even'], address: { city: 'Lisbon', zip: `${10000 + k}`, note: k % 7 ? null : 'call: first' }
        });
    }
    const text = JSON.stringify(rows, null, 2);
    ok(text.length > 1024 * 1024, `${text.length} characters`);
    const t0 = Date.now();
    const asYaml = Convert.convert(text, 'json', 'yaml');
    const back = Convert.convert(asYaml.text, 'yaml', 'json');
    const ms = Date.now() - t0;
    ok(ms < 1000, `round trip took ${ms} ms`);
    eq(back.text, `${text}\n`);
    eq(asYaml.stats.records, 4200);
});

/* ------------------------------------------------------------------ */
/* YAML: reading                                                       */
/* ------------------------------------------------------------------ */

test('yaml: plain scalars follow the YAML 1.2 core schema', () => {
    const v = Y([
        'n1: ~', 'n2: null', 'n3: NULL', 'n4:', 'b1: true', 'b2: False', 'i1: 42', 'i2: -7', 'i3: +3',
        'hex: 0x1F', 'oct: 0o17', 'f1: 3.25', 'f2: 1e3', 'f3: -.5', 'inf: .inf', 'ninf: -.Inf', 'nan: .NaN',
        'big: 12345678901234567890', 's1: hello world', 's2: 1.2.3', 's3: 0x1G'
    ].join('\n'));
    eq(v.get('n1'), null); eq(v.get('n2'), null); eq(v.get('n3'), null); eq(v.get('n4'), null);
    eq(v.get('b1'), true); eq(v.get('b2'), false);
    eq([v.get('i1'), v.get('i2'), v.get('i3'), v.get('hex'), v.get('oct')], [42, -7, 3, 31, 15]);
    eq([v.get('f1'), v.get('f2'), v.get('f3')], [3.25, 1000, -0.5]);
    eq([v.get('inf'), v.get('ninf')], [Infinity, -Infinity]);
    ok(Number.isNaN(v.get('nan')));
    eq(v.get('big'), 12345678901234567890n);
    eq([v.get('s1'), v.get('s2'), v.get('s3')], ['hello world', '1.2.3', '0x1G']);
});

test('yaml: YAML 1.1 words (yes, no, on, off, y, n) are text under YAML 1.2', () => {
    eq(plain(Y('a: yes\nb: no\nc: on\nd: off\ne: y\nf: N')), { a: 'yes', b: 'no', c: 'on', d: 'off', e: 'y', f: 'N' });
});

test('yaml: YAML 1.1 octal-looking numbers read as decimal, with a warning', () => {
    const r = yaml.parse('mode: 0755\nzip: 01234\nplain: 0\nquoted: "0755"');
    eq(plain(r.value), { mode: 755, zip: 1234, plain: 0, quoted: '0755' });
    eq(r.warnings.length, 1);
    ok(/2 numbers with a leading zero \(such as 0755\) were read as decimal/.test(r.warnings[0]), r.warnings[0]);
});

test("yaml: single-quoted scalars ('' escapes, folding, spaces kept)", () => {
    const v = Y("a: 'it''s'\nb: '  padded  '\nc: 'one\n  two\n\n  three'\nd: ''\ne: '# not a comment'");
    eq(plain(v), { a: "it's", b: '  padded  ', c: 'one two\nthree', d: '', e: '# not a comment' });
});

test('yaml: double-quoted scalars and every escape', () => {
    const v = Y('a: "tab\\there"\nb: "\\x41\\u00e9\\U0001F600"\nc: "q\\"uote \\\\ slash \\/"\nd: "line \\\n   joined"\ne: "x\\0y\\ez\\N\\_\\L\\P"\nf: "two\n\n  lines"');
    eq(v.get('a'), 'tab\there');
    eq(v.get('b'), 'Aé😀');
    eq(v.get('c'), 'q"uote \\ slash /');
    eq(v.get('d'), 'line joined');
    eq(v.get('e'), 'x\0y\x1bz\x85\xa0\u2028\u2029');
    eq(v.get('f'), 'two\nlines');
    failsAt(() => yaml.parse('a: "bad \\q"'), 1, 9, /unknown escape '\\q'/i);
    failsAt(() => yaml.parse('a: "\\u12"'), 1, 5, /4 hex digits/i);
});

test('yaml: literal blocks with clip, strip and keep chomping', () => {
    const v = Y('clip: |\n  one\n  two\n\n\nstrip: |-\n  one\n  two\n\nkeep: |+\n  one\n  two\n\n\nend: x');
    eq(v.get('clip'), 'one\ntwo\n');
    eq(v.get('strip'), 'one\ntwo');
    eq(v.get('keep'), 'one\ntwo\n\n\n');
    eq(v.get('end'), 'x');
    eq(Y('t: |\n  first\n    indented\n  # not a comment\n'), new Map([['t', 'first\n  indented\n# not a comment\n']]));
    eq(Y('t: |\n  last line, no newline'), new Map([['t', 'last line, no newline\n']]));
});

test('yaml: folded blocks join lines, keep blank lines and more-indented lines', () => {
    const v = Y('f: >\n  one\n  two\n\n  three\n    code\n  four\nstrip: >-\n  a\n  b\nkeep: >+\n  a\n\n');
    eq(v.get('f'), 'one two\nthree\n  code\nfour\n');
    eq(v.get('strip'), 'a b');
    eq(v.get('keep'), 'a\n\n');
});

test('yaml: block indentation numbers and header errors', () => {
    eq(Y('a: |2\n   three spaces\n  two\n').get('a'), ' three spaces\ntwo\n');
    eq(Y('- |1\n  x\n').length, 1);
    failsAt(() => yaml.parse('a: |++\n  x'), 1, 6, /only one chomping/i);
    failsAt(() => yaml.parse('a: |0\n  x'), 1, 5, /1 to 9/i);
    failsAt(() => yaml.parse('a: | text\n'), 1, 6, /line break after '\|'/i);
});

test('yaml: multi-line plain scalars fold into one line', () => {
    eq(Y('a: one\n  two\n   three\n\n  four'), new Map([['a', 'one two three\nfour']]));
    eq(Y('just some\ntext'), 'just some text');
    eq(Y('url: http://example.com:8080/a#frag'), new Map([['url', 'http://example.com:8080/a#frag']]));
    eq(Y('a: value # comment'), new Map([['a', 'value']]));
});

test('yaml: flow collections, nested and JSON-style', () => {
    eq(plain(Y('{"a": [1, 2, {"b": null}], c: {d: e}, "f":true}')), { a: [1, 2, { b: null }], c: { d: 'e' }, f: true });
    eq(plain(Y('[a, b, [c, [d]], {x: 1}, ]')), ['a', 'b', ['c', ['d']], { x: 1 }]);
    eq(plain(Y('[one: 1, two]')), [{ one: 1 }, 'two']);
    eq(plain(Y('{a, b: }')), { a: null, b: null });
    eq(plain(Y('k: [a,\n  b,\n  c]')), { k: ['a', 'b', 'c'] });
    eq(plain(Y('[a:1, http://x.y]')), ['a:1', 'http://x.y']);
    eq(plain(Y('{}')), {});
    eq(Y('[]'), []);
});

test('yaml: comments on their own lines, after values and inside flow', () => {
    const v = Y('# top\na: 1 # one\n# middle\nb:   # nothing yet\n  - x # item\n  # between\n  - y\nc: [1, # first\n  2]\n# end');
    eq(plain(v), { a: 1, b: ['x', 'y'], c: [1, 2] });
});

test('yaml: block sequences — nested, compact, empty items, under a key', () => {
    eq(plain(Y('- a\n- - b\n  - c\n- d: 1\n  e: 2\n-\n- ""')), ['a', ['b', 'c'], { d: 1, e: 2 }, null, '']);
    eq(plain(Y('list:\n- 1\n- 2\nnext: 3')), { list: [1, 2], next: 3 });
    eq(plain(Y('a:\n  - b:\n      - c\n    d: e')), { a: [{ b: ['c'], d: 'e' }] });
});

test('yaml: explicit ? keys, and lists used as keys become text', () => {
    eq(plain(Y('? key\n: value\n? lone\n')), { key: 'value', lone: null });
    const r = yaml.parse('? [a, b]\n: c\n');
    eq(plain(r.value), { '["a", "b"]': 'c' });
    ok(/1 key was a list or mapping and was turned into text/.test(r.warnings[0]), r.warnings[0]);
    eq(plain(Y('1.0: float key\n0x1F: hex key\ntrue: bool key\n~: null key')), { '1.0': 'float key', '0x1F': 'hex key', true: 'bool key', '~': 'null key' });
});

test('yaml: anchors and aliases', () => {
    const v = Y('base: &b\n  x: 1\n  list: &l [1, 2]\ncopy: *b\nlist2: *l\nname: &n Ada\nwho: *n');
    eq(plain(v.get('copy')), { x: 1, list: [1, 2] });
    eq(v.get('list2'), [1, 2]);
    eq(v.get('who'), 'Ada');
    failsAt(() => yaml.parse('a: *missing'), 1, 4, /unknown alias \*missing/i);
    failsAt(() => yaml.parse('a: &x *y'), 1, 7, /unknown alias/i);
});

test('yaml: merge keys (<<) with one mapping or a list, explicit keys win', () => {
    const v = Y([
        'defaults: &d {adapter: pg, host: localhost, pool: 5}',
        'extra: &e {pool: 20, ssl: true}',
        'dev:', '  <<: *d', '  database: dev',
        'prod:', '  host: db.example.com', '  <<: [*e, *d]', '  pool: 50'
    ].join('\n'));
    eq(plain(v.get('dev')), { adapter: 'pg', host: 'localhost', pool: 5, database: 'dev' });
    eq(plain(v.get('prod')), { host: 'db.example.com', pool: 50, ssl: true, adapter: 'pg' });
    eq(yaml.parse('a: &a {x: 1}\nb:\n  <<: *a\n  x: 2').warnings, [], 'overriding a merged key is not a duplicate');
    eq(plain(Y('a: {"<<": 1}')), { a: { '<<': 1 } }, 'a quoted << is an ordinary key');
    failsAt(() => yaml.parse('a:\n  <<: 5'), 2, 3, /merge key/i);
});

test('yaml: a billion-laughs document is refused quickly with a plain error', () => {
    const lines = ['a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]'];
    for (let k = 1; k < 9; k++) {
        const prev = String.fromCharCode(96 + k);
        const name = String.fromCharCode(97 + k);
        lines.push(`${name}: &${name} [${Array(9).fill(`*${prev}`).join(', ')}]`);
    }
    const t0 = Date.now();
    const e = fails(() => yaml.parse(lines.join('\n')));
    const ms = Date.now() - t0;
    ok(ms < 200, `took ${ms} ms`);
    ok(/would expand to more than 100,000 values/.test(e.message) && /billion laughs/.test(e.message), e.message);
    eq(e.format, 'yaml');
    ok(e.line >= 5);
    const merge = ['a: &a {k0: 0}'];
    for (let k = 1; k < 30; k++) merge.push(`m${k}: &m${k} [${Array(9).fill(k === 1 ? '*a' : `*m${k - 1}`).join(', ')}]`);
    ok(/billion laughs/.test(fails(() => yaml.parse(merge.join('\n'))).message));
});

test('yaml: an alias can never point into its own node', () => {
    failsAt(() => yaml.parse('&a [1, *a]'), 1, 8, /points into the node it belongs to/i);
    failsAt(() => yaml.parse('a: &x\n  b: *x'), 2, 6, /points into the node/i);
    eq(plain(Y('a: &x 1\nb: &x [*x]')), { a: 1, b: [1] }, 'a redefined anchor refers to the earlier node');
});

test('yaml: several documents — first only (with a warning) or all as a list', () => {
    const text = '---\nname: one\n...\n---\nname: two\n--- # third\n- 3\n';
    const first = yaml.parse(text);
    eq(plain(first.value), { name: 'one' });
    ok(/3 documents; only the first was read/.test(first.warnings[0]), first.warnings[0]);
    eq(plain(yaml.parse(text, { documents: 'all' }).value), [{ name: 'one' }, { name: 'two' }, [3]]);
    eq(yaml.parse('---\n---\n', { documents: 'all' }).value, [null, null]);
    eq(yaml.parse('a: 1', { documents: 'all' }).value.length, 1);
});

test('yaml: directives, document markers and inline document content', () => {
    eq(plain(Y('%YAML 1.2\n---\na: 1\n')), { a: 1 });
    eq(Y('--- |\n  text\n'), 'text\n');
    eq(plain(Y('--- {a: 1}\n...\n')), { a: 1 });
    eq(plain(Y('%TAG !e! tag:yaml.org,2002:\n---\na: !e!int "5"')), { a: 5 });
    failsAt(() => yaml.parse('%YAML 2.0\n---\na: 1'), 1, 1, /unsupported YAML version/i);
    failsAt(() => yaml.parse('%YAML 1.2\na: 1'), 2, 1, /expected '---'/i);
});

test('yaml: the core tags are honoured', () => {
    const v = Y([
        'a: !!str 123', 'b: !!str true', 'c: !!int "42"', 'd: !!float 3', 'e: !!bool "TRUE"', 'f: !!null ""',
        'g: !!map {x: 1}', 'h: !!seq [1]', 'i: !!str', 'j: !!map', 'k: !!int 0x10', 'l: ! 12', 'm: !<tag:yaml.org,2002:str> 7'
    ].join('\n'));
    eq(plain(v), { a: '123', b: 'true', c: 42, d: 3, e: true, f: null, g: { x: 1 }, h: [1], i: '', j: {}, k: 16, l: '12', m: '7' });
});

test('yaml: other tags are ignored with a warning; bad core tags are errors', () => {
    const r = yaml.parse('a: !custom 5\nb: !custom x\nc: !!binary aGk=\nd: !!set {x}');
    eq(plain(r.value), { a: 5, b: 'x', c: 'aGk=', d: { x: null } });
    ok(r.warnings.includes("The tag !custom isn't supported, so it was ignored (2 values)."), r.warnings.join(' | '));
    ok(r.warnings.some((w) => /!!binary/.test(w)) && r.warnings.some((w) => /!!set/.test(w)));
    failsAt(() => yaml.parse('a: !!int abc'), 1, 4, /needs a whole number/i);
    failsAt(() => yaml.parse('a: !!bool maybe'), 1, 4, /true or false/i);
    failsAt(() => yaml.parse('a: !!map [1]'), 1, 4, /needs a mapping/i);
    failsAt(() => yaml.parse('a: !e!x 1'), 1, 4, /not declared/i);
});

test('yaml: errors name the line and column and say what was expected', () => {
    failsAt(() => yaml.parse('a: [1, 2'), 1, 4, /never closed — expected '\]'/i);
    failsAt(() => yaml.parse('a: {b: 1'), 1, 4, /never closed — expected '\}'/i);
    failsAt(() => yaml.parse('a: 1\n  b: 2'), 2, 4, /indentation/i);
    failsAt(() => yaml.parse('a: 1\n b: 2'), 2, 3, /indentation/i);
    failsAt(() => yaml.parse('a:\n\t- x'), 2, 1, /tabs for indentation/i);
    failsAt(() => yaml.parse('a: "open'), 1, 4, /never closed/i);
    failsAt(() => yaml.parse("a: 'open\n"), 1, 4, /never closed/i);
    failsAt(() => yaml.parse('- a\n- b\nc: d'), 3, 1, /end of the document/i);
    eq(Y('a: [1 2]').get('a'), ['1 2'], 'a space does not separate flow items');
    failsAt(() => yaml.parse('a: [1, 2]]'), 1, 10, /unexpected '\]'/i);
    failsAt(() => yaml.parse('[a, , b]'), 1, 5, /extra comma/i);
    failsAt(() => yaml.parse('a: b: c'), 1, 5, /unexpected ':'/i);
    failsAt(() => yaml.parse('ok: 1\nbad\nalso: 2'), 2, 1, /'key: value'/i);
});

test('yaml: duplicate keys keep the last value and warn', () => {
    const r = yaml.parse('a: 1\nb: 2\na: 3\n');
    eq(plain(r.value), { a: 3, b: 2 });
    eq(r.warnings, ['1 duplicate key was found ("a" on line 3); the last value was kept.']);
});

test('yaml: __proto__, constructor and prototype are plain keys', () => {
    const v = Y('__proto__: {polluted: yes}\nconstructor:\n  prototype:\n    polluted: yes\n<<: {merged: 1}');
    eq(Array.from(v.keys()), ['__proto__', 'constructor', 'merged']);
    eq(({}).polluted, undefined);
    eq(Object.prototype.polluted, undefined);
});

test('yaml: control characters are refused; BOM and CRLF are fine', () => {
    failsAt(() => yaml.parse('a: b\u0001c'), 1, 5, /control character U\+0001/);
    eq(plain(Y('\uFEFFa: 1\r\nb:\r\n  - x\r\n')), { a: 1, b: ['x'] });
    eq(Y('t: |\r\n  one\r\n  two\r\n').get('t'), 'one\ntwo\n');
});

test('yaml: empty documents and comment-only text read as null', () => {
    eq(Y(''), null);
    eq(Y('# nothing here\n\n'), null);
    eq(Y('---\n'), null);
});

test('yaml: 10,000 nested flow lists stop at the depth cap', () => {
    const e = fails(() => yaml.parse(`${'['.repeat(10000)}${']'.repeat(10000)}`));
    ok(/nested more than 512 levels/.test(e.message), e.message);
    ok(!(e instanceof RangeError));
    const block = Array.from({ length: 600 }, (_, k) => `${' '.repeat(k)}- `).join('\n');
    ok(/nested more than 512/.test(fails(() => yaml.parse(`${block}x`)).message));
});

/* ------------------------------------------------------------------ */
/* YAML: writing                                                       */
/* ------------------------------------------------------------------ */

test("yaml stringify: quotes 'yes', 'no', 'on', 'null', '1.0', '0x1F', ' padded', 'a: b', '#hash' and ''", () => {
    const risky = ['yes', 'no', 'on', 'off', 'y', 'N', 'null', '~', 'true', 'False', '1.0', '0x1F', '0o17', '.inf', '-.5', '+1',
        '1e3', ' padded', 'padded ', 'a: b', 'a:', '#hash', 'x #y', '', '- dash', '? q', ': c', '[x]', '{x}', '&a', '*a',
        '!tag', '|', '>', "'q'", '"q"', '%p', '@at', '`bt', '---', '...x', '<<', '='];
    for (const str of risky) {
        const out = yaml.stringify(new Map([['k', str]])).text;
        ok(/^k: ['"]/.test(out), `${JSON.stringify(str)} should be quoted, got ${out}`);
        eq(roundYaml(new Map([['k', str]])).get('k'), str, `round trip of ${JSON.stringify(str)}`);
        eq(roundYaml(new Map([[str, 1]])).has(str), true, `key ${JSON.stringify(str)} round trip`);
    }
    eq(yaml.stringify(new Map([['answer', 'yes']])).text, "answer: 'yes'\n");
    eq(yaml.stringify(new Map([['k', "it's"]])).text, "k: it's\n");
    eq(yaml.stringify(new Map([['k', "'it's'"]])).text, "k: '''it''s'''\n");
    eq(yaml.stringify(new Map([['k', 'plain words, ok']])).text, 'k: plain words, ok\n');
});

test('yaml stringify: YAML 1.1 octal-looking and number-like strings stay text', () => {
    const strs = ['0755', '017', '0b101', '1_000', '12:30', '190:20:30', '2026-11-18', '2026-11-18T09:30:00Z', '1.', '.5', '6.8523015e+5', '0.'];
    for (const str of strs) {
        const out = yaml.stringify([str]).text;
        ok(/^- ['"]/.test(out), `${str} should be quoted: ${out}`);
        eq(roundYaml([str]), [str]);
    }
});

test('yaml stringify: multi-line strings become literal blocks and read back exactly', () => {
    eq(yaml.stringify(new Map([['poem', 'line 1\nline 2']])).text, 'poem: |-\n  line 1\n  line 2\n');
    eq(yaml.stringify(new Map([['p', 'a\nb\n']])).text, 'p: |\n  a\n  b\n');
    eq(yaml.stringify(new Map([['p', 'a\n\n']])).text, 'p: |+\n  a\n\n');
    const samples = ['a\nb', 'a\nb\n', 'a\n\n\n', '\nleading blank', '  indented first\nline', 'x\n  indented second', 'tab\there\nnext',
        'trailing space \nline', '# hash\n- dash', 'cr\r\nlf', '\n', '\n\n', 'emoji 😀\nline', 'mid\n\n\ngap'];
    for (const str of samples) {
        eq(roundYaml(new Map([['k', str], ['after', 1]])).get('k'), str, `map value ${JSON.stringify(str)}`);
        eq(roundYaml([str, 'next']), [str, 'next'], `list item ${JSON.stringify(str)}`);
        eq(roundYaml(str), str, `document ${JSON.stringify(str)}`);
        eq(roundYaml(new Map([[str, 1]])).has(str), true, `key ${JSON.stringify(str)}`);
    }
});

test('yaml stringify: layout — nesting, lists of maps, empty collections, indent 4', () => {
    const v = M({ a: { b: [1, { c: 2, d: [] }], e: {} }, f: [[1, 2], []], g: null });
    eq(yaml.stringify(v).text, 'a:\n  b:\n    - 1\n    - c: 2\n      d: []\n  e: {}\nf:\n  - - 1\n    - 2\n  - []\ng: null\n');
    eq(yaml.stringify(v, { indent: '4' }).text.split('\n').slice(0, 3), ['a:', '    b:', '        - 1']);
    eq(roundYaml(v), v);
    eq(yaml.stringify(new Map()).text, '{}\n');
    eq(yaml.stringify([]).text, '[]\n');
    eq(yaml.stringify(M({ b: 1, a: 2 }), { sortKeys: true, docStart: true }).text, '---\na: 2\nb: 1\n');
});

test('yaml stringify: numbers, big integers, special floats', () => {
    const v = [0, -0, 1.5, 1e21, 1e-7, 2 ** 60, 12345678901234567890n, Infinity, -Infinity, NaN, true, null];
    eq(yaml.stringify(v).text, '- 0\n- 0\n- 1.5\n- 1e+21\n- 1e-7\n- 1.152921504606847e+18\n- 12345678901234567890\n- .inf\n- -.inf\n- .nan\n- true\n- null\n');
    const back = roundYaml(v);
    eq(back.slice(0, 9), [0, 0, 1.5, 1e21, 1e-7, 2 ** 60, 12345678901234567890n, Infinity, -Infinity]);
    ok(Number.isNaN(back[9]));
});

test('yaml stringify: escapes control characters and broken surrogates', () => {
    const strs = ['bell\u0007', 'nul\u0000', 'del\u007f', 'nel\u0085', 'ls\u2028', 'bom\uFEFF', 'lone\uD800', 'pair😀'];
    for (const str of strs) eq(roundYaml([str]), [str], JSON.stringify(str));
    ok(/\\u0007/.test(yaml.stringify(['bell\u0007']).text));
});

/* ------------------------------------------------------------------ */
/* TOML: reading                                                       */
/* ------------------------------------------------------------------ */

const TOML_SPEC_EXAMPLE = [
    '# This is a TOML document',
    '',
    'title = "TOML Example"',
    '',
    '[owner]',
    'name = "Tom Preston-Werner"',
    'dob = 1979-05-27T07:32:00-08:00',
    '',
    '[database]',
    'enabled = true',
    'ports = [ 8000, 8001, 8002 ]',
    'data = [ ["delta", "phi"], [3.14] ]',
    'temp_targets = { cpu = 79.5, case = 72.0 }',
    '',
    '[servers]',
    '',
    '[servers.alpha]',
    'ip = "10.0.0.1"',
    'role = "frontend"',
    '',
    '[servers.beta]',
    'ip = "10.0.0.2"',
    'role = "backend"',
    '',
    '[clients]',
    'hosts = [',
    '  "alpha",',
    '  "omega", # trailing comma and a comment',
    ']',
    ''
].join('\n');

test('toml: the full spec example document', () => {
    eq(plain(T(TOML_SPEC_EXAMPLE)), {
        title: 'TOML Example',
        owner: { name: 'Tom Preston-Werner', dob: '1979-05-27T07:32:00-08:00' },
        database: { enabled: true, ports: [8000, 8001, 8002], data: [['delta', 'phi'], [3.14]], temp_targets: { cpu: 79.5, case: 72 } },
        servers: { alpha: { ip: '10.0.0.1', role: 'frontend' }, beta: { ip: '10.0.0.2', role: 'backend' } },
        clients: { hosts: ['alpha', 'omega'] }
    });
    eq(toml.parse(TOML_SPEC_EXAMPLE).warnings, []);
});

test('toml: arrays of tables, with sub-tables and nested arrays of tables', () => {
    const v = T([
        '[[fruits]]', 'name = "apple"', '[fruits.physical]', 'color = "red"', 'shape = "round"',
        '[[fruits.varieties]]', 'name = "red delicious"', '[[fruits.varieties]]', 'name = "granny smith"',
        '', '[[fruits]]', 'name = "banana"', '[[fruits.varieties]]', 'name = "plantain"', '', '[[empty]]'
    ].join('\n'));
    eq(plain(v), {
        fruits: [
            { name: 'apple', physical: { color: 'red', shape: 'round' }, varieties: [{ name: 'red delicious' }, { name: 'granny smith' }] },
            { name: 'banana', varieties: [{ name: 'plantain' }] }
        ],
        empty: [{}]
    });
});

test('toml: inline tables, nested and empty', () => {
    const v = T('point = { x = 1, y = 2 }\nanimal = { type.name = "pug", tags = ["a", { k = "v" }] }\nnone = {}');
    eq(plain(v), { point: { x: 1, y: 2 }, animal: { type: { name: 'pug' }, tags: ['a', { k: 'v' }] }, none: {} });
});

test('toml: dotted keys, quoted keys and spaces around dots', () => {
    const v = T('name = "Orange"\nphysical.color = "orange"\nphysical . shape = "round"\nsite."google.com" = true\n"" = "empty key"\n\'quoted literal\' = 1\n1234 = "digits"\n3.14159 = "pi"');
    eq(plain(v), {
        name: 'Orange', physical: { color: 'orange', shape: 'round' }, site: { 'google.com': true },
        '': 'empty key', 'quoted literal': 1, 1234: 'digits', 3: { 14159: 'pi' }
    });
});

test('toml: basic strings and every escape', () => {
    const v = T('s = "tab\\t quote\\" back\\\\ nl\\n cr\\r ff\\f bs\\b u\\u00e9 U\\U0001F600"');
    eq(v.get('s'), 'tab\t quote" back\\ nl\n cr\r ff\f bs\b ué U😀');
    failsAt(() => toml.parse('s = "bad \\x41"'), 1, 10, /unknown escape '\\x'/i);
    failsAt(() => toml.parse('s = "\\uD800"'), 1, 6, /not a Unicode character/i);
    failsAt(() => toml.parse('s = "open\nx = 1'), 1, 10, /next line/i);
    failsAt(() => toml.parse('s = "never'), 1, 5, /never closed/i);
});

test('toml: multi-line basic strings — first newline trimmed, line-ending backslash, extra quotes', () => {
    const v = T([
        'a = """', 'Roses are red', 'Violets are blue"""',
        'b = """\\', '    The quick brown \\', '', '    fox."""',
        'c = """Here are two quotation marks: "". Simple enough."""',
        'd = """Here are fifteen quotation marks: ""\\"""\\"""\\"""\\"""\\"."""',
        'e = """"This," she said, "is just a pointless statement.""""'
    ].join('\n'));
    eq(v.get('a'), 'Roses are red\nViolets are blue');
    eq(v.get('b'), 'The quick brown fox.');
    eq(v.get('c'), 'Here are two quotation marks: "". Simple enough.');
    eq(v.get('d'), 'Here are fifteen quotation marks: """"""""""""""".');
    eq(v.get('e'), '"This," she said, "is just a pointless statement."');
    eq(T('x = """\r\none\r\ntwo"""').get('x'), 'one\ntwo');
});

test('toml: literal and multi-line literal strings', () => {
    const v = T([
        "winpath = 'C:\\Users\\nodejs\\templates'", "quoted = 'Tom \"Dubs\" Preston-Werner'", "regex = '<\\i\\c*\\s*>'",
        "lines = '''", 'The first newline is', "trimmed in raw strings.", "   All other whitespace", "   is preserved.", "'''",
        "quotes = '''Here are fifteen quotation marks: \"\"\"\"\"\"\"\"\"\"\"\"\"\"\"'''", "apos = ''''That,' she said, 'is still pointless.''''"
    ].join('\n'));
    eq(v.get('winpath'), 'C:\\Users\\nodejs\\templates');
    eq(v.get('quoted'), 'Tom "Dubs" Preston-Werner');
    eq(v.get('regex'), '<\\i\\c*\\s*>');
    eq(v.get('lines'), 'The first newline is\ntrimmed in raw strings.\n   All other whitespace\n   is preserved.\n');
    eq(v.get('quotes'), 'Here are fifteen quotation marks: """""""""""""""');
    eq(v.get('apos'), "'That,' she said, 'is still pointless.'");
    failsAt(() => toml.parse("a = 'open\n"), 1, 10, /next line/i);
});

test('toml: integers with _, 0x, 0o, 0b and signs; 64-bit range', () => {
    const v = T('a = +99\nb = -17\nc = 0\nd = 1_000_000\ne = 0xDEAD_BEEF\nf = 0o755\ng = 0b1101_0110\nh = 9223372036854775807\ni = -9223372036854775808\nj = 0x7FFFFFFFFFFFFFFF');
    eq([v.get('a'), v.get('b'), v.get('c'), v.get('d'), v.get('e'), v.get('f'), v.get('g')], [99, -17, 0, 1000000, 3735928559, 493, 214]);
    eq([v.get('h'), v.get('i'), v.get('j')], [9223372036854775807n, -9223372036854775808n, 9223372036854775807n]);
    failsAt(() => toml.parse('x = 9223372036854775808'), 1, 5, /64 bits/i);
    failsAt(() => toml.parse('x = 0123'), 1, 5, /leading zeros/i);
    failsAt(() => toml.parse('x = 1__000'), 1, 5, /underscore/i);
    failsAt(() => toml.parse('x = -0x10'), 1, 5, /can't have a \+ or - sign/i);
});

test('toml: floats with exponents, inf and nan', () => {
    const v = T('a = 3.1415\nb = -0.01\nc = 5e+22\nd = 1e06\ne = -2E-2\nf = 6.626e-34\ng = 224_617.445_991\nh = inf\ni = +inf\nj = -inf\nk = nan\nl = -nan\nm = -0.0');
    eq([v.get('a'), v.get('b'), v.get('c'), v.get('d'), v.get('e'), v.get('f'), v.get('g')], [3.1415, -0.01, 5e22, 1e6, -0.02, 6.626e-34, 224617.445991]);
    eq([v.get('h'), v.get('i'), v.get('j')], [Infinity, Infinity, -Infinity]);
    ok(Number.isNaN(v.get('k')) && Number.isNaN(v.get('l')));
    ok(Object.is(v.get('m'), -0));
    failsAt(() => toml.parse('x = 1.'), 1, 5, /decimal point/i);
    failsAt(() => toml.parse('x = .5'), 1, 5, /./);
});

test('toml: date-times, dates and times become ISO strings', () => {
    const v = T([
        'odt1 = 1979-05-27T07:32:00Z', 'odt2 = 1979-05-27T00:32:00-07:00', 'odt3 = 1979-05-27T00:32:00.999999-07:00',
        'odt4 = 1979-05-27 07:32:00z', 'ldt1 = 1979-05-27T07:32:00', 'ldt2 = 1979-05-27t00:32:00.999999',
        'ld1 = 1979-05-27', 'lt1 = 07:32:00', 'lt2 = 00:32:00.999999', 'leap = 2024-02-29', 'dates = [1979-05-27, 07:32:00] # c'
    ].join('\n'));
    eq(plain(v), {
        odt1: '1979-05-27T07:32:00Z', odt2: '1979-05-27T00:32:00-07:00', odt3: '1979-05-27T00:32:00.999999-07:00',
        odt4: '1979-05-27T07:32:00Z', ldt1: '1979-05-27T07:32:00', ldt2: '1979-05-27T00:32:00.999999',
        ld1: '1979-05-27', lt1: '07:32:00', lt2: '00:32:00.999999', leap: '2024-02-29', dates: ['1979-05-27', '07:32:00']
    });
    failsAt(() => toml.parse('d = 2023-02-29'), 1, 5, /not a real calendar date/i);
    failsAt(() => toml.parse('t = 25:00:00'), 1, 5, /not a valid time/i);
    failsAt(() => toml.parse('t = 1979-05-27T07:32'), 1, 5, /not a valid TOML date-time/i);
});

test('toml: tables and keys defined twice are errors with line and column', () => {
    failsAt(() => toml.parse('[fruit]\napple = "red"\n\n[fruit]\norange = "orange"'), 4, 1, /table \[fruit\] is defined more than once/i);
    failsAt(() => toml.parse('name = "Tom"\nname = "Pradyun"'), 2, 1, /key "name" is defined more than once/i);
    failsAt(() => toml.parse('[fruit]\napple.color = "red"\n\n[fruit.apple]'), 4, 1, /made by dotted keys/i);
    failsAt(() => toml.parse('[product]\ntype = { name = "Nail" }\ntype.edible = false'), 3, 1, /inline table/i);
    failsAt(() => toml.parse('[a.b]\nx = 1\n[a]\nb.y = 2'), 4, 1, /defined as a \[table\] earlier/i);
    failsAt(() => toml.parse('fruits = []\n[[fruits]]'), 2, 1, /fixed \[array\]/i);
    failsAt(() => toml.parse('[[a]]\n[a]'), 2, 1, /already an array of tables/i);
    failsAt(() => toml.parse('a = 1\n[a]'), 2, 1, /already holds a value/i);
    failsAt(() => toml.parse('a = 1\na.b = 2'), 2, 1, /already holds a value/i);
    failsAt(() => toml.parse('p = {x = 1}\n[p.q]'), 2, 1, /inline table/i);
});

test('toml: implicit super-tables may be defined once later; dotted sub-tables may get [headers]', () => {
    eq(plain(T('[x.y.z.w]\na = 1\n[x]\nb = 2')), { x: { y: { z: { w: { a: 1 } } }, b: 2 } });
    eq(plain(T('[fruit]\napple.color = "red"\napple.taste.sweet = true\n[fruit.apple.texture]\nsmooth = true')),
        { fruit: { apple: { color: 'red', taste: { sweet: true }, texture: { smooth: true } } } });
    eq(plain(T('a.b.c = 1\na.d = 2')), { a: { b: { c: 1 }, d: 2 } });
});

test('toml: bad values say what TOML expects', () => {
    failsAt(() => toml.parse('name = John'), 1, 8, /text needs quotes: "John"/i);
    failsAt(() => toml.parse('a ='), 1, 4, /expected a value after '='/i);
    failsAt(() => toml.parse('a = 1 b = 2'), 1, 7, /end of the line/i);
    failsAt(() => toml.parse('a = {x = 1,}'), 1, 12, /trailing comma/i);
    failsAt(() => toml.parse('a = {x = 1,\ny = 2}'), 1, 12, /one line/i);
    failsAt(() => toml.parse('a = [1, 2'), 1, 5, /never closed/i);
    failsAt(() => toml.parse('a = [1 2]'), 1, 8, /expected ',' or '\]'/i);
    failsAt(() => toml.parse('= 1'), 1, 1, /expected a key/i);
    failsAt(() => toml.parse('a b = 1'), 1, 3, /expected '=' after the key "a"/i);
    failsAt(() => toml.parse('[table'), 1, 7, /expected '\]'/i);
    failsAt(() => toml.parse('a = truely'), 1, 5, /not a TOML value/i);
});

test('toml: arrays across lines with comments, trailing commas and mixed types', () => {
    const v = T('a = [\n  1, # one\n  "two",\n  [3],\n  { four = 4 },\n\n]\nb = []\nc = [ [ 1, 2 ], ["a", "b"] ]');
    eq(plain(v), { a: [1, 'two', [3], { four: 4 }], b: [], c: [[1, 2], ['a', 'b']] });
});

test('toml: 10,000 nested arrays stop at the depth cap', () => {
    const e = fails(() => toml.parse(`a = ${'['.repeat(10000)}${']'.repeat(10000)}`));
    ok(/nested more than 512 levels/.test(e.message), e.message);
    ok(!(e instanceof RangeError));
});

/* ------------------------------------------------------------------ */
/* TOML: writing                                                       */
/* ------------------------------------------------------------------ */

test('toml stringify: plain keys, then [tables], then [[arrays of tables]]', () => {
    const v = M({ name: 'app', db: { port: 5432, opts: { ssl: true } }, workers: [{ n: 1 }, { n: 2, extra: { x: 1 } }], tags: ['a', 'b'] });
    eq(toml.stringify(v).text, 'name = "app"\ntags = ["a", "b"]\n\n[db]\nport = 5432\n\n[db.opts]\nssl = true\n\n[[workers]]\nn = 1\n\n[[workers]]\nn = 2\n\n[workers.extra]\nx = 1\n');
    eq(T(toml.stringify(v).text), v);
    eq(T(toml.stringify(T(TOML_SPEC_EXAMPLE)).text), T(TOML_SPEC_EXAMPLE));
});

test('toml stringify: null values are dropped with a warning', () => {
    const r = toml.stringify(M({ a: null, b: 1, c: [1, null, 2], d: { e: null } }));
    eq(r.text, 'b = 1\nc = [1, 2]\n\n[d]\n');
    eq(r.warnings, ['TOML has no null — 3 null values were left out.']);
    eq(toml.stringify(M({ a: null })).warnings, ['TOML has no null — 1 null value was left out.']);
});

test('toml stringify: a top level that is not a table is wrapped under "data"', () => {
    const r = toml.stringify([1, 2]);
    eq(r.text, 'data = [1, 2]\n');
    eq(r.warnings, ['TOML needs a table at the top, so the data was put under the key "data".']);
    eq(toml.stringify('x').text, 'data = "x"\n');
    eq(plain(T(toml.stringify(M([{ a: 1 }, { a: 2 }])).text)), { data: [{ a: 1 }, { a: 2 }] });
});

test('toml stringify: keys quoted when needed, strings escaped, multi-line text', () => {
    const v = M({ 'plain-key_1': 1, 'has space': 2, 'dot.ted': 3, '': 4, 'é': 5, s: 'quote " back \\ tab \t bell \u0007', m: 'one\ntwo "q" ""\nthree"', inline: [{ t: 'x\ny' }] });
    const text = toml.stringify(v).text;
    ok(text.includes('plain-key_1 = 1\n"has space" = 2\n"dot.ted" = 3\n"" = 4\n"é" = 5\n'), text);
    ok(text.includes('s = "quote \\" back \\\\ tab \\t bell \\u0007"'), text);
    ok(text.includes('m = """\none\ntwo'), text);
    eq(T(text), v);
});

test('toml stringify: ISO date strings become TOML dates unless turned off', () => {
    const v = M({ d: '2026-11-18', dt: '2026-11-18T09:30:00Z', local: '2026-11-18T09:30:00', t: '09:30:00', notDate: '2026-13-45', text: 'on 2026-11-18' });
    eq(toml.stringify(v).text, 'd = 2026-11-18\ndt = 2026-11-18T09:30:00Z\nlocal = 2026-11-18T09:30:00\nt = 09:30:00\nnotDate = "2026-13-45"\ntext = "on 2026-11-18"\n');
    ok(toml.stringify(v, { nativeDates: false }).text.startsWith('d = "2026-11-18"\n'));
    eq(T(toml.stringify(v).text), v);
});

test('toml stringify: numbers, special floats, big integers and sorted keys', () => {
    const r = toml.stringify(M({ z: 1, i: 42, f: 1.5, e: 1e-7, big: 2 ** 60, inf: Infinity, ninf: -Infinity, nan: NaN, b64: 9223372036854775807n, huge: 10n ** 30n }), { sortKeys: true });
    eq(r.text, 'b64 = 9223372036854775807\nbig = 1.152921504606847e+18\ne = 1e-7\nf = 1.5\nhuge = "1000000000000000000000000000000"\ni = 42\ninf = inf\nnan = nan\nninf = -inf\nz = 1\n');
    eq(r.warnings, ['TOML integers must fit in 64 bits — 1 larger number was written as text.']);
    const back = T(r.text);
    eq(back.get('big'), 2 ** 60);
    ok(Number.isNaN(back.get('nan')));
});

test('toml stringify: long arrays wrap onto several lines and read back', () => {
    const list = Array.from({ length: 30 }, (_, k) => `item-${k}`);
    const text = toml.stringify(M({ list })).text;
    ok(text.startsWith('list = [\n    "item-0",\n'), text.slice(0, 40));
    eq(T(text).get('list'), list);
});

/* ------------------------------------------------------------------ */
/* Across formats                                                      */
/* ------------------------------------------------------------------ */

test("__proto__ and constructor keys round-trip JSON → YAML → TOML → JSON with no prototype change", () => {
    const src = '{"__proto__": {"polluted": "yes", "list": [1, 2]}, "constructor": {"prototype": {"polluted": "yes"}}, "prototype": 1}';
    const y = Convert.convert(src, 'json', 'yaml');
    ok(y.text.startsWith('__proto__:\n  polluted: '), y.text);
    const t = Convert.convert(y.text, 'yaml', 'toml');
    ok(/\[__proto__\]/.test(t.text) && /\[constructor\.prototype\]/.test(t.text), t.text);
    const j = Convert.convert(t.text, 'toml', 'json', { output: { indent: 'min' } });
    eq(j.text, '{"prototype":1,"__proto__":{"polluted":"yes","list":[1,2]},"constructor":{"prototype":{"polluted":"yes"}}}\n');
    const back = J(j.text);
    eq(Array.from(back.keys()), ['prototype', '__proto__', 'constructor']);
    eq(({}).polluted, undefined);
    eq(Object.prototype.polluted, undefined);
    eq(typeof ({}).constructor, 'function');
    eq(Object.getPrototypeOf(plain(back)), Object.prototype);
});

test('every tree format reads its own sample and survives a round trip through JSON', () => {
    for (const mod of [json, jsonl, yaml, toml]) {
        const r = mod.parse(mod.sample);
        ok(r.value !== null, `${mod.id} sample reads`);
        const viaJson = J(json.stringify(r.value).text);
        eq(viaJson, r.value, `${mod.id} → JSON → value`);
        eq(mod.parse(mod.stringify(r.value).text).value, r.value, `${mod.id} writes what it reads`);
    }
});

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

test('detect(): ranks JSON, JSON Lines, YAML and TOML samples first; [] for empty text', () => {
    eq(Convert.detect(''), []);
    eq(Convert.detect('  \n\t '), []);
    eq(Convert.detect(null), []);
    for (const mod of [json, jsonl, yaml, toml]) {
        const best = Convert.detect(mod.sample)[0];
        eq(best.id, mod.id, `${mod.id} sample detected as ${best.id}`);
        eq(best.label, mod.label);
        ok(best.confidence > 0 && best.confidence <= 1);
    }
    eq(Convert.detect('{"a": 1}')[0], { id: 'json', label: 'JSON', confidence: 1 });
    eq(Convert.detect('[1, 2, 3]')[0].id, 'json');
    eq(Convert.detect('---\nkey: value\n')[0].id, 'yaml');
    eq(Convert.detect('name: app\nport: 8080\nlist:\n  - a\n')[0].id, 'yaml');
    eq(Convert.detect('[server]\nhost = "x"\nport = 8080\n')[0].id, 'toml');
    eq(Convert.detect('[[bin]]\nname = "a"\n')[0].id, 'toml');
    eq(Convert.detect('{"a":1}\n{"a":2}\n')[0].id, 'jsonl');
    eq(json.detect('[server]\nport = 1'), 0.05);
    eq(toml.detect('name = John\n'), 0.15);
    eq(yaml.detect('a = 1\nb = 2'), 0.02);
    const sorted = Convert.detect(TOML_SPEC_EXAMPLE).map((c) => c.confidence);
    eq(sorted, sorted.slice().sort((a, b) => b - a));
});

test('convert(): text, formats, detected flag and stats', () => {
    const src = '[{"a": 1, "b": {"c": [1, 2]}}, {"a": 2, "d": "é"}]';
    const r = Convert.convert(src, 'auto', 'yaml');
    eq(r.text, '- a: 1\n  b:\n    c:\n      - 1\n      - 2\n- a: 2\n  d: é\n');
    eq([r.from, r.detected, r.to], ['json', true, 'yaml']);
    eq(r.warnings, []);
    eq(r.stats.inBytes, Buffer.byteLength(src));
    eq(r.stats.inBytes, src.length + 1, 'é is two bytes');
    eq(r.stats.outBytes, Buffer.byteLength(r.text));
    eq([r.stats.records, r.stats.keys, r.stats.depth], [2, 4, 4]);
    ok(typeof r.stats.ms === 'number' && r.stats.ms >= 0);
    const fixed = Convert.convert('a = 1', 'toml', 'json', { output: { indent: 'min' } });
    eq([fixed.text, fixed.from, fixed.detected], ['{"a":1}\n', 'toml', false]);
    eq(Convert.convert('a: 1', 'yaml', 'yaml').text, 'a: 1\n');
});

test('convert(): warnings from both stages are merged', () => {
    const r = Convert.convert('{"a": null, "a": 1, "b": null}', 'json', 'toml');
    eq(r.text, 'a = 1\n');
    eq(r.warnings, ['1 duplicate key was found ("a" on line 1); the last value was kept.', 'TOML has no null — 1 null value was left out.']);
});

test('convert(): errors carry their stage, format and position', () => {
    const p = fails(() => Convert.convert('{"a": 1,, }', 'json', 'yaml'));
    eq([p.stage, p.format, p.line, p.column], ['parse', 'json', 1, 9]);
    const auto = fails(() => Convert.convert('{"a": [1, 2}', 'auto', 'yaml'));
    eq([auto.stage, auto.format], ['parse', 'json'], 'auto reports the best guess error');
    const s = fails(() => Convert.convert('{"a": 1}', 'json', 'toml', { output: {} }) && Convert.stringify(M({ a: 1 }), 'nope'));
    eq(s.stage, 'stringify');
    ok(/no output format called "nope"/.test(s.message));
    ok(/no input format called "nope"/.test(fails(() => Convert.convert('x', 'nope', 'json')).message));
    const empty = fails(() => Convert.convert('   ', 'auto', 'json'));
    ok(/nothing to convert/.test(empty.message));
    eq(empty.stage, 'parse');
});

test('convert(): auto-detect falls back when the best guess cannot read the text', () => {
    const r = Convert.convert('[a, b, {c: d}]', 'auto', 'json', { output: { indent: 'min' } });
    eq(r.from, 'yaml');
    eq(r.text, '["a","b",{"c":"d"}]\n');
});

test('convert(): option values are checked against each format', () => {
    eq(Convert.convert('{"a": [1]}', 'json', 'json', { output: { indent: 'banana' } }).text, '{\n  "a": [\n    1\n  ]\n}\n');
    eq(Convert.convert('{"b": 1, "a": 2}', 'json', 'json', { output: { indent: 'min', sortKeys: 'true' } }).text, '{"a":2,"b":1}\n');
    eq(Convert.convert('{a: 1}', 'json', 'json', { input: { relaxed: true }, output: { indent: 'min' } }).text, '{"a":1}\n');
    const o = Convert.normalizeOptions(json.outputOptions, { indent: 4, sortKeys: 1, escapeNonAscii: 'no', __proto__: { x: 1 }, extra: 'kept', obj: {} });
    eq(o, { indent: '4', sortKeys: true, escapeNonAscii: false, extra: 'kept' });
    eq(Convert.optionDefaults('yaml', 'input'), { documents: 'first' });
    eq(Convert.optionDefaults('toml', 'output'), { nativeDates: true, sortKeys: false });
    eq(Convert.optionDefaults('missing', 'output'), {});
});

test('convert(): input over 20 MB is refused at once with a plain message', () => {
    const big = 'x'.repeat(20 * 1024 * 1024 + 1);
    const t0 = Date.now();
    const e = fails(() => Convert.convert(big, 'json', 'yaml'));
    ok(Date.now() - t0 < 500);
    ok(/larger than 20 MB/.test(e.message), e.message);
    ok(/larger than 20 MB/.test(fails(() => Convert.convert('é'.repeat(10.5 * 1024 * 1024), 'yaml', 'json')).message), 'counted in UTF-8 bytes');
    ok(/larger than 20 MB/.test(fails(() => yaml.parse(big)).message));
});

test('list() and get(): stable order and the full module shape', () => {
    const ids = Convert.list().map((m) => m.id);
    eq(ids.slice(0, 4), ['json', 'jsonl', 'yaml', 'toml']);
    const order = ['json', 'jsonl', 'yaml', 'toml', 'csv', 'tsv', 'xml', 'ini', 'env', 'query', 'markdown', 'html', 'sql'];
    eq(ids.filter((id) => order.includes(id)), order.filter((id) => ids.includes(id)));
    eq(Convert.get('nope'), null);
    eq(Convert.get('__proto__'), null);
    eq(Convert.get('yaml'), yaml);
    for (const m of [json, jsonl, yaml, toml]) {
        for (const field of ['id', 'label', 'mime', 'kind', 'sample', 'notes']) ok(typeof m[field] === 'string' && m[field], `${m.id}.${field}`);
        ok(Array.isArray(m.extensions) && m.extensions.length);
        eq([m.canParse, m.canStringify, m.kind], [true, true, 'tree']);
        for (const o of m.inputOptions.concat(m.outputOptions)) {
            ok(['select', 'checkbox', 'text', 'number'].includes(o.type) && o.key && o.label && o.help, `${m.id}.${o.key}`);
            if (o.type === 'select') ok(o.choices.some((c) => c.value === o.default), `${m.id}.${o.key} default is a choice`);
        }
        eq(m.detect(undefined), 0);
        eq(m.detect(''), 0);
    }
    eq([json.label, jsonl.label, yaml.label, toml.label], ['JSON', 'JSON Lines', 'YAML', 'TOML']);
});

test('fromPlain() and toPlainJSON(): Maps, Dates, cycles and bigints', () => {
    const v = Convert.fromPlain({ a: [1, undefined, () => 1], d: new Date(Date.UTC(2026, 10, 18)), m: new Map([[1, 'one']]), skip: undefined, n: null });
    eq(Array.from(v.keys()), ['a', 'd', 'm', 'n']);
    eq(v.get('a'), [1, null, null]);
    eq(v.get('d'), '2026-11-18T00:00:00.000Z');
    eq(v.get('m').get('1'), 'one');
    const cyc = { x: 1 };
    cyc.self = cyc;
    ok(/refers back to itself/.test(fails(() => Convert.fromPlain(cyc)).message));
    const shared = { k: 1 };
    eq(plain(Convert.fromPlain([shared, shared])), [{ k: 1 }, { k: 1 }], 'shared objects are not cycles');
    eq(plain(new Map([['big', 12345678901234567890n], ['n', 5n]])), { big: '12345678901234567890', n: 5 });
});

test('flatten() and unflatten(): dot paths there and back', () => {
    const v = M({ a: { b: 1, c: [10, { d: 2 }] }, e: {}, f: [], g: null });
    const flat = Convert.flatten(v);
    eq(Array.from(flat.keys()), ['a.b', 'a.c.0', 'a.c.1.d', 'e', 'f', 'g']);
    eq(flat.get('a.c.1.d'), 2);
    eq(Convert.unflatten(flat), v);
    eq(Array.from(Convert.flatten(v, '/').keys())[1], 'a/c/0');
    eq(Convert.flatten(5), new Map([['', 5]]));
    eq(Convert.unflatten(Convert.flatten(5)), 5);
    eq(plain(Convert.unflatten({ 'x.y': 1, 'x.z': 2 })), { x: { y: 1, z: 2 } });
    eq(plain(Convert.unflatten([['__proto__.polluted', 1]])), JSON.parse('{"__proto__": {"polluted": 1}}'));
    eq(({}).polluted, undefined);
});

test('measure(): records, distinct keys, depth and nodes', () => {
    eq(Convert.measure(M([{ a: 1 }, { b: 2 }])), { records: 2, keys: 2, depth: 2, nodes: 5 });
    eq(Convert.measure(M({ a: { b: { c: [1] } } })), { records: 1, keys: 3, depth: 4, nodes: 5 });
    eq(Convert.measure(7), { records: 1, keys: 0, depth: 0, nodes: 1 });
    eq(Convert.measure(null), { records: 0, keys: 0, depth: 0, nodes: 1 });
    let deep = [];
    for (let k = 0; k < 20000; k++) deep = [deep];
    eq(Convert.measure(deep).depth, 20001, 'no recursion, so very deep values are fine');
});

test('isSecretLike(): .env files, private keys, tokens and secret-named keys', () => {
    for (const text of [
        'DB_HOST=localhost\nDB_USER=app\n', 'export API_URL=https://x\nexport MODE=prod\n', '{"password": "hunter2"}',
        'db:\n  password: s3cret\n', 'api_key = "abc123"', 'client_secret: xyz', 'access-token=abc&x=1', '<apiKey>k</apiKey>',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIE', 'key: AKIAIOSFODNN7EXAMPLE', '{"auth": {"token": "t0k3n"}}', 'PRIVATE_KEY: abc'
    ]) ok(Convert.isSecretLike(text), `should flag: ${JSON.stringify(text)}`);
    for (const text of [
        '', '{"name": "Ada"}', 'tokenizer: bpe', '{"password": ""}', 'title = "Password policy"', 'a: 1\nb: 2',
        '# just a comment\nname=x', 'The secret garden is a book.'
    ]) ok(!Convert.isSecretLike(text), `should not flag: ${JSON.stringify(text)}`);
    eq(Convert.isSecretLike(null), false);
});

test('LIMITS and byteLength()', () => {
    eq(Convert.LIMITS.inputBytes, 20 * 1024 * 1024);
    eq(Convert.LIMITS.liveBytes, 512 * 1024);
    eq([Convert.LIMITS.depth, Convert.LIMITS.nodes, Convert.LIMITS.aliasNodes], [512, 2000000, 100000]);
    eq([Convert.LIMITS.xmlAttributes, Convert.LIMITS.queryDepth, Convert.LIMITS.queryIndex, Convert.LIMITS.csvCells], [1000, 20, 1000, 5000000]);
    eq([Convert.LIMITS.fileBytes, Convert.LIMITS.imageSide, Convert.LIMITS.imagePixels, Convert.LIMITS.imagesPerBatch], [25 * 1024 * 1024, 8192, 40000000, 20]);
    ok(Object.isFrozen(Convert.LIMITS));
    for (const s of ['', 'abc', 'é', '€', '😀', 'a\uD800b', 'mixed é€😀 text']) eq(Convert.byteLength(s), Buffer.byteLength(s), JSON.stringify(s));
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
