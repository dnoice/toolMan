/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LayoutController (textMan Edition - v1.1)
 *     - File Name: layout.js
 *     - Relative Path: tools/textman/js/ui/layout.js
 *     - Artifact Type: script
 *     - Version: 1.1.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
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
 *     - Per-section collapse via delegated tool-header clicks
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
 *       user drags again
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const LayoutUI = {
        _dragSection: null,
        _suppressClickUntil: 0,

        init() {
            this.applySectionOrder();
            this.wirePanelCollapse('panel-workspace', 'left');
            this.wirePanelCollapse('panel-tools', 'right');
            this.wireSectionCollapse();
            this.wireSectionDrag();
        },

        /* ── Panel collapse ─────────────────────────── */

        wirePanelCollapse(panelId, side) {
            const panel = DOM.id(panelId);
            if (!panel) return;

            const btn = DOM.$('.collapse-btn', panel);
            if (!btn) return;

            DOM.on(btn, 'click', () => {
                const collapsed = State.togglePanelCollapse(side);

                panel.setAttribute('data-collapsed', String(collapsed));
                btn.setAttribute('aria-expanded', String(!collapsed));

                const mainEl = DOM.$('.app-main');
                if (mainEl) {
                    mainEl.setAttribute(`data-${side}-collapsed`, String(collapsed));
                }

                Autosave.start(500);
            });
        },

        /* ── Section collapse ───────────────────────── */

        wireSectionCollapse() {
            // One delegated listener covers every section in both sidebars.
            DOM.delegate(document.body, 'click', '.tool-header', (e, header) => {
                // A click that lands right after a drop is the drop, not a toggle.
                if (Date.now() < this._suppressClickUntil) return;

                const section = header.closest('.tool-section');
                if (!section) return;

                const name = section.dataset.section;
                const collapsed = State.toggleSectionCollapse(name);

                section.setAttribute('data-collapsed', String(collapsed));

                const toggleBtn = DOM.$('.tool-collapse', header);
                if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!collapsed));

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
