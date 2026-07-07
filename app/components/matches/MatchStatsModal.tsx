import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext';
import { updateMatch, type Match } from '../../services/matchService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export const MATCH_STATS: { key: string; label: string; float?: boolean }[] = [
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on Target' },
  { key: 'xG', label: 'xG', float: true },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow Cards' },
  { key: 'redCards', label: 'Red Cards' },
];

/** Edit match team stats (home/away) — ported from match-manager updateMatchStats. */
export const MatchStatsModal: React.FC<{ open: boolean; onClose: () => void; match: Match }> = ({ open, onClose, match }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [home, setHome] = useState<Record<string, string>>(() => seedSide(match.stats?.home));
  const [away, setAway] = useState<Record<string, string>>(() => seedSide(match.stats?.away));

  const mutation = useMutation({
    mutationFn: () => {
      const num = (obj: Record<string, string>, k: string, float?: boolean) => obj[k] === '' || obj[k] == null ? 0 : (float ? parseFloat(obj[k]) : parseInt(obj[k], 10)) || 0;
      const build = (side: Record<string, string>) => Object.fromEntries(MATCH_STATS.map(s => [s.key, num(side, s.key, s.float)]));
      return updateMatch(match.id, { stats: { home: build(home), away: build(away) } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', match.id] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      showToast('Stats saved.', 'success');
      onClose();
    },
    onError: (e) => showError(e),
  });

  const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-2 py-1.5 text-sm text-center text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

  return (
    <Modal open={open} onClose={onClose} title="Edit Match Stats" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : 'Save Stats'}</Button>
      </>}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2 text-xs font-semibold text-slate-400">
        <div className="text-center">Home</div><div /><div className="text-center">Away</div>
      </div>
      {MATCH_STATS.map(s => (
        <div key={s.key} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
          <input type="number" step={s.float ? '0.01' : '1'} className={INPUT} value={home[s.key]} onChange={e => setHome(p => ({ ...p, [s.key]: e.target.value }))} />
          <span className="text-xs text-slate-500 dark:text-slate-400 text-center px-1 w-28">{s.label}</span>
          <input type="number" step={s.float ? '0.01' : '1'} className={INPUT} value={away[s.key]} onChange={e => setAway(p => ({ ...p, [s.key]: e.target.value }))} />
        </div>
      ))}
    </Modal>
  );
};

function seedSide(side: any): Record<string, string> {
  return Object.fromEntries(MATCH_STATS.map(s => [s.key, side?.[s.key] != null ? String(side[s.key]) : '']));
}
