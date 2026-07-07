import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Users, Eye, Settings2, Trash2, UserPlus } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { SmartSearch } from '../components/ui/SmartSearch';
import { fuzzyFilter } from '../lib/fuzzy';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ClubMembersModal } from '../components/platform/ClubMembersModal';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { usePlatformClubs } from '../hooks/usePlatformAdmin';
import { updateClubSubscription, deleteClub, type ClubOverview } from '../services/platformAdminService';
import { TIER_LABELS, TIER_LIMITS, hasFeature, type Tier } from '../lib/tiers';

/**
 * Platform Admin — Group G, increment 1. Super_admin club directory with
 * impersonation (wires to AppState startImpersonation). Member-role management +
 * subscription edits + delete-club are follow-on increments.
 */
const TIER_STYLE: Record<string, string> = {
  free: 'bg-slate-500/15 text-slate-400', basic: 'bg-sky-500/15 text-sky-400',
  pro: 'bg-violet-500/15 text-violet-400', elite: 'bg-brand/15 text-brand',
};
const ARCHETYPE_LABEL: Record<string, string> = { academy: 'Academy', club: 'Club', private_coaching: 'Private Coaching (individual)' };
const FEATURE_PAGES = [
  { key: 'training', label: 'Sessions' }, { key: 'library', label: 'Library' }, { key: 'reports', label: 'Reports' },
  { key: 'scouting', label: 'Scouting' }, { key: 'analytics', label: 'Analytics' }, { key: 'financials', label: 'Financials' },
];
const fmtLimit = (n?: number) => (n === Infinity || n == null ? '∞' : String(n));

export const PlatformAdminPage: React.FC = () => {
  const { isPlatformAdmin } = usePermissions();
  const { startImpersonation } = useAppState();
  const { data: clubs, isLoading } = usePlatformClubs();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [manage, setManage] = useState<ClubOverview | null>(null);
  const [confirmDel, setConfirmDel] = useState<ClubOverview | null>(null);
  const [membersClub, setMembersClub] = useState<{ id: string; name: string } | null>(null);

  const subMutation = useMutation({
    mutationFn: ({ c, patch }: { c: ClubOverview; patch: { tier?: string; status?: string } }) => updateClubSubscription(c.id, c.settings, patch),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['platform-clubs'] }); showToast('Club updated.', 'success'); setManage(null); },
    onError: (e) => showError(e),
  });
  const delMutation = useMutation({
    mutationFn: (c: ClubOverview) => deleteClub(c.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['platform-clubs'] }); showToast('Club deleted.', 'success'); setConfirmDel(null); setManage(null); },
    onError: (e) => showError(e),
  });

  const visible = useMemo(() => fuzzyFilter(search, clubs || [], c => [c.name]), [clubs, search]);
  const searchCorpus = useMemo(() => (clubs || []).map(c => ({ value: c.name, kind: 'club' as const })), [clubs]);

  if (!isPlatformAdmin) {
    return (
      <div className="py-20 text-center text-slate-400">
        <ShieldCheck size={28} className="mx-auto mb-3 opacity-60" />
        Platform admin access only.
      </div>
    );
  }

  const impersonate = (id: string, name: string) => { startImpersonation(id, name); navigate('/dashboard'); };
  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

  return (
    <div>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><ShieldCheck size={22} className="text-violet-400" /> Platform Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">All clubs on the platform.</p>
        </div>
        <SmartSearch value={search} onChange={setSearch} corpus={searchCorpus} placeholder="Search clubs…" />
      </header>

      {isLoading ? (
        <div className="py-16 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading clubs…</div>
      ) : !visible.length ? (
        <div className="py-16 text-center text-slate-400">No clubs found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(c => (
            <div key={c.id} className={`${card} p-5`}>
              <div className="flex items-start justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate pr-2">{c.name}</h3>
                <span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 ' + (TIER_STYLE[c.tier] || TIER_STYLE.free)}>{TIER_LABELS[c.tier as Tier] || c.tier}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={'text-[11px] font-medium rounded-full px-2 py-0.5 ' + (c.status === 'paused' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')}>{c.status === 'paused' ? 'Paused' : 'Active'}</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span><Users size={12} className="inline mr-1" />{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</span>
                <span>{c.playerCount} player{c.playerCount === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => impersonate(c.id, c.name)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 dark:border-violet-500/40 text-violet-600 dark:text-violet-300 px-3 py-2 text-sm font-semibold hover:bg-violet-500/10 transition-colors">
                  <Eye size={15} /> View as
                </button>
                <button onClick={() => setMembersClub({ id: c.id, name: c.name })} title="Members & invites" className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-slate-500 dark:text-slate-400 hover:border-brand"><UserPlus size={15} /></button>
                <button onClick={() => setManage(c)} title="Manage plan" className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-slate-500 dark:text-slate-400 hover:border-brand"><Settings2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage modal */}
      {manage && (
        <Modal open={!!manage} onClose={() => setManage(null)} title={`Manage · ${manage.name}`} size="md">
            <div className="space-y-4">
              {/* Read-only config snapshot — archetype, usage, limits + features (features update live as you change the tier below) */}
              <div className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg p-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Archetype</span><span className="font-medium text-slate-900 dark:text-slate-100">{ARCHETYPE_LABEL[manage.settings?.archetype] || 'Standard club'}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Members · Players</span><span className="font-medium text-slate-900 dark:text-slate-100">{manage.memberCount} · {manage.playerCount}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Squad limit</span><span className="font-medium text-slate-900 dark:text-slate-100">{fmtLimit(TIER_LIMITS[manage.tier as Tier]?.squads)}</span></div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1.5">Features at {TIER_LABELS[manage.tier as Tier] || manage.tier}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {FEATURE_PAGES.map(f => { const on = hasFeature(manage.tier as Tier, f.key); return (
                      <span key={f.key} className={'text-[11px] rounded-full px-2 py-0.5 ' + (on ? 'bg-brand/15 text-brand' : 'bg-slate-200/70 dark:bg-white/5 text-slate-400 line-through')}>{f.label}</span>
                    ); })}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Plan / Tier</label>
                <Select value={manage.tier} onChange={e => setManage({ ...manage, tier: e.target.value })}>
                  {(['free', 'basic', 'pro', 'elite'] as Tier[]).map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Status</label>
                <div className="flex gap-2">
                  {(['active', 'paused'] as const).map(s => (
                    <button key={s} onClick={() => setManage({ ...manage, status: s })} className={'flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ' + (manage.status === s ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300')}>{s}</button>
                  ))}
                </div>
              </div>
              <Button variant="primary" className="w-full" onClick={() => subMutation.mutate({ c: manage, patch: { tier: manage.tier, status: manage.status } })} disabled={subMutation.isPending}>{subMutation.isPending ? 'Saving…' : 'Save changes'}</Button>
              <Button variant="ghost" className="w-full text-rose-500 hover:bg-rose-500/10" onClick={() => setConfirmDel(manage)}><Trash2 size={15} /> Delete club</Button>
            </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => delMutation.mutate(confirmDel)}
          title={`Delete ${confirmDel.name}?`} message="This permanently deletes the club and cascades to its data. This cannot be undone." confirmLabel="Delete club" busy={delMutation.isPending} />
      )}

      <ClubMembersModal club={membersClub} onClose={() => setMembersClub(null)} />
    </div>
  );
};
