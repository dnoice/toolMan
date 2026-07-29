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
 *     - Live match count as flat helper text ("No matches yet" → "12
 *       matches" → "3 of 12"), announced through an aria-live region
 *     - Independent options rendered as real checkboxes, not chips
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
 *     app.js calling SearchUI.init(), which upgrades the option chips into
 *     checkboxes, injects its match counter under the search field, wires the
 *     action buttons, and recounts (debounced 250ms) on both search-field and
 *     editor input.
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

            this.enhanceOptions();
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

        /* ===== OPTIONS: CHIPS → CHECKBOXES (review §6.6 / §13.2) =====
           Match case, Whole word and Regex are INDEPENDENT switches, but as
           three same-sized chips sitting shoulder to shoulder they read as a
           segmented control — exactly the "independent check options look like
           segmented controls" failure in review §4.7. It matters twice over
           here, because the very next pane (Prefix/Suffix) now uses a REAL
           joined segmented control for its mutually exclusive scope: two
           different behaviours must not share one silhouette.

           The review offers chips or checkboxes. Checkboxes win: a tick box is
           unambiguously a multi-select, it is natively keyboard- and
           AT-operable with no ARIA of our own, and it cannot be mistaken for
           the joined control two panes down.

           The markup lives in index.html, which this pass does not own, so the
           buttons are upgraded in place here. The ids survive the swap, and
           data-active is mirrored onto the input so anything still reading the
           old attribute keeps working. */
        enhanceOptions() {
            const specs = [
                ['opt-match-case', 'Match case', 'Only match text with the same capitalisation'],
                ['opt-whole-word', 'Whole word', 'Only match whole words, not fragments'],
                ['opt-regex', 'Regex', 'Read the search term as a regular expression']
            ];

            // Find the row through the controls themselves, not through a
            // class name: the class belongs to markup this pass does not own.
            const anchor = DOM.id(specs[0][0]);
            if (!anchor) return;
            if (anchor.tagName === 'INPUT') return;     // already upgraded

            const row = anchor.parentElement;
            if (!row) return;

            const wasActive = {};
            specs.forEach(([id]) => {
                const old = DOM.id(id);
                wasActive[id] = old ? old.dataset.active === 'true' : false;
                if (old) old.remove();
            });

            row.classList.remove('options-row');
            row.classList.add('option-checks');
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', 'Search options');

            specs.forEach(([id, text, hint]) => {
                const input = DOM.create('input', {
                    id,
                    attrs: { type: 'checkbox' },
                    data: { active: String(wasActive[id]) }
                });
                input.checked = wasActive[id];

                row.appendChild(DOM.create('label', {
                    className: 'option-check',
                    attrs: { for: id, title: hint },
                    children: [input, DOM.create('span', { text })]
                }));
            });
        },

        /* Flat status TEXT, not a pill (review §6.6: "Status text → flat text,
           not pills"). It sits directly under the search field because that is
           the field it reports on, and it is a live region so the count is
           announced as it changes. */
        ensureCounter() {
            const container = DOM.$('.search-container');
            if (!container || DOM.id('match-counter')) return;

            this.counterEl = DOM.create('p', {
                className: 'match-counter',
                id: 'match-counter',
                text: 'No matches yet',
                data: { hasMatches: 'false' },
                attrs: { role: 'status', 'aria-live': 'polite' }
            });

            const searchGroup = this.searchInput.closest('.form-group');
            if (searchGroup) {
                searchGroup.appendChild(this.counterEl);
            } else {
                container.insertBefore(this.counterEl, container.firstChild);
            }
        },

        wireOptions() {
            const flags = {
                'opt-match-case': 'matchCase',
                'opt-whole-word': 'wholeWord',
                'opt-regex': 'regex'
            };

            Object.entries(flags).forEach(([id, flag]) => {
                const box = DOM.id(id);
                if (!box) return;

                // Normal path: enhanceOptions has already made this a checkbox.
                if (box.type === 'checkbox') {
                    this.options[flag] = box.checked;   // adopt the markup's state
                    DOM.on(box, 'change', () => {
                        this.options[flag] = box.checked;
                        box.dataset.active = String(box.checked); // legacy mirror
                        this.recompute();
                    });
                    return;
                }

                // Fallback: if the upgrade could not run (markup changed under
                // us), the control is still the original toggle button — wire
                // it the old way rather than leaving the option dead.
                DOM.on(box, 'click', () => {
                    const active = box.dataset.active !== 'true';
                    box.dataset.active = String(active);
                    this.options[flag] = active;
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
                // Review §23.3: the resting state is about MATCHES, not about
                // whether a search has been performed.
                if (!this.searchInput.value) this.setCounter('No matches yet', false);
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
