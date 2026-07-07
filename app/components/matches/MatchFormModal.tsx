import React, { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { useSquads } from '../../hooks/useSquads';
import { useSeasons } from '../../hooks/useSeasons';
import { createMatch, updateMatch, type Match } from '../../services/matchService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';

/** Add / Edit match — ported from match-manager createMatch/updateMatchInfo. */
interface Props { open: boolean; onClose: () => void; match: Match | null; onDelete?: (m: Match) => void; }
const FORMATS = ['11-a-side', '9-a-side', '8-a-side', '7-a-side', '6-a-side', '5-a-side'];

export const MatchFormModal: React.FC<Props> = ({ open, onClose, match, onDelete }) => {
  const { effectiveClubId, club } = useAppState();
  const { showToast, showError } = useToast();
  const { data: squads } = useSquads();
  const { data: seasons } = useSeasons();
  const queryClient = useQueryClient();
  const homeVenues: string[] = (club as any)?.settings?.home_venues || [];

  const [f, setF] = useState(() => seed(match));
  const seededId = useRef<string | null>(match?.id ?? null);
  if (open && seededId.current !== (match?.id ?? null)) { seededId.current = match?.id ?? null; setF(seed(match)); }
  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));
  // New matches default to the current season so they're tagged from the start.
  React.useEffect(() => { if (!match && seasons && f.seasonId === '') { const cur = seasons.find(s => s.isCurrent); if (cur) setF(prev => ({ ...prev, seasonId: cur.id })); } }, [seasons, match, f.seasonId]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Entering a score = it's a result → auto-flip status so the match moves to the Results tab.
      const hasScore = f.homeScore !== '' || f.awayScore !== '';
      const status = hasScore ? 'result' : f.status;
      const payload = {
        ...f, status,
        homeScore: f.homeScore === '' ? null : Number(f.homeScore),
        awayScore: f.awayScore === '' ? null : Number(f.awayScore),
      };
      if (match) await updateMatch(match.id, { ...payload, isPast: status === 'result' });
      else await createMatch(effectiveClubId!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      showToast(match ? 'Match updated.' : 'Match added.', 'success');
      onClose();
    },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.opponent.trim()) return showToast('Opponent is required.', 'error');
    if (!f.date) return showToast('Date is required.', 'error');
    mutation.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={match ? 'Edit Match' : 'Add Match'} size="md"
      footer={<>
        {match && onDelete && <Button variant="ghost" className="mr-auto text-rose-500 hover:bg-rose-500/10" onClick={() => onDelete(match)}><Trash2 size={15} /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => submit()}>{mutation.isPending ? 'Saving…' : (match ? 'Save Changes' : 'Add Match')}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Opponent *</Label><Input value={f.opponent} onChange={e => set('opponent', e.target.value)} placeholder="e.g. Kaizer Chiefs" autoFocus /></div>
          <div><Label>Squad</Label>
            <Select value={f.squadId} onChange={e => set('squadId', e.target.value)}>
              <option value="">— None —</option>
              {(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div><Label>Competition</Label><Input value={f.competition} onChange={e => set('competition', e.target.value)} placeholder="e.g. League, Cup" /></div>
          <div><Label>Venue</Label>
            {f.ourSide === 'home' && homeVenues.length > 0 ? (
              <>
                <Select value={homeVenues.includes(f.venue) ? f.venue : ''} onChange={e => e.target.value && set('venue', e.target.value)} className="mb-1.5">
                  <option value="">Pick a home venue…</option>
                  {homeVenues.map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
                <Input value={f.venue} onChange={e => set('venue', e.target.value)} placeholder="…or type a venue" />
              </>
            ) : (
              <Input value={f.venue} onChange={e => set('venue', e.target.value)} placeholder={f.ourSide === 'away' ? 'Away venue' : 'Venue'} />
            )}
          </div>
          <div><Label>Date *</Label><DatePicker value={f.date} onChange={e => set('date', e.target.value)} /></div>
          <div><Label>Time</Label><TimePicker value={f.time} onChange={v => set('time', v)} /></div>
          <div><Label>Home / Away</Label>
            <Select value={f.ourSide} onChange={e => set('ourSide', e.target.value)}><option value="home">Home</option><option value="away">Away</option></Select>
          </div>
          <div><Label>Status</Label>
            <Select value={f.status} onChange={e => set('status', e.target.value)}><option value="fixture">Fixture (upcoming)</option><option value="result">Result (played)</option></Select>
          </div>
          <div><Label>Format</Label>
            <Select value={f.matchFormat} onChange={e => set('matchFormat', e.target.value)}>{FORMATS.map(fm => <option key={fm} value={fm}>{fm}</option>)}</Select>
          </div>
          {(seasons || []).length > 0 && (
            <div><Label>Season</Label>
              <Select value={f.seasonId} onChange={e => set('seasonId', e.target.value)}><option value="">— None —</option>{(seasons || []).map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}</Select>
            </div>
          )}
        </div>
        {f.status === 'result' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Home Score</Label><Input type="number" value={f.homeScore} onChange={e => set('homeScore', e.target.value)} /></div>
            <div><Label>Away Score</Label><Input type="number" value={f.awayScore} onChange={e => set('awayScore', e.target.value)} /></div>
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};

function seed(m: Match | null) {
  return {
    opponent: m?.opponent || '', squadId: m?.squadId || '', competition: m?.competition || '', venue: m?.venue || '',
    date: m?.date || '', time: m?.time || '', ourSide: m?.ourSide || 'home', status: m?.status || 'fixture',
    matchFormat: m?.matchFormat || '11-a-side', seasonId: m?.seasonId || '',
    homeScore: m?.homeScore?.toString() ?? '', awayScore: m?.awayScore?.toString() ?? '',
  };
}
