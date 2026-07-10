import type { Season } from '../services/seasonsService';

/**
 * A shared season / date-range selection used by the player-profile History + Analysis tabs
 * and the player share link. `seasonId` is 'all' (all-time), 'custom' (use from/to), or a real
 * season id (resolved to that season's start–end dates).
 */
export interface RangeValue { seasonId: string; from: string; to: string; }
export const emptyRange: RangeValue = { seasonId: 'all', from: '', to: '' };

/** Resolve a picker value to concrete { from, to } date strings ('' = open-ended). */
export function resolveRange(v: RangeValue | undefined, seasons: Season[]): { from: string; to: string } {
  if (!v || v.seasonId === 'all') return { from: '', to: '' };
  if (v.seasonId === 'custom') return { from: v.from || '', to: v.to || '' };
  const s = seasons.find(x => x.id === v.seasonId);
  return { from: s?.startDate || '', to: s?.endDate || '' };
}

/** Is a date within [from, to] (either bound optional)? A bounded range excludes undated items. */
export function dateInRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.length > 10 ? date.slice(0, 10) : date;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Short human label for the active range (for share captions / headers). */
export function rangeLabel(v: RangeValue | undefined, seasons: Season[]): string {
  if (!v || v.seasonId === 'all') return 'All-time';
  if (v.seasonId === 'custom') return [v.from || '…', v.to || '…'].join(' – ');
  return seasons.find(s => s.id === v.seasonId)?.name || 'Season';
}
