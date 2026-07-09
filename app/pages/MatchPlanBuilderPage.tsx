import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, ChevronLeft, ChevronRight, Plus, X, ExternalLink, Share2, Trash2 } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { useMatchPlan } from '../hooks/useMatchPlans';
import { useMatches } from '../hooks/useMatches';
import { useSquads, usePlayers } from '../hooks/useSquads';
import { createMatch } from '../services/matchService';
import { createMatchPlan, updateMatchPlan, deleteMatchPlan, copyMatchPlanShareLink, emptyPlanData, type MatchPlanData, type PlanBoard } from '../services/matchPlanService';
import { FORMATION_NAMES, formationSlots } from '../lib/formations';
import { PitchStage, type PitchToken } from '../components/pitch/PitchStage';
import { PageSkeleton } from '../components/ui/Skeleton';
import { TacticalBoard } from '../components/matches/TacticalBoard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select, Label } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { TimePicker } from '../components/ui/TimePicker';

/** Multi-step Match Plan builder (Match · Opp Intel · Squad · Plan A/B/C · Offense · Defense · Set Pieces · Export). */
const STEPS = ['Match', 'Opp Intel', 'Squad', 'Plan A', 'Plan B', 'Plan C', 'Offense', 'Defense', 'Set Pieces', 'Export'];
const OPP_FORMATIONS = ['', '4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '4-1-4-1', '4-5-1', '5-3-2'];
const surname = (n: string) => (n || '').trim().split(/\s+/).slice(-1)[0] || '';
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5';

export const MatchPlanBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const fixtureParam = searchParams.get('fixture');
  const navigate = useNavigate();
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: existing, isLoading } = useMatchPlan(id);
  const { data: squads } = useSquads();
  const { data: players } = usePlayers();
  const { data: matches } = useMatches();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [squadId, setSquadId] = useState('');
  const [data, setData] = useState<MatchPlanData>(emptyPlanData());
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const seeded = React.useRef(false);
  useEffect(() => {
    if (existing && !seeded.current) {
      seeded.current = true;
      setTitle(existing.title === 'Untitled Plan' ? '' : existing.title);
      setSquadId(existing.squadId || '');
      setData({ ...emptyPlanData(), ...existing.data });
      setShareToken(existing.shareToken || null);
    }
  }, [existing]);

  // New plan reached via "Create Plan" on a fixture → auto-link + prefill match details from it.
  const fxSeeded = React.useRef(false);
  useEffect(() => {
    if (id || !fixtureParam || fxSeeded.current) return;
    const f = (matches || []).find(x => x.id === fixtureParam);
    if (!f) return;
    fxSeeded.current = true;
    setSquadId(f.squadId || '');
    setData(d => ({ ...d, match: { matchId: f.id, opponent: f.opponent || '', venue: f.venue || '', date: f.date || '', time: f.time || '', side: f.ourSide === 'away' ? 'away' : 'home' } }));
    setTitle(t => t || `Plan vs ${f.opponent || 'Opponent'}`);
  }, [matches, fixtureParam, id]);

  const handleShare = async () => {
    if (!id) return;
    setSharing(true);
    try { const url = await copyMatchPlanShareLink(id, shareToken); setShareToken(t => t || url.split('token=')[1] || t); showToast('Share link copied — anyone with it can view this plan.', 'success'); }
    catch (e) { showError(e); } finally { setSharing(false); }
  };

  const squadPlayers = useMemo(() => (players || []).filter(p => p.squadId === squadId), [players, squadId]);
  const playerName = (pid: string | null) => pid ? ((players || []).find(p => p.id === pid)?.name || '') : '';
  // XI labels aligned to the squad formation slots (for plan-board formation overlay).
  const xiLabels = useMemo(() => {
    const slots = formationSlots(data.squad.formation);
    return slots.map((s, i) => { const a = data.squad.startingXI?.[i]; const nm = a?.playerId ? playerName(a.playerId) : ''; return nm ? surname(nm) : s.pos; });
  }, [data.squad, players]);
  // The picked XI (name + photo) aligned to formation slots — carries through every plan step so
  // "Show Formation" drops real players (photo in the token centre, initials if they have none).
  const xiPlayers = useMemo(() => {
    const slots = formationSlots(data.squad.formation);
    return slots.map((_s, i) => { const a = data.squad.startingXI?.[i]; const p = a?.playerId ? (players || []).find(pl => pl.id === a.playerId) : null; return { name: p?.name || '', avatar: p?.profileImageUrl || null }; });
  }, [data.squad, players]);

  const patch = (p: Partial<MatchPlanData>) => setData(d => ({ ...d, ...p }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim() || `Plan vs ${data.match.opponent || 'Opponent'}`, squadId: squadId || null, matchId: data.match.matchId || null, data };
      if (id) { await updateMatchPlan(id, payload); return id; }
      return createMatchPlan(effectiveClubId!, { ...payload, createdBy: profile?.id || null });
    },
    onSuccess: (savedId) => {
      queryClient.invalidateQueries({ queryKey: ['matchPlans'] });
      queryClient.invalidateQueries({ queryKey: ['matchPlan', savedId] });
      showToast('Match plan saved.', 'success');
      if (!id && savedId) navigate(`/match-plan/${savedId}`, { replace: true });
    },
    onError: (e) => showError(e),
  });

  const del = useMutation({
    mutationFn: () => deleteMatchPlan(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['matchPlans'] }); showToast('Match plan deleted.', 'success'); navigate('/matches'); },
    onError: (e) => showError(e),
  });

  if (id && isLoading) return <PageSkeleton variant="builder" />;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/matches')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand"><ArrowLeft size={15} /> Matches</button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{id ? 'Edit Match Plan' : 'New Match Plan'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tactical planning and formation builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {id && <Button variant="ghost" className="text-rose-500 hover:bg-rose-500/10" onClick={() => setConfirmDel(true)}><Trash2 size={15} /> <span className="hidden sm:inline">Delete</span></Button>}
          {id && <Button variant="secondary" disabled={sharing} onClick={handleShare}><Share2 size={15} /> {sharing ? 'Sharing…' : 'Share'}</Button>}
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={15} /> {save.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>

      {/* Title + team */}
      <div className={`${card} mb-4`}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1"><Label>Plan Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. League Match vs Sundowns U17" /></div>
          <div className="sm:w-56"><Label>Team</Label>
            <Select value={squadId} onChange={e => setSquadId(e.target.value)}>
              <option value="">Select Team</option>
              {(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-slate-100 dark:bg-white/5 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={'flex-1 min-w-[88px] px-2 py-2 rounded-lg text-center transition-colors ' + (step === i ? 'bg-brand text-[#0D1B2A] shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">Step {i + 1}</span>
            <span className="text-sm font-semibold whitespace-nowrap">{s}</span>
          </button>
        ))}
      </div>

      {step === 0 && <MatchStep data={data} patch={patch} squadId={squadId} matches={matches || []} clubId={effectiveClubId} />}
      {step === 1 && <OppIntelStep data={data} patch={patch} />}
      {step === 2 && <SquadStep squadId={squadId} squadPlayers={squadPlayers} data={data} patch={patch} playerName={playerName} />}
      {step === 3 && <BoardStep title="Plan A — Starting Formation" boardKey="planA" data={data} patch={patch} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} />}
      {step === 4 && <BoardStep title="Plan B — Alternative Formation" boardKey="planB" data={data} patch={patch} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} withSubs squadPlayers={squadPlayers} />}
      {step === 5 && <BoardStep title="Plan C — Trailing / Chasing the Game" boardKey="planC" data={data} patch={patch} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} withSubs squadPlayers={squadPlayers} />}
      {step === 6 && <ZoneStep title="Offensive Behaviour" subtitle="Plan your attacking phases" group="offense" zones={[['buildup', 'Build-up'], ['transition', 'Transition'], ['attack', 'Attack']]} data={data} patch={patch} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} />}
      {step === 7 && <ZoneStep title="Defensive Behaviour" subtitle="Plan your defensive structure" group="defense" zones={[['defBlock', 'Defensive Block'], ['midPress', 'Midfield Press'], ['highPress', 'High Press']]} data={data} patch={patch} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} />}
      {step === 8 && <SetPiecesStep data={data} patch={patch} squadPlayers={squadPlayers} ourFormation={data.squad.formation} xiLabels={xiLabels} xiPlayers={xiPlayers} oppFormation={data.oppIntel.formation} />}
      {step === 9 && <ExportStep data={data} patch={patch} title={title} />}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-sentinel-border">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}><ChevronLeft size={15} /> Previous</Button>
        {step < STEPS.length - 1
          ? <Button variant="primary" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>Next <ChevronRight size={15} /></Button>
          : <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={15} /> Save Plan</Button>}
      </div>

      {confirmDel && (
        <Modal open onClose={() => setConfirmDel(false)} title={`Delete "${title || 'this plan'}"?`} size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => del.mutate()}>{del.isPending ? 'Deleting…' : 'Delete'}</Button>
          </>}>
          <p className="text-sm text-slate-500 dark:text-slate-400">This permanently removes the match plan and its boards.</p>
        </Modal>
      )}
    </div>
  );
};

// ── Step 0: Match ──
const MatchStep: React.FC<{ data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; squadId: string; matches: any[]; clubId: string | null }> = ({ data, patch, squadId, matches, clubId }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [quick, setQuick] = useState(false);
  const fixtures = matches.filter(m => !m.isPast);
  const m = data.match;
  const setM = (p: Partial<typeof m>) => patch({ match: { ...m, ...p } });
  const linked = matches.find(x => x.id === m.matchId);

  const onSelectFixture = (mid: string) => {
    const f = matches.find(x => x.id === mid);
    if (!f) { setM({ matchId: null }); return; }
    setM({ matchId: f.id, opponent: f.opponent || '', venue: f.venue || '', date: f.date || '', time: f.time || '', side: f.ourSide === 'away' ? 'away' : 'home' });
  };
  const createFixture = useMutation({
    mutationFn: () => createMatch(clubId!, { squadId: squadId || null, opponent: m.opponent, venue: m.venue, date: m.date, time: m.time, ourSide: m.side, status: 'fixture' }),
    onSuccess: (mid) => { queryClient.invalidateQueries({ queryKey: ['matches'] }); setM({ matchId: mid }); setQuick(false); showToast('Fixture created & linked.', 'success'); },
    onError: (e) => showError(e),
  });

  return (
    <div className={card}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white">Match Details</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Link to an existing fixture or enter details manually</p>
      <div className="mb-4">
        <Label>Link to Fixture</Label>
        <Select value={m.matchId || ''} onChange={e => onSelectFixture(e.target.value)}>
          <option value="">— Select a fixture (optional) —</option>
          {fixtures.map(f => <option key={f.id} value={f.id}>{f.opponent || 'TBD'}{f.date ? ` · ${f.date}` : ''}</option>)}
        </Select>
        <button onClick={() => setQuick(q => !q)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand hover:underline"><Plus size={14} /> Create New Fixture</button>
        {quick && (
          <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-sentinel-border grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Opponent *</Label><Input value={m.opponent} onChange={e => setM({ opponent: e.target.value })} placeholder="Opponent name" /></div>
            <div><Label>Venue</Label><Input value={m.venue} onChange={e => setM({ venue: e.target.value })} placeholder="Venue" /></div>
            <div><Label>Date *</Label><DatePicker value={m.date} onChange={e => setM({ date: e.target.value })} /></div>
            <div><Label>Kickoff</Label><TimePicker value={m.time} onChange={v => setM({ time: v })} /></div>
            <div className="sm:col-span-2 flex items-center justify-between">
              <Side value={m.side} onChange={s => setM({ side: s })} />
              <Button variant="primary" size="sm" disabled={createFixture.isPending || !m.opponent || !m.date} onClick={() => createFixture.mutate()}>Create & Select</Button>
            </div>
          </div>
        )}
      </div>
      {linked && <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300">Linked fixture: <b>{linked.opponent}</b>{linked.date ? ` · ${linked.date}` : ''}{linked.time ? ` · ${linked.time}` : ''}</div>}
      {!linked && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Opponent</Label><Input value={m.opponent} onChange={e => setM({ opponent: e.target.value })} placeholder="Opponent name" /></div>
          <div><Label>Venue</Label><Input value={m.venue} onChange={e => setM({ venue: e.target.value })} placeholder="Venue" /></div>
          <div><Label>Date</Label><DatePicker value={m.date} onChange={e => setM({ date: e.target.value })} /></div>
          <div><Label>Kickoff</Label><TimePicker value={m.time} onChange={v => setM({ time: v })} /></div>
          <div className="sm:col-span-2"><Label>Our Side</Label><Side value={m.side} onChange={s => setM({ side: s })} /></div>
        </div>
      )}
    </div>
  );
};
const Side: React.FC<{ value: 'home' | 'away'; onChange: (s: 'home' | 'away') => void }> = ({ value, onChange }) => (
  <div className="flex gap-2">
    {(['home', 'away'] as const).map(s => (
      <button key={s} onClick={() => onChange(s)} className={'px-3 py-1.5 rounded-lg text-sm font-semibold capitalize border transition-colors ' + (value === s ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 dark:border-sentinel-border text-slate-500')}>{s}</button>
    ))}
  </div>
);

// ── Step 1: Opp Intel ──
const OppIntelStep: React.FC<{ data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void }> = ({ data, patch }) => {
  const o = data.oppIntel;
  const setO = (p: Partial<typeof o>) => patch({ oppIntel: { ...o, ...p } });
  const [url, setUrl] = useState(''); const [label, setLabel] = useState('');
  const addLink = () => { if (!url.trim()) return; setO({ links: [...o.links, { url: url.trim(), label: label.trim() || undefined }] }); setUrl(''); setLabel(''); };
  return (
    <div className={card}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white"><i className="fas fa-binoculars text-amber-500 mr-2" />Opponent Intelligence</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Research and notes on the opposition — their style, key players, and tendencies</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div><Label>Context & Overview</Label><Textarea className="h-24" value={o.context} onChange={e => setO({ context: e.target.value })} placeholder="Form, league position, recent results, expected formation…" /></div>
          <div><Label>Collective Aspects</Label><Textarea className="h-24" value={o.collective} onChange={e => setO({ collective: e.target.value })} placeholder="Pressing triggers, build-up patterns, defensive shape, transitions…" /></div>
          <div><Label>Individual Key Players</Label><Textarea className="h-24" value={o.individual} onChange={e => setO({ individual: e.target.value })} placeholder="#10 creative, #9 strong in the air, LB overlaps…" /></div>
        </div>
        <div className="space-y-4">
          <div><Label>Expected Formation</Label><Select value={o.formation} onChange={e => setO({ formation: e.target.value })}>{OPP_FORMATIONS.map(f => <option key={f} value={f}>{f || 'Unknown / Not Set'}</option>)}</Select></div>
          <div>
            <Label>Video & Reference Links</Label>
            <div className="space-y-2">
              {o.links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-sentinel-border text-sm">
                  <ExternalLink size={14} className="text-brand shrink-0" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-brand no-underline">{l.label || l.url}</a>
                  <button onClick={() => setO({ links: o.links.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste URL" />
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" className="w-32" />
              <Button variant="secondary" size="sm" onClick={addLink}><Plus size={14} /></Button>
            </div>
          </div>
          <div><Label>Weaknesses to Exploit</Label><Textarea className="h-20" value={o.weaknesses} onChange={e => setO({ weaknesses: e.target.value })} placeholder="Slow CBs, weak 1v1 defending, poor aerially…" /></div>
          <div><Label>Strengths to Negate</Label><Textarea className="h-20" value={o.strengths} onChange={e => setO({ strengths: e.target.value })} placeholder="Dangerous counters, strong set pieces…" /></div>
        </div>
      </div>
    </div>
  );
};

// ── Step 2: Squad (formation token board) ──
const SquadStep: React.FC<{ squadId: string; squadPlayers: any[]; data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; playerName: (id: string | null) => string }> = ({ squadId, squadPlayers, data, patch, playerName }) => {
  const sq = data.squad;
  const slots = formationSlots(sq.formation);
  // Normalise startingXI to the formation length.
  const xi = slots.map((s, i) => sq.startingXI?.[i] || { slot: i, pos: s.pos, playerId: null, x: s.x, y: s.y });
  const setSquad = (p: Partial<typeof sq>) => patch({ squad: { ...sq, ...p } });
  const assignedIds = new Set([...xi.map(x => x.playerId).filter(Boolean), ...(sq.subs || [])]);
  const available = squadPlayers.filter(p => !assignedIds.has(p.id));

  const changeFormation = (f: string) => {
    const ns = formationSlots(f);
    const next = ns.map((s, i) => ({ slot: i, pos: s.pos, playerId: xi[i]?.playerId || null, x: s.x, y: s.y }));
    setSquad({ formation: f, startingXI: next });
  };
  const addToXI = (pid: string) => { const idx = xi.findIndex(x => !x.playerId); if (idx < 0) { setSquad({ subs: [...(sq.subs || []), pid] }); return; } const next = xi.map((x, i) => i === idx ? { ...x, playerId: pid } : x); setSquad({ startingXI: next }); };
  const removeFromXI = (i: number) => setSquad({ startingXI: xi.map((x, j) => j === i ? { ...x, playerId: null } : x) });
  const removeSub = (pid: string) => setSquad({ subs: (sq.subs || []).filter(s => s !== pid) });
  const moveToken = (id: string, x: number, y: number) => { const i = Number(id); setSquad({ startingXI: xi.map((s, j) => j === i ? { ...s, x, y } : s) }); };

  const tokens: PitchToken[] = xi.map((s, i) => { const nm = playerName(s.playerId); return { id: String(i), label: nm ? surname(nm) : s.pos, sub: nm ? s.pos : undefined, x: s.x, y: s.y }; });

  if (!squadId) return <div className={card + ' text-center text-slate-400'}>Select a team above to pick your squad.</div>;

  const Chip: React.FC<{ name: string; pos: string; onClick: () => void }> = ({ name, pos, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-white/5 hover:border-brand text-left mb-1.5">
      <span className="w-7 h-7 rounded-full bg-brand/15 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">{surname(name).slice(0, 2).toUpperCase()}</span>
      <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{name}</span>
      <span className="text-[11px] text-slate-400 shrink-0">{pos}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Squad Selection</h3>
          <div className="w-32"><Select value={sq.formation} onChange={e => changeFormation(e.target.value)}>{FORMATION_NAMES.map(f => <option key={f} value={f}>{f}</option>)}</Select></div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Pick your starting XI and substitutes</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Available <span className="text-slate-300">{available.length}</span></h4>
            <div className="max-h-[420px] overflow-y-auto pr-1">{available.length ? available.map(p => <Chip key={p.id} name={p.name} pos={p.position || '—'} onClick={() => addToXI(p.id)} />) : <p className="text-xs text-slate-400">All players assigned.</p>}</div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Starting XI <span className="text-slate-300">{xi.filter(x => x.playerId).length}/{xi.length}</span></h4>
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-1.5">
              {xi.map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-sentinel-border">
                  <span className="w-10 text-xs font-bold text-brand shrink-0">{s.pos}</span>
                  {s.playerId ? <><span className="flex-1 min-w-0 truncate text-sm text-slate-800 dark:text-slate-100">{playerName(s.playerId)}</span><button onClick={() => removeFromXI(i)} className="text-slate-400 hover:text-rose-500"><X size={14} /></button></>
                    : <span className="flex-1 text-sm text-slate-400 italic">— empty (tap an available player) —</span>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Substitutes <span className="text-slate-300">{(sq.subs || []).length}</span></h4>
            <div className="max-h-[420px] overflow-y-auto pr-1">{(sq.subs || []).length ? (sq.subs || []).map(pid => <Chip key={pid} name={playerName(pid)} pos="SUB" onClick={() => removeSub(pid)} />) : <p className="text-xs text-slate-400">Tap an available player when the XI is full to add subs.</p>}</div>
          </div>
        </div>
      </div>
      <div className={card}>
        <div className="flex items-center justify-between mb-1"><h3 className="text-base font-bold text-slate-900 dark:text-white">Formation & Pitch Preview</h3><div className="w-32"><Select value={sq.formation} onChange={e => changeFormation(e.target.value)}>{FORMATION_NAMES.map(f => <option key={f} value={f}>{f}</option>)}</Select></div></div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Drag a player on the pitch to fine-tune their position</p>
        <PitchStage tokens={tokens} editable onMove={moveToken} width={560} height={400} />
      </div>
    </div>
  );
};

// ── Steps 3-5: Plan boards ──
const BoardStep: React.FC<{ title: string; boardKey: 'planA' | 'planB' | 'planC'; data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; ourFormation: string; xiLabels: string[]; xiPlayers: { name: string; avatar: string | null }[]; oppFormation: string; withSubs?: boolean; squadPlayers?: any[] }> = ({ title, boardKey, data, patch, ourFormation, xiLabels, xiPlayers, oppFormation }) => {
  const board = data.plans[boardKey];
  const setBoard = (b: PlanBoard) => patch({ plans: { ...data.plans, [boardKey]: b } });
  return (
    <div className={card}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Show your formation (or the opposition), then draw movements & annotations — static or animated.</p>
      <TacticalBoard value={board} onChange={setBoard} ourFormation={ourFormation} ourLabels={xiLabels} ourXI={xiPlayers} oppFormation={oppFormation || '4-3-3'} notesPlaceholder={`${title} notes — tactical instructions, key principles…`} />
    </div>
  );
};

// ── Steps 6-7: Zone boards (offense / defense) ──
const ZoneStep: React.FC<{ title: string; subtitle: string; group: 'offense' | 'defense'; zones: [string, string][]; data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; ourFormation: string; xiLabels: string[]; xiPlayers: { name: string; avatar: string | null }[]; oppFormation: string }> = ({ title, subtitle, group, zones, data, patch, ourFormation, xiLabels, xiPlayers, oppFormation }) => {
  const [zone, setZone] = useState(zones[0][0]);
  const board = data[group][zone] || { notes: '' };
  const setBoard = (b: PlanBoard) => patch({ [group]: { ...data[group], [zone]: b } } as Partial<MatchPlanData>);
  return (
    <div className={card}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>
      <div className="inline-flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/5 mb-4">
        {zones.map(([k, lab]) => <button key={k} onClick={() => setZone(k)} className={'px-4 py-1.5 rounded-md text-sm font-semibold ' + (zone === k ? 'bg-white dark:bg-sentinel-surface text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}>{lab}</button>)}
      </div>
      <TacticalBoard key={zone} value={board} onChange={setBoard} ourFormation={ourFormation} ourLabels={xiLabels} ourXI={xiPlayers} oppFormation={oppFormation || '4-3-3'} notesPlaceholder={`${zones.find(z => z[0] === zone)?.[1]} notes…`} />
    </div>
  );
};

// ── Step 8: Set Pieces ──
const SetPiecesStep: React.FC<{ data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; squadPlayers: any[]; ourFormation: string; xiLabels: string[]; xiPlayers: { name: string; avatar: string | null }[]; oppFormation: string }> = ({ data, patch, squadPlayers, ourFormation, xiLabels, xiPlayers, oppFormation }) => {
  const sp = data.setPieces;
  const setTaker = (k: string, v: string) => patch({ setPieces: { ...sp, takers: { ...sp.takers, [k]: v } } });
  const setBoard = (k: 'cornersFor' | 'cornersAgainst', b: PlanBoard) => patch({ setPieces: { ...sp, [k]: b } });
  const TAKERS: [string, string][] = [['freeKickNear', 'Free kick (near goal)'], ['freeKickFar', 'Free kick (far / deep)'], ['penalty', 'Penalty'], ['cornerLeft', 'Corner (left)'], ['cornerRight', 'Corner (right)']];
  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Select Takers</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Who takes the set pieces?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TAKERS.map(([k, lab]) => (
            <div key={k}><Label>{lab}</Label>
              <Select value={sp.takers[k] || ''} onChange={e => setTaker(k, e.target.value)}>
                <option value="">— select —</option>
                {squadPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          ))}
        </div>
      </div>
      <div className={card}>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1"><i className="fas fa-flag text-emerald-500 mr-2" />Corners — For Us</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Plan your corner kick routines</p>
        <TacticalBoard value={sp.cornersFor} onChange={b => setBoard('cornersFor', b)} ourFormation={ourFormation} ourLabels={xiLabels} ourXI={xiPlayers} oppFormation={oppFormation || '4-3-3'} notesPlaceholder="Corner routines — short, near post, far post, variations…" />
      </div>
      <div className={card}>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1"><i className="fas fa-shield-alt text-rose-500 mr-2" />Corners — Against Us</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Defensive set-up for defending corners</p>
        <TacticalBoard value={sp.cornersAgainst} onChange={b => setBoard('cornersAgainst', b)} ourFormation={ourFormation} ourLabels={xiLabels} ourXI={xiPlayers} oppFormation={oppFormation || '4-3-3'} notesPlaceholder="Defending corners — zonal, man-marking, responsibilities…" />
      </div>
    </div>
  );
};

// ── Step 9: Export ──
const ExportStep: React.FC<{ data: MatchPlanData; patch: (p: Partial<MatchPlanData>) => void; title: string }> = ({ data, patch, title }) => {
  const SECTIONS: [string, string][] = [['squad', 'Squad Selection'], ['match', 'Match Details'], ['oppIntel', 'Opponent Intelligence'], ['planA', 'Plan A — Starting Formation'], ['planB', 'Plan B — Alternative'], ['planC', 'Plan C — Trailing'], ['offense', 'Offensive Behaviour'], ['defense', 'Defensive Behaviour'], ['setPieces', 'Set Pieces']];
  const toggle = (k: string) => patch({ exportSections: { ...data.exportSections, [k]: !data.exportSections[k] } });
  return (
    <div className={card}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Export Match Plan</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Select which sections to include, then print or save as PDF</p>
      <div className="space-y-2 max-w-md">
        {SECTIONS.map(([k, lab]) => (
          <label key={k} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-sentinel-border cursor-pointer hover:border-brand">
            <input type="checkbox" checked={data.exportSections[k] !== false} onChange={() => toggle(k)} className="w-4 h-4 accent-brand" />
            <span className="text-sm text-slate-700 dark:text-slate-200">{lab}</span>
          </label>
        ))}
      </div>
      <div className="mt-6 text-center">
        <Button variant="primary" onClick={() => window.print()}><i className="fas fa-file-pdf mr-1.5" /> Export PDF Dossier{title ? '' : ''}</Button>
      </div>
    </div>
  );
};
