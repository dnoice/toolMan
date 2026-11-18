/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ConvertManBoot (convertMan Edition - v1.0)
 *     - File Name: app.js
 *     - Relative Path: tools/convertman/js/app.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Starts convertMan: one ToolApp.boot() call that restores saved state,
 *     brings up the rails and dialogs, initialises every pane module, and
 *     registers the converter shortcuts. It also runs the shell's own chrome
 *     (format lists, swap, Convert, stat pills, section counts, footers, the
 *     secrets notice) from State, and gives each action a working fallback
 *     so the page stays usable if a pane module is missing.
 *
 * ✒ Key Features:
 *     - Boots the eight pane modules in contract order; a missing or failing
 *       module is logged and skipped, never fatal
 *     - Shortcuts: Ctrl+Enter convert now, Ctrl+Shift+C copy the output,
 *       Ctrl+Alt+X swap formats (also matched by physical key, so macOS
 *       Option characters still work), Ctrl+O open a file into the input,
 *       Ctrl+Shift+D download the output; convert and copy stay out of the
 *       side panes' own fields
 *     - Every action asks ConverterUI first (output, openFile, loadFile,
 *       focusInput) and falls back to State and a built-in file reader when
 *       the module or method is missing
 *     - Format lists filled from the loaded format modules, grouped by kind,
 *       with Auto-detect first and the detected format named beside it
 *     - Convert button turns primary when the next conversion waits for it
 *       (live conversion off, or input over 512 KB)
 *     - Chrome sync from State events: stat pills (input and output size,
 *       records, status with words, never colour alone), rail counts,
 *       Library and Converter footers (including whether the input is kept
 *       in this browser), and a toast when another tab's changes merge in
 *     - Secrets notice in the Input card with a one-click Stop remembering
 *       input that removes the stored copy at once
 *     - A file dropped anywhere outside a pane's own drop zone opens in the
 *       converter; binary files are refused with a pointer to the Files pane
 *     - Settings binder with live previews (indent, time zone, number
 *       format), inline checks that hold Save on an unusable value, a Recent
 *       trim warning, and a guarded reset
 *     - Backup import: a wrong or oversized file is explained in plain words
 *       before anything is read into State; the report says what was added,
 *       and a confirm comes before the backup's differing settings apply
 *     - The Help format table is rebuilt from each module's own notes
 *
 * ✒ Usage Instructions:
 *     Load last, after the shared libraries, ../mathman/js/engine.js, the
 *     format modules, js/convert.js, the pure libraries, js/state.js, and
 *     every js/ui/*.js module. Nothing to call: the IIFE boots on
 *     DOMContentLoaded through ToolApp.boot(). A module that binds one of
 *     the shell's toolbar controls itself should set data-wired="true" on
 *     that element during init() so the fallback here stays out of the way.
 *
 * ✒ Examples:
 *     Ctrl+Enter                   → State.convert({ force: true }); "Converted JSON to YAML in 2 ms"
 *     Ctrl+Shift+C                 → copies the output and toasts "Copied YAML output (412 bytes)"
 *     Ctrl+Alt+X                   → State.swap(); the output becomes the input
 *     Ctrl+Shift+D                 → downloads "data.yaml" (named after the opened file)
 *     Stat pills                   → 'In: 1.2 KB', 'Out: 980 bytes', 'Records: 3', 'Converted · 2 ms'
 *     ConvertManApp.sync()         → re-reads State into the lists, pills, counts, and footers
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, dom.js, storage.js, loader.js,
 *       workbench.js, dialogs.js, toolapp.js; js/state.js; optional
 *       js/convert.js (window.Convert), js/files.js (window.FileKit), and
 *       the js/ui/*.js pane modules
 *     - Compatible platforms: all evergreen browsers
 *     - Security: file names and user text reach the page only through
 *       textContent; dropped files are sniffed from their bytes, not their
 *       names; downloads use a Blob and a sanitised name
 *     - Limitations: the file fallback reads text as UTF-8; a module that
 *       binds a toolbar control without setting data-wired would run two
 *       handlers
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    if (window.Loader) {
        Loader.messages = ['Unpacking the formats…', 'Matching every bracket…', 'Lining up the arrows…', 'Almost ready…'];
    }

    const MODULES = [
        'ConverterUI', 'LibraryUI',
        'TimeUI', 'UnitsUI',
        'EverydayUI', 'NumbersUI',
        'ImagesUI', 'FilesUI'
    ];

    const KIND_GROUPS = [['tree', 'Structured data'], ['table', 'Tables'], ['flat', 'Keys and values']];

    // Backups larger than this are refused before they are read.
    const MAX_BACKUP_BYTES = 30 * 1024 * 1024;
    const SNIFF_BYTES = 4096;

    const SETTING_HINTS = {
        recentSize: 'Conversions to keep in Recent must be a whole number from 10 to 200.',
        timeZone: 'Choose a time zone from the list.'
    };

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word, many) => `${n.toLocaleString('en-US')} ${n === 1 ? word : (many || `${word}s`)}`;

    function joinList(parts) {
        if (parts.length < 2) return parts.join('');
        return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    }

    function setText(id, text) {
        const el = DOM.id(id);
        if (el && el.textContent !== text) el.textContent = text;
        return el;
    }

    function setTitle(el, text) {
        if (el && el.title !== text) el.title = text;
    }

    function shorten(text, max = 40) {
        const s = String(text);
        return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    const bytesText = (n) => (window.State && typeof State.formatBytes === 'function' ? State.formatBytes(n) : `${n} bytes`);
    const label = (id) => State.formatLabel(id);

    /* ── Module access (never throws) ──────────────────────── */

    /** A read-only query: { ok, value }; a missing method or a throw means ok:false (use the fallback). */
    function query(mod, method, ...args) {
        const m = window[mod];
        if (!m || typeof m[method] !== 'function') return { ok: false };
        try {
            return { ok: true, value: m[method](...args) };
        } catch (err) {
            console.error(`[convertMan] ${mod}.${method} failed:`, err);
            return { ok: false };
        }
    }

    /** An action with side effects: true when the module handled it (even if it then threw). */
    function invoke(mod, method, ...args) {
        const m = window[mod];
        if (!m || typeof m[method] !== 'function') return false;
        try {
            m[method](...args);
        } catch (err) {
            console.error(`[convertMan] ${mod}.${method} failed:`, err);
        }
        return true;
    }

    /**
     * True while focus is in a field of a side pane (a Time value, a Units
     * amount). Convert and copy act on the converter, so they stay out of
     * those fields; the converter's own fields are fine.
     */
    function inOtherField() {
        const active = document.activeElement;
        const stage = DOM.id('panel-stage');
        const inField = Boolean(active) && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
        return inField && !(stage && stage.contains(active));
    }

    /* ── Output helpers ────────────────────────────────────── */

    /** The output text: ConverterUI's when it has one, else the last result's. */
    function outputText() {
        const q = query('ConverterUI', 'output');
        if (q.ok && typeof q.value === 'string') return q.value;
        const r = State.result();
        return r && typeof r.output === 'string' ? r.output : '';
    }

    /** Why there is nothing to copy or download, or '' when there is output. */
    function outputProblem(text) {
        if (text) return '';
        const r = State.result();
        if (!State.input().text.trim()) return 'There is no output yet. Paste or type something in the input first.';
        if (r && r.error) return `There is no output: ${r.error.message}`;
        if (r && r.stale) return 'There is no output yet. Press Convert (Ctrl + Enter) first.';
        return 'There is no output yet.';
    }

    function moduleInfo(id) {
        return State.formats().find((f) => f.id === id) || null;
    }

    /** A safe download name: the opened file's name with the output's extension, or "converted.ext". */
    function downloadName(ext) {
        const input = State.input();
        const base = (input.name || '').replace(/\.[A-Za-z0-9]{1,10}$/, '') || 'converted';
        if (window.FileKit && typeof FileKit.safeName === 'function') {
            try {
                const name = FileKit.safeName(base, ext);
                if (typeof name === 'string' && name) return name;
            } catch (err) {
                console.error('[convertMan] FileKit.safeName failed:', err);
            }
        }
        // eslint-disable-next-line no-control-regex
        let clean = base.replace(/[\u0000-\u001F\u007F<>:"/\\|?*]+/g, '-').replace(/^[\s.-]+|[\s.]+$/g, '').slice(0, 80);
        if (!clean || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)) clean = 'converted';
        return `${clean}.${ext}`;
    }

    /* ── Files (fallback when ConverterUI is missing) ──────── */

    let filePicker = null;

    function looksBinary(bytes) {
        const n = Math.min(bytes.length, SNIFF_BYTES);
        for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
        return false;
    }

    /** { text: boolean, label } from the file's first bytes (FileKit when present). */
    function sniffKind(bytes) {
        if (window.FileKit && typeof FileKit.sniff === 'function') {
            try {
                const s = FileKit.sniff(bytes);
                if (s && typeof s === 'object') {
                    const textual = s.kind === 'text' || /svg|xml|json/.test(String(s.mime || ''));
                    return { text: textual, label: typeof s.label === 'string' ? s.label : 'binary' };
                }
            } catch (err) {
                console.error('[convertMan] FileKit.sniff failed:', err);
            }
        }
        return looksBinary(bytes) ? { text: false, label: 'binary' } : { text: true, label: 'text' };
    }

    /** A format id from a file name's extension, or 'auto'. */
    function formatFromName(name) {
        const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ''));
        if (!m) return /(^|[\\/])\.env(\.|$)/i.test(String(name || '')) ? 'env' : 'auto';
        const ext = m[1].toLowerCase();
        const hit = State.formats().find((f) => f.canParse && f.extensions.map((e) => String(e).toLowerCase()).includes(ext));
        return hit ? hit.id : 'auto';
    }

    async function fallbackLoad(file) {
        if (!file) return false;
        const name = shorten(file.name || 'That file', 60);
        if (file.size > State.LIMITS.fileBytes) {
            notify(`“${name}” is ${bytesText(file.size)}; convertMan opens files up to ${bytesText(State.LIMITS.fileBytes)}.`, 'warning', 5000);
            return false;
        }
        try {
            const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
            const kind = sniffKind(head);
            if (!kind.text) {
                notify(`“${name}” is a ${kind.label} file, not text, so the converter can't read it. Open it in the Files or Images pane instead.`, 'warning', 6000);
                return false;
            }
            const text = await file.text();
            if (!State.setInput(text, { name: file.name || '', from: formatFromName(file.name), source: 'file' })) {
                notify(State.lastError || 'That file could not be opened.', 'warning', 5000);
                return false;
            }
            notify(`Opened “${name}” (${bytesText(file.size)})`, 'success', 1800);
            return true;
        } catch (err) {
            console.error('[convertMan] reading a file failed:', err);
            notify(`“${name}” could not be read. Try opening it again.`, 'error', 4000);
            return false;
        }
    }

    function loadFile(file) {
        if (invoke('ConverterUI', 'loadFile', file)) return;
        fallbackLoad(file);
    }

    function openFallbackPicker() {
        if (!filePicker) {
            filePicker = DOM.create('input', { attrs: { type: 'file', hidden: 'hidden', 'aria-hidden': 'true', tabindex: '-1' } });
            document.body.appendChild(filePicker);
            DOM.on(filePicker, 'change', () => {
                const f = filePicker.files && filePicker.files[0];
                filePicker.value = '';
                if (f) fallbackLoad(f);
            });
        }
        filePicker.click();
    }

    /* ── Actions ───────────────────────────────────────────── */

    let working = false;

    function reportConvert(r) {
        if (!r) return;
        if (r.empty) {
            notify('Paste or type something in the input first, or open a file (Ctrl + O).', 'info', 2600);
        } else if (r.error) {
            const where = Number.isInteger(r.error.line) ? ` (line ${r.error.line}${Number.isInteger(r.error.column) ? `, column ${r.error.column}` : ''})` : '';
            notify(`Could not convert${where}: ${shorten(r.error.message, 160)}`, 'warning', 5000);
        } else if (r.ok) {
            const ms = r.stats && Number.isFinite(r.stats.ms) ? ` in ${Math.max(0, Math.round(r.stats.ms))} ms` : '';
            const warn = r.warnings.length ? ` — ${plural(r.warnings.length, 'warning')}` : '';
            notify(`Converted ${label(r.from)} to ${label(r.to)}${ms}${warn}`, r.warnings.length ? 'info' : 'success', 2000);
        }
    }

    const actions = {
        /** Convert now, whatever the size (a big input gets a "Converting…" beat first). */
        convertNow() {
            if (working) return;
            const live = State.liveStatus();
            if (live.reason === 'too-big') {
                reportConvert(State.convert({ force: true }));
                return;
            }
            if (live.bytes > 256 * 1024) {
                working = true;
                setStatus('working', 'Converting…', `Converting ${bytesText(live.bytes)} — this can take a moment`);
                const btn = DOM.id('btn-convert');
                if (btn) btn.disabled = true;
                setTimeout(() => {
                    try {
                        reportConvert(State.convert({ force: true }));
                    } finally {
                        working = false;
                        if (btn) btn.disabled = false;
                        syncResult();
                    }
                }, 40);
                return;
            }
            reportConvert(State.convert({ force: true }));
        },

        /** Copy the output (ConverterUI's text first). */
        copyOutput(button) {
            const text = outputText();
            const problem = outputProblem(text);
            if (problem) {
                notify(problem, 'info', 3600);
                return Promise.resolve(false);
            }
            const r = State.result();
            if (r && r.stale) notify('Heads up: the output is from an earlier input. Press Convert (Ctrl + Enter) to bring it up to date.', 'warning', 3600);
            const btn = button instanceof Element ? button : null;
            return ToolApp.copy(text, `${label(State.input().to)} output (${bytesText(State.byteLength(text))})`, btn);
        },

        swap() {
            const r = State.swap();
            if (!r) {
                notify(State.lastError || 'The formats could not be swapped.', 'warning', 4200);
                return null;
            }
            notify(`Now converting ${label(r.from)} to ${label(r.to)}${r.usedOutput ? ' — the output is the new input' : ''}`, 'info', 2200);
            return r;
        },

        openFile() {
            if (invoke('ConverterUI', 'openFile')) return;
            openFallbackPicker();
        },

        loadFile,

        /** Download the output as a file named after the input, with the output format's extension. */
        downloadOutput() {
            const text = outputText();
            const problem = outputProblem(text);
            if (problem) {
                notify(problem, 'info', 3600);
                return false;
            }
            const to = State.input().to;
            const info = moduleInfo(to);
            const ext = info && info.extensions.length ? String(info.extensions[0]).replace(/[^A-Za-z0-9]/g, '') || 'txt' : 'txt';
            const mime = info && /^[a-z]+\/[A-Za-z0-9.+-]+$/.test(info.mime) ? info.mime : 'text/plain';
            const name = downloadName(ext);
            const ok = ToolApp.download(name, text, mime);
            if (ok) notify(`Downloaded ${name}`, 'success', 1800);
            return ok;
        },

        focusInput() {
            if (invoke('ConverterUI', 'focusInput')) return;
            const field = DOM.$('#mount-input textarea');
            if (field) field.focus();
        },

        stopRemembering() {
            const ok = State.stopRememberingInput();
            notify(ok
                ? 'convertMan no longer remembers the input, and the stored copy is gone. Turn Remember the input back on in Settings.'
                : 'Remember the input is off, but this browser would not save the change. Close the tab to clear it.', ok ? 'success' : 'warning', 5000);
        }
    };

    /* ── Toolbar ───────────────────────────────────────────── */

    function claim(id, event, handler) {
        const el = DOM.id(id);
        if (!el || el.dataset.wired === 'true') return null;
        el.dataset.wired = 'true';
        DOM.on(el, event, handler);
        return el;
    }

    function optionEl(value, text) {
        return DOM.create('option', { text, attrs: { value } });
    }

    /** Fill From (Auto-detect first, readable formats) and To (writable formats), grouped by kind. */
    function buildFormatSelects() {
        const from = DOM.id('select-from');
        const to = DOM.id('select-to');
        const list = State.formats();
        const fill = (select, items, lead) => {
            if (!select) return;
            DOM.empty(select);
            if (lead) select.appendChild(lead);
            const kinds = KIND_GROUPS.map(([k]) => k);
            KIND_GROUPS.forEach(([kind, title]) => {
                const group = items.filter((f) => f.kind === kind);
                if (!group.length) return;
                const og = DOM.create('optgroup', { attrs: { label: title } });
                group.forEach((f) => og.appendChild(optionEl(f.id, f.label)));
                select.appendChild(og);
            });
            items.filter((f) => !kinds.includes(f.kind)).forEach((f) => select.appendChild(optionEl(f.id, f.label)));
        };
        fill(from, list.filter((f) => f.canParse), optionEl('auto', 'Auto-detect'));
        fill(to, list.filter((f) => f.canStringify));
        syncFormatSelects();
    }

    function syncFormatSelects() {
        const input = State.input();
        const from = DOM.id('select-from');
        const to = DOM.id('select-to');
        if (from && from.value !== input.from) from.value = input.from;
        if (to && to.value !== input.to) to.value = input.to;
        syncAutoLabel();
    }

    /** "Auto-detect · JSON" once a format was detected. */
    function syncAutoLabel() {
        const from = DOM.id('select-from');
        const auto = from ? DOM.$('option[value="auto"]', from) : null;
        if (!auto) return;
        const r = State.result();
        // A narrow list (phones) shows the shorter "Auto · JSON" so the format stays readable.
        const lead = from.clientWidth && from.clientWidth < 180 ? 'Auto' : 'Auto-detect';
        const text = State.input().from === 'auto' && r && r.detected && r.from ? `${lead} · ${label(r.from)}` : 'Auto-detect';
        if (auto.textContent !== text) auto.textContent = text;
        const pct = r && r.detected && r.candidates && r.candidates[0] ? Math.round(r.candidates[0].confidence * 100) : null;
        setTitle(from, State.input().from === 'auto' && r && r.detected && r.from
            ? `Auto-detect read the input as ${label(r.from)}${pct !== null ? ` (${pct}% sure)` : ''} — choose a format to override it`
            : 'The input\'s format — Auto-detect works it out for you');
    }

    function wireToolbar() {
        claim('select-from', 'change', (e) => {
            if (!State.setFormats(e.currentTarget.value, null)) {
                notify(State.lastError || 'That input format is not available.', 'warning', 3600);
                syncFormatSelects();
            }
        });
        claim('select-to', 'change', (e) => {
            if (!State.setFormats(null, e.currentTarget.value)) {
                notify(State.lastError || 'That output format is not available.', 'warning', 3600);
                syncFormatSelects();
            }
        });
        claim('btn-swap', 'click', () => actions.swap());
        claim('btn-convert', 'click', () => actions.convertNow());
        claim('btn-stop-remembering', 'click', () => actions.stopRemembering());
    }

    /* ── Chrome sync: pills, counts, footers, notice ────────── */

    function setStatus(state, text, title) {
        const pill = setText('stat-status', text);
        if (!pill) return;
        pill.dataset.state = state;
        setTitle(pill, title || text);
    }

    function syncConvertButton() {
        const btn = DOM.id('btn-convert');
        if (!btn) return;
        const live = State.liveStatus();
        btn.classList.toggle('btn-primary', !live.live);
        btn.classList.toggle('btn-secondary', live.live);
        const titles = {
            '': 'Convert now (Ctrl+Enter) — convertMan also converts as you type',
            manual: 'Convert (Ctrl+Enter) — Convert as you type is off in Settings',
            large: `Convert (Ctrl+Enter) — input over ${bytesText(State.LIMITS.liveBytes)} converts only when you ask`,
            'too-big': `The input is over ${bytesText(State.LIMITS.inputBytes)}, the most convertMan converts at once`
        };
        setTitle(btn, titles[live.reason] || titles['']);
    }

    function syncInputPill() {
        const input = State.input();
        const bytes = State.byteLength(input.text);
        const pill = setText('stat-input', `In: ${bytesText(bytes)}`);
        setTitle(pill, `Input: ${bytes.toLocaleString('en-US')} bytes${input.name ? ` from “${input.name}”` : ''}`);
    }

    function syncResult() {
        const r = State.result();
        const outPill = DOM.id('stat-output');
        const recPill = DOM.id('stat-records');
        syncAutoLabel();
        if (!r) {
            setText('stat-output', 'Out: 0 bytes');
            setText('stat-records', 'Records: 0');
            setStatus('idle', 'Ready', 'Nothing converted yet');
            return;
        }
        const s = r.stats || {};
        const out = Number(s.outBytes) || 0;
        setText('stat-output', r.stale && out ? `Out: ${bytesText(out)} · older` : `Out: ${bytesText(out)}`);
        setTitle(outPill, r.stale ? 'The output is from an earlier input' : `Output: ${out.toLocaleString('en-US')} bytes`);
        const records = Number(s.records) || 0;
        const keys = Number(s.keys) || 0;
        const depth = Number(s.depth) || 0;
        setText('stat-records', `Records: ${records.toLocaleString('en-US')}`);
        setTitle(recPill, `${plural(records, 'record')}, ${plural(keys, 'key')}, ${plural(depth, 'level')} deep`);

        if (working) return;
        if (r.stale) {
            const why = r.reason === 'large'
                ? `The input is over ${bytesText(State.LIMITS.liveBytes)}, so it converts only when you press Convert (Ctrl + Enter)`
                : 'Convert as you type is off: press Convert (Ctrl + Enter)';
            setStatus('waiting', 'Press Convert', why);
        } else if (r.empty) {
            setStatus('idle', 'Waiting for input', 'Paste or type something in the input, or open a file (Ctrl + O)');
        } else if (r.error) {
            const e = r.error;
            const where = Number.isInteger(e.line) ? `Error at ${e.line}${Number.isInteger(e.column) ? `:${e.column}` : ''}` : 'Error';
            const text = r.reason === 'missing' ? 'Converter missing' : e.stage === 'detect' ? 'Format unknown' : where;
            setStatus('error', text, e.message);
        } else if (r.warnings && r.warnings.length) {
            setStatus('warn', `Converted · ${plural(r.warnings.length, 'warning')}`, r.warnings.slice(0, 5).join('\n'));
        } else {
            const ms = Math.max(0, Math.round(Number(s.ms) || 0));
            setStatus('ok', `Converted · ${ms} ms`, `${label(r.from)} to ${label(r.to)}${r.detected ? ' (detected)' : ''} in ${ms} ms`);
        }
    }

    function persistenceWords(p) {
        if (p.remembered) return 'input kept in this browser';
        if (p.reason === 'off') return 'input not kept (Remember the input is off)';
        if (p.reason === 'large') return `input not kept (over ${bytesText(State.LIMITS.persistBytes)})`;
        return 'input not kept (browser storage is full)';
    }

    function syncStageFooter() {
        const input = State.input();
        const r = State.result();
        const fromText = input.from === 'auto'
            ? (r && r.detected && r.from && !r.stale ? `Auto (${label(r.from)})` : 'Auto-detect')
            : label(input.from);
        const text = `${fromText} → ${label(input.to)} · ${persistenceWords(State.inputPersistence())}`;
        const el = setText('stage-footer-status', text);
        setTitle(el, text);
    }

    function syncCounts() {
        const saved = State.saved().length;
        const recent = State.recent().length;
        setText('count-saved', String(saved));
        setText('count-recent', String(recent));
        setTitle(DOM.id('count-saved'), `${plural(saved, 'saved recipe')} in this browser`);
        setTitle(DOM.id('count-recent'), `${plural(recent, 'recent conversion')}`);
        const stats = setText('library-stats', `Saved: ${saved} | Recent: ${recent}`);
        setTitle(stats, `${plural(saved, 'saved recipe')} and ${plural(recent, 'recent conversion')} in this browser`);

        const formats = State.formatsMissing() ? [] : State.formats();
        const count = DOM.id('count-formats');
        if (count) {
            count.hidden = !formats.length;
            count.textContent = String(formats.length);
            const reads = formats.filter((f) => f.canParse).length;
            setTitle(count, `${plural(formats.length, 'format')}: ${reads} read and written, ${formats.length - reads} written only`);
        }
    }

    function syncSecretNotice() {
        const notice = DOM.id('notice-secrets');
        if (!notice) return;
        const show = State.inputPersistence().remembered && State.isSecretLike(State.input().text);
        if (notice.hidden === show) notice.hidden = !show;
    }

    /** Input changes can be large: small inputs sync on the next frame, big ones after a pause. */
    let inputTimer = 0;
    function scheduleInputSync() {
        clearTimeout(inputTimer);
        const n = State.input().text.length;
        inputTimer = setTimeout(() => {
            syncInputPill();
            syncConvertButton();
            syncStageFooter();
            syncSecretNotice();
        }, n < 100000 ? 30 : 250);
    }

    function sync() {
        syncFormatSelects();
        syncInputPill();
        syncConvertButton();
        syncResult();
        syncCounts();
        syncStageFooter();
        syncSecretNotice();
    }

    function subscribeChrome() {
        State.on('input', scheduleInputSync);
        State.on('formats', () => {
            syncFormatSelects();
            syncStageFooter();
        });
        State.on('result', () => {
            syncResult();
            syncStageFooter();
        });
        State.on('saved', syncCounts);
        State.on('recent', syncCounts);
        State.on('settings', () => {
            syncConvertButton();
            syncStageFooter();
            syncSecretNotice();
            ensureZoneOption();
        });
        State.on('reset', sync);
        window.addEventListener('resize', DOM.debounce(syncAutoLabel, 200));
        // Another convertMan tab saved changes that are now merged in here.
        State.on('sync', (r = {}) => {
            syncCounts();
            const parts = [];
            if (r.savedAdded) parts.push(plural(r.savedAdded, 'new recipe'));
            if (r.savedUpdated) parts.push(plural(r.savedUpdated, 'edited recipe'));
            if (r.savedRemoved) parts.push(plural(r.savedRemoved, 'deleted recipe'));
            if (r.recent) parts.push('Recent');
            if (Array.isArray(r.options) && r.options.length) parts.push('format options');
            if (Array.isArray(r.settings) && r.settings.length) parts.push('settings');
            if (parts.length) notify(`Updated from another convertMan tab: ${joinList(parts)}.`, 'info', 3600);
        });
    }

    /* ── Help: the format table from each module's notes ───── */

    function buildHelpFormats() {
        const body = DOM.id('help-formats');
        if (!body || State.formatsMissing()) return;
        const list = State.formats().filter((f) => f.notes);
        if (!list.length) return;
        DOM.empty(body);
        list.forEach((f) => {
            const exts = f.extensions.length ? f.extensions.slice(0, 3).map((e) => `.${String(e).replace(/^\./, '')}`).join(' ') : '—';
            const notes = f.canParse ? f.notes : `${f.notes}${/written here|only be written/i.test(f.notes) ? '' : ' Written only.'}`;
            body.appendChild(DOM.create('tr', {
                children: [
                    DOM.create('td', { text: f.label }),
                    DOM.create('td', { className: 'mono', text: exts }),
                    DOM.create('td', { text: notes })
                ]
            }));
        });
    }

    /* ── File drops anywhere ───────────────────────────────── */

    /**
     * A file dropped where no pane takes it would make the browser leave
     * convertMan and open it. It opens in the converter instead; a pane
     * with its own drop zone calls preventDefault() first and is left
     * alone, and text drags into fields are untouched.
     */
    function routeFileDrops() {
        const carriesFiles = (e) => Boolean(e.dataTransfer)
            && Array.from(e.dataTransfer.types || []).includes('Files');

        window.addEventListener('dragover', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        window.addEventListener('drop', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;
            if (files.length > 1) {
                notify(`Opened “${shorten(files[0].name, 40)}” in the converter. To work on several files at once, use the Images or Files pane.`, 'info', 4200);
            }
            if (window.Workbench && Workbench.isMobile()) Workbench.setMobileOpen(null);
            loadFile(files[0]);
        });
    }

    /* ── Settings ──────────────────────────────────────────── */

    const INDENT_WORDS = { 2: '2 spaces', 4: '4 spaces', tab: 'a tab' };

    function settingText(key, v) {
        switch (key) {
            case 'liveConvert':
            case 'rememberInput':
            case 'csvProtect':
                return v ? 'on' : 'off';
            case 'indent': return Object.prototype.hasOwnProperty.call(INDENT_WORDS, v) ? INDENT_WORDS[v] : String(v);
            case 'recentSize': return `${v} conversions`;
            case 'timeZone': return v === 'device' ? 'device time zone' : String(v);
            case 'hourCycle': return v === 'auto' ? 'automatic' : `${v}-hour`;
            case 'weekStart': return v === 'sunday' ? 'Sunday' : 'Monday';
            case 'numberLocale': return v === 'auto' ? 'automatic' : String(v);
            default: return String(v);
        }
    }

    function timePreview(values) {
        const zone = values.timeZone === 'device' || !values.timeZone ? undefined : values.timeZone;
        const hour12 = values.hourCycle === '12' ? true : values.hourCycle === '24' ? false : undefined;
        try {
            const text = new Intl.DateTimeFormat(undefined, {
                timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12, timeZoneName: 'short'
            }).format(new Date());
            return `Now: ${text}`;
        } catch (_err) {
            return 'Now: this time zone is not known to this browser';
        }
    }

    function numberPreview(values) {
        let locale;
        if (values.numberLocale && values.numberLocale !== 'auto') locale = values.numberLocale;
        try {
            return `1234567.89 shows as ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(1234567.89)}`;
        } catch (_err) {
            return '1234567.89 shows as 1,234,567.89';
        }
    }

    /** A saved zone that the list does not name (from a backup) still needs an option to stay selected. */
    function ensureZoneOption() {
        const select = DOM.id('setting-time-zone');
        if (!select) return;
        const zone = State.settings().timeZone;
        if (Array.from(select.options).some((o) => o.value === zone)) return;
        select.appendChild(optionEl(zone, zone.replace(/_/g, ' ')));
    }

    function readField(el) {
        if (el.type === 'checkbox') return el.checked;
        if (el.type === 'range' || el.type === 'number' || el.dataset.type === 'number') return Number(el.value);
        return el.value;
    }

    /**
     * Inline checks: an unusable value (only possible if a field was
     * tampered with) is explained and holds Save; lowering the Recent size
     * below what Recent holds is flagged before it trims anything.
     */
    function wireSettingsChecks() {
        const modal = DOM.id('modal-settings');
        const save = modal ? DOM.$('[data-settings-save]', modal) : null;
        const error = DOM.id('settings-error');
        const trim = DOM.id('recent-trim-note');
        if (!modal || !save) return;

        const problems = () => DOM.$$('[data-setting]', modal)
            .filter((el) => el.type !== 'radio' || el.checked)
            .filter((el) => State.validSetting(el.dataset.setting, readField(el)) === undefined)
            .map((el) => {
                const key = el.dataset.setting;
                if (Object.prototype.hasOwnProperty.call(SETTING_HINTS, key)) return SETTING_HINTS[key];
                return `Choose one of the listed options for ${State.SETTING_LABELS[key] || key}.`;
            });

        const refresh = () => {
            const list = problems();
            if (error) {
                const msg = list.join(' ');
                if (error.textContent !== msg) error.textContent = msg;
                error.hidden = !list.length;
            }
            if (list.length) save.disabled = true;

            const sizeEl = DOM.$('[data-setting="recentSize"]', modal);
            const size = sizeEl ? Number(sizeEl.value) : NaN;
            const have = State.recent().length;
            if (trim) {
                const msg = Number.isFinite(size) && have > size
                    ? `Heads up: Recent holds ${have} conversions. Saving keeps the newest ${size} and removes the oldest ${have - size}.`
                    : '';
                if (trim.textContent !== msg) trim.textContent = msg;
                trim.hidden = !msg;
            }
        };

        DOM.on(modal, 'input', refresh);
        DOM.on(modal, 'change', refresh);
        DOM.on(modal, 'click', refresh);
        modal.addEventListener('dialog:open', refresh);
        modal.addEventListener('click', (e) => {
            if (!e.target.closest('[data-settings-save]') || !problems().length) return;
            e.preventDefault();
            e.stopPropagation();
            refresh();
        }, true);
    }

    function importSummary(r) {
        const parts = [];
        if (r.savedAdded) parts.push(plural(r.savedAdded, 'saved recipe'));
        if (r.recentAdded) parts.push(plural(r.recentAdded, 'Recent conversion'));
        if (r.optionsAdded) parts.push(`options for ${plural(r.optionsAdded, 'format')}`);
        let text = parts.length
            ? `Added ${joinList(parts)} from the backup.`
            : 'Nothing new to add: everything in that backup is already here.';
        if (r.savedRenamed) {
            text += ` ${plural(r.savedRenamed, 'added recipe')} shared a name with one of yours, so “(from backup)” was added to ${r.savedRenamed === 1 ? 'its name' : 'their names'}.`;
        }
        if (r.savedFull) text += ` ${plural(r.savedFull, 'recipe')} did not fit; convertMan keeps ${State.LIMITS.saved}.`;
        if (r.savedTextDropped) {
            text += ` ${plural(r.savedTextDropped, 'recipe')} came in without ${r.savedTextDropped === 1 ? 'its' : 'their'} input, because saved recipes keep up to ${bytesText(State.LIMITS.savedTextTotal)} of input in all.`;
        }
        if (r.recentFull) {
            text += ` ${plural(r.recentFull, 'Recent conversion')} did not fit; raise “Conversions to keep in Recent” in Settings and import again to add them.`;
        }
        return text;
    }

    /** After Settings → Import: say what was added and ask before using the backup's settings. */
    async function reportImport(r) {
        const summary = importSummary(r);
        const added = r.savedAdded || r.recentAdded || r.optionsAdded;
        if (!r.settings) {
            notify(added ? `${summary} Your input and settings were kept.` : `${summary} Nothing was changed.`, added ? 'success' : 'info', 6000);
            return;
        }
        const mine = State.settings();
        const lines = Object.keys(r.settings).map((key) => (
            `• ${State.SETTING_LABELS[key] || key}: ${settingText(key, r.settings[key])} (yours: ${settingText(key, mine[key])})`
        ));
        const use = await Dialogs.confirm({
            title: 'Use the backup’s settings too?',
            message: `${summary}\n\nThe backup’s settings differ from yours:\n${lines.join('\n')}\n\nYour settings stay as they are unless you choose the backup’s.`,
            confirmLabel: 'Use backup settings',
            cancelLabel: 'Keep my settings'
        });
        if (!use) {
            notify('Kept your settings', 'info', 1800);
            return;
        }
        const result = State.applySettings(r.settings);
        notify(result.changed.length
            ? `Now using the backup’s settings (${plural(result.changed.length, 'change')})`
            : 'Settings unchanged', 'success', 2400);
    }

    const KIT_IMPORT_TOAST = 'Backup merged into this browser';
    const CHOOSE_BACKUP = 'Choose a file made by Download backup in convertMan’s Settings.';

    /** Check a chosen backup file; rejects with a plain sentence when it can't be a convertMan backup. */
    async function checkBackupFile(file) {
        const not = 'That file isn’t a convertMan backup';
        if (!file) throw new Error(`No file was chosen. ${CHOOSE_BACKUP}`);
        if (file.size > MAX_BACKUP_BYTES) {
            throw new Error(`${not} — at ${(file.size / 1048576).toFixed(1)} MB it is far larger than any backup. ${CHOOSE_BACKUP}`);
        }
        let text;
        try {
            text = await file.text();
        } catch (_err) {
            throw new Error(`That file could not be read. ${CHOOSE_BACKUP}`);
        }
        let data;
        try {
            data = JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
        } catch (_err) {
            throw new Error(`${not} (it isn’t valid JSON). ${CHOOSE_BACKUP}`);
        }
        const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
        if (!isObj(data) || !isObj(data.state) || !data.version) throw new Error(`${not} — it has no convertMan data in it. ${CHOOSE_BACKUP}`);
        if (!Array.isArray(data.state.saved) && !Array.isArray(data.state.recent)) {
            throw new Error(`${not} — it has no saved recipes or Recent list. ${CHOOSE_BACKUP}`);
        }
    }

    /**
     * The kit's Import reads the file itself and shows its own toasts. A
     * check runs first so a wrong file is explained in plain words instead
     * of a parser message; only this page's Storage.import is wrapped.
     */
    function guardImport() {
        if (!window.Storage || typeof Storage.import !== 'function' || Storage.import.convertManChecked) return;
        const kitImport = Storage.import.bind(Storage);
        const checked = (file) => checkBackupFile(file).then(() => kitImport(file));
        checked.convertManChecked = true;
        Storage.import = checked;
    }

    /** Hide the kit's "Backup merged" toast when the import added nothing. */
    function dropKitImportToast() {
        DOM.$$('.toast-stack .toast').forEach((t) => {
            if (t.textContent === KIT_IMPORT_TOAST) t.style.display = 'none';
        });
    }

    function bindSettings() {
        guardImport();
        ensureZoneOption();
        Dialogs.bindSettings({
            getSettings: () => State.settings(),
            applySettings: (values) => {
                const before = State.recent().length;
                const result = State.applySettings(values);
                if (result.rejected.length) {
                    const detail = result.rejected.map((key) => SETTING_HINTS[key]
                        || `${State.SETTING_LABELS[key] || key} kept its previous value.`).join(' ');
                    notify(`Some settings were not changed. ${detail}`, 'warning', 5000);
                }
                const removed = before - State.recent().length;
                if (removed > 0) notify(`Removed the ${plural(removed, 'oldest Recent conversion')} to fit the new size.`, 'info', 3200);
                if (result.changed.includes('rememberInput') && !State.settings().rememberInput) {
                    notify('convertMan no longer remembers the input; the stored copy is gone.', 'info', 3600);
                }
            },
            formats: {
                recentSize: (v) => `${v} conversions`,
                indentPreview: (v, values) => `Nested lines start with ${INDENT_WORDS[values.indent] || '2 spaces'}`,
                timePreview: (_v, values) => timePreview(values),
                numberPreview: (_v, values) => numberPreview(values)
            },
            onReset: () => State.reset(),
            onImported: () => {
                sync();
                const report = State.lastImport;
                State.lastImport = null;
                // After the kit's own "Backup merged" toast, so the detail reads second;
                // when nothing was added that toast would contradict the report, so it is hidden.
                if (report) {
                    setTimeout(() => {
                        if (!report.savedAdded && !report.recentAdded && !report.optionsAdded) dropKitImportToast();
                        reportImport(report).catch((err) => console.error('[convertMan] import report failed:', err));
                    }, 0);
                }
            },
            resetConfirm: {
                title: 'Reset convertMan?',
                message: 'This deletes your saved recipes, Recent, format options, the remembered input, and settings in this browser, then brings back the sample input.\n\nDownload a backup first if you might want your recipes later. This cannot be undone.',
                confirmLabel: 'Reset convertMan'
            }
        });
    }

    /* ── Option-key fallback for Ctrl+Alt shortcuts ────────── */

    /**
     * On macOS, Option turns X into another character, so the key ToolApp
     * sees is not 'x'. Match the physical key instead, only when ToolApp's
     * own match could not have fired.
     */
    function wireAltFallback() {
        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return;
            if (window.Dialogs && Dialogs.activeModal) return;
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (key === 'x' || e.code !== 'KeyX') return;
            e.preventDefault();
            actions.swap();
        });
    }

    /** Tell the visitor once why the input came back empty. */
    function explainRestoredInput() {
        const drop = State.restoredDrop;
        State.restoredDrop = '';
        if (drop === 'large') {
            notify(`Your last input was over ${bytesText(State.LIMITS.persistBytes)}, so it was not kept in this browser. Open the file again to carry on.`, 'info', 6000);
        } else if (drop === 'quota') {
            notify('Your last input did not fit in this browser’s storage, so it was not kept. Open it again to carry on.', 'info', 6000);
        }
    }

    /* ── Boot ──────────────────────────────────────────────── */

    ToolApp.boot({
        id: 'convertman',
        name: 'convertMan',
        modules: MODULES,
        workbench: {
            getUi: () => AppState.ui,
            left: { id: 'panel-library', name: 'Library' },
            right: { id: 'panel-tools', name: 'Tools' }
        },
        shortcuts: [
            { key: 'Enter', mod: true, allowInFields: true, run: () => { if (!inOtherField()) actions.convertNow(); } },
            { key: 'c', mod: true, shift: true, allowInFields: true, run: () => { if (!inOtherField()) actions.copyOutput(); } },
            { key: 'x', mod: true, alt: true, allowInFields: true, run: () => actions.swap() },
            { key: 'o', mod: true, allowInFields: true, run: () => actions.openFile() },
            { key: 'd', mod: true, shift: true, allowInFields: true, run: () => actions.downloadOutput() }
        ],
        onReady() {
            bindSettings();
            wireSettingsChecks();
            routeFileDrops();
            buildFormatSelects();
            buildHelpFormats();
            wireToolbar();
            wireAltFallback();
            subscribeChrome();
            if (!State.result()) State.convert();
            sync();
            explainRestoredInput();
        }
    });

    window.ConvertManApp = { actions, sync, modules: MODULES.slice() };
})();
