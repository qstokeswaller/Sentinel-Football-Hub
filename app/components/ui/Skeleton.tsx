import React from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

/**
 * Skeleton loading system — shows page-shaped placeholders instead of a bare
 * spinner while a route's JS chunk downloads (Suspense) and while its data
 * loads (react-query). `RouteSkeleton` reads the URL and renders an outline that
 * matches the destination page so navigation feels instant.
 *
 * Primitives (`Skeleton`, `GridSkeleton`, `ListSkeleton`, `TableSkeleton`,
 * `CalendarSkeleton`) are exported so pages can drop a matching fragment into
 * their own `isLoading` branches.
 */

/** Base shimmer block. `pulse={false}` when a parent wrapper already animates. */
export const Skeleton: React.FC<{ className?: string; pulse?: boolean }> = ({ className, pulse = true }) => (
  <div className={cn('bg-slate-200/80 dark:bg-white/[0.06] rounded-md', pulse && 'animate-pulse', className)} />
);

/** Wrapper that pulses all descendant blocks together (calmer than per-block). */
const Pulse: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('animate-pulse', className)}>{children}</div>
);

const Block: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('bg-slate-200/80 dark:bg-white/[0.06] rounded-md', className)} />
);

const CardShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('bg-white dark:bg-sentinel-surface rounded-xl border border-slate-200 dark:border-sentinel-border shadow-sm', className)}>
    {children}
  </div>
);

/** Page title + subtitle + optional right-hand action buttons. */
export const HeaderSkeleton: React.FC<{ actions?: number }> = ({ actions = 2 }) => (
  <div className="flex items-start justify-between gap-4 mb-5">
    <div className="space-y-2">
      <Block className="h-7 w-48" />
      <Block className="h-3.5 w-64" />
    </div>
    {actions > 0 && (
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        {Array.from({ length: actions }).map((_, i) => <Block key={i} className="h-9 w-24 rounded-lg" />)}
      </div>
    )}
  </div>
);

/** Grid of card placeholders (squad, scouting, library). */
export const GridSkeleton: React.FC<{ count?: number; cols?: string; className?: string }> = ({ count = 8, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', className }) => (
  <Pulse className={cn('grid gap-3', cols, className)}>
    {Array.from({ length: count }).map((_, i) => (
      <CardShell key={i} className="overflow-hidden">
        <Block className="aspect-[3/2] rounded-none rounded-t-xl" />
        <div className="p-3 space-y-2">
          <Block className="h-4 w-3/4" />
          <Block className="h-3 w-1/2" />
        </div>
      </CardShell>
    ))}
  </Pulse>
);

/** Vertical list of rows (matches, reports). */
export const ListSkeleton: React.FC<{ rows?: number; className?: string }> = ({ rows = 6, className }) => (
  <Pulse className={cn('space-y-2', className)}>
    {Array.from({ length: rows }).map((_, i) => (
      <CardShell key={i} className="flex items-center gap-3 p-3.5">
        <Block className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Block className="h-4 w-1/3" />
          <Block className="h-3 w-1/2" />
        </div>
        <Block className="h-8 w-16 rounded-lg shrink-0" />
      </CardShell>
    ))}
  </Pulse>
);

/** Data table with header + rows (analytics, financials). */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number; className?: string }> = ({ rows = 8, cols = 6, className }) => (
  <CardShell className={cn('overflow-hidden', className)}>
    <div className="px-4 py-3 border-b border-slate-100 dark:border-sentinel-border">
      <Block className="h-4 w-40" />
    </div>
    <Pulse className="divide-y divide-slate-100 dark:divide-sentinel-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-4 py-3">
          <Block className="h-4 w-32 shrink-0" />
          <div className="flex-1 flex items-center justify-end gap-6">
            {Array.from({ length: cols - 1 }).map((_, c) => <Block key={c} className="h-4 w-10" />)}
          </div>
        </div>
      ))}
    </Pulse>
  </CardShell>
);

/** Bare 7×6 month grid — drop into an existing calendar container. */
export const MonthGridSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <Pulse className={cn('grid grid-cols-7 gap-1.5', className)}>
    {Array.from({ length: 42 }).map((_, i) => <Block key={i} className="aspect-square rounded-md" />)}
  </Pulse>
);

/** Stacked activity/list rows with an icon (dashboard feed). */
export const ActivityListSkeleton: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className }) => (
  <Pulse className={cn('space-y-3', className)}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Block className="w-9 h-9 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5"><Block className="h-3.5 w-3/4" /><Block className="h-3 w-1/2" /></div>
      </div>
    ))}
  </Pulse>
);

/** Month-calendar grid + activity column (dashboard route skeleton). */
export const CalendarSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
    <CardShell className="p-4">
      <div className="flex items-center justify-between mb-4 animate-pulse">
        <Block className="h-5 w-40" />
        <div className="flex gap-2"><Block className="h-8 w-8 rounded-lg" /><Block className="h-8 w-8 rounded-lg" /></div>
      </div>
      <MonthGridSkeleton />
    </CardShell>
    <CardShell className="p-4 space-y-3">
      <div className="animate-pulse"><Block className="h-5 w-32 mb-1" /></div>
      <ActivityListSkeleton rows={5} />
    </CardShell>
  </div>
);

/** Toolbar row: search input + a couple of dropdowns. */
const ToolbarSkeleton: React.FC = () => (
  <Pulse className="flex flex-wrap items-center gap-2 mb-4">
    <Block className="h-9 flex-1 min-w-[180px] rounded-lg" />
    <Block className="h-9 w-32 rounded-lg" />
    <Block className="h-9 w-28 rounded-lg" />
  </Pulse>
);

/** KPI stat cards row (analytics / financials). */
export const StatsRowSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <Pulse className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    {Array.from({ length: count }).map((_, i) => (
      <CardShell key={i} className="p-4 space-y-2">
        <Block className="h-3 w-20" />
        <Block className="h-6 w-16" />
      </CardShell>
    ))}
  </Pulse>
);

/** Pill-tab strip. */
const TabsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <Pulse className="flex items-center gap-2 mb-4">
    {Array.from({ length: count }).map((_, i) => <Block key={i} className="h-8 w-24 rounded-full" />)}
  </Pulse>
);

export type SkeletonVariant = 'dashboard' | 'cards' | 'list' | 'analytics' | 'detail' | 'builder' | 'settings' | 'generic';

/** Full-page skeleton for a given layout shape. */
export const PageSkeleton: React.FC<{ variant?: SkeletonVariant }> = ({ variant = 'generic' }) => {
  switch (variant) {
    case 'dashboard':
      return <div><HeaderSkeleton actions={1} /><StatsRowSkeleton /><CalendarSkeleton /></div>;
    case 'cards':
      return <div><HeaderSkeleton /><ToolbarSkeleton /><GridSkeleton count={8} /></div>;
    case 'list':
      return <div><HeaderSkeleton /><TabsSkeleton /><ToolbarSkeleton /><ListSkeleton rows={6} /></div>;
    case 'analytics':
      return <div><HeaderSkeleton actions={0} /><ToolbarSkeleton /><StatsRowSkeleton /><TableSkeleton rows={8} /></div>;
    case 'detail':
      return (
        <div>
          <Pulse className="flex items-center gap-4 mb-6">
            <Block className="w-16 h-16 rounded-full shrink-0" />
            <div className="space-y-2"><Block className="h-6 w-52" /><Block className="h-3.5 w-36" /></div>
          </Pulse>
          <TabsSkeleton count={5} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardShell className="lg:col-span-2 p-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Block key={i} className="h-4 w-full" />)}
            </CardShell>
            <CardShell className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Block key={i} className="h-4 w-full" />)}
            </CardShell>
          </div>
        </div>
      );
    case 'builder':
      return (
        <div>
          <HeaderSkeleton actions={3} />
          <Pulse className="flex flex-col lg:flex-row gap-3">
            <Block className="h-[60vh] w-full lg:w-64 rounded-xl shrink-0" />
            <Block className="h-[60vh] flex-1 rounded-xl" />
          </Pulse>
        </div>
      );
    case 'settings':
      return (
        <div>
          <HeaderSkeleton actions={0} />
          <Pulse className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardShell key={i} className="p-5 space-y-3">
                <Block className="h-5 w-40" />
                <Block className="h-4 w-full" />
                <Block className="h-4 w-2/3" />
              </CardShell>
            ))}
          </Pulse>
        </div>
      );
    default:
      return (
        <div>
          <HeaderSkeleton />
          <Pulse className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardShell key={i} className="p-5 space-y-3">
                <Block className="h-5 w-1/3" />
                <Block className="h-4 w-full" />
                <Block className="h-4 w-3/4" />
              </CardShell>
            ))}
          </Pulse>
        </div>
      );
  }
};

/** Map a pathname → skeleton variant. */
export const variantForPath = (path: string): SkeletonVariant => {
  if (/^\/players\/|^\/matches\/[^/]+$/.test(path)) return 'detail';
  if (/^\/planner|^\/animation|^\/match-plan/.test(path)) return 'builder';
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/squad') || path.startsWith('/scouting') || path.startsWith('/library')) return 'cards';
  if (path.startsWith('/matches') || path.startsWith('/reports')) return 'list';
  if (path.startsWith('/analytics') || path.startsWith('/financials')) return 'analytics';
  if (path.startsWith('/settings')) return 'settings';
  return 'generic';
};

/** Suspense fallback — reads the current route and shows a matching outline. */
export const RouteSkeleton: React.FC = () => {
  const { pathname } = useLocation();
  return <PageSkeleton variant={variantForPath(pathname)} />;
};
