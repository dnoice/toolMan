/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: AppOrchestrator (textMan Edition - v2.0)
 *     - File Name: app.js
 *     - Relative Path: tools/textman/js/app.js
 *     - Artifact Type: script
 *     - Version: 2.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Rebuilt for the
 *       toolMan ecosystem: boots every UI module through an error-isolated
 *       registry (one failing module no longer kills the app), removed the
 *       fake loading delays, theme handling delegated to TOOLMAN, save flow
 *       unified through EditorUI, and the loader handoff now actually fires
 *       (the v1 bug: missing scripts meant init never ran).
 *     - 1.0.0 (2025-11-18) [model not recorded] — Initial five-step
 *       initialization skeleton.
 *
 * ✒ Description:
 *     textMan's boot sequence and global concerns. Restores persisted state,
 *     initializes every UI module defensively, applies restored UI state,
 *     wires global keyboard shortcuts and lifecycle saves, then completes the
 *     loading screen handoff. If anything fails, the loader fail-safe still
 *     reveals the app and the error surfaces as a toast.
 *
 * ✒ Key Features:
 *     - Error-isolated module boot: each UI module inits in its own try/catch
 *     - State restore before first paint of the workspace
 *     - Global shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+F focus search, Esc close
 *     - Lifecycle persistence: pagehide + visibilitychange saves
 *     - Session tracking in analytics
 *     - Loader completion with guaranteed handoff
 *
 * ✒ Usage Instructions:
 *     Script-tag module — must be the LAST script tag in
 *     tools/textman/index.html; it assumes all shared libraries, state, and
 *     UI modules are already present on window. App.init() runs automatically
 *     on DOMContentLoaded (or immediately if the DOM is already parsed) and
 *     calls each registered module's init() in App.modules order.
 *
 * ✒ Examples:
 *     - App.modules boot order: 'LayoutUI' → 'HeaderUI' → 'EditorUI' →
 *       'WorkspaceUI' → tool panes → 'ModalsUI'
 *     - Ctrl/Cmd+S anywhere → EditorUI.saveNow() (browser save dialog blocked)
 *     - Ctrl/Cmd+F → focuses and selects #search-input (not browser find)
 *     - Ctrl/Cmd+, → ModalsUI.open('modal-settings')
 *     - Switching tabs (visibilitychange → hidden) triggers Storage.save()
 *     - Closing with unsaved work → beforeunload warning via editor.isDirty
 *     - App.applyPanelStates(State.get().ui) → re-applies panel/section
 *       collapse attributes to the DOM
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js (toolman, dom, storage, loader), js/state.js,
 *       and every js/ui/*.js module
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: a UI module missing from window logs a console warning
 *       and is skipped — the rest of the app still boots
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const App = {
        initialized: false,

        /** UI modules booted in order, each isolated. */
        modules: [
            'LayoutUI',
            'HeaderUI',
            'EditorUI',
            'WorkspaceUI',
            'TransformUI',
            'SearchUI',
            'PrefixUI',
            'EncodingUI',
            'FormattingUI',
            'ModalsUI'
        ],

        init() {
            if (this.initialized) return;
            console.info('🖋 textMan starting…');

            try {
                // 1. Restore persisted state
                const restored = Storage.restore();
                console.info(restored ? '✓ State restored' : '· Using default state');

                // 2. Boot UI modules (error-isolated)
                this.modules.forEach((name) => {
                    const module = window[name];
                    if (!module || typeof module.init !== 'function') {
                        console.warn(`[App] Module missing: ${name}`);
                        return;
                    }
                    try {
                        module.init();
                    } catch (error) {
                        console.error(`[App] ${name} failed to initialize:`, error);
                    }
                });

                // 3. Apply restored UI state
                this.applyPanelStates(State.get().ui);

                // 4. Global wiring
                this.setupKeyboardShortcuts();
                this.setupLifecycleSaves();
                this.trackSession();

                this.initialized = true;
                console.info('✓ textMan ready');
            } catch (error) {
                console.error('✗ textMan failed to initialize:', error);
                if (window.TOOLMAN) {
                    TOOLMAN.notify('Something went wrong while loading — some features may be unavailable', 'error', 6000);
                }
            } finally {
                // 5. Hand off from the loader — ALWAYS.
                if (window.Loader) Loader.complete();
            }
        },

        /** Apply restored panel/section collapse states to the DOM. */
        applyPanelStates(uiState) {
            const mainEl = DOM.$('.app-main');
            if (mainEl) {
                mainEl.setAttribute('data-left-collapsed', String(uiState.leftPanelCollapsed));
                mainEl.setAttribute('data-right-collapsed', String(uiState.rightPanelCollapsed));
            }

            DOM.id('panel-workspace')?.setAttribute('data-collapsed', String(uiState.leftPanelCollapsed));
            DOM.id('panel-tools')?.setAttribute('data-collapsed', String(uiState.rightPanelCollapsed));

            Object.entries(uiState.collapsedSections).forEach(([section, collapsed]) => {
                const sectionEl = DOM.$(`[data-section="${section}"]`);
                if (sectionEl) sectionEl.setAttribute('data-collapsed', String(collapsed));
            });
        },

        /** Global keyboard shortcuts. */
        setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                const mod = e.ctrlKey || e.metaKey;

                // Ctrl/Cmd + S — save
                if (mod && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    if (window.EditorUI) EditorUI.saveNow();
                }

                // Ctrl/Cmd + F — focus the search tool (not browser find)
                if (mod && e.key.toLowerCase() === 'f') {
                    const searchInput = DOM.id('search-input');
                    if (searchInput) {
                        e.preventDefault();
                        searchInput.focus();
                        searchInput.select();
                    }
                }

                // Ctrl/Cmd + , — settings
                if (mod && e.key === ',') {
                    e.preventDefault();
                    if (window.ModalsUI) ModalsUI.open('modal-settings');
                }

                // Escape — handled by ModalsUI's own listener
            });
        },

        /** Persist on page teardown / backgrounding. */
        setupLifecycleSaves() {
            window.addEventListener('pagehide', () => {
                Storage.save();
            });

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) Storage.save();
            });

            // Warn about unsaved work on close
            window.addEventListener('beforeunload', (e) => {
                Storage.save();
                if (State.get().editor.isDirty) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            });
        },

        /** Count this session in analytics. */
        trackSession() {
            const analytics = State.get().analytics;
            analytics.sessionsCount = (analytics.sessionsCount || 0) + 1;
            analytics.lastSessionDate = new Date().toISOString();
            Storage.save();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }

    window.App = App;
})();
