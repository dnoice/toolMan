/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HeaderController (textMan Edition - v1.0)
 *     - File Name: header.js
 *     - Relative Path: tools/textman/js/ui/header.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Wires textMan's sticky header buttons: settings modal, ecosystem-wide
 *     theme toggle (delegated to TOOLMAN so the choice follows the user across
 *     every tool), and the help modal.
 *
 * ✒ Key Features:
 *     - Theme toggle with confirmation toast
 *     - Settings and Help modal launchers
 *     - Defensive: every wire checks its target exists first
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.HeaderUI — load after shared/js and
 *     ui/modals.js in tools/textman/index.html. Booted by app.js calling
 *     HeaderUI.init(), which attaches the three header button listeners.
 *
 * ✒ Examples:
 *     - HeaderUI.init() → wires #btn-settings, #btn-theme, and #btn-help
 *     - Clicking #btn-settings → ModalsUI.open('modal-settings')
 *     - Clicking #btn-theme → TOOLMAN.toggleTheme(); returning 'sentinel'
 *       shows the toast "Sentinel Obsidian engaged"
 *     - Toggling back to 'parchment' shows "Parchment Dossier engaged"
 *     - Clicking #btn-help → ModalsUI.open('modal-help')
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, shared/js/dom.js, ui/modals.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: theme persistence itself lives in TOOLMAN, not here —
 *       this module only triggers the toggle and shows the toast
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const HeaderUI = {
        init() {
            DOM.on('#btn-settings', 'click', () => {
                if (window.ModalsUI) ModalsUI.open('modal-settings');
            });

            DOM.on('#btn-theme', 'click', () => {
                const theme = TOOLMAN.toggleTheme();
                TOOLMAN.notify(
                    theme === 'sentinel' ? 'Sentinel Obsidian engaged' : 'Parchment Dossier engaged',
                    'info',
                    1600
                );
            });

            DOM.on('#btn-help', 'click', () => {
                if (window.ModalsUI) ModalsUI.open('modal-help');
            });
        }
    };

    window.HeaderUI = HeaderUI;
})();
