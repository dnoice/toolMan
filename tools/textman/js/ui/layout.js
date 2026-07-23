/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LayoutController (textMan Edition - v1.3)
 *     - File Name: layout.js
 *     - Relative Path: tools/textman/js/ui/layout.js
 *     - Artifact Type: script
 *     - Version: 1.3.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Accordion
 *       conversion: section headers now drive State.toggleSection (exclusive
 *       open per sidebar) and applyAccordionState() syncs every section's
 *       data-collapsed + aria-expanded from ui.openSection. Replaces the
 *       old per-section independent collapse.
 *     - 1.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Collapse recovery
 *       overhaul (audit findings F3/F4): extracted a public
 *       togglePanel/setPanelCollapsed API consumed by app.js's new
 *       Ctrl/Cmd+[ and Ctrl/Cmd+] shortcuts, made the entire collapsed rail
 *       a click-to-expand target, and kept aria-expanded plus button/header
 *       tooltips in sync with every state change.
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added drag-and-drop
 *       section reordering in both sidebars (grab a section header, drop it
 *       where you want it), persisted per panel through ui.sectionOrder and
 *       reapplied on boot — the first "manipulate your workspace" feature.
 *       Collapse clicks are suppressed briefly after a drag so dropping a
 *       section never accidentally collapses it.
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial layout
 *       controller: panel and section collapse with persistence.
 *
 * ✒ Description:
 *     Controls textMan's manipulable layout: the left/right panel chevrons,
 *     every tool section's collapse toggle, and drag-and-drop reordering of
 *     the sections themselves. All layout state — collapse and custom order —
 *     persists through the State/Storage layer so the workspace reopens
 *     exactly as the user arranged it.
 *
 * ✒ Key Features:
 *     - Side panel collapse with grid column animation
 *     - Collapsed rail recovery: the whole 48px rail is a click-to-expand
 *       target; public togglePanel(side) API backs the keyboard shortcuts
 *     - aria-expanded + tooltip text synced on every panel state change
 *     - Exclusive-open accordion per sidebar via delegated tool-header
 *       clicks (open a section, its siblings close; click again to close)
 *     - Drag-and-drop section reordering: grab any tool-header and drop the
 *       section anywhere in its sidebar (HTML5 drag and drop)
 *     - Saved order reapplied on boot before first paint of the panels
 *     - Post-drag click suppression so a drop never toggles collapse
 *     - State persistence with debounced autosave
 *     - ARIA-expanded kept in sync for assistive tech
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.LayoutUI — load after shared/js and
 *     js/state.js in tools/textman/index.html. Booted by app.js calling
 *     LayoutUI.init(), which applies any saved section order, wires both
 *     panel chevrons, one delegated collapse listener, and the per-sidebar
 *     drag wiring.
 *
 * ✒ Examples:
 *     - LayoutUI.init() → applies ui.sectionOrder, then wires collapse + drag
 *     - Dragging the Snippets header above Templates → DOM order updates
 *       live, State.setSectionOrder('workspace', ['snippets', 'templates',
 *       …]) persists it, and the arrangement survives reload
 *     - Clicking any .tool-header → toggles its parent .tool-section by
 *       data-section name (suppressed for 350ms after a drop)
 *     - Clicking the .collapse-btn in #panel-workspace →
 *       State.togglePanelCollapse('left') + data-left-collapsed on .app-main
 *     - aria-expanded mirrors the inverse of collapsed on every toggle button
 *     - Every layout change schedules Autosave.start(500)
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, shared/js/storage.js;
 *       drag ghost styling lives in shared/css/panels.css (.dragging)
 *     - Compatible platforms: all evergreen desktop browsers
 *     - Limitations: HTML5 drag and drop does not fire on touch-only
 *       devices — mobile users keep the default order; a section added in a
 *       future version sorts before any previously saved order until the
 *       user drags again; accordion section ids must be registered in
 *       state.js's PANEL_SECTIONS map to participate
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const LayoutUI = {
        _dragSection: null,
        _suppressClickUntil: 0,

        init() {
            this.applySectionOrder();
            this.applyAccordionState();
            this.wirePanelCollapse('panel-workspace', 'left');
            this.wirePanelCollapse('panel-tools', 'right');
            this.wireSectionCollapse();
            this.wireSectionDrag();
        },

        /* ── Panel collapse ─────────────────────────── */

        _panelId(side) {
            return side === 'left' ? 'panel-workspace' : 'panel-tools';
        },

        _panelName(side) {
            return side === 'left' ? 'Workspace' : 'Tools';
        },

        /** Apply a collapse state to the DOM (attributes, aria, tooltips). */
        setPanelCollapsed(side, collapsed) {
            const panel = DOM.id(this._panelId(side));
            if (!panel) return;

            panel.setAttribute('data-collapsed', String(collapsed));

            const btn = DOM.$('.collapse-btn', panel);
            if (btn) {
                btn.setAttribute('aria-expanded', String(!collapsed));
                btn.title = `${collapsed ? 'Expand' : 'Collapse'} ${this._panelName(side)} `
                    + `(Ctrl+${side === 'left' ? '[' : ']'})`;
            }

            const header = DOM.$('.panel-header', panel);
            if (header) {
                header.title = collapsed ? `Expand ${this._panelName(side)}` : '';
            }

            const mainEl = DOM.$('.app-main');
            if (mainEl) {
                mainEl.setAttribute(`data-${side}-collapsed`, String(collapsed));
            }
        },

        /** Toggle a panel: state + DOM + persistence. Returns the new state. */
        togglePanel(side) {
            const collapsed = State.togglePanelCollapse(side);
            this.setPanelCollapsed(side, collapsed);
            Autosave.start(500);
            return collapsed;
        },

        wirePanelCollapse(panelId, side) {
            const panel = DOM.id(panelId);
            if (!panel) return;

            const btn = DOM.$('.collapse-btn', panel);
            if (btn) {
                DOM.on(btn, 'click', (e) => {
                    // Don't bubble into the rail's own expand handler below.
                    e.stopPropagation();
                    this.togglePanel(side);
                });
            }

            // Collapsed rail: the ENTIRE header is the expand target — the
            // 48px column must never depend on hitting a 32px button.
            const header = DOM.$('.panel-header', panel);
            if (header) {
                DOM.on(header, 'click', () => {
                    if (panel.getAttribute('data-collapsed') === 'true') {
                        this.togglePanel(side);
                    }
                });
            }
        },

        /* ── Section accordion (exclusive open per sidebar) ── */

        /** Sync every section's data-collapsed + aria from ui.openSection. */
        applyAccordionState() {
            this.sidebarContents().forEach((content) => {
                const panel = content.closest('.panel');
                const name = panel ? panel.dataset.panel : null;
                if (!name) return;

                const open = State.getOpenSection(name);
                DOM.$$('.tool-section', content).forEach((section) => {
                    const collapsed = section.dataset.section !== open;
                    section.setAttribute('data-collapsed', String(collapsed));
                    const btn = DOM.$('.tool-collapse', section);
                    if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
                });
            });
        },

        wireSectionCollapse() {
            // One delegated listener covers every section in both sidebars.
            DOM.delegate(document.body, 'click', '.tool-header', (e, header) => {
                // A click that lands right after a drop is the drop, not a toggle.
                if (Date.now() < this._suppressClickUntil) return;

                const section = header.closest('.tool-section');
                if (!section) return;

                State.toggleSection(section.dataset.section);
                this.applyAccordionState();
                Autosave.start(500);
            });
        },

        /* ── Section drag & drop (manipulate your workspace) ── */

        sidebarContents() {
            return DOM.$$('#panel-workspace > .panel-content, #panel-tools > .panel-content');
        },

        /** Reapply the persisted order to each sidebar's DOM. */
        applySectionOrder() {
            this.sidebarContents().forEach((content) => {
                const panel = content.closest('.panel');
                const name = panel ? panel.dataset.panel : null;
                const order = name ? State.get().ui.sectionOrder[name] : null;
                if (!Array.isArray(order) || !order.length) return;

                order.forEach((id) => {
                    const section = DOM.$(`.tool-section[data-section="${id}"]`, content);
                    if (section) content.appendChild(section);
                });
            });
        },

        wireSectionDrag() {
            this.sidebarContents().forEach((content) => {
                // Arm dragging only when the grab starts on a section header —
                // the section stays inert for text selection everywhere else.
                DOM.delegate(content, 'pointerdown', '.tool-header', (e, header) => {
                    const section = header.closest('.tool-section');
                    if (section) section.draggable = true;
                });

                content.addEventListener('pointerup', () => {
                    DOM.$$('.tool-section[draggable="true"]', content)
                        .forEach((s) => { s.draggable = false; });
                });

                content.addEventListener('dragstart', (e) => {
                    const section = e.target instanceof Element
                        ? e.target.closest('.tool-section')
                        : null;
                    if (!section) return;

                    this._dragSection = section;
                    section.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                        e.dataTransfer.setData('text/plain', section.dataset.section || '');
                    } catch (_err) { /* some engines throw on setData — non-fatal */ }
                });

                content.addEventListener('dragover', (e) => {
                    if (!this._dragSection || !content.contains(this._dragSection)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';

                    const after = this.sectionAfter(content, e.clientY);
                    if (after === this._dragSection) return;
                    if (after === null) {
                        content.appendChild(this._dragSection);
                    } else if (after !== this._dragSection.nextElementSibling) {
                        content.insertBefore(this._dragSection, after);
                    }
                });

                content.addEventListener('drop', (e) => e.preventDefault());

                content.addEventListener('dragend', () => {
                    if (!this._dragSection) return;

                    this._dragSection.classList.remove('dragging');
                    this._dragSection.draggable = false;
                    this._dragSection = null;

                    // The click that follows a drop must not toggle collapse.
                    this._suppressClickUntil = Date.now() + 350;

                    this.persistOrder(content);
                });
            });
        },

        /** First non-dragging section whose midpoint sits below y, or null. */
        sectionAfter(content, y) {
            const sections = DOM.$$('.tool-section:not(.dragging)', content);
            for (const section of sections) {
                const rect = section.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) return section;
            }
            return null;
        },

        /** Read the sidebar's DOM order and persist it. */
        persistOrder(content) {
            const panel = content.closest('.panel');
            const name = panel ? panel.dataset.panel : null;
            if (!name) return;

            const ids = DOM.$$('.tool-section', content)
                .map((s) => s.dataset.section)
                .filter(Boolean);

            if (State.setSectionOrder(name, ids)) {
                Autosave.start(500);
            }
        }
    };

    window.LayoutUI = LayoutUI;
})();
