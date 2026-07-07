import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Timer, MapPin, User, Users, Star, Package, Film } from 'lucide-react';
import { fetchSharedSession } from '../services/sessionShareService';
import { downloadSessionPdf } from '../lib/sessionExport';
import { DrillView } from '../components/pitch/DrillView';
import { AnimationPlayer } from '../components/pitch/AnimationPlayer';
import { DrillSections } from '../components/DrillSections';
import { normaliseDrawingData, normaliseFrames } from '../components/pitch/drillRenderer';
import { pitchAspect } from '../components/pitch/pitchGeometry';
import { flattenDrillDescription } from '../lib/drillText';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';

/** Public session plan — ?token=<uuid>, no auth. Static + animated drills, PDF top-right. */
// Target pitch height (px) on desktop — pitch width = PITCH_H × aspect, so every pitch type/
// orientation renders at a consistent, neat height and sits centred in its 50% column.
const PITCH_H = 540;
const fmtDate = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
const Chip: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon size={14} className="text-brand shrink-0" />{children}</span>
);
const Detail: React.FC<{ icon: React.ElementType; label: string; value?: string | null }> = ({ icon: Icon, label, value }) => value ? (
  <div className="flex items-start gap-2">
    <Icon size={15} className="text-slate-400 mt-0.5 shrink-0" />
    <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div><div className="text-sm text-slate-700 break-words">{value}</div></div>
  </div>
) : null;

export const SessionSharePage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-session', token],
    queryFn: () => fetchSharedSession(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid session link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading session…</Centered>;
  if (error || !data?.session) return <Centered>This session link is invalid or has expired.</Centered>;

  const { session, club, drills = [], animations = [] } = data;
  const animById = (id: string) => animations.find((a: any) => a.id === id);
  const clubName = club?.display_name || club?.name || 'Sentinel Football Hub';

  const exportPdf = () => {
    const pdfDrills = (drills || []).map((d: any) => {
      const anim = d.animation_id ? animById(d.animation_id) : null;
      if (anim) {
        const f = normaliseFrames(anim.frames)[0] || { objects: [], drawings: [] };
        return { title: d.title, description: d.description || '', animated: true, pitchType: anim.pitch_type, orientation: anim.orientation, objects: f.objects, drawings: f.drawings, grid: anim.grid };
      }
      const dd = normaliseDrawingData(d.drawing_data);
      return { title: d.title, description: d.description || '', pitchType: d.pitch_type, orientation: d.orientation, objects: dd.objects, drawings: dd.drawings, flip: dd.flip, grid: dd.grid };
    });
    downloadSessionPdf(session, pdfDrills, clubName);
  };

  const dur = session.duration ? (/[a-z]/i.test(String(session.duration)) ? String(session.duration) : `${session.duration} min`) : '';
  const hasDetails = session.team || session.venue || session.author || session.ability_level || session.equipment;
  // PDF only makes sense for static-only sessions — hide it once any drill is animated.
  const hasAnimated = (drills || []).some((d: any) => { const a = d.animation_id ? animById(d.animation_id) : null; return a && Array.isArray(a.frames) && a.frames.length > 1; });

  // Group drills by session section (Warm Up / Main / Cool Down …) so the share page mirrors the plan.
  const phaseNames: string[] = Array.isArray(session.session_phases) ? session.session_phases : [];
  const phaseGroups = (() => {
    const maxPhase = (drills || []).reduce((m: number, d: any) => Math.max(m, d.phase ?? 0), 0);
    const count = Math.max(phaseNames.length, maxPhase + 1);
    const groups: { name: string; drills: any[] }[] = [];
    for (let pi = 0; pi < count; pi++) {
      const ds = (drills || []).filter((d: any) => (d.phase ?? 0) === pi);
      if (ds.length) groups.push({ name: phaseNames[pi] || `Part ${pi + 1}`, drills: ds });
    }
    return groups.length ? groups : (drills.length ? [{ name: '', drills }] : []);
  })();

  const renderDrill = (d: any, num: number) => {
    const anim = d.animation_id ? animById(d.animation_id) : null;
    const isAnimated = anim && Array.isArray(anim.frames) && anim.frames.length > 1;
    const dd = normaliseDrawingData(d.drawing_data);
    const pitchLeft = num % 2 === 1; // alternate sides per drill so the page reads with rhythm
    const aspect = isAnimated ? pitchAspect(anim.pitch_type, anim.orientation) : pitchAspect(d.pitch_type || 'full', d.orientation || 'landscape');
    const pitchMaxW = Math.round(PITCH_H * aspect); // cap by height → neat + centred for any pitch type / orientation
    const pitch = isAnimated
      ? <AnimationPlayer frames={normaliseFrames(anim.frames)} pitchType={anim.pitch_type} orientation={anim.orientation} frameDuration={anim.frame_duration} flip={anim.flip} grid={anim.grid} gridColor={anim.grid_color} autoPlay={false} />
      : <DrillView pitchType={d.pitch_type || 'full'} orientation={d.orientation || 'landscape'} objects={dd.objects} drawings={dd.drawings} flip={dd.flip} grid={dd.grid} gridColor={dd.gridColor} />;
    return (
      <section key={d.id || num} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-7 h-7 rounded-lg bg-brand text-[#0a1628] text-sm font-bold flex items-center justify-center shrink-0">{num}</span>
          <h2 className="text-lg font-bold text-slate-900 flex-1 min-w-0">{d.title || `Drill ${num}`}</h2>
          {isAnimated && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand bg-brand/10 rounded-full px-2.5 py-1 shrink-0"><Film size={11} /> Animated</span>}
        </div>
        {/* Pitch one half, descriptors the other (even 50/50); alternating per drill. The pitch is
            height-capped + centred in its half so it stays neat for ANY pitch type or orientation. */}
        <div className="grid lg:grid-cols-2 gap-5 lg:gap-8 lg:items-center">
          <div className={'w-full mx-auto ' + (pitchLeft ? '' : 'lg:order-2')} style={{ maxWidth: pitchMaxW }}>{pitch}</div>
          <div className={pitchLeft ? '' : 'lg:order-1'}><DrillSections description={d.description} all /></div>
        </div>
      </section>
    );
  };

  return (
    <PublicShareShell club={club} label="Session Plan" maxWidth="max-w-[1680px]" action={hasAnimated ? undefined : <ShareDownloadButton onClick={exportPdf} />}>
      {/* Session header — kept centred + comfortable to read above the wider drill layout */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6 max-w-3xl mx-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-slate-900">{session.title || 'Training Session'}</h1>
          {(session.date || session.start_time || dur) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {session.date && <Chip icon={Calendar}>{fmtDate(session.date)}</Chip>}
              {session.start_time && <Chip icon={Clock}>{session.start_time}</Chip>}
              {dur && <Chip icon={Timer}>{dur}</Chip>}
            </div>
          )}
          {session.purpose?.trim() && (
            <div className="mt-4 rounded-xl bg-brand/5 border border-brand/20 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand mb-1">Purpose</div>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{flattenDrillDescription(session.purpose)}</p>
            </div>
          )}
          {hasDetails && (
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5 pt-4 border-t border-slate-100">
              <Detail icon={Users} label="Team / Group" value={session.team} />
              <Detail icon={MapPin} label="Venue" value={session.venue} />
              <Detail icon={User} label="Coach" value={session.author} />
              <Detail icon={Star} label="Ability" value={session.ability_level} />
              <Detail icon={Package} label="Equipment" value={session.equipment} />
            </div>
          )}
        </div>
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {drills.length} drill{drills.length === 1 ? '' : 's'}
        </div>
      </section>

      {/* Drills grouped by session section (Warm Up / Main / Cool Down …) */}
      {!drills.length ? (
        <div className="py-12 text-center text-slate-400">No drills in this session.</div>
      ) : (
        <div className="space-y-8">
          {phaseGroups.map((g, gi) => {
            let start = 0; for (let k = 0; k < gi; k++) start += phaseGroups[k].drills.length;
            return (
              <div key={gi}>
                {g.name && (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0a1628] bg-brand rounded-full px-3.5 py-1.5">{g.name}</span>
                    <span className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400 shrink-0">{g.drills.length} drill{g.drills.length === 1 ? '' : 's'}</span>
                  </div>
                )}
                <div className="space-y-5">{g.drills.map((d, i) => renderDrill(d, start + i + 1))}</div>
              </div>
            );
          })}
        </div>
      )}
    </PublicShareShell>
  );
};
