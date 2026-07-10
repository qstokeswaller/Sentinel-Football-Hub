import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Film, User } from 'lucide-react';
import { fetchSharedDrill } from '../services/drillShareService';
import { DrillView } from '../components/pitch/DrillView';
import { AnimationPlayer } from '../components/pitch/AnimationPlayer';
import { DrillSections } from '../components/DrillSections';
import { normaliseDrawingData, normaliseFrames } from '../components/pitch/drillRenderer';
import { pitchAspect } from '../components/pitch/pitchGeometry';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';
import { downloadSessionPdf } from '../lib/sessionExport';

/** Public single-drill share — ?token=<uuid>, no auth. Static → image; animated → playable. */
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);

export const DrillSharePage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-drill', token],
    queryFn: () => fetchSharedDrill(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid drill link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading drill…</Centered>;
  if (error || !data?.drill) return <Centered>This drill link is invalid or has expired.</Centered>;

  const { drill, club, animation } = data;
  const isAnimated = animation && Array.isArray(animation.frames) && animation.frames.length > 1;
  const dd = normaliseDrawingData(drill.drawing_data);

  // Static drills download as a PDF from inside the share page (animated ones play, can't be PDF'd).
  const exportPdf = () => downloadSessionPdf(
    { title: drill.title, author: drill.author } as any,
    [{ title: drill.title, description: drill.description || '', pitchType: drill.pitch_type, orientation: drill.orientation, objects: dd.objects, drawings: dd.drawings, flip: dd.flip }],
    club?.display_name || club?.name || 'Sentinel Football Hub',
  );

  const aspect = isAnimated ? pitchAspect(animation.pitch_type, animation.orientation) : pitchAspect(drill.pitch_type || 'full', drill.orientation || 'landscape');
  const pitchMaxW = Math.round(540 * aspect); // cap by height → neat + centred for any pitch type / orientation
  const pitch = isAnimated
    ? <AnimationPlayer frames={normaliseFrames(animation.frames)} pitchType={animation.pitch_type} orientation={animation.orientation} frameDuration={animation.frame_duration} autoPlay={false} />
    : <DrillView pitchType={drill.pitch_type || 'full'} orientation={drill.orientation || 'landscape'} objects={dd.objects} drawings={dd.drawings} flip={dd.flip} />;

  return (
    <PublicShareShell club={club} label="Drill" maxWidth="max-w-[1680px]" action={isAnimated ? undefined : <ShareDownloadButton onClick={exportPdf} label="Print / PDF" />}>
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <h1 className="text-xl font-bold text-slate-900 flex-1 min-w-0">{drill.title || 'Drill'}</h1>
          {drill.category_tag && <span className="text-[11px] font-semibold rounded bg-brand/10 text-brand px-2 py-0.5 shrink-0">{drill.category_tag}</span>}
          {isAnimated && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand bg-brand/10 rounded-full px-2.5 py-1 shrink-0"><Film size={11} /> Animated</span>}
        </div>
        {drill.author && <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5"><User size={14} className="text-slate-400" /> {drill.author}</p>}
        {/* Pitch one half, descriptors the other (even 50/50); pitch height-capped + centred so it stays neat for any pitch type/orientation. */}
        <div className="grid lg:grid-cols-2 gap-5 lg:gap-8 lg:items-center">
          <div className="w-full mx-auto" style={{ maxWidth: pitchMaxW }}>{pitch}</div>
          <div><DrillSections description={drill.description} all /></div>
        </div>
      </section>
    </PublicShareShell>
  );
};
