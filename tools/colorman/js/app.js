/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: ColorManBoot (colorMan Edition - v1.0)
 *     - File Name: app.js
 *     - Relative Path: tools/colorman/js/app.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     Starts colorMan: one ToolApp.boot() call that restores saved state,
 *     brings up the rails and dialogs, initialises every pane module, and
 *     registers the color shortcuts. It also keeps the shell's own chrome
 *     (active-color chip, star, undo/redo, section counts, footers) in step
 *     with State, and gives every toolbar control a working fallback so the
 *     page stays usable if a pane module is missing.
 *
 * ✒ Key Features:
 *     - Boots the eleven pane modules in contract order; a missing or failing
 *       module is logged and skipped, never fatal
 *     - Shortcuts: Ctrl+K color field, C copy, R random, E eyedropper,
 *       F save color, A add to working palette, Ctrl+Z undo, Ctrl+Y and
 *       Ctrl+Shift+Z redo (native text undo wins inside fields)
 *     - Every action calls PickerUI's method when it exists and falls back
 *       to State and the color engine when it does not
 *     - Toolbar buttons that no module claimed (data-wired) get click
 *       handlers here, so nothing is ever bound twice by the shell
 *     - Color field fallback: Enter applies any CSS color, Escape reverts,
 *       and unreadable input gets a plain-language note, not a change
 *     - Chrome sync: chip color, star pressed state, undo/redo enabled
 *       state, rail counts, Library footer; the chip title and the
 *       Workbench footer also name the color (PickerUI.nameLabel), updated
 *       once per animation frame during a drag
 *     - Stray file drops outside the working card and the Palettes pane are
 *       refused with a hint, so the browser never navigates away to the file
 *     - Settings binder with live labels for decimal places and history
 *       size, an inline export-prefix check that holds Save until it is
 *       fixed, and a guarded reset
 *     - Backup import report: what was added, and a confirm before the
 *       backup's differing settings replace the visitor's own
 *     - Loader messages in the colorMan voice
 *
 * ✒ Usage Instructions:
 *     Load last, after the shared libraries, js/color.js, js/state.js, and
 *     every js/ui/*.js module. Nothing to call: the IIFE boots on
 *     DOMContentLoaded through ToolApp.boot(). A module that binds one of
 *     the shell's toolbar controls itself should set data-wired="true" on
 *     that element during init() so the fallback here stays out of the way.
 *
 * ✒ Examples:
 *     Press R                 → PickerUI.random(), or a random OKLCH color via State
 *     Press F                 → saves the active color to Saved Colors (again to remove)
 *     Footer                  → '#C9A84C · ≈ goldenrod · 6 colors in working palette · toolMan House'
 *     Ctrl+Z in the rail      → State.undo(); in the color field it undoes typing
 *     ColorManApp.sync()      → re-reads State into the chip, counts, and footers
 *     ColorManApp.actions.copyPrimary()   → copies in Settings → Primary format
 *
 * ✒ Other Important Information:
 *     - Dependencies: shared/js/toolman.js, dom.js, storage.js, loader.js,
 *       workbench.js, dialogs.js, toolapp.js; js/state.js; optional
 *       js/color.js (window.Color) and the js/ui/*.js pane modules
 *     - Compatible platforms: all evergreen browsers; the eyedropper needs
 *       the EyeDropper API (Chrome or Edge on desktop)
 *     - Limitations: if a module binds a toolbar control without setting
 *       data-wired, that control would run two handlers
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    if (window.Loader) {
        Loader.messages = ['Mixing pigments…', 'Calibrating swatches…', 'Tuning the spectrum…', 'Almost ready…'];
    }

    const MODULES = [
        'PickerUI', 'WorkingUI', 'LibraryUI',
        'AdjustUI', 'ContrastUI', 'HarmonyUI', 'ScaleUI',
        'MixUI', 'GradientUI', 'VisionUI', 'ExportUI'
    ];

    const FORMAT_LABELS = {
        hex: 'HEX', rgb: 'RGB', hsl: 'HSL', hwb: 'HWB', lab: 'Lab', lch: 'LCH', oklab: 'OKLab', oklch: 'OKLCH'
    };

    const SETTING_HINTS = {
        exportPrefix: 'Export name prefix must start with a letter and use only letters, numbers, - or _.',
        historySize: 'Recent colors to keep must be between 10 and 100.',
        precision: 'Decimal places must be between 0 and 4.'
    };

    const hasColor = () => Boolean(window.Color && typeof Color.parse === 'function');

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    /* ── Fallback actions (used when PickerUI lacks a method) ── */

    function primaryText() {
        const s = State.settings();
        if (s.primaryFormat !== 'hex' && window.Color && typeof Color.format === 'function') {
            try {
                const out = Color.format(State.getActive(), s.primaryFormat, { precision: s.precision, upper: s.hexUpper });
                if (typeof out === 'string' && out) return out;
            } catch (err) {
                console.warn('[colorMan] format failed, copying hex instead:', err);
            }
        }
        return State.activeHex();
    }

    function primaryLabel() {
        const fmt = State.settings().primaryFormat;
        return window.Color ? (FORMAT_LABELS[fmt] || 'HEX') : 'HEX';
    }

    /** A pleasant random color without the engine: HSL hue 0–360, s 45–75%, l 40–65%. */
    function randomFallback() {
        const h = Math.random() * 360;
        const s = 0.45 + Math.random() * 0.3;
        const l = 0.4 + Math.random() * 0.25;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return { r: f(0), g: f(8), b: f(4), a: 1 };
    }

    const Fallback = {
        focusInput() {
            const input = DOM.id('color-input');
            if (!input) return;
            input.focus();
            input.select();
        },

        copyPrimary(button) {
            const btn = button instanceof Element ? button : DOM.id('btn-copy-primary');
            return ToolApp.copy(primaryText(), primaryLabel(), btn);
        },

        random() {
            let color = null;
            if (window.Color && typeof Color.random === 'function') {
                try { color = Color.random(); } catch (_err) { color = null; }
            }
            State.setActive(color || randomFallback(), { source: 'random' });
        },

        async eyedropper() {
            if (!('EyeDropper' in window)) {
                notify('This browser has no eyedropper. Try Chrome or Edge on a desktop, or type the color in the field.', 'warning', 4200);
                return;
            }
            try {
                const result = await new window.EyeDropper().open();
                if (result && result.sRGBHex) State.setActive(result.sRGBHex, { source: 'eyedropper' });
            } catch (_err) {
                /* Escape or a click outside cancels the pick — nothing to report. */
            }
        },

        toggleStar() {
            const hex = State.activeHex();
            const before = State.hasSwatch(hex);
            const after = State.toggleSwatch(hex);
            if (before) notify(`Removed ${hex} from Saved Colors`, 'info', 1600);
            else if (after) notify(`Saved ${hex}`, 'success', 1400);
            else notify(State.lastError || 'Could not save this color.', 'warning', 3500);
        },

        addToPalette() {
            const hex = State.activeHex();
            const index = State.addToWorking(State.getActive());
            if (index < 0) notify(State.lastError || 'Could not add this color.', 'warning', 3500);
            else notify(`Added ${hex} to the working palette (${index + 1})`, 'success', 1400);
        }
    };

    /** PickerUI[method] when it exists, otherwise the shell's fallback. */
    function viaPicker(method) {
        return (...args) => {
            const ui = window.PickerUI;
            try {
                if (ui && typeof ui[method] === 'function') return ui[method](...args);
            } catch (err) {
                console.error(`[colorMan] PickerUI.${method} failed:`, err);
                return undefined;
            }
            return Fallback[method](...args);
        };
    }

    const actions = {
        focusInput: viaPicker('focusInput'),
        copyPrimary: viaPicker('copyPrimary'),
        random: viaPicker('random'),
        eyedropper: viaPicker('eyedropper'),
        toggleStar: viaPicker('toggleStar'),
        addToPalette: viaPicker('addToPalette'),
        undo() {
            if (!State.undo()) notify('Nothing to undo', 'info', 1200);
        },
        redo() {
            if (!State.redo()) notify('Nothing to redo', 'info', 1200);
        }
    };

    /* ── Toolbar wiring (only for controls no module claimed) ── */

    const shellWired = new Set();

    function claim(id, handler) {
        const el = DOM.id(id);
        if (!el || el.dataset.wired === 'true') return;
        el.dataset.wired = 'true';
        shellWired.add(id);
        DOM.on(el, 'click', (e) => handler(e.currentTarget));
    }

    function wireToolbar() {
        claim('btn-eyedropper', () => actions.eyedropper());
        claim('btn-random', () => actions.random());
        claim('btn-undo', () => actions.undo());
        claim('btn-redo', () => actions.redo());
        claim('btn-copy-primary', (btn) => actions.copyPrimary(btn));
        claim('btn-star', () => actions.toggleStar());
        claim('btn-add-to-palette', () => actions.addToPalette());
        claim('active-chip', (btn) => actions.copyPrimary(btn));

        if (shellWired.has('btn-eyedropper') && !('EyeDropper' in window)) {
            const btn = DOM.id('btn-eyedropper');
            btn.title = 'Pick a color from the screen (E) — needs Chrome or Edge on a desktop';
        }
        wireColorInput();
    }

    /** Color field fallback: Enter applies, Escape reverts, bad input explains itself. */
    function wireColorInput() {
        const input = DOM.id('color-input');
        const error = DOM.id('input-error');
        if (!input || input.dataset.wired === 'true') return;
        input.dataset.wired = 'true';
        shellWired.add('color-input');

        const setError = (msg) => {
            if (error) error.textContent = msg || '';
            if (msg) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        };

        const apply = () => {
            const raw = input.value.trim();
            if (!raw) {
                setError('Type a color first, such as #C9A84C, rgb(201 168 76), or goldenrod.');
                return;
            }
            let color = null;
            let clipped = false;
            if (hasColor() && typeof Color.parseDetailed === 'function') {
                try {
                    const detail = Color.parseDetailed(raw);
                    if (detail) {
                        color = detail.color;
                        clipped = Boolean(detail.clipped);
                    }
                } catch (_err) { color = null; }
            }
            if (!color) color = State.colorOf(raw);
            if (!color) {
                setError('Not a color I recognize — try #C9A84C, rgb(201 168 76), oklch(0.74 0.11 86) or a name.');
                return;
            }
            State.setActive(color, { source: 'input' });
            input.value = primaryText();
            setError(clipped ? 'Mapped into sRGB — the color you typed is outside the standard screen range.' : '');
        };

        DOM.on(input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                apply();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = primaryText();
                setError('');
                input.blur();
            }
        });
        DOM.on(input, 'change', apply);

        State.on('active', ({ source } = {}) => {
            if (document.activeElement === input && source === 'input') return;
            input.value = primaryText();
            if (source !== 'input') setError('');
        });
        State.on('settings', () => { if (document.activeElement !== input) input.value = primaryText(); });
        if (!input.value) input.value = primaryText();
    }

    /* ── Chrome sync: chip, star, undo/redo, counts, footers ── */

    function setText(id, text) {
        const el = DOM.id(id);
        if (el && el.textContent !== text) el.textContent = text;
    }

    /** 'goldenrod', '≈ goldenrod', or '' — PickerUI's name for the active color. */
    function activeName() {
        const ui = window.PickerUI;
        if (!ui || typeof ui.nameLabel !== 'function') return '';
        try {
            return ui.nameLabel() || '';
        } catch (_err) {
            return '';
        }
    }

    /* The chip and the footer name the color; a drag fires many changes, so
       they catch up once per animation frame. */
    let namesFrame = 0;

    function syncNames() {
        namesFrame = 0;
        const hex = State.activeHex();
        const name = activeName();
        const chip = DOM.id('active-chip');
        if (chip) {
            const label = `Active color ${hex}${name ? ` (${name})` : ''}${shellWired.has('active-chip') ? ' — click to copy' : ''}`;
            chip.setAttribute('aria-label', label);
            chip.title = label;
        }
        syncStageFooter(name);
    }

    function scheduleNames() {
        if (!namesFrame) namesFrame = requestAnimationFrame(syncNames);
    }

    function syncActive() {
        const cssHex = State.hexOf(State.getActive()) || '#000000';
        const chip = DOM.id('active-chip');
        if (chip) chip.style.setProperty('--c', cssHex);
        syncStar();
        syncUndo();
        scheduleNames();
    }

    function syncStar() {
        const btn = DOM.id('btn-star');
        if (!btn) return;
        const saved = State.hasSwatch(State.getActive());
        btn.setAttribute('aria-pressed', String(saved));
        const label = saved ? 'Remove this color from Saved Colors' : 'Save this color';
        btn.setAttribute('aria-label', label);
        btn.title = `${label} (F)`;
    }

    function syncUndo() {
        const undo = DOM.id('btn-undo');
        const redo = DOM.id('btn-redo');
        if (undo) undo.disabled = !State.canUndo();
        if (redo) redo.disabled = !State.canRedo();
    }

    function syncCounts() {
        const palettes = State.palettes().length;
        const swatches = State.swatches().length;
        setText('count-palettes', String(palettes));
        setText('count-swatches', String(swatches));
        setText('count-history', String(State.history().length));
        setText('library-stats', `Palettes: ${palettes} | Saved: ${swatches}`);
        const stats = DOM.id('library-stats');
        if (stats) stats.title = `${plural(palettes, 'palette')} and ${plural(swatches, 'saved color')} in this browser`;
    }

    function syncStageFooter(name = activeName()) {
        const w = State.working();
        const hex = State.activeHex();
        const named = name ? ` · ${name}` : '';
        const linked = w.id ? ` · ${w.name}` : '';
        const text = `${hex}${named} · ${plural(w.colors.length, 'color')} in working palette${linked}`;
        setText('stage-footer-status', text);
        const el = DOM.id('stage-footer-status');
        if (el && el.title !== text) el.title = text;
    }

    function sync() {
        syncActive();
        syncCounts();
    }

    function subscribeChrome() {
        State.on('active', syncActive);
        State.on('library', () => { syncStar(); syncCounts(); syncStageFooter(); });
        State.on('history', syncCounts);
        State.on('working', () => syncStageFooter());
        State.on('settings', syncActive);
        State.on('reset', sync);
    }

    /* ── File drops outside the drop zones ─────────────────── */

    /**
     * The working card (images) and the Palettes pane (palette files and
     * images) take dropped files. A file dropped anywhere else would make the
     * browser leave colorMan and open it, so the page refuses it and says
     * where to drop instead. Text drags into fields are left alone.
     */
    function guardFileDrops() {
        const carriesFiles = (e) => Boolean(e.dataTransfer)
            && Array.from(e.dataTransfer.types || []).includes('Files');
        let lastHint = 0;

        window.addEventListener('dragover', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'none';
        });
        window.addEventListener('drop', (e) => {
            if (e.defaultPrevented || !carriesFiles(e)) return;
            e.preventDefault();
            if (Date.now() - lastHint < 1500) return;
            lastHint = Date.now();
            notify('Drop an image on the Working palette card, or a palette file on the Palettes pane.', 'info', 3500);
        });
    }

    /* ── Settings ──────────────────────────────────────────── */

    /** Why an export prefix would be refused, or '' when State accepts it. */
    function prefixProblem(raw) {
        const typed = String(raw || '').trim();
        if (State.validSetting('exportPrefix', typed) !== undefined) return '';
        if (!typed) return 'Type a prefix, such as color or brand.';
        if (!/[a-z]/i.test(typed)) return 'Use letters in the prefix, such as color or brand.';
        return 'Start the prefix with a letter, such as color or brand.';
    }

    /**
     * Inline check for the export prefix: the note under the field explains
     * the problem and Save stays disabled until it is fixed. The listeners
     * run after the kit's own (registered first), and a capturing click
     * guard stops a save that would otherwise drop the typed prefix.
     */
    function wirePrefixCheck() {
        const modal = DOM.id('modal-settings');
        const input = DOM.id('setting-export-prefix');
        const error = DOM.id('export-prefix-error');
        const save = modal ? DOM.$('[data-settings-save]', modal) : null;
        if (!modal || !input || !error || !save) return;

        const show = (msg) => {
            if (error.textContent !== msg) error.textContent = msg;
            error.hidden = !msg;
            if (msg) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        };
        const refresh = () => {
            const msg = prefixProblem(input.value);
            show(msg);
            if (msg) save.disabled = true;
        };

        DOM.on(modal, 'input', refresh);
        DOM.on(modal, 'change', refresh);
        DOM.on(modal, 'click', () => { if (prefixProblem(input.value)) save.disabled = true; });
        modal.addEventListener('click', (e) => {
            if (!e.target.closest('[data-settings-save]') || !prefixProblem(input.value)) return;
            e.preventDefault();
            e.stopPropagation();
            refresh();
            input.focus();
        }, true);
        modal.addEventListener('dialog:open', () => show(''));
    }

    function settingText(key, v) {
        switch (key) {
            case 'primaryFormat': return Object.prototype.hasOwnProperty.call(FORMAT_LABELS, v) ? FORMAT_LABELS[v] : String(v);
            case 'hexUpper': return v ? 'uppercase' : 'lowercase';
            case 'precision': return plural(Number(v), 'decimal place');
            case 'recordHistory': return v ? 'on' : 'off';
            case 'historySize': return `${v} colors`;
            case 'pickerMode': return String(v).toUpperCase();
            default: return String(v);
        }
    }

    function joinList(parts) {
        if (parts.length < 2) return parts.join('');
        return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    }

    function importSummary(r) {
        const parts = [];
        if (r.palettesAdded) parts.push(plural(r.palettesAdded, 'palette'));
        if (r.swatchesAdded) parts.push(plural(r.swatchesAdded, 'saved color'));
        if (r.historyAdded) parts.push(plural(r.historyAdded, 'recent color'));
        let text = parts.length ? `Added ${joinList(parts)} from the backup.` : 'Nothing new to add: everything in that backup is already here.';
        if (r.workingAdded) text += ` Its working palette is in Palettes as “${r.workingAdded}”.`;
        if (r.palettesFull) {
            text += ` ${plural(r.palettesFull, 'palette')} did not fit; the library holds ${State.LIMITS.palettes}.`;
        }
        return text;
    }

    /**
     * After Settings → Import: say what was added, and when the backup's
     * settings differ, ask before using them. Nothing local was replaced.
     */
    async function reportImport(r) {
        const summary = importSummary(r);
        if (!r.settings) {
            notify(`${summary} Your current color, working palette, gradient, and settings were kept.`, 'info', 6000);
            return;
        }
        const now = State.settings();
        const lines = Object.keys(r.settings).map((key) => (
            `• ${State.SETTING_LABELS[key] || key}: ${settingText(key, r.settings[key])} (yours: ${settingText(key, now[key])})`
        ));
        const use = await Dialogs.confirm({
            title: 'Use the backup’s settings too?',
            message: `${summary}\n\nThe backup’s settings differ from yours:\n${lines.join('\n')}\n\nYour settings stay as they are unless you choose the backup’s.`,
            confirmLabel: 'Use backup settings',
            cancelLabel: 'Keep my settings'
        });
        if (!use) {
            notify('Kept your settings', 'info', 1800);
            return;
        }
        const result = State.applySettings(r.settings);
        notify(result.changed.length ? `Now using the backup’s settings (${plural(result.changed.length, 'change')})` : 'Settings unchanged', 'success', 2400);
    }

    function bindSettings() {
        Dialogs.bindSettings({
            getSettings: () => State.settings(),
            applySettings: (values) => {
                const result = State.applySettings(values);
                if (result.rejected.length) {
                    const detail = result.rejected.map((key) => SETTING_HINTS[key]
                        || `${State.SETTING_LABELS[key] || key} kept its previous value.`).join(' ');
                    notify(`Some settings were not changed. ${detail}`, 'warning', 5000);
                }
            },
            formats: {
                precision: (v) => `${plural(Number(v), 'decimal')} · ${(0.74321).toFixed(Number(v))}`,
                historySize: (v) => `${v} colors`
            },
            onReset: () => State.reset(),
            onImported: () => {
                sync();
                const report = State.lastImport;
                State.lastImport = null;
                // After the kit's own "Backup merged" toast, so the detail reads second.
                if (report) setTimeout(() => { reportImport(report).catch((err) => console.error('[colorMan] import report failed:', err)); }, 0);
            },
            resetConfirm: {
                title: 'Reset colorMan?',
                message: 'This deletes your palettes, saved colors, recent colors, gradient, and settings in this browser, then brings back the starter palette.\n\nDownload a backup first if you might want them later. This cannot be undone.',
                confirmLabel: 'Reset colorMan'
            }
        });
    }

    /* ── Boot ──────────────────────────────────────────────── */

    ToolApp.boot({
        id: 'colorman',
        name: 'colorMan',
        modules: MODULES,
        workbench: {
            getUi: () => AppState.ui,
            left: { id: 'panel-library', name: 'Library' },
            right: { id: 'panel-tools', name: 'Tools' }
        },
        shortcuts: [
            { key: 'k', mod: true, allowInFields: true, run: () => actions.focusInput() },
            { key: 'c', run: () => actions.copyPrimary() },
            { key: 'r', run: () => actions.random() },
            { key: 'e', run: () => actions.eyedropper() },
            { key: 'f', run: () => actions.toggleStar() },
            { key: 'a', run: () => actions.addToPalette() },
            { key: 'z', mod: true, run: () => actions.undo() },
            { key: 'y', mod: true, run: () => actions.redo() },
            { key: 'z', mod: true, shift: true, run: () => actions.redo() }
        ],
        onReady() {
            bindSettings();
            wirePrefixCheck();
            guardFileDrops();
            wireToolbar();
            subscribeChrome();
            sync();
        }
    });

    window.ColorManApp = { actions, sync, modules: MODULES.slice() };
})();
