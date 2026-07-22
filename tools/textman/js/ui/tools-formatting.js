/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: FormattingTools (textMan Edition - v1.0)
 *     - File Name: tools-formatting.js
 *     - Relative Path: tools/textman/js/ui/tools-formatting.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Text Formatting pane — an empty placeholder in v1, now implemented
 *     as markdown-flavored line operations: heading toggles, bullet/numbered
 *     lists, blockquotes, and indentation. Heading and list markers TOGGLE:
 *     applying H2 to a line that is already H2 removes the marker; applying
 *     it to an H1 line re-levels it.
 *
 * ✒ Key Features:
 *     - Heading toggles: H1 / H2 / H3 (re-level or strip when re-applied)
 *     - Bullet list ("- ") and numbered list ("1. ") toggles
 *     - Blockquote ("> ") toggle
 *     - Indent / outdent by 4 spaces (tab-size aligned with the editor)
 *     - Works per selected lines, or the whole document with no selection
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.FormattingUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling FormattingUI.init(), which attaches one delegated click
 *     listener on [data-body="formatting"] for every [data-format] button.
 *
 * ✒ Examples:
 *     - <button data-format="h2"> on a plain line → "## line"; on a line
 *       already "## " → marker stripped; on "# line" → re-leveled to "## "
 *     - <button data-format="bullet"> → if every non-blank line already
 *       starts with "- " the markers strip, otherwise they are added
 *     - <button data-format="numbered"> → numbers non-blank lines
 *       sequentially (1. 2. 3.), or strips existing numbering
 *     - <button data-format="quote"> → toggles "> " per non-blank line
 *     - <button data-format="indent"> adds 4 spaces per line;
 *       data-format="outdent" removes up to 4 spaces or one tab
 *     - FormattingUI.apply('h3', btn) → programmatic call; tallies
 *       'format:h3' in analytics and logs history on change
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, ui/editor.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: markdown-flavored line operations only — no inline
 *       formatting (bold/italic/code spans)
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const INDENT = '    '; // 4 spaces, matches editor tab-size

    /** Apply fn to each line of the block. */
    function eachLine(text, fn) {
        return text.split('\n').map(fn).join('\n');
    }

    function toggleHeading(level) {
        const marker = '#'.repeat(level) + ' ';
        return (text) => eachLine(text, (line) => {
            if (!line.trim()) return line;
            const existing = line.match(/^(\s*)(#{1,6})\s+(.*)$/);
            if (existing) {
                // Same level → strip; different level → re-level
                return existing[2].length === level
                    ? existing[1] + existing[3]
                    : existing[1] + marker + existing[3];
            }
            return line.replace(/^(\s*)/, `$1${marker}`);
        });
    }

    function toggleBullet(text) {
        const allBulleted = text.split('\n')
            .filter((l) => l.trim())
            .every((l) => /^\s*-\s+/.test(l));

        return eachLine(text, (line) => {
            if (!line.trim()) return line;
            return allBulleted
                ? line.replace(/^(\s*)-\s+/, '$1')
                : line.replace(/^(\s*)(?:-\s+)?/, '$1- ');
        });
    }

    function toggleNumbered(text) {
        const lines = text.split('\n');
        const content = lines.filter((l) => l.trim());
        const allNumbered = content.length > 0 && content.every((l) => /^\s*\d+\.\s+/.test(l));

        let n = 0;
        return lines.map((line) => {
            if (!line.trim()) return line;
            if (allNumbered) return line.replace(/^(\s*)\d+\.\s+/, '$1');
            n += 1;
            return line.replace(/^(\s*)(?:\d+\.\s+)?/, `$1${n}. `);
        }).join('\n');
    }

    function toggleQuote(text) {
        const allQuoted = text.split('\n')
            .filter((l) => l.trim())
            .every((l) => /^\s*>\s?/.test(l));

        return eachLine(text, (line) => {
            if (!line.trim()) return line;
            return allQuoted
                ? line.replace(/^(\s*)>\s?/, '$1')
                : `> ${line}`;
        });
    }

    const FORMATS = {
        h1: toggleHeading(1),
        h2: toggleHeading(2),
        h3: toggleHeading(3),
        bullet: toggleBullet,
        numbered: toggleNumbered,
        quote: toggleQuote,
        indent: (text) => eachLine(text, (line) => (line.length ? INDENT + line : line)),
        outdent: (text) => eachLine(text, (line) => line.replace(/^(?: {1,4}|\t)/, ''))
    };

    const FormattingUI = {
        init() {
            DOM.delegate('[data-body="formatting"]', 'click', '[data-format]', (e, btn) => {
                this.apply(btn.dataset.format, btn);
            });
        },

        apply(name, btn) {
            const fn = FORMATS[name];
            if (!fn || !window.EditorUI) return;

            const changed = EditorUI.applyToSelectionOrAll(fn, `format:${name}`);

            if (changed) {
                State.tallyTransform(`format:${name}`);
                State.addHistory({ type: 'transform', description: `Formatted: ${name}` });
                if (window.WorkspaceUI) {
                    WorkspaceUI.renderHistory();
                    WorkspaceUI.renderAnalytics();
                }
                if (btn) {
                    btn.classList.remove('flash-applied');
                    void btn.offsetWidth;
                    btn.classList.add('flash-applied');
                }
            } else {
                TOOLMAN.notify('Nothing to format', 'info', 1400);
            }
        }
    };

    window.FormattingUI = FormattingUI;
})();
