/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ExportUI (colorMan Edition - v1.0)
 *     - File Name: export.js
 *     - Relative Path: tools/colorman/js/ui/export.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Export pane in the Tools rail: it turns the working palette or the
 *     saved colors into code and files for other tools. Pick a format and a
 *     naming style, check the live preview, then copy the text or download
 *     a file named after the palette.
 *
 * ✒ Key Features:
 *     - Source chips: Working palette or Saved colors (arrow keys switch)
 *     - Ten formats: CSS custom properties, SCSS variables, Less variables,
 *       Tailwind theme colors (a tailwind.config.js module), JSON (name,
 *       hex, rgb, oklch), plain HEX list, CSV (name, hex, r, g, b, a), GIMP
 *       palette (.gpl), SVG swatches, and a PNG strip (download only)
 *     - Names: numbered, the colors' own names, or the nearest CSS color
 *       names; duplicates get -2, -3 so every name is unique
 *     - Prefix field that starts from Settings → Export name prefix and is
 *       cleaned into a valid identifier, with a note when it was changed
 *     - Include-alpha switch: translucent colors keep or drop their alpha
 *     - Live preview in a scrollable code block (an image for PNG)
 *     - Copy (text formats) and Download with the right extension and type;
 *       file names come from the palette name, made URL-safe
 *     - Hex case follows Settings → Uppercase hex; OKLCH decimals follow
 *       Settings → Decimal places
 *     - Empty-source message with a one-click switch to the other source
 *     - Pane choices persist per browser via State.pane('export')
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js, before
 *     js/app.js. app.js calls ExportUI.init() once; the module renders into
 *     #mount-export and refreshes on State 'working', 'library', 'settings',
 *     and 'reset' events.
 *
 * ✒ Examples:
 *     ExportUI.init()                           → builds the pane inside #mount-export
 *     ExportUI.output()                         → { text, filename, mime, count } for the current choices
 *     ExportUI.output({ format: 'scss' }).text  → "$color-1: #1B2A4A;\n…"
 *     ExportUI.output({ names: 'nearest' })     → names such as color-midnightblue
 *     ExportUI.sanitizePrefix('My Brand!')      → 'My-Brand'
 *     ExportUI.slugify('toolMan House')         → 'toolman-house'
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/ui/swatch.js (SwatchUI.textOn),
 *       js/color.js (Color.format, Color.nearestName), shared/js/dom.js,
 *       toolapp.js, toolman.js; css/tools-b.css
 *     - Compatible platforms: all evergreen browsers (PNG needs <canvas>)
 *     - Limitations: GIMP palettes cannot store alpha; the PNG strip wraps
 *       after 16 colors per row; without js/color.js the JSON oklch field is
 *       empty and nearest names fall back to numbers
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'export';
    const CELL = 96;
    const PER_ROW = 16;

    const SOURCES = [
        { id: 'working', label: 'Working palette', title: 'Export the colors in the working palette' },
        { id: 'swatches', label: 'Saved colors', title: 'Export your saved (starred) colors' }
    ];
    const FORMATS = [
        { id: 'css', label: 'CSS custom properties', ext: 'css', mime: 'text/css' },
        { id: 'scss', label: 'SCSS variables', ext: 'scss', mime: 'text/x-scss' },
        { id: 'less', label: 'Less variables', ext: 'less', mime: 'text/x-less' },
        { id: 'tailwind', label: 'Tailwind theme colors (JS)', ext: 'tailwind.js', mime: 'text/javascript' },
        { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
        { id: 'hex', label: 'Plain HEX list', ext: 'txt', mime: 'text/plain' },
        { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv' },
        { id: 'gpl', label: 'GIMP palette (.gpl)', ext: 'gpl', mime: 'text/plain' },
        { id: 'svg', label: 'SVG swatches', ext: 'svg', mime: 'image/svg+xml' },
        { id: 'png', label: 'PNG strip (download only)', ext: 'png', mime: 'image/png' }
    ];
    const NAMINGS = [
        { id: 'index', label: 'Numbered' },
        { id: 'custom', label: 'Color names' },
        { id: 'nearest', label: 'Nearest CSS names' }
    ];

    const svgIcon = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        copy: svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
        download: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>')
    };

    const els = {};
    let frame = 0;
    let stale = false;
    let pngCache = { key: '', url: '' };
    let prefixTimer = 0;
    let prefixTyping = false;    // the prefix field holds typing not yet committed

    /* ── Small helpers ─────────────────────────────────────── */

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function stripMarks(text) {
        return String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
    }

    /** 'toolMan House' → 'toolman-house' (lowercase letters, digits, dashes). */
    function slugify(text) {
        return stripMarks(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    /** A valid identifier: starts with a letter, then letters, digits, - or _. */
    function sanitizePrefix(raw) {
        return stripMarks(raw).trim()
            .replace(/\s+/g, '-')
            .replace(/[^A-Za-z0-9_-]/g, '')
            .replace(/-{2,}/g, '-')
            .replace(/^[^A-Za-z]+/, '')
            .replace(/[-_]+$/, '')
            .slice(0, 40);
    }

    function settingsPrefix() {
        return sanitizePrefix(State.settings().exportPrefix) || 'color';
    }

    function prefs() {
        const p = State.pane(PANE);
        return {
            source: p.source === 'swatches' ? 'swatches' : 'working',
            format: FORMATS.some((f) => f.id === p.format) ? p.format : 'css',
            names: NAMINGS.some((n) => n.id === p.names) ? p.names : 'index',
            prefix: typeof p.prefix === 'string' ? p.prefix.slice(0, 40) : null,
            alpha: p.alpha !== false
        };
    }

    function effectivePrefix(raw) {
        const typed = raw === null || raw === undefined ? '' : raw;
        return sanitizePrefix(typed) || settingsPrefix();
    }

    function save(patch) {
        if (!State.setPane(PANE, patch)) notify(State.lastError || 'Could not save the Export settings.', 'warning', 3000);
    }

    function hexCase(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function channels(hex) {
        const n = hex.slice(1);
        const byte = (i) => parseInt(n.slice(i, i + 2), 16);
        return { r: byte(0), g: byte(2), b: byte(4), a: n.length === 8 ? byte(6) / 255 : 1 };
    }

    function trimNum(v, places) {
        const r = Number(v.toFixed(places));
        return String(Object.is(r, -0) ? 0 : r);
    }

    function format(hex, fmt) {
        if (window.Color && typeof Color.format === 'function') {
            try {
                const out = Color.format(hex, fmt, { precision: State.settings().precision, upper: State.settings().hexUpper !== false });
                if (out) return out;
            } catch (_err) { /* fall back below */ }
        }
        if (fmt === 'rgb') {
            const c = channels(hex);
            return `rgb(${c.r} ${c.g} ${c.b}${c.a < 1 ? ` / ${Math.round(c.a * 100)}%` : ''})`;
        }
        return '';
    }

    function csvField(text) {
        const s = String(text);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function xmlEscape(text) {
        return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
    }

    function jsKey(key) {
        return /^[A-Za-z_$][\w$]*$/.test(key) || /^[1-9]\d*$/.test(key) ? key : `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }

    /* ── Source and names ──────────────────────────────────── */

    function sourceData(src) {
        if (src === 'swatches') {
            const list = State.swatches();
            return { title: 'Saved colors', file: 'saved-colors', colors: list.map((s) => ({ hex: s.hex, name: s.name || '' })) };
        }
        const w = State.working();
        return { title: w.name || 'Untitled palette', file: slugify(w.name) || 'palette', colors: w.colors.map((c) => ({ hex: c.hex, name: c.name || '' })) };
    }

    /** Unique name slugs for each color per the naming option; also counts fallbacks. */
    function nameSlugs(colors, naming) {
        const used = new Map();
        let fallbacks = 0;
        const slugs = colors.map((c, i) => {
            let base = '';
            if (naming === 'custom') base = slugify(c.name);
            else if (naming === 'nearest' && window.Color && typeof Color.nearestName === 'function') {
                try { base = slugify(Color.nearestName(c.hex).name); } catch (_err) { base = ''; }
            }
            if (!base) {
                if (naming !== 'index') fallbacks += 1;
                base = String(i + 1);
            }
            const seen = used.get(base) || 0;
            used.set(base, seen + 1);
            return seen ? `${base}-${seen + 1}` : base;
        });
        // A numbered fallback can collide with a real name such as "2"; make every slug unique.
        const final = new Set();
        return {
            slugs: slugs.map((s) => {
                let out = s;
                let k = 2;
                while (final.has(out)) out = `${s}-${k++}`;
                final.add(out);
                return out;
            }),
            fallbacks
        };
    }

    /* ── Builders ──────────────────────────────────────────── */

    function buildEntries(data, opts) {
        const prefix = effectivePrefix(opts.prefix);
        const { slugs, fallbacks } = nameSlugs(data.colors, opts.names);
        const entries = data.colors.map((c, i) => {
            const full = State.hexOf(c.hex) || '#000000';
            const hex = opts.alpha ? full : full.slice(0, 7);
            return {
                slug: slugs[i],
                token: `${prefix}-${slugs[i]}`,
                label: c.name,
                hex: hexCase(hex),
                rgba: channels(hex)
            };
        });
        return { entries, prefix, fallbacks };
    }

    function commentTitle(data, count) {
        return `${data.title} · ${plural(count, 'color')} · exported from colorMan`.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
    }

    const BUILDERS = {
        css(data, e) {
            const lines = e.entries.map((x) => `  --${x.token}: ${x.hex};`);
            return `/* ${commentTitle(data, e.entries.length)} */\n:root {\n${lines.join('\n')}\n}\n`;
        },
        scss(data, e) {
            return `// ${commentTitle(data, e.entries.length)}\n${e.entries.map((x) => `$${x.token}: ${x.hex};`).join('\n')}\n`;
        },
        less(data, e) {
            return `// ${commentTitle(data, e.entries.length)}\n${e.entries.map((x) => `@${x.token}: ${x.hex};`).join('\n')}\n`;
        },
        tailwind(data, e) {
            const inner = e.entries.map((x) => `          ${jsKey(x.slug)}: '${x.hex}',`).join('\n');
            return [
                `// ${commentTitle(data, e.entries.length)}`,
                '// Merge into tailwind.config.js; classes read like bg-' + `${e.prefix}-${e.entries[0] ? e.entries[0].slug : '1'}.`,
                'module.exports = {',
                '  theme: {',
                '    extend: {',
                '      colors: {',
                `        ${jsKey(e.prefix)}: {`,
                inner,
                '        },',
                '      },',
                '    },',
                '  },',
                '};',
                ''
            ].join('\n');
        },
        json(data, e) {
            const arr = e.entries.map((x) => ({
                name: x.token,
                hex: x.hex,
                rgb: format(x.hex, 'rgb'),
                oklch: format(x.hex, 'oklch')
            }));
            return `${JSON.stringify(arr, null, 2)}\n`;
        },
        hex(data, e) {
            return `${e.entries.map((x) => x.hex).join('\n')}\n`;
        },
        csv(data, e) {
            const rows = e.entries.map((x) => [x.token, x.hex, x.rgba.r, x.rgba.g, x.rgba.b, trimNum(x.rgba.a, 3)].map(csvField).join(','));
            return `name,hex,r,g,b,a\n${rows.join('\n')}\n`;
        },
        gpl(data, e) {
            const name = String(data.title).replace(/[\r\n]+/g, ' ');
            const pad = (n) => String(n).padStart(3, ' ');
            const rows = e.entries.map((x) => `${pad(x.rgba.r)} ${pad(x.rgba.g)} ${pad(x.rgba.b)}\t${x.token}`);
            return `GIMP Palette\nName: ${name}\nColumns: ${Math.min(Math.max(e.entries.length, 1), PER_ROW)}\n#\n${rows.join('\n')}\n`;
        },
        svg(data, e) {
            const n = e.entries.length;
            const cols = Math.min(n, 8) || 1;
            const rows = Math.ceil(n / cols);
            const w = 140;
            const h = 140;
            const gap = 10;
            const W = cols * w + (cols - 1) * gap;
            const H = rows * h + (rows - 1) * gap;
            const cells = e.entries.map((x, i) => {
                const cx = (i % cols) * (w + gap);
                const cy = Math.floor(i / cols) * (h + gap);
                const rgb = x.hex.slice(0, 7).toUpperCase();
                const opacity = x.rgba.a < 1 ? ` fill-opacity="${trimNum(x.rgba.a, 3)}"` : '';
                const ink = window.SwatchUI ? SwatchUI.textOn(x.hex) : '#000000';
                return [
                    `  <g transform="translate(${cx} ${cy})">`,
                    `    <rect width="${w}" height="${h}" rx="8" fill="${rgb}"${opacity}/>`,
                    `    <text x="12" y="${h - 30}" fill="${ink}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="13" font-weight="600">${xmlEscape(x.hex)}</text>`,
                    `    <text x="12" y="${h - 12}" fill="${ink}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">${xmlEscape(x.token)}</text>`,
                    '  </g>'
                ].join('\n');
            });
            return [
                `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
                `  <title>${xmlEscape(commentTitle(data, n))}</title>`,
                ...cells,
                '</svg>',
                ''
            ].join('\n');
        }
    };

    /** The PNG strip as a canvas (CELL px squares, PER_ROW per row, hex labels). */
    function drawPng(e) {
        const n = e.entries.length;
        const cols = Math.min(n, PER_ROW) || 1;
        const rows = Math.ceil(n / cols);
        const canvas = document.createElement('canvas');
        canvas.width = cols * CELL;
        canvas.height = rows * CELL;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
        ctx.textBaseline = 'bottom';
        e.entries.forEach((x, i) => {
            const cx = (i % cols) * CELL;
            const cy = Math.floor(i / cols) * CELL;
            ctx.fillStyle = `rgba(${x.rgba.r}, ${x.rgba.g}, ${x.rgba.b}, ${x.rgba.a})`;
            ctx.fillRect(cx, cy, CELL, CELL);
            ctx.fillStyle = window.SwatchUI ? SwatchUI.textOn(x.hex) : '#000000';
            ctx.fillText(x.hex, cx + 8, cy + CELL - 8);
        });
        return canvas;
    }

    /** Everything the current (or overridden) choices produce. */
    function output(overrides = {}) {
        const p = { ...prefs(), ...overrides };
        const data = sourceData(p.source);
        const fmt = FORMATS.find((f) => f.id === p.format) || FORMATS[0];
        const e = buildEntries(data, p);
        const filename = `${data.file || 'palette'}.${fmt.ext}`;
        const text = fmt.id === 'png' || !e.entries.length ? '' : BUILDERS[fmt.id](data, e);
        return { text, filename, mime: fmt.mime, count: e.entries.length, format: fmt, prefix: e.prefix, fallbacks: e.fallbacks, entries: e.entries, data };
    }

    /* ── Scheduling ────────────────────────────────────────── */

    function section() {
        return els.mount ? els.mount.closest('.tool-section') : null;
    }

    function isOpen() {
        const s = section();
        return !s || s.dataset.collapsed !== 'true';
    }

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!isOpen()) { stale = true; return; }
            stale = false;
            render();
        });
    }

    function watchOpen() {
        const s = section();
        if (!s || !window.MutationObserver) return;
        new MutationObserver(() => { if (stale && isOpen()) schedule(); })
            .observe(s, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    /* ── Build ─────────────────────────────────────────────── */

    function chipGroup(label, options, onPick) {
        const group = DOM.create('div', { className: 'chip-row tb-chips', attrs: { role: 'radiogroup', 'aria-label': label } });
        const chips = options.map((o) => DOM.create('button', {
            className: 'chip-btn',
            text: o.label,
            attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', title: o.title || o.label, tabindex: '-1' },
            data: { value: o.id }
        }));
        chips.forEach((c) => group.appendChild(c));
        group.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip-btn');
            if (chip) onPick(chip.dataset.value);
        });
        group.addEventListener('keydown', (e) => {
            const i = chips.findIndex((c) => c.getAttribute('aria-checked') === 'true');
            let next = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % chips.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + chips.length) % chips.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = chips.length - 1;
            if (next < 0) return;
            e.preventDefault();
            chips[next].focus();
            onPick(chips[next].dataset.value);
        });
        return {
            el: group,
            set(value) {
                chips.forEach((c) => {
                    const on = c.dataset.value === value;
                    c.setAttribute('aria-checked', String(on));
                    c.tabIndex = on ? 0 : -1;
                });
            }
        };
    }

    function build(mount) {
        const root = DOM.create('div', { className: 'tb-pane ex' });

        els.source = chipGroup('Export source', SOURCES, (v) => { save({ source: v }); render(); });
        root.appendChild(els.source.el);

        els.format = DOM.create('select', { id: 'ex-format', className: 'select-input tb-select' });
        FORMATS.forEach((f) => els.format.appendChild(DOM.create('option', { text: f.label, attrs: { value: f.id } })));
        root.appendChild(DOM.create('div', {
            className: 'tb-field',
            children: [DOM.create('label', { className: 'mini-label', text: 'Format', attrs: { for: 'ex-format' } }), els.format]
        }));

        els.names = DOM.create('select', { id: 'ex-names', className: 'select-input tb-select' });
        NAMINGS.forEach((n) => els.names.appendChild(DOM.create('option', { text: n.label, attrs: { value: n.id } })));
        els.prefix = DOM.create('input', {
            id: 'ex-prefix',
            className: 'text-input mono tb-input',
            attrs: {
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                maxlength: '40',
                'aria-describedby': 'ex-prefix-note',
                title: 'Starts each name, as in --color-1. Letters, numbers, - and _ only.'
            }
        });
        root.appendChild(DOM.create('div', {
            className: 'field-pair tb-pair',
            children: [
                DOM.create('div', { className: 'tb-field', children: [DOM.create('label', { className: 'mini-label', text: 'Names', attrs: { for: 'ex-names' } }), els.names] }),
                DOM.create('div', { className: 'tb-field', children: [DOM.create('label', { className: 'mini-label', text: 'Prefix', attrs: { for: 'ex-prefix' } }), els.prefix] })
            ]
        }));
        els.prefixNote = DOM.create('p', { id: 'ex-prefix-note', className: 'pane-hint tb-note', attrs: { 'aria-live': 'polite' } });
        root.appendChild(els.prefixNote);

        els.alpha = DOM.create('input', { id: 'ex-alpha', attrs: { type: 'checkbox' } });
        root.appendChild(DOM.create('label', {
            className: 'check-row tb-check',
            attrs: { for: 'ex-alpha', title: 'When off, translucent colors are exported fully opaque' },
            children: [els.alpha, DOM.create('span', { text: 'Include transparency (alpha)' })]
        }));

        els.meta = DOM.create('p', { className: 'ex-meta', attrs: { 'aria-live': 'polite' } });
        root.appendChild(els.meta);

        els.code = DOM.create('pre', { className: 'code-block tb-code ex-code', attrs: { tabindex: '0', 'aria-label': 'Export preview' } });
        root.appendChild(els.code);
        els.img = DOM.create('img', { className: 'ex-png-img', attrs: { alt: '' } });
        els.png = DOM.create('div', { className: 'ex-png checker', children: [els.img] });
        root.appendChild(els.png);
        els.empty = DOM.create('div', { className: 'ex-empty-wrap' });
        root.appendChild(els.empty);

        els.copy = DOM.create('button', {
            className: 'btn btn-primary btn-sm',
            html: `${ICONS.copy}<span>Copy</span>`,
            attrs: { type: 'button' }
        });
        els.download = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            html: `${ICONS.download}<span>Download</span>`,
            attrs: { type: 'button' }
        });
        root.appendChild(DOM.create('div', { className: 'action-buttons tb-buttons', children: [els.copy, els.download] }));

        mount.appendChild(root);
        els.root = root;
    }

    /* ── Render ────────────────────────────────────────────── */

    function render() {
        if (!els.root) return;
        const p = prefs();
        els.source.set(p.source);
        if (els.format.value !== p.format) els.format.value = p.format;
        if (els.names.value !== p.names) els.names.value = p.names;
        if (document.activeElement !== els.prefix || !prefixTyping) {
            const shown = p.prefix === null ? settingsPrefix() : p.prefix;
            if (els.prefix.value !== shown) els.prefix.value = shown;
        }
        els.alpha.checked = p.alpha;

        const out = output();
        renderPrefixNote(p, out);

        const empty = out.count === 0;
        els.empty.hidden = !empty;
        if (empty) {
            renderEmpty(p.source);
            els.code.hidden = true;
            els.png.hidden = true;
            els.meta.textContent = '';
        } else {
            els.empty.textContent = '';
            const isPng = out.format.id === 'png';
            els.code.hidden = isPng;
            els.png.hidden = !isPng;
            if (isPng) renderPng(out);
            else if (els.code.textContent !== out.text) els.code.textContent = out.text;
            const fallbackNote = out.fallbacks
                ? ` · ${plural(out.fallbacks, 'color')} without a ${p.names === 'custom' ? 'name' : 'match'} use ${out.fallbacks === 1 ? 'its number' : 'their numbers'}`
                : '';
            const gplNote = out.format.id === 'gpl' && p.alpha && out.entries.some((x) => x.rgba.a < 1)
                ? ' · GIMP palettes cannot store alpha'
                : '';
            els.meta.textContent = `${plural(out.count, 'color')} from ${p.source === 'swatches' ? 'Saved colors' : `‘${out.data.title}’`} → ${out.filename}${fallbackNote}${gplNote}`;
        }

        const isPng = out.format.id === 'png';
        els.copy.disabled = empty || isPng;
        els.copy.title = isPng
            ? 'PNG is download only. Choose a text format to copy.'
            : empty ? 'Nothing to copy yet' : `Copy the ${out.format.label} text`;
        els.download.disabled = empty;
        els.download.title = empty ? 'Nothing to download yet' : `Download ${out.filename}`;
    }

    function renderPrefixNote(p, out) {
        const typed = p.prefix === null ? '' : p.prefix.trim();
        let note = '';
        if (p.prefix !== null && !typed) note = `No prefix typed, so names use “${out.prefix}” from Settings.`;
        else if (typed && typed !== out.prefix) note = `Using “${out.prefix}”: a prefix starts with a letter and uses only letters, numbers, - and _.`;
        els.prefixNote.textContent = note;
        els.prefixNote.hidden = !note;
    }

    function renderEmpty(src) {
        const other = src === 'swatches' ? 'working' : 'swatches';
        const otherCount = other === 'swatches' ? State.swatches().length : State.working().colors.length;
        const box = DOM.create('div', { className: 'empty-state tb-empty' });
        box.appendChild(DOM.create('p', {
            className: 'empty-title',
            text: src === 'swatches' ? 'No saved colors yet' : 'The working palette is empty'
        }));
        box.appendChild(DOM.create('p', {
            className: 'empty-text',
            text: src === 'swatches'
                ? 'Star a color with the toolbar button (or press F) to save it, then export your saved colors here.'
                : 'Add colors to the working palette (press A to add the current color), then export them here.'
        }));
        if (otherCount) {
            const btn = DOM.create('button', {
                className: 'btn btn-secondary btn-sm',
                text: other === 'swatches' ? `Export ${plural(otherCount, 'saved color')} instead` : `Export the working palette (${plural(otherCount, 'color')}) instead`,
                attrs: { type: 'button' }
            });
            DOM.on(btn, 'click', () => { save({ source: other }); render(); });
            box.appendChild(btn);
        }
        els.empty.replaceChildren(box);
    }

    function renderPng(out) {
        const key = `${out.entries.map((x) => x.hex).join(',')}|${State.settings().hexUpper}`;
        if (pngCache.key !== key) {
            const canvas = drawPng(out);
            pngCache = { key, url: canvas ? canvas.toDataURL('image/png') : '' };
        }
        if (els.img.getAttribute('src') !== pngCache.url) els.img.src = pngCache.url;
        els.img.alt = `PNG strip of ${plural(out.count, 'color')}: ${out.entries.slice(0, 16).map((x) => x.hex).join(', ')}${out.count > 16 ? ', and more' : ''}`;
    }

    /* ── Actions ───────────────────────────────────────────── */

    function copy() {
        const out = output();
        if (!out.count) {
            notify('There are no colors to copy yet.', 'info', 2000);
            return;
        }
        if (out.format.id === 'png') {
            notify('PNG is download only. Choose a text format to copy.', 'info', 2600);
            return;
        }
        if (window.ToolApp) ToolApp.copy(out.text, out.format.label, els.copy);
    }

    function download() {
        const out = output();
        if (!out.count) {
            notify('There are no colors to download yet.', 'info', 2000);
            return;
        }
        if (!window.ToolApp) return;
        if (out.format.id === 'png') {
            const canvas = drawPng(out);
            if (!canvas || typeof canvas.toBlob !== 'function') {
                notify('This browser could not draw the PNG.', 'error', 3000);
                return;
            }
            canvas.toBlob((blob) => {
                if (blob) ToolApp.download(out.filename, blob, 'image/png');
                else notify('This browser could not draw the PNG.', 'error', 3000);
            }, 'image/png');
            return;
        }
        ToolApp.download(out.filename, out.text, out.mime);
    }

    function commitPrefix() {
        clearTimeout(prefixTimer);
        prefixTyping = false;
        const raw = els.prefix.value.trim();
        if (!raw || raw === settingsPrefix()) {
            save({ prefix: null });
            els.prefix.value = settingsPrefix();
        } else {
            save({ prefix: raw.slice(0, 40) });
        }
        render();
    }

    /* ── Events ────────────────────────────────────────────── */

    function bind() {
        DOM.on(els.format, 'change', () => { save({ format: els.format.value }); render(); });
        DOM.on(els.names, 'change', () => { save({ names: els.names.value }); render(); });
        DOM.on(els.alpha, 'change', () => { save({ alpha: els.alpha.checked }); render(); });
        DOM.on(els.prefix, 'input', () => {
            prefixTyping = true;
            clearTimeout(prefixTimer);
            prefixTimer = setTimeout(() => {
                save({ prefix: els.prefix.value.slice(0, 40) });
                render();
            }, 200);
        });
        DOM.on(els.prefix, 'change', commitPrefix);
        DOM.on(els.prefix, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitPrefix();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(prefixTimer);
                prefixTyping = false;
                save({ prefix: null });
                els.prefix.value = settingsPrefix();
                els.prefix.blur();
                render();
            }
        });
        DOM.on(els.copy, 'click', copy);
        DOM.on(els.download, 'click', download);

        State.on('working', () => { if (prefs().source === 'working') schedule(); });
        State.on('library', (payload = {}) => { if (payload.kind !== 'palettes' && prefs().source === 'swatches') schedule(); });
        State.on('settings', schedule);
        State.on('reset', () => { pngCache = { key: '', url: '' }; schedule(); });
    }

    /* ── Public API ────────────────────────────────────────── */

    const ExportUI = {
        FORMATS: FORMATS.map((f) => ({ ...f })),
        init() {
            const mount = DOM.id('mount-export');
            if (!mount || els.root) return;
            els.mount = mount;
            build(mount);
            bind();
            render();
            watchOpen();
        },
        output(overrides) {
            const out = output(overrides || {});
            return { text: out.text, filename: out.filename, mime: out.mime, count: out.count };
        },
        copy,
        download,
        slugify,
        sanitizePrefix,
        render
    };

    window.ExportUI = ExportUI;
})();
