// Synchronous sidebar + theme preload — must be a regular <script> (not module) in <head>.
// Uses MutationObserver to inject sidebar HTML from cache the instant
// .app-container appears in the DOM, BEFORE module scripts load or execute.
// This eliminates the flash of no-sidebar between HTML parse and JS hydration.
//
// Theme: reads sentinel-theme from localStorage and sets data-theme on <html>
// BEFORE first paint to prevent flash of wrong theme.
//
// Cache strategy: impersonating super_admins use sessionStorage (per-tab) so
// multiple club tabs don't overwrite each other. Regular users use localStorage
// so branding persists across tabs and new-tab opens.
(function () {
    // ── Theme preload (must be first — affects all CSS) ──
    try {
        var savedTheme = localStorage.getItem('sentinel-theme');
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    } catch (e) {}

    // ── Detect impersonation from URL params (before auth.js runs) ──
    var urlParams = null;
    try { urlParams = new URLSearchParams(window.location.search); } catch (e) {}
    var urlClubId = urlParams && urlParams.get('club');
    var isImpersonating = !!sessionStorage.getItem('impersonating_club_id') || !!urlClubId;

    if (urlClubId && urlParams) {
        var urlName = urlParams.get('club_display') || urlParams.get('club_name') || '';
        var urlLogo = urlParams.get('club_logo') || '';
        var urlArchetype = urlParams.get('club_archetype') || '';
        if (urlName) {
            sessionStorage.setItem('impersonating_club_id', urlClubId);
            sessionStorage.setItem('impersonating_club_name', urlParams.get('club_name') || urlName);
            sessionStorage.setItem('sidebar-branding', JSON.stringify({
                logo_url: urlLogo || null,
                display_name: urlName,
                archetype: urlArchetype || null,
            }));
        }
    }

    var store = isImpersonating ? sessionStorage : localStorage;
    var cached = null;
    var cachedUser = null;
    try {
        cached = JSON.parse(store.getItem('sidebar-branding'));
    } catch (e) {}
    try {
        cachedUser = JSON.parse(store.getItem('sidebar-user'));
    } catch (e) {}
    var cachedSeason = null;
    try { cachedSeason = JSON.parse(store.getItem('sidebar-season')); } catch (e) {}
    var logo = cached && cached.logo_url;
    var name = (cached && cached.display_name) || 'Football Hub';
    var collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    var isDesktop = window.innerWidth > 768;

    var logoHTML = logo
        ? '<img src="' + logo + '" alt="' + name + '" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">'
        : '<i class="fas fa-futbol"></i>';

    var navItems = [
        { href: '/src/pages/dashboard.html', icon: 'fa-th-large', label: 'Dashboard', id: 'dashboard' },
        { href: '/src/pages/planner.html', icon: 'fa-clipboard-list', label: 'Session Planner', id: 'planner', feature: 'session_planner' },
        { href: '/src/pages/library.html', icon: 'fa-book', label: 'Library', id: 'library', feature: 'library' },
        { href: '/src/pages/reports.html', icon: 'fa-file-alt', label: 'Reports', id: 'reports', feature: 'reports' },
        { href: '/src/pages/squad.html', icon: 'fa-user-friends', label: 'Squad & Players', id: 'squad' },
        { href: '/src/pages/matches.html', icon: 'fa-futbol', label: 'Matches', id: 'matches' },
        { href: '/src/pages/analytics.html', icon: 'fa-chart-line', label: 'Analytics', id: 'analytics', feature: 'analytics_dashboard' },
        { href: '/src/pages/scouting.html', icon: 'fa-binoculars', label: 'Scouting', id: 'scouting' },
        { href: '/src/pages/financials.html', icon: 'fa-file-invoice-dollar', label: 'Financials', id: 'financials', requireArchetype: 'private_coaching', requireRole: true },
    ];

    // Determine visibility for role/archetype-gated items using cached data
    var cachedArchetype = cached && cached.archetype;
    var cachedRole = cachedUser && cachedUser.role;
    var isAdminRole = cachedRole === 'admin' || cachedRole === 'super_admin';

    var navHTML = '';
    for (var i = 0; i < navItems.length; i++) {
        var item = navItems[i];
        var featureAttr = item.feature ? ' data-feature="' + item.feature + '"' : '';
        var hidden = false;
        if (item.requireArchetype && cachedArchetype && cachedArchetype !== item.requireArchetype) hidden = true;
        if (item.requireRole && cachedRole && !isAdminRole) hidden = true;
        if (item.requireArchetype && !cachedArchetype) hidden = true;
        var hiddenAttr = hidden ? ' style="display:none"' : '';
        navHTML += '<li' + featureAttr + hiddenAttr + '><a href="' + item.href + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></a></li>';
    }

    // Pre-populate user info from cache to prevent flash
    var userInitials = (cachedUser && cachedUser.initials) || '';
    var userName = (cachedUser && cachedUser.name) || '';
    var userRoleHTML = '';
    if (cachedUser && cachedUser.role) {
        var badgeMap = {
            super_admin: { cls: 'dev', text: 'DEV' },
            admin: { cls: 'admin', text: 'ADMIN' },
            scout: { cls: 'scout', text: 'SCOUT' },
            coach: { cls: 'coach', text: 'COACH' },
            viewer: { cls: 'viewer', text: 'VIEW' }
        };
        var badge = badgeMap[cachedUser.role];
        if (badge) {
            userRoleHTML = '<span class="sidebar-role-badge ' + badge.cls + '">' + badge.text + '</span>';
        }
    }

    var sidebarHTML =
        '<aside class="sidebar' + (isDesktop && collapsed ? ' collapsed' : '') + '">' +
            '<div class="sidebar-brand">' +
                '<div class="sidebar-logo">' + logoHTML + '</div>' +
                '<div class="brand-text"><h3>' + name + '</h3><p>Sentinel Football Hub</p></div>' +
            '</div>' +
            '<nav class="sidebar-nav"><ul>' + navHTML + '</ul></nav>' +
            '<div class="sidebar-footer">' +
                (cachedSeason && cachedSeason.name
                    ? '<div class="sidebar-season-chip" id="sidebarSeasonChip"><i class="fas fa-calendar-alt"></i><span>' + cachedSeason.name + '</span></div>'
                    : '<div class="sidebar-season-chip" id="sidebarSeasonChip" style="display:none;"><i class="fas fa-calendar-alt"></i><span></span></div>') +
                '<a href="/src/pages/settings.html" class="sidebar-user-info" title="Settings">' +
                    '<div class="sidebar-user-avatar" id="sidebarUserAvatar">' + userInitials + '</div>' +
                    '<div class="sidebar-user-details">' +
                        '<span class="sidebar-user-name" id="sidebarUserName">' + userName + '</span>' +
                        '<span class="sidebar-user-role" id="sidebarUserRole">' + userRoleHTML + '</span>' +
                    '</div>' +
                    '<i class="fas fa-cog sidebar-user-cog"></i>' +
                '</a>' +
                '<button class="btn-toggle-sidebar" id="toggleSidebar" title="Toggle Sidebar">' +
                    '<i class="fas fa-chevron-left"></i>' +
                '</button>' +
            '</div>' +
        '</aside>';

    function inject(container) {
        if (container.querySelector('.sidebar')) return;
        container.insertAdjacentHTML('afterbegin', sidebarHTML);
        container.classList.add('sidebar-loaded');
        if (isDesktop && collapsed) {
            var mc = container.querySelector('.main-content');
            if (mc) mc.classList.add('sidebar-collapsed');
        }
    }

    // Try to inject immediately (if body already parsed, e.g. script at bottom)
    var existing = document.querySelector('.app-container');
    if (existing) { inject(existing); return; }

    // Otherwise watch for .app-container to appear during parsing
    var observer = new MutationObserver(function () {
        var container = document.querySelector('.app-container');
        if (container) {
            observer.disconnect();
            inject(container);
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
