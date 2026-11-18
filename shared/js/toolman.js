/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EcosystemCore (toolMan Edition - v1.5)
 *     - File Name: toolman.js
 *     - Relative Path: shared/js/toolman.js
 *     - Artifact Type: javascript
 *     - Version: 1.5.0
 *     - Date: 11/18/2026
 *     - Update: Wednesday, November 18, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.5.0 (11/18/2026) [dendogg + Anthropic - Claude] — mathMan is live:
 *       its registry entry gets a path, a fuller description, and a data
 *       descriptor (sheets beyond the Welcome sheet, and History items) that
 *       drives the hub's badge and reset wording.
 *     - 1.4.0 (11/17/2026) [dendogg + Anthropic - Claude] — colorMan goes
 *       live and svgMan joins the registry as coming soon. Registry entries
 *       can carry a data descriptor (holds, summarize), so getToolDataInfo
 *       returns per-tool counts and the hub's badges and reset copy fit every
 *       tool, not only textMan.
 *     - 1.3.0 (11/17/2026) [dendogg + Anthropic - Claude] — On Dennis's
 *       direction the themes are now simply Light, Dark, and System (the
 *       default, which follows the device live); the Parchment Dossier /
 *       Sentinel Obsidian names are retired and stored legacy values migrate.
 *       Adds getThemePreference, resolveTheme, themeLabel, a toolman:theme
 *       event on every painted change, and cross-tab sync.
 *     Earlier entries: see CHANGELOG.md
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
 *       every tool in the ecosystem, plus an optional data descriptor
 *       (holds, summarize) that drives the hub's per-tool data badge and
 *       reset wording via getToolDataInfo()
 *     - Theme management: Light, Dark, or System, saved under
 *       'toolman.theme' and painted on <html data-theme="light|dark">
 *       immediately on parse
 *     - System (the default) follows the device live as it switches; every
 *       open toolMan tab stays on the same choice (storage event)
 *     - 'toolman:theme' event on document whenever the painted theme changes
 *     - Retired theme names (parchment, sentinel) migrate on first read
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
 *         TOOLMAN.setTheme('system');
 *         TOOLMAN.notify('Copied to clipboard', 'success');
 *
 * ✒ Examples:
 *     TOOLMAN.getThemePreference()             → 'system'
 *     TOOLMAN.getTheme()                       → 'dark' (device is in dark mode)
 *     TOOLMAN.setTheme('light')                → saves + paints the light theme
 *     TOOLMAN.toggleTheme()                    → flips light ↔ dark, returns it
 *     TOOLMAN.themeLabel('system')             → 'System'
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
    const THEMES = ['light', 'dark'];                 // painted on <html data-theme>
    const THEME_PREFS = ['light', 'dark', 'system'];  // what a visitor can choose
    const DEFAULT_PREF = 'system';
    const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' };

    // Earlier builds stored the retired theme names. Rewrite them on first
    // read so a returning visitor keeps the theme they chose.
    const LEGACY_THEMES = { parchment: 'light', sentinel: 'dark' };

    const darkQuery = () => (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

    /** "3 palettes", "1 snippet" — for the hub's data badges. */
    const count = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
    const list = (value) => (Array.isArray(value) ? value : null);

    const TOOLMAN = {
        VERSION: '1.0.0',
        THEME_KEY,
        THEMES,
        THEME_PREFS,

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
                path: 'tools/textman/index.html',
                data: {
                    holds: 'saved document, snippets, templates, history, and layout',
                    summarize: (s) => [
                        list(s.snippets) && count(s.snippets.length, 'snippet'),
                        list(s.templates) && count(s.templates.filter((t) => t && !t.isSeed).length, 'custom', 'custom')
                    ].filter((part, i) => part && (i === 0 || !part.startsWith('0 ')))
                }
            },
            {
                id: 'colorman',
                name: 'colorMan',
                tagline: 'Command the spectrum',
                description: 'Pick, convert, and check colors; build palettes, harmonies, scales, and gradients; preview color vision; export to CSS, Tailwind, and more.',
                status: 'live',
                path: 'tools/colorman/index.html',
                data: {
                    holds: 'palettes, saved colors, working palette, recent colors, gradient, and layout',
                    summarize: (s) => [
                        list(s.palettes) && count(s.palettes.filter((p) => p && p.id !== 'pal-toolman-house').length, 'palette'),
                        list(s.swatches) && count(s.swatches.length, 'saved color')
                    ].filter((part) => part && !part.startsWith('0 '))
                }
            },
            {
                id: 'mathman',
                name: 'mathMan',
                tagline: 'Numbers, tamed',
                description: 'A worksheet that answers every line as you type, with units, variables, and percentages, plus graphing, statistics, an equation solver, number theory, and finance.',
                status: 'live',
                path: 'tools/mathman/index.html',
                data: {
                    holds: 'sheets, History, settings, tool inputs, and layout',
                    summarize: (s) => [
                        list(s.sheets) && count(s.sheets.filter((sheet) => sheet && sheet.id !== 'sheet-welcome').length, 'sheet'),
                        list(s.history) && count(s.history.length, 'History item')
                    ].filter((part) => part && !part.startsWith('0 '))
                }
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
            },
            {
                id: 'svgman',
                name: 'svgMan',
                tagline: 'Vectors on demand',
                description: 'Generate blobs, waves, patterns, mazes, charts, and diagrams; compare fill and stroke combos; export clean, safe SVG. Coming soon.',
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
         * The visitor's saved choice: 'light', 'dark', or 'system' (the
         * default, which follows the device). Legacy names are migrated.
         */
        getThemePreference() {
            let saved = null;
            try {
                saved = window.localStorage.getItem(THEME_KEY);
            } catch (_err) { /* private mode — fall through */ }

            if (saved && LEGACY_THEMES[saved]) {
                saved = LEGACY_THEMES[saved];
                try {
                    window.localStorage.setItem(THEME_KEY, saved);
                } catch (_err) { /* non-fatal — the mapping still applies */ }
            }
            return THEME_PREFS.includes(saved) ? saved : DEFAULT_PREF;
        },

        /** Resolve a preference to the theme to paint: 'light' or 'dark'. */
        resolveTheme(preference) {
            if (preference === 'light' || preference === 'dark') return preference;
            const mq = darkQuery();
            return mq && mq.matches ? 'dark' : 'light';
        },

        /** The theme painted right now, from the saved preference. */
        getTheme() {
            return this.resolveTheme(this.getThemePreference());
        },

        /**
         * Paint a theme or preference without saving it. Fires a
         * 'toolman:theme' event on document whenever the painted theme
         * changes, so canvases and previews can redraw.
         */
        applyTheme(themeOrPreference) {
            const preference = THEME_PREFS.includes(themeOrPreference) ? themeOrPreference : DEFAULT_PREF;
            const theme = this.resolveTheme(preference);
            const root = document.documentElement;
            const previous = root.getAttribute('data-theme');
            root.setAttribute('data-theme', theme);
            if (previous && previous !== theme) {
                document.dispatchEvent(new CustomEvent('toolman:theme', {
                    detail: { theme, preference: this.getThemePreference() }
                }));
            }
            return theme;
        },

        /**
         * Save a preference ('light', 'dark', or 'system') ecosystem-wide
         * and paint it. Returns the painted theme.
         */
        setTheme(preference) {
            const valid = THEME_PREFS.includes(preference) ? preference : DEFAULT_PREF;
            try {
                window.localStorage.setItem(THEME_KEY, valid);
            } catch (_err) { /* non-fatal: theme still applies this session */ }
            return this.applyTheme(valid);
        },

        /**
         * Flip between light and dark. This is an explicit choice, so the
         * page stops following the device until System is chosen again.
         */
        toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme') || this.getTheme();
            return this.setTheme(current === 'dark' ? 'light' : 'dark');
        },

        /** Display name: themeLabel('dark') → 'Dark', themeLabel('system') → 'System'. */
        themeLabel(value) {
            return THEME_LABELS[value] || '';
        },

        /* ── Ecosystem usage layer ──────────────────── */

        LAST_USED_KEY: 'toolman.lastUsed',
        PINNED_KEY: 'toolman.pinned',

        /** Record that a tool was opened (called by each tool at boot). */
        stampLastUsed(toolId) {
            try {
                const map = JSON.parse(window.localStorage.getItem(this.LAST_USED_KEY) || '{}');
                map[toolId] = Date.now();
                window.localStorage.setItem(this.LAST_USED_KEY, JSON.stringify(map));
            } catch (_err) { /* private mode — non-fatal */ }
        },

        /** { toolId: epochMs } of last launches. */
        getLastUsed() {
            try {
                const map = JSON.parse(window.localStorage.getItem(this.LAST_USED_KEY) || '{}');
                return (map && typeof map === 'object') ? map : {};
            } catch (_err) { return {}; }
        },

        /** Array of pinned tool ids. */
        getPinned() {
            try {
                const list = JSON.parse(window.localStorage.getItem(this.PINNED_KEY) || '[]');
                return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
            } catch (_err) { return []; }
        },

        /** Toggle a tool's pinned state; returns the new state. */
        togglePinned(toolId) {
            const pinned = this.getPinned();
            const idx = pinned.indexOf(toolId);
            if (idx === -1) pinned.push(toolId); else pinned.splice(idx, 1);
            try {
                window.localStorage.setItem(this.PINNED_KEY, JSON.stringify(pinned));
            } catch (_err) { /* non-fatal */ }
            return idx === -1;
        },

        /**
         * Size and headline counts of a tool's stored state, or null when
         * the tool has no data. Count extraction is best-effort per tool.
         */
        getToolDataInfo(toolId) {
            try {
                const raw = window.localStorage.getItem(`toolman.${toolId}.state`);
                if (!raw) return null;

                const info = { bytes: new Blob([raw]).size, counts: [] };
                const tool = this.tools.find((t) => t.id === toolId);
                try {
                    const parsed = JSON.parse(raw);
                    const state = parsed && typeof parsed === 'object' && parsed.state && typeof parsed.state === 'object'
                        ? parsed.state : {};
                    if (tool && tool.data && typeof tool.data.summarize === 'function') {
                        info.counts = tool.data.summarize(state).filter((part) => typeof part === 'string');
                    }
                } catch (_err) { /* counts stay empty; size still reports */ }
                return info;
            } catch (_err) { return null; }
        },

        /** Remove a tool's stored state. Returns success. */
        clearToolData(toolId) {
            try {
                window.localStorage.removeItem(`toolman.${toolId}.state`);
                return true;
            } catch (_err) { return false; }
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
    TOOLMAN.applyTheme(TOOLMAN.getThemePreference());

    // While the choice is System, follow the device as it switches between
    // light and dark; and keep every open toolMan tab on the same choice.
    const mq = darkQuery();
    if (mq) {
        const follow = () => {
            if (TOOLMAN.getThemePreference() === 'system') TOOLMAN.applyTheme('system');
        };
        if (mq.addEventListener) mq.addEventListener('change', follow);
        else if (mq.addListener) mq.addListener(follow);
    }
    window.addEventListener('storage', (e) => {
        if (e.key === THEME_KEY) TOOLMAN.applyTheme(TOOLMAN.getThemePreference());
    });

    window.TOOLMAN = TOOLMAN;
})();
