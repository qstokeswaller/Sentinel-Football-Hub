/**
 * Training Register UI
 * Calendar-based attendance marking for training sessions.
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import { showToast } from '../toast.js';
import { initCalendar, setSessionClickHandler, fetchCalendarSessions, reRenderCalendar } from './calendar-ui.js';

let _selectedSession = null;
let _selectedSquadId = null;
let _completedSessionIds = new Set();
let _existingRecord = null; // existing training_attendance record for the selected session
let _allSquadPlayers = []; // full pool for add-player search (Orion)

// ── Init ───────────────────────────────────────────────────────────────────

export async function initTrainingRegisterUI() {
    await squadManager.init();

    // Set up calendar with our click handler instead of the default popup
    setSessionClickHandler(onSessionClick);
    initCalendar();

    // Load which sessions already have attendance saved
    await loadCompletedSessions();

    // Wait a tick for calendar to render, then badge completed sessions
    setTimeout(badgeCompletedSessions, 500);

    // Re-badge after month navigation
    const origChangeMonth = window._changeMonth;
    window._changeMonth = function (delta) {
        origChangeMonth(delta);
        setTimeout(badgeCompletedSessions, 300);
    };

    setupAddPlayerSearch();
}

// ── Load completed session IDs ─────────────────────────────────────────────

async function loadCompletedSessions() {
    try {
        const { data } = await supabase
            .from('training_attendance')
            .select('session_id');
        _completedSessionIds = new Set((data || []).map(r => r.session_id));
    } catch (e) {
        console.error('Failed to load completed sessions:', e);
    }
}

function badgeCompletedSessions() {
    document.querySelectorAll('[data-session-id]').forEach(el => {
        const sid = el.dataset.sessionId;
        if (_completedSessionIds.has(sid) && !el.querySelector('.att-check')) {
            el.insertAdjacentHTML('beforeend', '<span class="att-check"><i class="fas fa-check-circle"></i></span>');
        }
    });
}

// ── Session Click Handler ──────────────────────────────────────────────────

async function onSessionClick(event, sessionId) {
    if (event) event.stopPropagation();

    const sessions = await fetchCalendarSessions();
    const session = sessions.find(s => String(s.id) === String(sessionId));
    if (!session) return;

    _selectedSession = session;

    // Show the attendance panel
    const panel = document.getElementById('attendancePanel');
    if (panel) panel.style.display = 'block';

    // Fill session info bar
    const infoBar = document.getElementById('sessionInfoBar');
    if (infoBar) {
        const dateStr = session.date
            ? new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : 'No date';
        infoBar.innerHTML = `
            <div class="info-item"><i class="fas fa-clipboard-list"></i> <strong>${escH(session.title || 'Untitled')}</strong></div>
            <div class="info-item"><i class="fas fa-calendar"></i> ${dateStr}</div>
            ${session.startTime ? `<div class="info-item"><i class="fas fa-clock"></i> ${session.startTime}${session.duration ? ' (' + session.duration + ' min)' : ''}</div>` : ''}
            ${session.venue ? `<div class="info-item"><i class="fas fa-map-marker-alt"></i> ${escH(session.venue)}</div>` : ''}
            ${session.author ? `<div class="info-item"><i class="fas fa-user"></i> ${escH(session.author)}</div>` : ''}
        `;
    }

    // Update panel title
    const titleEl = document.getElementById('panelTitle');
    if (titleEl) titleEl.textContent = `Mark Attendance — ${session.title || 'Session'}`;

    // Load players directly — no squad selection needed
    loadSessionPlayers(session);

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Load players directly from session ────────────────────────────────────

async function loadSessionPlayers(session) {
    const selectorRow = document.querySelector('.squad-selector-row');
    if (selectorRow) selectorRow.style.display = 'none'; // Always hide

    const archetype = window._profile?.clubs?.settings?.archetype;
    const isPrivateCoaching = archetype === 'private_coaching';
    const sessionPlayerIds = (session.playerIds && session.playerIds.length > 0)
        ? new Set(session.playerIds) : null;

    // Resolve squad from session.team for saving attendance
    const squads = squadManager.getSquads();
    const teamNames = (session.team || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const matchedSquad = squads.find(s => teamNames.includes(s.name.trim().toLowerCase()));
    _selectedSquadId = matchedSquad?.id || (squads[0]?.id || '');

    // Get all players from matched squad(s)
    let allPlayers = [];
    if (matchedSquad) {
        allPlayers = squadManager.getPlayers({ squadId: matchedSquad.id });
    } else if (teamNames.length > 0) {
        for (const sq of squads) {
            if (teamNames.includes(sq.name.trim().toLowerCase())) {
                allPlayers.push(...squadManager.getPlayers({ squadId: sq.id }));
                if (!_selectedSquadId) _selectedSquadId = sq.id;
            }
        }
    }

    // For Orion: store full player pool so add-player search can find anyone
    _allSquadPlayers = isPrivateCoaching ? squadManager.getPlayers({}) : allPlayers;

    // Check for existing attendance record
    _existingRecord = null;
    if (_selectedSquadId) {
        try {
            const { data } = await supabase.from('training_attendance')
                .select('*').eq('session_id', session.id).eq('squad_id', _selectedSquadId).maybeSingle();
            _existingRecord = data;
        } catch (e) { console.error('Failed to check existing attendance:', e); }
    }

    if (_existingRecord) {
        renderPlayerChips(allPlayers);
        const absentIds = Array.isArray(_existingRecord.absent_player_ids)
            ? _existingRecord.absent_player_ids
            : (typeof _existingRecord.absent_player_ids === 'string' ? JSON.parse(_existingRecord.absent_player_ids) : []);
        absentIds.forEach(pid => {
            const chip = document.querySelector(`.reg-chip[data-player-id="${pid}"]`);
            if (chip) {
                chip.classList.add('absent');
                const icon = chip.querySelector('.chip-status i');
                if (icon) icon.className = 'fas fa-times';
            }
        });
        const notesEl = document.getElementById('regNotes');
        if (notesEl) notesEl.value = _existingRecord.notes || '';
        const indicator = document.getElementById('savedIndicator');
        if (indicator) indicator.style.display = 'inline-flex';
    } else if (isPrivateCoaching && sessionPlayerIds) {
        const planned = allPlayers.filter(p => sessionPlayerIds.has(p.id));
        renderPlayerChips(planned);
        document.querySelectorAll('#playerChips .reg-chip').forEach(chip => {
            chip.classList.remove('absent');
            const icon = chip.querySelector('.chip-status i');
            if (icon) icon.className = 'fas fa-check';
        });
        resetNotesAndIndicator();
    } else if (!isPrivateCoaching && sessionPlayerIds) {
        renderPlayerChips(allPlayers);
        allPlayers.forEach(p => {
            if (!sessionPlayerIds.has(p.id)) {
                const chip = document.querySelector(`.reg-chip[data-player-id="${p.id}"]`);
                if (chip) {
                    chip.classList.add('absent');
                    const icon = chip.querySelector('.chip-status i');
                    if (icon) icon.className = 'fas fa-times';
                }
            }
        });
        resetNotesAndIndicator();
    } else {
        renderPlayerChips(allPlayers);
        resetNotesAndIndicator();
    }
    updateCounter();

    // Show/hide add-player search (Orion only)
    const addSection = document.getElementById('addPlayerSearch');
    if (addSection) {
        addSection.style.display = isPrivateCoaching ? 'block' : 'none';
        const input = document.getElementById('addPlayerInput');
        if (input) input.value = '';
        const results = document.getElementById('addPlayerResults');
        if (results) results.innerHTML = '';
    }
}

function resetNotesAndIndicator() {
    const indicator = document.getElementById('savedIndicator');
    if (indicator) indicator.style.display = 'none';
    const notesEl = document.getElementById('regNotes');
    if (notesEl) notesEl.value = '';
}

// Legacy squad change handler (kept for manual fallback)
async function onSquadChange() {
    const select = document.getElementById('regSquadSelect');
    _selectedSquadId = select?.value || '';
    if (_selectedSquadId && _selectedSession) {
        _selectedSession.playerIds = [];
        await loadSessionPlayers(_selectedSession);
    }
}

// ── Player Chips ───────────────────────────────────────────────────────────

function renderPlayerChips(players) {
    const container = document.getElementById('playerChips');
    const counter = document.getElementById('attendanceCounter');
    if (!container) return;

    if (!players || players.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; padding: 16px 0;">Select a squad to see players.</p>';
        if (counter) counter.style.display = 'none';
        return;
    }

    // Orion (private_coaching): default UNCHECKED — coach checks who attended
    // Tuks (academy): default CHECKED — coach unchecks absentees
    const archetype = window._profile?.clubs?.settings?.archetype;
    const defaultAbsent = archetype === 'private_coaching';

    // Sort by position group then name
    const sorted = [...players].sort((a, b) => {
        const posOrder = getPositionOrder(a.position) - getPositionOrder(b.position);
        if (posOrder !== 0) return posOrder;
        return (a.name || '').localeCompare(b.name || '');
    });

    container.innerHTML = sorted.map(p => {
        const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const absentClass = defaultAbsent ? ' absent' : '';
        const icon = defaultAbsent ? 'fa-times' : 'fa-check';
        return `<div class="reg-chip${absentClass}" data-player-id="${p.id}" onclick="window._toggleAbsent(this)">
            <div class="chip-avatar">${initials}</div>
            <span class="chip-name">${escH(p.name)}</span>
            <span class="chip-pos">${p.position || '--'}</span>
            <span class="chip-status"><i class="fas ${icon}"></i></span>
        </div>`;
    }).join('');

    // Update hint text based on archetype
    const hintEl = document.getElementById('chipHintText');
    if (hintEl) {
        hintEl.innerHTML = defaultAbsent
            ? '<i class="fas fa-info-circle" style="margin-right: 4px;"></i> Click a player to mark them as <strong style="color: #10b981;">present</strong>. Click again to remove.'
            : '<i class="fas fa-info-circle" style="margin-right: 4px;"></i> Click a player to mark them as <strong style="color: #dc2626;">absent</strong>. Click again to mark present.';
    }

    if (counter) counter.style.display = 'flex';
    updateCounter();
}

const POS_ORDER = {
    GK: 0,
    CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1,
    CDM: 2, CM: 2, CAM: 2, LM: 2, RM: 2,
    ST: 3, LW: 3, RW: 3, CF: 3, Winger: 3
};

function getPositionOrder(pos) {
    if (!pos) return 99;
    const primary = pos.split(',')[0].trim();
    return POS_ORDER[primary] !== undefined ? POS_ORDER[primary] : 99;
}

// ── Toggle Absent ──────────────────────────────────────────────────────────

function toggleAbsent(chipEl) {
    chipEl.classList.toggle('absent');
    const statusIcon = chipEl.querySelector('.chip-status i');
    if (chipEl.classList.contains('absent')) {
        if (statusIcon) statusIcon.className = 'fas fa-times';
    } else {
        if (statusIcon) statusIcon.className = 'fas fa-check';
    }
    updateCounter();

    // Hide saved indicator when changes are made
    const indicator = document.getElementById('savedIndicator');
    if (indicator) indicator.style.display = 'none';
}

function updateCounter() {
    const chips = document.querySelectorAll('#playerChips .reg-chip');
    const absentChips = document.querySelectorAll('#playerChips .reg-chip.absent');
    const total = chips.length;
    const absent = absentChips.length;
    const present = total - absent;

    const presentEl = document.getElementById('presentCount');
    const absentEl = document.getElementById('absentCount');
    const totalEl = document.getElementById('totalCount');

    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (totalEl) totalEl.textContent = total;
}

// ── Save Attendance ────────────────────────────────────────────────────────

async function saveAttendance() {
    if (!_selectedSession) {
        showToast('No session selected', 'error');
        return;
    }
    if (!_selectedSquadId) {
        showToast('Please select a squad first', 'error');
        return;
    }

    const btn = document.getElementById('btnSaveAttendance');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...'; }

    try {
        const absentChips = document.querySelectorAll('#playerChips .reg-chip.absent');
        const allChips = document.querySelectorAll('#playerChips .reg-chip');
        const absentPlayerIds = Array.from(absentChips).map(c => c.dataset.playerId);
        const total = allChips.length;
        const present = total - absentPlayerIds.length;
        const notes = (document.getElementById('regNotes')?.value || '').trim();

        // Get club_id (impersonation takes priority for super_admin)
        const clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;

        if (!clubId) {
            showToast('Could not resolve club', 'error');
            return;
        }

        const row = {
            club_id: clubId,
            session_id: _selectedSession.id,
            squad_id: _selectedSquadId,
            date: _selectedSession.date || new Date().toISOString().split('T')[0],
            absent_player_ids: absentPlayerIds,
            attendance_count: present,
            attendance_total: total,
            notes,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('training_attendance')
            .upsert(row, { onConflict: 'session_id,squad_id' });

        if (error) throw error;

        // Sync attendance data to session report (if report exists)
        try {
            const { data: existingReport } = await supabase.from('reports')
                .select('id').eq('session_id', _selectedSession.id).maybeSingle();
            if (existingReport) {
                await supabase.from('reports').update({
                    attendance_count: present,
                    attendance_total: total,
                    absent_player_ids: absentPlayerIds,
                }).eq('id', existingReport.id);
            }
        } catch (syncErr) { console.warn('Report sync skipped:', syncErr); }

        // Mark as completed
        _completedSessionIds.add(_selectedSession.id);
        _existingRecord = row;
        badgeCompletedSessions();

        // Show saved indicator
        const indicator = document.getElementById('savedIndicator');
        if (indicator) indicator.style.display = 'inline-flex';

        showToast(`Attendance saved — ${present}/${total} present`, 'success');
    } catch (e) {
        console.error('Failed to save attendance:', e);
        showToast('Failed to save attendance', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save" style="margin-right:6px;"></i> Save Attendance'; }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escH(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Add Player Search (Orion) ────────────────────────────────────────────────

function setupAddPlayerSearch() {
    const input = document.getElementById('addPlayerInput');
    if (!input) return;
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        const results = document.getElementById('addPlayerResults');
        if (!results) return;
        if (term.length < 2) { results.innerHTML = ''; return; }

        const existingIds = new Set(
            Array.from(document.querySelectorAll('#playerChips .reg-chip')).map(c => c.dataset.playerId)
        );

        const matches = _allSquadPlayers
            .filter(p => !existingIds.has(p.id) && p.name.toLowerCase().includes(term))
            .slice(0, 8);

        if (matches.length === 0) {
            results.innerHTML = '<div style="padding: 10px 12px; font-size: 0.82rem; color: #94a3b8;">No players found</div>';
            return;
        }

        const squads = squadManager.getSquads();
        results.innerHTML = matches.map(p => {
            const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const squadName = squads.find(s => s.id === p.squadId)?.name || 'Unassigned';
            return `<div class="add-player-item" onclick="window._addPlayerToAttendance('${p.id}')">
                <div class="api-avatar">${initials}</div>
                <div>
                    <div class="api-name">${escH(p.name)}</div>
                    <div class="api-meta">${p.position || '--'} · ${escH(squadName)}</div>
                </div>
            </div>`;
        }).join('');
    });
}

function addPlayerToAttendance(playerId) {
    const player = _allSquadPlayers.find(p => String(p.id) === String(playerId));
    if (!player) return;
    if (document.querySelector(`#playerChips .reg-chip[data-player-id="${playerId}"]`)) return;

    const container = document.getElementById('playerChips');
    if (!container) return;

    const emptyMsg = container.querySelector('p');
    if (emptyMsg) emptyMsg.remove();

    const initials = (player.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const chipHTML = `<div class="reg-chip" data-player-id="${player.id}" onclick="window._toggleAbsent(this)">
        <div class="chip-avatar">${initials}</div>
        <span class="chip-name">${escH(player.name)}</span>
        <span class="chip-pos">${player.position || '--'}</span>
        <span class="chip-status"><i class="fas fa-check"></i></span>
    </div>`;
    container.insertAdjacentHTML('beforeend', chipHTML);

    const input = document.getElementById('addPlayerInput');
    if (input) input.value = '';
    const results = document.getElementById('addPlayerResults');
    if (results) results.innerHTML = '';

    const counter = document.getElementById('attendanceCounter');
    if (counter) counter.style.display = 'flex';

    updateCounter();
    const indicator = document.getElementById('savedIndicator');
    if (indicator) indicator.style.display = 'none';
}

// ── Window Bindings ─────────────────────────────────────────────────────────

window._toggleAbsent = toggleAbsent;
window._onSquadChange = onSquadChange;
window._saveAttendance = saveAttendance;
window._addPlayerToAttendance = addPlayerToAttendance;
