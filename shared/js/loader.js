/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: LoaderController (toolMan Edition - v2.1)
 *     - File Name: loader.js
 *     - Relative Path: shared/js/loader.js
 *     - Artifact Type: library
 *     - Version: 2.1.0
 *     - Date: 2026-07-22
 *     - Update: Wednesday, July 22, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude Opus 4.8
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Changelog:
 *     - 2.1.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Made the sequence
 *       deliberate: a MIN_DISPLAY_MS (3200ms) hold keeps the loader on screen
 *       for a ~3.5s branded beat even when boot finishes instantly, the
 *       progress ramp is repaced to fill ~90% over roughly 2.6s, the message
 *       cycle tightened to 1600ms so two messages land before "Ready!", and
 *       the Ready beat lengthened to 450ms. Reduced-motion users skip the
 *       hold entirely and hand off as fast as boot allows.
 *     - 2.0.0 (2026-07-22) [Anthropic - Claude Opus 4.8] — Relocated to
 *       shared/js/ for the toolMan ecosystem and hardened: added a fail-safe
 *       timeout that force-completes the loader if the app never reports
 *       ready (the exact failure mode that used to strand users on the load
 *       screen), configurable status messages, guarded double-init,
 *       reduced-motion support, and full timer cleanup on hide.
 *     - 1.0.0 (2025-11-18) [model not recorded] — Initial loading screen
 *       with progress bar and rotating status messages.
 *
 * ✒ Description:
 *     Controls the branded loading screen shared by the hub and every tool.
 *     Runs a deliberate ~3.5-second sequence — paced progress ramp, two
 *     rotating status messages, a held "Ready!" beat — before fading to the
 *     main UI, regardless of how fast boot actually finished. A fail-safe
 *     timer guarantees the loader always resolves even if initialization
 *     throws; reduced-motion users skip the ceremony and hand off promptly.
 *
 * ✒ Key Features:
 *     - Deliberate pacing: MIN_DISPLAY_MS (3200ms) minimum on-screen time —
 *       complete() calls arriving early are held, never dropped
 *     - Paced progress ramp: ~90% over ~2.6s, parking until completion
 *     - Rotating status messages every 1600ms with fade transitions
 *       (configurable per tool)
 *     - Held "Ready!" beat (450ms) before the fade-out
 *     - Fail-safe: force-completes after 8s if the app never reports ready
 *     - Reduced-motion aware: skips fades AND the minimum-display hold
 *     - Idempotent init/complete — safe to call more than once
 *     - Full timer cleanup; loader node removed from the DOM after handoff
 *
 * ✒ Usage Instructions:
 *     Markup requires #loader-screen, #loader-progress, #loader-status, and
 *     a #app container. Optionally set custom messages before init:
 *         Loader.messages = ['Mixing pigments…', 'Calibrating swatches…'];
 *     Then the boot sequence calls Loader.complete() when ready — the loader
 *     itself guarantees the minimum display time.
 *
 * ✒ Examples:
 *     Loader.init()             → auto-runs on DOM ready; no-op when the
 *                                 page has no #loader-screen markup
 *     Loader.messages = ['Mixing pigments…', 'Calibrating swatches…']
 *                               → per-tool status copy (set before DOM ready)
 *     Loader.complete()         → finish the ramp, 'Ready!', fade out —
 *                                 after the minimum display time has passed
 *     Loader.show()             → re-display and restart the full sequence
 *     Loader.updateProgress(45) → set the progress bar width directly
 *     Loader.completed          → true once the handoff has happened
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/dom.js (window.DOM)
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: the fail-safe interval is FAILSAFE_MS (8000) and must
 *       stay comfortably above MIN_DISPLAY_MS (3200); after the loader node
 *       is removed post-handoff, show() fails soft and a full page reload is
 *       the honest path
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const FAILSAFE_MS = 8000;
    const MIN_DISPLAY_MS = 3200;   // the deliberate on-screen beat
    const MESSAGE_CYCLE_MS = 1600; // two messages land inside the sequence
    const READY_BEAT_MS = 450;     // how long "Ready!" holds before the fade

    const Loader = {
        el: null,
        progressBar: null,
        statusEl: null,
        progress: 0,
        completed: false,

        messages: [
            'Loading your workspace…',
            'Restoring last session…',
            'Sharpening the pen…',
            'Loading templates and snippets…',
            'Preparing tools…',
            'Almost ready…'
        ],

        messageIndex: 0,
        messageTimer: null,
        progressTimer: null,
        failsafeTimer: null,
        holdTimer: null,
        _initialized: false,
        _completePending: false,
        _startedAt: 0,

        _reducedMotion() {
            return Boolean(window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        },

        /** Initialize loader (idempotent). */
        init() {
            if (this._initialized) return;

            this.el = DOM.id('loader-screen');
            this.progressBar = DOM.id('loader-progress');
            this.statusEl = DOM.id('loader-status');

            if (!this.el || !this.progressBar || !this.statusEl) {
                // No loader on this page — nothing to do.
                return;
            }

            this._initialized = true;
            this._startedAt = Date.now();
            this.startMessageCycle();
            this.animateProgress();

            // Fail-safe: never strand the user behind the loader. If the app
            // hasn't called complete() by now, force the handoff.
            this.failsafeTimer = setTimeout(() => {
                if (!this.completed) {
                    console.warn(`[Loader] App did not report ready within ${FAILSAFE_MS}ms — forcing completion`);
                    this.complete();
                }
            }, FAILSAFE_MS);
        },

        /** Cycle through status messages. */
        startMessageCycle() {
            const reducedMotion = this._reducedMotion();

            this.stopMessageCycle();
            this.messageTimer = setInterval(() => {
                this.messageIndex = (this.messageIndex + 1) % this.messages.length;

                if (reducedMotion) {
                    this.statusEl.textContent = this.messages[this.messageIndex];
                    return;
                }

                this.statusEl.style.opacity = '0';
                setTimeout(() => {
                    this.statusEl.textContent = this.messages[this.messageIndex];
                    this.statusEl.style.opacity = '1';
                }, 150);
            }, MESSAGE_CYCLE_MS);
        },

        stopMessageCycle() {
            if (this.messageTimer) {
                clearInterval(this.messageTimer);
                this.messageTimer = null;
            }
        },

        /**
         * Simulated progress: a paced, deliberate ramp — roughly 90% over
         * ~2.6 seconds — that parks until complete() lands.
         */
        animateProgress() {
            const increment = () => {
                if (this.completed) return;
                if (this.progress < 90) {
                    this.progress += 5 + Math.random() * 5;      // 5–10% per step
                    this.updateProgress(Math.min(this.progress, 90));
                    this.progressTimer = setTimeout(increment, 160 + Math.random() * 120);
                }
            };
            increment();
        },

        updateProgress(percent) {
            if (this.progressBar) {
                this.progressBar.style.width = `${percent}%`;
            }
        },

        /**
         * Complete loading (idempotent). Boot code calls this whenever it is
         * ready; the loader holds the handoff until the deliberate minimum
         * display time has passed. Reduced-motion users skip the hold.
         */
        complete() {
            if (this.completed || this._completePending || !this._initialized) return;

            const elapsed = Date.now() - this._startedAt;
            const remaining = this._reducedMotion()
                ? 0
                : Math.max(0, MIN_DISPLAY_MS - elapsed);

            if (remaining > 0) {
                this._completePending = true;
                this.holdTimer = setTimeout(() => {
                    this._completePending = false;
                    this._finishComplete();
                }, remaining);
                return;
            }

            this._finishComplete();
        },

        /** The actual completion: fill the bar, hold "Ready!", fade out. */
        _finishComplete() {
            if (this.completed) return;
            this.completed = true;

            if (this.failsafeTimer) {
                clearTimeout(this.failsafeTimer);
                this.failsafeTimer = null;
            }
            if (this.progressTimer) {
                clearTimeout(this.progressTimer);
                this.progressTimer = null;
            }
            if (this.holdTimer) {
                clearTimeout(this.holdTimer);
                this.holdTimer = null;
            }

            this.progress = 100;
            this.updateProgress(100);
            this.statusEl.textContent = 'Ready!';
            this.stopMessageCycle();

            setTimeout(() => this.hide(), READY_BEAT_MS);
        },

        /** Fade out the loader and reveal the app. */
        hide() {
            if (!this.el) return;

            this.el.classList.add('fade-out');

            const app = DOM.id('app');
            if (app) {
                app.style.display = '';
                DOM.fadeIn(app, 400);
            }

            setTimeout(() => {
                if (this.el) {
                    this.el.remove();
                    this.el = null;
                }
            }, 500);
        },

        /** Re-display the loader and restart the full deliberate sequence. */
        show() {
            // If the node was removed after a previous handoff, re-init fails
            // soft — a full page reload is the honest path at that point.
            this.el = this.el || DOM.id('loader-screen');
            if (!this.el) return;

            this.completed = false;
            this._completePending = false;
            this._startedAt = Date.now();
            this.el.style.opacity = '1';
            this.el.style.display = 'flex';
            this.el.classList.remove('fade-out');

            const app = DOM.id('app');
            if (app) app.style.opacity = '0';

            this.progress = 0;
            this.updateProgress(0);
            this.messageIndex = 0;
            this.statusEl.textContent = this.messages[0];

            this.startMessageCycle();
            this.animateProgress();
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Loader.init());
    } else {
        Loader.init();
    }

    window.Loader = Loader;
})();
