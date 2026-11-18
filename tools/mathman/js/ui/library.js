/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LibraryUI (mathMan Edition - v1.0)
 *     - File Name: library.js
 *     - Relative Path: tools/mathman/js/ui/library.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The four Library panes in mathMan's left rail: the visitor's sheets,
 *     the variables and functions the open sheet defines, a searchable
 *     reference of every function, constant, unit, and keyword, and the
 *     results saved to History. Each pane reads State, sends text to the
 *     worksheet at the caret, and offers the edits that belong to it.
 *
 * ✒ Key Features:
 *     - Sheets: filter by name or content, New and Import…, gold-rule cards
 *       with the line count, last update, and first line; the open sheet is
 *       marked "Open"; Rename (checked prompt), Duplicate, Delete (confirmed,
 *       with Undo), and download as .txt or as a .md table of results
 *     - Import plain-text files (.txt, .text, .md) as new sheets from a file
 *       picker or by dropping them on the Sheets pane: 1 MB and 10 files at
 *       a time, binary files refused, over-long text trimmed with a note
 *     - Variables: the open sheet's variables (name = value) and functions
 *       (signature = body); click inserts the name, the line chip jumps to
 *       its definition; an empty state teaches "x = 5" with a one-click try
 *     - Reference: search plus All / Functions / Units / Constants /
 *       Keywords chips, grouped rows with signature, description, and a live
 *       example result in the current settings; click inserts "sqrt(" (units
 *       and keywords get sensible spacing) and + adds the example as a line
 *     - History: newest first with the calculation, result, sheet, and age;
 *       a copy button, a filter, and Clear all (confirmed); the note shows
 *       the size limit from Settings
 *     - History insert: click types the result at the caret; a result too
 *       long for one worksheet line (1000! has 2,568 digits) types its
 *       calculation instead and puts the full value on the clipboard
 *     - Focus survives every redraw; relative times refresh every 30 s
 *     - All visitor text reaches the page through textContent only
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js and js/ui/worksheet.js, before js/app.js.
 *     app.js calls LibraryUI.init() once through ToolApp.boot(); the module
 *     renders into #mount-sheets, #mount-variables, #mount-reference, and
 *     #mount-history and keeps them current from State events. Section
 *     counts and the Library footer belong to app.js.
 *
 * ✒ Examples:
 *     LibraryUI.init()                                  → builds all four panes
 *     LibraryUI.markdownFor(State.activeSheet())        → '# Welcome\n\n| Line | Calculation | Result |…'
 *     await LibraryUI.importFiles(fileInput.files)      → [the new sheets]
 *     LibraryUI.newSheet()                              → a new empty sheet, opened in the worksheet
 *     LibraryUI.setReferenceCategory('units')           → the Reference pane lists units only
 *     LibraryUI.insert('sqrt(')                         → typed at the worksheet caret
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/engine.js (MathEngine
 *       reference and evaluation for examples and .md export),
 *       js/ui/worksheet.js (WorksheetUI.insert / appendLine / flush /
 *       goToLine), shared/js/dom.js, dialogs.js, toolapp.js, toolman.js,
 *       workbench.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: imports read UTF-8 text only; files over 1 MB are
 *       refused and a sheet keeps its first 200,000 characters; History
 *       entries cannot be edited, only copied, reused, or cleared
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const IMPORT_MAX_BYTES = 1024 * 1024;
    const IMPORT_MAX_FILES = 10;
    const IMPORT_EXT = /\.(txt|text|md|markdown)$/i;
    const UNDO_MS = 8000;
    const FILTER_DELAY = 120;
    const PREVIEW_CHARS = 140;
    const MAX_LINES = (window.MathEngine && MathEngine.limits && MathEngine.limits.lines) || 2000;

    const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
    const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const PLUS_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

    const REF_CATEGORIES = [
        ['all', 'All'],
        ['functions', 'Functions'],
        ['units', 'Units'],
        ['constants', 'Constants'],
        ['keywords', 'Keywords']
    ];

    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const plural = (n, word, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    function shorten(text, max = 40) {
        const s = String(text);
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    function relTime(ms) {
        if (!Number.isFinite(ms)) return '';
        return window.ToolApp ? ToolApp.relativeTime(ms) : new Date(ms).toLocaleDateString();
    }

    function slug(name) {
        return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sheet';
    }

    function countLines(text) {
        if (!text) return 0;
        let n = 1;
        for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
        return n;
    }

    function firstLine(text) {
        const src = String(text || '');
        let pos = 0;
        while (pos <= src.length) {
            let end = src.indexOf('\n', pos);
            if (end === -1) end = src.length;
            const line = src.slice(pos, end).trim();
            if (line) return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS - 1)}…` : line;
            pos = end + 1;
        }
        return '';
    }

    function btn(className, text, attrs = {}) {
        return DOM.create('button', { className, text, attrs: Object.assign({ type: 'button' }, attrs) });
    }

    function iconAction(icon, label, attrs = {}, extra = '') {
        return DOM.create('button', {
            className: `icon-action${extra ? ` ${extra}` : ''}`,
            html: icon,
            attrs: Object.assign({ type: 'button', 'aria-label': label, title: label }, attrs)
        });
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
                autocapitalize: 'off',
                maxlength: '120'
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

    function closeDrawerOnPhone() {
        if (window.Workbench && Workbench.isMobile && Workbench.isMobile()) Workbench.setMobileOpen(null);
    }

    /* ── Focus that survives a redraw ──────────────────────── */

    function focusKey(root) {
        const a = document.activeElement;
        return a && root && root.contains(a) && a.dataset && a.dataset.fkey ? a.dataset.fkey : null;
    }

    function restoreFocus(root, key, fallback) {
        if (!key || !root) return;
        let target = root.querySelector(`[data-fkey="${CSS.escape(key)}"]`);
        if ((!target || target.disabled || target.offsetParent === null) && typeof fallback === 'function') target = fallback();
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
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
            const b = btn('btn btn-ghost btn-sm lib-undo-btn', 'Undo', { 'aria-label': `Undo: ${message}` });
            DOM.on(b, 'click', () => {
                hide();
                try { onUndo(); } catch (err) { console.error('[LibraryUI] undo failed:', err); }
            });
            host.append(DOM.create('span', { className: 'lib-undo-text', text: message }), b);
            host.dataset.state = 'info';
            host.hidden = false;
            timer = setTimeout(hide, UNDO_MS);
        };
        hide();
        return { show, hide };
    }

    /* ── Talking to the worksheet ──────────────────────────── */

    function worksheet(method) {
        return window.WorksheetUI && typeof WorksheetUI[method] === 'function';
    }

    function insert(text) {
        if (!worksheet('insert')) {
            notify('The worksheet did not load, so nothing could be inserted. Reload the page to try again.', 'warning', 4000);
            return false;
        }
        return WorksheetUI.insert(text);
    }

    function appendLine(text) {
        if (!worksheet('appendLine')) {
            notify('The worksheet did not load, so the line could not be added. Reload the page to try again.', 'warning', 4000);
            return null;
        }
        const line = WorksheetUI.appendLine(text);
        if (line) {
            const result = line.kind === 'error'
                ? `has an error: ${line.error ? line.error.message : ''}`
                : (line.display ? `= ${shorten(line.display, 30)}` : 'added');
            notify(`Added line ${line.index + 1}: ${shorten(text, 30)} ${result}`, line.kind === 'error' ? 'warning' : 'success', 2200);
        }
        return line;
    }

    /** The character just before the worksheet caret ('' at the start or when unknown). */
    function charBeforeCaret() {
        const ta = DOM.id('ws-input');
        if (!ta || ta.selectionStart === 0) return '';
        return ta.value[ta.selectionStart - 1] || '';
    }

    /** Insert a word with a space on each side unless the text already has one. */
    function insertSpaced(word) {
        const before = charBeforeCaret();
        const lead = before && !/[\s(]/.test(before) ? ' ' : '';
        return insert(`${lead}${word} `);
    }

    function flushWorksheet() {
        if (worksheet('flush')) WorksheetUI.flush();
    }

    /* ══════════════════════════════════════════════════════════
       SHEETS
       ══════════════════════════════════════════════════════════ */

    const SH = { query: '', flashId: null };

    function sheetMatches(s, q) {
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.text.toLowerCase().includes(q);
    }

    function sheetMeta(s) {
        const n = countLines(s.text);
        return n ? `${plural(n, 'line')} · updated ` : 'Empty · updated ';
    }

    function sheetRow(s, activeId) {
        const active = s.id === activeId;
        const row = DOM.create('article', { className: 'list-row lib-sheet', data: { id: s.id } });
        if (active) row.dataset.active = 'true';
        row.title = active ? `${s.name} is open in the worksheet` : `Open ${s.name}`;

        const head = DOM.create('div', { className: 'row-head' });
        head.appendChild(DOM.create('h5', { className: 'row-title', text: s.name, attrs: { title: s.name } }));
        if (active) head.appendChild(DOM.create('span', { className: 'badge lib-open-badge', text: 'Open', attrs: { 'data-tone': 'brand' } }));
        const delLabel = `Delete ‘${s.name}’`;
        head.appendChild(iconAction(TRASH_ICON, delLabel, { 'data-act': 'delete', 'data-fkey': `${s.id}:delete` }, 'icon-action--danger lib-delete'));

        const meta = DOM.create('p', { className: 'row-meta' });
        meta.append(
            DOM.create('span', { className: 'lib-sheet-count', text: sheetMeta(s) }),
            DOM.create('span', { className: 'lib-time', text: relTime(s.updated), data: { at: String(s.updated) } })
        );

        const previewText = firstLine(s.text);
        const preview = DOM.create('p', {
            className: `row-preview lib-preview${previewText ? '' : ' lib-preview--empty'}`,
            text: previewText || 'Nothing on this sheet yet'
        });

        const actions = DOM.create('div', { className: 'row-actions' });
        const make = (act, text, label, extra = '') => btn(`row-btn${extra ? ` ${extra}` : ''}`, text, {
            'data-act': act,
            'data-fkey': `${s.id}:${act}`,
            'aria-label': label,
            title: label
        });
        if (!active) actions.appendChild(make('open', 'Open', `Open ‘${s.name}’ in the worksheet`, 'row-btn--primary'));
        actions.append(
            make('rename', 'Rename', `Rename ‘${s.name}’`),
            make('duplicate', 'Duplicate', `Make a copy of ‘${s.name}’`),
            make('txt', '.txt', `Download ‘${s.name}’ as a plain-text .txt file`),
            make('md', '.md', `Download ‘${s.name}’ with its results as a Markdown table (.md)`)
        );

        row.append(head, meta, preview, actions);
        return row;
    }

    function applySheetFilter() {
        const sheets = State.sheets();
        const byId = new Map(sheets.map((s) => [s.id, s]));
        let shown = 0;
        DOM.$$('.lib-sheet', SH.list).forEach((row) => {
            const s = byId.get(row.dataset.id);
            const show = Boolean(s) && sheetMatches(s, SH.query);
            row.hidden = !show;
            if (show) shown++;
        });
        SH.none.hidden = !(sheets.length && !shown);
        if (!SH.none.hidden) SH.none.textContent = `No sheets match “${SH.filter.value.trim()}”. The filter looks at sheet names and their lines.`;
    }

    function renderSheets(payload = {}) {
        if (!SH.list) return;
        const key = focusKey(SH.root);
        const keyIndex = key ? DOM.$$('.lib-sheet', SH.list).findIndex((r) => key.startsWith(`${r.dataset.id}:`)) : -1;
        const sheets = State.sheets();
        const activeId = State.activeSheet().id;

        const frag = document.createDocumentFragment();
        sheets.forEach((s) => frag.appendChild(sheetRow(s, activeId)));
        DOM.empty(SH.list);
        SH.list.appendChild(frag);
        applySheetFilter();

        restoreFocus(SH.root, key, () => {
            const rows = DOM.$$('.lib-sheet:not([hidden])', SH.list);
            const act = key ? key.split(':').pop() : 'rename';
            const row = rows[Math.min(Math.max(0, keyIndex), rows.length - 1)];
            if (row) return DOM.$(`[data-act="${act === 'delete' || act === 'open' ? 'rename' : act}"]`, row) || DOM.$('.row-btn', row);
            return SH.filter;
        });

        const flashActions = ['add', 'duplicate', 'restore', 'import'];
        const flashId = payload.id && flashActions.includes(payload.action) ? payload.id : SH.flashId;
        SH.flashId = null;
        if (flashId) {
            const row = DOM.$(`.lib-sheet[data-id="${CSS.escape(flashId)}"]`, SH.list);
            if (row && !row.hidden) {
                if (window.ToolApp) ToolApp.flash(row);
                requestAnimationFrame(() => row.scrollIntoView({ block: 'nearest' }));
            }
        }
    }

    /** Refresh one row's line count, time, and preview after its text changed. */
    function refreshSheetRow(id) {
        const s = State.sheet(id);
        const row = s && SH.list ? DOM.$(`.lib-sheet[data-id="${CSS.escape(id)}"]`, SH.list) : null;
        if (!row) return;
        const count = DOM.$('.lib-sheet-count', row);
        if (count) count.textContent = sheetMeta(s);
        const time = DOM.$('.lib-time', row);
        if (time) {
            time.dataset.at = String(s.updated);
            time.textContent = relTime(s.updated);
        }
        const preview = DOM.$('.lib-preview', row);
        if (preview) {
            const text = firstLine(s.text);
            preview.textContent = text || 'Nothing on this sheet yet';
            preview.classList.toggle('lib-preview--empty', !text);
        }
        if (SH.query) applySheetFilter();
    }

    function openSheet(id) {
        const s = State.sheet(id);
        if (!s) {
            notify('That sheet no longer exists.', 'warning', 3000);
            return false;
        }
        if (State.activeSheet().id === id) {
            closeDrawerOnPhone();
            return true;
        }
        flushWorksheet();
        if (!State.setActiveSheet(id)) {
            notify(State.lastError || 'Could not open that sheet.', 'warning', 3000);
            return false;
        }
        notify(`Opened ‘${shorten(s.name, 40)}’`, 'success', 1200);
        closeDrawerOnPhone();
        return true;
    }

    function newSheet() {
        flushWorksheet();
        const sheet = State.addSheet();
        if (!sheet) {
            notify(State.lastError || 'Could not add a sheet.', 'warning', 4000);
            return null;
        }
        if (SH.query && !sheetMatches(sheet, SH.query)) clearSheetFilter();
        notify(`New sheet: ${sheet.name}`, 'success', 1500);
        closeDrawerOnPhone();
        if (worksheet('focus')) WorksheetUI.focus();
        return sheet;
    }

    function clearSheetFilter() {
        SH.filter.value = '';
        SH.query = '';
        applySheetFilter();
    }

    async function renameSheet(id) {
        const s = State.sheet(id);
        if (!s) return;
        const name = await Dialogs.prompt({
            title: 'Rename sheet',
            label: 'Sheet name',
            value: s.name,
            confirmLabel: 'Rename',
            hint: 'Up to 80 characters. Each sheet needs its own name.',
            validate: (raw) => {
                const clean = String(raw).replace(/\s+/g, ' ').trim();
                if (!clean) return 'Give the sheet a name — at least one letter or number.';
                if (clean.length > 80) return `Use 80 characters or fewer (this has ${clean.length}).`;
                const taken = State.sheets().some((o) => o.id !== id && o.name.toLowerCase() === clean.toLowerCase());
                if (taken) return `Another sheet is already called “${clean}”. Pick a different name.`;
                return null;
            }
        });
        if (name === null) return;
        const saved = State.renameSheet(id, name);
        if (saved === null) notify(State.lastError || 'That sheet no longer exists.', 'warning', 3000);
        else if (saved !== s.name) notify(`Renamed to ‘${shorten(saved, 40)}’`, 'success', 1400);
    }

    function duplicateSheet(id) {
        flushWorksheet();
        const copy = State.duplicateSheet(id);
        if (!copy) {
            notify(State.lastError || 'Could not copy that sheet.', 'warning', 3500);
            return;
        }
        if (SH.query && !sheetMatches(copy, SH.query)) clearSheetFilter();
        notify(`Made a copy: ‘${shorten(copy.name, 40)}’, now open`, 'success', 1800);
    }

    async function deleteSheet(id) {
        flushWorksheet();
        const s = State.sheet(id);
        if (!s) return;
        const only = State.sheets().length === 1;
        const lines = countLines(s.text);
        const ok = await Dialogs.confirm({
            title: `Delete ‘${shorten(s.name, 50)}’?`,
            message: `This removes the sheet${lines ? ` and its ${plural(lines, 'line')}` : ''} from this browser.${only ? ' mathMan always keeps one sheet, so a new empty sheet takes its place.' : ''}\n\nYou can undo this for a few seconds afterwards.`,
            confirmLabel: 'Delete sheet',
            danger: true
        });
        if (!ok) return;
        const removed = State.deleteSheet(id);
        if (!removed) {
            notify('That sheet was already deleted.', 'info', 2000);
            return;
        }
        const filler = only ? State.sheets()[0] : null;
        notify(`Deleted ‘${shorten(removed.name, 40)}’`, 'info', 1600);
        SH.undo.show(`Deleted ‘${shorten(removed.name, 40)}’.`, () => {
            const back = State.restoreSheet(removed);
            if (!back) {
                notify(State.lastError || 'Could not restore the sheet.', 'warning', 3500);
                return;
            }
            // The empty stand-in that kept the library from being empty goes away again.
            const stand = filler ? State.sheet(filler.id) : null;
            if (stand && !stand.text && State.sheets().length > 1) State.deleteSheet(stand.id);
            notify(`Restored ‘${shorten(back.name, 40)}’`, 'success', 1400);
        });
    }

    function exportTxt(id) {
        if (State.activeSheet().id === id) flushWorksheet();
        const s = State.sheet(id);
        if (!s) return;
        const name = `${slug(s.name)}.txt`;
        const text = s.text.endsWith('\n') || !s.text ? s.text : `${s.text}\n`;
        if (ToolApp.download(name, text, 'text/plain')) notify(`Downloaded ${name}`, 'success', 1600);
    }

    /* ── Markdown export (pure apart from MathEngine) ──────── */

    /** Text safe inside a Markdown table cell (no pipes, no HTML, one line). */
    function mdCell(text) {
        return String(text == null ? '' : text)
            .replace(/[\r\n]+/g, ' ')
            .replace(/\\/g, '\\\\')
            .replace(/\|/g, '\\|')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/([*_[\]])/g, '\\$1')
            .trim();
    }

    /** A code span for a table cell; pipes are still escaped, as GFM tables require. */
    function mdCode(text) {
        const s = String(text == null ? '' : text).replace(/[\r\n]+/g, ' ').trim().replace(/\|/g, '\\|');
        if (!s) return '';
        const fence = s.includes('`') ? '``' : '`';
        return `${fence}${fence === '``' ? ' ' : ''}${s}${fence === '``' ? ' ' : ''}${fence}`;
    }

    function markdownFor(sheet, options) {
        if (!sheet || typeof sheet.text !== 'string') return '';
        const opts = options || (window.State ? State.engineOptions() : {});
        let result = null;
        try {
            // The open sheet is already worked out (and may be heavy): reuse that result.
            const live = window.State && !options ? State.result() : null;
            const active = window.State ? State.activeSheet() : null;
            if (live && active && active.id === sheet.id && active.text === sheet.text && !live.pending) result = live;
            else result = window.MathEngine ? MathEngine.evaluateSheet(sheet.text, opts) : null;
        } catch (_err) {
            result = null;
        }
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const out = [`# ${mdCell(sheet.name || 'Sheet')}`, '', `Exported from mathMan on ${date}.`, ''];
        const lines = result ? result.lines : sheet.text.split('\n').map((source, index) => ({ index, source, kind: 'value', display: '' }));
        out.push('| Line | Calculation | Result |', '| ---: | --- | --- |');
        let rows = 0;
        lines.forEach((l) => {
            const src = String(l.source || '');
            const trimmed = src.trim();
            if (!trimmed) return;
            const n = l.index + 1;
            let calc;
            let res = '';
            if (l.kind === 'heading') {
                calc = `**${mdCell(trimmed.replace(/^#+\s*/, ''))}**`;
            } else if (l.kind === 'comment') {
                calc = trimmed.startsWith('//') ? `*${mdCell(trimmed.replace(/^\/\/\s*/, ''))}*` : mdCode(trimmed);
            } else {
                calc = mdCode(trimmed);
                if (l.kind === 'error') res = `⚠ ${mdCell(l.error ? l.error.message : 'error')}`;
                else if (l.kind === 'function') res = '*function*';
                else if (l.display) res = `${mdCell(l.display)}${l.exact ? ` (exactly ${mdCell(l.exact)})` : ''}`;
            }
            out.push(`| ${n} | ${calc} | ${res} |`);
            rows++;
        });
        if (!rows) out.push('| | *This sheet is empty.* | |');
        out.push('');
        return out.join('\n');
    }

    function exportMd(id) {
        if (State.activeSheet().id === id) flushWorksheet();
        const s = State.sheet(id);
        if (!s) return;
        const name = `${slug(s.name)}.md`;
        if (ToolApp.download(name, markdownFor(s), 'text/markdown')) notify(`Downloaded ${name} with every result`, 'success', 1800);
    }

    /* ── Import ────────────────────────────────────────────── */

    async function importFiles(fileList) {
        const all = Array.from(fileList || []);
        if (!all.length) return [];
        const files = all.slice(0, IMPORT_MAX_FILES);
        const added = [];
        const problems = [];
        if (all.length > IMPORT_MAX_FILES) problems.push(`only the first ${IMPORT_MAX_FILES} files were read`);
        flushWorksheet();

        for (const file of files) {
            const label = file.name || 'that file';
            const textish = !file.type || /^text\//.test(file.type);
            if (!IMPORT_EXT.test(label) && !(file.type && /^text\//.test(file.type))) {
                problems.push(`“${shorten(label, 40)}” isn't a plain-text file (.txt or .md)`);
                continue;
            }
            if (!textish) {
                problems.push(`“${shorten(label, 40)}” isn't plain text`);
                continue;
            }
            if (file.size > IMPORT_MAX_BYTES) {
                problems.push(`“${shorten(label, 40)}” is larger than 1 MB`);
                continue;
            }
            let text;
            try {
                text = await ToolApp.readFile(file, 'text');
            } catch (_err) {
                problems.push(`couldn't read “${shorten(label, 40)}”`);
                continue;
            }
            text = String(text).replace(/^﻿/, '');
            if (text.includes('\u0000')) {
                problems.push(`“${shorten(label, 40)}” looks like a binary file, not text`);
                continue;
            }
            const base = label.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Imported sheet';
            State.lastError = '';
            const sheet = State.addSheet(base, text, { activate: false });
            if (!sheet) {
                problems.push(State.lastError || 'the library is full');
                break;
            }
            if (State.lastError) problems.push(`“${shorten(label, 40)}” was longer than ${State.LIMITS.sheetChars.toLocaleString('en-US')} characters, so its end was left out`);
            if (countLines(sheet.text) > MAX_LINES) problems.push(`“${shorten(sheet.name, 40)}” has more than ${MAX_LINES.toLocaleString('en-US')} lines; only those are worked out`);
            added.push(sheet);
        }

        if (added.length) {
            const last = added[added.length - 1];
            if (SH.query) clearSheetFilter();
            SH.flashId = last.id;
            State.setActiveSheet(last.id);
            renderSheets({ action: 'import', id: last.id });
            const names = added.length === 1 ? `‘${shorten(added[0].name, 40)}’` : plural(added.length, 'sheet');
            const extra = problems.length ? ` (${problems.join('; ')})` : '';
            notify(`Imported ${names}${added.length === 1 ? ' and opened it' : `; ‘${shorten(last.name, 30)}’ is open`}${extra}`, problems.length ? 'warning' : 'success', problems.length ? 6000 : 2600);
        } else if (problems.length) {
            notify(`Nothing was imported: ${problems.join('; ')}. Choose a .txt file with one calculation per line.`, 'warning', 6000);
        }
        return added;
    }

    function wireDrop(target) {
        const carriesFiles = (e) => Boolean(e.dataTransfer) && Array.from(e.dataTransfer.types || []).includes('Files');
        let depth = 0;
        const off = () => {
            depth = 0;
            delete SH.root.dataset.drop;
        };
        target.addEventListener('dragenter', (e) => {
            if (!carriesFiles(e)) return;
            e.preventDefault();
            depth++;
            SH.root.dataset.drop = 'true';
        });
        target.addEventListener('dragover', (e) => {
            if (!carriesFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        target.addEventListener('dragleave', (e) => {
            if (!carriesFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (!depth) off();
        });
        target.addEventListener('drop', (e) => {
            if (!carriesFiles(e)) return;
            e.preventDefault();
            off();
            importFiles(e.dataTransfer.files);
        });
    }

    function buildSheets() {
        const mount = DOM.id('mount-sheets');
        if (!mount) return;
        DOM.empty(mount);
        SH.root = mount;

        const bar = DOM.create('div', { className: 'lib-bar' });
        SH.filter = filterInput('Filter by name or line', 'Filter sheets by name or content');
        const actions = DOM.create('div', { className: 'lib-bar-actions' });
        const add = btn('btn btn-secondary btn-sm', 'New', { title: 'Start a new empty sheet (Ctrl+Alt+N)', 'aria-label': 'New sheet' });
        const imp = btn('btn btn-secondary btn-sm', 'Import…', { title: 'Add .txt files as new sheets — or drop them on this pane', 'aria-label': 'Import .txt files as new sheets' });
        actions.append(add, imp);
        bar.append(SH.filter, actions);

        SH.file = DOM.create('input', {
            className: 'lib-file',
            attrs: { type: 'file', accept: '.txt,.text,.md,.markdown,text/plain,text/markdown', multiple: '', tabindex: '-1', 'aria-hidden': 'true' }
        });

        const undoHost = DOM.create('div', { className: 'tool-feedback lib-undo', attrs: { role: 'status' } });
        SH.undo = makeUndo(undoHost);
        SH.list = DOM.create('div', { className: 'list lib-sheets', attrs: { 'aria-label': 'Sheets' } });
        SH.none = DOM.create('p', { className: 'pane-hint lib-none' });
        SH.none.hidden = true;
        const tip = DOM.create('p', { className: 'lib-drop-hint', text: 'Drop .txt files here to add them as sheets.' });

        mount.append(bar, SH.file, undoHost, SH.list, SH.none, tip);

        DOM.on(add, 'click', newSheet);
        DOM.on(imp, 'click', () => SH.file.click());
        DOM.on(SH.file, 'change', async () => {
            const files = Array.from(SH.file.files || []);
            SH.file.value = '';
            await importFiles(files);
        });
        DOM.on(SH.filter, 'input', DOM.debounce(() => {
            SH.query = SH.filter.value.trim().toLowerCase();
            applySheetFilter();
        }, FILTER_DELAY));
        DOM.on(SH.filter, 'keydown', (e) => {
            if (e.key === 'Escape' && SH.filter.value) {
                e.preventDefault();
                e.stopPropagation();
                clearSheetFilter();
            } else if (e.key === 'Enter') {
                const first = DOM.$('.lib-sheet:not([hidden])', SH.list);
                if (first) openSheet(first.dataset.id);
            }
        });
        DOM.on(SH.list, 'click', (e) => {
            const row = e.target.closest('.lib-sheet');
            if (!row) return;
            const id = row.dataset.id;
            const b = e.target.closest('button[data-act]');
            if (!b) {
                if (!e.target.closest('button, a, input')) openSheet(id);
                return;
            }
            switch (b.dataset.act) {
                case 'open': openSheet(id); break;
                case 'rename': renameSheet(id); break;
                case 'duplicate': duplicateSheet(id); break;
                case 'delete': deleteSheet(id); break;
                case 'txt': exportTxt(id); break;
                case 'md': exportMd(id); break;
                default: break;
            }
        });
        wireDrop(mount.closest('.tool-section') || mount);
        renderSheets();
    }

    /* ══════════════════════════════════════════════════════════
       VARIABLES
       ══════════════════════════════════════════════════════════ */

    const VA = { key: '', query: '' };

    function variablesKey(result, name) {
        const v = (result.variables || []).map((x) => `${x.name}=${x.display}@${x.line}`).join('\u0001');
        const f = (result.functions || []).map((x) => `${x.name}(${x.params.join(',')})=${x.body}@${x.line}`).join('\u0001');
        return `${name}\u0002${v}\u0002${f}`;
    }

    function varRow(name, value, line, insertText, label) {
        const row = DOM.create('div', { className: 'lib-var-row', data: { name: name.toLowerCase() } });
        const main = DOM.create('button', {
            className: 'lib-var',
            attrs: { type: 'button', 'data-insert': insertText, 'data-fkey': `var:${name}`, 'aria-label': label, title: label }
        });
        main.append(
            DOM.create('span', { className: 'lib-var-name', text: name }),
            DOM.create('span', { className: 'lib-var-eq', text: '=', attrs: { 'aria-hidden': 'true' } }),
            DOM.create('span', { className: 'lib-var-value', text: value || '—' })
        );
        const jump = DOM.create('button', {
            className: 'lib-line-chip',
            text: `L${line}`,
            attrs: {
                type: 'button',
                'data-line': String(line),
                'data-fkey': `line:${name}`,
                'aria-label': `Go to line ${line}, where ${name} is defined`,
                title: `Go to line ${line}`
            }
        });
        row.append(main, jump);
        return row;
    }

    function renderVariables(force) {
        if (!VA.root) return;
        const result = State.result();
        const sheetName = State.activeSheet().name;
        const key = variablesKey(result, sheetName);
        if (!force && key === VA.key) return;
        VA.key = key;
        const fkey = focusKey(VA.root);

        const vars = result.variables || [];
        const fns = result.functions || [];
        DOM.empty(VA.body);

        if (!vars.length && !fns.length) {
            const tryIt = btn('btn btn-secondary btn-sm', 'Try it: add x = 5', { title: 'Add the line x = 5 to the end of this sheet' });
            DOM.on(tryIt, 'click', () => appendLine('x = 5'));
            VA.body.appendChild(emptyState(
                'No variables on this sheet yet',
                'Type a line like x = 5 and every line below it can use x. Functions work the same way: f(x) = x^2 + 1, then f(3) gives 10.',
                [tryIt]
            ));
            VA.filter.hidden = true;
            VA.hint.hidden = true;
            restoreFocus(VA.root, fkey, () => tryIt);
            return;
        }

        VA.hint.hidden = false;
        VA.hint.textContent = `From ‘${shorten(sheetName, 40)}’. Click a name to type it at the caret; the L chip jumps to its line.`;
        VA.filter.hidden = vars.length + fns.length < 8;
        if (VA.filter.hidden && VA.query) {
            VA.filter.value = '';
            VA.query = '';
        }

        if (vars.length) {
            VA.body.appendChild(DOM.create('p', { className: 'section-label', text: `Variables · ${vars.length}` }));
            const list = DOM.create('div', { className: 'lib-vars' });
            vars.forEach((v) => list.appendChild(varRow(
                v.name, v.display, v.line, v.name,
                `Insert ${v.name} (${shorten(v.display || 'no value', 40)}) at the caret`
            )));
            VA.body.appendChild(list);
        }
        if (fns.length) {
            VA.body.appendChild(DOM.create('p', { className: 'section-label', text: `Functions · ${fns.length}` }));
            const list = DOM.create('div', { className: 'lib-vars' });
            fns.forEach((f) => {
                const sig = `${f.name}(${f.params.join(', ')})`;
                list.appendChild(varRow(sig, f.body, f.line, `${f.name}(`, `Insert ${f.name}( at the caret — ${shorten(`${sig} = ${f.body}`, 60)}`));
            });
            VA.body.appendChild(list);
        }
        VA.none = DOM.create('p', { className: 'pane-hint lib-none' });
        VA.none.hidden = true;
        VA.body.appendChild(VA.none);
        applyVariableFilter();
        restoreFocus(VA.root, fkey, () => DOM.$('.lib-var', VA.body));
    }

    function applyVariableFilter() {
        const q = VA.query;
        let shown = 0;
        DOM.$$('.lib-var-row', VA.body).forEach((row) => {
            const show = !q || row.dataset.name.includes(q) || row.textContent.toLowerCase().includes(q);
            row.hidden = !show;
            if (show) shown++;
        });
        DOM.$$('.lib-vars', VA.body).forEach((list) => {
            const label = list.previousElementSibling;
            const any = DOM.$$('.lib-var-row', list).some((r) => !r.hidden);
            list.hidden = !any;
            if (label && label.classList.contains('section-label')) label.hidden = !any;
        });
        if (VA.none) {
            VA.none.hidden = !(q && !shown);
            if (!VA.none.hidden) VA.none.textContent = `No names match “${VA.filter.value.trim()}”.`;
        }
    }

    function buildVariables() {
        const mount = DOM.id('mount-variables');
        if (!mount) return;
        DOM.empty(mount);
        VA.root = mount;
        VA.hint = DOM.create('p', { className: 'pane-hint lib-var-hint' });
        VA.filter = filterInput('Filter names', 'Filter variables and functions');
        VA.body = DOM.create('div', { className: 'lib-var-body' });
        mount.append(VA.hint, VA.filter, VA.body);

        DOM.on(VA.filter, 'input', DOM.debounce(() => {
            VA.query = VA.filter.value.trim().toLowerCase();
            applyVariableFilter();
        }, FILTER_DELAY));
        DOM.on(VA.filter, 'keydown', (e) => {
            if (e.key === 'Escape' && VA.filter.value) {
                e.preventDefault();
                e.stopPropagation();
                VA.filter.value = '';
                VA.query = '';
                applyVariableFilter();
            }
        });
        DOM.on(VA.body, 'click', (e) => {
            const jump = e.target.closest('.lib-line-chip');
            if (jump) {
                if (worksheet('goToLine')) WorksheetUI.goToLine(Number(jump.dataset.line));
                return;
            }
            const b = e.target.closest('.lib-var');
            if (b && b.dataset.insert) insert(b.dataset.insert);
        });
        renderVariables(true);
    }

    /* ══════════════════════════════════════════════════════════
       REFERENCE
       ══════════════════════════════════════════════════════════ */

    const RF = { query: '', cat: 'all', exampleKey: '', examples: new Map(), items: null };

    /** Every reference entry as one flat, searchable list. */
    function referenceItems() {
        if (RF.items) return RF.items;
        const ref = window.MathEngine && MathEngine.reference;
        const items = [];
        if (!ref) return (RF.items = items);
        const unitLabels = Object.create(null);
        try {
            MathEngine.units.categories().forEach((c) => { unitLabels[c.id] = c.label; });
        } catch (_err) { /* labels fall back to the id */ }

        (ref.functions || []).forEach((f) => items.push({
            type: 'functions',
            group: f.category || 'Functions',
            title: f.signature || `${f.name}()`,
            description: f.description || '',
            example: f.example || '',
            insert: `${f.name}(`,
            spaced: false,
            search: `${f.name} ${f.signature} ${f.description} ${f.category}`.toLowerCase()
        }));
        (ref.constants || []).forEach((c) => items.push({
            type: 'constants',
            group: 'Constants',
            title: c.name,
            description: c.description || '',
            example: c.name,
            value: c.value,
            insert: c.name,
            spaced: false,
            search: `${c.name} ${c.description} constant`.toLowerCase()
        }));
        (ref.units || []).forEach((u) => {
            const aliases = (u.aliases || []).slice(0, 6);
            items.push({
                type: 'units',
                group: unitLabels[u.category] || u.category || 'Units',
                title: u.symbol,
                description: `${u.name}${aliases.length ? ` · also ${aliases.join(', ')}` : ''}`,
                example: '',
                insert: u.symbol,
                spaced: true,
                search: `${u.symbol} ${u.name} ${(u.aliases || []).join(' ')} ${u.category} unit`.toLowerCase()
            });
        });
        (ref.keywords || []).forEach((k) => {
            const w = k.word;
            let ins = k.example;
            let spaced = false;
            if (/^[a-z%]+$/i.test(w)) {
                ins = w;
                spaced = true;
            } else if (w === 'lineN') {
                ins = 'line';
            } else if (w === 'true / false') {
                ins = 'true';
                spaced = true;
            } else if (w === 'sq / cu') {
                ins = 'sq';
                spaced = true;
            }
            items.push({
                type: 'keywords',
                group: 'Keywords and syntax',
                title: w,
                description: k.description || '',
                example: k.example || '',
                insert: ins,
                spaced,
                search: `${w} ${k.description} ${k.example} keyword`.toLowerCase()
            });
        });
        RF.items = items;
        return items;
    }

    function exampleResult(example) {
        if (!example || !window.MathEngine) return '';
        const opts = State.engineOptions();
        const key = JSON.stringify(opts);
        if (key !== RF.exampleKey) {
            RF.examples.clear();
            RF.exampleKey = key;
        }
        if (RF.examples.has(example)) return RF.examples.get(example);
        let text = '';
        try {
            // Headings, notes, and definitions have no single result to show.
            if (!/^\s*(#|\/\/)/.test(example) && !/^[\p{L}_][\p{L}\d_]*\s*\([^)]*\)\s*=/u.test(example)) {
                const r = MathEngine.evaluate(example, opts);
                if (r && (r.kind === 'value' || r.kind === 'assignment')) text = r.display || r.plain || '';
            }
        } catch (_err) {
            text = '';
        }
        RF.examples.set(example, text);
        return text;
    }

    function refRow(item, index) {
        const row = DOM.create('div', { className: 'lib-ref-row', data: { type: item.type } });
        const main = DOM.create('button', {
            className: 'lib-ref',
            attrs: {
                type: 'button',
                'data-index': String(index),
                'data-fkey': `ref:${item.type}:${item.title}`,
                'aria-label': `Insert ${item.insert.trim()} at the caret — ${shorten(item.description, 80)}`,
                title: `Insert “${item.insert.trim()}” at the caret`
            }
        });
        main.appendChild(DOM.create('span', { className: 'lib-ref-sig', text: item.title }));
        if (item.description) main.appendChild(DOM.create('span', { className: 'lib-ref-desc', text: item.description }));
        if (item.example && item.type !== 'constants') {
            const result = exampleResult(item.example);
            const ex = DOM.create('span', { className: 'lib-ref-ex' });
            ex.appendChild(DOM.create('span', { className: 'lib-ref-ex-in', text: item.example }));
            if (result) ex.appendChild(DOM.create('span', { className: 'lib-ref-ex-out', text: `→ ${result}` }));
            main.appendChild(ex);
        } else if (item.type === 'constants') {
            const shown = State.formatNumber(item.value);
            main.appendChild(DOM.create('span', { className: 'lib-ref-ex' }))
                .appendChild(DOM.create('span', { className: 'lib-ref-ex-out', text: `= ${shown}` }));
        }
        row.appendChild(main);
        if (item.example && item.type !== 'units') {
            row.appendChild(DOM.create('button', {
                className: 'icon-action lib-ref-add',
                html: PLUS_ICON,
                attrs: {
                    type: 'button',
                    'data-example': String(index),
                    'data-fkey': `refadd:${item.type}:${item.title}`,
                    'aria-label': `Add the example ${item.example} as a new line`,
                    title: `Add “${shorten(item.example, 40)}” as a new last line`
                }
            }));
        }
        return row;
    }

    function renderReference() {
        if (!RF.root) return;
        const fkey = focusKey(RF.root);
        const items = referenceItems();
        const words = RF.query.split(/\s+/).filter(Boolean);
        const shown = items.map((item, index) => ({ item, index })).filter(({ item }) => (
            (RF.cat === 'all' || item.type === RF.cat) && words.every((w) => item.search.includes(w))
        ));

        DOM.$$('.chip-btn', RF.chips).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === RF.cat)));

        DOM.empty(RF.list);
        if (!items.length) {
            RF.list.appendChild(emptyState('The reference did not load', 'The math engine is missing, so there is nothing to list. Reload the page to try again.'));
            RF.count.textContent = '';
            return;
        }
        const counts = { functions: 0, units: 0, constants: 0, keywords: 0 };
        items.forEach((i) => { counts[i.type]++; });
        RF.count.textContent = RF.query
            ? `${plural(shown.length, 'match', 'matches')} for “${shorten(RF.search.value.trim(), 30)}”`
            : `${plural(counts.functions, 'function')} · ${plural(counts.units, 'unit')} · ${plural(counts.constants, 'constant')} · ${plural(counts.keywords, 'keyword')}`;

        if (!shown.length) {
            const clear = btn('btn btn-secondary btn-sm', 'Show everything');
            DOM.on(clear, 'click', () => {
                RF.search.value = '';
                RF.query = '';
                setReferenceCategory('all');
                RF.search.focus();
            });
            RF.list.appendChild(emptyState(
                'Nothing matches',
                `No ${RF.cat === 'all' ? 'entries' : RF.cat} match “${shorten(RF.search.value.trim(), 30)}”. Try a function like sqrt, a unit like km, or a word like percent.`,
                [clear]
            ));
            return;
        }

        const frag = document.createDocumentFragment();
        let group = null;
        let box = null;
        shown.forEach(({ item, index }) => {
            const g = `${item.type}:${item.group}`;
            if (g !== group) {
                group = g;
                frag.appendChild(DOM.create('p', { className: 'section-label lib-ref-group', text: item.group }));
                box = DOM.create('div', { className: 'lib-ref-list' });
                frag.appendChild(box);
            }
            box.appendChild(refRow(item, index));
        });
        RF.list.appendChild(frag);
        restoreFocus(RF.root, fkey, () => DOM.$('.lib-ref', RF.list));
    }

    function setReferenceCategory(cat) {
        const ok = REF_CATEGORIES.some(([id]) => id === cat);
        RF.cat = ok ? cat : 'all';
        if (window.State && State.setPane) State.setPane('library', { refCategory: RF.cat });
        renderReference();
        return RF.cat;
    }

    function buildReference() {
        const mount = DOM.id('mount-reference');
        if (!mount) return;
        DOM.empty(mount);
        RF.root = mount;
        RF.search = filterInput('Search: sqrt, km, percent…', 'Search functions, units, constants, and keywords');
        RF.chips = DOM.create('div', { className: 'chip-row lib-ref-chips', attrs: { role: 'group', 'aria-label': 'Show' } });
        REF_CATEGORIES.forEach(([id, label]) => {
            RF.chips.appendChild(btn('chip-btn', label, { 'data-cat': id, 'aria-pressed': 'false', title: `Show ${id === 'all' ? 'everything' : label.toLowerCase()}` }));
        });
        RF.count = DOM.create('p', { className: 'pane-hint lib-ref-count', attrs: { 'aria-live': 'polite' } });
        RF.list = DOM.create('div', { className: 'lib-ref-body' });
        mount.append(RF.search, RF.chips, RF.count, RF.list);

        const pref = window.State && State.pane ? State.pane('library') : {};
        if (pref && typeof pref.refCategory === 'string' && REF_CATEGORIES.some(([id]) => id === pref.refCategory)) {
            RF.cat = pref.refCategory;
        }

        DOM.on(RF.search, 'input', DOM.debounce(() => {
            RF.query = RF.search.value.trim().toLowerCase().slice(0, 120);
            renderReference();
        }, FILTER_DELAY));
        DOM.on(RF.search, 'keydown', (e) => {
            if (e.key === 'Escape' && RF.search.value) {
                e.preventDefault();
                e.stopPropagation();
                RF.search.value = '';
                RF.query = '';
                renderReference();
            }
        });
        DOM.on(RF.chips, 'click', (e) => {
            const chip = e.target.closest('.chip-btn');
            if (chip) setReferenceCategory(chip.dataset.cat);
        });
        DOM.on(RF.list, 'click', (e) => {
            const items = referenceItems();
            const add = e.target.closest('.lib-ref-add');
            if (add) {
                const item = items[Number(add.dataset.example)];
                if (item && item.example) appendLine(item.example);
                return;
            }
            const b = e.target.closest('.lib-ref');
            if (!b) return;
            const item = items[Number(b.dataset.index)];
            if (!item) return;
            if (item.spaced) insertSpaced(item.insert);
            else insert(item.insert);
        });
        renderReference();
    }

    /* ══════════════════════════════════════════════════════════
       HISTORY
       ══════════════════════════════════════════════════════════ */

    const HI = { query: '' };

    /** The result text worth inserting (no '≈ ' marker). */
    function insertableResult(h) {
        return String(h.plain || h.display || '').replace(/^≈\s*/, '');
    }

    // A worksheet line holds 2,000 characters; leave room for what is already on it.
    const LINE_ROOM = 1900;

    /**
     * Insert a History result at the caret. A result too long for one
     * line (1000! has 2,568 digits) is not typed: its calculation goes in
     * instead (when that fits) and the full value goes to the clipboard.
     */
    async function insertHistory(h) {
        const value = insertableResult(h);
        if (value.length <= LINE_ROOM) return insert(value);
        const expr = String(h.expr || '').trim();
        const fits = expr && expr.length <= LINE_ROOM;
        if (fits) insert(/^[\p{L}\p{N}_.]+!?$/u.test(expr) ? expr : `(${expr})`);
        const copied = await DOM.copyText(value);
        const size = `${value.length.toLocaleString('en-US')} characters`;
        const typed = fits ? `its calculation, ${shorten(expr, 40)}, was typed instead` : 'nothing was typed';
        notify(`That result is ${size} long — more than one line holds — so ${typed}. ${copied ? 'The full value is on the clipboard.' : 'Use the copy button to copy the full value.'}`,
            copied ? 'info' : 'warning', 6500);
        return fits;
    }

    function historyRow(h) {
        const row = DOM.create('article', { className: 'list-row lib-hist', data: { id: h.id } });
        const main = DOM.create('button', {
            className: 'lib-hist-main',
            attrs: {
                type: 'button',
                'data-act': 'insert',
                'data-fkey': `${h.id}:insert`,
                'aria-label': `Insert ${shorten(insertableResult(h), 40)} at the caret — from ${shorten(h.expr, 40)}`,
                title: `Insert ${shorten(insertableResult(h), 60)} at the caret`
            }
        });
        main.append(
            DOM.create('span', { className: 'lib-hist-expr', text: h.expr }),
            DOM.create('span', { className: 'lib-hist-result', text: `= ${h.display}` })
        );
        const foot = DOM.create('div', { className: 'lib-hist-foot' });
        const meta = DOM.create('p', { className: 'row-meta lib-hist-meta' });
        if (h.sheetName) meta.appendChild(DOM.create('span', { className: 'lib-hist-sheet', text: `${h.sheetName} · ` }));
        meta.appendChild(DOM.create('span', { className: 'lib-time', text: relTime(h.at), data: { at: String(h.at) } }));
        const copy = iconAction(COPY_ICON, `Copy ${shorten(insertableResult(h), 40)}`, { 'data-act': 'copy', 'data-fkey': `${h.id}:copy` });
        foot.append(meta, copy);
        row.append(main, foot);
        return row;
    }

    function applyHistoryFilter() {
        const q = HI.query;
        let shown = 0;
        DOM.$$('.lib-hist', HI.list).forEach((row) => {
            const show = !q || row.textContent.toLowerCase().includes(q);
            row.hidden = !show;
            if (show) shown++;
        });
        HI.none.hidden = !(q && !shown && HI.total);
        if (!HI.none.hidden) HI.none.textContent = `No saved results match “${HI.filter.value.trim()}”.`;
    }

    function renderHistory() {
        if (!HI.list) return;
        const fkey = focusKey(HI.root);
        const history = State.history();
        const size = State.settings().historySize;
        HI.total = history.length;

        DOM.empty(HI.list);
        const frag = document.createDocumentFragment();
        history.forEach((h) => frag.appendChild(historyRow(h)));
        HI.list.appendChild(frag);

        const empty = !history.length;
        HI.empty.hidden = !empty;
        HI.list.hidden = empty;
        HI.bar.hidden = empty;
        HI.note.hidden = empty;
        HI.note.textContent = `Newest first · ${history.length.toLocaleString('en-US')} of ${size.toLocaleString('en-US')} kept (change the limit in Settings). Click a result to type it at the caret.`;
        applyHistoryFilter();
        restoreFocus(HI.root, fkey, () => DOM.$('.lib-hist-main', HI.list) || HI.emptyButton);
    }

    async function clearHistory() {
        const n = State.history().length;
        if (!n) return;
        const ok = await Dialogs.confirm({
            title: 'Clear History?',
            message: `This removes all ${plural(n, 'saved result')} from History. Your sheets are not changed.\n\nThis cannot be undone.`,
            confirmLabel: 'Clear History',
            danger: true
        });
        if (!ok) return;
        State.clearHistory();
        notify('History cleared', 'info', 1600);
    }

    function buildHistory() {
        const mount = DOM.id('mount-history');
        if (!mount) return;
        DOM.empty(mount);
        HI.root = mount;

        HI.bar = DOM.create('div', { className: 'lib-bar' });
        HI.filter = filterInput('Filter results', 'Filter History');
        const clear = btn('btn btn-danger-outline btn-sm', 'Clear all', { title: 'Remove every saved result from History', 'aria-label': 'Clear all of History' });
        const barActions = DOM.create('div', { className: 'lib-bar-actions' });
        barActions.appendChild(clear);
        HI.bar.append(HI.filter, barActions);
        HI.note = DOM.create('p', { className: 'pane-hint lib-hist-note' });

        const goWork = btn('btn btn-secondary btn-sm', 'Add the current line', { title: 'Add the result on the worksheet caret line to History (Ctrl+Enter)' });
        DOM.on(goWork, 'click', () => {
            if (worksheet('addToHistory')) WorksheetUI.addToHistory();
        });
        HI.emptyButton = goWork;
        HI.empty = emptyState(
            'No saved results yet',
            'Put the caret on a worksheet line and press Ctrl + Enter, or choose Add to History in the Result card. Saved results stay here when you edit or delete the sheet.',
            [goWork]
        );
        HI.list = DOM.create('div', { className: 'list lib-history', attrs: { 'aria-label': 'Saved results, newest first' } });
        HI.none = DOM.create('p', { className: 'pane-hint lib-none' });
        HI.none.hidden = true;
        mount.append(HI.bar, HI.note, HI.empty, HI.list, HI.none);

        DOM.on(clear, 'click', clearHistory);
        DOM.on(HI.filter, 'input', DOM.debounce(() => {
            HI.query = HI.filter.value.trim().toLowerCase();
            applyHistoryFilter();
        }, FILTER_DELAY));
        DOM.on(HI.filter, 'keydown', (e) => {
            if (e.key === 'Escape' && HI.filter.value) {
                e.preventDefault();
                e.stopPropagation();
                HI.filter.value = '';
                HI.query = '';
                applyHistoryFilter();
            }
        });
        DOM.on(HI.list, 'click', (e) => {
            const row = e.target.closest('.lib-hist');
            const b = e.target.closest('button[data-act]');
            if (!row || !b) return;
            const h = State.history().find((x) => x.id === row.dataset.id);
            if (!h) return;
            const value = insertableResult(h);
            if (b.dataset.act === 'copy') ToolApp.copy(value, shorten(value, 32), b);
            else if (b.dataset.act === 'insert') insertHistory(h);
        });
        renderHistory();
    }

    /* ── Shared refresh ────────────────────────────────────── */

    function refreshTimes() {
        if (document.hidden) return;
        DOM.$$('.lib-time[data-at]', document).forEach((t) => {
            const text = relTime(Number(t.dataset.at));
            if (t.textContent !== text) t.textContent = text;
        });
    }

    function subscribe() {
        State.on('sheets', (p) => renderSheets(p || {}));
        State.on('active', () => {
            renderSheets();
            renderVariables();
        });
        const pendingRows = new Set();
        const flushRows = DOM.debounce(() => {
            pendingRows.forEach((id) => refreshSheetRow(id));
            pendingRows.clear();
        }, 400);
        State.on('text', (p) => {
            if (!p || !p.id) return;
            pendingRows.add(p.id);
            flushRows();
        });
        State.on('results', () => renderVariables());
        State.on('history', renderHistory);
        State.on('settings', (p) => {
            const changed = p && Array.isArray(p.changed) ? p.changed : [];
            if (changed.some((k) => ['angle', 'precision', 'notation', 'thousands', 'fractions', 'implicitMult'].includes(k))) {
                RF.exampleKey = '';
                renderReference();
            }
            if (changed.includes('historySize')) renderHistory();
        });
        State.on('reset', () => {
            RF.cat = 'all';
            renderSheets();
            renderVariables(true);
            renderReference();
            renderHistory();
        });
        setInterval(refreshTimes, 30000);
        document.addEventListener('visibilitychange', refreshTimes);
    }

    function init() {
        if (!window.State) return;
        buildSheets();
        buildVariables();
        buildReference();
        buildHistory();
        subscribe();
    }

    window.LibraryUI = {
        init,
        newSheet,
        openSheet,
        importFiles,
        markdownFor,
        setReferenceCategory,
        insert,
        appendLine,
        renderSheets,
        renderHistory
    };
})();
