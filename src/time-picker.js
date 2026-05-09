/**
 * Flatpickr Time Picker — upgrades <input type="time"> with a clean
 * scrollable time picker UI. Light-themed to match the platform content area.
 *
 * Usage: call `upgradeTimePickers()` after DOM is ready.
 * Existing `.value` get/set on the input continues to work unchanged.
 */
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

let _stylesInjected = false;
function injectTheme() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
        .flatpickr-calendar {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important;
            border-radius: 10px !important;
            font-family: 'Inter', sans-serif !important;
        }
        .flatpickr-time {
            background: #ffffff !important;
            border-top: 1px solid #e2e8f0 !important;
        }
        .flatpickr-time input,
        .flatpickr-time .flatpickr-am-pm {
            color: #1e293b !important;
            font-size: 16px !important;
            font-weight: 600 !important;
        }
        .flatpickr-time input:hover,
        .flatpickr-time input:focus,
        .flatpickr-time .flatpickr-am-pm:hover {
            background: rgba(0, 196, 154, 0.07) !important;
        }
        .flatpickr-time .numInputWrapper span.arrowUp::after {
            border-bottom-color: #00C49A !important;
        }
        .flatpickr-time .numInputWrapper span.arrowDown::after {
            border-top-color: #00C49A !important;
        }
        .flatpickr-time .flatpickr-time-separator {
            color: #64748b !important;
            font-weight: 700 !important;
        }
        /* Input field — match .form-input styling */
        input.flatpickr-input[data-tp-upgraded] {
            background: var(--bg-body, #f8f9fa) !important;
            color: var(--text-dark, #1e293b) !important;
            border: 1px solid var(--border-light, #e2e8f0) !important;
            border-radius: var(--radius-md, 8px) !important;
            padding: 12px 16px !important;
            font-size: 14px !important;
            font-family: 'Inter', sans-serif !important;
            cursor: pointer !important;
            width: 100% !important;
            box-sizing: border-box !important;
            transition: border 0.2s, box-shadow 0.2s !important;
        }
        input.flatpickr-input[data-tp-upgraded]:focus {
            border-color: var(--primary, #00C49A) !important;
            outline: none !important;
            box-shadow: 0 0 0 3px rgba(0, 196, 154, 0.12) !important;
        }
    `;
    document.head.appendChild(s);
}

/**
 * Upgrade a single <input type="time"> to Flatpickr.
 */
export function upgradeTimeInput(input) {
    if (!input || input.dataset.tpUpgraded) return;
    input.dataset.tpUpgraded = '1';
    injectTheme();

    // Change type to text so flatpickr can control it
    input.type = 'text';
    input.readOnly = true;
    input.placeholder = 'Select time';

    flatpickr(input, {
        enableTime: true,
        noCalendar: true,
        dateFormat: 'H:i',
        time_24hr: true,
        minuteIncrement: 5,
        defaultHour: 16,
        defaultMinute: 0,
    });
}

/**
 * Upgrade all <input type="time"> elements on the page.
 */
export function upgradeTimePickers() {
    document.querySelectorAll('input[type="time"]').forEach(upgradeTimeInput);
}
