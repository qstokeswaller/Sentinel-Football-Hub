/**
 * Year Wheel Picker — iOS-style drum roller for selecting year of birth.
 * Uses CSS scroll-snap for smooth native snapping (no JS snap interference).
 */

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 200px
const DEFAULT_YEAR = 2005;

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const css = `
/* ── Year Picker Trigger ── */
.yp-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 500;
    color: #1e3a5f;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    -webkit-user-select: none;
    user-select: none;
}
.yp-trigger:hover { border-color: #2563eb; }
.yp-trigger:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.yp-trigger .yp-placeholder { color: #94a3b8; font-weight: 400; }
.yp-trigger .yp-chevron {
    font-size: 0.7rem;
    color: #94a3b8;
    transition: transform 0.2s;
}
.yp-trigger.yp-open .yp-chevron { transform: rotate(180deg); }

/* ── Year Picker Dropdown ── */
.yp-dropdown {
    position: fixed;
    z-index: 9999;
    width: 200px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    pointer-events: none;
}
.yp-dropdown.yp-visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

/* ── Wheel container ── */
.yp-wheel-wrapper {
    position: relative;
    height: ${CONTAINER_HEIGHT}px;
    overflow: hidden;
}

.yp-wheel {
    height: ${CONTAINER_HEIGHT}px;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-padding-top: ${ITEM_HEIGHT * 2}px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.yp-wheel::-webkit-scrollbar { display: none; }

.yp-wheel-item {
    height: ${ITEM_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.88rem;
    font-weight: 500;
    color: #94a3b8;
    opacity: 0.3;
    cursor: pointer;
    transition: all 0.12s ease;
    -webkit-user-select: none;
    user-select: none;
    scroll-snap-align: start;
}
.yp-wheel-item.yp-spacer {
    scroll-snap-align: none;
    pointer-events: none;
}
.yp-wheel-item.yp-adjacent {
    font-size: 0.95rem;
    color: #64748b;
    opacity: 0.6;
}
.yp-wheel-item.yp-selected {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e3a5f;
    opacity: 1;
}

/* ── Gradient masks ── */
.yp-mask-top,
.yp-mask-bottom {
    position: absolute;
    left: 0; right: 0;
    height: ${ITEM_HEIGHT * 2}px;
    pointer-events: none;
    z-index: 2;
}
.yp-mask-top {
    top: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%);
}
.yp-mask-bottom {
    bottom: 0;
    background: linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%);
}

/* ── Selection highlight bar ── */
.yp-highlight {
    position: absolute;
    top: ${ITEM_HEIGHT * 2}px;
    left: 10px; right: 10px;
    height: ${ITEM_HEIGHT}px;
    background: rgba(37, 99, 235, 0.06);
    border-top: 1px solid rgba(37, 99, 235, 0.1);
    border-bottom: 1px solid rgba(37, 99, 235, 0.1);
    border-radius: 6px;
    pointer-events: none;
    z-index: 1;
}

/* ── Done button ── */
.yp-done-bar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    border-top: 1px solid #e2e8f0;
}
.yp-done-btn {
    padding: 6px 18px;
    border: none;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font-family: 'Inter', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}
.yp-done-btn:hover { background: #1e3a5f; }
`;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

/**
 * Creates an iOS-style year wheel picker on the given element.
 * @param {HTMLElement} element - input or select element to enhance
 * @param {Object} [options]
 * @param {number} [options.minYear] - earliest year (default 1970)
 * @param {number} [options.maxYear] - latest year (default currentYear - 5)
 * @param {number} [options.defaultYear] - year to scroll to when no value set (default 2005)
 * @param {string} [options.placeholder] - placeholder text
 * @returns {{ getValue, setValue, destroy }}
 */
export function createYearPicker(element, options = {}) {
    injectStyles();

    const currentYear = new Date().getFullYear();
    const minYear = options.minYear || 1970;
    const maxYear = options.maxYear || (currentYear - 5);
    const defaultYear = options.defaultYear || DEFAULT_YEAR;
    const placeholder = options.placeholder || 'Select Year of Birth';

    // Build years newest-first
    const years = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);

    let selectedYear = parseInt(element.value) || null;

    // Hide original element
    element.style.display = 'none';

    // ── Trigger button ──
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'yp-trigger';
    function renderTrigger() {
        trigger.innerHTML = selectedYear
            ? `<span class="yp-value">${selectedYear}</span><i class="fas fa-chevron-down yp-chevron"></i>`
            : `<span class="yp-placeholder">${placeholder}</span><i class="fas fa-chevron-down yp-chevron"></i>`;
    }
    renderTrigger();
    element.parentNode.insertBefore(trigger, element.nextSibling);

    // ── Dropdown ──
    const dropdown = document.createElement('div');
    dropdown.className = 'yp-dropdown';

    const wheelWrapper = document.createElement('div');
    wheelWrapper.className = 'yp-wheel-wrapper';

    wheelWrapper.appendChild(Object.assign(document.createElement('div'), { className: 'yp-highlight' }));
    wheelWrapper.appendChild(Object.assign(document.createElement('div'), { className: 'yp-mask-top' }));
    wheelWrapper.appendChild(Object.assign(document.createElement('div'), { className: 'yp-mask-bottom' }));

    const wheel = document.createElement('div');
    wheel.className = 'yp-wheel';

    // Top spacers (2 items so first year can reach center)
    for (let i = 0; i < 2; i++) {
        const s = document.createElement('div');
        s.className = 'yp-wheel-item yp-spacer';
        wheel.appendChild(s);
    }

    // Year items
    const yearItems = [];
    years.forEach(y => {
        const item = document.createElement('div');
        item.className = 'yp-wheel-item';
        item.dataset.year = y;
        item.textContent = y;
        wheel.appendChild(item);
        yearItems.push(item);
    });

    // Bottom spacers
    for (let i = 0; i < 2; i++) {
        const s = document.createElement('div');
        s.className = 'yp-wheel-item yp-spacer';
        wheel.appendChild(s);
    }

    wheelWrapper.appendChild(wheel);
    dropdown.appendChild(wheelWrapper);

    // Done bar
    const doneBar = document.createElement('div');
    doneBar.className = 'yp-done-bar';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'yp-done-btn';
    doneBtn.textContent = 'Done';
    doneBar.appendChild(doneBtn);
    dropdown.appendChild(doneBar);

    document.body.appendChild(dropdown);

    // ── Helpers ──
    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        const w = Math.max(rect.width, 200);
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.width = w + 'px';
    }

    function getScrollTarget(year) {
        const index = years.indexOf(year);
        if (index === -1) return 0;
        // Snap puts item top at scroll-padding-top (80px from viewport).
        // Item content top = (index + 2 spacers) * ITEM_HEIGHT.
        // scrollTop = itemContentTop - scroll-padding-top
        return (index + 2) * ITEM_HEIGHT - ITEM_HEIGHT * 2;
    }

    function getCenteredIndex() {
        // Find which year item is closest to the highlight bar center (DOM-based, no scroll math)
        const wheelRect = wheel.getBoundingClientRect();
        const highlightCenter = wheelRect.top + ITEM_HEIGHT * 2 + ITEM_HEIGHT / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < yearItems.length; i++) {
            const rect = yearItems[i].getBoundingClientRect();
            const itemCenter = rect.top + rect.height / 2;
            const dist = Math.abs(itemCenter - highlightCenter);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    function updateItemStyles() {
        const ci = getCenteredIndex();
        yearItems.forEach((item, i) => {
            item.classList.remove('yp-selected', 'yp-adjacent');
            if (i === ci) item.classList.add('yp-selected');
            else if (Math.abs(i - ci) === 1) item.classList.add('yp-adjacent');
        });
    }

    // ── Scroll tracking ──
    // CSS scroll-snap handles all snapping. We just read which year ended up centered.
    let scrollRaf = null;
    let settleTimer = null;

    function onScroll() {
        // Update styles on every frame during scroll
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(updateItemStyles);

        // After scrolling stops, record which year is centered
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            const ci = getCenteredIndex();
            if (ci >= 0 && ci < years.length) {
                selectedYear = years[ci];
            }
            updateItemStyles();
        }, 150);
    }
    wheel.addEventListener('scroll', onScroll, { passive: true });

    // ── Mouse wheel: limit to 1 item per tick for precise control on laptops ──
    wheel.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY > 0 ? 1 : -1; // 1 = scroll down (older years), -1 = scroll up (newer)
        const ci = getCenteredIndex();
        const targetIdx = Math.max(0, Math.min(yearItems.length - 1, ci + direction));
        if (targetIdx !== ci) {
            wheel.scrollTo({ top: getScrollTarget(years[targetIdx]), behavior: 'smooth' });
        }
    }, { passive: false });

    // ── Click on year item → scroll it to center ──
    yearItems.forEach(item => {
        item.addEventListener('click', () => {
            const y = parseInt(item.dataset.year);
            selectedYear = y;
            wheel.scrollTo({ top: getScrollTarget(y), behavior: 'smooth' });
        });
    });

    // ── Open / Close ──
    let isOpen = false;
    let valueBeforeOpen = null;

    function open() {
        if (isOpen) return;
        isOpen = true;
        valueBeforeOpen = selectedYear;
        positionDropdown();
        trigger.classList.add('yp-open');
        dropdown.classList.add('yp-visible');

        // Scroll to selected year, or default year, or first year — instant, no animation
        requestAnimationFrame(() => {
            const target = selectedYear || defaultYear;
            wheel.scrollTop = getScrollTarget(target);
            updateItemStyles();
            // If no value was set, track what's centered but don't commit yet
            if (!selectedYear) {
                selectedYear = target;
            }
        });
    }

    function commit() {
        if (!isOpen) return;
        isOpen = false;
        trigger.classList.remove('yp-open');
        dropdown.classList.remove('yp-visible');

        if (selectedYear) {
            element.value = selectedYear;
            renderTrigger();
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function cancel() {
        if (!isOpen) return;
        isOpen = false;
        trigger.classList.remove('yp-open');
        dropdown.classList.remove('yp-visible');
        selectedYear = valueBeforeOpen;
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) commit(); else open();
    });

    doneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        commit();
    });

    // Outside click → cancel
    document.addEventListener('click', (e) => {
        if (isOpen && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            cancel();
        }
    });

    window.addEventListener('resize', () => { if (isOpen) positionDropdown(); });

    // Close picker if user scrolls (fixed dropdown would otherwise float disconnected)
    const onPageScroll = () => { if (isOpen) cancel(); };
    window.addEventListener('scroll', onPageScroll, { passive: true, capture: true });

    // ── Public API ──
    function getValue() { return selectedYear; }

    function setValue(year) {
        if (year === '' || year == null) {
            selectedYear = null;
            element.value = '';
            renderTrigger();
            return;
        }
        const y = parseInt(year);
        if (!isNaN(y) && years.includes(y)) {
            selectedYear = y;
            element.value = y;
            renderTrigger();
        }
    }

    function destroy() {
        trigger.remove();
        dropdown.remove();
        element.style.display = '';
        window.removeEventListener('scroll', onPageScroll, { capture: true });
    }

    element._yearPicker = { getValue, setValue, destroy };
    return { getValue, setValue, destroy };
}

/**
 * Finds all elements with [data-year-picker] and enhances them.
 */
export function initYearPickers() {
    injectStyles();
    document.querySelectorAll('[data-year-picker]').forEach(el => {
        if (el._yearPicker) return;
        const opts = {};
        if (el.dataset.minYear) opts.minYear = parseInt(el.dataset.minYear);
        if (el.dataset.maxYear) opts.maxYear = parseInt(el.dataset.maxYear);
        if (el.dataset.defaultYear) opts.defaultYear = parseInt(el.dataset.defaultYear);
        if (el.dataset.placeholder) opts.placeholder = el.dataset.placeholder;
        createYearPicker(el, opts);
    });
}
