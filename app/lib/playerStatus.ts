/**
 * Player availability statuses — ported from squad-players-ui.js PLAYER_STATUSES.
 * Shared by the roster rows (inline change) and the player-profile header so the
 * same colours/labels appear everywhere. `available` drives squad-availability counts.
 */
export interface PlayerStatusCfg { label: string; symbol: string; available: boolean; pill: string; }

export const PLAYER_STATUSES: Record<string, PlayerStatusCfg> = {
  active:      { label: 'Active',      symbol: '✓', available: true,  pill: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  injured:     { label: 'Injured',     symbol: '✗', available: false, pill: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  sick:        { label: 'Sick',        symbol: '✗', available: false, pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  suspended:   { label: 'Suspended',   symbol: '✗', available: false, pill: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  unavailable: { label: 'Unavailable', symbol: '✗', available: false, pill: 'bg-slate-500/15 text-slate-500 border-slate-400/30' },
  trialist:    { label: 'Trialist',    symbol: '~', available: true,  pill: 'bg-violet-500/15 text-violet-500 border-violet-500/30' },
};

export const PLAYER_STATUS_KEYS = Object.keys(PLAYER_STATUSES);

export const statusCfg = (s?: string | null): PlayerStatusCfg => PLAYER_STATUSES[s || 'active'] || PLAYER_STATUSES.active;
