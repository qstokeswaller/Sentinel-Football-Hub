import supabase from './supabase.js';

// URL-based impersonation: ?club=UUID&club_name=Name sets sessionStorage per-tab
(function _checkUrlImpersonation() {
    const params = new URLSearchParams(window.location.search);
    const clubParam = params.get('club');
    if (clubParam) {
        sessionStorage.setItem('impersonating_club_id', clubParam);
        sessionStorage.setItem('impersonating_club_name', params.get('club_name') || '');
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
})();

// Inject impersonation banner immediately (no async wait) if active
(function _earlyBanner() {
    const clubId = sessionStorage.getItem('impersonating_club_id');
    if (!clubId) return;
    if (/platform-admin|login/.test(window.location.pathname)) return;
    const clubName = sessionStorage.getItem('impersonating_club_name') || 'Unknown Club';
    const BH = 40; // fixed banner height in px

    // Inject CSS overrides immediately via <style> — works before DOM is ready
    const style = document.createElement('style');
    style.textContent = `
        #impersonation-banner { position:fixed;top:0;left:0;right:0;height:${BH}px;z-index:9999;background:linear-gradient(135deg,#c8902e,#e6a940);color:#fff;padding:0 24px;display:flex;align-items:center;justify-content:center;gap:12px;font-family:Inter,sans-serif;font-size:0.85rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.15); }
        .sidebar { top:${BH}px !important; height:calc(100vh - ${BH}px) !important; }
        .main-content { padding-top:${BH + 8}px !important; }
        .mobile-top-bar { top:${BH}px !important; }
        @media (max-width: 768px) {
            #impersonation-banner { padding:0 12px; gap:8px; font-size:0.78rem; }
            #impersonation-banner button { padding:3px 10px; font-size:0.72rem; margin-left:4px; }
            .main-content { padding-top:${BH + 56 + 16}px !important; }
        }
    `;
    document.head.appendChild(style);

    function inject() {
        if (document.getElementById('impersonation-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'impersonation-banner';
        banner.innerHTML = `<i class="fas fa-eye" style="font-size:14px"></i><span>Viewing as: <strong>${clubName}</strong></span><button id="btnExitImpersonation" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:4px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;font-family:inherit;margin-left:8px"><i class="fas fa-sign-out-alt" style="margin-right:4px"></i>Exit</button>`;
        document.body.prepend(banner);
        document.getElementById('btnExitImpersonation').addEventListener('click', () => {
            sessionStorage.removeItem('impersonating_club_id');
            sessionStorage.removeItem('impersonating_club_name');
            sessionStorage.removeItem('sidebar-branding');
            window.location.href = '/src/pages/platform-admin.html';
        });
    }
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
})();

// In-memory cache: avoids redundant network calls within the same page load
let _cachedUser = undefined;
let _cachedProfile = undefined;

// sessionStorage key for cross-page profile cache (cleared when browser tab closes)
function _profileCacheKey(userId) { return `sfh_profile_${userId}`; }

/**
 * Redirect to login if not authenticated.
 * Uses getSession() (local JWT check, no network) instead of getUser() (server roundtrip).
 * Supabase RLS policies protect the data regardless, so local session check is safe here.
 */
export async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
        window.location.href = '/';
        return null;
    }
    _cachedUser = user;
    return user;
}

/**
 * Get the current user's profile (includes club info and role).
 * Three-layer cache: in-memory → sessionStorage → network.
 * sessionStorage persists across page navigations within a tab but clears on tab close.
 * Impersonating super_admins are never cached (their club context changes per-tab).
 */
export async function getProfile() {
    if (_cachedProfile) return _cachedProfile;

    let user = _cachedUser;
    if (!user) {
        const { data: { session } } = await supabase.auth.getSession();
        user = session?.user ?? null;
        if (!user) return null;
        _cachedUser = user;
    }

    // Impersonating super_admins skip sessionStorage — their club context is tab-specific
    const impClubId = getImpersonatingClubId();
    const isImpersonating = !!impClubId;

    if (!isImpersonating) {
        try {
            const raw = sessionStorage.getItem(_profileCacheKey(user.id));
            if (raw) {
                _cachedProfile = JSON.parse(raw);
                return _cachedProfile;
            }
        } catch {}
    }

    // When impersonating, fetch the impersonated club in parallel with the profile
    // since we already know the club_id from sessionStorage
    const profileQ = supabase.from('profiles').select('*, clubs(*)').eq('id', user.id).single();
    const clubQ = isImpersonating
        ? supabase.from('clubs').select('*').eq('id', impClubId).single()
        : Promise.resolve({ data: null });

    const [{ data, error }, { data: impClub }] = await Promise.all([profileQ, clubQ]);

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
    _cachedProfile = { ...data, email: user.email };

    // Impersonation overlay — use already-fetched club data
    if (isImpersonating && _cachedProfile.role === 'super_admin' && !_cachedProfile.club_id && impClub) {
        _cachedProfile.club_id = impClub.id;
        _cachedProfile.clubs = impClub;
        _cachedProfile._impersonating = true;
    }

    // Write to sessionStorage for instant access on subsequent page navigations
    if (!isImpersonating) {
        try {
            sessionStorage.setItem(_profileCacheKey(user.id), JSON.stringify(_cachedProfile));
        } catch {}
    }

    return _cachedProfile;
}

/**
 * Invalidate the sessionStorage profile cache (call after profile edits in settings).
 */
export function invalidateProfileCache() {
    if (_cachedUser?.id) {
        try { sessionStorage.removeItem(_profileCacheKey(_cachedUser.id)); } catch {}
    }
    _cachedProfile = undefined;
}

/**
 * Sign in with email and password.
 */
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

/**
 * Sign up with email, password, and metadata (for invite flow).
 */
export async function signup(email, password, metadata = {}) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata }
    });
    if (error) throw error;
    return data;
}

/**
 * Sign out and redirect to login.
 */
export async function logout() {
    _cachedUser = undefined;
    _cachedProfile = undefined;
    localStorage.removeItem('sidebar-branding');
    localStorage.removeItem('sidebar-user');
    sessionStorage.removeItem('sidebar-branding');
    sessionStorage.removeItem('sidebar-user');
    await supabase.auth.signOut();
    window.location.href = '/';
}

/**
 * Get the current authenticated user (no redirect).
 */
export async function getUser() {
    if (_cachedUser) return _cachedUser;
    const { data: { user } } = await supabase.auth.getUser();
    _cachedUser = user;
    return user;
}

// ── Impersonation helpers ──

/**
 * Get the club_id being impersonated (if any).
 */
export function getImpersonatingClubId() {
    return sessionStorage.getItem('impersonating_club_id') || null;
}

/**
 * Get the effective club_id (impersonation takes priority, then profile).
 * Use this everywhere instead of manually checking sessionStorage + profile.
 */
export function getEffectiveClubId() {
    return sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id || null;
}

/**
 * Start impersonating a club. Redirects to dashboard.
 */
export async function startImpersonation(clubId, clubName) {
    sessionStorage.setItem('impersonating_club_id', clubId);
    sessionStorage.setItem('impersonating_club_name', clubName || '');
    _cachedProfile = undefined; // clear cache so profile re-fetches with impersonation

    // Pre-cache the new club's sidebar branding in sessionStorage (per-tab)
    try {
        const { data: club } = await supabase.from('clubs').select('name, settings').eq('id', clubId).single();
        if (club?.settings?.branding) {
            const b = club.settings.branding;
            sessionStorage.setItem('sidebar-branding', JSON.stringify({
                logo_url: b.logo_url || null,
                display_name: b.club_display_name || club.name || 'Football Hub',
            }));
        } else {
            sessionStorage.removeItem('sidebar-branding');
        }
    } catch (e) {
        sessionStorage.removeItem('sidebar-branding');
    }

    window.location.href = '/src/pages/dashboard.html';
}

/**
 * Stop impersonating. Redirects to platform admin.
 */
export function stopImpersonation() {
    sessionStorage.removeItem('impersonating_club_id');
    sessionStorage.removeItem('impersonating_club_name');
    sessionStorage.removeItem('sidebar-branding');
    _cachedProfile = undefined;
    window.location.href = '/src/pages/platform-admin.html';
}
