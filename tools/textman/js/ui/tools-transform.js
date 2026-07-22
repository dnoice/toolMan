/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: TransformTools (textMan Edition - v1.0)
 *     - File Name: tools-transform.js
 *     - Relative Path: tools/textman/js/ui/tools-transform.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Transform pane: case conversion, whitespace cleanup, line
 *     operations, and sorting. Every transform runs through
 *     EditorUI.applyToSelectionOrAll, so a text selection is transformed in
 *     place and no selection means the whole document — with undo, dirty
 *     state, and autosave handled centrally.
 *
 * ✒ Key Features:
 *     - Case: UPPERCASE, lowercase, Title Case, Sentence case
 *     - Cleanup: trim whitespace, collapse spaces
 *     - Lines: remove empty, deduplicate, reverse, shuffle
 *     - Order: locale-aware natural sort A→Z / Z→A
 *     - Usage tallies feed the Analytics pane's "Top transform"
 *     - Applied-flash feedback on the clicked button
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.TransformUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling TransformUI.init(), which attaches one delegated click
 *     listener on [data-body="transform"] for every [data-transform] button.
 *
 * ✒ Examples:
 *     - <button data-transform="uppercase"> → TRANSFORMS.uppercase on the
 *       selection, or the whole document when nothing is selected
 *     - <button data-transform="dedupe"> → removes duplicate lines, keeping
 *       the first occurrence
 *     - <button data-transform="sort-asc"> → natural sort via Intl.Collator
 *       (numeric: "file2" sorts before "file10")
 *     - <button data-transform="sentencecase"> → lowercases, then capitalizes
 *       the first letter and letters after . ! ?
 *     - <button data-transform="removeempty"> → drops blank lines
 *     - TransformUI.apply('shuffle', btn) → programmatic call; flashes the
 *       button and logs history + analytics on change
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, ui/editor.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: line operations split on \n only; shuffle uses
 *       Math.random (not seeded, not cryptographic)
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    const TRANSFORMS = {
        uppercase: (t) => t.toUpperCase(),

        lowercase: (t) => t.toLowerCase(),

        titlecase: (t) => t.replace(
            /\S+/g,
            (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ),

        sentencecase: (t) => t
            .toLowerCase()
            .replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase()),

        trim: (t) => t
            .split('\n')
            .map((line) => line.trim())
            .join('\n')
            .trim(),

        collapse: (t) => t.replace(/[ \t]{2,}/g, ' '),

        removeempty: (t) => t
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .join('\n'),

        dedupe: (t) => {
            const seen = new Set();
            return t.split('\n').filter((line) => {
                if (seen.has(line)) return false;
                seen.add(line);
                return true;
            }).join('\n');
        },

        'reverse-lines': (t) => t.split('\n').reverse().join('\n'),

        shuffle: (t) => {
            const lines = t.split('\n');
            for (let i = lines.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lines[i], lines[j]] = [lines[j], lines[i]];
            }
            return lines.join('\n');
        },

        'sort-asc': (t) => t.split('\n').sort(collator.compare).join('\n'),

        'sort-desc': (t) => t.split('\n').sort((a, b) => collator.compare(b, a)).join('\n')
    };

    const TransformUI = {
        init() {
            DOM.delegate('[data-body="transform"]', 'click', '[data-transform]', (e, btn) => {
                this.apply(btn.dataset.transform, btn);
            });
        },

        apply(name, btn) {
            const fn = TRANSFORMS[name];
            if (!fn || !window.EditorUI) return;

            const changed = EditorUI.applyToSelectionOrAll(fn, name);

            if (changed) {
                State.tallyTransform(name);
                State.addHistory({ type: 'transform', description: `Applied transform: ${name}` });
                if (window.WorkspaceUI) {
                    WorkspaceUI.renderHistory();
                    WorkspaceUI.renderAnalytics();
                }
                if (btn) {
                    btn.classList.remove('flash-applied');
                    void btn.offsetWidth; // restart animation
                    btn.classList.add('flash-applied');
                }
            } else {
                TOOLMAN.notify('Nothing to transform', 'info', 1400);
            }
        }
    };

    window.TransformUI = TransformUI;
})();
