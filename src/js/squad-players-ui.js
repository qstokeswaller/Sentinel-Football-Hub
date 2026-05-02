/**
 * Squad & Players — Merged UI
 * Combines squad-ui.js + player-ui.js into one tabbed page
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { createYearPicker } from './year-picker.js';
import { hasFeature, showUpgradeToast } from '../tier.js';

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const POSITION_GROUP_ORDER = { GK: 0, CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, CDM: 2, CM: 2, CAM: 2, LM: 2, RM: 2, ST: 3, LW: 3, RW: 3, CF: 3, Winger: 3 };
const POSITION_GROUP_LABELS = ['Goalkeeper', 'Defenders', 'Midfielders', 'Forwards'];

const POSITION_GROUPS = [
    { label: 'Forward', positions: [
        { value: 'ST', label: 'Striker (ST)' }, { value: 'LW', label: 'Left Winger (LW)' },
        { value: 'RW', label: 'Right Winger (RW)' }, { value: 'CF', label: 'Centre Forward (CF)' },
        { value: 'Winger', label: 'Winger' },
    ]},
    { label: 'Midfielder', positions: [
        { value: 'CAM', label: 'Attacking Midfielder (CAM)' }, { value: 'CM', label: 'Central Midfielder (CM)' },
        { value: 'CDM', label: 'Defensive Midfielder (CDM)' }, { value: 'LM', label: 'Left Midfielder (LM)' },
        { value: 'RM', label: 'Right Midfielder (RM)' },
    ]},
    { label: 'Defender', positions: [
        { value: 'CB', label: 'Centre Back (CB)' }, { value: 'LB', label: 'Left Back (LB)' },
        { value: 'RB', label: 'Right Back (RB)' }, { value: 'LWB', label: 'Left Wing Back (LWB)' },
        { value: 'RWB', label: 'Right Wing Back (RWB)' },
    ]},
    { label: 'Goalkeeper', positions: [
        { value: 'GK', label: 'Goalkeeper (GK)' },
    ]},
];

const ALL_POSITIONS = POSITION_GROUPS.flatMap(g => g.positions);

const PLAYER_STATUSES = {
    active:      { label: 'Active',      symbol: '✓', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', available: true  },
    injured:     { label: 'Injured',     symbol: '✗', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', available: false },
    sick:        { label: 'Sick',        symbol: '✗', bg: '#fef3c7', color: '#b45309', border: '#fde68a', available: false },
    suspended:   { label: 'Suspended',   symbol: '✗', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', available: false },
    unavailable: { label: 'Unavailable', symbol: '✗', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', available: false },
    trialist:    { label: 'Trialist',    symbol: '~', bg: '#f3e8ff', color: '#7c3aed', border: '#ddd6fe', available: true  },
};

function statusSelectHTML(p) {
    const s = p.playerStatus || 'active';
    return `<select class="player-status-select status-${s}" data-player-id="${p.id}"
        onchange="window.setPlayerStatus('${p.id}', this.value)"
        onclick="event.stopPropagation()">${
        Object.entries(PLAYER_STATUSES).map(([val, cfg]) =>
            `<option value="${val}"${s === val ? ' selected' : ''}>${cfg.symbol} ${cfg.label}</option>`
        ).join('')}</select>`;
}
const POSITION_GROUP_MAP = {
    forward: POSITION_GROUPS[0].positions,
    midfielder: POSITION_GROUPS[1].positions,
    defender: POSITION_GROUPS[2].positions,
    goalkeeper: POSITION_GROUPS[3].positions,
};
const POSITION_TO_GROUP = {};
Object.entries(POSITION_GROUP_MAP).forEach(([group, positions]) => {
    positions.forEach(p => { POSITION_TO_GROUP[p.value] = group; });
});

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let activeTab = 'squads';
let currentSquadId = null;
let squadDetailViewMode = window.innerWidth <= 768 ? 'grid' : 'list';
let playerViewMode = window.innerWidth <= 768 ? 'grid' : 'list';

// Enrichment caches
let sessionsByTeam = {};
let nextSessionByTeam = {};
let upcomingFixtures = {};
let lastResults = {};
let playerLeaderboard = {}; // squadId → [ { name, goals, assists, apps, per90 } ]
let _coachSquadIds = new Set(); // squad IDs assigned to current coach (empty for admins)

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

/** Returns players visible to the current user (coaches/viewers see only their squads' players).
 *  Private coaching clubs always see all players — coaches work across all squads. */
function getVisiblePlayers() {
    const profile = window._profile;
    const isPrivateCoaching = _isPrivateCoaching();
    const isScoped = !isPrivateCoaching && (profile?.role === 'coach' || profile?.role === 'viewer') && _coachSquadIds.size > 0;
    if (isScoped) {
        return squadManager.players.filter(p => _coachSquadIds.has(p.squadId));
    }
    return [...squadManager.players];
}

function displayAge(ageValue) {
    if (!ageValue) return '--';
    const year = parseInt(ageValue);
    if (year > 1900 && year <= new Date().getFullYear()) {
        return String(new Date().getFullYear() - year);
    }
    return ageValue;
}

function getPositionGroupIndex(position) {
    if (!position) return 99;
    const primary = position.split(',')[0].trim();
    return POSITION_GROUP_ORDER[primary] ?? 99;
}

function sortPlayersByPosition(players) {
    return [...players].sort((a, b) => {
        const ga = getPositionGroupIndex(a.position);
        const gb = getPositionGroupIndex(b.position);
        if (ga !== gb) return ga - gb;
        return a.name.localeCompare(b.name);
    });
}

function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    // Reset DOB input in add-player modal
    const dobEl = document.getElementById('playerDobInput');
    if (dobEl) { dobEl.value = ''; updateDobAge(); }
    const assignAgeEl = document.getElementById('newPlayerAgeAssign');
    if (assignAgeEl?._yearPicker) assignAgeEl._yearPicker.setValue('');
}

function updateDobAge() {
    const dobEl = document.getElementById('playerDobInput');
    const badge = document.getElementById('playerAgeBadge');
    if (!badge) return;
    if (!dobEl?.value) { badge.textContent = ''; return; }
    const dob = new Date(dobEl.value);
    const age = Math.floor((Date.now() - dob.getTime()) / 31557600000);
    badge.textContent = `(${age} yrs)`;
}

function ensurePlayerCardStyles() {
    if (document.getElementById('player-card-styles')) return;
    const s = document.createElement('style');
    s.id = 'player-card-styles';
    s.textContent = `
        .player-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:16px; padding:20px 24px; }
        .player-card { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:22px 18px 18px; cursor:pointer; transition:transform .18s,box-shadow .18s; display:flex; flex-direction:column; align-items:center; text-align:center; text-decoration:none; color:inherit; box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .player-card:hover { transform:translateY(-4px); box-shadow:0 10px 28px rgba(37,99,235,.13); border-color:#80e8d3; }
        .player-card-avatar { width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg,#ccf5ec,#e6f9f4); color:#00C49A; display:flex; align-items:center; justify-content:center; font-size:1.35rem; font-weight:800; margin-bottom:12px; border:3px solid #fff; box-shadow:0 0 0 2px #80e8d3; letter-spacing:-1px; }
        .player-card-name { font-size:.95rem; font-weight:700; color:#1e3a5f; margin-bottom:4px; }
        .player-card-pos { display:inline-block; color:#64748b; font-size:.78rem; font-weight:600; margin-bottom:12px; letter-spacing:.02em; }
        .player-card-stats { width:100%; display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; }
        .player-card-stat { font-size:.75rem; color:#64748b; display:flex; flex-direction:column; align-items:center; }
        .player-card-stat strong { font-size:.82rem; font-weight:700; color:#334155; }
        .player-card-squad-tag { margin-top:12px; font-size:.72rem; background:#f1f5f9; color:#475569; border-radius:20px; padding:3px 10px; font-weight:600; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .player-card-divider { width:100%; border:0; border-top:1px solid #f1f5f9; margin:12px 0 10px; }
        .player-card-actions { display:flex; gap:8px; width:100%; justify-content:center; }
        .player-card-action-btn { flex:1; padding:7px 0; border-radius:9px; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:.75rem; font-weight:600; cursor:pointer; transition:all .15s; display:flex; align-items:center; justify-content:center; gap:5px; }
        .player-card-action-btn:hover { background:#e0f2fe; color:#0284c7; border-color:#bae6fd; }
        .player-card-action-btn.danger:hover { background:#fee2e2; color:#ef4444; border-color:#fca5a5; }
        .player-card-link { display:flex; flex-direction:column; align-items:center; text-decoration:none; color:inherit; width:100%; }
        .view-toggle-group { display:flex; gap:0; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
        .view-toggle-btn { background:#fff; border:none; padding:7px 12px; cursor:pointer; color:#94a3b8; font-size:.88rem; transition:all .15s; }
        .view-toggle-btn:hover { background:#f8fafc; color:#00C49A; }
        .view-toggle-btn.active { background:#00C49A; color:#fff; }
        @media(max-width:768px){ .player-cards-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:16px;} .player-card-actions{display:none;} .player-card-action-btn .btn-label{display:none;} }
        /* Squad detail table */
        .squad-table { border-collapse:collapse; }
        .squad-table thead tr { background:#f8fafc; }
        .squad-table th { padding:9px 16px; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#64748b; border-bottom:1px solid #e2e8f0; }
        .squad-table tbody tr { cursor:pointer; transition:background .12s; }
        .squad-table tbody tr:hover td { background:rgba(0,196,154,.06); }
        .squad-table td { border-bottom:1px solid #f1f5f9; }
        .squad-table tbody tr:last-child td { border-bottom:none; }
        .squad-table tbody tr.squad-group-header-row { cursor:default; }
        .squad-table tbody tr.squad-group-header-row:hover td { background:#f8fafc; }
        .squad-table td, .squad-table th { vertical-align:middle; }
        /* Squad detail layout — named grid areas */
        .sd-back-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:20px; flex-wrap:wrap; }
        .sd-layout {
            display:grid;
            grid-template-columns:minmax(0,1fr) minmax(0,2fr);
            grid-template-rows:auto 1fr;
            grid-template-areas:"details players" "analytics players";
            gap:20px;
            align-items:start;
        }
        .sd-details-wrap { grid-area:details; }
        .sd-players-wrap { grid-area:players; min-width:0; }
        .sd-analytics-wrap { grid-area:analytics; display:flex; flex-direction:column; gap:16px; }
        .sd-info-card { background:#fff; border:1px solid #e2e8f0; border-radius:18px; overflow:hidden; }
        .sd-info-card-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #f1f5f9; gap:8px; }
        .sd-info-card-title { font-size:.9rem; font-weight:700; color:#1e3a5f; display:flex; align-items:center; }
        .sd-card-body { padding:14px 18px; }
        .sd-detail-row { display:flex; justify-content:space-between; align-items:flex-start; padding:8px 0; border-bottom:1px solid #f8fafc; }
        .sd-detail-row:last-child { border-bottom:none; }
        .sd-detail-label { font-size:.73rem; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:.03em; padding-top:2px; }
        .sd-detail-value { font-size:.84rem; color:#1e293b; font-weight:600; text-align:right; }
        .sd-chip { display:inline-block; background:#f1f5f9; color:#475569; border-radius:20px; padding:3px 10px; font-size:.73rem; font-weight:600; margin:2px; }
        .sd-chip.coach { background:#e0f2fe; color:#0284c7; }
        .sd-action-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:10px; border:none; cursor:pointer; font-size:.8rem; font-weight:600; transition:all .15s; }
        .sd-action-btn.outline { background:#fff; border:1px solid #e2e8f0; color:#475569; }
        .sd-action-btn.outline:hover { background:#f8fafc; border-color:#cbd5e1; color:#1e293b; }
        .sd-action-btn.primary { background:var(--green-accent,#00C49A); color:#fff; border:none; }
        .sd-action-btn.primary:hover { filter:brightness(1.08); }
        .sd-action-btn.danger { background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; }
        .sd-action-btn.danger:hover { background:#fecaca; }
        .sd-action-btn.link { background:none; border:none; color:var(--blue-accent,#2563eb); padding:4px 0; font-size:.78rem; white-space:nowrap; }
        .sd-action-btn.link:hover { text-decoration:underline; }
        .sd-card-actions { display:flex; flex-wrap:wrap; gap:8px; padding:12px 18px; border-top:1px solid #f1f5f9; }
        .sd-form-dots { display:flex; gap:6px; }
        .sd-form-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:800; color:#fff; }
        .sd-form-dot.W { background:#22c55e; } .sd-form-dot.D { background:#f59e0b; } .sd-form-dot.L { background:#ef4444; } .sd-form-dot.empty { background:#e2e8f0; }
        .sd-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:10px 0; }
        .sd-stat-box { background:#f8fafc; border-radius:10px; padding:10px 6px; text-align:center; }
        .sd-stat-box .stat-num { font-size:1.25rem; font-weight:800; }
        .sd-stat-box .stat-lbl { font-size:.68rem; color:#64748b; font-weight:600; margin-top:2px; }
        .sd-performers-row { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #f8fafc; }
        .sd-performers-row:last-child { border-bottom:none; }
        .sd-performers-medal { font-size:1rem; width:22px; text-align:center; flex-shrink:0; }
        .sd-performers-name { flex:1; font-size:.83rem; font-weight:600; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sd-performers-stats { display:flex; gap:5px; flex-shrink:0; }
        .sd-performers-stat { font-size:.73rem; font-weight:700; padding:2px 7px; border-radius:6px; }
        .sd-performers-stat.goals { background:#dcfce7; color:#16a34a; }
        .sd-performers-stat.assists { background:#ede9fe; color:#7c3aed; }
        .sd-players-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; gap:10px; }
        /* Tablet: stack to single column, analytics side by side */
        @media(max-width:960px) {
            .sd-layout {
                grid-template-columns:1fr;
                grid-template-areas:"details" "players" "analytics";
                grid-template-rows:auto;
            }
            .sd-analytics-wrap { flex-direction:row; gap:12px; }
            .sd-analytics-wrap > * { flex:1; min-width:0; }
        }
        /* Mobile: compact details, analytics stack */
        @media(max-width:640px) {
            .sd-analytics-wrap { flex-direction:column; }
            .sd-details-wrap .sd-card-body { padding:10px 16px; }
            .sd-details-wrap .sd-card-actions { padding:8px 16px; gap:6px; }
            .sd-details-wrap .sd-detail-row { padding:5px 0; }
            .sd-details-wrap .sd-info-card-header { padding:10px 16px; }
        }
        /* Player status select pill */
        .player-status-select {
            border-radius:6px; padding:4px 10px; font-size:.73rem; font-weight:600;
            cursor:pointer; outline:none; border:1px solid; line-height:1.4;
            appearance:none; -webkit-appearance:none;
            display:inline-block; vertical-align:middle; text-align:center;
            min-width:90px; transition:opacity .15s;
        }
        .player-status-select:hover { opacity:.82; }
        .player-status-select.status-active      { background:#f0fdf4; color:#16a34a; border-color:#bbf7d0; }
        .player-status-select.status-injured     { background:#fff1f2; color:#dc2626; border-color:#fecaca; }
        .player-status-select.status-sick        { background:#fffbeb; color:#b45309; border-color:#fde68a; }
        .player-status-select.status-suspended   { background:#fff1f2; color:#dc2626; border-color:#fecaca; }
        .player-status-select.status-unavailable { background:#f8fafc; color:#64748b; border-color:#e2e8f0; }
        .player-status-select.status-trialist    { background:#faf5ff; color:#7c3aed; border-color:#ddd6fe; }
        td .player-status-select { display:block; margin:0 auto; width:fit-content; }
    `;
    document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════
//  ARCHETYPE HELPERS
// ═══════════════════════════════════════════════════════════
function _isPrivateCoaching() {
    return window._profile?.clubs?.settings?.archetype === 'private_coaching';
}

/** Toggle Tuks-specific vs Orion/private-coaching fields in add-player modal */
function applyClubFieldCustomization() {
    const isPC = _isPrivateCoaching();
    const tuksGroup = document.getElementById('tuksFieldsGroup');
    const orionGroup = document.getElementById('orionFieldsGroup');
    if (tuksGroup) tuksGroup.style.display = isPC ? 'none' : '';
    if (orionGroup) orionGroup.style.display = isPC ? '' : 'none';
}

function renderLeaderboardColumn(squadId) {
    const leaders = playerLeaderboard[squadId] || [];
    if (leaders.length === 0) {
        return `<div class="squad-card-enrichment">
            <div style="font-size:0.8rem;font-weight:600;color:#64748b;margin-bottom:8px;"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:4px;"></i>Leaderboard</div>
            <div style="color:#94a3b8;font-size:0.78rem;">No match data yet</div>
        </div>`;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const rows = leaders.map((p, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;${i < leaders.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
            <span style="font-size:0.85rem;">${medals[i] || ''}</span>
            <span style="flex:1;font-size:0.78rem;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</span>
            <span style="font-size:0.72rem;color:#059669;font-weight:700;">${p.goals}G</span>
            <span style="font-size:0.72rem;color:#6366f1;font-weight:600;">${p.assists}A</span>
            <span style="font-size:0.68rem;color:#94a3b8;">${p.per90}/90</span>
        </div>
    `).join('');

    return `<div class="squad-card-enrichment">
        <div style="font-size:0.8rem;font-weight:600;color:#64748b;margin-bottom:6px;"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:4px;"></i>Top Players</div>
        ${rows}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  ENRICHMENT DATA
// ═══════════════════════════════════════════════════════════
async function fetchEnrichmentData() {
    try {
        // Fetch recent sessions per team (last 6 months, scoped to current club)
        const _clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;
        const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
        let _sessQ = supabase.from('sessions').select('team, date, created_at')
            .gte('created_at', sixMonthsAgo)
            .order('date', { ascending: false })
            .limit(500);
        if (_clubId) _sessQ = _sessQ.eq('club_id', _clubId);
        const { data: sessions } = await _sessQ;

        const teamMap = {};
        const nextMap = {};
        const today = new Date().toISOString().split('T')[0];
        (sessions || []).forEach(s => {
            const teamName = s.team;
            const d = s.date || s.created_at;
            if (!teamName) return;
            // Last session (past or today)
            if (d <= today && !teamMap[teamName]) {
                teamMap[teamName] = d;
            }
            // Next session (future) — sessions are ordered desc, so keep overwriting to get earliest future
            if (d > today) {
                nextMap[teamName] = d;
            }
        });
        sessionsByTeam = teamMap;
        nextSessionByTeam = nextMap;

        // Build match caches from matchManager (already loaded)
        const allMatches = matchManager.getMatches();
        const squads = squadManager.getSquads();

        squads.forEach(squad => {
            const squadMatches = allMatches.filter(m => m.squadId === squad.id);

            const upcoming = squadMatches
                .filter(m => !m.isPast)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            if (upcoming.length > 0) upcomingFixtures[squad.id] = upcoming[0];

            const past = squadMatches
                .filter(m => m.isPast)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            if (past.length > 0) lastResults[squad.id] = past[0];
        });
        // Leaderboard — top performers per squad (all club types)
        const { data: stats } = await supabase
            .from('match_player_stats')
            .select('player_id, goals, assists, minutes_played, appeared')
            .limit(2000);

        if (stats && stats.length > 0) {
            const playerAgg = {};
            stats.forEach(s => {
                if (!playerAgg[s.player_id]) playerAgg[s.player_id] = { goals: 0, assists: 0, minutes: 0, apps: 0 };
                const p = playerAgg[s.player_id];
                p.goals += s.goals || 0;
                p.assists += s.assists || 0;
                p.minutes += s.minutes_played || 0;
                if (s.appeared) p.apps++;
            });

            const allPlayers = squadManager.getPlayers({});
            squads.forEach(squad => {
                const squadPlayers = allPlayers.filter(p => p.squadId === squad.id);
                const leaders = squadPlayers
                    .map(p => {
                        const a = playerAgg[p.id] || { goals: 0, assists: 0, minutes: 0, apps: 0 };
                        const per90 = a.minutes > 0 ? ((a.goals / a.minutes) * 90).toFixed(1) : '0.0';
                        return { name: p.name, goals: a.goals, assists: a.assists, apps: a.apps, per90 };
                    })
                    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
                    .slice(0, 3);
                playerLeaderboard[squad.id] = leaders;
            });
        }
    } catch (err) {
        console.error('Enrichment data fetch error:', err);
    }
}

// ═══════════════════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
    activeTab = tab;

    document.querySelectorAll('.squad-page-tabs .cal-mode-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab)
    );

    const squadControls = document.getElementById('squadControls');
    const playerControls = document.getElementById('playerControls');
    if (squadControls) squadControls.style.display = tab === 'squads' ? '' : 'none';
    if (playerControls) playerControls.style.display = tab === 'players' ? '' : 'none';

    document.getElementById('squadGrid').style.display = tab === 'squads' ? 'grid' : 'none';
    document.getElementById('squadDetailView').style.display = 'none';
    const playerTabContent = document.getElementById('playerTabContent');
    if (playerTabContent) playerTabContent.style.display = tab === 'players' ? 'block' : 'none';

    const pageHeader = document.querySelector('.page-header');
    if (pageHeader) pageHeader.style.display = '';
    const tabsEl = document.querySelector('.squad-page-tabs');
    if (tabsEl) tabsEl.style.display = '';

    if (tab === 'squads') {
        renderSquads();
    } else {
        renderPlayers();
    }
}

// ═══════════════════════════════════════════════════════════
//  SQUAD CARDS (ENRICHED)
// ═══════════════════════════════════════════════════════════
function getPositionBreakdown(squadId) {
    const players = squadManager.getPlayers({ squadId });
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    players.forEach(p => {
        if (!p.position) return;
        const positions = p.position.split(',').map(s => s.trim());
        positions.forEach(pos => {
            const idx = POSITION_GROUP_ORDER[pos];
            if (idx === 0) counts.GK++;
            else if (idx === 1) counts.DEF++;
            else if (idx === 2) counts.MID++;
            else if (idx === 3) counts.FWD++;
        });
    });
    return ['GK','DEF','MID','FWD'].map(k =>
        `<span class="pos-count-badge">${counts[k]} ${k}</span>`
    ).join('');
}

function renderSquadCard(s) {
    const players = squadManager.getPlayers({ squadId: s.id });
    const playerCount = players.length;
    const posBreakdown = getPositionBreakdown(s.id);

    // Coach names
    const coachDisplay = (s.coaches || []).slice(0, 2).map(c =>
        c.includes(':') ? c.split(':').pop().trim() : c
    ).join(', ') || 'No coach assigned';

    // League
    const leagueDisplay = (s.leagues || []).join(', ') || '--';

    // Last session
    const lastSession = sessionsByTeam[s.name];
    const lastSessionDisplay = lastSession
        ? new Date(lastSession).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '--';

    // Next session
    const nextSession = nextSessionByTeam[s.name];
    const nextSessionDisplay = nextSession
        ? new Date(nextSession).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '--';

    // Upcoming fixture (match)
    const nextMatch = upcomingFixtures[s.id];
    const nextMatchDisplay = nextMatch
        ? `vs ${nextMatch.opponent} · ${new Date(nextMatch.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : 'None scheduled';

    // Last result
    const prevMatch = lastResults[s.id];
    let lastResultDisplay = '--';
    let resultClass = '';
    if (prevMatch) {
        const score = `${prevMatch.homeScore ?? '?'}-${prevMatch.awayScore ?? '?'}`;
        const rMap = { W: 'result-win', D: 'result-draw', L: 'result-loss' };
        resultClass = rMap[prevMatch.result] || '';
        lastResultDisplay = `${prevMatch.result || '?'} ${score} vs ${prevMatch.opponent || '?'}`;
    }

    return `
    <div class="dash-card squad-card" onclick="viewSquadDetails('${s.id}')">
        <!-- LEFT: name, meta, players, positions, view roster -->
        <div class="squad-card-left">
            <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:6px;">
                <div style="width:38px; height:38px; background:var(--light-blue); color:var(--blue-accent); display:flex; align-items:center; justify-content:center; border-radius:10px; font-size:1rem; flex-shrink:0;">
                    <i class="fas fa-users"></i>
                </div>
                <div style="flex:1;">
                    <h3>${s.name}</h3>
                    <div class="squad-meta">
                        <i class="fas fa-user-tie" style="font-size:0.65rem; margin-right:2px;"></i>${coachDisplay}
                        <span style="margin:0 5px; opacity:0.4;">|</span>
                        <i class="fas fa-trophy" style="font-size:0.65rem; margin-right:2px;"></i>${leagueDisplay}
                    </div>
                </div>


            </div>
            <div class="squad-players-count">${playerCount} Players</div>
            <div class="squad-card-positions">${posBreakdown}</div>
            <div class="squad-footer">
                <span style="font-size:0.82rem; color:var(--blue-accent); font-weight:600;">View Roster <i class="fas fa-arrow-right" style="margin-left:4px;"></i></span>
            </div>
        </div>
        <!-- CENTRE-RIGHT: enrichment or leaderboard -->
        ${_isPrivateCoaching() ? renderLeaderboardColumn(s.id) : `
        <div class="squad-card-enrichment">
            <div class="enrich-item">
                <i class="fas fa-clipboard-list"></i>
                <span>Last Session: <strong>${lastSessionDisplay}</strong></span>
            </div>
            <div class="enrich-item">
                <i class="fas fa-calendar-check"></i>
                <span>Next Session: <strong>${nextSessionDisplay}</strong></span>
            </div>
            <div class="enrich-item">
                <i class="fas fa-calendar-alt"></i>
                <span>Next Match: <strong>${nextMatchDisplay}</strong></span>
            </div>
            <div class="enrich-item ${resultClass}">
                <i class="fas fa-futbol"></i>
                <span>Last Result: <strong>${lastResultDisplay}</strong></span>
            </div>
        </div>`}
    </div>`;
}

function renderSquads() {
    const searchTerm = (document.getElementById('squadSearch')?.value || '').toLowerCase();
    const filterLeague = document.getElementById('filterLeague')?.value || 'all';
    const filterAgeGroup = document.getElementById('filterAgeGroup')?.value || 'all';

    let squads = squadManager.getSquads().sort((a, b) => {
        // Coach's assigned squads appear first
        const aCoach = _coachSquadIds.has(a.id) ? 0 : 1;
        const bCoach = _coachSquadIds.has(b.id) ? 0 : 1;
        if (aCoach !== bCoach) return aCoach - bCoach;
        return a.name.localeCompare(b.name);
    });

    if (searchTerm) squads = squads.filter(s => s.name.toLowerCase().includes(searchTerm));
    if (filterLeague && filterLeague !== 'all') squads = squads.filter(s => s.leagues && s.leagues.includes(filterLeague));
    if (filterAgeGroup && filterAgeGroup !== 'all') squads = squads.filter(s => s.ageGroup === filterAgeGroup);

    const isCoachScoped = !_isPrivateCoaching() && (window._profile?.role === 'coach' || window._profile?.role === 'viewer') && _coachSquadIds.size > 0;
    const unassignedPlayers = isCoachScoped ? [] : squadManager.getPlayers({}).filter(p => !p.squadId);
    const showUnassigned = unassignedPlayers.length > 0 && (!searchTerm || 'unassigned'.includes(searchTerm)) && (filterLeague === 'all' || !filterLeague) && (filterAgeGroup === 'all' || !filterAgeGroup);

    const grid = document.getElementById('squadGrid');
    const count = document.getElementById('squadCount');
    if (count) count.textContent = `${squads.length + (showUnassigned ? 1 : 0)} squads`;

    if (squads.length === 0 && !showUnassigned) {
        grid.innerHTML = `
            <div class="section-card" style="grid-column:1/-1; text-align:center; padding:60px;">
                <i class="fas fa-users" style="font-size:4rem; color:var(--text-muted); margin-bottom:24px;"></i>
                <h3 style="color:var(--navy-dark); margin-bottom:8px;">No Squads Found</h3>
                <p style="color:var(--text-secondary);">Add a new squad to get started.</p>
            </div>`;
    } else {
        let html = squads.map(s => renderSquadCard(s)).join('');

        if (showUnassigned) {
            html += `
            <div class="dash-card squad-card" onclick="viewSquadDetails('unassigned')" style="cursor:pointer; transition:transform 0.2s; padding:20px; position:relative; border:1px dashed #cbd5e1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div class="icon-circle" style="width:44px; height:44px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; border-radius:12px; font-size:1.15rem;">
                         <i class="fas fa-user-clock"></i>
                    </div>
                </div>
                <h3 style="margin:0 0 4px 0; font-size:1.15rem; color:var(--navy-dark);">Unassigned</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px; font-weight:600;">
                    ${unassignedPlayers.length} Players
                </div>
                <div style="border-top:1px solid var(--border); padding-top:10px;">
                    <span style="font-size:0.85rem; color:#d97706; font-weight:600;">View Players <i class="fas fa-arrow-right" style="margin-left:4px;"></i></span>
                </div>
            </div>`;
        }
        grid.innerHTML = html;
    }
}

// ═══════════════════════════════════════════════════════════
//  SQUAD DETAIL VIEW
// ═══════════════════════════════════════════════════════════
window.backToSquads = function () { currentSquadId = null; switchTab('squads'); };

function ensureSquadConfirmModal() {
    if (document.getElementById('squadConfirmModal')) return;
    const el = document.createElement('div');
    el.id = 'squadConfirmModal';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <div class="modal-header" style="border-bottom:1px solid #f1f5f9;padding:20px 24px 16px;">
                <h3 id="squadConfirmTitle" style="font-size:1rem;font-weight:700;color:#1e3a5f;margin:0;"></h3>
            </div>
            <div class="modal-body" style="padding:20px 24px;">
                <p id="squadConfirmMessage" style="font-size:.88rem;color:#475569;margin:0;line-height:1.6;"></p>
            </div>
            <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:16px 24px;border-top:1px solid #f1f5f9;">
                <button id="squadConfirmCancel" class="dash-btn outline">Cancel</button>
                <button id="squadConfirmOk" class="dash-btn" style="background:#ef4444;color:#fff;border-color:#ef4444;">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(el);
}

function squadConfirm(title, message, confirmLabel = 'Confirm', isDanger = true) {
    ensureSquadConfirmModal();
    return new Promise(resolve => {
        document.getElementById('squadConfirmTitle').textContent = title;
        document.getElementById('squadConfirmMessage').textContent = message;
        const modal = document.getElementById('squadConfirmModal');
        modal.classList.add('active');
        const oldOk = document.getElementById('squadConfirmOk');
        const newOk = oldOk.cloneNode(true);
        newOk.textContent = confirmLabel;
        newOk.className = 'dash-btn';
        newOk.style.cssText = isDanger ? 'background:#ef4444;color:#fff;border-color:#ef4444;' : '';
        oldOk.parentNode.replaceChild(newOk, oldOk);
        const oldCancel = document.getElementById('squadConfirmCancel');
        const newCancel = oldCancel.cloneNode(true);
        oldCancel.parentNode.replaceChild(newCancel, oldCancel);
        let settled = false;
        const done = (result) => {
            if (settled) return;
            settled = true;
            modal.classList.remove('active');
            resolve(result);
        };
        document.getElementById('squadConfirmOk').addEventListener('click', () => done(true));
        document.getElementById('squadConfirmCancel').addEventListener('click', () => done(false));
        modal.addEventListener('click', (e) => { if (e.target === modal) done(false); }, { once: true });
    });
}

// ── Squad Edit Modal ──────────────────────────────────────
function ensureSquadEditModal() {
    if (document.getElementById('modalSquadEdit')) return;
    const el = document.createElement('div');
    el.id = 'modalSquadEdit';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-content" style="max-width:760px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.18);overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
            <div class="modal-header" style="padding:20px 28px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <h2 class="modal-title" style="margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;font-family:inherit;"><i class="fas fa-edit" style="color:#00C49A;margin-right:8px;"></i>Edit Squad</h2>
                <button class="btn-close-modal" onclick="document.getElementById('modalSquadEdit').classList.remove('active')"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" style="padding:24px 28px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">Squad Name</label>
                        <input type="text" id="editSquadName" class="form-control-bubble" placeholder="e.g. U13 Boys A">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">Age Group</label>
                        <input type="text" id="editSquadAgeGroup" class="form-control-bubble" placeholder="e.g. U13">
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">Leagues / Competitions</label>
                    <div id="editLeaguesTags" style="display:flex;flex-wrap:wrap;gap:6px;min-height:36px;margin-bottom:8px;padding:8px;background:#f8fafc;border:2px solid #eef2f6;border-radius:14px;"></div>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="editLeagueInput" class="form-control-bubble" placeholder="e.g. GDL League, Easter Cup — press Enter or Add" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();_addSquadLeagueTag();}">
                        <button type="button" onclick="_addSquadLeagueTag()" class="dash-btn outline" style="white-space:nowrap;padding:10px 16px;font-size:.82rem;flex-shrink:0;"><i class="fas fa-plus"></i> Add</button>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">League Table URL</label>
                    <input type="url" id="editSquadLeagueUrl" class="form-control-bubble" placeholder="https://...">
                    <div id="editSquadLeagueUrlLink" style="font-size:.78rem;margin-top:6px;"></div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">Staff / Coaches</label>
                    <p style="font-size:.78rem;color:#94a3b8;margin:0 0 10px;font-family:inherit;">Add staff who coach or manage this squad. Club members can be added via Settings → Team Members.</p>
                    <div id="editCoachesContainer" style="display:flex;flex-direction:column;gap:8px;"></div>
                    <button type="button" id="btnEditAddCoachRow" class="dash-btn outline" style="width:100%;margin-top:10px;font-size:.82rem;">
                        <i class="fas fa-plus"></i> Add Staff Member
                    </button>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">General Notes</label>
                    <textarea id="editSquadNotes" class="form-control-bubble" rows="5"
                        placeholder="Team identity, tactical approach, goals for the season, key focuses…"></textarea>
                </div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:16px 28px;border-top:1px solid #f1f5f9;flex-shrink:0;background:#f8fafc;">
                <button class="dash-btn outline" onclick="document.getElementById('modalSquadEdit').classList.remove('active')">Cancel</button>
                <button class="dash-btn primary" id="btnSaveSquadEdit"><i class="fas fa-save"></i> Save Changes</button>
            </div>
        </div>`;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('active'); });
    document.getElementById('btnEditAddCoachRow').addEventListener('click', () => addEditCoachRow());
    document.getElementById('btnSaveSquadEdit').addEventListener('click', saveSquadEdit);
}

// --- Squad Leagues Tag UI ---
let _editLeagues = [];

function _renderLeagueTags() {
    const container = document.getElementById('editLeaguesTags');
    if (!container) return;
    if (_editLeagues.length === 0) {
        container.innerHTML = '<span style="font-size:.78rem;color:#94a3b8;padding:4px 2px;">No competitions added yet</span>';
        return;
    }
    container.innerHTML = _editLeagues.map((l, i) => `
        <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#e0f2fe;color:#0369a1;border-radius:20px;font-size:.78rem;font-weight:600;">
            ${l}
            <button type="button" onclick="_removeSquadLeagueTag(${i})" style="background:none;border:none;cursor:pointer;color:#0369a1;font-size:.8rem;padding:0;line-height:1;" title="Remove">&times;</button>
        </span>`).join('');
}

window._addSquadLeagueTag = function() {
    const input = document.getElementById('editLeagueInput');
    const val = input?.value.trim();
    if (!val) return;
    // Support comma-separated paste
    val.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
        if (!_editLeagues.includes(v)) _editLeagues.push(v);
    });
    if (input) input.value = '';
    _renderLeagueTags();
};

window._removeSquadLeagueTag = function(index) {
    _editLeagues.splice(index, 1);
    _renderLeagueTags();
};

function addEditCoachRow(role = '', name = '') {
    const container = document.getElementById('editCoachesContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'coach-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:center;';
    div.innerHTML = `
        <input type="text" class="form-control-bubble edit-coach-role" placeholder="Role (e.g. Head Coach)" value="${role}" style="flex:1;margin-bottom:0;min-width:0;">
        <input type="text" class="form-control-bubble edit-coach-name" placeholder="Name" value="${name}" style="flex:2;margin-bottom:0;min-width:0;">
        <button type="button" onclick="this.closest('.coach-row').remove()" style="flex:0 0 38px;height:42px;border-radius:10px;border:1px solid #fca5a5;background:#fee2e2;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-trash-alt" style="font-size:.75rem;"></i>
        </button>`;
    container.appendChild(div);
}

window.openSquadEditModal = function(squadId) {
    ensureSquadEditModal();
    const squad = squadManager.getSquad(squadId);
    if (!squad) return;

    document.getElementById('editSquadName').value = squad.name || '';
    document.getElementById('editSquadAgeGroup').value = squad.ageGroup || '';
    _editLeagues = Array.isArray(squad.leagues) ? [...squad.leagues]
        : (squad.leagues ? String(squad.leagues).split(',').map(s => s.trim()).filter(Boolean) : []);
    _renderLeagueTags();
    document.getElementById('editLeagueInput').value = '';
    document.getElementById('editSquadLeagueUrl').value = squad.leagueTableUrl || '';
    document.getElementById('editSquadNotes').value = squad.notes || '';

    // League table link preview
    const linkEl = document.getElementById('editSquadLeagueUrlLink');
    if (squad.leagueTableUrl) {
        linkEl.innerHTML = `<a href="${squad.leagueTableUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;"><i class="fas fa-external-link-alt" style="margin-right:4px;font-size:.7rem;"></i>View current table</a>`;
    } else {
        linkEl.innerHTML = '';
    }

    // Coaches
    const container = document.getElementById('editCoachesContainer');
    container.innerHTML = '';
    (squad.coaches || []).forEach(c => {
        if (c.includes(':')) {
            const [r, ...rest] = c.split(':');
            addEditCoachRow(r.trim(), rest.join(':').trim());
        } else {
            addEditCoachRow('', c.trim());
        }
    });
    if ((squad.coaches || []).length === 0) addEditCoachRow();

    document.getElementById('modalSquadEdit')._editSquadId = squadId;
    document.getElementById('modalSquadEdit').classList.add('active');
};

async function saveSquadEdit() {
    const modal = document.getElementById('modalSquadEdit');
    const squadId = modal._editSquadId;
    if (!squadId) return;

    const btn = document.getElementById('btnSaveSquadEdit');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const name = document.getElementById('editSquadName').value.trim();
    const ageGroup = document.getElementById('editSquadAgeGroup').value.trim();
    const leagues = [..._editLeagues];
    const leagueTableUrl = document.getElementById('editSquadLeagueUrl').value.trim() || null;
    const notes = document.getElementById('editSquadNotes').value.trim();

    const coachRows = document.querySelectorAll('#editCoachesContainer .coach-row');
    const coaches = [];
    coachRows.forEach(row => {
        const r = row.querySelector('.edit-coach-role').value.trim();
        const n = row.querySelector('.edit-coach-name').value.trim();
        if (n) coaches.push(r ? `${r}: ${n}` : n);
    });

    try {
        await squadManager.updateSquad(squadId, { name, ageGroup, leagues, coaches, leagueTableUrl, notes });
        modal.classList.remove('active');
        showToast('Squad updated', 'success');
        // Refresh the detail view in place
        viewSquadDetails(squadId);
    } catch (err) {
        console.error('Save squad error:', err);
        showToast('Failed to save squad changes', 'error');
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

function buildDetailsCard(squad, squadId, isUnassigned) {
    if (isUnassigned) return '';
    const profile = window._profile;
    const isAdmin = profile?.role === 'admin' || profile?.role === 'platform_admin';
    const canEdit = isAdmin || profile?.role === 'coach';

    const staffChips = (squad.coaches || []).length > 0
        ? squad.coaches.map(c => `<span class="sd-chip coach"><i class="fas fa-user-tie" style="font-size:.65rem;margin-right:4px;"></i>${c}</span>`).join('')
        : '<span style="font-size:.82rem;color:#94a3b8;font-style:italic;">No staff assigned</span>';

    const leagueDisplay = (squad.leagues || []).join(', ') || '--';

    const leagueUrlRow = squad.leagueTableUrl
        ? `<div class="sd-detail-row">
               <span class="sd-detail-label">League Table</span>
               <a href="${squad.leagueTableUrl}" target="_blank" rel="noopener" class="sd-action-btn link" style="font-size:.78rem;">View table <i class="fas fa-external-link-alt" style="font-size:.65rem;"></i></a>
           </div>`
        : '';

    const notesBlock = squad.notes
        ? `<div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:10px;border-left:3px solid #00C49A;">
               <div style="font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Notes</div>
               <p style="font-size:.82rem;color:#334155;margin:0;line-height:1.55;white-space:pre-wrap;">${squad.notes}</p>
           </div>`
        : '';

    return `<div class="sd-info-card" style="cursor:pointer;transition:box-shadow .18s,transform .15s;"
        onclick="openSquadEditModal('${squadId}')"
        onmouseover="this.style.boxShadow='0 4px 18px rgba(0,0,0,0.11)';this.style.transform='translateY(-1px)';"
        onmouseout="this.style.boxShadow='';this.style.transform='';">
        <div class="sd-info-card-header">
            <span class="sd-info-card-title"><i class="fas fa-shield-alt" style="color:#00C49A;margin-right:6px;"></i>${squad.name}</span>
            <div style="display:flex;align-items:center;gap:8px;" onclick="event.stopPropagation()">
                ${squad.ageGroup ? `<span class="sd-chip">${squad.ageGroup}</span>` : ''}
                ${canEdit ? `<span style="font-size:.72rem;color:#94a3b8;font-style:italic;">Click to manage</span>` : ''}
            </div>
        </div>
        <div class="sd-card-body">
            <div class="sd-detail-row">
                <span class="sd-detail-label">Staff</span>
                <div style="text-align:right;max-width:65%;">${staffChips}</div>
            </div>
            <div class="sd-detail-row">
                <span class="sd-detail-label">League(s)</span>
                <span class="sd-detail-value">${leagueDisplay}</span>
            </div>
            ${leagueUrlRow}
            ${notesBlock}
        </div>
        <div class="sd-card-actions" onclick="event.stopPropagation()">
            ${hasFeature('assessments') ? `<button class="sd-action-btn outline" onclick="openSquadAssessmentModal()"><i class="fas fa-clipboard-check"></i> Assess Squad</button>` : `<button class="sd-action-btn outline" style="opacity:.5;cursor:default;" onclick="event.preventDefault();showUpgradeToast('pro','Squad Assessments')"><i class="fas fa-lock"></i> Assess Squad</button>`}
            ${isAdmin ? `<button class="sd-action-btn danger" onclick="deleteSquad('${squadId}')"><i class="fas fa-trash-alt"></i> Delete Squad</button>` : ''}
        </div>
    </div>`;
}

function buildSnapshotCard(squadId) {
    const pastMatches = matchManager.getMatches()
        .filter(m => m.squadId === squadId && m.isPast)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = pastMatches.length;
    const wins = pastMatches.filter(m => m.result === 'W').length;
    const draws = pastMatches.filter(m => m.result === 'D').length;
    const losses = pastMatches.filter(m => m.result === 'L').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const dots = Array.from({ length: 5 }, (_, i) => {
        const m = pastMatches[i];
        return m ? `<div class="sd-form-dot ${m.result || ''}" title="${m.result || '?'}">${m.result || '?'}</div>`
                 : `<div class="sd-form-dot empty"></div>`;
    }).join('');
    return `<div class="sd-info-card">
        <div class="sd-info-card-header">
            <span class="sd-info-card-title"><i class="fas fa-chart-bar" style="color:#6366f1;margin-right:6px;"></i>Season Snapshot</span>
            <a href="analytics.html?tab=team" class="sd-action-btn link">Team Analytics &#8594;</a>
        </div>
        <div class="sd-card-body">
            <div style="margin-bottom:14px;">
                <div class="sd-detail-label" style="margin-bottom:8px;">Last 5 Form</div>
                <div class="sd-form-dots">${dots}</div>
            </div>
            <div class="sd-stat-grid">
                <div class="sd-stat-box"><div class="stat-num" style="color:#22c55e;">${wins}</div><div class="stat-lbl">Wins</div></div>
                <div class="sd-stat-box"><div class="stat-num" style="color:#f59e0b;">${draws}</div><div class="stat-lbl">Draws</div></div>
                <div class="sd-stat-box"><div class="stat-num" style="color:#ef4444;">${losses}</div><div class="stat-lbl">Losses</div></div>
            </div>
            ${total > 0 ? `<div class="sd-detail-row" style="margin-top:8px;"><span class="sd-detail-label">Win Rate</span><span class="sd-detail-value">${winRate}%</span></div><div class="sd-detail-row"><span class="sd-detail-label">Played</span><span class="sd-detail-value">${total}</span></div>` : '<div style="color:#94a3b8;font-size:.8rem;text-align:center;padding:8px 0;">No match data yet.</div>'}
        </div>
    </div>`;
}

function buildPerformersCard(squadId) {
    const leaders = playerLeaderboard[squadId] || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rows = leaders.length > 0
        ? leaders.map((p, i) => `<div class="sd-performers-row"><span class="sd-performers-medal">${medals[i] || ''}</span><span class="sd-performers-name">${p.name}</span><div class="sd-performers-stats"><span class="sd-performers-stat goals">${p.goals}G</span><span class="sd-performers-stat assists">${p.assists}A</span></div></div>`).join('')
        : '<div style="color:#94a3b8;font-size:.82rem;text-align:center;padding:16px 0;">No match data yet.</div>';
    return `<div class="sd-info-card">
        <div class="sd-info-card-header">
            <span class="sd-info-card-title"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:6px;"></i>Top Performers</span>
            <a href="analytics.html?tab=player&squad=${squadId}" class="sd-action-btn link">Player Analytics &#8594;</a>
        </div>
        <div class="sd-card-body">${rows}</div>
    </div>`;
}

function buildSquadMediaCard(squad, squadId) {
    const media = Array.isArray(squad?.media) ? squad.media : [];
    const photos = media.filter(m => m.type === 'photo');
    const videos = media.filter(m => m.type === 'video');

    // Thumbnail strip: up to 4 photos
    const thumbsHtml = photos.slice(0, 4).map((p, i) => {
        const isLast = i === 3 && photos.length > 4;
        return `<div style="position:relative;border-radius:8px;overflow:hidden;width:52px;height:52px;background:#f1f5f9;flex-shrink:0;border:1px solid #e2e8f0;">
            <img src="${p.url}" alt="Photo" style="width:100%;height:100%;object-fit:cover;">
            ${isLast ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff;">+${photos.length - 3}</div>` : ''}
        </div>`;
    }).join('');

    const summaryText = [
        photos.length ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : '',
        videos.length ? `${videos.length} video${videos.length !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(', ') || 'No media yet';

    return `<div class="sd-info-card" id="sdMediaCard_${squadId}" style="cursor:pointer;transition:box-shadow .18s,transform .15s;"
        onclick="openSquadMediaModal('${squadId}')"
        onmouseover="this.style.boxShadow='0 4px 18px rgba(0,0,0,0.11)';this.style.transform='translateY(-1px)';"
        onmouseout="this.style.boxShadow='';this.style.transform='';">
        <div class="sd-info-card-header">
            <span class="sd-info-card-title"><i class="fas fa-images" style="color:var(--blue-accent);margin-right:6px;"></i>Squad Media</span>
            <span style="font-size:.72rem;color:#94a3b8;font-style:italic;">Click to open</span>
        </div>
        <div class="sd-card-body" id="sdMediaBody_${squadId}">
            ${photos.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${thumbsHtml}</div>` : ''}
            <div style="font-size:.8rem;color:#64748b;">${summaryText}</div>
        </div>
    </div>`;
}

window.handleSquadPhotoUpload = async function(squadId, input, section = null) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    const maxSize = 5 * 1024 * 1024;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const valid = files.filter(f => f.size <= maxSize && validTypes.includes(f.type));
    if (valid.length < files.length) showToast(`${files.length - valid.length} file(s) skipped (max 5MB)`, 'error');
    if (!valid.length) return;

    showToast(`Uploading ${valid.length} photo(s)...`, 'info');
    const uploaded = [];
    for (const file of valid) {
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const path = `squads/${squadId}/media/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { data, error } = await supabase.storage.from('avatars').upload(path, file, {
                cacheControl: '3600', upsert: false, contentType: file.type
            });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path);
            uploaded.push({ type: 'photo', url: publicUrl, name: file.name, section: section || null, uploadedAt: new Date().toISOString() });
        } catch (err) { console.error('Squad photo upload failed:', err); }
    }
    if (!uploaded.length) { showToast('Upload failed', 'error'); return; }

    const existing = Array.isArray(squad.media) ? squad.media : [];
    const merged = [...existing, ...uploaded];
    const ok = await squadManager.updateSquad(squadId, { media: merged });
    if (ok) {
        squad.media = merged;
        _refreshSquadMediaCard(squad, squadId);
        showToast(`${uploaded.length} photo(s) added`, 'success');
    }
    input.value = '';
};

window.openSquadVideoModal = function(squadId) {
    const existing = document.getElementById('modalSquadVideo');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'modalSquadVideo';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header">
                <h2 style="font-size:1rem;">Add Video Link</h2>
                <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:20px;">
                <div class="form-group-bubble">
                    <label>Video Title</label>
                    <input type="text" id="sqVideoTitle" class="form-control-bubble" placeholder="e.g. Training Highlights — Week 4">
                </div>
                <div class="form-group-bubble">
                    <label>Video URL</label>
                    <input type="url" id="sqVideoUrl" class="form-control-bubble" placeholder="YouTube, Vimeo or direct link">
                </div>
            </div>
            <div class="modal-footer">
                <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="dash-btn primary" onclick="saveSquadVideo('${squadId}')">Add Video</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
};

window.saveSquadVideo = async function(squadId) {
    const title = document.getElementById('sqVideoTitle')?.value?.trim();
    const url = document.getElementById('sqVideoUrl')?.value?.trim();
    if (!title || !url) { showToast('Title and URL are required', 'error'); return; }

    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    const existing = Array.isArray(squad.media) ? squad.media : [];
    const merged = [...existing, { type: 'video', title, url, addedAt: new Date().toISOString() }];
    const ok = await squadManager.updateSquad(squadId, { media: merged });
    if (ok) {
        squad.media = merged;
        _refreshSquadMediaCard(squad, squadId);
        document.getElementById('modalSquadVideo')?.remove();
        showToast('Video added', 'success');
    }
};

window.deleteSquadMedia = async function(squadId, idx, type) {
    if (!confirm(`Remove this ${type}?`)) return;
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    const allMedia = Array.isArray(squad.media) ? [...squad.media] : [];
    const sameType = allMedia.filter(m => m.type === type);
    const item = sameType[idx];
    if (!item) return;
    const globalIdx = allMedia.indexOf(item);
    allMedia.splice(globalIdx, 1);

    const ok = await squadManager.updateSquad(squadId, { media: allMedia });
    if (ok) {
        squad.media = allMedia;
        _refreshSquadMediaCard(squad, squadId);
        showToast(`${type === 'photo' ? 'Photo' : 'Video'} removed`, 'success');
    }
};

function _refreshSquadMediaCard(squad, squadId) {
    // Refresh preview card
    const card = document.getElementById(`sdMediaCard_${squadId}`);
    if (card) {
        const media = Array.isArray(squad.media) ? squad.media : [];
        const photos = media.filter(m => m.type === 'photo');
        const videos = media.filter(m => m.type === 'video');
        const thumbsHtml = photos.slice(0, 4).map((p, i) => {
            const isLast = i === 3 && photos.length > 4;
            return `<div style="position:relative;border-radius:8px;overflow:hidden;width:52px;height:52px;background:#f1f5f9;flex-shrink:0;border:1px solid #e2e8f0;">
                <img src="${p.url}" alt="Photo" style="width:100%;height:100%;object-fit:cover;">
                ${isLast ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff;">+${photos.length - 3}</div>` : ''}
            </div>`;
        }).join('');
        const summary = [
            photos.length ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : '',
            videos.length ? `${videos.length} video${videos.length !== 1 ? 's' : ''}` : '',
        ].filter(Boolean).join(', ') || 'No media yet';
        const body = card.querySelector(`#sdMediaBody_${squadId}`);
        if (body) body.innerHTML = `${photos.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${thumbsHtml}</div>` : ''}<div style="font-size:.8rem;color:#64748b;">${summary}</div>`;
    }
    // Refresh modal if open
    _renderSquadMediaModalBody(squadId);
    // Legacy compat: fall through to old inline refresh if body exists
    const inlineBody = document.getElementById(`sdMediaBody_legacy_${squadId}`);
    if (!inlineBody) return;
    const media = Array.isArray(squad.media) ? squad.media : [];
    const photoItems = media.filter(m => m.type === 'photo');
    const videoItems = media.filter(m => m.type === 'video');

    const photoHtml = photoItems.length > 0
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:6px;margin-bottom:${videoItems.length ? '14px' : '0'};">
            ${photoItems.map((p, i) => `
                <div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:#f1f5f9;border:1px solid #e2e8f0;">
                    <img src="${p.url}" alt="${p.name||'Photo'}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window.open('${p.url}','_blank')">
                    <button onclick="deleteSquadMedia('${squadId}',${i},'photo')" title="Remove" style="position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;background:rgba(239,68,68,0.85);border:none;color:#fff;cursor:pointer;font-size:0.55rem;display:flex;align-items:center;justify-content:center;padding:0;"><i class="fas fa-times"></i></button>
                </div>`).join('')}
          </div>`
        : '';

    const videoHtml = videoItems.length > 0
        ? videoItems.map((v, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                <i class="fas fa-play-circle" style="color:var(--blue-accent);font-size:1.1rem;flex-shrink:0;"></i>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:.8rem;color:var(--navy-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.title||'Untitled'}</div>
                    <a href="${v.url}" target="_blank" style="font-size:.72rem;color:var(--blue-accent);">Open Video</a>
                </div>
                <button onclick="deleteSquadMedia('${squadId}',${i},'video')" title="Remove" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:.75rem;flex-shrink:0;"><i class="fas fa-times"></i></button>
            </div>`).join('')
        : '';

    body.innerHTML = photoHtml + videoHtml + (!photoItems.length && !videoItems.length
        ? '<div style="text-align:center;padding:14px 0;color:#94a3b8;font-size:.78rem;">No media added yet.</div>'
        : '');
}

// ─────────────────────────────────────────────────────────────────
// SQUAD MEDIA MODAL — with section/group support
// ─────────────────────────────────────────────────────────────────

// UI-only section list for the current modal session (persisted implicitly via photo section tags)
let _squadMediaSections = [];

function _photoCard(p, globalIdx, squadId) {
    return `<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;">
        <div style="aspect-ratio:1;overflow:hidden;background:#f1f5f9;">
            <img src="${p.url}" alt="${p.name||'Photo'}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window.open('${p.url}','_blank')">
        </div>
        <div style="padding:6px 8px;display:flex;align-items:center;gap:4px;">
            <span style="flex:1;font-size:.68rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${p.name||'Photo'}">${p.name||'Photo'}</span>
            <a href="${p.url}" download="${p.name||'photo'}" title="Download" style="padding:3px 6px;border:1px solid #e2e8f0;border-radius:5px;color:#475569;font-size:.68rem;text-decoration:none;"><i class="fas fa-download"></i></a>
            <button onclick="deleteSquadMediaByIndex('${squadId}',${globalIdx})" title="Remove" style="padding:3px 6px;border:1px solid #fca5a5;border-radius:5px;background:#fee2e2;color:#ef4444;cursor:pointer;font-size:.68rem;"><i class="fas fa-trash"></i></button>
        </div>
    </div>`;
}

function _sectionBlock(sectionName, photos, allMedia, squadId) {
    const escapedSection = sectionName.replace(/'/g, "\\'");
    const photoGrid = photos.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px;">
            ${photos.map(p => _photoCard(p, allMedia.indexOf(p), squadId)).join('')}
           </div>`
        : `<p style="font-size:.8rem;color:#94a3b8;margin:10px 0 0;">No photos in this section yet.</p>`;

    const inputId = `sqSectionUpload_${sectionName.replace(/\W/g,'_')}`;
    return `<div style="margin-bottom:24px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <h4 style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#334155;margin:0;">
                <i class="fas fa-folder" style="color:#64748b;margin-right:6px;"></i>${sectionName}
                <span style="font-weight:400;font-size:.72rem;color:#94a3b8;margin-left:4px;">(${photos.length})</span>
            </h4>
            <label for="${inputId}" class="dash-btn outline" style="font-size:.76rem;padding:5px 12px;cursor:pointer;margin:0;">
                <i class="fas fa-camera"></i> Add Photos
            </label>
            <input type="file" id="${inputId}" accept="image/jpeg,image/png,image/webp" multiple style="display:none;"
                onchange="handleSquadPhotoUpload('${squadId}', this, '${escapedSection}')">
        </div>
        ${photoGrid}
    </div>`;
}

function _renderSquadMediaModalBody(squadId) {
    const modal = document.getElementById('modalSquadMedia');
    if (!modal || modal.dataset.squadId !== squadId) return;

    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    const allMedia = Array.isArray(squad.media) ? squad.media : [];
    const photos = allMedia.filter(m => m.type === 'photo');
    const videos = allMedia.filter(m => m.type === 'video');

    const countEl = modal.querySelector('#sqMediaCount');
    if (countEl) {
        countEl.textContent = [
            photos.length ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : '',
            videos.length ? `${videos.length} video${videos.length !== 1 ? 's' : ''}` : '',
        ].filter(Boolean).join(', ') || 'No media yet';
    }

    const body = modal.querySelector('#sqMediaModalBody');
    if (!body) return;

    // Sync sections: merge persisted section names from items + any UI-created empty sections
    const persistedSections = [...new Set(photos.filter(p => p.section).map(p => p.section))];
    persistedSections.forEach(s => { if (!_squadMediaSections.includes(s)) _squadMediaSections.push(s); });

    let sectionsHtml = '';
    _squadMediaSections.forEach(sec => {
        const secPhotos = photos.filter(p => p.section === sec);
        sectionsHtml += _sectionBlock(sec, secPhotos, allMedia, squadId);
    });

    const unsortedPhotos = photos.filter(p => !p.section);
    const unsortedHtml = (unsortedPhotos.length || !_squadMediaSections.length) ? `
        <div style="margin-bottom:24px;">
            <h4 style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0 0 10px 0;">
                <i class="fas fa-camera" style="margin-right:5px;"></i>Photos${_squadMediaSections.length ? ' — General' : ''} (${unsortedPhotos.length})
            </h4>
            ${unsortedPhotos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">
                ${unsortedPhotos.map(p => _photoCard(p, allMedia.indexOf(p), squadId)).join('')}
            </div>` : `<p style="font-size:.8rem;color:#94a3b8;margin:0;">No general photos yet.</p>`}
        </div>` : '';

    const videosHtml = videos.length ? `
        <div style="margin-top:${photos.length ? '8px' : '0'};">
            <h4 style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0 0 10px 0;">
                <i class="fas fa-play-circle" style="margin-right:5px;"></i>Videos (${videos.length})
            </h4>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${videos.map((v, i) => {
                    const globalIdx = allMedia.indexOf(v);
                    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                        <div style="width:36px;height:36px;background:#e0f2fe;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-play-circle" style="color:#0369a1;font-size:1rem;"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:.85rem;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.title||'Untitled Video'}</div>
                            <div style="font-size:.72rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.url}</div>
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0;">
                            <a href="${v.url}" target="_blank" rel="noopener" style="padding:5px 10px;border:1px solid #e2e8f0;border-radius:7px;font-size:.75rem;color:#1e293b;text-decoration:none;background:#fff;"><i class="fas fa-external-link-alt"></i> Open</a>
                            <button onclick="deleteSquadMediaByIndex('${squadId}',${globalIdx})" style="padding:5px 10px;border:1px solid #fca5a5;border-radius:7px;background:#fee2e2;color:#ef4444;cursor:pointer;font-size:.75rem;"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>` : '';

    const emptyHtml = !photos.length && !videos.length && !_squadMediaSections.length ? `
        <div style="text-align:center;padding:48px 24px;color:#94a3b8;">
            <i class="fas fa-images" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:.3;"></i>
            <p style="font-size:.9rem;margin:0 0 4px 0;font-weight:600;color:#64748b;">No media yet</p>
            <p style="font-size:.82rem;margin:0;">Upload photos, create sections, or add video links below</p>
        </div>` : '';

    body.innerHTML = sectionsHtml + unsortedHtml + videosHtml + emptyHtml;
}

// Delete by global index in the flat media array (used by both photo sections and video rows)
window.deleteSquadMediaByIndex = async function(squadId, globalIdx) {
    if (!confirm('Remove this item?')) return;
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    const allMedia = Array.isArray(squad.media) ? [...squad.media] : [];
    if (globalIdx < 0 || globalIdx >= allMedia.length) return;
    allMedia.splice(globalIdx, 1);

    const ok = await squadManager.updateSquad(squadId, { media: allMedia });
    if (ok) {
        squad.media = allMedia;
        _refreshSquadMediaCard(squad, squadId);
        showToast('Removed', 'success');
    }
};

window.addSquadMediaSection = function(squadId) {
    const name = prompt('Section name (e.g. Match Day, Training, Away Trip):');
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (_squadMediaSections.includes(trimmed)) { showToast('Section already exists', 'error'); return; }
    _squadMediaSections.push(trimmed);
    _renderSquadMediaModalBody(squadId);
};

window.openSquadMediaModal = function(squadId) {
    const existing = document.getElementById('modalSquadMedia');
    if (existing) existing.remove();

    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    // Reset session sections then repopulate from existing data inside render
    _squadMediaSections = [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'modalSquadMedia';
    overlay.dataset.squadId = squadId;
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:920px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.18);overflow:hidden;display:flex;flex-direction:column;max-height:88vh;">
            <div class="modal-header" style="padding:20px 28px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <div>
                    <h2 style="margin:0;font-size:1.15rem;font-weight:700;color:#0f172a;"><i class="fas fa-images" style="color:#00C49A;margin-right:8px;"></i>${squad.name} — Media</h2>
                    <p id="sqMediaCount" style="margin:4px 0 0;font-size:.8rem;color:#94a3b8;"></p>
                </div>
                <button onclick="document.getElementById('modalSquadMedia')?.remove()" style="background:none;border:none;cursor:pointer;font-size:1.5rem;color:#94a3b8;padding:4px;line-height:1;">&times;</button>
            </div>
            <div id="sqMediaModalBody" style="padding:24px 28px;overflow-y:auto;flex:1;min-height:0;"></div>
            <div style="padding:16px 28px;border-top:1px solid #f1f5f9;display:flex;gap:10px;align-items:center;flex-shrink:0;background:#f8fafc;">
                <button class="dash-btn outline" onclick="addSquadMediaSection('${squadId}')" style="margin-right:auto;">
                    <i class="fas fa-folder-plus"></i> New Section
                </button>
                <label for="sqMediaPhotoInput" class="dash-btn outline" style="cursor:pointer;margin:0;">
                    <i class="fas fa-camera"></i> Upload Photos
                </label>
                <input type="file" id="sqMediaPhotoInput" accept="image/jpeg,image/png,image/webp" multiple style="display:none;"
                    onchange="handleSquadPhotoUpload('${squadId}', this, null)">
                <button class="dash-btn outline" onclick="openSquadVideoModal('${squadId}')">
                    <i class="fas fa-link"></i> Add Video Link
                </button>
            </div>
        </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    _renderSquadMediaModalBody(squadId);
};

window.viewSquadDetails = viewSquadDetails;
window.openSquadAssessmentModal = openSquadAssessmentModal;
window.openAssignPlayerModal = openAssignPlayerModal;
function viewSquadDetails(squadId) {
    const isUnassigned = squadId === 'unassigned';
    const squad = isUnassigned
        ? { name: 'Unassigned', ageGroup: '', coaches: [], leagues: [] }
        : squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    ensurePlayerCardStyles();
    currentSquadId = squadId;
    squadDetailViewMode = window.innerWidth <= 768 ? 'grid' : squadDetailViewMode;

    const players = isUnassigned
        ? sortPlayersByPosition(squadManager.getPlayers({}).filter(p => !p.squadId))
        : sortPlayersByPosition(squadManager.getPlayers({ squadId }));

    // Hide tabs, squad grid, and page header
    document.getElementById('squadGrid').style.display = 'none';
    const tabsEl = document.querySelector('.squad-page-tabs');
    if (tabsEl) tabsEl.style.display = 'none';
    const pageHeader = document.querySelector('.page-header');
    if (pageHeader) pageHeader.style.display = 'none';

    const sheet = document.getElementById('squadDetailView');
    sheet.style.display = 'block';

    const listActive = squadDetailViewMode === 'list' ? 'active' : '';
    const gridActive = squadDetailViewMode === 'grid' ? 'active' : '';

    sheet.innerHTML = `
        <div class="sd-back-row">
            <button class="sd-action-btn outline" onclick="backToSquads()"><i class="fas fa-arrow-left"></i> Back to Squads</button>
            ${!isUnassigned ? `<button class="sd-action-btn outline" onclick="openSquadShareModal('${squadId}')"><i class="fas fa-share-nodes"></i> Share Squad</button>` : ''}
        </div>
        <div class="sd-layout">
            <div class="sd-details-wrap">
                ${buildDetailsCard(squad, squadId, isUnassigned)}
            </div>
            <div class="sd-players-wrap">
                <div class="sd-info-card">
                    <div class="sd-players-header">
                        <div>
                            <div class="sd-info-card-title"><i class="fas fa-users" style="color:#00C49A;margin-right:6px;"></i>Players</div>
                            <div style="font-size:.76rem;color:#64748b;margin-top:2px;">${players.length} ${isUnassigned ? 'unassigned' : 'in squad'}</div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            ${isUnassigned ? '' : '<button class="sd-action-btn primary" onclick="openAssignPlayerModal()"><i class="fas fa-plus"></i> Add Player</button>'}
                            <div class="view-toggle-group">
                                <button id="sdBtnList" class="view-toggle-btn ${listActive}" onclick="setSquadPlayerView('list')" title="List View"><i class="fas fa-list"></i></button>
                                <button id="sdBtnGrid" class="view-toggle-btn ${gridActive}" onclick="setSquadPlayerView('grid')" title="Grid View"><i class="fas fa-th-large"></i></button>
                            </div>
                        </div>
                    </div>
                    <div id="squadDetailGridWrapper" style="display:none;"></div>
                    <div id="squadDetailTableWrapper" style="display:none;">
                        <div style="overflow-x:auto;">
                            <table class="squad-table data-table" style="width:100%;">
                                <thead><tr><th>Name</th><th style="width:140px;">Position</th><th style="width:60px;text-align:center;">Age</th><th style="width:80px;text-align:center;">Foot</th><th style="width:100px;text-align:center;">Status</th></tr></thead>
                                <tbody id="squadDetailTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            ${isUnassigned ? '' : `<div class="sd-analytics-wrap">
                ${buildSnapshotCard(squadId)}
                ${buildPerformersCard(squadId)}
                ${buildSquadMediaCard(squad, squadId)}
            </div>`}
        </div>`;

    renderSquadDetailPlayers(players);
}

window.setSquadPlayerView = function (mode) {
    squadDetailViewMode = mode;
    document.getElementById('sdBtnList')?.classList.toggle('active', mode === 'list');
    document.getElementById('sdBtnGrid')?.classList.toggle('active', mode === 'grid');
    if (!currentSquadId) return;
    const players = currentSquadId === 'unassigned'
        ? sortPlayersByPosition(squadManager.getPlayers({}).filter(p => !p.squadId))
        : sortPlayersByPosition(squadManager.getPlayers({ squadId: currentSquadId }));
    renderSquadDetailPlayers(players);
};

function groupPlayersByPosition(players) {
    const groups = [[], [], [], [], []];
    const labels = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards', 'Unassigned'];
    const seen = [new Set(), new Set(), new Set(), new Set(), new Set()];

    players.forEach(p => {
        if (!p.position) { if (!seen[4].has(p.id)) { seen[4].add(p.id); groups[4].push(p); } return; }
        const positions = p.position.split(',').map(s => s.trim());
        const groupIndices = new Set();
        positions.forEach(pos => {
            const idx = POSITION_GROUP_ORDER[pos] ?? 99;
            if (idx <= 3) groupIndices.add(idx);
        });
        if (groupIndices.size === 0) {
            if (!seen[4].has(p.id)) { seen[4].add(p.id); groups[4].push(p); }
        } else {
            groupIndices.forEach(idx => {
                if (!seen[idx].has(p.id)) { seen[idx].add(p.id); groups[idx].push(p); }
            });
        }
    });

    return groups.map((players, i) => ({ label: labels[i], players })).filter(g => g.players.length > 0);
}

function renderSquadDetailPlayers(players) {
    const tableWrapper = document.getElementById('squadDetailTableWrapper');
    const gridWrapper = document.getElementById('squadDetailGridWrapper');
    const isMobile = window.innerWidth <= 768;
    const useGrid = squadDetailViewMode === 'grid' || isMobile;
    const grouped = groupPlayersByPosition(players);

    if (useGrid) {
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (gridWrapper) {
            gridWrapper.style.display = 'block';
            if (players.length === 0) {
                gridWrapper.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);"><i class="fas fa-users" style="font-size:2rem;opacity:.4;display:block;margin-bottom:12px;"></i>No players in this squad yet.</div>`;
            } else {
                let html = '';
                grouped.forEach(group => {
                    html += `<div class="squad-position-group">
                        <div class="squad-group-header"><span class="squad-group-label">${group.label}</span><span class="squad-group-count">${group.players.length}</span></div>
                        <div class="player-cards-grid">${group.players.map(p => renderSquadPlayerCard(p)).join('')}</div>
                    </div>`;
                });
                gridWrapper.innerHTML = html;
            }
        }
    } else {
        if (gridWrapper) gridWrapper.style.display = 'none';
        if (tableWrapper) {
            tableWrapper.style.display = 'block';
            const tbody = document.getElementById('squadDetailTableBody');
            if (tbody) {
                if (players.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">No players in this squad yet.</td></tr>`;
                } else {
                    let html = '';
                    grouped.forEach(group => {
                        html += `<tr class="squad-group-header-row"><td colspan="5"><span class="squad-group-label">${group.label}</span><span class="squad-group-count">${group.players.length}</span></td></tr>`;
                        html += group.players.map(p => renderSquadPlayerRow(p)).join('');
                    });
                    tbody.innerHTML = html;
                }
            }
        }
    }
}

function playerAvatarCard(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    if (p.profileImageUrl) {
        return `<div class="player-card-avatar" style="padding:0;overflow:hidden;"><img src="${p.profileImageUrl}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`;
    }
    return `<div class="player-card-avatar">${initials}</div>`;
}

function playerAvatarSm(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    if (p.profileImageUrl) {
        return `<div class="avatar-sm" style="padding:0;overflow:hidden;flex-shrink:0;"><img src="${p.profileImageUrl}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`;
    }
    return `<div class="avatar-sm">${initials}</div>`;
}

function renderSquadPlayerCard(p) {
    return `
        <a href="player-profile.html?id=${p.id}" class="player-card" style="text-decoration:none;color:inherit;">
            ${playerAvatarCard(p)}
            <div class="player-card-name">${p.name}</div>
            <span class="player-card-pos">${p.position || '--'}</span>
            <div class="player-card-stats">
                <div class="player-card-stat"><span>Age</span><strong>${displayAge(p.age)}</strong></div>
                <div class="player-card-stat"><span>Foot</span><strong>${p.foot || '--'}</strong></div>
            </div>
        </a>`;
}

function renderSquadPlayerRow(p) {
    return `
    <tr onclick="location.href='player-profile.html?id=${p.id}'" title="View ${p.name}'s profile">
        <td class="player-name-cell">${playerAvatarSm(p)}${p.name}</td>
        <td style="color:#475569;">${p.position || '--'}</td>
        <td style="text-align:center;color:#475569;">${displayAge(p.age)}</td>
        <td style="text-align:center;color:#475569;">${p.foot || '--'}</td>
        <td style="text-align:center;" onclick="event.stopPropagation()">${hasFeature('player_status') ? statusSelectHTML(p) : `<span style="color:#64748b;font-size:.8rem;">${(PLAYER_STATUSES[p.playerStatus || 'active']?.label) || 'Active'}</span>`}</td>
    </tr>`;
}

// ═══════════════════════════════════════════════════════════
//  SQUAD CRUD
// ═══════════════════════════════════════════════════════════
function addCoachRow() {
    const container = document.getElementById('coachesContainer');
    const div = document.createElement('div');
    div.className = 'coach-row';
    div.innerHTML = `
        <input type="text" class="form-control-bubble coach-role" placeholder="Role (e.g. Head Coach)" style="flex:1; margin-bottom:0;">
        <input type="text" class="form-control-bubble coach-name" placeholder="Name (e.g. Tlisane Motaung)" style="flex:2; margin-bottom:0;">
        <button type="button" class="btn-icon-soft remove-coach-btn" onclick="this.parentElement.remove()" style="flex:0 0 42px; height:42px; border-radius:8px; border:1px solid #fca5a5; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
            <i class="fas fa-trash-alt"></i>
        </button>`;
    container.appendChild(div);
}

function saveSquad() {
    const name = document.getElementById('squadNameInput').value;
    const ageGroup = document.getElementById('squadAgeGroupInput').value;
    const leaguesRaw = document.getElementById('squadLeagueInput').value;

    const coachRows = document.querySelectorAll('.coach-row');
    const coaches = [];
    coachRows.forEach(row => {
        const role = row.querySelector('.coach-role').value.trim();
        const cName = row.querySelector('.coach-name').value.trim();
        if (cName) coaches.push(role ? `${role}: ${cName}` : cName);
    });

    if (name) {
        const leagues = leaguesRaw ? leaguesRaw.split(',').map(s => s.trim()) : [];
        squadManager.addSquad({ name, ageGroup, leagues, coaches }).then(() => {
            document.getElementById('squadNameInput').value = '';
            document.getElementById('squadAgeGroupInput').value = '';
            document.getElementById('squadLeagueInput').value = '';
            document.getElementById('coachesContainer').innerHTML = '';
            addCoachRow();
            closeAllModals();
            renderDynamicFilters();
            renderSquads();
        });
    }
}

window.deleteSquad = deleteSquad;
async function deleteSquad(id) {
    const confirmed = await squadConfirm(
        'Delete Squad',
        'Are you sure you want to delete this squad? Players will become unassigned.',
        'Delete Squad'
    );
    if (!confirmed) return;
    const success = await squadManager.deleteSquad(id);
    if (success) {
        backToSquads();
        renderDynamicFilters();
        showToast('Squad deleted successfully', 'success');
    }
}

window.setPlayerStatus = async function(playerId, status) {
    const success = await squadManager.updatePlayerStatus(playerId, status);
    if (!success) { showToast('Failed to update status', 'error'); return; }
    document.querySelectorAll(`.player-status-select[data-player-id="${playerId}"]`).forEach(sel => {
        sel.value = status;
        sel.className = `player-status-select status-${status}`;
    });
    const label = PLAYER_STATUSES[status]?.label || status;
    showToast(`${label}`, 'success');
};

window.deleteSquadPlayer = async function (playerId, event) {
    if (event) event.stopPropagation();
    const confirmed = await squadConfirm('Delete Player', 'Delete this player? This cannot be undone.', 'Delete Player');
    if (!confirmed) return;
    const success = await squadManager.deletePlayer(playerId);
    if (success) {
        showToast('Player deleted', 'success');
        if (currentSquadId) viewSquadDetails(currentSquadId);
    }
};

window.removePlayerFromSquad = async function (playerId) {
    const confirmed = await squadConfirm('Remove from Squad', 'Remove this player from the squad? The player will not be deleted, just unassigned.', 'Remove');
    if (!confirmed) return;
    await squadManager.updatePlayer(playerId, { squadId: '' });
    showToast('Player removed from squad.', 'success');
    viewSquadDetails(currentSquadId);
};

window.openMovePlayerFromCard = function (playerId, event) {
    if (event) event.stopPropagation();
    const player = squadManager.players.find(p => String(p.id) === String(playerId));
    if (!player) return;
    document.getElementById('movePlayerNameDisplay').textContent = player.name;
    document.getElementById('movePlayerIdInput').value = playerId;
    const select = document.getElementById('movePlayerSquadSelect');
    if (select) {
        select.innerHTML = squadManager.getSquads().map(s => `<option value="${s.id}"${s.id === player.squadId ? ' selected' : ''}>${s.name}</option>`).join('');
    }
    openModal('modalMovePlayer');
};

// ═══════════════════════════════════════════════════════════
//  SQUAD ASSESSMENT
// ═══════════════════════════════════════════════════════════
function openSquadAssessmentModal() {
    if (!currentSquadId) return;
    document.getElementById('squadAssessDate').valueAsDate = new Date();
    ['squadAssessContext', 'squadAssessTactical', 'squadAssessPhysical', 'squadAssessMentality', 'squadAssessOverall', 'squadAssessStrengths', 'squadAssessImprovements', 'squadAssessNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'squadAssessContext' ? 'Match' : '';
    });
    openModal('modalSquadAssessment');
}

function saveSquadAssessment() {
    if (!currentSquadId) return;
    const btn = document.getElementById('btnSaveSquadAssessment');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const payload = {
        squadId: currentSquadId,
        date: document.getElementById('squadAssessDate').value,
        context: document.getElementById('squadAssessContext').value,
        ratings: {
            tactical: parseInt(document.getElementById('squadAssessTactical').value) || 0,
            physical: parseInt(document.getElementById('squadAssessPhysical').value) || 0,
            mentality: parseInt(document.getElementById('squadAssessMentality').value) || 0,
            overall: parseInt(document.getElementById('squadAssessOverall').value) || 0
        },
        feedback: {
            strengths: document.getElementById('squadAssessStrengths').value,
            improvements: document.getElementById('squadAssessImprovements').value,
            notes: document.getElementById('squadAssessNotes').value
        }
    };

    squadManager.saveSquadAssessment(payload).then(success => {
        if (success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            btn.style.background = 'var(--green-accent)';
            showToast('Squad assessment saved successfully', 'success');
            setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; btn.disabled = false; closeAllModals(); }, 1000);
        } else {
            btn.innerHTML = '<i class="fas fa-times"></i> Error';
            btn.style.background = '#ef4444';
            btn.disabled = false;
            setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 2000);
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  ROSTER MANAGEMENT
// ═══════════════════════════════════════════════════════════
function openAssignPlayerModal() {
    if (!currentSquadId) return;
    const select = document.getElementById('assignExistingPlayerSelect');
    const available = squadManager.getPlayers().filter(p => p.squadId !== currentSquadId);
    if (available.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No other players available</option>';
        document.getElementById('btnAssignExistingPlayer').disabled = true;
    } else {
        select.innerHTML = available.map(p => `<option value="${p.id}">${p.name} (${p.position})</option>`).join('');
        document.getElementById('btnAssignExistingPlayer').disabled = false;
    }
    document.getElementById('newPlayerNameAssign').value = '';
    // Initialize year picker on assign modal input (once) and reset
    populateYearOfBirthSelect('newPlayerAgeAssign');
    const assignAgeEl = document.getElementById('newPlayerAgeAssign');
    if (assignAgeEl && assignAgeEl._yearPicker) {
        assignAgeEl._yearPicker.setValue('');
    }
    openModal('modalAssignPlayer');
}

async function assignExistingPlayer() {
    const playerId = document.getElementById('assignExistingPlayerSelect').value;
    if (!playerId) return;
    await squadManager.updatePlayer(playerId, { squadId: currentSquadId });
    closeAllModals();
    viewSquadDetails(currentSquadId);
}

async function createAndAssignPlayer() {
    const name = document.getElementById('newPlayerNameAssign').value;
    const age = document.getElementById('newPlayerAgeAssign').value;
    const position = document.getElementById('newPlayerPositionAssign').value;
    if (!name || !age) { showToast("Please provide the player's name and year of birth.", 'error'); return; }
    const btn = document.getElementById('btnCreateAndAssignPlayer');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    btn.disabled = true;
    await squadManager.addPlayer({ name, age, position, squadId: currentSquadId });
    btn.innerHTML = originalText;
    btn.disabled = false;
    closeAllModals();
    viewSquadDetails(currentSquadId);
}

function openMovePlayerModal(playerId) {
    const player = squadManager.getPlayers().find(p => p.id === playerId);
    if (!player) return;
    document.getElementById('movePlayerNameDisplay').textContent = player.name;
    document.getElementById('movePlayerIdInput').value = player.id;
    const select = document.getElementById('movePlayerSquadSelect');
    const otherSquads = squadManager.getSquads().filter(s => s.id !== player.squadId);
    if (otherSquads.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No other squads exist</option>';
        document.getElementById('btnConfirmMovePlayer').disabled = true;
    } else {
        select.innerHTML = otherSquads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        document.getElementById('btnConfirmMovePlayer').disabled = false;
    }
    openModal('modalMovePlayer');
}

async function confirmMovePlayer() {
    const playerId = document.getElementById('movePlayerIdInput').value;
    const newSquadId = document.getElementById('movePlayerSquadSelect').value;
    if (!playerId || !newSquadId) return;
    await squadManager.updatePlayer(playerId, { squadId: newSquadId });
    closeAllModals();
    if (currentSquadId) viewSquadDetails(currentSquadId);
    else renderPlayers();
}

// ═══════════════════════════════════════════════════════════
//  ALL PLAYERS TAB
// ═══════════════════════════════════════════════════════════
function buildPositionSelect(selectId, includeBlank = false) {
    const el = document.getElementById(selectId);
    if (!el || el._posBuilt) return;
    el._posBuilt = true;
    let html = includeBlank ? '<option value="">— None —</option>' : '<option value="">Select...</option>';
    POSITION_GROUPS.forEach(group => {
        html += `<optgroup label="${group.label}">`;
        group.positions.forEach(pos => {
            html += `<option value="${pos.value}">${pos.label}</option>`;
        });
        html += '</optgroup>';
    });
    el.innerHTML = html;
}

function buildPlayerPositionSelects() {
    buildPositionSelect('playerPositionPrimary', false);
    buildPositionSelect('playerPositionSecondary', true);
    buildPositionSelect('playerPositionThird', true);
}

function getPlayerPositionFromSelects() {
    return ['playerPositionPrimary', 'playerPositionSecondary', 'playerPositionThird']
        .map(id => (document.getElementById(id)?.value || '').trim())
        .filter(Boolean)
        .join(', ');
}

function resetPlayerPositionSelects() {
    ['playerPositionPrimary', 'playerPositionSecondary', 'playerPositionThird'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// Year picker instances — stored so we can reset values later
const yearPickers = {};

function populateYearOfBirthSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    // If already enhanced, skip
    if (el._yearPicker) return;
    const currentYear = new Date().getFullYear();
    yearPickers[selectId] = createYearPicker(el, {
        minYear: 1970,
        maxYear: currentYear - 5,
        placeholder: 'Select Year',
    });
}

function populatePlayerSquadSelectors() {
    const squads = squadManager.getSquads();
    const inputSquad = document.getElementById('playerSquadInput');
    if (inputSquad) {
        inputSquad.innerHTML = '<option value="">Not Assigned</option>' + squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
    buildPlayerPositionSelects();
    // Wire up DOB → age badge (only once)
    const dobEl = document.getElementById('playerDobInput');
    if (dobEl && !dobEl._wired) {
        dobEl.addEventListener('change', updateDobAge);
        dobEl._wired = true;
    }
}

function updateSpecificPositionFilter() {
    const groupVal = document.getElementById('filterPositionGroup')?.value || 'all';
    const specificGroup = document.getElementById('filterPositionSpecificGroup');
    const specificSelect = document.getElementById('filterPositionSpecific');

    if (groupVal === 'all' || !POSITION_GROUP_MAP[groupVal]) {
        if (specificGroup) specificGroup.style.visibility = 'hidden';
        if (specificSelect) specificSelect.value = 'all';
    } else {
        if (specificGroup) specificGroup.style.visibility = 'visible';
        if (specificSelect) {
            specificSelect.innerHTML = '<option value="all">All</option>' +
                POSITION_GROUP_MAP[groupVal].map(p => `<option value="${p.value}">${p.label}</option>`).join('');
        }
    }
}

window.setPlayerView = function (mode) {
    playerViewMode = mode;
    document.getElementById('btnListView')?.classList.toggle('active', mode === 'list');
    document.getElementById('btnGridView')?.classList.toggle('active', mode === 'grid');
    renderPlayers();
};

function renderPlayerCard(p) {
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || '';
    return `
        <a href="player-profile.html?id=${p.id}" class="player-card" style="text-decoration:none;color:inherit;">
            ${playerAvatarCard(p)}
            <div class="player-card-name">${p.name}</div>
            <span class="player-card-pos">${p.position || '--'}</span>
            <div class="player-card-stats">
                <div class="player-card-stat"><span>Age</span><strong>${displayAge(p.age)}</strong></div>
                <div class="player-card-stat"><span>Foot</span><strong>${p.foot || '--'}</strong></div>
                ${p.height ? `<div class="player-card-stat"><span>Height</span><strong>${p.height} cm</strong></div>` : ''}
                ${p.weight ? `<div class="player-card-stat"><span>Weight</span><strong>${p.weight} kg</strong></div>` : ''}
            </div>
            ${squadName ? `<div class="player-card-squad-tag"><i class="fas fa-users" style="font-size:0.65rem;margin-right:4px;"></i>${squadName}</div>` : ''}
        </a>`;
}

function renderPlayerRow(p) {
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || 'Unassigned';
    return `
    <tr onclick="location.href='player-profile.html?id=${p.id}'" style="cursor:pointer;">
        <td class="player-name-cell">${playerAvatarSm(p)}${p.name}</td>
        <td>${p.position || '--'}</td>
        <td>${displayAge(p.age)}</td>
        <td>${squadName}</td>
        <td>${p.height ? p.height + ' cm' : '--'}</td>
        <td>${p.weight ? p.weight + ' kg' : '--'}</td>
        <td>${p.foot || '--'}</td>
        <td style="text-align:center;" onclick="event.stopPropagation()">${hasFeature('player_status') ? statusSelectHTML(p) : `<span style="color:#64748b;font-size:.8rem;">${(PLAYER_STATUSES[p.playerStatus || 'active']?.label) || 'Active'}</span>`}</td>
    </tr>`;
}

function renderPlayers() {
    const search = (document.getElementById('playerSearch2')?.value || '').toLowerCase();
    const posGroup = document.getElementById('filterPositionGroup')?.value || 'all';
    const posSpecific = document.getElementById('filterPositionSpecific')?.value || 'all';

    // Coaches see only their assigned squads' players; admins see all
    let players = getVisiblePlayers();

    if (search) players = players.filter(p => {
        const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || '';
        return p.name.toLowerCase().includes(search) || (p.position && p.position.toLowerCase().includes(search)) || squadName.toLowerCase().includes(search);
    });

    if (posSpecific !== 'all') {
        players = players.filter(p => p.position && p.position.split(',').map(s => s.trim()).includes(posSpecific));
    } else if (posGroup !== 'all' && POSITION_GROUP_MAP[posGroup]) {
        const groupCodes = POSITION_GROUP_MAP[posGroup].map(p => p.value);
        players = players.filter(p => { if (!p.position) return false; return p.position.split(',').map(s => s.trim()).some(pp => groupCodes.includes(pp)); });
    }

    // Sort: coach's squad players first, then alphabetical
    players.sort((a, b) => {
        if (_coachSquadIds.size > 0) {
            const aCoach = _coachSquadIds.has(a.squadId) ? 0 : 1;
            const bCoach = _coachSquadIds.has(b.squadId) ? 0 : 1;
            if (aCoach !== bCoach) return aCoach - bCoach;
        }
        return a.name.localeCompare(b.name);
    });

    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.textContent = `${players.length} players found`;

    const isMobile = window.innerWidth <= 768;
    const useGrid = playerViewMode === 'grid' || isMobile;
    const tableWrapper = document.getElementById('playerTableWrapper');
    const gridWrapper = document.getElementById('playerGridWrapper');

    if (useGrid) {
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (gridWrapper) {
            gridWrapper.style.display = 'block';
            gridWrapper.innerHTML = players.length === 0
                ? `<div style="text-align:center; padding:60px; color:var(--text-muted);"><i class="fas fa-search" style="font-size:2rem; opacity:0.4; margin-bottom:12px; display:block;"></i>No players found.</div>`
                : `<div class="player-cards-grid">${players.map(p => renderPlayerCard(p)).join('')}</div>`;
        }
    } else {
        if (gridWrapper) gridWrapper.style.display = 'none';
        if (tableWrapper) tableWrapper.style.display = 'block';
        const tbody = document.getElementById('playerTableBody');
        if (tbody) {
            tbody.innerHTML = players.length === 0
                ? `<tr><td colspan="8" style="text-align:center; padding:60px; color:var(--text-muted);">No players found.</td></tr>`
                : players.map(p => renderPlayerRow(p)).join('');
        }
    }
}

window.deletePlayer = async function (id, event) {
    if (event) event.stopPropagation();
    const confirmed = await squadConfirm('Delete Player', 'Delete this player? This cannot be undone.', 'Delete Player');
    if (!confirmed) return;
    const success = await squadManager.deletePlayer(id);
    if (success) { renderPlayers(); populatePlayerSquadSelectors(); showToast('Player deleted successfully', 'success'); }
};

window.openAssignSquadModal = function (playerId, event) {
    if (event) event.stopPropagation();
    const player = squadManager.players.find(p => String(p.id) === String(playerId));
    if (!player) return;
    document.getElementById('movePlayerNameDisplay').textContent = player.name;
    document.getElementById('movePlayerIdInput').value = playerId;
    const select = document.getElementById('movePlayerSquadSelect');
    if (select) select.innerHTML = squadManager.getSquads().map(s => `<option value="${s.id}"${s.id === player.squadId ? ' selected' : ''}>${s.name}</option>`).join('');
    openModal('modalMovePlayer');
};

async function savePlayer(keepOpen) {
    const name = document.getElementById('playerNameInput').value;
    const dobVal = document.getElementById('playerDobInput').value;
    const age = dobVal ? new Date(dobVal).getFullYear().toString() : '';
    const position = getPlayerPositionFromSelects();
    const squadId = document.getElementById('playerSquadInput').value;
    const height = document.getElementById('playerHeightInput').value;
    const weight = document.getElementById('playerWeightInput').value;
    const foot = document.getElementById('playerFootInput').value;
    const isPC = _isPrivateCoaching();
    const school = isPC
        ? (document.getElementById('playerSchoolInputText')?.value || '')
        : (document.getElementById('playerSchoolInput')?.value || '');
    const newToClub = isPC ? false : (document.getElementById('playerNewToClubInput')?.value === 'true');
    const currentClub = isPC ? (document.getElementById('playerCurrentClubInput')?.value || '') : '';
    const clubInputs = document.querySelectorAll('#playerClubsContainer .club-input');
    const clubs = Array.from(clubInputs).map(i => i.value.trim()).filter(Boolean).join(', ');
    const jerseyNumber = document.getElementById('playerJerseyInput')?.value || '';
    const nationality = document.getElementById('playerNationalityInput')?.value || '';
    const parentName = document.getElementById('playerParentNameInput')?.value || '';
    const parentPhone = document.getElementById('playerParentPhoneInput')?.value || '';
    const parentEmail = document.getElementById('playerParentEmailInput')?.value || '';
    const emergencyContactName = document.getElementById('playerEmergencyNameInput')?.value || '';
    const emergencyContactPhone = document.getElementById('playerEmergencyPhoneInput')?.value || '';
    const medicalInfo = document.getElementById('playerMedicalInput')?.value || '';

    if (!name || !age) { showToast('Name and Date of Birth are required.', 'error'); return; }

    const btn = document.getElementById('btnSavePlayer');
    const anotherBtn = document.getElementById('btnSavePlayerAnother');
    const activeBtn = keepOpen ? anotherBtn : btn;
    if (!activeBtn) return;

    const originalText = activeBtn.textContent;
    activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    activeBtn.disabled = true;

    try {
        // Upload photo if selected
        let profileImageUrl = null;
        const photoFile = window._getPendingPlayerPhoto?.();
        if (photoFile) {
            const ext = photoFile.name.split('.').pop().toLowerCase();
            const filePath = `players/new_${Date.now()}.${ext}`;
            const { data: upData, error: upErr } = await supabase.storage.from('avatars').upload(filePath, photoFile, { cacheControl: '3600', upsert: true, contentType: photoFile.type });
            if (!upErr && upData) {
                const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(upData.path);
                profileImageUrl = publicUrl;
            } else if (upErr) {
                console.warn('Photo upload failed:', upErr);
                showToast('Photo upload failed — player saved without photo', 'warn');
            }
        }

        await squadManager.addPlayer({
            name, age, dateOfBirth: dobVal || null, position, squadId,
            height, weight, foot, previousClubs: clubs, currentClub, school, newToClub,
            jerseyNumber, nationality, joinDate: new Date().toISOString().split('T')[0],
            parentName, parentPhone, parentEmail,
            emergencyContactName, emergencyContactPhone, medicalInfo,
            profileImageUrl,
        });
        document.getElementById('playerNameInput').value = '';
        // Reset DOB input
        document.getElementById('playerDobInput').value = '';
        updateDobAge();
        document.getElementById('playerHeightInput').value = '';
        document.getElementById('playerWeightInput').value = '';
        if (document.getElementById('playerSchoolInputText')) document.getElementById('playerSchoolInputText').value = '';
        if (document.getElementById('playerCurrentClubInput')) document.getElementById('playerCurrentClubInput').value = '';
        ['playerJerseyInput','playerNationalityInput','playerParentNameInput','playerParentPhoneInput','playerParentEmailInput','playerEmergencyNameInput','playerEmergencyPhoneInput','playerMedicalInput'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        window._clearPendingPlayerPhoto?.();
        resetPlayerPositionSelects();
        resetClubEntries();
        if (!keepOpen) { closeAllModals(); } else {
            activeBtn.textContent = 'Saved!';
            setTimeout(() => { activeBtn.textContent = originalText; document.getElementById('playerNameInput').focus(); }, 1000);
        }
        renderPlayers();
        populatePlayerSquadSelectors();
    } catch (err) {
        console.error('Error saving player:', err);
        showToast('Failed to save player. Please try again.', 'error');
    } finally {
        activeBtn.disabled = false;
        if (activeBtn.textContent !== 'Saved!') activeBtn.textContent = originalText;
    }
}

function addClubEntry() {
    const container = document.getElementById('playerClubsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'club-entry';
    div.style.cssText = 'display:flex; gap:8px; margin-bottom:6px;';
    div.innerHTML = `<input type="text" class="form-control-bubble club-input" placeholder="e.g. SuperSport Academy">
        <button type="button" class="dash-btn outline sm btn-remove-club" style="flex-shrink:0; padding:6px 10px;" title="Remove">&times;</button>`;
    container.appendChild(div);
}

function resetClubEntries() {
    const container = document.getElementById('playerClubsContainer');
    if (!container) return;
    container.innerHTML = `<div class="club-entry" style="display:flex; gap:8px; margin-bottom:6px;">
        <input type="text" class="form-control-bubble club-input" placeholder="e.g. SuperSport Academy">
        <button type="button" class="dash-btn outline sm btn-remove-club" style="flex-shrink:0; padding:6px 10px;" title="Remove">&times;</button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  DYNAMIC FILTERS (Squads Tab)
// ═══════════════════════════════════════════════════════════
function renderDynamicFilters() {
    const squads = squadManager.getSquads();

    const leagueSet = new Set();
    squads.forEach(s => {
        if (s.leagues) {
            if (Array.isArray(s.leagues)) s.leagues.forEach(l => leagueSet.add(l));
            else if (typeof s.leagues === 'string') s.leagues.split(',').forEach(l => leagueSet.add(l.trim()));
            else leagueSet.add(s.leagues);
        }
    });

    const leagueSelect = document.getElementById('filterLeague');
    if (leagueSelect) {
        const currentVal = leagueSelect.value;
        leagueSelect.innerHTML = '<option value="all">All Leagues</option>';
        Array.from(leagueSet).sort().forEach(league => {
            if (!league) return;
            const opt = document.createElement('option');
            opt.value = league; opt.textContent = league;
            leagueSelect.appendChild(opt);
        });
        if (leagueSet.has(currentVal)) leagueSelect.value = currentVal;
    }

    const ageGroupSet = new Set();
    squads.forEach(s => { if (s.ageGroup) ageGroupSet.add(s.ageGroup); });

    const ageGroupSelect = document.getElementById('filterAgeGroup');
    if (ageGroupSelect) {
        const currentVal = ageGroupSelect.value;
        ageGroupSelect.innerHTML = '<option value="all">All Age Groups</option>';
        Array.from(ageGroupSet).sort().forEach(ag => {
            if (!ag) return;
            const opt = document.createElement('option');
            opt.value = ag; opt.textContent = ag;
            ageGroupSelect.appendChild(opt);
        });
        if (ageGroupSet.has(currentVal)) ageGroupSelect.value = currentVal;
    }
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
export async function initSquadPlayersUI() {
    console.log('Squad & Players UI: Initializing...');
    ensurePlayerCardStyles();
    applyClubFieldCustomization();

    try {
        await Promise.all([
            squadManager.init(),
            matchManager.init(),
        ]);
        await fetchEnrichmentData();
    } catch (e) {
        console.warn('Manager init:', e);
    }

    // Load coach squad assignments (for ordering + filtering)
    // Private coaching clubs skip scoping — coaches work across all squads
    const profile = window._profile;
    _coachSquadIds = new Set();
    let autoRouted = false;
    if (!_isPrivateCoaching() && (profile?.role === 'coach' || profile?.role === 'viewer')) {
        try {
            const { data: coachSquads } = await supabase
                .from('squad_coaches')
                .select('squad_id')
                .eq('coach_id', profile.id);
            if (coachSquads && coachSquads.length > 0) {
                coachSquads.forEach(sc => _coachSquadIds.add(sc.squad_id));
                if (coachSquads.length <= 2) {
                    viewSquadDetails(coachSquads[0].squad_id);
                    autoRouted = true;
                }
            }
        } catch (e) { console.warn('Coach squad lookup:', e); }
    }

    renderDynamicFilters();
    populatePlayerSquadSelectors();

    // Set total registered player count immediately
    const totalPlayers = getVisiblePlayers().length;
    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.textContent = `${totalPlayers} registered players`;

    // Check hash for players tab redirect
    if (!autoRouted) {
        if (window.location.hash === '#players') {
            switchTab('players');
        } else {
            switchTab('squads');
        }
    }

    // Wire tab buttons
    document.querySelectorAll('.squad-page-tabs .cal-mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSquadId = null;
            switchTab(btn.dataset.tab);
        });
    });

    // Squad controls
    document.getElementById('squadSearch')?.addEventListener('input', renderSquads);
    document.getElementById('filterLeague')?.addEventListener('change', renderSquads);
    document.getElementById('filterAgeGroup')?.addEventListener('change', renderSquads);

    // Player controls
    document.getElementById('playerSearch2')?.addEventListener('input', renderPlayers);
    document.getElementById('filterPositionGroup')?.addEventListener('change', () => { updateSpecificPositionFilter(); renderPlayers(); });
    document.getElementById('filterPositionSpecific')?.addEventListener('change', renderPlayers);

    // Modals
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btnAddSquad')) openModal('modalSquad');
        if (e.target.closest('#btnAddPlayer')) { populatePlayerSquadSelectors(); openModal('modalPlayer'); }
        if (e.target.closest('.btn-move-player')) openMovePlayerModal(e.target.closest('.btn-move-player').getAttribute('data-id'));
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => btn.addEventListener('click', closeAllModals));

    document.getElementById('btnSaveSquad')?.addEventListener('click', saveSquad);
    document.getElementById('btnSaveSquadAssessment')?.addEventListener('click', saveSquadAssessment);
    document.getElementById('btnAssignExistingPlayer')?.addEventListener('click', assignExistingPlayer);
    document.getElementById('btnCreateAndAssignPlayer')?.addEventListener('click', createAndAssignPlayer);
    document.getElementById('btnConfirmMovePlayer')?.addEventListener('click', confirmMovePlayer);
    document.getElementById('btnSavePlayer')?.addEventListener('click', () => savePlayer(false));
    document.getElementById('btnSavePlayerAnother')?.addEventListener('click', () => savePlayer(true));
    document.getElementById('btnAddClubEntry')?.addEventListener('click', addClubEntry);

    // CSV Import
    document.getElementById('csvFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { showToast('CSV must have a header row and at least one player', 'error'); return; }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'player_name' || h === 'fullname' || h === 'full_name');
        if (nameIdx < 0) { showToast('CSV must have a "Name" column', 'error'); return; }

        const field = (row, ...keys) => {
            for (const k of keys) {
                const idx = headers.indexOf(k);
                if (idx >= 0 && row[idx]?.trim()) return row[idx].trim();
            }
            return '';
        };

        const defaultSquadId = document.querySelector('#allPlayersSquadFilter')?.value || '';
        let imported = 0, failed = 0;
        showToast('Importing players...', 'info');

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const name = cols[nameIdx];
            if (!name) continue;

            try {
                const dobStr = field(cols, 'dob', 'date_of_birth', 'dateofbirth', 'birthday');
                const age = dobStr ? new Date(dobStr).getFullYear().toString() : (field(cols, 'age', 'year', 'birth_year') || '');
                await squadManager.addPlayer({
                    name,
                    age,
                    dateOfBirth: dobStr || null,
                    position: field(cols, 'position', 'pos'),
                    squadId: defaultSquadId || null,
                    height: field(cols, 'height', 'height_cm'),
                    weight: field(cols, 'weight', 'weight_kg'),
                    foot: field(cols, 'foot', 'preferred_foot') || 'Right',
                    jerseyNumber: field(cols, 'jersey', 'jersey_number', 'number', 'shirt'),
                    nationality: field(cols, 'nationality', 'nation'),
                    parentName: field(cols, 'parent', 'parent_name', 'guardian'),
                    parentPhone: field(cols, 'parent_phone', 'guardian_phone'),
                    parentEmail: field(cols, 'parent_email', 'guardian_email'),
                    emergencyContactName: field(cols, 'emergency_name', 'emergency_contact'),
                    emergencyContactPhone: field(cols, 'emergency_phone'),
                    school: field(cols, 'school'),
                    joinDate: new Date().toISOString().split('T')[0],
                });
                imported++;
            } catch (err) {
                console.warn(`Failed to import "${name}":`, err);
                failed++;
            }
        }

        showToast(`Imported ${imported} players${failed > 0 ? ` (${failed} failed)` : ''}`, imported > 0 ? 'success' : 'error');
        if (imported > 0) {
            await squadManager.init();
            renderSquads();
            renderAllPlayers();
        }
    });

    // Photo preview for add player
    let _pendingPlayerPhoto = null;
    document.getElementById('addPlayerPhotoInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { showToast('Photo must be under 2 MB', 'error'); return; }
        _pendingPlayerPhoto = file;
        const url = URL.createObjectURL(file);
        const preview = document.getElementById('addPlayerPhotoPreview');
        if (preview) preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    });
    window._getPendingPlayerPhoto = () => _pendingPlayerPhoto;
    window._clearPendingPlayerPhoto = () => {
        _pendingPlayerPhoto = null;
        const preview = document.getElementById('addPlayerPhotoPreview');
        if (preview) preview.innerHTML = '<i class="fas fa-camera" style="font-size:1.2rem;color:var(--text-muted);"></i>';
        const input = document.getElementById('addPlayerPhotoInput');
        if (input) input.value = '';
    };

    // Club entry remove
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-club')) {
            const entry = e.target.closest('.club-entry');
            const container = document.getElementById('playerClubsContainer');
            if (entry && container && container.children.length > 1) entry.remove();
            else if (entry) { const input = entry.querySelector('.club-input'); if (input) input.value = ''; }
        }
    });

    // Coach row management
    const btnAddCoach = document.getElementById('btnAddCoachRow');
    if (btnAddCoach) { btnAddCoach.addEventListener('click', addCoachRow); addCoachRow(); }

    // Resize handler
    window.addEventListener('resize', () => {
        if (currentSquadId && document.getElementById('squadDetailView')?.style.display !== 'none') {
            if (window.innerWidth <= 768 && squadDetailViewMode !== 'grid') setSquadPlayerView('grid');
        }
        if (activeTab === 'players' && window.innerWidth <= 768 && playerViewMode !== 'grid') {
            playerViewMode = 'grid';
            document.getElementById('btnListView')?.classList.remove('active');
            document.getElementById('btnGridView')?.classList.add('active');
            renderPlayers();
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  SQUAD DOSSIER SHARE
// ═══════════════════════════════════════════════════════════

window.openSquadShareModal = async function(squadId) {
    const modal = document.getElementById('modalSquadShare');
    if (!modal) return;

    const generating = document.getElementById('squadShareGenerating');
    const ready      = document.getElementById('squadShareReady');
    const linkInput  = document.getElementById('squadShareLinkInput');

    if (generating) generating.style.display = 'flex';
    if (ready) ready.style.display = 'none';
    modal.style.display = 'flex';

    // Store squad id for revoke
    modal.dataset.squadId = squadId;

    // Check if squad already has a share token
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    let shareToken = squad?.share_token || null;

    // Generate token if needed
    if (!shareToken) {
        shareToken = crypto.randomUUID();
        const { error } = await supabase
            .from('squads')
            .update({ share_token: shareToken })
            .eq('id', squadId);
        if (error) {
            showToast('Failed to generate share link', 'error');
            modal.style.display = 'none';
            return;
        }
        // Update local manager cache
        if (squad) squad.share_token = shareToken;
    }

    const link = `${window.location.origin}/src/pages/squad-dossier.html?token=${shareToken}`;
    if (linkInput) linkInput.value = link;
    if (generating) generating.style.display = 'none';
    if (ready) ready.style.display = 'block';
};

window.copySquadDossierLink = function() {
    const input = document.getElementById('squadShareLinkInput');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Link copied to clipboard', 'success');
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('Link copied', 'success');
    });
};

window.openSquadDossierTab = function() {
    const input = document.getElementById('squadShareLinkInput');
    if (input?.value) window.open(input.value, '_blank');
};

window.revokeSquadDossierLink = async function() {
    const modal   = document.getElementById('modalSquadShare');
    const squadId = modal?.dataset.squadId;
    if (!squadId) return;
    if (!confirm('Revoke this share link? Anyone with the link will lose access immediately.')) return;

    const { error } = await supabase
        .from('squads')
        .update({ share_token: null })
        .eq('id', squadId);

    if (error) { showToast('Failed to revoke link', 'error'); return; }

    // Clear local cache
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (squad) squad.share_token = null;

    showToast('Share link revoked', 'success');
    if (modal) modal.style.display = 'none';
};
