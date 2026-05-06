/**
 * Match Details UI Logic
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast, showConfirm } from '../toast.js';
import { hasFeature, showUpgradeToast } from '../tier.js';
import { uploadToR2 } from './r2-upload.js';

let _currentMdTab = 'details';

// ── Unsaved changes tracking ───────────────────────────────────────────────────
let _mdDirty = false;
let _mdDirtyWired = false;
function _markMdDirty() { _mdDirty = true; }
function _resetMdDirty() { _mdDirty = false; }

function _setupMdDirtyTracking(container) {
    if (_mdDirtyWired) return;
    _mdDirtyWired = true;
    container.addEventListener('input', _markMdDirty);
    container.addEventListener('change', _markMdDirty);
}

window.addEventListener('beforeunload', (e) => {
    if (_mdDirty) { e.preventDefault(); e.returnValue = ''; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

export async function initMatchDetailsUI() {
    const btnToggle = document.getElementById('btnToggleEdit');
    const btnSave = document.getElementById('btnSaveStats');
    const displayMode = document.getElementById('displayMode');
    const editMode = document.getElementById('editMode');

    if (btnToggle) {
        btnToggle.addEventListener('click', async () => {
            const isEditing = editMode.style.display !== 'none' && editMode.style.display !== '';
            if (isEditing) {
                if (_mdDirty) {
                    const leave = await showConfirm(
                        'Discard Changes',
                        'You have unsaved changes. Are you sure you want to cancel and discard them?',
                        { confirmLabel: 'Discard', isDanger: true, icon: 'fa-exclamation-triangle' }
                    );
                    if (!leave) return;
                }
                _resetMdDirty();
                editMode.style.display = 'none';
                displayMode.style.display = 'block';
                btnSave.style.display = 'none';
                btnToggle.innerHTML = '<i class="fas fa-edit"></i> Edit';
            } else {
                editMode.style.display = 'block';
                displayMode.style.display = 'none';
                btnSave.style.display = 'inline-flex';
                btnToggle.innerHTML = '<i class="fas fa-times"></i> Cancel';
                // Start tracking changes once edit mode is open
                _setupMdDirtyTracking(editMode);
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

    setupRichTextEditors();

    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');

    if (!matchId) {
        window.location.href = 'matches.html';
        return;
    }

    try {
        const match = await matchManager.getMatch(matchId);
        if (!match) {
            console.error('Match not found for id:', matchId);
            const mc = document.querySelector('.main-content');
            if (mc) mc.innerHTML = '<div style="text-align:center;padding:80px 20px;color:var(--text-secondary);"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:16px;display:block;color:#ef4444;"></i><p style="font-size:1.1rem;margin-bottom:16px;">Match not found. It may have been deleted.</p><a href="matches.html" class="dash-btn primary">Back to Matches</a></div>';
            return;
        }
        window._matchData = match;

        if (match.matchType === 'player_watch') {
            adaptForPlayerWatch(match);
        }

        renderMatchInfo(match);
        renderMatchInfoGrid(match);
        renderLineupDisplay(match);
        renderStatsDisplay(match.stats || {});
        renderReportDisplay(match.stats || {}, match);
        renderAnalysisDisplay(match);
        _renderMediaPhotosDisplay(match);
        fillEditForm(match);

        await Promise.all([
            loadAndRenderPlayerStats(match),
            loadAndRenderMatchPlan(match),
        ]);

        if (params.get('download') === 'true') {
            setTimeout(() => downloadReportPDF(), 800);
        }

    } catch (err) {
        console.error('Error loading match data:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

function switchMdTab(tabId) {
    _currentMdTab = tabId;
    document.querySelectorAll('.md-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('#displayMode .md-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `display-${tabId}`);
    });
    document.querySelectorAll('#editMode .md-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `edit-${tabId}`);
    });
}
window.switchMdTab = switchMdTab;

// ═══════════════════════════════════════════════════════════════════════════════
// RICH TEXT EDITORS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM NAME RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

function resolveTeamNames(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;
    const getSquadName = (sid) => {
        const squad = squadManager.getSquad(sid);
        return squad ? squad.name : 'UP Performance';
    };
    if (!home || !away) {
        const squadName = getSquadName(m.squadId);
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

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER WATCH ADAPTATION
// ═══════════════════════════════════════════════════════════════════════════════

function adaptForPlayerWatch(match) {
    // Hide lineup tab — not relevant for individual watch
    const lineupTab = document.getElementById('mdTabLineup');
    if (lineupTab) lineupTab.style.display = 'none';

    // Hide team stats card and team stats form
    const statsCard = document.getElementById('statsListViewCard');
    if (statsCard) statsCard.style.display = 'none';
    const statsForm = document.getElementById('matchStatsForm');
    if (statsForm) statsForm.style.display = 'none';

    // Hide legacy tactical analysis (team-phase sections — not relevant for scouting)
    const legacyEdit = document.getElementById('legacyEditSection');
    if (legacyEdit) legacyEdit.style.display = 'none';

    // Resolve watched player
    let watchedName = '';
    let watchedPlayerId = match.watchedPlayerId || null;
    if (watchedPlayerId) {
        const allPlayers = squadManager.getPlayers({});
        const wp = allPlayers.find(p => String(p.id) === String(watchedPlayerId));
        watchedName = wp ? wp.name : '';
    }

    // Show player watch info banner with profile link and match context
    const watchSection = document.getElementById('playerWatchInfoSection');
    if (watchSection) {
        watchSection.style.display = 'block';
        const content = document.getElementById('playerWatchInfoContent');
        if (content) {
            const profileHref = watchedPlayerId ? `player-profile.html?id=${watchedPlayerId}` : null;
            const hScore = match.homeScore !== null && match.homeScore !== undefined ? match.homeScore : null;
            const aScore = match.awayScore !== null && match.awayScore !== undefined ? match.awayScore : null;
            const scoreStr = (hScore !== null && aScore !== null) ? `${hScore} – ${aScore}` : null;
            const contextParts = [match.competition, scoreStr].filter(Boolean);

            content.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:${watchedPlayerId ? '12px' : '0'};">
                    <span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">
                        <i class="fas fa-eye" style="margin-right:4px;"></i>Player Watch
                    </span>
                    ${watchedName
                        ? `<span style="font-size:.9rem;color:#1e293b;">Observing: <strong>${watchedName}</strong></span>`
                        : '<span style="font-size:.9rem;color:#64748b;">Individual player observation</span>'
                    }
                    ${contextParts.length ? `<span style="font-size:.82rem;color:#64748b;">${contextParts.join(' · ')}</span>` : ''}
                </div>
                ${profileHref ? `
                <a href="${profileHref}" class="dash-btn outline sm" style="font-size:.8rem;padding:5px 14px;text-decoration:none;">
                    <i class="fas fa-user" style="margin-right:5px;"></i>View Player Profile
                </a>` : ''}
            `;
        }
    }

    // Relabel report edit section for player_watch
    const reportH4 = document.querySelector('#edit-report .md-card h4');
    if (reportH4) reportH4.innerHTML = '<i class="fas fa-clipboard-list" style="color:var(--primary);"></i> Player Observation Report';

    // Relabel general box as "Match Summary", hide the other 4
    const generalEl = document.getElementById('editReportGeneral');
    if (generalEl) {
        generalEl.placeholder = 'Overall context — scoreline, competition, role the player played, general match tempo...';
        const lbl = generalEl.closest('.stat-box')?.querySelector('.label');
        if (lbl) lbl.textContent = 'Match Summary';
    }
    ['editReportAttacking', 'editReportDefending', 'editReportIndividual', 'editReportImprovements'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { const box = el.closest('.stat-box'); if (box) box.style.display = 'none'; }
    });

    // Inject inline pillar assessment form below the summary box
    const generalBox = generalEl?.closest('.stat-box');
    if (generalBox && !document.getElementById('pwPillarFormSection')) {
        const pillarSection = document.createElement('div');
        pillarSection.id = 'pwPillarFormSection';
        pillarSection.style.cssText = 'margin-top:16px;';
        pillarSection.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
                <i class="fas fa-clipboard-check" style="color:#6366f1;font-size:.9rem;"></i>
                <span style="font-weight:700;font-size:.88rem;color:#0f172a;">Player Assessment</span>
            </div>
            ${_buildPillarFormHTML()}
        `;
        generalBox.after(pillarSection);
        _wirePillarButtons(pillarSection);
    }

    // Async-load existing assessment and pre-populate the inline form
    if (match.watchedPlayerId && match.id) {
        supabase.from('assessments')
            .select('*').eq('player_id', match.watchedPlayerId).eq('match_id', match.id).limit(1).single()
            .then(({ data }) => {
                if (data?.ratings) {
                    const container = document.getElementById('pwPillarFormSection');
                    if (container) {
                        const ratings = typeof data.ratings === 'string' ? JSON.parse(data.ratings) : data.ratings;
                        _populatePillarForm(container, ratings);
                    }
                }
            }).catch(() => {});
    }

    // Title placeholder
    const titleInput = document.getElementById('editReportTitle');
    if (titleInput) titleInput.placeholder = `e.g. Watch Report — ${watchedName || 'Player'} vs Opponent`;

    // Update page subtitle
    const subtitle = document.getElementById('mdPageSubtitle');
    if (subtitle) subtitle.textContent = 'Player Watch — Individual Observation';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO & PAGE HEADER RENDER
// ═══════════════════════════════════════════════════════════════════════════════

function renderMatchInfo(match) {
    const { home: homeName, away: awayName } = resolveTeamNames(match);
    const homeScore = match.homeScore !== undefined ? match.homeScore : null;
    const awayScore = match.awayScore !== undefined ? match.awayScore : null;
    const isResult = match.status === 'result' || match.isPast;

    document.title = `${homeName} vs ${awayName} | Sentinel Football Hub`;

    const titleEl = document.getElementById('mdPageTitle');
    if (titleEl) titleEl.textContent = `${homeName} vs ${awayName}`;

    const subtitleEl = document.getElementById('mdPageSubtitle');
    if (subtitleEl && match.matchType !== 'player_watch') {
        subtitleEl.textContent = [match.date, match.venue].filter(Boolean).join(' • ') || 'Match Details';
    }

    // Hero
    const compEl = document.getElementById('heroComp') || document.getElementById('matchComp');
    if (compEl) compEl.textContent = match.competition || 'Match';

    const homeEl = document.getElementById('matchHomeTeamHeader');
    if (homeEl) homeEl.textContent = homeName;

    const awayEl = document.getElementById('matchAwayTeamHeader');
    if (awayEl) awayEl.textContent = awayName;

    const scoreEl = document.getElementById('matchScore');
    if (scoreEl) {
        if (isResult && homeScore !== null) {
            scoreEl.textContent = `${homeScore} - ${awayScore}`;
        } else {
            scoreEl.textContent = 'vs';
            scoreEl.style.fontSize = '2rem';
        }
    }

    const metaEl = document.getElementById('matchMeta');
    if (metaEl) {
        const parts = [match.date, match.venue].filter(Boolean);
        metaEl.textContent = parts.join(' • ');
    }

    // Badges
    const badgesEl = document.getElementById('heroBadges');
    if (badgesEl) {
        const badges = [];
        if (isResult) {
            const result = match.result || (homeScore > awayScore ? 'Win' : homeScore < awayScore ? 'Loss' : 'Draw');
            const cls = result === 'Win' ? 'badge-win' : result === 'Loss' ? 'badge-loss' : 'badge-draw';
            badges.push(`<span class="hero-badge ${cls}">${result}</span>`);
        } else {
            badges.push(`<span class="hero-badge badge-fixture">Fixture</span>`);
        }
        if (match.matchFormat) {
            badges.push(`<span class="hero-badge badge-format">${match.matchFormat}</span>`);
        }
        if (match.matchType === 'player_watch') {
            badges.push(`<span class="hero-badge badge-watch"><i class="fas fa-eye" style="margin-right:4px;"></i>Player Watch</span>`);
        }
        badgesEl.innerHTML = badges.join('');
    }

    // Show PDF button for results with report
    const hasReport = match.reportGeneral || match.reportAttacking || (match.stats?.tactical_in_possession);
    const pdfBtn = document.getElementById('btnDownloadPdf');
    if (pdfBtn && isResult && hasReport) pdfBtn.style.display = 'inline-flex';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCH INFO GRID (Details tab)
// ═══════════════════════════════════════════════════════════════════════════════

function renderMatchInfoGrid(match) {
    const grid = document.getElementById('matchInfoGrid');
    if (!grid) return;

    const cells = [
        { label: 'Date', value: match.date || 'TBD', icon: 'fa-calendar-alt' },
        { label: 'Kickoff', value: match.time || 'TBD', icon: 'fa-clock' },
        { label: 'Venue', value: match.venue || 'TBD', icon: 'fa-map-marker-alt' },
        { label: 'Competition', value: match.competition || 'TBD', icon: 'fa-trophy' },
        { label: 'Format', value: match.matchFormat || 'Standard', icon: 'fa-futbol' },
        { label: 'Formation', value: match.formation || '—', icon: 'fa-sitemap' },
    ];

    const notesHtml = match.notes
        ? `<div id="matchInfoNotes" style="margin-top:12px;padding:12px 16px;background:#f8fafc;border-radius:10px;border-left:3px solid #cbd5e1;font-size:.88rem;color:#475569;white-space:pre-wrap;">${match.notes}</div>`
        : '';

    grid.innerHTML = cells.map(c => `
        <div class="info-cell">
            <div class="label"><i class="fas ${c.icon}" style="margin-right:4px;"></i>${c.label}</div>
            <div class="value">${c.value}</div>
        </div>
    `).join('') + notesHtml;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINEUP DISPLAY — detailed table (populated from player stats after loadAndRender)
// ═══════════════════════════════════════════════════════════════════════════════

function renderLineupDisplay(match) {
    // Formation badge
    const formationEl = document.getElementById('lineupFormationDisplay');
    if (formationEl) formationEl.textContent = match.formation || '';
    // The detailed table is populated in renderLineupPlayerStats() called from loadAndRenderPlayerStats
    // Fallback simple list kept hidden unless no stats
}

function renderLineupPlayerStats(players, stats) {
    const tbody = document.getElementById('lineupDetailTableBody');
    if (!tbody) return;

    const statMap = {};
    stats.forEach(s => { statMap[s.playerId] = s; });

    const appeared = players.filter(p => statMap[p.id]?.appeared);

    if (appeared.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="ps-empty"><i class="fas fa-users"></i>No lineup recorded yet — use Edit → Lineup to add players</td></tr>';
        return;
    }

    const sorted = [...appeared].sort((a, b) => {
        const sa = statMap[a.id], sb = statMap[b.id];
        const aStart = sa?.started ? 0 : 1, bStart = sb?.started ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        const aGroup = POSITION_GROUP_ORDER[getPositionGroup(a.position)] ?? 4;
        const bGroup = POSITION_GROUP_ORDER[getPositionGroup(b.position)] ?? 4;
        return aGroup - bGroup;
    });

    let num = 1;
    let lastSection = null;
    const rows = sorted.map(p => {
        const s = statMap[p.id];
        const isStarter = s.started;
        const section = isStarter ? 'starters' : 'subs';
        let sectionRow = '';
        if (section !== lastSection) {
            sectionRow = `<tr><td colspan="5" style="background:#f8fafc;font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:7px 12px;border-top:2px solid #e2e8f0;">${isStarter ? 'Starting XI' : 'Substitutes'}</td></tr>`;
            lastSection = section;
            if (!isStarter) num = 1;
        }
        const statusDot = isStarter
            ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;font-weight:600;color:#16a34a;"><span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span>Started</span>'
            : '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;font-weight:600;color:#b45309;"><span style="width:7px;height:7px;border-radius:50%;background:#facc15;"></span>Sub</span>';
        const rowBg = isStarter ? 'rgba(34,197,94,0.06)' : 'rgba(250,204,21,0.06)';
        return `${sectionRow}<tr style="background:${rowBg};">
            <td style="text-align:left;color:#94a3b8;font-size:.82rem;">${isStarter ? num++ : '—'}</td>
            <td style="text-align:left;font-weight:600;">${p.name}</td>
            <td><span style="font-size:.76rem;color:#64748b;">${p.position || '—'}</span></td>
            <td>${statusDot}</td>
            <td style="font-weight:600;">${s.minutesPlayed || 0}'</td>
        </tr>`;
    });

    tbody.innerHTML = rows.join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS DISPLAY (comparison bars)
// ═══════════════════════════════════════════════════════════════════════════════

function renderStatsDisplay(stats) {
    const list = document.getElementById('statsListView');
    if (!list) return;

    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};

    const items = [
        { label: 'Goals', key: 'goals', max: 5 },
        { label: 'Shots', key: 'shots', max: 25 },
        { label: 'Shots on Target', key: 'shotsOnTarget', max: 15 },
        { label: 'Corners', key: 'corners', max: 15 },
        { label: 'Fouls', key: 'fouls', max: 20 },
        { label: 'Yellow Cards', key: 'yellowCards', max: 6 },
        { label: 'Red Cards', key: 'redCards', max: 2 }
    ];

    const hasData = items.some(item => (homeStats[item.key] || 0) + (awayStats[item.key] || 0) > 0);
    if (!hasData) {
        list.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:.85rem;"><i class="fas fa-chart-bar" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.35;"></i>No stats recorded yet</div>';
        return;
    }

    list.innerHTML = items.map(item => {
        const hVal = homeStats[item.key] || 0;
        const aVal = awayStats[item.key] || 0;
        const hPct = Math.min((hVal / item.max) * 100, 100);
        const aPct = Math.min((aVal / item.max) * 100, 100);
        return `
            <div class="stat-row-comparison">
                <div class="stat-label">
                    <span style="color:var(--navy-dark);">${hVal}</span>
                    <span style="text-transform:uppercase;font-size:.78rem;color:#94a3b8;">${item.label}</span>
                    <span style="color:#94a3b8;">${aVal}</span>
                </div>
                <div class="stat-bar-bg">
                    <div style="flex:1;display:flex;justify-content:flex-end;background:#f1f5f9;">
                        <div style="width:${hPct}%;background:var(--navy-dark,#1e3a5f);height:100%;border-radius:5px 0 0 5px;"></div>
                    </div>
                    <div style="width:2px;background:#fff;"></div>
                    <div style="flex:1;display:flex;justify-content:flex-start;background:#f1f5f9;">
                        <div style="width:${aPct}%;background:#94a3b8;height:100%;border-radius:0 5px 5px 0;"></div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

function renderReportDisplay(stats, match) {
    // Update team name headers in stats tab
    if (match) {
        const { home: homeName, away: awayName } = resolveTeamNames(match);
        const statsHomeName = document.getElementById('viewStatsHomeName');
        const statsAwayName = document.getElementById('viewStatsAwayName');
        if (statsHomeName) statsHomeName.textContent = homeName;
        if (statsAwayName) statsAwayName.textContent = awayName;
    }

    // New structured report fields
    const reportContent = document.getElementById('reportNewContent');
    const reportTitleEl = document.getElementById('reportTitleDisplay');

    if (reportTitleEl) {
        reportTitleEl.textContent = match?.reportTitle || '';
    }

    if (reportContent) {
        const isPlayerWatch = match?.matchType === 'player_watch';

        if (isPlayerWatch) {
            // Profile link chip
            let profileChip = '';
            if (match?.watchedPlayerId) {
                profileChip = `
                    <a href="player-profile.html?id=${match.watchedPlayerId}" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;text-decoration:none;">
                        <span style="font-size:.85rem;color:#0369a1;font-weight:600;"><i class="fas fa-user" style="margin-right:6px;"></i>View Full Player Profile</span>
                        <span style="font-size:.8rem;color:#0369a1;">Open Profile →</span>
                    </a>`;
            }

            const summary = match?.reportGeneral?.trim();
            let html = profileChip;
            if (summary) {
                html += `
                    <div class="report-phase general" style="border-color:#1e3a5f;">
                        <h5 style="color:#1e3a5f;"><i class="fas fa-comment" style="margin-right:6px;"></i>Match Summary</h5>
                        <p>${summary.replace(/\n/g, '<br>')}</p>
                    </div>`;
            }
            html += `
                <div style="display:flex;align-items:center;gap:8px;margin:16px 0 10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
                    <i class="fas fa-clipboard-check" style="color:#6366f1;font-size:.9rem;"></i>
                    <span style="font-weight:700;font-size:.88rem;color:#0f172a;">Player Assessment</span>
                </div>
                <div id="pwAssessDisplay"></div>`;
            reportContent.innerHTML = html;

            // Async-load assessment and render
            if (match?.watchedPlayerId && match?.id) {
                supabase.from('assessments')
                    .select('*').eq('player_id', match.watchedPlayerId).eq('match_id', match.id).limit(1).single()
                    .then(({ data }) => {
                        const container = document.getElementById('pwAssessDisplay');
                        if (container) _renderPwAssessmentDisplay(container, data);
                    }).catch(() => {
                        const container = document.getElementById('pwAssessDisplay');
                        if (container) _renderPwAssessmentDisplay(container, null);
                    });
            }
        } else {
            const sections = [
                { key: 'reportGeneral',      label: 'General Comments',  cls: 'general',      icon: 'fa-comment',        color: '#1e3a5f' },
                { key: 'reportAttacking',    label: 'Attacking',         cls: 'attacking',    icon: 'fa-arrow-up',       color: '#10b981' },
                { key: 'reportDefending',    label: 'Defending',         cls: 'defending',    icon: 'fa-shield-alt',     color: '#ef4444' },
                { key: 'reportIndividual',   label: 'Individual',        cls: 'individual',   icon: 'fa-user',           color: '#6366f1' },
                { key: 'reportImprovements', label: 'Areas to Improve',  cls: 'improvements', icon: 'fa-arrow-trend-up', color: '#f59e0b' },
            ];
            const filled = sections.filter(s => match?.[s.key]?.trim());
            if (filled.length === 0) {
                reportContent.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:.88rem;"><i class="fas fa-file-alt" style="font-size:1.8rem;display:block;margin-bottom:10px;opacity:.3;"></i>No report written yet.<br><span style="font-size:.82rem;">Click Edit to add a match report.</span></div>';
            } else {
                reportContent.innerHTML = filled.map(s => `
                    <div class="report-phase ${s.cls}" style="border-color:${s.color};">
                        <h5 style="color:${s.color};"><i class="fas ${s.icon}" style="margin-right:6px;"></i>${s.label}</h5>
                        <p>${(match[s.key] || '').replace(/\n/g, '<br>')}</p>
                    </div>
                `).join('');
            }
        }
    }

    // Legacy tactical phases — hide entirely for player_watch
    const isPlayerWatchMode = match?.matchType === 'player_watch';
    const legacyHasContent = !isPlayerWatchMode && (stats.tactical_timeline || stats.tactical_in_possession ||
        stats.tactical_out_possession || stats.tactical_transitions || stats.tactical_set_pieces);

    const legacySection = document.getElementById('matchReportSection');
    if (legacySection) legacySection.style.display = legacyHasContent ? 'block' : 'none';

    const renderPhase = (elementId, content) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (content && content.trim() && content !== 'No notes provided.') {
            el.innerHTML = content.replace(/\n/g, '<br>');
        } else {
            el.innerHTML = '<em style="color:#94a3b8;">No notes added.</em>';
        }
    };

    renderPhase('viewPhaseTimeline', stats.tactical_timeline);
    renderPhase('viewPhaseInPossession', stats.tactical_in_possession);
    renderPhase('viewPhaseOutPossession', stats.tactical_out_possession);
    renderPhase('viewPhaseTransitions', stats.tactical_transitions);
    renderPhase('viewPhaseSetPieces', stats.tactical_set_pieces);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS DISPLAY (videos + links)
// ═══════════════════════════════════════════════════════════════════════════════

function renderAnalysisDisplay(match) {
    const videosEl = document.getElementById('analysisVideosDisplay');
    const linksEl = document.getElementById('analysisLinksDisplay');

    const videos = Array.isArray(match.videos) ? match.videos : [];
    const links = Array.isArray(match.links) ? match.links : [];

    if (videosEl) {
        if (!videos.length) {
            videosEl.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:.85rem;">No videos added yet</div>';
        } else {
            videosEl.innerHTML = videos.map(v => {
                const url = typeof v === 'string' ? v : v.url;
                return `<div class="link-chip"><span class="chip-type">Video</span><a href="${url}" target="_blank" rel="noopener">${url}</a></div>`;
            }).join('');
        }
    }

    if (linksEl) {
        if (!links.length) {
            linksEl.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:.85rem;">No links added yet</div>';
        } else {
            linksEl.innerHTML = links.map(l => {
                const url = typeof l === 'string' ? l : l.url;
                const title = typeof l === 'string' ? l : (l.title || l.url);
                return `<div class="link-chip"><span class="chip-type">Link</span><a href="${url}" target="_blank" rel="noopener">${title}</a></div>`;
            }).join('');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT FORM FILL
// ═══════════════════════════════════════════════════════════════════════════════

function fillEditForm(match) {
    const stats = match.stats || {};
    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};
    const { home: homeName, away: awayName } = resolveTeamNames(match);

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    // Team name headers in stats tab
    setText('editHomeName', homeName);
    setText('editOpponentName', awayName);
    setText('editLineupHomeName', homeName);
    setText('editLineupAwayName', awayName);

    // Match info fields (Details edit tab)
    setVal('editHomeScore', match.homeScore ?? '');
    setVal('editAwayScore', match.awayScore ?? '');
    setVal('editHalfTimeHomeScore', match.halfTimeHomeScore ?? '');
    setVal('editHalfTimeAwayScore', match.halfTimeAwayScore ?? '');
    setVal('editMatchDate', match.date || '');
    setVal('editMatchTime', match.time || '');
    setVal('editMatchVenue', match.venue || '');
    setVal('editMatchCompetition', match.competition || '');
    setVal('editMatchNotes', match.notes || '');

    // Lineup edit tab
    setVal('editLineupFormation', match.formation || '');
    // Lineup player table populated by loadAndRenderPlayerStats → fillLineupPlayerEditTable

    // Report edit tab
    setVal('editReportTitle', match.reportTitle || '');
    setVal('editReportGeneral', match.reportGeneral || '');
    setVal('editReportAttacking', match.reportAttacking || '');
    setVal('editReportDefending', match.reportDefending || '');
    setVal('editReportIndividual', match.reportIndividual || '');
    setVal('editReportImprovements', match.reportImprovements || '');

    // Stats form (legacy stat inputs)
    const form = document.getElementById('matchStatsForm');
    if (form) {
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
    }

    // Legacy rich text editors
    const phases = [
        { id: 'editor_timeline', key: 'tactical_timeline' },
        { id: 'editor_in_possession', key: 'tactical_in_possession' },
        { id: 'editor_out_possession', key: 'tactical_out_possession' },
        { id: 'editor_transitions', key: 'tactical_transitions' },
        { id: 'editor_set_pieces', key: 'tactical_set_pieces' }
    ];
    phases.forEach(p => {
        const editor = document.getElementById(p.id);
        if (editor) editor.innerHTML = stats[p.key] || '';
    });

    // Analysis lists
    _fillEditAnalysis(match);

    // Media photos grid
    _renderEditMediaPhotosGrid(match);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS EDIT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function _fillEditAnalysis(match) {
    const videosList = document.getElementById('editVideosList');
    const linksList = document.getElementById('editLinksList');

    if (videosList) {
        videosList.innerHTML = '';
        (Array.isArray(match.videos) ? match.videos : []).forEach(v => {
            const url = typeof v === 'string' ? v : v.url;
            _appendAnalysisChip(videosList, url, null, 'Video');
        });
    }

    if (linksList) {
        linksList.innerHTML = '';
        (Array.isArray(match.links) ? match.links : []).forEach(l => {
            const url = typeof l === 'string' ? l : l.url;
            const title = typeof l === 'string' ? l : (l.title || l.url);
            _appendAnalysisChip(linksList, url, title, 'Link');
        });
    }
}

function _appendAnalysisChip(container, url, title, type) {
    const item = document.createElement('div');
    item.className = 'link-chip';
    item.dataset.url = url;
    if (title) item.dataset.title = title;
    item.innerHTML = `
        <span class="chip-type">${type}</span>
        <a href="${url}" target="_blank" rel="noopener">${title || url}</a>
        <button onclick="this.closest('.link-chip').remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:2px 6px;font-size:.9rem;flex-shrink:0;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(item);
}

function addAnalysisVideo() {
    const urlInput = document.getElementById('editVideoUrl');
    const url = urlInput?.value.trim();
    if (!url) { showToast('Enter a video URL', 'error'); return; }
    const list = document.getElementById('editVideosList');
    if (list) _appendAnalysisChip(list, url, null, 'Video');
    if (urlInput) urlInput.value = '';
}
window.addAnalysisVideo = addAnalysisVideo;

function addAnalysisLink() {
    const titleInput = document.getElementById('editLinkTitle');
    const urlInput = document.getElementById('editLinkUrl');
    const title = titleInput?.value.trim();
    const url = urlInput?.value.trim();
    if (!url) { showToast('Enter a URL', 'error'); return; }
    const list = document.getElementById('editLinksList');
    if (list) _appendAnalysisChip(list, url, title || url, 'Link');
    if (titleInput) titleInput.value = '';
    if (urlInput) urlInput.value = '';
}
window.addAnalysisLink = addAnalysisLink;

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════════════════════

async function saveStats(matchId) {
    const match = window._matchData;
    const isPlayerWatch = match?.matchType === 'player_watch';
    const form = document.getElementById('matchStatsForm');

    try {
        // 1. Match info (Details tab)
        const editDate = document.getElementById('editMatchDate')?.value;
        const editTime = document.getElementById('editMatchTime')?.value;
        const editVenue = document.getElementById('editMatchVenue')?.value;
        const editComp = document.getElementById('editMatchCompetition')?.value;
        const editNotes = document.getElementById('editMatchNotes')?.value;
        const editHomeScore = document.getElementById('editHomeScore')?.value;
        const editAwayScore = document.getElementById('editAwayScore')?.value;
        const htHome = document.getElementById('editHalfTimeHomeScore')?.value;
        const htAway = document.getElementById('editHalfTimeAwayScore')?.value;

        const homeScore = parseInt(editHomeScore) || 0;
        const awayScore = parseInt(editAwayScore) || 0;
        const halfTimeHomeScore = htHome !== '' && htHome !== undefined ? parseInt(htHome) : null;
        const halfTimeAwayScore = htAway !== '' && htAway !== undefined ? parseInt(htAway) : null;
        let result = 'Draw';
        if (homeScore > awayScore) result = 'Win';
        if (homeScore < awayScore) result = 'Loss';

        // 2. Lineup — derive from lineupPlayerEditBody table
        const formation = document.getElementById('editLineupFormation')?.value || '';
        const lineupStarters = [], lineupSubs = [];
        document.getElementById('lineupPlayerEditBody')?.querySelectorAll('tr[data-player-id]').forEach(row => {
            const appVal = row.querySelector('.ps-appearance')?.value || '';
            if (!appVal || appVal === 'unavailable') return;
            const pid = row.dataset.playerId;
            const pName = row.querySelector('td:first-child')?.textContent?.trim() || pid;
            const entry = { playerId: pid, playerName: pName };
            if (appVal === 'started') lineupStarters.push(entry);
            else if (appVal === 'sub') lineupSubs.push(entry);
        });
        const lineup = { starters: lineupStarters, subs: lineupSubs };

        // 3. Report fields
        const reportTitle = document.getElementById('editReportTitle')?.value?.trim() || null;
        const reportGeneral = document.getElementById('editReportGeneral')?.value?.trim() || null;
        const reportAttacking = document.getElementById('editReportAttacking')?.value?.trim() || null;
        const reportDefending = document.getElementById('editReportDefending')?.value?.trim() || null;
        const reportIndividual = document.getElementById('editReportIndividual')?.value?.trim() || null;
        const reportImprovements = document.getElementById('editReportImprovements')?.value?.trim() || null;

        // 4. Legacy stats
        const getEditorContent = (id) => {
            const el = document.getElementById(id);
            if (!el) return null;
            return el.innerText?.trim().length > 0 ? el.innerHTML : null;
        };

        const newStats = { home: {}, away: {} };
        const tacticalFields = [
            { key: 'tactical_timeline', id: 'editor_timeline' },
            { key: 'tactical_in_possession', id: 'editor_in_possession' },
            { key: 'tactical_out_possession', id: 'editor_out_possession' },
            { key: 'tactical_transitions', id: 'editor_transitions' },
            { key: 'tactical_set_pieces', id: 'editor_set_pieces' }
        ];
        tacticalFields.forEach(({ key, id }) => {
            const content = getEditorContent(id);
            if (content !== null) newStats[key] = content;
        });

        const summaryEl = document.getElementById('matchSummaryEdit');
        if (summaryEl) newStats.match_summary = summaryEl.value.trim();

        if (!isPlayerWatch && form) {
            const formData = new FormData(form);
            const keys = ['goals', 'shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'];
            keys.forEach(key => {
                newStats.home[key] = Number(formData.get(`home_${key}`)) || 0;
                newStats.away[key] = Number(formData.get(`away_${key}`)) || 0;
            });
        }

        // 5. Videos and links
        const collectChips = (listId) =>
            [...(document.getElementById(listId)?.querySelectorAll('.link-chip') || [])]
                .map(chip => chip.dataset.title
                    ? { url: chip.dataset.url, title: chip.dataset.title }
                    : chip.dataset.url
                );

        const videos = collectChips('editVideosList');
        const links = collectChips('editLinksList');

        // Save all in parallel
        await Promise.all([
            matchManager.updateMatchInfo(matchId, {
                homeScore,
                awayScore,
                halfTimeHomeScore,
                halfTimeAwayScore,
                result,
                date: editDate || match.date,
                time: editTime || match.time,
                venue: editVenue !== undefined ? editVenue : match.venue,
                competition: editComp !== undefined ? editComp : match.competition,
                notes: editNotes !== undefined ? editNotes : match.notes,
                formation,
                lineup,
                reportTitle,
                reportGeneral,
                reportAttacking,
                reportDefending,
                reportIndividual,
                reportImprovements,
                videos,
                links,
            }),
            matchManager.updateMatchStats(matchId, newStats),
        ]);

        // 6. Player stats
        const playerStatsArray = collectPlayerStatsFromForm();
        if (playerStatsArray.length > 0) {
            await matchManager.saveMatchPlayerStats(matchId, playerStatsArray);
        }

        // 7. Player_watch inline assessment save
        if (isPlayerWatch && match.watchedPlayerId) {
            const saveDate = editDate || match.date || new Date().toISOString().slice(0, 10);
            await _savePwInlineAssessment(matchId, match.watchedPlayerId, saveDate);
        }

        // 9. Recalc player season stats pipeline
        if (playerStatsArray.length > 0 && matchId) {
            const seasonId = window._matchData?.seasonId || null;
            if (seasonId) {
                await Promise.all(playerStatsArray.map(ps =>
                    matchManager.recalcPlayerSeasonStats(ps.playerId, seasonId)
                ));
            }
        }

        // 10. Re-fetch and re-render
        await matchManager.init();
        const updatedMatch = await matchManager.getMatch(matchId);
        if (!updatedMatch) { console.error('Could not reload match after save'); return; }
        window._matchData = updatedMatch;

        renderMatchInfo(updatedMatch);
        renderMatchInfoGrid(updatedMatch);
        renderLineupDisplay(updatedMatch);
        renderStatsDisplay(updatedMatch.stats || {});
        renderReportDisplay(updatedMatch.stats || {}, updatedMatch);
        renderAnalysisDisplay(updatedMatch);
        _renderMediaPhotosDisplay(updatedMatch);
        fillEditForm(updatedMatch);
        await loadAndRenderPlayerStats(updatedMatch);

        // Switch back to display
        const editMode = document.getElementById('editMode');
        const displayMode = document.getElementById('displayMode');
        const btnSave = document.getElementById('btnSaveStats');
        const btnToggle = document.getElementById('btnToggleEdit');
        if (editMode) editMode.style.display = 'none';
        if (displayMode) displayMode.style.display = 'block';
        if (btnSave) btnSave.style.display = 'none';
        if (btnToggle) btnToggle.innerHTML = '<i class="fas fa-edit"></i> Edit';

        _resetMdDirty();
        showToast('Match saved successfully!', 'success');

    } catch (error) {
        console.error('Error saving match:', error);
        showToast('Failed to save. Please try again.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

function downloadReportPDF() {
    if (!window.jspdf) { showToast('PDF library not loaded', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const match = window._matchData || {};
    const isPlayerWatch = match.matchType === 'player_watch';
    const { home: homeName, away: awayName } = resolveTeamNames(match);
    const hScore = match.homeScore !== undefined ? match.homeScore : 0;
    const aScore = match.awayScore !== undefined ? match.awayScore : 0;
    const matchMeta = document.getElementById('matchMeta')?.textContent || match.date || '';

    let watchedName = '';
    if (isPlayerWatch && match.watchedPlayerId) {
        const wp = squadManager.getPlayers({}).find(p => String(p.id) === String(match.watchedPlayerId));
        watchedName = wp ? wp.name : '';
    }

    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const contentW = PW - (margin * 2);

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(isPlayerWatch ? 'PLAYER OBSERVATION REPORT' : 'MATCH REPORT', margin, 25);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`SENTINEL FOOTBALL HUB · ${matchMeta}`, margin, 33);

    let y = 55;

    doc.setFillColor(241, 245, 249);
    if (isPlayerWatch) {
        doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
        doc.setTextColor(30, 58, 138);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${homeName} vs ${awayName}`, PW / 2, y + 10, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        const observingLine = watchedName ? `Observing: ${watchedName}` : 'Individual Player Observation';
        const contextLine = [match.competition, `${hScore} – ${aScore}`].filter(Boolean).join(' · ');
        doc.text(observingLine, PW / 2, y + 19, { align: 'center' });
        if (contextLine) doc.text(contextLine, PW / 2, y + 26, { align: 'center' });
    } else {
        doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
        doc.setTextColor(30, 58, 138);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${homeName} vs ${awayName}`, PW / 2, y + 12, { align: 'center' });
        doc.setFontSize(18);
        doc.text(`${hScore} - ${aScore}`, PW / 2, y + 22, { align: 'center' });
    }
    y += 45;

    // Report sections — player_watch uses scout labels
    const sections = isPlayerWatch ? [
        { label: 'Match Context',       value: match.reportGeneral },
        { label: 'Technical Quality',   value: match.reportAttacking },
        { label: 'Physical & Athletic', value: match.reportDefending },
        { label: 'Mental & Character',  value: match.reportIndividual },
        { label: 'Recommendation',      value: match.reportImprovements },
    ] : [
        { label: 'General Comments', value: match.reportGeneral },
        { label: 'Attacking',        value: match.reportAttacking },
        { label: 'Defending',        value: match.reportDefending },
        { label: 'Individual',       value: match.reportIndividual },
        { label: 'Areas to Improve', value: match.reportImprovements },
    ];

    sections.forEach(s => {
        if (!s.value?.trim()) return;
        if (y > 240) { doc.addPage(); y = 20; }
        y += 8;
        doc.setFontSize(12);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text(s.label.toUpperCase(), margin, y);
        y += 6;
        doc.setFontSize(10);
        doc.setTextColor(60);
        doc.setFont('helvetica', 'normal');
        const split = doc.splitTextToSize(s.value.replace(/<[^>]*>/g, ''), contentW);
        doc.text(split, margin, y);
        y += (split.length * 5) + 5;
    });

    // Legacy tactical sections — skip entirely for player_watch
    const stats = match.stats || {};
    const tacticalPhases = isPlayerWatch ? [] : [
        { title: 'In Possession', content: stats.tactical_in_possession },
        { title: 'Out of Possession', content: stats.tactical_out_possession },
        { title: 'Transitions', content: stats.tactical_transitions },
        { title: 'Set Pieces', content: stats.tactical_set_pieces }
    ];
    tacticalPhases.forEach(phase => {
        if (!phase.content?.trim()) return;
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
        const split = doc.splitTextToSize(phase.content.replace(/<[^>]*>/g, ''), contentW);
        doc.text(split, margin, y);
        y += (split.length * 5) + 5;
    });

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated on ${new Date().toLocaleString()} | Sentinel Football Hub`, PW / 2, 285, { align: 'center' });

    const filename = isPlayerWatch
        ? `Player_Watch_${watchedName || 'Player'}_${homeName}_vs_${awayName}_${match.date || ''}.pdf`.replace(/\s+/g, '_')
        : `Match_Report_${homeName}_vs_${awayName}_${match.date || ''}.pdf`.replace(/\s+/g, '_');
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

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER PERFORMANCE STATS
// ═══════════════════════════════════════════════════════════════════════════════

const RATING_LABELS = ['', 'Poor', 'Below Avg', 'Average', 'Above Avg', 'Excellent'];
const APPEARANCE_OPTIONS = [
    { value: '', label: 'Not in Squad' },
    { value: 'unavailable', label: 'Unavailable' },
    { value: 'started', label: 'Started' },
    { value: 'sub', label: 'Substitute' }
];
const _MD_UNAVAIL_STATUSES = new Set(['injured', 'sick', 'suspended', 'unavailable']);

function ensureMdConfirmModal() {
    if (document.getElementById('mdConfirmModal')) return;
    const el = document.createElement('div');
    el.id = 'mdConfirmModal';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-container" style="max-width:380px;">
            <div class="modal-header"><h2 id="mdConfirmTitle" style="font-size:1rem;font-weight:700;margin:0;"></h2></div>
            <div class="modal-body" style="padding:16px 20px;"><p id="mdConfirmMsg" style="font-size:.88rem;color:#475569;margin:0;line-height:1.6;"></p></div>
            <div class="modal-footer">
                <button id="mdConfirmCancel" class="dash-btn outline">Cancel</button>
                <button id="mdConfirmOk" class="dash-btn primary">Add Anyway</button>
            </div>
        </div>`;
    document.body.appendChild(el);
}
function mdConfirm(title, msg) {
    ensureMdConfirmModal();
    return new Promise(resolve => {
        document.getElementById('mdConfirmTitle').textContent = title;
        document.getElementById('mdConfirmMsg').textContent = msg;
        const modal = document.getElementById('mdConfirmModal');
        modal.classList.add('active');
        const settle = (v) => { modal.classList.remove('active'); resolve(v); };
        const ok = document.getElementById('mdConfirmOk');
        const cancel = document.getElementById('mdConfirmCancel');
        const ok2 = ok.cloneNode(true); ok.parentNode.replaceChild(ok2, ok);
        const c2 = cancel.cloneNode(true); cancel.parentNode.replaceChild(c2, cancel);
        document.getElementById('mdConfirmOk').addEventListener('click', () => settle(true), { once: true });
        document.getElementById('mdConfirmCancel').addEventListener('click', () => settle(false), { once: true });
        modal.addEventListener('click', e => { if (e.target === modal) settle(false); }, { once: true });
    });
}

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
        const allPlayers = squadManager.getPlayers({});
        const watched = allPlayers.find(p => String(p.id) === String(match.watchedPlayerId));
        players = watched ? [watched] : [];
    } else {
        players = squadManager.getPlayers({ squadId: match.squadId });
    }

    let stats = await matchManager.getMatchPlayerStats(match.id);

    let hasPlan = false;
    const matchPlanEnabled = window._profile?.clubs?.settings?.features?.match_planning !== false;
    if (stats.length === 0 && matchPlanEnabled) {
        const plan = await matchManager.getMatchPlan(match.id);
        if (plan?.data?.squad) {
            hasPlan = true;
            const xiIds = plan.data.squad.startingXI || [];
            const subIds = plan.data.squad.substitutes || [];
            stats = players.map(p => ({
                playerId: p.id,
                appeared: xiIds.includes(p.id) || subIds.includes(p.id),
                started: xiIds.includes(p.id),
                minutesPlayed: xiIds.includes(p.id) ? 90 : 0,
                goals: 0, assists: 0, yellowCards: 0, redCards: 0,
                rating: null, motm: false, notes: '',
                _fromPlan: true,
                _inSquad: xiIds.includes(p.id) || subIds.includes(p.id)
            }));
        }
    }

    // Fallback: if still no stats, use match.lineup (set via Add Match or match plan drag-drop save)
    if (stats.length === 0 && (match.lineup?.starters?.length > 0 || match.lineup?.subs?.length > 0)) {
        const starterIds = (match.lineup.starters || []).map(e => String(e.playerId || e.player_id || ''));
        const subIds = (match.lineup.subs || []).map(e => String(e.playerId || e.player_id || ''));
        stats = players.map(p => ({
            playerId: p.id,
            appeared: starterIds.includes(String(p.id)) || subIds.includes(String(p.id)),
            started: starterIds.includes(String(p.id)),
            minutesPlayed: starterIds.includes(String(p.id)) ? 90 : 0,
            goals: 0, assists: 0, saves: 0, cleanSheet: false,
            yellowCards: 0, redCards: 0, rating: null, motm: false, notes: '',
            _fromLineup: true,
            _inSquad: starterIds.includes(String(p.id)) || subIds.includes(String(p.id))
        }));
    }

    renderLineupPlayerStats(players, stats);
    renderPlayerStatsDisplay(players, stats);
    fillLineupPlayerEditTable(players, stats, hasPlan);
    fillPlayerStatsEditForm(players, stats);

    const summaryDisplay = document.getElementById('matchSummaryDisplay');
    const summaryEdit = document.getElementById('matchSummaryEdit');
    const summary = match.stats?.match_summary || '';
    if (summaryDisplay) {
        summaryDisplay.innerHTML = summary
            ? summary.replace(/\n/g, '<br>')
            : '<em style="color:#94a3b8;">No match summary added yet.</em>';
    }
    if (summaryEdit) summaryEdit.value = summary;
}

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

    const renderPlan = (key, label) => {
        const p = data[key];
        if (!p) return '';
        const players = squadManager.getPlayers({ squadId: match.squadId });
        const playerMap = {};
        players.forEach(pl => { playerMap[pl.id] = pl; });

        const xiList = (p.xi || []).map(id => playerMap[id]).filter(Boolean)
            .map(pl => `<span style="display:inline-block;background:#1e3a8a;color:#fff;padding:3px 10px;border-radius:12px;font-size:.78rem;font-weight:600;margin:2px 3px;">${esc(pl.name)}</span>`).join('');
        const subList = (p.subs || []).map(id => playerMap[id]).filter(Boolean)
            .map(pl => `<span style="display:inline-block;background:#f1f5f9;color:#475569;padding:3px 10px;border-radius:12px;font-size:.78rem;font-weight:600;margin:2px 3px;">${esc(pl.name)}</span>`).join('');
        const extraHTML = (p.extraSections || []).map(s =>
            `<div style="margin-top:10px;"><strong style="font-size:.85rem;color:var(--navy-dark);">${esc(s.title)}</strong><p style="margin:4px 0 0;font-size:.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(s.body)}</p></div>`
        ).join('');

        return `<div class="report-card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h4 style="font-size:.85rem;text-transform:uppercase;color:var(--navy-dark);margin:0;font-weight:700;border-bottom:2px solid var(--navy-dark);display:inline-block;padding-bottom:4px;">${label}</h4>
                <span style="background:#f1f5f9;padding:3px 10px;border-radius:6px;font-size:.8rem;font-weight:600;color:#475569;">${esc(p.formation || '--')}</span>
            </div>
            ${xiList ? `<div style="margin-bottom:8px;"><span style="font-size:.78rem;font-weight:700;color:var(--text-medium);text-transform:uppercase;letter-spacing:.5px;">Starting XI</span><div style="margin-top:4px;">${xiList}</div></div>` : ''}
            ${subList ? `<div style="margin-bottom:8px;"><span style="font-size:.78rem;font-weight:700;color:var(--text-medium);text-transform:uppercase;letter-spacing:.5px;">Substitutes</span><div style="margin-top:4px;">${subList}</div></div>` : ''}
            ${p.notes ? `<div style="margin-top:8px;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:.9rem;color:var(--navy-dark);white-space:pre-wrap;">${esc(p.notes)}</div>` : ''}
            ${extraHTML}
        </div>`;
    };

    const renderPhaseNotes = (phaseData, label, color) => {
        if (!phaseData) return '';
        const entries = Object.entries(phaseData).filter(([, v]) => v?.notes);
        if (entries.length === 0) return '';
        return `<div class="report-card" style="margin-bottom:16px;">
            <h4 style="font-size:.85rem;text-transform:uppercase;color:${color};margin-bottom:10px;font-weight:700;border-bottom:2px solid ${color};display:inline-block;padding-bottom:4px;">${label}</h4>
            ${entries.map(([zone, v]) => `<div style="margin-bottom:8px;"><strong style="font-size:.82rem;color:var(--navy-dark);">${zone.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</strong><p style="margin:4px 0 0;font-size:.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(v.notes)}</p></div>`).join('')}
        </div>`;
    };

    let html = '';
    html += renderPlan('planA', 'Plan A — Starting Formation');
    html += renderPlan('planB', 'Plan B — Alternative');
    html += renderPlan('planC', 'Plan C — Trailing');
    html += renderPhaseNotes(data.offense, 'Offensive Plan', '#10b981');
    html += renderPhaseNotes(data.defense, 'Defensive Plan', '#ef4444');

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
                <h4 style="font-size:.85rem;text-transform:uppercase;color:#6366f1;margin-bottom:10px;font-weight:700;border-bottom:2px solid #6366f1;display:inline-block;padding-bottom:4px;">Set Pieces</h4>
                ${takers.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${takers.map(t => `<span style="background:#f1f5f9;padding:4px 12px;border-radius:6px;font-size:.82rem;color:#475569;">${t}</span>`).join('')}</div>` : ''}
                ${sp.cornersFor?.notes ? `<div style="margin-bottom:6px;"><strong style="font-size:.82rem;color:var(--navy-dark);">Corners For Us</strong><p style="margin:4px 0 0;font-size:.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(sp.cornersFor.notes)}</p></div>` : ''}
                ${sp.cornersAgainst?.notes ? `<div><strong style="font-size:.82rem;color:var(--navy-dark);">Corners Against Us</strong><p style="margin:4px 0 0;font-size:.9rem;color:var(--text-medium);white-space:pre-wrap;">${esc(sp.cornersAgainst.notes)}</p></div>` : ''}
            </div>`;
        }
    }

    content.innerHTML = html || '<p style="color:var(--text-secondary);font-size:.9rem;">Match plan is empty.</p>';
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

    const sorted = [...players].filter(p => statMap[p.id]?.appeared).sort((a, b) => {
        const sa = statMap[a.id], sb = statMap[b.id];
        const aStart = sa?.started ? 0 : 1, bStart = sb?.started ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        const aGroup = POSITION_GROUP_ORDER[getPositionGroup(a.position)] ?? 4;
        const bGroup = POSITION_GROUP_ORDER[getPositionGroup(b.position)] ?? 4;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.name.localeCompare(b.name);
    });

    let totalGoals = 0, totalAssists = 0, totalSaves = 0;
    let lastSection = null;
    let lastPosGroup = null;

    const rows = sorted.map(p => {
        const s = statMap[p.id];
        const posGroup = getPositionGroup(p.position);
        const isGK = posGroup === 'GK';
        if (isGK) totalSaves += s.saves || 0;
        else { totalGoals += s.goals || 0; totalAssists += s.assists || 0; }

        const section = s.started ? 'started' : 'sub';
        const rowColor = s.started ? 'rgba(34,197,94,0.08)' : 'rgba(250,204,21,0.08)';

        let headers = '';
        // Position group header (first appearance of group)
        if (posGroup !== lastPosGroup) {
            const groupLabel = POSITION_GROUP_LABELS[posGroup] || 'Other';
            let colNote = '';
            if (isGK) colNote = ' <span style="font-weight:400;opacity:.65;font-size:.72rem;text-transform:none;letter-spacing:0;">CS &amp; Saves</span>';
            else if (posGroup === 'DEF') colNote = ' <span style="font-weight:400;opacity:.65;font-size:.72rem;text-transform:none;letter-spacing:0;">Goals · Assists · CS</span>';
            headers += `<tr><td colspan="10" style="background:#f1f5f9;font-weight:700;font-size:.73rem;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:5px 12px;border-top:1px solid #e2e8f0;">${groupLabel}${colNote}</td></tr>`;
            lastPosGroup = posGroup;
        }
        // Started / Sub section header within group
        if (section !== lastSection) {
            const label = section === 'started' ? 'Starting XI' : 'Substitutes';
            headers += `<tr><td colspan="10" style="background:#f8fafc;font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:.3px;color:#94a3b8;padding:5px 12px;border-top:1px solid #e2e8f0;">${label}</td></tr>`;
            lastSection = section;
        }

        const caution = cautionFromStat(s);
        let yellowHTML = '--', redHTML = '--';
        if (caution === 'yellow') { yellowHTML = '<span style="display:inline-block;width:12px;height:16px;background:#facc15;border-radius:2px;"></span> 1'; }
        else if (caution === '2yellow') { yellowHTML = '<span style="display:inline-block;width:12px;height:16px;background:#facc15;border-radius:2px;"></span> 2'; redHTML = '<span style="display:inline-block;width:12px;height:16px;background:#ef4444;border-radius:2px;"></span> 1'; }
        else if (caution === 'red') { redHTML = '<span style="display:inline-block;width:12px;height:16px;background:#ef4444;border-radius:2px;"></span> 1'; }

        const ratingHTML = s.rating ? `<span class="ps-rating-badge ps-rating-${s.rating}">${RATING_LABELS[s.rating]}</span>` : '--';
        const motmHTML = s.motm ? '<i class="fas fa-trophy ps-motm"></i>' : '';

        const isDEF = posGroup === 'DEF';
        let col3, col4, col5;
        if (isGK) {
            const csIcon = s.cleanSheet
                ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#16a34a;border-radius:12px;padding:2px 8px;font-size:.75rem;font-weight:700;"><i class="fas fa-check"></i> CS</span>'
                : '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#94a3b8;border-radius:12px;padding:2px 8px;font-size:.75rem;">No CS</span>';
            col3 = `<td>${csIcon}</td>`;
            col4 = `<td style="font-weight:600;">${s.saves || 0}<span style="font-size:.72rem;color:#94a3b8;margin-left:2px;">saves</span></td>`;
            col5 = `<td style="color:#cbd5e1;">—</td>`;
        } else if (isDEF) {
            const csIcon = s.cleanSheet
                ? '<span style="display:inline-flex;align-items:center;gap:3px;background:#dcfce7;color:#16a34a;border-radius:10px;padding:1px 7px;font-size:.72rem;font-weight:700;"><i class="fas fa-shield-alt"></i> CS</span>'
                : '';
            col3 = `<td>${s.goals || 0}</td>`;
            col4 = `<td>${s.assists || 0}</td>`;
            col5 = `<td>${csIcon || '<span style="color:#cbd5e1;">—</span>'}</td>`;
        } else {
            col3 = `<td>${s.goals || 0}</td>`;
            col4 = `<td>${s.assists || 0}</td>`;
            col5 = `<td style="color:#cbd5e1;">—</td>`;
        }

        return `${headers}<tr style="background:${rowColor};">
            <td>${p.name}</td>
            <td>${p.position || '--'}</td>
            ${col3}
            ${col4}
            ${col5}
            <td>${yellowHTML}</td>
            <td>${redHTML}</td>
            <td>${ratingHTML}</td>
            <td>${motmHTML}</td>
            <td style="font-size:.8rem;color:#64748b;">${(s.notes || '').replace(/</g,'&lt;') || '--'}</td>
        </tr>`;
    });

    rows.push(`<tr class="ps-totals">
        <td colspan="2">TOTALS (${appeared.length} appeared)</td>
        <td>${totalGoals} <span style="font-size:.72rem;opacity:.6;">goals</span></td>
        <td>${totalAssists} <span style="font-size:.72rem;opacity:.6;">ast</span></td>
        <td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>`);

    tbody.innerHTML = rows.join('');
}

// ─── LINEUP EDIT TABLE (Status + Mins) ──────────────────────────────────────

function fillLineupPlayerEditTable(players, stats, hasPlan = false) {
    const tbody = document.getElementById('lineupPlayerEditBody');
    if (!tbody) return;

    showSquadSourceBanner(hasPlan, players, stats);

    const statMap = {};
    stats.forEach(s => { statMap[s.playerId] = s; });

    const sorted = _sortPlayersByAppearance(players, statMap);
    const appOptions = APPEARANCE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    let lastPosGroup = null;
    tbody.innerHTML = sorted.map(p => {
        const s = statMap[p.id] || {};
        const appVal = appearanceFromStat(s);
        const squadPlayer = squadManager.getPlayers({}).find(pl => String(pl.id) === String(p.id));
        const playerStatus = squadPlayer?.playerStatus || 'active';
        // Default to 'unavailable' in the dropdown if player has unavailable status and hasn't already appeared.
        // Never apply this in player_watch mode — the watched player is always considered to have appeared.
        const isPlayerWatchMode = window._matchData?.matchType === 'player_watch';
        const effectiveAppVal = (!isPlayerWatchMode && !s.appeared && _MD_UNAVAIL_STATUSES.has(playerStatus)) ? 'unavailable' : appVal;
        const minutes = s.minutesPlayed || (effectiveAppVal === 'started' ? 90 : 0);
        let rowStyle = '';
        if (effectiveAppVal === 'started') rowStyle = 'background:rgba(34,197,94,0.08);';
        else if (effectiveAppVal === 'sub') rowStyle = 'background:rgba(250,204,21,0.08);';
        else if (effectiveAppVal === 'unavailable') rowStyle = 'background:rgba(239,68,68,0.04);opacity:0.75;';

        const group = getPositionGroup(p.position);
        let groupHeader = '';
        if (group !== lastPosGroup) {
            groupHeader = `<tr><td colspan="4" style="background:#f1f5f9;font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:6px 12px;border-top:1px solid #e2e8f0;">${POSITION_GROUP_LABELS[group] || 'Other'}</td></tr>`;
            lastPosGroup = group;
        }

        return `${groupHeader}<tr data-player-id="${p.id}" data-player-status="${playerStatus}" style="${rowStyle}">
            <td style="font-weight:600;">${p.name}</td>
            <td><span class="ps-pos-badge" style="margin:0;">${p.position || '--'}</span></td>
            <td><select class="ps-appearance" data-original-status="${playerStatus}">${appOptions.replace(`value="${effectiveAppVal}"`, `value="${effectiveAppVal}" selected`)}</select></td>
            <td><input type="number" class="ps-minutes" value="${minutes}" min="0" max="120" style="width:58px;" ${(!effectiveAppVal || effectiveAppVal === 'unavailable') ? 'disabled' : ''}></td>
        </tr>`;
    }).join('');

    const countStarters = () => Array.from(tbody.querySelectorAll('.ps-appearance')).filter(s => s.value === 'started').length;

    tbody.querySelectorAll('.ps-appearance').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const row = e.target.closest('tr');
            const val = e.target.value;
            const originalStatus = e.target.dataset.originalStatus;
            const playerName = row.querySelector('td:first-child')?.textContent?.trim() || 'This player';

            // Confirm if changing an unavailable player to started/sub
            if (_MD_UNAVAIL_STATUSES.has(originalStatus) && (val === 'started' || val === 'sub')) {
                const statusLabel = originalStatus.charAt(0).toUpperCase() + originalStatus.slice(1);
                const ok = await mdConfirm(
                    'Player Unavailable',
                    `${playerName} is marked as ${statusLabel}. Add them to the lineup anyway?`
                );
                if (!ok) {
                    e.target.value = 'unavailable';
                    row.style.background = 'rgba(239,68,68,0.04)';
                    row.style.opacity = '0.75';
                    return;
                }
            }

            if (val === 'started' && countStarters() > 11) {
                e.target.value = 'sub';
                showToast('Maximum 11 starters allowed', 'error');
                return;
            }
            const minutesInput = row.querySelector('.ps-minutes');
            if (val === 'started' || val === 'sub') {
                row.classList.remove('ps-row-disabled');
                row.style.opacity = '1';
                if (minutesInput) { minutesInput.disabled = false; if (val === 'started' && parseInt(minutesInput.value) === 0) minutesInput.value = 90; }
            } else {
                row.classList.add('ps-row-disabled');
                if (minutesInput) { minutesInput.disabled = true; minutesInput.value = 0; }
            }
            if (val === 'started') row.style.background = 'rgba(34,197,94,0.08)';
            else if (val === 'sub') row.style.background = 'rgba(250,204,21,0.08)';
            else if (val === 'unavailable') { row.style.background = 'rgba(239,68,68,0.04)'; row.style.opacity = '0.75'; }
            else row.style.background = '';
        });
    });

    const btnSelectAll = document.getElementById('btnSelectAllAppeared');
    if (btnSelectAll) {
        btnSelectAll.onclick = null;
        btnSelectAll.addEventListener('click', () => {
            let starterCount = countStarters();
            tbody.querySelectorAll('.ps-appearance').forEach(sel => {
                if (starterCount < 11 && !sel.value) {
                    sel.value = 'started';
                    sel.dispatchEvent(new Event('change'));
                    starterCount++;
                }
            });
        });
    }
}

// ─── STATS EDIT TABLE (Goals, Assists, Cautions, Rating, Notes) ──────────────

function fillPlayerStatsEditForm(players, stats, hasPlan = false) {
    const tbody = document.getElementById('playerStatsEditBody');
    const motmSelect = document.getElementById('motmSelect');
    if (!tbody) return;

    const statMap = {};
    stats.forEach(s => { statMap[s.playerId] = s; });

    const sorted = _sortPlayersByAppearance(players, statMap);

    if (motmSelect) {
        motmSelect.innerHTML = '<option value="">-- None --</option>' +
            sorted.map(p => {
                const isMOTM = statMap[p.id]?.motm;
                return `<option value="${p.id}"${isMOTM ? ' selected' : ''}>${p.name}</option>`;
            }).join('');
    }

    const cautionOpts = CAUTION_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const ratingOptions = '<option value="">--</option>' + [1,2,3,4,5].map(v => `<option value="${v}">${v}/5</option>`).join('');

    let lastPosGroup = null;
    tbody.innerHTML = sorted.map(p => {
        const s = statMap[p.id] || {};
        const appVal = appearanceFromStat(s);
        const cautionVal = cautionFromStat(s);
        let rowStyle = '';
        if (appVal === 'started') rowStyle = 'background:rgba(34,197,94,0.08);';
        else if (appVal === 'sub') rowStyle = 'background:rgba(250,204,21,0.08);';

        const group = getPositionGroup(p.position);
        const isGK = group === 'GK';
        const isDEF = group === 'DEF';
        let groupHeader = '';
        if (group !== lastPosGroup) {
            const groupLabel = POSITION_GROUP_LABELS[group] || 'Other';
            let colNote = '';
            if (isGK) colNote = ' <span style="font-weight:400;opacity:.7;text-transform:none;letter-spacing:0;">— Clean Sheet &amp; Saves</span>';
            else if (isDEF) colNote = ' <span style="font-weight:400;opacity:.7;text-transform:none;letter-spacing:0;">— Goals, Assists &amp; Clean Sheet</span>';
            groupHeader = `<tr><td colspan="9" style="background:#f1f5f9;font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:6px 12px;border-top:1px solid #e2e8f0;">${groupLabel}${colNote}</td></tr>`;
            lastPosGroup = group;
        }

        // col3: CS checkbox (GK) or Goals input (outfield)
        const col3 = isGK
            ? `<td><label style="display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;"><input type="checkbox" class="ps-clean-sheet"${s.cleanSheet ? ' checked' : ''}><span style="font-size:.75rem;color:#64748b;white-space:nowrap;">CS</span></label></td>`
            : `<td><input type="number" class="ps-goals" value="${s.goals || 0}" min="0" max="10"></td>`;
        // col4: Saves input (GK) or Assists input (outfield)
        const col4 = isGK
            ? `<td><input type="number" class="ps-saves" value="${s.saves || 0}" min="0" max="30" style="width:54px;"></td>`
            : `<td><input type="number" class="ps-assists" value="${s.assists || 0}" min="0" max="10"></td>`;
        // col5: CS checkbox (DEF), NA for everyone else
        const col5 = isDEF
            ? `<td><label style="display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;"><input type="checkbox" class="ps-clean-sheet"${s.cleanSheet ? ' checked' : ''}><span style="font-size:.75rem;color:#64748b;white-space:nowrap;">CS</span></label></td>`
            : isGK ? `<td style="color:#cbd5e1;text-align:center;font-size:.8rem;">—</td>`
            : `<td style="color:#cbd5e1;text-align:center;font-size:.8rem;">—</td>`;

        return `${groupHeader}<tr data-player-id="${p.id}" data-position="${group}" style="${rowStyle}">
            <td style="font-weight:600;">${p.name}</td>
            <td><span class="ps-pos-badge" style="margin:0;">${p.position || '--'}</span></td>
            ${col3}
            ${col4}
            ${col5}
            <td><select class="ps-caution">${cautionOpts.replace(`value="${cautionVal}"`, `value="${cautionVal}" selected`)}</select></td>
            <td><select class="ps-rating">${s.rating ? ratingOptions.replace(`value="${s.rating}"`, `value="${s.rating}" selected`) : ratingOptions}</select></td>
            <td><button type="button" class="ps-assess-btn" title="Full Assessment" style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:.75rem;color:#6366f1;white-space:nowrap;" data-player-id="${p.id}" data-player-name="${p.name}"><i class="fas fa-clipboard-check"></i></button></td>
            <td><input type="text" class="ps-notes" value="${(s.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.ps-assess-btn').forEach(btn => {
        if (hasFeature('match_assessment_modal')) {
            btn.addEventListener('click', () => openAssessmentModal(btn.dataset.playerId, btn.dataset.playerName));
        } else {
            btn.style.opacity = '0.4';
            btn.style.cursor = 'default';
            btn.title = 'Pro feature — upgrade to unlock';
            btn.addEventListener('click', e => { e.stopPropagation(); showUpgradeToast('pro', 'Player Assessment'); });
        }
    });

    // Populate Add Event player dropdown
    const eventSel = document.getElementById('eventPlayerSelect');
    if (eventSel) {
        eventSel.innerHTML = '<option value="">Select player…</option>' +
            sorted.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

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

function _sortPlayersByAppearance(players, statMap) {
    return [...players].sort((a, b) => {
        const sa = statMap[a.id], sb = statMap[b.id];
        const aStart = sa?.started ? 0 : (sa?.appeared || sa?._inSquad ? 1 : 2);
        const bStart = sb?.started ? 0 : (sb?.appeared || sb?._inSquad ? 1 : 2);
        if (aStart !== bStart) return aStart - bStart;
        const aGroup = POSITION_GROUP_ORDER[getPositionGroup(a.position)] ?? 4;
        const bGroup = POSITION_GROUP_ORDER[getPositionGroup(b.position)] ?? 4;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.name.localeCompare(b.name);
    });
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
        icon.style.background = '#dcfce7'; icon.style.color = '#16a34a';
        icon.innerHTML = '<i class="fas fa-clipboard-check"></i>';
        title.textContent = 'Squad imported from Match Plan';
        subtitle.textContent = `${xiCount} starting, ${subCount} substitutes — adjust appearances below as needed`;
        actions.innerHTML = '';
    } else if (players.length > 0) {
        banner.style.display = 'block';
        icon.style.background = '#fef3c7'; icon.style.color = '#d97706';
        icon.innerHTML = '<i class="fas fa-users-cog"></i>';
        title.textContent = 'No match plan linked — select squad below';
        subtitle.textContent = 'Use the Appearance dropdown per player, or use quick-select buttons';
        actions.innerHTML = `
            <button type="button" class="ps-select-all-btn" onclick="quickSelectXI()"><i class="fas fa-star"></i> Quick Select XI</button>
            <button type="button" class="ps-select-all-btn" onclick="quickClearAll()"><i class="fas fa-undo"></i> Clear All</button>`;
    } else {
        banner.style.display = 'none';
    }
}

function quickSelectXI() {
    const tbody = document.getElementById('lineupPlayerEditBody');
    if (!tbody) return;
    let count = 0;
    tbody.querySelectorAll('.ps-appearance').forEach(sel => {
        if (count < 11 && !sel.value) {
            sel.value = 'started';
            sel.dispatchEvent(new Event('change'));
            count++;
        }
    });
    showToast(`${count} players set as Starting XI`, 'info');
}
window.quickSelectXI = quickSelectXI;

function quickClearAll() {
    const tbody = document.getElementById('lineupPlayerEditBody');
    if (!tbody) return;
    tbody.querySelectorAll('.ps-appearance').forEach(sel => {
        sel.value = '';
        sel.dispatchEvent(new Event('change'));
    });
    showToast('All appearances cleared', 'info');
}
window.quickClearAll = quickClearAll;

function collectPlayerStatsFromForm() {
    const motmPlayerId = document.getElementById('motmSelect')?.value || '';

    // 1. Appearance + minutes from Lineup table
    const lineupMap = {};
    document.getElementById('lineupPlayerEditBody')?.querySelectorAll('tr[data-player-id]').forEach(row => {
        const pid = row.dataset.playerId;
        const appVal = row.querySelector('.ps-appearance')?.value || '';
        const mins = parseInt(row.querySelector('.ps-minutes')?.value) || 0;
        const { appeared, started } = statFromAppearance(appVal, mins);
        lineupMap[pid] = { appeared, started, minutesPlayed: appeared ? mins : 0 };
    });

    // 2. Performance data from Stats table — merge with lineup
    const result = [];
    document.getElementById('playerStatsEditBody')?.querySelectorAll('tr[data-player-id]').forEach(row => {
        const pid = row.dataset.playerId;
        const posGroup = row.dataset.position;
        const isGK = posGroup === 'GK';
        const isDEF = posGroup === 'DEF';
        const lineup = lineupMap[pid] || { appeared: false, started: false, minutesPlayed: 0 };
        const cautionVal = row.querySelector('.ps-caution')?.value || '';
        const { yellowCards, redCards } = statFromCaution(cautionVal);
        result.push({
            playerId: pid,
            ...lineup,
            goals: isGK ? 0 : (parseInt(row.querySelector('.ps-goals')?.value) || 0),
            assists: isGK ? 0 : (parseInt(row.querySelector('.ps-assists')?.value) || 0),
            saves: isGK ? (parseInt(row.querySelector('.ps-saves')?.value) || 0) : 0,
            cleanSheet: (isGK || isDEF) ? (row.querySelector('.ps-clean-sheet')?.checked || false) : false,
            yellowCards,
            redCards,
            rating: parseInt(row.querySelector('.ps-rating')?.value) || null,
            notes: row.querySelector('.ps-notes')?.value || '',
            motm: pid === motmPlayerId
        });
    });

    // 3. Include any players only in lineup (no stats row) — e.g. if stats table is empty
    Object.entries(lineupMap).forEach(([pid, lu]) => {
        if (!result.find(r => r.playerId === pid)) {
            result.push({ playerId: pid, ...lu, goals: 0, assists: 0, saves: 0, cleanSheet: false, yellowCards: 0, redCards: 0, rating: null, notes: '', motm: pid === motmPlayerId });
        }
    });

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD EVENT QUICK ACTION
// ═══════════════════════════════════════════════════════════════════════════════

function addMatchEventQuick() {
    const playerSel = document.getElementById('eventPlayerSelect');
    const typeSel = document.getElementById('eventTypeSelect');
    const playerId = playerSel?.value;
    const eventType = typeSel?.value;

    // Team clean sheet — applies to all GK + DEF rows, no player selection needed
    if (eventType === 'teamcs') {
        const tbody = document.getElementById('playerStatsEditBody');
        let count = 0;
        tbody?.querySelectorAll('tr[data-player-id]').forEach(r => {
            const pg = r.dataset.position;
            if (pg === 'GK' || pg === 'DEF') {
                const cb = r.querySelector('.ps-clean-sheet');
                if (cb) { cb.checked = true; count++; }
            }
        });
        showToast(`Clean sheet applied to ${count} GK/DEF player${count !== 1 ? 's' : ''}`, 'success');
        return;
    }

    if (!playerId || !eventType) { showToast('Select a player and event type', 'error'); return; }

    const tbody = document.getElementById('playerStatsEditBody');
    const row = tbody?.querySelector(`tr[data-player-id="${playerId}"]`);
    if (!row) { showToast('Player not found in table', 'error'); return; }

    const isGKRow = row?.dataset?.position === 'GK';

    if (eventType === 'save') {
        const inp = row.querySelector('.ps-saves');
        if (inp) inp.value = (parseInt(inp.value) || 0) + 1;
    } else if (eventType === 'goal') {
        const inp = isGKRow ? null : row.querySelector('.ps-goals');
        if (inp) inp.value = (parseInt(inp.value) || 0) + 1;
        else if (isGKRow) { showToast('Use the Saves event for goalkeepers', 'info'); return; }
    } else if (eventType === 'assist') {
        const inp = row.querySelector('.ps-assists');
        if (inp) inp.value = (parseInt(inp.value) || 0) + 1;
    } else if (eventType === 'yellow') {
        const cautionSel = row.querySelector('.ps-caution');
        if (cautionSel) cautionSel.value = cautionSel.value === 'yellow' ? '2yellow' : 'yellow';
    } else if (eventType === 'red') {
        const cautionSel = row.querySelector('.ps-caution');
        if (cautionSel) cautionSel.value = 'red';
    }

    const playerName = playerSel.options[playerSel.selectedIndex]?.text || '';
    showToast(`${eventType.charAt(0).toUpperCase() + eventType.slice(1)} added for ${playerName}`, 'success');
}
window.addMatchEventQuick = addMatchEventQuick;

// ═══════════════════════════════════════════════════════════════════════════════
// MATCH PHOTOS (Media tab)
// ═══════════════════════════════════════════════════════════════════════════════

function _renderEditMediaPhotosGrid(match) {
    const grid = document.getElementById('editMediaPhotosGrid');
    const emptyEl = document.getElementById('editMediaEmpty');
    if (!grid) return;
    const photos = Array.isArray(match.matchPhotos) ? match.matchPhotos : [];
    if (photos.length === 0) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    grid.innerHTML = photos.map((p, i) => {
        const url = typeof p === 'string' ? p : p.url;
        return `<div style="position:relative;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#f1f5f9;">
            <img src="${url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
            <button onclick="deleteMatchPhoto(${i})" style="position:absolute;top:4px;right:4px;background:rgba(239,68,68,.85);color:white;border:none;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:.72rem;" title="Delete"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');
}

function _renderMediaPhotosDisplay(match) {
    const el = document.getElementById('mediaPhotosDisplay');
    if (!el) return;
    const photos = Array.isArray(match.matchPhotos) ? match.matchPhotos : [];
    if (photos.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:.85rem;"><i class="fas fa-camera" style="font-size:2rem;display:block;margin-bottom:12px;opacity:.35;"></i>No photos uploaded yet — use Edit to upload photos</div>';
        return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">${
        photos.map(p => {
            const url = typeof p === 'string' ? p : p.url;
            return `<a href="${url}" target="_blank" rel="noopener" style="display:block;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#f1f5f9;"><img src="${url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></a>`;
        }).join('')
    }</div>`;
}

async function handleMatchPhotoUpload(input) {
    const match = window._matchData;
    if (!match?.id) { showToast('No match loaded', 'error'); return; }
    const files = Array.from(input.files);
    if (!files.length) return;

    const label = document.querySelector('label[for="matchPhotoInput"]');
    if (label) label.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';

    try {
        const urls = await Promise.all(files.map(async (file) => {
            const ext = file.name.split('.').pop();
            const path = `matches/${match.id}/photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: false });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
            return publicUrl;
        }));

        const existing = Array.isArray(match.matchPhotos) ? match.matchPhotos : [];
        const updated = [...existing, ...urls.map(url => ({ url, uploadedAt: new Date().toISOString() }))];
        await matchManager.updateMatchInfo(match.id, { matchPhotos: updated });
        match.matchPhotos = updated;

        _renderEditMediaPhotosGrid(match);
        _renderMediaPhotosDisplay(match);
        showToast(`${urls.length} photo${urls.length !== 1 ? 's' : ''} uploaded`, 'success');
    } catch (e) {
        console.error('Photo upload failed:', e);
        showToast('Photo upload failed', 'error');
    } finally {
        if (label) label.innerHTML = '<i class="fas fa-camera"></i> Upload Photos';
        input.value = '';
    }
}
window.handleMatchPhotoUpload = handleMatchPhotoUpload;

async function deleteMatchPhoto(index) {
    const match = window._matchData;
    if (!match) return;
    const photos = Array.isArray(match.matchPhotos) ? [...match.matchPhotos] : [];
    photos.splice(index, 1);
    await matchManager.updateMatchInfo(match.id, { matchPhotos: photos });
    match.matchPhotos = photos;
    _renderEditMediaPhotosGrid(match);
    _renderMediaPhotosDisplay(match);
    showToast('Photo removed', 'info');
}
window.deleteMatchPhoto = deleteMatchPhoto;

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS VIDEO FILE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

async function uploadAnalysisVideoFile(input) {
    const match = window._matchData;
    if (!match?.id) { showToast('No match loaded', 'error'); return; }
    const file = input.files[0];
    if (!file) return;

    const label = document.querySelector('label[for="editVideoFileInput"]');
    if (label) label.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';

    try {
        const publicUrl = await uploadToR2(file, 'match', match.id, (pct) => {
            if (label) label.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${pct < 100 ? pct + '%' : 'Processing…'}`;
        });
        const list = document.getElementById('editVideosList');
        if (list) _appendAnalysisChip(list, publicUrl, file.name, 'Video');
        showToast('Video uploaded to R2', 'success');
    } catch (e) {
        console.error('Video upload failed:', e);
        showToast(e.message || 'Video upload failed', 'error');
    } finally {
        if (label) label.innerHTML = '<i class="fas fa-upload"></i> Upload File';
        input.value = '';
    }
}
window.uploadAnalysisVideoFile = uploadAnalysisVideoFile;

// ═══════════════════════════════════════════════════════════════════════════════
// 4-PILLAR ASSESSMENT MODAL
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

// ── Inline pillar form helpers (used by player_watch report tab) ──────────────

function _buildPillarFormHTML() {
    let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
    ASSESSMENT_PILLARS.forEach(pillar => {
        html += `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                    <i class="fas ${pillar.icon}" style="color:${pillar.color};font-size:.85rem;"></i>
                    <span style="font-weight:700;font-size:.8rem;color:#0f172a;">${pillar.label}</span>
                    <span class="pw-pillar-avg" data-pillar="${pillar.key}" style="margin-left:auto;font-weight:700;font-size:.75rem;color:${pillar.color};"></span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-bottom:8px;">
                    ${pillar.attrs.map(attr => `
                        <div style="display:flex;align-items:center;justify-content:space-between;">
                            <span style="font-size:.7rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">${attr.label}</span>
                            <div class="pw-rating-btns" data-pillar="${pillar.key}" data-attr="${attr.key}" style="display:flex;gap:2px;flex-shrink:0;">
                                ${[1,2,3,4,5].map(v => `<button type="button" class="pw-btn" data-value="${v}" style="width:26px;height:26px;border-radius:5px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:.7rem;font-weight:700;cursor:pointer;transition:all .15s;">${v}</button>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <textarea class="pw-pillar-comment" data-pillar="${pillar.key}" placeholder="Comments on ${pillar.label} (optional)..." style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:.72rem;color:#0f172a;resize:vertical;min-height:44px;font-family:inherit;"></textarea>
            </div>
        `;
    });
    html += `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
            <span style="font-weight:700;font-size:.82rem;color:#64748b;">Overall Assessment:</span>
            <span class="pw-global-avg" style="font-weight:800;font-size:1.2rem;color:#0f172a;">-</span>
        </div>
    `;
    html += '</div>';
    return html;
}

function _wirePillarButtons(container) {
    container.querySelectorAll('.pw-rating-btns').forEach(group => {
        group.querySelectorAll('.pw-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.pw-btn').forEach(b => {
                    b.style.background = '#f8fafc'; b.style.color = '#64748b'; b.style.borderColor = '#e2e8f0';
                    b.removeAttribute('data-active');
                });
                btn.style.background = '#6366f1'; btn.style.color = 'white'; btn.style.borderColor = '#6366f1';
                btn.setAttribute('data-active', '1');
                _updatePillarAvgsIn(container);
            });
        });
    });
}

function _updatePillarAvgsIn(container) {
    const allAvgs = [];
    ASSESSMENT_PILLARS.forEach(pillar => {
        const vals = [];
        pillar.attrs.forEach(attr => {
            const group = container.querySelector(`.pw-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
            const active = group?.querySelector('.pw-btn[data-active]');
            if (active) vals.push(parseInt(active.dataset.value));
        });
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const el = container.querySelector(`.pw-pillar-avg[data-pillar="${pillar.key}"]`);
        if (el) el.textContent = avg != null ? avg.toFixed(1) : '';
        if (avg != null) allAvgs.push(avg);
    });
    const globalEl = container.querySelector('.pw-global-avg');
    if (globalEl) {
        const g = allAvgs.length ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : null;
        globalEl.textContent = g != null ? g.toFixed(1) : '-';
        if (g != null) globalEl.style.color = g >= 4 ? '#10b981' : g >= 3 ? '#0ea5e9' : g >= 2 ? '#f59e0b' : '#ef4444';
    }
}

function _populatePillarForm(container, ratings) {
    ASSESSMENT_PILLARS.forEach(pillar => {
        const pillarData = ratings[pillar.key] || {};
        pillar.attrs.forEach(attr => {
            const val = pillarData[attr.key];
            if (val) {
                const group = container.querySelector(`.pw-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
                const btn = group?.querySelector(`.pw-btn[data-value="${val}"]`);
                if (btn) {
                    btn.style.background = '#6366f1'; btn.style.color = 'white'; btn.style.borderColor = '#6366f1';
                    btn.setAttribute('data-active', '1');
                }
            }
        });
        const commentEl = container.querySelector(`.pw-pillar-comment[data-pillar="${pillar.key}"]`);
        if (commentEl) commentEl.value = pillarData._comment || '';
    });
    _updatePillarAvgsIn(container);
}

function _collectPillarRatings(container) {
    const ratings = {};
    let hasAny = false;
    ASSESSMENT_PILLARS.forEach(pillar => {
        ratings[pillar.key] = {};
        pillar.attrs.forEach(attr => {
            const group = container.querySelector(`.pw-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
            const active = group?.querySelector('.pw-btn[data-active]');
            if (active) { ratings[pillar.key][attr.key] = parseInt(active.dataset.value); hasAny = true; }
        });
        const commentEl = container.querySelector(`.pw-pillar-comment[data-pillar="${pillar.key}"]`);
        if (commentEl?.value?.trim()) ratings[pillar.key]._comment = commentEl.value.trim();
    });
    return { ratings, hasAny };
}

async function _savePwInlineAssessment(matchId, playerId, date) {
    const container = document.getElementById('pwPillarFormSection');
    if (!container) return;
    const { ratings, hasAny } = _collectPillarRatings(container);
    if (!hasAny) return;

    try {
        const { data: rows } = await supabase.from('assessments')
            .select('id').eq('player_id', playerId).eq('match_id', matchId).limit(1);
        const existing = rows?.[0];

        const author = window._profile?.full_name || 'Coach';

        if (existing?.id) {
            await supabase.from('assessments').update({ ratings, author, date }).eq('id', existing.id);
        } else {
            await supabase.from('assessments').insert({
                club_id: matchManager.clubId,
                player_id: playerId,
                match_id: matchId,
                date,
                ratings,
                author,
                type: 'match'
            });
        }
    } catch (e) {
        console.error('Failed to save player_watch assessment:', e);
    }
}

function _renderPwAssessmentDisplay(container, assessment) {
    if (!assessment?.ratings) {
        container.innerHTML = '<p style="color:#94a3b8;font-size:.82rem;font-style:italic;margin:8px 0 0;">No assessment recorded yet.</p>';
        return;
    }
    const ratings = typeof assessment.ratings === 'string' ? JSON.parse(assessment.ratings) : assessment.ratings;
    const author = assessment.author || 'Coach';
    let html = `<div style="margin-bottom:10px;font-size:.78rem;color:#64748b;">Assessed by <strong style="color:#0f172a;">${author}</strong></div>`;
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    ASSESSMENT_PILLARS.forEach(pillar => {
        const pd = ratings[pillar.key] || {};
        const vals = pillar.attrs.map(a => pd[a.key]).filter(Boolean);
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
        html += `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <i class="fas ${pillar.icon}" style="color:${pillar.color};font-size:.8rem;"></i>
                    <span style="font-weight:700;font-size:.8rem;color:#0f172a;">${pillar.label}</span>
                    ${avg ? `<span style="margin-left:auto;font-weight:700;font-size:.75rem;color:${pillar.color};">${avg}</span>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;${pd._comment ? 'margin-bottom:8px;' : ''}">
                    ${pillar.attrs.map(attr => {
                        const val = pd[attr.key] || 0;
                        const btns = [1,2,3,4,5].map(i => `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:.65rem;font-weight:600;border:1px solid ${i===val?pillar.color:'#e2e8f0'};background:${i===val?pillar.color:'#fff'};color:${i===val?'#fff':'#94a3b8'};">${i}</span>`).join('');
                        return `<div style="display:flex;align-items:center;justify-content:space-between;"><span style="font-size:.7rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">${attr.label}</span><div style="display:flex;gap:2px;">${btns}</div></div>`;
                    }).join('')}
                </div>
                ${pd._comment ? `<div style="font-size:.72rem;color:#475569;background:#f8fafc;border-radius:5px;padding:6px 8px;font-style:italic;">${pd._comment.replace(/\n/g, '<br>')}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ── Modal state ───────────────────────────────────────────────────────────────
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

    const header = document.createElement('div');
    header.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #e2e8f0;background:white;border-radius:16px 16px 0 0;';
    header.innerHTML = `
        <div>
            <h3 id="assessModalTitle" style="margin:0;font-size:1.1rem;color:#0f172a;"><i class="fas fa-clipboard-check" style="color:#6366f1;margin-right:8px;"></i>Player Assessment</h3>
            <p id="assessModalSubtitle" style="margin:4px 0 0;font-size:.8rem;color:#94a3b8;"></p>
        </div>
        <button id="assessModalClose" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#94a3b8;padding:4px;" title="Close">&times;</button>
    `;

    const body = document.createElement('div');
    body.id = 'assessModalBody';
    body.style.cssText = 'padding:20px 24px;overflow-y:auto;overflow-x:hidden;flex:1;min-height:0;';

    let pillarsHTML = '<div style="display:flex;flex-direction:column;gap:12px;">';
    ASSESSMENT_PILLARS.forEach(pillar => {
        pillarsHTML += `
            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                    <i class="fas ${pillar.icon}" style="color:${pillar.color};font-size:.85rem;"></i>
                    <span style="font-weight:700;font-size:.8rem;color:#0f172a;">${pillar.label}</span>
                    <span id="assess_${pillar.key}_avg" style="margin-left:auto;font-weight:700;font-size:.75rem;color:${pillar.color};"></span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-bottom:8px;">
                ${pillar.attrs.map(attr => `
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:.72rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;">${attr.label}</span>
                        <div class="assess-rating-btns" data-pillar="${pillar.key}" data-attr="${attr.key}" style="display:flex;gap:2px;flex-shrink:0;">
                            ${[1,2,3,4,5].map(v => `<button type="button" class="assess-btn" data-value="${v}" style="width:26px;height:26px;border-radius:5px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:.7rem;font-weight:700;cursor:pointer;transition:all .15s;">${v}</button>`).join('')}
                        </div>
                    </div>
                `).join('')}
                </div>
                <textarea class="assess-pillar-comment" data-pillar="${pillar.key}" placeholder="Comments on ${pillar.label} (optional)..." style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:.72rem;color:#0f172a;resize:vertical;min-height:44px;font-family:inherit;"></textarea>
            </div>
        `;
    });
    pillarsHTML += '</div>';
    pillarsHTML += `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
            <span style="font-weight:700;font-size:.85rem;color:#64748b;">Global Average:</span>
            <span id="assessGlobalAvg" style="font-weight:800;font-size:1.3rem;color:#0f172a;">-</span>
        </div>
    `;
    body.innerHTML = pillarsHTML;

    const footer = document.createElement('div');
    footer.style.cssText = 'flex-shrink:0;padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;background:white;border-radius:0 0 16px 16px;';
    footer.innerHTML = `
        <button id="assessModalCancel" style="padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#64748b;font-size:.85rem;cursor:pointer;">Cancel</button>
        <button id="assessModalSave" style="padding:8px 20px;border:none;border-radius:8px;background:#6366f1;color:white;font-weight:700;font-size:.85rem;cursor:pointer;">Save Assessment</button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.querySelector('#assessModalClose').addEventListener('click', closeAssessmentModal);
    overlay.querySelector('#assessModalCancel').addEventListener('click', closeAssessmentModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAssessmentModal(); });
    overlay.querySelector('#assessModalSave').addEventListener('click', saveAssessmentFromModal);

    overlay.querySelectorAll('.assess-rating-btns').forEach(group => {
        group.querySelectorAll('.assess-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.assess-btn').forEach(b => {
                    b.style.background = '#f8fafc'; b.style.color = '#64748b'; b.style.borderColor = '#e2e8f0';
                    b.removeAttribute('data-active');
                });
                btn.style.background = '#6366f1'; btn.style.color = 'white'; btn.style.borderColor = '#6366f1';
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

    const match = window._matchData;
    const matchContext = match ? `vs ${match.opponent || 'Unknown'} — ${match.date || ''}` : '';
    overlay.querySelector('#assessModalTitle').innerHTML = `<i class="fas fa-clipboard-check" style="color:#6366f1;margin-right:8px;"></i>${playerName}`;
    overlay.querySelector('#assessModalSubtitle').textContent = matchContext;

    overlay.querySelectorAll('.assess-btn').forEach(btn => {
        btn.style.background = '#f8fafc'; btn.style.color = '#64748b'; btn.style.borderColor = '#e2e8f0';
        btn.removeAttribute('data-active');
    });
    ASSESSMENT_PILLARS.forEach(p => { const el = overlay.querySelector(`#assess_${p.key}_avg`); if (el) el.textContent = '-'; });
    overlay.querySelector('#assessGlobalAvg').textContent = '-';

    if (match?.id) {
        try {
            const { data: existing } = await supabase.from('assessments')
                .select('*').eq('player_id', playerId).eq('match_id', match.id).limit(1).single();

            if (existing?.ratings) {
                _existingAssessmentId = existing.id;
                const ratings = typeof existing.ratings === 'string' ? JSON.parse(existing.ratings) : existing.ratings;
                ASSESSMENT_PILLARS.forEach(pillar => {
                    const pillarData = ratings[pillar.key] || {};
                    pillar.attrs.forEach(attr => {
                        const val = pillarData[attr.key];
                        if (val) {
                            const group = overlay.querySelector(`.assess-rating-btns[data-pillar="${pillar.key}"][data-attr="${attr.key}"]`);
                            const btn = group?.querySelector(`.assess-btn[data-value="${val}"]`);
                            if (btn) {
                                btn.style.background = '#6366f1'; btn.style.color = 'white'; btn.style.borderColor = '#6366f1';
                                btn.setAttribute('data-active', '1');
                            }
                        }
                    });
                    const commentEl = overlay.querySelector(`.assess-pillar-comment[data-pillar="${pillar.key}"]`);
                    if (commentEl) commentEl.value = pillarData._comment || '';
                });
                updatePillarAverages();
                overlay.querySelector('#assessModalSave').textContent = 'Update Assessment';
            }
        } catch (e) { /* no existing assessment */ }
    }

    overlay.style.display = 'flex';
}

function closeAssessmentModal() {
    if (_assessmentModal) {
        _assessmentModal.style.display = 'none';
        _assessmentModal.querySelectorAll('.assess-pillar-comment').forEach(t => { t.value = ''; });
    }
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
            if (active) { ratings[pillar.key][attr.key] = parseInt(active.dataset.value); hasAnyRating = true; }
        });
        const commentEl = overlay.querySelector(`.assess-pillar-comment[data-pillar="${pillar.key}"]`);
        if (commentEl?.value?.trim()) ratings[pillar.key]._comment = commentEl.value.trim();
    });

    if (!hasAnyRating) { showToast('Please rate at least one attribute', 'error'); return; }

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
            author: window._profile?.full_name || 'Coach',
            type: 'match'
        };

        if (_existingAssessmentId) {
            const { error } = await supabase.from('assessments').update({ ratings, date: row.date, author: row.author }).eq('id', _existingAssessmentId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('assessments').insert(row);
            if (error) throw error;
        }

        showToast(`Assessment saved for ${_assessingPlayerName}`, 'success');

        const tbody = document.getElementById('playerStatsEditBody');
        const btn = tbody?.querySelector(`.ps-assess-btn[data-player-id="${_assessingPlayerId}"]`);
        if (btn) { btn.style.color = '#10b981'; btn.style.borderColor = '#10b981'; btn.innerHTML = '<i class="fas fa-check-circle"></i>'; }

        closeAssessmentModal();
    } catch (e) {
        console.error('Failed to save assessment:', e);
        showToast('Failed to save assessment', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = _existingAssessmentId ? 'Update Assessment' : 'Save Assessment';
    }
}
