// PWA registration, update banner, install prompt, iOS install banner
// Injected as <script type="module"> into all HTML pages via vite.config.js pwaMetaPlugin

const UPDATE_DEFERRED_KEY = 'pwa-update-deferred';
const IOS_DISMISSED_KEY = 'ios-install-dismissed';

// ─── Service Worker Registration & Update Handling ───────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Check for updates immediately on each page load
        registration.update();

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            // New version installed and waiting — existing SW still controlling the page
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              handleUpdateAvailable(newWorker);
            }
          });
        });
      })
      .catch((err) => console.warn('[PWA] SW registration failed:', err));

    // When new SW takes control, reload to serve fresh assets
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

function handleUpdateAvailable(newWorker) {
  const deferred = parseInt(localStorage.getItem(UPDATE_DEFERRED_KEY) || '0', 10);
  if (deferred >= 3) {
    showForceUpdateBanner(newWorker);
    localStorage.removeItem(UPDATE_DEFERRED_KEY);
  } else {
    showUpdateBanner(newWorker, deferred);
  }
}

function activateUpdate(newWorker) {
  newWorker.postMessage({ type: 'SKIP_WAITING' });
}

function showUpdateBanner(newWorker, deferCount) {
  if (document.getElementById('pwa-update-banner')) return;
  injectPWAStyles();

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.innerHTML = `
    <div class="pwa-update-inner">
      <span class="pwa-update-msg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
        A new version is available
      </span>
      <div class="pwa-update-actions">
        <button id="pwa-update-now">Update now</button>
        <button id="pwa-update-later">Later</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-update-now').onclick = () => {
    banner.remove();
    activateUpdate(newWorker);
  };
  document.getElementById('pwa-update-later').onclick = () => {
    banner.remove();
    localStorage.setItem(UPDATE_DEFERRED_KEY, String(deferCount + 1));
  };
}

function showForceUpdateBanner(newWorker) {
  if (document.getElementById('pwa-update-banner')) return;
  injectPWAStyles();

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.classList.add('pwa-update-force');
  banner.innerHTML = `
    <div class="pwa-update-inner">
      <span class="pwa-update-msg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
        This update is required to continue
      </span>
      <div class="pwa-update-actions">
        <button id="pwa-update-now">Update now</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-update-now').onclick = () => {
    banner.remove();
    activateUpdate(newWorker);
  };
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
