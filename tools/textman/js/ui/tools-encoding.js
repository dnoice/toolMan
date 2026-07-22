/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EncodingTools (textMan Edition - v1.0)
 *     - File Name: tools-encoding.js
 *     - Relative Path: tools/textman/js/ui/tools-encoding.js
 *     - Artifact Type: script
 *     - Version: 1.0.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Encoding/Decoding pane — the pane that was an empty placeholder in
 *     v1, now fully implemented. Base64 (UTF-8 safe via TextEncoder), URL
 *     percent-encoding, and HTML entity escaping, each with its decode
 *     counterpart. Invalid input decodes fail with a clear toast instead of a
 *     silent exception, and the document is left untouched.
 *
 * ✒ Key Features:
 *     - Base64 encode/decode, safe for emoji and all multi-byte text
 *     - URL encode/decode (encodeURIComponent semantics)
 *     - HTML entity escape/unescape
 *     - Selection-aware via EditorUI.applyToSelectionOrAll
 *     - Hard failure surfacing: bad Base64/URI input → error toast, no change
 *
 * ✒ Usage Instructions:
 *     Script-tag module exposing window.EncodingUI — load after shared/js,
 *     js/state.js, and ui/editor.js in tools/textman/index.html. Booted by
 *     app.js calling EncodingUI.init(), which attaches one delegated click
 *     listener on [data-body="encoding"] for every [data-encode] button.
 *
 * ✒ Examples:
 *     - <button data-encode="b64-encode"> → UTF-8 safe Base64; emoji and
 *       accented text round-trip correctly via TextEncoder
 *     - <button data-encode="b64-decode"> on invalid input → toast "Not
 *       valid Base64 — document unchanged"
 *     - <button data-encode="url-encode"> → encodeURIComponent semantics
 *       ("a b" becomes "a%20b")
 *     - <button data-encode="url-decode"> → treats "+" as space before
 *       decoding percent-escapes
 *     - <button data-encode="html-escape"> → "<div>" becomes "&lt;div&gt;"
 *     - <button data-encode="html-unescape"> → reverses &amp; &lt; &gt;
 *       &quot; &#39; &#x27; &apos; &nbsp;
 *     - EncodingUI.apply('b64-encode', btn) → programmatic call with button
 *       flash and history/analytics logging on change
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js, js/state.js, ui/editor.js
 *     - Compatible platforms: all evergreen browsers (TextEncoder/TextDecoder)
 *     - Security: Base64 decode uses TextDecoder with fatal:true, so invalid
 *       UTF-8 rejects instead of producing garbage
 *     - Limitations: HTML unescape covers the fixed entity set listed above,
 *       not the full named-entity table
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /* UTF-8 safe Base64 */
    function b64encode(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    function b64decode(text) {
        const binary = atob(text.trim());
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    const HTML_UNESCAPES = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&nbsp;': ' '
    };

    const OPS = {
        'b64-encode': { fn: b64encode, label: 'Base64 encode' },
        'b64-decode': {
            fn: b64decode,
            label: 'Base64 decode',
            friendlyError: 'Not valid Base64 — document unchanged'
        },
        'url-encode': { fn: (t) => encodeURIComponent(t), label: 'URL encode' },
        'url-decode': {
            fn: (t) => decodeURIComponent(t.replace(/\+/g, '%20')),
            label: 'URL decode',
            friendlyError: 'Not a valid URL encoding — document unchanged'
        },
        'html-escape': { fn: (t) => Text.escapeHtml(t), label: 'HTML escape' },
        'html-unescape': {
            fn: (t) => t.replace(/&(?:amp|lt|gt|quot|#39|#x27|apos|nbsp);/g, (m) => HTML_UNESCAPES[m]),
            label: 'HTML unescape'
        }
    };

    const EncodingUI = {
        init() {
            DOM.delegate('[data-body="encoding"]', 'click', '[data-encode]', (e, btn) => {
                this.apply(btn.dataset.encode, btn);
            });
        },

        apply(name, btn) {
            const op = OPS[name];
            if (!op || !window.EditorUI) return;

            let failed = false;
            const changed = EditorUI.applyToSelectionOrAll((text) => {
                try {
                    return op.fn(text);
                } catch (_error) {
                    failed = true;
                    return text; // unchanged → applyToSelectionOrAll reports no-op
                }
            }, op.label);

            if (failed) {
                TOOLMAN.notify(op.friendlyError || `${op.label} failed`, 'error');
                return;
            }

            if (changed) {
                State.tallyTransform(name);
                State.addHistory({ type: 'transform', description: `Applied: ${op.label}` });
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
                TOOLMAN.notify('Nothing to encode', 'info', 1400);
            }
        }
    };

    window.EncodingUI = EncodingUI;
})();
