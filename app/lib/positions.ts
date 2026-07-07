/** Football positions grouped for the player-profile position selects (mirrors squad-players-ui.js POSITION_GROUPS). */
export const POSITION_GROUPS: { label: string; positions: { value: string; label: string }[] }[] = [
  { label: 'Forward', positions: [
    { value: 'ST', label: 'Striker (ST)' }, { value: 'LW', label: 'Left Winger (LW)' },
    { value: 'RW', label: 'Right Winger (RW)' }, { value: 'CF', label: 'Centre Forward (CF)' },
    { value: 'Winger', label: 'Winger' },
  ] },
  { label: 'Midfielder', positions: [
    { value: 'CAM', label: 'Attacking Midfielder (CAM)' }, { value: 'CM', label: 'Central Midfielder (CM)' },
    { value: 'CDM', label: 'Defensive Midfielder (CDM)' }, { value: 'LM', label: 'Left Midfielder (LM)' },
    { value: 'RM', label: 'Right Midfielder (RM)' },
  ] },
  { label: 'Defender', positions: [
    { value: 'CB', label: 'Centre Back (CB)' }, { value: 'LB', label: 'Left Back (LB)' },
    { value: 'RB', label: 'Right Back (RB)' }, { value: 'LWB', label: 'Left Wing Back (LWB)' },
    { value: 'RWB', label: 'Right Wing Back (RWB)' },
  ] },
  { label: 'Goalkeeper', positions: [{ value: 'GK', label: 'Goalkeeper (GK)' }] },
];

export const FOOT_OPTIONS = ['Right', 'Left', 'Both'];

/** Years for the year-of-birth / year-joined selects. */
export function birthYears(): number[] {
  const max = new Date().getFullYear() - 4;
  const out: number[] = [];
  for (let y = max; y >= 1970; y--) out.push(y);
  return out;
}
export function joinYears(): number[] {
  const max = new Date().getFullYear();
  const out: number[] = [];
  for (let y = max; y >= 1990; y--) out.push(y);
  return out;
}
