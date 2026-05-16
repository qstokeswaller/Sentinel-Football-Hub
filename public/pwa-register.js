// PWA install prompt, iOS install banner
// Injected as <script type="module"> into all HTML pages via vite.config.js pwaMetaPlugin

const IOS_DISMISSED_KEY = 'ios-install-dismissed';

// Unregister any previously installed service worker — we no longer cache files
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
}

// ─── Install Prompt (Android / Chrome / Edge) ─────────────────────────────────

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  document.dispatchEvent(new CustomEvent('pwa-installable'));
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  // Hide any install CTAs
  const cta = document.getElementById('pwa-install-cta');
  if (cta) cta.style.display = 'none';
});

window.triggerPWAInstall = async () => {
  if (!installPrompt) return false;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  return outcome === 'accepted';
};

window.isPWAInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// Show install CTA on landing pages once the browser deems it installable
document.addEventListener('pwa-installable', () => {
  if (window.isPWAInstalled()) return;
  const cta = document.getElementById('pwa-install-cta');
  if (cta) cta.style.display = 'block';
});

// ─── iOS Install Banner (dashboard page only) ─────────────────────────────────

if (window.location.pathname.includes('dashboard.html')) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !window.isPWAInstalled() && !localStorage.getItem(IOS_DISMISSED_KEY)) {
    injectPWAStyles();
    const banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.innerHTML = `
      <div class="ios-install-inner">
        <div class="ios-install-text">
          <strong>Install Football Hub</strong>
          <span>Tap the share icon then <em>Add to Home Screen</em></span>
        </div>
        <button id="ios-install-dismiss" aria-label="Dismiss">&#x2715;</button>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById('ios-install-dismiss').onclick = () => {
      banner.remove();
      localStorage.setItem(IOS_DISMISSED_KEY, '1');
    };
  }
}

// ─── Injected styles (loaded once, idempotent) ────────────────────────────────

function injectPWAStyles() {
  if (document.getElementById('pwa-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'pwa-ui-styles';
  style.textContent = `
    #pwa-update-banner {
      position: fixed;
      bottom: 1.5rem;
      left: 1.5rem;
      z-index: 9999;
      background: #12181F;
      border: 1px solid #1e2a38;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      padding: 1rem 1.25rem;
      max-width: 360px;
      animation: pwa-slide-in 0.25s ease;
    }
    #pwa-update-banner.pwa-update-force {
      border-color: #00C49A;
    }
    .pwa-update-inner {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .pwa-update-msg {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
      font-size: 0.9rem;
      font-weight: 500;
      font-family: Inter, system-ui, sans-serif;
    }
    .pwa-update-msg svg { color: #00C49A; flex-shrink: 0; }
    .pwa-update-actions {
      display: flex;
      gap: 0.5rem;
    }
    #pwa-update-now {
      padding: 0.45rem 1rem;
      background: #00C49A;
      color: #080B0F;
      font-weight: 600;
      font-size: 0.85rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: Inter, system-ui, sans-serif;
    }
    #pwa-update-now:hover { background: #00a884; }
    #pwa-update-later {
      padding: 0.45rem 1rem;
      background: transparent;
      color: #94a3b8;
      font-size: 0.85rem;
      border: 1px solid #1e2a38;
      border-radius: 6px;
      cursor: pointer;
      font-family: Inter, system-ui, sans-serif;
    }
    #pwa-update-later:hover { color: #f8fafc; }
    #ios-install-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #12181F;
      border-top: 1px solid #1e2a38;
      padding: 1rem 1.25rem;
      animation: pwa-slide-up 0.25s ease;
    }
    .ios-install-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      max-width: 600px;
      margin: 0 auto;
    }
    .ios-install-text {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-family: Inter, system-ui, sans-serif;
    }
    .ios-install-text strong { color: #f8fafc; font-size: 0.9rem; }
    .ios-install-text span { color: #94a3b8; font-size: 0.82rem; }
    #ios-install-dismiss {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.1rem;
      cursor: pointer;
      padding: 0.25rem;
      flex-shrink: 0;
    }
    @keyframes pwa-slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pwa-slide-up {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
