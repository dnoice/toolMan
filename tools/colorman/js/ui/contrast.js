/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ContrastUI (colorMan Edition - v1.0)
 *     - File Name: contrast.js
 *     - Relative Path: tools/colorman/js/ui/contrast.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Contrast pane in the Tools rail: it checks the active color as text
 *     against a background you choose, using the WCAG 2 ratio and APCA, and
 *     shows the pair in a live preview. When the pair falls short it suggests
 *     the nearest passing text or background color, and a palette grid
 *     compares every working color against every other in one view.
 *
 * ✒ Key Features:
 *     - Text color follows the active color, or stays put with "Pin
 *       foreground" while you try other colors
 *     - Background field takes any CSS color, plus Use current, Swap, and
 *       presets for White, Black, Off-white (#F5F0E8), and Near-black (#0E1014)
 *     - Large ratio read-out ("4.62:1", never rounded up past a threshold)
 *       and a pass/fail verdict for the target set in Settings (AA or AAA)
 *     - Badges for AA normal, AA large, AAA normal, AAA large, and UI 3:1,
 *       each with a check or cross as well as a color
 *     - APCA Lc, truncated like the ratio so it never lands in a higher
 *       tier than it shows, with plain guidance: body text, content text,
 *       headlines, large non-text, or insufficient
 *     - Preview: 14px regular text, 24px bold text, and a bordered UI chip
 *       on the background, over a checkerboard when it is translucent
 *     - "Suggest a passing color": the nearest passing text color (Use as
 *       current) and the nearest passing background (Use as background),
 *       hue and chroma kept, updated live while shown
 *     - Palette grid: up to 12 working colors, text rows by background
 *       columns, ratio and pass mark per cell; click a cell to load the pair
 *     - Background, pin, and grid choices persist via State.pane('contrast')
 *
 * ✒ Usage Instructions:
 *     Load after js/color.js, js/state.js, and js/ui/swatch.js. ToolApp.boot
 *     calls ContrastUI.init(), which builds the pane inside #mount-contrast.
 *     Other code can call ContrastUI.setBackground('#0E1014') or
 *     ContrastUI.loadPair(fg, bg) to show a specific pair.
 *
 * ✒ Examples:
 *     ContrastUI.setBackground('white')           → background #FFFFFF
 *     ContrastUI.setBackground('oklch(0.2 0 0)')  → any CSS color is accepted
 *     ContrastUI.swap()                           → text and background trade places
 *     ContrastUI.pin(true)                        → text stays fixed while the picker moves
 *     ContrastUI.suggest()                        → shows the nearest passing colors
 *     ContrastUI.loadPair('#1B2A4A', '#F5F0E8')   → navy text on off-white, 12.53:1
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/color.js (contrast, wcag, apca, ensureContrast,
 *       formatRatio, formatLc, parseDetailed), js/state.js (State),
 *       js/ui/swatch.js (SwatchUI), shared/js/dom.js, toolapp.js, toolman.js
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: a translucent background is measured over white, as
 *       WCAG tools commonly do; APCA guidance uses the simplified Lc
 *       thresholds, not the full font-size lookup table
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const PANE = 'contrast';
    const GRID_MAX = 12;
    const DEFAULT_BG = '#FFFFFF';

    const PRESETS = [
        { id: 'white', label: 'White', hex: '#FFFFFF' },
        { id: 'black', label: 'Black', hex: '#000000' },
        { id: 'offwhite', label: 'Off-white', hex: '#F5F0E8' },
        { id: 'nearblack', label: 'Near-black', hex: '#0E1014' }
    ];

    const LEVELS = [
        { key: 'aaNormal', label: 'AA normal', need: 4.5, title: 'Normal text at AA needs 4.5:1' },
        { key: 'aaLarge', label: 'AA large', need: 3, title: 'Large text (24px, or 18.66px bold) at AA needs 3:1' },
        { key: 'aaaNormal', label: 'AAA normal', need: 7, title: 'Normal text at AAA needs 7:1' },
        { key: 'aaaLarge', label: 'AAA large', need: 4.5, title: 'Large text at AAA needs 4.5:1' },
        { key: 'ui', label: 'UI 3:1', need: 3, title: 'Icons, borders, and other interface parts need 3:1' }
    ];

    const APCA_TIERS = [
        { min: 75, tone: 'pass', label: 'Body text', text: 'Fine for body text (Lc 75 or more).' },
        { min: 60, tone: 'pass', label: 'Content text', text: 'Fine for content text such as labels (Lc 60+). Body text needs 75.' },
        { min: 45, tone: 'warn', label: 'Headlines', text: 'Only for headlines and large text (Lc 45+). Body text needs 75.' },
        { min: 30, tone: 'warn', label: 'Large non-text', text: 'Only for large non-text parts such as icons and thick borders (Lc 30+).' },
        { min: -Infinity, tone: 'fail', label: 'Insufficient', text: 'Too low for text or interface parts (under Lc 30).' }
    ];

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const ICONS = {
        swap: svg('<path d="M7 16V4"></path><path d="m3 8 4-4 4 4"></path><path d="M17 8v12"></path><path d="m21 16-4 4-4-4"></path>'),
        check: svg('<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>', 16)
    };

    const els = {};
    let showSuggest = false;
    let schedule = () => {};

    /* ── Helpers ───────────────────────────────────────────── */

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const engineReady = () => Boolean(window.Color && typeof Color.contrast === 'function'
        && typeof Color.ensureContrast === 'function' && typeof Color.apca === 'function'
        && typeof Color.formatRatio === 'function' && typeof Color.formatLc === 'function');

    const hexOf = (c) => State.hexOf(c) || '';

    function shown(hex) {
        if (!hex) return '';
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    /** WCAG ratios are never rounded up: 4.499 shows as 4.49, not 4.50 (Color.formatRatio). */
    const ratioText = (r, places = 2) => Color.formatRatio(r, places);

    function targetInfo() {
        const aaa = State.settings().contrastTarget === 'AAA';
        return { label: aaa ? 'AAA' : 'AA', ratio: aaa ? 7 : 4.5 };
    }

    function prefs() {
        const p = State.pane(PANE);
        return {
            bg: State.hexOf(typeof p.bg === 'string' ? p.bg : '') || DEFAULT_BG,
            pin: p.pin === true && Boolean(State.hexOf(typeof p.pinned === 'string' ? p.pinned : '')),
            pinned: State.hexOf(typeof p.pinned === 'string' ? p.pinned : '') || null,
            grid: p.grid === true
        };
    }

    function fgColor(p = prefs()) {
        return p.pin ? State.colorOf(p.pinned) : State.getActive();
    }

    function bgColor(p = prefs()) {
        return State.colorOf(p.bg) || State.colorOf(DEFAULT_BG);
    }

    function makeScheduler(section, render) {
        let frame = 0;
        let stale = false;
        const open = () => !section || section.dataset.collapsed !== 'true';
        const run = () => {
            frame = 0;
            if (!open()) { stale = true; return; }
            stale = false;
            render();
        };
        if (section && 'MutationObserver' in window) {
            new MutationObserver(() => { if (stale && open() && !frame) frame = requestAnimationFrame(run); })
                .observe(section, { attributes: true, attributeFilter: ['data-collapsed'] });
        }
        return () => { if (!frame) frame = requestAnimationFrame(run); };
    }

    function chip(hex, size = 'sm') {
        const span = DOM.create('span', {
            className: `swatch${size === 'sm' ? ' swatch--sm' : ''}`,
            attrs: { 'aria-hidden': 'true' }
        });
        if (hex) span.style.setProperty('--c', hex);
        return span;
    }

    function srText(text) {
        return DOM.create('span', { className: 'ta-sr', text });
    }

    function setFeedback(state, text) {
        if (!els.feedback) return;
        if (!state) {
            delete els.feedback.dataset.state;
            els.feedback.textContent = '';
            return;
        }
        els.feedback.dataset.state = state;
        els.feedback.textContent = text;
    }

    function setInputError(msg) {
        els.bgError.textContent = msg || '';
        if (msg) els.bgInput.setAttribute('aria-invalid', 'true');
        else els.bgInput.removeAttribute('aria-invalid');
    }

    /* ── Build ─────────────────────────────────────────────── */

    function build(mount) {
        mount.textContent = '';
        const root = DOM.create('div', { className: 'ta-pane con' });

        // ── Pair: text (foreground) and background ──
        const pair = DOM.create('div', { className: 'con-pair' });

        const fgRow = DOM.create('div', { className: 'con-slot' });
        els.fgChip = chip('', 'md');
        els.fgChip.classList.add('con-slot-chip');
        fgRow.appendChild(els.fgChip);
        const fgBody = DOM.create('div', { className: 'con-slot-body' });
        fgBody.appendChild(DOM.create('span', { className: 'mini-label con-slot-label', text: 'Text' }));
        const fgText = DOM.create('div', { className: 'con-slot-text' });
        els.fgHex = DOM.create('span', { className: 'con-slot-hex' });
        els.fgMeta = DOM.create('span', { className: 'con-slot-meta' });
        fgText.appendChild(els.fgHex);
        fgText.appendChild(els.fgMeta);
        fgBody.appendChild(fgText);
        fgRow.appendChild(fgBody);
        els.pin = DOM.create('button', {
            className: 'chip-btn ta-toggle',
            text: 'Pin foreground',
            attrs: {
                type: 'button',
                'aria-pressed': 'false',
                title: 'Keep this text color while you change the active color'
            }
        });
        fgRow.appendChild(els.pin);
        pair.appendChild(fgRow);

        const bgRow = DOM.create('div', { className: 'con-slot con-slot--bg' });
        els.bgChip = chip('', 'md');
        els.bgChip.classList.add('con-slot-chip');
        bgRow.appendChild(els.bgChip);
        const bgBody = DOM.create('div', { className: 'con-slot-body' });
        bgBody.appendChild(DOM.create('label', { className: 'mini-label con-slot-label', text: 'Background', attrs: { for: 'con-bg-input' } }));
        els.bgInput = DOM.create('input', {
            className: 'text-input mono con-bg-input',
            id: 'con-bg-input',
            attrs: {
                type: 'text',
                spellcheck: 'false',
                autocomplete: 'off',
                placeholder: '#FFFFFF, white, oklch(…)',
                'aria-describedby': 'con-bg-error',
                title: 'Type any CSS color and press Enter'
            }
        });
        bgBody.appendChild(els.bgInput);
        bgRow.appendChild(bgBody);
        pair.appendChild(bgRow);
        els.bgError = DOM.create('p', { className: 'error-text con-bg-error', id: 'con-bg-error', attrs: { role: 'status', 'aria-live': 'polite' } });
        pair.appendChild(els.bgError);

        const tools = DOM.create('div', { className: 'ta-row con-bg-tools' });
        els.useCurrent = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Use current',
            attrs: { type: 'button', title: 'Make the active color the background' }
        });
        els.swap = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            html: `${ICONS.swap}<span>Swap</span>`,
            attrs: { type: 'button', title: 'Trade the text and background colors' }
        });
        tools.appendChild(els.useCurrent);
        tools.appendChild(els.swap);
        pair.appendChild(tools);

        els.presets = DOM.create('div', { className: 'chip-row con-presets', attrs: { role: 'group', 'aria-label': 'Background presets' } });
        PRESETS.forEach((p) => {
            const b = DOM.create('button', {
                className: 'chip-btn con-preset',
                attrs: { type: 'button', 'aria-pressed': 'false', title: `Background ${p.label} ${p.hex}` },
                data: { hex: p.hex }
            });
            b.appendChild(chip(p.hex));
            b.appendChild(DOM.create('span', { text: p.label }));
            els.presets.appendChild(b);
        });
        pair.appendChild(els.presets);
        root.appendChild(pair);

        // ── Result: ratio, verdict, badges, APCA ──
        const result = DOM.create('div', { className: 'con-result', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
        const ratioRow = DOM.create('div', { className: 'con-ratio-row' });
        els.ratio = DOM.create('div', { className: 'con-ratio' });
        els.verdict = DOM.create('span', { className: 'badge con-verdict' });
        ratioRow.appendChild(els.ratio);
        ratioRow.appendChild(els.verdict);
        result.appendChild(ratioRow);
        els.badges = DOM.create('div', { className: 'con-badges' });
        els.badgeEls = LEVELS.map((lv) => {
            const b = DOM.create('span', { className: 'badge', attrs: { title: lv.title } });
            els.badges.appendChild(b);
            return b;
        });
        result.appendChild(els.badges);

        const apca = DOM.create('div', { className: 'con-apca' });
        const apcaHead = DOM.create('div', { className: 'con-apca-head' });
        apcaHead.appendChild(DOM.create('span', { className: 'mini-label', text: 'APCA', attrs: { title: 'Accessible Perceptual Contrast Algorithm, the candidate method for WCAG 3' } }));
        els.apcaValue = DOM.create('span', { className: 'con-apca-value' });
        els.apcaBadge = DOM.create('span', { className: 'badge' });
        apcaHead.appendChild(els.apcaValue);
        apcaHead.appendChild(els.apcaBadge);
        apca.appendChild(apcaHead);
        els.apcaText = DOM.create('p', { className: 'ta-note con-apca-text' });
        apca.appendChild(els.apcaText);
        result.appendChild(apca);
        root.appendChild(result);

        // ── Preview ──
        const preview = DOM.create('div', { className: 'con-preview checker' });
        els.previewFill = DOM.create('div', {
            className: 'con-preview-fill',
            attrs: { role: 'img' }
        });
        els.previewFill.appendChild(DOM.create('p', {
            className: 'con-sample-sm',
            text: 'Body text at 14px. The quick brown fox jumps over the lazy dog.',
            attrs: { 'aria-hidden': 'true' }
        }));
        els.previewFill.appendChild(DOM.create('p', {
            className: 'con-sample-lg',
            text: 'Bold 24px heading',
            attrs: { 'aria-hidden': 'true' }
        }));
        els.previewFill.appendChild(DOM.create('span', {
            className: 'con-sample-ui',
            html: `${ICONS.check}<span>UI chip</span>`,
            attrs: { 'aria-hidden': 'true' }
        }));
        preview.appendChild(els.previewFill);
        root.appendChild(preview);
        els.translucent = DOM.create('p', { className: 'ta-note con-translucent' });
        els.translucent.hidden = true;
        root.appendChild(els.translucent);

        // ── Suggest ──
        const suggestBar = DOM.create('div', { className: 'ta-row con-actions' });
        els.suggestBtn = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Suggest a passing color',
            attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'con-suggest' }
        });
        els.gridToggle = DOM.create('button', {
            className: 'chip-btn ta-toggle',
            text: 'Palette grid',
            attrs: {
                type: 'button',
                'aria-pressed': 'false',
                'aria-controls': 'con-grid',
                title: 'Compare every working palette color as text on every other as background'
            }
        });
        suggestBar.appendChild(els.suggestBtn);
        suggestBar.appendChild(els.gridToggle);
        root.appendChild(suggestBar);

        els.suggest = DOM.create('div', { className: 'con-suggest', id: 'con-suggest', attrs: { 'aria-live': 'polite' } });
        els.suggest.hidden = true;
        root.appendChild(els.suggest);

        els.feedback = DOM.create('div', { className: 'tool-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        root.appendChild(els.feedback);

        // ── Palette grid ──
        els.grid = DOM.create('div', { className: 'con-grid-block', id: 'con-grid' });
        els.grid.hidden = true;
        root.appendChild(els.grid);

        mount.appendChild(root);
        els.root = root;
    }

    /* ── Wiring ────────────────────────────────────────────── */

    function applyBgInput() {
        const raw = els.bgInput.value.trim();
        if (!raw) {
            setInputError('Type a background color first, such as #FFFFFF, white, or rgb(255 255 255).');
            return false;
        }
        let color = null;
        let clipped = false;
        try {
            const detail = Color.parseDetailed(raw);
            if (detail) {
                color = detail.color;
                clipped = Boolean(detail.clipped);
            }
        } catch (_err) { color = null; }
        if (!color) color = State.colorOf(raw);
        if (!color) {
            const short = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
            setInputError(`Couldn't read “${short}” as a color. Try #FFFFFF, white, or rgb(255 255 255).`);
            return false;
        }
        ContrastUI.setBackground(color);
        setInputError(clipped ? 'That color is outside what screens show (sRGB), so it was brought into range.' : '');
        return true;
    }

    function wire() {
        DOM.on(els.pin, 'click', () => ContrastUI.pin(!prefs().pin));

        DOM.on(els.bgInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyBgInput();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                els.bgInput.value = shown(prefs().bg);
                setInputError('');
            }
        });
        DOM.on(els.bgInput, 'change', applyBgInput);

        DOM.on(els.useCurrent, 'click', () => {
            ContrastUI.setBackground(State.getActive());
            setFeedback('info', `Background is now the active color, ${shown(prefs().bg)}.`);
        });
        DOM.on(els.swap, 'click', () => ContrastUI.swap());

        DOM.on(els.presets, 'click', (e) => {
            const b = e.target.closest('.con-preset');
            if (b) ContrastUI.setBackground(b.dataset.hex);
        });

        DOM.on(els.suggestBtn, 'click', () => {
            if (showSuggest) ContrastUI.hideSuggestions();
            else ContrastUI.suggest();
        });
        DOM.on(els.suggest, 'click', (e) => {
            const btn = e.target.closest('[data-use]');
            if (!btn) return;
            const hex = btn.dataset.hex;
            if (btn.dataset.use === 'text') useAsText(hex, btn);
            else useAsBackground(hex, btn);
        });

        DOM.on(els.gridToggle, 'click', () => ContrastUI.showGrid(!prefs().grid));
        DOM.on(els.grid, 'click', (e) => {
            const cell = e.target.closest('.con-cell');
            if (cell) ContrastUI.loadPair(cell.dataset.fg, cell.dataset.bg);
        });
    }

    function useAsText(hex, btn) {
        const p = prefs();
        if (p.pin) State.setPane(PANE, { pinned: hex });
        const changed = State.setActive(hex, { source: 'contrast' });
        if (window.ToolApp && btn) ToolApp.flash(btn);
        const ratio = Color.contrast(State.colorOf(hex), bgColor());
        setFeedback('success', `Text color is now ${shown(hex)} (${ratioText(ratio)}:1).${!changed && !p.pin ? ' It was already the active color.' : ''}`);
        schedule();
    }

    function useAsBackground(hex, btn) {
        ContrastUI.setBackground(hex);
        if (window.ToolApp && btn) ToolApp.flash(btn);
        const ratio = Color.contrast(fgColor(), State.colorOf(hex));
        setFeedback('success', `Background is now ${shown(hex)} (${ratioText(ratio)}:1).`);
    }

    /* ── Render ────────────────────────────────────────────── */

    function renderPair(p, fg, bg) {
        const fgHex = hexOf(fg);
        const bgHex = p.bg;
        els.fgChip.style.setProperty('--c', fgHex);
        els.fgHex.textContent = shown(fgHex);
        els.fgMeta.textContent = p.pin ? 'Pinned — the picker leaves it alone' : 'Active color';
        els.pin.setAttribute('aria-pressed', String(p.pin));
        els.pin.title = p.pin
            ? 'Unpin: let the text color follow the active color again'
            : 'Keep this text color while you change the active color';

        els.bgChip.style.setProperty('--c', bgHex);
        if (document.activeElement !== els.bgInput) els.bgInput.value = shown(bgHex);

        Array.from(els.presets.children).forEach((b) => {
            b.setAttribute('aria-pressed', String(b.dataset.hex === bgHex));
        });

        const activeHex = hexOf(State.getActive());
        els.useCurrent.disabled = activeHex === bgHex;
        els.useCurrent.title = els.useCurrent.disabled
            ? 'The background already is the active color'
            : `Make the active color (${shown(activeHex)}) the background`;
        els.swap.disabled = fgHex === bgHex;
    }

    function renderResult(p, fg, bg) {
        const ratio = Color.contrast(fg, bg);
        const text = ratioText(ratio);
        const levels = Color.wcag(ratio);
        const t = targetInfo();
        const passes = ratio + 1e-9 >= t.ratio;

        els.ratio.textContent = `${text}:1`;
        els.ratio.setAttribute('aria-label', `Contrast ratio ${text} to 1`);
        els.verdict.dataset.tone = passes ? 'pass' : 'fail';
        els.verdict.textContent = passes ? `Passes ${t.label}` : `Fails ${t.label}`;
        els.verdict.title = `${t.label} needs ${t.ratio}:1 for normal text (change the target in Settings)`;

        LEVELS.forEach((lv, i) => {
            const ok = Boolean(levels[lv.key]);
            const b = els.badgeEls[i];
            b.dataset.tone = ok ? 'pass' : 'fail';
            b.textContent = '';
            b.appendChild(document.createTextNode(lv.label));
            b.appendChild(srText(ok ? ' passes' : ' fails'));
        });

        const lc = Color.apca(fg, bg);
        const abs = Math.abs(lc);
        // Judged with the same tolerance the read-out truncates with, so
        // "Lc 44.9" is never filed under the Lc 45 tier, nor 45.0 under 30.
        const tier = APCA_TIERS.find((tr) => abs + 1e-9 >= tr.min);
        const lcText = Color.formatLc(lc);
        els.apcaValue.textContent = `Lc ${lcText}`;
        els.apcaBadge.dataset.tone = tier.tone;
        els.apcaBadge.textContent = tier.label;
        const polarity = abs < 0.05 ? '' : (lc > 0 ? ' Dark text on a light background.' : ' Light text on a dark background.');
        els.apcaText.textContent = `${tier.text}${polarity}`;

        els.previewFill.style.setProperty('--con-fg', hexOf(fg));
        els.previewFill.style.setProperty('--con-bg', p.bg);
        els.previewFill.setAttribute('aria-label', `Preview of ${shown(hexOf(fg))} text on ${shown(p.bg)}: ${text} to 1`);

        const bgAlpha = bg.a < 1;
        const fgAlpha = fg.a < 1;
        els.translucent.hidden = !(bgAlpha || fgAlpha);
        if (bgAlpha || fgAlpha) {
            const parts = [];
            if (bgAlpha) parts.push('The background is translucent, so it is measured over white.');
            if (fgAlpha) parts.push('The text is translucent, so it is blended over the background first.');
            els.translucent.textContent = parts.join(' ');
        }
        return { ratio, passes, target: t };
    }

    function suggestionRow(kind, title, color, ratio, target, from) {
        const hex = hexOf(color);
        const ok = ratio + 1e-9 >= target.ratio;
        const row = DOM.create('div', { className: 'con-suggest-row' });
        const sample = DOM.create('span', { className: 'con-suggest-sample checker', attrs: { 'aria-hidden': 'true' } });
        const fill = DOM.create('span', { className: 'con-suggest-fill', text: 'Aa' });
        const fgHex = kind === 'text' ? hex : hexOf(fgColor());
        const bgHex = kind === 'text' ? prefs().bg : hex;
        fill.style.setProperty('--con-fg', fgHex);
        fill.style.setProperty('--con-bg', bgHex);
        sample.appendChild(fill);
        row.appendChild(sample);

        const info = DOM.create('div', { className: 'con-suggest-info' });
        info.appendChild(DOM.create('span', { className: 'con-suggest-title', text: title }));
        const line = DOM.create('span', { className: 'con-suggest-hex' });
        line.textContent = `${shown(hex)} · ${ratioText(ratio)}:1`;
        info.appendChild(line);
        let note = from && from !== hex ? `from ${shown(from)}` : '';
        if (note && (hex === '#000000' || hex === '#FFFFFF')) note += ' (its hue cannot reach the target, so this is plain black or white)';
        if (!ok) note = `Closest possible, still short of ${target.label} ${target.ratio}:1.`;
        if (note) info.appendChild(DOM.create('span', { className: 'con-suggest-note', text: note }));
        row.appendChild(info);
        row.dataset.ok = String(ok);

        const btn = DOM.create('button', {
            className: 'btn btn-secondary btn-sm',
            text: kind === 'text' ? 'Use as current' : 'Use as background',
            attrs: {
                type: 'button',
                title: kind === 'text'
                    ? `Make ${shown(hex)} the active color${prefs().pin ? ' and the pinned text color' : ''}`
                    : `Make ${shown(hex)} the background`
            },
            data: { use: kind, hex }
        });
        if (!ok) {
            btn.disabled = true;
            btn.title = `${shown(hex)} would not reach ${target.label} either`;
        }
        info.appendChild(btn);
        return row;
    }

    function renderSuggest(p, fg, bg, res) {
        els.suggestBtn.setAttribute('aria-expanded', String(showSuggest));
        els.suggestBtn.textContent = showSuggest ? 'Hide suggestions' : 'Suggest a passing color';
        els.suggest.hidden = !showSuggest;
        if (!showSuggest) return;
        els.suggest.textContent = '';
        const t = res.target;
        if (res.passes) {
            els.suggest.appendChild(DOM.create('p', {
                className: 'ta-note con-suggest-ok',
                text: `This pair already passes ${t.label} (${t.ratio}:1) for normal text, so no change is needed.`
            }));
            return;
        }
        const textFix = Color.ensureContrast(fg, bg, t.ratio);
        const textRatio = Color.contrast(textFix.color, bg);
        const bgFix = Color.ensureContrast(bg, fg, t.ratio);
        const bgRatio = Color.contrast(fg, bgFix.color);
        const reach = (r) => r + 1e-9 >= t.ratio;
        els.suggest.appendChild(DOM.create('p', {
            className: 'ta-note',
            text: reach(textRatio) || reach(bgRatio)
                ? `Nearest colors that reach ${t.label} (${t.ratio}:1), keeping the hue and chroma where possible:`
                : `Neither the text nor the background can reach ${t.label} (${t.ratio}:1) against the other. These are the closest each can get; try a lighter or darker partner color.`
        }));
        els.suggest.appendChild(suggestionRow('text', 'New text color', textFix.color, textRatio, t, hexOf(fg)));
        els.suggest.appendChild(suggestionRow('background', 'New background', bgFix.color, bgRatio, t, p.bg));
    }

    function renderGrid(p, fg) {
        els.gridToggle.setAttribute('aria-pressed', String(p.grid));
        els.grid.hidden = !p.grid;
        if (!p.grid) return;
        els.grid.textContent = '';

        const w = State.working();
        const colors = w.colors.slice(0, GRID_MAX);
        if (colors.length < 2) {
            els.grid.appendChild(DOM.create('div', {
                className: 'empty-state ta-empty',
                children: [
                    DOM.create('p', { className: 'empty-title', text: 'Not enough colors to compare' }),
                    DOM.create('p', {
                        className: 'empty-text',
                        text: colors.length
                            ? 'Add one more color to the working palette (the + button or the A key) to compare pairs here.'
                            : 'Add two or more colors to the working palette (the + button or the A key) to compare every pair here.'
                    })
                ]
            }));
            return;
        }

        const t = targetInfo();
        const fgHex = hexOf(fg);
        const wrap = DOM.create('div', { className: 'table-wrap con-grid-wrap' });
        const table = DOM.create('table', { className: 'con-grid' });
        table.appendChild(DOM.create('caption', {
            className: 'ta-sr',
            text: `Contrast of each working palette color as text (rows) on each as background (columns), checked against ${t.label} ${t.ratio}:1`
        }));
        const thead = DOM.create('thead');
        const headRow = DOM.create('tr');
        headRow.appendChild(DOM.create('th', {
            className: 'con-grid-corner',
            attrs: { scope: 'col' },
            html: '<span aria-hidden="true">Text ↓ Bg →</span><span class="ta-sr">Text color, then backgrounds</span>'
        }));
        colors.forEach((c, j) => {
            const th = DOM.create('th', { attrs: { scope: 'col', title: `Background ${j + 1}: ${shown(c.hex)}${c.name ? ` (${c.name})` : ''}` } });
            th.appendChild(chip(c.hex));
            th.appendChild(srText(`Background ${shown(c.hex)}`));
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = DOM.create('tbody');
        colors.forEach((rowC) => {
            const tr = DOM.create('tr');
            const th = DOM.create('th', { attrs: { scope: 'row', title: `Text ${shown(rowC.hex)}${rowC.name ? ` (${rowC.name})` : ''}` } });
            th.appendChild(chip(rowC.hex));
            th.appendChild(srText(`Text ${shown(rowC.hex)}`));
            tr.appendChild(th);
            const rc = State.colorOf(rowC.hex);
            colors.forEach((colC) => {
                const td = DOM.create('td');
                if (rowC.hex === colC.hex) {
                    td.appendChild(DOM.create('span', { className: 'con-cell-same', text: '—', attrs: { title: 'Same color' } }));
                    td.appendChild(srText('Same color'));
                    tr.appendChild(td);
                    return;
                }
                const r = Color.contrast(rc, State.colorOf(colC.hex));
                const ok = r + 1e-9 >= t.ratio;
                const cell = DOM.create('button', {
                    className: 'con-cell',
                    attrs: {
                        type: 'button',
                        'aria-label': `${shown(rowC.hex)} text on ${shown(colC.hex)}: ${ratioText(r, 1)} to 1, ${ok ? 'passes' : 'fails'} ${t.label}. Load this pair.`,
                        title: `${shown(rowC.hex)} on ${shown(colC.hex)} · ${ratioText(r)}:1 · ${ok ? 'passes' : 'fails'} ${t.label}`
                    },
                    data: { fg: rowC.hex, bg: colC.hex, tone: ok ? 'pass' : 'fail' }
                });
                if (rowC.hex === fgHex && colC.hex === p.bg) cell.dataset.active = 'true';
                const sample = DOM.create('span', { className: 'con-cell-sample', text: 'Aa', attrs: { 'aria-hidden': 'true' } });
                sample.style.setProperty('--con-fg', rowC.hex);
                sample.style.setProperty('--con-bg', colC.hex);
                cell.appendChild(sample);
                cell.appendChild(DOM.create('span', {
                    className: 'con-cell-ratio',
                    text: `${ratioText(r, 1)}${ok ? '✓' : '✕'}`,
                    attrs: { 'aria-hidden': 'true' }
                }));
                td.appendChild(cell);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        els.grid.appendChild(wrap);

        const legend = w.colors.length > GRID_MAX
            ? `Showing the first ${GRID_MAX} of ${w.colors.length} working colors. `
            : '';
        els.grid.appendChild(DOM.create('p', {
            className: 'ta-note con-grid-legend',
            text: `${legend}Rows are text, columns are backgrounds. ✓ reaches ${t.label} (${t.ratio}:1), ✕ does not. Click a cell to check that pair.`
        }));
    }

    function render() {
        if (!els.root) return;
        const p = prefs();
        const fg = fgColor(p) || State.getActive();
        const bg = bgColor(p);
        renderPair(p, fg, bg);
        const res = renderResult(p, fg, bg);
        renderSuggest(p, fg, bg, res);
        renderGrid(p, fg);
    }

    /* ── Public API ────────────────────────────────────────── */

    const ContrastUI = {
        init() {
            const mount = DOM.id('mount-contrast');
            if (!mount) return;
            if (!engineReady()) {
                mount.textContent = '';
                mount.appendChild(DOM.create('div', {
                    className: 'empty-state ta-empty',
                    children: [
                        DOM.create('p', { className: 'empty-title', text: 'Contrast is unavailable' }),
                        DOM.create('p', { className: 'empty-text', text: 'The color engine (js/color.js) did not load. Reload the page to try again.' })
                    ]
                }));
                return;
            }
            build(mount);
            wire();
            schedule = makeScheduler(mount.closest('.tool-section'), render);

            State.on('active', ({ source } = {}) => {
                // A message about the old pair is stale once the picker moves the text color.
                if (source !== 'contrast' && !prefs().pin) setFeedback(null);
                schedule();
            });
            State.on('working', () => { if (prefs().grid) schedule(); });
            State.on('settings', schedule);
            State.on('reset', () => {
                showSuggest = false;
                setFeedback(null);
                setInputError('');
                schedule();
            });
            render();
        },

        refresh() {
            render();
        },

        /** Background from any accepted color input. Returns the stored hex, or null. */
        setBackground(input) {
            const hex = State.hexOf(input);
            if (!hex) return null;
            State.setPane(PANE, { bg: hex });
            setInputError('');
            if (els.root) {
                if (document.activeElement === els.bgInput) els.bgInput.value = shown(hex);
                render();
            }
            return hex;
        },

        /** Pin (true) or unpin (false) the text color. Pinning keeps the current text color. */
        pin(on) {
            if (on) {
                const hex = hexOf(fgColor());
                State.setPane(PANE, { pin: true, pinned: hex });
                setFeedback('info', `Text color pinned at ${shown(hex)}. The picker no longer changes it.`);
            } else {
                State.setPane(PANE, { pin: false });
                setFeedback('info', 'Text color follows the active color again.');
            }
            render();
            return Boolean(on);
        },

        /** Trade text and background. Unpinned, this changes the active color. */
        swap() {
            const p = prefs();
            const fgHex = hexOf(fgColor(p));
            const bgHex = p.bg;
            if (fgHex === bgHex) {
                setFeedback('info', 'Text and background are the same color, so there is nothing to swap.');
                return false;
            }
            if (p.pin) {
                State.setPane(PANE, { pinned: bgHex, bg: fgHex });
            } else {
                State.setPane(PANE, { bg: fgHex });
                State.setActive(bgHex, { source: 'contrast' });
            }
            setFeedback('info', `Swapped: ${shown(bgHex)} text on ${shown(fgHex)}.`);
            render();
            return true;
        },

        /** Show the nearest passing text and background colors (updates live). */
        suggest() {
            showSuggest = true;
            render();
            return true;
        },

        hideSuggestions() {
            showSuggest = false;
            render();
        },

        /** Show or hide the working palette contrast grid. Persists. */
        showGrid(on) {
            State.setPane(PANE, { grid: Boolean(on) });
            render();
            return Boolean(on);
        },

        /** Load a text/background pair: the text becomes the active (or pinned) color. */
        loadPair(fgInput, bgInput) {
            const fg = State.hexOf(fgInput);
            const bg = State.hexOf(bgInput);
            if (!fg || !bg) {
                notify('That pair could not be read as two colors.', 'warning', 3000);
                return false;
            }
            const p = prefs();
            if (p.pin) State.setPane(PANE, { pinned: fg, bg });
            else {
                State.setPane(PANE, { bg });
                State.setActive(fg, { source: 'contrast' });
            }
            const r = Color.contrast(State.colorOf(fg), State.colorOf(bg));
            setFeedback('info', `Checking ${shown(fg)} text on ${shown(bg)}: ${ratioText(r)}:1.`);
            render();
            return true;
        },

        /** Current measurement, for other panes or tests. */
        measure() {
            const p = prefs();
            const fg = fgColor(p);
            const bg = bgColor(p);
            const ratio = Color.contrast(fg, bg);
            return { fg: hexOf(fg), bg: p.bg, ratio, apca: Color.apca(fg, bg), levels: Color.wcag(ratio) };
        }
    };

    window.ContrastUI = ContrastUI;
})();
