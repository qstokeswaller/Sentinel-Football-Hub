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

// ── Shared platform-style confirm dialog ──────────────────────────────────────
let _confirmEl = null;

function _ensureConfirmEl() {
    if (_confirmEl) return;
    const style = document.createElement('style');
    style.textContent = `
        #sharedConfirmOverlay {
            position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:10000;
            display:none;align-items:center;justify-content:center;padding:20px;
        }
        #sharedConfirmOverlay.active { display:flex; }
        #sharedConfirmBox {
            background:#fff;border-radius:14px;max-width:400px;width:100%;
            box-shadow:0 20px 40px rgba(0,0,0,0.18);overflow:hidden;
        }
        #sharedConfirmBox .sc-header {
            padding:18px 22px 0;
        }
        #sharedConfirmBox .sc-title {
            margin:0;font-size:.98rem;font-weight:700;color:#0f172a;
            display:flex;align-items:center;gap:8px;
        }
        #sharedConfirmBox .sc-body {
            padding:10px 22px 18px;font-size:.85rem;color:#475569;line-height:1.6;
        }
        #sharedConfirmBox .sc-footer {
            padding:14px 22px;border-top:1px solid #f1f5f9;
            display:flex;justify-content:flex-end;gap:8px;background:#fafafa;
            border-radius:0 0 14px 14px;
        }
    `;
    document.head.appendChild(style);

    _confirmEl = document.createElement('div');
    _confirmEl.id = 'sharedConfirmOverlay';
    _confirmEl.innerHTML = `
        <div id="sharedConfirmBox">
            <div class="sc-header">
                <h3 class="sc-title" id="scTitle"></h3>
            </div>
            <div class="sc-body" id="scBody"></div>
            <div class="sc-footer">
                <button id="scCancel" class="dash-btn outline" style="font-size:.85rem;">Cancel</button>
                <button id="scOk" class="dash-btn" style="font-size:.85rem;"></button>
            </div>
        </div>`;
    document.body.appendChild(_confirmEl);
}

export function showConfirm(title, message, { confirmLabel = 'Confirm', isDanger = true, icon = null } = {}) {
    _ensureConfirmEl();
    const iconHtml = icon ? `<i class="fas ${icon}" style="color:${isDanger ? '#ef4444' : '#6366f1'};font-size:.9rem;"></i>` : '';
    document.getElementById('scTitle').innerHTML = `${iconHtml}${title}`;
    document.getElementById('scBody').textContent = message;
    const okBtn = document.getElementById('scOk');
    okBtn.textContent = confirmLabel;
    okBtn.style.cssText = isDanger
        ? 'background:#ef4444;color:#fff;border-color:#ef4444;font-size:.85rem;'
        : 'background:#6366f1;color:#fff;border-color:#6366f1;font-size:.85rem;';
    _confirmEl.classList.add('active');

    return new Promise(resolve => {
        const done = (result) => {
            _confirmEl.classList.remove('active');
            resolve(result);
        };
        const ok = document.getElementById('scOk');
        const cancel = document.getElementById('scCancel');
        const newOk = ok.cloneNode(true);
        newOk.style.cssText = ok.style.cssText;
        newOk.textContent = confirmLabel;
        ok.parentNode.replaceChild(newOk, ok);
        const newCancel = cancel.cloneNode(true);
        cancel.parentNode.replaceChild(newCancel, cancel);
        document.getElementById('scOk').addEventListener('click', () => done(true));
        document.getElementById('scCancel').addEventListener('click', () => done(false));
        const onOverlay = (e) => { if (e.target === _confirmEl) { _confirmEl.removeEventListener('click', onOverlay); done(false); } };
        _confirmEl.addEventListener('click', onOverlay);
    });
}

window.showConfirm = showConfirm;
