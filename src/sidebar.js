import './css/style.css';
import { getProfile } from './auth.js';
import { injectSidebarTierBadge } from './tier.js';

/**
 * Injects the shared sidebar into the page and sets up toggle logic.
 * If sidebar-preload.js already injected the sidebar from cache, this
 * function skips HTML injection and just sets active page + wires events.
 * Platform admins get an extra "Platform Admin" nav item.
 * Club feature flags hide disabled nav items.
 */
function _getCachedRoleBadgeHTML(cu) {
    if (!cu?.role) return '';
    const map = { super_admin: 'dev', admin: 'admin', scout: 'scout', coach: 'coach', viewer: 'viewer' };
    const text = { super_admin: 'DEV', admin: 'ADMIN', scout: 'SCOUT', coach: 'COACH', viewer: 'VIEW' };
    const cls = map[cu.role];
    return cls ? `<span class="sidebar-role-badge ${cls}">${text[cu.role]}</span>` : '';
}

export function initSidebar(activePage = '') {
    const container = document.querySelector('.app-container');
    if (!container) return;

    // Read cached branding — sessionStorage for impersonating (per-tab), localStorage for normal users
    const _isImpersonating = !!sessionStorage.getItem('impersonating_club_id');
    const _brandingStore = _isImpersonating ? sessionStorage : localStorage;
    const cached = JSON.parse(_brandingStore.getItem('sidebar-branding') || 'null');
    const cachedUser = JSON.parse(_brandingStore.getItem('sidebar-user') || 'null');
    const cachedLogo = cached?.logo_url;
    const cachedName = cached?.display_name || 'Football Hub';

    const navItemDefs = [
        { href: '/src/pages/dashboard.html', icon: 'fa-th-large', label: 'Dashboard', id: 'dashboard' },
        { href: '/src/pages/planner.html', icon: 'fa-clipboard-list', label: 'Session Planner', id: 'planner', feature: 'session_planner', minTier: 'basic' },
        { href: '/src/pages/library.html', icon: 'fa-book', label: 'Library', id: 'library', feature: 'library', minTier: 'basic' },
        { href: '/src/pages/reports.html', icon: 'fa-file-alt', label: 'Reports', id: 'reports', feature: 'reports', minTier: 'basic' },
        { href: '/src/pages/squad.html', icon: 'fa-user-friends', label: 'Squad & Players', id: 'squad' },
        { href: '/src/pages/matches.html', icon: 'fa-futbol', label: 'Matches', id: 'matches' },
        { href: '/src/pages/analytics.html', icon: 'fa-chart-line', label: 'Analytics', id: 'analytics', feature: 'analytics_dashboard', minTier: 'pro' },
        { href: '/src/pages/scouting.html', icon: 'fa-binoculars', label: 'Scouting', id: 'scouting', minTier: 'basic' },
        { href: '/src/pages/financials.html', icon: 'fa-file-invoice-dollar', label: 'Financials', id: 'financials', feature: 'financials', minTier: 'elite' },
    ];

    // Check if sidebar was already injected by preload script
    const existingSidebar = container.querySelector('.sidebar');

    if (!existingSidebar) {
        // Full injection (fallback if preload not loaded)
        const logoHTML = cachedLogo
            ? `<img src="${cachedLogo}" alt="${cachedName}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`
            : `<i class="fas fa-futbol"></i>`;

        const navHTML = navItemDefs.map(item => {
            const classes = item.id === activePage ? 'active' : '';
            const featureAttr = item.feature ? ` data-feature="${item.feature}"` : '';
            return `<li class="${classes}"${featureAttr}>
                <a href="${item.href}"><i class="fas ${item.icon}"></i><span>${item.label}</span></a>
            </li>`;
        }).join('');

        const sidebarHTML = `
            <aside class="sidebar">
                <div class="sidebar-brand">
                    <div class="sidebar-logo">${logoHTML}</div>
                    <div class="brand-text">
                        <h3>${cachedName}</h3>
                        <p>Sentinel Football Hub</p>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    <ul>${navHTML}</ul>
                </nav>
                <div class="sidebar-footer">
                    <a href="/src/pages/settings.html" class="sidebar-user-info" title="Settings">
                        <div class="sidebar-user-avatar" id="sidebarUserAvatar">${cachedUser?.initials || ''}</div>
                        <div class="sidebar-user-details">
                            <span class="sidebar-user-name" id="sidebarUserName">${cachedUser?.name || ''}</span>
                            <span class="sidebar-user-role" id="sidebarUserRole">${_getCachedRoleBadgeHTML(cachedUser)}</span>
                        </div>
                        <i class="fas fa-cog sidebar-user-cog"></i>
                    </a>
                    <button class="btn-toggle-sidebar" id="toggleSidebar" title="Toggle Sidebar">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                </div>
            </aside>
        `;

        container.insertAdjacentHTML('afterbegin', sidebarHTML);
        container.classList.add('sidebar-loaded');
    } else {
        // Preload already injected — just set active page highlighting
        const navLis = container.querySelectorAll('.sidebar-nav li');
        navLis.forEach(li => li.classList.remove('active'));
        if (activePage) {
            navItemDefs.forEach((item, idx) => {
                if (item.id === activePage && navLis[idx]) {
                    navLis[idx].classList.add('active');
                }
            });
        }
        // Ensure user info is populated from cache (in case preload missed it)
        if (cachedUser) {
            const nameEl = document.getElementById('sidebarUserName');
            const roleEl = document.getElementById('sidebarUserRole');
            const avatarEl = document.getElementById('sidebarUserAvatar');
            if (nameEl && !nameEl.textContent) nameEl.textContent = cachedUser.name || '';
            if (avatarEl && !avatarEl.textContent) avatarEl.textContent = cachedUser.initials || '';
            if (roleEl && !roleEl.innerHTML.trim()) roleEl.innerHTML = _getCachedRoleBadgeHTML(cachedUser);
        }
    }

    // ── Sticky mobile top bar (≤768px, injected once) ──
    if (!document.querySelector('.mobile-top-bar')) {
        const topBar = document.createElement('div');
        topBar.className = 'mobile-top-bar';
        topBar.id = 'mobileTopBar';
        const mtbLogoHTML = cachedLogo
            ? `<img src="${cachedLogo}" alt="${cachedName}" class="mtb-logo" id="mtbLogo">`
            : `<i class="fas fa-futbol mtb-logo-fallback" id="mtbLogo"></i>`;
        topBar.innerHTML = `
            <button class="mtb-hamburger" aria-label="Open menu"><i class="fas fa-bars"></i></button>
            <span class="mtb-title">${cachedName} — Sentinel Football Hub</span>
            ${mtbLogoHTML}
        `;
        document.body.prepend(topBar);

        // Hamburger opens sidebar (reuses existing toggle logic)
        topBar.querySelector('.mtb-hamburger').addEventListener('click', () => {
            const sb = document.querySelector('.sidebar');
            const ov = document.querySelector('.sidebar-overlay');
            if (sb) {
                const isActive = sb.classList.contains('mobile-active');
                sb.classList.toggle('mobile-active', !isActive);
                if (ov) ov.classList.toggle('active', !isActive);
            }
        });
    }

    // Fill in user info asynchronously (non-blocking)
    getProfile().then(profile => {
        if (!profile) return;
        const name = profile.full_name || profile.email || '';
        const roleLabels = { super_admin: 'Super Admin', admin: 'Admin', scout: 'Scout', coach: 'Coach', viewer: 'Viewer' };
        const roleText = roleLabels[profile.role] || profile.role || '';
        const initials = name
            ? name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
            : '?';
        const nameEl = document.getElementById('sidebarUserName');
        const roleEl = document.getElementById('sidebarUserRole');
        const avatarEl = document.getElementById('sidebarUserAvatar');
        if (nameEl) nameEl.textContent = name;
        if (roleEl) {
            const badgeMap = {
                super_admin: { cls: 'dev', text: 'DEV' },
                admin: { cls: 'admin', text: 'ADMIN' },
                scout: { cls: 'scout', text: 'SCOUT' },
                coach: { cls: 'coach', text: 'COACH' },
                viewer: { cls: 'viewer', text: 'VIEW' },
            };
            const badge = badgeMap[profile.role];
            roleEl.innerHTML = badge
                ? `<span class="sidebar-role-badge ${badge.cls}">${badge.text}</span>`
                : roleText;
        }
        if (avatarEl) avatarEl.textContent = initials;

        // Cache user info for instant sidebar preload on next page
        _brandingStore.setItem('sidebar-user', JSON.stringify({
            name, role: profile.role, initials
        }));

        // Inject tier badge into sidebar footer (pass profile directly to avoid window._profile race)
        injectSidebarTierBadge(profile);

        // Scout restriction — scouts only see Dashboard + Scouting
        if (profile.role === 'scout') {
            const allowedIds = ['dashboard', 'scouting'];
            const allNavItems = document.querySelectorAll('.sidebar-nav li');
            navItemDefs.forEach((item, idx) => {
                if (!allowedIds.includes(item.id) && allNavItems[idx]) {
                    allNavItems[idx].style.display = 'none';
                }
            });
        }

        // Feature flags — hide nav items for disabled features
        const features = profile.clubs?.settings?.features;
        // Cache for preload so next page renders correctly without flicker
        _brandingStore.setItem('sidebar-features', JSON.stringify(features || {}));
        if (features) {
            document.querySelectorAll('.sidebar-nav [data-feature]').forEach(el => {
                const featureKey = el.dataset.feature;
                if (features[featureKey] === false) {
                    el.style.display = 'none';
                }
            });
        }

        // Tier-based nav hiding — hides pages not available on the club's tier
        const _tierOrder = ['free', 'basic', 'pro', 'elite'];
        const rawTier = (profile.clubs?.settings?.tier || profile.clubs?.settings?.plan || 'free').toLowerCase();
        const clubTier = _tierOrder.includes(rawTier) ? rawTier : 'free';
        const clubTierIdx = _tierOrder.indexOf(clubTier);
        // Cache tier for sidebar-preload.js on next page load
        _brandingStore.setItem('sidebar-tier', clubTier);

        const allNavLisTier = document.querySelectorAll('.sidebar-nav li');
        navItemDefs.forEach((item, idx) => {
            if (!item.minTier) return;
            const minIdx = _tierOrder.indexOf(item.minTier);
            if (clubTierIdx < minIdx && allNavLisTier[idx]) {
                allNavLisTier[idx].style.display = 'none';
            }
        });

        // Financials — requires elite tier, admin role, AND feature flag not explicitly disabled
        const allNavLis = document.querySelectorAll('.sidebar-nav li');
        const financialsIdx = navItemDefs.findIndex(item => item.id === 'financials');
        if (financialsIdx >= 0 && allNavLis[financialsIdx]) {
            const tierAllowsFinancials = clubTierIdx >= _tierOrder.indexOf('elite');
            const featureAllowsFinancials = !features || features['financials'] !== false;
            const showFinancials = tierAllowsFinancials && featureAllowsFinancials && ['admin', 'super_admin'].includes(profile.role);
            allNavLis[financialsIdx].style.display = showFinancials ? '' : 'none';
        }

        // Club branding — cache for instant render on next page
        const branding = profile.clubs?.settings?.branding;
        const clubName = branding?.club_display_name || profile.clubs?.name;
        const newCache = {
            logo_url: branding?.logo_url || null,
            display_name: clubName || 'Football Hub',
            archetype: profile.clubs?.settings?.archetype || null,
        };
        _brandingStore.setItem('sidebar-branding', JSON.stringify(newCache));

        // Only touch the DOM if the cache wasn't already applied at render time
        const cacheChanged = !cached || cached.logo_url !== newCache.logo_url || cached.display_name !== newCache.display_name;

        // Mobile top bar — set club logo (skip if cache already applied)
        const logoUrl = profile.clubs?.settings?.branding?.logo_url;
        if (cacheChanged && logoUrl) {
            const mtbLogo = document.getElementById('mtbLogo');
            if (mtbLogo) {
                const img = document.createElement('img');
                img.src = logoUrl;
                img.alt = profile.clubs?.name || 'Club';
                img.className = 'mtb-logo';
                img.id = 'mtbLogo';
                img.onerror = () => { img.replaceWith(mtbLogo); };
                mtbLogo.replaceWith(img);
            }
        }

        if (branding) {
            const root = document.documentElement;
            if (branding.primary_color) {
                root.style.setProperty('--primary', branding.primary_color);
                root.style.setProperty('--primary-dark', branding.primary_color);
                root.style.setProperty('--primary-hover', branding.primary_color);
            }
            if (branding.secondary_color) {
                root.style.setProperty('--bg-sidebar', branding.secondary_color);
                root.style.setProperty('--navy-dark', branding.secondary_color);
                const sidebarEl = document.querySelector('.sidebar');
                if (sidebarEl) sidebarEl.style.background = branding.secondary_color;
            }
            if (cacheChanged && branding.logo_url) {
                const logoContainer = document.querySelector('.sidebar-logo');
                if (logoContainer) {
                    const img = document.createElement('img');
                    img.src = branding.logo_url;
                    img.alt = profile.clubs?.name || 'Club Logo';
                    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:inherit;';
                    logoContainer.innerHTML = '';
                    logoContainer.appendChild(img);
                }
            }
            if (cacheChanged && clubName) {
                const brandTitle = document.querySelector('.sidebar-brand h3');
                if (brandTitle) brandTitle.textContent = clubName;
            }
        }
    }).catch(err => { console.error('Sidebar profile error:', err); });

    // Sidebar toggle logic
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggleSidebar');

    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (!sidebar || !mainContent) return;

    // Desktop only (>1024px): restore collapsed state from localStorage
    // At 769–1024px the CSS handles icon-only mode automatically — no JS needed
    if (window.innerWidth > 1024) {
        const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('sidebar-collapsed');
        }
    }

    // Desktop toggle (>1024px only — tablet uses CSS auto-collapse)
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                const nowCollapsed = sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('sidebar-collapsed', nowCollapsed);
                localStorage.setItem('sidebar-collapsed', nowCollapsed);
            }
        });
    }

    // Mobile toggle + overlay
    document.addEventListener('click', (e) => {
        const mobileToggle = e.target.closest('#mobileMenuToggle');
        if (mobileToggle) {
            const isActive = sidebar.classList.contains('mobile-active');
            sidebar.classList.toggle('mobile-active', !isActive);
            overlay.classList.toggle('active', !isActive);
        }
        if (e.target.classList.contains('sidebar-overlay')) {
            sidebar.classList.remove('mobile-active');
            overlay.classList.remove('active');
        }
        if (window.innerWidth <= 768) {
            if (e.target.closest('.sidebar-nav a') || e.target.closest('#toggleSidebar')) {
                sidebar.classList.remove('mobile-active');
                overlay.classList.remove('active');
            }
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-active');
            overlay.classList.remove('active');
        }
        // Remove JS-driven collapsed class at tablet — CSS handles it
        if (window.innerWidth <= 1024 && window.innerWidth > 768) {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('sidebar-collapsed');
        }
    });

    // Page-exit fade: intercept nav link clicks to fade content out before navigation.
    // Skip modifier keys (Ctrl/Cmd/Shift = open in new tab) and same-page links.
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.addEventListener('click', e => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#')) return;
            const mc = document.querySelector('.main-content');
            if (mc && mc.classList.contains('page-ready')) {
                e.preventDefault();
                mc.classList.add('page-exit');
                setTimeout(() => { window.location.href = href; }, 150);
            }
        });
    });
}
