/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LayoutController (textMan Edition - v1.4)
 *     - File Name: layout.js
 *     - Relative Path: tools/textman/js/ui/layout.js
 *     - Artifact Type: script
 *     - Version: 1.4.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.4.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Mobile
 *       reachability (audit finding F5): wires the header's mobile toggle
 *       buttons to data-mobile-open slide-ins (exclusive — opening one
 *       panel closes the other), injects a tap-to-dismiss scrim, closes on
 *       Escape (modal-aware), and clears all overlay state when the window
 *       crosses back to desktop width.
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
 *     - Collapsed rail recovery: the whole 50px rail is a click-to-expand
 *       target; public togglePanel(side) API backs the keyboard shortcuts
 *     - aria-expanded, aria-label and tooltip text synced on every panel
 *       state change ("Open Workspace panel" / "Collapse Workspace panel")
 *     - Zen mode (review §14.2): a VIEW state, never persisted — rails, pane
 *       titles, header and toolbar all leave, a temporary exit hint appears,
 *       and the status bar thins to cursor + save state. Chrome peeks back on
 *       a pointer at the top edge or on keyboard focus landing inside it
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
 *     - LayoutUI.toggleZen() → data-zen on <html>; LayoutUI.setZen(false) is
 *       what app.js's capture-phase Escape handler calls to leave it
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

        _mobileOpen: null,
        _scrim: null,

        init() {
            this.applySectionOrder();
            this.applyAccordionState();
            this.wirePanelCollapse('panel-workspace', 'left');
            this.wirePanelCollapse('panel-tools', 'right');
            this.wireSectionCollapse();
            this.wireSectionDrag();
            this.wireMobilePanels();
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

                // Review §21: a rail button needs an explicit name, not a
                // direction-less "Toggle" — a screen-reader user cannot see
                // which way the chevron points.
                btn.setAttribute(
                    'aria-label',
                    `${collapsed ? 'Open' : 'Collapse'} ${this._panelName(side)} panel`
                );
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

        /* ── Mobile slide-in panels (<768px) ────────── */

        wireMobilePanels() {
            // Tap-to-dismiss scrim behind a slid-in panel
            this._scrim = DOM.create('div', { className: 'mobile-scrim' });
            document.body.appendChild(this._scrim);
            DOM.on(this._scrim, 'click', () => this.setMobileOpen(null));

            DOM.on('#btn-mobile-workspace', 'click', () => this.toggleMobile('left'));
            DOM.on('#btn-mobile-tools', 'click', () => this.toggleMobile('right'));

            // Escape closes the open panel — unless a modal owns the key
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape' || !this._mobileOpen) return;
                if (window.ModalsUI && ModalsUI.activeModal) return;
                this.setMobileOpen(null);
            });

            // Crossing back to desktop width clears the overlay state
            const mq = window.matchMedia('(min-width: 769px)');
            const onChange = () => { if (mq.matches) this.setMobileOpen(null); };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        },

        /** Open one side's slide-in ('left'|'right') or close both (null). */
        setMobileOpen(side) {
            this._mobileOpen = side;

            DOM.id('panel-workspace')?.setAttribute('data-mobile-open', String(side === 'left'));
            DOM.id('panel-tools')?.setAttribute('data-mobile-open', String(side === 'right'));

            if (this._scrim) this._scrim.classList.toggle('is-active', side !== null);

            DOM.id('btn-mobile-workspace')?.setAttribute('aria-expanded', String(side === 'left'));
            DOM.id('btn-mobile-tools')?.setAttribute('aria-expanded', String(side === 'right'));
        },

        toggleMobile(side) {
            this.setMobileOpen(this._mobileOpen === side ? null : side);
        },

        /* ── Zen mode (review §14.2) ────────────────── */
        /*
         * Focus mode (app.js) collapses the rails. Zen removes the interface:
         * rails gone rather than railed, pane titles gone, global header and
         * editor toolbar lifted out of flow — leaving the editor canvas, the
         * status bar thinned to its cursor/save readout, and a hint that says
         * how to get out. The visual hiding is all CSS (:root[data-zen]); this
         * module owns the state, the reveal watchers, and the hint.
         *
         * THIS IS A VIEW STATE, NOT A DOCUMENT STATE. Nothing here touches
         * State or Storage, and the attribute lives on <html>, which every
         * reload rebuilds. Waking up to a hidden interface with no memory of
         * asking for it is hostile, so Zen deliberately does not persist.
         *
         * Because nothing is mutated, leaving Zen restores the previous layout
         * exactly: the rails come back with the same data-collapsed values,
         * the same open accordion section and the same widths they had.
         */

        zenActive: false,
        _zenChrome: false,
        _zenHint: null,
        _zenHintTimer: 0,
        _zenHandlers: null,

        /** Pointer within this many px of the top edge peeks the chrome. */
        ZEN_PEEK_EDGE: 6,

        /** Fallback chrome depth when the toolbar cannot be measured. */
        ZEN_CHROME_FALLBACK: 120,

        toggleZen() {
            this.setZen(!this.zenActive);
        },

        setZen(on) {
            const next = Boolean(on);
            if (next === this.zenActive) return this.zenActive;

            this.zenActive = next;
            this._buildZenFurniture();

            const root = document.documentElement;
            if (next) {
                root.setAttribute('data-zen', 'true');
                // Never enter Zen with the chrome already peeked — the whole
                // point of the entry animation is the interface leaving.
                this.setZenChrome(false);
                this._startZenWatch();
                this._showZenHint('Zen mode', 'Esc', 'to exit');
            } else {
                root.removeAttribute('data-zen');
                this.setZenChrome(false);
                this._stopZenWatch();
                // Announce the exit for anyone who cannot see the interface
                // reappear, then let it fade on its own.
                this._showZenHint('Zen mode off', '', '', 1200);
            }

            return this.zenActive;
        },

        /** Reveal or re-hide the peeked header + toolbar. */
        setZenChrome(on) {
            const next = Boolean(on) && this.zenActive;
            if (next === this._zenChrome) return;

            this._zenChrome = next;
            const root = document.documentElement;
            if (next) root.setAttribute('data-zen-chrome', 'true');
            else root.removeAttribute('data-zen-chrome');
        },

        toggleZenChrome() {
            this.setZenChrome(!this._zenChrome);
        },

        /* ── Zen: runtime furniture ─────────────────── */

        /*
         * Built from JS rather than markup on purpose: the hint exists for a
         * mode most sessions never enter, and index.html has no business
         * carrying an element that is invisible 99% of the time. Built once on
         * first entry, then reused.
         *
         * There is deliberately no companion status element. §14.2 wants "only
         * essential cursor and save status" kept, and the unified status bar
         * (review §12) already IS that readout — minting a second one beside
         * it would be exactly the duplicate status §4.4 and §5.6 rule out. Zen
         * thins the real bar in CSS instead.
         */
        _buildZenFurniture() {
            if (this._zenHint) return;

            this._zenHint = DOM.create('div', {
                className: 'zen-hint',
                attrs: { role: 'status', 'aria-live': 'polite' }
            });
            document.body.appendChild(this._zenHint);
        },

        /**
         * Show the temporary exit hint (§14.2), then fade it. Re-showing while
         * one is on screen restarts the clock rather than stacking hints.
         */
        _showZenHint(label, key, tail = '', hold = 3200) {
            if (!this._zenHint) return;

            DOM.empty(this._zenHint);
            this._zenHint.appendChild(DOM.create('span', {
                className: 'zen-hint-label', text: label
            }));

            if (key) {
                const keys = DOM.create('span', { className: 'zen-hint-keys' });
                keys.appendChild(DOM.create('kbd', { text: key }));
                if (tail) keys.appendChild(document.createTextNode(' ' + tail));
                this._zenHint.appendChild(keys);
            }

            this._zenHint.classList.add('is-visible');
            clearTimeout(this._zenHintTimer);
            this._zenHintTimer = setTimeout(() => {
                if (this._zenHint) this._zenHint.classList.remove('is-visible');
            }, hold);
        },

        /* ── Zen: chrome reveal watchers ────────────── */

        /*
         * Wired on entry, torn down on exit. A pointermove listener plus two
         * focus listeners are cheap, but they are pure overhead outside Zen,
         * so they do not outlive it.
         */
        _startZenWatch() {
            if (this._zenHandlers) return;

            const onPointer = (e) => {
                if (!this.zenActive) return;

                if (!this._zenChrome) {
                    if (e.clientY <= this.ZEN_PEEK_EDGE) this.setZenChrome(true);
                    return;
                }

                // Keyboard focus inside the chrome outranks the pointer —
                // tabbing to Save and then moving the mouse must not yank the
                // toolbar out from under the focused control.
                if (this._focusInChrome()) return;
                if (e.clientY > this._chromeDepth()) this.setZenChrome(false);
            };

            // The "keyboard command" half of §14.2's reveal: Tab into anything
            // in the header or toolbar and it comes to meet you.
            const onFocusIn = (e) => {
                if (!this.zenActive) return;
                const el = e.target instanceof Element ? e.target : null;
                if (el && el.closest('.app-header, .editor-header')) {
                    this.setZenChrome(true);
                }
            };

            const onFocusOut = () => {
                if (!this.zenActive || !this._zenChrome) return;
                // activeElement updates after focusout; check on the next tick.
                setTimeout(() => {
                    if (this.zenActive && this._zenChrome && !this._focusInChrome()) {
                        this.setZenChrome(false);
                    }
                }, 0);
            };

            document.addEventListener('pointermove', onPointer, { passive: true });
            document.addEventListener('focusin', onFocusIn);
            document.addEventListener('focusout', onFocusOut);
            this._zenHandlers = { onPointer, onFocusIn, onFocusOut };
        },

        _stopZenWatch() {
            if (!this._zenHandlers) return;

            const h = this._zenHandlers;
            document.removeEventListener('pointermove', h.onPointer);
            document.removeEventListener('focusin', h.onFocusIn);
            document.removeEventListener('focusout', h.onFocusOut);
            this._zenHandlers = null;
        },

        _focusInChrome() {
            const el = document.activeElement;
            return Boolean(el && el.closest && el.closest('.app-header, .editor-header'));
        },

        /** Bottom of the peeked chrome — measured, because the toolbar wraps. */
        _chromeDepth() {
            const toolbar = DOM.$('.editor-header');
            if (toolbar) {
                const rect = toolbar.getBoundingClientRect();
                if (rect.height) return rect.bottom;
            }
            return this.ZEN_CHROME_FALLBACK;
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
