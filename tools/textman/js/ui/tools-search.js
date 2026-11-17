/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: SearchReplaceTools (textMan Edition - v1.0)
 *     - File Name: tools-search.js
 *     - Relative Path: tools/textman/js/ui/tools-search.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Search & Replace pane: live match counting, prev/next navigation
 *     with wrap-around, single and bulk replacement, and match-case /
 *     whole-word / regex options with scope control. Regex input is validated
 *     live — invalid patterns mark the field, show the reason, and never
 *     throw.
 *
 * ✒ Key Features:
 *     - Live match counter ("3 of 12") recomputed as you type (debounced)
 *     - Validated regex mode with visible invalid-pattern state
 *     - Whole-word and match-case options composable with literal or regex
 *     - Prev/Next with wrap-around; textarea selection tracks the hit
 *     - Replace one / Replace all with $1-style group support in regex mode
 *     - Scope: current document or selection
 *     - Replace-all reports the replacement count and logs to history
 *     - Enter → next match, Shift+Enter → previous, from the search field
 *     - Zero-width match safety and a 100,000-match scan guard
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.SearchUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling SearchUI.init(), which injects its match counter into
 *     .search-container, wires the option pills and action buttons, and
 *     recounts (debounced 250ms) on both search-field and editor input.
 *
 * ✒ Examples:
 *     - Type "TODO" in #search-input → counter reads "7 matches"; Enter
 *       selects the next hit in the textarea
 *     - Enable #opt-regex and search \d{4}-\d{2}-\d{2} → finds ISO dates;
 *       an invalid pattern marks the field and shows "Invalid regex: …"
 *     - Enable #opt-whole-word with "cat" → matches "cat" but not "category"
 *     - Regex replace-all: search (\w+)@old\.com, replace $1@new.com →
 *       rewrites every address, keeping the captured name
 *     - In replacements, $& inserts the whole match and $$ a literal dollar
 *     - Set #search-scope to "selection" → counting and replacement stay
 *       inside the current textarea selection
 *     - SearchUI.next() / SearchUI.prev() → programmatic navigation with
 *       wrap-around
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, ui/editor.js
 *     - Compatible platforms: all evergreen browsers
 *     - Performance: match scanning is guarded at 100,000 matches per pass
 *     - Limitations: hits are shown via the textarea selection — there is no
 *       inline highlight overlay for all matches at once
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const SearchUI = {
        searchInput: null,
        replaceInput: null,
        counterEl: null,
        matches: [],
        currentIndex: -1,

        options: {
            matchCase: false,
            wholeWord: false,
            regex: false
        },

        init() {
            this.searchInput = DOM.id('search-input');
            this.replaceInput = DOM.id('replace-input');
            if (!this.searchInput) return;

            this.ensureCounter();
            this.wireOptions();
            this.wireActions();

            // Live recount as the user types or the document changes
            const recount = DOM.debounce(() => this.recompute(), 250);
            DOM.on(this.searchInput, 'input', recount);
            DOM.on('#editor-textarea', 'input', recount);

            // Enter in search field → next; Shift+Enter → prev
            DOM.on(this.searchInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) this.prev(); else this.next();
                }
            });
        },

        ensureCounter() {
            const container = DOM.$('.search-container');
            if (!container || DOM.id('match-counter')) return;

            this.counterEl = DOM.create('span', {
                className: 'match-counter',
                id: 'match-counter',
                text: 'No search yet',
                data: { hasMatches: 'false' }
            });
            container.insertBefore(this.counterEl, container.firstChild);
        },

        wireOptions() {
            ['opt-match-case', 'opt-whole-word', 'opt-regex'].forEach((id) => {
                DOM.on(`#${id}`, 'click', (e) => {
                    const btn = e.currentTarget;
                    const active = btn.dataset.active !== 'true';
                    btn.dataset.active = String(active);

                    if (id === 'opt-match-case') this.options.matchCase = active;
                    if (id === 'opt-whole-word') this.options.wholeWord = active;
                    if (id === 'opt-regex') this.options.regex = active;

                    this.recompute();
                });
            });
        },

        wireActions() {
            DOM.on('#btn-search-prev', 'click', () => this.prev());
            DOM.on('#btn-search-next', 'click', () => this.next());
            DOM.on('#btn-replace-one', 'click', () => this.replaceOne());
            DOM.on('#btn-replace-all', 'click', () => this.replaceAll());
        },

        /** Build the search RegExp, or null (empty/invalid). */
        buildRegex(global = true) {
            const raw = this.searchInput.value;
            if (!raw) {
                this.searchInput.classList.remove('input-error');
                return null;
            }

            let source = this.options.regex ? raw : Text.escapeRegex(raw);
            if (this.options.wholeWord) source = `\\b(?:${source})\\b`;

            const flags = (global ? 'g' : '') + (this.options.matchCase ? '' : 'i');

            try {
                const re = new RegExp(source, flags);
                this.searchInput.classList.remove('input-error');
                return re;
            } catch (error) {
                this.searchInput.classList.add('input-error');
                this.setCounter(`Invalid regex: ${error.message}`, false);
                return null;
            }
        },

        /** Scan the scoped text and cache match ranges. */
        recompute() {
            this.matches = [];
            this.currentIndex = -1;

            const re = this.buildRegex(true);
            if (!re || !window.EditorUI) {
                if (!this.searchInput.value) this.setCounter('No search yet', false);
                return;
            }

            const { text, offset } = this.scopedText();
            let match;
            let guard = 0;
            while ((match = re.exec(text)) !== null && guard < 100000) {
                this.matches.push({
                    start: offset + match.index,
                    end: offset + match.index + match[0].length
                });
                if (match[0].length === 0) re.lastIndex += 1; // zero-width safety
                guard += 1;
            }

            this.setCounter(
                this.matches.length
                    ? `${this.matches.length} match${this.matches.length === 1 ? '' : 'es'}`
                    : 'No matches',
                this.matches.length > 0
            );
        },

        scopedText() {
            const scope = DOM.id('search-scope')?.value || 'document';
            const ta = DOM.id('editor-textarea');
            if (scope === 'selection' && ta && ta.selectionStart !== ta.selectionEnd) {
                return {
                    text: ta.value.substring(ta.selectionStart, ta.selectionEnd),
                    offset: ta.selectionStart
                };
            }
            return { text: EditorUI.getValue(), offset: 0 };
        },

        setCounter(text, hasMatches) {
            if (this.counterEl) {
                this.counterEl.textContent = text;
                this.counterEl.dataset.hasMatches = String(Boolean(hasMatches));
            }
        },

        selectMatch(index) {
            const ta = DOM.id('editor-textarea');
            const match = this.matches[index];
            if (!ta || !match) return;

            ta.focus();
            ta.setSelectionRange(match.start, match.end);
            this.currentIndex = index;
            this.setCounter(`${index + 1} of ${this.matches.length}`, true);
        },

        next() {
            this.recompute();
            if (!this.matches.length) return;

            const ta = DOM.id('editor-textarea');
            const from = ta ? ta.selectionEnd : 0;
            let idx = this.matches.findIndex((m) => m.start >= from);
            if (idx === -1) idx = 0; // wrap around
            this.selectMatch(idx);
        },

        prev() {
            this.recompute();
            if (!this.matches.length) return;

            const ta = DOM.id('editor-textarea');
            const from = ta ? ta.selectionStart : 0;
            let idx = -1;
            for (let k = this.matches.length - 1; k >= 0; k--) {
                if (this.matches[k].end <= from) { idx = k; break; }
            }
            if (idx === -1) idx = this.matches.length - 1; // wrap around
            this.selectMatch(idx);
        },

        replaceOne() {
            const re = this.buildRegex(false);
            if (!re || !window.EditorUI) return;

            const ta = DOM.id('editor-textarea');
            if (!ta) return;

            // If the current selection isn't a match, jump to the next one first.
            const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
            const anchored = new RegExp(`^(?:${re.source})$`, re.flags.replace('g', ''));
            if (!sel || !anchored.test(sel)) {
                this.next();
                return;
            }

            const replacement = this.options.regex
                ? sel.replace(re, this.replaceInput.value)
                : this.replaceInput.value;

            const start = ta.selectionStart;
            ta.setRangeText(replacement, ta.selectionStart, ta.selectionEnd, 'end');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.setSelectionRange(start + replacement.length, start + replacement.length);

            this.recompute();
            this.next();
        },

        replaceAll() {
            const re = this.buildRegex(true);
            if (!re || !window.EditorUI) return;

            const scope = DOM.id('search-scope')?.value || 'document';
            const ta = DOM.id('editor-textarea');
            const replacement = this.replaceInput.value;
            let count = 0;

            const doReplace = (text) => text.replace(re, (...args) => {
                count += 1;
                if (!this.options.regex) return replacement;
                // Support $1 group references in regex mode
                const groups = args.slice(1, -2);
                return replacement.replace(/\$(\d+|\$|&)/g, (_, token) => {
                    if (token === '$') return '$';
                    if (token === '&') return args[0];
                    const idx = parseInt(token, 10) - 1;
                    return idx >= 0 && idx < groups.length && groups[idx] !== undefined
                        ? groups[idx] : '';
                });
            });

            if (scope === 'selection' && ta && ta.selectionStart !== ta.selectionEnd) {
                EditorUI.applyToSelectionOrAll(doReplace, 'Replace all');
            } else {
                const result = doReplace(EditorUI.getValue());
                if (count > 0) EditorUI.setValue(result);
            }

            if (count > 0) {
                State.addHistory({
                    type: 'transform',
                    description: `Replaced ${count} occurrence${count === 1 ? '' : 's'}`
                });
                if (window.WorkspaceUI) WorkspaceUI.renderHistory();
                TOOLMAN.notify(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`, 'success', 2000);
            } else {
                TOOLMAN.notify('No matches to replace', 'info', 1600);
            }

            this.recompute();
        }
    };

    window.SearchUI = SearchUI;
})();
