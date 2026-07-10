import React, { useState } from 'react';
import { Share2, Copy } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { copyPlayerDossierLink } from '../../services/shareService';
import { resolveRange, rangeLabel, type RangeValue } from '../../lib/dateRange';
import type { Season } from '../../services/seasonsService';
import type { Player } from '../../services/squadService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ReportRangeFilter } from './ReportRangeFilter';

/**
 * Share a player's public dossier scoped to a season / date range — the shared link only includes
 * reports within the chosen range (empty = all-time). Same picker as the History + Analysis tabs.
 */
export const PlayerShareModal: React.FC<{ open: boolean; onClose: () => void; player: Player; seasons: Season[]; defaultRange?: RangeValue }> = ({ open, onClose, player, seasons, defaultRange }) => {
  const { showToast, showError } = useToast();
  const [range, setRange] = useState<RangeValue>(defaultRange || { seasonId: 'all', from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const resolved = resolveRange(range, seasons);

  const copy = async () => {
    setBusy(true);
    try {
      await copyPlayerDossierLink(player.id, player.shareToken, resolved);
      showToast(`Dossier link copied — reports for ${rangeLabel(range, seasons)}.`, 'success');
      onClose();
    } catch (e) { showError(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Share2 size={17} /> Share {player.name}'s Dossier</span>} size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={copy}><Copy size={15} /> {busy ? 'Copying…' : 'Copy Link'}</Button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Choose which reports appear in the shared dossier. Pick a season or a custom date range — leave it on <b>All-time</b> to include everything.</p>
        <ReportRangeFilter seasons={seasons} value={range} onChange={setRange} />
        <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          Including reports for <b className="text-slate-700 dark:text-slate-200">{rangeLabel(range, seasons)}</b>. Season stats and highlights are always shown.
        </div>
      </div>
    </Modal>
  );
};
