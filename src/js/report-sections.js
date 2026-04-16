export const REPORT_SCALE_LABELS = ['Poor', 'Below Avg', 'Average', 'Above Avg', 'Excellent'];

export const REPORT_SECTIONS = [
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
        ]
    },
    {
        key: 'technicalDefending', label: 'Technical - Defending', icon: 'fa-shield-alt', color: '#00C49A',
        attributes: [
            { key: 'ind_def_positioning', label: 'Individual Def: Positioning' },
            { key: 'ind_def_timing', label: 'Individual Def: Timing' },
            { key: 'ground_def_pressure', label: 'Ground Def: Pressure' },
            { key: 'ground_def_cover', label: 'Ground Def: Cover' },
            { key: 'heading_def', label: 'Heading' },
        ]
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
        ]
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
        ]
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
        ]
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
        ]
    },
];
