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
        renderMatchInfo(match);
        renderStatsDisplay(match.stats || {});
        renderReportDisplay(match.stats || {}, match);
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
    if (metaEl) metaEl.textContent = `${match.date || 'TBD'} • ${match.venue || 'Venue TBD'}`;

    const compEl = document.getElementById('matchComp');
    if (compEl) compEl.textContent = match.competition || 'Competition';
}

function renderStatsDisplay(stats) {
    const list = document.getElementById('statsListView');
    if (!list) return;
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

window.downloadReportPDF = function () {
    if (!window.jspdf) {
        if (window.showGlobalToast) window.showGlobalToast('PDF library not loaded', 'error');
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
    doc.text(`UP PERFORMANCE HUB · ${matchMeta}`, margin, 33);

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
        if (window.showGlobalToast) window.showGlobalToast(`PDF Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('PDF Save failed:', err);
    }
}

function fillEditForm(match) {
    const stats = match.stats || {};
    const form = document.getElementById('matchStatsForm');
    const homeStats = stats.home || stats;
    const awayStats = stats.away || {};

    // Dynamic Headers — use resolveTeamNames to stay consistent with view mode and reports hub
    const { home: homeName, away: awayName } = resolveTeamNames(match);

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
        const editor = document.getElementById(phase.id);
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


async function saveStats(matchId) {
    const form = document.getElementById('matchStatsForm');
    const formData = new FormData(form);

    // 1. Capture Tactical Phases from Rich Text Editors
    // Use innerText to detect if editor is actually empty (avoids false positives from <br> only)
    const getEditorContent = (id) => {
        const el = document.getElementById(id);
        if (!el) return null; // null = skip this key (don't overwrite existing DB data)
        const text = el.innerText ? el.innerText.trim() : '';
        return text.length > 0 ? el.innerHTML : null; // null = empty, do not overwrite
    };

    const newStats = {
        home: {},
        away: {}
    };

    // Only include tactical keys with actual content — prevents overwriting DB with empty strings
    const tacticalFields = [
        { key: 'tactical_lineup_home', id: 'editor_lineup_home' },
        { key: 'tactical_lineup_away', id: 'editor_lineup_away' },
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

        // Update Match Notes for sync with Reports Hub if empty
        const isTacticalFilled = !!(newStats.tactical_lineup_home || newStats.tactical_lineup_away ||
            newStats.tactical_timeline || newStats.tactical_in_possession ||
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
            console.error('Could not reload match after save — matchId:', matchId);
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

        // Switch back to display
        document.getElementById('editMode').style.display = 'none';
        document.getElementById('displayMode').style.display = 'block';
        document.getElementById('btnSaveStats').style.display = 'none';
        document.getElementById('btnToggleEdit').innerHTML = '<i class="fas fa-edit"></i> Edit';

        if (window.showGlobalToast) window.showGlobalToast('Match report saved successfully!', 'success');

    } catch (error) {
        console.error("Error saving stats:", error);
        if (window.showGlobalToast) window.showGlobalToast('Failed to save. Please try again.', 'error');
        else alert("Failed to save changes. Please try again.");
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
