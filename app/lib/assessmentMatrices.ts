/** Official Athletic Performance Report matrices — the 4 quadrants (1–5) shared by the
 *  player-profile Assessment sub-tab and the in-match per-player assessment modal, so both
 *  write the same nested `assessments.ratings` shape that the profile History + radar read. */
export interface AssessMatrix { key: string; label: string; icon: string; color: string; attrs: { key: string; label: string }[] }

export const ASSESS_MATRICES: AssessMatrix[] = [
  { key: 'tactical', label: 'Tactical', icon: 'fa-chess-knight', color: '#6366f1', attrs: [
    { key: 'positioning', label: 'Positioning' }, { key: 'decision_making', label: 'Decision Making' }, { key: 'game_awareness', label: 'Game Awareness' }, { key: 'creativity', label: 'Creativity' }] },
  { key: 'technical', label: 'Technical', icon: 'fa-bolt', color: '#2563eb', attrs: [
    { key: 'passing_accuracy', label: 'Passing Accuracy' }, { key: 'first_touch', label: 'First Touch' }, { key: 'ball_control', label: 'Ball Control' }, { key: 'dribbling', label: 'Dribbling' }] },
  { key: 'physical', label: 'Physical', icon: 'fa-dumbbell', color: '#f59e0b', attrs: [
    { key: 'speed', label: 'Speed / Acceleration' }, { key: 'agility', label: 'Agility / Balance' }, { key: 'stamina', label: 'Stamina / Endurance' }, { key: 'strength', label: 'Strength / Power' }] },
  { key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#8b5cf6', attrs: [
    { key: 'work_ethic', label: 'Work Ethic' }, { key: 'communication', label: 'Communication' }, { key: 'focus', label: 'Focus / Concentration' }, { key: 'resilience', label: 'Resilience' }] },
];
