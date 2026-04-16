/**
 * Global Toast Notification System
 * Extracted from api-config.js for reuse across ES modules.
 */
export function showToast(msg, type = 'success') {
    let t = document.getElementById('global-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'global-toast';
        document.body.appendChild(t);

        const style = document.createElement('style');
        style.textContent = `
            #global-toast {
                position: fixed;
                bottom: 30px;
                right: 30px;
                background: #2d3748;
                color: white;
                padding: 14px 24px;
                border-radius: 8px;
                font-family: 'Inter', sans-serif;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            #global-toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            #global-toast.success { border-left: 4px solid #38a169; }
            #global-toast.error { border-left: 4px solid #e53e3e; }
            #global-toast.info { border-left: 4px solid #4299e1; }
        `;
        document.head.appendChild(style);
    }

    t.className = type;
    const icon = type === 'success'
        ? '<i class="fas fa-check-circle" style="color:#48bb78;"></i>'
        : type === 'info'
        ? '<i class="fas fa-info-circle" style="color:#63b3ed;"></i>'
        : '<i class="fas fa-exclamation-circle" style="color:#f56565;"></i>';
    t.innerHTML = `${icon} <span>${msg}</span>`;

    void t.offsetWidth;
    t.classList.add('show');

    if (t.timeoutId) clearTimeout(t.timeoutId);
    t.timeoutId = setTimeout(() => {
        t.classList.remove('show');
    }, 3000);
}

// Also expose globally for backward compatibility with inline onclick handlers
window.showGlobalToast = showToast;
