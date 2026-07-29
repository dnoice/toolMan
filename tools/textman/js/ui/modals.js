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

    // Editor tab size is discrete; the stepper clamps to this range, matching the
    // 2–8 guard State.updateSettings enforces on restore.
    const TAB_MIN = 2;
    const TAB_MAX = 8;

    // The whole LocalStorage budget the usage meter measures against (~5 MB).
    const STORAGE_BUDGET = 5 * 1024 * 1024;

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

            // Rewrite the Help modal's shortcut chips to this platform's modifier
            // once, up front — the kbd chips are static markup already in the DOM.
            this.applyPlatformShortcuts();
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

            // Escape, the backdrop, and the X all land here — a confirm or
            // prompt closed this way resolves as dismissed, never as a silent
            // side effect.
            if (modal === this._confirmEl) this._resolveConfirm(this._confirmDismissValue);
            if (modal === this._promptEl) this._resolvePrompt(null);

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

        /* ── Prompt dialog ──────────────────────────── */

        _promptEl: null,
        _promptResolve: null,

        /**
         * Promise-based replacement for window.prompt(), wearing the house
         * dialog chrome. Resolves with the entered string, or null when the
         * user backs out via Cancel, Escape, the backdrop, or the X.
         *
         * opts: { title, label, hint, value, type, min, max, step,
         *         confirmLabel, validate(raw) -> string|null error }
         *
         * Enter submits, Escape cancels, and the value is validated inline —
         * an invalid entry keeps the dialog open with the message shown rather
         * than closing and silently doing nothing.
         */
        prompt(opts = {}) {
            this._resolvePrompt(null);   // any stale prompt settles first

            const backdrop = this._ensurePromptDialog();
            const input = DOM.$('.prompt-input', backdrop);
            const errorEl = DOM.$('.prompt-error', backdrop);

            DOM.$('.prompt-title', backdrop).textContent = opts.title || 'Enter a value';
            DOM.$('.prompt-label', backdrop).textContent = opts.label || '';
            DOM.$('.prompt-hint', backdrop).textContent = opts.hint || '';
            DOM.$('.prompt-hint', backdrop).hidden = !opts.hint;
            DOM.$('.prompt-submit', backdrop).textContent = opts.confirmLabel || 'OK';

            input.type = opts.type || 'text';
            input.value = opts.value === undefined ? '' : String(opts.value);
            ['min', 'max', 'step'].forEach((attr) => {
                if (opts[attr] === undefined) input.removeAttribute(attr);
                else input.setAttribute(attr, String(opts[attr]));
            });
            errorEl.textContent = '';
            errorEl.hidden = true;
            input.setAttribute('aria-invalid', 'false');

            const submit = () => {
                const raw = input.value;
                const error = typeof opts.validate === 'function' ? opts.validate(raw) : null;
                if (error) {
                    // Keep the dialog open and say why, rather than closing on
                    // a value we are about to throw away.
                    errorEl.textContent = error;
                    errorEl.hidden = false;
                    input.setAttribute('aria-invalid', 'true');
                    input.focus();
                    input.select();
                    return;
                }
                this._resolvePrompt(raw);
            };

            backdrop._submit = submit;

            return new Promise((resolve) => {
                this._promptResolve = resolve;
                this.open('modal-prompt');
                input.focus();
                input.select();
            });
        },

        /** Build the shared prompt shell once; every call reuses the node. */
        _ensurePromptDialog() {
            if (this._promptEl) return this._promptEl;

            const input = DOM.create('input', {
                className: 'text-input prompt-input',
                id: 'prompt-input',
                attrs: { type: 'text', autocomplete: 'off' }
            });

            const submitBtn = DOM.create('button', {
                className: 'btn btn-primary prompt-submit',
                text: 'OK',
                attrs: { type: 'button' }
            });
            const cancelBtn = DOM.create('button', {
                className: 'btn btn-secondary',
                text: 'Cancel',
                attrs: { type: 'button' }
            });

            const panel = DOM.create('div', {
                className: 'modal-panel modal-panel--prompt',
                attrs: {
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-labelledby': 'prompt-title'
                },
                children: [
                    DOM.create('div', {
                        className: 'modal-header',
                        children: [
                            DOM.create('h3', { className: 'modal-title prompt-title', id: 'prompt-title' }),
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
                            DOM.create('div', {
                                className: 'form-group',
                                children: [
                                    DOM.create('label', {
                                        className: 'prompt-label',
                                        attrs: { for: 'prompt-input' }
                                    }),
                                    input,
                                    DOM.create('p', { className: 'help-text prompt-hint' }),
                                    DOM.create('p', {
                                        className: 'prompt-error',
                                        attrs: { role: 'alert', hidden: 'hidden' }
                                    })
                                ]
                            })
                        ]
                    }),
                    DOM.create('div', {
                        className: 'modal-footer',
                        children: [cancelBtn, submitBtn]
                    })
                ]
            });

            const backdrop = DOM.create('div', {
                className: 'modal-backdrop',
                id: 'modal-prompt',
                attrs: { 'aria-hidden': 'true' },
                children: [panel]
            });

            DOM.on(cancelBtn, 'click', () => this._resolvePrompt(null));
            DOM.on(submitBtn, 'click', () => backdrop._submit && backdrop._submit());

            // Enter submits from the field — the reflex for a one-field dialog.
            DOM.on(input, 'keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (backdrop._submit) backdrop._submit();
            });

            // init() already ran its backdrop sweep, so this node wires its own.
            DOM.on(backdrop, 'click', (e) => {
                if (e.target === backdrop) this.closeActive();
            });

            document.body.appendChild(backdrop);
            this._promptEl = backdrop;
            return backdrop;
        },

        /** Settle the pending prompt with a value and close its dialog. */
        _resolvePrompt(value) {
            const resolve = this._promptResolve;
            this._promptResolve = null;

            // close() calls back into here; the is-open check breaks the loop.
            if (this._promptEl && this._promptEl.classList.contains('is-open')) {
                this.close(this._promptEl);
            }
            if (resolve) resolve(value);
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

        // Snapshot of the form as it stood when the dialog opened. Save stays
        // disabled until the live form differs from this — settings apply on
        // Save (staged), so an untouched dialog has nothing to commit (§15.3).
        _settingsBaseline: null,

        syncSettingsForm() {
            const s = State.get().settings;

            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            const radio = DOM.$(`input[name="theme-pref"][value="${theme}"]`);
            if (radio) radio.checked = true;

            const autosaveSelect = DOM.id('setting-autosave');
            if (autosaveSelect) autosaveSelect.value = s.autosave;

            const delay = DOM.id('setting-autosave-delay');
            const delayLabel = DOM.id('autosave-delay-label');
            if (delay) delay.value = String(s.autosaveDelay);
            if (delayLabel) delayLabel.textContent = this._formatDelayLabel(s.autosaveDelay);
            // The delay slider only appears while debouncing (§15.3).
            this._syncAutosaveDelayVisibility(s.autosave);

            const tab = DOM.id('setting-tab-size');
            if (tab) tab.value = String(s.tabSize);
            this._updateTabStepper();

            this.updateUsageMeter();

            // Baseline last, so it reflects exactly what the user is looking at,
            // then disable Save (nothing has changed yet).
            this._settingsBaseline = this._readSettingsSnapshot();
            this._refreshSettingsDirty();
        },

        /** Milliseconds as a friendly seconds label, e.g. 1000 → "1.0 s". */
        _formatDelayLabel(ms) {
            return `${(Number(ms) / 1000).toFixed(1)} s`;
        },

        /** Debounced mode is the only one the delay applies to; hide it otherwise. */
        _syncAutosaveDelayVisibility(mode) {
            const group = DOM.id('autosave-delay-group');
            if (group) group.hidden = mode !== 'debounced';
        },

        /** Reflect the hidden tab-size value into the stepper label + bound states. */
        _updateTabStepper() {
            const tab = DOM.id('setting-tab-size');
            const label = DOM.id('tab-size-label');
            const dec = DOM.id('tab-size-dec');
            const inc = DOM.id('tab-size-inc');
            if (!tab) return;

            const n = Number(tab.value);
            if (label) label.textContent = String(n);
            // Disable at the rails so the value can never leave 2–8.
            if (dec) dec.disabled = n <= TAB_MIN;
            if (inc) inc.disabled = n >= TAB_MAX;
        },

        /** The four staged values, read straight off the live controls. */
        _readSettingsSnapshot() {
            return {
                theme: DOM.$('input[name="theme-pref"]:checked')?.value || '',
                autosave: DOM.id('setting-autosave')?.value || '',
                delay: Number(DOM.id('setting-autosave-delay')?.value),
                tabSize: Number(DOM.id('setting-tab-size')?.value)
            };
        },

        /** Enable Save only when the form differs from its opening baseline. */
        _refreshSettingsDirty() {
            const save = DOM.id('btn-save-settings');
            const base = this._settingsBaseline;
            if (!save || !base) return;

            const now = this._readSettingsSnapshot();
            const dirty = now.theme !== base.theme
                || now.autosave !== base.autosave
                || now.delay !== base.delay
                || now.tabSize !== base.tabSize;
            save.disabled = !dirty;
        },

        /**
         * Reflect stored size against the ~5 MB LocalStorage budget. A raw 2.5 KB
         * fill is invisible, so the number and percent carry the meaning and the
         * bar keeps a small visible nib whenever anything at all is stored (§15.3).
         */
        updateUsageMeter() {
            const info = Storage.getUsageInfo();
            const fill = DOM.id('usage-fill');
            const label = DOM.id('usage-label');
            const percent = DOM.id('usage-percent');
            if (!info) return;

            const pct = Math.min(100, (info.bytes / STORAGE_BUDGET) * 100);
            // Empty → truly empty; anything stored → at least a 4% nib so the bar
            // never reads as broken at tiny values.
            if (fill) fill.style.width = info.bytes === 0 ? '0%' : `${Math.max(4, pct)}%`;
            if (label) label.textContent = `${info.formatted} used`;
            if (percent) percent.textContent = pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
        },

        wireSettings() {
            // Any control changing re-checks the dirty state (delegated so it
            // covers the theme radios, the mode select, and the delay slider
            // without a listener each). The stepper drives a hidden input that
            // does not emit change, so it re-checks explicitly below.
            DOM.delegate('#modal-settings', 'change', 'input, select', () => this._refreshSettingsDirty());

            // Autosave mode governs whether the delay control is even shown.
            DOM.on('#setting-autosave', 'change', (e) => this._syncAutosaveDelayVisibility(e.target.value));

            // Live seconds readout as the delay slider moves.
            DOM.on('#setting-autosave-delay', 'input', (e) => {
                const el = DOM.id('autosave-delay-label');
                if (el) el.textContent = this._formatDelayLabel(Number(e.target.value));
                this._refreshSettingsDirty();
            });

            // Tab-size stepper: discrete 2–8, clamped; the hidden input is the
            // single value syncSettingsForm and Save read.
            const stepTab = (delta) => {
                const tab = DOM.id('setting-tab-size');
                if (!tab) return;
                const next = Math.min(TAB_MAX, Math.max(TAB_MIN, Number(tab.value) + delta));
                tab.value = String(next);
                this._updateTabStepper();
                this._refreshSettingsDirty();
            };
            DOM.on('#tab-size-dec', 'click', () => stepTab(-1));
            DOM.on('#tab-size-inc', 'click', () => stepTab(1));

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

        /* ── Help — platform-aware shortcuts ────────── */

        /** True on macOS, where the primary modifier is ⌘ rather than Ctrl. */
        _detectMac() {
            // userAgentData.platform is the modern, non-deprecated signal; fall
            // back to navigator.platform / userAgent on browsers without it.
            const nav = window.navigator || {};
            const uaData = nav.userAgentData;
            if (uaData && typeof uaData.platform === 'string') {
                return /mac/i.test(uaData.platform);
            }
            return /mac/i.test(nav.platform || nav.userAgent || '');
        },

        /**
         * Rewrite every .kbd-shortcut chip to this platform's modifier: ⌘ (and ⇧
         * for Shift) joined tight on macOS, Ctrl+/Shift+ spelled out on Windows
         * and Linux (§15.4). Pass a boolean to force the platform (used by tests).
         */
        applyPlatformShortcuts(forceMac) {
            const isMac = typeof forceMac === 'boolean' ? forceMac : this._detectMac();
            DOM.$$('.kbd-shortcut').forEach((el) => {
                const key = el.dataset.key || '';
                const shift = el.dataset.shift === 'true';
                el.textContent = isMac
                    ? `⌘${shift ? '⇧' : ''}${key}`
                    : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
            });
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
