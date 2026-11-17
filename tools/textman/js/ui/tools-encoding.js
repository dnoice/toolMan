/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: EncodingTools (textMan Edition - v1.2)
 *     - File Name: tools-encoding.js
 *     - Relative Path: tools/textman/js/ui/tools-encoding.js
 *     - Artifact Type: javascript
 *     - Version: 1.2.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 1.2.0 (11/17/2026) [dendogg + Anthropic - Claude] — All / Encode /
 *       Decode filter in the 07/23 pill style with radiogroup semantics,
 *       roving tabindex, and arrow keys; filtered tiles leave the tab order
 *       via the hidden attribute.
 *     - 1.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added Base64URL
 *       encode/decode, hex encode/decode (UTF-8), and a decode-only JWT
 *       payload inspector (clearly labeled no-verify).
 *     - 1.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Initial encoding
 *       pane: Base64, URL, HTML entities.
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

    /* Base64URL: '+/' → '-_' and stripped padding */
    function b64urlEncode(text) {
        return b64encode(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function b64urlDecode(text) {
        let s = text.trim().replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return b64decode(s);
    }

    /* UTF-8 hex */
    function hexEncode(text) {
        return Array.from(new TextEncoder().encode(text))
            .map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function hexDecode(text) {
        const clean = text.trim().replace(/\s+/g, '').replace(/^0x/i, '');
        if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
            throw new Error('Invalid hex');
        }
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    /* JWT payload inspector — DECODE ONLY, signature is NOT verified. */
    function jwtDecode(text) {
        const parts = text.trim().split('.');
        if (parts.length < 2) throw new Error('Not a JWT');
        const header = JSON.parse(b64urlDecode(parts[0]));
        const payload = JSON.parse(b64urlDecode(parts[1]));
        return '// header\n' + JSON.stringify(header, null, 2)
            + '\n\n// payload (signature NOT verified)\n' + JSON.stringify(payload, null, 2);
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
        },
        'b64url-encode': { fn: b64urlEncode, label: 'Base64URL encode' },
        'b64url-decode': {
            fn: b64urlDecode, label: 'Base64URL decode',
            friendlyError: 'Not valid Base64URL — document unchanged'
        },
        'hex-encode': { fn: hexEncode, label: 'Hex encode' },
        'hex-decode': {
            fn: hexDecode, label: 'Hex decode',
            friendlyError: 'Not valid hex — document unchanged'
        },
        'jwt-decode': {
            fn: jwtDecode, label: 'JWT decode',
            friendlyError: 'Not a valid JWT — document unchanged'
        }
    };

    const EncodingUI = {
        direction: 'all',
        filterBar: null,

        init() {
            DOM.delegate('[data-body="encoding"]', 'click', '[data-encode]', (e, btn) => {
                this.apply(btn.dataset.encode, btn);
            });
            this.buildDirectionFilter();
        },

        /**
         * All / Encode / Decode filter over the eleven tiles. Mutually
         * exclusive, so the pills form a radiogroup (one tab stop, arrow keys
         * move the choice); hidden tiles leave the layout, the a11y tree, and
         * the tab order together via the hidden attribute.
         */
        buildDirectionFilter() {
            const body = DOM.$('[data-body="encoding"]');
            if (!body || this.filterBar) return;
            const grid = DOM.$('.tool-grid-buttons', body);
            if (!grid) return;

            const bar = DOM.create('div', {
                className: 'form-group options-row encoding-filter',
                attrs: { role: 'radiogroup', 'aria-label': 'Show encoders, decoders, or both' }
            });
            [['all', 'All'], ['encode', 'Encode'], ['decode', 'Decode']].forEach(([value, text]) => {
                bar.appendChild(DOM.create('button', {
                    className: 'toggle-pill',
                    text,
                    data: { direction: value, active: String(value === this.direction) },
                    attrs: {
                        type: 'button',
                        role: 'radio',
                        'aria-checked': String(value === this.direction),
                        tabindex: value === this.direction ? '0' : '-1'
                    }
                }));
            });
            body.insertBefore(bar, grid);
            this.filterBar = bar;

            DOM.delegate(bar, 'click', '[data-direction]', (e, btn) => {
                this.setDirection(btn.dataset.direction, false);
            });

            DOM.on(bar, 'keydown', (e) => {
                const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
                if (!keys.includes(e.key)) return;
                const options = DOM.$$('[data-direction]', bar);
                const current = options.findIndex((b) => b.getAttribute('aria-checked') === 'true');
                let next;
                if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = options.length - 1;
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % options.length;
                else next = (current - 1 + options.length) % options.length;
                e.preventDefault();
                this.setDirection(options[next].dataset.direction, true);
            });
        },

        setDirection(direction, moveFocus) {
            if (!this.filterBar) return;
            let chosen = null;
            DOM.$$('[data-direction]', this.filterBar).forEach((btn) => {
                const on = btn.dataset.direction === direction;
                if (on) chosen = btn;
                btn.setAttribute('aria-checked', String(on));
                btn.dataset.active = String(on);
                btn.tabIndex = on ? 0 : -1;
            });
            if (!chosen) return;
            this.direction = direction;
            if (moveFocus) chosen.focus();
            DOM.$$('[data-body="encoding"] [data-encode]').forEach((btn) => {
                btn.hidden = direction !== 'all' && btn.dataset.encodeDir !== direction;
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
