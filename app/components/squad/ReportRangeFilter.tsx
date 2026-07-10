import React from 'react';
import { Select } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import type { Season } from '../../services/seasonsService';
import type { RangeValue } from '../../lib/dateRange';

/**
 * Season / date-range picker shared by the player-profile History + Analysis tabs (and the share
 * dialog). Pick a season, all-time, or a custom from–to range. Mirrors the Analytics page control.
 */
export const ReportRangeFilter: React.FC<{ seasons: Season[]; value: RangeValue; onChange: (v: RangeValue) => void; className?: string; compact?: boolean }> = ({ seasons, value, onChange, className, compact }) => {
  // Options must be inlined (not wrapped in a Fragment) — the custom Select reads its <option>
  // children directly to resolve the display label.
  // Compact: an inline control (no stacked labels) so it can sit next to the Share button.
  if (compact) return (
    <div className={'flex flex-wrap items-center gap-2 ' + (className || '')}>
      <Select value={value.seasonId} onChange={e => onChange({ ...value, seasonId: e.target.value })} className="w-40" aria-label="Season or date range">
        <option value="all">All-time</option>
        {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}
        <option value="custom">Custom range…</option>
      </Select>
      {value.seasonId === 'custom' && <>
        <DatePicker value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} className="w-36" aria-label="From date" />
        <span className="text-slate-400 text-sm">–</span>
        <DatePicker value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} className="w-36" aria-label="To date" />
      </>}
    </div>
  );

  return (
    <div className={'flex flex-wrap items-end gap-3 ' + (className || '')}>
      <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Season / Range</span>
        <Select value={value.seasonId} onChange={e => onChange({ ...value, seasonId: e.target.value })} className="w-48">
          <option value="all">All-time</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}
          <option value="custom">Custom range…</option>
        </Select>
      </label>
      {value.seasonId === 'custom' && <>
        <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">From</span>
          <DatePicker value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} className="w-40" />
        </label>
        <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">To</span>
          <DatePicker value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} className="w-40" />
        </label>
      </>}
    </div>
  );
};
