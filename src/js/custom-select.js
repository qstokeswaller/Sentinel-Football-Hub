/**
 * Custom Select Component
 * Replaces all native <select> elements with fully branded dropdowns.
 * Handles dynamic option updates, programmatic value changes, keyboard nav,
 * auto-positioning above/below, and three visual variants.
 */

const CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="7" viewBox="0 0 11 7" fill="none">
  <path d="M1 1L5.5 6L10 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function buildCustomSelect(sel) {
    if (sel.dataset.csInit || sel.multiple || sel.dataset.noCustom) return;
    sel.dataset.csInit = '1';

    // Detect variant
    const isBubble = sel.classList.contains('form-control-bubble');
    const isPill   = sel.classList.contains('filter-select-pill') ||
                     sel.classList.contains('styled-select') ||
                     sel.classList.contains('squad-select-pill');
    const isFullWidth = isBubble ||
                        sel.style.width === '100%' ||
                        sel.classList.contains('w-full');

    // ── Build DOM ────────────────────────────────────────────────────────────

    const wrap = document.createElement('div');
    wrap.className = 'cs-wrap' +
        (isBubble    ? ' cs-bubble' :
         isPill       ? ' cs-pill'   : '');
    if (isFullWidth) wrap.style.display = 'block';

    // Copy any explicit inline width/min-width from original
    if (sel.style.cssText) {
        const w = sel.style.width;
        const mw = sel.style.minWidth;
        if (w)  wrap.style.width    = w;
        if (mw) wrap.style.minWidth = mw;
    }

    const trigger = document.createElement('div');
    trigger.className = 'cs-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const textEl = document.createElement('span');
    textEl.className = 'cs-text';

    const chevronEl = document.createElement('span');
    chevronEl.className = 'cs-chevron';
    chevronEl.innerHTML = CHEVRON;

    trigger.append(textEl, chevronEl);

    const panel = document.createElement('div');
    panel.className = 'cs-panel';
    panel.setAttribute('role', 'listbox');

    wrap.append(trigger, panel);

    // Hide original and insert wrapper after it
    sel.style.display = 'none';
    sel.after(wrap);

    // Hide redundant FA chevron if inside filter-pill-container
    const pillContainer = sel.closest('.filter-pill-container');
    if (pillContainer) {
        const fa = pillContainer.querySelector('.fa-chevron-down, .fas.fa-chevron-down');
        if (fa) fa.style.display = 'none';
    }

    // ── State ────────────────────────────────────────────────────────────────

    let isOpen = false;

    function syncDisplay() {
        const idx = sel.selectedIndex;
        const opt = idx >= 0 ? sel.options[idx] : null;
        const isPlaceholder = !opt || opt.value === '' || (opt.disabled && idx === 0);
        textEl.textContent  = opt ? opt.text : '';
        textEl.style.color  = isPlaceholder ? 'var(--cs-placeholder, #94a3b8)' : '';
        trigger.classList.toggle('cs-disabled', !!sel.disabled);
        trigger.tabIndex = sel.disabled ? -1 : 0;
    }

    function buildPanel() {
        panel.innerHTML = '';
        Array.from(sel.options).forEach((opt, i) => {
            if (opt.hidden) return;
            const item = document.createElement('div');
            item.className = 'cs-option';
            item.textContent = opt.text;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
            if (opt.disabled)       item.classList.add('cs-opt-disabled');
            if (i === sel.selectedIndex) item.classList.add('cs-opt-active');

            if (!opt.disabled) {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    sel.selectedIndex = i;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    syncDisplay();
                    close();
                });
            }
            panel.appendChild(item);
        });
    }

    function open() {
        if (sel.disabled) return;
        isOpen = true;
        buildPanel();

        trigger.classList.add('cs-open');
        trigger.setAttribute('aria-expanded', 'true');

        // Use fixed positioning so panel escapes overflow:auto modal containers
        const rect = wrap.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const goUp = spaceBelow < 220 && rect.top > spaceBelow;

        panel.style.position = 'fixed';
        panel.style.width    = 'auto';
        panel.style.minWidth = rect.width + 'px';
        panel.style.left     = rect.left + 'px';
        panel.style.zIndex   = '99999';

        if (goUp) {
            panel.style.top    = '';
            panel.style.bottom = (window.innerHeight - rect.top) + 'px';
            panel.classList.add('cs-panel-up');
        } else {
            panel.style.top    = rect.bottom + 'px';
            panel.style.bottom = '';
            panel.classList.remove('cs-panel-up');
        }

        panel.classList.add('cs-panel-visible');

        // Scroll active option into view
        const active = panel.querySelector('.cs-opt-active');
        if (active) requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest' }));

        // Close any other open custom selects
        document.querySelectorAll('.cs-trigger.cs-open').forEach(t => {
            if (t !== trigger) t.dispatchEvent(new CustomEvent('_cs_close'));
        });

        document.addEventListener('mousedown', onOutsideClick);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        trigger.classList.remove('cs-open');
        trigger.setAttribute('aria-expanded', 'false');
        panel.classList.remove('cs-panel-visible', 'cs-panel-up');
        panel.style.position = '';
        panel.style.width    = '';
        panel.style.minWidth = '';
        panel.style.left     = '';
        panel.style.top      = '';
        panel.style.bottom   = '';
        panel.style.zIndex   = '';
        document.removeEventListener('mousedown', onOutsideClick);
    }

    function onOutsideClick(e) {
        if (!wrap.contains(e.target)) close();
    }

    // ── Events ───────────────────────────────────────────────────────────────

    trigger.addEventListener('_cs_close', close);

    trigger.addEventListener('click', () => isOpen ? close() : open());

    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen ? close() : open(); return; }
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const dir = e.key === 'ArrowDown' ? 1 : -1;
            let idx = sel.selectedIndex + dir;
            while (idx >= 0 && idx < sel.options.length && sel.options[idx].disabled) idx += dir;
            if (idx >= 0 && idx < sel.options.length) {
                sel.selectedIndex = idx;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                syncDisplay();
                if (isOpen) buildPanel();
            }
        }
    });

    // Watch for dynamic option updates (innerHTML reassignment, option adds/removes)
    new MutationObserver(() => {
        syncDisplay();
        if (isOpen) buildPanel();
    }).observe(sel, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['disabled', 'selected']
    });

    // Intercept programmatic .value and .selectedIndex assignments
    const proto    = HTMLSelectElement.prototype;
    const valDesc  = Object.getOwnPropertyDescriptor(proto, 'value');
    const siDesc   = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');

    Object.defineProperty(sel, 'value', {
        get: () => valDesc.get.call(sel),
        set: (v)  => { valDesc.set.call(sel, v); syncDisplay(); },
        configurable: true,
    });
    Object.defineProperty(sel, 'selectedIndex', {
        get: () => siDesc.get.call(sel),
        set: (v)  => { siDesc.set.call(sel, v); syncDisplay(); },
        configurable: true,
    });

    syncDisplay();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise custom selects within a root element (default: document).
 * Safe to call multiple times — already-initialised selects are skipped.
 */
export function initCustomSelects(root = document) {
    root.querySelectorAll('select:not([data-cs-init]):not([multiple]):not([data-no-custom])').forEach(buildCustomSelect);
}

// Auto-initialise selects added dynamically (modals, injected HTML, etc.)
let _autoObserver = null;
export function enableAutoInit() {
    if (_autoObserver) return;
    _autoObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'SELECT') buildCustomSelect(node);
                else node.querySelectorAll?.('select:not([data-cs-init]):not([multiple]):not([data-no-custom])')
                         .forEach(buildCustomSelect);
            }
        }
    });
    _autoObserver.observe(document.body, { childList: true, subtree: true });
}
