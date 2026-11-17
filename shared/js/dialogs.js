/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: DialogKit (toolMan Edition - v1.0)
 *     - File Name: dialogs.js
 *     - Relative Path: shared/js/dialogs.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The shared dialog layer for toolMan workbenches: open/close with focus
 *     restore and a focus trap, promise-based confirm() and prompt() dialogs
 *     in the house navy/gold chrome, and a declarative Settings binder that
 *     gives every tool staged settings, theme choice, backup/restore, a
 *     storage meter, and a guarded reset without per-tool plumbing.
 *
 * ✒ Key Features:
 *     - Dialogs.open/close/closeActive with focus return to the opener
 *     - Escape, backdrop click, and any .modal-close/.modal-cancel dismiss
 *     - Tab focus trap inside the open dialog
 *     - confirm({ title, message, confirmLabel, danger }) → Promise<boolean>
 *     - prompt({ title, label, value, validate, multiline }) → Promise<string|null>
 *       with inline validation that keeps the dialog open
 *     - bindSettings(): [data-setting] fields typed by element, staged until
 *       Save, Save enabled only when the form is dirty
 *     - Built-in theme radios, export/import, usage meter, and reset hooks
 *     - Steppers via .stepper[data-stepper] and live range read-outs
 *     - Platform-aware <kbd data-key> chips (⌘ on macOS, Ctrl elsewhere)
 *
 * ✒ Usage Instructions:
 *     Load after toolman.js, dom.js, and storage.js. ToolApp.boot() calls
 *     Dialogs.init(); tools then call:
 *         Dialogs.bindSettings({
 *             getSettings: () => AppState.settings,
 *             applySettings: (values) => { ... },
 *             onReset: () => { ... }
 *         });
 *     Mark fields in the settings modal with data-setting="key".
 *
 * ✒ Examples:
 *     await Dialogs.confirm({ title: 'Delete palette?', danger: true })
 *     await Dialogs.prompt({ title: 'Rename', value: 'Sunset' })
 *     <input type="range" data-setting="precision" data-display="precision">
 *     <div class="stepper" data-stepper="tabSize" data-min="2" data-max="8">
 *     <kbd data-key="K">Ctrl + K</kbd>  → "⌘ K" on a Mac
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, shared/js/toolman.js,
 *       shared/js/storage.js; markup styled by shared/css/workbench.css
 *     - Compatible platforms: all evergreen browsers
 *     - Security: dialog titles and messages are set via textContent only
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const STORAGE_BUDGET = 5 * 1024 * 1024;

    function isMac() {
        const p = (navigator.userAgentData && navigator.userAgentData.platform)
            || navigator.platform || navigator.userAgent || '';
        return /mac|iphone|ipad/i.test(p);
    }

    const Dialogs = {
        activeModal: null,
        _restoreFocusTo: null,
        _initialized: false,
        _settings: null,
        _confirmEl: null,
        _confirmResolve: null,
        _promptEl: null,
        _promptResolve: null,

        init() {
            if (this._initialized) return;
            this._initialized = true;

            DOM.delegate(document.body, 'click', '.modal-close, .modal-cancel', () => this.closeActive());

            document.addEventListener('click', (e) => {
                if (this.activeModal && e.target === this.activeModal) this.closeActive();
            });

            DOM.$$('.modal-backdrop').forEach((b) => b.setAttribute('aria-hidden', 'true'));

            document.addEventListener('keydown', (e) => {
                if (!this.activeModal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeActive();
                } else if (e.key === 'Tab') {
                    this.trapFocus(e);
                }
            });

            this.applyPlatformShortcuts();
        },

        /* ── Core ─────────────────────────────────── */

        open(id) {
            const modal = typeof id === 'string' ? DOM.id(id) : id;
            if (!modal) return;
            if (this.activeModal && this.activeModal !== modal) this.close(this.activeModal, { silent: true });

            this._restoreFocusTo = this._restoreFocusTo || document.activeElement;
            this.activeModal = modal;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');

            if (this._settings && modal.id === this._settings.modalId) this._syncSettings();
            modal.dispatchEvent(new CustomEvent('dialog:open'));

            const auto = DOM.$('[autofocus]', modal) || DOM.$(FOCUSABLE, DOM.$('.modal-body', modal) || modal)
                || DOM.$(FOCUSABLE, modal);
            if (auto) auto.focus();
        },

        close(modal, { silent } = {}) {
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            if (this.activeModal === modal) this.activeModal = null;

            // Escape / backdrop / X on a confirm or prompt resolves as dismissed.
            if (modal === this._confirmEl) this._settleConfirm(false);
            if (modal === this._promptEl) this._settlePrompt(null);
            modal.dispatchEvent(new CustomEvent('dialog:close'));

            if (!silent) {
                const back = this._restoreFocusTo;
                this._restoreFocusTo = null;
                if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
            }
        },

        closeActive() {
            if (this.activeModal) this.close(this.activeModal);
        },

        trapFocus(e) {
            const items = DOM.$$(FOCUSABLE, this.activeModal)
                .filter((el) => el.offsetParent !== null && !el.disabled);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        },

        /* ── Confirm ──────────────────────────────── */

        _buildShell(id, panelClass, titleId) {
            const backdrop = DOM.create('div', {
                className: 'modal-backdrop',
                id,
                attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-hidden': 'true' }
            });
            backdrop.innerHTML = `
                <div class="modal-panel ${panelClass}">
                    <header class="modal-header">
                        <h3 class="modal-title" id="${titleId}"></h3>
                        <button type="button" class="modal-close" aria-label="Close">×</button>
                    </header>
                    <div class="modal-body"></div>
                    <footer class="modal-footer"></footer>
                </div>`;
            document.body.appendChild(backdrop);
            return backdrop;
        },

        /**
         * Promise-based confirm in the house chrome. Resolves true only when
         * the confirming button is pressed; Escape/backdrop/X resolve false.
         */
        confirm(opts = {}) {
            this._settleConfirm(false);
            if (!this._confirmEl) {
                this._confirmEl = this._buildShell('modal-confirm', 'modal-panel--confirm', 'confirm-title');
                DOM.$('.modal-body', this._confirmEl).appendChild(DOM.create('p', { className: 'confirm-message' }));
            }
            const el = this._confirmEl;
            DOM.$('.modal-title', el).textContent = opts.title || 'Are you sure?';
            DOM.$('.confirm-message', el).textContent = opts.message || '';

            const footer = DOM.$('.modal-footer', el);
            DOM.empty(footer);
            const cancel = DOM.create('button', {
                className: 'btn btn-secondary', text: opts.cancelLabel || 'Cancel', attrs: { type: 'button' }
            });
            const ok = DOM.create('button', {
                className: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
                text: opts.confirmLabel || 'Confirm',
                attrs: { type: 'button' }
            });
            DOM.on(cancel, 'click', () => { this._settleConfirm(false); this.close(el); });
            DOM.on(ok, 'click', () => { this._settleConfirm(true); this.close(el); });
            footer.appendChild(cancel);
            footer.appendChild(ok);

            return new Promise((resolve) => {
                this._confirmResolve = resolve;
                this.open(el);
                // Destructive dialogs land focus on the safe choice.
                (opts.danger ? cancel : ok).focus();
            });
        },

        _settleConfirm(value) {
            const resolve = this._confirmResolve;
            this._confirmResolve = null;
            if (resolve) resolve(value);
        },

        /* ── Prompt ───────────────────────────────── */

        /**
         * Promise-based prompt. validate(raw) returns an error string to keep
         * the dialog open with the message shown, or null to accept.
         */
        prompt(opts = {}) {
            this._settlePrompt(null);
            if (!this._promptEl) {
                this._promptEl = this._buildShell('modal-prompt', 'modal-panel--prompt', 'prompt-title');
            }
            const el = this._promptEl;
            DOM.$('.modal-title', el).textContent = opts.title || 'Enter a value';

            const body = DOM.$('.modal-body', el);
            DOM.empty(body);
            const group = DOM.create('div', { className: 'form-group' });
            const label = DOM.create('label', { text: opts.label || '', attrs: { for: 'prompt-input' } });
            const field = DOM.create(opts.multiline ? 'textarea' : 'input', {
                className: 'text-input prompt-input',
                id: 'prompt-input',
                attrs: { autocomplete: 'off', spellcheck: 'false' }
            });
            if (!opts.multiline) field.type = opts.type || 'text';
            if (opts.multiline) field.rows = opts.rows || 6;
            field.value = opts.value === undefined ? '' : String(opts.value);
            if (opts.placeholder) field.placeholder = opts.placeholder;
            const hint = DOM.create('p', { className: 'help-text', text: opts.hint || '' });
            hint.hidden = !opts.hint;
            const error = DOM.create('p', { className: 'prompt-error', attrs: { role: 'alert' } });
            error.hidden = true;
            if (opts.label) group.appendChild(label);
            group.append(field, hint, error);
            body.appendChild(group);

            const footer = DOM.$('.modal-footer', el);
            DOM.empty(footer);
            const cancel = DOM.create('button', { className: 'btn btn-secondary', text: 'Cancel', attrs: { type: 'button' } });
            const ok = DOM.create('button', {
                className: 'btn btn-primary', text: opts.confirmLabel || 'OK', attrs: { type: 'button' }
            });
            footer.append(cancel, ok);

            const submit = () => {
                const raw = field.value;
                const msg = typeof opts.validate === 'function' ? opts.validate(raw) : null;
                if (msg) {
                    error.textContent = msg;
                    error.hidden = false;
                    field.setAttribute('aria-invalid', 'true');
                    field.focus();
                    return;
                }
                this._settlePrompt(raw);
                this.close(el);
            };
            DOM.on(cancel, 'click', () => { this._settlePrompt(null); this.close(el); });
            DOM.on(ok, 'click', submit);
            DOM.on(field, 'keydown', (e) => {
                if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submit();
                }
            });

            return new Promise((resolve) => {
                this._promptResolve = resolve;
                this.open(el);
                field.focus();
                if (field.select) field.select();
            });
        },

        _settlePrompt(value) {
            const resolve = this._promptResolve;
            this._promptResolve = null;
            if (resolve) resolve(value);
        },

        /* ── Platform-aware shortcut chips ────────── */

        applyPlatformShortcuts(root = document) {
            const mac = isMac();
            DOM.$$('kbd[data-key]', root).forEach((kbd) => {
                const parts = [];
                if (kbd.dataset.mod !== 'false') parts.push(mac ? '⌘' : 'Ctrl');
                if (kbd.dataset.alt === 'true') parts.push(mac ? '⌥' : 'Alt');
                if (kbd.dataset.shift === 'true') parts.push(mac ? '⇧' : 'Shift');
                parts.push(kbd.dataset.key);
                kbd.textContent = parts.join(mac ? ' ' : ' + ');
            });
        },

        isMac,

        /* ── Settings binder ──────────────────────── */

        /**
         * opts: { modalId='modal-settings', getSettings, applySettings(values),
         *         formats: { key: (value) => label }, onReset, onImported,
         *         resetConfirm: { title, message } }
         */
        bindSettings(opts) {
            const modal = DOM.id(opts.modalId || 'modal-settings');
            if (!modal) return;
            this._settings = Object.assign({ modalId: modal.id, formats: {} }, opts);
            const s = this._settings;

            DOM.on(modal, 'input', () => this._refreshSettingsUi());
            DOM.on(modal, 'change', () => this._refreshSettingsUi());

            // Steppers drive a hidden [data-setting] input.
            DOM.$$('.stepper[data-stepper]', modal).forEach((stepper) => {
                const key = stepper.dataset.stepper;
                const input = DOM.$(`[data-setting="${key}"]`, modal);
                const step = Number(stepper.dataset.step || 1);
                const min = Number(stepper.dataset.min);
                const max = Number(stepper.dataset.max);
                DOM.delegate(stepper, 'click', '.stepper-btn', (e, btn) => {
                    if (!input) return;
                    const dir = btn.dataset.dir === 'down' ? -1 : 1;
                    const next = Math.min(max, Math.max(min, Number(input.value) + dir * step));
                    input.value = String(next);
                    this._refreshSettingsUi();
                });
            });

            const save = DOM.$('[data-settings-save]', modal);
            DOM.on(save, 'click', () => {
                const values = this._readSettings();
                const theme = DOM.$('input[name="theme-pref"]:checked', modal);
                if (theme && window.TOOLMAN) TOOLMAN.setTheme(theme.value);
                try {
                    s.applySettings(values);
                } catch (err) {
                    console.error('[Dialogs] applySettings failed:', err);
                }
                if (window.Storage) Storage.save();
                if (window.TOOLMAN) TOOLMAN.notify('Settings saved', 'success', 1500);
                this.close(modal);
            });

            DOM.on(DOM.$('[data-settings-export]', modal), 'click', () => {
                const ok = window.Storage && Storage.export();
                if (window.TOOLMAN) TOOLMAN.notify(ok ? 'Backup downloaded' : 'Backup failed', ok ? 'success' : 'error', 2000);
            });

            const importBtn = DOM.$('[data-settings-import]', modal);
            if (importBtn) {
                const file = DOM.create('input', { attrs: { type: 'file', accept: 'application/json,.json', hidden: 'hidden' } });
                modal.appendChild(file);
                DOM.on(importBtn, 'click', () => file.click());
                DOM.on(file, 'change', async () => {
                    const f = file.files && file.files[0];
                    file.value = '';
                    if (!f) return;
                    try {
                        await Storage.import(f);
                        if (typeof s.onImported === 'function') s.onImported();
                        this._syncSettings();
                        TOOLMAN.notify('Backup merged into this browser', 'success', 2200);
                    } catch (err) {
                        TOOLMAN.notify(`Import failed: ${err.message}`, 'error', 4000);
                    }
                });
            }

            DOM.on(DOM.$('[data-settings-reset]', modal), 'click', async () => {
                const rc = s.resetConfirm || {};
                const sure = await this.confirm({
                    title: rc.title || 'Reset this tool?',
                    message: rc.message || 'Everything this tool has saved in this browser will be deleted. This cannot be undone.',
                    confirmLabel: rc.confirmLabel || 'Reset',
                    danger: true
                });
                if (!sure) return;
                try {
                    if (typeof s.onReset === 'function') s.onReset();
                    if (window.Storage) Storage.save();
                    TOOLMAN.notify('Reset complete', 'success', 1800);
                } catch (err) {
                    console.error('[Dialogs] reset failed:', err);
                }
            });
        },

        _syncSettings() {
            const s = this._settings;
            if (!s) return;
            const modal = DOM.id(s.modalId);
            const current = s.getSettings() || {};

            DOM.$$('[data-setting]', modal).forEach((el) => {
                const key = el.dataset.setting;
                if (!(key in current)) return;
                const v = current[key];
                if (el.type === 'checkbox') el.checked = Boolean(v);
                else if (el.type === 'radio') el.checked = String(el.value) === String(v);
                else el.value = String(v);
            });

            const theme = window.TOOLMAN ? TOOLMAN.getTheme() : null;
            DOM.$$('input[name="theme-pref"]', modal).forEach((r) => { r.checked = r.value === theme; });

            this._renderUsage(modal);
            this._snapshot = JSON.stringify(this._readSettings()) + '|' + theme;
            this._refreshSettingsUi();
        },

        _readSettings() {
            const s = this._settings;
            const modal = DOM.id(s.modalId);
            const values = {};
            DOM.$$('[data-setting]', modal).forEach((el) => {
                const key = el.dataset.setting;
                if (el.type === 'radio') {
                    if (el.checked) values[key] = el.dataset.type === 'number' ? Number(el.value) : el.value;
                } else if (el.type === 'checkbox') {
                    values[key] = el.checked;
                } else if (el.type === 'range' || el.type === 'number' || el.dataset.type === 'number') {
                    values[key] = Number(el.value);
                } else {
                    values[key] = el.value;
                }
            });
            return values;
        },

        _refreshSettingsUi() {
            const s = this._settings;
            if (!s) return;
            const modal = DOM.id(s.modalId);
            const values = this._readSettings();

            DOM.$$('[data-display]', modal).forEach((out) => {
                const key = out.dataset.display;
                const fmt = s.formats[key];
                out.textContent = fmt ? fmt(values[key], values) : String(values[key]);
            });

            DOM.$$('.stepper[data-stepper]', modal).forEach((stepper) => {
                const v = Number(values[stepper.dataset.stepper]);
                const down = DOM.$('.stepper-btn[data-dir="down"]', stepper);
                const up = DOM.$('.stepper-btn[data-dir="up"]', stepper);
                if (down) down.disabled = v <= Number(stepper.dataset.min);
                if (up) up.disabled = v >= Number(stepper.dataset.max);
            });

            // [data-show-when="key=value"] reveals dependent fields.
            DOM.$$('[data-show-when]', modal).forEach((el) => {
                const [key, want] = el.dataset.showWhen.split('=');
                el.hidden = String(values[key]) !== want;
            });

            const theme = DOM.$('input[name="theme-pref"]:checked', modal);
            const now = JSON.stringify(values) + '|' + (theme ? theme.value : '');
            const save = DOM.$('[data-settings-save]', modal);
            if (save) save.disabled = now === this._snapshot;
        },

        _renderUsage(modal) {
            const info = window.Storage ? Storage.getUsageInfo() : null;
            const fill = DOM.$('[data-usage-fill]', modal);
            const label = DOM.$('[data-usage-label]', modal);
            const pct = DOM.$('[data-usage-percent]', modal);
            if (!info) return;
            const ratio = info.bytes / STORAGE_BUDGET;
            if (fill) fill.style.width = info.bytes ? `${Math.max(4, Math.min(100, ratio * 100))}%` : '0%';
            if (label) label.textContent = `${info.formatted} used`;
            if (pct) pct.textContent = ratio < 0.01 ? '<1%' : `${Math.round(ratio * 100)}%`;
        }
    };

    window.Dialogs = Dialogs;
})();
