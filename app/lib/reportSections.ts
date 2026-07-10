/** Scout-report attribute model — ported from src/js/report-sections.js (1–5 scale). */
export const REPORT_SCALE_LABELS = ['Poor', 'Below Avg', 'Average', 'Above Avg', 'Excellent'];

export interface ReportSection { key: string; label: string; icon: string; color: string; attributes: { key: string; label: string }[]; }

export const REPORT_SECTIONS: ReportSection[] = [
  {
    key: 'technicalAttacking', label: 'Technical - Attacking', icon: 'fa-futbol', color: '#00C49A',
    attributes: [
      { key: 'short_passing', label: 'Short Passing Range' },
      { key: 'medium_passing', label: 'Medium Passing Range' },
      { key: 'long_passing', label: 'Long Passing Range' },
      { key: 'first_touch_ground', label: 'First Touch Under Pressure (Ground)' },
      { key: 'first_touch_air', label: 'First Touch Under Pressure (Air)' },
      { key: 'protecting_shielding', label: 'Protecting / Shielding The Ball' },
      { key: 'heading_att', label: 'Heading' },
      { key: 'shooting_finishing', label: 'Shooting / Finishing' },
      { key: 'dribbling_running', label: 'Dribbling / Running with the Ball' },
    ],
  },
  {
    key: 'technicalDefending', label: 'Technical - Defending', icon: 'fa-shield-alt', color: '#00C49A',
    attributes: [
      { key: 'ind_def_positioning', label: 'Individual Def: Positioning' },
      { key: 'ind_def_timing', label: 'Individual Def: Timing' },
      { key: 'ground_def_pressure', label: 'Ground Def: Pressure' },
      { key: 'ground_def_cover', label: 'Ground Def: Cover' },
      { key: 'heading_def', label: 'Heading' },
    ],
  },
  {
    key: 'tacticalAttacking', label: 'Tactical - Attacking', icon: 'fa-chess', color: '#10b981',
    attributes: [
      { key: 'hold_penetrate', label: 'Recognize When to Hold / Penetrate' },
      { key: 'understands_tactical_plan_att', label: 'Understands Tactical Plan' },
      { key: 'principles_of_attack', label: 'Understands Principles of Attack' },
      { key: 'transition_def_att', label: 'Understands Transition Def → Att' },
      { key: 'roles_responsibility_att', label: 'Understands Roles / Responsibility' },
      { key: 'purposeful_movements', label: 'Purposeful Movements' },
      { key: 'decision_making_att', label: 'Decision Making' },
      { key: 'scanning_att', label: 'Scanning' },
    ],
  },
  {
    key: 'tacticalDefending', label: 'Tactical - Defending', icon: 'fa-chess-rook', color: '#10b981',
    attributes: [
      { key: 'understands_tactical_plan_def', label: 'Understands Tactical Plan' },
      { key: 'principles_of_defending', label: 'Understands Principles of Defending' },
      { key: 'transition_att_def', label: 'Understands Transition Att → Def' },
      { key: 'roles_responsibility_def', label: 'Understands Roles / Responsibility' },
      { key: 'game_awareness', label: 'Game Awareness' },
      { key: 'decision_making_def', label: 'Decision Making' },
      { key: 'scanning_def', label: 'Scanning' },
    ],
  },
  {
    key: 'physical', label: 'Physical', icon: 'fa-running', color: '#f59e0b',
    attributes: [
      { key: 'speed_with_ball', label: 'Overall Speed With The Ball' },
      { key: 'speed_without_ball', label: 'Overall Speed Without The Ball' },
      { key: 'endurance', label: 'Endurance' },
      { key: 'agility', label: 'Agility' },
      { key: 'change_of_pace', label: 'Change of Pace' },
      { key: 'strength_power', label: 'Strength / Power' },
    ],
  },
  {
    key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#8b5cf6',
    attributes: [
      { key: 'training_mentality', label: 'Training Mentality' },
      { key: 'game_mentality', label: 'Game Mentality' },
      { key: 'concentration_focus', label: 'Concentration / Focus' },
      { key: 'coachability', label: 'Coachability' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'handles_failure', label: 'Handles Failure' },
      { key: 'communication', label: 'Communication on the Field' },
    ],
  },
];

/**
 * Quick report — 4 broad categories (matches the v7 structure the DB actually stores).
 * A scouting report's `ratings` is a FLAT map { attributeKey: 1-5 } (NOT nested by section);
 * sections are only used to GROUP the display. Quick reports use these keys, full reports
 * use REPORT_SECTIONS above.
 */
export const QUICK_REPORT_SECTIONS: ReportSection[] = [
  {
    key: 'attacking', label: 'Attacking', icon: 'fa-futbol', color: '#00C49A',
    attributes: [
      { key: 'reading_att', label: 'Reading' }, { key: 'positioning_att', label: 'Positioning' },
      { key: 'ball_control', label: 'Ball Control' }, { key: 'first_touch', label: 'First Touch' },
      { key: 'execution_speed', label: 'Execution Speed' }, { key: 'short_passing', label: 'Short Passing' },
      { key: 'dribbling', label: 'Dribbling' },
    ],
  },
  {
    key: 'defensive', label: 'Defensive', icon: 'fa-shield-alt', color: '#10b981',
    attributes: [
      { key: 'reading_def', label: 'Reading' }, { key: 'positioning_def', label: 'Positioning' },
      { key: 'marking', label: 'Marking' }, { key: 'anticipation', label: 'Anticipation' },
      { key: 'ball_take', label: 'Ball Take' }, { key: 'heading_def', label: 'Heading' },
    ],
  },
  {
    key: 'physical', label: 'Physical', icon: 'fa-running', color: '#f59e0b',
    attributes: [
      { key: 'stamina', label: 'Stamina' }, { key: 'strength', label: 'Strength' },
      { key: 'physical_contact', label: 'Physical Contact' }, { key: 'speed', label: 'Speed' },
      { key: 'speed_change', label: 'Speed Change' }, { key: 'agility', label: 'Agility' },
    ],
  },
  {
    key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#8b5cf6',
    attributes: [
      { key: 'personality', label: 'Personality' }, { key: 'aggressiveness', label: 'Aggressiveness' },
      { key: 'attitude', label: 'Attitude' }, { key: 'emotional_control', label: 'Emotional Control' },
      { key: 'leadership', label: 'Leadership' },
    ],
  },
];

export type ScoutRatings = Record<string, number>;
export const sectionsForType = (type: string | null | undefined): ReportSection[] => type === 'full' ? REPORT_SECTIONS : QUICK_REPORT_SECTIONS;

/** Mean of every rated attribute in a FLAT ratings map { key: 1-5 }, to 2 decimals. */
export function computeGlobalAverage(ratings: ScoutRatings | null | undefined): number | null {
  const vals = Object.values(ratings || {}).filter((v): v is number => typeof v === 'number' && v > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

/** Average rating per section (over that section's attributes present in the flat ratings). */
export function computeCategoryAverages(ratings: ScoutRatings | null | undefined, sections: ReportSection[]): { key: string; label: string; color: string; avg: number | null }[] {
  return sections.map(sec => {
    const vals = sec.attributes.map(a => ratings?.[a.key]).filter((v): v is number => typeof v === 'number' && v > 0);
    return { key: sec.key, label: sec.label, color: sec.color, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null };
  });
}

/**
 * Radar "pentagon" pillars — a compact, consistent set of axes that work for quick OR full
 * reports (and legacy data). Every known attribute key maps to one pillar.
 */
export const RADAR_PILLARS: { key: string; label: string }[] = [
  { key: 'attacking', label: 'Attacking' }, { key: 'defending', label: 'Defending' },
  { key: 'physical', label: 'Physical' }, { key: 'tactical', label: 'Tactical' }, { key: 'mental', label: 'Mental' },
];
const PILLAR_OF: Record<string, string> = {};
const put = (pillar: string, keys: string[]) => keys.forEach(k => { PILLAR_OF[k] = pillar; });
put('attacking', ['reading_att', 'positioning_att', 'ball_control', 'first_touch', 'execution_speed', 'short_passing', 'medium_passing', 'long_passing', 'first_touch_ground', 'first_touch_air', 'protecting_shielding', 'heading_att', 'shooting_finishing', 'dribbling_running', 'dribbling', 'shot']);
put('defending', ['reading_def', 'positioning_def', 'marking', 'anticipation', 'ball_take', 'heading_def', 'ind_def_positioning', 'ind_def_timing', 'ground_def_pressure', 'ground_def_cover']);
put('tactical', ['hold_penetrate', 'understands_tactical_plan_att', 'principles_of_attack', 'transition_def_att', 'roles_responsibility_att', 'purposeful_movements', 'decision_making_att', 'scanning_att', 'understands_tactical_plan_def', 'principles_of_defending', 'transition_att_def', 'roles_responsibility_def', 'game_awareness', 'decision_making_def', 'scanning_def']);
put('physical', ['stamina', 'strength', 'physical_contact', 'speed', 'speed_change', 'agility', 'speed_with_ball', 'speed_without_ball', 'endurance', 'change_of_pace', 'strength_power', 'jumping', 'rigour']);
put('mental', ['personality', 'aggressiveness', 'attitude', 'emotional_control', 'leadership', 'training_mentality', 'game_mentality', 'concentration_focus', 'coachability', 'handles_failure', 'communication', 'ambition']);

/** Per-pillar averages for the radar, from a FLAT ratings map. Pillars with no data are dropped. */
export function computePillars(ratings: ScoutRatings | null | undefined): { pillar: string; label: string; value: number }[] {
  const sums: Record<string, { s: number; n: number }> = {};
  Object.entries(ratings || {}).forEach(([k, v]) => {
    if (typeof v !== 'number' || v <= 0) return;
    const p = PILLAR_OF[k]; if (!p) return;
    (sums[p] ||= { s: 0, n: 0 }); sums[p].s += v; sums[p].n++;
  });
  return RADAR_PILLARS.filter(p => sums[p.key]?.n).map(p => ({ pillar: p.key, label: p.label, value: Math.round((sums[p.key].s / sums[p.key].n) * 100) / 100 }));
}
