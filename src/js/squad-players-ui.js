/**
 * Squad & Players — Merged UI
 * Combines squad-ui.js + player-ui.js into one tabbed page
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { createYearPicker } from './year-picker.js';

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
        // Leaderboard for private_coaching clubs
        const archetype = window._profile?.clubs?.settings?.archetype;
        if (archetype === 'private_coaching') {
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

                // Map player_id → name + squadId
                const allPlayers = squadManager.getPlayers({});
                const playerMap = {};
                allPlayers.forEach(p => { playerMap[p.id] = p; });

                // Group by squad
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
window.viewSquadDetails = viewSquadDetails;
function viewSquadDetails(squadId) {
    const isUnassigned = squadId === 'unassigned';
    const squad = isUnassigned ? { name: 'Unassigned', ageGroup: '' } : squadManager.getSquads().find(s => s.id === squadId);
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

    document.getElementById('detailSquadName').textContent = squad.name;
    document.getElementById('detailSquadMeta').textContent = isUnassigned
        ? `${players.length} Players`
        : `${squad.ageGroup || ''} \u2022 ${players.length} Players`;

    const btnAssess = document.getElementById('btnAssessSquad');
    const btnAssign = document.getElementById('btnAssignPlayerModal');
    if (btnAssess) btnAssess.style.display = isUnassigned ? 'none' : '';
    if (btnAssign) btnAssign.style.display = isUnassigned ? 'none' : '';

    let toggleArea = document.getElementById('squadDetailToggle');
    if (!toggleArea) {
        const backBtn = sheet.querySelector('#btnBackToSquads');
        if (backBtn && backBtn.parentElement) {
            const toggleHtml = `<div id="squadDetailToggle" class="view-toggle-group">
                <button class="view-toggle-btn ${squadDetailViewMode === 'list' ? 'active' : ''}" id="sdBtnList" title="List View" onclick="setSquadPlayerView('list')"><i class="fas fa-list"></i></button>
                <button class="view-toggle-btn ${squadDetailViewMode === 'grid' ? 'active' : ''}" id="sdBtnGrid" title="Grid View" onclick="setSquadPlayerView('grid')"><i class="fas fa-th-large"></i></button>
            </div>`;
            backBtn.parentElement.insertAdjacentHTML('beforeend', toggleHtml);
        }
    } else {
        document.getElementById('sdBtnList')?.classList.toggle('active', squadDetailViewMode === 'list');
        document.getElementById('sdBtnGrid')?.classList.toggle('active', squadDetailViewMode === 'grid');
    }

    // Squad delete button in detail view (below toggle, visible for admins)
    let delBtn = document.getElementById('squadDetailDeleteBtn');
    if (!delBtn && !isUnassigned) {
        const backRow = sheet.querySelector('#btnBackToSquads')?.parentElement;
        if (backRow) {
            backRow.insertAdjacentHTML('beforeend',
                `<button id="squadDetailDeleteBtn" class="btn-icon-soft delete-squad-btn" data-min-role="admin"
                    onclick="event.stopPropagation(); deleteSquad('${squadId}')"
                    title="Delete Squad" style="margin-left:auto;">
                    <i class="fas fa-trash-alt"></i>
                </button>`);
        }
    } else if (delBtn) {
        delBtn.style.display = isUnassigned ? 'none' : '';
        delBtn.setAttribute('onclick', `event.stopPropagation(); deleteSquad('${squadId}')`);
    }

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
                    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">No players in this squad yet.</td></tr>`;
                } else {
                    let html = '';
                    grouped.forEach(group => {
                        html += `<tr class="squad-group-header-row"><td colspan="7"><span class="squad-group-label">${group.label}</span><span class="squad-group-count">${group.players.length}</span></td></tr>`;
                        html += group.players.map(p => renderSquadPlayerRow(p)).join('');
                    });
                    tbody.innerHTML = html;
                }
            }
        }
    }
}

function renderSquadPlayerCard(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    return `
        <a href="player-profile.html?id=${p.id}" class="player-card" style="text-decoration:none;color:inherit;">
            <div class="player-card-avatar">${initials}</div>
            <div class="player-card-name">${p.name}</div>
            <span class="player-card-pos">${p.position || '--'}</span>
            <div class="player-card-stats">
                <div class="player-card-stat"><span>Age</span><strong>${displayAge(p.age)}</strong></div>
                <div class="player-card-stat"><span>Foot</span><strong>${p.foot || '--'}</strong></div>
                ${p.height ? `<div class="player-card-stat"><span>Height</span><strong>${p.height} cm</strong></div>` : ''}
                ${p.weight ? `<div class="player-card-stat"><span>Weight</span><strong>${p.weight} kg</strong></div>` : ''}
            </div>
        </a>`;
}

function renderSquadPlayerRow(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    return `
    <tr>
        <td class="player-name-cell"><div class="avatar-sm">${initials}</div>${p.name}</td>
        <td>${p.position || '--'}</td>
        <td>${displayAge(p.age)}</td>
        <td>${p.height ? p.height + ' cm' : '--'}</td>
        <td>${p.weight ? p.weight + ' kg' : '--'}</td>
        <td>${p.foot || '--'}</td>
        <td>
            <a href="player-profile.html?id=${p.id}" class="dash-btn outline sm" style="white-space:nowrap;"><i class="fas fa-external-link-alt"></i> Profile</a>
        </td>
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
function deleteSquad(id) {
    if (!confirm('Delete this squad? Players will become unassigned.')) return;
    squadManager.deleteSquad(id).then(success => {
        if (success) {
            renderSquads();
            renderDynamicFilters();
            showToast('Squad deleted successfully', 'success');
        }
    });
}

window.deleteSquadPlayer = function (playerId, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this player? This cannot be undone.')) return;
    squadManager.deletePlayer(playerId).then(success => {
        if (success) {
            showToast('Player deleted', 'success');
            if (currentSquadId) viewSquadDetails(currentSquadId);
        }
    });
};

window.removePlayerFromSquad = function (playerId) {
    if (!confirm('Remove this player from the squad? (Player will NOT be deleted, just unassigned.)')) return;
    squadManager.updatePlayer(playerId, { squadId: '' }).then(() => {
        showToast('Player removed from squad.', 'success');
        viewSquadDetails(currentSquadId);
    });
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
    if (!name || !age) { alert("Please provide the player's name and year of birth."); return; }
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
function buildMultiSelectPositions(triggerId, optionsId) {
    const trigger = document.getElementById(triggerId);
    const optionsContainer = document.getElementById(optionsId);
    if (!trigger || !optionsContainer) return;

    let html = '';
    POSITION_GROUPS.forEach(group => {
        html += `<div class="multi-select-group-label">${group.label}</div>`;
        group.positions.forEach(pos => {
            html += `<label class="multi-select-option"><input type="checkbox" value="${pos.value}" data-label="${pos.label}"> ${pos.label}</label>`;
        });
    });
    optionsContainer.innerHTML = html;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsContainer.style.display = optionsContainer.style.display !== 'none' ? 'none' : 'block';
    });

    optionsContainer.addEventListener('change', () => {
        const checked = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
        trigger.textContent = checked.length > 0 ? Array.from(checked).map(cb => cb.value).join(', ') : 'Select position(s)...';
    });

    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !optionsContainer.contains(e.target)) optionsContainer.style.display = 'none';
    });
}

function getSelectedPositions(optionsId) {
    const container = document.getElementById(optionsId);
    if (!container) return '';
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value).join(', ');
}

function setSelectedPositions(optionsId, triggerId, positionString) {
    const container = document.getElementById(optionsId);
    const trigger = document.getElementById(triggerId);
    if (!container) return;
    const values = positionString ? positionString.split(',').map(s => s.trim()) : [];
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = values.includes(cb.value); });
    if (trigger) trigger.textContent = values.length > 0 ? values.join(', ') : 'Select position(s)...';
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
    buildMultiSelectPositions('playerPositionTrigger', 'playerPositionOptions');
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
    const initials = p.name.substring(0, 2).toUpperCase();
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || '';
    return `
        <a href="player-profile.html?id=${p.id}" class="player-card" style="text-decoration:none;color:inherit;">
            <div class="player-card-avatar">${initials}</div>
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
    const initials = p.name.substring(0, 2).toUpperCase();
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || 'Unassigned';
    return `
    <tr>
        <td class="player-name-cell"><div class="avatar-sm">${initials}</div>${p.name}</td>
        <td>${p.position || '--'}</td>
        <td>${displayAge(p.age)}</td>
        <td>${squadName}</td>
        <td>${p.height ? p.height + ' cm' : '--'}</td>
        <td>${p.weight ? p.weight + ' kg' : '--'}</td>
        <td>${p.foot || '--'}</td>
        <td>
            <a href="player-profile.html?id=${p.id}" class="dash-btn outline sm" style="white-space:nowrap;"><i class="fas fa-external-link-alt"></i> Profile</a>
        </td>
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

window.deletePlayer = function (id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this player? This cannot be undone.')) return;
    squadManager.deletePlayer(id).then(success => {
        if (success) { renderPlayers(); populatePlayerSquadSelectors(); showToast('Player deleted successfully', 'success'); }
    });
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
    const position = getSelectedPositions('playerPositionOptions');
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

    if (!name || !age) { alert("Name and Date of Birth are required."); return; }

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
        setSelectedPositions('playerPositionOptions', 'playerPositionTrigger', '');
        resetClubEntries();
        if (!keepOpen) { closeAllModals(); } else {
            activeBtn.textContent = 'Saved!';
            setTimeout(() => { activeBtn.textContent = originalText; document.getElementById('playerNameInput').focus(); }, 1000);
        }
        renderPlayers();
        populatePlayerSquadSelectors();
    } catch (err) {
        console.error('Error saving player:', err);
        alert('Failed to save player. Please try again.');
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
    document.getElementById('btnAssessSquad')?.addEventListener('click', openSquadAssessmentModal);
    document.getElementById('btnSaveSquadAssessment')?.addEventListener('click', saveSquadAssessment);
    document.getElementById('btnAssignPlayerModal')?.addEventListener('click', openAssignPlayerModal);
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

    // Back button
    document.getElementById('btnBackToSquads')?.addEventListener('click', () => {
        currentSquadId = null;
        switchTab('squads');
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
