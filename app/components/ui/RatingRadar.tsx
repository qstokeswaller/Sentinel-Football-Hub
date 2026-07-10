import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export interface RadarAxis { label: string; value: number; }

/**
 * Generic 1–5 "pentagon" radar. Plots a set of labelled axes (per-pillar or per-category
 * averages). Needs ≥3 axes to draw a shape, else renders nothing. Shared by the scouting
 * profile (ScoutRadar) and the player-profile report history.
 */
export const RatingRadar: React.FC<{ axes: RadarAxis[]; height?: number; color?: string }> = ({ axes, height = 220, color = '#00C49A' }) => {
  if (axes.length < 3) return null;
  const data = axes.map(a => ({ axis: a.label, value: a.value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9, fill: '#cbd5e1' }} axisLine={false} />
        <Radar dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.28} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
};
