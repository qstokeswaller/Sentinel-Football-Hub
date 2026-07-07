import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMatchPlanDossier } from '../services/matchPlanService';
import { renderDrillThumbnail } from '../components/pitch/drillRenderer';
import { AnimationPlayer } from '../components/pitch/AnimationPlayer';
import { formationSlots } from '../lib/formations';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';

/** Public, branded, read-only Match Plan dossier. ?token=<uuid>, no auth, light mode.
 *  Static boards render as pitch images; animated boards PLAY (like library animations). */
const surname = (n: string) => (n || '').trim().split(/\s+/).slice(-1)[0] || '';
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);

const hasStatic = (b: any) => b && b.mode !== 'animated' && ((b.data?.objects?.length || 0) + (b.data?.drawings?.length || 0) > 0);
const hasAnim = (b: any, anims: Record<string, any>) => !!(b && b.mode === 'animated' && b.animationId && anims[b.animationId]);
const hasBoard = (b: any, anims: Record<string, any>) => hasStatic(b) || hasAnim(b, anims);
const staticImg = (b: any): string | null => {
  const d = b?.data; if (!d) return null;
  return renderDrillThumbnail({ pitchType: d.pitchType || 'full', orientation: d.orientation || 'landscape', flip: d.flip, grid: d.grid, gridColor: d.gridColor, objects: d.objects || [], drawings: d.drawings || [] }, 820);
};

const BoardView: React.FC<{ board: any; anims: Record<string, any> }> = ({ board, anims }) => {
  if (hasAnim(board, anims)) {
    const a = anims[board.animationId];
    return <AnimationPlayer frames={a.frames} pitchType={a.pitchType} orientation={a.orientation} frameDuration={a.frameDuration} flip={a.flip} grid={a.grid} gridColor={a.gridColor} />;
  }
  const img = staticImg(board);
  return img ? <img src={img} alt="" className="w-full rounded-xl border border-slate-200" /> : null;
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">{children}</div>;
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => <h2 className="text-lg font-bold text-slate-900 mb-3">{children}</h2>;
const Note: React.FC<{ text?: string }> = ({ text }) => text ? <p className="text-sm text-slate-600 whitespace-pre-wrap mt-3">{text}</p> : null;

export const MatchPlanDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { data, isLoading, error } = useQuery({ queryKey: ['match-plan-dossier', token], queryFn: () => fetchMatchPlanDossier(token), enabled: !!token, retry: false });

  if (!token) return <Centered>Invalid plan link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading match plan…</Centered>;
  if (error || !data?.plan) return <Centered>This match plan link is invalid or has expired.</Centered>;

  const plan = data.plan; const d = plan.data || {}; const squad = data.squad; const players = data.players || {}; const anims = data.animations || {};
  const nameOf = (id: string) => (players[id]?.name as string) || '';
  const m = d.match || {}; const o = d.oppIntel || {};
  const ex = d.exportSections || {}; const show = (k: string) => ex[k] !== false;

  const sq = d.squad || { formation: '4-3-3', startingXI: [] };
  const slots = formationSlots(sq.formation);
  const xi = slots.map((s: any, i: number) => sq.startingXI?.[i] || { pos: s.pos, playerId: null, x: s.x, y: s.y });
  const squadImg = renderDrillThumbnail({
    pitchType: 'full', orientation: 'landscape', objects: xi.map((s: any, i: number) => {
      const nm = s.playerId ? nameOf(s.playerId) : '';
      return { id: `x${i}`, type: s.pos === 'GK' ? 'gk' : 'player', x: s.x, y: s.y, color: '#00C49A', size: 'medium', label: nm ? surname(nm) : s.pos };
    }) as any, drawings: [],
  }, 820);

  const matchLine = `${squad?.name || 'Our Team'} ${m.side === 'away' ? '(Away)' : '(Home)'} vs ${m.opponent || 'Opponent'}`;
  const boards: [string, any, string][] = [['Plan A — Starting Formation', d.plans?.planA, 'planA'], ['Plan B — Alternative', d.plans?.planB, 'planB'], ['Plan C — Trailing', d.plans?.planC, 'planC']];
  const offZones: [string, any][] = [['Build-up', d.offense?.buildup], ['Transition', d.offense?.transition], ['Attack', d.offense?.attack]];
  const defZones: [string, any][] = [['Defensive Block', d.defense?.defBlock], ['Midfield Press', d.defense?.midPress], ['High Press', d.defense?.highPress]];
  const takers: [string, string][] = [['Free kick (near)', 'freeKickNear'], ['Free kick (far)', 'freeKickFar'], ['Penalty', 'penalty'], ['Corner (left)', 'cornerLeft'], ['Corner (right)', 'cornerRight']];
  const takerRows = takers.map(([lab, k]) => [lab, nameOf((d.setPieces?.takers || {})[k])]).filter(r => r[1]);
  const hasAnimated = [d.plans?.planA, d.plans?.planB, d.plans?.planC, ...Object.values(d.offense || {}), ...Object.values(d.defense || {}), d.setPieces?.cornersFor, d.setPieces?.cornersAgainst].some(b => hasAnim(b, anims));

  return (
    <PublicShareShell club={data.club || { name: '' }} label="Match Plan" maxWidth="max-w-4xl" action={<ShareDownloadButton onClick={() => window.print()} label="Print / PDF" />}>
      <Card>
        <div className="text-xs font-bold uppercase tracking-wider text-brand mb-1">Match Plan</div>
        <h1 className="text-2xl font-bold text-slate-900">{plan.title || 'Match Plan'}</h1>
        <p className="text-sm text-slate-600 mt-1">{matchLine}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
          {m.date && <span><i className="fas fa-calendar mr-1.5" />{m.date}</span>}
          {m.time && <span><i className="fas fa-clock mr-1.5" />{m.time}</span>}
          {m.venue && <span><i className="fas fa-location-dot mr-1.5" />{m.venue}</span>}
          {squad?.age_group && <span><i className="fas fa-users mr-1.5" />{squad.age_group}</span>}
        </div>
        {hasAnimated && <p className="text-xs text-slate-400 mt-3"><i className="fas fa-circle-play mr-1.5 text-brand" />This plan has animated phases — press play on a board to watch the movement. (Animated boards can't be captured in a printed PDF.)</p>}
      </Card>

      {show('squad') && (
        <Card>
          <SectionTitle>Squad — {sq.formation}</SectionTitle>
          <img src={squadImg} alt="Formation" className="w-full rounded-xl border border-slate-200" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-4 text-sm">
            {xi.map((s: any, i: number) => <div key={i} className="flex items-center gap-2"><span className="w-10 text-xs font-bold text-brand">{s.pos}</span><span className="text-slate-700 truncate">{s.playerId ? nameOf(s.playerId) : '—'}</span></div>)}
          </div>
          {(sq.subs || []).length > 0 && <div className="mt-3 text-sm text-slate-500"><b className="text-slate-700">Subs:</b> {(sq.subs || []).map((id: string) => nameOf(id)).filter(Boolean).join(', ')}</div>}
        </Card>
      )}

      {show('oppIntel') && (o.context || o.collective || o.individual || o.weaknesses || o.strengths || o.formation) && (
        <Card>
          <SectionTitle>Opponent Intelligence</SectionTitle>
          {o.formation && <div className="text-sm text-slate-600 mb-2"><b className="text-slate-700">Expected formation:</b> {o.formation}</div>}
          {[['Context & Overview', o.context], ['Collective Aspects', o.collective], ['Individual Key Players', o.individual], ['Weaknesses to Exploit', o.weaknesses], ['Strengths to Negate', o.strengths]]
            .filter(r => r[1]).map(([lab, txt]) => <div key={lab as string} className="mb-2"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{lab}</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{txt}</p></div>)}
          {(o.links || []).length > 0 && <div className="mt-2 text-sm">{(o.links || []).map((l: any, i: number) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="block text-brand truncate">{l.label || l.url}</a>)}</div>}
        </Card>
      )}

      {boards.map(([label, b, key]) => {
        if (!show(key) || (!hasBoard(b, anims) && !b?.notes)) return null;
        return <Card key={label}><SectionTitle>{label}</SectionTitle><BoardView board={b} anims={anims} /><Note text={b?.notes} /></Card>;
      })}

      {([['Offensive Behaviour', 'offense', offZones], ['Defensive Behaviour', 'defense', defZones]] as [string, string, [string, any][]][]).map(([label, key, zones]) => {
        if (!show(key)) return null;
        const rendered = zones.filter(([, zb]) => hasBoard(zb, anims) || zb?.notes);
        if (!rendered.length) return null;
        return (
          <Card key={label}>
            <SectionTitle>{label}</SectionTitle>
            <div className="space-y-5">{rendered.map(([zl, zb]) => <div key={zl}><div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">{zl}</div><BoardView board={zb} anims={anims} /><Note text={zb?.notes} /></div>)}</div>
          </Card>
        );
      })}

      {show('setPieces') && (takerRows.length > 0 || hasBoard(d.setPieces?.cornersFor, anims) || hasBoard(d.setPieces?.cornersAgainst, anims)) && (
        <Card>
          <SectionTitle>Set Pieces</SectionTitle>
          {takerRows.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mb-4 text-sm">{takerRows.map(([lab, nm]) => <div key={lab}><span className="text-slate-400 text-xs">{lab}: </span><span className="text-slate-700 font-medium">{nm}</span></div>)}</div>}
          {[['Corners — For Us', d.setPieces?.cornersFor], ['Corners — Against Us', d.setPieces?.cornersAgainst]].map(([lab, b]) => {
            if (!hasBoard(b, anims) && !(b as any)?.notes) return null;
            return <div key={lab as string} className="mb-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">{lab as string}</div><BoardView board={b} anims={anims} /><Note text={(b as any)?.notes} /></div>;
          })}
        </Card>
      )}
    </PublicShareShell>
  );
};
