import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimationPlayer } from './AnimationPlayer';
import { fetchAnimation } from '../../services/animationService';

/**
 * Fetches an animation by id and renders the player at the correct pitch proportions.
 * Shared by the Library modal and the Session Builder's animated drill card.
 * `autoPlay={false}` shows the semi-transparent play button first (click to play).
 */
export const AnimatedPreview: React.FC<{ animationId: string; autoPlay?: boolean }> = ({ animationId, autoPlay = false }) => {
  const { data, isLoading } = useQuery({ queryKey: ['animation', animationId], queryFn: () => fetchAnimation(animationId) });
  if (isLoading || !data) return <div className="aspect-[3/2] grid place-items-center text-slate-400 text-sm"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>;
  return <AnimationPlayer frames={data.frames} pitchType={data.pitchType} orientation={data.orientation} frameDuration={data.frameDuration} flip={data.flip} grid={data.grid} gridColor={data.gridColor} autoPlay={autoPlay} />;
};
