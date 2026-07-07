/**
 * Role-Based Access Control — pure helpers (ported from src/rbac.js).
 * The reactive wrapper is hooks/usePermissions; RLS on the backend is the real
 * enforcement — these only drive UI gating/grey-out.
 *
 * Hierarchy: super_admin > admin > scout = coach > viewer
 */
import type { Profile } from '../services/databaseService';

export type Role = 'super_admin' | 'admin' | 'scout' | 'coach' | 'viewer';

export const ROLE_LEVEL: Record<string, number> = {
  super_admin: 4,
  admin: 3,
  scout: 2,
  coach: 2,
  viewer: 1,
};

export function roleLevel(role?: string | null): number {
  return ROLE_LEVEL[role || ''] || 0;
}

export function canEdit(profile?: Profile | null): boolean {
  return roleLevel(profile?.role) >= ROLE_LEVEL.coach;
}

export function canManage(profile?: Profile | null): boolean {
  return roleLevel(profile?.role) >= ROLE_LEVEL.admin;
}

export function isSuperAdmin(profile?: Profile | null): boolean {
  return profile?.role === 'super_admin';
}

/** Platform admins have role = 'super_admin' AND club_id = NULL. */
export function isPlatformAdmin(profile?: Profile | null): boolean {
  return profile?.role === 'super_admin' && !profile?.club_id;
}

export function isViewer(profile?: Profile | null): boolean {
  return profile?.role === 'viewer';
}

export function isScout(profile?: Profile | null): boolean {
  return profile?.role === 'scout';
}

/** Scouts, coaches, admins, super_admins can access scouting features. */
export function canAccessScouting(profile?: Profile | null): boolean {
  return roleLevel(profile?.role) >= ROLE_LEVEL.scout;
}

/** super_admin can assign any role; admin can assign scout/coach/viewer. */
export function assignableRoles(profile?: Profile | null): Role[] {
  if (isSuperAdmin(profile)) return ['admin', 'scout', 'coach', 'viewer'];
  if (canManage(profile)) return ['scout', 'coach', 'viewer'];
  return [];
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  scout: 'Scout',
  coach: 'Coach',
  viewer: 'Viewer',
};

/** Short badge text + class suffix used in the sidebar. */
export const ROLE_BADGE: Record<string, { cls: string; text: string }> = {
  super_admin: { cls: 'dev', text: 'DEV' },
  admin: { cls: 'admin', text: 'ADMIN' },
  scout: { cls: 'scout', text: 'SCOUT' },
  coach: { cls: 'coach', text: 'COACH' },
  viewer: { cls: 'viewer', text: 'VIEW' },
};
