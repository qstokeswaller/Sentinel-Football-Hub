/**
 * Player Profile UI Core Logic
 */

console.log('Player Profile UI: Script Loaded');

let currentPlayer = null;
let currentPlayerId = null;
let editingDevStructureId = null;
let editingAssessmentId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Player Profile UI: DOM Content Loaded');
    initProfileUI();
});

async function initProfileUI() {
    console.log('Player Profile UI: Initializing...');
    try {
        const initialized = await squadManager.init();
        if (!initialized) {
            console.error('Player Profile: Manager failed to initialize');
            return;
        }

        // Parse ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        currentPlayerId = urlParams.get('id');

        if (!currentPlayerId) {
            alert("No player ID provided. Returning to roster.");
            window.location.href = 'players.html';
            return;
        }

        const players = squadManager.getPlayers();
        console.log('Player Profile: Found', players.length, 'players in manager');

        // Use == to handle string/number mismatch from URL vs storage
        currentPlayer = players.find(p => p.id == currentPlayerId);

        if (!currentPlayer) {
            console.error('Player Profile: Player NOT found for ID:', currentPlayerId);
            alert("Player not found.");
            window.location.href = 'players.html';
            return;
        }

        populateProfileHeader();
        setupTabs();
        setupAssessmentForm();
        setupOverviewEditor();
        setupAnalysisTab();
        renderAssessmentHistory();
        renderOverviewHistory();

        // --- Profile Header Action Buttons ---
        const btnProfileDelete = document.getElementById('btnProfileDeletePlayer');
        if (btnProfileDelete) {
            btnProfileDelete.addEventListener('click', async () => {
                if (!confirm(`Delete ${currentPlayer.name}? This cannot be undone.`)) return;
                const ok = await squadManager.deletePlayer(currentPlayerId);
                if (ok) {
                    window.location.href = 'players.html';
                } else {
                    alert('Failed to delete player.');
                }
            });
        }

        const btnProfileAssign = document.getElementById('btnProfileAssignSquad');
        if (btnProfileAssign) {
            btnProfileAssign.addEventListener('click', () => {
                const squads = squadManager.getSquads();
                if (!squads.length) { alert('No squads available.'); return; }
                const options = squads.map(s => `<option value="${s.id}" ${s.id === currentPlayer.squadId ? 'selected' : ''}>${s.name}</option>`).join('');
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay active';
                overlay.style.zIndex = '9999';
                overlay.innerHTML = `
                    <div class="modal-container" style="max-width: 400px;">
                        <div class="modal-header">
                            <h2>Assign Squad</h2>
                            <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                        </div>
                        <div class="modal-body" style="padding: 24px;">
                            <p style="margin-bottom: 12px; font-size: 0.9rem; color: #64748b;">Assign <strong>${currentPlayer.name}</strong> to a squad:</p>
                            <select id="profileSquadSelect" class="form-control-bubble">${options}</select>
                        </div>
                        <div class="modal-footer">
                            <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button class="dash-btn primary" id="btnConfirmProfileAssign">Assign</button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
                document.getElementById('btnConfirmProfileAssign').addEventListener('click', async () => {
                    const newSquadId = document.getElementById('profileSquadSelect').value;
                    currentPlayer.squadId = newSquadId;
                    const ok = await squadManager.updatePlayer(currentPlayer);
                    overlay.remove();
                    if (ok) {
                        const squad = squads.find(s => s.id === newSquadId);
                        const profSquadEl = document.getElementById('profSquad');
                        if (profSquadEl && squad) profSquadEl.textContent = squad.name;
                        if (window.showGlobalToast) window.showGlobalToast('Squad updated', 'success');
                    } else { alert('Failed to update squad.'); }
                });
            });
        }

    } catch (err) {
        console.error('Player Profile UI: Critical Error in init:', err);
    }
}

// --- Overview & Dev Structures Logic ---
function setupOverviewEditor() {
    console.log('Player Profile: Setting up Overview Editor...');

    // Default date to today
    const dateInput = document.getElementById('overviewDate');
    if (dateInput) dateInput.valueAsDate = new Date();

    // Toolbar logic
    const toolbar = document.querySelector('.rich-text-toolbar');
    if (toolbar) {
        toolbar.querySelectorAll('.tool-btn').forEach(btn => {
            // Using mousedown + preventDefault is better for keeping focus in the editable area
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const command = btn.getAttribute('data-command');
                document.execCommand(command, false, null);
                updateToolbarState();
            });
        });

        // Update state on selection change, click (inside editor), and input
        document.addEventListener('selectionchange', updateToolbarState);

        // Listen to all editable divs for focus and input to sync toolbar
        document.querySelectorAll('[contenteditable="true"]').forEach(el => {
            el.addEventListener('input', updateToolbarState);
            el.addEventListener('focus', updateToolbarState);
            el.addEventListener('keyup', updateToolbarState);
        });
    }

    function updateToolbarState() {
        if (!toolbar) return;

        // Only update if one of our editors is focused
        const activeEl = document.activeElement;
        const isEditing = activeEl && activeEl.getAttribute('contenteditable') === 'true';

        toolbar.querySelectorAll('.tool-btn').forEach(btn => {
            const command = btn.getAttribute('data-command');
            if (command) {
                // queryCommandState works for the current insertion point if it's within an editable area
                if (document.queryCommandState(command)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    }

    // Save button
    const btnSave = document.getElementById('btnSaveDevStructures');
    if (btnSave) {
        btnSave.addEventListener('click', saveDevStructures);
    }
}

async function saveDevStructures() {
    if (!currentPlayerId) return;

    const btn = document.getElementById('btnSaveDevStructures');
    const originalText = btn.innerHTML; // Renamed from originalHTML to originalText for consistency with instruction
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const s = { // Renamed from 'structures' to 's' as per instruction's usage
        bioenergetics: document.getElementById('dev-bioenergetics').innerHTML,
        conditional: document.getElementById('dev-conditional').innerHTML,
        coordinative: document.getElementById('dev-coordinative').innerHTML,
        cognitive: document.getElementById('dev-cognitive').innerHTML,
        socio: document.getElementById('dev-socio').innerHTML,
        emotional: document.getElementById('dev-emotional').innerHTML,
        creative: document.getElementById('dev-creative').innerHTML,
        mental: document.getElementById('dev-mental').innerHTML
    };

    const date = document.getElementById('overviewDate').value || new Date().toISOString().split('T')[0];

    const success = await squadManager.saveDevStructure({
        id: editingDevStructureId,
        playerId: String(currentPlayerId),
        date: document.getElementById('overviewDate').value, // Changed to use value directly
        structures: s // Changed to use 's'
    });

    if (success) {
        editingDevStructureId = null; // Clear ID after save
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!'; // Updated message
        btn.style.background = 'var(--green-accent)';
        if (window.showGlobalToast) window.showGlobalToast('Overall assessment saved', 'success'); // Added toast
        renderOverviewHistory(); // Refresh history
        setTimeout(() => {
            btn.innerHTML = originalText; // Use originalText
            btn.style.background = '';
            btn.disabled = false;
        }, 1500);
    } else {
        alert('Failed to save to database. Please ensure the backend is running and the database is accessible.');
        btn.innerHTML = originalText; // Use originalText
        btn.disabled = false;
    }
}

async function renderOverviewHistory() {
    const container = document.getElementById('devHistoryContainer');
    if (!container || !currentPlayerId) return;

    const records = await squadManager.getDevStructures(currentPlayerId);

    if (records.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-light); font-size: 0.85rem;">No historical records found.</div>';
        return;
    }

    container.innerHTML = records.map((rec) => {
        const d = new Date(rec.date).toLocaleDateString();

        return `
            <div class="dash-card history-item" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="margin: 0 0 4px 0; color: var(--navy-dark); font-size: 1.05rem;">Overall Assessment</h4>
                        <span style="font-size: 0.85rem; color: var(--text-secondary);"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i> ${d} &nbsp; | &nbsp; <i class="far fa-clock" style="margin-right: 4px;"></i> Saved on ${new Date(rec.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="dash-btn outline sm" onclick="viewDevStructureDetails('${rec.id}')" title="View Details">
                            <i class="far fa-eye"></i> View
                        </button>
                        <button class="dash-btn outline sm" onclick="loadOverviewFromHistory('${rec.id}')" title="Edit">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="dash-btn outline sm" onclick="deleteDevStructure('${rec.id}')" style="border-color: #fca5a5; color: #ef4444;" title="Delete">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteDevStructure = async (id) => {
    if (!confirm('Are you sure you want to delete this overall assessment record?')) return;
    const success = await squadManager.deleteDevStructure(id);
    if (success) {
        renderOverviewHistory();
        if (window.showGlobalToast) window.showGlobalToast('Record deleted', 'success');
    }
};

window.viewDevStructureDetails = async (id) => {
    const records = await squadManager.getDevStructures(currentPlayerId);
    const rec = records.find(r => r.id == id);
    if (!rec) return;

    const s = rec.structures;
    const modalHtml = `
        <div class="modal-overlay active" id="modalDevDetails">
            <div class="modal-content-bubble" style="max-width: 800px; width: 95%;">
                <div class="modal-header-bubble">
                    <h3 class="modal-title-bubble">Overall Assessment Details</h3>
                    <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body-bubble" id="print-area-dev">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid var(--primary); padding-bottom: 10px;">
                        <div>
                            <h2 style="margin: 0; color: var(--navy-dark);">${currentPlayer?.name || 'Player Name'}</h2>
                            <p style="margin: 5px 0 0 0; color: var(--text-secondary);">Overall Assessment • ${new Date(rec.date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        ${['bioenergetics', 'conditional', 'coordinative', 'cognitive', 'socio', 'emotional', 'creative', 'mental'].map(key => `
                            <div class="dash-card" style="padding: 15px;">
                                <h4 style="margin: 0 0 10px 0; color: var(--primary); text-transform: capitalize;">${key}</h4>
                                <div style="font-size: 0.9rem; line-height: 1.5;">${s[key] || 'No notes recorded.'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer-bubble">
                    <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="dash-btn primary" onclick="printDevAssessment()">
                        <i class="fas fa-file-download"></i> Download PDF
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.printDevAssessment = (elementId) => {
    if (!window.jspdf) {
        if (window.showGlobalToast) window.showGlobalToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const element = document.getElementById(elementId || 'print-area-dev');
    if (!element) return;

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
    doc.text('PLAYER PROFILE REPORT', margin, 25);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`UP PERFORMANCE HUB · ${currentPlayer?.name || 'Player Report'}`, margin, 33);

    let y = 55;

    // Player Header in PDF
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(currentPlayer?.name || 'Player Name', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Position: ${currentPlayer?.position || 'N/A'} | Squad: ${document.getElementById('profSquad')?.textContent || 'N/A'}`, margin, y);
    y += 15;

    // Determine if we are printing Dev Structures (cards) or Performance Report (bubble groups)
    const cards = element.querySelectorAll('.dash-card');
    const bubbleGroups = element.querySelectorAll('.form-group-bubble');

    if (cards.length > 0) {
        // Dev Structures specialized logic
        cards.forEach(card => {
            const title = card.querySelector('h4')?.innerText || '';
            const bodyText = card.querySelector('div')?.innerText || '';

            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(12);
            doc.setTextColor(30, 58, 138);
            doc.setFont('helvetica', 'bold');
            doc.text(title.toUpperCase(), margin, y);
            y += 6;

            doc.setFontSize(10);
            doc.setTextColor(60);
            doc.setFont('helvetica', 'normal');
            const splitText = doc.splitTextToSize(bodyText, contentW);
            doc.text(splitText, margin, y);
            y += (splitText.length * 5) + 12;
        });
    } else if (bubbleGroups.length > 0) {
        // Performance Report specialized logic
        bubbleGroups.forEach(group => {
            const label = group.querySelector('label')?.innerText || '';
            const content = group.querySelector('div')?.innerText || '';

            if (!label || !content) return;

            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(12);
            doc.setTextColor(30, 58, 138);
            doc.setFont('helvetica', 'bold');
            doc.text(label.toUpperCase(), margin, y);
            y += 6;

            doc.setFontSize(10);
            doc.setTextColor(60);
            doc.setFont('helvetica', 'normal');

            // For ratings, we might want to represent stars as text for now
            // or just the text if it's qualitative feedback
            const splitText = doc.splitTextToSize(content.trim(), contentW);
            doc.text(splitText, margin, y);
            y += (splitText.length * 5) + 12;
        });
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated on ${new Date().toLocaleString()} | UP Performance Hub`, PW / 2, 285, { align: 'center' });

    const filename = `Player_Report_${currentPlayer?.name || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`.replace(/\s+/g, '_');

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
};

// ─── Full Player Development Report PDF ──────────────────────────────────────
window.exportPlayerFullReport = async () => {
    if (!window.jspdf) {
        if (window.showGlobalToast) window.showGlobalToast('PDF library not loaded', 'error');
        return;
    }
    if (!currentPlayer) {
        if (window.showGlobalToast) window.showGlobalToast('No player loaded', 'error');
        return;
    }

    if (window.showGlobalToast) window.showGlobalToast('Generating report...', '');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const cW = PW - margin * 2;

    // Fetch assessments
    let assessments = [];
    try { assessments = await squadManager.getAssessments(currentPlayerId) || []; } catch (e) {}

    const checkY = (y, needed = 20) => {
        if (y + needed > PH - 22) { doc.addPage(); return 28; }
        return y;
    };

    const catDefs = {
        tactical:      { label: 'Tactical',      keys: ['positioning', 'decision', 'awareness', 'creativity'] },
        technical:     { label: 'Technical',     keys: ['passing', 'touch', 'control', 'dribbling'] },
        physical:      { label: 'Physical',      keys: ['speed', 'agility', 'stamina', 'strength'] },
        psychological: { label: 'Psychological', keys: ['workEthic', 'communication', 'focus', 'resilience'] }
    };

    const subAvg = (obj, keys) => {
        if (!obj) return null;
        const vals = keys.map(k => obj[k]).filter(v => typeof v === 'number');
        return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    };

    // ── Header ──
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 44, 'F');
    doc.setTextColor(255);
    doc.setFontSize(19);
    doc.setFont('helvetica', 'bold');
    doc.text('PLAYER DEVELOPMENT REPORT', margin, 22);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`UP PERFORMANCE HUB  ·  ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`, margin, 34);

    let y = 56;

    // ── Player bio ──
    const squadName = squadManager.getSquad(currentPlayer.squadId)?.name || 'Unassigned';
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text(currentPlayer.name, margin, y);
    y += 7;

    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    const bioLine = [
        currentPlayer.position ? `Position: ${currentPlayer.position}` : null,
        currentPlayer.age ? `Age: ${currentPlayer.age}` : null,
        `Squad: ${squadName}`,
        currentPlayer.foot ? `Foot: ${currentPlayer.foot}` : null
    ].filter(Boolean).join('   ·   ');
    doc.text(bioLine, margin, y);
    y += 5;
    doc.setDrawColor(220);
    doc.line(margin, y, PW - margin, y);
    y += 12;

    if (assessments.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(170);
        doc.text('No assessment records on file for this player.', margin, y);
        y += 16;
    } else {
        const sorted = [...assessments].sort((a, b) => new Date(b.date) - new Date(a.date));

        // ── Category averages across all assessments ──
        const overallAvgs = {};
        Object.entries(catDefs).forEach(([key, def]) => {
            const vals = sorted.map(a => subAvg(a.ratings?.[key], def.keys)).filter(v => v !== null);
            overallAvgs[key] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
        });

        doc.setFontSize(11);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text(`PERFORMANCE SUMMARY  (${assessments.length} report${assessments.length !== 1 ? 's' : ''})`, margin, y);
        y += 8;

        // 4 coloured boxes
        const boxW = (cW - 9) / 4;
        Object.entries(catDefs).forEach(([key, def], i) => {
            const val = overallAvgs[key];
            const bx = margin + i * (boxW + 3);
            let rf, gf, bf, rt, gt, bt;
            if (val === null)        { rf=241;gf=245;bf=249; rt=180;gt=180;bt=180; }
            else if (val >= 4.5)     { rf=220;gf=252;bf=231; rt=22; gt=163;bt=74; }
            else if (val >= 3.5)     { rf=219;gf=234;bf=254; rt=29; gt=78; bt=216; }
            else if (val >= 2.5)     { rf=254;gf=243;bf=199; rt=146;gt=64; bt=14; }
            else                     { rf=254;gf=226;bf=226; rt=153;gt=27; bt=27; }

            doc.setFillColor(rf, gf, bf);
            doc.roundedRect(bx, y, boxW, 22, 2, 2, 'F');

            doc.setFontSize(6.5);
            doc.setTextColor(110);
            doc.setFont('helvetica', 'normal');
            doc.text(def.label.toUpperCase(), bx + boxW / 2, y + 7, { align: 'center' });

            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(rt, gt, bt);
            doc.text(val !== null ? `${val.toFixed(1)}/5` : '—', bx + boxW / 2, y + 17, { align: 'center' });
        });
        y += 28;

        // ── Assessment history table ──
        y = checkY(y, 30);
        doc.setFontSize(11);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text('ASSESSMENT HISTORY', margin, y);
        y += 7;

        const cols = { date: 34, evaluator: 38, tactical: 26, technical: 26, physical: 26, psych: 26 };
        const colX = [margin];
        Object.values(cols).forEach((w, i) => colX.push(colX[i] + w));

        doc.setFillColor(30, 58, 138);
        doc.rect(margin, y, cW, 7, 'F');
        doc.setTextColor(255);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        ['Date', 'Evaluator', 'Tactical', 'Technical', 'Physical', 'Psych'].forEach((lbl, i) => {
            doc.text(lbl, colX[i] + 2, y + 4.8);
        });
        y += 9;

        sorted.forEach((a, idx) => {
            y = checkY(y, 8);
            if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 1, cW, 7, 'F'); }

            const rowVals = [
                a.date || '—',
                (a.author || a.evaluator || '—').slice(0, 16),
                subAvg(a.ratings?.tactical, catDefs.tactical.keys),
                subAvg(a.ratings?.technical, catDefs.technical.keys),
                subAvg(a.ratings?.physical, catDefs.physical.keys),
                subAvg(a.ratings?.psychological, catDefs.psychological.keys)
            ];

            doc.setTextColor(40);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            rowVals.forEach((v, i) => {
                const txt = typeof v === 'number' ? v.toFixed(1) : (v || '—');
                doc.text(String(txt), colX[i] + 2, y + 4.5);
            });
            y += 7;
        });
        y += 8;

        // ── Latest qualitative feedback ──
        const withFeedback = sorted.find(a => a.feedback && (a.feedback.strength || a.feedback.improvement || a.feedback.comments));
        if (withFeedback) {
            y = checkY(y, 30);
            doc.setFontSize(11);
            doc.setTextColor(30, 58, 138);
            doc.setFont('helvetica', 'bold');
            doc.text('LATEST ASSESSMENT FEEDBACK', margin, y);
            y += 5;
            doc.setFontSize(7.5);
            doc.setTextColor(150);
            doc.setFont('helvetica', 'normal');
            doc.text(`${withFeedback.date || ''}  ·  ${withFeedback.author || withFeedback.evaluator || ''}`, margin, y);
            y += 9;

            const feedItems = [
                { label: 'KEY STRENGTHS',         text: withFeedback.feedback?.strength },
                { label: 'AREAS TO IMPROVE',       text: withFeedback.feedback?.improvement },
                { label: 'SUGGESTIONS FOR GROWTH', text: withFeedback.feedback?.growth },
                { label: 'FINAL COMMENTS',         text: withFeedback.feedback?.comments }
            ].filter(f => f.text && f.text.trim() && f.text !== 'N/A');

            feedItems.forEach(f => {
                y = checkY(y, 18);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 58, 138);
                doc.text(f.label, margin, y);
                y += 5;
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(55);
                const lines = doc.splitTextToSize(f.text, cW);
                y = checkY(y, lines.length * 5 + 6);
                doc.text(lines, margin, y);
                y += lines.length * 5 + 8;
            });
        }
    }

    // ── Footer on every page ──
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(180);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated ${new Date().toLocaleString()}  ·  UP Performance Hub  ·  Page ${p}/${pages}`, PW / 2, PH - 7, { align: 'center' });
    }

    const filename = `PlayerReport_${currentPlayer.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (window.showGlobalToast) window.showGlobalToast(`Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('PDF export failed:', err);
        if (window.showGlobalToast) window.showGlobalToast('Export failed', 'error');
    }
};

// Global export for internal loading
window.loadOverviewFromHistory = async (id) => {
    const records = await squadManager.getDevStructures(currentPlayerId);
    const fullRecord = records.find(r => r.id == id);
    if (!fullRecord) return;

    const s = fullRecord.structures;
    document.getElementById('dev-bioenergetics').innerHTML = s.bioenergetics || '';
    document.getElementById('dev-conditional').innerHTML = s.conditional || '';
    document.getElementById('dev-coordinative').innerHTML = s.coordinative || '';
    document.getElementById('dev-cognitive').innerHTML = s.cognitive || '';
    document.getElementById('dev-socio').innerHTML = s.socio || '';
    document.getElementById('dev-emotional').innerHTML = s.emotional || '';
    document.getElementById('dev-creative').innerHTML = s.creative || '';
    document.getElementById('dev-mental').innerHTML = s.mental || '';

    // Update date to the record date
    document.getElementById('overviewDate').value = fullRecord.date;
    editingDevStructureId = fullRecord.id;

    // Switch to Overview tab
    document.querySelector('[data-tab="overview"]').click();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.showGlobalToast) {
        window.showGlobalToast('Report loaded from history', 'success');
    }
};

function populateProfileHeader() {
    if (!currentPlayer) return;

    const squad = squadManager.getSquads().find(s => s.id === currentPlayer.squadId);

    document.getElementById('profName').textContent = currentPlayer.name;
    document.getElementById('profAvatarInitials').textContent = currentPlayer.name.substring(0, 2).toUpperCase();
    document.getElementById('profPosition').textContent = currentPlayer.position;
    document.getElementById('profSquad').textContent = squad ? squad.name : 'Unassigned';

    // Populate Read-Only View
    document.getElementById('viewProfAge').textContent = currentPlayer.age || '--';
    document.getElementById('viewProfHeight').textContent = currentPlayer.height ? currentPlayer.height + ' cm' : '--';
    document.getElementById('viewProfWeight').textContent = currentPlayer.weight ? currentPlayer.weight + ' kg' : '--';
    document.getElementById('viewProfFoot').textContent = currentPlayer.foot || '--';
    document.getElementById('viewProfPosition').textContent = currentPlayer.position || '--';
    document.getElementById('viewProfClubs').textContent = currentPlayer.previousClubs || '--';

    // Populate Edit Form
    document.getElementById('editProfAge').value = currentPlayer.age || '';
    document.getElementById('editProfHeight').value = currentPlayer.height || '';
    document.getElementById('editProfWeight').value = currentPlayer.weight || '';
    document.getElementById('editProfFoot').value = currentPlayer.foot || 'Right';
    document.getElementById('editProfPosition').value = currentPlayer.position || 'CM';
    document.getElementById('editProfClubs').value = currentPlayer.previousClubs || '';

    // Action Buttons
    const btnToggleEdit = document.getElementById('btnToggleEditProfile');
    const btnCancelEdit = document.getElementById('btnCancelProfileEdit');
    const btnSave = document.getElementById('btnSaveProfileInfo');

    if (btnToggleEdit) btnToggleEdit.addEventListener('click', () => toggleEditMode(true));
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => toggleEditMode(false));
    if (btnSave) btnSave.addEventListener('click', saveProfileInfo);

    // Team select for assessment - Now a text input, no need to populate options
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = tab.getAttribute('data-tab');

            // If manual click, clear editing state for that tab
            if (e.isTrusted) {
                if (tabName === 'assess') editingAssessmentId = null;
                if (tabName === 'overview') editingDevStructureId = null;
            }

            // Remove active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active
            tab.classList.add('active');
            const targetId = 'tab-' + tabName;
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('active');

            if (tabName === 'history') {
                renderAssessmentHistory();
                renderOverviewHistory();
            }

            if (tabName === 'player-analysis') {
                renderHighlights();
                renderAnalysisVideos();
            }
        });
    });
}

function setupAssessmentForm() {
    document.getElementById('assessDate').valueAsDate = new Date();

    const btnSubmit = document.getElementById('btnSubmitAssessment');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', saveAssessment);
    }

    // Modal Close Logic
    const closeBtns = document.querySelectorAll('.btn-close-modal, [data-close-modal]');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modals = document.querySelectorAll('.modal-overlay');
            modals.forEach(m => m.classList.remove('active'));
            // If the element was dynamically added (bubble modal), also remove it
            const bubbleModal = btn.closest('.modal-overlay');
            if (bubbleModal && bubbleModal.hasAttribute('id') === false) {
                bubbleModal.remove();
            }
        });
    });

    // Close on overlay click
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

async function saveAssessment() {
    const btnSubmit = document.getElementById('btnSubmitAssessment');
    if (!btnSubmit) return;

    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btnSubmit.disabled = true;

    // Gather Ratings
    const getRadioValue = (name) => {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? parseInt(checked.value) : 0;
    };

    const record = {
        id: editingAssessmentId,
        playerId: currentPlayerId,
        date: document.getElementById('assessDate').value,
        author: document.getElementById('assessEvaluator').value || 'System',
        team: document.getElementById('assessTeam').value,
        matchId: document.getElementById('assessMatch').value,
        ratings: {
            tactical: {
                positioning: getRadioValue('tac_pos'),
                decision: getRadioValue('tac_dec'),
                awareness: getRadioValue('tac_awa'),
                creativity: getRadioValue('tac_cre')
            },
            technical: {
                passing: getRadioValue('tec_pas'),
                touch: getRadioValue('tec_tou'),
                control: getRadioValue('tec_con'),
                dribbling: getRadioValue('tec_dri')
            },
            physical: {
                speed: getRadioValue('phy_spe'),
                agility: getRadioValue('phy_agi'),
                stamina: getRadioValue('phy_sta'),
                strength: getRadioValue('phy_str')
            },
            psychological: {
                workEthic: getRadioValue('psy_wor'),
                communication: getRadioValue('psy_com'),
                focus: getRadioValue('psy_foc'),
                resilience: getRadioValue('psy_res')
            }
        },
        feedback: {
            strength: document.getElementById('assessStrength').value,
            improvement: document.getElementById('assessImprove').value,
            growth: document.getElementById('assessGrowth').value,
            comments: document.getElementById('assessComments').value
        }
    };

    console.log('Final Assessment Record:', record);

    const success = await squadManager.saveAssessment(record);

    if (success) {
        editingAssessmentId = null;
        btnSubmit.innerHTML = '<i class="fas fa-check"></i> Report Submitted!';
        btnSubmit.style.background = 'var(--green-accent)';

        setTimeout(() => {
            btnSubmit.innerHTML = originalText;
            btnSubmit.style.background = '';
            btnSubmit.disabled = false;

            // Clear form
            document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
            document.getElementById('assessStrength').value = '';
            document.getElementById('assessImprove').value = '';
            document.getElementById('assessGrowth').value = '';
            document.getElementById('assessComments').value = '';
            document.getElementById('assessEvaluator').value = ''; // Added this back
            document.getElementById('assessMatch').value = ''; // Added this back

            // Refresh history
            renderAssessmentHistory();
        }, 1500);
    } else {
        alert('Failed to save assessment to database. Please check connection.');
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
}

async function renderAssessmentHistory() {
    if (!currentPlayerId) return;
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const container = document.getElementById('assessmentHistoryContainer');
    if (!container) return;

    if (historyData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted); background: #f8fafc; border-radius: 12px; border: 1px dashed var(--border);">
                <i class="fas fa-file-invoice" style="font-size: 2.5rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>No reports found. Create a new assessment to begin tracking.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = historyData.map(record => {
        const d = new Date(record.date).toLocaleDateString();
        const title = record.matchId ? `Match Report: ${record.matchId}` : 'Overall Performance Review';

        return `
        <div class="dash-card history-item" style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h4 style="margin: 0 0 4px 0; color: var(--navy-dark); font-size: 1.05rem;">${title}</h4>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i> ${d} &nbsp; | &nbsp; <i class="far fa-user" style="margin-right: 4px;"></i> Evaluator: ${record.author || record.evaluator || 'Unknown'}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="dash-btn outline sm" onclick="viewAssessmentDetails('${record.id}')">
                        <i class="far fa-eye"></i> View
                    </button>
                    <button class="dash-btn outline sm" onclick="deleteAssessment('${record.id}')" style="border-color: #fca5a5; color: #ef4444;">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

window.deleteAssessment = async (id) => {
    if (!confirm('Are you sure you want to delete this assessment?')) return;
    const success = await squadManager.deleteAssessment(id);
    if (success) {
        renderAssessmentHistory();
        if (window.showGlobalToast) window.showGlobalToast('Assessment deleted', 'success');
    }
};

window.loadAssessmentForEdit = async (id) => {
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const record = historyData.find(r => String(r.id) === String(id));
    if (!record) {
        console.error('Assessment not found for ID:', id);
        return;
    }

    // Populate metadata
    document.getElementById('assessTeam').value = rec.team || '';
    document.getElementById('assessMatch').value = rec.matchId || '';
    editingAssessmentId = rec.id;

    // Helper to set radio buttons
    const setRadio = (category, name, value) => {
        const input = document.querySelector(`input[name="${category}_${name}"][value="${value}"]`);
        if (input) input.checked = true;
    };

    // Populate Ratings
    const r = rec.ratings;
    if (r) {
        if (r.tactical) {
            setRadio('tac', 'pos', r.tactical.positioning);
            setRadio('tac', 'dec', r.tactical.decision);
            setRadio('tac', 'awa', r.tactical.awareness);
            setRadio('tac', 'cre', r.tactical.creativity);
        }
        if (r.technical) {
            setRadio('tec', 'pas', r.technical.passing);
            setRadio('tec', 'tou', r.technical.touch);
            setRadio('tec', 'con', r.technical.control);
            setRadio('tec', 'dri', r.technical.dribbling);
        }
        if (r.physical) {
            setRadio('phy', 'spe', r.physical.speed);
            setRadio('phy', 'agi', r.physical.agility);
            setRadio('phy', 'sta', r.physical.stamina);
            setRadio('phy', 'str', r.physical.strength);
        }
        if (r.psychological) {
            setRadio('psy', 'wor', r.psychological.workEthic);
            setRadio('psy', 'com', r.psychological.communication);
            setRadio('psy', 'foc', r.psychological.focus);
            setRadio('psy', 'res', r.psychological.resilience);
        }
    }

    // Populate Feedback
    const f = rec.feedback;
    if (f) {
        document.getElementById('assessStrength').value = f.strength || '';
        document.getElementById('assessImprove').value = f.improvement || '';
        document.getElementById('assessGrowth').value = f.growth || '';
        document.getElementById('assessComments').value = f.comments || '';
    }

    // Switch to Assess tab
    document.querySelector('[data-tab="assess"]').click();

    // Scroll to form
    const formSection = document.getElementById('tab-assess');
    if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth' });
    }

    if (window.showGlobalToast) {
        window.showGlobalToast('Assessment loaded for editing', 'success');
    }
};

window.viewAssessmentDetails = async (assessId) => {
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const record = historyData.find(r => r.id == assessId);
    if (!record) return;

    // Set Header
    const evaluatorName = record.author || record.evaluator || 'Unknown';
    document.getElementById('viewAssessMeta').textContent = `Date: ${new Date(record.date).toLocaleDateString()} | Evaluator: ${evaluatorName} | Team: ${record.team || 'N/A'}`;
    if (record.match) {
        document.getElementById('viewAssessTitle').textContent = `Match Report: ${record.match}`;
    } else {
        document.getElementById('viewAssessTitle').textContent = `Overall Performance Review`;
    }

    // Populate Ratings
    const ratingsContainer = document.getElementById('viewAssessRatings');
    ratingsContainer.innerHTML = '';

    const categories = {
        tactical: 'Tactical Analysis',
        technical: 'Technical Skills',
        physical: 'Physical Performance',
        psychological: 'Psychological Assessment'
    };

    if (record.ratings) {
        Object.keys(categories).forEach(catKey => {
            const catData = record.ratings[catKey];
            if (catData) {
                const section = document.createElement('div');
                section.className = 'form-group-bubble';
                section.innerHTML = `
                    <label style="color: var(--blue-accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 12px;">${categories[catKey]}</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${Object.keys(catData).map(attr => {
                    const val = catData[attr] || 0;
                    let stars = '';
                    for (let i = 1; i <= 5; i++) {
                        stars += `<i class="${i <= val ? 'fas' : 'far'} fa-star" style="color: ${i <= val ? '#f59e0b' : '#cbd5e1'}; font-size: 0.8rem; margin-left: 2px;"></i>`;
                    }
                    // Capitalize attribute name
                    const label = attr.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return `
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.85rem; color: var(--text-dark);">${label}</span>
                                    <div>${stars}</div>
                                </div>
                            `;
                }).join('')}
                    </div>
                `;
                ratingsContainer.appendChild(section);
            }
        });
    }

    // Populate Feedback
    const feedbackContainer = document.getElementById('viewAssessFeedback');
    feedbackContainer.innerHTML = '';
    const fields = {
        strength: 'Key Strengths',
        improvement: 'Areas to Improve',
        growth: 'Suggestions for Growth',
        comments: 'Final Comments'
    };

    if (record.feedback) {
        Object.keys(fields).forEach(fKey => {
            const text = record.feedback[fKey];
            if (text) {
                const div = document.createElement('div');
                div.className = 'form-group-bubble';
                div.innerHTML = `
                    <label>${fields[fKey]}</label>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.5; border: 1px solid var(--border-light);">
                        ${text.replace(/\n/g, '<br>')}
                    </div>
                `;
                feedbackContainer.appendChild(div);
            }
        });
    }

    // Show Modal
    document.getElementById('modalViewAssessment').classList.add('active');
}

function toggleEditMode(isEditing) {
    const viewState = document.getElementById('profStatsViewState');
    const editState = document.getElementById('profStatsEditState');
    const toggleBtn = document.getElementById('btnToggleEditProfile');

    if (isEditing) {
        viewState.style.display = 'none';
        editState.style.display = 'block';
        toggleBtn.style.display = 'none';
    } else {
        viewState.style.display = 'grid'; // it's a grid
        editState.style.display = 'none';
        toggleBtn.style.display = 'block';

        // Reset inputs on cancel
        populateProfileHeader();
    }
}

async function saveProfileInfo() {
    const btn = document.getElementById('btnSaveProfileInfo');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const updatedData = {
        age: document.getElementById('editProfAge').value,
        height: document.getElementById('editProfHeight').value,
        weight: document.getElementById('editProfWeight').value,
        foot: document.getElementById('editProfFoot').value,
        position: document.getElementById('editProfPosition').value,
        previousClubs: document.getElementById('editProfClubs').value
    };

    const success = await squadManager.updatePlayer(currentPlayerId, updatedData);

    if (success) {
        // Update local memory
        currentPlayer = { ...currentPlayer, ...updatedData };
        btn.innerHTML = '<i class="fas fa-check"></i> Saved';
        btn.style.background = 'var(--green-accent)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--green-accent)';

        // Return to view mode with updated data
        setTimeout(() => {
            toggleEditMode(false);
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.disabled = false;
        }, 1000);

    } else {
        btn.innerHTML = '<i class="fas fa-times"></i> Error';
        btn.style.background = 'red';
        btn.style.color = '#fff';

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.disabled = false;
        }, 2000);
    }
}// --- Player Analysis Logic ---
function setupAnalysisTab() {
    console.log('Player Profile: Setting up Analysis Tab...');

    // Global functions for buttons in HTML
    window.openHighlightModal = () => {
        document.getElementById('modalAddHighlight').classList.add('active');
    };

    window.openAnalysisVideoModal = () => {
        document.getElementById('modalAddAnalysisVideo').classList.add('active');
    };

    window.closeModal = (id) => {
        document.getElementById(id).classList.remove('active');
    };

    renderHighlights();
    renderAnalysisVideos();
}

async function renderHighlights() {
    const grid = document.getElementById('highlightsGrid');
    const emptyState = document.getElementById('emptyHighlightsState');
    if (!grid || !currentPlayer) return;

    const highlights = typeof currentPlayer.highlights === 'string'
        ? JSON.parse(currentPlayer.highlights || '[]')
        : (currentPlayer.highlights || []);

    if (highlights.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = highlights.map((h, index) => `
        <div class="dash-card" style="padding: 0; overflow: hidden; position: relative;">
            <div style="background: #f1f5f9; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; position: relative;">
                <i class="fas fa-play-circle" style="font-size: 3rem; color: var(--blue-accent); opacity: 0.8;"></i>
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                    <button class="dash-btn sm" onclick="deleteHighlight(${index})" style="background: rgba(239, 68, 68, 0.9); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div style="padding: 16px;">
                <h5 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--navy-dark);">${h.title}</h5>
                <p style="margin: 0 0 16px 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">${h.description || 'No description provided.'}</p>
                <a href="${h.url}" target="_blank" class="dash-btn outline sm" style="width: 100%; text-align: center; display: block; text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> View Highlight
                </a>
            </div>
        </div>
    `).join('');
}

async function renderAnalysisVideos() {
    const grid = document.getElementById('analysisVideosGrid');
    const emptyState = document.getElementById('emptyAnalysisVideosState');
    if (!grid || !currentPlayer) return;

    const videos = typeof currentPlayer.analysisVideos === 'string'
        ? JSON.parse(currentPlayer.analysisVideos || '[]')
        : (currentPlayer.analysisVideos || []);

    if (videos.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = videos.map((v, index) => `
        <div class="dash-card" style="padding: 0; overflow: hidden; position: relative;">
            <div style="background: #f1f5f9; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; position: relative;">
                <i class="fas fa-film" style="font-size: 3rem; color: var(--blue-accent); opacity: 0.8;"></i>
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                    <button class="dash-btn sm" onclick="deleteAnalysisVideo(${index})" style="background: rgba(239, 68, 68, 0.9); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div style="padding: 16px;">
                <h5 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--navy-dark);">${v.title}</h5>
                <p style="margin: 0 0 16px 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">${v.notes || 'No notes provided.'}</p>
                <a href="${v.url}" target="_blank" class="dash-btn outline sm" style="width: 100%; text-align: center; display: block; text-decoration: none;">
                    <i class="fas fa-video"></i> Watch Video
                </a>
            </div>
        </div>
    `).join('');
}

window.saveHighlight = async () => {
    const title = document.getElementById('highlightTitle').value;
    const url = document.getElementById('highlightUrl').value;
    const description = document.getElementById('highlightDescription').value;

    if (!title || !url) {
        alert('Please provide at least a title and a URL.');
        return;
    }

    const currentHighlights = typeof currentPlayer.highlights === 'string'
        ? JSON.parse(currentPlayer.highlights || '[]')
        : (currentPlayer.highlights || []);

    const newHighlight = { title, url, description, timestamp: new Date().toISOString() };
    const updatedHighlights = [...currentHighlights, newHighlight];

    const success = await squadManager.updatePlayer(currentPlayerId, {
        highlights: JSON.stringify(updatedHighlights)
    });

    if (success) {
        currentPlayer.highlights = updatedHighlights;
        renderHighlights();
        closeModal('modalAddHighlight');
        // Clear inputs
        document.getElementById('highlightTitle').value = '';
        document.getElementById('highlightUrl').value = '';
        document.getElementById('highlightDescription').value = '';
        if (window.showGlobalToast) window.showGlobalToast('Highlight added successfully', 'success');
    } else {
        alert('Failed to save highlight.');
    }
};

window.saveAnalysisVideo = async () => {
    const title = document.getElementById('analysisVideoTitle').value;
    const url = document.getElementById('analysisVideoUrl').value;
    const notes = document.getElementById('analysisVideoNotes').value;

    if (!title || !url) {
        alert('Please provide at least a title and a URL.');
        return;
    }

    const currentVideos = typeof currentPlayer.analysisVideos === 'string'
        ? JSON.parse(currentPlayer.analysisVideos || '[]')
        : (currentPlayer.analysisVideos || []);

    const newVideo = { title, url, notes, timestamp: new Date().toISOString() };
    const updatedVideos = [...currentVideos, newVideo];

    const success = await squadManager.updatePlayer(currentPlayerId, {
        analysisVideos: JSON.stringify(updatedVideos)
    });

    if (success) {
        currentPlayer.analysisVideos = updatedVideos;
        renderAnalysisVideos();
        closeModal('modalAddAnalysisVideo');
        // Clear inputs
        document.getElementById('analysisVideoTitle').value = '';
        document.getElementById('analysisVideoUrl').value = '';
        document.getElementById('analysisVideoNotes').value = '';
        if (window.showGlobalToast) window.showGlobalToast('Analysis video added successfully', 'success');
    } else {
        alert('Failed to save analysis video.');
    }
};

window.deleteHighlight = async (index) => {
    if (!confirm('Are you sure you want to delete this highlight?')) return;

    const highlights = typeof currentPlayer.highlights === 'string'
        ? JSON.parse(currentPlayer.highlights || '[]')
        : (currentPlayer.highlights || []);

    highlights.splice(index, 1);

    const success = await squadManager.updatePlayer(currentPlayerId, {
        highlights: JSON.stringify(highlights)
    });

    if (success) {
        currentPlayer.highlights = highlights;
        renderHighlights();
        if (window.showGlobalToast) window.showGlobalToast('Highlight deleted', 'success');
    } else {
        alert('Failed to delete highlight.');
    }
};

window.deleteAnalysisVideo = async (index) => {
    if (!confirm('Are you sure you want to delete this analysis video?')) return;

    const videos = typeof currentPlayer.analysisVideos === 'string'
        ? JSON.parse(currentPlayer.analysisVideos || '[]')
        : (currentPlayer.analysisVideos || []);

    videos.splice(index, 1);

    const success = await squadManager.updatePlayer(currentPlayerId, {
        analysisVideos: JSON.stringify(videos)
    });

    if (success) {
        currentPlayer.analysisVideos = videos;
        renderAnalysisVideos();
        if (window.showGlobalToast) window.showGlobalToast('Analysis video deleted', 'success');
    } else {
        alert('Failed to delete analysis video.');
    }
};

