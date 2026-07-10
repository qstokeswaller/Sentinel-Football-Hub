import React from 'react';
import { computePillars, type ScoutRatings } from '../../lib/reportSections';
import { RatingRadar } from '../ui/RatingRadar';

/**
 * The scouting "pentagon" — a radar of the player's per-pillar averages (Attacking / Defending /
 * Physical / Tactical / Mental, on a 1–5 scale). Delegates to the shared RatingRadar.
 */
export const ScoutRadar: React.FC<{ ratings: ScoutRatings; height?: number; color?: string }> = ({ ratings, height, color }) => (
  <RatingRadar axes={computePillars(ratings).map(p => ({ label: p.label, value: p.value }))} height={height} color={color} />
);
