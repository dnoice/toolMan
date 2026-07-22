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
 *     - Scopes: each line (skips blanks) / selection / whole document
 *     - Non-destructive Preview of the first 8 lines
 *     - Clear removes only the entered prefix/suffix where actually present
 *     - Single-select scope pills with persisted active state
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.PrefixUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling PrefixUI.init(), which wires the scope pills and the
 *     Preview/Apply/Clear buttons and injects the aria-live preview box.
 *
 * ✒ Examples:
 *     - Prefix "- " with scope "lines" → bullets every non-blank line;
 *       blank lines stay untouched
 *     - Prefix "<li>" + suffix "</li>" with scope "lines" → HTML list items
 *     - Scope pill data-scope="document" → wraps the whole text exactly once
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

    const PrefixUI = {
        scope: 'lines',

        init() {
            this.wireScopePills();
            DOM.on('#btn-prefix-preview', 'click', () => this.preview());
            DOM.on('#btn-prefix-apply', 'click', () => this.apply());
            DOM.on('#btn-prefix-clear', 'click', () => this.clear());
            this.ensurePreviewBox();
        },

        wireScopePills() {
            DOM.delegate('.scope-pills', 'click', '.scope-btn', (e, btn) => {
                DOM.$$('.scope-pills .scope-btn').forEach((b) => { b.dataset.active = 'false'; });
                btn.dataset.active = 'true';
                this.scope = btn.dataset.scope || 'lines';
                this.hidePreview();
            });
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
            const shown = lines.slice(0, PREVIEW_LINES).join('\n');

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
