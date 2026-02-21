/**
 * Match Details UI Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
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

    // Initialize Manager
    try {
        await matchManager.init();
        const match = await matchManager.getMatch(matchId);

        if (!match) {
            console.error('Match not found');
            return;
        }

        renderMatchInfo(match);
        renderStatsDisplay(match.stats || {});
        renderReportDisplay(match.stats || {});
        fillEditForm(match);

        // 3. Handle Auto-Download (Print from Match Reports hub)
        if (params.get('download') === 'true') {
            // Give a tiny delay for rendering to settling (rich text editors etc)
            setTimeout(() => {
                downloadReportPDF();
            }, 800);
        }

    } catch (err) {
        console.error("Error loading match data:", err);
    }
});

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

    // Fallback for legacy data or missing explicit sides
    if (!home || !away) {
        // Default to Squad on LEFT unless explicitly marked as 'away'
        if (m.ourSide === 'away') {
            home = m.opponent || 'Home Team';
            away = 'UP - Tuks'; // Default squad fallback
        } else {
            home = 'UP - Tuks'; // Default squad fallback
            away = m.opponent || 'Away Team';
        }
    }
    return { home, away };
}

function renderMatchInfo(match) {
    const { home: homeName, away: awayName } = resolveTeamNames(match);
    const homeScore = match.homeScore !== undefined ? match.homeScore : 0;
    const awayScore = match.awayScore !== undefined ? match.awayScore : 0;

    document.title = `${homeName} vs ${awayName} | UP Performance`;
    document.getElementById('matchOpponent').textContent = `${homeName} vs ${awayName}`;
    document.getElementById('matchScore').textContent = `${homeScore} - ${awayScore}`;
    document.getElementById('matchMeta').textContent = `${match.date || 'TBD'} • ${match.venue || 'Tuks Stadium'}`;
    document.getElementById('matchComp').textContent = match.competition || 'Competition';
}

function renderStatsDisplay(stats) {
    const list = document.getElementById('statsListView');
    const items = [
        { label: 'Possession', key: 'possession', suffix: '%', max: 100 },
        { label: 'Goals', key: 'goals', max: 5 }, // Replaced xG
        { label: 'Shots', key: 'shots', max: 25 },
        { label: 'Shots on Target', key: 'shotsOnTarget', max: 15 },
        { label: 'Corners', key: 'corners', max: 15 },
        { label: 'Fouls', key: 'fouls', max: 20 },
        { label: 'Yellow Cards', key: 'yellowCards', max: 6 },
        { label: 'Red Cards', key: 'redCards', max: 2 }
    ];

    // Handle migration/fallback if 'home' missing (though MatchManager should fix this)
    const homeStats = stats.home || stats;
    const awayStats = stats.away || { possession: 0, xG: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 };

    list.innerHTML = items.map(item => {
        const hVal = homeStats[item.key] || 0;
        const aVal = awayStats[item.key] || 0;

        // Calculate percentages for bars based on total or max?
        // Let's use max for scaling, but if total > max, adjust?
        // Comparison bar: Left is Home (Navy), Right is Away (Grey/Red?)

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
                    <!-- Split bar: Center outward? Or separate bars? Let's do separate bars facing center for cleaner look? 
                         Actually, standard comparison: 
                         [ Home Bar (Right Aligned) ] | [ Away Bar (Left Aligned) ] 
                    -->
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
    const element = document.getElementById('matchReportSection');
    const opt = {
        margin: [10, 10, 10, 10], // top, left, bottom, right
        filename: 'Match_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Use html2pdf if available
    if (window.html2pdf) {
        // Clone the element to modify it for PDF if needed (e.g., hiding buttons)
        const clone = element.cloneNode(true);
        const btn = clone.querySelector('#viewReportFile');
        if (btn) btn.style.display = 'none'; // Hide download button in PDF

        // Add a header with match info to the clone
        const header = document.createElement('div');
        header.style.marginBottom = '20px';
        header.style.borderBottom = '2px solid var(--navy-dark)';
        header.style.paddingBottom = '10px';
        header.innerHTML = `
            <h1 style="color: var(--navy-dark); font-size: 24px; margin: 0;">Match Analysis Report</h1>
            <p style="color: var(--text-secondary); margin: 5px 0;">${document.getElementById('matchOpponent').textContent} | ${document.getElementById('matchScore').textContent}</p>
            <p style="color: var(--text-secondary); margin: 0; font-size: 0.9rem;">${document.getElementById('matchMeta').textContent}</p>
        `;
        clone.insertBefore(header, clone.firstChild);

        html2pdf().set(opt).from(clone).outputPdf('blob').then(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = opt.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (window.showGlobalToast) window.showGlobalToast('Report Downloaded', 'success');
        }).catch(function (err) {
            console.error('PDF Export failed:', err);
            if (window.showGlobalToast) window.showGlobalToast('Error generating PDF', 'error');
            else alert('Error generating PDF');
        });
    } else {
        if (window.showGlobalToast) window.showGlobalToast('PDF generator library not loaded.', 'error');
        else alert('PDF generator library not loaded. Please refresh the page.');
    }
}

function fillEditForm(match) {
    const stats = match.stats || {};
    const form = document.getElementById('matchStatsForm');
    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};

    // Dynamic Headers
    const homeName = match.homeTeam || (match.ourSide === 'home' ? 'UP - Tuks' : 'Home Team');
    const awayName = match.awayTeam || (match.ourSide === 'away' ? 'UP - Tuks' : 'Away Team');

    // Helper to safely set text
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('editHomeName', homeName);
    setText('editOpponentName', awayName); // Match match-details.html id
    setText('editLineupHomeName', homeName);
    setText('editLineupAwayName', awayName);

    // Standard Stats

    // Standard Stats
    const keys = ['possession', 'goals', 'shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'];
    keys.forEach(key => {
        // Special case for Goals: use Match Score if available, otherwise stats, otherwise 0
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
        // { id: 'editor_lineup', key: 'tactical_lineup' }, // Deprecated
        { id: 'editor_lineup_home', key: 'tactical_lineup_home' },
        { id: 'editor_lineup_away', key: 'tactical_lineup_away' },
        { id: 'editor_timeline', key: 'tactical_timeline' },
        { id: 'editor_in_possession', key: 'tactical_in_possession' },
        { id: 'editor_out_possession', key: 'tactical_out_possession' },
        { id: 'editor_transitions', key: 'tactical_transitions' },
        { id: 'editor_set_pieces', key: 'tactical_set_pieces' }
    ];

    phases.forEach(phase => {
        if (editor) {
            // Special handling for migration: if home/away empty but legacy lineup exists
            let content = stats[phase.key] || '';

            if (!content && phase.key === 'tactical_lineup_home' && stats.tactical_lineup) {
                content = stats.tactical_lineup; // Migrate old data to Home
            }

            editor.innerHTML = content;
        }
    });
}

function resolveTeamNames(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;

    if (!home || !away) {
        // We don't have squadManager globally here, but we can assume 'UP - Tuks' or use opponent
        if (m.ourSide === 'home') {
            home = 'UP - Tuks';
            away = m.opponent || 'Away Team';
        } else {
            home = m.opponent || 'Home Team';
            away = 'UP - Tuks';
        }
    }
    return { home, away };
}

async function saveStats(matchId) {
    const form = document.getElementById('matchStatsForm');
    const formData = new FormData(form);

    // 1. Capture Tactical Phases from Rich Text Editors
    const getEditorContent = (id) => {
        const el = document.getElementById(id);
        return el ? el.innerHTML : '';
    };

    const newStats = {
        home: {},
        away: {},
        tactical_lineup_home: getEditorContent('editor_lineup_home'),
        tactical_lineup_away: getEditorContent('editor_lineup_away'),
        // tactical_lineup: getEditorContent('editor_lineup'), // Deprecated
        tactical_timeline: getEditorContent('editor_timeline'),
        tactical_in_possession: getEditorContent('editor_in_possession'),
        tactical_out_possession: getEditorContent('editor_out_possession'),
        tactical_transitions: getEditorContent('editor_transitions'),
        tactical_set_pieces: getEditorContent('editor_set_pieces')
    };

    // 2. Capture Stats
    const keys = ['possession', 'goals', 'shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'];
    keys.forEach(key => {
        newStats.home[key] = Number(formData.get(`home_${key}`)) || 0;
        newStats.away[key] = Number(formData.get(`away_${key}`)) || 0;
    });

    // 3. Update Match Score (Result) based on Goals
    const homeScore = newStats.home.goals;
    const awayScore = newStats.away.goals;
    let result = 'Draw';
    if (homeScore > awayScore) result = 'Win';
    if (homeScore < awayScore) result = 'Loss';

    try {
        // Update Info (Score/Result)
        await matchManager.updateMatchInfo(matchId, {
            homeScore,
            awayScore,
            result
        });

        // Update Stats
        await matchManager.updateMatchStats(matchId, newStats);

        // Update UI
        renderMatchInfo({ ...matchManager.getMatch(matchId), homeScore, awayScore }); // Optimistic update
        renderStatsDisplay(newStats);
        renderReportDisplay(newStats);

        // Switch back to display
        document.getElementById('editMode').style.display = 'none';
        document.getElementById('displayMode').style.display = 'block';
        document.getElementById('btnSaveStats').style.display = 'none';
        document.getElementById('btnToggleEdit').innerHTML = '<i class="fas fa-edit"></i> Edit';

    } catch (error) {
        console.error("Error saving stats:", error);
        alert("Failed to save changes. Please try again.");
    }
}

function renderReportDisplay(stats) {
    // Helper to render phase content
    const renderPhase = (elementId, content) => {
        const el = document.getElementById(elementId);
        if (content && content.trim()) {
            el.innerHTML = content.replace(/\n/g, '<br>');
            el.style.color = 'var(--navy-dark)';
        } else {
            el.innerHTML = '<em style="color: var(--text-secondary);">No notes added.</em>';
        }
    };

    renderPhase('viewPhaseLineupHome', stats.tactical_lineup_home || (stats.tactical_lineup ? stats.tactical_lineup : '')); // Fallback for display
    renderPhase('viewPhaseLineupAway', stats.tactical_lineup_away);
    renderPhase('viewPhaseTimeline', stats.tactical_timeline);
    renderPhase('viewPhaseInPossession', stats.tactical_in_possession);
    renderPhase('viewPhaseOutPossession', stats.tactical_out_possession);
    renderPhase('viewPhaseTransitions', stats.tactical_transitions);
    renderPhase('viewPhaseSetPieces', stats.tactical_set_pieces);

    // Toggle File (mock logic)
    const fileEl = document.getElementById('viewReportFile');
    // fileEl.style.display = 'none'; // Keep visible for PDF download
}
