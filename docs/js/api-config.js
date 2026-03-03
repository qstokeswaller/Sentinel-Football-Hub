/**
 * Global API Configuration
 */
(function () {
    // --- AWS PRODUCTION CONFIGURATION ---
    const AWS_STATIC_IP = '54.170.115.131';
    const PROD_API_URL = `http://${AWS_STATIC_IP}:3002/api`;
    // -------------------------------------

    // --- OLD FALLBACK (same-origin relative path) ---
    // const PROD_API_URL = '/api';
    // ------------------------------------------------

    const currentHost = window.location.hostname;
    const currentPort = window.location.port;

    // Environment Detection
    const isLocalBackend = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isGitHubPages = currentHost.includes('github.io');
    const isStaticMode = currentPort === '5500' || currentPort === '8080' || window.location.protocol === 'file:';

    if (isLocalBackend) {
        // If we are on localhost, always prioritize the local backend
        // If served from the same port, use relative /api
        window.API_BASE_URL = (currentPort === '3002') ? '/api' : 'http://localhost:3002/api';
        window.USE_LOCAL_STORAGE = false;
    } else if (isGitHubPages || isStaticMode) {
        // Fallback for static demo hosting
        window.API_BASE_URL = 'http://localhost:3002/api';
        window.USE_LOCAL_STORAGE = false;
    } else {
        // Production (AWS)
        window.API_BASE_URL = PROD_API_URL;
        window.USE_LOCAL_STORAGE = false;
    }

    console.log('Final API Config:', {
        baseURL: window.API_BASE_URL,
        useLocalStorage: window.USE_LOCAL_STORAGE
    });

    // Global Toast Notification System
    window.showGlobalToast = function (msg, type = 'success') {
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
            `;
            document.head.appendChild(style);
        }

        t.className = type;
        const icon = type === 'success' ? '<i class="fas fa-check-circle" style="color:#48bb78;"></i>' : '<i class="fas fa-exclamation-circle" style="color:#f56565;"></i>';
        t.innerHTML = `${icon} <span>${msg}</span>`;

        void t.offsetWidth; // trigger reflow
        t.classList.add('show');

        if (t.timeoutId) clearTimeout(t.timeoutId);
        t.timeoutId = setTimeout(() => {
            t.classList.remove('show');
        }, 3000);
    };
})();
