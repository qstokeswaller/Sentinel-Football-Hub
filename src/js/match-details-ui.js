/**
 * Match Details UI Logic
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';

export async function initMatchDetailsUI() {
    // 1. Initialize UI Elements & Listeners (Must happen first so buttons work)
    const btnToggle = document.getElementById('btnToggleEdit');
    const btnSave = document.getElementById('btnSaveStats');
    const displayMode = document.getElementById('displayMode');
    const editMode = document.getElementById('editMode');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const isEditing = editMode.style.display === 'block';
            if (isEditing) {
                // Cancel edit
                editMode.style.display = 'none';
                displayMode.style.display = 'block';
                btnSave.style.display = 'none';
                btnToggle.innerHTML = '<i class="fas fa-edit"></i> Edit';
            } else {
                // Start edit
                editMode.style.display = 'block';
                displayMode.style.display = 'none';
                btnSave.style.display = 'inline-flex';
                btnToggle.innerHTML = '<i class="fas fa-times"></i> Cancel';
            }
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const params = new URLSearchParams(window.location.search);
            const mid = params.get('id');
            if (mid) saveStats(mid);
        });
    }

    // Initialize Rich Text Editors
    setupRichTextEditors();

    // 2. Data Loading
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');

    if (!matchId) {
        window.location.href = 'matches.html';
        return;
    }

    // Initialize Managers
    try {
        await Promise.all([
            matchManager.init(),
            squadManager.init()
        ]);

        const match = await matchManager.getMatch(matchId);
        if (!match) {
            console.error('Match not found after init for id:', matchId);
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.innerHTML = '<div style="text-align:center;padding:80px 20px;color:var(--text-secondary);"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:16px;display:block;color:#ef4444;"></i><p style="font-size:1.1rem;margin-bottom:16px;">Match not found. It may have been deleted.</p><a href="matches.html" class="dash-btn primary">Back to Matches</a></div>';
            return;
        }
        window._matchData = match; // Store globally for downloadReportPDF

        // Adapt UI for player watch matches
        if (match.matchType === 'player_watch') {
            adaptForPlayerWatch(match);
        }

        renderMatchInfo(match);
        renderStatsDisplay(match.stats || {});
        renderReportDisplay(match.stats || {}, match);
        fillEditForm(match);
        await Promise.all([
            loadAndRenderPlayerStats(match),
            loadAndRenderMatchPlan(match),
        ]);

        // 3. Handle Auto-Download (Print from Match Reports hub)
        if (params.get('download') === 'true') {
            // Give a tiny delay for rendering to settle (rich text editors etc)
            setTimeout(() => {
                downloadReportPDF();
            }, 800);
        }

    } catch (err) {
        console.error("Error loading match data:", err);
    }
}

function setupRichTextEditors() {
    document.querySelectorAll('.toolbar button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (cmd === 'createLink') {
                const url = prompt('Enter the link here: ', 'http://');
                document.execCommand(cmd, false, url);
            } else {
                document.execCommand(cmd, false, null);
            }
        });
    });
}

function resolveTeamNames(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;

    // Helper to get squad name
    const getSquadName = (sid) => {
        const squad = squadManager.getSquad(sid);
        return squad ? squad.name : 'UP Performance';
    };

    // Fallback for legacy data or missing explicit sides
    if (!home || !away) {
        const squadName = getSquadName(m.squadId);
        // Default to Squad on LEFT unless explicitly marked as 'away'
        if (m.ourSide === 'away') {
            home = m.opponent || 'Home Team';
            away = squadName;
        } else {
            home = squadName;
            away = m.opponent || 'Away Team';
        }
    }
    return { home, away };
}

function adaptForPlayerWatch(match) {
    // Hide team stat comparison bars — not relevant for individual player observation
    const statsListView = document.getElementById('statsListView');
    if (statsListView) statsListView.style.display = 'none';

    // Hide team stats edit form (home/away stat inputs)
    const statsForm = document.getElementById('matchStatsForm');
    if (statsForm) statsForm.style.display = 'none';

    // Resolve watched player name
    let watchedName = '';
    if (match.watchedPlayerId) {
        const allPlayers = squadManager.getPlayers({});
        const wp = allPlayers.find(p => String(p.id) === String(match.watchedPlayerId));
        watchedName = wp ? wp.name : '';
    }

    // Add Player Watch badge to header
    const headerInfo = document.querySelector('.page-header .header-info p');
    if (headerInfo) {
        headerInfo.innerHTML = `<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-right:8px;"><i class="fas fa-eye" style="margin-right:4px;"></i>Player Watch</span> ${watchedName ? 'Observing: <strong>' + watchedName + '</strong>' : 'Individual player observation'}`;
    }
}

function renderMatchInfo(match) {
    const { home: homeName, away: awayName } = resolveTeamNames(match);
    const homeScore = match.homeScore !== undefined ? match.homeScore : 0;
    const awayScore = match.awayScore !== undefined ? match.awayScore : 0;

    document.title = `${homeName} vs ${awayName} | UP Performance`;

    // Update labels (Optional: only if elements exist)
    const homeEl = document.getElementById('matchHomeTeamHeader');
    const awayEl = document.getElementById('matchAwayTeamHeader');
    if (homeEl) homeEl.textContent = homeName;
    if (awayEl) awayEl.textContent = awayName;

    const scoreEl = document.getElementById('matchScore');
    if (scoreEl) scoreEl.textContent = `${homeScore} - ${awayScore}`;

    const metaEl = document.getElementById('matchMeta');
    if (metaEl) metaEl.textContent = `${match.date || 'TBD'} \u2022 ${match.venue || 'Venue TBD'}`;

    const compEl = document.getElementById('matchComp');
    if (compEl) compEl.textContent = match.competition || 'Competition';
}

function renderStatsDisplay(stats) {
    const list = document.getElementById('statsListView');
    if (!list) return;
    const items = [
        { label: 'Goals', key: 'goals', max: 5 },
        { label: 'Shots', key: 'shots', max: 25 },
        { label: 'Shots on Target', key: 'shotsOnTarget', max: 15 },
        { label: 'Corners', key: 'corners', max: 15 },
        { label: 'Fouls', key: 'fouls', max: 20 },
        { label: 'Yellow Cards', key: 'yellowCards', max: 6 },
        { label: 'Red Cards', key: 'redCards', max: 2 }
    ];

    // Handle migration/fallback if 'home' missing
    const homeStats = stats.home || stats;
    const awayStats = stats.away || { possession: 0, xG: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 };

    list.innerHTML = items.map(item => {
        const hVal = homeStats[item.key] || 0;
        const aVal = awayStats[item.key] || 0;

        const hPct = Math.min((hVal / item.max) * 100, 100);
        const aPct = Math.min((aVal / item.max) * 100, 100);

        return `
            <div class="stat-row-comparison" style="margin-bottom: 24px;">
                <div class="stat-label" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; color: var(--text-secondary);">
                    <span style="color: var(--navy-dark);">${hVal}${item.suffix || ''}</span>
                    <span style="text-transform: uppercase; font-size: 0.85rem;">${item.label}</span>
                    <span style="color: var(--text-secondary);">${aVal}${item.suffix || ''}</span>
                </div>
                <div class="stat-bar-bg" style="display: flex; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; gap: 2px;">
                    <div style="flex: 1; display: flex; justify-content: flex-end; background: #f1f5f9;">
                         <div style="width: ${hPct}%; background: var(--navy-dark); height: 100%; border-radius: 5px 0 0 5px;"></div>
                    </div>
                    <div style="width: 2px; background: #fff;"></div>
                    <div style="flex: 1; display: flex; justify-content: flex-start; background: #f1f5f9;">
                         <div style="width: ${aPct}%; background: #94a3b8; height: 100%; border-radius: 0 5px 5px 0;"></div>
                    </div>
                </div>
                </div>
            </div>
        `;
    }).join('');
}

function downloadReportPDF() {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('matchReportSection');
    if (!element) return;

    const match = window._matchData || {};
    console.log('Starting PDF Export for match:', match?.id);
    if (match && match.stats) {
        console.log('Match Stats found for PDF:', Object.keys(match.stats));
    } else {
        console.warn('No stats found in window._matchData for PDF generation');
    }

    const { home: homeName, away: awayName } = resolveTeamNames(match);
    const hScore = match.homeScore !== undefined ? match.homeScore : 0;
    const aScore = match.awayScore !== undefined ? match.awayScore : 0;
    const matchScore = `${hScore} - ${aScore}`;
    const matchMeta = document.getElementById('matchMeta')?.textContent || match.date || '';

    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const contentW = PW - (margin * 2);

    // Branded Header
    doc.setFillColor(30, 58, 138); // Navy
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MATCH ANALYSIS REPORT', margin, 25);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`UP PERFORMANCE HUB \u00b7 ${matchMeta}`, margin, 33);

    let y = 55;

    // Scoreline Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${homeName} vs ${awayName}`, PW / 2, y + 12, { align: 'center' });
    doc.setFontSize(18);
    doc.text(matchScore, PW / 2, y + 22, { align: 'center' });

    y += 45;

    // Stats Selection
    const stats = match.stats || {};
    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};
    const statItems = [
        { label: 'Possession', key: 'possession', suffix: '%' },
        { label: 'Shots', key: 'shots' },
        { label: 'Shots on Target', key: 'shotsOnTarget' },
        { label: 'Expected Goals (xG)', key: 'xG' },
        { label: 'Corners', key: 'corners' }
    ];

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('KEY STATISTICS', margin, y);
    y += 10;

    statItems.forEach(item => {
        const hVal = homeStats[item.key] || 0;
        const aVal = awayStats[item.key] || 0;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label, PW / 2, y, { align: 'center' });

        doc.setFontSize(12);
        doc.setTextColor(40);
        doc.setFont('helvetica', 'bold');
        doc.text(String(hVal) + (item.suffix || ''), margin, y);
        doc.text(String(aVal) + (item.suffix || ''), PW - margin, y, { align: 'right' });

        // Horizontal bar comparison
        y += 4;
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, contentW, 2, 'F');

        const total = (parseFloat(hVal) || 0) + (parseFloat(aVal) || 0) || 1;
        const hWidth = (parseFloat(hVal) || 0) / total * contentW;
        doc.setFillColor(30, 58, 138);
        doc.rect(margin, y, hWidth, 2, 'F');

        y += 12;
    });

    // Tactical Notes
    const tacticalPhases = [
        { title: 'In Possession', content: stats.tactical_in_possession },
        { title: 'Out of Possession', content: stats.tactical_out_possession },
        { title: 'Transitions', content: stats.tactical_transitions },
        { title: 'Set Pieces', content: stats.tactical_set_pieces }
    ];

    tacticalPhases.forEach(phase => {
        if (phase.content && phase.content.trim()) {
            if (y > 240) { doc.addPage(); y = 20; }

            y += 8;
            doc.setFontSize(12);
            doc.setTextColor(30, 58, 138);
            doc.setFont('helvetica', 'bold');
            doc.text(phase.title.toUpperCase(), margin, y);
            y += 6;

            doc.setFontSize(10);
            doc.setTextColor(60);
            doc.setFont('helvetica', 'normal');
            const splitContent = doc.splitTextToSize(phase.content.replace(/<[^>]*>/g, ''), contentW);
            doc.text(splitContent, margin, y);
            y += (splitContent.length * 5) + 5;
        }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated on ${new Date().toLocaleString()} | UP Performance Hub`, PW / 2, 285, { align: 'center' });

    const filename = `Match_Report_${homeName}_vs_${awayName}_${match.date || ''}.pdf`.replace(/\s+/g, '_');

    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`PDF Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('PDF Save failed:', err);
    }
}
window.downloadReportPDF = downloadReportPDF;

function fillEditForm(match) {
    const stats = match.stats || {};
    const form = document.getElementById('matchStatsForm');
    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};

    // Dynamic Headers
    const { home: homeName, away: awayName } = resolveTeamNames(match);

    // Helper to safely set text
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('editHomeName', homeName);
    setText('editOpponentName', awayName);
    setText('editLineupHomeName', homeName);
    setText('editLineupAwayName', awayName);

    // Standard Stats
    const keys = ['goals', 'shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'];
    keys.forEach(key => {
        let hVal = homeStats[key];
        let aVal = awayStats[key];

        if (key === 'goals') {
            hVal = match.homeScore !== undefined ? match.homeScore : (hVal || 0);
            aVal = match.awayScore !== undefined ? match.awayScore : (aVal || 0);
        }

        if (form.elements[`home_${key}`]) form.elements[`home_${key}`].value = hVal || 0;
        if (form.elements[`away_${key}`]) form.elements[`away_${key}`].value = aVal || 0;
    });

    // Populate Rich Text Editors
    const phases = [
        { id: 'editor_timeline', key: 'tactical_timeline' },
        { id: 'editor_in_possession', key: 'tactical_in_possession' },
        { id: 'editor_out_possession', key: 'tactical_out_possession' },
        { id: 'editor_transitions', key: 'tactical_transitions' },
        { id: 'editor_set_pieces', key: 'tactical_set_pieces' }
    ];

    phases.forEach(phase => {
        const editor = document.getElementById(phase.id);
        if (editor) {
            editor.innerHTML = stats[phase.key] || '';
        }
    });
}


async function saveStats(matchId) {
    const form = document.getElementById('matchStatsForm');
    const formData = new FormData(form);

    // 1. Capture Tactical Phases from Rich Text Editors
    const getEditorContent = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const text = el.innerText ? el.innerText.trim() : '';
        return text.length > 0 ? el.innerHTML : null;
    };

    const newStats = {
        home: {},
        away: {}
    };

    // Only include tactical keys with actual content
    const tacticalFields = [
        { key: 'tactical_timeline', id: 'editor_timeline' },
        { key: 'tactical_in_possession', id: 'editor_in_possession' },
        { key: 'tactical_out_possession', id: 'editor_out_possession' },
        { key: 'tactical_transitions', id: 'editor_transitions' },
        { key: 'tactical_set_pieces', id: 'editor_set_pieces' }
    ];

    tacticalFields.forEach(({ key, id }) => {
        const content = getEditorContent(id);
        if (content !== null) {
            newStats[key] = content;
        }
    });

    // Match Summary
    const summaryEl = document.getElementById('matchSummaryEdit');
    if (summaryEl) {
        newStats.match_summary = summaryEl.value.trim();
    }

    // 2. Capture Stats (skip for player watch — no team stats form)
    const match = window._matchData;
    const isPlayerWatch = match?.matchType === 'player_watch';

    const keys = ['goals', 'shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'];
    if (!isPlayerWatch) {
        keys.forEach(key => {
            newStats.home[key] = Number(formData.get(`home_${key}`)) || 0;
            newStats.away[key] = Number(formData.get(`away_${key}`)) || 0;
        });
    }

    // 3. Update Match Score (Result) based on Goals
    const homeScore = isPlayerWatch ? (match.homeScore || 0) : newStats.home.goals;
    const awayScore = isPlayerWatch ? (match.awayScore || 0) : newStats.away.goals;
    let result = 'Draw';
    if (homeScore > awayScore) result = 'Win';
    if (homeScore < awayScore) result = 'Loss';

    console.log('saveStats: Saving to DB with stats keys:', Object.keys(newStats));

    try {
        // Update Info (Score/Result)
        await matchManager.updateMatchInfo(matchId, {
            homeScore,
            awayScore,
            result
        });

        // Update Stats
        await matchManager.updateMatchStats(matchId, newStats);

        // Save Player Stats
        const playerStatsArray = collectPlayerStatsFromForm();
        if (playerStatsArray.length > 0) {
            await matchManager.saveMatchPlayerStats(matchId, playerStatsArray);
        }

        // Update Match Notes for sync with Reports Hub if empty
        const isTacticalFilled = !!(newStats.tactical_timeline || newStats.tactical_in_possession ||
            newStats.tactical_out_possession || newStats.tactical_transitions ||
            newStats.tactical_set_pieces);

        const currentMatch = await matchManager.getMatch(matchId);
        if (currentMatch && isTacticalFilled && (!currentMatch.notes || currentMatch.notes === 'No notes provided.')) {
            await matchManager.updateMatchInfo(matchId, { notes: 'Report filled via tactical analysis.' });
        }

        // Re-fetch fresh from API to guarantee display matches what is persisted in DB
        await matchManager.init();
        const updatedMatch = await matchManager.getMatch(matchId);
        if (!updatedMatch) {
            console.error('Could not reload match after save -- matchId:', matchId);
            return;
        }
        console.log('Match saved & re-fetched from API. Tactical keys in DB:',
            Object.keys(updatedMatch.stats || {}).filter(k => k.startsWith('tactical_')));

        // Sync the global _matchData used by PDF generator
        window._matchData = updatedMatch;

        renderMatchInfo(updatedMatch);
        renderStatsDisplay(updatedMatch.stats || {});
        renderReportDisplay(updatedMatch.stats || {}, updatedMatch);
        fillEditForm(updatedMatch);
        await loadAndRenderPlayerStats(updatedMatch);

        // Switch back to display
        document.getElementById('editMode').style.display = 'none';
        document.getElementById('displayMode').style.display = 'block';
        document.getElementById('btnSaveStats').style.display = 'none';
        document.getElementById('btnToggleEdit').innerHTML = '<i class="fas fa-edit"></i> Edit';

        showToast('Match report saved successfully!', 'success');

    } catch (error) {
        console.error("Error saving stats:", error);
        showToast('Failed to save. Please try again.', 'error');
    }
}

function renderReportDisplay(stats, match) {
    // Update team name headers in the view-mode lineup section
    if (match) {
        const { home: homeName, away: awayName } = resolveTeamNames(match);
        const homeTitle = document.getElementById('viewLineupHomeTitle');
        const awayTitle = document.getElementById('viewLineupAwayTitle');
        const statsHomeName = document.getElementById('viewStatsHomeName');
        const statsAwayName = document.getElementById('viewStatsAwayName');
        if (homeTitle) homeTitle.textContent = homeName;
        if (awayTitle) awayTitle.textContent = awayName;
        if (statsHomeName) statsHomeName.textContent = homeName;
        if (statsAwayName) statsAwayName.textContent = awayName;
    }

    // Helper to render phase content
    const renderPhase = (elementId, content) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (content && content.trim() && content !== 'No notes provided.') {
            el.innerHTML = content.replace(/\n/g, '<br>');
            el.style.color = 'var(--navy-dark)';
        } else {
            el.innerHTML = '<em style="color: var(--text-secondary);">No notes added.</em>';
        }
    };

    renderPhase('viewPhaseTimeline', stats.tactical_timeline);
    renderPhase('viewPhaseInPossession', stats.tactical_in_possession);
    renderPhase('viewPhaseOutPossession', stats.tactical_out_possession);
    renderPhase('viewPhaseTransitions', stats.tactical_transitions);
    renderPhase('viewPhaseSetPieces', stats.tactical_set_pieces);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER PERFORMANCE STATS
// ═══════════════════════════════════════════════════════════════════════════════

const RATING_LABELS = ['', 'Poor', 'Below Avg', 'Average', 'Above Avg', 'Excellent'];
const APPEARANCE_OPTIONS = [
    { value: '', label: 'Not in Squad' },
    { value: 'started', label: 'Started' },
    { value: 'sub', label: 'Substitute' }
];

// Position grouping for sorting
const POSITION_GROUP_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3, '': 4 };
function getPositionGroup(pos) {
    if (!pos) return '';
    const p = pos.toUpperCase().trim().split(/[,/]/)[0].trim();
    if (p.includes('GK') || p.includes('GOAL')) return 'GK';
    if (p.includes('CB') || p.includes('LB') || p.includes('RB') || p.includes('DEF') || p.includes('BACK') || p.includes('LWB') || p.includes('RWB')) return 'DEF';
    if (p.includes('MID') || p.includes('CM') || p.includes('CDM') || p.includes('CAM') || p.includes('DM') || p.includes('AM') || p.includes('LM') || p.includes('RM')) return 'MID';
    if (p.includes('FWD') || p.includes('ST') || p.includes('CF') || p.includes('LW') || p.includes('RW') || p.includes('WING') || p.includes('STRIKE') || p.includes('ATT')) return 'FWD';
    return '';
}
const POSITION_GROUP_LABELS = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', '': 'Other' };
const CAUTION_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'yellow', label: 'Yellow Card' },
    { value: '2yellow', label: 'Two Yellows' },
    { value: 'red', label: 'Straight Red' }
];

function appearanceFromStat(s) {
    if (!s || !s.appeared) return '';
    if (s.started) return 'started';
    return 'sub';
}

function statFromAppearance(val, minutesPlayed = 0) {
    switch (val) {
        case 'started': return { appeared: true, started: true, minutesPlayed: minutesPlayed || 90 };
        case 'sub':     return { appeared: true, started: false, minutesPlayed: minutesPlayed || 0 };
        default:        return { appeared: false, started: false, minutesPlayed: 0 };
    }
}

function cautionFromStat(s) {
    if (!s) return '';
    if (s.redCards >= 1 && s.yellowCards === 0) return 'red';
    if (s.yellowCards >= 2) return '2yellow';
    if (s.yellowCards >= 1) return 'yellow';
    return '';
}

function statFromCaution(val) {
    switch (val) {
        case 'yellow':  return { yellowCards: 1, redCards: 0 };
        case '2yellow': return { yellowCards: 2, redCards: 1 };
        case 'red':     return { yellowCards: 0, redCards: 1 };
        default:        return { yellowCards: 0, redCards: 0 };
    }
}

async function loadAndRenderPlayerStats(match) {
    let players;

    if (match.matchType === 'player_watch' && match.watchedPlayerId) {
        // For player watch, only load the watched player
        const allPlayers = squadManager.getPlayers({});
        const watched = allPlayers.find(p => String(p.id) === String(match.watchedPlayerId));
        players = watched ? [watched] : [];
    } else {
        players = squadManager.getPlayers({ squadId: match.squadId });
    }

    let stats = await matchManager.getMatchPlayerStats(match.id);

    // Auto-populate from match plan if no stats exist yet (skip for clubs with match_planning disabled)
    let hasPlan = false;
    const matchPlanEnabled = window._profile?.clubs?.settings?.features?.match_planning !== false;
    if (stats.length === 0 && matchPlanEnabled) {
        const plan = await matchManager.getMatchPlan(match.id);
        if (plan && plan.data && plan.data.squad) {
            hasPlan = true;
            const xiIds = plan.data.squad.startingXI || [];
            const subIds = plan.data.squad.substitutes || [];
            stats = players.map(p => {
                const isXI = xiIds.includes(p.id);
                const isSub = subIds.includes(p.id);
                return {
                    playerId: p.id,
                    appeared: isXI || isSub,
                    started: isXI,
                    minutesPlayed: isXI ? 90 : 0,
                    goals: 0, assists: 0, yellowCards: 0, redCards: 0,
                    rating: null, motm: false, notes: '',
                    _fromPlan: true,
                    _inSquad: isXI || isSub
                };
            });

        }
    }

    renderPlayerStatsDisplay(players, stats);
    fillPlayerStatsEditForm(players, stats, hasPlan);

    // Load match summary
    const summaryDisplay = document.getElementById('matchSummaryDisplay');
    const summaryEdit = document.getElementById('matchSummaryEdit');
    const summary = match.stats?.match_summary || '';
    if (summaryDisplay) {
        summaryDisplay.innerHTML = summary
            ? summary.replace(/\n/g, '<br>')
            : '<em style="color: var(--text-secondary);">No match summary added yet.</em>';
    }
    if (summaryEdit) summaryEdit.value = summary;
}

/* -- Read-only Match Plan View -------------------------------------- */
async function loadAndRenderMatchPlan(match) {
    const section = document.getElementById('matchPlanSection');
    const content = document.getElementById('matchPlanContent');
    if (!section || !content) return;

    const matchPlanEnabled = window._profile?.clubs?.settings?.features?.match_planning !== false;
    if (!matchPlanEnabled) return;

    const plan = await matchManager.getMatchPlan(match.id);
    if (!plan) return;

    section.style.display = 'block';
    const data = plan.data || {};
    const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Helper: render a plan section
    const renderPlan = (key, label) => {
        const p = data[key];
        if (!p) return '';
        const players = squadManager.getPlayers({ squadId: match.squadId });
        const playerMap = {};
        players.forEach(pl => { playerMap[pl.id] = pl; });

        const xiList = (p.xi || []).map(id => playerMap[id]).filter(Boolean)
            .map(pl => `<span style="display:inline-block;background:#1e3a8a;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;margin:2px 3px;">${esc(pl.name)}</span>`).join('');
        const subList = (p.subs || []).map(id => playerMap[id]).filter(Boolean)
            .map(pl => `<span style="display:inline-block;background:#f1f5f9;color:#475569;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;margin:2px 3px;">${esc(pl.name)}</span>`).join('');

        const extraHTML = (p.extraSections || []).map(s =>
            `<div style="margin-top:10px;"><strong style="font-size:0.85rem;color:var(--navy-dark);">${esc(s.title)}</strong><p style="margin:4px 0 0;font-size:0.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(s.body)}</p></div>`
        ).join('');

        return `
        <div class="report-card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--navy-dark);margin:0;font-weight:700;border-bottom:2px solid var(--navy-dark);display:inline-block;padding-bottom:4px;">${label}</h4>
                <span style="background:#f1f5f9;padding:3px 10px;border-radius:6px;font-size:0.8rem;font-weight:600;color:#475569;">${esc(p.formation || '--')}</span>
            </div>
            ${xiList ? `<div style="margin-bottom:8px;"><span style="font-size:0.78rem;font-weight:700;color:var(--text-medium);text-transform:uppercase;letter-spacing:0.5px;">Starting XI</span><div style="margin-top:4px;">${xiList}</div></div>` : ''}
            ${subList ? `<div style="margin-bottom:8px;"><span style="font-size:0.78rem;font-weight:700;color:var(--text-medium);text-transform:uppercase;letter-spacing:0.5px;">Substitutes</span><div style="margin-top:4px;">${subList}</div></div>` : ''}
            ${p.notes ? `<div style="margin-top:8px;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:0.9rem;color:var(--navy-dark);white-space:pre-wrap;">${esc(p.notes)}</div>` : ''}
            ${extraHTML}
        </div>`;
    };

    // Helper: render offense/defense/set piece notes
    const renderPhaseNotes = (phaseData, label, color) => {
        if (!phaseData) return '';
        const entries = Object.entries(phaseData).filter(([, v]) => v?.notes);
        if (entries.length === 0) return '';
        return `
        <div class="report-card" style="margin-bottom:16px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;color:${color};margin-bottom:10px;font-weight:700;border-bottom:2px solid ${color};display:inline-block;padding-bottom:4px;">${label}</h4>
            ${entries.map(([zone, v]) => `<div style="margin-bottom:8px;"><strong style="font-size:0.82rem;color:var(--navy-dark);">${zone.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</strong><p style="margin:4px 0 0;font-size:0.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(v.notes)}</p></div>`).join('')}
        </div>`;
    };

    let html = '';
    html += renderPlan('planA', 'Plan A — Starting Formation');
    html += renderPlan('planB', 'Plan B — Alternative');
    html += renderPlan('planC', 'Plan C — Trailing');
    html += renderPhaseNotes(data.offense, 'Offensive Plan', '#10b981');
    html += renderPhaseNotes(data.defense, 'Defensive Plan', '#ef4444');

    // Set pieces
    if (data.setPieces) {
        const sp = data.setPieces;
        const allPl = squadManager.getPlayers({ squadId: match.squadId });
        const plMap = {}; allPl.forEach(p => { plMap[p.id] = p.name; });
        const resolveName = (id) => plMap[id] || id || '';
        const takers = [
            sp.freeKickNear && `Free Kick (Near): ${esc(resolveName(sp.freeKickNear))}`,
            sp.freeKickFar && `Free Kick (Far): ${esc(resolveName(sp.freeKickFar))}`,
            sp.penaltyTaker && `Penalty: ${esc(resolveName(sp.penaltyTaker))}`,
            sp.cornerLeft && `Corner (L): ${esc(resolveName(sp.cornerLeft))}`,
            sp.cornerRight && `Corner (R): ${esc(resolveName(sp.cornerRight))}`
        ].filter(Boolean);
        const hasNotes = sp.cornersFor?.notes || sp.cornersAgainst?.notes;
        if (takers.length || hasNotes) {
            html += `<div class="report-card" style="margin-bottom:16px;">
                <h4 style="font-size:0.85rem;text-transform:uppercase;color:#6366f1;margin-bottom:10px;font-weight:700;border-bottom:2px solid #6366f1;display:inline-block;padding-bottom:4px;">Set Pieces</h4>
                ${takers.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${takers.map(t => `<span style="background:#f1f5f9;padding:4px 12px;border-radius:6px;font-size:0.82rem;color:#475569;">${t}</span>`).join('')}</div>` : ''}
                ${sp.cornersFor?.notes ? `<div style="margin-bottom:6px;"><strong style="font-size:0.82rem;color:var(--navy-dark);">Corners For Us</strong><p style="margin:4px 0 0;font-size:0.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(sp.cornersFor.notes)}</p></div>` : ''}
                ${sp.cornersAgainst?.notes ? `<div><strong style="font-size:0.82rem;color:var(--navy-dark);">Corners Against Us</strong><p style="margin:4px 0 0;font-size:0.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(sp.cornersAgainst.notes)}</p></div>` : ''}
            </div>`;
        }
    }

    content.innerHTML = html || '<p style="color:var(--text-secondary);font-size:0.9rem;">Match plan is empty.</p>';
}

function renderPlayerStatsDisplay(players, stats) {
    const tbody = document.getElementById('playerStatsTableBody');
    const countEl = document.getElementById('playerStatsCount');
    if (!tbody) return;

    const statMap = {};
    stats.forEach(s => { statMap[s.playerId] = s; });

    const appeared = stats.filter(s => s.appeared);
    if (countEl) countEl.textContent = `${appeared.length} player${appeared.length !== 1 ? 's' : ''} appeared`;

    if (appeared.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="ps-empty"><i class="fas fa-clipboard-list"></i>No player stats recorded yet.</td></tr>';
        return;
    }

    // Sort by: starters first, then subs, then by position group (GK→DEF→MID→FWD), then name
    const sorted = [...players].filter(p => statMap[p.id]?.appeared).sort((a, b) => {
        const sa = statMap[a.id], sb = statMap[b.id];
        const aStart = sa?.started ? 0 : 1, bStart = sb?.started ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        const aGroup = POSITION_GROUP_ORDER[getPositionGroup(a.position)] ?? 4;
        const bGroup = POSITION_GROUP_ORDER[getPositionGroup(b.position)] ?? 4;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.name.localeCompare(b.name);
    });

    let totalGoals = 0, totalAssists = 0;
    let lastGroup = null;
    let lastSection = null; // 'started' or 'sub'

    const rows = sorted.map(p => {
        const s = statMap[p.id];
        totalGoals += s.goals || 0;
        totalAssists += s.assists || 0;

        const appVal = appearanceFromStat(s);
        const section = s.started ? 'started' : 'sub';
        const rowColor = s.started ? 'rgba(34,197,94,0.08)' : 'rgba(250,204,21,0.08)';
        const statusDot = s.started
            ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:4px;"></span>Started'
            : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#facc15;margin-right:4px;"></span>Sub';

        // Section header
        let sectionHeader = '';
        if (section !== lastSection) {
            const label = section === 'started' ? 'Starting XI' : 'Substitutes';
            sectionHeader = `<tr><td colspan="10" style="background:#f8fafc;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;padding:8px 12px;border-top:2px solid #e2e8f0;">${label}</td></tr>`;
            lastSection = section;
            lastGroup = null;
        }

        const minutesLabel = `${s.minutesPlayed || 0}'`;
        const caution = cautionFromStat(s);
        let yellowHTML = '--';
        let redHTML = '--';
        if (caution === 'yellow') { yellowHTML = '<span style="display:inline-block;width:12px;height:16px;background:#facc15;border-radius:2px;"></span> 1'; redHTML = '--'; }
        else if (caution === '2yellow') { yellowHTML = '<span style="display:inline-block;width:12px;height:16px;background:#facc15;border-radius:2px;"></span> 2'; redHTML = '<span style="display:inline-block;width:12px;height:16px;background:#ef4444;border-radius:2px;"></span> 1'; }
        else if (caution === 'red') { yellowHTML = '--'; redHTML = '<span style="display:inline-block;width:12px;height:16px;background:#ef4444;border-radius:2px;"></span> 1'; }

        const ratingHTML = s.rating
            ? `<span class="ps-rating-badge ps-rating-${s.rating}">${RATING_LABELS[s.rating]}</span>`
            : '--';
        const motmHTML = s.motm ? '<i class="fas fa-trophy ps-motm"></i>' : '';

        return `${sectionHeader}<tr style="background:${rowColor};">
            <td>${p.name}</td>
            <td>${p.position || '--'}</td>
            <td>${statusDot}</td>
            <td>${minutesLabel}</td>
            <td>${s.goals || 0}</td>
            <td>${s.assists || 0}</td>
            <td>${yellowHTML}</td>
            <td>${redHTML}</td>
            <td>${ratingHTML}</td>
            <td>${motmHTML}</td>
        </tr>`;
    });

    rows.push(`<tr class="ps-totals">
        <td colspan="4">TOTALS (${appeared.length} appeared)</td>
        <td>${totalGoals}</td>
        <td>${totalAssists}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
    </tr>`);

    tbody.innerHTML = rows.join('');
}

function fillPlayerStatsEditForm(players, stats, hasPlan = false) {
    const tbody = document.getElementById('playerStatsEditBody');
    const motmSelect = document.getElementById('motmSelect');
    if (!tbody) return;

    // Show squad source banner
    showSquadSourceBanner(hasPlan, players, stats);

    const statMap = {};
    stats.forEach(s => { statMap[s.playerId] = s; });

    // Sort by: starters first → subs → rest, then by position group (GK→DEF→MID→FWD), then name
    const sorted = [...players].sort((a, b) => {
        const sa = statMap[a.id], sb = statMap[b.id];
        const aStart = sa?.started ? 0 : (sa?.appeared || sa?._inSquad ? 1 : 2);
        const bStart = sb?.started ? 0 : (sb?.appeared || sb?._inSquad ? 1 : 2);
        if (aStart !== bStart) return aStart - bStart;
        const aGroup = POSITION_GROUP_ORDER[getPositionGroup(a.position)] ?? 4;
        const bGroup = POSITION_GROUP_ORDER[getPositionGroup(b.position)] ?? 4;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.name.localeCompare(b.name);
    });

    // Populate MOTM dropdown
    if (motmSelect) {
        motmSelect.innerHTML = '<option value="">-- None --</option>' +
            sorted.map(p => {
                const isMOTM = statMap[p.id]?.motm;
                return `<option value="${p.id}"${isMOTM ? ' selected' : ''}>${p.name}</option>`;
            }).join('');
    }

    const appOptions = APPEARANCE_OPTIONS.map(o =>
        `<option value="${o.value}">${o.label}</option>`
    ).join('');

    const cautionOpts = CAUTION_OPTIONS.map(o =>
        `<option value="${o.value}">${o.label}</option>`
    ).join('');

    const ratingOptions = '<option value="">--</option>' +
        [1,2,3,4,5].map(v => `<option value="${v}">${v}/5</option>`).join('');

    let lastPosGroup = null;
    tbody.innerHTML = sorted.map(p => {
        const s = statMap[p.id] || {};
        const appVal = appearanceFromStat(s);
        const cautionVal = cautionFromStat(s);
        const isActive = appVal === 'started' || appVal === 'sub';
        const disabledClass = isActive ? '' : ' ps-row-disabled';
        const minutes = s.minutesPlayed || (appVal === 'started' ? 90 : 0);

        // Row color: green for starters, yellow for subs
        let rowStyle = '';
        if (appVal === 'started') rowStyle = 'background:rgba(34,197,94,0.08);';
        else if (appVal === 'sub') rowStyle = 'background:rgba(250,204,21,0.08);';

        // Position group header
        const group = getPositionGroup(p.position);
        let groupHeader = '';
        if (group !== lastPosGroup) {
            const label = POSITION_GROUP_LABELS[group] || 'Other';
            groupHeader = `<tr><td colspan="9" style="background:#f1f5f9;font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;padding:6px 12px;border-top:1px solid #e2e8f0;">${label}</td></tr>`;
            lastPosGroup = group;
        }

        return `${groupHeader}<tr class="${disabledClass}" data-player-id="${p.id}" style="${rowStyle}">
            <td>${p.name}<span class="ps-pos-badge">${p.position || '--'}</span></td>
            <td><select class="ps-appearance">${appOptions.replace(`value="${appVal}"`, `value="${appVal}" selected`)}</select></td>
            <td><input type="number" class="ps-minutes" value="${minutes}" min="0" max="120" style="width:58px;" ${!isActive ? 'disabled' : ''}></td>
            <td><input type="number" class="ps-goals" value="${s.goals || 0}" min="0" max="10" ${!isActive ? 'disabled' : ''}></td>
            <td><input type="number" class="ps-assists" value="${s.assists || 0}" min="0" max="10" ${!isActive ? 'disabled' : ''}></td>
            <td><select class="ps-caution" ${!isActive ? 'disabled' : ''}>${cautionOpts.replace(`value="${cautionVal}"`, `value="${cautionVal}" selected`)}</select></td>
            <td><select class="ps-rating" ${!isActive ? 'disabled' : ''}>${s.rating ? ratingOptions.replace(`value="${s.rating}"`, `value="${s.rating}" selected`) : ratingOptions}</select></td>
            <td><button type="button" class="ps-assess-btn" title="Full Assessment" ${!isActive ? 'disabled' : ''} style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;color:#6366f1;white-space:nowrap;" data-player-id="${p.id}" data-player-name="${p.name}"><i class="fas fa-clipboard-check"></i></button></td>
            <td><input type="text" class="ps-notes" value="${(s.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..." ${!isActive ? 'disabled' : ''}></td>
        </tr>`;
    }).join('');

    // Helper: count current starters
    const countStarters = () => tbody.querySelectorAll('.ps-appearance').length > 0
        ? Array.from(tbody.querySelectorAll('.ps-appearance')).filter(s => s.value === 'started').length
        : 0;

    // Helper: update row color based on status
    const updateRowColor = (row, val) => {
        if (val === 'started') row.style.background = 'rgba(34,197,94,0.08)';
        else if (val === 'sub') row.style.background = 'rgba(250,204,21,0.08)';
        else row.style.background = '';
    };

    // Wire up appearance dropdown behaviors
    tbody.querySelectorAll('.ps-appearance').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const row = e.target.closest('tr');
            const val = e.target.value;

            // Enforce 11-starter limit
            if (val === 'started' && countStarters() > 11) {
                e.target.value = 'sub';
                showToast('Maximum 11 starters allowed', 'error');
                return;
            }

            const isActive = val === 'started' || val === 'sub';
            const inputs = row.querySelectorAll('.ps-minutes, .ps-goals, .ps-assists, .ps-caution, .ps-rating, .ps-notes, .ps-assess-btn');
            const minutesInput = row.querySelector('.ps-minutes');
            if (isActive) {
                row.classList.remove('ps-row-disabled');
                inputs.forEach(inp => inp.disabled = false);
                if (val === 'started' && minutesInput && parseInt(minutesInput.value) === 0) {
                    minutesInput.value = 90;
                }
            } else {
                row.classList.add('ps-row-disabled');
                inputs.forEach(inp => inp.disabled = true);
                if (minutesInput) minutesInput.value = 0;
            }
            updateRowColor(row, val);
        });
    });

    // Select All Appeared button → set first 11 to "Started", rest stay
    const btnSelectAll = document.getElementById('btnSelectAllAppeared');
    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            let starterCount = countStarters();
            tbody.querySelectorAll('.ps-appearance').forEach(sel => {
                if (starterCount < 11 && (!sel.value)) {
                    sel.value = 'started';
                    sel.dispatchEvent(new Event('change'));
                    starterCount++;
                }
            });
        });
    }

    // Wire up Assess buttons
    tbody.querySelectorAll('.ps-assess-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const playerId = btn.dataset.playerId;
            const playerName = btn.dataset.playerName;
            openAssessmentModal(playerId, playerName);
        });
    });

    // Mark players who already have assessments for this match
    const match = window._matchData;
    if (match?.id) {
        supabase.from('assessments').select('player_id').eq('match_id', match.id).then(({ data }) => {
            if (data) {
                data.forEach(a => {
                    const btn = tbody.querySelector(`.ps-assess-btn[data-player-id="${a.player_id}"]`);
                    if (btn) {
                        btn.style.color = '#10b981';
                        btn.style.borderColor = '#10b981';
                        btn.innerHTML = '<i class="fas fa-check-circle"></i>';
                    }
                });
            }
        });
    }
}

function showSquadSourceBanner(hasPlan, players, stats) {
    const banner = document.getElementById('squadSourceBanner');
    if (!banner) return;

    const icon = document.getElementById('squadSourceIcon');
    const title = document.getElementById('squadSourceTitle');
    const subtitle = document.getElementById('squadSourceSubtitle');
    const actions = document.getElementById('squadQuickActions');

    const xiCount = stats.filter(s => s.started).length;
    const subCount = stats.filter(s => s.appeared && !s.started).length;

    if (hasPlan) {
        banner.style.display = 'block';
        icon.style.background = '#dcfce7';
        icon.style.color = '#16a34a';
        icon.innerHTML = '<i class="fas fa-clipboard-check"></i>';
        title.textContent = 'Squad imported from Match Plan';
        subtitle.textContent = `${xiCount} starting, ${subCount} substitutes — adjust appearances below as needed`;
        actions.innerHTML = '';
    } else if (players.length > 0) {
        banner.style.display = 'block';
        icon.style.background = '#fef3c7';
        icon.style.color = '#d97706';
        icon.innerHTML = '<i class="fas fa-users-cog"></i>';
        title.textContent = 'No match plan linked — select squad below';
        subtitle.textContent = 'Use the Appearance dropdown per player, or use quick-select buttons';
        actions.innerHTML = `
            <button type="button" class="ps-select-all-btn" onclick="quickSelectXI()">
                <i class="fas fa-star"></i> Quick Select XI
            </button>
            <button type="button" class="ps-select-all-btn" onclick="quickClearAll()">
                <i class="fas fa-undo"></i> Clear All
            </button>`;
    } else {
        banner.style.display = 'none';
    }
}

function quickSelectXI() {
    const tbody = document.getElementById('playerStatsEditBody');
    if (!tbody) return;
    const selects = tbody.querySelectorAll('.ps-appearance');
    let count = 0;
    selects.forEach(sel => {
        if (count < 11 && (!sel.value)) {
            sel.value = 'started';
            sel.dispatchEvent(new Event('change'));
            count++;
        }
    });
    showToast(`${count} players set as Starting XI`, 'info');
}
window.quickSelectXI = quickSelectXI;

function quickClearAll() {
    const tbody = document.getElementById('playerStatsEditBody');
    if (!tbody) return;
    tbody.querySelectorAll('.ps-appearance').forEach(sel => {
        sel.value = '';
        sel.dispatchEvent(new Event('change'));
    });
    showToast('All appearances cleared', 'info');
}
window.quickClearAll = quickClearAll;

function collectPlayerStatsFromForm() {
    const tbody = document.getElementById('playerStatsEditBody');
    const motmSelect = document.getElementById('motmSelect');
    if (!tbody) return [];

    const motmPlayerId = motmSelect?.value || '';
    const rows = tbody.querySelectorAll('tr[data-player-id]');
    const result = [];

    rows.forEach(row => {
        const playerId = row.dataset.playerId;
        const appVal = row.querySelector('.ps-appearance')?.value || '';
        const minutesFromInput = parseInt(row.querySelector('.ps-minutes')?.value) || 0;
        const { appeared, started } = statFromAppearance(appVal, minutesFromInput);
        const minutesPlayed = (appVal === 'started' || appVal === 'sub') ? minutesFromInput : 0;
        const cautionVal = row.querySelector('.ps-caution')?.value || '';
        const { yellowCards, redCards } = statFromCaution(cautionVal);
        const isActive = appVal === 'started' || appVal === 'sub';

        result.push({
            playerId,
            appeared,
            started,
            minutesPlayed,
            goals: isActive ? (parseInt(row.querySelector('.ps-goals')?.value) || 0) : 0,
            assists: isActive ? (parseInt(row.querySelector('.ps-assists')?.value) || 0) : 0,
            yellowCards,
            redCards,
            rating: isActive ? (parseInt(row.querySelector('.ps-rating')?.value) || null) : null,
            notes: isActive ? (row.querySelector('.ps-notes')?.value || '') : '',
            motm: playerId === motmPlayerId
        });
    });

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4-PILLAR ASSESSMENT MODAL (from Match Report)
// ═══════════════════════════════════════════════════════════════════════════════

const ASSESSMENT_PILLARS = [
    {
        key: 'tactical', label: 'Tactical', icon: 'fa-chess', color: '#6366f1',
        attrs: [
            { key: 'positioning', label: 'Positioning' },
            { key: 'decision', label: 'Decision Making' },
            { key: 'awareness', label: 'Game Awareness' },
            { key: 'creativity', label: 'Creativity' }
        ]
    },
    {
        key: 'technical', label: 'Technical', icon: 'fa-futbol', color: '#0ea5e9',
        attrs: [
            { key: 'passing', label: 'Passing Accuracy' },
            { key: 'touch', label: 'First Touch' },
            { key: 'control', label: 'Ball Control' },
            { key: 'dribbling', label: 'Dribbling' }
        ]
    },
    {
        key: 'physical', label: 'Physical', icon: 'fa-running', color: '#10b981',
        attrs: [
            { key: 'speed', label: 'Speed / Acceleration' },
            { key: 'agility', label: 'Agility / Balance' },
            { key: 'stamina', label: 'Stamina / Endurance' },
            { key: 'strength', label: 'Strength / Power' }
        ]
    },
    {
        key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#f59e0b',
        attrs: [
            { key: 'workEthic', label: 'Work Ethic' },
            { key: 'communication', label: 'Communication' },
            { key: 'focus', label: 'Focus / Concentration' },
            { key: 'resilience', label: 'Resilience' }
        ]
    }
];

let _assessmentModal = null;
let _assessingPlayerId = null;
let _assessingPlayerName = '';
let _existingAssessmentId = null;

function getOrCreateAssessmentModal() {
    if (_assessmentModal) return _assessmentModal;

    const overlay = document.createElement('div');
    overlay.id = 'assessmentModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;overflow:hidden;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:16px;max-width:560px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,0.15);';

    // Header (sticky — stays fixed at top of modal)
    const header = document.createElement('div');
    header.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #e2e8f0;background:white;border-radius:16px 16px 0 0;';
    header.innerHTML = `
        <div>
            <h3 id="assessModalTitle" style="margin:0;font-size:1.1rem;color:#0f172a;"><i class="fas fa-clipboard-check" style="color:#6366f1;margin-right:8px;"></i>Player Assessment</h3>
            <p id="assessModalSubtitle" style="margin:4px 0 0;font-size:0.8rem;color:#94a3b8;"></p>
        </div>
        <button id="assessModalClose" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#94a3b8;padding:4px;" title="Close">&times;</button>
    `;

    // Body (scrollable only on mobile if content overflows)
    const body = document.createElement('div');
    body.id = 'assessModalBody';
    body.style.cssText = 'padding:20px 24px;overflow-y:auto;overflow-x:hidden;flex:1;min-height:0;';

    // Build pillar grids
    let pillarsHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    ASSESSMENT_PILLARS.forEach(pillar => {
        pillarsHTML += `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                    <i class="fas ${pillar.icon}" style="color:${pillar.color};font-size:0.85rem;"></i>
                    <span style="font-weight:700;font-size:0.8rem;color:#0f172a;">${pillar.label}</span>
                    <span id="assess_${pillar.key}_avg" style="margin-left:auto;font-weight:700;font-size:0.75rem;color:${pillar.color};"></span>
                </div>
                ${pillar.attrs.map(attr => `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:0.72rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;">${attr.label}</span>
                        <div class="assess-rating-btns" data-pillar="${pillar.key}" data-attr="${attr.key}" style="display:flex;gap:2px;flex-shrink:0;">
                            ${[1,2,3,4,5].map(v => `<button type="button" class="assess-btn" data-value="${v}" style="width:26px;height:26px;border-radius:5px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:0.7rem;font-weight:700;cursor:pointer;transition:all 0.15s;">${v}</button>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    });
    pillarsHTML += '</div>';

    // Global average display
    pillarsHTML += `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
            <span style="font-weight:700;font-size:0.85rem;color:#64748b;">Global Average:</span>
            <span id="assessGlobalAvg" style="font-weight:800;font-size:1.3rem;color:#0f172a;">-</span>
        </div>
    `;

    body.innerHTML = pillarsHTML;

    // Footer (sticky — stays fixed at bottom of modal)
    const footer = document.createElement('div');
    footer.style.cssText = 'flex-shrink:0;padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;background:white;border-radius:0 0 16px 16px;';
    footer.innerHTML = `
        <button id="assessModalCancel" style="padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#64748b;font-size:0.85rem;cursor:pointer;">Cancel</button>
        <button id="assessModalSave" style="padding:8px 20px;border:none;border-radius:8px;background:#6366f1;color:white;font-weight:700;font-size:0.85rem;cursor:pointer;">Save Assessment</button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Events
    overlay.querySelector('#assessModalClose').addEventListener('click', closeAssessmentModal);
    overlay.querySelector('#assessModalCancel').addEventListener('click', closeAssessmentModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAssessmentModal(); });
    overlay.querySelector('#assessModalSave').addEventListener('click', saveAssessmentFromModal);

    // Rating button clicks
    overlay.querySelectorAll('.assess-rating-btns').forEach(group => {
        group.querySelectorAll('.assess-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.assess-btn').forEach(b => {
                    b.style.background = '#f8fafc';
                    b.style.color = '#64748b';
                    b.style.borderColor = '#e2e8f0';
                    b.removeAttribute('data-active');
                });
                btn.style.background = '#6366f1';
                btn.style.color = 'white';
                btn.style.borderColor = '#6366f1';
                btn.setAttribute('data-active', '1');
                updatePillarAverages();
            });
        });
    });

    _assessmentModal = overlay;
    return overlay;
}

function updatePillarAverages() {
    const overlay = _assessmentModal;
    if (!overlay) return;
    const allPillarAvgs = [];

    ASSESSMENT_PILLARS.forEach(pillar => {
        const vals = [];
        pillar.attrs.forEach(attr => {
            const group = overlay.querySelector(`.assess-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
            const active = group?.querySelector('.assess-btn[data-active]');
            if (active) vals.push(parseInt(active.dataset.value));
        });
        const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        const el = overlay.querySelector(`#assess_${pillar.key}_avg`);
        if (el) el.textContent = avg != null ? avg.toFixed(1) : '-';
        if (avg != null) allPillarAvgs.push(avg);
    });

    const globalEl = overlay.querySelector('#assessGlobalAvg');
    if (globalEl) {
        const globalAvg = allPillarAvgs.length > 0 ? (allPillarAvgs.reduce((a, b) => a + b, 0) / allPillarAvgs.length) : null;
        globalEl.textContent = globalAvg != null ? globalAvg.toFixed(1) : '-';
        if (globalAvg != null) {
            globalEl.style.color = globalAvg >= 4 ? '#10b981' : globalAvg >= 3 ? '#0ea5e9' : globalAvg >= 2 ? '#f59e0b' : '#ef4444';
        }
    }
}

async function openAssessmentModal(playerId, playerName) {
    const overlay = getOrCreateAssessmentModal();
    _assessingPlayerId = playerId;
    _assessingPlayerName = playerName;
    _existingAssessmentId = null;

    // Set title with match context
    const match = window._matchData;
    const matchContext = match ? `vs ${match.opponent || 'Unknown'} — ${match.date || ''}` : '';
    overlay.querySelector('#assessModalTitle').innerHTML = `<i class="fas fa-clipboard-check" style="color:#6366f1;margin-right:8px;"></i>${playerName}`;
    overlay.querySelector('#assessModalSubtitle').textContent = matchContext;

    // Reset all buttons
    overlay.querySelectorAll('.assess-btn').forEach(btn => {
        btn.style.background = '#f8fafc';
        btn.style.color = '#64748b';
        btn.style.borderColor = '#e2e8f0';
        btn.removeAttribute('data-active');
    });
    ASSESSMENT_PILLARS.forEach(p => {
        const el = overlay.querySelector(`#assess_${p.key}_avg`);
        if (el) el.textContent = '-';
    });
    overlay.querySelector('#assessGlobalAvg').textContent = '-';

    // Check for existing assessment for this player+match
    if (match?.id) {
        try {
            const { data: existing } = await supabase.from('assessments')
                .select('*')
                .eq('player_id', playerId)
                .eq('match_id', match.id)
                .limit(1)
                .single();

            if (existing && existing.ratings) {
                _existingAssessmentId = existing.id;
                const ratings = typeof existing.ratings === 'string' ? JSON.parse(existing.ratings) : existing.ratings;
                // Pre-fill buttons
                ASSESSMENT_PILLARS.forEach(pillar => {
                    const pillarData = ratings[pillar.key] || {};
                    pillar.attrs.forEach(attr => {
                        const val = pillarData[attr.key];
                        if (val) {
                            const group = overlay.querySelector(`.assess-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
                            const btn = group?.querySelector(`.assess-btn[data-value="${val}"]`);
                            if (btn) {
                                btn.style.background = '#6366f1';
                                btn.style.color = 'white';
                                btn.style.borderColor = '#6366f1';
                                btn.setAttribute('data-active', '1');
                            }
                        }
                    });
                });
                updatePillarAverages();
                overlay.querySelector('#assessModalSave').textContent = 'Update Assessment';
            }
        } catch (e) {
            // No existing assessment — that's fine
        }
    }

    overlay.style.display = 'flex';
}

function closeAssessmentModal() {
    if (_assessmentModal) _assessmentModal.style.display = 'none';
    _assessingPlayerId = null;
    _assessingPlayerName = '';
    _existingAssessmentId = null;
}

async function saveAssessmentFromModal() {
    const overlay = _assessmentModal;
    if (!overlay || !_assessingPlayerId) return;

    const match = window._matchData;
    const ratings = {};
    let hasAnyRating = false;

    ASSESSMENT_PILLARS.forEach(pillar => {
        ratings[pillar.key] = {};
        pillar.attrs.forEach(attr => {
            const group = overlay.querySelector(`.assess-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
            const active = group?.querySelector('.assess-btn[data-active]');
            if (active) {
                ratings[pillar.key][attr.key] = parseInt(active.dataset.value);
                hasAnyRating = true;
            }
        });
    });

    if (!hasAnyRating) {
        showToast('Please rate at least one attribute', 'error');
        return;
    }

    const saveBtn = overlay.querySelector('#assessModalSave');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const row = {
            club_id: matchManager.clubId,
            player_id: _assessingPlayerId,
            match_id: match?.id || null,
            date: match?.date || new Date().toISOString().slice(0, 10),
            ratings,
            author: 'Match Report',
            type: 'match'
        };

        if (_existingAssessmentId) {
            const { error } = await supabase.from('assessments')
                .update({ ratings, date: row.date, author: row.author })
                .eq('id', _existingAssessmentId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('assessments').insert(row);
            if (error) throw error;
        }

        showToast(`Assessment saved for ${_assessingPlayerName}`, 'success');

        // Mark the assess button as completed (visual indicator)
        const tbody = document.getElementById('playerStatsEditBody');
        const btn = tbody?.querySelector(`.ps-assess-btn[data-player-id="${_assessingPlayerId}"]`);
        if (btn) {
            btn.style.color = '#10b981';
            btn.style.borderColor = '#10b981';
            btn.innerHTML = '<i class="fas fa-check-circle"></i>';
        }

        closeAssessmentModal();
    } catch (e) {
        console.error('Failed to save assessment:', e);
        showToast('Failed to save assessment', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = _existingAssessmentId ? 'Update Assessment' : 'Save Assessment';
    }
}
