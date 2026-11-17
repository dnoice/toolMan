/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: WorkbenchLayout (toolMan Edition - v1.0)
 *     - File Name: workbench.js
 *     - Relative Path: shared/js/workbench.js
 *     - Artifact Type: library
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The rail behaviour every three-panel toolMan workbench shares: side
 *     panel collapse into a 48px click-anywhere rail, an exclusive-open
 *     accordion per rail, drag-to-reorder sections, mobile slide-in drawers
 *     with a scrim, and Focus mode. Generalised from textMan's LayoutUI so a
 *     new tool gets the whole behaviour from one init() call.
 *
 * ✒ Key Features:
 *     - Panel collapse with aria-expanded, directional aria-labels, tooltips
 *     - Exclusive-open accordion per rail (open one, its siblings close)
 *     - Sections discovered from the DOM — no per-tool registry to maintain
 *     - HTML5 drag-and-drop reordering, persisted, with drop-click guard
 *     - openSection(id): expands the rail, opens the drawer on mobile, and
 *       scrolls the pane into view — the route every shortcut uses
 *     - Mobile drawers below 769px with tap-to-dismiss scrim and Escape
 *     - Focus mode: collapse both rails, toggle again to restore
 *     - State lives in the tool's own ui object; persist() is the tool's
 *
 * ✒ Usage Instructions:
 *     Markup: two .panel elements with data-panel names, each holding a
 *     .panel-header (.collapse-btn) and .panel-content of .tool-section
 *     [data-section] blocks. Then, from the tool's boot (ToolApp does this):
 *         Workbench.init({
 *             getUi: () => AppState.ui,
 *             persist: () => Autosave.start(500),
 *             left:  { id: 'panel-library', name: 'Library' },
 *             right: { id: 'panel-tools',   name: 'Tools' }
 *         });
 *
 * ✒ Examples:
 *     Workbench.togglePanel('left')        → collapses / expands the left rail
 *     Workbench.openSection('contrast')    → reveals the Contrast pane
 *     Workbench.toggleFocus()              → both rails shut, then restored
 *     Workbench.setMobileOpen('right')     → slides the Tools drawer in
 *     Workbench.uiDefaults({ library: 'palettes', tools: 'convert' })
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js; shared/css/shell.css + panels.css
 *       supply the collapse, rail, and drawer styling
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: HTML5 drag-and-drop does not fire on touch-only
 *       devices, so mobile users keep the saved order
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const Workbench = {
        _opts: null,
        _dragSection: null,
        _suppressClickUntil: 0,
        _mobileOpen: null,
        _scrim: null,
        _focusPrev: null,

        /** A fresh ui object for a tool's state, given each rail's default pane. */
        uiDefaults(openSection = {}) {
            return {
                leftPanelCollapsed: false,
                rightPanelCollapsed: false,
                openSection: { ...openSection },
                sectionOrder: {}
            };
        },

        /** Allowlisted merge of a saved ui object into the live one. */
        mergeUi(target, saved) {
            if (!target || !saved || typeof saved !== 'object') return;
            target.leftPanelCollapsed = Boolean(saved.leftPanelCollapsed);
            target.rightPanelCollapsed = Boolean(saved.rightPanelCollapsed);
            if (saved.openSection && typeof saved.openSection === 'object') {
                Object.keys(saved.openSection).forEach((panel) => {
                    const v = saved.openSection[panel];
                    if (v === null || (typeof v === 'string' && v.length < 60)) {
                        target.openSection[panel] = v;
                    }
                });
            }
            if (saved.sectionOrder && typeof saved.sectionOrder === 'object') {
                Object.keys(saved.sectionOrder).forEach((panel) => {
                    const order = saved.sectionOrder[panel];
                    if (Array.isArray(order)) {
                        target.sectionOrder[panel] = order
                            .filter((id) => typeof id === 'string' && id.length < 60)
                            .slice(0, 30);
                    }
                });
            }
        },

        init(opts) {
            this._opts = Object.assign({
                getUi: () => ({}),
                persist: () => {},
                left: { id: 'panel-left', name: 'Library' },
                right: { id: 'panel-right', name: 'Tools' },
                mobileButtons: { left: 'btn-mobile-left', right: 'btn-mobile-right' }
            }, opts || {});

            const ui = this.ui();
            if (!ui.openSection) ui.openSection = {};
            if (!ui.sectionOrder) ui.sectionOrder = {};

            this.applySectionOrder();
            this.applyAll();
            this.wirePanel('left');
            this.wirePanel('right');
            this.wireSections();
            this.wireDrag();
            this.wireMobile();
        },

        ui() {
            return this._opts ? this._opts.getUi() : {};
        },

        persist() {
            if (this._opts) this._opts.persist();
        },

        /** Re-apply every persisted layout attribute to the DOM. */
        applyAll() {
            const ui = this.ui();
            this.setPanelCollapsed('left', Boolean(ui.leftPanelCollapsed));
            this.setPanelCollapsed('right', Boolean(ui.rightPanelCollapsed));
            this.applyAccordionState();
        },

        /* ── Panels ───────────────────────────────── */

        panelEl(side) {
            const cfg = this._opts && this._opts[side];
            return cfg ? DOM.id(cfg.id) : null;
        },

        panelName(el) {
            return el ? el.dataset.panel : null;
        },

        setPanelCollapsed(side, collapsed) {
            const panel = this.panelEl(side);
            if (!panel) return;
            const label = this._opts[side].name;
            const key = side === 'left' ? '[' : ']';

            panel.setAttribute('data-collapsed', String(collapsed));

            const btn = DOM.$('.collapse-btn', panel);
            if (btn) {
                btn.setAttribute('aria-expanded', String(!collapsed));
                btn.setAttribute('aria-label', `${collapsed ? 'Open' : 'Collapse'} the ${label} panel`);
                btn.title = `${collapsed ? 'Expand' : 'Collapse'} ${label} (Ctrl+${key})`;
            }
            const header = DOM.$('.panel-header', panel);
            if (header) header.title = collapsed ? `Expand ${label}` : '';

            const main = DOM.$('.app-main');
            if (main) main.setAttribute(`data-${side}-collapsed`, String(collapsed));
        },

        togglePanel(side) {
            const ui = this.ui();
            const prop = side === 'left' ? 'leftPanelCollapsed' : 'rightPanelCollapsed';
            ui[prop] = !ui[prop];
            this.setPanelCollapsed(side, ui[prop]);
            this.persist();
            return ui[prop];
        },

        wirePanel(side) {
            const panel = this.panelEl(side);
            if (!panel) return;

            const btn = DOM.$('.collapse-btn', panel);
            if (btn) {
                DOM.on(btn, 'click', (e) => {
                    e.stopPropagation();
                    this.togglePanel(side);
                });
            }
            // A collapsed rail is one big expand target — never depend on
            // hitting the small chevron.
            const header = DOM.$('.panel-header', panel);
            if (header) {
                DOM.on(header, 'click', () => {
                    if (panel.getAttribute('data-collapsed') === 'true') this.togglePanel(side);
                });
            }
        },

        /** Focus mode: collapse both rails; call again to restore the layout. */
        toggleFocus() {
            const ui = this.ui();
            if (this._focusPrev) {
                if (ui.leftPanelCollapsed !== this._focusPrev.left) this.togglePanel('left');
                if (ui.rightPanelCollapsed !== this._focusPrev.right) this.togglePanel('right');
                this._focusPrev = null;
                return false;
            }
            this._focusPrev = { left: ui.leftPanelCollapsed, right: ui.rightPanelCollapsed };
            if (!ui.leftPanelCollapsed) this.togglePanel('left');
            if (!ui.rightPanelCollapsed) this.togglePanel('right');
            return true;
        },

        /* ── Accordion ────────────────────────────── */

        contents() {
            return ['left', 'right']
                .map((side) => this.panelEl(side))
                .filter(Boolean)
                .map((panel) => DOM.$('.panel-content', panel))
                .filter(Boolean);
        },

        /** Which rail (data-panel name) a section id lives in. */
        panelOfSection(id) {
            const section = DOM.$(`.tool-section[data-section="${CSS.escape(id)}"]`);
            const panel = section ? section.closest('.panel') : null;
            return this.panelName(panel);
        },

        sectionIds(panelName) {
            const panel = DOM.$(`.panel[data-panel="${CSS.escape(panelName)}"]`);
            return panel ? DOM.$$('.tool-section', panel).map((s) => s.dataset.section) : [];
        },

        applyAccordionState() {
            const ui = this.ui();
            this.contents().forEach((content) => {
                const name = this.panelName(content.closest('.panel'));
                if (!name) return;
                let open = ui.openSection[name];
                // A saved id that no longer exists falls back to the first pane.
                const ids = DOM.$$('.tool-section', content).map((s) => s.dataset.section);
                if (open !== null && open !== undefined && !ids.includes(open)) open = ids[0] || null;
                if (open === undefined) open = ids[0] || null;
                ui.openSection[name] = open;

                DOM.$$('.tool-section', content).forEach((section) => {
                    const collapsed = section.dataset.section !== open;
                    section.setAttribute('data-collapsed', String(collapsed));
                    const btn = DOM.$('.tool-collapse', section);
                    if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
                    const header = DOM.$('.tool-header', section);
                    if (header) header.setAttribute('aria-expanded', String(!collapsed));
                });
            });
        },

        toggleSection(id) {
            const panel = this.panelOfSection(id);
            if (!panel) return null;
            const ui = this.ui();
            ui.openSection[panel] = ui.openSection[panel] === id ? null : id;
            this.applyAccordionState();
            this.persist();
            return ui.openSection[panel];
        },

        /**
         * Reveal a pane from anywhere: expand its rail, open the mobile drawer
         * when on a phone, open the pane, and scroll it into view.
         */
        openSection(id, { focusSelector } = {}) {
            const panelName = this.panelOfSection(id);
            if (!panelName) return false;
            const side = ['left', 'right'].find((s) => this.panelName(this.panelEl(s)) === panelName);
            const ui = this.ui();

            if (side) {
                const prop = side === 'left' ? 'leftPanelCollapsed' : 'rightPanelCollapsed';
                if (ui[prop]) this.togglePanel(side);
                if (this.isMobile()) this.setMobileOpen(side);
            }

            ui.openSection[panelName] = id;
            this.applyAccordionState();
            this.persist();

            const section = DOM.$(`.tool-section[data-section="${CSS.escape(id)}"]`);
            requestAnimationFrame(() => {
                if (section) section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                if (focusSelector) {
                    const target = section ? DOM.$(focusSelector, section) : DOM.$(focusSelector);
                    // The reveal transitions; wait for the body to become visible.
                    setTimeout(() => { if (target) target.focus(); }, 260);
                }
            });
            return true;
        },

        wireSections() {
            DOM.delegate(document.body, 'click', '.tool-header', (e, header) => {
                if (Date.now() < this._suppressClickUntil) return;
                // Controls placed inside a header (counts, actions) keep their own clicks.
                if (e.target.closest('button:not(.tool-collapse), input, select, a')) return;
                const section = header.closest('.tool-section');
                if (section && section.dataset.section) this.toggleSection(section.dataset.section);
            });

            // Keyboard: the header row is a toggle for Enter/Space too.
            DOM.delegate(document.body, 'keydown', '.tool-header', (e, header) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if (e.target !== header) return;
                e.preventDefault();
                const section = header.closest('.tool-section');
                if (section && section.dataset.section) this.toggleSection(section.dataset.section);
            });
        },

        /* ── Drag & drop ordering ─────────────────── */

        applySectionOrder() {
            const ui = this.ui();
            this.contents().forEach((content) => {
                const name = this.panelName(content.closest('.panel'));
                const order = name ? ui.sectionOrder[name] : null;
                if (!Array.isArray(order) || !order.length) return;
                order.forEach((id) => {
                    const section = DOM.$(`.tool-section[data-section="${CSS.escape(id)}"]`, content);
                    if (section) content.appendChild(section);
                });
            });
        },

        wireDrag() {
            this.contents().forEach((content) => {
                DOM.delegate(content, 'pointerdown', '.tool-header', (e, header) => {
                    const section = header.closest('.tool-section');
                    if (section) section.draggable = true;
                });

                content.addEventListener('pointerup', () => {
                    DOM.$$('.tool-section[draggable="true"]', content).forEach((s) => { s.draggable = false; });
                });

                content.addEventListener('dragstart', (e) => {
                    const section = e.target instanceof Element ? e.target.closest('.tool-section') : null;
                    if (!section || !content.contains(section)) return;
                    this._dragSection = section;
                    section.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', section.dataset.section || ''); } catch (_err) { /* non-fatal */ }
                });

                content.addEventListener('dragover', (e) => {
                    if (!this._dragSection || !content.contains(this._dragSection)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const after = this.sectionAfter(content, e.clientY);
                    if (after === this._dragSection) return;
                    if (after === null) content.appendChild(this._dragSection);
                    else if (after !== this._dragSection.nextElementSibling) content.insertBefore(this._dragSection, after);
                });

                content.addEventListener('drop', (e) => e.preventDefault());

                content.addEventListener('dragend', () => {
                    if (!this._dragSection) return;
                    this._dragSection.classList.remove('dragging');
                    this._dragSection.draggable = false;
                    this._dragSection = null;
                    this._suppressClickUntil = Date.now() + 350;

                    const name = this.panelName(content.closest('.panel'));
                    if (name) {
                        this.ui().sectionOrder[name] = DOM.$$('.tool-section', content)
                            .map((s) => s.dataset.section).filter(Boolean);
                        this.persist();
                    }
                });
            });
        },

        sectionAfter(content, y) {
            for (const section of DOM.$$('.tool-section:not(.dragging)', content)) {
                const rect = section.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) return section;
            }
            return null;
        },

        /* ── Mobile drawers ───────────────────────── */

        isMobile() {
            return Boolean(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
        },

        wireMobile() {
            this._scrim = DOM.create('div', { className: 'mobile-scrim' });
            document.body.appendChild(this._scrim);
            DOM.on(this._scrim, 'click', () => this.setMobileOpen(null));

            const ids = this._opts.mobileButtons || {};
            DOM.on(DOM.id(ids.left), 'click', () => this.toggleMobile('left'));
            DOM.on(DOM.id(ids.right), 'click', () => this.toggleMobile('right'));

            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape' || !this._mobileOpen) return;
                if (window.Dialogs && Dialogs.activeModal) return;
                this.setMobileOpen(null);
            });

            const mq = window.matchMedia('(min-width: 769px)');
            const onChange = () => { if (mq.matches) this.setMobileOpen(null); };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        },

        setMobileOpen(side) {
            this._mobileOpen = side;
            ['left', 'right'].forEach((s) => {
                const panel = this.panelEl(s);
                if (panel) panel.setAttribute('data-mobile-open', String(side === s));
            });
            if (this._scrim) this._scrim.classList.toggle('is-active', side !== null);

            const ids = this._opts.mobileButtons || {};
            DOM.id(ids.left)?.setAttribute('aria-expanded', String(side === 'left'));
            DOM.id(ids.right)?.setAttribute('aria-expanded', String(side === 'right'));
        },

        toggleMobile(side) {
            this.setMobileOpen(this._mobileOpen === side ? null : side);
        }
    };

    window.Workbench = Workbench;
})();
