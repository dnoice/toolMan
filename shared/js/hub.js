/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HubLauncher (toolMan Edition - v1.0)
 *     - File Name: hub.js
 *     - Relative Path: shared/js/hub.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Boot script for the toolMan hub page. Renders the tool card grid
 *     straight from the TOOLMAN.tools registry (single source of truth —
 *     adding a tool to the registry adds its card automatically), wires the
 *     theme toggle, and completes the loading screen handoff.
 *
 * ✒ Key Features:
 *     - Tool cards generated from TOOLMAN.tools — zero hand-edited card
 *       markup
 *     - Live cards are real links (keyboard + middle-click friendly)
 *     - Coming-soon cards render inert with a status chip
 *     - Theme toggle persisted ecosystem-wide via TOOLMAN.setTheme
 *     - Loader completion with graceful failure (fail-safe still covers us)
 *
 * ✒ Usage Instructions:
 *     Loaded by the hub's index.html after toolman.js, dom.js, and
 *     loader.js. No configuration required.
 *
 * ✒ Examples:
 *     Add a registry entry in toolman.js:
 *         { id: 'colorman', name: 'colorMan', status: 'live',
 *           path: 'tools/colorman/index.html', ... }
 *         → its card renders on the hub automatically, no markup edits
 *     A live tool renders as a real link:
 *         <a class="tool-card" data-status="live" href="tools/textman/...">
 *     A 'soon' tool renders inert:
 *         <article class="tool-card" data-status="soon" aria-disabled="true">
 *     Clicking #btn-theme:
 *         TOOLMAN.toggleTheme() + toast 'Sentinel Obsidian engaged' (1.6s)
 *     Loader copy override (runs before Loader auto-inits on DOM ready):
 *         Loader.messages = ['Opening the workshop…', ...]
 *     A tool id with no entry in TOOL_ICONS falls back to the devMan glyph
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, shared/js/dom.js,
 *       shared/js/loader.js
 *     - Compatible platforms: all evergreen browsers
 *     - Security: tool names and descriptions are escaped via
 *       Text.escapeHtml before card interpolation; icons are trusted inline
 *       SVG constants
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    // Hub-flavored loading copy (Loader auto-inits on DOM ready, after this runs)
    if (window.Loader) {
        Loader.messages = [
            'Opening the workshop…',
            'Dusting off the workbench…',
            'Arranging the tools…',
            'Polishing the brass…',
            'Almost ready…'
        ];
    }

    /** Simple line-art glyphs per tool id (inline SVG, currentColor). */
    const TOOL_ICONS = {
        textman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
        colorman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="12.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="13.5" r="2.5"/><path d="M12 22a10 10 0 1 1 10-10c0 2-1.5 3-3 3h-2a2 2 0 0 0-2 2c0 .5.2 1 .5 1.5.3.5.5 1 .5 1.5 0 1-1 2-4 2z"/></svg>',
        mathman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7h6M8 4v6M14 6h5M14 16l5 5M19 16l-5 5M5 17h6"/></svg>',
        convertman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
        devman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>'
    };

    function accentName(name) {
        // Wordmark treatment: lowercase head + gold "Man" tail (textMan → text<gold>Man</gold>)
        const idx = name.indexOf('Man');
        if (idx === -1) return Text.escapeHtml(name);
        return `${Text.escapeHtml(name.slice(0, idx))}<span class="logo-accent">Man</span>${Text.escapeHtml(name.slice(idx + 3))}`;
    }

    function buildCard(tool) {
        const isLive = tool.status === 'live' && tool.path;
        const tag = isLive ? 'a' : 'article';

        const card = DOM.create(tag, {
            className: 'tool-card',
            data: { status: isLive ? 'live' : 'soon', tool: tool.id },
            attrs: isLive
                ? { href: tool.path, 'aria-label': `Launch ${tool.name} — ${tool.tagline}` }
                : { 'aria-disabled': 'true' }
        });

        card.innerHTML = `
            <div class="tool-card-header">
                <div class="tool-card-icon" aria-hidden="true">${TOOL_ICONS[tool.id] || TOOL_ICONS.devman}</div>
                <h2 class="tool-card-name">${accentName(tool.name)}</h2>
            </div>
            <p class="tool-card-desc">${Text.escapeHtml(tool.description)}</p>
            <div class="tool-card-footer">
                <span class="tool-card-status">${isLive ? 'Live' : 'Coming soon'}</span>
                ${isLive ? '<span class="tool-card-launch">Launch <span aria-hidden="true">→</span></span>' : ''}
            </div>
        `;
        return card;
    }

    function renderGrid() {
        const grid = DOM.id('tool-grid');
        if (!grid || !window.TOOLMAN) return;

        DOM.empty(grid);
        TOOLMAN.tools.forEach((tool) => grid.appendChild(buildCard(tool)));
    }

    function wireHeader() {
        DOM.on('#btn-theme', 'click', () => {
            const theme = TOOLMAN.toggleTheme();
            TOOLMAN.notify(
                theme === 'sentinel' ? 'Sentinel Obsidian engaged' : 'Parchment Dossier engaged',
                'info',
                1600
            );
        });
    }

    function boot() {
        try {
            renderGrid();
            wireHeader();
        } catch (error) {
            console.error('[Hub] Boot failed:', error);
        } finally {
            // Loader fail-safe covers us regardless, but complete promptly.
            if (window.Loader) {
                setTimeout(() => Loader.complete(), 400);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
