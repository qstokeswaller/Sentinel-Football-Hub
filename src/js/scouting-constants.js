/* ── Scouting verdict options (Final Evaluation) ── */
export const SCOUTING_VERDICTS = {
    sign:    { label: 'Sign',    color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)', icon: 'fa-check-circle' },
    trial:   { label: 'Trial',   color: '#00C49A', bg: 'rgba(0,196,154,0.12)',   border: 'rgba(0,196,154,0.25)',  icon: 'fa-clipboard-check' },
    monitor: { label: 'Monitor', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)', icon: 'fa-eye' },
    shadow:  { label: 'Shadow-player', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', icon: 'fa-user-secret' },
    loan:    { label: 'Loan',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)', icon: 'fa-exchange-alt' },
    reject:  { label: 'Reject',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',  icon: 'fa-times-circle' },
};

/* ── Legacy status (kept for DB column / backward compat) ── */
export const SCOUTING_STATUSES = {
    watching:    { label: 'Watching',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)' },
    shortlisted: { label: 'Shortlisted',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    recommended: { label: 'Recommended',  color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
    signed:      { label: 'Signed',       color: '#00C49A', bg: 'rgba(0,196,154,0.15)',  border: 'rgba(0,196,154,0.3)' },
    rejected:    { label: 'Rejected',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)' },
};

/* ── Quick report: 4 categories ── */
export const QUICK_REPORT_SECTIONS = [
    {
        key: 'attacking', label: 'Attacking', icon: 'fa-futbol', color: '#00C49A',
        attributes: [
            { key: 'reading_att', label: 'Reading' },
            { key: 'positioning_att', label: 'Positioning' },
            { key: 'ball_control', label: 'Ball Control' },
            { key: 'first_touch', label: 'First Touch' },
            { key: 'execution_speed', label: 'Execution Speed' },
            { key: 'short_passing', label: 'Short Passing' },
            { key: 'dribbling', label: 'Dribbling' },
        ]
    },
    {
        key: 'defensive', label: 'Defensive', icon: 'fa-shield-alt', color: '#10b981',
        attributes: [
            { key: 'reading_def', label: 'Reading' },
            { key: 'positioning_def', label: 'Positioning' },
            { key: 'marking', label: 'Marking' },
            { key: 'anticipation', label: 'Anticipation' },
            { key: 'ball_take', label: 'Ball Take' },
            { key: 'heading_def', label: 'Heading' },
        ]
    },
    {
        key: 'physical', label: 'Physical', icon: 'fa-running', color: '#f59e0b',
        attributes: [
            { key: 'stamina', label: 'Stamina' },
            { key: 'strength', label: 'Strength' },
            { key: 'physical_contact', label: 'Physical Contact' },
            { key: 'speed', label: 'Speed' },
            { key: 'speed_change', label: 'Speed Change' },
            { key: 'agility', label: 'Agility' },
        ]
    },
    {
        key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#8b5cf6',
        attributes: [
            { key: 'personality', label: 'Personality' },
            { key: 'aggressiveness', label: 'Aggressiveness' },
            { key: 'attitude', label: 'Attitude' },
            { key: 'emotional_control', label: 'Emotional Control' },
            { key: 'leadership', label: 'Leadership' },
        ]
    },
];

export const POSITION_OPTIONS = [
    'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB',
    'CDM', 'CM', 'CAM', 'LM', 'RM',
    'LW', 'RW', 'CF', 'ST',
];

export const FOOT_OPTIONS = ['Right', 'Left', 'Both'];

/* Map verdict key → display-friendly label for filter dropdown */
export const VERDICT_OPTIONS = Object.entries(SCOUTING_VERDICTS).map(([k, v]) => ({ value: k, label: v.label }));
