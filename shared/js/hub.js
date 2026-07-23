/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HubLauncher (toolMan Edition - v1.1)
 *     - File Name: hub.js
 *     - Relative Path: shared/js/hub.js
 *     - Artifact Type: script
 *     - Version: 1.1.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Hub QoL batch:
 *       type-ahead tool search ('/' focuses it), arrow-key navigation across
 *       launch links, a "Continue where you left off" hero chip, card
 *       ordering by pinned → last-used → registry, per-card stored-data
 *       badges, pin and confirm-guarded data-reset actions, and the version
 *       + GitHub footer line. Cards are now <article> elements with an
 *       overlay launch link (valid markup with interactive children).
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial hub boot:
 *       registry-driven cards, theme toggle, loader handoff.
 *
 * ✒ Description:
 *     Boot script for the toolMan hub page. Renders the tool card grid from
 *     the TOOLMAN registry enriched with the usage layer (pins, last-used,
 *     stored-data info), wires search/keyboard/theme interactions and the
 *     continue chip, and completes the loading screen handoff.
 *
 * ✒ Key Features:
 *     - Tool cards generated from TOOLMAN.tools — zero hand-edited markup
 *     - Ordering: pinned first, then last-used (desc), then registry order;
 *       coming-soon cards always trail the live ones
 *     - Type-ahead search over name/tagline/description; '/' focuses it,
 *       Escape clears it
 *     - ArrowLeft/Right/Up/Down move focus across launch links, Enter opens
 *     - Hero "Continue where you left off" chip from the last-used stamp
 *     - Per-card badge: stored KB + snippet/template counts (live data)
 *     - Pin toggle and confirm-guarded per-card data reset
 *     - Footer version stamp (TOOLMAN.VERSION) — the GitHub link lives in
 *       the page markup
 *
 * ✒ Usage Instructions:
 *     Loaded by the hub's index.html after toolman.js, dom.js, and
 *     loader.js. Expects #tool-grid, #tool-search, #continue-chip, and
 *     #hub-version in the markup. No configuration required.
 *
 * ✒ Examples:
 *     - Pressing '/' anywhere (outside an input) focuses the search box
 *     - Typing "text" filters the grid to textMan
 *     - ArrowRight from one Launch link focuses the next card's link
 *     - Clicking a card's pin star floats it to the front on next render
 *     - The reset action (↺) confirm()s, then clears toolman.<id>.state
 *     - After using textMan, the hero shows "Continue in textMan · 5m ago"
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, shared/js/dom.js,
 *       shared/js/loader.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: data badges parse other tools' stored JSON
 *       best-effort; unknown shapes fall back to size-only
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

    const PIN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const RESET_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

    function accentName(name) {
        const idx = name.indexOf('Man');
        if (idx === -1) return Text.escapeHtml(name);
        return `${Text.escapeHtml(name.slice(0, idx))}<span class="logo-accent">Man</span>${Text.escapeHtml(name.slice(idx + 3))}`;
    }

    function relativeTime(ms) {
        const diff = Date.now() - ms;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    function dataBadge(tool) {
        const info = TOOLMAN.getToolDataInfo(tool.id);
        if (!info) return '';
        const kb = (info.bytes / 1024).toFixed(1);
        const parts = [`${kb} KB`];
        if (info.snippets !== null) parts.push(`${info.snippets} snippet${info.snippets === 1 ? '' : 's'}`);
        if (info.templates !== null && info.templates > 0) parts.push(`${info.templates} custom`);
        return `<span class="tool-card-data" title="Data stored locally in this browser">${parts.join(' · ')}</span>`;
    }

    const HubUI = {
        filter: '',

        /** Registry sorted: pinned → last-used desc → registry order; live before soon. */
        orderedTools() {
            const pinned = TOOLMAN.getPinned();
            const lastUsed = TOOLMAN.getLastUsed();
            const rank = (t, i) => [
                t.status === 'live' ? 0 : 1,
                pinned.includes(t.id) ? 0 : 1,
                -(lastUsed[t.id] || 0),
                i
            ];
            return TOOLMAN.tools
                .map((t, i) => ({ t, key: rank(t, i) }))
                .sort((a, b) => {
                    for (let k = 0; k < a.key.length; k++) {
                        if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k];
                    }
                    return 0;
                })
                .map((x) => x.t);
        },

        matchesFilter(tool) {
            if (!this.filter) return true;
            const q = this.filter.toLowerCase();
            return `${tool.name} ${tool.tagline} ${tool.description}`.toLowerCase().includes(q);
        },

        buildCard(tool) {
            const isLive = tool.status === 'live' && tool.path;
            const pinned = TOOLMAN.getPinned().includes(tool.id);
            const last = TOOLMAN.getLastUsed()[tool.id];

            const card = DOM.create('article', {
                className: 'tool-card',
                data: { status: isLive ? 'live' : 'soon', tool: tool.id }
            });

            card.innerHTML = `
                ${isLive ? `<a class="card-link" href="${tool.path}" aria-label="Launch ${Text.escapeHtml(tool.name)} — ${Text.escapeHtml(tool.tagline)}"></a>` : ''}
                <div class="tool-card-header">
                    <div class="tool-card-icon" aria-hidden="true">${TOOL_ICONS[tool.id] || TOOL_ICONS.devman}</div>
                    <h2 class="tool-card-name">${accentName(tool.name)}</h2>
                    ${isLive ? `
                    <span class="tool-card-actions">
                        <button type="button" class="card-action pin" data-action="pin" data-active="${pinned}" title="${pinned ? 'Unpin' : 'Pin to front'}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${Text.escapeHtml(tool.name)}" aria-pressed="${pinned}">${PIN_SVG}</button>
                        <button type="button" class="card-action reset" data-action="reset" title="Clear this tool's local data" aria-label="Clear ${Text.escapeHtml(tool.name)} local data">${RESET_SVG}</button>
                    </span>` : ''}
                </div>
                <p class="tool-card-desc">${Text.escapeHtml(tool.description)}</p>
                <div class="tool-card-footer">
                    <span class="tool-card-status">${isLive ? 'Live' : 'Coming soon'}</span>
                    <span class="tool-card-meta">
                        ${isLive ? dataBadge(tool) : ''}
                        ${isLive && last ? `<span class="tool-card-last" title="Last opened">${relativeTime(last)}</span>` : ''}
                        ${isLive ? '<span class="tool-card-launch">Launch <span aria-hidden="true">→</span></span>' : ''}
                    </span>
                </div>
            `;
            return card;
        },

        renderGrid() {
            const grid = DOM.id('tool-grid');
            if (!grid || !window.TOOLMAN) return;

            DOM.empty(grid);
            const tools = this.orderedTools().filter((t) => this.matchesFilter(t));

            if (!tools.length) {
                grid.appendChild(DOM.create('p', {
                    className: 'grid-empty',
                    text: `No tools match “${this.filter}”.`
                }));
                return;
            }
            tools.forEach((tool) => grid.appendChild(this.buildCard(tool)));
        },

        renderContinueChip() {
            const slot = DOM.id('continue-chip');
            if (!slot) return;
            DOM.empty(slot);

            const lastUsed = TOOLMAN.getLastUsed();
            const [id, at] = Object.entries(lastUsed)
                .sort((a, b) => b[1] - a[1])[0] || [];
            const tool = id && TOOLMAN.tools.find((t) => t.id === id && t.status === 'live');
            if (!tool || !at) return;

            const chip = DOM.create('a', {
                className: 'continue-chip',
                attrs: { href: tool.path }
            });
            chip.innerHTML = `Continue in <strong>${accentName(tool.name)}</strong> · ${relativeTime(at)} <span aria-hidden="true">→</span>`;
            slot.appendChild(chip);
        },

        wireSearch() {
            const input = DOM.id('tool-search');
            if (!input) return;

            DOM.on(input, 'input', () => {
                this.filter = input.value.trim();
                this.renderGrid();
            });
            DOM.on(input, 'keydown', (e) => {
                if (e.key === 'Escape') {
                    input.value = '';
                    this.filter = '';
                    this.renderGrid();
                    input.blur();
                }
            });

            // '/' focuses search from anywhere outside a field
            document.addEventListener('keydown', (e) => {
                const tag = document.activeElement ? document.activeElement.tagName : '';
                if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
                    e.preventDefault();
                    input.focus();
                    input.select();
                }
            });
        },

        wireKeyboardNav() {
            document.addEventListener('keydown', (e) => {
                if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
                const links = DOM.$$('#tool-grid .card-link');
                if (!links.length) return;

                const current = links.indexOf(document.activeElement);
                const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
                const next = current === -1
                    ? (forward ? 0 : links.length - 1)
                    : (current + (forward ? 1 : -1) + links.length) % links.length;

                e.preventDefault();
                links[next].focus();
            });
        },

        wireCardActions() {
            DOM.delegate('#tool-grid', 'click', '.card-action', (e, btn) => {
                e.preventDefault();
                e.stopPropagation();
                const card = btn.closest('.tool-card');
                const id = card ? card.dataset.tool : null;
                const tool = TOOLMAN.tools.find((t) => t.id === id);
                if (!tool) return;

                if (btn.dataset.action === 'pin') {
                    const nowPinned = TOOLMAN.togglePinned(id);
                    TOOLMAN.notify(nowPinned ? `${tool.name} pinned` : `${tool.name} unpinned`, 'info', 1400);
                    this.renderGrid();
                } else if (btn.dataset.action === 'reset') {
                    const sure = window.confirm(
                        `Clear ${tool.name}'s local data?\n\nThis removes its saved document, `
                        + 'snippets, templates, history, and layout from THIS browser. '
                        + 'It cannot be undone.'
                    );
                    if (!sure) return;
                    TOOLMAN.clearToolData(id);
                    TOOLMAN.notify(`${tool.name} data cleared`, 'success', 1800);
                    this.renderGrid();
                    this.renderContinueChip();
                }
            });
        },

        wireHeader() {
            DOM.on('#btn-theme', 'click', () => {
                const theme = TOOLMAN.toggleTheme();
                TOOLMAN.notify(
                    theme === 'sentinel' ? 'Sentinel Obsidian engaged' : 'Parchment Dossier engaged',
                    'info',
                    1600
                );
            });
        },

        renderVersion() {
            const el = DOM.id('hub-version');
            if (el) el.textContent = TOOLMAN.VERSION;
        },

        boot() {
            try {
                this.renderGrid();
                this.renderContinueChip();
                this.renderVersion();
                this.wireSearch();
                this.wireKeyboardNav();
                this.wireCardActions();
                this.wireHeader();
            } catch (error) {
                console.error('[Hub] Boot failed:', error);
            } finally {
                // Loader fail-safe covers us regardless, but complete promptly.
                if (window.Loader) {
                    setTimeout(() => Loader.complete(), 400);
                }
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => HubUI.boot());
    } else {
        HubUI.boot();
    }

    window.HubUI = HubUI;
})();
