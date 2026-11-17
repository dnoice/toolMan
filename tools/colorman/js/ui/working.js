/*
 * ============================================================================
 * ✒ Metadata
 *     - Title: WorkingUI (colorMan Edition - v1.0)
 *     - File Name: working.js
 *     - Relative Path: tools/colorman/js/ui/working.js
 *     - Artifact Type: javascript
 *     - Version: 1.0.0
 *     - Date: 11/17/2026
 *     - Update: Tuesday, November 17, 2026
 *     - Author: Dennis 'dendogg' Smaltz
 *     - A.I. Acknowledgement: Anthropic - Claude
 *     - Signature: ︻デ═─── ✦ ✦ ✦ | Aim Twice, Shoot Once!
 *
 * ✒ Description:
 *     The Working palette card on the Workbench: the palette being built
 *     right now, shown as large swatches you can click, rename, recolor,
 *     reorder, and remove. Its header actions save the palette to the
 *     library, sort it, clear it, or pull a new palette out of an image, so
 *     a palette goes from first color to saved without leaving the card.
 *
 * ✒ Key Features:
 *     - Editable palette name bound to State.renameWorking (Enter saves,
 *       Escape reverts) and a live "6 colors" count beside the card title
 *     - 56px swatches with the hex and custom name under each; the swatch
 *       that matches the active color carries the ring and check mark
 *     - Per-swatch actions on hover and keyboard focus: set to the current
 *       color, rename, remove (with an Undo strip)
 *     - Drag-and-drop reordering, plus Alt + Left / Right on a focused
 *       swatch; plain arrows, Home, and End move focus; F2 renames; Delete
 *       or Backspace removes
 *     - An "Add current color" tile at the end of the grid
 *     - Save to library, or "Update ‘{name}’" when the palette came from the
 *       library; the button disables itself when there is nothing to save
 *     - Link status line: not in the library, saved, or unsaved changes
 *     - Save as…, Sort (hue, light to dark, most vivid, reverse), Clear with
 *       confirmation and Undo
 *     - From image…: file picker or drop an image on the card; the image is
 *       scaled to 200px, the user picks 3–12 colors, and the engine's
 *       k-means extraction fills the palette
 *     - WorkingUI.isDirty() and confirmReplace() let the Library ask before
 *       anything overwrites unsaved work
 *
 * ✒ Usage Instructions:
 *     Load after js/state.js and js/ui/swatch.js, before js/app.js. app.js
 *     calls WorkingUI.init() once; the module renders into #mount-working
 *     and #actions-working and redraws itself on State events. Everything
 *     else (toolbar, other panes) talks to it through State, or through the
 *     public methods below.
 *
 * ✒ Examples:
 *     WorkingUI.init()                         → builds the card once
 *     WorkingUI.isDirty()                      → true when work would be lost
 *     await WorkingUI.confirmReplace('Open ‘Sunset’')   → true to go ahead
 *     WorkingUI.fromImage()                    → opens the image picker
 *     WorkingUI.fromImageFile(file)            → extracts colors from a File
 *     WorkingUI.save()                         → saves or updates the library copy
 *
 * ✒ Other Important Information:
 *     - Dependencies: js/state.js (State), js/ui/swatch.js (SwatchUI),
 *       shared/js/dom.js, dialogs.js, toolapp.js, toolman.js; js/color.js
 *       (Color.extractPalette, Color.nearestName) for images and name hints
 *     - Compatible platforms: all evergreen browsers; HTML5 drag-and-drop
 *       does not fire on touch-only devices, where the keyboard and the
 *       per-swatch actions still reorder and edit
 *     - Limitations: image extraction samples at most 200px on the long
 *       side, so very small details in large photos may not get a color
 * ----------------------------------------------------------------------------
 */

(function () {
    'use strict';

    const DEFAULT_NAME = 'Untitled palette';
    const MAX_IMAGE_SIDE = 200;
    const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    const DRAG_TYPE = 'application/x-colorman-working';
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i;
    const UNDO_MS = 8000;

    const SORT_LABELS = {
        hue: 'by hue',
        lightness: 'from light to dark',
        chroma: 'from most to least vivid',
        reverse: 'in reverse order'
    };

    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

    const ICONS = {
        replace: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path><path d="M21 3v5h-5"></path>'),
        rename: svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>'),
        remove: svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'),
        plus: svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>', 18)
    };

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function notify(message, type = 'info', ms) {
        if (window.TOOLMAN && message) TOOLMAN.notify(message, type, ms);
    }

    const els = {};
    let pendingFocus = null;     // { index, part } | { add: true } — applied after the next render
    let pendingFlash = -1;       // tile index to flash after the next render
    let selectionFrame = 0;
    let undoTimer = 0;
    let dragFrom = -1;
    let busy = false;            // an image is being processed

    /* ── Small helpers ─────────────────────────────────────── */

    function displayHex(hex) {
        return State.settings().hexUpper === false ? hex.toLowerCase() : hex;
    }

    function activeHex() {
        return State.hexOf(State.getActive()) || '';
    }

    function shortName(name, max = 22) {
        return name.length > max ? `${name.slice(0, max - 1)}…` : name;
    }

    function linkedPalette(w) {
        return w && w.id ? State.palette(w.id) : null;
    }

    /** True when replacing or clearing the working palette would lose work. */
    function isDirty(w = State.working(), pal = linkedPalette(w)) {
        if (!pal) return w.colors.length > 0;
        if (pal.name !== w.name || pal.colors.length !== w.colors.length) return true;
        return pal.colors.some((c, i) => c.hex !== w.colors[i].hex || c.name !== w.colors[i].name);
    }

    function announce(message) {
        if (!els.live) return;
        els.live.textContent = '';
        // A fresh text node each time so repeated messages are still read.
        requestAnimationFrame(() => { els.live.textContent = message; });
    }

    function hideUndo() {
        clearTimeout(undoTimer);
        if (!els.undo) return;
        els.undo.hidden = true;
        delete els.undo.dataset.state;
        DOM.empty(els.undo);
    }

    /** An inline "… Undo" strip under the grid for a few seconds. */
    function showUndo(message, onUndo) {
        hideUndo();
        const text = DOM.create('span', { className: 'cm-undo-text', text: message });
        const btn = DOM.create('button', {
            className: 'btn btn-ghost btn-sm cm-undo-btn',
            text: 'Undo',
            attrs: { type: 'button', 'aria-label': `Undo: ${message}` }
        });
        DOM.on(btn, 'click', () => {
            hideUndo();
            try { onUndo(); } catch (err) { console.error('[WorkingUI] undo failed:', err); }
        });
        els.undo.append(text, btn);
        els.undo.dataset.state = 'info';
        els.undo.hidden = false;
        undoTimer = setTimeout(hideUndo, UNDO_MS);
    }

    function askName(title, value, confirmLabel) {
        return Dialogs.prompt({
            title,
            label: 'Palette name',
            value,
            placeholder: 'e.g. Autumn brand',
            confirmLabel,
            validate: (raw) => {
                const s = raw.trim();
                if (!s) return 'Give the palette a name.';
                if (s.length > 80) return 'Use 80 characters or fewer.';
                return null;
            }
        });
    }

    /* ── Build (once) ──────────────────────────────────────── */

    function button(className, text, attrs = {}) {
        return DOM.create('button', { className, text, attrs: Object.assign({ type: 'button' }, attrs) });
    }

    function buildActions() {
        const host = els.actions;
        els.save = button('btn btn-primary btn-sm wp-save', 'Save to library');
        els.saveAs = button('btn btn-secondary btn-sm', 'Save as…', {
            title: 'Save a new copy in the library under another name'
        });

        els.sort = DOM.create('select', {
            className: 'select-input wp-sort',
            attrs: { 'aria-label': 'Sort the working palette', title: 'Sort the working palette' }
        });
        [['', 'Sort…'], ['hue', 'By hue'], ['lightness', 'Light to dark'], ['chroma', 'Most vivid first'], ['reverse', 'Reverse order']]
            .forEach(([value, label]) => els.sort.appendChild(DOM.create('option', { text: label, attrs: { value } })));

        els.image = button('btn btn-secondary btn-sm', 'From image…', {
            title: 'Pull a palette out of an image (you can also drop one on this card)'
        });
        els.clear = button('btn btn-ghost btn-sm wp-clear', 'Clear', { title: 'Remove every color from the working palette' });

        host.append(els.save, els.saveAs, els.sort, els.image, els.clear);

        DOM.on(els.save, 'click', () => WorkingUI.save());
        DOM.on(els.saveAs, 'click', () => WorkingUI.saveAs());
        DOM.on(els.image, 'click', () => WorkingUI.fromImage());
        DOM.on(els.clear, 'click', () => WorkingUI.clear());
        DOM.on(els.sort, 'change', () => {
            const mode = els.sort.value;
            els.sort.value = '';
            if (!mode) return;
            if (State.sortWorking(mode)) {
                const msg = `Sorted the working palette ${SORT_LABELS[mode]}`;
                notify(msg, 'success', 1400);
                announce(msg);
            }
        });
    }

    function buildCount() {
        const title = DOM.id('title-working');
        els.count = DOM.create('span', { className: 'wp-count', id: 'working-count', text: '0 colors' });
        if (title && title.parentNode) title.insertAdjacentElement('afterend', els.count);
    }

    function buildBody() {
        const mount = els.mount;
        DOM.empty(mount);

        const head = DOM.create('div', { className: 'wp-head' });
        els.name = DOM.create('input', {
            className: 'doc-title wp-name',
            attrs: {
                type: 'text',
                maxlength: '80',
                spellcheck: 'false',
                autocomplete: 'off',
                'aria-label': 'Working palette name',
                title: 'Rename the working palette — press Enter to keep, Escape to undo',
                placeholder: DEFAULT_NAME
            }
        });
        els.status = DOM.create('span', { className: 'wp-status', attrs: { role: 'status' } });
        head.append(els.name, els.status);

        els.grid = DOM.create('ul', {
            className: 'wp-grid',
            attrs: { 'aria-label': 'Working palette colors' }
        });

        els.empty = DOM.create('div', { className: 'empty-state wp-empty' });
        els.empty.innerHTML = `
            <p class="empty-text">Your working palette is empty — add the current color, open a palette from the Library, or pull one from an image.</p>
            <div class="action-buttons wp-empty-actions">
                <button type="button" class="btn btn-primary btn-sm" data-act="add-current">${ICONS.plus} Add current color</button>
                <button type="button" class="btn btn-secondary btn-sm" data-act="browse">Open the Library</button>
                <button type="button" class="btn btn-secondary btn-sm" data-act="image">From image…</button>
            </div>
            <p class="pane-hint wp-drop-hint">Tip: drop an image anywhere on this card.</p>`;

        els.hint = DOM.create('p', {
            className: 'pane-hint wp-hint',
            text: 'Drag swatches to reorder, or focus one and press Alt + ← / →. Double-click or F2 renames; Delete removes.'
        });

        els.undo = DOM.create('div', { className: 'tool-feedback cm-undo', attrs: { role: 'status' } });
        els.undo.hidden = true;

        els.live = DOM.create('div', { className: 'cm-sr', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });

        els.file = DOM.create('input', {
            className: 'cm-file',
            attrs: { type: 'file', accept: 'image/*', tabindex: '-1', 'aria-hidden': 'true' }
        });

        mount.append(head, els.grid, els.empty, els.hint, els.undo, els.live, els.file);
    }

    /* ── Render ────────────────────────────────────────────── */

    function actionBtn(act, icon, label, extraClass = '') {
        const btn = DOM.create('button', {
            className: `icon-action wp-act${extraClass ? ` ${extraClass}` : ''}`,
            html: icon,
            attrs: { type: 'button', 'aria-label': label, title: label },
            data: { act }
        });
        return btn;
    }

    function buildItem(entry, i, total, active) {
        const hex = displayHex(entry.hex);
        const li = DOM.create('li', {
            className: 'wp-item',
            attrs: { draggable: 'true' },
            data: { index: String(i) }
        });
        const isActive = entry.hex === active;
        const sw = SwatchUI.create({
            hex: entry.hex,
            name: entry.name,
            size: 'lg',
            selected: isActive,
            className: 'wp-swatch',
            ariaLabel: `Color ${i + 1} of ${total}: ${entry.name ? `${entry.name}, ` : ''}${hex}${isActive ? ' (current color)' : ''}`,
            title: `${entry.name ? `${entry.name} · ` : ''}${hex} — click to use, double-click to rename`,
            attrs: {
                'data-index': String(i),
                'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight F2 Delete'
            }
        });

        const meta = DOM.create('span', { className: 'wp-meta', attrs: { 'aria-hidden': 'true' } });
        meta.appendChild(DOM.create('span', { className: 'wp-hex', text: hex }));
        if (entry.name) meta.appendChild(DOM.create('span', { className: 'wp-label', text: entry.name, attrs: { title: entry.name } }));

        const tools = DOM.create('div', {
            className: 'wp-tools',
            attrs: { role: 'group', 'aria-label': `Color ${i + 1} actions` }
        });
        const replace = actionBtn('replace', ICONS.replace, `Set color ${i + 1} to the current color`);
        replace.disabled = isActive;
        if (isActive) replace.title = 'Already the current color';
        tools.append(
            replace,
            actionBtn('rename', ICONS.rename, `Rename color ${i + 1}`),
            actionBtn('remove', ICONS.remove, `Remove color ${i + 1}`, 'icon-action--danger')
        );

        li.append(sw, meta, tools);
        return li;
    }

    function buildAddTile(active) {
        const li = DOM.create('li', { className: 'wp-item wp-item--add' });
        const btn = DOM.create('button', {
            className: 'wp-add',
            attrs: { type: 'button' }
        });
        btn.innerHTML = `${ICONS.plus}<span class="wp-add-dot" aria-hidden="true"></span>`;
        const label = DOM.create('span', { className: 'wp-meta wp-add-label', text: 'Add current', attrs: { 'aria-hidden': 'true' } });
        li.append(btn, label);
        paintAddTile(btn, active);
        return li;
    }

    function paintAddTile(btn, active) {
        if (!btn) return;
        const hex = displayHex(active || '#000000');
        btn.style.setProperty('--c', active || 'transparent');
        btn.setAttribute('aria-label', `Add the current color ${hex} to the working palette`);
        btn.title = `Add the current color ${hex} (A)`;
    }

    function renderHeader(w = State.working()) {
        const pal = linkedPalette(w);
        const dirty = isDirty(w, pal);
        const n = w.colors.length;

        if (document.activeElement !== els.name) els.name.value = w.name;

        let status;
        let state;
        if (pal) {
            status = dirty ? `Unsaved changes to ‘${pal.name}’` : `Saved in the library as ‘${pal.name}’`;
            state = dirty ? 'dirty' : 'saved';
        } else if (n) {
            status = 'Not in the library yet';
            state = 'new';
        } else {
            status = 'Nothing to save yet';
            state = 'empty';
        }
        els.status.textContent = status;
        els.status.dataset.state = state;
        els.status.title = status;

        els.count.textContent = plural(n, 'color');
        els.count.title = `${plural(n, 'color')} in the working palette`;

        els.save.textContent = pal ? `Update ‘${shortName(pal.name)}’` : 'Save to library';
        els.save.disabled = !n || Boolean(pal && !dirty);
        if (!n) els.save.title = 'Add a color before saving';
        else if (pal && !dirty) els.save.title = `No changes since ‘${pal.name}’ was saved`;
        else if (pal) els.save.title = `Save these changes over ‘${pal.name}’ in the library`;
        else els.save.title = 'Save this palette to the library';
        els.save.setAttribute('aria-label', els.save.title);

        els.saveAs.disabled = !n;
        els.sort.disabled = n < 2;
        els.clear.disabled = !n;
    }

    function captureGridFocus() {
        const a = document.activeElement;
        if (!a || !els.grid.contains(a)) return null;
        if (a.classList.contains('wp-add')) return { add: true };
        const li = a.closest('.wp-item');
        if (!li || li.dataset.index === undefined) return null;
        return { index: Number(li.dataset.index), part: a.dataset.act || 'swatch' };
    }

    function applyFocus(target) {
        if (!target) return;
        if (target.add) {
            const add = DOM.$('.wp-add', els.grid);
            if (add) add.focus();
            return;
        }
        const items = DOM.$$('.wp-item:not(.wp-item--add)', els.grid);
        if (!items.length) {
            // The grid is gone (empty palette): land on the empty state's first action.
            const first = DOM.$('[data-act="add-current"]', els.empty);
            if (first && !els.empty.hidden) first.focus();
            return;
        }
        const li = items[Math.min(Math.max(0, target.index), items.length - 1)];
        let el = target.part && target.part !== 'swatch' ? DOM.$(`[data-act="${target.part}"]`, li) : null;
        if (!el || el.disabled) el = DOM.$('.wp-swatch', li);
        if (el) el.focus();
    }

    function render() {
        if (!els.grid) return;
        const w = State.working();
        const focusTarget = pendingFocus || captureGridFocus();
        pendingFocus = null;

        renderHeader(w);

        const n = w.colors.length;
        const active = activeHex();
        const frag = document.createDocumentFragment();
        w.colors.forEach((entry, i) => frag.appendChild(buildItem(entry, i, n, active)));
        if (n) frag.appendChild(buildAddTile(active));
        DOM.empty(els.grid);
        els.grid.appendChild(frag);

        els.grid.hidden = n === 0;
        els.empty.hidden = n > 0;
        els.hint.hidden = n < 2;

        applyFocus(focusTarget);

        if (pendingFlash >= 0) {
            const li = DOM.$(`.wp-item[data-index="${pendingFlash}"]`, els.grid);
            pendingFlash = -1;
            if (li && window.ToolApp) ToolApp.flash(li);
        }
    }

    function updateSelection() {
        selectionFrame = 0;
        if (!els.grid) return;
        const active = activeHex();
        const total = DOM.$$('.wp-item:not(.wp-item--add)', els.grid).length;
        DOM.$$('.wp-item:not(.wp-item--add)', els.grid).forEach((li) => {
            const sw = DOM.$('.wp-swatch', li);
            if (!sw) return;
            const on = sw.dataset.hex === active;
            if ((sw.dataset.selected === 'true') !== on) {
                SwatchUI.update(sw, { selected: on });
                const i = Number(li.dataset.index);
                const name = sw.dataset.name;
                sw.setAttribute('aria-label', `Color ${i + 1} of ${total}: ${name ? `${name}, ` : ''}${displayHex(sw.dataset.hex)}${on ? ' (current color)' : ''}`);
            }
            const rep = DOM.$('[data-act="replace"]', li);
            if (rep && rep.disabled !== on) {
                // Never strand keyboard focus on a button that is about to disable itself.
                if (on && document.activeElement === rep) sw.focus();
                rep.disabled = on;
                rep.title = on ? 'Already the current color' : rep.getAttribute('aria-label');
            }
        });
        paintAddTile(DOM.$('.wp-add', els.grid), active);
    }

    function scheduleSelection() {
        if (selectionFrame) return;
        selectionFrame = requestAnimationFrame(updateSelection);
    }

    /* ── Item actions ──────────────────────────────────────── */

    function entryAt(i) {
        return State.working().colors[i] || null;
    }

    function useColor(i) {
        const entry = entryAt(i);
        if (entry) State.setActive(entry.hex, { source: 'palette' });
    }

    function addCurrent() {
        const hex = displayHex(State.hexOf(State.getActive()) || '');
        if (els.grid.contains(document.activeElement)) pendingFocus = { add: true };
        const index = State.addToWorking(State.getActive());
        if (index < 0) {
            pendingFocus = null;
            notify(State.lastError || 'Could not add this color.', 'warning', 3500);
            return -1;
        }
        // The add triggers a render; flash the new tile once it exists.
        const li = DOM.$(`.wp-item[data-index="${index}"]`, els.grid);
        if (li && window.ToolApp) ToolApp.flash(li);
        announce(`Added ${hex} as color ${index + 1}`);
        return index;
    }

    function replaceAt(i) {
        const entry = entryAt(i);
        if (!entry) return;
        const next = State.hexOf(State.getActive());
        if (!next || next === entry.hex) return;
        pendingFlash = i;
        if (State.updateWorkingColor(i, next)) announce(`Color ${i + 1} is now ${displayHex(next)}`);
        else pendingFlash = -1;
    }

    function removeAt(i) {
        const entry = entryAt(i);
        if (!entry) return;
        if (els.grid.contains(document.activeElement)) pendingFocus = { index: i, part: 'swatch' };
        const removed = State.removeFromWorking(i);
        if (!removed) {
            pendingFocus = null;
            return;
        }
        const label = `${removed.name ? `${removed.name} ` : ''}${displayHex(removed.hex)}`;
        announce(`Removed ${label}`);
        showUndo(`Removed ${label} from the working palette.`, () => {
            const at = State.addToWorking(removed.hex, removed.name);
            if (at < 0) {
                notify(State.lastError || 'Could not put the color back.', 'warning', 3500);
                return;
            }
            const to = Math.min(i, at);
            pendingFocus = { index: to, part: 'swatch' };
            if (to !== at) State.moveWorking(at, to);
            else render();
            announce(`Put ${label} back as color ${to + 1}`);
        });
    }

    function moveItem(from, to) {
        const n = State.working().colors.length;
        if (from === to || to < 0 || to >= n) return false;
        const entry = entryAt(from);
        pendingFocus = { index: to, part: 'swatch' };
        if (!State.moveWorking(from, to)) {
            pendingFocus = null;
            return false;
        }
        announce(`Moved ${displayHex(entry.hex)} to position ${to + 1} of ${n}`);
        return true;
    }

    async function renameAt(i) {
        const entry = entryAt(i);
        if (!entry) return;
        let suggestion = '';
        if (window.Color && typeof Color.nearestName === 'function') {
            try {
                const near = Color.nearestName(Color.parse(entry.hex));
                if (near && near.name) suggestion = near.name;
            } catch (_err) { /* no hint */ }
        }
        const value = await Dialogs.prompt({
            title: `Name color ${i + 1}`,
            label: 'Color name',
            value: entry.name,
            placeholder: suggestion ? `e.g. ${suggestion}` : 'e.g. Brand gold',
            hint: `${displayHex(entry.hex)}${suggestion ? ` · closest CSS name: ${suggestion}` : ''}. Leave empty to show only the hex code.`,
            confirmLabel: 'Save name',
            validate: (raw) => (raw.trim().length > 80 ? 'Use 80 characters or fewer.' : null)
        });
        if (value === null) return;
        const now = entryAt(i);
        if (!now || now.hex !== entry.hex) {
            notify('The working palette changed while the dialog was open, so nothing was renamed.', 'warning', 3500);
            return;
        }
        if (now.name === value.trim()) return;
        pendingFocus = { index: i, part: 'swatch' };
        State.renameWorkingColor(i, value);
        announce(value.trim() ? `Color ${i + 1} is now named ${value.trim()}` : `Color ${i + 1} no longer has a name`);
    }

    /* ── Wiring ────────────────────────────────────────────── */

    function itemIndex(el) {
        const li = el.closest('.wp-item');
        return li && li.dataset.index !== undefined ? Number(li.dataset.index) : -1;
    }

    function focusSwatch(i) {
        const items = DOM.$$('.wp-item:not(.wp-item--add)', els.grid);
        if (i >= items.length) {
            const add = DOM.$('.wp-add', els.grid);
            if (add) add.focus();
            return;
        }
        const sw = items[Math.max(0, i)] && DOM.$('.wp-swatch', items[Math.max(0, i)]);
        if (sw) sw.focus();
    }

    function onGridKey(e) {
        const target = e.target;
        if (target.classList.contains('wp-add')) {
            if (e.key === 'ArrowLeft' || e.key === 'Home') {
                e.preventDefault();
                focusSwatch(e.key === 'Home' ? 0 : State.working().colors.length - 1);
            }
            return;
        }
        if (!target.classList.contains('wp-swatch')) return;
        const i = itemIndex(target);
        const n = State.working().colors.length;
        if (i < 0) return;

        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault(); // Alt + Left is "Back" in most browsers.
            const to = e.key === 'ArrowLeft' ? i - 1 : i + 1;
            if (to < 0) announce('Already the first color');
            else if (to >= n) announce('Already the last color');
            else moveItem(i, to);
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                focusSwatch(Math.max(0, i - 1));
                break;
            case 'ArrowRight':
                e.preventDefault();
                focusSwatch(i + 1);
                break;
            case 'Home':
                e.preventDefault();
                focusSwatch(0);
                break;
            case 'End':
                e.preventDefault();
                focusSwatch(n - 1);
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                removeAt(i);
                break;
            case 'F2':
                e.preventDefault();
                renameAt(i);
                break;
            default:
                break;
        }
    }

    function clearDropMarks() {
        DOM.$$('.wp-item[data-drop]', els.grid).forEach((li) => { delete li.dataset.drop; });
    }

    function hasType(e, type) {
        const types = e.dataTransfer && e.dataTransfer.types;
        return Boolean(types) && Array.from(types).includes(type);
    }

    function wireGrid() {
        const grid = els.grid;

        DOM.delegate(grid, 'click', '.wp-swatch', (e, sw) => useColor(itemIndex(sw)));
        DOM.delegate(grid, 'dblclick', '.wp-swatch', (e, sw) => {
            e.preventDefault();
            renameAt(itemIndex(sw));
        });
        DOM.delegate(grid, 'click', '.wp-act', (e, btn) => {
            const i = itemIndex(btn);
            if (i < 0) return;
            if (btn.dataset.act === 'replace') replaceAt(i);
            else if (btn.dataset.act === 'rename') renameAt(i);
            else if (btn.dataset.act === 'remove') removeAt(i);
        });
        DOM.delegate(grid, 'click', '.wp-add', () => addCurrent());
        DOM.on(grid, 'keydown', onGridKey);

        DOM.delegate(els.empty, 'click', '[data-act]', (e, btn) => {
            const act = btn.dataset.act;
            if (act === 'add-current') {
                pendingFocus = { add: true };
                if (addCurrent() < 0) pendingFocus = null;
            } else if (act === 'browse') {
                if (window.Workbench) Workbench.openSection('palettes', { focusSelector: '.lib-filter' });
            } else if (act === 'image') {
                WorkingUI.fromImage();
            }
        });

        // Reordering by drag and drop.
        DOM.on(grid, 'dragstart', (e) => {
            const li = e.target instanceof Element ? e.target.closest('.wp-item') : null;
            if (!li || li.classList.contains('wp-item--add')) return;
            dragFrom = Number(li.dataset.index);
            li.classList.add('is-dragging');
            const entry = entryAt(dragFrom);
            e.dataTransfer.effectAllowed = 'move';
            try {
                e.dataTransfer.setData(DRAG_TYPE, String(dragFrom));
                if (entry) e.dataTransfer.setData('text/plain', entry.hex);
            } catch (_err) { /* non-fatal */ }
        });

        DOM.on(grid, 'dragover', (e) => {
            if (dragFrom < 0 || !hasType(e, DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const li = e.target instanceof Element ? e.target.closest('.wp-item') : null;
            clearDropMarks();
            if (!li || li.classList.contains('is-dragging')) return;
            if (li.classList.contains('wp-item--add')) {
                li.dataset.drop = 'before';
                return;
            }
            const rect = li.getBoundingClientRect();
            li.dataset.drop = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        });

        DOM.on(grid, 'dragleave', (e) => {
            if (!grid.contains(e.relatedTarget)) clearDropMarks();
        });

        DOM.on(grid, 'drop', (e) => {
            if (dragFrom < 0 || !hasType(e, DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            const li = e.target instanceof Element ? e.target.closest('.wp-item') : null;
            const n = State.working().colors.length;
            let to = -1;
            if (li && li.classList.contains('wp-item--add')) {
                to = n - 1;
            } else if (li && li.dataset.index !== undefined) {
                const j = Number(li.dataset.index);
                const after = li.dataset.drop === 'after';
                // moveWorking removes first, then inserts: shift targets past the source.
                if (dragFrom < j) to = after ? j : j - 1;
                else to = after ? j + 1 : j;
            }
            const from = dragFrom;
            clearDropMarks();
            dragFrom = -1;
            if (to >= 0 && to !== from) moveItem(from, Math.min(Math.max(0, to), n - 1));
        });

        DOM.on(grid, 'dragend', () => {
            dragFrom = -1;
            clearDropMarks();
            DOM.$$('.wp-item.is-dragging', grid).forEach((li) => li.classList.remove('is-dragging'));
        });
    }

    function wireName() {
        const input = els.name;
        DOM.on(input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = State.working().name;
                input.blur();
            }
        });
        DOM.on(input, 'change', () => {
            const before = State.working().name;
            const after = State.renameWorking(input.value);
            input.value = after;
            if (after !== before) announce(`Working palette renamed to ${after}`);
        });
    }

    /** Image files dropped anywhere on the Working palette card. */
    function wireCardDrop() {
        const card = els.card;
        if (!card) return;
        const isFileDrag = (e) => dragFrom < 0 && hasType(e, 'Files');

        DOM.on(card, 'dragenter', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            card.dataset.drop = 'image';
        });
        DOM.on(card, 'dragover', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            card.dataset.drop = 'image';
        });
        DOM.on(card, 'dragleave', (e) => {
            if (!card.contains(e.relatedTarget)) delete card.dataset.drop;
        });
        DOM.on(card, 'drop', (e) => {
            delete card.dataset.drop;
            if (!hasType(e, 'Files')) return;
            e.preventDefault();
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) WorkingUI.fromImageFile(file);
        });

        DOM.on(els.file, 'change', () => {
            const file = els.file.files && els.file.files[0];
            els.file.value = '';
            if (file) WorkingUI.fromImageFile(file);
        });
    }

    /* ── Image extraction ──────────────────────────────────── */

    function isImageFile(file) {
        return Boolean(file) && ((file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(file.name || ''));
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('unreadable image'));
            };
            img.src = url;
        });
    }

    /** Draw to an offscreen canvas no larger than 200px on its long side. */
    function sampleImage(img) {
        const w = img.naturalWidth || img.width || MAX_IMAGE_SIDE;
        const h = img.naturalHeight || img.height || MAX_IMAGE_SIDE;
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cw, ch);
        return ctx.getImageData(0, 0, cw, ch);
    }

    /* ── Public API ────────────────────────────────────────── */

    const WorkingUI = {
        init() {
            els.mount = DOM.id('mount-working');
            els.actions = DOM.id('actions-working');
            els.card = DOM.id('card-working');
            if (!els.mount || !els.actions) return;

            buildCount();
            buildActions();
            buildBody();
            wireGrid();
            wireName();
            wireCardDrop();

            State.on('working', (payload = {}) => {
                if (payload.action === 'rename') renderHeader();
                else render();
            });
            State.on('library', (payload = {}) => {
                if (!payload.kind || payload.kind === 'palettes') renderHeader();
            });
            State.on('active', scheduleSelection);
            State.on('settings', (payload = {}) => {
                if (!payload.changed || payload.changed.includes('hexUpper')) render();
            });
            State.on('reset', () => {
                hideUndo();
                render();
            });

            render();
        },

        render,
        isDirty: () => isDirty(),

        /**
         * Ask before something replaces the working palette. Resolves true
         * right away when nothing would be lost. opts: { action, confirmLabel }
         */
        async confirmReplace(opts = {}) {
            const w = State.working();
            const pal = linkedPalette(w);
            if (!isDirty(w, pal)) return true;
            const what = pal
                ? `Your changes to ‘${pal.name}’ have not been saved to the library.`
                : `The working palette has ${plural(w.colors.length, 'color')} that ${w.colors.length === 1 ? 'is' : 'are'} not saved in the library.`;
            return Dialogs.confirm({
                title: opts.title || 'Replace the working palette?',
                message: `${what} ${opts.action || 'Continuing'} replaces ${w.colors.length === 1 ? 'it' : 'them'}.\n\nSave first if you want to keep ${w.colors.length === 1 ? 'it' : 'them'}.`,
                confirmLabel: opts.confirmLabel || 'Replace',
                danger: true
            });
        },

        async save() {
            const w = State.working();
            if (!w.colors.length) {
                notify('Add at least one color to the working palette before saving it.', 'warning', 3000);
                return null;
            }
            const pal = linkedPalette(w);
            if (!pal && (!w.name || w.name === DEFAULT_NAME)) {
                const name = await askName('Save to library', '', 'Save palette');
                if (name === null) return null;
                State.renameWorking(name);
            }
            const saved = State.saveWorkingToLibrary();
            if (!saved) {
                notify(State.lastError || 'Could not save the palette.', 'error', 4000);
                return null;
            }
            notify(pal ? `Updated ‘${saved.name}’ in the library` : `Saved ‘${saved.name}’ to the library`, 'success', 1800);
            return saved;
        },

        async saveAs() {
            const w = State.working();
            if (!w.colors.length) {
                notify('Add at least one color to the working palette before saving it.', 'warning', 3000);
                return null;
            }
            const pal = linkedPalette(w);
            const suggested = pal ? `${w.name} copy` : (w.name === DEFAULT_NAME ? '' : w.name);
            const name = await askName('Save as a new palette', suggested.slice(0, 80), 'Save copy');
            if (name === null) return null;
            const saved = State.savePaletteAs(name);
            if (!saved) {
                notify(State.lastError || 'Could not save the palette.', 'error', 4000);
                return null;
            }
            notify(`Saved ‘${saved.name}’ as a new palette`, 'success', 1800);
            return saved;
        },

        async clear() {
            const w = State.working();
            if (!w.colors.length) return false;
            const pal = linkedPalette(w);
            const dirty = isDirty(w, pal);
            let message;
            if (pal && !dirty) message = `‘${pal.name}’ stays in your library; only the working copy is cleared.`;
            else if (pal) message = `Your unsaved changes to ‘${pal.name}’ will be lost. The saved version stays in your library.`;
            else message = `These ${plural(w.colors.length, 'color')} are not saved in the library.`;
            const ok = await Dialogs.confirm({
                title: 'Clear the working palette?',
                message: `${message}\n\nYou can undo this for a few seconds afterwards.`,
                confirmLabel: 'Clear palette',
                danger: true
            });
            if (!ok) return false;
            const before = State.working();
            State.clearWorking();
            if (els.empty && !els.empty.hidden) {
                const first = DOM.$('[data-act="add-current"]', els.empty);
                if (first) first.focus();
            }
            notify('Cleared the working palette', 'info', 1500);
            showUndo(`Cleared ${plural(before.colors.length, 'color')}.`, () => {
                const relink = before.id && State.palette(before.id) ? before.id : null;
                pendingFocus = { index: 0, part: 'swatch' };
                State.setWorking(before.colors, before.name, relink);
                announce('Working palette restored');
            });
            return true;
        },

        fromImage() {
            if (busy) return;
            if (els.file) els.file.click();
        },

        async fromImageFile(file) {
            if (!file || busy) return false;
            const label = file.name || 'that file';
            if (!isImageFile(file)) {
                notify(`“${label}” isn't an image. Choose a PNG, JPEG, GIF, WebP, BMP, or SVG file.`, 'warning', 4500);
                return false;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                notify(`“${label}” is larger than 25 MB. Try a smaller copy of the image.`, 'warning', 4500);
                return false;
            }
            if (!window.Color || typeof Color.extractPalette !== 'function') {
                notify('The color engine did not load, so colors cannot be pulled from images. Reload the page to try again.', 'error', 5000);
                return false;
            }

            busy = true;
            if (els.image) els.image.disabled = true;
            try {
                let data;
                try {
                    data = sampleImage(await loadImage(file));
                } catch (_err) {
                    notify(`Couldn't read “${label}” as an image. It may be damaged or in a format this browser can't open.`, 'error', 5000);
                    return false;
                }

                const dirty = isDirty();
                const raw = await Dialogs.prompt({
                    title: 'Pull colors from an image',
                    label: 'How many colors? (3–12)',
                    value: '6',
                    hint: dirty
                        ? `From “${label}”. This replaces the working palette, which has unsaved changes.`
                        : `From “${label}”. The most common colors come first.`,
                    confirmLabel: dirty ? 'Replace and pull colors' : 'Pull colors',
                    validate: (v) => {
                        const s = v.trim();
                        if (!/^\d+$/.test(s)) return 'Enter a whole number from 3 to 12.';
                        const n = Number(s);
                        if (n < 3 || n > 12) return 'Choose between 3 and 12 colors.';
                        return null;
                    }
                });
                if (raw === null) return false;

                const colors = Color.extractPalette(data, Number(raw.trim()));
                const hexes = colors.map((c) => State.hexOf(c)).filter(Boolean);
                if (!hexes.length) {
                    notify(`“${label}” has no opaque pixels to take colors from.`, 'warning', 4500);
                    return false;
                }
                State.setWorking(hexes, `From ${label}`);
                const fewer = hexes.length < Number(raw.trim()) ? ' (the image has fewer distinct colors)' : '';
                notify(`Pulled ${plural(hexes.length, 'color')} from “${label}”${fewer}`, 'success', 2600);
                announce(`Working palette now has ${plural(hexes.length, 'color')} from ${label}`);
                return true;
            } catch (err) {
                console.error('[WorkingUI] image extraction failed:', err);
                notify(`Something went wrong while reading “${label}”. Try another image.`, 'error', 4500);
                return false;
            } finally {
                busy = false;
                if (els.image) els.image.disabled = false;
            }
        },

        focusName() {
            if (els.name) {
                els.name.focus();
                els.name.select();
            }
        }
    };

    window.WorkingUI = WorkingUI;
})();
