/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: SwatchUI (colorMan Edition - v1.0)
 *     - File Name: swatch.js
 *     - Relative Path: tools/colorman/js/ui/swatch.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The one swatch builder every colorMan pane uses, so a color chip looks
 *     and behaves the same in the library, the picker, and the tools. It
 *     returns real buttons with a readable name, a checkerboard under
 *     translucent colors, and a ring plus a check mark for the selected
 *     state, and a compact non-interactive strip for palette previews.
 *
 * ✒ Key Features:
 *     - SwatchUI.create(): a <button class="swatch"> with aria-label
 *       "{name} {hex}", a tooltip, and click / double-click handlers
 *     - Sizes sm (20px), md (32px), lg (56px) via .swatch--sm / .swatch--lg
 *     - Selected state is a gold ring and a check mark drawn in black or
 *       white, whichever reads better on the color, so color is never the
 *       only signal
 *     - Colors travel as the --c custom property; the stylesheet layers them
 *       over a neutral checkerboard so alpha is visible
 *     - SwatchUI.strip(): preview row of up to `max` colors plus a "+N"
 *       overflow chip, announced once as a single image to screen readers
 *     - SwatchUI.update(): recolor, rename, or reselect an existing swatch
 *     - SwatchUI.textOn(): black or white text for any color (WCAG
 *       luminance; uses window.Color when it is loaded)
 *     - Invalid colors never throw: they render as an empty, labelled chip
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js and before the pane modules. Build swatches in
 *     a module's render function and append them to its mount; wrap a list
 *     in .swatch-grid (wrapping grid) or .swatch-strip (flex row).
 *
 * ✒ Examples:
 *     SwatchUI.create({ hex: '#C9A84C', name: 'Identity gold', onClick: pick })
 *     SwatchUI.create({ hex: '#1B2A4A80', size: 'lg', selected: true })
 *     SwatchUI.strip(['#1B2A4A', '#C9A84C', '#F5F0E8'], { size: 'sm', max: 8 })
 *     SwatchUI.strip(hexes, { joined: true })      → flush color bar
 *     SwatchUI.update(btn, { hex: '#E8C878', selected: false })
 *     SwatchUI.textOn('#1B2A4A')                   → '#FFFFFF'
 *
 * ✒ Other Important Information:
 *     - Dependencies: css/colorman.css (.swatch, .swatch-grid, .swatch-strip);
 *       optional window.Color and window.State for parsing non-hex input
 *     - Compatible platforms: all evergreen browsers
 *     - Limitations: strip() swatches are previews (spans), not buttons; use
 *       create() when each color must be clickable
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    /** '#RRGGBB' / '#RRGGBBAA' (upper) from any accepted input, or ''. */
    function normalize(input) {
        if (window.State && typeof State.hexOf === 'function') return State.hexOf(input) || '';
        if (typeof input !== 'string') return '';
        let s = input.trim().replace(/^#/, '');
        if (!/^[0-9a-f]+$/i.test(s)) return '';
        if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
        if (s.length !== 6 && s.length !== 8) return '';
        s = s.toUpperCase();
        return `#${s.length === 8 && s.endsWith('FF') ? s.slice(0, 6) : s}`;
    }

    function channels(hex) {
        const n = hex.slice(1);
        const byte = (i) => parseInt(n.slice(i, i + 2), 16) / 255;
        return { r: byte(0), g: byte(2), b: byte(4), a: n.length === 8 ? byte(6) : 1 };
    }

    function luminance({ r, g, b }) {
        const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }

    /** '#000000' or '#FFFFFF', whichever has the higher WCAG contrast on the color. */
    function textOn(input) {
        const hex = normalize(input);
        if (!hex) return '#000000';
        if (window.Color && typeof Color.textOn === 'function') {
            try {
                const out = Color.textOn(Color.parse ? Color.parse(hex) : channels(hex));
                if (out === '#000000' || out === '#FFFFFF') return out;
            } catch (_err) { /* use the built-in rule */ }
        }
        const c = channels(hex);
        // Translucent colors sit on the light checkerboard: judge them over white.
        const over = { r: c.r * c.a + (1 - c.a), g: c.g * c.a + (1 - c.a), b: c.b * c.a + (1 - c.a) };
        const L = luminance(over);
        const onBlack = (L + 0.05) / 0.05;
        const onWhite = 1.05 / (L + 0.05);
        return onBlack >= onWhite ? '#000000' : '#FFFFFF';
    }

    function labelFor(name, hex) {
        if (!hex) return name ? `${name} (no valid color)` : 'No valid color';
        return name ? `${name} ${hex}` : hex;
    }

    function paint(el, hex) {
        if (hex) {
            el.style.setProperty('--c', hex);
            el.style.setProperty('--on', textOn(hex));
        } else {
            el.style.removeProperty('--c');
            el.style.removeProperty('--on');
        }
        el.dataset.hex = hex;
    }

    const SIZES = Object.assign(Object.create(null), { sm: 'swatch--sm', md: '', lg: 'swatch--lg' });

    const SwatchUI = {
        normalize,
        textOn,

        /**
         * opts: { hex, name, size:'sm'|'md'|'lg', selected, title, onClick(e, hex),
         *         onDblClick(e, hex), className, attrs }
         */
        create(opts = {}) {
            const hex = normalize(opts.hex);
            const name = typeof opts.name === 'string' ? opts.name.trim() : '';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = ['swatch', SIZES[opts.size] || '', opts.className || ''].filter(Boolean).join(' ');
            paint(btn, hex);
            btn.dataset.name = name;
            btn.setAttribute('aria-label', opts.ariaLabel || labelFor(name, hex));
            btn.title = opts.title || (name ? `${name} · ${hex}` : hex || 'No valid color');
            if (opts.selected) {
                btn.dataset.selected = 'true';
                btn.setAttribute('aria-current', 'true');
            }
            if (opts.attrs && typeof opts.attrs === 'object') {
                Object.entries(opts.attrs).forEach(([k, v]) => btn.setAttribute(k, v));
            }
            if (typeof opts.onClick === 'function') {
                btn.addEventListener('click', (e) => opts.onClick(e, btn.dataset.hex));
            }
            if (typeof opts.onDblClick === 'function') {
                btn.addEventListener('dblclick', (e) => opts.onDblClick(e, btn.dataset.hex));
            }
            return btn;
        },

        /** Change an existing swatch in place: { hex, name, selected, title }. */
        update(el, opts = {}) {
            if (!el) return el;
            const hex = 'hex' in opts ? normalize(opts.hex) : el.dataset.hex || '';
            if ('hex' in opts) paint(el, hex);
            if ('name' in opts || 'hex' in opts) {
                const name = 'name' in opts ? String(opts.name || '').trim() : (el.dataset.name || '');
                el.dataset.name = name;
                el.setAttribute('aria-label', labelFor(name, hex));
                el.title = opts.title || (name ? `${name} · ${hex}` : hex || 'No valid color');
            }
            if ('selected' in opts) {
                if (opts.selected) {
                    el.dataset.selected = 'true';
                    el.setAttribute('aria-current', 'true');
                } else {
                    delete el.dataset.selected;
                    el.removeAttribute('aria-current');
                }
            }
            return el;
        },

        /**
         * A non-interactive preview row: up to `max` colors, then "+N".
         * opts: { size:'sm'|'md'|'lg' (default sm), max (default 12), joined, label }
         */
        strip(hexes, opts = {}) {
            const list = (Array.isArray(hexes) ? hexes : [])
                .map((h) => normalize(typeof h === 'object' && h ? h.hex : h))
                .filter(Boolean);
            const max = Number.isInteger(opts.max) && opts.max > 0 ? opts.max : 12;
            const size = opts.size || 'sm';
            const wrap = document.createElement('div');
            wrap.className = `swatch-strip${opts.joined ? ' swatch-strip--joined' : ''}`;
            wrap.setAttribute('role', 'img');
            const shown = list.slice(0, max);
            const extra = list.length - shown.length;
            wrap.setAttribute('aria-label', opts.label || (list.length
                ? `${list.length} color${list.length === 1 ? '' : 's'}: ${shown.join(', ')}${extra ? ` and ${extra} more` : ''}`
                : 'No colors'));

            shown.forEach((hex) => {
                const chip = document.createElement('span');
                chip.className = ['swatch', SIZES[size] || ''].filter(Boolean).join(' ');
                chip.setAttribute('aria-hidden', 'true');
                paint(chip, hex);
                wrap.appendChild(chip);
            });
            if (extra > 0) {
                const more = document.createElement('span');
                more.className = 'swatch-strip-more';
                more.setAttribute('aria-hidden', 'true');
                more.textContent = `+${extra}`;
                wrap.appendChild(more);
            }
            if (!list.length) {
                const none = document.createElement('span');
                none.className = 'swatch-strip-more';
                none.setAttribute('aria-hidden', 'true');
                none.textContent = 'No colors';
                wrap.appendChild(none);
            }
            return wrap;
        }
    };

    window.SwatchUI = SwatchUI;
})();
