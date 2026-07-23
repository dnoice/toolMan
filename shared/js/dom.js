/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: DOMUtils (toolMan Edition - v2.2)
 *     - File Name: dom.js
 *     - Relative Path: shared/js/dom.js
 *     - Artifact Type: library
 *     - Version: 2.2.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 2.2.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Added
 *       Text.countSentences and Text.readability (Flesch Reading Ease with a
 *       heuristic syllable count) for the analytics pane.
 *     - 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — fadeIn no longer
 *       stamps display:block on its target: it now restores '' by default
 *       (stylesheet wins) with an optional display argument for elements
 *       that genuinely need one. The forced block was overriding #app's
 *       display:flex at loader handoff, severing the entire height chain and
 *       rendering the app ~3x viewport height (audit finding F1).
 *     - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to
 *       shared/js/ for the toolMan ecosystem and hardened: added event
 *       delegation, debounce/throttle, clipboard helper with fallback,
 *       regex escaping, map-based HTML escaping, and null-safety throughout.
 *       Wrapped in an IIFE to stop leaking implementation details.
 *     - 1.0.0 (2025-11-18) [model not recorded] — Initial DOM helpers and
 *       text utilities.
 *
 * ✒ Description:
 *     Shared DOM manipulation and text-measurement helpers used by every
 *     toolMan tool. All element-accepting functions take either an Element
 *     or a CSS selector string and fail soft (no-op + null return) instead
 *     of throwing, so UI code never crashes on a missing node.
 *
 * ✒ Key Features:
 *     - Query helpers: DOM.$, DOM.$$, DOM.id
 *     - Element factory: DOM.create(tag, options) with attrs/data/children
 *     - Events: DOM.on/off plus DOM.delegate for event delegation
 *     - Class/attribute/visibility helpers, all selector-or-element tolerant
 *     - rAF-driven fadeIn/fadeOut animations
 *     - Timing: DOM.debounce, DOM.throttle
 *     - Clipboard: DOM.copyText with execCommand fallback
 *     - Text utilities: word/char counts, read time, selection handling,
 *       truncation, HTML escaping, regex escaping, number formatting
 *
 * ✒ Usage Instructions:
 *     Load after toolman.js and before any UI script:
 *         <script src="../../shared/js/dom.js"></script>
 *     Everything is exposed on window.DOM and window.Text.
 *
 * ✒ Examples:
 *     DOM.$('#editor-textarea')
 *     DOM.create('div', { className: 'card', text: 'Hello' })
 *     DOM.delegate('#template-list', 'click', '.btn-use', handler)
 *     DOM.debounce(saveFn, 800)
 *     DOM.copyText('hello').then(ok => ...)
 *     Text.countWords('one two three')      → 3
 *     Text.escapeHtml('<b>&</b>')           → '&lt;b&gt;&amp;&lt;/b&gt;'
 *     Text.escapeRegex('a.b*c')             → 'a\\.b\\*c'
 *     Text.estimateReadTime(longText)       → minutes (200 wpm)
 *
 * ✒ Other Important Information:
 *     - Dependencies: none
 *     - Compatible platforms: all evergreen browsers (navigator.clipboard
 *       with graceful execCommand fallback for insecure contexts)
 *     - Security: Text.escapeHtml covers safe interpolation; DOM.create's
 *       html option assigns innerHTML verbatim — escape untrusted input
 *       first
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /** Resolve a selector-or-element argument to an Element (or null). */
    function resolve(target, parent) {
        if (typeof target === 'string') {
            return (parent || document).querySelector(target);
        }
        return target instanceof Element ? target : null;
    }

    const DOM = {
        /** Query selector (single element or null). */
        $(selector, parent = document) {
            return parent.querySelector(selector);
        },

        /** Query selector all (always an array). */
        $$(selector, parent = document) {
            return Array.from(parent.querySelectorAll(selector));
        },

        /** Get element by ID. */
        id(id) {
            return document.getElementById(id);
        },

        /** Create an element with options (className, id, text, html, attrs, data, style, children). */
        create(tag, options = {}) {
            const el = document.createElement(tag);

            if (options.className) el.className = options.className;
            if (options.id) el.id = options.id;
            if (options.text) el.textContent = options.text;
            if (options.html) el.innerHTML = options.html;

            if (options.attrs) {
                Object.entries(options.attrs).forEach(([key, value]) => {
                    el.setAttribute(key, value);
                });
            }

            if (options.data) {
                Object.entries(options.data).forEach(([key, value]) => {
                    el.dataset[key] = value;
                });
            }

            if (options.style) Object.assign(el.style, options.style);

            if (options.children) {
                options.children.forEach((child) => {
                    el.appendChild(
                        typeof child === 'string' ? document.createTextNode(child) : child
                    );
                });
            }

            return el;
        },

        /** Add an event listener (selector-or-element tolerant). */
        on(element, event, handler, options = {}) {
            const el = resolve(element);
            if (el) el.addEventListener(event, handler, options);
            return el;
        },

        /** Remove an event listener. */
        off(element, event, handler) {
            const el = resolve(element);
            if (el) el.removeEventListener(event, handler);
        },

        /**
         * Event delegation: one listener on `root`, fired when the event
         * target (or an ancestor) matches `selector`. Handler receives
         * (event, matchedElement).
         */
        delegate(root, event, selector, handler) {
            const el = resolve(root);
            if (!el) return null;
            const listener = (e) => {
                const match = e.target.closest(selector);
                if (match && el.contains(match)) handler(e, match);
            };
            el.addEventListener(event, listener);
            return listener; // so callers can DOM.off later
        },

        /** Toggle a class; returns whether the class is now present. */
        toggleClass(element, className) {
            const el = resolve(element);
            if (!el) return false;
            el.classList.toggle(className);
            return el.classList.contains(className);
        },

        addClass(element, className) {
            const el = resolve(element);
            if (el) el.classList.add(className);
        },

        removeClass(element, className) {
            const el = resolve(element);
            if (el) el.classList.remove(className);
        },

        /** Show element (restores display, clears .hidden). */
        show(element, display = 'block') {
            const el = resolve(element);
            if (el) {
                el.style.display = display;
                el.classList.remove('hidden');
            }
        },

        /** Hide element. */
        hide(element) {
            const el = resolve(element);
            if (el) {
                el.style.display = 'none';
                el.classList.add('hidden');
            }
        },

        /** Get/set an attribute (get when value is undefined). */
        attr(element, name, value) {
            const el = resolve(element);
            if (!el) return undefined;
            if (value === undefined) return el.getAttribute(name);
            el.setAttribute(name, value);
            return value;
        },

        removeAttr(element, name) {
            const el = resolve(element);
            if (el) el.removeAttribute(name);
        },

        /** Get/set a data attribute (get when value is undefined). */
        data(element, key, value) {
            const el = resolve(element);
            if (!el) return undefined;
            if (value === undefined) return el.dataset[key];
            el.dataset[key] = value;
            return value;
        },

        /** Remove all children. */
        empty(element) {
            const el = resolve(element);
            if (el) el.replaceChildren();
        },

        append(parent, child) {
            const el = resolve(parent);
            if (el && child) el.appendChild(child);
        },

        prepend(parent, child) {
            const el = resolve(parent);
            if (el && child) el.insertBefore(child, el.firstChild);
        },

        remove(element) {
            const el = resolve(element);
            if (el) el.remove();
        },

        /**
         * Fade in via requestAnimationFrame.
         * `display` is the inline display to apply while revealing — the
         * default '' clears any inline value so the STYLESHEET decides
         * (critical for flex/grid containers like #app; forcing 'block'
         * here once severed the app's entire height chain).
         */
        fadeIn(element, duration = 300, display = '') {
            const el = resolve(element);
            if (!el) return;

            el.style.opacity = '0';
            el.style.display = display;

            let start = null;
            const animate = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                el.style.opacity = String(Math.min(progress / duration, 1));
                if (progress < duration) requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
        },

        /** Fade out via requestAnimationFrame, then display:none. */
        fadeOut(element, duration = 300) {
            const el = resolve(element);
            if (!el) return;

            let start = null;
            const animate = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                el.style.opacity = String(Math.max(1 - progress / duration, 0));
                if (progress < duration) {
                    requestAnimationFrame(animate);
                } else {
                    el.style.display = 'none';
                }
            };
            requestAnimationFrame(animate);
        },

        /** Debounce: fire after `wait` ms of silence. */
        debounce(func, wait) {
            let timeout = null;
            return function debounced(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        /** Throttle: fire at most once per `limit` ms. */
        throttle(func, limit) {
            let inFlight = false;
            return function throttled(...args) {
                if (inFlight) return;
                inFlight = true;
                func.apply(this, args);
                setTimeout(() => { inFlight = false; }, limit);
            };
        },

        /**
         * Copy text to the clipboard. Resolves true on success.
         * Uses the async Clipboard API with an execCommand fallback for
         * insecure contexts (file://).
         */
        async copyText(text) {
            const value = String(text ?? '');
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch (_err) { /* fall through to legacy path */ }

            try {
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return ok;
            } catch (_err) {
                return false;
            }
        }
    };

    const HTML_ESCAPES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    const Text = {
        /** Count words (whitespace-delimited). */
        countWords(text) {
            if (!text || typeof text !== 'string') return 0;
            const trimmed = text.trim();
            if (!trimmed) return 0;
            return trimmed.split(/\s+/).length;
        },

        /** Count characters. */
        countChars(text) {
            if (!text || typeof text !== 'string') return 0;
            return text.length;
        },

        /** Count lines. */
        countLines(text) {
            if (!text || typeof text !== 'string') return 0;
            return text.split('\n').length;
        },

        /** Estimated reading time in whole minutes (200 wpm). */
        estimateReadTime(text) {
            return Math.ceil(this.countWords(text) / 200);
        },

        /** Current selection of a textarea/input: { text, start, end }. */
        getSelection(element) {
            if (!element) return { text: '', start: 0, end: 0 };
            const start = element.selectionStart ?? 0;
            const end = element.selectionEnd ?? 0;
            return {
                text: (element.value || '').substring(start, end),
                start,
                end
            };
        },

        /** Replace the current selection and reposition the caret. */
        replaceSelection(element, newText) {
            if (!element) return;

            const start = element.selectionStart ?? 0;
            const end = element.selectionEnd ?? 0;
            const text = element.value || '';

            element.value = text.substring(0, start) + newText + text.substring(end);

            const newPos = start + newText.length;
            element.setSelectionRange(newPos, newPos);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        },

        /** Truncate with suffix. */
        truncate(text, maxLength, suffix = '…') {
            if (!text || text.length <= maxLength) return text || '';
            return text.substring(0, Math.max(0, maxLength - suffix.length)) + suffix;
        },

        /** Escape text for safe HTML interpolation. */
        escapeHtml(text) {
            return String(text ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
        },

        /** Escape a string for literal use inside a RegExp. */
        escapeRegex(text) {
            return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        /** Locale-aware thousands formatting. */
        formatNumber(num) {
            const n = Number(num);
            return Number.isFinite(n) ? n.toLocaleString() : '0';
        },

        /** Count sentences (terminal .!? runs), min 1 for non-empty text. */
        countSentences(text) {
            if (!text || typeof text !== 'string') return 0;
            const matches = text.match(/[.!?]+(\s|$)/g);
            const n = matches ? matches.length : 0;
            return n || (text.trim() ? 1 : 0);
        },

        /** Heuristic syllable count for one word (vowel-group approximation). */
        _syllables(word) {
            const w = word.toLowerCase().replace(/[^a-z]/g, '');
            if (!w) return 0;
            if (w.length <= 3) return 1;
            const groups = w
                .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
                .replace(/^y/, '')
                .match(/[aeiouy]{1,2}/g);
            return groups ? groups.length : 1;
        },

        /**
         * Flesch Reading Ease: 206.835 − 1.015·(words/sentences)
         * − 84.6·(syllables/word). Returns { score, label } or null when
         * there is too little text to score.
         */
        readability(text) {
            const words = text ? text.trim().split(/\s+/).filter(Boolean) : [];
            if (words.length < 5) return null;

            const sentences = Math.max(1, this.countSentences(text));
            const syllables = words.reduce((sum, w) => sum + this._syllables(w), 0);

            const score = Math.round(
                206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length)
            );
            const clamped = Math.max(0, Math.min(100, score));

            const label = clamped >= 90 ? 'Very easy'
                : clamped >= 70 ? 'Easy'
                : clamped >= 60 ? 'Plain'
                : clamped >= 50 ? 'Fairly hard'
                : clamped >= 30 ? 'Hard'
                : 'Very hard';

            return { score: clamped, label };
        }
    };

    window.DOM = DOM;
    window.Text = Text;
})();
