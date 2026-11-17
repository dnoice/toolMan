/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: HubLauncher (toolMan Edition - v1.1)
 *     - File Name: hub.js
 *     - Relative Path: shared/js/hub.js
 *     - Artifact Type: script
 *     - Version: 1.1.1
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.1 (2026-07-23) [Anthropic - Claude Opus 4.8] — textMan's card
 *       icon now uses its real fountain-pen mark (fill-based, currentColor)
 *       instead of the placeholder "T" glyph.
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
        textman: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="m18.858 0.087595c-0.068533 0.080388-0.09085 0.19042-0.059081 0.29118-0.14604 0.11305-0.2958 0.21943-0.44882 0.31982-2.7005 1.5776-6.341 1.7177-9.4146 1.2188-0.088204-0.014314-0.19748 0.035231-0.24406 0.11154-1.7923 2.9363-3.4305 5.9718-5.1226 8.9685-0.047453 0.08404-0.14253 0.09763-0.21229 0.0304l-1.0931-1.0538c-0.069801-0.067202-0.17989-0.064333-0.24598 0.00658-0.23531 0.25231-0.47053 0.5047-0.70595 0.75691-0.066127 0.07084-0.063028 0.1826 0.00692 0.24964 0.1655 0.15857 0.33092 0.31723 0.49641 0.47582 0.069973 0.06703 0.063138 0.16761-0.015209 0.22461l-1.7383 1.2646a0.14992 0.15001 0 0 0-0.0179 0.22735l6.7659 6.7761a0.1511 0.15119 0 0 0 0.2283-0.01685l1.2798-1.7294c0.057647-0.0779 0.15869-0.08431 0.22571-0.01432 0.15848 0.1656 0.31705 0.33111 0.47555 0.49669 0.066989 0.07001 0.17869 0.07309 0.24948 7e-3 0.25204-0.23558 0.50426-0.47095 0.75646-0.70637 0.0708-0.06614 0.07376-0.1763 0.0066-0.2461l-1.0532-1.0939c-0.06721-0.06981-0.054722-0.16741 0.028112-0.21766 2.9399-1.7834 6.0876-3.238 8.9688-5.1164 0.07462-0.04864 0.12447-0.16013 0.11208-0.24869-0.44224-3.1611-0.43973-6.6048 1.2144-9.4194 0.10034-0.15311 0.20644-0.30308 0.31964-0.44908 0.10071 0.031787 0.21068 0.00946 0.29102-0.059117 0.13824-0.1403 0.11286-0.40525-0.07696-0.47005-0.01756-0.005983-0.04255 0.002647-0.05506 0.016694-1.7485 1.964-3.5702 3.8426-5.4854 5.6395-0.0652 0.061164-0.08469 0.17504-0.04962 0.25727 0.21094 0.49455 0.32039 1.1954-0.03807 1.5311-0.43682 0.40498-1.3051 0.37868-1.9979-0.32159-0.68594-0.67621-0.73588-1.5515-0.32141-1.9991 0.3357-0.35894 1.0365-0.24888 1.5303-0.038056 0.08214 0.035075 0.1944 0.014165 0.25389-0.05256 1.7483-1.9609 3.724-3.6958 5.6417-5.4867 0.01281-0.011962 0.02041-0.036746 0.01432-0.054527-0.06503-0.18964-0.32962-0.21472-0.46967-0.076567z"/></svg>',
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
