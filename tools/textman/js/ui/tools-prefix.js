/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: PrefixSuffixTools (textMan Edition - v1.0)
 *     - File Name: tools-prefix.js
 *     - Relative Path: tools/textman/js/ui/tools-prefix.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Prefix/Suffix pane: wrap each line, the selection, or the whole
 *     document with prefix and/or suffix strings. Preview is non-destructive
 *     (shows the first lines of the pending result), Apply commits through
 *     the editor pipeline, and Clear strips exactly the entered strings where
 *     they exist.
 *
 * ✒ Key Features:
 *     - Scopes: each line (skips blanks) / selection / whole document, as one
 *       joined segmented control with true radiogroup semantics
 *     - Arrow-key / Home / End navigation over a roving tabindex, so the
 *       group is a single tab stop with exactly one checked option
 *     - Non-destructive Preview of the first 8 lines
 *     - Clear removes only the entered prefix/suffix where actually present
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.PrefixUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling PrefixUI.init(), which rebuilds the three scope buttons
 *     into a labelled radiogroup, wires the Preview/Apply/Clear buttons, and
 *     injects the aria-live preview box.
 *
 * ✒ Examples:
 *     - Prefix "- " with scope "lines" → bullets every non-blank line;
 *       blank lines stay untouched
 *     - Prefix "<li>" + suffix "</li>" with scope "lines" → HTML list items
 *     - Segment data-scope="document" → wraps the whole text exactly once
 *     - Focus the group and press ArrowRight → selection moves one segment
 *       right and aria-checked follows it
 *     - Clicking #btn-prefix-preview → shows the first 8 lines of the
 *       pending result plus "…and N more lines"
 *     - Clear with prefix "- " → strips exactly "- " only from lines that
 *       start with it
 *     - Selection scope: select a block, Apply →
 *       EditorUI.applyToSelectionOrAll wraps just that block
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, ui/editor.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: line scope skips blank lines by design; Clear matches
 *       the literal strings only (no regex or trimming)
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PREVIEW_LINES = 8;
    // A "line" in whole-document scope can be the entire document, which would
    // grow the preview box until it needed its own scrollbar — the nested
    // scrolling review §9.3 wants gone. Clip each line so the box stays
    // bounded by content rather than by an overflow rule.
    const PREVIEW_LINE_CHARS = 120;

    const SCOPE_LABEL_ID = 'prefix-scope-label';

    const PrefixUI = {
        scope: 'lines',
        scopeBar: null,

        init() {
            this.buildScopeControl();
            this.wireScopeControl();
            DOM.on('#btn-prefix-preview', 'click', () => this.preview());
            DOM.on('#btn-prefix-apply', 'click', () => this.apply());
            DOM.on('#btn-prefix-clear', 'click', () => this.clear());
            this.ensurePreviewBox();
        },

        /* ===== SEGMENTED SCOPE CONTROL (review §6.6 / §13.3) =====
           Each line / Selection / Whole document are MUTUALLY EXCLUSIVE, so
           they must look and behave like one control with three positions —
           not like three independent toggles that happen to be adjacent
           (review §4.7). Joining them visually is only half the job: without
           radio semantics a screen reader still hears three unrelated buttons
           and a keyboard user still has to Tab through all three.

           So the three buttons are wrapped into a radiogroup here, in JS,
           because the markup lives in index.html which this pass does not own.
           The buttons themselves are MOVED, not recreated — their data-scope
           values and any listener already attached to them survive.

           Roving tabindex: the group is ONE tab stop and the arrow keys move
           between positions, which is the expected radio-group behaviour and
           the reason a segmented control beats three buttons. */
        buildScopeControl() {
            // Located through the scope BUTTONS, not through a container class:
            // the class belongs to markup this pass does not own.
            const buttons = DOM.$$('.prefix-container [data-scope]');
            if (!buttons.length) return;

            const group = buttons[0].parentElement;
            if (!group || group.getAttribute('role') === 'radiogroup') return;

            // The form-group goes back to being a plain labelled field…
            group.classList.remove('scope-pills');

            // …with a section label the radiogroup can be named by.
            const label = DOM.create('span', {
                className: 'field-label',
                id: SCOPE_LABEL_ID,
                text: 'Apply to'
            });

            // …and the joined control itself. The .segmented class carries the
            // shared styling (panels.css); the JS below gives it real radiogroup
            // semantics on top.
            const bar = DOM.create('div', {
                className: 'segmented',
                attrs: { role: 'radiogroup', 'aria-labelledby': SCOPE_LABEL_ID }
            });

            buttons.forEach((btn) => {
                btn.classList.add('segmented-option');
                btn.setAttribute('type', 'button');
                btn.setAttribute('role', 'radio');
                bar.appendChild(btn);
            });

            group.appendChild(label);
            group.appendChild(bar);
            this.scopeBar = bar;

            this.select(this.scope, false);
        },

        wireScopeControl() {
            const bar = this.scopeBar || DOM.$('.prefix-container [role="radiogroup"]');
            if (!bar) return;

            DOM.delegate(bar, 'click', '[data-scope]', (e, btn) => {
                this.select(btn.dataset.scope || 'lines', false);
            });

            // Arrow keys move the selection, Home/End jump to the ends — the
            // group is a single tab stop (review §21: one selected value).
            DOM.on(bar, 'keydown', (e) => {
                const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
                if (!keys.includes(e.key)) return;

                const options = DOM.$$('[data-scope]', bar);
                const current = options.findIndex((b) => b.getAttribute('aria-checked') === 'true');
                let next;

                if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = options.length - 1;
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    next = (current + 1) % options.length;
                } else {
                    next = (current - 1 + options.length) % options.length;
                }

                e.preventDefault();
                this.select(options[next].dataset.scope, true);
            });
        },

        /** The ONE place scope selection is expressed — exactly one winner. */
        select(scope, moveFocus) {
            const bar = this.scopeBar || DOM.$('.prefix-container .segmented');
            if (!bar) { this.scope = scope || 'lines'; return; }

            const options = DOM.$$('[data-scope]', bar);
            let chosen = null;

            options.forEach((btn) => {
                const on = btn.dataset.scope === scope;
                if (on) chosen = btn;
                btn.setAttribute('aria-checked', String(on));
                btn.dataset.active = String(on);       // legacy styling hook
                btn.tabIndex = on ? 0 : -1;            // roving tabindex
            });

            if (!chosen) return;
            this.scope = scope;
            if (moveFocus) chosen.focus();
            this.hidePreview();
        },

        ensurePreviewBox() {
            const container = DOM.$('.prefix-container');
            if (!container || DOM.id('prefix-preview')) return;
            container.appendChild(DOM.create('div', {
                className: 'prefix-preview',
                id: 'prefix-preview',
                attrs: { 'aria-live': 'polite' }
            }));
        },

        getInputs() {
            return {
                prefix: DOM.id('prefix-input')?.value || '',
                suffix: DOM.id('suffix-input')?.value || ''
            };
        },

        /** Compute the transformed version of `text` for the current scope. */
        transform(text, prefix, suffix) {
            if (this.scope === 'lines') {
                return text.split('\n')
                    .map((line) => (line.trim() ? prefix + line + suffix : line))
                    .join('\n');
            }
            // 'selection' and 'document' both wrap the block once
            return prefix + text + suffix;
        },

        /** Strip prefix/suffix where present, per scope. */
        strip(text, prefix, suffix) {
            const stripLine = (line) => {
                let out = line;
                if (prefix && out.startsWith(prefix)) out = out.slice(prefix.length);
                if (suffix && out.endsWith(suffix)) out = out.slice(0, out.length - suffix.length);
                return out;
            };

            if (this.scope === 'lines') {
                return text.split('\n')
                    .map((line) => (line.trim() ? stripLine(line) : line))
                    .join('\n');
            }
            return stripLine(text);
        },

        /** Source text for the current scope (selection falls back to doc). */
        sourceText() {
            const ta = DOM.id('editor-textarea');
            if (this.scope === 'selection' && ta && ta.selectionStart !== ta.selectionEnd) {
                return ta.value.substring(ta.selectionStart, ta.selectionEnd);
            }
            return EditorUI.getValue();
        },

        preview() {
            const { prefix, suffix } = this.getInputs();
            const box = DOM.id('prefix-preview');
            if (!box) return;

            if (!prefix && !suffix) {
                TOOLMAN.notify('Enter a prefix or suffix first', 'info', 1600);
                this.hidePreview();
                return;
            }

            const result = this.transform(this.sourceText(), prefix, suffix);
            const lines = result.split('\n');
            const shown = lines
                .slice(0, PREVIEW_LINES)
                .map((line) => (line.length > PREVIEW_LINE_CHARS
                    ? `${line.slice(0, PREVIEW_LINE_CHARS)}…`
                    : line))
                .join('\n');

            DOM.empty(box);
            box.appendChild(document.createTextNode(shown || '(empty result)'));
            if (lines.length > PREVIEW_LINES) {
                box.appendChild(DOM.create('span', {
                    className: 'preview-note',
                    text: `…and ${lines.length - PREVIEW_LINES} more line${lines.length - PREVIEW_LINES === 1 ? '' : 's'}`
                }));
            }
            box.classList.add('is-visible');
        },

        hidePreview() {
            DOM.id('prefix-preview')?.classList.remove('is-visible');
        },

        apply() {
            const { prefix, suffix } = this.getInputs();
            if (!prefix && !suffix) {
                TOOLMAN.notify('Enter a prefix or suffix first', 'info', 1600);
                return;
            }
            if (!window.EditorUI) return;

            let changed;
            if (this.scope === 'selection') {
                changed = EditorUI.applyToSelectionOrAll(
                    (t) => this.transform(t, prefix, suffix), 'Prefix/Suffix'
                );
            } else {
                const result = this.transform(EditorUI.getValue(), prefix, suffix);
                changed = result !== EditorUI.getValue();
                if (changed) EditorUI.setValue(result);
            }

            if (changed) {
                State.addHistory({ type: 'transform', description: 'Applied prefix/suffix' });
                if (window.WorkspaceUI) WorkspaceUI.renderHistory();
                this.hidePreview();
            } else {
                TOOLMAN.notify('Nothing to change', 'info', 1400);
            }
        },

        clear() {
            const { prefix, suffix } = this.getInputs();
            if (!prefix && !suffix) {
                TOOLMAN.notify('Enter the prefix/suffix you want removed', 'info', 2000);
                return;
            }
            if (!window.EditorUI) return;

            let changed;
            if (this.scope === 'selection') {
                changed = EditorUI.applyToSelectionOrAll(
                    (t) => this.strip(t, prefix, suffix), 'Clear prefix/suffix'
                );
            } else {
                const result = this.strip(EditorUI.getValue(), prefix, suffix);
                changed = result !== EditorUI.getValue();
                if (changed) EditorUI.setValue(result);
            }

            if (changed) {
                State.addHistory({ type: 'transform', description: 'Cleared prefix/suffix' });
                if (window.WorkspaceUI) WorkspaceUI.renderHistory();
                this.hidePreview();
            } else {
                TOOLMAN.notify('Nothing matched that prefix/suffix', 'info', 1800);
            }
        }
    };

    window.PrefixUI = PrefixUI;
})();
