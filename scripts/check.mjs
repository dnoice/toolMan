#!/usr/bin/env node
/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: RepoCheck (toolMan Edition - v1.0)
 *     - File Name: check.mjs
 *     - Relative Path: scripts/check.mjs
 *     - Artifact Type: CLI
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The one command that tells you whether the repository is healthy. It
 *     runs every static check toolMan cares about — file hygiene, JavaScript
 *     syntax, the house docstring header, local links and paths, CSS custom
 *     properties, the security baseline — and then every unit test, with no
 *     install step. CI runs exactly this; run it locally before you push.
 *
 * ✒ Key Features:
 *     - Zero dependencies: Node's standard library only, no package.json
 *     - hygiene: UTF-8 without BOM, LF line endings, final newline, no
 *       leftover merge-conflict markers
 *     - syntax: node --check on every .js / .mjs / .cjs file
 *     - headers: every owned file carries the full ✒ Metadata header —
 *       required fields, File Name and Relative Path match the file, Title
 *       version matches Version, Date and Update name the same day, the
 *       byte-exact signature, Changelog present past 1.0.0 and led by the
 *       current version, shipped files capped at three entries with the
 *       CHANGELOG.md pointer kept consistent in both directions
 *     - links: every local src / href / url() / Markdown link and in-page
 *       Markdown anchor resolves, and registry paths point at real pages
 *     - css-vars: every var(--x) without a fallback is defined somewhere
 *       (CSS, inline styles, or JS setProperty / style keys)
 *     - security: bans eval, new Function, document.write, string timers,
 *       javascript: URLs, and any external network load (offline-first),
 *       and flags interpolated HTML sinks for review
 *     - tests: runs every tests/*.test.js / *.test.mjs file as its own
 *       Node process and reports failures with their output
 *     - GitHub annotations when run inside Actions, so failures land on the
 *       offending line of the pull request
 *     - Per-line escape hatch: a "check-allow: <rule> — <reason>" comment
 *       on the line or the line above suppresses one rule, with a reason
 *
 * ✒ Usage Instructions:
 *     From the repository root (Node 20 or newer):
 *         node scripts/check.mjs
 *     Exit code 0 means every selected check passed; 1 means at least one
 *     error was reported (warnings never fail the run).
 *
 * ✒ Examples:
 *     node scripts/check.mjs                      → every check + unit tests
 *     node scripts/check.mjs --only headers       → just the header audit
 *     node scripts/check.mjs --only links,css-vars
 *     node scripts/check.mjs --skip tests         → static checks only
 *     node scripts/check.mjs --list               → name every check
 *     node scripts/check.mjs --quiet              → summary lines only
 *
 * ✒ Command-Line Arguments:
 *     Selection:
 *         --only <a,b>   Run only the named checks
 *         --skip <a,b>   Run everything except the named checks
 *     Output:
 *         --quiet        Print per-check summaries, not each finding
 *         --list         List the checks and exit
 *         --help         Show usage and exit
 *
 * ✒ Other Important Information:
 *     - Dependencies: Node.js 20+ (node:fs, node:path, node:child_process);
 *       git is used to list files when available, else the tree is walked
 *     - Compatible platforms: Linux, macOS, Windows (any Node 20+ runtime)
 *     - Exemptions: binary files, shared/assets/** media, the pull-request
 *       template (copied verbatim into every PR body), and **\/fixtures/**
 *       test corpora carry no house header by design
 *     - Performance: a full run over the current tree takes a few seconds,
 *       dominated by the unit tests
 * ----------------------------------------------------------------------------
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

/* ── Configuration ───────────────────────────────────────────────────────── */

const SIGNATURE = '︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!';

const ARTIFACT_TYPES = new Set([
    'python', 'javascript', 'typescript', 'markup', 'stylesheet', 'shell', 'diagram', 'sql', 'dockerfile',
    'config', 'schema', 'data', 'docs', 'library', 'CLI', 'test', 'notebook', 'other'
]);

const REQUIRED_FIELDS = [
    'Title', 'File Name', 'Relative Path', 'Artifact Type', 'Version',
    'Date', 'Update', 'Author', 'A.I. Acknowledgement', 'Signature'
];

const TEXT_EXT = new Set([
    '.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.md', '.yml', '.yaml',
    '.json', '.svg', '.txt', '.xml', '.csv'
]);
const TEXT_DOTFILES = new Set(['.gitignore', '.gitattributes', '.editorconfig']);

/** Paths that legitimately carry no house header, with the reason. */
const HEADER_EXEMPT = [
    [/^shared\/assets\/screenshots\//, 'screenshots are binary media'],
    [/^\.github\/PULL_REQUEST_TEMPLATE\.md$/, 'copied verbatim into every pull-request body'],
    [/(^|\/)fixtures\//, 'test corpora reproduce outside material byte for byte'],
    [/(^|\/)package(-lock)?\.json$/, 'strict JSON parsers reject a header'],
    [/^LICENSE/, 'license text is third-party legal text']
];

/** Browser-shipped artifacts: three changelog entries max, 40 lines max. */
const isShipped = (rel) => /^(index\.html$|shared\/|tools\/)/.test(rel)
    && /\.(js|css|html|svg)$/.test(rel)
    && !/(^|\/)tests\//.test(rel);

const isTestPath = (rel) => /(^|\/)(tests|fixtures)\//.test(rel);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ── Reporting ───────────────────────────────────────────────────────────── */

class Report {
    constructor(name) {
        this.name = name;
        this.errors = [];
        this.warnings = [];
        this.note = '';
    }
    error(file, line, message) { this.errors.push({ file, line, message }); }
    warn(file, line, message) { this.warnings.push({ file, line, message }); }
}

function annotate(kind, f) {
    if (!IN_ACTIONS) return;
    const loc = f.file ? `file=${f.file}${f.line ? `,line=${f.line}` : ''}` : '';
    const msg = String(f.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::${kind} ${loc}::${msg}`);
}

/* ── File inventory ──────────────────────────────────────────────────────── */

function listFiles() {
    const res = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
    });
    if (res.status === 0) {
        return [...new Set(res.stdout.split('\0').filter(Boolean))]
            .filter((rel) => existsSync(path.join(ROOT, rel)) && statSync(path.join(ROOT, rel)).isFile())
            .sort();
    }
    // No git (a downloaded ZIP, say): walk the tree instead.
    const out = [];
    const walk = (dir) => {
        for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            if (['.git', 'node_modules', 'e2e-shots', 'test-results'].includes(entry.name)) continue;
            const rel = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(rel);
            else out.push(rel);
        }
    };
    walk('');
    return out.sort();
}

const isText = (rel) => TEXT_EXT.has(path.extname(rel).toLowerCase()) || TEXT_DOTFILES.has(path.basename(rel))
    || /(^|\/)\.vscode\/[^/]+\.json$/.test(rel);

const cache = new Map();
function read(rel) {
    if (!cache.has(rel)) cache.set(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
    return cache.get(rel);
}

/** "check-allow: <rule>" on the line itself or the line above. */
function allowed(lines, index, rule) {
    const re = new RegExp(`check-allow:\\s*${rule}\\b`);
    return re.test(lines[index] || '') || re.test(lines[index - 1] || '');
}

/** 1-based line number of a character offset. */
function lineAt(text, offset) {
    let n = 1;
    for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

/* ── Check: hygiene ──────────────────────────────────────────────────────── */

function checkHygiene(files, r) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let count = 0;
    for (const rel of files.filter(isText)) {
        count++;
        const buf = readFileSync(path.join(ROOT, rel));
        try { decoder.decode(buf); } catch { r.error(rel, 0, 'not valid UTF-8'); continue; }
        if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) r.error(rel, 1, 'starts with a UTF-8 BOM — save without BOM');
        const text = buf.toString('utf8');
        const cr = text.indexOf('\r');
        if (cr !== -1) r.error(rel, lineAt(text, cr), 'CRLF / CR line ending — the repo is LF-only (.gitattributes)');
        if (text.length && !text.endsWith('\n')) r.error(rel, lineAt(text, text.length), 'missing final newline');
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            if (/^(<{7}|>{7})( |$)|^={7}$/.test(line)) r.error(rel, i + 1, 'merge-conflict marker');
        });
    }
    r.note = `${count} text files`;
}

/* ── Check: syntax ───────────────────────────────────────────────────────── */

function checkSyntax(files, r) {
    const scripts = files.filter((f) => /\.(m|c)?js$/.test(f));
    for (const rel of scripts) {
        const res = spawnSync(process.execPath, ['--check', rel], { cwd: ROOT, encoding: 'utf8' });
        if (res.status !== 0) {
            const detail = (res.stderr || '').trim().split('\n');
            const lineMatch = /:(\d+)$/.exec(detail[0] || '');
            const message = detail.find((l) => /Error/.test(l)) || 'syntax error';
            r.error(rel, lineMatch ? Number(lineMatch[1]) : 0, message.trim());
        }
    }
    r.note = `${scripts.length} scripts`;
}

/* ── Check: headers ──────────────────────────────────────────────────────── */

function parseDate(value) {
    let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    let y, mo, d;
    if (m) { [, mo, d, y] = m.map(Number); }
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value))) { [, y, mo, d] = m.map(Number); }
    else return null;
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return date;
}

function parseUpdate(value) {
    const m = /^(\w+), (\w+) (\d{1,2}), (\d{4})$/.exec(value);
    if (!m) return null;
    const month = MONTHS.indexOf(m[2]);
    if (month === -1 || !WEEKDAYS.includes(m[1])) return null;
    const date = new Date(Date.UTC(Number(m[4]), month, Number(m[3])));
    if (date.getUTCDate() !== Number(m[3])) return null;
    return { date, weekday: m[1] };
}

const semverCmp = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
};

/** Strip a header line's comment decoration: " * ", "# ", "; ", "// ", "%% ". */
const bare = (line) => line.replace(/^\s*(?:\*(?!\/)|#|;|\/\/|%%)?\s?/, '');

function extractHeader(text) {
    const lines = text.split('\n');
    const start = lines.slice(0, 40).findIndex((l) => l.includes('✒ Metadata'));
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        const b = bare(lines[i]).trim();
        if (/^(\*\/|-->)$/.test(lines[i].trim()) || /^(-{5,}|={20,})$/.test(b) || /^-{5,}\s*$/.test(lines[i].trim())) {
            end = i;
            break;
        }
    }
    return { lines, start, end };
}

function checkHeaders(files, r, changelogSections) {
    let checked = 0;
    const pointerFiles = new Set();
    for (const rel of files.filter(isText)) {
        const exempt = HEADER_EXEMPT.find(([re]) => re.test(rel));
        if (exempt) continue;
        checked++;
        const text = read(rel);
        const header = extractHeader(text);
        if (!header) {
            r.error(rel, 1, 'missing the ✒ Metadata header (see CONTRIBUTING.md → File headers)');
            continue;
        }
        const { lines, start, end } = header;
        const block = lines.slice(start, end);
        const at = (i) => start + i + 1;

        // Sections
        const sectionIndex = (name) => block.findIndex((l) => bare(l).trim().startsWith(`✒ ${name}`));
        const sections = ['Changelog', 'Description', 'Key Features', 'Usage Instructions', 'Examples',
            'Command-Line Arguments', 'Other Important Information'];
        const found = Object.fromEntries(sections.map((s) => [s, sectionIndex(s)]));
        const metaEnd = Math.min(...Object.values(found).filter((i) => i > 0), block.length);

        // Metadata fields
        const fields = {};
        for (let i = 1; i < metaEnd; i++) {
            const m = /^\s*-\s+([A-Z][A-Za-z. ]*?):\s?(.*)$/.exec(bare(block[i]));
            if (m && !(m[1] in fields)) fields[m[1]] = { value: m[2].trim(), line: at(i) };
        }
        for (const name of REQUIRED_FIELDS) {
            if (!fields[name] || !fields[name].value) r.error(rel, at(0), `header field "${name}" is missing or empty`);
        }
        const f = (name) => (fields[name] ? fields[name].value : '');
        const fl = (name) => (fields[name] ? fields[name].line : at(0));

        if (fields['File Name'] && f('File Name') !== path.basename(rel)) {
            r.error(rel, fl('File Name'), `File Name "${f('File Name')}" should be "${path.basename(rel)}"`);
        }
        if (fields['Relative Path'] && f('Relative Path') !== rel) {
            r.error(rel, fl('Relative Path'), `Relative Path "${f('Relative Path')}" should be "${rel}"`);
        }
        if (fields['Artifact Type'] && !ARTIFACT_TYPES.has(f('Artifact Type'))) {
            r.error(rel, fl('Artifact Type'), `Artifact Type "${f('Artifact Type')}" is not a canonical value`);
        }
        const version = f('Version');
        const versionOk = /^\d+\.\d+\.\d+$/.test(version);
        if (fields.Version && !versionOk) r.error(rel, fl('Version'), `Version "${version}" is not X.Y.Z`);
        if (fields.Title) {
            const m = /\(.+ Edition - v(\d+)\.(\d+)\)$/.exec(f('Title'));
            if (!m) r.error(rel, fl('Title'), 'Title should read "{Name} ({Project} Edition - vX.Y)"');
            else if (versionOk && `${m[1]}.${m[2]}` !== version.split('.').slice(0, 2).join('.')) {
                r.error(rel, fl('Title'), `Title says v${m[1]}.${m[2]} but Version is ${version}`);
            }
        }
        if (fields.Date) {
            const date = parseDate(f('Date'));
            if (!date) r.error(rel, fl('Date'), `Date "${f('Date')}" should be MM/DD/YYYY`);
            else if (fields.Update) {
                const up = parseUpdate(f('Update'));
                if (!up) r.error(rel, fl('Update'), `Update "${f('Update')}" should read like "Tuesday, November 17, 2026"`);
                else if (up.date.getTime() !== date.getTime()) r.error(rel, fl('Update'), 'Update and Date name different days');
                else if (WEEKDAYS[date.getUTCDay()] !== up.weekday) {
                    r.error(rel, fl('Update'), `${f('Update')} is a ${WEEKDAYS[date.getUTCDay()]}, not a ${up.weekday}`);
                }
            }
        }
        if (fields['A.I. Acknowledgement'] && !/^(None|.+ - .+)$/.test(f('A.I. Acknowledgement'))) {
            r.error(rel, fl('A.I. Acknowledgement'), 'A.I. Acknowledgement should be "{Platform} - {Model}" or "None"');
        }
        if (fields.Signature && f('Signature') !== SIGNATURE) {
            r.error(rel, fl('Signature'), 'Signature is not the byte-exact canonical string');
        }

        // Required sections
        if (found.Description === -1) r.error(rel, at(0), 'header has no ✒ Description section');
        const bodyLines = lines.length - end;
        if (found['Key Features'] === -1 && bodyLines >= 15) {
            r.error(rel, at(0), 'header has no ✒ Key Features section');
        } else if (found['Key Features'] !== -1) {
            let bullets = 0;
            for (let i = found['Key Features'] + 1; i < block.length; i++) {
                const b = bare(block[i]);
                if (b.trim().startsWith('✒')) break;
                if (/^\s*-\s+\S/.test(b)) bullets++;
            }
            if (bullets < 3) r.error(rel, at(found['Key Features']), `Key Features lists ${bullets} item(s); the standard asks for at least 3`);
        }
        if (found['Other Important Information'] === -1 && bodyLines >= 15) {
            r.error(rel, at(0), 'header has no ✒ Other Important Information section');
        }

        // Changelog
        const pastOne = versionOk && semverCmp(version, '1.0.0') > 0;
        if (pastOne && found.Changelog === -1) r.error(rel, at(0), `Version ${version} is past 1.0.0 but the header has no ✒ Changelog`);
        if (found.Changelog !== -1) {
            const entries = [];
            let span = 0;
            let pointer = false;
            for (let i = found.Changelog + 1; i < block.length; i++) {
                const b = bare(block[i]);
                if (b.trim().startsWith('✒')) break;
                if (b.trim()) span = i - found.Changelog;
                if (/Earlier entries: see CHANGELOG\.md/.test(b)) pointer = true;
                const m = /^\s*-\s+(\d+\.\d+\.\d+)\s+\(([^)]+)\)\s*(\[[^\]]+\])?/.exec(b);
                if (m) entries.push({ version: m[1], date: m[2], tag: m[3], line: at(i) });
            }
            if (!entries.length) r.error(rel, at(found.Changelog), 'Changelog section has no "- X.Y.Z (date) [tag] — text" entries');
            else {
                if (versionOk && entries[0].version !== version) {
                    r.error(rel, entries[0].line, `newest Changelog entry is ${entries[0].version} but Version is ${version}`);
                }
                for (let i = 1; i < entries.length; i++) {
                    if (semverCmp(entries[i - 1].version, entries[i].version) <= 0) {
                        r.error(rel, entries[i].line, `Changelog is not newest-first (${entries[i - 1].version} above ${entries[i].version})`);
                    }
                }
                entries.forEach((e) => {
                    if (!parseDate(e.date)) r.error(rel, e.line, `Changelog date "${e.date}" should be MM/DD/YYYY`);
                    if (!e.tag) r.error(rel, e.line, 'Changelog entry has no [human + Platform - Model] attribution tag');
                });
            }
            if (isShipped(rel)) {
                if (entries.length > 3) r.error(rel, at(found.Changelog), `shipped file keeps ${entries.length} changelog entries inline; the limit is 3 — roll the rest into CHANGELOG.md`);
                if (span > 40) r.error(rel, at(found.Changelog), `shipped file's changelog runs ${span} lines; the limit is 40`);
            }
            if (pointer) {
                pointerFiles.add(rel);
                if (!changelogSections.has(rel)) r.error(rel, at(found.Changelog), `points at CHANGELOG.md but CHANGELOG.md has no "## \`${rel}\`" section`);
            }
        }
    }
    for (const rel of changelogSections.keys()) {
        if (!existsSync(path.join(ROOT, rel))) {
            r.error('CHANGELOG.md', changelogSections.get(rel), `archive section for "${rel}", which no longer exists`);
        } else if (!pointerFiles.has(rel)) {
            r.error(rel, 1, 'CHANGELOG.md archives entries for this file, but its header lacks "Earlier entries: see CHANGELOG.md"');
        }
    }
    r.note = `${checked} headers`;
}

function changelogArchive() {
    const map = new Map();
    if (!existsSync(path.join(ROOT, 'CHANGELOG.md'))) return map;
    read('CHANGELOG.md').split('\n').forEach((line, i) => {
        const m = /^## `([^`]+)`\s*$/.exec(line);
        if (m) map.set(m[1], i + 1);
    });
    return map;
}

/* ── Check: links ────────────────────────────────────────────────────────── */

const SKIP_URL = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\{|\$)/i;

function githubSlug(text) {
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/[`*_~]/g, (c) => (c === '_' ? '_' : ''))
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
}

const anchorCache = new Map();
function markdownAnchors(rel) {
    if (anchorCache.has(rel)) return anchorCache.get(rel);
    const seen = new Map();
    const anchors = new Set();
    let fenced = false;
    for (const line of read(rel).split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        if (fenced) continue;
        const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (!m) continue;
        const base = githubSlug(m[2]);
        const n = seen.get(base) || 0;
        seen.set(base, n + 1);
        anchors.add(n ? `${base}-${n}` : base);
    }
    anchorCache.set(rel, anchors);
    return anchors;
}

function resolveLocal(fromRel, ref) {
    const clean = ref.split('#')[0].split('?')[0];
    let decoded = clean;
    try { decoded = decodeURI(clean); } catch { /* keep raw */ }
    const target = clean.startsWith('/')
        ? path.join(ROOT, decoded)
        : path.join(ROOT, path.dirname(fromRel), decoded);
    return { target, rel: path.relative(ROOT, target).split(path.sep).join('/') };
}

function checkLinks(files, r) {
    let refs = 0;
    const verify = (rel, line, ref, kind) => {
        if (!ref || SKIP_URL.test(ref)) return;
        refs++;
        const { target, rel: targetRel } = resolveLocal(rel, ref);
        if (!existsSync(target)) { r.error(rel, line, `${kind} "${ref}" does not exist`); return; }
        const hash = ref.includes('#') ? ref.slice(ref.indexOf('#') + 1) : '';
        if (hash && /\.md$/.test(targetRel) && !markdownAnchors(targetRel).has(hash.toLowerCase())) {
            r.error(rel, line, `${kind} "${ref}" — no heading with anchor #${hash}`);
        }
    };

    for (const rel of files) {
        if (/\.html?$/.test(rel) || /\.svg$/.test(rel)) {
            const text = read(rel);
            const re = /\b(?:src|href|xlink:href|poster|data-src)\s*=\s*"([^"]*)"/g;
            let m;
            while ((m = re.exec(text))) verify(rel, lineAt(text, m.index), m[1], 'reference');
        }
        if (/\.(css|html?)$/.test(rel)) {
            const text = read(rel);
            const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
            let m;
            while ((m = re.exec(text))) verify(rel, lineAt(text, m.index), m[1].trim(), 'url()');
        }
        if (/\.md$/.test(rel)) {
            const lines = read(rel).split('\n');
            let fenced = false;
            lines.forEach((line, i) => {
                if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
                if (fenced) return;
                const stripped = line.replace(/`[^`]*`/g, '');
                const re = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
                let m;
                while ((m = re.exec(stripped))) {
                    const ref = m[1];
                    if (ref.startsWith('#')) {
                        refs++;
                        if (!markdownAnchors(rel).has(ref.slice(1).toLowerCase())) r.error(rel, i + 1, `anchor "${ref}" matches no heading`);
                    } else verify(rel, i + 1, ref, 'link');
                }
            });
        }
        if (/\.(m|c)?js$/.test(rel) && !isTestPath(rel)) {
            // Registry and navigation targets: 'tools/<id>/index.html' and friends.
            const text = read(rel);
            const re = /['"`]((?:\.\.\/)*tools\/[\w.-]+\/[\w./-]+\.html)['"`]/g;
            let m;
            while ((m = re.exec(text))) {
                refs++;
                const ref = m[1].replace(/^(\.\.\/)+/, '');
                if (!existsSync(path.join(ROOT, ref))) r.error(rel, lineAt(text, m.index), `path "${m[1]}" does not exist`);
            }
        }
    }
    r.note = `${refs} references`;
}

/* ── Check: css-vars ─────────────────────────────────────────────────────── */

function checkCssVars(files, r) {
    const defined = new Set();
    const uses = [];
    const sources = files.filter((f) => /\.(css|html?|m?js|svg)$/.test(f) && !isTestPath(f) && !f.startsWith('scripts/'));
    for (const rel of sources) {
        // Header prose may quote var(--x) as an example; only code counts.
        const raw = read(rel);
        const header = extractHeader(raw);
        const text = header
            ? `${'\n'.repeat(header.end)}${header.lines.slice(header.end).join('\n')}`
            : raw;
        let m;
        const def = /(--[A-Za-z0-9_-]+)\s*:/g;
        while ((m = def.exec(text))) defined.add(m[1]);
        const jsKey = /['"`](--[A-Za-z0-9_-]+)['"`]\s*[,:)\]]/g;
        while ((m = jsKey.exec(text))) defined.add(m[1]);
        const use = /var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g;
        while ((m = use.exec(text))) {
            if (m[2] === ')') uses.push({ rel, name: m[1], line: lineAt(text, m.index) });
        }
    }
    const reported = new Set();
    for (const u of uses) {
        if (defined.has(u.name)) continue;
        const key = `${u.rel}:${u.name}`;
        if (reported.has(key)) continue;
        reported.add(key);
        const lines = read(u.rel).split('\n');
        if (allowed(lines, u.line - 1, 'css-vars')) continue;
        r.error(u.rel, u.line, `var(${u.name}) is never defined and has no fallback`);
    }
    r.note = `${defined.size} properties defined, ${uses.length} fallback-free uses`;
}

/* ── Check: security ─────────────────────────────────────────────────────── */

const BANNED = [
    { rule: 'eval', re: /(^|[^\w.$])eval\s*\(/, msg: 'eval() runs arbitrary text as code' },
    { rule: 'eval', re: /\bnew\s+Function\s*\(/, msg: 'new Function() runs arbitrary text as code' },
    { rule: 'eval', re: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, msg: 'string timers run text as code — pass a function' },
    { rule: 'document-write', re: /\bdocument\.write(?:ln)?\s*\(/, msg: 'document.write() is never safe here' },
    { rule: 'js-url', re: /\b(?:href|src|action|formaction)\s*=\s*["']\s*javascript:/i, msg: 'javascript: URL in markup' },
    { rule: 'network', re: /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, msg: 'external script — toolMan ships no remote code' },
    { rule: 'network', re: /<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\//i, msg: 'external stylesheet / preconnect / font — toolMan works offline' },
    { rule: 'network', re: /<(?:img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|data)\s*=\s*["'](?:https?:)?\/\//i, msg: 'external media load' },
    { rule: 'network', re: /@import\s+(?:url\()?\s*['"]?(?:https?:)?\/\//i, msg: 'external CSS @import' },
    { rule: 'network', re: /url\(\s*['"]?(?:https?:)?\/\//i, msg: 'external url() load' },
    { rule: 'network', re: /\b(?:fetch|importScripts)\s*\(\s*['"`](?:https?:)?\/\//, msg: 'network request to a remote host' },
    { rule: 'network', re: /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest)\s*\(/, msg: 'network channel — toolMan makes no network requests' },
    { rule: 'network', re: /\bnavigator\.sendBeacon\s*\(/, msg: 'beacon request — toolMan sends nothing anywhere' }
];
/**
 * Find HTML sinks fed anything but a constant: innerHTML / outerHTML
 * assignments whose right-hand side is a template literal with ${…}, a
 * string concatenated with something, or a bare expression — and every
 * insertAdjacentHTML call. Constant strings ('' included) are fine.
 * Returns the character offsets of the offending assignments.
 */
function findHtmlSinks(text) {
    const hits = [];
    const re = /\b(?:innerHTML|outerHTML)\s*\+?=(?!=)\s*|\binsertAdjacentHTML\s*\(/g;
    let m;
    while ((m = re.exec(text))) {
        if (m[0].startsWith('insertAdjacentHTML')) { hits.push(m.index); continue; }
        let i = m.index + m[0].length;
        const ch = text[i];
        if (ch === '`') {
            // Scan the template literal, tracking ${ … } nesting.
            let depth = 0;
            let dynamic = false;
            for (i++; i < text.length; i++) {
                const c = text[i];
                if (c === '\\') { i++; continue; }
                if (depth === 0 && c === '`') break;
                if (c === '$' && text[i + 1] === '{') { dynamic = true; depth++; i++; continue; }
                if (depth > 0 && c === '}') depth--;
            }
            if (dynamic) hits.push(m.index);
        } else if (ch === '\'' || ch === '"') {
            for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
            const rest = text.slice(i + 1).match(/^\s*(\S)/);
            if (rest && rest[1] === '+') hits.push(m.index);
        } else {
            hits.push(m.index); // a variable or call — its content is unknowable here
        }
    }
    return hits;
}

function checkSecurity(files, r) {
    const targets = files.filter((f) => /\.(m?js|html?|css|svg)$/.test(f) && !isTestPath(f) && !f.startsWith('scripts/'));
    let sinks = 0;
    for (const rel of targets) {
        const text = read(rel);
        const header = extractHeader(text);
        const skipUntil = header ? header.end : -1;
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            if (i <= skipUntil) return;
            for (const b of BANNED) {
                if (b.re.test(line) && !allowed(lines, i, b.rule)) r.error(rel, i + 1, `${b.msg} (rule: ${b.rule})`);
            }
        });
        if (/\.m?js$/.test(rel)) {
            for (const offset of findHtmlSinks(text)) {
                const line = lineAt(text, offset);
                if (line - 1 <= skipUntil || allowed(lines, line - 1, 'html-sink')) continue;
                sinks++;
                r.warn(rel, line, 'dynamic HTML sink — never pass unescaped user data here; prefer DOM.create / textContent, or mark "check-allow: html-sink — <why it is safe>"');
            }
        }
    }
    r.note = `${targets.length} files scanned${sinks ? `, ${sinks} HTML sink(s) to review` : ''}`;
}

/* ── Check: tests ────────────────────────────────────────────────────────── */

function checkTests(files, r) {
    const tests = files.filter((f) => /(^|\/)tests\/(?:.+\/)?[^/]+\.test\.(m|c)?js$/.test(f));
    for (const rel of tests) {
        const started = Date.now();
        const res = spawnSync(process.execPath, [rel], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        if (res.status !== 0) {
            const tail = `${res.stdout || ''}${res.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
            r.error(rel, 0, `failed (${res.signal ? `killed by ${res.signal}` : `exit ${res.status}`}, ${secs}s)\n${tail}`);
        } else {
            const last = (res.stdout || '').trim().split('\n').pop() || 'passed';
            r.warnings.push({ file: rel, line: 0, message: `${last} (${secs}s)`, info: true });
        }
    }
    r.note = `${tests.length} test file(s)`;
}

/* ── Runner ──────────────────────────────────────────────────────────────── */

const CHECKS = {
    hygiene: { desc: 'UTF-8, LF endings, final newline, no merge markers', run: checkHygiene },
    syntax: { desc: 'node --check on every script', run: checkSyntax },
    headers: { desc: 'the house ✒ Metadata docstring on every owned file', run: (f, r) => checkHeaders(f, r, changelogArchive()) },
    links: { desc: 'local src/href/url()/Markdown links and anchors resolve', run: checkLinks },
    'css-vars': { desc: 'var(--x) without a fallback is defined somewhere', run: checkCssVars },
    security: { desc: 'banned APIs, no network loads, HTML sinks flagged', run: checkSecurity },
    tests: { desc: 'every tests/*.test.js unit suite passes', run: checkTests }
};

function parseArgs(argv) {
    const opts = { only: null, skip: new Set(), quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const list = () => (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (a === '--only') opts.only = new Set(list());
        else if (a === '--skip') list().forEach((s) => opts.skip.add(s));
        else if (a === '--quiet') opts.quiet = true;
        else if (a === '--list') opts.list = true;
        else if (a === '--help' || a === '-h') opts.help = true;
        else { console.error(`Unknown argument: ${a}`); opts.help = true; opts.bad = true; }
    }
    for (const name of [...(opts.only || []), ...opts.skip]) {
        if (!CHECKS[name]) { console.error(`Unknown check: ${name}`); opts.help = true; opts.bad = true; }
    }
    return opts;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        console.log('Usage: node scripts/check.mjs [--only a,b] [--skip a,b] [--quiet] [--list]');
        console.log(`Checks: ${Object.keys(CHECKS).join(', ')}`);
        process.exit(opts.bad ? 2 : 0);
    }
    if (opts.list) {
        for (const [name, c] of Object.entries(CHECKS)) console.log(`${name.padEnd(9)} ${c.desc}`);
        return;
    }

    const files = listFiles();
    let errors = 0;
    let warnings = 0;
    console.log(`toolMan repo check — ${files.length} files\n`);
    for (const [name, check] of Object.entries(CHECKS)) {
        if ((opts.only && !opts.only.has(name)) || opts.skip.has(name)) continue;
        const r = new Report(name);
        try {
            check.run(files, r);
        } catch (err) {
            r.error('', 0, `check crashed: ${err && err.stack ? err.stack : err}`);
        }
        const realWarnings = r.warnings.filter((w) => !w.info);
        errors += r.errors.length;
        warnings += realWarnings.length;
        const mark = r.errors.length ? '✗' : '✓';
        const tally = [
            r.errors.length ? `${r.errors.length} error(s)` : '',
            realWarnings.length ? `${realWarnings.length} warning(s)` : ''
        ].filter(Boolean).join(', ');
        console.log(`${mark} ${name.padEnd(9)} ${r.note}${tally ? ` — ${tally}` : ''}`);
        if (!opts.quiet) {
            for (const e of r.errors) {
                console.log(`    ✗ ${e.file}${e.line ? `:${e.line}` : ''}  ${e.message.replace(/\n/g, '\n      ')}`);
                annotate('error', e);
            }
            for (const w of r.warnings) {
                console.log(`    ${w.info ? '·' : '!'} ${w.file}${w.line ? `:${w.line}` : ''}  ${w.message}`);
                if (!w.info) annotate('warning', w);
            }
        }
    }
    console.log(`\n${errors ? `✗ ${errors} error(s)` : '✓ all checks passed'}${warnings ? `, ${warnings} warning(s)` : ''}`);
    process.exit(errors ? 1 : 0);
}

main();
