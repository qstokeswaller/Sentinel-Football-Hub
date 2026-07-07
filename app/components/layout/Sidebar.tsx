import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, BookOpen, FileText, Users, Trophy,
  LineChart, Binoculars, FileSpreadsheet, ShieldCheck, Settings as SettingsIcon,
  LogOut, ChevronLeft,
} from 'lucide-react';
import { PitchIcon } from '../ui/PitchIcon';
import { useAuth } from '../../context/AuthContext';
import { useAppState } from '../../context/AppStateContext';
import { usePermissions } from '../../hooks/usePermissions';
import { ROLE_BADGE } from '../../lib/roles';
import { tierIndex, type Tier } from '../../lib/tiers';
import { cn } from '../../lib/utils';

/**
 * ONE Sidebar component — replaces src/sidebar.js + the two sidebar-preload.js
 * copies. Mounts once (outside <Routes>) so the shell→real swap flicker is gone.
 * Ports the full gating from sidebar.js + page-init.js: tier, feature flags,
 * scout restriction, financials rule, archetype label, branding, role/tier badges.
 */

interface NavDef { to: string; icon: React.ElementType; label: string; id: string; feature?: string; minTier?: Tier; }

const NAV: NavDef[] = [
  { to: '/dashboard',  icon: LayoutGrid,      label: 'Dashboard',       id: 'dashboard' },
  { to: '/planner',    icon: PitchIcon,       label: 'Designer',        id: 'planner',   feature: 'session_planner',   minTier: 'basic' },
  { to: '/library',    icon: BookOpen,        label: 'Library',         id: 'library',   feature: 'library',           minTier: 'basic' },
  { to: '/reports',    icon: FileText,        label: 'Reports',         id: 'reports',   feature: 'reports',           minTier: 'basic' },
  { to: '/squad',      icon: Users,           label: 'Squad',           id: 'squad' },
  { to: '/matches',    icon: Trophy,          label: 'Matches',         id: 'matches' },
  { to: '/analytics',  icon: LineChart,       label: 'Analytics',       id: 'analytics', feature: 'analytics_dashboard', minTier: 'pro' },
  { to: '/scouting',   icon: Binoculars,      label: 'Scouting',        id: 'scouting',  minTier: 'basic' },
  { to: '/financials', icon: FileSpreadsheet, label: 'Financials',      id: 'financials',feature: 'financials',        minTier: 'elite' },
];

const ROLE_BADGE_STYLE: Record<string, string> = {
  dev:    'bg-violet-500/15 text-violet-300',
  admin:  'bg-sky-500/15 text-sky-300',
  scout:  'bg-amber-500/15 text-amber-300',
  coach:  'bg-brand/15 text-brand',
  viewer: 'bg-slate-500/20 text-slate-300',
};

export const Sidebar: React.FC<{ mobileOpen?: boolean; onClose?: () => void }> = ({ mobileOpen = false, onClose }) => {
  const { user, signOut } = useAuth();
  const { profile, club, tier, archetype, role } = useAppState();
  const { isPlatformAdmin } = usePermissions();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
    return next;
  });

  const features = club?.settings?.features;
  const tierIdx = tierIndex(tier);

  const isVisible = (item: NavDef): boolean => {
    // Scouts only see Dashboard + Scouting
    if (role === 'scout') return item.id === 'dashboard' || item.id === 'scouting';
    // Financials: elite tier + feature not disabled + admin/super_admin
    if (item.id === 'financials') {
      const tierOk = tierIdx >= tierIndex('elite');
      const featureOk = !features || features['financials'] !== false;
      return tierOk && featureOk && (role === 'admin' || role === 'super_admin');
    }
    // Feature flag disabled
    if (item.feature && features?.[item.feature] === false) return false;
    // Below required tier
    if (item.minTier && tierIdx < tierIndex(item.minTier)) return false;
    return true;
  };

  const navItems = NAV.filter(isVisible);

  // Branding + archetype label
  const branding = club?.settings?.branding;
  const displayName = branding?.club_display_name || club?.name || 'Football Hub';
  const logoUrl = branding?.logo_url || null;
  const labelFor = (item: NavDef) =>
    item.id === 'squad'
      ? (archetype === 'private_coaching' ? 'Players' : 'Squad')
      : item.label;

  const fullName = profile?.full_name || user?.email || 'Coach';
  // Footer shows just the first name to keep the sidebar narrow; full name on hover.
  const firstName = (profile?.full_name?.trim().split(/\s+/)[0]) || user?.email?.split('@')[0] || 'Coach';
  const initials = fullName.trim().split(/[\s@]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const badge = role ? ROLE_BADGE[role] : null;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={onClose} />}
      <aside
        data-tour="sidebar-nav"
        className={cn(
          'bg-sentinel-sidebar text-slate-300 flex flex-col h-full',
          // Mobile: off-canvas overlay that slides in. Desktop: normal static column.
          'fixed inset-y-0 left-0 z-50 w-[210px] transition-transform duration-200 lg:static lg:z-auto lg:shrink-0 lg:transition-[width]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-[210px]',
        )}
      >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
          {/* Club logo on its own (no coloured box); Sentinel brand mark when a club has no logo. */}
          <img src={logoUrl || '/logo.svg'} alt={displayName} className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="leading-tight min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{displayName}</h3>
            <p className="text-[9px] uppercase tracking-wider text-brand truncate">Sentinel Football Hub</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" onClick={onClose}>
        <ul className="space-y-0.5 px-2.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  title={collapsed ? labelFor(item) : undefined}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors',
                    collapsed && 'justify-center',
                    isActive ? 'bg-brand text-sentinel-sidebar font-semibold' : 'text-white/75 hover:bg-white/[0.08] hover:text-white',
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{labelFor(item)}</span>}
                </NavLink>
              </li>
            );
          })}

          {/* Platform Admin — only for platform super_admins (not impersonating) */}
          {isPlatformAdmin && (
            <li>
              <NavLink
                to="/platform-admin"
                title={collapsed ? 'Platform Admin' : undefined}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors',
                  collapsed && 'justify-center',
                  isActive ? 'bg-violet-500 text-white font-semibold' : 'text-white/75 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <ShieldCheck size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">Platform Admin</span>}
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      {/* Footer — user identity, then a dedicated Settings row (SportsLab-style), then
          utility controls (collapse + sign out). Email/plan live in Settings, not here. */}
      <div className="border-t border-white/10 p-3 space-y-1 shrink-0">
        {/* User identity — pure identity now; Settings is its own row below. */}
        <div className={cn('flex items-center gap-3 px-3 py-2', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-brand/20 text-brand flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white truncate" title={fullName}>{firstName}</span>
                {badge && (
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide', ROLE_BADGE_STYLE[badge.cls])}>
                    {badge.text}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 truncate block">{displayName}</span>
            </div>
          )}
        </div>

        {/* Settings — its own full-width row beneath the user, like SportsLab. */}
        <NavLink
          to="/settings"
          onClick={onClose}
          data-tour="settings-button"
          title="Settings"
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors',
            collapsed && 'justify-center',
            isActive ? 'bg-brand text-sentinel-sidebar font-semibold' : 'text-white/75 hover:bg-white/[0.08] hover:text-white',
          )}
        >
          <SettingsIcon size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">Settings</span>}
        </NavLink>

        {/* Utility controls — collapse (desktop) + sign out. */}
        <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')}>
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-white/5 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} className={cn('transition-transform', collapsed && 'rotate-180')} />
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-white/5 hover:text-rose-300 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
};
