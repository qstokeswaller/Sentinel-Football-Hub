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

/**
 * The shared PageToolbar shape: pill-tabs (or a slim title) on the left, filters + a
 * primary action on the right — one row, no big page title. Matches components/ui/PageToolbar.
 */
export const PageToolbarSkeleton: React.FC<{ tabs?: number; filters?: number; action?: boolean }> = ({ tabs = 3, filters = 2, action = true }) => (
  <Pulse className="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div className="flex items-center gap-2">
      {tabs > 0 ? Array.from({ length: tabs }).map((_, i) => <Block key={i} className="h-9 w-24 rounded-full" />) : <Block className="h-7 w-40" />}
    </div>
    <div className="flex items-center gap-2">
      {Array.from({ length: filters }).map((_, i) => <Block key={i} className="h-9 w-32 rounded-lg" />)}
      {action && <Block className="h-9 w-28 rounded-lg" />}
    </div>
  </Pulse>
);

/** Squad Management cards — a wide info card (identity + counts) with a right-hand schedule column. */
export const SquadCardsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <Pulse className="grid grid-cols-1 xl:grid-cols-2 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <CardShell key={i} className="p-5">
        <div className="flex flex-col md:flex-row md:items-stretch gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Block className="w-11 h-11 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Block className="h-4 w-40" />
              <Block className="h-3 w-52" />
              <Block className="h-4 w-24 mt-1.5" />
              <div className="flex gap-2 pt-0.5"><Block className="h-3 w-9" /><Block className="h-3 w-9" /><Block className="h-3 w-9" /><Block className="h-3 w-9" /></div>
            </div>
          </div>
          <div className="md:w-56 shrink-0 space-y-2 md:border-l border-slate-100 dark:border-white/5 md:pl-4">
            {Array.from({ length: 4 }).map((_, j) => <Block key={j} className="h-3.5 w-full" />)}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex justify-end"><Block className="h-3.5 w-24" /></div>
      </CardShell>
    ))}
  </Pulse>
);

/** Scouting / player cards — avatar top-left, name + sub, verdict pill + report count. */
export const AvatarCardsSkeleton: React.FC<{ count?: number; cols?: string }> = ({ count = 6, cols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }) => (
  <Pulse className={cn('grid gap-4', cols)}>
    {Array.from({ length: count }).map((_, i) => (
      <CardShell key={i} className="p-5">
        <div className="flex items-start gap-3">
          <Block className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 pt-0.5"><Block className="h-4 w-2/3" /><Block className="h-3 w-2/5" /></div>
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <Block className="h-5 w-20 rounded-full" />
          <Block className="h-3 w-16" />
        </div>
        <Block className="h-3 w-1/2 mt-2.5" />
      </CardShell>
    ))}
  </Pulse>
);

/** Fixture / match rows — date block · centred VS · a right-hand action. */
export const MatchRowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <Pulse className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <CardShell key={i} className="p-4 flex items-center gap-4">
        <div className="w-14 text-center space-y-1.5 shrink-0"><Block className="h-3 w-8 mx-auto" /><Block className="h-6 w-9 mx-auto" /></div>
        <div className="flex-1 flex items-center justify-center gap-3">
          <Block className="h-4 w-24" /><Block className="h-7 w-12 rounded-md" /><Block className="h-4 w-24" />
        </div>
        <Block className="h-8 w-24 rounded-lg shrink-0 hidden sm:block" />
      </CardShell>
    ))}
  </Pulse>
);

/** Plain info cards (fees, pricing) — no image tile. */
export const InfoCardsSkeleton: React.FC<{ count?: number; cols?: string }> = ({ count = 3, cols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }) => (
  <Pulse className={cn('grid gap-4', cols)}>
    {Array.from({ length: count }).map((_, i) => (
      <CardShell key={i} className="p-5 space-y-3">
        <div className="flex items-center justify-between"><Block className="h-4 w-28" /><Block className="h-6 w-6 rounded" /></div>
        <Block className="h-7 w-20" /><Block className="h-3 w-32" />
        <Block className="h-9 w-full rounded-lg mt-1" />
      </CardShell>
    ))}
  </Pulse>
);

/** Squad-grouped member rows (the Invoices "By member" collections view). */
export const MemberFeesSkeleton: React.FC<{ groups?: number; rows?: number }> = ({ groups = 2, rows = 4 }) => (
  <Pulse className="space-y-4">
    {Array.from({ length: groups }).map((_, g) => (
      <CardShell key={g} className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-sentinel-border flex items-center justify-between bg-slate-50 dark:bg-sentinel-bg">
          <Block className="h-4 w-44" /><Block className="h-4 w-64 hidden sm:block" />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-sentinel-border">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-3 px-4 py-3">
              <Block className="w-7 h-7 rounded-full shrink-0" /><Block className="h-4 w-32" />
              <div className="flex-1 flex items-center justify-end gap-6"><Block className="h-4 w-12" /><Block className="h-4 w-12" /><Block className="h-4 w-16" /></div>
            </div>
          ))}
        </div>
      </CardShell>
    ))}
  </Pulse>
);

/** Analytics summary — one inline stat row card, then a section (chart/table). */
export const AnalyticsSummarySkeleton: React.FC = () => (
  <Pulse className="space-y-4">
    <div className="flex items-center gap-2"><Block className="h-4 w-4 rounded" /><Block className="h-4 w-40" /></div>
    <CardShell className="px-5 py-3.5 flex flex-wrap items-center gap-x-7 gap-y-2.5">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="space-y-1.5"><Block className="h-2.5 w-12" /><Block className="h-5 w-16" /></div>)}
    </CardShell>
    <CardShell className="p-5 space-y-3"><Block className="h-5 w-44" /><Block className="h-3 w-64" /><Block className="h-44 w-full rounded-lg" /></CardShell>
  </Pulse>
);

export type SkeletonVariant = 'dashboard' | 'squad' | 'scouting' | 'library' | 'matches' | 'reports' | 'analytics' | 'financials' | 'detail' | 'builder' | 'settings' | 'generic';

/** Full-page skeleton for a given layout shape (chunk-load fallback; mirrors each page). */
export const PageSkeleton: React.FC<{ variant?: SkeletonVariant }> = ({ variant = 'generic' }) => {
  switch (variant) {
    case 'dashboard':
      return <div><Pulse className="mb-4"><Block className="h-7 w-44" /></Pulse><CalendarSkeleton /></div>;
    case 'squad':
      return <div><PageToolbarSkeleton tabs={2} filters={3} /><SquadCardsSkeleton count={4} /></div>;
    case 'scouting':
      return <div><PageToolbarSkeleton tabs={0} filters={2} /><AvatarCardsSkeleton count={6} /></div>;
    case 'library':
      return <div><PageToolbarSkeleton tabs={2} filters={3} action={false} /><GridSkeleton count={12} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" /></div>;
    case 'matches':
      return <div><PageToolbarSkeleton tabs={3} filters={2} /><MatchRowsSkeleton rows={6} /></div>;
    case 'reports':
      return <div><PageToolbarSkeleton tabs={4} filters={1} action={false} /><ListSkeleton rows={6} /></div>;
    case 'analytics':
      return <div><PageToolbarSkeleton tabs={2} filters={3} action={false} /><AnalyticsSummarySkeleton /></div>;
    case 'financials':
      return <div><PageToolbarSkeleton tabs={6} filters={0} action={false} /><StatsRowSkeleton /><Pulse className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <CardShell key={i} className="p-5 space-y-3"><Block className="h-5 w-32" />{Array.from({ length: 4 }).map((_, j) => <Block key={j} className="h-4 w-full" />)}</CardShell>)}</Pulse></div>;
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
          <Pulse className="mb-5"><Block className="h-7 w-32" /></Pulse>
          <div className="flex flex-col md:flex-row gap-5">
            <Pulse className="md:w-56 shrink-0 flex md:flex-col gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => <Block key={i} className="h-10 w-full rounded-lg" />)}
            </Pulse>
            <Pulse className="flex-1 space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <CardShell key={i} className="p-5 space-y-3">
                  <Block className="h-5 w-40" /><Block className="h-10 w-full max-w-md rounded-lg" /><Block className="h-10 w-full max-w-md rounded-lg" />
                </CardShell>
              ))}
            </Pulse>
          </div>
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
  if (path.startsWith('/squad')) return 'squad';
  if (path.startsWith('/scouting')) return 'scouting';
  if (path.startsWith('/library')) return 'library';
  if (path.startsWith('/matches')) return 'matches';
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/analytics')) return 'analytics';
  if (path.startsWith('/financials')) return 'financials';
  if (path.startsWith('/settings')) return 'settings';
  return 'generic';
};

/** Suspense fallback — reads the current route and shows a matching outline. */
export const RouteSkeleton: React.FC = () => {
  const { pathname } = useLocation();
  return <PageSkeleton variant={variantForPath(pathname)} />;
};
