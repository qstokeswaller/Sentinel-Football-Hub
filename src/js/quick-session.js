/**
 * Quick Session — fast session logging with auto-attendance.
 * Creates a session + marks all selected players as present in one step.
 * Used from Training Register page and Dashboard calendar.
 *
 * Two modes based on club archetype:
 *  - academy (Tuks):          single squad → all players default CHECKED → deselect chips
 *  - private_coaching (Orion): multi-squad chips → checklist default UNCHECKED → check to add
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import { showToast } from '../toast.js';
import { upgradeTimePickers } from '../time-picker.js';

let _modalInjected = false;
let _selectedPlayerIds = new Set();  // used by both modes
let _activeQsSquadIds = new Set();   // private_coaching multi-squad chips
let _onComplete = null;

// ═══════════════════════════════════════════════════════════
//  MODAL INJECTION
// ═══════════════════════════════════════════════════════════
function ensureModal() {
    if (_modalInjected) return;
    _modalInjected = true;

    const html = `
    <div class="modal-overlay" id="quickSessionModal">
        <div class="modal-container modal-bubble" style="max-width:520px;margin:24px;max-height:calc(100vh - 48px);overflow-y:auto;padding:28px 28px 24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;font-size:1.1rem;color:var(--navy-dark);"><i class="fas fa-bolt" style="margin-right:8px;color:var(--primary);"></i>Quick Session</h3>
                <button onclick="window._closeQuickSession()" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border-light);background:var(--bg-body);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem;transition:all 0.15s;" onmouseenter="this.style.background='#fee2e2';this.style.color='#ef4444';this.style.borderColor='#fecaca'" onmouseleave="this.style.background='';this.style.color='';this.style.borderColor=''"><i class="fas fa-times"></i></button>
            </div>

            <div class="qs-form-row">
                <div class="qs-field" style="flex:1;">
                    <label>Date</label>
                    <input type="date" id="qsDate">
                </div>
                <div class="qs-field" style="width:110px;">
                    <label>Time</label>
                    <input type="time" id="qsTime" placeholder="e.g. 15:00">
                </div>
                <div class="qs-field" style="width:110px;">
                    <label>Duration</label>
                    <input type="text" id="qsDuration" placeholder="60 min" value="60 min">
                </div>
            </div>

            <div class="qs-form-row">
                <div class="qs-field" style="flex:1;">
                    <label>Title (optional)</label>
                    <input type="text" id="qsTitle" placeholder="Training Session">
                </div>
                <div class="qs-field" style="flex:1;">
                    <label>Venue (optional)</label>
                    <input type="text" id="qsVenue" placeholder="Main Pitch">
                </div>
            </div>

            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.8rem;font-weight:600;color:var(--text-secondary);">
                    <input type="checkbox" id="qsRecurring" onchange="document.getElementById('qsRecurringOptions').style.display=this.checked?'':'none'">
                    <i class="fas fa-redo" style="color:var(--primary);"></i> Make this a recurring session
                </label>
                <div id="qsRecurringOptions" style="display:none;margin-top:10px;">
                    <div class="qs-form-row" style="margin-bottom:6px;">
                        <div class="qs-field" style="flex:1;">
                            <label>Day of Week</label>
                            <select id="qsRecurDay">
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                                <option value="0">Sunday</option>
                            </select>
                        </div>
                        <div class="qs-field" style="width:100px;">
                            <label>Weeks</label>
                            <input type="number" id="qsRecurWeeks" value="8" min="1" max="52" placeholder="8">
                        </div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--text-muted);margin:0;">Creates one session per week starting from the selected date.</p>
                </div>
            </div>

            <!-- ── ACADEMY: single squad select ── -->
            <div id="qsSquadWrap" class="qs-field" style="margin-top:12px;">
                <label>Squad</label>
                <select id="qsSquad" onchange="window._onQsSquadChange()">
                    <option value="">-- Select Squad --</option>
                </select>
            </div>

            <!-- ── PRIVATE COACHING: multi-squad chips ── -->
            <div id="qsMultiSquadWrap" style="display:none;margin-top:12px;">
                <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Squads <span style="font-weight:400;color:var(--text-muted);">— select to show players</span></label>
                <div id="qsSquadChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
            </div>

            <!-- ── ACADEMY: search + chip players ── -->
            <div id="qsAcademyPlayers">
                <div class="qs-field" style="margin-top:12px;">
                    <label><i class="fas fa-search" style="margin-right:4px;opacity:0.5;"></i>Search player to add</label>
                    <input type="text" id="qsPlayerSearch" placeholder="Type name..." autocomplete="off" style="border-style:dashed;">
                    <div id="qsSearchResults" style="max-height:120px;overflow-y:auto;margin-top:4px;"></div>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);">
                        Players <span id="qsPlayerCount" style="color:var(--primary);">(0)</span>
                        <span style="font-weight:400;color:var(--text-muted);margin-left:8px;">Click to remove</span>
                    </label>
                    <div id="qsPlayerChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:36px;padding:10px;background:var(--bg-body);border-radius:10px;border:1px solid var(--border-light);">
                        <span style="color:var(--text-muted);font-size:0.8rem;">Select a squad or search players</span>
                    </div>
                </div>
            </div>

            <!-- ── PRIVATE COACHING: search + checklist ── -->
            <div id="qsPrivatePlayers" style="display:none;">
                <div class="qs-field" style="margin-top:12px;">
                    <label><i class="fas fa-search" style="margin-right:4px;opacity:0.5;"></i>Search players across all squads</label>
                    <input type="text" id="qsPrivateSearch" placeholder="Type name..." autocomplete="off">
                </div>
                <div id="qsChecklist" style="margin-top:8px;max-height:220px;overflow-y:auto;padding:8px;background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;"></div>
                <div style="font-size:0.75rem;color:var(--primary);font-weight:600;margin-top:6px;" id="qsCheckCount">0 players selected</div>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
                <button class="dash-btn" onclick="window._closeQuickSession()">Cancel</button>
                <button class="dash-btn primary" id="btnSaveQuickSession" onclick="window._saveQuickSession()">
                    <i class="fas fa-save" style="margin-right:6px;"></i>Save Session & Attendance
                </button>
            </div>
        </div>
    </div>
    <style>
        #quickSessionModal .modal-container { box-sizing:border-box; }
        .qs-form-row { display:flex; gap:10px; margin-bottom:10px; align-items:flex-end; }
        .qs-field { display:flex; flex-direction:column; }
        .qs-field label { font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px; }
        .qs-field input, .qs-field select { padding:9px 12px; border:1px solid var(--border-light); border-radius:8px; font-family:inherit; font-size:0.84rem; background:var(--bg-body); color:var(--text-primary); box-sizing:border-box; width:100%; height:38px; }
        .qs-field .flatpickr-input { height:38px !important; }
        .qs-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; background:#ecfdf5; color:#065f46; border:1px solid #d1fae5; cursor:pointer; transition:all 0.1s; }
        .qs-chip:hover { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
        .qs-squad-chip { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; font-size:0.79rem; font-weight:600; background:var(--bg-body); color:var(--text-secondary); border:1px solid var(--border-light); cursor:pointer; transition:all 0.15s; }
        .qs-squad-chip.active { background:var(--primary); color:#fff; border-color:var(--primary); }
        .qs-search-item { display:flex; align-items:center; gap:8px; padding:6px 10px; cursor:pointer; border-radius:6px; font-size:0.82rem; }
        .qs-search-item:hover { background:var(--bg-body); }
        .qs-checklist-squad { font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; padding:6px 4px 3px; }
        .qs-checklist-player { display:flex; align-items:center; gap:8px; padding:5px 4px; border-radius:6px; cursor:pointer; font-size:0.83rem; transition:background 0.1s; }
        .qs-checklist-player:hover { background:#f1f5f9; }
        .qs-checklist-player input[type="checkbox"] { width:15px; height:15px; cursor:pointer; accent-color:var(--primary); flex-shrink:0; }
        @media (max-width: 480px) { .qs-form-row { flex-direction:column; } }
    </style>`;

    document.body.insertAdjacentHTML('beforeend', html);

    // Academy: player search
    document.getElementById('qsPlayerSearch')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const results = document.getElementById('qsSearchResults');
        if (!term) { results.innerHTML = ''; return; }
        const allPlayers = squadManager.getPlayers({});
        const matches = allPlayers.filter(p => p.name.toLowerCase().includes(term) && !_selectedPlayerIds.has(p.id)).slice(0, 8);
        results.innerHTML = matches.map(p => {
            const initials = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return `<div class="qs-search-item" onclick="window._qsAddPlayer('${p.id}')">
                <div style="width:26px;height:26px;border-radius:50%;background:#e2e8f0;color:#475569;font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;">${initials}</div>
                <span>${p.name}</span>
            </div>`;
        }).join('') || '<div style="padding:8px;color:var(--text-muted);font-size:0.8rem;">No matches</div>';
    });

    // Private coaching: search filters checklist
    document.getElementById('qsPrivateSearch')?.addEventListener('input', () => renderQsChecklist());
}

// ═══════════════════════════════════════════════════════════
//  OPEN / CLOSE
// ═══════════════════════════════════════════════════════════
export function openQuickSession(onComplete) {
    ensureModal();
    _onComplete = onComplete || null;
    _selectedPlayerIds = new Set();
    _activeQsSquadIds = new Set();

    const isPrivate = window._profile?.clubs?.settings?.archetype === 'private_coaching';

    // Reset form
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('qsDate').value = today;
    document.getElementById('qsTime').value = '';
    document.getElementById('qsDuration').value = '60 min';
    document.getElementById('qsTitle').value = '';
    document.getElementById('qsVenue').value = '';
    document.getElementById('qsRecurring').checked = false;
    document.getElementById('qsRecurringOptions').style.display = 'none';

    const squads = squadManager.getSquads();

    if (isPrivate) {
        // Show multi-squad chips + checklist
        document.getElementById('qsSquadWrap').style.display = 'none';
        document.getElementById('qsAcademyPlayers').style.display = 'none';
        document.getElementById('qsMultiSquadWrap').style.display = '';
        document.getElementById('qsPrivatePlayers').style.display = '';

        // Reset private search
        const ps = document.getElementById('qsPrivateSearch');
        if (ps) ps.value = '';

        // Render squad chips
        const chipsEl = document.getElementById('qsSquadChips');
        chipsEl.innerHTML = squads.map(s =>
            `<div class="qs-squad-chip" data-squad-id="${s.id}" onclick="window._onQsSquadChipClick('${s.id}', this)">
                ${s.name} <span style="opacity:0.6;font-weight:400;">(${squadManager.getPlayers({ squadId: s.id }).length})</span>
            </div>`
        ).join('');

        renderQsChecklist();
        renderQsCheckCount();
    } else {
        // Show single squad select + academy chip players
        document.getElementById('qsSquadWrap').style.display = '';
        document.getElementById('qsAcademyPlayers').style.display = '';
        document.getElementById('qsMultiSquadWrap').style.display = 'none';
        document.getElementById('qsPrivatePlayers').style.display = 'none';

        document.getElementById('qsPlayerSearch').value = '';
        document.getElementById('qsSearchResults').innerHTML = '';

        const select = document.getElementById('qsSquad');
        select.innerHTML = '<option value="">-- Select Squad --</option>' +
            squads.map(s => `<option value="${s.id}">${s.name} (${squadManager.getPlayers({ squadId: s.id }).length})</option>`).join('');

        renderQsChips();
    }

    document.getElementById('quickSessionModal').classList.add('active');
    try { upgradeTimePickers(); } catch (e) {}
}

window._closeQuickSession = function() {
    document.getElementById('quickSessionModal')?.classList.remove('active');
};
window._openQuickSession = function() { openQuickSession(); };

// ═══════════════════════════════════════════════════════════
//  PRIVATE COACHING — squad chip toggle
// ═══════════════════════════════════════════════════════════
window._onQsSquadChipClick = function(squadId, el) {
    if (_activeQsSquadIds.has(squadId)) {
        _activeQsSquadIds.delete(squadId);
        el.classList.remove('active');
    } else {
        _activeQsSquadIds.add(squadId);
        el.classList.add('active');
    }
    renderQsChecklist();
};

function renderQsChecklist() {
    const container = document.getElementById('qsChecklist');
    if (!container) return;

    const searchTerm = (document.getElementById('qsPrivateSearch')?.value || '').trim().toLowerCase();

    // When searching scan all squads, otherwise only active chips
    const squadIds = searchTerm
        ? squadManager.getSquads().map(s => s.id)
        : [..._activeQsSquadIds];

    if (squadIds.length === 0 && !searchTerm) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px 4px;">Select a squad above to see players</div>';
        return;
    }

    let html = '';
    let total = 0;
    for (const squadId of squadIds) {
        const squad = squadManager.getSquad(squadId);
        let players = squadManager.getPlayers({ squadId });
        if (searchTerm) players = players.filter(p => p.name.toLowerCase().includes(searchTerm));
        if (players.length === 0) continue;

        html += `<div class="qs-checklist-squad">${squad?.name || 'Unknown'}</div>`;
        html += players.map(p => {
            const checked = _selectedPlayerIds.has(p.id);
            total++;
            return `<label class="qs-checklist-player">
                <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''}
                    onchange="window._onQsChecklistToggle('${p.id}', this.checked)">
                <span>${p.name}</span>
                ${p.position ? `<span style="font-size:0.72rem;color:var(--text-muted);">${p.position.split(',')[0].trim()}</span>` : ''}
            </label>`;
        }).join('');
    }

    if (!html) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px 4px;">No players found</div>';
    } else {
        container.innerHTML = html;
    }

    renderQsCheckCount();
}

window._onQsChecklistToggle = function(playerId, checked) {
    if (checked) _selectedPlayerIds.add(playerId);
    else _selectedPlayerIds.delete(playerId);
    renderQsCheckCount();
};

function renderQsCheckCount() {
    const el = document.getElementById('qsCheckCount');
    if (el) el.textContent = `${_selectedPlayerIds.size} player${_selectedPlayerIds.size !== 1 ? 's' : ''} selected`;
}

// ═══════════════════════════════════════════════════════════
//  ACADEMY — squad change + chip helpers
// ═══════════════════════════════════════════════════════════
window._onQsSquadChange = function() {
    const squadId = document.getElementById('qsSquad')?.value;
    if (!squadId) return;
    const players = squadManager.getPlayers({ squadId });
    // Academy: auto-select all
    players.forEach(p => _selectedPlayerIds.add(p.id));
    renderQsChips();
};

window._qsAddPlayer = function(id) {
    _selectedPlayerIds.add(id);
    document.getElementById('qsPlayerSearch').value = '';
    document.getElementById('qsSearchResults').innerHTML = '';
    renderQsChips();
};

window._qsRemovePlayer = function(id) {
    _selectedPlayerIds.delete(id);
    renderQsChips();
};

function renderQsChips() {
    const container = document.getElementById('qsPlayerChips');
    const countEl = document.getElementById('qsPlayerCount');
    const allPlayers = squadManager.getPlayers({});
    const selected = allPlayers.filter(p => _selectedPlayerIds.has(p.id));

    countEl.textContent = `(${selected.length})`;

    if (!selected.length) {
        container.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Select a squad or search players</span>';
        return;
    }
    container.innerHTML = selected.map(p =>
        `<span class="qs-chip" onclick="window._qsRemovePlayer('${p.id}')" title="Click to remove">
            ${p.name} <i class="fas fa-times" style="font-size:0.65rem;opacity:0.5;"></i>
        </span>`
    ).join('');
}

// ═══════════════════════════════════════════════════════════
//  SAVE — creates session + attendance in one go
// ═══════════════════════════════════════════════════════════
window._saveQuickSession = async function() {
    const date = document.getElementById('qsDate')?.value;
    if (!date) { showToast('Please select a date', 'error'); return; }
    if (_selectedPlayerIds.size === 0) { showToast('Please select at least one player', 'error'); return; }

    const isPrivate = window._profile?.clubs?.settings?.archetype === 'private_coaching';
    const squadId = isPrivate ? null : (document.getElementById('qsSquad')?.value || null);
    if (!isPrivate && !squadId) { showToast('Please select a squad — required for attendance tracking', 'error'); return; }

    const btn = document.getElementById('btnSaveQuickSession');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;
        const userId = window._profile?.id;
        const authorName = window._profile?.full_name || '';
        if (!clubId) throw new Error('No club context');

        const title = document.getElementById('qsTitle')?.value?.trim() || 'Training Session';
        const time = document.getElementById('qsTime')?.value || null;
        const duration = document.getElementById('qsDuration')?.value?.trim() || '';
        const venue = document.getElementById('qsVenue')?.value?.trim() || '';
        const playerIds = [..._selectedPlayerIds];
        const season = window._profile?.clubs?.settings?.current_season || new Date().getFullYear().toString();

        // Resolve team name
        let team = '';
        if (isPrivate) {
            // Use active squad names joined, or 'Multi-Squad'
            const activeSquadNames = [..._activeQsSquadIds].map(id => squadManager.getSquad(id)?.name).filter(Boolean);
            team = activeSquadNames.length === 1 ? activeSquadNames[0] : (activeSquadNames.length > 1 ? 'Multi-Squad' : 'Training');
        } else {
            team = squadManager.getSquads().find(s => s.id === squadId)?.name || '';
        }

        // Build attendance grouping for private coaching (by squad)
        // Map each selected player → their squad_id
        // Players with no squad get grouped under a '__none__' key and skipped for attendance
        let playerSquadMap = {};
        if (isPrivate) {
            const allPlayers = squadManager.getPlayers({});
            for (const pid of playerIds) {
                const p = allPlayers.find(pl => pl.id === pid);
                const sqId = p?.squadId || null;
                if (!sqId) continue; // no squad → still in session player_ids, just no attendance row
                if (!playerSquadMap[sqId]) playerSquadMap[sqId] = [];
                playerSquadMap[sqId].push(pid);
            }
        }

        // Recurring dates
        const isRecurring = document.getElementById('qsRecurring')?.checked;
        const recurDay = parseInt(document.getElementById('qsRecurDay')?.value || '1');
        const recurWeeks = parseInt(document.getElementById('qsRecurWeeks')?.value || '8');

        const dates = [];
        if (isRecurring && recurWeeks > 1) {
            const startD = new Date(date);
            const diff = (recurDay - startD.getDay() + 7) % 7;
            const firstDate = new Date(startD);
            if (diff > 0) firstDate.setDate(firstDate.getDate() + diff);
            for (let w = 0; w < recurWeeks; w++) {
                const d = new Date(firstDate);
                d.setDate(d.getDate() + w * 7);
                dates.push(d.toISOString().split('T')[0]);
            }
        } else {
            dates.push(date);
        }

        let createdCount = 0;
        const today = new Date().toLocaleDateString('en-CA');
        const batchSize = 10;

        for (let b = 0; b < dates.length; b += batchSize) {
            const batch = dates.slice(b, b + batchSize);
            const sessionRows = batch.map(d => ({
                club_id: clubId, created_by: userId, title, date: d,
                start_time: time, duration, venue, team, author: authorName,
                purpose: isRecurring ? 'Recurring Session' : 'Quick Session',
                player_ids: playerIds, season,
            }));
            const { data: created, error: batchErr } = await supabase.from('sessions').insert(sessionRows).select('id, date');
            if (batchErr) { console.warn('Batch insert failed:', batchErr); continue; }
            createdCount += (created || []).length;

            const pastSessions = (created || []).filter(s => s.date <= today);
            if (pastSessions.length === 0) continue;

            let attRows = [];
            if (isPrivate) {
                // One attendance row per squad per session
                for (const sess of pastSessions) {
                    for (const [sqId, sqPlayerIds] of Object.entries(playerSquadMap)) {
                        const totalInSquad = squadManager.getPlayers({ squadId: sqId }).length;
                        attRows.push({
                            club_id: clubId, session_id: sess.id, squad_id: sqId, date: sess.date,
                            absent_player_ids: [], attendance_count: sqPlayerIds.length,
                            attendance_total: totalInSquad, notes: '', updated_at: new Date().toISOString(),
                        });
                    }
                }
            } else {
                attRows = pastSessions.map(s => ({
                    club_id: clubId, session_id: s.id, squad_id: squadId, date: s.date,
                    absent_player_ids: [], attendance_count: playerIds.length,
                    attendance_total: playerIds.length, notes: '', updated_at: new Date().toISOString(),
                }));
            }

            if (attRows.length > 0) {
                await supabase.from('training_attendance')
                    .upsert(attRows, { onConflict: 'session_id,squad_id' })
                    .catch(e => console.warn('Attendance batch:', e));
            }
        }

        window._closeQuickSession();
        if (isRecurring) {
            showToast(`${createdCount} recurring sessions created (${recurWeeks} weeks)`, 'success');
        } else {
            showToast(`Quick session saved — ${playerIds.length} players present`, 'success');
        }

        if (_onComplete) _onComplete();
    } catch (e) {
        console.error('Quick session error:', e);
        showToast('Failed to save: ' + (e.message || ''), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save" style="margin-right:6px;"></i>Save Session & Attendance';
    }
};
