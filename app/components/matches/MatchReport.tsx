import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, MessageSquare, ArrowUp, Shield, User, TrendingUp, Eye } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { updateMatch, type Match } from '../../services/matchService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';

/**
 * Post-match report — the 5 coaching sections (General/Attacking/Defending/Individual/
 * Improvements) + a title and visibility, stored on the matches.report_* columns.
 * Read-only for viewers; canEdit (assigned coach/admin) edits.
 */
const SECTIONS = [
  { key: 'reportGeneral', label: 'General Comments', color: '#3b82f6', Icon: MessageSquare },
  { key: 'reportAttacking', label: 'Attacking', color: '#10b981', Icon: ArrowUp },
  { key: 'reportDefending', label: 'Defending', color: '#ef4444', Icon: Shield },
  { key: 'reportIndividual', label: 'Individual', color: '#6366f1', Icon: User },
  { key: 'reportImprovements', label: 'Areas to Improve', color: '#f59e0b', Icon: TrendingUp },
] as const;

const VISIBILITY: Record<string, string> = {
  private: 'Private — staff only',
  squad: 'Squad — visible to players',
  public: 'Public — shown on dossiers',
};

const seed = (m: Match) => ({
  reportTitle: m.reportTitle || '', reportGeneral: m.reportGeneral || '', reportAttacking: m.reportAttacking || '',
  reportDefending: m.reportDefending || '', reportIndividual: m.reportIndividual || '', reportImprovements: m.reportImprovements || '',
  reportVisibility: m.reportVisibility || 'private',
});

export const MatchReport: React.FC<{ match: Match; canEdit: boolean }> = ({ match, canEdit }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => seed(match));
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const filled = SECTIONS.filter(s => (match[s.key] as string)?.trim());

  const save = useMutation({
    mutationFn: () => updateMatch(match.id, f),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['match', match.id] }); showToast('Match report saved.', 'success'); setOpen(false); },
    onError: (e) => showError(e),
  });

  const openEdit = () => { setF(seed(match)); setOpen(true); };
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); save.mutate(); };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-sentinel-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><FileText size={16} className="text-brand" /> Match Report</h3>
        <div className="flex items-center gap-3">
          {filled.length > 0 && <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Eye size={12} /> {VISIBILITY[match.reportVisibility || 'private']?.split(' — ')[0]}</span>}
          {canEdit && <button onClick={openEdit} className="text-xs font-medium text-brand hover:underline inline-flex items-center gap-1"><Pencil size={12} /> {filled.length ? 'Edit report' : 'Write report'}</button>}
        </div>
      </div>

      <div className="p-5">
        {match.reportTitle?.trim() && <h4 className="text-base font-bold text-slate-900 dark:text-white mb-3">{match.reportTitle}</h4>}
        {filled.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm"><FileText size={26} className="mx-auto mb-3 opacity-50" />No report written yet.{canEdit && <div className="text-xs mt-1">Click "Write report" to add one.</div>}</div>
        ) : (
          <div className="space-y-4">
            {filled.map(s => (
              <div key={s.key} className="border-l-3 pl-4" style={{ borderLeft: `3px solid ${s.color}` }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: s.color }}>
                  <s.Icon size={13} /> {s.label}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{match[s.key] as string}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Match Report" size="xl"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => submit()}>{save.isPending ? 'Saving…' : 'Save Report'}</Button>
        </>}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Report Title</Label><Input value={f.reportTitle} onChange={e => set('reportTitle', e.target.value)} placeholder={`vs ${match.opponent || 'opponent'} — review`} autoFocus /></div>
            <div><Label>Visibility</Label>
              <Select value={f.reportVisibility} onChange={e => set('reportVisibility', e.target.value)}>
                {Object.entries(VISIBILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          {SECTIONS.map(s => (
            <div key={s.key}>
              <Label><span className="inline-flex items-center gap-1.5" style={{ color: s.color }}><s.Icon size={12} /> {s.label}</span></Label>
              <Textarea rows={s.key === 'reportGeneral' ? 3 : 2} value={f[s.key]} onChange={e => set(s.key, e.target.value)} placeholder={`${s.label}…`} />
            </div>
          ))}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  );
};
