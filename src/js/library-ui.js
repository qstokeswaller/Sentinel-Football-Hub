/**
 * Library UI Logic
 * Browse and manage sessions & drills collection.
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import { showToast } from '../toast.js';

// ===============================================================
//  STATE
// ===============================================================
let currentFilter = 'all';
let currentSearch = '';
let currentCategoryFilter = 'all';
let sessions = [];
let drills = [];

// ===============================================================
//  SHARE FROM LIBRARY
// ===============================================================
function _generateShareToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  arr.forEach(v => { token += chars[v % chars.length]; });
  return token;
}

async function shareFromLibrary(sessionId, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  try {
    const { data } = await supabase.from('sessions').select('share_token').eq('id', sessionId).single();
    let token = data?.share_token;
    if (!token) {
      token = _generateShareToken();
      const { error } = await supabase.from('sessions').update({ share_token: token }).eq('id', sessionId);
      if (error) throw error;
    }
    const url = `${window.location.origin}/src/pages/session-share.html?token=${token}`;
    await navigator.clipboard.writeText(url);
    showToast('Share link copied to clipboard!', 'success');
  } catch (e) {
    console.error('Share error:', e);
    showToast('Failed to share session', 'error');
  }
}
window.shareFromLibrary = shareFromLibrary;

// ===============================================================
//  INIT
// ===============================================================
export async function initLibraryUI() {
    await loadAll();
    document.getElementById('search-input').addEventListener('input', function () {
        currentSearch = this.value.toLowerCase().trim();
        renderAll();
    });
}

async function loadAll() {
    try {
        let sessionsData = [];
        let drillsData = [];
        const clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;

        try {
            let sq = supabase
                .from('sessions')
                .select('*, drills(*)')
                .order('created_at', { ascending: false });
            if (clubId) sq = sq.eq('club_id', clubId);
            const { data, error } = await sq;
            if (error) throw error;
            sessionsData = data || [];
        } catch (e) {
            console.warn('Sessions failed:', e);
        }

        try {
            let dq = supabase
                .from('drills')
                .select('*')
                .order('created_at', { ascending: false });
            if (clubId) dq = dq.eq('club_id', clubId);
            const { data, error } = await dq;
            if (error) throw error;
            drillsData = data || [];
        } catch (e) {
            console.warn('Drills failed:', e);
        }

        // Map database fields to UI format
        sessions = (sessionsData || []).map(s => ({
            ...s,
            type: 'session',
            players: s.players_count,
            level: s.ability_level,
            savedAt: s.created_at,
            author: s.author || 'UP Coach',
            team: s.team || 'UP First XI'
        }));

        drills = (drillsData || []).map(d => ({
            ...d,
            type: 'drill',
            savedAt: d.created_at || Date.now()
        }));

        renderAll();
    } catch (e) {
        console.error('Failed to load data:', e);
        showToast('Error loading data');
    }
}

// ===============================================================
//  RENDER
// ===============================================================
function renderAll() {
    const all = [...sessions, ...drills];

    // Stats
    document.getElementById('stat-sessions').textContent = sessions.length;
    document.getElementById('stat-drills').textContent = drills.length;

    const authors = new Set(all.map(i => i.author).filter(Boolean));
    document.getElementById('stat-authors').textContent = authors.size || 0;

    if (all.length) {
        const sorted = [...all].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
        const latest = sorted[0];
        const d = new Date(latest.savedAt);
        document.getElementById('stat-recent').textContent = isNaN(d) ? '\u2014' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function matches(item) {
        if (currentFilter !== 'all' && item.type !== currentFilter) return false;
        if (currentCategoryFilter !== 'all' && (item.category_tag || '') !== currentCategoryFilter) return false;
        if (currentSearch) {
            const hay = [item.title, item.author, item.team, item.venue, item.purpose, item.description, item.category_tag].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(currentSearch)) return false;
        }
        return true;
    }

    const fSessions = sessions.filter(matches);
    const fDrills = drills.filter(matches);

    // Section visibility
    document.getElementById('sessions-section').style.display = currentFilter === 'drill' ? 'none' : '';
    document.getElementById('drills-section').style.display = currentFilter === 'session' ? 'none' : '';

    document.getElementById('sessions-count').textContent = fSessions.length;
    document.getElementById('drills-count').textContent = fDrills.length;

    renderGrid('sessions-grid', fSessions, 'session');
    renderGrid('drills-grid', fDrills, 'drill');

    // Load thumbnails for animated drills async
    fDrills.filter(d => d.animation_id && !d.image).forEach(async (d) => {
        try {
            const { data: anim } = await supabase.from('animations')
                .select('thumbnail').eq('id', d.animation_id).single();
            if (anim?.thumbnail) {
                const el = document.getElementById(`lib-thumb-${d.id}`);
                if (el) el.innerHTML = `<img src="${anim.thumbnail}" class="card-thumb" alt="" style="width:100%;height:100%;object-fit:cover;">`;
            }
        } catch (e) { /* non-fatal */ }
    });
}

function renderGrid(gridId, items, type) {
    const grid = document.getElementById(gridId);
    if (!items.length) {
        const isSearch = !!currentSearch;
        grid.innerHTML = `
      <div class="lib-empty">
        <div class="empty-icon">${type === 'session' ? '\uD83D\uDCCB' : '\u26BD'}</div>
        <h3>No ${type === 'session' ? 'sessions' : 'drills'} yet</h3>
        <p>${isSearch ? 'No results match your search.' : 'Save a ' + type + ' from the Session Planner to see it here.'}</p>
        ${!isSearch ? `<a href="planner.html" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:9999px;background:var(--primary);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border:none;box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);"><i class="fas fa-plus-circle"></i> Go to Planner</a>` : ''}
      </div>`;
        return;
    }
    grid.innerHTML = items.map(buildCard).join('');
}

function buildCard(item) {
    const isSess = item.type === 'session';
    const isAnimated = !isSess && !!item.animation_id;

    // Thumbnail — for animated drills, use a placeholder with animation icon (thumbnail loaded async)
    let thumbHTML;
    if (item.image) {
        thumbHTML = `<img src="${item.image}" class="card-thumb" alt="${esc(item.title)}">`;
    } else if (isAnimated) {
        thumbHTML = `<div class="card-thumb-placeholder" id="lib-thumb-${item.id}" style="background:#0f172a;"><i class="fas fa-play-circle" style="font-size:2.5rem;color:rgba(0,196,154,0.6);"></i></div>`;
    } else {
        thumbHTML = `<div class="card-thumb-placeholder">${isSess ? '\uD83D\uDCCB' : '\u26BD'}</div>`;
    }

    const authorLine = (item.author || item.team)
        ? `<div class="card-author"><i class="fas fa-user-tie"></i>${esc([item.author, item.team].filter(Boolean).join(' \u00b7 '))}</div>`
        : '';

    const categoryBadge = item.category_tag
        ? `<span style="font-size:0.65rem;padding:2px 8px;border-radius:4px;background:var(--primary-light,#e6f9f4);color:var(--primary,#00C49A);font-weight:600;margin-left:6px;">${esc(item.category_tag)}</span>`
        : '';

    // Actions based on type
    const sessHasAnimated = isSess && Array.isArray(item.drills) && item.drills.some(d => !!d.animation_id);
    let actionsHTML;
    if (isAnimated) {
        actionsHTML = `
          <button class="card-btn" onclick="openModal('${item.id}', event)"><i class="fas fa-eye"></i> View</button>
          <button class="card-btn" onclick="shareAnimatedDrill('${item.id}', event)"><i class="fas fa-share-alt"></i> Share</button>
          <button class="card-btn danger" onclick="deleteItem('${item.id}', '${item.type}', event)"><i class="fas fa-trash"></i></button>`;
    } else if (isSess && sessHasAnimated) {
        actionsHTML = `
          <button class="card-btn" onclick="openModal('${item.id}', event)"><i class="fas fa-eye"></i> View</button>
          <button class="card-btn" onclick="shareFromLibrary('${item.id}', event)"><i class="fas fa-share-alt"></i> Share</button>
          <button class="card-btn danger" onclick="deleteItem('${item.id}', '${item.type}', event)"><i class="fas fa-trash"></i></button>`;
    } else {
        actionsHTML = `
          <button class="card-btn" onclick="openModal('${item.id}', event)"><i class="fas fa-eye"></i> View</button>
          <button class="card-btn" onclick="exportPDF('${item.id}', event)"><i class="fas fa-file-pdf"></i> PDF</button>
          <button class="card-btn danger" onclick="deleteItem('${item.id}', '${item.type}', event)"><i class="fas fa-trash"></i></button>`;
    }

    return `
    <div class="lib-card" onclick="openModal('${item.id}')">
      <div class="card-body card-top-section">
        <div class="card-header">
           <div class="card-title">${esc(item.title || 'Untitled')}${categoryBadge}</div>
           <span class="card-pill ${item.type}">${isSess ? 'Session' : isAnimated ? 'Animated' : 'Drill'}</span>
        </div>
        ${authorLine}
      </div>
      ${thumbHTML}
      <div class="card-body">
        <div class="card-actions">${actionsHTML}</div>
      </div>
    </div>`;
}

// ===============================================================
//  MODAL
// ===============================================================
async function openModal(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const item = [...sessions, ...drills].find(i => String(i.id) === String(id));
    if (!item) {
        console.warn(`Item not found for modal: ${id}`);
        return;
    }

    const isSess = item.type === 'session';
    const isAnimatedDrill = !isSess && !!item.animation_id;
    const pill = document.getElementById('modal-head-pill');
    pill.textContent = isSess ? 'Session' : isAnimatedDrill ? 'Animated' : 'Drill';
    pill.className = 'card-pill ' + (isSess ? 'session' : isAnimatedDrill ? 'animated' : 'drill');
    document.getElementById('modal-head-title').textContent = item.title || 'Untitled';

    const isAnimated = !isSess && !!item.animation_id;
    let hasAnimatedDrills = false;

    if (isSess) {
        // Fetch full session details with drills
        try {
            const { data: fullSession, error } = await supabase
                .from('sessions')
                .select('*, drills(*)')
                .eq('id', id)
                .single();
            if (error) throw error;
            const blocks = (fullSession.drills || []).map(d => ({ ...d, type: 'drill' }));
            hasAnimatedDrills = blocks.some(b => !!b.animation_id);
            document.getElementById('modal-body').innerHTML = buildSessionModalBody({
                ...item, blocks
            });
            // Load animated drill thumbnails async
            blocks.filter(b => b.animation_id && !b.image).forEach(async (b) => {
                try {
                    const { data: anim } = await supabase.from('animations').select('thumbnail').eq('id', b.animation_id).single();
                    if (anim?.thumbnail) {
                        const el = document.getElementById(`modal-block-thumb-${b.id}`);
                        if (el) el.innerHTML = `<img src="${anim.thumbnail}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
                    }
                } catch (e) {}
            });
        } catch (e) {
            document.getElementById('modal-body').innerHTML = `<p>Error loading session details.</p>`;
        }
    } else {
        document.getElementById('modal-body').innerHTML = buildDrillModalBody(item);
        // Load animated drill preview (thumbnail + frame data for playback)
        if (isAnimated && item.animation_id) {
            window._loadAnimPreview(item.animation_id, item.id);
        }
    }

    // Footer actions — sessions with animated drills get Share instead of PDF
    let footerHTML = '';
    if (isSess && hasAnimatedDrills) {
        footerHTML = `
            <button class="modal-btn" onclick="shareFromLibrary('${item.id}')" style="background:var(--primary);"><i class="fas fa-share-alt"></i> Share</button>
            <button class="modal-btn del" onclick="deleteItem('${item.id}', '${item.type}')"><i class="fas fa-trash"></i> Delete</button>`;
    } else if (isSess) {
        footerHTML = `
            <button class="modal-btn" onclick="shareFromLibrary('${item.id}')" style="background:var(--primary);"><i class="fas fa-share-alt"></i> Share</button>
            <button class="modal-btn pdf" onclick="exportPDF('${item.id}')"><i class="fas fa-file-pdf"></i> Export PDF</button>
            <button class="modal-btn del" onclick="deleteItem('${item.id}', '${item.type}')"><i class="fas fa-trash"></i> Delete</button>`;
    } else if (isAnimated) {
        footerHTML = `
            <button class="modal-btn" onclick="shareAnimatedDrill('${item.id}')" style="background:var(--primary);"><i class="fas fa-share-alt"></i> Share Link</button>
            <button class="modal-btn del" onclick="deleteItem('${item.id}', '${item.type}')"><i class="fas fa-trash"></i> Delete</button>`;
    } else {
        footerHTML = `
            <button class="modal-btn png" onclick="exportPNG('${item.id}', event)" style="background:var(--success);"><i class="fas fa-file-image"></i> Export PNG</button>
            <button class="modal-btn pdf" onclick="exportPDF('${item.id}')"><i class="fas fa-file-pdf"></i> Export PDF</button>
            <button class="modal-btn del" onclick="deleteItem('${item.id}', '${item.type}')"><i class="fas fa-trash"></i> Delete</button>`;
    }
    document.getElementById('modal-foot').innerHTML = footerHTML;

    document.getElementById('modal-overlay').classList.add('open');
}
window.openModal = openModal;

function buildSessionModalBody(item) {
    const date = item.date ? new Date(item.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '\u2014';
    const time = item.startTime || item.start_time || '';
    return `
    <div class="modal-meta-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="modal-meta-cell"><label>Date/Time</label><span>${esc(date)}${time ? ` at ${esc(time)}` : ''}</span></div>
      <div class="modal-meta-cell"><label>Venue</label><span>${esc(item.venue || '\u2014')}</span></div>
      <div class="modal-meta-cell"><label>Duration</label><span>${esc(item.duration || '\u2014')}</span></div>
    </div>
    <div class="modal-meta-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px;">
      <div class="modal-meta-cell"><label>Players</label><span>${esc(item.players || '\u2014')}</span></div>
      <div class="modal-meta-cell"><label>Level</label><span>${esc(item.level || '\u2014')}</span></div>
      <div class="modal-meta-cell"><label>Author</label><span>${esc(item.author || '\u2014')}</span></div>
      <div class="modal-meta-cell"><label>Team</label><span>${esc(item.team || '\u2014')}</span></div>
    </div>
    ${item.equipment || item.purpose ? `
    <div class="modal-meta-grid" style="grid-template-columns:1fr 1fr;margin-bottom:18px;">
      <div class="modal-meta-cell"><label>Equipment</label><span>${esc(item.equipment || '\u2014')}</span></div>
      <div class="modal-meta-cell"><label>Purpose</label><span>${esc(item.purpose || '\u2014')}</span></div>
    </div>` : ''}
    ${(item.drills || item.blocks || []).map((b, i) => buildDrillBlockModal(b, i + 1)).join('')}
  `;
}

function buildDrillBlockModal(b, num) {
    const isDrill = b.type === 'drill';
    const isAnimated = !!b.animation_id;
    const pillLabel = isAnimated ? 'Animated' : (isDrill ? 'Drill' : 'Section');
    const pillClass = isAnimated ? 'animated' : (isDrill ? 'drill' : 'section');
    return `
    <div class="modal-drill-block">
      <div class="modal-drill-head">
        ${isDrill ? `<span style="font-size:11px;font-weight:700;color:#a0aec0;background:#edf2f7;border:1px solid #e2e8f0;border-radius:4px;padding:1px 6px;">#${num}</span>` : ''}
        <span class="card-pill ${pillClass}" style="margin-bottom:0;">${pillLabel}</span>
        <span class="modal-drill-title">${esc(b.title || 'Untitled')}</span>
      </div>
      <div class="modal-drill-body">
        ${b.image ? `<img src="${b.image}" class="modal-drill-img" alt="${esc(b.title)}">` : ''}
        ${isAnimated && !b.image ? `<div id="modal-block-thumb-${b.id}" style="width:100%;height:160px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;"><i class="fas fa-play-circle" style="font-size:2rem;color:rgba(0,196,154,0.6);"></i></div>` : ''}
        ${b.description ? `<div class="modal-drill-desc">${formatDescription(b.description)}</div>` : ''}
      </div>
    </div>`;
}

function buildDrillModalBody(item) {
    const date = item.savedAt ? new Date(item.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '\u2014';
    const isAnimated = !!item.animation_id;

    // Thumbnail / viewer
    let mediaHTML = '';
    if (item.image) {
        mediaHTML = `<img src="${item.image}" class="modal-drill-img" style="max-height:300px;width:auto;border-radius:8px;border:1px solid #e2e8f0;display:block;margin-bottom:15px;">`;
    } else if (isAnimated) {
        // Animation viewer with frame display + play/pause controls
        mediaHTML = `
        <div style="background:#0f172a;border-radius:10px;overflow:hidden;margin-bottom:16px;">
            <div id="modal-anim-thumb-${item.id}" style="width:100%;min-height:200px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:rgba(0,196,154,0.5);"></i>
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1e293b;border-top:1px solid #334155;">
                <i class="fas fa-film" style="color:#00C49A;"></i>
                <span id="modal-anim-status-${item.id}" style="font-size:0.78rem;color:#94a3b8;">Loading...</span>
            </div>
        </div>`;
    }

    return `
    <div class="modal-meta-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
      <div class="modal-meta-cell"><label>Saved</label><span>${esc(date)}</span></div>
      ${item.author ? `<div class="modal-meta-cell"><label>Author</label><span>${esc(item.author)}</span></div>` : ''}
      ${item.category_tag ? `<div class="modal-meta-cell"><label>Category</label><span>${esc(item.category_tag)}</span></div>` : ''}
    </div>
    <div style="margin-bottom:18px;">
      ${mediaHTML}
      ${item.description ? `<div style="font-size:13px;color:#4a5568;line-height:1.7;">${formatDescription(item.description)}</div>` : ''}
    </div>
  `;
}

// Parse drill description — handles JSON sections format and raw HTML
function formatDescription(desc) {
    if (!desc) return '';
    // Try parsing as JSON sections
    try {
        const parsed = typeof desc === 'string' ? JSON.parse(desc) : desc;
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            const sectionLabels = {
                overview: 'Overview', setup: 'Setup', function: 'How It Works',
                progressions: 'Progressions', coaching: 'Coaching Points'
            };
            let html = '';
            for (const [key, value] of Object.entries(parsed)) {
                if (!value || (typeof value === 'string' && !value.trim())) continue;
                const label = sectionLabels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                html += `<div style="margin-bottom:12px;">
                    <div style="font-weight:700;font-size:0.8rem;color:var(--primary,#00C49A);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${esc(label)}</div>
                    <div style="font-size:0.85rem;color:var(--text-primary,#1e293b);line-height:1.65;">${esc(String(value))}</div>
                </div>`;
            }
            return html || esc(desc);
        }
    } catch (e) { /* not JSON, render as-is */ }
    // Raw HTML from rich text editor — strip dangerous tags but keep formatting
    if (desc.includes('<') && desc.includes('>')) {
        const div = document.createElement('div');
        div.innerHTML = desc;
        // Remove script, iframe, object, embed, form, and event handler attributes
        div.querySelectorAll('script,iframe,object,embed,form').forEach(el => el.remove());
        div.querySelectorAll('*').forEach(el => {
            for (const attr of [...el.attributes]) {
                if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
            }
        });
        return div.innerHTML;
    }
    // Plain text — escape
    return esc(desc);
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}
window.closeModal = closeModal;

function closeIfBg(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }
window.closeIfBg = closeIfBg;

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ===============================================================
//  FILTER
// ===============================================================
function setFilterFromDropdown(f) {
    currentFilter = f;
    renderAll();
}
window.setFilterFromDropdown = setFilterFromDropdown;

function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
}
window.setFilter = setFilter;

window.setCategoryFilter = function(val) {
    currentCategoryFilter = val || 'all';
    renderAll();
};

// ── Animation preview loader (for library modal) ──
window._loadAnimPreview = async function(animationId, drillId) {
    try {
        const { data: anim } = await supabase.from('animations').select('thumbnail, frames, frame_duration').eq('id', animationId).single();
        if (!anim) return;

        const thumbEl = document.getElementById(`modal-anim-thumb-${drillId}`);
        if (thumbEl && anim.thumbnail) {
            thumbEl.innerHTML = `<img src="${anim.thumbnail}" style="width:100%;height:auto;display:block;">`;
        }

        const statusEl = document.getElementById(`modal-anim-status-${drillId}`);
        const frameCount = Array.isArray(anim.frames) ? anim.frames.length : 0;
        if (statusEl) statusEl.textContent = `${frameCount} frames · ${(anim.frame_duration || 1500) / 1000}s per frame · Open in Session Planner to play`;
    } catch (e) { console.error('Load anim preview:', e); }
};

window.shareAnimatedDrill = async function(drillId, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const drill = drills.find(d => d.id === drillId);
    if (!drill || !drill.animation_id) { showToast('No animation linked', 'error'); return; }

    // Check if this drill belongs to a session — if so, share the session
    if (drill.session_id) {
        shareFromLibrary(drill.session_id);
        return;
    }

    // Standalone animated drill — export the video from the animation builder instead
    // For now, copy a message explaining how to share
    showToast('To share this animated drill, add it to a session and use the session share link.', 'info');
};

// ===============================================================
//  DELETE
// ===============================================================
async function deleteItem(id, type, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    console.trace(`deleteItem called for ${type} ${id}`);

    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) {
        console.log('Deletion cancelled by user');
        return;
    }

    try {
        const table = type === 'session' ? 'sessions' : 'drills';
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);
        if (error) throw error;

        console.log('Deletion successful');
        closeModal();
        await loadAll();
        showToast('Deleted successfully');
    } catch (e) {
        console.error('Error in deleteItem:', e);
        showToast('Error deleting');
    }
}
window.deleteItem = deleteItem;

async function clearAll() {
    if (!confirm('This will delete ALL sessions and drills. Continue?')) return;
    showToast('Clearing all...');
    try {
        await Promise.all([
            ...sessions.map(s => supabase.from('sessions').delete().eq('id', s.id)),
            ...drills.map(d => supabase.from('drills').delete().eq('id', d.id))
        ]);
        await loadAll();
        showToast('All data cleared');
    } catch (e) {
        console.error('Clear all error:', e);
        showToast('Failed to clear all data');
    }
}
window.clearAll = clearAll;

// ===============================================================
//  PDF EXPORT
// ===============================================================
async function exportPDF(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!window.jspdf) { showToast('PDF library not loaded'); return; }
    const { jsPDF } = window.jspdf;

    const item = [...sessions, ...drills].find(i => String(i.id) === String(id));
    if (!item) { console.error('Item not found for export:', id); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = PW - (margin * 2);

    if (item.type === 'drill') {
        doc.setFillColor(74, 144, 217); doc.rect(0, 0, PW, 15, 'F');
        doc.setTextColor(255); doc.setFontSize(10); doc.text('UP PERFORMANCE HUB \u00b7 DRILL', margin, 10);

        doc.setTextColor(26, 32, 44); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.text(item.title || 'Untitled Drill', margin, 30);

        let y = 40;
        if (item.image) {
            try {
                const imgProps = doc.getImageProperties(item.image);
                const imgH = (imgProps.height * contentW) / imgProps.width;
                doc.addImage(item.image, 'PNG', margin, y, contentW, imgH);
                y += imgH + 10;
            } catch (e) { console.warn('Failed to add image to PDF:', e); }
        }

        const desc = (item.description || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
        doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(desc, contentW), margin, y);

        const safeTitle = (item.title || 'drill').replace(/[^a-z0-9]/gi, '_');
        const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
        const filename = `${clubPrefix}_Drill_${safeTitle}.pdf`;
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
            showToast(`Exported ${filename}`);
        } catch (err) {
            console.error('PDF Save failed:', err);
            showToast('Failed to save PDF');
        }
        return;
    }

    // Session
    try {
        const { data: fullSession, error } = await supabase
            .from('sessions')
            .select('*, drills(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        const blocks = fullSession.drills || [];

        // Front Page / Header
        doc.setFillColor(74, 144, 217); doc.rect(0, 0, PW, 25, 'F');
        doc.setTextColor(255); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text((item.title || 'Session Plan').toUpperCase(), margin, 17);

        let y = 35;
        doc.setFontSize(9); doc.setTextColor(113, 128, 150);
        const meta = [item.author, item.team, item.date ? new Date(item.date).toLocaleDateString() : ''].filter(Boolean).join(' \u00b7 ');
        doc.text(meta, margin, y);
        y += 15;

        blocks.forEach((b, idx) => {
            if (idx > 0) doc.addPage();
            doc.setFillColor(74, 144, 217); doc.rect(0, 0, PW, 12, 'F');
            doc.setTextColor(255); doc.setFontSize(8); doc.text(`DRILL ${idx + 1} OF ${blocks.length}`, margin, 8);

            doc.setTextColor(26, 32, 44); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
            doc.text(b.title || 'Untitled Drill', margin, 25);

            let curY = 32;
            if (b.image) {
                try {
                    const imgProps = doc.getImageProperties(b.image);
                    const imgH = (imgProps.height * contentW) / imgProps.width;
                    doc.addImage(b.image, 'PNG', margin, curY, contentW, Math.min(imgH, 150));
                    curY += Math.min(imgH, 150) + 10;
                } catch (e) { }
            }

            const bdesc = (b.description || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
            doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'normal');
            doc.text(doc.splitTextToSize(bdesc, contentW), margin, curY);
        });

        const safeTitle = (item.title || 'session').replace(/[^a-z0-9]/gi, '_');
        const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
        const filename = `${clubPrefix}_Session_${safeTitle}.pdf`;
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported ${filename}`);
    } catch (e) {
        console.error('PDF Export failed:', e);
        showToast('Error generating PDF');
    }
}
window.exportPDF = exportPDF;

async function exportPNG(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const item = [...sessions, ...drills].find(i => i.id === id);
    if (!item || item.type !== 'drill' || !item.image) {
        showToast('No image data found for this drill');
        return;
    }
    const safeTitle = (item.title || 'drill').replace(/[^a-z0-9]/gi, '_');
    const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
    const filename = `${clubPrefix}_Drill_${safeTitle}.png`;
    const a = document.createElement('a');
    a.href = item.image;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Exported ${filename}`);
}
window.exportPNG = exportPNG;

// UTILS
function esc(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
