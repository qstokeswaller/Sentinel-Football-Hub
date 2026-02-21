/**
 * Global API Configuration
 */
(function () {
    // --- AWS PRODUCTION CONFIGURATION ---
    // If you have a live AWS URL, paste it here (e.g., 'http://your-ec2-ip:3001/api')
    // If left as '/api', it assumes the frontend and backend are on the same domain.
    const PROD_API_URL = '/api';
    // -------------------------------------

    const currentHost = window.location.hostname;
    const currentPort = window.location.port;

    // Default configuration (Same-origin API)
    window.API_BASE_URL = PROD_API_URL;
    window.USE_LOCAL_STORAGE = false;

    // Detection for Local Development (Node.js backend)
    const isLocalBackend = currentHost === 'localhost' || currentHost === '127.0.0.1';

    // Detection for Static Hosting (GitHub Pages / port 5500 / file://)
    const isGitHubPages = currentHost.includes('github.io');
    const isStaticMode = currentPort === '5500' || currentPort === '8080' || window.location.protocol === 'file:';

    if (isGitHubPages || isStaticMode) {
        console.log('Environment: Static/Demo Mode detected. FORCING API for live testing.');
        window.API_BASE_URL = 'http://localhost:3001/api';
        window.USE_LOCAL_STORAGE = false; // Forced off as per user request
    } else if (isLocalBackend && currentPort !== '3001') {
        // If frontend is on 5500/8080 but wants to talk to local backend on 3001
        // We typically handle this by manually setting isStaticMode above,
        // but for a smooth 'npm start' experience on localhost:3001, we use relative /api.
        window.API_BASE_URL = 'http://localhost:3001/api';
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
