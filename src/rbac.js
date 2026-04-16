/**
 * Role-Based Access Control (RBAC) helpers.
 *
 * Role hierarchy (highest → lowest):
 *   super_admin  →  Full platform access, bypass all restrictions
 *   admin        →  Club-level admin. Full CRUD within their club
 *   coach        →  Scoped to assigned squads. Can create sessions/reports for their squads
 *   viewer       →  Read-only access. Optionally scoped to specific squads
 */

const ROLE_LEVEL = {
    super_admin: 4,
    admin: 3,
    scout: 2,
    coach: 2,
    viewer: 1,
};

/** Returns the numeric level of a role (higher = more access) */
export function roleLevel(role) {
    return ROLE_LEVEL[role] || 0;
}

/** Can this user create/edit/delete content? (coach and above) */
export function canEdit(profile) {
    return roleLevel(profile?.role) >= ROLE_LEVEL.coach;
}

/** Can this user manage club settings, squads, users? (admin and above) */
export function canManage(profile) {
    return roleLevel(profile?.role) >= ROLE_LEVEL.admin;
}

/** Is this user a super_admin (developer-level access)? */
export function isSuperAdmin(profile) {
    return profile?.role === 'super_admin';
}

/**
 * Is this user a platform admin (developer who operates above all clubs)?
 * Platform admins have role = 'super_admin' AND club_id = NULL.
 * They can see all clubs, create clubs, manage subscriptions, and impersonate.
 */
export function isPlatformAdmin(profile) {
    return profile?.role === 'super_admin' && !profile?.club_id;
}

/** Is this user a viewer (read-only)? */
export function isViewer(profile) {
    return profile?.role === 'viewer';
}

/** Is this user a scout (scouting-only access)? */
export function isScout(profile) {
    return profile?.role === 'scout';
}

/** Can this user access scouting features? (scouts, coaches, admins, super_admins) */
export function canScout(profile) {
    return roleLevel(profile?.role) >= ROLE_LEVEL.scout;
}

/**
 * Can this user access a specific squad's data?
 * Admins/super_admins can access all squads.
 * Coaches/viewers can only access squads they're assigned to via squad_coaches.
 * @param {object} profile - user profile with .role and .id
 * @param {string} squadId - the squad UUID to check
 * @param {Array} squadCoaches - array of { coach_id, squad_id } from squad_coaches table
 */
export function canAccessSquad(profile, squadId, squadCoaches = []) {
    if (canManage(profile)) return true;
    if (!squadId) return true; // unassigned = accessible to all
    return squadCoaches.some(sc => sc.coach_id === profile.id && sc.squad_id === squadId);
}

/**
 * Can this user edit a specific session/drill/report?
 * Admins can edit anything. Coaches can only edit their own.
 * Viewers cannot edit anything.
 * @param {object} profile - user profile
 * @param {string} createdBy - the creator's user ID
 */
export function canEditItem(profile, createdBy) {
    if (!canEdit(profile)) return false;
    if (canManage(profile)) return true;
    return profile.id === createdBy;
}

/**
 * Get the list of roles that this user is allowed to assign when inviting.
 * super_admin can assign any role. admin can assign coach/viewer.
 */
export function assignableRoles(profile) {
    if (isSuperAdmin(profile)) return ['admin', 'scout', 'coach', 'viewer'];
    if (canManage(profile)) return ['scout', 'coach', 'viewer'];
    return [];
}

/**
 * Human-readable role label
 */
export function roleLabel(role) {
    const labels = {
        super_admin: 'Super Admin',
        admin: 'Admin',
        scout: 'Scout',
        coach: 'Coach',
        viewer: 'Viewer',
    };
    return labels[role] || role;
}

/**
 * Sweep the DOM and guard elements where the user's role is below the required minimum.
 * Elements should have: data-min-role="admin" (or coach, viewer, super_admin)
 *
 * Restricted elements are greyed out and show a toast on click explaining the restriction.
 *
 * @param {object} profile - user profile with .role
 */
export function applyPermissionGuards(profile) {
    if (!profile?.role) return;
    const userLevel = roleLevel(profile.role);

    document.querySelectorAll('[data-min-role]').forEach(el => {
        const requiredLevel = roleLevel(el.dataset.minRole);
        if (userLevel < requiredLevel) {
            // Grey out the element
            el.style.opacity = '0.45';
            el.style.cursor = 'not-allowed';
            el.style.pointerEvents = 'none';
            el.classList.add('permission-denied');

            // Wrap in a container that intercepts clicks and shows a toast
            const wrapper = document.createElement('span');
            wrapper.style.cssText = 'display:inline-block;cursor:not-allowed;pointer-events:auto;';
            el.parentNode.insertBefore(wrapper, el);
            wrapper.appendChild(el);

            wrapper.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const toast = window.showGlobalToast || window.showToast;
                if (toast) {
                    toast('You do not have permission for this action. Contact your administrator to change your role.', 'error');
                }
            });
        }
    });
}
