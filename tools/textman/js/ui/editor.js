/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EditorEngine (textMan Edition - v1.1)
 *     - File Name: editor.js
 *     - Relative Path: tools/textman/js/ui/editor.js
 *     - Artifact Type: library
 *     - Version: 1.1.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Editor QoL batch:
 *       live line/col readout + Go-to-line (Ctrl+G), word-wrap toggle and
 *       font-size stepper (persisted via settings, applied through
 *       applyPrefs), selection-aware stats, Download (.txt/.md) and Copy
 *       All, and caret/scroll restoration after whole-document transforms so
 *       the viewport no longer jumps to the top.
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial editor
 *       engine: undo/redo, stats, file open/drop, diff, autosave,
 *       applyToSelectionOrAll.
 *
 * ✒ Description:
 *     The engine behind textMan's writing surface. Owns the textarea: live
 *     stats, dirty/saving/saved status, autosave, a coalescing undo/redo
 *     stack, file open (picker and drag-and-drop), and a line-level diff
 *     against the last saved snapshot. Exposes the applyToSelectionOrAll()
 *     primitive every tool pane uses to transform text safely through one
 *     code path.
 *
 * ✒ Key Features:
 *     - Coalescing undo/redo stack (400ms grouping, 100-snapshot cap)
 *     - Native Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z intercepted so the custom
 *       stack stays authoritative
 *     - Live word/char/read-time stats on every input
 *     - Autosave respecting the immediate/debounced/manual setting
 *     - Save status chip driven through one setStatus() path
 *     - File open via picker + drag-and-drop, with dirty-work guard and a
 *       5 MB size cap
 *     - Line diff vs last saved snapshot (LCS up to 2,000 lines, summary
 *       after)
 *     - Selection tracking synced into State for selection-aware tools
 *     - applyToSelectionOrAll(): selection-aware transform primitive with
 *       selection restoration and single-path state/undo integration
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.EditorUI — load after shared/js and
 *     js/state.js in tools/textman/index.html. Booted by app.js calling
 *     EditorUI.init(), which hydrates the textarea from restored state and
 *     wires input, toolbar, file open, and drag-and-drop. Tool panes should
 *     never write to the textarea directly — use:
 *         EditorUI.applyToSelectionOrAll(fn, 'Label')
 *         EditorUI.insertText(text)
 *         EditorUI.setValue(text)
 *
 * ✒ Examples:
 *     - EditorUI.applyToSelectionOrAll(t => t.toUpperCase(), 'UPPERCASE')
 *     - EditorUI.insertText('# Heading\n')     → inserts at caret
 *     - EditorUI.saveNow()                     → flush to LocalStorage
 *     - EditorUI.undo() / EditorUI.redo()
 *     - EditorUI.getValue()                    → current document text
 *     - EditorUI.setValue('# New doc')         → full replace via the
 *       standard input pipeline (stats, undo, autosave all fire)
 *     - EditorUI.showDiff()                    → opens modal-diff with the
 *       LCS line diff vs the last save
 *     - Dropping a .md file on the textarea    → openFile() with the
 *       unsaved-changes confirm guard
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js (dom, storage, toolman), js/state.js
 *     - Compatible platforms: all evergreen browsers
 *     - Performance: line diff builds an LCS table (O(m×n)); documents over
 *       2,000 lines fall back to a character-delta summary
 *     - Limitations: file opens capped at 5 MB; undo history capped at 100
 *       snapshots and does not survive reload
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const UNDO_CAP = 100;
    const UNDO_COALESCE_MS = 400;
    const DIFF_LINE_LIMIT = 2000;

    const EditorUI = {
        textarea: null,
        statusEl: null,
        footerStatusEl: null,
        lastSavedContent: '',

        undoStack: [],
        redoStack: [],
        _lastSnapshotAt: 0,

        init() {
            this.textarea = DOM.id('editor-textarea');
            this.statusEl = DOM.id('save-status');
            this.footerStatusEl = DOM.id('editor-footer-status');

            if (!this.textarea) {
                console.warn('[EditorUI] Textarea not found');
                return;
            }

            // Hydrate from restored state
            this.textarea.value = State.get().editor.content || '';
            this.lastSavedContent = this.textarea.value;
            this.pushSnapshot(true);
            this.applyPrefs();
            this.updateStats();
            this.updateCaretPos();
            this.setStatus(State.get().editor.isDirty ? 'dirty' : 'saved');

            this.wireInput();
            this.wireToolbar();
            this.wireDocTitle();
            this.wireFileOpen();
            this.wireDragAndDrop();
        },

        /* ── Editor preferences (wrap, font size, tab size) ── */

        /** Apply the persisted editor prefs to the textarea + toolbar. */
        applyPrefs() {
            const s = State.get().settings;
            this.textarea.wrap = s.wordWrap ? 'soft' : 'off';
            this.textarea.style.whiteSpace = s.wordWrap ? 'pre-wrap' : 'pre';
            this.textarea.style.fontSize = `${s.fontSize}px`;
            this.textarea.style.tabSize = String(s.tabSize);

            const wrapBtn = DOM.id('btn-wrap');
            if (wrapBtn) {
                wrapBtn.setAttribute('data-active', String(s.wordWrap));
                wrapBtn.setAttribute('aria-pressed', String(s.wordWrap));
                wrapBtn.title = s.wordWrap ? 'Word wrap: on' : 'Word wrap: off';
            }
            const fontLabel = DOM.id('font-size-label');
            if (fontLabel) fontLabel.textContent = `${s.fontSize}px`;
        },

        toggleWrap() {
            const s = State.get().settings;
            State.updateSettings('wordWrap', !s.wordWrap);
            this.applyPrefs();
            Autosave.start(500);
        },

        stepFontSize(delta) {
            const s = State.get().settings;
            const next = Math.min(22, Math.max(11, s.fontSize + delta));
            if (next === s.fontSize) return;
            State.updateSettings('fontSize', next);
            this.applyPrefs();
            Autosave.start(500);
        },

        /* ── Input pipeline ─────────────────────────── */

        wireInput() {
            DOM.on(this.textarea, 'input', () => {
                State.setEditorContent(this.textarea.value);
                this.updateStats();
                this.updateCaretPos();
                this.setStatus('dirty');
                this.pushSnapshot();
                this.scheduleAutosave();
            });

            // Track selection for tools that care, refresh selection-aware
            // stats and the line/col readout as the caret/selection moves.
            const onSelectionMove = () => {
                const sel = Text.getSelection(this.textarea);
                State.get().editor.selectionStart = sel.start;
                State.get().editor.selectionEnd = sel.end;
                this.updateStats();
                this.updateCaretPos();
            };
            DOM.on(this.textarea, 'select', onSelectionMove);
            DOM.on(this.textarea, 'keyup', onSelectionMove);
            DOM.on(this.textarea, 'click', onSelectionMove);

            // Native undo/redo intercepted so our stack stays authoritative
            DOM.on(this.textarea, 'keydown', (e) => {
                const mod = e.ctrlKey || e.metaKey;
                if (!mod) return;

                if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
                    e.preventDefault();
                    this.redo();
                }
            });
        },

        /* ── Document title (editable, feeds filename + tab) ── */

        wireDocTitle() {
            const input = DOM.id('doc-title');
            if (!input) return;

            input.value = State.get().editor.docTitle || 'Untitled';
            this.syncTabTitle();

            const commit = () => {
                const next = State.setDocTitle(input.value);
                input.value = next;
                this.syncTabTitle();
                Autosave.start(500);
            };
            DOM.on(input, 'change', commit);
            DOM.on(input, 'keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });
        },

        syncTabTitle() {
            const t = State.get().editor.docTitle;
            document.title = t && t !== 'Untitled'
                ? `${t} — textMan`
                : 'textMan – Bend text to your will';
        },

        scheduleAutosave() {
            const settings = State.get().settings;
            if (settings.autosave === 'immediate') {
                this.persist();
            } else if (settings.autosave === 'debounced') {
                this.setStatus('dirty');
                clearTimeout(this._autosaveTimer);
                this._autosaveTimer = setTimeout(() => this.persist(), settings.autosaveDelay);
            }
            // 'manual' → only Ctrl+S / Save button persist
        },

        /** Persist current content and update status chrome. */
        persist() {
            this.setStatus('saving');
            const ok = Autosave.saveNow();
            if (ok) {
                State.markSaved();
                this.lastSavedContent = this.textarea.value;
                // Brief "saving" beat so the state change reads visually
                setTimeout(() => this.setStatus('saved'), 250);
            } else {
                this.setStatus('dirty');
            }
            return ok;
        },

        /** Explicit save (Ctrl+S / Save button). */
        saveNow() {
            const ok = this.persist();
            if (ok) {
                State.addHistory({ type: 'save', description: 'Saved document' });
                if (window.WorkspaceUI) WorkspaceUI.renderHistory();
                TOOLMAN.notify('Document saved', 'success', 1400);
            } else {
                TOOLMAN.notify('Save failed — storage unavailable', 'error');
            }
            return ok;
        },

        /* ── Status chrome ──────────────────────────── */

        setStatus(status) {
            if (this.statusEl) {
                this.statusEl.setAttribute('data-status', status);
                const label = DOM.$('.status-label', this.statusEl);
                if (label) {
                    label.textContent = status === 'saved' ? 'Saved'
                        : status === 'saving' ? 'Saving…'
                        : 'Not saved';
                }
            }
            if (this.footerStatusEl) {
                this.footerStatusEl.textContent = status === 'saved' ? 'All changes saved'
                    : status === 'saving' ? 'Saving…'
                    : 'Unsaved changes';
            }
        },

        /* ── Stats ──────────────────────────────────── */

        updateStats() {
            const value = this.textarea.value;
            const docWords = Text.countWords(value);
            const docChars = Text.countChars(value);
            const readTime = Text.estimateReadTime(value);

            // Selection-aware: when text is selected, stats reflect it and
            // annotate with the document total (e.g. "Words: 14 / 1,204").
            const { text: selText, start, end } = Text.getSelection(this.textarea);
            const hasSel = start !== end;
            const words = hasSel ? Text.countWords(selText) : docWords;
            const chars = hasSel ? selText.length : docChars;
            const suffix = (total) => hasSel ? ` / ${Text.formatNumber(total)}` : '';

            const wordsEl = DOM.id('stat-words');
            const charsEl = DOM.id('stat-chars');
            const readEl = DOM.id('stat-read-time');

            if (wordsEl) wordsEl.textContent = `Words: ${Text.formatNumber(words)}${suffix(docWords)}`;
            if (charsEl) charsEl.textContent = `Characters: ${Text.formatNumber(chars)}${suffix(docChars)}`;
            if (readEl) readEl.textContent = `Est. read time: ${readTime} min`;

            const stats = DOM.$('.editor-stats');
            if (stats) stats.setAttribute('data-selecting', String(hasSel));

            State.updateAnalytics(docWords, docChars);
            if (window.WorkspaceUI) WorkspaceUI.renderAnalytics();
        },

        /* ── Caret position + Go-to-line ────────────────── */

        /** Update the "Ln X, Col Y" readout from the caret offset. */
        updateCaretPos() {
            const el = DOM.id('stat-caret');
            if (!el) return;
            const pos = this.textarea.selectionStart;
            const before = this.textarea.value.substring(0, pos);
            const line = before.split('\n').length;
            const col = pos - before.lastIndexOf('\n');
            el.textContent = `Ln ${line}, Col ${col}`;
        },

        /** Move the caret to the start of a 1-based line and center it. */
        goToLine(line) {
            const lines = this.textarea.value.split('\n');
            const target = Math.min(Math.max(1, line), lines.length);
            let offset = 0;
            for (let i = 0; i < target - 1; i++) offset += lines[i].length + 1;

            this.textarea.focus();
            this.textarea.setSelectionRange(offset, offset);
            // Approximate vertical centering
            const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 20;
            this.textarea.scrollTop = Math.max(0, (target - 1) * lineHeight - this.textarea.clientHeight / 2);
            this.updateCaretPos();
        },

        promptGoToLine() {
            const total = this.textarea.value.split('\n').length;
            const answer = window.prompt(`Go to line (1–${total}):`, '');
            if (answer === null) return;
            const n = parseInt(answer, 10);
            if (Number.isFinite(n)) this.goToLine(n);
        },

        /* ── Undo / Redo ────────────────────────────── */

        pushSnapshot(force = false) {
            const now = Date.now();
            const snapshot = {
                value: this.textarea.value,
                start: this.textarea.selectionStart,
                end: this.textarea.selectionEnd
            };

            const top = this.undoStack[this.undoStack.length - 1];
            if (top && top.value === snapshot.value && !force) return;

            // Coalesce rapid keystrokes into one undo step
            if (!force && top && now - this._lastSnapshotAt < UNDO_COALESCE_MS) {
                this.undoStack[this.undoStack.length - 1] = snapshot;
            } else {
                this.undoStack.push(snapshot);
                if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
            }

            this._lastSnapshotAt = now;
            this.redoStack.length = 0;
            this.updateUndoButtons();
        },

        undo() {
            if (this.undoStack.length < 2) return;
            this.redoStack.push(this.undoStack.pop());
            this.restoreSnapshot(this.undoStack[this.undoStack.length - 1]);
        },

        redo() {
            if (!this.redoStack.length) return;
            const snapshot = this.redoStack.pop();
            this.undoStack.push(snapshot);
            this.restoreSnapshot(snapshot);
        },

        restoreSnapshot(snapshot) {
            this.textarea.value = snapshot.value;
            this.textarea.setSelectionRange(snapshot.start, snapshot.end);
            this.textarea.focus();

            State.setEditorContent(snapshot.value);
            this.updateStats();
            this.setStatus('dirty');
            this.scheduleAutosave();
            this.updateUndoButtons();
        },

        updateUndoButtons() {
            const undoBtn = DOM.id('btn-undo');
            const redoBtn = DOM.id('btn-redo');
            if (undoBtn) undoBtn.disabled = this.undoStack.length < 2;
            if (redoBtn) redoBtn.disabled = !this.redoStack.length;
        },

        /* ── Toolbar ────────────────────────────────── */

        wireToolbar() {
            DOM.on('#btn-save', 'click', () => this.saveNow());
            DOM.on('#btn-undo', 'click', () => this.undo());
            DOM.on('#btn-redo', 'click', () => this.redo());
            DOM.on('#btn-diff', 'click', () => this.showDiff());
            DOM.on('#btn-download', 'click', () => this.download());
            DOM.on('#btn-copy-all', 'click', () => this.copyAll());
            DOM.on('#btn-wrap', 'click', () => this.toggleWrap());
            DOM.on('#btn-font-dec', 'click', () => this.stepFontSize(-1));
            DOM.on('#btn-font-inc', 'click', () => this.stepFontSize(1));
            DOM.on('#stat-caret', 'click', () => this.promptGoToLine());
            this.updateUndoButtons();
        },

        /* ── Export: download + copy ────────────────────── */

        /** Download the document as a text file named from the doc title. */
        download() {
            const title = (State.get().editor.docTitle || 'untitled').trim();
            const looksMarkdown = /^#|\n#|^[-*] |\n[-*] /.test(this.textarea.value);
            const ext = looksMarkdown ? 'md' : 'txt';
            const safe = title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

            const blob = new Blob([this.textarea.value], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = DOM.create('a', { attrs: { href: url, download: `${safe}.${ext}` } });
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            State.addHistory({ type: 'save', description: `Downloaded ${safe}.${ext}` });
            if (window.WorkspaceUI) WorkspaceUI.renderHistory();
            TOOLMAN.notify(`Downloaded ${safe}.${ext}`, 'success', 1600);
        },

        async copyAll() {
            const ok = await DOM.copyText(this.textarea.value);
            TOOLMAN.notify(ok ? 'Document copied to clipboard' : 'Copy failed',
                ok ? 'success' : 'error', 1500);
        },

        /* ── File open ──────────────────────────────── */

        wireFileOpen() {
            const openBtn = DOM.id('btn-open');
            if (!openBtn) return;

            const input = DOM.create('input', {
                attrs: {
                    type: 'file',
                    accept: '.txt,.md,.markdown,.json,.csv,.log,.html,.css,.js,text/*'
                },
                style: { display: 'none' }
            });
            document.body.appendChild(input);

            DOM.on(openBtn, 'click', () => input.click());
            DOM.on(input, 'change', () => {
                const file = input.files && input.files[0];
                if (file) this.openFile(file);
                input.value = ''; // allow re-opening the same file
            });
        },

        wireDragAndDrop() {
            const ta = this.textarea;

            DOM.on(ta, 'dragover', (e) => {
                e.preventDefault();
                ta.classList.add('drag-over');
            });
            DOM.on(ta, 'dragleave', () => ta.classList.remove('drag-over'));
            DOM.on(ta, 'drop', (e) => {
                e.preventDefault();
                ta.classList.remove('drag-over');
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) this.openFile(file);
            });
        },

        openFile(file) {
            const MAX_BYTES = 5 * 1024 * 1024; // 5 MB sanity cap
            if (file.size > MAX_BYTES) {
                TOOLMAN.notify('File too large (5 MB max)', 'error');
                return;
            }

            if (State.get().editor.isDirty
                && !window.confirm('You have unsaved changes. Replace the document with the opened file?')) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                this.setValue(String(e.target.result || ''));
                // Name the document from the file (drop the extension).
                const baseName = file.name.replace(/\.[^.]+$/, '');
                State.setDocTitle(baseName);
                const titleInput = DOM.id('doc-title');
                if (titleInput) titleInput.value = State.get().editor.docTitle;
                this.syncTabTitle();

                State.addHistory({ type: 'save', description: `Opened file: ${file.name}` });
                if (window.WorkspaceUI) WorkspaceUI.renderHistory();
                TOOLMAN.notify(`Opened ${file.name}`, 'success', 2000);
            };
            reader.onerror = () => TOOLMAN.notify('Could not read that file', 'error');
            reader.readAsText(file);
        },

        /* ── Diff vs last saved ─────────────────────── */

        showDiff() {
            const current = this.textarea.value;
            const saved = this.lastSavedContent;

            if (current === saved) {
                TOOLMAN.notify('No changes since last save', 'info', 2000);
                return;
            }

            const output = DOM.id('diff-output');
            if (!output || !window.ModalsUI) return;

            DOM.empty(output);
            const a = saved.split('\n');
            const b = current.split('\n');

            if (a.length > DIFF_LINE_LIMIT || b.length > DIFF_LINE_LIMIT) {
                output.appendChild(DOM.create('p', {
                    className: 'diff-summary',
                    text: `Document too large for line diff — ${a.length} → ${b.length} lines, `
                        + `${Text.formatNumber(Math.abs(current.length - saved.length))} character delta.`
                }));
            } else {
                this.renderLineDiff(a, b, output);
            }

            ModalsUI.open('modal-diff');
        },

        /** Classic LCS line diff rendered as +/- rows. */
        renderLineDiff(a, b, container) {
            const m = a.length;
            const n = b.length;

            // LCS table (m and n are capped by DIFF_LINE_LIMIT)
            const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
            for (let i = m - 1; i >= 0; i--) {
                for (let j = n - 1; j >= 0; j--) {
                    dp[i][j] = a[i] === b[j]
                        ? dp[i + 1][j + 1] + 1
                        : Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }

            const frag = document.createDocumentFragment();
            let i = 0;
            let j = 0;
            let added = 0;
            let removed = 0;

            const row = (type, textContent) => DOM.create('div', {
                className: `diff-row diff-${type}`,
                text: `${type === 'add' ? '+' : type === 'del' ? '−' : ' '} ${textContent}`
            });

            while (i < m && j < n) {
                if (a[i] === b[j]) {
                    frag.appendChild(row('ctx', a[i]));
                    i++; j++;
                } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                    frag.appendChild(row('del', a[i]));
                    removed++; i++;
                } else {
                    frag.appendChild(row('add', b[j]));
                    added++; j++;
                }
            }
            while (i < m) { frag.appendChild(row('del', a[i])); removed++; i++; }
            while (j < n) { frag.appendChild(row('add', b[j])); added++; j++; }

            container.appendChild(DOM.create('p', {
                className: 'diff-summary',
                text: `${added} line${added === 1 ? '' : 's'} added · ${removed} line${removed === 1 ? '' : 's'} removed`
            }));
            container.appendChild(frag);
        },

        /* ── Public text API (used by every tool pane) ── */

        getValue() {
            return this.textarea ? this.textarea.value : '';
        },

        /** Replace the whole document through the standard pipeline. */
        setValue(text) {
            if (!this.textarea) return;
            this.textarea.value = text;
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        },

        /** Insert text at the caret (replaces any selection). */
        insertText(text) {
            if (!this.textarea) return;
            this.textarea.focus();
            Text.replaceSelection(this.textarea, text);
        },

        /**
         * Apply `fn(text) → text` to the selection if present, else the whole
         * document. Restores a sensible selection afterwards. Returns true if
         * anything changed.
         */
        applyToSelectionOrAll(fn, label) {
            if (!this.textarea) return false;

            const { text, start, end } = Text.getSelection(this.textarea);
            const hasSelection = start !== end;
            const source = hasSelection ? text : this.textarea.value;

            let result;
            try {
                result = fn(source);
            } catch (error) {
                console.error(`[EditorUI] Transform "${label}" failed:`, error);
                TOOLMAN.notify(`${label || 'Transform'} failed: ${error.message}`, 'error');
                return false;
            }

            if (typeof result !== 'string' || result === source) return false;

            // Preserve the viewport so a whole-document transform doesn't
            // yank the user back to the top.
            const prevScroll = this.textarea.scrollTop;

            if (hasSelection) {
                const value = this.textarea.value;
                this.textarea.value = value.substring(0, start) + result + value.substring(end);
                this.textarea.setSelectionRange(start, start + result.length);
            } else {
                const prevStart = this.textarea.selectionStart;
                this.textarea.value = result;
                // Keep the caret near where it was, clamped to the new length.
                const caret = Math.min(prevStart, result.length);
                this.textarea.setSelectionRange(caret, caret);
            }

            this.textarea.focus();
            this.textarea.scrollTop = prevScroll;
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
    };

    window.EditorUI = EditorUI;
})();
