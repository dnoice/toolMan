/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: StateManager (textMan Edition - v2.3)
 *     - File Name: state.js
 *     - Relative Path: tools/textman/js/state.js
 *     - Artifact Type: library
 *     - Version: 2.3.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 2.3.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Editor prefs for
 *       the QoL batch: editor.docTitle (named document) plus settings
 *       wordWrap, fontSize, and tabSize, all validated on restore.
 *     - 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Accordion state
 *       model: replaced the ten independent collapsedSections booleans with
 *       ui.openSection (one open section per sidebar, null = all closed),
 *       plus panelOf/getOpenSection/setOpenSection/toggleSection helpers.
 *       mergeRestore accepts both shapes — legacy payloads convert by
 *       opening each sidebar's first non-collapsed section.
 *     - 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added
 *       ui.sectionOrder (workspace/tools) with the setSectionOrder helper and
 *       restore-merge support, persisting the user's drag-and-drop section
 *       arrangement — the first "manipulate your workspace" feature.
 *     - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Moved into the
 *       toolMan ecosystem (tools/textman/). Storage now namespaced under
 *       'toolman.textman.state' with automatic migration from the legacy
 *       'textman-state' key. Hardened: collision-proof IDs via
 *       crypto.randomUUID, input validation on all mutators, allowlisted
 *       restore merge, transform usage tallies for analytics, and theme moved
 *       to the ecosystem level.
 *     - 1.0.0 (2025-11-18) [model not recorded] — Initial centralized state
 *       with four seed templates and CRUD helpers.
 *
 * ✒ Description:
 *     Centralized application state for textMan plus the helper API every UI
 *     module mutates it through. Registers the tool's persistence contract
 *     with the shared Storage manager: namespaced key, versioning, an
 *     allowlisted merge-restore (imported/saved data can never wholesale
 *     replace state), and a quota-trim strategy.
 *
 * ✒ Key Features:
 *     - AppState: editor, templates (4 seeded), snippets, history, favorites,
 *       analytics (incl. per-transform usage tallies), UI, and settings
 *     - Collision-proof IDs (crypto.randomUUID with fallback)
 *     - Validated mutators: add/remove template & snippet, favorites, history
 *     - Persisted section order per sidebar (drag-and-drop workspace layout)
 *     - History capped at 50 entries; quota trim drops to 20
 *     - Allowlisted restore: only known keys merge, custom templates dedupe
 *       against seeds by id
 *     - Legacy migration: adopts v1 'textman-state' data on first run
 *     - Storage.configure() wiring — the single persistence contract
 *
 * ✒ Usage Instructions:
 *     Script-tag module — load after shared/js/storage.js and before all UI
 *     modules in tools/textman/index.html. Exposes window.State (helpers) and
 *     window.AppState (raw, read-mostly); UI code mutates only through the
 *     State helpers. No init() call needed — the Storage.configure() contract
 *     and the legacy-key migration both run at load time.
 *
 * ✒ Examples:
 *     - State.setEditorContent('...')      → content + dirty flag
 *     - State.addSnippet({name, content})  → validated, returns snippet or null
 *     - State.addHistory({type:'save', description:'Saved document'})
 *     - State.tallyTransform('uppercase')  → analytics counter
 *     - State.toggleFavorite('template', 'bug-report') → returns the new flag
 *     - State.topTransforms(3)             → [['uppercase', 12], …] sorted
 *     - State.reset()                      → clears user data, keeps seeds
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/storage.js (window.Storage)
 *     - Compatible platforms: all evergreen browsers
 *     - Storage key: 'toolman.textman.state' (legacy 'textman-state' migrated
 *       then removed)
 *     - Limitations: history hard-capped at 50 entries (trimmed to 20 under
 *       storage quota pressure); persistence is per-browser LocalStorage only
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'toolman.textman.state';
    const LEGACY_KEY = 'textman-state';
    const STATE_VERSION = '2.2.0';
    const HISTORY_CAP = 50;
    const HISTORY_TRIM = 20;

    /** Which sidebar each accordion section lives in. */
    const PANEL_SECTIONS = {
        workspace: ['templates', 'snippets', 'history', 'favorites', 'analytics'],
        tools: ['transform', 'search', 'prefix', 'encoding', 'formatting']
    };

    /** Collision-proof id generator. */
    function uid(prefix) {
        const core = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}-${core}`;
    }

    const AppState = {
        version: STATE_VERSION,

        editor: {
            content: '',
            docTitle: 'Untitled',
            lastSaved: null,
            isDirty: false,
            selectionStart: 0,
            selectionEnd: 0
        },

        templates: [
            {
                id: 'bug-report',
                name: 'Bug Report',
                description: 'Structured bug report with expected vs actual behavior',
                isFavorite: false,
                isSeed: true,
                content: `# Bug Report

## Summary
Brief description of the bug

## Steps to Reproduce
1. First step
2. Second step
3. Third step

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS:
- Browser:
- Version:

## Notes
Additional context or screenshots
`
            },
            {
                id: 'feature-spec',
                name: 'Feature Spec',
                description: 'Outline for describing a new feature',
                isFavorite: false,
                isSeed: true,
                content: `# Feature Specification

## Overview
High-level description of the feature

## Goals
- Primary goal 1
- Primary goal 2

## Non-goals
- What this feature will NOT do

## User Stories
- As a [user type], I want [goal] so that [reason]

## Requirements
### Functional
- Requirement 1
- Requirement 2

### Non-functional
- Performance requirement
- Accessibility requirement

## Edge Cases
- Edge case 1
- Edge case 2

## Open Questions
- Question 1?
- Question 2?
`
            },
            {
                id: 'meeting-notes',
                name: 'Meeting Notes',
                description: 'Lightweight structure for meetings',
                isFavorite: false,
                isSeed: true,
                content: `# Meeting Notes

**Date:**
**Time:**
**Attendees:**

## Agenda
1. Topic 1
2. Topic 2
3. Topic 3

## Notes
- Key point 1
- Key point 2
- Key point 3

## Decisions
- Decision 1
- Decision 2

## Action Items
- [ ] Task 1 - Assigned to: [Name] - Due: [Date]
- [ ] Task 2 - Assigned to: [Name] - Due: [Date]

## Next Meeting
**Date:**
**Topics:**
`
            },
            {
                id: 'brain-dump',
                name: 'Brain Dump',
                description: 'Unstructured scratchpad for raw thinking',
                isFavorite: false,
                isSeed: true,
                content: `# Brain Dump

## Raw Thoughts
[Write freely here - no structure needed]


## Patterns / Themes
[As ideas emerge, capture themes here]


## Next Steps
[Action items or follow-ups]

`
            }
        ],

        snippets: [],
        history: [],
        favorites: [],

        analytics: {
            totalWords: 0,
            totalChars: 0,
            sessionsCount: 0,
            lastSessionDate: null,
            transformCounts: {}
        },

        ui: {
            leftPanelCollapsed: false,
            rightPanelCollapsed: false,
            /* User-arranged section order per sidebar (empty = markup order) */
            sectionOrder: {
                workspace: [],
                tools: []
            },
            /* Exclusive-open accordion: the one open section per sidebar
               (null = all closed) */
            openSection: {
                workspace: 'templates',
                tools: 'transform'
            }
        },

        settings: {
            autosave: 'debounced', // 'immediate' | 'debounced' | 'manual'
            autosaveDelay: 1000,
            wordWrap: true,
            fontSize: 14,          // editor px, clamped 11–22
            tabSize: 4             // editor tab width, clamped 2–8
        }
    };

    const State = {
        /** Raw state access (read-mostly — mutate through helpers). */
        get() {
            return AppState;
        },

        /* ── Editor ─────────────────────────────────── */

        setEditorContent(content) {
            AppState.editor.content = typeof content === 'string' ? content : '';
            AppState.editor.isDirty = true;
        },

        /** Set the document's title (falls back to 'Untitled' when blank). */
        setDocTitle(title) {
            const clean = String(title || '').trim().slice(0, 120);
            AppState.editor.docTitle = clean || 'Untitled';
            return AppState.editor.docTitle;
        },

        markSaved() {
            AppState.editor.isDirty = false;
            AppState.editor.lastSaved = new Date().toISOString();
        },

        /* ── Templates ──────────────────────────────── */

        getTemplate(id) {
            return AppState.templates.find((t) => t.id === id) || null;
        },

        addTemplate(template) {
            if (!template || !String(template.name || '').trim() || !template.content) {
                return null;
            }
            const newTemplate = {
                id: uid('template'),
                name: String(template.name).trim().slice(0, 120),
                description: String(template.description || '').trim().slice(0, 300),
                isFavorite: false,
                isSeed: false,
                content: String(template.content),
                createdAt: new Date().toISOString()
            };
            AppState.templates.push(newTemplate);
            return newTemplate;
        },

        removeTemplate(id) {
            const index = AppState.templates.findIndex((t) => t.id === id);
            if (index === -1) return false;
            AppState.templates.splice(index, 1);
            return true;
        },

        /* ── Snippets ───────────────────────────────── */

        getSnippet(id) {
            return AppState.snippets.find((s) => s.id === id) || null;
        },

        addSnippet(snippet) {
            if (!snippet || !String(snippet.name || '').trim() || !snippet.content) {
                return null;
            }
            const tags = Array.isArray(snippet.tags)
                ? snippet.tags
                : String(snippet.tags || '')
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);

            const newSnippet = {
                id: uid('snippet'),
                name: String(snippet.name).trim().slice(0, 120),
                tags: tags.slice(0, 10),
                notes: String(snippet.notes || '').trim().slice(0, 500),
                content: String(snippet.content),
                isFavorite: false,
                createdAt: new Date().toISOString()
            };
            AppState.snippets.push(newSnippet);
            return newSnippet;
        },

        removeSnippet(id) {
            const index = AppState.snippets.findIndex((s) => s.id === id);
            if (index === -1) return false;
            AppState.snippets.splice(index, 1);
            return true;
        },

        /* ── Favorites ──────────────────────────────── */

        toggleFavorite(type, id) {
            const items = type === 'template' ? AppState.templates : AppState.snippets;
            const item = items.find((i) => i.id === id);
            if (!item) return false;
            item.isFavorite = !item.isFavorite;
            return item.isFavorite;
        },

        getFavorites() {
            return {
                templates: AppState.templates.filter((t) => t.isFavorite),
                snippets: AppState.snippets.filter((s) => s.isFavorite)
            };
        },

        /* ── History ────────────────────────────────── */

        addHistory(entry) {
            if (!entry || !entry.description) return;
            AppState.history.unshift({
                id: uid('history'),
                type: entry.type || 'info',
                description: String(entry.description).slice(0, 200),
                timestamp: new Date().toISOString()
            });
            if (AppState.history.length > HISTORY_CAP) {
                AppState.history.length = HISTORY_CAP;
            }
        },

        /* ── Analytics ──────────────────────────────── */

        updateAnalytics(words, chars) {
            AppState.analytics.totalWords = Number(words) || 0;
            AppState.analytics.totalChars = Number(chars) || 0;
            AppState.analytics.lastSessionDate = new Date().toISOString();
        },

        tallyTransform(name) {
            if (!name) return;
            const counts = AppState.analytics.transformCounts;
            counts[name] = (counts[name] || 0) + 1;
        },

        topTransforms(limit = 3) {
            return Object.entries(AppState.analytics.transformCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit);
        },

        /* ── UI state ───────────────────────────────── */

        togglePanelCollapse(panel) {
            if (panel === 'left') {
                AppState.ui.leftPanelCollapsed = !AppState.ui.leftPanelCollapsed;
                return AppState.ui.leftPanelCollapsed;
            }
            if (panel === 'right') {
                AppState.ui.rightPanelCollapsed = !AppState.ui.rightPanelCollapsed;
                return AppState.ui.rightPanelCollapsed;
            }
            return false;
        },

        /** Which sidebar a section id belongs to ('workspace'|'tools'|null). */
        panelOf(section) {
            return Object.keys(PANEL_SECTIONS)
                .find((panel) => PANEL_SECTIONS[panel].includes(section)) || null;
        },

        /** The section currently open in a sidebar (or null = all closed). */
        getOpenSection(panel) {
            return panel in AppState.ui.openSection
                ? AppState.ui.openSection[panel]
                : null;
        },

        setOpenSection(panel, section) {
            if (!(panel in AppState.ui.openSection)) return false;
            AppState.ui.openSection[panel] =
                (section && PANEL_SECTIONS[panel].includes(section)) ? section : null;
            return true;
        },

        /**
         * Accordion toggle: open the section (closing its sidebar siblings),
         * or close it if it is already the open one. Returns the sidebar's
         * new open section (or null).
         */
        toggleSection(section) {
            const panel = this.panelOf(section);
            if (!panel) return null;
            const next = AppState.ui.openSection[panel] === section ? null : section;
            AppState.ui.openSection[panel] = next;
            return next;
        },

        /** Persist a sidebar's user-arranged section order. */
        setSectionOrder(panel, order) {
            if (!(panel in AppState.ui.sectionOrder) || !Array.isArray(order)) {
                return false;
            }
            AppState.ui.sectionOrder[panel] = order
                .filter((id) => typeof id === 'string' && id.length > 0)
                .slice(0, 20);
            return true;
        },

        /* ── Settings ───────────────────────────────── */

        updateSettings(key, value) {
            if (key in AppState.settings) {
                AppState.settings[key] = value;
                return true;
            }
            return false;
        },

        /* ── Reset ──────────────────────────────────── */

        /** Clear user data; keep seed templates and UI defaults. */
        reset() {
            AppState.editor.content = '';
            AppState.editor.isDirty = false;
            AppState.editor.lastSaved = null;
            AppState.templates = AppState.templates.filter((t) => t.isSeed);
            AppState.templates.forEach((t) => { t.isFavorite = false; });
            AppState.snippets = [];
            AppState.history = [];
            AppState.favorites = [];
            AppState.analytics = {
                totalWords: 0,
                totalChars: 0,
                sessionsCount: 0,
                lastSessionDate: null,
                transformCounts: {}
            };
        }
    };

    /* ── Restore merge (allowlisted) ────────────────── */

    function mergeRestore(saved) {
        if (!saved || typeof saved !== 'object') return;

        if (saved.editor && typeof saved.editor === 'object') {
            const { content, docTitle, lastSaved, isDirty } = saved.editor;
            if (typeof content === 'string') AppState.editor.content = content;
            if (typeof docTitle === 'string' && docTitle.trim()) {
                AppState.editor.docTitle = docTitle.trim().slice(0, 120);
            }
            if (typeof lastSaved === 'string' || lastSaved === null) AppState.editor.lastSaved = lastSaved;
            AppState.editor.isDirty = Boolean(isDirty);
        }

        if (Array.isArray(saved.templates)) {
            const seedIds = new Set(AppState.templates.filter((t) => t.isSeed).map((t) => t.id));
            const custom = saved.templates.filter(
                (t) => t && t.id && t.name && t.content && !seedIds.has(t.id)
            );
            // Restore favorite flags on seeds
            saved.templates.forEach((t) => {
                if (t && seedIds.has(t.id)) {
                    const seed = AppState.templates.find((s) => s.id === t.id);
                    if (seed) seed.isFavorite = Boolean(t.isFavorite);
                }
            });
            AppState.templates = [...AppState.templates.filter((t) => t.isSeed), ...custom];
        }

        if (Array.isArray(saved.snippets)) {
            AppState.snippets = saved.snippets.filter((s) => s && s.id && s.name && s.content);
        }

        if (Array.isArray(saved.history)) {
            AppState.history = saved.history
                .filter((h) => h && h.description && h.timestamp)
                .slice(0, HISTORY_CAP);
        }

        if (Array.isArray(saved.favorites)) {
            AppState.favorites = saved.favorites;
        }

        if (saved.analytics && typeof saved.analytics === 'object') {
            Object.assign(AppState.analytics, saved.analytics);
            if (!AppState.analytics.transformCounts
                || typeof AppState.analytics.transformCounts !== 'object') {
                AppState.analytics.transformCounts = {};
            }
        }

        if (saved.ui && typeof saved.ui === 'object') {
            AppState.ui.leftPanelCollapsed = Boolean(saved.ui.leftPanelCollapsed);
            AppState.ui.rightPanelCollapsed = Boolean(saved.ui.rightPanelCollapsed);
            if (saved.ui.openSection && typeof saved.ui.openSection === 'object') {
                Object.keys(AppState.ui.openSection).forEach((panel) => {
                    const value = saved.ui.openSection[panel];
                    AppState.ui.openSection[panel] =
                        (typeof value === 'string' && PANEL_SECTIONS[panel].includes(value))
                            ? value
                            : null;
                });
            } else if (saved.ui.collapsedSections
                && typeof saved.ui.collapsedSections === 'object') {
                // Legacy (≤2.1.0) shape: ten independent booleans. Each
                // sidebar's first non-collapsed section becomes its open one.
                Object.keys(PANEL_SECTIONS).forEach((panel) => {
                    const open = PANEL_SECTIONS[panel]
                        .find((id) => !saved.ui.collapsedSections[id]);
                    AppState.ui.openSection[panel] = open || null;
                });
            }
            if (saved.ui.sectionOrder && typeof saved.ui.sectionOrder === 'object') {
                Object.keys(AppState.ui.sectionOrder).forEach((panel) => {
                    const order = saved.ui.sectionOrder[panel];
                    if (Array.isArray(order)) {
                        AppState.ui.sectionOrder[panel] = order
                            .filter((id) => typeof id === 'string' && id.length > 0);
                    }
                });
            }
        }

        if (saved.settings && typeof saved.settings === 'object') {
            const s = saved.settings;
            if (['immediate', 'debounced', 'manual'].includes(s.autosave)) {
                AppState.settings.autosave = s.autosave;
            }
            const delay = Number(s.autosaveDelay);
            if (Number.isFinite(delay) && delay >= 100 && delay <= 60000) {
                AppState.settings.autosaveDelay = delay;
            }
            if (typeof s.wordWrap === 'boolean') AppState.settings.wordWrap = s.wordWrap;
            const fs = Number(s.fontSize);
            if (Number.isFinite(fs) && fs >= 11 && fs <= 22) AppState.settings.fontSize = fs;
            const ts = Number(s.tabSize);
            if (Number.isFinite(ts) && ts >= 2 && ts <= 8) AppState.settings.tabSize = ts;
        }
    }

    /* ── Persistence contract ───────────────────────── */

    Storage.configure({
        key: STORAGE_KEY,
        version: STATE_VERSION,
        getState: () => AppState,
        restore: mergeRestore,
        trim: (state) => {
            if (Array.isArray(state.history) && state.history.length > HISTORY_TRIM) {
                state.history.length = HISTORY_TRIM;
            }
        },
        migrations: {
            // Older payloads restore cleanly through the allowlisted merge
            // (mergeRestore converts the legacy collapsedSections shape)
            '1.0.0': (state) => state,
            '2.0.0': (state) => state,
            '2.1.0': (state) => state
        }
    });

    /* ── Legacy key migration (v1 'textman-state') ───── */

    try {
        if (!window.localStorage.getItem(STORAGE_KEY)) {
            const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
            if (legacyRaw) {
                const legacy = JSON.parse(legacyRaw);
                if (legacy && legacy.state) {
                    mergeRestore(legacy.state);
                    Storage.save();
                    console.info('[State] Migrated legacy textman-state data');
                }
                window.localStorage.removeItem(LEGACY_KEY);
            }
        }
    } catch (error) {
        console.warn('[State] Legacy migration skipped:', error);
    }

    window.State = State;
    window.AppState = AppState;
})();
