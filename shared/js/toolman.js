/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EcosystemCore (toolMan Edition - v1.0)
 *     - File Name: toolman.js
 *     - Relative Path: shared/js/toolman.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The toolMan ecosystem kernel. Owns the tool registry (which tools
 *     exist, where they live, and whether they are live), ecosystem-wide
 *     theme management persisted across every tool, and the shared toast
 *     notification system. Load this in <head> so the saved theme applies
 *     before first paint (no theme flash).
 *
 * ✒ Key Features:
 *     - Tool registry: id, name, tagline, description, status, and path for
 *       every tool in the ecosystem
 *     - Theme management: parchment/sentinel, persisted under
 *       'toolman.theme', applied to <html data-theme> immediately on parse
 *     - System-preference fallback: honors prefers-color-scheme on first
 *       visit
 *     - Safe storage access: every localStorage touch wrapped, private-mode
 *       safe
 *     - storageAvailable() probe so tools can test writability before use
 *     - Toast notifications: TOOLMAN.notify(message, type, duration) with
 *       four types (info, success, warning, error)
 *     - Toast stack capped at five entries, click-to-dismiss, rendered in an
 *       aria-live polite status region
 *     - Toast messages rendered via textContent — never interpreted as HTML
 *     - Zero dependencies — must be loadable before every other script
 *
 * ✒ Usage Instructions:
 *     Include as the FIRST script, in <head>, from any page in the
 *     ecosystem:
 *         <script src="../../shared/js/toolman.js"></script>
 *     Then from any tool code:
 *         TOOLMAN.toggleTheme();
 *         TOOLMAN.setTheme('sentinel');
 *         TOOLMAN.notify('Copied to clipboard', 'success');
 *
 * ✒ Examples:
 *     TOOLMAN.getTheme()                       → 'parchment'
 *     TOOLMAN.setTheme('sentinel')             → persists + applies dark theme
 *     TOOLMAN.toggleTheme()                    → flips between the two themes
 *     TOOLMAN.applyTheme('parchment')          → applies without persisting
 *     TOOLMAN.storageAvailable()               → true when localStorage writable
 *     TOOLMAN.tools.find(t => t.id === 'textman').status → 'live'
 *     TOOLMAN.notify('Invalid regex', 'error') → red toast, 3.5s
 *     TOOLMAN.notify('Saved', 'success', 1500) → green toast, 1.5s
 *
 * ✒ Other Important Information:
 *     - Dependencies: none (deliberately standalone)
 *     - Compatible platforms: all evergreen browsers
 *     - Storage keys: 'toolman.theme' (ecosystem-wide); individual tools use
 *       'toolman.<toolId>.state'
 *     - Security: notify() renders messages as text, never HTML
 *     - Limitations: theme persistence silently degrades in private-browsing
 *       modes (theme still applies for the current session)
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const THEME_KEY = 'toolman.theme';
    const THEMES = ['parchment', 'sentinel'];
    const DEFAULT_THEME = 'parchment';

    const TOOLMAN = {
        VERSION: '1.0.0',
        THEME_KEY,
        THEMES,

        /**
         * Registry of every tool in the ecosystem.
         * status: 'live' → launchable | 'soon' → placeholder card on the hub
         * path: relative to the repo root (where the hub's index.html lives)
         */
        tools: [
            {
                id: 'textman',
                name: 'textMan',
                tagline: 'Bend text to your will',
                description: 'A three-panel text workspace: templates, snippets, transforms, search & replace, encoding, and formatting tools.',
                status: 'live',
                path: 'tools/textman/index.html'
            },
            {
                id: 'colorman',
                name: 'colorMan',
                tagline: 'Command the spectrum',
                description: 'Palettes, conversions, contrast checks, and gradient building. Coming soon.',
                status: 'soon',
                path: null
            },
            {
                id: 'mathman',
                name: 'mathMan',
                tagline: 'Numbers, tamed',
                description: 'Calculators, expression evaluation, and unit-aware math. Coming soon.',
                status: 'soon',
                path: null
            },
            {
                id: 'convertman',
                name: 'convertMan',
                tagline: 'From anything, to anything',
                description: 'Units, timestamps, data formats, and file-friendly conversions. Coming soon.',
                status: 'soon',
                path: null
            },
            {
                id: 'devman',
                name: 'devMan',
                tagline: 'A toolbelt for builders',
                description: 'JSON tools, regex testing, UUIDs, hashes, and dev utilities. Coming soon.',
                status: 'soon',
                path: null
            }
        ],

        /**
         * True when localStorage is actually writable (false in some
         * private-browsing modes and locked-down contexts).
         */
        storageAvailable() {
            try {
                const probe = '__toolman_probe__';
                window.localStorage.setItem(probe, '1');
                window.localStorage.removeItem(probe);
                return true;
            } catch (_err) {
                return false;
            }
        },

        /**
         * Resolve the active theme: saved preference → system preference →
         * default. Always returns a valid theme name.
         */
        getTheme() {
            let saved = null;
            try {
                saved = window.localStorage.getItem(THEME_KEY);
            } catch (_err) { /* private mode — fall through */ }

            if (THEMES.includes(saved)) return saved;

            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'sentinel';
            }
            return DEFAULT_THEME;
        },

        /**
         * Apply a theme to the document without persisting it.
         */
        applyTheme(theme) {
            const valid = THEMES.includes(theme) ? theme : DEFAULT_THEME;
            document.documentElement.setAttribute('data-theme', valid);
            return valid;
        },

        /**
         * Persist and apply a theme ecosystem-wide.
         */
        setTheme(theme) {
            const applied = this.applyTheme(theme);
            try {
                window.localStorage.setItem(THEME_KEY, applied);
            } catch (_err) { /* non-fatal: theme still applies this session */ }
            return applied;
        },

        /**
         * Flip between parchment and sentinel.
         */
        toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme') || this.getTheme();
            return this.setTheme(current === 'parchment' ? 'sentinel' : 'parchment');
        },

        /**
         * Show a toast notification.
         * @param {string} message - text to display (rendered as text, never HTML)
         * @param {'info'|'success'|'warning'|'error'} [type]
         * @param {number} [duration] - ms before auto-dismiss
         */
        notify(message, type = 'info', duration = 3500) {
            if (!message) return;

            let stack = document.querySelector('.toast-stack');
            if (!stack) {
                stack = document.createElement('div');
                stack.className = 'toast-stack';
                stack.setAttribute('role', 'status');
                stack.setAttribute('aria-live', 'polite');
                document.body.appendChild(stack);
            }

            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.dataset.type = type;
            toast.textContent = String(message);
            stack.appendChild(toast);

            // Cap the stack so runaway loops can't flood the screen
            while (stack.children.length > 5) {
                stack.removeChild(stack.firstChild);
            }

            const dismiss = () => {
                toast.classList.add('toast-out');
                toast.addEventListener('animationend', () => toast.remove(), { once: true });
                // Fallback removal in case animations are disabled
                setTimeout(() => toast.remove(), 600);
            };

            toast.addEventListener('click', dismiss);
            setTimeout(dismiss, Math.max(1000, duration));
        }
    };

    // Apply the saved/system theme immediately — this file loads in <head>,
    // so the correct palette is in place before first paint.
    TOOLMAN.applyTheme(TOOLMAN.getTheme());

    window.TOOLMAN = TOOLMAN;
})();
