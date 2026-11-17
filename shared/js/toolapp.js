/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ToolAppBoot (toolMan Edition - v1.1)
 *     - File Name: toolapp.js
 *     - Relative Path: shared/js/toolapp.js
 *     - Artifact Type: library
 *     - Version: 1.1.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (11/17/2026) [dendogg + Anthropic - Claude] — Theme toggle
 *       toast reads "Light theme" / "Dark theme"; the toolman:theme event now
 *       comes from the kernel itself, so this file no longer dispatches its
 *       own copy.
 *
 * ✒ Description:
 *     The boot sequence and everyday helpers every three-panel toolMan
 *     workbench shares. ToolApp.boot() restores persisted state, starts the
 *     rails and dialogs, initialises the tool's UI modules in isolation,
 *     wires the header and the standard shortcuts, and always hands off from
 *     the loader — so a new tool is its modules plus one boot call.
 *
 * ✒ Key Features:
 *     - Error-isolated module boot: one failing pane never blanks the tool
 *     - Guaranteed Loader.complete() handoff in a finally block
 *     - Header wiring: light / dark toggle (with toast), settings, help
 *     - Standard shortcuts: Ctrl+S save, Ctrl+, settings, Ctrl+[ / ] rails,
 *       Ctrl+\ Focus mode, ? help — plus tool-specific shortcuts
 *     - Save pill driver: scheduleSave() → saving → saved / error
 *     - Lifecycle saves on pagehide and when the tab is hidden
 *     - Ecosystem stamp (TOOLMAN.stampLastUsed) for the hub's Continue chip
 *     - Helpers: copy() with toast + button flash, download(), uid(),
 *       relativeTime(), escape(), readFile()
 *
 * ✒ Usage Instructions:
 *     Load after dom.js, storage.js, loader.js, workbench.js, and dialogs.js,
 *     then from the tool's app.js:
 *         ToolApp.boot({
 *             id: 'colorman', name: 'colorMan',
 *             modules: ['PickerUI', 'LibraryUI', 'ContrastUI'],
 *             workbench: { getUi: () => AppState.ui, left: {...}, right: {...} },
 *             shortcuts: [{ key: 'k', mod: true, run: () => ... }]
 *         });
 *
 * ✒ Examples:
 *     ToolApp.copy('#C9A84C', 'HEX', buttonEl)   → clipboard + toast + flash
 *     ToolApp.download('palette.css', css, 'text/css')
 *     ToolApp.scheduleSave()                     → debounced Storage.save
 *     ToolApp.uid('pal')                         → 'pal-3f2c…'
 *     ToolApp.relativeTime(Date.now() - 90000)   → '1m ago'
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, dom.js, storage.js, loader.js,
 *       workbench.js, dialogs.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: shortcuts ignore keystrokes typed into fields unless a
 *       shortcut sets allowInFields: true
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const ToolApp = {
        config: null,
        initialized: false,
        _saveTimer: null,

        boot(config) {
            this.config = Object.assign({
                modules: [],
                shortcuts: [],
                saveDelay: 600,
                helpModal: 'modal-help',
                settingsModal: 'modal-settings'
            }, config || {});

            const run = () => this._boot();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run, { once: true });
            } else {
                run();
            }
        },

        _boot() {
            if (this.initialized) return;
            const c = this.config;
            try {
                const restored = window.Storage ? Storage.restore() : false;
                console.info(`[${c.name}] ${restored ? 'state restored' : 'default state'}`);

                if (window.Dialogs) Dialogs.init();
                if (window.Workbench && c.workbench) {
                    Workbench.init(Object.assign({ persist: () => this.scheduleSave() }, c.workbench));
                }

                c.modules.forEach((name) => {
                    const mod = window[name];
                    if (!mod || typeof mod.init !== 'function') {
                        console.warn(`[${c.name}] module missing: ${name}`);
                        return;
                    }
                    try {
                        mod.init();
                    } catch (err) {
                        console.error(`[${c.name}] ${name} failed to initialize:`, err);
                    }
                });

                this.wireHeader();
                this.wireShortcuts();
                this.wireLifecycle();
                if (window.TOOLMAN) TOOLMAN.stampLastUsed(c.id);
                this.setSaveState('saved');

                if (typeof c.onReady === 'function') c.onReady();
                this.initialized = true;
            } catch (err) {
                console.error(`[${c.name}] boot failed:`, err);
                if (window.TOOLMAN) {
                    TOOLMAN.notify('Something went wrong while loading — some features may be unavailable', 'error', 6000);
                }
            } finally {
                if (window.Loader) Loader.complete();
            }
        },

        /* ── Header ───────────────────────────────── */

        wireHeader() {
            const c = this.config;
            DOM.on('#btn-theme', 'click', () => {
                // toggleTheme() fires 'toolman:theme' itself when the theme changes.
                const theme = TOOLMAN.toggleTheme();
                TOOLMAN.notify(`${TOOLMAN.themeLabel(theme)} theme`, 'info', 1600);
            });
            DOM.on('#btn-settings', 'click', () => Dialogs.open(c.settingsModal));
            DOM.on('#btn-help', 'click', () => Dialogs.open(c.helpModal));
        },

        /* ── Shortcuts ────────────────────────────── */

        _inField(target) {
            if (!target || !target.tagName) return false;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
        },

        wireShortcuts() {
            const c = this.config;
            const standard = [
                { key: 's', mod: true, allowInFields: true, run: () => this.saveNow(true) },
                { key: ',', mod: true, allowInFields: true, run: () => Dialogs.open(c.settingsModal) },
                { key: '[', mod: true, allowInFields: true, run: () => Workbench.togglePanel('left') },
                { key: ']', mod: true, allowInFields: true, run: () => Workbench.togglePanel('right') },
                {
                    key: '\\', mod: true, allowInFields: true,
                    run: () => {
                        const on = Workbench.toggleFocus();
                        TOOLMAN.notify(on ? 'Focus mode — Ctrl+\\ to restore' : 'Focus mode off', 'info', 1500);
                    }
                },
                { key: '?', shift: true, run: () => Dialogs.open(c.helpModal) }
            ];
            const all = standard.concat(c.shortcuts || []);

            document.addEventListener('keydown', (e) => {
                if (window.Dialogs && Dialogs.activeModal) return;
                const mod = e.ctrlKey || e.metaKey;
                const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

                for (const sc of all) {
                    const want = sc.key.length === 1 ? sc.key.toLowerCase() : sc.key;
                    if (want !== key) continue;
                    if (Boolean(sc.mod) !== mod) continue;
                    // Letters, digits, and named keys honour Shift; a symbol
                    // like '?' already implies whichever modifier made it.
                    const shiftMatters = want.length !== 1 || /[a-z0-9]/.test(want);
                    if (shiftMatters && Boolean(sc.shift) !== e.shiftKey) continue;
                    if (sc.alt !== undefined && Boolean(sc.alt) !== e.altKey) continue;
                    if (!sc.allowInFields && this._inField(e.target)) continue;
                    e.preventDefault();
                    try { sc.run(e); } catch (err) { console.error('[ToolApp] shortcut failed:', err); }
                    return;
                }
            });
        },

        /* ── Persistence + save pill ──────────────── */

        setSaveState(state) {
            const el = DOM.id('save-status');
            if (!el) return;
            el.dataset.status = state;
            const label = DOM.$('.status-label', el);
            const text = { saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved', error: 'Save failed' }[state] || state;
            if (label) label.textContent = text;
            el.title = state === 'error'
                ? 'Could not save — browser storage may be full or disabled'
                : `${text} — stored in this browser only`;
        },

        /** Debounced save; drives the save pill through saving → saved. */
        scheduleSave(delay) {
            this.setSaveState('saving');
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this.saveNow(false), delay ?? this.config.saveDelay);
        },

        saveNow(announce) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            const ok = window.Storage ? Storage.save() : false;
            this.setSaveState(ok ? 'saved' : 'error');
            if (announce && window.TOOLMAN) TOOLMAN.notify(ok ? 'Saved' : 'Save failed', ok ? 'success' : 'error', 1200);
            return ok;
        },

        wireLifecycle() {
            const flush = () => { if (this._saveTimer) this.saveNow(false); };
            window.addEventListener('pagehide', () => { flush(); if (window.Storage) Storage.save(); });
            document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
        },

        /* ── Helpers ──────────────────────────────── */

        async copy(text, label, button) {
            const ok = await DOM.copyText(String(text ?? ''));
            if (window.TOOLMAN) {
                TOOLMAN.notify(ok ? `Copied${label ? ` ${label}` : ''}` : 'Copy failed — select and copy manually', ok ? 'success' : 'error', 1300);
            }
            if (button && ok) {
                button.dataset.copied = 'true';
                setTimeout(() => { delete button.dataset.copied; }, 1000);
            }
            return ok;
        },

        download(filename, content, mime = 'text/plain') {
            try {
                const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
                const url = URL.createObjectURL(blob);
                const a = DOM.create('a', { attrs: { href: url, download: filename } });
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                return true;
            } catch (err) {
                console.error('[ToolApp] download failed:', err);
                if (window.TOOLMAN) TOOLMAN.notify('Download failed', 'error');
                return false;
            }
        },

        /** Read a user-picked File as text (or dataURL / arrayBuffer). */
        readFile(file, as = 'text') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read the file'));
                if (as === 'dataURL') reader.readAsDataURL(file);
                else if (as === 'arrayBuffer') reader.readAsArrayBuffer(file);
                else reader.readAsText(file);
            });
        },

        uid(prefix = 'id') {
            const core = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            return `${prefix}-${core}`;
        },

        relativeTime(ms) {
            const diff = Date.now() - ms;
            if (!Number.isFinite(diff)) return '';
            if (diff < 60000) return 'just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            return `${Math.floor(diff / 86400000)}d ago`;
        },

        escape(text) {
            return window.Text ? Text.escapeHtml(text) : String(text ?? '');
        },

        /** Briefly mark an element as applied (tiles, buttons). */
        flash(el) {
            if (!el) return;
            el.classList.remove('flash-applied');
            void el.offsetWidth;
            el.classList.add('flash-applied');
            setTimeout(() => el.classList.remove('flash-applied'), 500);
        }
    };

    window.ToolApp = ToolApp;
})();
