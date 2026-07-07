/** Scouting verdicts (final evaluation) — ported from src/js/scouting-constants.js. */
export const SCOUTING_VERDICTS: Record<string, { label: string; color: string; bg: string }> = {
  sign:    { label: 'Sign',          color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  trial:   { label: 'Trial',         color: '#00C49A', bg: 'rgba(0,196,154,0.12)' },
  monitor: { label: 'Monitor',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  shadow:  { label: 'Shadow-player', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  loan:    { label: 'Loan',          color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  reject:  { label: 'Reject',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

export const SCOUTING_STATUSES: Record<string, { label: string; color: string }> = {
  watching:    { label: 'Watching', color: '#60a5fa' },
  shortlisted: { label: 'Shortlisted', color: '#f59e0b' },
  recommended: { label: 'Recommended', color: '#10b981' },
  signed:      { label: 'Signed', color: '#00C49A' },
  rejected:    { label: 'Rejected', color: '#ef4444' },
};
