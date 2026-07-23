/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ModalSystem (textMan Edition - v1.2)
 *     - File Name: modals.js
 *     - Relative Path: tools/textman/js/ui/modals.js
 *     - Artifact Type: script
 *     - Version: 1.2.0
 *     - Date: 2026-07-23
 *     - Update: Thursday, July 23, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.2.0 (2026-07-23) [Anthropic - Claude Opus 4.8] — Added
 *       ModalsUI.confirm(): a promise-based replacement for window.confirm()
 *       wearing the house dialog chrome, with configurable buttons, a
 *       nominated focus target, and a dismissValue that Escape, the backdrop,
 *       and the X all resolve to — dismissal can never trigger a second
 *       action. Migrated the workspace reset off the native dialog.
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Settings QoL:
 *       autosave-delay and tab-size range controls (live labels), a storage
 *       usage meter, and Export/Import workspace wired to the shared
 *       Storage.export/import — editor prefs re-apply after save/import.
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial dialog
 *       controller: focus trap, Escape/backdrop close, submit flows.
 *
 * ✒ Description:
 *     textMan's dialog controller: open/close with focus management, Escape
 *     and backdrop dismissal, a Tab focus trap, and the submit flows for the
 *     Settings, Save-Snippet, Create-Template, Help, and Diff modals.
 *     Settings covers ecosystem theme, autosave behavior, and the guarded
 *     workspace reset. Also owns the shared confirm dialog every destructive
 *     or branching action in the app asks its question through.
 *
 * ✒ Key Features:
 *     - Focus trap: Tab cycles inside the open dialog; focus restored on
 *       close
 *     - Escape and backdrop-click dismissal
 *     - Settings: theme radios (parchment/sentinel) synced with TOOLMAN,
 *       autosave mode select, double-confirmed workspace reset
 *     - Save Snippet: prefills content from the current editor selection
 *     - Create Template: validated, renders immediately
 *     - confirm(): promise-based dialog with 2-3 configurable buttons, a
 *       danger variant, and dismissal that always resolves to "do nothing"
 *     - aria-hidden bookkeeping for assistive tech
 *     - Single-active-dialog rule: opening a modal closes any other
 *     - First focusable element focused on open; prior focus restored after
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.ModalsUI — load after shared/js,
 *     js/state.js, ui/editor.js, and ui/workspace.js in
 *     tools/textman/index.html. Booted by app.js calling ModalsUI.init(),
 *     which wires the delegated close buttons, backdrop clicks, the
 *     Escape/Tab handler, and the three form submit flows. Other modules
 *     open dialogs by element id.
 *
 * ✒ Examples:
 *     - ModalsUI.open('modal-settings') → syncs the theme radios and
 *       autosave select before showing
 *     - ModalsUI.open('modal-help') / ModalsUI.open('modal-diff')
 *     - ModalsUI.openSnippetModal() → prefills #snippet-content from the
 *       current editor selection
 *     - ModalsUI.closeActive() → closes the open dialog and restores focus
 *     - Pressing Escape or clicking the backdrop dismisses the open dialog
 *     - Any <button class="modal-close"> or .modal-cancel closes via one
 *       delegated listener
 *     - #btn-reset-workspace → ModalsUI.confirm() → State.reset(), editor
 *       cleared, undo stacks emptied, workspace re-rendered
 *     - ModalsUI.confirm({ title, message, buttons: [{ label, value,
 *       variant, focus }], dismissValue }) → Promise resolving to the picked
 *       button's value, or dismissValue on Escape/backdrop/X
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js (dom, storage, toolman), js/state.js,
 *       ui/editor.js, ui/workspace.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the workspace reset cannot be undone — it clears the
 *       document, custom templates, snippets, history, and analytics
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const ModalsUI = {
        activeModal: null,
        _restoreFocusTo: null,

        init() {
            // Close buttons and backdrop clicks — one delegated listener each
            DOM.delegate(document.body, 'click', '.modal-close, .modal-cancel', () => this.closeActive());

            DOM.$$('.modal-backdrop').forEach((backdrop) => {
                DOM.on(backdrop, 'click', (e) => {
                    if (e.target === backdrop) this.closeActive();
                });
                backdrop.setAttribute('aria-hidden', 'true');
            });

            // Escape + focus trap
            document.addEventListener('keydown', (e) => {
                if (!this.activeModal) return;

                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeActive();
                } else if (e.key === 'Tab') {
                    this.trapFocus(e);
                }
            });

            this.wireSettings();
            this.wireSnippetModal();
            this.wireTemplateModal();
        },

        /* ── Core open/close ────────────────────────── */

        open(id) {
            const modal = DOM.id(id);
            if (!modal) return;

            if (this.activeModal && this.activeModal !== modal) this.close(this.activeModal);

            this._restoreFocusTo = document.activeElement;
            this.activeModal = modal;

            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');

            if (id === 'modal-settings') this.syncSettingsForm();

            const first = DOM.$(FOCUSABLE, modal);
            if (first) first.focus();
        },

        close(modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');

            if (this.activeModal === modal) this.activeModal = null;

            // Escape, the backdrop, and the X all land here — a confirm closed
            // this way resolves as dismissed, never as a silent side effect.
            if (modal === this._confirmEl) this._resolveConfirm(this._confirmDismissValue);

            if (this._restoreFocusTo && typeof this._restoreFocusTo.focus === 'function') {
                this._restoreFocusTo.focus();
            }
            this._restoreFocusTo = null;
        },

        closeActive() {
            if (this.activeModal) this.close(this.activeModal);
        },

        trapFocus(e) {
            const focusables = DOM.$$(FOCUSABLE, this.activeModal)
                .filter((el) => el.offsetParent !== null && !el.disabled);
            if (!focusables.length) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        },

        /* ── Confirm dialog ─────────────────────────── */

        _confirmEl: null,
        _confirmResolve: null,
        _confirmDismissValue: false,

        /**
         * Promise-based replacement for window.confirm() wearing the house
         * dialog chrome. Resolves with the chosen button's value, or with
         * dismissValue when the user backs out via Escape, the backdrop, or
         * the X — dismissal always means "do nothing", never a second action.
         *
         * opts: { title, message, dismissValue, buttons: [{ label, value,
         * variant, focus }] } — variant maps to the .btn-* classes, and the
         * button flagged focus gets keyboard focus (put it on the safe
         * choice for destructive dialogs).
         */
        confirm(opts = {}) {
            const buttons = (opts.buttons && opts.buttons.length) ? opts.buttons : [
                { label: 'Cancel', value: false, variant: 'secondary', focus: true },
                { label: 'Confirm', value: true, variant: 'primary' }
            ];

            // A dialog still on screen resolves as dismissed before this one
            // takes the stage — no orphaned promises.
            this._resolveConfirm(this._confirmDismissValue);

            const backdrop = this._ensureConfirmDialog();
            DOM.$('.confirm-title', backdrop).textContent = opts.title || 'Are you sure?';
            DOM.$('.confirm-message', backdrop).textContent = opts.message || '';

            const footer = DOM.$('.modal-footer', backdrop);
            DOM.empty(footer);

            let focusTarget = null;
            buttons.forEach((btn) => {
                const el = DOM.create('button', {
                    className: `btn btn-${btn.variant || 'secondary'}`,
                    text: btn.label,
                    attrs: { type: 'button' }
                });
                DOM.on(el, 'click', () => this._resolveConfirm(btn.value));
                footer.appendChild(el);
                if (btn.focus) focusTarget = el;
            });

            this._confirmDismissValue = 'dismissValue' in opts ? opts.dismissValue : false;

            return new Promise((resolve) => {
                this._confirmResolve = resolve;
                this.open('modal-confirm');
                const focusEl = focusTarget || footer.lastElementChild;
                if (focusEl) focusEl.focus();
            });
        },

        /** Build the shared confirm shell once; every call reuses the node. */
        _ensureConfirmDialog() {
            if (this._confirmEl) return this._confirmEl;

            const panel = DOM.create('div', {
                className: 'modal-panel modal-panel--confirm',
                attrs: {
                    role: 'alertdialog',
                    'aria-modal': 'true',
                    'aria-labelledby': 'confirm-title',
                    'aria-describedby': 'confirm-message'
                },
                children: [
                    DOM.create('div', {
                        className: 'modal-header',
                        children: [
                            DOM.create('h3', { className: 'modal-title confirm-title', id: 'confirm-title' }),
                            DOM.create('button', {
                                className: 'modal-close',
                                html: '&times;',
                                attrs: { type: 'button', 'aria-label': 'Close' }
                            })
                        ]
                    }),
                    DOM.create('div', {
                        className: 'modal-body',
                        children: [
                            DOM.create('p', { className: 'confirm-message', id: 'confirm-message' })
                        ]
                    }),
                    DOM.create('div', { className: 'modal-footer' })
                ]
            });

            const backdrop = DOM.create('div', {
                className: 'modal-backdrop',
                id: 'modal-confirm',
                attrs: { 'aria-hidden': 'true' },
                children: [panel]
            });

            // init() already ran its backdrop sweep, so this node wires its own.
            DOM.on(backdrop, 'click', (e) => {
                if (e.target === backdrop) this.closeActive();
            });

            document.body.appendChild(backdrop);
            this._confirmEl = backdrop;
            return backdrop;
        },

        /** Settle the pending confirm with a value and close its dialog. */
        _resolveConfirm(value) {
            const resolve = this._confirmResolve;
            this._confirmResolve = null;

            // close() calls back into here; the is-open check breaks the loop.
            if (this._confirmEl && this._confirmEl.classList.contains('is-open')) {
                this.close(this._confirmEl);
            }
            if (resolve) resolve(value);
        },

        /* ── Settings ───────────────────────────────── */

        syncSettingsForm() {
            const s = State.get().settings;

            const theme = document.documentElement.getAttribute('data-theme') || 'parchment';
            const radio = DOM.$(`input[name="theme-pref"][value="${theme}"]`);
            if (radio) radio.checked = true;

            const autosaveSelect = DOM.id('setting-autosave');
            if (autosaveSelect) autosaveSelect.value = s.autosave;

            const delay = DOM.id('setting-autosave-delay');
            const delayLabel = DOM.id('autosave-delay-label');
            if (delay) delay.value = String(s.autosaveDelay);
            if (delayLabel) delayLabel.textContent = String(s.autosaveDelay);

            const tab = DOM.id('setting-tab-size');
            const tabLabel = DOM.id('tab-size-label');
            if (tab) tab.value = String(s.tabSize);
            if (tabLabel) tabLabel.textContent = String(s.tabSize);

            this.updateUsageMeter();
        },

        /** Reflect stored size against the ~5 MB LocalStorage budget. */
        updateUsageMeter() {
            const info = Storage.getUsageInfo();
            const fill = DOM.id('usage-fill');
            const label = DOM.id('usage-label');
            if (!info) return;

            const pct = Math.min(100, (info.bytes / (5 * 1024 * 1024)) * 100);
            if (fill) fill.style.width = `${Math.max(1, pct)}%`;
            if (label) label.textContent = info.formatted;
        },

        wireSettings() {
            // Live range labels
            DOM.on('#setting-autosave-delay', 'input', (e) => {
                const el = DOM.id('autosave-delay-label');
                if (el) el.textContent = e.target.value;
            });
            DOM.on('#setting-tab-size', 'input', (e) => {
                const el = DOM.id('tab-size-label');
                if (el) el.textContent = e.target.value;
            });

            DOM.on('#btn-save-settings', 'click', () => {
                const themeRadio = DOM.$('input[name="theme-pref"]:checked');
                if (themeRadio) TOOLMAN.setTheme(themeRadio.value);

                const autosaveSelect = DOM.id('setting-autosave');
                if (autosaveSelect) State.updateSettings('autosave', autosaveSelect.value);

                const delay = DOM.id('setting-autosave-delay');
                if (delay) State.updateSettings('autosaveDelay', Number(delay.value));

                const tab = DOM.id('setting-tab-size');
                if (tab) State.updateSettings('tabSize', Number(tab.value));

                if (window.EditorUI) EditorUI.applyPrefs(); // tab size takes effect now

                Autosave.saveNow();
                this.updateUsageMeter();
                this.closeActive();
                TOOLMAN.notify('Settings saved', 'success', 1600);
            });

            // Export / Import workspace
            DOM.on('#btn-export-workspace', 'click', () => {
                if (Storage.export()) TOOLMAN.notify('Workspace exported', 'success', 1600);
                else TOOLMAN.notify('Export failed', 'error');
            });

            DOM.on('#btn-import-workspace', 'click', () => this.importWorkspace());

            DOM.on('#btn-reset-workspace', 'click', () => {
                this.confirm({
                    title: 'Reset workspace',
                    message: 'This clears your document, custom templates, snippets, history, '
                        + 'and analytics. Seed templates are kept.\n\nThis cannot be undone.',
                    buttons: [
                        { label: 'Cancel', value: false, variant: 'secondary', focus: true },
                        { label: 'Reset everything', value: true, variant: 'danger' }
                    ]
                }).then((sure) => {
                    if (!sure) return;

                    State.reset();
                    Storage.save();

                    if (window.EditorUI) {
                        EditorUI.setValue('');
                        EditorUI.lastSavedContent = '';
                        EditorUI.undoStack.length = 0;
                        EditorUI.redoStack.length = 0;
                        EditorUI.pushSnapshot(true);
                        EditorUI.setStatus('saved');
                    }
                    if (window.WorkspaceUI) WorkspaceUI.renderAll();

                    // Settings closed when the confirm took the stage.
                    TOOLMAN.notify('Workspace reset', 'success');
                });
            });
        },

        /** File-picker → Storage.import → re-hydrate the editor + workspace. */
        importWorkspace() {
            const input = DOM.create('input', {
                attrs: { type: 'file', accept: '.json,application/json' },
                style: { display: 'none' }
            });
            document.body.appendChild(input);

            DOM.on(input, 'change', () => {
                const file = input.files && input.files[0];
                input.remove();
                if (!file) return;

                Storage.import(file)
                    .then(() => {
                        // Re-apply imported state across the UI.
                        if (window.EditorUI) {
                            EditorUI.setValue(State.get().editor.content || '');
                            EditorUI.applyPrefs();
                            const titleInput = DOM.id('doc-title');
                            if (titleInput) titleInput.value = State.get().editor.docTitle;
                            EditorUI.syncTabTitle();
                        }
                        if (window.LayoutUI) {
                            LayoutUI.applyAccordionState();
                            LayoutUI.applySectionOrder();
                        }
                        if (window.WorkspaceUI) WorkspaceUI.renderAll();
                        this.updateUsageMeter();
                        TOOLMAN.notify('Workspace imported', 'success', 1800);
                    })
                    .catch((err) => {
                        console.error('[Settings] Import failed:', err);
                        TOOLMAN.notify('Import failed — invalid backup file', 'error');
                    });
            });

            input.click();
        },

        /* ── Save Snippet ───────────────────────────── */

        /** Open the snippet modal, prefilled from the editor selection. */
        openSnippetModal() {
            const contentField = DOM.id('snippet-content');
            if (contentField && window.EditorUI) {
                const ta = DOM.id('editor-textarea');
                const sel = ta ? Text.getSelection(ta) : { text: '' };
                contentField.value = sel.text || '';
            }
            this.open('modal-save-snippet');
        },

        wireSnippetModal() {
            DOM.on('#btn-confirm-save-snippet', 'click', () => {
                const name = DOM.id('snippet-name')?.value.trim();
                const content = DOM.id('snippet-content')?.value;

                if (!name) {
                    TOOLMAN.notify('Give the snippet a name', 'warning');
                    DOM.id('snippet-name')?.focus();
                    return;
                }
                if (!content) {
                    TOOLMAN.notify('Snippet content is empty', 'warning');
                    DOM.id('snippet-content')?.focus();
                    return;
                }

                const snippet = State.addSnippet({
                    name,
                    tags: DOM.id('snippet-tags')?.value || '',
                    notes: DOM.id('snippet-notes')?.value || '',
                    content
                });

                if (!snippet) {
                    TOOLMAN.notify('Could not save that snippet', 'error');
                    return;
                }

                State.addHistory({ type: 'snippet', description: `Saved snippet: ${snippet.name}` });
                Autosave.saveNow();

                ['snippet-name', 'snippet-tags', 'snippet-notes', 'snippet-content']
                    .forEach((id) => { const el = DOM.id(id); if (el) el.value = ''; });

                if (window.WorkspaceUI) {
                    WorkspaceUI.renderSnippets();
                    WorkspaceUI.renderHistory();
                }
                this.closeActive();
                TOOLMAN.notify(`Snippet "${snippet.name}" saved`, 'success', 1800);
            });
        },

        /* ── Create Template ────────────────────────── */

        wireTemplateModal() {
            DOM.on('#btn-confirm-create-template', 'click', () => {
                const name = DOM.id('template-name')?.value.trim();
                const body = DOM.id('template-body')?.value;

                if (!name) {
                    TOOLMAN.notify('Give the template a name', 'warning');
                    DOM.id('template-name')?.focus();
                    return;
                }
                if (!body) {
                    TOOLMAN.notify('Template body is empty', 'warning');
                    DOM.id('template-body')?.focus();
                    return;
                }

                const template = State.addTemplate({
                    name,
                    description: DOM.id('template-description')?.value || '',
                    content: body
                });

                if (!template) {
                    TOOLMAN.notify('Could not save that template', 'error');
                    return;
                }

                State.addHistory({ type: 'template', description: `Created template: ${template.name}` });
                Autosave.saveNow();

                ['template-name', 'template-description', 'template-body']
                    .forEach((id) => { const el = DOM.id(id); if (el) el.value = ''; });

                if (window.WorkspaceUI) {
                    WorkspaceUI.renderTemplates();
                    WorkspaceUI.renderHistory();
                }
                this.closeActive();
                TOOLMAN.notify(`Template "${template.name}" created`, 'success', 1800);
            });
        }
    };

    window.ModalsUI = ModalsUI;
})();
