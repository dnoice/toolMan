/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: WorkspaceRenderers (textMan Edition - v1.1)
 *     - File Name: workspace.js
 *     - Relative Path: tools/textman/js/ui/workspace.js
 *     - Artifact Type: script
 *     - Version: 1.1.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Workspace QoL
 *       batch: template and snippet search filters, template "used N×" badge
 *       and Duplicate action, snippet tag-click filtering, inline
 *       expand/collapse previews, snippet sort (recent/name, favorites
 *       first), history restore points (click a saved entry to restore its
 *       document) with Clear history and absolute-time tooltips, and an
 *       analytics rebuild (readability, top-3 transforms, words/session).
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial workspace
 *       renderers and delegated actions.
 *
 * ✒ Description:
 *     Renders and operates the left Workspace panel: template cards, saved
 *     snippets, the history timeline, favorites, and the analytics grid. All
 *     user content is escaped before rendering; all actions run through
 *     delegated listeners wired once at init.
 *
 * ✒ Key Features:
 *     - Template cards: use (replace/append guard), favorite, delete (custom
 *       only), plus a New-template launcher
 *     - Snippet cards: insert, copy, favorite, delete, tag chips, previews
 *     - History timeline with type markers and relative timestamps
 *     - Favorites view aggregating starred templates and snippets
 *     - Analytics grid: words, characters, sessions, top transform
 *     - Workspace footer counts kept live
 *     - One delegated [data-action] listener routes every card action
 *     - All user content escaped via Text.escapeHtml before innerHTML
 *     - Empty-state placeholders for snippets, history, and favorites
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.WorkspaceUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling WorkspaceUI.init() (renderAll + wireDelegates). Other
 *     modules call its render* methods after mutating State so the panel
 *     stays current.
 *
 * ✒ Examples:
 *     - <button data-action="use-template"> inside a card with
 *       data-id="bug-report" → useTemplate('bug-report') with the
 *       replace-or-append confirm when the editor has content
 *     - <button data-action="insert-snippet"> →
 *       EditorUI.insertText(snippet.content) at the caret
 *     - <button data-action="fav-template"> →
 *       State.toggleFavorite('template', id) + re-render of both lists
 *     - <button data-action="new-template"> →
 *       ModalsUI.open('modal-create-template')
 *     - <button data-action="save-snippet"> → ModalsUI.openSnippetModal()
 *     - WorkspaceUI.renderHistory() — called by EditorUI and tool panes
 *       right after State.addHistory(...)
 *     - WorkspaceUI.renderAnalytics() — live stats + "Top transform" tile
 *     - WorkspaceUI.copySnippet(id) → DOM.copyText with a result toast
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js (dom, storage, toolman), js/state.js,
 *       ui/editor.js, ui/modals.js
 *     - Compatible platforms: all evergreen browsers
 *     - Security: every user-supplied string is HTML-escaped before insertion
 *     - Limitations: the history timeline renders only the newest 30 entries
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /** "5m ago"-style relative timestamps. */
    function relativeTime(iso) {
        const then = new Date(iso).getTime();
        if (!Number.isFinite(then)) return '';
        const diff = Date.now() - then;

        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    const STAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

    /** Absolute timestamp for tooltips. */
    function absoluteTime(iso) {
        const d = new Date(iso);
        return Number.isFinite(d.getTime()) ? d.toLocaleString() : '';
    }

    /** Case-insensitive substring test across several fields. */
    function matches(query, ...fields) {
        if (!query) return true;
        const q = query.toLowerCase();
        return fields.some((f) => String(f || '').toLowerCase().includes(q));
    }

    /** A small search input row for a list header. */
    function searchRow(id, placeholder, value) {
        return `<div class="ws-search"><input type="search" id="${id}" class="ws-search-input" placeholder="${placeholder}" value="${Text.escapeHtml(value || '')}" aria-label="${placeholder}" autocomplete="off"></div>`;
    }

    const WorkspaceUI = {
        // Per-list filters (kept in memory, not persisted)
        templateFilter: '',
        snippetFilter: '',
        snippetTag: '',
        snippetSort: 'recent', // 'recent' | 'name'
        expanded: new Set(),

        init() {
            this.renderAll();
            this.wireDelegates();
        },

        renderAll() {
            this.renderTemplates();
            this.renderSnippets();
            this.renderHistory();
            this.renderFavorites();
            this.renderAnalytics();
            this.updateFooter();
        },

        /* ── Templates ──────────────────────────────── */

        renderTemplates() {
            const list = DOM.id('template-list');
            if (!list) return;
            DOM.empty(list);

            const all = State.get().templates;
            const shown = all.filter((t) => matches(this.templateFilter, t.name, t.description));

            const frag = document.createDocumentFragment();

            // Search row (only once there are enough templates to warrant it)
            if (all.length > 3 || this.templateFilter) {
                const wrap = DOM.create('div');
                wrap.innerHTML = searchRow('template-search', 'Filter templates', this.templateFilter);
                frag.appendChild(wrap.firstElementChild);
            }

            if (!shown.length) {
                frag.appendChild(DOM.create('p', {
                    className: 'ws-empty', text: `No templates match “${this.templateFilter}”.`
                }));
            }

            shown.forEach((t) => {
                const card = DOM.create('article', {
                    className: 'workspace-card',
                    data: { id: t.id }
                });
                const used = t.useCount ? `<span class="use-badge" title="Times used">used ${t.useCount}×</span>` : '';
                card.innerHTML = `
                    <div class="card-title-row">
                        <h5 class="card-title">${Text.escapeHtml(t.name)}</h5>
                        <button class="fav-btn" data-action="fav-template" data-active="${t.isFavorite}" title="Favorite" aria-label="Toggle favorite">${STAR_SVG}</button>
                    </div>
                    <p class="card-desc">${Text.escapeHtml(t.description)} ${used}</p>
                    <div class="card-actions">
                        <button class="card-btn" data-action="use-template">Use template</button>
                        <button class="card-btn" data-action="duplicate-template">Duplicate</button>
                        ${t.isSeed ? '' : '<button class="card-btn card-btn-danger" data-action="delete-template">Delete</button>'}
                    </div>
                `;
                frag.appendChild(card);
            });

            // New-template launcher
            const actions = DOM.create('div', { className: 'section-actions' });
            actions.innerHTML = '<button class="btn btn-secondary" data-action="new-template">+ New template</button>';
            frag.appendChild(actions);

            list.appendChild(frag);
            this.updateFooter();
        },

        /* ── Snippets ───────────────────────────────── */

        renderSnippets() {
            const list = DOM.id('snippet-list');
            if (!list) return;
            DOM.empty(list);

            const snippets = State.get().snippets;

            if (!snippets.length) {
                const empty = DOM.create('div', { className: 'empty-state' });
                empty.innerHTML = `
                    <h5 class="empty-title">No snippets saved</h5>
                    <p class="empty-text">Save useful pieces of text you can reuse later.</p>
                    <button class="btn btn-primary" data-action="save-snippet">Save current selection</button>
                `;
                list.appendChild(empty);
                this.updateFooter();
                return;
            }

            // Filter (search + active tag), then sort (favorites first).
            let shown = snippets.filter((s) =>
                matches(this.snippetFilter, s.name, s.content, (s.tags || []).join(' '))
                && (!this.snippetTag || (s.tags || []).includes(this.snippetTag)));

            shown = shown.slice().sort((a, b) => {
                if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
                if (this.snippetSort === 'name') return a.name.localeCompare(b.name);
                return new Date(b.createdAt) - new Date(a.createdAt); // recent
            });

            const frag = document.createDocumentFragment();

            // Controls row: search + sort toggle + active-tag clear
            const controls = DOM.create('div', { className: 'ws-controls' });
            controls.innerHTML = `
                ${searchRow('snippet-search', 'Filter snippets', this.snippetFilter)}
                <div class="ws-control-row">
                    <button class="chip-btn" data-action="snippet-sort" title="Toggle sort">Sort: ${this.snippetSort === 'name' ? 'Name' : 'Recent'}</button>
                    ${this.snippetTag ? `<button class="chip-btn active" data-action="clear-tag" title="Clear tag filter">#${Text.escapeHtml(this.snippetTag)} ✕</button>` : ''}
                </div>
            `;
            frag.appendChild(controls);

            if (!shown.length) {
                frag.appendChild(DOM.create('p', { className: 'ws-empty', text: 'No snippets match.' }));
            }

            shown.forEach((s) => {
                const card = DOM.create('article', {
                    className: 'workspace-card',
                    data: { id: s.id }
                });
                const isOpen = this.expanded.has(s.id);
                const tags = (s.tags || [])
                    .map((tag) => `<button class="tag-chip" data-action="filter-tag" data-tag="${Text.escapeHtml(tag)}" title="Filter by ${Text.escapeHtml(tag)}">${Text.escapeHtml(tag)}</button>`)
                    .join('');

                card.innerHTML = `
                    <div class="card-title-row">
                        <h5 class="card-title">${Text.escapeHtml(s.name)}</h5>
                        <button class="fav-btn" data-action="fav-snippet" data-active="${s.isFavorite}" title="Favorite" aria-label="Toggle favorite">${STAR_SVG}</button>
                    </div>
                    <div class="card-preview ${isOpen ? 'is-expanded' : ''}" data-action="toggle-expand" title="${isOpen ? 'Collapse' : 'Expand'}">${Text.escapeHtml(isOpen ? s.content : Text.truncate(s.content, 120))}</div>
                    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
                    <div class="card-actions">
                        <button class="card-btn" data-action="insert-snippet">Insert</button>
                        <button class="card-btn" data-action="copy-snippet">Copy</button>
                        <button class="card-btn card-btn-danger" data-action="delete-snippet">Delete</button>
                    </div>
                `;
                frag.appendChild(card);
            });

            const actions = DOM.create('div', { className: 'section-actions' });
            actions.innerHTML = '<button class="btn btn-secondary" data-action="save-snippet">+ Save snippet</button>';
            frag.appendChild(actions);

            list.appendChild(frag);
            this.updateFooter();
        },

        /* ── History ────────────────────────────────── */

        renderHistory() {
            const list = DOM.id('history-list');
            if (!list) return;
            DOM.empty(list);

            const history = State.get().history;

            if (!history.length) {
                const empty = DOM.create('div', { className: 'empty-state' });
                empty.innerHTML = `
                    <h5 class="empty-title">History is empty</h5>
                    <p class="empty-text">Your recent edits and snapshots will appear here.</p>
                `;
                list.appendChild(empty);
                return;
            }

            const frag = document.createDocumentFragment();

            history.slice(0, 30).forEach((h) => {
                const restorable = typeof h.snapshot === 'string';
                const entry = DOM.create('div', {
                    className: `history-entry${restorable ? ' is-restorable' : ''}`,
                    data: restorable ? { type: h.type, id: h.id, action: 'restore-history' } : { type: h.type },
                    attrs: { title: absoluteTime(h.timestamp) + (restorable ? ' · click to restore this version' : '') }
                });
                entry.innerHTML = `
                    <span class="history-desc">${Text.escapeHtml(h.description)}${restorable ? ' <span class="restore-tag">↺ restore</span>' : ''}</span>
                    <span class="history-time">${relativeTime(h.timestamp)}</span>
                `;
                frag.appendChild(entry);
            });

            const actions = DOM.create('div', { className: 'section-actions' });
            actions.innerHTML = '<button class="btn btn-secondary" data-action="clear-history">Clear history</button>';
            frag.appendChild(actions);

            list.appendChild(frag);
        },

        /* ── Favorites ──────────────────────────────── */

        renderFavorites() {
            const list = DOM.id('favorites-list');
            if (!list) return;
            DOM.empty(list);

            const { templates, snippets } = State.getFavorites();

            if (!templates.length && !snippets.length) {
                const empty = DOM.create('div', { className: 'empty-state' });
                empty.innerHTML = `
                    <h5 class="empty-title">Nothing favorited yet</h5>
                    <p class="empty-text">Mark templates, snippets, or tools you use the most.</p>
                `;
                list.appendChild(empty);
                return;
            }

            const frag = document.createDocumentFragment();

            templates.forEach((t) => {
                const card = DOM.create('article', {
                    className: 'workspace-card',
                    data: { id: t.id }
                });
                card.innerHTML = `
                    <div class="card-title-row">
                        <h5 class="card-title">★ ${Text.escapeHtml(t.name)}</h5>
                    </div>
                    <p class="card-desc">Template</p>
                    <div class="card-actions">
                        <button class="card-btn" data-action="use-template">Use template</button>
                    </div>
                `;
                frag.appendChild(card);
            });

            snippets.forEach((s) => {
                const card = DOM.create('article', {
                    className: 'workspace-card',
                    data: { id: s.id }
                });
                card.innerHTML = `
                    <div class="card-title-row">
                        <h5 class="card-title">★ ${Text.escapeHtml(s.name)}</h5>
                    </div>
                    <p class="card-desc">Snippet</p>
                    <div class="card-actions">
                        <button class="card-btn" data-action="insert-snippet">Insert</button>
                        <button class="card-btn" data-action="copy-snippet">Copy</button>
                    </div>
                `;
                frag.appendChild(card);
            });

            list.appendChild(frag);
        },

        /* ── Analytics ──────────────────────────────── */

        renderAnalytics() {
            const list = DOM.id('analytics-list');
            if (!list) return;

            const a = State.get().analytics;
            const sessions = a.sessionsCount || 0;
            const perSession = sessions > 0 ? Math.round(a.totalWords / sessions) : 0;

            const read = window.EditorUI ? Text.readability(EditorUI.getValue()) : null;
            const readValue = read ? `${read.score}` : '—';
            const readLabel = read ? read.label : 'Readability';

            const top3 = State.topTransforms(3);

            list.innerHTML = `
                <div class="analytics-grid">
                    <div class="stat-block">
                        <span class="stat-value">${Text.formatNumber(a.totalWords)}</span>
                        <span class="stat-label">Words</span>
                    </div>
                    <div class="stat-block">
                        <span class="stat-value">${Text.formatNumber(a.totalChars)}</span>
                        <span class="stat-label">Characters</span>
                    </div>
                    <div class="stat-block">
                        <span class="stat-value">${Text.formatNumber(sessions)}</span>
                        <span class="stat-label">Sessions</span>
                    </div>
                    <div class="stat-block">
                        <span class="stat-value">${Text.formatNumber(perSession)}</span>
                        <span class="stat-label">Words / session</span>
                    </div>
                    <div class="stat-block stat-block-wide" title="Flesch Reading Ease (0 hard – 100 easy)">
                        <span class="stat-value">${readValue} <span class="stat-sub">${Text.escapeHtml(readLabel)}</span></span>
                        <span class="stat-label">Readability</span>
                    </div>
                </div>
                ${top3.length ? `
                <div class="analytics-top">
                    <h6 class="analytics-heading">Top transforms</h6>
                    <ol class="top-list">
                        ${top3.map(([name, n]) => `<li><span class="top-name">${Text.escapeHtml(name)}</span><span class="top-count">${n}×</span></li>`).join('')}
                    </ol>
                </div>` : ''}
            `;
        },

        updateFooter() {
            const el = DOM.id('workspace-stats');
            if (el) {
                const s = State.get();
                el.textContent = `Templates: ${s.templates.length} | Snippets: ${s.snippets.length}`;
            }
        },

        /* ── Actions (delegated once) ───────────────── */

        wireDelegates() {
            const panel = DOM.id('panel-workspace');
            if (!panel) return;

            DOM.delegate(panel, 'click', '[data-action]', (e, btn) => {
                const action = btn.dataset.action;
                const card = btn.closest('[data-id]');
                const id = card ? card.dataset.id : null;

                switch (action) {
                    case 'use-template': this.useTemplate(id); break;
                    case 'duplicate-template': this.duplicateTemplate(id); break;
                    case 'delete-template': this.deleteTemplate(id); break;
                    case 'fav-template': this.toggleFav('template', id); break;
                    case 'new-template':
                        if (window.ModalsUI) ModalsUI.open('modal-create-template');
                        break;
                    case 'save-snippet':
                        if (window.ModalsUI) ModalsUI.openSnippetModal();
                        break;
                    case 'insert-snippet': this.insertSnippet(id); break;
                    case 'copy-snippet': this.copySnippet(id); break;
                    case 'delete-snippet': this.deleteSnippet(id); break;
                    case 'fav-snippet': this.toggleFav('snippet', id); break;
                    case 'toggle-expand': this.toggleExpand(id); break;
                    case 'filter-tag': this.setSnippetTag(btn.dataset.tag); break;
                    case 'clear-tag': this.setSnippetTag(''); break;
                    case 'snippet-sort': this.toggleSnippetSort(); break;
                    case 'restore-history': this.restoreHistory(btn.dataset.id); break;
                    case 'clear-history': this.doClearHistory(); break;
                    default: break;
                }
            });

            // Live search filters (debounced so typing stays smooth)
            const onSearch = DOM.debounce((e) => {
                if (e.target.id === 'template-search') {
                    this.templateFilter = e.target.value.trim();
                    this.renderTemplates();
                    this.refocus('template-search');
                } else if (e.target.id === 'snippet-search') {
                    this.snippetFilter = e.target.value.trim();
                    this.renderSnippets();
                    this.refocus('snippet-search');
                }
            }, 180);
            DOM.on(panel, 'input', (e) => {
                if (e.target.classList && e.target.classList.contains('ws-search-input')) onSearch(e);
            });
        },

        /** Restore focus + caret to a search input after a re-render. */
        refocus(id) {
            const el = DOM.id(id);
            if (el) {
                const len = el.value.length;
                el.focus();
                el.setSelectionRange(len, len);
            }
        },

        toggleExpand(id) {
            if (this.expanded.has(id)) this.expanded.delete(id);
            else this.expanded.add(id);
            this.renderSnippets();
        },

        setSnippetTag(tag) {
            this.snippetTag = tag || '';
            this.renderSnippets();
        },

        toggleSnippetSort() {
            this.snippetSort = this.snippetSort === 'recent' ? 'name' : 'recent';
            this.renderSnippets();
        },

        duplicateTemplate(id) {
            const copy = State.duplicateTemplate(id);
            if (!copy) return;
            Autosave.start(300);
            this.renderTemplates();
            TOOLMAN.notify(`Duplicated as “${copy.name}”`, 'success', 1600);
        },

        restoreHistory(id) {
            const entry = State.getHistoryEntry(id);
            if (!entry || typeof entry.snapshot !== 'string' || !window.EditorUI) return;
            if (EditorUI.getValue() === entry.snapshot) {
                TOOLMAN.notify('Document already matches that version', 'info', 1800);
                return;
            }
            if (!window.confirm(`Restore the document to this saved version?\n\n"${entry.description}" — ${absoluteTime(entry.timestamp)}\n\nYour current text is replaced (undo with Ctrl+Z).`)) {
                return;
            }
            EditorUI.setValue(entry.snapshot);
            State.addHistory({ type: 'save', description: 'Restored a previous version' });
            this.renderHistory();
            TOOLMAN.notify('Version restored', 'success', 1600);
        },

        doClearHistory() {
            if (!State.get().history.length) return;
            if (!window.confirm('Clear the history timeline? Restore points are lost.')) return;
            State.clearHistory();
            Autosave.start(300);
            this.renderHistory();
        },

        useTemplate(id) {
            const template = State.getTemplate(id);
            if (!template || !window.EditorUI) return;

            const current = EditorUI.getValue();
            if (current.trim()) {
                const replace = window.confirm(
                    'Replace the current document with this template?\n\n'
                    + 'OK = replace · Cancel = append to the bottom'
                );
                EditorUI.setValue(replace
                    ? template.content
                    : `${current.replace(/\n*$/, '')}\n\n${template.content}`);
            } else {
                EditorUI.setValue(template.content);
            }

            State.tallyTemplateUse(id);
            State.addHistory({ type: 'template', description: `Used template: ${template.name}` });
            this.renderTemplates();
            this.renderHistory();
            Autosave.start(500);
            TOOLMAN.notify(`Template "${template.name}" applied`, 'success', 1800);
        },

        deleteTemplate(id) {
            const template = State.getTemplate(id);
            if (!template || template.isSeed) return;
            if (!window.confirm(`Delete template "${template.name}"?`)) return;

            State.removeTemplate(id);
            Autosave.start(300);
            this.renderTemplates();
            this.renderFavorites();
        },

        insertSnippet(id) {
            const snippet = State.getSnippet(id);
            if (!snippet || !window.EditorUI) return;

            EditorUI.insertText(snippet.content);
            State.addHistory({ type: 'snippet', description: `Inserted snippet: ${snippet.name}` });
            this.renderHistory();
        },

        async copySnippet(id) {
            const snippet = State.getSnippet(id);
            if (!snippet) return;

            const ok = await DOM.copyText(snippet.content);
            TOOLMAN.notify(ok ? 'Snippet copied to clipboard' : 'Copy failed', ok ? 'success' : 'error', 1600);
        },

        deleteSnippet(id) {
            const snippet = State.getSnippet(id);
            if (!snippet) return;
            if (!window.confirm(`Delete snippet "${snippet.name}"?`)) return;

            State.removeSnippet(id);
            Autosave.start(300);
            this.renderSnippets();
            this.renderFavorites();
        },

        toggleFav(type, id) {
            State.toggleFavorite(type, id);
            Autosave.start(300);
            if (type === 'template') this.renderTemplates();
            else this.renderSnippets();
            this.renderFavorites();
        }
    };

    window.WorkspaceUI = WorkspaceUI;
})();
