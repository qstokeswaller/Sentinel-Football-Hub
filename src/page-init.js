/**
 * Shared page initialization for all authenticated pages.
 * Sets up auth guard, sidebar, toast, and managers as globals.
 */
import { requireAuth, getProfile, logout, getImpersonatingClubId, stopImpersonation } from './auth.js';
import { initSidebar } from './sidebar.js';
import './toast.js';
import './analytics.js';
import { initCustomSelects, enableAutoInit } from './js/custom-select.js';
import supabase from './supabase.js';
import squadManager from './managers/squad-manager.js';
import matchManager from './managers/match-manager.js';
import { applyPermissionGuards, canEdit, canManage, isSuperAdmin, isViewer, isPlatformAdmin } from './rbac.js';
import { applyTierGates } from './tier.js';

// Expose globally for UI scripts
window.supabase = supabase;
window.squadManager = squadManager;
window.matchManager = matchManager;
window.logout = logout;
window.initCustomSelects = initCustomSelects;

/**
 * Initialize an authenticated page.
 * @param {string} pageName - Sidebar active page ID
 * @param {object} opts - { squad: bool, match: bool } — which managers to init
 * @returns {object|null} user object, or null if not authenticated
 */
export async function initPage(pageName, opts = {}) {
    // URL-based impersonation is handled in auth.js module init

    // Render sidebar immediately from localStorage cache (no network wait)
    initSidebar(pageName);

    const user = await requireAuth();
    if (!user) return null;

    // Fetch profile first (cached from requireAuth, no extra network call)
    const profile = await getProfile();

    // Apply role-based permission guards immediately
    if (profile) {
        // Block access if club subscription is paused (except super_admin / platform_admin)
        const clubStatus = profile.clubs?.settings?.status;
        const isPrivileged = profile.role === 'super_admin' || profile.role === 'platform_admin';
        if (clubStatus === 'paused' && !isPrivileged) {
            document.body.innerHTML = `
                <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;font-family:'Inter',sans-serif;padding:32px;text-align:center;">
                    <div style="font-size:3rem;margin-bottom:16px;">⏸️</div>
                    <h1 style="font-size:1.5rem;font-weight:700;color:#1e293b;margin-bottom:8px;">Subscription Paused</h1>
                    <p style="color:#64748b;max-width:400px;line-height:1.6;margin-bottom:24px;">
                        Your club's subscription has been paused. Please contact your administrator or reach out to
                        <a href="mailto:stokeswallerq@gmail.com" style="color:#00C49A;">support</a> to restore access.
                    </p>
                    <a href="/src/pages/login.html" style="font-size:0.85rem;color:#94a3b8;">Sign out</a>
                </div>`;
            return null;
        }

        applyPermissionGuards(profile);
        window._profile = profile;
        window._canEdit = canEdit(profile);
        window._canManage = canManage(profile);
        window._isSuperAdmin = isSuperAdmin(profile);
        window._isPlatformAdmin = isPlatformAdmin(profile);
        window._isViewer = isViewer(profile);
        // Apply tier feature gates (locks tabs/sections for lower tiers)
        applyTierGates();
    }

    // Now run managers + coach squad query ALL in parallel
    // Pass clubId to managers so they skip redundant auth.getUser() + profile fetch
    const clubId = profile?.club_id || null;
    const parallelInits = [];
    if (opts.squad !== false) parallelInits.push(squadManager.init(clubId));
    if (opts.match) parallelInits.push(matchManager.init(clubId));

    // Coach squad scoping query runs in parallel with manager inits
    const needCoachScoping = profile && (profile.role === 'coach' || profile.role === 'viewer');
    if (needCoachScoping) {
        parallelInits.push(
            supabase.from('squad_coaches').select('squad_id').eq('coach_id', profile.id)
                .then(({ data }) => { window._coachSquadIds = (data || []).map(sc => sc.squad_id); })
                .catch(() => { window._coachSquadIds = []; })
        );
    } else {
        window._coachSquadIds = null;
    }

    if (parallelInits.length > 0) await Promise.all(parallelInits);

    // Reveal main content now that auth, profile, and feature flags are applied
    const mc = document.querySelector('.main-content');
    if (mc) mc.classList.add('page-ready');

    // Auto-trigger walkthrough on first visit or if ?walkthrough=1 in URL
    // Initialise custom selects on all current selects, and watch for new ones added dynamically
    initCustomSelects();
    enableAutoInit();

    try {
        const { autoWalkthrough, startWalkthrough, initWalkthroughs } = await import('./js/walkthrough.js');
        // Pass user object so initWalkthroughs skips a redundant getUser() network call
        await initWalkthroughs(user?.id, supabase, user);
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('walkthrough') === '1') {
            startWalkthrough(pageName, true);
            window.history.replaceState({}, '', window.location.pathname);
        } else {
            autoWalkthrough(pageName);
        }
    } catch (e) { /* walkthrough module load failed — non-fatal */ }

    return user;
}

/**
 * Check if the current user should see only specific squads.
 * Returns null for admins (no filtering), or array of squad IDs for coaches/viewers.
 */
export function getCoachSquadIds() {
    return window._coachSquadIds ?? null;
}

/**
 * Check if a given squad ID is accessible to the current user.
 * Admins can access all; coaches/viewers only their assigned squads.
 */
export function canAccessSquad(squadId) {
    const ids = getCoachSquadIds();
    if (ids === null) return true; // admin — no restriction
    if (!squadId) return true; // unassigned / null squad
    return ids.includes(squadId);
}

export { supabase, squadManager, matchManager, getProfile, applyPermissionGuards };
