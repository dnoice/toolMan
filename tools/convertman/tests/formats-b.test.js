/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: FormatsBTests (convertMan Edition - v1.0)
 *     - File Name: formats-b.test.js
 *     - Relative Path: tools/convertman/tests/formats-b.test.js
 *     - Artifact Type: test
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Node tests for convertMan's table, markup and flat formats: CSV, TSV,
 *     XML, INI, .env, query strings, Markdown tables, HTML tables and SQL
 *     INSERT (js/formats/csv.js, xml.js, ini.js and web.js). They pin the
 *     format contract, the tabular rules and every safety cap, so a change
 *     to a parser or writer cannot quietly alter output or reopen an attack.
 *
 * ✒ Key Features:
 *     - No dependencies: node:assert plus the house twelve-line runner
 *     - Module shape: ids, labels, option definitions, samples and notes for
 *       all nine modules, and registration on window.ConvertFormats
 *     - CSV / TSV: RFC 4180 quoting, embedded newlines, doubled quotes,
 *       delimiter auto-detection, header and type options, BOM, CRLF,
 *       formula-cell warnings and protection, union of keys, flattening
 *     - XML: attributes, text, CDATA, repeated elements, always-lists,
 *       XXE and billion-laughs refusal, positioned errors, root naming,
 *       name sanitising, escaping and a full round trip
 *     - INI and .env: sections, dotted nesting, comments, quotes, escapes,
 *       multi-line values, duplicates, UPPER_SNAKE flattening
 *     - Query strings: brackets, lists, + and %20, malformed escapes, full
 *       URLs, the depth cap and the list-index cap
 *     - Markdown, HTML and SQL writers: alignment, escaping, every dialect,
 *       rows per statement and CREATE TABLE types
 *     - detect() for every readable format, and no throw on odd input
 *     - Prototype-pollution names (__proto__, constructor) stay plain keys
 *     - Prints a pass/fail line per test and an assertion total; exits 1 on
 *       any failure so it can gate a commit
 *
 * ✒ Usage Instructions:
 *     From the repository root:
 *         node tools/convertman/tests/formats-b.test.js
 *     A clean run ends with "All N tests passed (M assertions)". Pass a word
 *     to run only the tests whose name contains it.
 *
 * ✒ Examples:
 *     node tools/convertman/tests/formats-b.test.js          → full run
 *     node tools/convertman/tests/formats-b.test.js xml      → only XML tests
 *     node tools/convertman/tests/formats-b.test.js query    → only query tests
 *     eq(F.csv.parse('a,b\n1,2').value, [m(['a', 1], ['b', 2])])
 *     throwsLike(() => F.xml.parse(xxe), /&xxe; is not supported/)
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node 16+ and ../js/formats/{csv,xml,ini,web}.js
 *     - Compatible platforms: any OS with Node
 *     - Security: hostile inputs (XXE, billion laughs, __proto__ names,
 *       huge list indexes, deep brackets) go only to the pure parsers;
 *       nothing is fetched, written to disk or run as code
 *     - Limitations: browser wiring (option panels, downloads) is covered by
 *       the convertMan e2e suite, not here
 * ----------------------------------------------------------------------------
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'js', 'formats');
const F = Object.assign({},
    require(path.join(DIR, 'csv.js')),
    require(path.join(DIR, 'xml.js')),
    require(path.join(DIR, 'ini.js')),
    require(path.join(DIR, 'web.js')));

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
function throwsLike(fn, re, fields) {
    assertions++;
    let caught = null;
    try { fn(); } catch (err) { caught = err; }
    assert.ok(caught, `expected an error matching ${re}`);
    assert.ok(re.test(caught.message), `error "${caught.message}" does not match ${re}`);
    if (fields) Object.keys(fields).forEach((k) => assert.strictEqual(caught[k], fields[k], `error.${k}`));
    return caught;
}

const m = (...pairs) => new Map(pairs);
const keys = (map) => [...map.keys()];
const hasWarning = (r, re) => r.warnings.some((w) => re.test(w));

/** True when a value holds only Map, Array and scalars — never a plain object. */
function modelOnly(v, depth = 0) {
    if (depth > 600) return false;
    if (v === null) return true;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return true;
    if (Array.isArray(v)) return v.every((x) => modelOnly(x, depth + 1));
    if (v instanceof Map) return [...v.values()].every((x) => modelOnly(x, depth + 1));
    return false;
}

/* ------------------------------------------------------------------ */
/* Module shape                                                        */
/* ------------------------------------------------------------------ */

const CONTRACT = {
    csv: 'CSV', tsv: 'TSV', xml: 'XML', ini: 'INI', env: '.env',
    query: 'Query string', markdown: 'Markdown table', html: 'HTML table', sql: 'SQL INSERT'
};
const READABLE = ['csv', 'tsv', 'xml', 'ini', 'env', 'query', 'markdown'];

test('shape: every module has the contract ids, labels and fields', () => {
    eq(Object.keys(F).sort(), Object.keys(CONTRACT).sort());
    Object.entries(CONTRACT).forEach(([id, label]) => {
        const mod = F[id];
        eq(mod.id, id);
        eq(mod.label, label);
        ok(Array.isArray(mod.extensions) && mod.extensions.length > 0, `${id} extensions`);
        ok(typeof mod.mime === 'string' && mod.mime.includes('/'), `${id} mime`);
        ok(['tree', 'table', 'flat'].includes(mod.kind), `${id} kind`);
        ok(typeof mod.canParse === 'boolean' && mod.canStringify === true, `${id} can flags`);
        ['detect', 'parse', 'stringify'].forEach((fn) => ok(typeof mod[fn] === 'function', `${id}.${fn}`));
        ok(typeof mod.sample === 'string' && mod.sample.length > 20, `${id} sample`);
        ok(typeof mod.notes === 'string' && /\.$/.test(mod.notes), `${id} notes`);
    });
    eq(F.html.canParse, false);
    eq(F.sql.canParse, false);
});

test('shape: option definitions are complete and defaults are valid', () => {
    Object.values(F).forEach((mod) => {
        ['inputOptions', 'outputOptions'].forEach((list) => {
            ok(Array.isArray(mod[list]), `${mod.id}.${list}`);
            mod[list].forEach((o) => {
                ok(o.key && o.label && o.help, `${mod.id}.${o.key} has key, label and help`);
                ok(['select', 'checkbox', 'text', 'number'].includes(o.type), `${mod.id}.${o.key} type`);
                if (o.type === 'select') ok(o.choices.some((c) => c.value === o.default), `${mod.id}.${o.key} default is a choice`);
                if (o.type === 'checkbox') eq(typeof o.default, 'boolean');
                if (o.type === 'number') ok(o.default >= o.min && o.default <= o.max, `${mod.id}.${o.key} default in range`);
            });
        });
    });
});

test('shape: the contract option keys exist', () => {
    const inKeys = (id) => F[id].inputOptions.map((o) => o.key);
    const outKeys = (id) => F[id].outputOptions.map((o) => o.key);
    eq(inKeys('csv'), ['delimiter', 'header', 'inferTypes', 'trim']);
    eq(outKeys('csv'), ['delimiter', 'header', 'quote', 'lineEnding', 'nested', 'protectFormulas']);
    eq(inKeys('xml'), ['alwaysArrays', 'inferTypes']);
    eq(outKeys('xml'), ['rootName', 'indent', 'declaration']);
    ok(inKeys('ini').includes('dottedSections') && inKeys('ini').includes('inferTypes'));
    eq(inKeys('query'), ['brackets']);
    ok(outKeys('markdown').includes('align'));
    ok(outKeys('html').includes('caption'));
    eq(outKeys('sql').slice(0, 4), ['table', 'dialect', 'rowsPerStatement', 'createTable']);
});

test('shape: every readable sample parses cleanly into the Map model', () => {
    READABLE.forEach((id) => {
        const r = F[id].parse(F[id].sample);
        ok(modelOnly(r.value), `${id} sample is Map / Array / scalars only`);
        eq(r.warnings, [], `${id} sample parses without warnings`);
    });
});

test('shape: every sample is detected as its own format', () => {
    READABLE.forEach((id) => {
        const scores = READABLE.map((other) => [other, F[other].detect(F[id].sample)]).sort((a, b) => b[1] - a[1]);
        eq(scores[0][0], id, `${id} sample → ${JSON.stringify(scores.slice(0, 3))}`);
    });
});

test('shape: files register on window.ConvertFormats in a browser context', () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    ['csv.js', 'xml.js', 'ini.js', 'web.js'].forEach((f) => {
        vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
    });
    eq(Object.keys(sandbox.window.ConvertFormats).sort(), Object.keys(CONTRACT).sort());
    eq(sandbox.window.ConvertFormats.csv.parse('a\n1').value.length, 1);
});

test('shape: invalid option values fall back to the defaults', () => {
    const r = F.csv.parse('a;b\n1;2', { delimiter: 'nonsense', header: 'maybe', inferTypes: 7 });
    eq(r.value, [m(['a', 1], ['b', 2])]);
    eq(F.sql.stringify([m(['a', 1])], { rowsPerStatement: 'lots', dialect: 'oracle' }).text, 'INSERT INTO "data" ("a") VALUES\n  (1);\n');
    eq(F.xml.stringify(m(['a', 1]), { indent: 42, declaration: 'no' }).text, '<?xml version="1.0" encoding="UTF-8"?>\n<a>1</a>\n');
});

/* ------------------------------------------------------------------ */
/* CSV / TSV — reading                                                 */
/* ------------------------------------------------------------------ */

test('csv: header row and type inference by default', () => {
    const r = F.csv.parse('name,age,member,score\nAda,36,true,9.5\nGrace,,FALSE,-2');
    eq(r.value, [
        m(['name', 'Ada'], ['age', 36], ['member', true], ['score', 9.5]),
        m(['name', 'Grace'], ['age', null], ['member', false], ['score', -2])
    ]);
    eq(keys(r.value[0]), ['name', 'age', 'member', 'score']);
});

test('csv: type inference off keeps every cell as text', () => {
    eq(F.csv.parse('a,b,c\n1,true,', { inferTypes: false }).value, [m(['a', '1'], ['b', 'true'], ['c', ''])]);
});

test('csv: inference keeps codes with leading zeros and makes huge integers BigInt', () => {
    const v = F.csv.parse('zip,id,big,dec,exp\n02134,007,12345678901234567890,0.1,1e3').value[0];
    eq(v.get('zip'), '02134');
    eq(v.get('id'), '007');
    eq(v.get('big'), 12345678901234567890n);
    eq(v.get('dec'), 0.1);
    eq(v.get('exp'), 1000);
});

test('csv: header off returns lists of lists', () => {
    eq(F.csv.parse('a,b\n1,2', { header: false }).value, [['a', 'b'], [1, 2]]);
});

test('csv: RFC 4180 quoted fields, doubled quotes and embedded newlines', () => {
    const r = F.csv.parse('id,quote\n1,"She said ""hi"", then left"\n2,"line one\nline two"\n3,"a,b"');
    eq(r.value.map((x) => x.get('quote')), ['She said "hi", then left', 'line one\nline two', 'a,b']);
    eq(r.warnings, []);
});

test('csv: CRLF and lone CR line endings', () => {
    eq(F.csv.parse('a,b\r\n1,2\r\n3,4\r\n').value, [m(['a', 1], ['b', 2]), m(['a', 3], ['b', 4])]);
    eq(F.csv.parse('a,b\r1,2').value, [m(['a', 1], ['b', 2])]);
    eq(F.csv.parse('a\r\n"x\r\ny"').value[0].get('a'), 'x\r\ny');
});

test('csv: a byte-order mark is stripped from the first header', () => {
    const r = F.csv.parse('\uFEFFname,age\nAda,36');
    eq(keys(r.value[0]), ['name', 'age']);
});

test('csv: delimiter auto-detection — comma, semicolon, tab and pipe', () => {
    const expect = [m(['a', 1], ['b', 2], ['c', 3])];
    eq(F.csv.parse('a,b,c\n1,2,3').value, expect);
    eq(F.csv.parse('a;b;c\n1;2;3').value, expect);
    eq(F.csv.parse('a\tb\tc\n1\t2\t3').value, expect);
    eq(F.csv.parse('a|b|c\n1|2|3').value, expect);
});

test('csv: auto-detect prefers semicolons when commas are decimal marks', () => {
    eq(F.csv.parse('item;price\napple;1,5\npear;2,25').value, [m(['item', 'apple'], ['price', '1,5']), m(['item', 'pear'], ['price', '2,25'])]);
});

test('csv: an explicit delimiter overrides detection', () => {
    eq(F.csv.parse('a;b,c\n1;2,3', { delimiter: ',' }).value, [m(['a;b', '1;2'], ['c', 3])]);
    eq(F.csv.parse('a;b,c\n1;2,3', { delimiter: ';' }).value, [m(['a', 1], ['b,c', '2,3'])]);
});

test('csv: trim spaces, including before an opening quote', () => {
    eq(F.csv.parse('a , b\n 1 ,  "x, y" ', { trim: true }).value, [m(['a', 1], ['b', 'x, y'])]);
    eq(F.csv.parse('a,b\n 1 ,2').value[0].get('a'), ' 1 ');
});

test('csv: blank lines are skipped and ragged rows are padded with a warning', () => {
    const r = F.csv.parse('a,b,c\n1,2\n\n4,5,6,7\n');
    eq(r.value, [
        m(['a', 1], ['b', 2], ['c', null], ['column4', null]),
        m(['a', 4], ['b', 5], ['c', 6], ['column4', 7])
    ]);
    ok(hasWarning(r, /fewer fields/));
    ok(hasWarning(r, /more fields/));
});

test('csv: repeated and blank header names are renamed', () => {
    const r = F.csv.parse('name,name,\n1,2,3');
    eq(keys(r.value[0]), ['name', 'name_2', 'column3']);
    ok(hasWarning(r, /repeated/));
    ok(hasWarning(r, /empty/));
});

test('csv: an unclosed quote is a positioned error', () => {
    const err = throwsLike(() => F.csv.parse('a,b\n1,"open\n2,3'), /Line 2, column 3: this quoted field never ends/);
    eq([err.line, err.column, err.offset, err.format], [2, 3, 6, 'csv']);
});

test('csv: text after a closing quote is kept with a warning', () => {
    const r = F.csv.parse('a,b\n"x"y,2');
    eq(r.value[0].get('a'), 'xy');
    ok(hasWarning(r, /Line 2, column 4: text after a closing quote/));
});

test('csv: __proto__ and constructor headers are ordinary keys', () => {
    const r = F.csv.parse('__proto__,constructor,prototype\n1,2,3');
    eq(keys(r.value[0]), ['__proto__', 'constructor', 'prototype']);
    eq(r.value[0].get('__proto__'), 1);
    eq({}.polluted, undefined);
    eq(F.csv.stringify(r.value).text, '__proto__,constructor,prototype\n1,2,3\n');
});

test('csv: empty input gives an empty list with a note', () => {
    const r = F.csv.parse('');
    eq(r.value, []);
    ok(hasWarning(r, /no rows/));
});

test('tsv: reads tabs, quoted tabs and keeps commas literal', () => {
    eq(F.tsv.parse('name\tnote\nAda\t"tab\there"\nGrace\tx, y').value, [
        m(['name', 'Ada'], ['note', 'tab\there']),
        m(['name', 'Grace'], ['note', 'x, y'])
    ]);
});

/* ------------------------------------------------------------------ */
/* CSV / TSV — writing                                                 */
/* ------------------------------------------------------------------ */

test('csv: RFC 4180 quoting only where needed', () => {
    const t = F.csv.stringify([m(['a', 'plain'], ['b', 'x,y'], ['c', 'say "hi"'], ['d', 'two\nlines'], ['e', ' pad'])]).text;
    eq(t, 'a,b,c,d,e\nplain,"x,y","say ""hi""","two\nlines"," pad"\n');
});

test('csv: quote every field, CRLF line endings and other delimiters', () => {
    eq(F.csv.stringify([m(['a', 1], ['b', null])], { quote: 'all', lineEnding: 'CRLF' }).text, '"a","b"\r\n"1",""\r\n');
    eq(F.csv.stringify([m(['a', 1], ['b', 'x;y'])], { delimiter: ';' }).text, 'a;b\n1;"x;y"\n');
    eq(F.csv.stringify([m(['a', 1], ['b', 2])], { delimiter: 'tab' }).text, 'a\tb\n1\t2\n');
    eq(F.csv.stringify([m(['a', 1], ['b', 2])], { delimiter: '|', lineEnding: 'crlf' }).text, 'a|b\r\n1|2\r\n');
});

test('csv: union of keys across rows in first-seen order', () => {
    const t = F.csv.stringify([m(['id', 1], ['name', 'Ada']), m(['id', 2], ['email', 'g@x.test']), m(['name', 'Alan'], ['id', 3])]).text;
    eq(t, 'id,name,email\n1,Ada,\n2,,g@x.test\n3,Alan,\n');
});

test('csv: nested values flatten to dot paths or JSON text', () => {
    const rows = [m(['id', 1], ['user', m(['name', 'Ada'], ['langs', ['en', 'fr']])], ['meta', m()])];
    eq(F.csv.stringify(rows).text, 'id,user.name,user.langs.0,user.langs.1,meta\n1,Ada,en,fr,{}\n');
    eq(F.csv.stringify(rows, { nested: 'json' }).text, 'id,user,meta\n1,"{""name"":""Ada"",""langs"":[""en"",""fr""]}",{}\n');
});

test('csv: a single record is one row; plain values are a "value" column', () => {
    eq(F.csv.stringify(m(['a', 1], ['b', true])).text, 'a,b\n1,true\n');
    eq(F.csv.stringify(['x', 2, null]).text, 'value\nx\n2\n""\n');
});

test('csv: lists of lists are written as rows; mixed lists warn', () => {
    eq(F.csv.stringify([['h1', 'h2'], [1, 2], [3]]).text, 'h1,h2\n1,2\n3,\n');
    eq(F.csv.stringify([['h1', 'h2'], [1, 2]], { header: false }).text, 'h1,h2\n1,2\n');
    const r = F.csv.stringify([m(['a', 1]), 5]);
    eq(r.text, 'a,value\n1,\n,5\n');
    ok(hasWarning(r, /not a record/));
});

test('csv: header off leaves out the column-name row for records', () => {
    eq(F.csv.stringify([m(['a', 1], ['b', 2])], { header: false }).text, '1,2\n');
});

test('csv: a single value cannot be a table', () => {
    throwsLike(() => F.csv.stringify('just text'), /A table needs rows — this data is a single value\./, { format: 'csv' });
    throwsLike(() => F.tsv.stringify(42), /single value/, { format: 'tsv' });
});

test('csv: formula cells are counted and warned about', () => {
    const r = F.csv.stringify([m(['a', '=SUM(A1:A9)']), m(['a', '+1+2']), m(['a', '@cmd']), m(['a', '-2+3']), m(['a', '-5']), m(['a', -7])]);
    eq(r.text, 'a\n=SUM(A1:A9)\n+1+2\n@cmd\n-2+3\n-5\n-7\n');
    ok(hasWarning(r, /^4 cells start with =, \+, - or @ .*Protect formula cells/));
});

test('csv: formula protection prefixes risky cells with an apostrophe', () => {
    const r = F.csv.stringify([m(['a', '=HYPERLINK("http://x","y")'], ['b', 'ok'], ['c', '-5'])], { protectFormulas: true });
    eq(r.text, 'a,b,c\n"\'=HYPERLINK(""http://x"",""y"")",ok,-5\n');
    ok(hasWarning(r, /prefixed with '/));
    eq(F.tsv.stringify([m(['x', '@SUM(1)'])], { protectFormulas: true }).text, "x\n'@SUM(1)\n");
});

test('csv: the cell cap refuses a table that would be too large', () => {
    throwsLike(() => F.csv.stringify([new Array(2500001).fill(0), [0]], { header: false }), /5,000,000/);
});

test('csv: parse → stringify → parse round trip', () => {
    const first = F.csv.parse(F.csv.sample).value;
    eq(F.csv.parse(F.csv.stringify(first).text).value, first);
    const tsvFirst = F.tsv.parse(F.tsv.sample).value;
    eq(F.tsv.parse(F.tsv.stringify(tsvFirst).text).value, tsvFirst);
});

/* ------------------------------------------------------------------ */
/* XML — reading                                                       */
/* ------------------------------------------------------------------ */

test('xml: attributes become "@name" and text becomes "#text"', () => {
    eq(F.xml.parse('<book id="b1" lang=\'en\'><title>Dune</title></book>').value,
        m(['book', m(['@id', 'b1'], ['@lang', 'en'], ['title', 'Dune'])]));
    eq(F.xml.parse('<price currency="EUR">12.50</price>').value, m(['price', m(['@currency', 'EUR'], ['#text', '12.50'])]));
});

test('xml: text-only elements are strings and empty elements are ""', () => {
    eq(F.xml.parse('<r><a>  hello  </a><b/><c></c></r>').value, m(['r', m(['a', 'hello'], ['b', ''], ['c', ''])]));
});

test('xml: CDATA is kept literally and joins surrounding text', () => {
    eq(F.xml.parse('<r><code><![CDATA[if (a < b && c) { x(); }]]></code></r>').value.get('r').get('code'), 'if (a < b && c) { x(); }');
    eq(F.xml.parse('<a>x <![CDATA[<y>]]> z</a>').value.get('a'), 'x <y> z');
});

test('xml: repeated child elements become lists', () => {
    eq(F.xml.parse('<l><i>1</i><i>2</i><j>x</j><i>3</i></l>').value, m(['l', m(['i', ['1', '2', '3']], ['j', 'x'])]));
});

test('xml: the always-use-lists option wraps single children', () => {
    eq(F.xml.parse('<l><i>1</i><j><k>2</k></j></l>', { alwaysArrays: true }).value,
        m(['l', m(['i', ['1']], ['j', [m(['k', ['2']])]])]));
});

test('xml: type inference is off by default and optional', () => {
    eq(F.xml.parse('<r n="5"><a>42</a><b>true</b><c>007</c></r>').value.get('r').get('a'), '42');
    eq(F.xml.parse('<r n="5"><a>42</a><b>true</b><c>007</c><d>1.5</d></r>', { inferTypes: true }).value,
        m(['r', m(['@n', 5], ['a', 42], ['b', true], ['c', '007'], ['d', 1.5])]));
});

test('xml: predefined entities and numeric references are decoded', () => {
    eq(F.xml.parse('<a t="&quot;q&quot; &apos;s&apos;">&lt;b&gt; &amp; &#169; &#x1F600;</a>').value,
        m(['a', m(['@t', '"q" \'s\''], ['#text', '<b> & © 😀'])]));
});

test('xml: comments, processing instructions and the declaration are ignored', () => {
    eq(F.xml.parse('<?xml version="1.0"?>\n<!-- top -->\n<r><!-- inner --><a>1</a><?pi data?></r>\n<!-- end -->').value, m(['r', m(['a', '1'])]));
});

test('xml: a DOCTYPE entity definition with &xxe; is refused with a plain error', () => {
    const xxe = '<?xml version="1.0"?>\n<!DOCTYPE foo [\n  <!ENTITY xxe SYSTEM "file:///etc/passwd">\n]>\n<foo>&xxe;</foo>';
    const err = throwsLike(() => F.xml.parse(xxe), /the entity &xxe; is not supported.*refused for safety/, { format: 'xml' });
    eq([err.line, err.column], [5, 6]);
});

test('xml: a billion-laughs DOCTYPE is refused instantly', () => {
    const laughs = ['<?xml version="1.0"?>', '<!DOCTYPE lolz [', ' <!ENTITY lol "lol">']
        .concat(Array.from({ length: 8 }, (_, i) => ` <!ENTITY lol${i + 2} "${`&lol${i ? i + 1 : ''};`.repeat(10)}">`))
        .concat([']>', '<lolz>&lol9;</lolz>']).join('\n');
    const t0 = Date.now();
    throwsLike(() => F.xml.parse(laughs), /&lol9; is not supported/);
    ok(Date.now() - t0 < 100, 'refused without expanding anything');
});

test('xml: a DOCTYPE without entity references is skipped with a note', () => {
    const r = F.xml.parse('<!DOCTYPE note [<!ENTITY e "x"><!-- a ] comment -->]>\n<note>hi</note>');
    eq(r.value, m(['note', 'hi']));
    ok(hasWarning(r, /declares 1 entity; it was not read/));
});

test('xml: a mismatched closing tag names the tag and position', () => {
    const err = throwsLike(() => F.xml.parse('<library>\n  <book>\n    <title>Dune</titel>\n  </book>\n</library>'),
        /^Line 3, column 16: expected <\/title> to close the <title> opened on line 3, but found <\/titel>\.$/);
    eq([err.line, err.column, err.format], [3, 16, 'xml']);
});

test('xml: other syntax errors explain what was expected', () => {
    throwsLike(() => F.xml.parse('<a>x & y</a>'), /bare "&" must be written as &amp;/);
    throwsLike(() => F.xml.parse('<a><b></b>'), /<a> opened on line 1 is never closed/);
    throwsLike(() => F.xml.parse('<a/><b/>'), /second top-level element, <b>/);
    throwsLike(() => F.xml.parse('hello <a/>'), /text before the root element/);
    throwsLike(() => F.xml.parse('<a x=1/>'), /quoted value for the attribute x/);
    throwsLike(() => F.xml.parse('<a x="1" x="2"/>'), /attribute x appears twice/);
    throwsLike(() => F.xml.parse('<a>&#0;</a>'), /&#0; is not a character XML allows/);
    throwsLike(() => F.xml.parse(''), /No XML element was found/);
});

test('xml: depth, attribute and size caps', () => {
    throwsLike(() => F.xml.parse('<a>'.repeat(513) + '</a>'.repeat(513)), /nested more than 512 levels/);
    ok(F.xml.parse('<a>'.repeat(512) + '</a>'.repeat(512)).value.has('a'));
    const attrs = Array.from({ length: 1001 }, (_, i) => `a${i}="1"`).join(' ');
    throwsLike(() => F.xml.parse(`<x ${attrs}/>`), /more than 1,000 attributes/);
    eq(F.xml.parse(`<x ${attrs.split(' ').slice(0, 1000).join(' ')}/>`).value.get('x').size, 1000);
});

test('xml: mixed content joins text with a warning; xml:space keeps spaces', () => {
    const r = F.xml.parse('<p>Hello <b>world</b> again</p>');
    eq(r.value, m(['p', m(['b', 'world'], ['#text', 'Hello again'])]));
    ok(hasWarning(r, /mixed text with child elements/));
    eq(F.xml.parse('<r xml:space="preserve"><a>  x  </a></r>').value.get('r').get('a'), '  x  ');
});

test('xml: __proto__ and constructor element names stay plain keys', () => {
    const v = F.xml.parse('<r><__proto__>x</__proto__><constructor a="1"/></r>').value.get('r');
    eq(keys(v), ['__proto__', 'constructor']);
    eq(v.get('__proto__'), 'x');
    eq({}.x, undefined);
});

/* ------------------------------------------------------------------ */
/* XML — writing                                                       */
/* ------------------------------------------------------------------ */

test('xml: a single top-level key names the root; otherwise "root" or the option', () => {
    eq(F.xml.stringify(m(['catalog', m(['item', 'x'])])).text, '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n  <item>x</item>\n</catalog>\n');
    eq(F.xml.stringify(m(['a', 1], ['b', 2]), { declaration: false }).text, '<root>\n  <a>1</a>\n  <b>2</b>\n</root>\n');
    eq(F.xml.stringify(m(['a', 1], ['b', 2]), { declaration: false, rootName: 'config' }).text, '<config>\n  <a>1</a>\n  <b>2</b>\n</config>\n');
    eq(F.xml.stringify(m(['x', [1, 2]]), { declaration: false }).text, '<root>\n  <x>1</x>\n  <x>2</x>\n</root>\n');
});

test('xml: lists become repeated elements and "@" / "#text" become attributes and text', () => {
    const v = m(['order', m(['@id', 7], ['line', [m(['@sku', 'A1'], ['#text', 'Lamp']), m(['@sku', 'B2'], ['#text', 'Desk'])]], ['note', null])]);
    eq(F.xml.stringify(v, { declaration: false }).text,
        '<order id="7">\n  <line sku="A1">Lamp</line>\n  <line sku="B2">Desk</line>\n  <note/>\n</order>\n');
    eq(F.xml.stringify([1, [2, 3]], { declaration: false, indent: 'minified' }).text, '<root><item>1</item><item><item>2</item><item>3</item></item></root>');
});

test('xml: indent options', () => {
    const v = m(['r', m(['a', m(['b', 1])])]);
    eq(F.xml.stringify(v, { declaration: false, indent: '4' }).text, '<r>\n    <a>\n        <b>1</b>\n    </a>\n</r>\n');
    eq(F.xml.stringify(v, { declaration: false, indent: 'tab' }).text, '<r>\n\t<a>\n\t\t<b>1</b>\n\t</a>\n</r>\n');
});

test('xml: invalid names are sanitised with a warning', () => {
    const r = F.xml.stringify(m(['first name', 'Ada'], ['1st', 'x'], ['ok-name', 'y'], ['@bad attr', 'z']), { declaration: false });
    eq(r.text, '<root bad_attr="z">\n  <first_name>Ada</first_name>\n  <_1st>x</_1st>\n  <ok-name>y</ok-name>\n</root>\n');
    ok(hasWarning(r, /^3 names were not valid in XML and were changed \(for example "bad attr" became "bad_attr"\)\.$/));
});

test('xml: < & " are escaped in text and attributes', () => {
    const r = F.xml.stringify(m(['p', m(['@title', 'a "b" <c> & d\ne'], ['#text', 'x < y && "z" > 0'])]), { declaration: false });
    eq(r.text, '<p title="a &quot;b&quot; &lt;c&gt; &amp; d&#10;e">x &lt; y &amp;&amp; "z" &gt; 0</p>\n');
    eq(F.xml.parse(r.text).value, m(['p', m(['@title', 'a "b" <c> & d\ne'], ['#text', 'x < y && "z" > 0'])]));
});

test('xml: characters XML 1.0 forbids are replaced with a warning', () => {
    const r = F.xml.stringify(m(['a', 'bell\u0007here']), { declaration: false });
    eq(r.text, '<a>bell\uFFFDhere</a>\n');
    ok(hasWarning(r, /1 character that XML 1.0 does not allow/));
});

test('xml: round trip XML → model → XML → model', () => {
    const first = F.xml.parse(F.xml.sample).value;
    const text = F.xml.stringify(first).text;
    eq(F.xml.parse(text).value, first);
    eq(F.xml.stringify(F.xml.parse(text).value).text, text);
});

/* ------------------------------------------------------------------ */
/* INI                                                                 */
/* ------------------------------------------------------------------ */

test('ini: top-level keys, sections, = and : separators, comments', () => {
    const r = F.ini.parse('; comment\n# another\nname = App\n\n[server]\nhost: 0.0.0.0\nport=8080\n');
    eq(r.value, m(['name', 'App'], ['server', m(['host', '0.0.0.0'], ['port', '8080'])]));
});

test('ini: dotted sections nest by default and can be kept flat', () => {
    const text = '[database]\nurl = x\n[database.replica]\nhost = y';
    eq(F.ini.parse(text).value, m(['database', m(['url', 'x'], ['replica', m(['host', 'y'])])]));
    eq(F.ini.parse(text, { dottedSections: false }).value, m(['database', m(['url', 'x'])], ['database.replica', m(['host', 'y'])]));
});

test('ini: quoted values, escapes and inline comments', () => {
    const v = F.ini.parse('a = "Ada ; Lovelace" ; note\nb = \'single # quote\'\nc = plain ; trailing\nd = "tab\\there"\ncolor = #fff\nurl = http://x/#frag').value;
    eq([v.get('a'), v.get('b'), v.get('c'), v.get('d'), v.get('color'), v.get('url')],
        ['Ada ; Lovelace', 'single # quote', 'plain', 'tab\there', '#fff', 'http://x/#frag']);
    eq(F.ini.parse('c = plain ; trailing', { inlineComments: false }).value.get('c'), 'plain ; trailing');
});

test('ini: type inference is optional and never touches quoted values', () => {
    const text = 'port = 8080\ndebug = true\nratio = 0.5\nzip = "02134"\nname = x';
    eq(F.ini.parse(text).value.get('port'), '8080');
    eq(F.ini.parse(text, { inferTypes: true }).value, m(['port', 8080], ['debug', true], ['ratio', 0.5], ['zip', '02134'], ['name', 'x']));
});

test('ini: a repeated key keeps the last value and warns; sections merge', () => {
    const r = F.ini.parse('[s]\nport = 1\n[t]\nx = 1\n[s]\nport = 2\nhost = h');
    eq(r.value, m(['s', m(['port', '2'], ['host', 'h'])], ['t', m(['x', '1'])]));
    ok(hasWarning(r, /Line 6: "port" in \[s\] appears more than once — the last value was kept/));
    ok(hasWarning(r, /1 section appeared more than once/));
});

test('ini: a key without a value is kept with a warning', () => {
    const r = F.ini.parse('[mysqld]\nskip-networking\nport = 3306');
    eq(r.value.get('mysqld'), m(['skip-networking', ''], ['port', '3306']));
    ok(hasWarning(r, /Line 2 has no "=" or ":"/));
});

test('ini: malformed sections are positioned errors', () => {
    throwsLike(() => F.ini.parse('a = 1\n  [server\nb = 2'), /^Line 2, column 3: this section header is missing its closing "\]"\.$/, { line: 2, column: 3, format: 'ini' });
    throwsLike(() => F.ini.parse('[]'), /a section needs a name/);
    throwsLike(() => F.ini.parse('[a] extra'), /unexpected text after the section header \[a\]/);
    throwsLike(() => F.ini.parse('= 5'), /no key name before "="/);
});

test('ini: writer puts top-level values first, then sections and dotted sections', () => {
    const v = m(['db', m(['host', 'x'], ['replica', m(['host', 'y'])])], ['name', 'App'], ['empty', m()]);
    eq(F.ini.stringify(v).text, 'name = App\n\n[db]\nhost = x\n\n[db.replica]\nhost = y\n\n[empty]\n');
    eq(F.ini.parse(F.ini.stringify(v).text).value, m(['name', 'App'], ['db', m(['host', 'x'], ['replica', m(['host', 'y'])])], ['empty', m()]));
    eq(F.ini.stringify(m(['a', 1]), { spaces: false }).text, 'a=1\n');
});

test('ini: writer warns about lists and nulls and quotes risky values', () => {
    const r = F.ini.stringify(m(['tags', ['a', 'b']], ['none', null], ['note', ' padded ; text '], ['q', '"quoted"']));
    eq(r.text, 'tags = "[\\"a\\",\\"b\\"]"\nnone =\nnote = " padded ; text "\nq = "\\"quoted\\""\n');
    ok(hasWarning(r, /INI has no lists — 1 list was written as JSON text/));
    ok(hasWarning(r, /INI has no null — 1 null value was written as an empty value/));
    eq(F.ini.parse(r.text).value.get('note'), ' padded ; text ');
    eq(F.ini.parse(r.text).value.get('tags'), '["a","b"]');
});

test('ini: a non-record root is wrapped under "data"', () => {
    const r = F.ini.stringify(7);
    eq(r.text, 'data = 7\n');
    ok(hasWarning(r, /put under the key "data"/));
});

/* ------------------------------------------------------------------ */
/* .env                                                                */
/* ------------------------------------------------------------------ */

test('env: plain lines, export prefix and comments', () => {
    eq(F.env.parse('# comment\nexport API_URL=https://api.example.com\nPORT=8080\n\nDEBUG = 1\n').value,
        m(['API_URL', 'https://api.example.com'], ['PORT', '8080'], ['DEBUG', '1']));
});

test('env: single, double and backtick quotes with escapes', () => {
    const v = F.env.parse('A="say \\"hi\\"\\nbye"\nB=\'raw \\n $HOME\'\nC=`tick`\nD="tab\\tend\\\\"').value;
    eq([v.get('A'), v.get('B'), v.get('C'), v.get('D')], ['say "hi"\nbye', 'raw \\n $HOME', 'tick', 'tab\tend\\']);
});

test('env: inline comments only after a space in unquoted values', () => {
    const v = F.env.parse('A=value # note\nB=pass#word\nC="x # y" # z\nD= # nothing\nE=#notcomment').value;
    eq([v.get('A'), v.get('B'), v.get('C'), v.get('D'), v.get('E')], ['value', 'pass#word', 'x # y', '', '#notcomment']);
});

test('env: multi-line quoted values', () => {
    const v = F.env.parse('CERT="-----BEGIN-----\r\nabc\r\n-----END-----"\nNEXT=1').value;
    eq(v.get('CERT'), '-----BEGIN-----\nabc\n-----END-----');
    eq(v.get('NEXT'), '1');
    throwsLike(() => F.env.parse('A="one\ntwo"\nB=2\nNOT VALID=3'), /^Line 4, column 1: "NOT VALID" is not a valid variable name/);
});

test('env: errors name the line and what was expected', () => {
    throwsLike(() => F.env.parse('GOOD=1\nJUSTTEXT'), /^Line 2, column 1: expected NAME=value, but this line has no "="\.$/, { line: 2, format: 'env' });
    throwsLike(() => F.env.parse('1BAD=x'), /"1BAD" is not a valid variable name/);
    throwsLike(() => F.env.parse('X="never closed\nmore'), /^Line 1, column 3: the value of X opens a double quote that never closes\.$/);
});

test('env: duplicates keep the last value and warn', () => {
    const r = F.env.parse('A=1\nB=2\nA=3');
    eq(r.value, m(['A', '3'], ['B', '2']));
    ok(hasWarning(r, /Line 3: A is set more than once — the last value was kept/));
});

test('env: writer flattens nested keys to UPPER_SNAKE', () => {
    const v = m(['db', m(['host', 'localhost'], ['port', 5432])], ['apiKey', 'abc'], ['HTTPServer', 'on'], ['list', ['a', 'b']]);
    eq(F.env.stringify(v).text, 'DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=abc\nHTTP_SERVER=on\nLIST_0=a\nLIST_1=b\n');
});

test('env: writer sanitises invalid names with a warning', () => {
    const r = F.env.stringify(m(['first-name', 'Ada'], ['9lives', 'cat'], ['ünïcode', 'x']));
    eq(r.text, 'FIRST_NAME=Ada\n_9LIVES=cat\n_N_CODE=x\n');
    ok(hasWarning(r, /3 names had characters a variable name cannot use/));
});

test('env: writer quotes values only when needed and round-trips', () => {
    const v = m(['A', 'plain'], ['B', 'two words'], ['C', 'line1\nline2'], ['D', 'p$ss\\w'], ['E', ''], ['F', null], ['G', 'it\'s "x"']);
    const t = F.env.stringify(v, { export: true }).text;
    eq(t, 'export A=plain\nexport B="two words"\nexport C="line1\\nline2"\nexport D=\'p$ss\\w\'\nexport E=\nexport F=\nexport G="it\'s \\"x\\""\n');
    eq(F.env.parse(t).value, m(['A', 'plain'], ['B', 'two words'], ['C', 'line1\nline2'], ['D', 'p$ss\\w'], ['E', ''], ['F', ''], ['G', 'it\'s "x"']));
});

/* ------------------------------------------------------------------ */
/* Query strings                                                       */
/* ------------------------------------------------------------------ */

test('query: leading ?, + as space and %20', () => {
    eq(F.query.parse('?q=wireless+headphones&city=New%20York&e=caf%C3%A9').value,
        m(['q', 'wireless headphones'], ['city', 'New York'], ['e', 'café']));
});

test('query: a full URL is accepted and the fragment is left out', () => {
    const r = F.query.parse('https://shop.example.com/search?q=lamp&page=2#results');
    eq(r.value, m(['q', 'lamp'], ['page', '2']));
    ok(hasWarning(r, /#fragment/));
    const none = F.query.parse('https://example.com/path');
    eq(none.value, m());
    ok(hasWarning(none, /no query string/));
});

test('query: repeated keys become lists', () => {
    eq(F.query.parse('tag=a&tag=b&tag=c&x=1').value, m(['tag', ['a', 'b', 'c']], ['x', '1']));
});

test('query: bracket nesting, a[]= lists and positions', () => {
    eq(F.query.parse('user[name]=Ada&user[langs][]=en&user[langs][]=fr&ids[1]=b&ids[0]=a&flag').value,
        m(['user', m(['name', 'Ada'], ['langs', ['en', 'fr']])], ['ids', ['a', 'b']], ['flag', '']));
});

test('query: brackets are read literally when the option is off', () => {
    eq(F.query.parse('a[b]=1&a[]=2', { brackets: false }).value, m(['a[b]', '1'], ['a[]', '2']));
});

test('query: malformed %-escapes are kept as typed with a warning', () => {
    const r = F.query.parse('d=%zz&e=100%&f=%E0%A4&g=%41');
    eq(r.value, m(['d', '%zz'], ['e', '100%'], ['f', '%E0%A4'], ['g', 'A']));
    ok(hasWarning(r, /3 %-escapes were not valid/));
});

test('query: a[99999999]=1 never allocates a huge list', () => {
    const r = F.query.parse('a[99999999]=1&b[1000]=x&c[1001]=y');
    eq(r.value, m(['a', m(['99999999', '1'])], ['b', ['x']], ['c', m(['1001', 'y'])]));
    ok(!Array.isArray(r.value.get('a')), 'an index past 1,000 is a record key');
});

test('query: brackets 50 levels deep are capped at 20 with a warning', () => {
    const key = 'a' + Array.from({ length: 50 }, (_, i) => `[k${i}]`).join('');
    const r = F.query.parse(`${key}=v`);
    let depth = 0;
    let node = r.value;
    let lastKey = '';
    while (node instanceof Map) {
        lastKey = keys(node)[0];
        node = node.get(lastKey);
        depth++;
    }
    eq(depth, 22, 'base key + 20 bracket levels + the rest as one name');
    ok(lastKey.startsWith('[k20][k21]'), 'the remainder is kept as one key name');
    eq(node, 'v');
    ok(hasWarning(r, /more than 20 brackets deep/));
});

test('query: __proto__ and constructor are plain keys', () => {
    const v = F.query.parse('__proto__[x]=1&constructor[prototype][y]=2&a[__proto__]=3').value;
    eq(keys(v), ['__proto__', 'constructor', 'a']);
    eq(v.get('constructor').get('prototype').get('y'), '2');
    eq({}.x, undefined);
    eq({}.y, undefined);
});

test('query: a value and a group with the same name keep the group', () => {
    const r = F.query.parse('a=1&a[b]=2');
    eq(r.value, m(['a', m(['b', '2'])]));
    ok(hasWarning(r, /both as a single value and as a group/));
});

test('query: writer encodes, nests with brackets and writes lists three ways', () => {
    const v = m(['q', 'a b&c=d'], ['p', m(['min', 1], ['max', 2])], ['tags', ['x', 'y z']]);
    eq(F.query.stringify(v).text, 'q=a%20b%26c%3Dd&p[min]=1&p[max]=2&tags[]=x&tags[]=y%20z');
    eq(F.query.stringify(v, { arrays: 'repeat' }).text, 'q=a%20b%26c%3Dd&p[min]=1&p[max]=2&tags=x&tags=y%20z');
    eq(F.query.stringify(v, { arrays: 'index', questionMark: true }).text, '?q=a%20b%26c%3Dd&p[min]=1&p[max]=2&tags[0]=x&tags[1]=y%20z');
    eq(F.query.stringify(m(['rows', [m(['id', 1]), m(['id', 2])]])).text, 'rows[0][id]=1&rows[1][id]=2');
});

test('query: writer warns about nulls and empty groups', () => {
    const r = F.query.stringify(m(['a', null], ['b', []], ['c', m()], ['d', true]));
    eq(r.text, 'a=&d=true');
    ok(hasWarning(r, /1 null value was written as empty/));
    ok(hasWarning(r, /2 empty lists or records have no query-string form/));
});

test('query: parse → stringify → parse round trip', () => {
    const first = F.query.parse(F.query.sample).value;
    eq(F.query.parse(F.query.stringify(first).text).value, first);
});

/* ------------------------------------------------------------------ */
/* Markdown tables                                                     */
/* ------------------------------------------------------------------ */

test('markdown: parse a GFM table with escaped pipes, <br> and types', () => {
    const r = F.markdown.parse('Intro text\n\n| Name | Note | Qty |\n| :--- | :---: | ---: |\n| Ada | a \\| b | 3 |\n| Grace | line<br>two | |\n\nAfter');
    eq(r.value, [m(['Name', 'Ada'], ['Note', 'a | b'], ['Qty', 3]), m(['Name', 'Grace'], ['Note', 'line\ntwo'], ['Qty', null])]);
    eq(r.warnings, []);
});

test('markdown: outer pipes are optional and type inference can be off', () => {
    eq(F.markdown.parse('a | b\n--|--\n1 | x', { inferTypes: false }).value, [m(['a', '1'], ['b', 'x'])]);
});

test('markdown: only the first table is read; extra cells are dropped with warnings', () => {
    const r = F.markdown.parse('| a |\n|---|\n| 1 | 2 |\n\n| b |\n|---|\n| 3 |');
    eq(r.value, [m(['a', 1])]);
    ok(hasWarning(r, /more cells than the header/));
    ok(hasWarning(r, /Only the first table was read; 1 more table was found/));
});

test('markdown: no table is a plain error', () => {
    throwsLike(() => F.markdown.parse('# Title\n\nJust prose | with a pipe.'), /No Markdown table was found.*\| --- \| --- \|/, { format: 'markdown' });
});

test('markdown: stringify pads columns and right-aligns numbers on auto', () => {
    const t = F.markdown.stringify([m(['name', 'Ada'], ['n', 36]), m(['name', 'Grace Hopper'], ['n', 5])]).text;
    eq(t, '| name         |   n |\n| ------------ | --: |\n| Ada          |  36 |\n| Grace Hopper |   5 |\n');
});

test('markdown: stringify alignment options, escaped pipes and newlines', () => {
    const v = [m(['a|b', 'x|y'], ['c', 'one\ntwo'])];
    eq(F.markdown.stringify(v, { align: 'left' }).text, '| a\\|b | c          |\n| :--- | :--------- |\n| x\\|y | one<br>two |\n');
    eq(F.markdown.stringify(v, { align: 'center' }).text.split('\n')[1], '| :--: | :--------: |');
    eq(F.markdown.stringify(v, { align: 'right' }).text.split('\n')[1], '| ---: | ---------: |');
    eq(F.markdown.parse(F.markdown.stringify(v).text).value, v);
});

test('markdown: parse → stringify → parse round trip', () => {
    const first = F.markdown.parse(F.markdown.sample).value;
    eq(F.markdown.parse(F.markdown.stringify(first).text).value, first);
});

/* ------------------------------------------------------------------ */
/* HTML tables                                                         */
/* ------------------------------------------------------------------ */

test('html: a <script> cell is escaped, never markup', () => {
    const t = F.html.stringify([m(['<b>name</b>', '<script>alert("x")</script>'], ['q', 'O\'Brien & Co'])]).text;
    ok(!/<script>/i.test(t), 'no live script tag');
    ok(t.includes('<td>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</td>'));
    ok(t.includes('<th scope="col">&lt;b&gt;name&lt;/b&gt;</th>'));
    ok(t.includes('<td>O&#39;Brien &amp; Co</td>'));
});

test('html: thead, tbody, caption and line breaks', () => {
    const t = F.html.stringify([m(['a', 1], ['b', 'x\ny'])], { caption: 'Totals <2026>' }).text;
    eq(t, '<table>\n  <caption>Totals &lt;2026&gt;</caption>\n  <thead>\n    <tr><th scope="col">a</th><th scope="col">b</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>1</td><td>x<br>y</td></tr>\n  </tbody>\n</table>\n');
});

test('html: reading is refused with a plain message', () => {
    throwsLike(() => F.html.parse('<table></table>'), /can only be written here, not read/, { format: 'html' });
    throwsLike(() => F.sql.parse('INSERT'), /can only be written here, not read/, { format: 'sql' });
    eq([F.html.detect('<table><tr><td>1</td></tr></table>'), F.sql.detect('INSERT INTO x VALUES (1);')], [0, 0]);
});

/* ------------------------------------------------------------------ */
/* SQL INSERT                                                          */
/* ------------------------------------------------------------------ */

const PEOPLE = [
    m(['id', 1], ['name', 'O\'Brien'], ['active', true], ['score', 2.5], ['note', null]),
    m(['id', 2], ['name', 'Zed'], ['active', false], ['score', 4], ['note', 'C:\\temp'])
];

test('sql: ANSI quoting, doubled quotes, NULL and TRUE / FALSE', () => {
    eq(F.sql.stringify(PEOPLE).text,
        'INSERT INTO "data" ("id", "name", "active", "score", "note") VALUES\n  (1, \'O\'\'Brien\', TRUE, 2.5, NULL),\n  (2, \'Zed\', FALSE, 4, \'C:\\temp\');\n');
});

test('sql: MySQL backticks, 1 / 0 booleans and doubled backslashes', () => {
    eq(F.sql.stringify(PEOPLE, { dialect: 'mysql', table: 'people' }).text,
        'INSERT INTO `people` (`id`, `name`, `active`, `score`, `note`) VALUES\n  (1, \'O\'\'Brien\', 1, 2.5, NULL),\n  (2, \'Zed\', 0, 4, \'C:\\\\temp\');\n');
});

test('sql: PostgreSQL and SQLite dialects', () => {
    const pg = F.sql.stringify(PEOPLE, { dialect: 'postgresql' }).text;
    ok(pg.includes('("id", "name", "active", "score", "note")') && pg.includes('TRUE, 2.5, NULL'));
    const lite = F.sql.stringify(PEOPLE, { dialect: 'sqlite' }).text;
    ok(lite.includes('(1, \'O\'\'Brien\', 1, 2.5, NULL)') && lite.includes('(2, \'Zed\', 0, 4,'));
});

test('sql: identifiers with quotes are doubled and the table name is sanitised', () => {
    const r = F.sql.stringify([m(['we"ird', 1])], { table: 'my table; DROP' });
    eq(r.text, 'INSERT INTO "my_table__DROP" ("we""ird") VALUES\n  (1);\n');
    ok(hasWarning(r, /table name "my table; DROP" was changed/));
    eq(F.sql.stringify([m(['we`ird', 1])], { dialect: 'mysql' }).text, 'INSERT INTO `data` (`we``ird`) VALUES\n  (1);\n');
});

test('sql: rows per statement splits the INSERTs', () => {
    const rows = Array.from({ length: 5 }, (_, i) => m(['n', i]));
    const t = F.sql.stringify(rows, { rowsPerStatement: 2 }).text;
    eq(t.match(/INSERT INTO/g).length, 3);
    eq(t, 'INSERT INTO "data" ("n") VALUES\n  (0),\n  (1);\n\nINSERT INTO "data" ("n") VALUES\n  (2),\n  (3);\n\nINSERT INTO "data" ("n") VALUES\n  (4);\n');
});

test('sql: CREATE TABLE infers column types per dialect', () => {
    const rows = [
        m(['id', 1], ['big', 3000000000], ['huge', 99999999999999999999n], ['price', 9.99], ['ok', true], ['name', 'Ada'], ['blank', null]),
        m(['id', 2], ['big', 5], ['huge', 1], ['price', 10], ['ok', false], ['name', 'Grace Hopper'], ['blank', null])
    ];
    const head = (dialect) => F.sql.stringify(rows, { dialect, createTable: true }).text.split('\n\n')[0];
    eq(head('ansi'), 'CREATE TABLE "data" (\n  "id" INTEGER,\n  "big" BIGINT,\n  "huge" NUMERIC,\n  "price" DOUBLE PRECISION,\n  "ok" BOOLEAN,\n  "name" VARCHAR(12),\n  "blank" VARCHAR(1)\n);');
    eq(head('mysql'), 'CREATE TABLE `data` (\n  `id` INT,\n  `big` BIGINT,\n  `huge` DECIMAL(65,0),\n  `price` DOUBLE,\n  `ok` BOOLEAN,\n  `name` VARCHAR(255),\n  `blank` VARCHAR(255)\n);');
    eq(head('postgresql'), 'CREATE TABLE "data" (\n  "id" INTEGER,\n  "big" BIGINT,\n  "huge" NUMERIC,\n  "price" DOUBLE PRECISION,\n  "ok" BOOLEAN,\n  "name" TEXT,\n  "blank" TEXT\n);');
    eq(head('sqlite'), 'CREATE TABLE "data" (\n  "id" INTEGER,\n  "big" INTEGER,\n  "huge" NUMERIC,\n  "price" REAL,\n  "ok" INTEGER,\n  "name" TEXT,\n  "blank" TEXT\n);');
});

test('sql: nested values, NaN and empty input', () => {
    eq(F.sql.stringify([m(['a', m(['b', 1])])]).text, 'INSERT INTO "data" ("a.b") VALUES\n  (1);\n');
    eq(F.sql.stringify([m(['a', m(['b', 1])])], { nested: 'json' }).text, 'INSERT INTO "data" ("a") VALUES\n  (\'{"b":1}\');\n');
    const r = F.sql.stringify([m(['x', NaN])]);
    eq(r.text, 'INSERT INTO "data" ("x") VALUES\n  (NULL);\n');
    ok(hasWarning(r, /no NaN or Infinity/));
    const empty = F.sql.stringify([]);
    eq(empty.text, '');
    ok(hasWarning(empty, /no rows to insert/));
});

test('sql: lists of lists use the first row as column names unless told otherwise', () => {
    eq(F.sql.stringify([['id', 'name'], [1, 'Ada']]).text, 'INSERT INTO "data" ("id", "name") VALUES\n  (1, \'Ada\');\n');
    eq(F.sql.stringify([['id', 'name'], [1, 'Ada']], { header: false }).text,
        'INSERT INTO "data" ("column1", "column2") VALUES\n  (\'id\', \'name\'),\n  (1, \'Ada\');\n');
});

/* ------------------------------------------------------------------ */
/* detect()                                                            */
/* ------------------------------------------------------------------ */

test('detect: csv and tsv', () => {
    ok(F.csv.detect('id,name,age\n1,Ada,36\n2,Grace,85') >= 0.7);
    ok(F.csv.detect('a;b;c\n1;2;3') >= 0.6);
    ok(F.tsv.detect('a\tb\n1\t2') >= 0.7);
    ok(F.csv.detect('{"a": 1}') < 0.1);
    ok(F.tsv.detect('\tdef x():\n\t\treturn 1\n\tpass') < 0.4, 'tab-indented code is not TSV');
});

test('detect: xml', () => {
    ok(F.xml.detect('<?xml version="1.0"?>\n<a/>') >= 0.9);
    ok(F.xml.detect('\uFEFF  <catalog><item/></catalog>') >= 0.8);
    eq(F.xml.detect('name,age'), 0);
});

test('detect: ini and env', () => {
    ok(F.ini.detect('[server]\nhost = example\nport = 8080') >= 0.7);
    ok(F.ini.detect('[server]\nhost = example') > F.env.detect('[server]\nhost = example'));
    ok(F.env.detect('APP_ENV=production\nexport PORT=8080') >= 0.8);
    ok(F.env.detect('APP_ENV=production\nPORT=8080') > F.ini.detect('APP_ENV=production\nPORT=8080'));
    ok(F.ini.detect('title = "TOML"\n[owner]\nname = "Tom"\ndob = 1979-05-27') < 0.5, 'TOML-typed values lower the INI score');
});

test('detect: query and markdown', () => {
    ok(F.query.detect('?a=1&b=2') >= 0.85);
    ok(F.query.detect('https://example.com/p?q=1') >= 0.8);
    ok(F.query.detect('a=1&b=2') > F.env.detect('a=1&b=2'));
    eq(F.query.detect('just some words'), 0.02);
    ok(F.markdown.detect('| a | b |\n|---|---|\n| 1 | 2 |') >= 0.9);
    ok(F.markdown.detect('| a | b |\n|---|---|\n| 1 | 2 |') > F.csv.detect('| a | b |\n|---|---|\n| 1 | 2 |'));
    eq(F.markdown.detect('# Heading\n\nNo table here.'), 0);
});

test('detect: never throws and stays within 0..1', () => {
    const odd = [null, undefined, 42, {}, [], '', ' ', '\uFEFF', '<', '[', '"', '%%%', 'x'.repeat(200000), '\u0000\u0001'];
    Object.values(F).forEach((mod) => odd.forEach((input) => {
        const s = mod.detect(input);
        ok(typeof s === 'number' && s >= 0 && s <= 1, `${mod.id}.detect(${String(input).slice(0, 10)}) = ${s}`);
    }));
});

test('parse: non-text input and oversized text are refused plainly', () => {
    READABLE.forEach((id) => {
        throwsLike(() => F[id].parse(null), /no text to read/i, { format: id });
    });
    const huge = 'a'.repeat(20 * 1024 * 1024 + 1);
    READABLE.forEach((id) => throwsLike(() => F[id].parse(huge), /^This text is 20\.0 MB — larger than 20 MB, the most convertMan reads at a time\.$/, { format: id }));
});

test('stringify: values nested past 512 levels are refused with the format named', () => {
    let deep = 'leaf';
    for (let i = 0; i < 600; i++) deep = [deep];
    ['csv', 'tsv', 'markdown', 'html', 'sql'].forEach((id) => {
        throwsLike(() => F[id].stringify([m(['a', deep])]), /nested more than 512 levels/, { format: id });
        throwsLike(() => F[id].stringify([m(['a', deep])], { nested: 'json' }), /nested more than 512 levels/, { format: id });
    });
    throwsLike(() => F.xml.stringify(m(['a', deep])), /nested more than 512 levels/, { format: 'xml' });
    throwsLike(() => F.ini.stringify(m(['a', deep])), /nested more than 512 levels/, { format: 'ini' });
    throwsLike(() => F.env.stringify(m(['a', deep])), /nested more than 512 levels/, { format: 'env' });
    throwsLike(() => F.query.stringify(m(['a', deep])), /nested more than 512 levels/, { format: 'query' });
    const xml512 = F.xml.parse('<a>'.repeat(512) + 'x' + '</a>'.repeat(512)).value;
    ok(F.xml.stringify(xml512, { indent: 'minified', declaration: false }).text.startsWith('<a><a>'), 'the deepest XML convertMan reads can be written back');
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
