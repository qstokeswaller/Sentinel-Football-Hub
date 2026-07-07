import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Palette, Trash2, Sun, Moon, Undo2, Save, Building2, Users, CreditCard, Bell, Check, CalendarRange, Compass, Video, LifeBuoy, Lock, X, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { SeasonsPanel } from '../components/settings/SeasonsPanel';
import { StaffSquadAssign } from '../components/settings/StaffSquadAssign';
import { SupportForm, type SupportCategory } from '../components/support/SupportForm';
import { InstallCard } from '../components/pwa/InstallCard';
import { runTour, WELCOME_TOUR, PAGE_TOURS, type FhTour } from '../lib/walkthrough';
import { useAuth } from '../context/AuthContext';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { updateProfileName, changePassword, fetchDeletedItems, restoreDeletedItem, fetchClub, updateClub, setHomeVenues, fetchClubMembers, updateMemberRole, type DeletedItem, type ClubInfo, type ClubMember } from '../services/settingsService';
import { TIER_LABELS, type Tier } from '../lib/tiers';

/**
 * Settings — Account, Club, Seasons, Staff, Appearance, Walkthrough, Notifications,
 * Help & Support, Billing, Recently-Deleted. Access model: admins can edit everything;
 * non-admins get Club/Seasons/Staff as READ-ONLY (see but can't change) and Billing is
 * locked (no access). Deep-linkable: /settings?panel=support&topic=players.
 */
type Panel = 'account' | 'appearance' | 'walkthrough' | 'deleted' | 'club' | 'staff' | 'billing' | 'notifications' | 'seasons' | 'support';
const PANELS: Panel[] = ['account', 'club', 'seasons', 'staff', 'appearance', 'walkthrough', 'notifications', 'support', 'billing', 'deleted'];
const ASSIGNABLE_ROLES = ['admin', 'coach', 'scout', 'viewer'];
const NOTIF_KEYS = [
  { key: 'email_session', label: 'Email me about upcoming sessions' },
  { key: 'email_reports', label: 'Email me when reports are shared' },
  { key: 'email_invites', label: 'Email me about new team members' },
];
// Page topic → human label, used to pre-fill the support form context when a page links here.
const TOPIC_LABELS: Record<string, string> = {
  players: 'Player analysis', squad: 'Squad management', club: 'Club setup', matches: 'Matches',
  analytics: 'Analytics', financials: 'Financials', sessions: 'Session planner', reports: 'Reports',
  scouting: 'Scouting', library: 'Library', billing: 'Billing & plans',
};
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand disabled:opacity-60';
const LABEL = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1';

const ReadOnlyNote: React.FC = () => (
  <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
    <Lock size={13} /> Read-only — only club admins can change this.
  </div>
);

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { profile, effectiveClubId, theme, toggleTheme, refetchProfile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const { tier } = useAppState();
  const { isPlatformAdmin } = usePermissions();
  const isAdmin = isPlatformAdmin || ['admin', 'super_admin'].includes(profile?.role || '');

  const urlPanel = params.get('panel') as Panel | null;
  const [panel, setPanel] = useState<Panel>(urlPanel && PANELS.includes(urlPanel) ? urlPanel : 'account');
  const [supportCat, setSupportCat] = useState<SupportCategory>('general');
  const supportTopic = TOPIC_LABELS[params.get('topic') || ''] || undefined;
  // Keep panel in sync if the URL params change while already on Settings (deep links).
  useEffect(() => {
    const p = params.get('panel') as Panel | null;
    if (p && PANELS.includes(p) && !(p === 'billing' && !isAdmin)) setPanel(p);
  }, [params, isAdmin]);

  const [name, setName] = useState(profile?.full_name || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [videoTour, setVideoTour] = useState<FhTour | null>(null);
  const replayTour = (t: FhTour) => { navigate(t.route); setTimeout(() => runTour(t.steps), 500); };

  const saveName = useMutation({
    mutationFn: () => updateProfileName(profile!.id, name.trim()),
    onSuccess: () => { refetchProfile(); showToast('Profile updated.', 'success'); },
    onError: (e) => showError(e),
  });
  const savePw = useMutation({
    mutationFn: () => changePassword(pw),
    onSuccess: () => { setPw(''); setPw2(''); showToast('Password updated.', 'success'); },
    onError: (e) => showError(e),
  });

  const { data: deleted, isLoading: delLoading } = useQuery<DeletedItem[]>({
    queryKey: ['deleted', effectiveClubId],
    queryFn: () => fetchDeletedItems(effectiveClubId),
    enabled: panel === 'deleted' && !!effectiveClubId,
  });
  const restore = useMutation({
    mutationFn: (it: DeletedItem) => restoreDeletedItem(it.id, it.itemType),
    onSuccess: (_d, it) => {
      queryClient.invalidateQueries({ queryKey: ['deleted'] });
      queryClient.invalidateQueries({ queryKey: [it.itemType === 'squad' ? 'squads' : it.itemType === 'match' ? 'matches' : 'players'] });
      showToast('Restored.', 'success');
    },
    onError: (e) => showError(e),
  });

  // Club (branding) — readable by all members; editable by admins only.
  const { data: club } = useQuery<ClubInfo>({ queryKey: ['club', effectiveClubId], queryFn: () => fetchClub(effectiveClubId!), enabled: panel === 'club' && !!effectiveClubId });
  const [clubForm, setClubForm] = useState<{ name: string; displayName: string; logoUrl: string } | null>(null);
  const cf = clubForm ?? { name: club?.name || '', displayName: club?.displayName || '', logoUrl: club?.logoUrl || '' };
  const saveClub = useMutation({
    mutationFn: () => updateClub(effectiveClubId!, club?.settings, { name: cf.name.trim(), displayName: cf.displayName, logoUrl: cf.logoUrl }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['club'] }); showToast('Club updated.', 'success'); },
    onError: (e) => showError(e),
  });
  // Home venues — selectable when a fixture is set to Home (academies often have several fields).
  const [venuesDraft, setVenuesDraft] = useState<string[] | null>(null);
  const venues = venuesDraft ?? (club?.settings?.home_venues || []);
  const saveVenues = useMutation({
    mutationFn: () => setHomeVenues(effectiveClubId!, club?.settings, venues.map(v => v.trim()).filter(Boolean)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['club'] }); showToast('Home venues saved.', 'success'); },
    onError: (e) => showError(e),
  });

  // Staff (member roles) — readable by all members; editable by admins only.
  const { data: members } = useQuery<ClubMember[]>({ queryKey: ['club-members', effectiveClubId], queryFn: () => fetchClubMembers(effectiveClubId!), enabled: panel === 'staff' && !!effectiveClubId });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateMemberRole(id, role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['club-members'] }); showToast('Role updated.', 'success'); },
    onError: (e) => showError(e),
  });

  // Notifications (local prefs — no DB column in the frozen schema)
  const [notif, setNotif] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('fh_notif_prefs') || '{}'); } catch { return {}; } });
  const toggleNotif = (k: string) => setNotif(p => { const next = { ...p, [k]: !(p[k] ?? true) }; localStorage.setItem('fh_notif_prefs', JSON.stringify(next)); return next; });

  const NAV: { id: Panel; label: string; icon: React.ElementType; locked?: boolean; soon?: boolean }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'club', label: 'Club', icon: Building2 },
    { id: 'seasons', label: 'Seasons', icon: CalendarRange },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'walkthrough', label: 'Walkthrough', icon: Compass },
    { id: 'notifications', label: 'Notifications', icon: Bell, soon: true },
    { id: 'support', label: 'Help & Support', icon: LifeBuoy },
    { id: 'billing', label: 'Billing', icon: CreditCard, locked: !isAdmin },
    { id: 'deleted', label: 'Recently Deleted', icon: Trash2 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-5">Settings</h1>
      <div className="flex flex-col md:flex-row gap-5">
        <nav className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {NAV.map(n => (
            <button key={n.id} onClick={() => { if (!n.locked) setPanel(n.id); }} disabled={n.locked}
              title={n.locked ? 'Admins only' : undefined}
              className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ' +
                (n.locked ? 'opacity-40 cursor-not-allowed text-slate-400'
                  : panel === n.id ? 'bg-brand/15 text-brand' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
              <n.icon size={16} /> <span className="flex-1">{n.label}</span> {n.soon && <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400">Soon</span>} {n.locked && <Lock size={12} />}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {panel === 'account' && (
            <div className="space-y-4">
              <InstallCard />
              <div className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Account</h3>
                <div className="space-y-3 max-w-md">
                  <div><label className={LABEL}>Full Name</label><input className={INPUT} value={name} onChange={e => setName(e.target.value)} /></div>
                  <div><label className={LABEL}>Email</label><input className={INPUT + ' opacity-60'} value={user?.email || ''} readOnly /></div>
                  <Button variant="primary" onClick={() => saveName.mutate()} disabled={saveName.isPending || !name.trim()}><Save size={15} /> {saveName.isPending ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
              <div className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Change Password</h3>
                <div className="space-y-3 max-w-md">
                  <div><label className={LABEL}>New Password</label><input type="password" className={INPUT} value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" /></div>
                  <div><label className={LABEL}>Confirm Password</label><input type="password" className={INPUT} value={pw2} onChange={e => setPw2(e.target.value)} /></div>
                  <button
                    onClick={() => { if (pw.length < 8) return showToast('Password must be at least 8 characters.', 'error'); if (pw !== pw2) return showToast('Passwords do not match.', 'error'); savePw.mutate(); }}
                    disabled={savePw.isPending} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-sentinel-border px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand disabled:opacity-50">
                    {savePw.isPending ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {panel === 'appearance' && (
            <div className="space-y-4">
              <div className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Appearance</h3>
                <div className="flex gap-3">
                  {(['light', 'dark'] as const).map(t => (
                    <button key={t} onClick={() => { if (theme !== t) toggleTheme(); }}
                      className={'flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium capitalize transition-colors ' +
                        (theme === t ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300 hover:border-brand')}>
                      {t === 'light' ? <Sun size={16} /> : <Moon size={16} />} {t} mode
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {panel === 'walkthrough' && (
            <div className="space-y-3">
              <div className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Walkthrough</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">The general welcome tour plus an interactive walkthrough for each page. Replay any of them, or watch the video version. The welcome tour also plays automatically once, on your first sign-in. Tours adapt to your plan — features you don't have are skipped.</p>
              </div>
              {[WELCOME_TOUR, ...PAGE_TOURS].map(t => (
                <div key={t.id} className={`${card} p-4 flex items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {t.name}
                      {t.id === 'welcome' && <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-brand">General</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t.steps.length} step{t.steps.length === 1 ? '' : 's'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.videoUrl
                      ? <button onClick={() => setVideoTour(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><Video size={15} /> Watch video</button>
                      : <span title="A screen-recorded walkthrough plugs in here once recorded" className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500"><Video size={13} /> Video soon</span>}
                    <Button variant="secondary" onClick={() => replayTour(t)}><Compass size={15} /> Replay</Button>
                  </div>
                </div>
              ))}
              {videoTour?.videoUrl && (
                <Modal open={!!videoTour} onClose={() => setVideoTour(null)} title={`${videoTour.name} — video walkthrough`} size="2xl">
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <iframe src={videoTour.videoUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={videoTour.name} />
                  </div>
                </Modal>
              )}
            </div>
          )}

          {panel === 'support' && (
            <div className="max-w-3xl">
              <SupportForm defaultCategory={supportCat} contextLabel={supportTopic} />
            </div>
          )}

          {panel === 'deleted' && (
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Recently Deleted</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Deleted players, squads and matches are kept for 7 days.</p>
              {delLoading ? (
                <div className="py-8 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
              ) : !deleted?.length ? (
                <div className="py-8 text-center text-slate-400">Nothing recently deleted.</div>
              ) : (
                <div className="space-y-2">
                  {deleted.map(it => (
                    <div key={it.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-sentinel-border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 dark:text-white truncate">{it.name}</div>
                        <div className="text-xs text-slate-400 capitalize">{it.itemType} · {it.daysLeft} day{it.daysLeft === 1 ? '' : 's'} left</div>
                      </div>
                      <button onClick={() => restore.mutate(it)} disabled={restore.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors disabled:opacity-50">
                        <Undo2 size={13} /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === 'club' && (
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Club</h3>
              {!isAdmin && <ReadOnlyNote />}
              <div className="space-y-3 max-w-md">
                <div className="flex items-center gap-3">
                  {cf.logoUrl ? <img src={cf.logoUrl} alt="logo" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-brand/15 text-brand flex items-center justify-center"><Building2 size={22} /></div>}
                  <div className="flex-1"><label className={LABEL}>Logo URL</label><input className={INPUT} value={cf.logoUrl} disabled={!isAdmin} onChange={e => setClubForm({ ...cf, logoUrl: e.target.value })} placeholder="https://…" /></div>
                </div>
                <div><label className={LABEL}>Club Name</label><input className={INPUT} value={cf.name} disabled={!isAdmin} onChange={e => setClubForm({ ...cf, name: e.target.value })} /></div>
                <div><label className={LABEL}>Display Name <span className="text-slate-400">(shown on dossiers)</span></label><input className={INPUT} value={cf.displayName} disabled={!isAdmin} onChange={e => setClubForm({ ...cf, displayName: e.target.value })} placeholder={cf.name} /></div>
                {isAdmin && <Button variant="primary" onClick={() => saveClub.mutate()} disabled={saveClub.isPending || !cf.name.trim()}><Save size={15} /> {saveClub.isPending ? 'Saving…' : 'Save'}</Button>}
              </div>

              {/* Home venues — picked from a dropdown when a fixture is Home (one ground can have many fields). */}
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-sentinel-border max-w-md">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Home Venues</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Grounds/fields you play home games at — these appear as a dropdown when a fixture is set to Home.</p>
                <div className="space-y-2">
                  {(venues.length ? venues : ['']).map((v, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={INPUT} value={v} disabled={!isAdmin} placeholder="e.g. Tuks Stadium — Field B" onChange={e => { const next = venues.length ? [...venues] : ['']; next[i] = e.target.value; setVenuesDraft(next); }} />
                      {isAdmin && <button onClick={() => setVenuesDraft(venues.filter((_, j) => j !== i))} className="shrink-0 px-2 rounded-lg border border-slate-200 dark:border-sentinel-border text-slate-400 hover:text-rose-500"><X size={15} /></button>}
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setVenuesDraft([...venues, ''])} className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"><Plus size={14} /> Add Venue</button>
                    <Button variant="primary" size="sm" onClick={() => saveVenues.mutate()} disabled={saveVenues.isPending}><Save size={14} /> {saveVenues.isPending ? 'Saving…' : 'Save Venues'}</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === 'staff' && (
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Staff & Members</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Admins manage the club; coaches/scouts get scoped access; viewers are read-only.</p>
              {!isAdmin && <ReadOnlyNote />}
              {!members ? <div className="py-8 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
                : !members.length ? <div className="py-8 text-center text-slate-400">No members yet.</div>
                : (
                  <div className="space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-sentinel-border p-3">
                        <div className="w-8 h-8 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold shrink-0">{(m.fullName || '?').slice(0, 2).toUpperCase()}</div>
                        <div className="flex-1 min-w-0"><div className="font-medium text-sm text-slate-900 dark:text-white truncate">{m.fullName}{m.id === profile?.id && <span className="text-xs text-slate-400"> (you)</span>}</div></div>
                        {isAdmin && ['coach', 'viewer'].includes(m.role) && <StaffSquadAssign coachId={m.id} coachName={m.fullName} />}
                        {m.role === 'super_admin' ? <span className="text-xs font-semibold text-violet-400">Super Admin</span> : (
                          <Select value={m.role} disabled={m.id === profile?.id || !isAdmin} onChange={e => changeRole.mutate({ id: m.id, role: e.target.value })} className="capitalize w-32 shrink-0">
                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {panel === 'notifications' && (
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400">Coming soon</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Notification delivery isn't live yet — we're building it. This is a preview of what you'll be able to control; toggles are disabled until it launches.</p>
              <div className="space-y-1 max-w-md opacity-60 pointer-events-none select-none">
                {NOTIF_KEYS.map(n => (
                  <label key={n.key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-sm text-slate-700 dark:text-slate-200">{n.label}</span>
                    <button type="button" disabled aria-disabled className={'relative w-10 h-6 rounded-full ' + ((notif[n.key] ?? true) ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600')}>
                      <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white ' + ((notif[n.key] ?? true) ? 'left-[18px]' : 'left-0.5')} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          )}

          {panel === 'billing' && (isAdmin ? (
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Billing & Plan</h3>
              <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 mb-4 flex items-center justify-between">
                <div><div className="text-xs uppercase tracking-wider text-slate-400">Current plan</div><div className="text-xl font-bold text-brand">{TIER_LABELS[tier as Tier] || tier}</div></div>
                <CreditCard size={28} className="text-brand/50" />
              </div>
              <div className="space-y-2 max-w-md">
                {(['free', 'basic', 'pro', 'elite'] as Tier[]).map(t => (
                  <div key={t} className={'flex items-center justify-between rounded-lg border p-3 ' + (t === tier ? 'border-brand bg-brand/5' : 'border-slate-200 dark:border-sentinel-border')}>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{TIER_LABELS[t]}</span>
                    {t === tier ? <span className="text-xs font-semibold text-brand inline-flex items-center gap-1"><Check size={13} /> Active</span> : <span className="text-xs text-slate-400">—</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">To change your plan, <button onClick={() => { setSupportCat('billing'); setPanel('support'); }} className="text-brand font-medium hover:underline">contact support</button>.</p>
            </div>
          ) : (
            <div className={`${card} p-8 text-center`}>
              <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-white/10 text-slate-400 flex items-center justify-center mx-auto mb-3"><Lock size={20} /></div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Billing is admin-only</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Only club admins can view or change billing &amp; plans.</p>
            </div>
          ))}

          {panel === 'seasons' && <SeasonsPanel clubId={effectiveClubId} canEdit={isAdmin} />}
        </div>
      </div>
    </div>
  );
};
