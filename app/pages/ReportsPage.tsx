import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Users, Star, Trash2, Zap, Plus, Share2, ClipboardList, Shield, User, ArrowLeft, Printer, List, LayoutGrid } from 'lucide-react';
import { ListSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useAppState } from '../context/AppStateContext';
import { usePermissions } from '../hooks/usePermissions';
import { useReports } from '../hooks/useReports';
import { useMatches } from '../hooks/useMatches';
import { useSquads, usePlayers } from '../hooks/useSquads';
import { useCoachScope } from '../hooks/useCoachScope';
import { deleteReport, type Report } from '../services/reportService';
import { resultOutcome, type Match } from '../services/matchService';
import { positionOrder } from '../services/attendanceService';
import { playerAge, type Player } from '../services/squadService';
import { fetchClubSquadAssessments, deleteSquadAssessment, type SquadAssessment } from '../services/squadAssessmentService';
import { ReportFormModal } from '../components/reports/ReportFormModal';
import { SquadAssessmentModal } from '../components/squad/SquadAssessmentModal';
import { PlayerReportsTab } from '../components/squad/PlayerReportsTab';
import { copySessionReportShareLink } from '../services/shareService';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';

/**
 * Reports Hub — Session / Match / Team / Player. A single card/list view toggle
 * applies across all tabs. Session reports are team-scoped (coaches see only their
 * squads' reports + their own); author + squad are attached and shown.
 */
type Tab = 'sessions' | 'matches' | 'teams' | 'players';
type View = 'list' | 'card';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sessions', label: 'Session Reports', icon: 'fa-clipboard-list' },
  { id: 'matches', label: 'Match Reports', icon: 'fa-futbol' },
  { id: 'teams', label: 'Team Reports', icon: 'fa-shield-halved' },
  { id: 'players', label: 'Player Reports', icon: 'fa-user' },
];
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
const fmt = (d?: string | null) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ViewToggle: React.FC<{ view: View; setView: (v: View) => void }> = ({ view, setView }) => (
  <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden shrink-0">
    <button onClick={() => setView('list')} title="List view" className={'p-2 ' + (view === 'list' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}><List size={16} /></button>
    <button onClick={() => setView('card')} title="Card view" className={'p-2 border-l border-slate-200 dark:border-sentinel-border ' + (view === 'card' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}><LayoutGrid size={16} /></button>
  </div>
);

export const ReportsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('sessions');
  const [view, setView] = useState<View>('list');
  return (
    <div>
      <PageToolbar
        title="Reports Hub"
        description="Centralized repository for feedback, reports, and performance history."
        dataTour="reports-main"
        left={<PillTabs value={tab} onChange={id => setTab(id as Tab)} tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <i className={`fas ${t.icon}`} /> }))} />}
      >
        <ViewToggle view={view} setView={setView} />
      </PageToolbar>

      {tab === 'sessions' && <SessionReports view={view} />}
      {tab === 'matches' && <MatchReports view={view} />}
      {tab === 'teams' && <TeamReports view={view} />}
      {tab === 'players' && <PlayerReportsHub view={view} />}
    </div>
  );
};

// ── Session Reports ──
const Stars: React.FC<{ n: number }> = ({ n }) => (
  <span className="text-amber-400 tracking-tight">{'★'.repeat(n)}<span className="text-slate-300 dark:text-slate-600">{'☆'.repeat(Math.max(0, 5 - n))}</span></span>
);
const SessionReports: React.FC<{ view: View }> = ({ view }) => {
  const { canEdit } = usePermissions();
  const { profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: reports, isLoading } = useReports();
  const { data: squads } = useSquads();
  const { coachSquadIds } = useCoachScope();
  const [viewReport, setViewReport] = useState<Report | null>(null);
  const [confirmDel, setConfirmDel] = useState<Report | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Team scope: a coach sees reports for their assigned squads (by name) + their own reports.
  const allowedNames = useMemo(() => {
    if (!Array.isArray(coachSquadIds)) return null; // admins / unscoped → all
    return new Set((squads || []).filter(s => coachSquadIds.includes(s.id)).map(s => s.name.toLowerCase()));
  }, [coachSquadIds, squads]);
  const scoped = useMemo(() => (reports || []).filter(r => {
    if (!allowedNames) return true;
    if (r.createdBy && profile?.id && r.createdBy === profile.id) return true;
    if (r.team) { const names = r.team.toLowerCase().split(',').map(t => t.trim()); if (names.some(n => allowedNames.has(n))) return true; }
    return false;
  }), [reports, allowedNames, profile]);

  const delMutation = useMutation({
    mutationFn: (r: Report) => deleteReport(r.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reports'] }); showToast('Report deleted.', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });

  // Share-first: copy a branded public link; the PDF/print lives on that page (no direct PDF here).
  const shareReport = async (r: Report) => {
    try { await copySessionReportShareLink(r.id, r.shareToken); queryClient.invalidateQueries({ queryKey: ['reports'] }); showToast('Share link copied — opens a branded page with Print / PDF.', 'success'); }
    catch (e) { showError(e); }
  };

  const Meta: React.FC<{ r: Report }> = ({ r }) => (
    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
      <span>{fmt(r.date)}</span>
      {r.team && <span><i className="fas fa-shield-halved mr-1 opacity-70" />{r.team}</span>}
      <span><Users size={11} className="inline mr-1" />{r.attendanceCount}/{r.attendanceTotal}</span>
      {r.rating > 0 && <Stars n={r.rating} />}
      {r.authorName && <span className="italic">by {r.authorName}</span>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daily Session Reports</h2>
        {canEdit && <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> New Session Report</Button>}
      </div>
      <ReportFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {isLoading ? <Loading /> : !scoped.length ? (
        <Empty icon={<ClipboardList size={28} />} text="No reports found." />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scoped.map(r => (
            <div key={r.id} className={`${card} p-4`}>
              <button onClick={() => setViewReport(r)} className="text-left w-full">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400">{fmt(r.date)}</span>{r.rating > 0 && <Stars n={r.rating} />}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white truncate">{r.sessionTitle || 'General Report'}</div>
                {r.team && <div className="text-xs text-brand font-medium mt-0.5">{r.team}</div>}
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1"><Users size={11} className="inline mr-1" />{r.attendanceCount}/{r.attendanceTotal}{r.authorName ? ` · by ${r.authorName}` : ''}</div>
              </button>
              {canEdit && <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex justify-end"><button onClick={() => setConfirmDel(r)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button></div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {scoped.map(r => (
            <div key={r.id} className={`${card} p-4 flex items-center gap-4`}>
              <button onClick={() => setViewReport(r)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0"><FileText size={18} /></div>
                <div className="flex-1 min-w-0"><div className="font-semibold text-slate-900 dark:text-white truncate">{r.sessionTitle || 'General Report'}</div><Meta r={r} /></div>
              </button>
              {canEdit && <button onClick={() => setConfirmDel(r)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}
      {viewReport && (
        <Modal open={!!viewReport} onClose={() => setViewReport(null)} title={viewReport.sessionTitle || 'General Report'} size="lg"
          footer={<Button variant="secondary" onClick={() => shareReport(viewReport)}><Share2 size={15} /> Share</Button>}>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-4 text-slate-500 dark:text-slate-400">
              <span>{fmt(viewReport.date)}</span>{viewReport.team && <span><i className="fas fa-shield-halved mr-1" />{viewReport.team}</span>}
              <span><Users size={13} className="inline mr-1" />{viewReport.attendanceCount}/{viewReport.attendanceTotal} attendance</span>
              {viewReport.authorName && <span className="italic">by {viewReport.authorName}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-sentinel-border p-3"><div className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><Zap size={11} /> Intensity</div><div className="font-bold text-slate-900 dark:text-white mt-0.5">{viewReport.intensity || 'Normal'}</div></div>
              <div className="rounded-lg border border-slate-200 dark:border-sentinel-border p-3"><div className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><Star size={11} /> Rating</div><div className="mt-0.5 text-base"><Stars n={viewReport.rating} /></div></div>
            </div>
            {viewReport.notes && <div><div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Notes</div><p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{viewReport.notes}</p></div>}
          </div>
        </Modal>
      )}
      {confirmDel && <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => delMutation.mutate(confirmDel)} title="Delete this report?" message={`${confirmDel.sessionTitle || 'General Report'} · ${fmt(confirmDel.date)}`} busy={delMutation.isPending} />}
    </div>
  );
};

// ── Match Reports ──
const isReportDone = (m: Match) => m.isPast && !!(m.reportGeneral || m.reportAttacking || m.reportDefending || m.reportIndividual || m.reportImprovements || m.reportTitle);
const MatchReports: React.FC<{ view: View }> = ({ view }) => {
  const navigate = useNavigate();
  const { canEdit } = usePermissions();
  const { data: matches, isLoading } = useMatches();
  const { data: squads } = useSquads();
  const [teamFilter, setTeamFilter] = useState('all');
  const squadName = (id: string | null) => squads?.find(s => s.id === id)?.name || 'Our Team';

  const past = useMemo(() => (matches || [])
    .filter(m => m.isPast && (teamFilter === 'all' || m.squadId === teamFilter))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [matches, teamFilter]);

  const statusBadge = (done: boolean) => <span className={'text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ' + (done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>{done ? 'Completed' : 'Fill Report'}</span>;
  const resultMeta = (m: Match) => { const r = resultOutcome(m); return { label: r === 'W' ? 'WIN' : r === 'L' ? 'LOSS' : r === 'D' ? 'DRAW' : '', cls: r === 'W' ? 'text-emerald-600 dark:text-emerald-400' : r === 'L' ? 'text-rose-500' : 'text-slate-500', chip: r === 'W' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : r === 'L' ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-500/15 text-slate-500' }; };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Match Reports Repository</h2>
        <div className="flex items-center gap-2">
          <Select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-44"><option value="all">All Teams</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          {canEdit && <Button variant="primary" onClick={() => navigate('/matches')}><Plus size={16} /> New Match Report</Button>}
        </div>
      </div>
      {isLoading ? <Loading /> : !past.length ? (
        <Empty icon={<i className="fas fa-futbol text-2xl" />} text="No match reports yet." />
      ) : view === 'list' ? (
        <div className="space-y-2">
          {past.map(m => {
            const done = isReportDone(m); const rm = resultMeta(m);
            return (
              <button key={m.id} onClick={() => navigate(`/matches/${m.id}`)} className={`${card} p-3 w-full flex items-center gap-3 text-left hover:border-brand transition-all`} title={done ? 'View match report' : 'Fill in match report'}>
                <span className="text-xs text-slate-400 w-20 shrink-0">{fmt(m.date)}</span>
                {statusBadge(done)}
                <span className="flex-1 min-w-0 truncate font-medium text-slate-900 dark:text-white">{squadName(m.squadId)} <span className="text-slate-400 font-normal">vs</span> {m.opponent || 'Opponent'}</span>
                <span className={'rounded px-2 py-0.5 text-xs font-extrabold tabular-nums ' + rm.chip}>{m.homeScore ?? '–'}-{m.awayScore ?? '–'}</span>
                {rm.label && <span className={'text-xs font-bold w-10 text-right ' + rm.cls}>{rm.label}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {past.map(m => {
            const done = isReportDone(m); const rm = resultMeta(m);
            return (
              <button key={m.id} onClick={() => navigate(`/matches/${m.id}`)} className={`${card} p-4 text-left hover:border-brand hover:shadow-sm transition-all`} title={done ? 'View match report' : 'Fill in match report'}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2"><span className="text-xs text-slate-400">{fmt(m.date)}</span>{statusBadge(done)}</div>
                  <div className="flex items-center gap-2">{rm.label && <span className={'text-xs font-bold ' + rm.cls}>{rm.label}</span>}{done && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Printer size={12} /> Print</span>}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-right font-bold text-slate-900 dark:text-white text-sm leading-tight">{squadName(m.squadId)}</span>
                  <span className={'shrink-0 rounded-md px-2.5 py-1 text-sm font-extrabold tabular-nums ' + rm.chip}>{m.homeScore ?? '–'} - {m.awayScore ?? '–'}</span>
                  <span className="flex-1 font-bold text-slate-900 dark:text-white text-sm leading-tight">{m.opponent || 'Opponent'}</span>
                </div>
                <div className="mt-3 text-xs text-slate-400">{[m.venue, m.competition].filter(Boolean).join(' · ') || '—'}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Team Reports ──
const TeamReports: React.FC<{ view: View }> = ({ view }) => {
  const { canEdit } = usePermissions();
  const { effectiveClubId } = useAppState();
  const { coachSquadIds } = useCoachScope();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: squads } = useSquads();
  const [teamFilter, setTeamFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['clubSquadAssessments', effectiveClubId, coachSquadIds],
    queryFn: () => fetchClubSquadAssessments(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId, staleTime: 2 * 60_000,
  });
  const squadName = (id: string) => squads?.find(s => s.id === id)?.name || 'Squad';
  const list = (assessments || []).filter(a => teamFilter === 'all' || a.squadId === teamFilter);

  const del = useMutation({
    mutationFn: (id: string) => deleteSquadAssessment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clubSquadAssessments'] }); showToast('Team report deleted.', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Team Performance Reports</h2>
        <div className="flex items-center gap-2">
          <Select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-44"><option value="all">All Teams</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          {canEdit && <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> New Team Report</Button>}
        </div>
      </div>
      {isLoading ? <Loading /> : !list.length ? (
        <Empty icon={<Shield size={28} />} text="No team reports yet." />
      ) : view === 'list' ? (
        <div className="space-y-2">
          {list.map(a => (
            <div key={a.id} className={`${card} p-3 flex items-center gap-3`}>
              <div className="w-9 h-9 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0"><Shield size={16} /></div>
              <div className="flex-1 min-w-0"><div className="font-semibold text-slate-900 dark:text-white truncate">{squadName(a.squadId)}</div><div className="text-xs text-slate-400">{fmt(a.date)}{a.context ? ` · ${a.context}` : ''}</div></div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0">Overall {a.ratings.overall ? `${a.ratings.overall}/10` : '–'}</div>
              {canEdit && <button onClick={() => setConfirmDel(a.id)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map(a => <TeamReportCard key={a.id} a={a} name={squadName(a.squadId)} canEdit={canEdit} onDelete={() => setConfirmDel(a.id)} />)}
        </div>
      )}
      <SquadAssessmentModal open={createOpen} onClose={() => setCreateOpen(false)} squads={squads || []} />
      {confirmDel && <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => del.mutate(confirmDel)} title="Delete this team report?" message="This squad assessment will be permanently removed." busy={del.isPending} />}
    </div>
  );
};

const TeamReportCard: React.FC<{ a: SquadAssessment; name: string; canEdit: boolean; onDelete: () => void }> = ({ a, name, canEdit, onDelete }) => {
  const R: React.FC<{ label: string; v?: number }> = ({ label, v }) => (
    <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-center"><div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">{v ? `${v}` : '–'}<span className="text-[10px] text-slate-400">/10</span></div><div className="text-[10px] font-semibold text-slate-400">{label}</div></div>
  );
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand/15 text-brand flex items-center justify-center"><Shield size={17} /></div>
          <div><div className="font-bold text-slate-900 dark:text-white">{name}</div><div className="text-xs text-slate-400">{fmt(a.date)}{a.context ? ` · ${a.context}` : ''}</div></div>
        </div>
        {canEdit && <button onClick={onDelete} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /></button>}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <R label="Tactical" v={a.ratings.tactical} /><R label="Physical" v={a.ratings.physical} /><R label="Mentality" v={a.ratings.mentality} /><R label="Overall" v={a.ratings.overall} />
      </div>
      {(a.feedback.strengths || a.feedback.improvements) && (
        <div className="space-y-1.5 text-xs">
          {a.feedback.strengths && <div><span className="font-semibold text-emerald-600 dark:text-emerald-400">Strengths: </span><span className="text-slate-600 dark:text-slate-300">{a.feedback.strengths}</span></div>}
          {a.feedback.improvements && <div><span className="font-semibold text-amber-600 dark:text-amber-400">Improve: </span><span className="text-slate-600 dark:text-slate-300">{a.feedback.improvements}</span></div>}
        </div>
      )}
    </div>
  );
};

// ── Player Reports ──
const POS_FILTERS = [{ v: 'all', label: 'All Positions' }, { v: '0', label: 'Goalkeepers' }, { v: '1', label: 'Defenders' }, { v: '2', label: 'Midfielders' }, { v: '3', label: 'Forwards' }];
const PlayerReportsHub: React.FC<{ view: View }> = ({ view }) => {
  const { canEdit } = usePermissions();
  const { data: players, isLoading } = usePlayers();
  const { data: squads } = useSquads();
  const [selected, setSelected] = useState<Player | null>(null);
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('all');
  const [pos, setPos] = useState('all');

  const filtered = useMemo(() => (players || []).filter(p => {
    if (team !== 'all' && p.squadId !== team) return false;
    if (pos !== 'all') { const groups = (p.position || '').split(',').map(s => positionOrder(s.trim())); if (!groups.includes(+pos)) return false; }
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name)), [players, team, pos, search]);

  const squadName = selected ? squads?.find(s => s.id === selected.squadId)?.name : undefined;

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand mb-4"><ArrowLeft size={15} /> Back to players</button>
        <div className={`${card} p-5 mb-5 flex items-center gap-4`}>
          {selected.profileImageUrl ? <img src={selected.profileImageUrl} alt={selected.name} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center text-lg font-bold">{initials(selected.name)}</div>}
          <div className="flex-1 min-w-0"><h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{selected.name}</h3><p className="text-sm text-slate-500 dark:text-slate-400">Intelligence & Scouting Reports{squadName ? ` · ${squadName}` : ''}</p></div>
          <Link to={`/players/${selected.id}`} className="no-underline"><Button variant="secondary"><User size={15} /> View Full Profile</Button></Link>
        </div>
        <PlayerReportsTab playerId={selected.id} squadName={squadName} canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Player Reports & History</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player…" className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-brand w-44" />
          </div>
          <Select value={team} onChange={e => setTeam(e.target.value)} className="w-40"><option value="all">All Teams</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select value={pos} onChange={e => setPos(e.target.value)} className="w-40">{POS_FILTERS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}</Select>
        </div>
      </div>
      {isLoading ? <Loading /> : !filtered.length ? (
        <Empty icon={<User size={28} />} text={players?.length ? 'No players match your filters.' : 'No players yet.'} />
      ) : view === 'list' ? (
        <div className="space-y-2">
          {filtered.map(p => (
            <button key={p.id} onClick={() => setSelected(p)} className={`${card} p-3 w-full flex items-center gap-3 text-left hover:border-brand transition-all`}>
              {p.profileImageUrl ? <img src={p.profileImageUrl} alt={p.name} className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-brand text-[#0D1B2A] flex items-center justify-center text-sm font-bold">{initials(p.name)}</div>}
              <span className="flex-1 min-w-0 truncate font-medium text-slate-900 dark:text-white">{p.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{p.position || '—'}{playerAge(p) != null ? ` · ${playerAge(p)}y` : ''}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filtered.map(p => (
            <button key={p.id} onClick={() => setSelected(p)} className={`${card} p-4 flex flex-col items-center text-center hover:border-brand hover:shadow-sm transition-all`}>
              {p.profileImageUrl ? <img src={p.profileImageUrl} alt={p.name} className="w-12 h-12 rounded-full object-cover mb-2" /> : <div className="w-12 h-12 rounded-full bg-brand text-[#0D1B2A] flex items-center justify-center text-base font-bold mb-2">{initials(p.name)}</div>}
              <div className="font-semibold text-slate-900 dark:text-white text-sm truncate w-full">{p.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate w-full">{p.position || '—'}{playerAge(p) != null ? ` · ${playerAge(p)}y` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── shared ──
const Loading: React.FC = () => <ListSkeleton rows={5} />;
const Empty: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="py-16 text-center text-slate-400"><div className="flex justify-center mb-3 opacity-60">{icon}</div>{text}</div>
);
