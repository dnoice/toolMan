/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LibraryUI (colorMan Edition - v1.0)
 *     - File Name: library.js
 *     - Relative Path: tools/colorman/js/ui/library.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The four Library panes in colorMan's left rail: saved palettes, saved
 *     colors, recently used colors, and the 148 named CSS colors. Each pane
 *     lists what State holds, makes any color the active color with one
 *     click, and offers the edits that belong to it (open, rename,
 *     duplicate, download, delete, import), so collecting and reusing colors
 *     happens in one place.
 *
 * ✒ Key Features:
 *     - Palettes: name/hex filter, New and Import… actions, gold-rule cards
 *       with a color bar, "6 colors · updated 2h ago", and Open, Rename,
 *       Duplicate, Download (.json), Delete (confirmed, with Undo)
 *     - The card linked to the working palette is marked "Editing", plus
 *       "unsaved" when the working copy differs
 *     - Import from pasted text or a file (.txt .css .json .gpl .hex .csv
 *       and SCSS/LESS variables): hex lists, any CSS color per line, CSS
 *       custom properties, JSON arrays or maps, CSV tables with a hex or
 *       r/g/b column (colorMan's own CSV export reads back cleanly), GIMP
 *       palettes; a live count while pasting, and a plain message when
 *       nothing is found
 *     - Values that only look like hex are refused: 100, 600, or 'face' in
 *       a stylesheet or JSON map are not colors, so a design-token file
 *       imports only its real colors and reports how many values it skipped
 *     - Drop a palette file on the Palettes pane to import it; drop an image
 *       and it goes to the working palette's image extraction
 *     - Saved Colors: filter, a "current color" row to save, rename, or
 *       remove it, a swatch grid (click to use, double-click or F2 to
 *       rename, Delete or Backspace to remove with Undo)
 *     - Recent: newest first, click to reuse without re-recording, Clear
 *       with confirmation, and an empty state that explains a disabled
 *       recorder
 *     - Named Colors: all 148 names filtered by name or hex, or the 24
 *       nearest to the active color by ΔE2000, updated live
 *     - Arrow-key movement inside every swatch grid; focus survives redraws
 *     - Selection highlights update on every color change without
 *       rebuilding the lists
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js, js/ui/swatch.js, and js/ui/working.js, before
 *     js/app.js. app.js calls LibraryUI.init() once; the module renders into
 *     #mount-palettes, #mount-swatches, #mount-history, and #mount-named and
 *     keeps them current from State events. Section counts and the Library
 *     footer belong to app.js.
 *
 * ✒ Examples:
 *     LibraryUI.init()                                    → builds all four panes
 *     LibraryUI.parseImport('#1B2A4A\n#C9A84C')           → { colors: [2 entries], format: 'text', … }
 *     LibraryUI.parseImport(':root { --gold: #C9A84C; }') → { colors: [{ hex: '#C9A84C', name: 'gold' }], format: 'css' }
 *     LibraryUI.parseImport('GIMP Palette\nName: Sea\n0 105 148 Deep') → name 'Sea', one color
 *     LibraryUI.parseImport('[{"name":"Navy","hex":"#1B2A4A"}]')    → format 'json'
 *     LibraryUI.parseImport(':root{--z:100;--gold:#C9A84C}')  → one color, skipped: 1 (unit 'value')
 *     LibraryUI.parseImport('name,hex\nnavy,#1B2A4A')        → format 'csv', named 'navy'
 *     await LibraryUI.importFile(file)                    → the new palette, or null
 *     await LibraryUI.openPalette(id)                     → true once it is in the working palette
 *     LibraryUI.setNearest(true)                          → Named Colors shows the 24 closest names
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/ui/swatch.js (SwatchUI),
 *       shared/js/dom.js, dialogs.js, toolapp.js, toolman.js, workbench.js;
 *       js/color.js for named colors, ΔE2000 and non-hex parsing;
 *       js/ui/working.js (WorkingUI) for unsaved-work checks when present
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: imports keep the first 256 colors (the palette cap);
 *       files over 1 MB are refused; Adobe .ase and other binary palette
 *       formats are not read
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const NEAREST_COUNT = 24;
    const IMPORT_MAX_BYTES = 1024 * 1024;
    const IMPORT_MAX_LINES = 5000;
    const IMPORT_EXT = /\.(txt|css|scss|sass|less|json|gpl|hex|csv)$/i;
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i;
    const COLOR_LIMIT = (window.State && State.LIMITS && State.LIMITS.colors) || 256;
    const UNDO_MS = 8000;
    const NO_COLORS_HELP = 'Paste hex codes (#C9A84C), CSS colors one per line, CSS variables (--gold: #C9A84C;), a JSON list, a CSV table with a hex column, or GIMP palette lines.';

    const FORMAT_LABELS = { json: 'JSON', gpl: 'GIMP palette', css: 'CSS variables', csv: 'CSV table', text: 'color list' };

    const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function displayHex(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function activeHex() {
        return State.hexOf(State.getActive()) || '';
    }

    function relTime(iso) {
        const ms = Date.parse(iso);
        if (!Number.isFinite(ms)) return '';
        return window.ToolApp ? ToolApp.relativeTime(ms) : new Date(ms).toLocaleDateString();
    }

    function slug(name) {
        return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'palette';
    }

    /* ── Focus that survives a redraw ──────────────────────── */

    function focusKey(root) {
        const a = document.activeElement;
        return a && root && root.contains(a) && a.dataset && a.dataset.fkey ? a.dataset.fkey : null;
    }

    function restoreFocus(root, key, fallback) {
        if (!key || !root) return;
        let el = root.querySelector(`[data-fkey="${CSS.escape(key)}"]`);
        if ((!el || el.disabled || el.hidden) && typeof fallback === 'function') el = fallback();
        if (el && typeof el.focus === 'function') el.focus({ preventScroll: false });
    }

    /** Arrow keys, Home, and End inside a CSS grid of focusable items. */
    function gridNav(e, grid, selector) {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
        const items = DOM.$$(selector, grid).filter((el) => el.offsetParent !== null);
        const i = items.indexOf(e.target);
        if (i < 0) return false;
        const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
        let j = i;
        if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        else j = i + step[e.key];
        e.preventDefault();
        if (j >= 0 && j < items.length) items[j].focus();
        return true;
    }

    /** A per-pane "… Undo" strip. */
    function makeUndo(host) {
        let timer = 0;
        const hide = () => {
            clearTimeout(timer);
            host.hidden = true;
            delete host.dataset.state;
            DOM.empty(host);
        };
        const show = (message, onUndo) => {
            hide();
            const btn = DOM.create('button', {
                className: 'btn btn-ghost btn-sm cm-undo-btn',
                text: 'Undo',
                attrs: { type: 'button', 'aria-label': `Undo: ${message}` }
            });
            DOM.on(btn, 'click', () => {
                hide();
                try { onUndo(); } catch (err) { console.error('[LibraryUI] undo failed:', err); }
            });
            host.append(DOM.create('span', { className: 'cm-undo-text', text: message }), btn);
            host.dataset.state = 'info';
            host.hidden = false;
            timer = setTimeout(hide, UNDO_MS);
        };
        hide();
        return { show, hide };
    }

    function undoHost() {
        const el = DOM.create('div', { className: 'tool-feedback cm-undo', attrs: { role: 'status' } });
        el.hidden = true;
        return el;
    }

    function filterInput(placeholder, label) {
        return DOM.create('input', {
            className: 'rail-filter lib-filter',
            attrs: {
                type: 'search',
                placeholder,
                'aria-label': label,
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off'
            }
        });
    }

    function emptyState(title, text, buttons = []) {
        const box = DOM.create('div', { className: 'empty-state lib-empty' });
        box.appendChild(DOM.create('p', { className: 'empty-title', text: title }));
        box.appendChild(DOM.create('p', { className: 'empty-text', text }));
        if (buttons.length) {
            const row = DOM.create('div', { className: 'action-buttons lib-empty-actions' });
            buttons.forEach((b) => row.appendChild(b));
            box.appendChild(row);
        }
        return box;
    }

    function btn(className, text, attrs = {}) {
        return DOM.create('button', { className, text, attrs: Object.assign({ type: 'button' }, attrs) });
    }

    /* ── Import parsing (pure) ─────────────────────────────── */

    const FN_RE = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|device-cmyk|cmyk)\(\s*[^()]*\)/gi;
    const HASH_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
    const TRIPLE_RE = /^(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s+(.+))?$/;
    const PROPERTY_WORDS = new Set([
        'color', 'background', 'background-color', 'border', 'border-color', 'fill', 'stroke',
        'outline', 'outline-color', 'caret-color', 'accent-color', 'stop-color', 'flood-color',
        'text-decoration-color', 'column-rule-color', 'box-shadow', 'text-shadow', 'value', 'hex'
    ]);

    const COLOR_FN_RE = /^(?:rgba?|hsla?|hwb|hsv|lab|lch|oklab|oklch|color|device-cmyk|cmyk)\(/i;
    const BARE_HEX_RE = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
    const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]{1,4})?$/i;

    function unquote(raw) {
        return String(raw == null ? '' : raw).trim()
            .replace(/^["'`]|["'`]$/g, '')
            .replace(/\s*!important$/i, '')
            .trim();
    }

    /** A CSS color name ("goldenrod", "dark red") or transparent; own keys only. */
    function isColorName(s) {
        if (!/^[a-z][a-z ]*$/i.test(s)) return false;
        const k = s.toLowerCase().replace(/\s+/g, '');
        if (k === 'transparent') return true;
        return Boolean(window.Color && Color.NAMED && Object.prototype.hasOwnProperty.call(Color.NAMED, k));
    }

    /**
     * A value that clearly names a color, as '#RRGGBB' / '#RRGGBBAA', or null.
     * Every mode takes '#' or 0x hex, a CSS color function, and a CSS name.
     * Bare hex without '#' depends on where the value came from:
     *   'strict' (CSS custom properties) — never: 100, 600, or 'add' there
     *            are z-indexes, weights, and words, not colors
     *   'list'   (a plain list line, a JSON list, a "hex" field or column) —
     *            6 or 8 hex digits
     *   'map'    (JSON maps, "label: value" lines) — 6 or 8 hex digits that
     *            mix digits and letters (1b2a4a), never a number or a word
     */
    function colorHex(raw, mode = 'strict') {
        const s = unquote(raw);
        if (!s || s.length > 120) return null;
        if (s.startsWith('#')) return State.hexOf(s);
        if (/^0x[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(s)) return State.hexOf(`#${s.slice(2)}`);
        if (/^[a-z-]+\(/i.test(s)) return COLOR_FN_RE.test(s) ? State.hexOf(s) : null;
        if (isColorName(s)) return State.hexOf(s);
        if (!BARE_HEX_RE.test(s)) return null;
        if (mode === 'list') return State.hexOf(`#${s}`);
        if (mode === 'map' && /\d/.test(s) && /[a-f]/i.test(s)) return State.hexOf(`#${s}`);
        return null;
    }

    function rgbHex(r, g, b, a = 1) {
        if (![r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return null;
        const alpha = Number.isFinite(a) && a >= 0 && a <= 1 ? a : 1;
        return State.hexOf({ r: r / 255, g: g / 255, b: b / 255, a: alpha });
    }

    function tidyName(s) {
        return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    function fromJson(data, out, push) {
        out.unit = 'value';
        const entry = (item, key = '', mode = 'map') => {
            if (typeof item === 'string') {
                const hex = colorHex(item, mode);
                if (hex) push(hex, key);
                else out.skipped += 1;
            } else if (Array.isArray(item)) {
                if (item.length >= 3 && item.length <= 4 && item.every((n) => typeof n === 'number')) {
                    const scale = item.slice(0, 3).some((v) => v > 1) ? 255 : 1;
                    const a = item.length === 4 ? (item[3] > 1 ? item[3] / 255 : item[3]) : 1;
                    push(State.hexOf({ r: item[0] / scale, g: item[1] / scale, b: item[2] / scale, a }), key);
                } else {
                    out.skipped += 1;
                }
            } else if (item && typeof item === 'object') {
                const field = ['hex', 'color', 'colour', 'value', 'code', 'css', 'rgb'].find((k) => typeof item[k] === 'string');
                const name = ['name', 'label', 'title'].map((k) => item[k]).find((v) => typeof v === 'string') || key;
                const hex = field ? colorHex(item[field], field === 'hex' ? 'list' : 'map') : null;
                if (hex) push(hex, name);
                else out.skipped += 1;
            } else if (item !== null && item !== undefined) {
                out.skipped += 1;
            }
        };

        // A colorMan backup file: read its palettes.
        if (data && typeof data === 'object' && !Array.isArray(data) && data.state
            && typeof data.state === 'object' && Array.isArray(data.state.palettes)) {
            data = data.state;
        }

        if (Array.isArray(data)) {
            data.forEach((item) => entry(item, '', 'list'));
            return;
        }
        if (!data || typeof data !== 'object') return;
        if (typeof data.name === 'string') out.name = data.name;
        if (Array.isArray(data.colors)) {
            data.colors.forEach((item) => entry(item, '', 'list'));
            return;
        }
        if (Array.isArray(data.palettes)) {
            // A colorMan backup or palette list: take the first palette with colors.
            const first = data.palettes.find((p) => p && Array.isArray(p.colors) && p.colors.length);
            if (first) {
                if (typeof first.name === 'string') out.name = first.name;
                first.colors.forEach((item) => entry(item, '', 'list'));
                if (data.palettes.length > 1) out.note = 'only the first palette in the file was imported';
            }
            return;
        }
        // A flat or one-level nested map: { navy: '#1B2A4A', gold: { 500: '#C9A84C' } }
        Object.keys(data).forEach((key) => {
            if (key === 'name') return;
            const v = data[key];
            if (typeof v === 'string' || Array.isArray(v)) {
                entry(v, key, 'map');
            } else if (v && typeof v === 'object') {
                if (['hex', 'color', 'value'].some((k) => typeof v[k] === 'string')) entry(v, key, 'map');
                else Object.keys(v).forEach((sub) => entry(v[sub], `${key}-${sub}`, 'map'));
            } else if (v !== null && v !== undefined) {
                out.skipped += 1;
            }
        });
    }

    /** One CSV line into trimmed cells; "quoted, fields" and "" escapes are honoured. */
    function csvCells(line, delim) {
        const cells = [];
        let cur = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (quoted) {
                if (ch === '"' && line[i + 1] === '"') {
                    cur += '"';
                    i += 1;
                } else if (ch === '"') {
                    quoted = false;
                } else {
                    cur += ch;
                }
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === delim) {
                cells.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cells.push(cur.trim());
        return cells;
    }

    const CSV_HEADS = {
        hex: ['hex', 'color', 'colour', 'code', 'css', 'value'],
        name: ['name', 'label', 'title', 'token', 'variable'],
        r: ['r', 'red'],
        g: ['g', 'green'],
        b: ['b', 'blue'],
        a: ['a', 'alpha', 'opacity']
    };

    /**
     * A CSV (or TSV / semicolon) table with a header row naming a hex or
     * r, g, b column, such as colorMan's own export (name,hex,r,g,b,a).
     * Returns false when the first line is not such a header.
     */
    function fromCsv(lines, out, push) {
        const rows = lines.map((l) => l.trim()).filter(Boolean);
        if (rows.length < 2) return false;
        const head = rows[0];
        const delim = [',', '\t', ';'].map((d) => [d, head.split(d).length - 1]).sort((x, y) => y[1] - x[1])[0];
        if (!delim[1]) return false;
        const cells = csvCells(head, delim[0]).map((c) => c.toLowerCase());
        const col = {};
        Object.keys(CSV_HEADS).forEach((k) => { col[k] = cells.findIndex((c) => CSV_HEADS[k].includes(c)); });
        const hasRgb = col.r >= 0 && col.g >= 0 && col.b >= 0;
        if (col.hex < 0 && !hasRgb) return false;

        out.unit = 'row';
        rows.slice(1).forEach((row) => {
            const v = csvCells(row, delim[0]);
            let hex = col.hex >= 0 ? colorHex(v[col.hex], 'list') : null;
            if (!hex && hasRgb) {
                const a = col.a >= 0 && v[col.a] !== '' ? Number(v[col.a]) : 1;
                hex = rgbHex(Number(v[col.r]), Number(v[col.g]), Number(v[col.b]), a);
            }
            if (hex) push(hex, col.name >= 0 ? v[col.name] : '');
            else out.skipped += 1;
        });
        return true;
    }

    function fromGpl(lines, out, push) {
        lines.forEach((raw) => {
            const line = raw.trim();
            if (!line || line.startsWith('#') || /^GIMP Palette/i.test(line) || /^Columns:/i.test(line)) return;
            const named = line.match(/^Name:\s*(.+)$/i);
            if (named) {
                out.name = named[1].trim();
                return;
            }
            const m = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/);
            const hex = m ? rgbHex(Number(m[1]), Number(m[2]), Number(m[3])) : null;
            if (!hex) {
                out.skipped += 1;
                return;
            }
            const name = (m[4] || '').trim();
            push(hex, /^untitled$/i.test(name) ? '' : name);
        });
    }

    /** The label left on a line once its one color is taken out. */
    function lineName(line, t) {
        const before = line.slice(0, t.i);
        const after = line.slice(t.i + t.s.length);
        if (/[,;\t|]/.test(`${before}${after}`)) {
            // A table row ("color-navy,#1B2A4A,27,42,74,1"): the first text field, not the numbers.
            const field = `${before}\u0000${after}`.split(/[,;\t|\u0000]/)
                .map((f) => f.replace(/^[\s"'`:=$@\-–—•*.]+|[\s"'`:=;{}()[\]<>]+$/g, ''))
                .find((f) => f && !NUMBER_RE.test(f));
            return field || '';
        }
        return `${before} ${after}`.replace(/[:=,;"'`{}()[\]<>]/g, ' ')
            .replace(/^[\s$@\-–—•*.]+|[\s\-–—•*.]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function fromLine(line, out, push) {
        const bare = line.replace(/[;,]+$/, '').trim();

        // "Navy: #1B2A4A", "--gold: …", "$gold: …", "accent = …" keep their label as the name.
        const labelled = bare.match(/^((?:--|[$@])?[A-Za-z][\w .-]{0,60}?)\s*[:=]\s*(.+)$/);
        if (labelled) {
            const variable = /^(?:--|[$@])/.test(labelled[1]);
            const hex = colorHex(labelled[2], variable ? 'strict' : 'map');
            if (hex) {
                const name = labelled[1].replace(/^(?:--|[$@])/, '').trim();
                push(hex, PROPERTY_WORDS.has(name.toLowerCase()) ? '' : name);
                return;
            }
        }

        const whole = colorHex(bare, 'list');
        if (whole) {
            push(whole);
            return;
        }

        const triple = bare.match(TRIPLE_RE);
        if (triple) {
            const hex = rgbHex(Number(triple[1]), Number(triple[2]), Number(triple[3]));
            if (hex) {
                push(hex, triple[4] || '');
                return;
            }
        }

        const tokens = [];
        for (const m of line.matchAll(FN_RE)) tokens.push({ i: m.index, s: m[0] });
        for (const m of line.matchAll(HASH_RE)) {
            if (!tokens.some((t) => m.index >= t.i && m.index < t.i + t.s.length)) tokens.push({ i: m.index, s: m[0] });
        }
        tokens.sort((a, b) => a.i - b.i);
        const found = tokens.map((t) => ({ t, hex: colorHex(t.s) })).filter((x) => x.hex);

        if (found.length === 1) {
            const { t, hex } = found[0];
            let rest = lineName(line, t);
            if (PROPERTY_WORDS.has(rest.toLowerCase()) || rest.length > 60 || !/[a-z]/i.test(rest)) rest = '';
            push(hex, rest);
            return;
        }
        if (found.length > 1) {
            found.forEach((f) => push(f.hex));
            return;
        }

        // "1B2A4A, C9A84C" or tab / pipe separated values: a plain hex list.
        const pieces = bare.split(/\s*[,;\t|]\s*/).filter(Boolean);
        let any = false;
        if (pieces.length > 1) {
            pieces.forEach((p) => {
                const hex = colorHex(p, 'list');
                if (hex) {
                    push(hex);
                    any = true;
                }
            });
        }
        if (!any) out.skipped += 1;
    }

    /**
     * Read colors out of pasted text or a file's contents.
     * Returns { name, colors: [{ hex, name }], format, skipped, unit, truncated, note }:
     * skipped counts the values, lines, or rows (unit) that held no color.
     */
    function parseImport(text, filename = '') {
        const out = { name: '', colors: [], format: 'text', skipped: 0, unit: 'line', truncated: false, note: '' };
        const src = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
        const trimmed = src.trim();
        if (!trimmed) return out;

        const push = (hex, name = '') => {
            if (!hex) return;
            if (out.colors.length >= COLOR_LIMIT) {
                out.truncated = true;
                return;
            }
            out.colors.push({ hex, name: tidyName(name) });
        };
        const restart = () => {
            out.colors = [];
            out.skipped = 0;
            out.unit = 'line';
            out.truncated = false;
            out.note = '';
        };

        if (/^[[{]/.test(trimmed)) {
            let data;
            try { data = JSON.parse(trimmed); } catch (_err) { data = undefined; }
            if (data !== undefined) {
                fromJson(data, out, push);
                out.name = tidyName(out.name);
                if (out.colors.length) {
                    out.format = 'json';
                    return out;
                }
                restart();
            }
        }

        const lines = src.split('\n').slice(0, IMPORT_MAX_LINES);

        if (/^GIMP Palette/i.test(trimmed) || /\.gpl$/i.test(filename)) {
            fromGpl(lines, out, push);
            out.name = tidyName(out.name);
            out.format = 'gpl';
            return out;
        }

        if (fromCsv(lines, out, push)) {
            if (out.colors.length) {
                out.format = 'csv';
                return out;
            }
            restart();
        }

        const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '\n');

        // In a stylesheet, custom properties are the palette; other declarations are noise.
        // A loose list (no braces) goes line by line, where "--name: value" keeps its name.
        const props = /[{}]/.test(noComments)
            ? Array.from(noComments.matchAll(/(?:^|[\s{;])--([A-Za-z0-9_-]+)\s*:\s*([^;{}\n]+)/g))
            : [];
        if (props.length) {
            out.unit = 'value';
            props.forEach((m) => {
                const hex = colorHex(m[2], 'strict');
                if (hex) push(hex, m[1]);
                else out.skipped += 1;
            });
            if (out.colors.length) {
                out.format = 'css';
                return out;
            }
            restart();
        }

        noComments.split('\n').slice(0, IMPORT_MAX_LINES).forEach((raw) => {
            let line = raw.trim();
            if (!line || /^(\/\/|;|!|--\s|<!--)/.test(line)) return;
            line = line.replace(/\s+\/\/.*$/, '').trim();
            // Selector lines ("…{") and closing braces carry no colors.
            if (!line || /\{\s*$/.test(line) || /^\}+;?$/.test(line)) return;
            fromLine(line, out, push);
        });
        return out;
    }

    /** "3 values without a color were skipped" (or "will be skipped" in a preview). */
    function skippedText(r, preview = false) {
        const n = r.skipped;
        const verb = preview ? 'will be' : (n === 1 ? 'was' : 'were');
        return `${n} ${r.unit || 'line'}${n === 1 ? '' : 's'} without a color ${verb} skipped`;
    }

    /* ── Shared library actions ────────────────────────────── */

    function workingDirty() {
        if (window.WorkingUI && typeof WorkingUI.isDirty === 'function') return WorkingUI.isDirty();
        const w = State.working();
        const pal = w.id ? State.palette(w.id) : null;
        if (!pal) return w.colors.length > 0;
        if (pal.name !== w.name || pal.colors.length !== w.colors.length) return true;
        return pal.colors.some((c, i) => c.hex !== w.colors[i].hex || c.name !== w.colors[i].name);
    }

    function confirmReplace(opts) {
        if (window.WorkingUI && typeof WorkingUI.confirmReplace === 'function') return WorkingUI.confirmReplace(opts);
        if (!workingDirty()) return Promise.resolve(true);
        return Dialogs.confirm({
            title: opts.title || 'Replace the working palette?',
            message: 'The working palette has changes that are not saved in the library. Continuing replaces them.',
            confirmLabel: opts.confirmLabel || 'Replace',
            danger: true
        });
    }

    function closeDrawerOnPhone() {
        if (window.Workbench && Workbench.isMobile && Workbench.isMobile()) Workbench.setMobileOpen(null);
    }

    /* ══════════════════════════════════════════════════════════
       PALETTES
       ══════════════════════════════════════════════════════════ */

    const P = { query: '', flashId: null };

    function paletteMatches(p, q) {
        if (!q) return true;
        if (p.name.toLowerCase().includes(q)) return true;
        const hexQ = q.replace(/^#/, '');
        return /^[0-9a-f]{2,8}$/.test(hexQ) && p.colors.some((c) => c.hex.slice(1).toLowerCase().includes(hexQ));
    }

    function paletteRow(p) {
        const n = p.colors.length;
        const row = DOM.create('article', { className: 'list-row lib-pal', data: { id: p.id } });

        const head = DOM.create('div', { className: 'row-head' });
        head.appendChild(DOM.create('h5', { className: 'row-title', text: p.name, attrs: { title: p.name } }));
        const badge = DOM.create('span', { className: 'badge lib-editing', attrs: { 'data-tone': 'brand' } });
        badge.hidden = true;
        const delLabel = `Delete ‘${p.name}’ from the library`;
        const del = DOM.create('button', {
            className: 'icon-action icon-action--danger lib-delete',
            html: TRASH_ICON,
            attrs: { type: 'button', 'data-act': 'delete', 'data-fkey': `${p.id}:delete`, 'aria-label': delLabel, title: delLabel }
        });
        head.append(badge, del);

        const strip = SwatchUI.strip(p.colors, { size: 'sm', max: 12, joined: true });
        strip.classList.add('lib-pal-strip');
        strip.title = `${p.name}: click to open it in the working palette`;
        strip.dataset.act = 'open';

        const meta = DOM.create('p', { className: 'row-meta' });
        meta.append(
            DOM.create('span', { text: `${plural(n, 'color')} · updated ` }),
            DOM.create('span', { className: 'lib-pal-time', text: relTime(p.updatedAt), data: { at: p.updatedAt } })
        );

        const actions = DOM.create('div', { className: 'row-actions' });
        const make = (act, text, label, extra = '') => btn(`row-btn${extra ? ` ${extra}` : ''}`, text, {
            'data-act': act,
            'data-fkey': `${p.id}:${act}`,
            'aria-label': label,
            title: label
        });
        actions.append(
            make('open', 'Open', `Open ‘${p.name}’ in the working palette`, 'row-btn--primary'),
            make('rename', 'Rename', `Rename ‘${p.name}’`),
            make('duplicate', 'Duplicate', `Make a copy of ‘${p.name}’`),
            make('download', 'Download', `Download ‘${p.name}’ as a .json file`)
        );

        row.append(head, strip, meta, actions);
        return row;
    }

    function syncPaletteLinks() {
        if (!P.list) return;
        const w = State.working();
        const dirty = w.id ? workingDirty() : false;
        DOM.$$('.lib-pal', P.list).forEach((row) => {
            const on = Boolean(w.id) && row.dataset.id === w.id;
            if (on) row.dataset.active = 'true';
            else delete row.dataset.active;
            const badge = DOM.$('.lib-editing', row);
            if (badge) {
                badge.hidden = !on;
                badge.textContent = on && dirty ? 'Editing · unsaved' : 'Editing';
                badge.title = on ? (dirty ? 'Open in the working palette with unsaved changes' : 'Open in the working palette') : '';
            }
        });
    }

    function applyPaletteFilter() {
        const palettes = State.palettes();
        const q = P.query;
        let shown = 0;
        const byId = new Map(palettes.map((p) => [p.id, p]));
        DOM.$$('.lib-pal', P.list).forEach((row) => {
            const p = byId.get(row.dataset.id);
            const show = Boolean(p) && paletteMatches(p, q);
            row.hidden = !show;
            if (show) shown += 1;
        });
        P.none.hidden = !(palettes.length && !shown);
        if (!P.none.hidden) P.none.textContent = `No palettes match “${P.filter.value.trim()}”.`;
    }

    function renderPalettes(payload = {}) {
        if (!P.list) return;
        const key = focusKey(P.root);
        const keyIndex = key ? DOM.$$('.lib-pal', P.list).findIndex((r) => key.startsWith(`${r.dataset.id}:`)) : -1;
        const palettes = State.palettes();

        const frag = document.createDocumentFragment();
        palettes.forEach((p) => frag.appendChild(paletteRow(p)));
        DOM.empty(P.list);
        P.list.appendChild(frag);

        P.empty.hidden = palettes.length > 0;
        P.list.hidden = palettes.length === 0;
        applyPaletteFilter();
        syncPaletteLinks();

        restoreFocus(P.root, key, () => {
            const rows = DOM.$$('.lib-pal:not([hidden])', P.list);
            const act = key ? key.split(':').pop() : 'open';
            const row = rows[Math.min(Math.max(0, keyIndex), rows.length - 1)];
            if (row) return DOM.$(`[data-act="${act === 'delete' ? 'open' : act}"].row-btn`, row) || DOM.$('.row-btn', row);
            return P.filter;
        });

        const flashActions = ['create', 'import', 'duplicate', 'restore'];
        const flashId = payload.id && flashActions.includes(payload.action) ? payload.id : P.flashId;
        P.flashId = null;
        if (flashId) {
            const row = DOM.$(`.lib-pal[data-id="${CSS.escape(flashId)}"]`, P.list);
            if (row && !row.hidden) {
                if (window.ToolApp) ToolApp.flash(row);
                requestAnimationFrame(() => row.scrollIntoView({ block: 'nearest' }));
            }
        }
    }

    function refreshTimes() {
        DOM.$$('.lib-pal-time', P.list || document.createElement('div')).forEach((el) => {
            const text = relTime(el.dataset.at);
            if (el.textContent !== text) el.textContent = text;
        });
    }

    async function openPalette(id) {
        const p = State.palette(id);
        if (!p) {
            notify('That palette no longer exists.', 'warning', 3000);
            return false;
        }
        const w = State.working();
        const dirty = workingDirty();
        if (w.id === id && !dirty) {
            notify(`‘${p.name}’ is already in the working palette`, 'info', 1800);
            closeDrawerOnPhone();
            return true;
        }
        if (dirty) {
            const same = w.id === id;
            const ok = await confirmReplace(same
                ? { title: `Reload ‘${p.name}’?`, action: `Reloading the saved ‘${p.name}’`, confirmLabel: 'Discard changes' }
                : { title: `Open ‘${p.name}’?`, action: `Opening ‘${p.name}’`, confirmLabel: 'Replace and open' });
            if (!ok) return false;
        }
        if (!State.openPalette(id)) {
            notify(State.lastError || 'Could not open that palette.', 'error', 3500);
            return false;
        }
        notify(`Opened ‘${p.name}’ in the working palette`, 'success', 1600);
        closeDrawerOnPhone();
        return true;
    }

    async function renamePalette(id) {
        const p = State.palette(id);
        if (!p) return;
        const name = await Dialogs.prompt({
            title: 'Rename palette',
            label: 'Palette name',
            value: p.name,
            confirmLabel: 'Rename',
            validate: (raw) => {
                const s = raw.trim();
                if (!s) return 'Give the palette a name.';
                if (s.length > 80) return 'Use 80 characters or fewer.';
                return null;
            }
        });
        if (name === null || name.trim() === p.name) return;
        if (State.renamePalette(id, name)) notify(`Renamed to ‘${name.trim()}’`, 'success', 1400);
        else notify('That palette no longer exists.', 'warning', 3000);
    }

    function duplicatePalette(id) {
        const copy = State.duplicatePalette(id);
        if (!copy) {
            notify(State.lastError || 'Could not copy that palette.', 'warning', 3500);
            return;
        }
        notify(`Made a copy: ‘${copy.name}’`, 'success', 1600);
    }

    function downloadPalette(id) {
        const p = State.palette(id);
        if (!p) return;
        const data = {
            name: p.name,
            colors: p.colors.map((c) => (c.name ? { name: c.name, hex: c.hex } : { hex: c.hex })),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            source: 'colorMan'
        };
        const ok = ToolApp.download(`${slug(p.name)}.json`, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
        if (ok) notify(`Downloaded ${slug(p.name)}.json`, 'success', 1600);
    }

    async function deletePalette(id) {
        const p = State.palette(id);
        if (!p) return;
        const linked = State.working().id === id;
        const ok = await Dialogs.confirm({
            title: `Delete ‘${p.name}’?`,
            message: `This removes the palette and its ${plural(p.colors.length, 'color')} from your library.${linked ? ' The working palette keeps its colors but is no longer linked to it.' : ''}\n\nYou can undo this for a few seconds afterwards.`,
            confirmLabel: 'Delete palette',
            danger: true
        });
        if (!ok) return;
        const removed = State.deletePalette(id);
        if (!removed) {
            notify('That palette was already deleted.', 'info', 2000);
            return;
        }
        notify(`Deleted ‘${removed.name}’`, 'info', 1600);
        P.undo.show(`Deleted ‘${removed.name}’.`, () => {
            const back = State.restorePalette(removed);
            if (!back) {
                notify(State.lastError || 'Could not restore the palette.', 'warning', 3500);
                return;
            }
            const w = State.working();
            if (linked && !w.id) State.setWorking(w.colors, w.name, back.id);
            notify(`Restored ‘${back.name}’`, 'success', 1400);
        });
    }

    async function newPalette() {
        const w = State.working();
        if (!w.colors.length && !w.id) {
            notify('The working palette is already empty and ready.', 'info', 1800);
        } else {
            const ok = await confirmReplace({ title: 'Start a new palette?', action: 'Starting a new palette', confirmLabel: 'Start new' });
            if (!ok) return false;
            State.clearWorking();
            notify('Started a new, empty palette', 'success', 1400);
        }
        closeDrawerOnPhone();
        if (window.WorkingUI && typeof WorkingUI.focusName === 'function') WorkingUI.focusName();
        return true;
    }

    function commitImport(r, fallbackName) {
        const pal = State.importPalette({ name: r.name || fallbackName, colors: r.colors });
        if (!pal) {
            notify(State.lastError || 'Could not import those colors.', 'error', 4000);
            return null;
        }
        if (P.query && !paletteMatches(pal, P.query)) {
            P.filter.value = '';
            P.query = '';
            applyPaletteFilter();
        }
        const extra = [];
        if (r.note) extra.push(r.note);
        if (r.truncated) extra.push(`only the first ${COLOR_LIMIT} colors were kept`);
        if (r.skipped) extra.push(skippedText(r));
        notify(`Imported ‘${pal.name}’ with ${plural(pal.colors.length, 'color')}${extra.length ? ` (${extra.join('; ')})` : ''}`, 'success', 3600);
        if (window.Workbench) Workbench.openSection('palettes');
        return pal;
    }

    async function importFile(file) {
        if (!file) return null;
        const label = file.name || 'that file';
        if ((file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(label)) {
            if (window.WorkingUI && typeof WorkingUI.fromImageFile === 'function') {
                notify('That is an image, so its colors go to the working palette.', 'info', 2200);
                await WorkingUI.fromImageFile(file);
                return null;
            }
            notify(`“${label}” is an image. Use From image… on the Working palette card.`, 'warning', 4000);
            return null;
        }
        const textish = !file.type || /^text\//.test(file.type) || /json/.test(file.type);
        if (!IMPORT_EXT.test(label) && !textish) {
            notify(`“${label}” isn't a palette file. Use a .txt, .css, .json, .gpl, or .hex file.`, 'warning', 4500);
            return null;
        }
        if (file.size > IMPORT_MAX_BYTES) {
            notify(`“${label}” is larger than 1 MB, which is too big for a palette file.`, 'warning', 4500);
            return null;
        }
        let text;
        try {
            text = await ToolApp.readFile(file, 'text');
        } catch (_err) {
            notify(`Couldn't read “${label}”. Try opening and saving it again, or paste its contents instead.`, 'error', 4500);
            return null;
        }
        const r = parseImport(text, label);
        if (!r.colors.length) {
            notify(`No colors found in “${label}”. ${NO_COLORS_HELP}`, 'warning', 6000);
            return null;
        }
        return commitImport(r, label.replace(/\.[^.]+$/, '') || 'Imported palette');
    }

    async function importPrompt() {
        let lastRaw = null;
        let lastResult = null;
        const parse = (raw) => {
            if (raw !== lastRaw) {
                lastRaw = raw;
                lastResult = parseImport(raw);
            }
            return lastResult;
        };
        const baseHint = 'Hex codes, any CSS color one per line, CSS variables, a JSON list, a CSV table, or GIMP .gpl lines. Ctrl + Enter imports.';
        const pending = Dialogs.prompt({
            title: 'Import a palette',
            label: 'Paste colors',
            multiline: true,
            rows: 8,
            placeholder: '#1B2A4A\n#C9A84C Identity gold\n--accent: oklch(0.74 0.12 86);\nrgb(245 240 232)',
            hint: baseHint,
            confirmLabel: 'Import',
            validate: (raw) => {
                if (!raw.trim()) return 'Paste some colors first, or choose a file.';
                return parse(raw).colors.length ? null : `No colors found. ${NO_COLORS_HELP}`;
            }
        });

        // Dialogs builds the prompt synchronously: add a file option and a live count.
        const modal = DOM.id('modal-prompt');
        if (modal) {
            const footer = DOM.$('.modal-footer', modal);
            const field = DOM.$('#prompt-input', modal);
            const hint = DOM.$('.help-text', modal);
            if (footer) {
                const choose = btn('btn btn-ghost lib-import-file', 'Choose a file…', {
                    title: 'Import a .txt, .css, .json, .gpl, or .hex file instead'
                });
                DOM.on(choose, 'click', () => P.file.click());
                footer.prepend(choose);
            }
            if (field && hint) {
                DOM.on(field, 'input', DOM.debounce(() => {
                    if (!field.value.trim()) {
                        hint.textContent = baseHint;
                        return;
                    }
                    const r = parse(field.value);
                    const skipped = r.skipped ? `; ${skippedText(r, true)}` : '';
                    hint.textContent = r.colors.length
                        ? `Found ${plural(r.colors.length, 'color')} (${FORMAT_LABELS[r.format] || 'color list'}${skipped}). Ctrl + Enter imports.`
                        : 'No colors found yet. Hex codes, CSS colors, CSS variables, JSON, CSV, or GIMP lines work.';
                }, 150));
            }
        }

        const raw = await pending;
        if (raw === null) return null;
        return commitImport(parse(raw), 'Pasted palette');
    }

    function buildPalettes() {
        const root = DOM.id('mount-palettes');
        if (!root) return;
        P.root = root;
        DOM.empty(root);

        const bar = DOM.create('div', { className: 'lib-bar' });
        P.filter = filterInput('Name or hex', 'Filter palettes by name or by a hex code they contain');
        const actions = DOM.create('div', { className: 'section-actions lib-actions' });
        P.newBtn = btn('btn btn-secondary btn-sm', 'New', { title: 'Start a new, empty working palette', 'data-fkey': 'new' });
        P.importBtn = btn('btn btn-secondary btn-sm', 'Import…', {
            title: 'Import colors from pasted text or a .txt, .css, .json, .gpl, or .hex file',
            'data-fkey': 'import'
        });
        actions.append(P.newBtn, P.importBtn);
        bar.append(P.filter, actions);

        P.list = DOM.create('div', { className: 'list lib-pal-list', attrs: { 'aria-label': 'Saved palettes' } });
        P.none = DOM.create('p', { className: 'lib-none' });
        P.none.hidden = true;

        const emptyImport = btn('btn btn-secondary btn-sm', 'Import…');
        const emptyNew = btn('btn btn-primary btn-sm', 'Start a palette');
        P.empty = emptyState(
            'No palettes yet',
            'Build colors in the working palette and save them, or import a palette from a file or pasted text.',
            [emptyNew, emptyImport]
        );
        P.empty.hidden = true;

        P.undoEl = undoHost();
        P.undo = makeUndo(P.undoEl);

        P.file = DOM.create('input', {
            className: 'cm-file',
            attrs: {
                type: 'file',
                accept: '.txt,.css,.scss,.less,.json,.gpl,.hex,.csv,text/plain,text/css,application/json',
                tabindex: '-1',
                'aria-hidden': 'true'
            }
        });

        root.append(bar, P.undoEl, P.list, P.none, P.empty, P.file);

        DOM.on(P.filter, 'input', () => {
            P.query = P.filter.value.trim().toLowerCase();
            applyPaletteFilter();
        });
        DOM.on(P.newBtn, 'click', () => newPalette());
        DOM.on(emptyNew, 'click', () => newPalette());
        DOM.on(P.importBtn, 'click', () => importPrompt());
        DOM.on(emptyImport, 'click', () => importPrompt());
        DOM.on(P.file, 'change', async () => {
            const file = P.file.files && P.file.files[0];
            P.file.value = '';
            if (!file) return;
            if (window.Dialogs && Dialogs.activeModal && Dialogs.activeModal.id === 'modal-prompt') Dialogs.closeActive();
            await importFile(file);
        });

        DOM.delegate(P.list, 'click', '[data-act]', (e, el) => {
            const row = el.closest('.lib-pal');
            if (!row) return;
            const id = row.dataset.id;
            switch (el.dataset.act) {
                case 'open': openPalette(id); break;
                case 'rename': renamePalette(id); break;
                case 'duplicate': duplicatePalette(id); break;
                case 'download': downloadPalette(id); break;
                case 'delete': deletePalette(id); break;
                default: break;
            }
        });
        DOM.delegate(P.list, 'dblclick', '.row-title', (e, el) => {
            const row = el.closest('.lib-pal');
            if (row) renamePalette(row.dataset.id);
        });

        // Drop a palette file (or an image) on the pane.
        const isFileDrag = (e) => Boolean(e.dataTransfer) && Array.from(e.dataTransfer.types || []).includes('Files');
        DOM.on(root, 'dragover', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            root.dataset.drop = 'file';
        });
        DOM.on(root, 'dragleave', (e) => {
            if (!root.contains(e.relatedTarget)) delete root.dataset.drop;
        });
        DOM.on(root, 'drop', (e) => {
            delete root.dataset.drop;
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) importFile(file);
        });
    }

    /* ══════════════════════════════════════════════════════════
       SAVED COLORS
       ══════════════════════════════════════════════════════════ */

    const S = { query: '' };

    function swatchMatches(sw, q) {
        if (!q) return true;
        const hexQ = q.replace(/^#/, '');
        return sw.name.toLowerCase().includes(q) || sw.hex.toLowerCase().includes(q)
            || (hexQ !== '' && sw.hex.slice(1).toLowerCase().includes(hexQ));
    }

    function swatchTitle(sw) {
        const hex = displayHex(sw.hex);
        return `${sw.name ? `${sw.name} · ` : ''}${hex} — click to use, double-click or F2 to rename, Delete to remove`;
    }

    function renderSwatches() {
        if (!S.grid) return;
        const key = focusKey(S.grid);
        const keyIndex = key ? DOM.$$('.swatch', S.grid).findIndex((el) => el.dataset.fkey === key) : -1;
        const all = State.swatches();
        const shown = all.filter((sw) => swatchMatches(sw, S.query));
        const active = activeHex();

        const frag = document.createDocumentFragment();
        shown.forEach((sw) => {
            frag.appendChild(SwatchUI.create({
                hex: sw.hex,
                name: sw.name,
                selected: sw.hex === active,
                ariaLabel: `${sw.name ? `${sw.name}, ` : ''}${displayHex(sw.hex)}`,
                title: swatchTitle(sw),
                attrs: { 'data-id': sw.id, 'data-fkey': `sw:${sw.id}`, 'aria-keyshortcuts': 'F2 Delete' }
            }));
        });
        DOM.empty(S.grid);
        S.grid.appendChild(frag);

        S.grid.hidden = shown.length === 0;
        S.empty.hidden = all.length > 0;
        S.filterWrap.hidden = all.length === 0;
        S.none.hidden = !(all.length && !shown.length);
        if (!S.none.hidden) S.none.textContent = `No saved colors match “${S.filter.value.trim()}”.`;
        S.hint.hidden = shown.length === 0;
        syncCurrent();

        restoreFocus(S.grid, key, () => {
            const items = DOM.$$('.swatch', S.grid);
            return items[Math.min(Math.max(0, keyIndex), items.length - 1)]
                || [S.save, S.rename, S.filter].find((el) => !el.hidden && !el.closest('[hidden]'));
        });
    }

    /** The "current color" row: save it, or rename / remove it when already saved. */
    function syncCurrent() {
        if (!S.current) return;
        const color = State.getActive();
        const hex = State.hexOf(color) || '';
        const saved = State.swatches().find((s) => s.hex === hex) || null;
        const shown = displayHex(hex);

        S.chip.style.setProperty('--c', hex);
        S.chipName.textContent = saved ? (saved.name || 'Saved color') : 'Current color';
        S.chipHex.textContent = shown;
        S.current.dataset.saved = String(Boolean(saved));
        S.current.title = saved ? `${shown} is in Saved Colors` : `${shown} is not saved yet`;

        // Hiding a focused button drops focus at once, so remember it first.
        const focused = S.current.contains(document.activeElement) ? document.activeElement : null;
        S.save.hidden = Boolean(saved);
        S.rename.hidden = !saved;
        S.remove.hidden = !saved;
        S.save.setAttribute('aria-label', `Save the current color ${shown}`);
        S.rename.setAttribute('aria-label', `Rename the saved color ${shown}`);
        S.remove.setAttribute('aria-label', `Remove ${shown} from Saved Colors`);
        // Keep the keyboard in the row when its buttons swap.
        if (focused && focused.hidden) (saved ? S.rename : S.save).focus();
    }

    function updateSwatchSelection(active) {
        if (!S.grid) return;
        DOM.$$('.swatch', S.grid).forEach((el) => {
            const on = el.dataset.hex === active;
            if ((el.dataset.selected === 'true') !== on) SwatchUI.update(el, { selected: on });
        });
    }

    async function renameSwatch(id) {
        const sw = State.swatches().find((s) => s.id === id);
        if (!sw) return;
        let suggestion = '';
        if (window.Color && typeof Color.nearestName === 'function') {
            try {
                const near = Color.nearestName(Color.parse(sw.hex));
                if (near) suggestion = near.name;
            } catch (_err) { /* no hint */ }
        }
        const name = await Dialogs.prompt({
            title: 'Name this color',
            label: 'Color name',
            value: sw.name,
            placeholder: suggestion ? `e.g. ${suggestion}` : 'e.g. Brand gold',
            hint: `${displayHex(sw.hex)}${suggestion ? ` · closest CSS name: ${suggestion}` : ''}. Leave empty to show only the hex code.`,
            confirmLabel: 'Save name',
            validate: (raw) => (raw.trim().length > 80 ? 'Use 80 characters or fewer.' : null)
        });
        if (name === null || name.trim() === sw.name) return;
        if (State.renameSwatch(id, name)) {
            notify(name.trim() ? `Named ${displayHex(sw.hex)} “${name.trim()}”` : `Removed the name from ${displayHex(sw.hex)}`, 'success', 1400);
        }
    }

    function removeSwatch(id) {
        const removed = State.removeSwatch(id);
        if (!removed) return;
        const label = `${removed.name ? `${removed.name} ` : ''}${displayHex(removed.hex)}`;
        notify(`Removed ${label} from Saved Colors`, 'info', 1600);
        S.undo.show(`Removed ${label}.`, () => {
            if (State.restoreSwatch(removed)) notify(`Put ${label} back in Saved Colors`, 'success', 1400);
            else notify(State.lastError || 'Could not restore the color.', 'warning', 3500);
        });
    }

    function saveCurrent() {
        const hex = State.hexOf(State.getActive());
        if (!hex) return;
        if (State.hasSwatch(hex)) {
            notify(`${displayHex(hex)} is already saved`, 'info', 1400);
            return;
        }
        const sw = State.addSwatch(hex);
        if (sw) notify(`Saved ${displayHex(hex)}`, 'success', 1400);
        else notify(State.lastError || 'Could not save this color.', 'warning', 3500);
    }

    function buildSwatches() {
        const root = DOM.id('mount-swatches');
        if (!root) return;
        S.root = root;
        DOM.empty(root);

        S.filterWrap = DOM.create('div', { className: 'lib-bar' });
        S.filter = filterInput('Filter by name or hex', 'Filter saved colors by name or hex');
        S.filterWrap.appendChild(S.filter);

        S.current = DOM.create('div', { className: 'lib-current', attrs: { role: 'group', 'aria-label': 'Current color' } });
        S.chip = DOM.create('span', { className: 'swatch swatch--sm lib-current-chip', attrs: { 'aria-hidden': 'true' } });
        const text = DOM.create('span', { className: 'lib-current-text' });
        S.chipName = DOM.create('span', { className: 'lib-current-name' });
        S.chipHex = DOM.create('code', { className: 'lib-current-hex' });
        text.append(S.chipName, S.chipHex);
        const acts = DOM.create('span', { className: 'lib-current-actions' });
        S.save = btn('row-btn row-btn--primary', 'Save current color', { title: 'Save the current color (F)', 'data-fkey': 'save' });
        S.rename = btn('row-btn', 'Rename', { title: 'Rename this saved color (F2 on its swatch)', 'data-fkey': 'rename' });
        S.remove = btn('row-btn row-btn--danger', 'Remove', { title: 'Remove this color from Saved Colors', 'data-fkey': 'remove' });
        acts.append(S.save, S.rename, S.remove);
        S.current.append(S.chip, text, acts);

        S.undoEl = undoHost();
        S.undo = makeUndo(S.undoEl);

        S.grid = DOM.create('div', { className: 'swatch-grid lib-grid', attrs: { role: 'group', 'aria-label': 'Saved colors' } });
        S.hint = DOM.create('p', { className: 'pane-hint lib-hint', text: 'Click to use · double-click or F2 to rename · Delete removes' });
        S.none = DOM.create('p', { className: 'lib-none' });
        S.none.hidden = true;
        S.empty = emptyState('No saved colors yet', 'Star a color (F) to keep it here.');
        S.empty.hidden = true;

        root.append(S.current, S.filterWrap, S.undoEl, S.grid, S.none, S.hint, S.empty);

        DOM.on(S.filter, 'input', () => {
            S.query = S.filter.value.trim().toLowerCase();
            renderSwatches();
        });
        DOM.on(S.save, 'click', saveCurrent);
        DOM.on(S.rename, 'click', () => {
            const saved = State.swatches().find((s) => s.hex === activeHex());
            if (saved) renameSwatch(saved.id);
        });
        DOM.on(S.remove, 'click', () => {
            const saved = State.swatches().find((s) => s.hex === activeHex());
            if (saved) {
                removeSwatch(saved.id);
                S.save.focus();
            }
        });

        DOM.delegate(S.grid, 'click', '.swatch', (e, el) => State.setActive(el.dataset.hex, { source: 'swatch' }));
        DOM.delegate(S.grid, 'dblclick', '.swatch', (e, el) => renameSwatch(el.dataset.id));
        DOM.on(S.grid, 'keydown', (e) => {
            const el = e.target.closest && e.target.closest('.swatch');
            if (!el) return;
            if (gridNav(e, S.grid, '.swatch')) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                removeSwatch(el.dataset.id);
            } else if (e.key === 'F2') {
                e.preventDefault();
                renameSwatch(el.dataset.id);
            }
        });
    }

    /* ══════════════════════════════════════════════════════════
       RECENT
       ══════════════════════════════════════════════════════════ */

    const H = {};

    function renderHistory() {
        if (!H.grid) return;
        const key = focusKey(H.grid);
        const list = State.history();
        const active = activeHex();
        const recording = State.settings().recordHistory;

        const frag = document.createDocumentFragment();
        list.forEach((hex, i) => {
            frag.appendChild(SwatchUI.create({
                hex,
                selected: hex === active,
                ariaLabel: `${displayHex(hex)}, ${i === 0 ? 'most recent' : `${i + 1} back`}`,
                title: `${displayHex(hex)} — click to use`,
                attrs: { 'data-fkey': `h:${hex}` }
            }));
        });
        DOM.empty(H.grid);
        H.grid.appendChild(frag);

        H.grid.hidden = list.length === 0;
        H.bar.hidden = list.length === 0;
        H.note.textContent = recording
            ? `Newest first · up to ${State.settings().historySize}`
            : 'Recording is off';
        H.note.title = recording
            ? `Newest first. Keeps up to ${State.settings().historySize} colors (change this in Settings).`
            : 'Recording is off, so these stay until you clear them. Turn it on in Settings.';
        H.empty.hidden = list.length > 0;
        H.emptyTitle.textContent = recording ? 'No recent colors yet' : 'Recording is off';
        H.emptyText.textContent = recording
            ? 'Colors you settle on for about a second show up here, newest first.'
            : 'Turn on “Record recent colors” in Settings to keep a trail of the colors you use.';
        H.settingsBtn.hidden = recording;

        restoreFocus(H.grid, key, () => DOM.$('.swatch', H.grid) || H.clear);
    }

    function updateHistorySelection(active) {
        if (!H.grid) return;
        DOM.$$('.swatch', H.grid).forEach((el) => {
            const on = el.dataset.hex === active;
            if ((el.dataset.selected === 'true') !== on) SwatchUI.update(el, { selected: on });
        });
    }

    function buildHistory() {
        const root = DOM.id('mount-history');
        if (!root) return;
        H.root = root;
        DOM.empty(root);

        H.bar = DOM.create('div', { className: 'lib-bar lib-bar--split' });
        H.note = DOM.create('p', { className: 'pane-hint lib-hint' });
        H.clear = btn('row-btn row-btn--danger', 'Clear', { title: 'Remove every recent color', 'aria-label': 'Clear recent colors' });
        H.bar.append(H.note, H.clear);

        H.grid = DOM.create('div', { className: 'swatch-grid lib-grid', attrs: { role: 'group', 'aria-label': 'Recent colors, newest first' } });

        H.settingsBtn = btn('btn btn-secondary btn-sm', 'Open Settings');
        H.empty = emptyState('No recent colors yet', '', [H.settingsBtn]);
        H.emptyTitle = DOM.$('.empty-title', H.empty);
        H.emptyText = DOM.$('.empty-text', H.empty);

        root.append(H.bar, H.grid, H.empty);

        DOM.on(H.clear, 'click', async () => {
            const n = State.history().length;
            if (!n) return;
            const ok = await Dialogs.confirm({
                title: 'Clear recent colors?',
                message: `This removes all ${plural(n, 'recent color')}. Saved colors and palettes are not affected.`,
                confirmLabel: 'Clear recent colors',
                danger: true
            });
            if (!ok) return;
            State.clearHistory();
            // The Clear button hides with the list: keep the keyboard on the pane's header.
            const section = root.closest('.tool-section');
            const header = section ? DOM.$('.tool-header', section) : null;
            if (header) header.focus();
            notify('Cleared recent colors', 'info', 1400);
        });
        DOM.on(H.settingsBtn, 'click', () => Dialogs.open('modal-settings'));
        DOM.delegate(H.grid, 'click', '.swatch', (e, el) => {
            State.setActive(el.dataset.hex, { source: 'history', record: false });
        });
        DOM.on(H.grid, 'keydown', (e) => gridNav(e, H.grid, '.swatch'));
    }

    /* ══════════════════════════════════════════════════════════
       NAMED COLORS
       ══════════════════════════════════════════════════════════ */

    const N = { query: '', nearest: false, rowsByHex: new Map(), labs: null, frame: 0 };

    function namedEntries() {
        const named = (window.Color && Color.NAMED) || {};
        return Object.keys(named).sort().map((name) => ({ name, hex: named[name].toUpperCase() }));
    }

    function namedMatches(e, q) {
        if (!q) return true;
        const compact = q.replace(/\s+/g, '');
        const hexQ = q.replace(/^#/, '');
        return e.name.includes(compact) || e.hex.toLowerCase().includes(q) || (hexQ !== '' && e.hex.slice(1).toLowerCase().includes(hexQ));
    }

    function namedRow(e, deltaE) {
        const li = DOM.create('li', { className: 'lib-named-item', data: { name: e.name } });
        const b = DOM.create('button', {
            className: 'lib-named-row',
            attrs: { type: 'button', 'data-fkey': `n:${e.name}`, 'data-hex': e.hex },
            data: { hex: e.hex }
        });
        const chip = DOM.create('span', { className: 'swatch swatch--sm', attrs: { 'aria-hidden': 'true' } });
        chip.style.setProperty('--c', e.hex);
        chip.style.setProperty('--on', SwatchUI.textOn(e.hex));
        const hex = displayHex(e.hex);
        b.append(
            chip,
            DOM.create('span', { className: 'lib-named-name', text: e.name }),
            DOM.create('code', { className: 'lib-named-hex', text: hex })
        );
        let label = `${e.name}, ${hex}`;
        if (typeof deltaE === 'number') {
            const de = deltaE < 0.05 ? 'exact' : `ΔE ${deltaE.toFixed(1)}`;
            b.appendChild(DOM.create('span', {
                className: 'lib-named-de',
                text: de,
                attrs: { title: deltaE < 0.05 ? 'Same color as the current color' : 'Color difference (CIEDE2000). Under 1 is hard to see; under 3 is close.' }
            }));
            label += deltaE < 0.05 ? ', exact match' : `, difference ${deltaE.toFixed(1)}`;
        }
        b.setAttribute('aria-label', `${label} — make it the current color`);
        b.title = `${e.name} · ${hex} — click to use`;
        li.appendChild(b);
        return li;
    }

    function markNamedActive(active) {
        if (!N.list) return;
        DOM.$$('.lib-named-row[data-active="true"]', N.list).forEach((b) => {
            delete b.dataset.active;
            b.removeAttribute('aria-current');
        });
        DOM.$$(`.lib-named-row[data-hex="${active}"]`, N.list).forEach((b) => {
            b.dataset.active = 'true';
            b.setAttribute('aria-current', 'true');
        });
    }

    function renderNamedAll() {
        const key = focusKey(N.list);
        const frag = document.createDocumentFragment();
        N.entries.forEach((e) => frag.appendChild(namedRow(e)));
        DOM.empty(N.list);
        N.list.appendChild(frag);
        applyNamedFilter();
        markNamedActive(activeHex());
        restoreFocus(N.list, key, () => DOM.$('.lib-named-item:not([hidden]) .lib-named-row', N.list));
    }

    function applyNamedFilter() {
        const q = N.query;
        let shown = 0;
        DOM.$$('.lib-named-item', N.list).forEach((li) => {
            const e = { name: li.dataset.name, hex: DOM.$('.lib-named-row', li).dataset.hex };
            const on = namedMatches(e, q);
            li.hidden = !on;
            if (on) shown += 1;
        });
        N.note.textContent = q ? `${shown} of ${N.entries.length} names` : `${N.entries.length} CSS names`;
        N.none.hidden = shown > 0;
        if (!N.none.hidden) N.none.textContent = `No named colors match “${N.filter.value.trim()}”.`;
    }

    function namedLabs() {
        if (N.labs) return N.labs;
        N.labs = N.entries.map((e) => {
            const lab = Color.toLab(Color.parse(e.hex));
            return { e, lab: [lab.l, lab.a, lab.b] };
        });
        return N.labs;
    }

    function renderNamedNearest() {
        if (!window.Color || typeof Color.deltaE2000Lab !== 'function') {
            N.note.textContent = 'Nearest names need the color engine, which did not load.';
            return;
        }
        const key = focusKey(N.list);
        const active = State.getActive();
        const lab = Color.toLab(active);
        const target = [lab.l, lab.a, lab.b];
        const ranked = namedLabs()
            .filter((x) => namedMatches(x.e, N.query))
            .map((x) => ({ e: x.e, d: Color.deltaE2000Lab(target, x.lab) }))
            .sort((a, b) => a.d - b.d || a.e.name.localeCompare(b.e.name))
            .slice(0, NEAREST_COUNT);

        const frag = document.createDocumentFragment();
        ranked.forEach((r) => frag.appendChild(namedRow(r.e, r.d)));
        DOM.empty(N.list);
        N.list.appendChild(frag);
        markNamedActive(activeHex());

        const shownHex = displayHex(activeHex());
        N.note.textContent = ranked.length
            ? `${ranked.length} closest to ${shownHex}${N.query ? ' among matches' : ''}`
            : '';
        N.none.hidden = ranked.length > 0;
        if (!N.none.hidden) N.none.textContent = `No named colors match “${N.filter.value.trim()}”.`;
        restoreFocus(N.list, key, () => DOM.$('.lib-named-row', N.list));
    }

    function renderNamed() {
        if (!N.list) return;
        N.toggle.setAttribute('aria-pressed', String(N.nearest));
        N.list.setAttribute('aria-label', N.nearest ? 'Named colors closest to the current color' : 'Named CSS colors');
        if (N.nearest) renderNamedNearest();
        else renderNamedAll();
    }

    function setNearest(on) {
        N.nearest = Boolean(on);
        State.setPane('library', { namedNearest: N.nearest });
        renderNamed();
    }

    function buildNamed() {
        const root = DOM.id('mount-named');
        if (!root) return;
        N.root = root;
        DOM.empty(root);
        N.entries = namedEntries();
        if (!N.entries.length) {
            root.appendChild(emptyState('Named colors unavailable', 'The color engine did not load, so the CSS names cannot be listed. Reload the page to try again.'));
            return;
        }

        const bar = DOM.create('div', { className: 'lib-bar' });
        N.filter = filterInput('Filter by name or hex', 'Filter named colors by name or hex');
        bar.appendChild(N.filter);

        const chips = DOM.create('div', { className: 'chip-row lib-chip-row' });
        N.toggle = btn('chip-btn', 'Nearest to current', {
            'aria-pressed': 'false',
            title: 'List the 24 named colors closest to the current color (CIEDE2000)'
        });
        N.note = DOM.create('span', { className: 'lib-note', attrs: { 'aria-live': 'polite' } });
        chips.append(N.toggle, N.note);

        N.list = DOM.create('ul', { className: 'lib-named-list', attrs: { 'aria-label': 'Named CSS colors' } });
        N.none = DOM.create('p', { className: 'lib-none' });
        N.none.hidden = true;

        root.append(bar, chips, N.list, N.none);

        const pref = State.pane('library');
        N.nearest = Boolean(pref.namedNearest);

        DOM.on(N.filter, 'input', () => {
            N.query = N.filter.value.trim().toLowerCase();
            if (N.nearest) renderNamedNearest();
            else applyNamedFilter();
        });
        DOM.on(N.toggle, 'click', () => setNearest(!N.nearest));
        DOM.delegate(N.list, 'click', '.lib-named-row', (e, b) => {
            State.setActive(b.dataset.hex, { source: 'named' });
        });
        DOM.on(N.list, 'keydown', (e) => {
            if (!e.target.classList || !e.target.classList.contains('lib-named-row')) return;
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
            const rows = DOM.$$('.lib-named-item:not([hidden]) .lib-named-row', N.list);
            const i = rows.indexOf(e.target);
            if (i < 0) return;
            e.preventDefault();
            let j = i;
            if (e.key === 'ArrowDown') j = Math.min(rows.length - 1, i + 1);
            else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
            else if (e.key === 'Home') j = 0;
            else j = rows.length - 1;
            rows[j].focus();
        });

        renderNamed();
    }

    function scheduleNearest() {
        if (!N.nearest || N.frame) return;
        N.frame = requestAnimationFrame(() => {
            N.frame = 0;
            renderNamedNearest();
        });
    }

    /* ══════════════════════════════════════════════════════════
       EVENTS + PUBLIC API
       ══════════════════════════════════════════════════════════ */

    let selectionFrame = 0;

    function onActive() {
        if (selectionFrame) return;
        selectionFrame = requestAnimationFrame(() => {
            selectionFrame = 0;
            const active = activeHex();
            updateSwatchSelection(active);
            updateHistorySelection(active);
            syncCurrent();
            if (N.nearest) renderNamedNearest();
            else markNamedActive(active);
        });
    }

    function renderAll() {
        renderPalettes();
        renderSwatches();
        renderHistory();
        renderNamed();
    }

    const LibraryUI = {
        init() {
            buildPalettes();
            buildSwatches();
            buildHistory();
            buildNamed();

            State.on('library', (payload = {}) => {
                if (!payload.kind || payload.kind === 'palettes') renderPalettes(payload);
                if (!payload.kind || payload.kind === 'swatches') renderSwatches();
            });
            State.on('working', () => syncPaletteLinks());
            State.on('history', () => renderHistory());
            State.on('active', onActive);
            State.on('settings', (payload = {}) => {
                const changed = payload.changed || [];
                if (!payload.changed || changed.includes('hexUpper')) {
                    renderSwatches();
                    renderHistory();
                    renderNamed();
                } else if (changed.includes('recordHistory') || changed.includes('historySize')) {
                    renderHistory();
                }
            });
            State.on('reset', () => {
                [P, S, N].forEach((pane) => {
                    if (pane.filter) pane.filter.value = '';
                    pane.query = '';
                });
                if (P.undo) P.undo.hide();
                if (S.undo) S.undo.hide();
                N.nearest = Boolean(State.pane('library').namedNearest);
                renderAll();
            });

            renderPalettes();
            renderSwatches();
            renderHistory();
            setInterval(refreshTimes, 60000);
        },

        render: renderAll,
        parseImport,
        importFile,
        importText(text, name) {
            const r = parseImport(text);
            if (!r.colors.length) {
                notify(`No colors found. ${NO_COLORS_HELP}`, 'warning', 5000);
                return null;
            }
            return commitImport(r, name || 'Pasted palette');
        },
        importPrompt,
        openPalette,
        newPalette,
        setNearest,
        focusFilter(pane = 'palettes') {
            const map = { palettes: P, swatches: S, named: N };
            const target = map[pane] && map[pane].filter;
            if (target) target.focus();
        }
    };

    window.LibraryUI = LibraryUI;
})();
