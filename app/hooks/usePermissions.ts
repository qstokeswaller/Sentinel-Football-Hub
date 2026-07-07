import { useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import {
  roleLevel, ROLE_LEVEL, canEdit, canManage, isSuperAdmin, isPlatformAdmin,
  isViewer, isScout, canAccessScouting, assignableRoles, type Role,
} from '../lib/roles';

/**
 * Reactive RBAC. Reads the current profile from AppStateContext and exposes the
 * grey-out/permission flags the vanilla rbac.js computed into window._can*.
 */
export function usePermissions() {
  const { profile } = useAppState();
  return useMemo(() => ({
    role: (profile?.role ?? null) as Role | null,
    canEdit: canEdit(profile),
    canManage: canManage(profile),
    isSuperAdmin: isSuperAdmin(profile),
    isPlatformAdmin: isPlatformAdmin(profile),
    isViewer: isViewer(profile),
    isScout: isScout(profile),
    canAccessScouting: canAccessScouting(profile),
    assignableRoles: assignableRoles(profile),
    /** role >= the given minimum role */
    atLeast: (min: Role) => roleLevel(profile?.role) >= ROLE_LEVEL[min],
  }), [profile]);
}
