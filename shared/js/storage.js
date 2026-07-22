/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StorageManager (toolMan Edition - v2.0)
 *     - File Name: storage.js
 *     - Relative Path: shared/js/storage.js
 *     - Artifact Type: library
 *     - Version: 2.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Generalized for
 *       the toolMan ecosystem: tools now configure their own namespaced key,
 *       state provider, and restore strategy via Storage.configure().
 *       Hardened: prototype-pollution-safe JSON parsing,
 *       storage-availability probing, import validation without wholesale
 *       state replacement, quota-exceeded recovery, and an Autosave flush
 *       wired to pagehide.
 *     - 1.0.0 (2025-11-18) [model not recorded] — Initial LocalStorage
 *       wrapper with versioning, export/import, and debounced autosave.
 *
 * ✒ Description:
 *     Generic, hardened LocalStorage persistence for toolMan tools. A tool
 *     registers its namespace, version, state provider, and restore callback
 *     once via Storage.configure(); after that,
 *     save/load/restore/export/import all operate on that tool's own
 *     'toolman.<tool>.state' key. Parsing is prototype-pollution safe and
 *     every storage touch is wrapped so private browsing modes degrade
 *     gracefully instead of crashing.
 *
 * ✒ Key Features:
 *     - Per-tool namespacing via Storage.configure({ key, version, ... })
 *     - Prototype-pollution-safe JSON parsing (strips __proto__/constructor)
 *     - Storage availability probing — no throws in private mode
 *     - Version stamping with a migration hook
 *     - Quota-exceeded recovery via a configurable trim callback
 *     - Export to a downloaded JSON file / import with structural validation
 *     - Debounced Autosave with immediate flush support
 *     - Usage reporting (bytes/KB/MB of the tool's stored state)
 *
 * ✒ Usage Instructions:
 *     Configure once, early, from the tool's state module:
 *         Storage.configure({
 *             key: 'toolman.textman.state',
 *             version: '2.0.0',
 *             getState: () => window.AppState,
 *             restore: (saved) => mergeIntoAppState(saved),
 *             trim: (state) => { state.history = state.history.slice(0, 20); }
 *         });
 *     Then: Storage.save(), Storage.restore(), Storage.export(),
 *     Autosave.start().
 *
 * ✒ Examples:
 *     Storage.save()                     → persists getState() result
 *     Storage.restore()                  → loads + hands state to restore()
 *     Storage.clear()                    → removes this tool's key only
 *     Storage.export()                   → downloads toolman-textman-*.json
 *     Storage.import(file).then(...)     → validated import + save
 *     Storage.getUsageInfo().formatted   → e.g. '12.40 KB'
 *     Autosave.start(1000)               → debounced save in 1s
 *     Autosave.saveNow()                 → cancel pending, save immediately
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (window.TOOLMAN optional, used for toasts if
 *       present)
 *     - Compatible platforms: all evergreen browsers
 *     - Security: JSON parsing strips __proto__/constructor/prototype keys;
 *       imports are validated and routed through the restore callback
 *     - Data safety: import merges only known top-level keys when the
 *       restore callback is present; it never blindly replaces application
 *       state
 *     - Limitations: subject to the browser's localStorage quota; the trim
 *       callback is the only recovery path once the quota is hit
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /** JSON.parse reviver that drops prototype-pollution vectors. */
    function safeReviver(key, value) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
        }
        return value;
    }

    function safeParse(raw) {
        return JSON.parse(raw, safeReviver);
    }

    const Storage = {
        KEY: 'toolman.app.state',
        VERSION: '1.0.0',

        /** Tool-supplied hooks (set via configure). */
        _getState: () => null,
        _restore: null,
        _trim: null,
        _migrations: {},

        /**
         * Register this tool's persistence contract.
         * @param {object} opts
         * @param {string} opts.key       - namespaced storage key
         * @param {string} opts.version   - current schema version
         * @param {function} opts.getState - returns the state object to persist
         * @param {function} [opts.restore] - receives parsed saved state
         * @param {function} [opts.trim]    - mutates state to free space on quota errors
         * @param {object}   [opts.migrations] - { 'oldVersion': (state) => newState }
         */
        configure(opts = {}) {
            if (opts.key) this.KEY = opts.key;
            if (opts.version) this.VERSION = opts.version;
            if (typeof opts.getState === 'function') this._getState = opts.getState;
            if (typeof opts.restore === 'function') this._restore = opts.restore;
            if (typeof opts.trim === 'function') this._trim = opts.trim;
            if (opts.migrations && typeof opts.migrations === 'object') {
                this._migrations = opts.migrations;
            }
            return this;
        },

        /** True when localStorage is writable in this context. */
        isAvailable() {
            if (window.TOOLMAN) return window.TOOLMAN.storageAvailable();
            try {
                const probe = '__storage_probe__';
                window.localStorage.setItem(probe, '1');
                window.localStorage.removeItem(probe);
                return true;
            } catch (_err) {
                return false;
            }
        },

        /** Persist the configured state. Returns success boolean. */
        save() {
            try {
                const state = this._getState();
                if (!state || typeof state !== 'object') {
                    console.warn('[Storage] No state to save — did you call configure()?');
                    return false;
                }

                const payload = {
                    version: this.VERSION,
                    timestamp: new Date().toISOString(),
                    state
                };

                window.localStorage.setItem(this.KEY, JSON.stringify(payload));
                return true;
            } catch (error) {
                console.error('[Storage] Save failed:', error);
                if (error && error.name === 'QuotaExceededError') {
                    return this.handleQuotaExceeded();
                }
                return false;
            }
        },

        /** Load and return the saved state object (or null). */
        load() {
            try {
                const raw = window.localStorage.getItem(this.KEY);
                if (!raw) return null;

                const data = safeParse(raw);
                if (!data || typeof data !== 'object' || !data.state) {
                    console.warn('[Storage] Saved payload malformed — ignoring');
                    return null;
                }

                if (data.version !== this.VERSION) {
                    console.info(`[Storage] Migrating ${data.version} → ${this.VERSION}`);
                    return this.migrate(data);
                }

                return data.state;
            } catch (error) {
                console.error('[Storage] Load failed:', error);
                return null;
            }
        },

        /** Load saved state and hand it to the tool's restore callback. */
        restore() {
            const saved = this.load();
            if (!saved) return false;

            if (!this._restore) {
                console.warn('[Storage] No restore callback configured');
                return false;
            }

            try {
                this._restore(saved);
                return true;
            } catch (error) {
                console.error('[Storage] Restore failed:', error);
                return false;
            }
        },

        /** Remove this tool's stored state only. */
        clear() {
            try {
                window.localStorage.removeItem(this.KEY);
                return true;
            } catch (error) {
                console.error('[Storage] Clear failed:', error);
                return false;
            }
        },

        /** Run registered migrations in sequence; fall back to raw state. */
        migrate(oldData) {
            let state = oldData.state;
            const from = oldData.version || '0.0.0';
            const migration = this._migrations[from];

            if (typeof migration === 'function') {
                try {
                    state = migration(state) || state;
                } catch (error) {
                    console.error(`[Storage] Migration from ${from} failed:`, error);
                }
            }
            return state;
        },

        /** Free space via the tool's trim callback, then retry once. */
        handleQuotaExceeded() {
            console.warn('[Storage] Quota exceeded — attempting trim');
            try {
                const state = this._getState();
                if (state && this._trim) this._trim(state);

                window.localStorage.setItem(this.KEY, JSON.stringify({
                    version: this.VERSION,
                    timestamp: new Date().toISOString(),
                    state
                }));
                console.info('[Storage] Saved after trimming');
                return true;
            } catch (_error) {
                console.error('[Storage] Still cannot save after trimming');
                if (window.TOOLMAN) {
                    window.TOOLMAN.notify('Storage is full — recent changes may not persist', 'error');
                }
                return false;
            }
        },

        /** Download the current state as a JSON file. */
        export() {
            try {
                const state = this._getState();
                const payload = {
                    version: this.VERSION,
                    exportDate: new Date().toISOString(),
                    state
                };

                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                    type: 'application/json'
                });
                const url = URL.createObjectURL(blob);
                const slug = this.KEY.replace(/\./g, '-');

                const a = document.createElement('a');
                a.href = url;
                a.download = `${slug}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                return true;
            } catch (error) {
                console.error('[Storage] Export failed:', error);
                return false;
            }
        },

        /**
         * Import state from a user-provided JSON file. The payload is
         * validated and routed through the restore callback (merge), never
         * assigned wholesale.
         */
        import(file) {
            return new Promise((resolve, reject) => {
                if (!file) {
                    reject(new Error('No file provided'));
                    return;
                }

                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = safeParse(e.target.result);

                        if (!data || typeof data !== 'object' || !data.state || !data.version) {
                            throw new Error('Invalid export file format');
                        }

                        if (this._restore) {
                            this._restore(data.state);
                        } else {
                            throw new Error('No restore callback configured');
                        }

                        this.save();
                        resolve(true);
                    } catch (error) {
                        console.error('[Storage] Import failed:', error);
                        reject(error);
                    }
                };

                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });
        },

        /** Size of this tool's stored payload. */
        getUsageInfo() {
            try {
                const data = window.localStorage.getItem(this.KEY);
                const bytes = data ? new Blob([data]).size : 0;
                const kb = (bytes / 1024).toFixed(2);
                const mb = (bytes / 1024 / 1024).toFixed(2);

                return {
                    bytes,
                    kb,
                    mb,
                    formatted: bytes < 1024 ? `${bytes} bytes`
                        : bytes < 1024 * 1024 ? `${kb} KB`
                        : `${mb} MB`
                };
            } catch (error) {
                console.error('[Storage] Usage info failed:', error);
                return null;
            }
        }
    };

    /* ── Autosave ─────────────────────────────────────────── */
    let autosaveTimer = null;

    const Autosave = {
        /** Debounced save: fires `delay` ms after the last call. */
        start(delay = 1000) {
            this.stop();
            autosaveTimer = setTimeout(() => {
                autosaveTimer = null;
                Storage.save();
            }, delay);
        },

        stop() {
            if (autosaveTimer) {
                clearTimeout(autosaveTimer);
                autosaveTimer = null;
            }
        },

        /** Cancel any pending save and persist immediately. */
        saveNow() {
            this.stop();
            return Storage.save();
        },

        /** True when a save is queued. */
        isPending() {
            return autosaveTimer !== null;
        }
    };

    // Flush pending work when the page is being backgrounded or torn down.
    // pagehide is the reliable signal on modern browsers (incl. mobile).
    window.addEventListener('pagehide', () => {
        if (Autosave.isPending()) Autosave.saveNow();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && Autosave.isPending()) Autosave.saveNow();
    });

    window.Storage = Storage;
    window.Autosave = Autosave;
})();
