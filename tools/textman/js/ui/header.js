/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HeaderController (textMan Edition - v1.1)
 *     - File Name: header.js
 *     - Relative Path: tools/textman/js/ui/header.js
 *     - Artifact Type: javascript
 *     - Version: 1.1.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (11/17/2026) [dendogg + Anthropic - Claude] — Theme toggle
 *       toast reads "Light theme" / "Dark theme" after the rename from
 *       Parchment Dossier / Sentinel Obsidian.
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
 *     - Clicking #btn-theme → TOOLMAN.toggleTheme(); switching to dark
 *       shows the toast "Dark theme"
 *     - Switching back to light shows "Light theme"
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
                TOOLMAN.notify(`${TOOLMAN.themeLabel(theme)} theme`, 'info', 1600);
            });

            DOM.on('#btn-help', 'click', () => {
                if (window.ModalsUI) ModalsUI.open('modal-help');
            });
        }
    };

    window.HeaderUI = HeaderUI;
})();
