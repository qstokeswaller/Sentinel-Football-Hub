/**
 * Platform Admin Dashboard UI
 *
 * Standalone platform shell — completely separate from the club sidebar layout.
 * Renders club cards, detail views, stats, and create-club functionality.
 * Platform admins can click a club card to view details or impersonate into it.
 */
import supabase from '../supabase.js';
import { startImpersonation } from '../auth.js';
import { showToast, friendlyError } from '../toast.js';

let allClubs = [];
let allProfiles = [];
let allPlayers = [];
let allSessions = [];
let allDrills = [];

export async function initPlatformAdmin(profile) {
    await loadPlatformData();
    renderStats();
    renderClubCards();
    setupEventListeners(profile);
}

// ── Data Loading ──

async function loadPlatformData() {
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
    const [clubsRes, profilesRes, playersRes, sessionsRes, drillsRes] = await Promise.all([
        supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, full_name, role, club_id, created_at').limit(1000),
        supabase.from('players').select('id, club_id').limit(5000),
        supabase.from('sessions').select('id, club_id, created_by, title, is_template, created_at').gte('created_at', sixMonthsAgo).limit(1000),
        supabase.from('drills').select('id, club_id, created_by, session_id, title, created_at').gte('created_at', sixMonthsAgo).limit(2000),
    ]);

    allClubs = clubsRes.data || [];
    allProfiles = profilesRes.data || [];
    allPlayers = playersRes.data || [];
    allSessions = sessionsRes.data || [];
    allDrills = drillsRes.data || [];

    if (clubsRes.error) console.error('Failed to load clubs:', clubsRes.error);
    if (profilesRes.error) console.error('Failed to load profiles:', profilesRes.error);
    if (playersRes.error) console.error('Failed to load players:', playersRes.error);
    if (sessionsRes.error) console.error('Failed to load sessions:', sessionsRes.error);
    if (drillsRes.error) console.error('Failed to load drills:', drillsRes.error);
}

// ── Stats ──

function renderStats() {
    const totalClubs = allClubs.length;
    const totalUsers = allProfiles.filter(p => p.club_id).length;
    const totalCoaches = allProfiles.filter(p => p.role === 'coach' || p.role === 'admin').length;
    const totalPlayers = allPlayers.length;

    document.getElementById('statClubs').textContent = totalClubs;
    document.getElementById('statUsers').textContent = totalUsers;
    document.getElementById('statCoaches').textContent = totalCoaches;
    document.getElementById('statPlayers').textContent = totalPlayers;
}

// ── Club Cards ──

function renderClubCards(filter = '') {
    const container = document.getElementById('clubsContainer');
    const filtered = filter
        ? allClubs.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
        : allClubs;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-building"></i>
                <p>${filter ? 'No clubs match your search.' : 'No clubs yet. Create your first club!'}</p>
            </div>
        `;
        return;
    }

    const cards = filtered.map(club => {
        const clubUsers = allProfiles.filter(p => p.club_id === club.id);
        const clubPlayers = allPlayers.filter(p => p.club_id === club.id);
        const clubSessions = allSessions.filter(s => s.club_id === club.id && !s.is_template);
        const clubDrills = allDrills.filter(d => d.club_id === club.id);
        const userCount = clubUsers.length;
        const playerCount = clubPlayers.length;
        const initials = club.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const logoUrl = club.settings?.branding?.logo_url;
        const archetype = (club.settings?.archetype || 'academy').replace(/_/g, ' ');
        const plan = club.settings?.plan || 'trial';
        const status = club.settings?.status || 'active';
        const paymentMethod = club.settings?.payment_method || 'bank_eft';
        const paymentLabel = paymentMethod === 'in_app' ? 'In-App' : 'Bank/EFT';
        const created = new Date(club.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        const avatarContent = logoUrl
            ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(club.name)}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;" onerror="this.outerHTML='${initials}'">`
            : initials;

        return `
            <div class="club-card" data-club-id="${club.id}">
                <div class="club-card-top">
                    <div class="club-card-avatar">${avatarContent}</div>
                    <div>
                        <div class="club-card-name">${escapeHtml(club.name)}</div>
                        <div class="club-card-archetype">${archetype}</div>
                    </div>
                </div>
                <div class="club-card-metrics">
                    <div class="club-metric"><strong>${userCount}</strong> users</div>
                    <div class="club-metric"><strong>${playerCount}</strong> players</div>
                    <div class="club-metric"><strong>${clubSessions.length}</strong> sessions</div>
                    <div class="club-metric"><strong>${clubDrills.length}</strong> drills</div>
                </div>
                <div class="club-card-footer">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="club-status ${status}"><span class="dot"></span> ${capitalize(status)}</span>
                        <span class="club-plan-tag ${plan}">${plan.toUpperCase()}</span>
                        <span style="font-size:0.68rem;font-weight:600;padding:2px 8px;border-radius:6px;background:${paymentMethod === 'in_app' ? 'rgba(99,102,241,0.18)' : 'rgba(100,116,139,0.18)'};color:${paymentMethod === 'in_app' ? '#818cf8' : '#94a3b8'};letter-spacing:0.03em;white-space:nowrap;"><i class="fas fa-${paymentMethod === 'in_app' ? 'credit-card' : 'university'}" style="margin-right:4px;"></i>${paymentLabel}</span>
                    </div>
                    <span class="club-card-enter"><i class="fas fa-arrow-right"></i> Enter</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="clubs-grid">${cards}</div>`;

    // Attach click handlers
    container.querySelectorAll('.club-card').forEach(card => {
        card.addEventListener('click', () => {
            const clubId = card.dataset.clubId;
            viewClubDetail(clubId);
        });
    });
}

// ── Club Detail View ──

function viewClubDetail(clubId) {
    const club = allClubs.find(c => c.id === clubId);
    if (!club) return;

    const clubUsers = allProfiles.filter(p => p.club_id === clubId);
    const clubPlayers = allPlayers.filter(p => p.club_id === clubId);
    const clubSessions = allSessions.filter(s => s.club_id === clubId && !s.is_template);
    const clubTemplates = allSessions.filter(s => s.club_id === clubId && s.is_template);
    const clubDrills = allDrills.filter(d => d.club_id === clubId);
    const archetype = (club.settings?.archetype || 'academy').replace(/_/g, ' ');
    const features = club.settings?.features || {};
    const currentTier = club.settings?.tier || 'free';
    const currentStatus = club.settings?.status || 'active';
    const currentPaymentMethod = club.settings?.payment_method || 'bank_eft';
    const isPaused = currentStatus === 'paused';
    const initials = club.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const logoUrl = club.settings?.branding?.logo_url;
    const created = new Date(club.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    const detailAvatarContent = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(club.name)}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;" onerror="this.outerHTML='${initials}'">`
        : initials;

    // Role breakdown
    const roleCounts = { admin: 0, coach: 0, viewer: 0 };
    clubUsers.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });

    const membersHTML = clubUsers.length > 0
        ? clubUsers.map(u => {
            const userSessions = clubSessions.filter(s => s.created_by === u.id).length;
            const userDrills = clubDrills.filter(d => d.created_by === u.id).length;
            return `
                <div class="member-item" data-user-id="${u.id}" data-club-id="${clubId}">
                    <div class="member-clickable" data-user-id="${u.id}" data-club-id="${clubId}" style="cursor:pointer;flex:1;" title="Click to view activity">
                        <div class="name">${escapeHtml(u.full_name || 'Unknown')}</div>
                        <div class="email">${escapeHtml(u.email || '')} &middot; ${userSessions} sessions &middot; ${userDrills} drills</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <select class="member-role-select" data-no-custom data-user-id="${u.id}" data-original-role="${u.role}"
                            style="font-size:0.75rem;padding:5px 8px;border-radius:8px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);cursor:pointer;font-family:inherit;color-scheme:dark;">
                            <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Admin</option>
                            <option value="coach"   ${u.role === 'coach'   ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Coach</option>
                            <option value="viewer"  ${u.role === 'viewer'  ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Viewer</option>
                            <option value="scout"   ${u.role === 'scout'   ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Scout</option>
                        </select>
                        <button class="member-role-save" data-user-id="${u.id}"
                            style="font-size:0.7rem;padding:5px 10px;border-radius:8px;background:var(--plat-accent);color:#000;font-weight:700;border:none;cursor:pointer;white-space:nowrap;">
                            Save
                        </button>
                    </div>
                </div>
            `;
        }).join('')
        : '<div style="text-align:center;padding:20px;color:var(--plat-text-dim);font-size:0.82rem;">No team members</div>';

    // Metrics block
    const metricsHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(96,165,250,0.12);color:#60a5fa;"><i class="fas fa-users"></i></div>
                <div class="metric-value">${clubUsers.length}</div>
                <div class="metric-label">Users</div>
                <div class="metric-breakdown">${roleCounts.admin} admin &middot; ${roleCounts.coach} coach &middot; ${roleCounts.viewer} viewer</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(0,196,154,0.12);color:#00C49A;"><i class="fas fa-clipboard-list"></i></div>
                <div class="metric-value">${clubSessions.length}</div>
                <div class="metric-label">Sessions</div>
                <div class="metric-breakdown">${clubTemplates.length} templates</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;"><i class="fas fa-pencil-ruler"></i></div>
                <div class="metric-value">${clubDrills.length}</div>
                <div class="metric-label">Drills</div>
                <div class="metric-breakdown">${clubDrills.filter(d => !d.session_id).length} standalone</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(16,185,129,0.12);color:#10b981;"><i class="fas fa-running"></i></div>
                <div class="metric-value">${clubPlayers.length}</div>
                <div class="metric-label">Players</div>
                <div class="metric-breakdown">&nbsp;</div>
            </div>
        </div>
    `;

    const featuresHTML = Object.keys(features).length > 0
        ? Object.entries(features).map(([key, val]) =>
            `<div class="feature-row">
                <i class="fas ${val ? 'fa-check-circle on' : 'fa-times-circle off'}"></i>
                <span>${key.replace(/_/g, ' ')}</span>
            </div>`
        ).join('')
        : '<div style="color:var(--plat-text-dim);font-size:0.82rem;">No feature flags configured.</div>';

    const container = document.getElementById('clubsContainer');
    container.innerHTML = `
        <div class="club-detail">
            <div class="club-detail-header">
                <div class="club-detail-left">
                    <div class="club-detail-avatar">${detailAvatarContent}</div>
                    <div class="club-detail-meta">
                        <h2>${escapeHtml(club.name)}</h2>
                        <p>${capitalize(archetype)} &middot; ${clubUsers.length} users &middot; ${clubPlayers.length} players &middot; Created ${created}</p>
                    </div>
                </div>
                <div class="club-detail-actions">
                    <button class="btn-back" id="btnBackToCards">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <button class="btn-impersonate" id="btnImpersonate" data-club-id="${club.id}" data-club-name="${escapeHtml(club.name)}">
                        <i class="fas fa-eye"></i> Enter as Admin
                    </button>
                    <button class="btn-back" id="btnDeleteClub" data-club-id="${club.id}" data-club-name="${escapeHtml(club.name)}" style="background:#ef4444;color:#fff;border-color:#ef4444;">
                        <i class="fas fa-trash"></i> Delete Club
                    </button>
                </div>
            </div>
            <div class="club-detail-body">
                <div class="detail-block" style="grid-column: 1 / -1;">
                    <h3><i class="fas fa-chart-bar"></i> Club Metrics</h3>
                    ${metricsHTML}
                </div>
                <div class="detail-block">
                    <h3><i class="fas fa-sliders-h"></i> Subscription Management</h3>
                    <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px;">
                        <div>
                            <div style="font-size:0.72rem;font-weight:600;color:var(--plat-text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Tier</div>
                            <select id="clubTierSelect" data-no-custom data-club-id="${club.id}"
                                style="width:100%;padding:8px 12px;border-radius:10px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.85rem;cursor:pointer;font-family:inherit;color-scheme:dark;">
                                <option value="free"  ${currentTier === 'free'  ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Free</option>
                                <option value="basic" ${currentTier === 'basic' ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Basic</option>
                                <option value="pro"   ${currentTier === 'pro'   ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Pro</option>
                                <option value="elite" ${currentTier === 'elite' ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Elite</option>
                            </select>
                        </div>
                        <div>
                            <div style="font-size:0.72rem;font-weight:600;color:var(--plat-text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Subscription Status</div>
                            <div style="display:flex;gap:8px;">
                                <button id="btnSetActive" data-club-id="${club.id}"
                                    style="flex:1;padding:8px 12px;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;border:1.5px solid;transition:all 0.15s;
                                           ${!isPaused ? 'background:#10b981;color:#fff;border-color:#10b981;' : 'background:transparent;color:var(--plat-text-dim);border-color:var(--plat-border);'}">
                                    <i class="fas fa-play"></i> Active
                                </button>
                                <button id="btnSetPaused" data-club-id="${club.id}"
                                    style="flex:1;padding:8px 12px;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;border:1.5px solid;transition:all 0.15s;
                                           ${isPaused ? 'background:#f59e0b;color:#000;border-color:#f59e0b;' : 'background:transparent;color:var(--plat-text-dim);border-color:var(--plat-border);'}">
                                    <i class="fas fa-pause"></i> Paused
                                </button>
                            </div>
                            <p style="font-size:0.72rem;color:var(--plat-text-dim);margin-top:6px;" id="statusNote">
                                ${isPaused ? 'Users cannot access the platform while paused.' : 'All users have full access.'}
                            </p>
                        </div>
                        <button id="btnSaveSubscription" data-club-id="${club.id}"
                            style="width:100%;padding:10px;border-radius:10px;background:var(--plat-accent);color:#000;font-size:0.85rem;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;">
                            <i class="fas fa-save"></i> Save Subscription Changes
                        </button>
                        <div>
                            <div style="font-size:0.72rem;font-weight:600;color:var(--plat-text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Payment Method</div>
                            <select id="clubPaymentSelect" data-no-custom data-club-id="${club.id}"
                                style="width:100%;padding:8px 12px;border-radius:10px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.85rem;cursor:pointer;font-family:inherit;color-scheme:dark;">
                                <option value="bank_eft" ${currentPaymentMethod === 'bank_eft' ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">Bank / EFT Transfer</option>
                                <option value="in_app"   ${currentPaymentMethod === 'in_app'   ? 'selected' : ''} style="background:#1e293b;color:#f1f5f9">In-App Payment</option>
                            </select>
                        </div>
                        <p id="subSaveConfirm" style="font-size:0.75rem;color:#10b981;text-align:center;display:none;"><i class="fas fa-check-circle"></i> Saved successfully</p>
                    </div>
                </div>
                <div class="detail-block">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <h3 style="margin:0;"><i class="fas fa-users"></i> Team Members (${clubUsers.length})</h3>
                        <button id="btnShowAddMember" data-club-id="${club.id}"
                            style="font-size:0.75rem;padding:5px 12px;border-radius:8px;background:var(--plat-accent);color:#000;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;">
                            <i class="fas fa-user-plus"></i> Add Member
                        </button>
                    </div>
                    <p style="font-size:0.75rem;color:var(--plat-text-dim);margin-bottom:10px;">Select a new role and click Save to update a member.</p>
                    <div class="members-list">${membersHTML}</div>
                    <div id="addMemberForm" style="display:none;margin-top:14px;padding:14px;border-radius:12px;border:1.5px solid var(--plat-border);background:rgba(255,255,255,0.03);">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--plat-text);margin-bottom:12px;letter-spacing:0.02em;">Add New Member to Club</div>
                        <div style="display:grid;gap:8px;">
                            <input id="newMemberName" type="text" placeholder="Full Name" autocomplete="off"
                                style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.82rem;font-family:inherit;box-sizing:border-box;outline:none;">
                            <input id="newMemberEmail" type="email" placeholder="Email Address" autocomplete="off"
                                style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.82rem;font-family:inherit;box-sizing:border-box;outline:none;">
                            <input id="newMemberPassword" type="password" placeholder="Password (min 8 characters)" autocomplete="new-password"
                                style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.82rem;font-family:inherit;box-sizing:border-box;outline:none;">
                            <select id="newMemberRole" data-no-custom style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--plat-border);background:var(--plat-card);color:var(--plat-text);font-size:0.82rem;font-family:inherit;cursor:pointer;color-scheme:dark;">
                                <option value="admin"  style="background:#1e293b;color:#f1f5f9">Admin</option>
                                <option value="coach"  style="background:#1e293b;color:#f1f5f9" selected>Coach</option>
                                <option value="viewer" style="background:#1e293b;color:#f1f5f9">Viewer</option>
                                <option value="scout"  style="background:#1e293b;color:#f1f5f9">Scout</option>
                            </select>
                            <div id="addMemberError" style="font-size:0.75rem;color:#f87171;display:none;"></div>
                            <div style="display:flex;gap:8px;margin-top:4px;">
                                <button id="btnSubmitAddMember" data-club-id="${club.id}"
                                    style="flex:1;padding:8px 12px;border-radius:8px;background:var(--plat-accent);color:#000;font-size:0.82rem;font-weight:700;border:none;cursor:pointer;">
                                    <i class="fas fa-user-plus"></i> Create User
                                </button>
                                <button id="btnCancelAddMember"
                                    style="padding:8px 16px;border-radius:8px;background:transparent;color:var(--plat-text-dim);font-size:0.82rem;font-weight:600;border:1.5px solid var(--plat-border);cursor:pointer;">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="detail-block">
                    <h3><i class="fas fa-sliders-h"></i> Feature Flags</h3>
                    ${featuresHTML}
                    <h3 style="margin-top:20px;"><i class="fas fa-code"></i> Settings (JSONB)</h3>
                    <pre class="settings-json">${JSON.stringify(club.settings || {}, null, 2)}</pre>
                </div>
                <div class="detail-block" id="userActivityPanel" style="grid-column: 1 / -1; display: none;">
                </div>
            </div>
        </div>
    `;

    // Back button
    document.getElementById('btnBackToCards').addEventListener('click', () => {
        renderClubCards(document.getElementById('clubSearch')?.value || '');
    });

    // Impersonate button — pass branding data in URL so preload can render instantly
    document.getElementById('btnImpersonate').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const cId = btn.dataset.clubId;
        const club = allClubs.find(c => c.id === cId);
        const clubName = club?.name || btn.dataset.clubName || '';
        const logoUrl = club?.settings?.branding?.logo_url || '';
        const archetype = club?.settings?.archetype || '';
        const displayName = club?.settings?.branding?.club_display_name || clubName;
        const tier = (club?.settings?.tier || club?.settings?.plan || 'free').toLowerCase();
        const features = club?.settings?.features || {};
        const params = new URLSearchParams({
            club: cId,
            club_name: clubName,
            club_logo: logoUrl,
            club_display: displayName,
            club_archetype: archetype,
            club_tier: tier,
            club_features: JSON.stringify(features),
        });
        window.open(`/src/pages/dashboard.html?${params.toString()}`, '_blank');
    });

    // Delete club button
    document.getElementById('btnDeleteClub').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const cId = btn.dataset.clubId;
        const cName = btn.dataset.clubName;
        if (!confirm(`Are you sure you want to delete "${cName}"?\n\nThis will permanently delete the club and all its data (players, sessions, drills, invites). This cannot be undone.`)) return;
        if (!confirm(`FINAL WARNING: Type OK to confirm deletion of "${cName}".`)) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        try {
            const { error, count } = await supabase.from('clubs').delete({ count: 'exact' }).eq('id', cId);
            if (error) throw error;
            if (count === 0) throw new Error('Delete blocked by database permissions (RLS). Run migration 006_platform_admin_delete_update.sql in Supabase SQL Editor first.');
            alert(`Club "${cName}" deleted.`);
            await loadPlatformData();
            renderStats();
            renderClubCards();
        } catch (err) {
            console.error('Delete club error:', err);
            showToast(friendlyError(err), 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i> Delete Club';
        }
    });

    // Active / Paused toggle — visual only, committed on Save
    let _pendingStatus = currentStatus;
    document.getElementById('btnSetActive').addEventListener('click', (e) => {
        _pendingStatus = 'active';
        e.currentTarget.style.cssText += 'background:#10b981;color:#fff;border-color:#10b981;';
        document.getElementById('btnSetPaused').style.cssText = document.getElementById('btnSetPaused').style.cssText.replace(/background:[^;]+;color:[^;]+;border-color:[^;]+;/, 'background:transparent;color:var(--plat-text-dim);border-color:var(--plat-border);');
        document.getElementById('statusNote').textContent = 'All users have full access.';
    });
    document.getElementById('btnSetPaused').addEventListener('click', (e) => {
        _pendingStatus = 'paused';
        e.currentTarget.style.cssText += 'background:#f59e0b;color:#000;border-color:#f59e0b;';
        document.getElementById('btnSetActive').style.cssText = document.getElementById('btnSetActive').style.cssText.replace(/background:[^;]+;color:[^;]+;border-color:[^;]+;/, 'background:transparent;color:var(--plat-text-dim);border-color:var(--plat-border);');
        document.getElementById('statusNote').textContent = 'Users cannot access the platform while paused.';
    });

    // Save subscription changes (tier + status together)
    document.getElementById('btnSaveSubscription').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const cId = btn.dataset.clubId;
        const newTier = document.getElementById('clubTierSelect').value;
        const newStatus = _pendingStatus;
        const newPaymentMethod = document.getElementById('clubPaymentSelect').value;
        const tierOrder = ['free', 'basic', 'pro', 'elite'];
        const idx = tierOrder.indexOf(newTier);
        const atLeast = (t) => idx >= tierOrder.indexOf(t);
        const arch = club.settings?.archetype || 'academy';
        const newFeatures = {
            session_planner:     atLeast('basic'),
            library:             atLeast('basic'),
            reports:             atLeast('basic'),
            match_planning:      atLeast('pro') && arch !== 'private_coaching',
            analytics_dashboard: atLeast('pro'),
            player_assessments:  atLeast('pro'),
            financials:          atLeast('elite'),
            video_analysis:      false,
            export_pdf:          atLeast('elite'),
        };
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        const { error } = await supabase.from('clubs').update({
            settings: { ...club.settings, tier: newTier, status: newStatus, features: newFeatures, payment_method: newPaymentMethod }
        }).eq('id', cId);
        if (error) {
            showToast(friendlyError(error), 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Subscription Changes';
        } else {
            club.settings = { ...club.settings, tier: newTier, status: newStatus, features: newFeatures, payment_method: newPaymentMethod };
            // Bust the club's cached sidebar tier so their next page load reflects the new tier
            // without requiring a logout. We clear sidebar-tier from localStorage (regular users)
            // and sessionStorage (impersonation tabs) for this club.
            try {
                const storedBranding = JSON.parse(localStorage.getItem('sidebar-branding') || 'null');
                if (storedBranding) {
                    localStorage.setItem('sidebar-tier', newTier);
                    localStorage.setItem('sidebar-features', JSON.stringify(newFeatures));
                }
            } catch (e) {}
            btn.innerHTML = '<i class="fas fa-check"></i> Saved';
            btn.style.background = '#10b981';
            const confirm = document.getElementById('subSaveConfirm');
            if (confirm) { confirm.style.display = 'block'; setTimeout(() => { confirm.style.display = 'none'; }, 3000); }
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Save Subscription Changes';
                btn.style.background = '';
            }, 2000);
        }
    });

    // Role save per member row
    container.querySelectorAll('.member-role-save').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            const sel = container.querySelector(`.member-role-select[data-user-id="${userId}"]`);
            const newRole = sel.value;
            const userName = allProfiles.find(p => p.id === userId)?.full_name || 'this user';
            btn.disabled = true;
            btn.textContent = '...';
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) {
                showToast(friendlyError(error), 'error');
                sel.value = sel.dataset.originalRole;
            } else {
                const p = allProfiles.find(p => p.id === userId);
                if (p) p.role = newRole;
                sel.dataset.originalRole = newRole;
                btn.textContent = '✓';
                btn.style.background = '#10b981';
                setTimeout(() => { btn.disabled = false; btn.textContent = 'Save'; btn.style.background = ''; }, 1800);
                showToast(`${userName} is now ${newRole}`, 'success');
            }
        });
    });

    // Add Member toggle
    document.getElementById('btnShowAddMember')?.addEventListener('click', () => {
        const form = document.getElementById('addMemberForm');
        if (form) { form.style.display = form.style.display === 'none' ? '' : 'none'; }
    });
    document.getElementById('btnCancelAddMember')?.addEventListener('click', () => {
        const form = document.getElementById('addMemberForm');
        if (form) form.style.display = 'none';
        document.getElementById('addMemberError').style.display = 'none';
    });

    document.getElementById('btnSubmitAddMember')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const cId = btn.dataset.clubId;
        const name = document.getElementById('newMemberName').value.trim();
        const email = document.getElementById('newMemberEmail').value.trim();
        const password = document.getElementById('newMemberPassword').value;
        const role = document.getElementById('newMemberRole').value;
        const errEl = document.getElementById('addMemberError');

        errEl.style.display = 'none';
        if (!name || !email || !password) { errEl.textContent = 'Name, email, and password are required.'; errEl.style.display = ''; return; }
        if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = ''; return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`https://ocfycodijzcwupafrpzv.supabase.co/functions/v1/add-club-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ clubId: cId, email, fullName: name, password, role }),
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Failed to create user');

            showToast(`${name} added to club as ${role}`, 'success');
            document.getElementById('addMemberForm').style.display = 'none';
            document.getElementById('newMemberName').value = '';
            document.getElementById('newMemberEmail').value = '';
            document.getElementById('newMemberPassword').value = '';
            // Reload detail view to show new member
            viewClubDetail(cId);
        } catch (err) {
            errEl.textContent = friendlyError(err);
            errEl.style.display = '';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Create User';
        }
    });

    // Member click → show user activity
    container.querySelectorAll('.member-clickable').forEach(el => {
        el.addEventListener('click', () => {
            const userId = el.dataset.userId;
            const userClubId = el.dataset.clubId;
            showUserActivity(userId, userClubId);
            container.querySelectorAll('.member-clickable').forEach(m => m.closest('.member-item').style.borderLeft = '');
            el.closest('.member-item').style.borderLeft = '3px solid var(--plat-accent)';
        });
    });
}

// ── User Activity Panel ──

function showUserActivity(userId, clubId) {
    const panel = document.getElementById('userActivityPanel');
    if (!panel) return;

    const user = allProfiles.find(p => p.id === userId);
    const userSessions = allSessions.filter(s => s.club_id === clubId && s.created_by === userId && !s.is_template);
    const userTemplates = allSessions.filter(s => s.club_id === clubId && s.created_by === userId && s.is_template);
    const userDrills = allDrills.filter(d => d.club_id === clubId && d.created_by === userId);
    const standaloneDrills = userDrills.filter(d => !d.session_id);

    const userName = user?.full_name || 'Unknown';
    const roleClass = user?.role === 'admin' ? 'admin' : user?.role === 'coach' ? 'coach' : 'viewer';

    const sessionsListHTML = userSessions.length > 0
        ? userSessions.slice(0, 20).map(s => {
            const date = s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
            const drillCount = allDrills.filter(d => d.session_id === s.id).length;
            return `<div class="activity-item"><span class="activity-title">${escapeHtml(s.title || 'Untitled')}</span><span class="activity-meta">${drillCount} drills &middot; ${date}</span></div>`;
        }).join('')
        : '<div style="color:var(--plat-text-dim);font-size:0.8rem;padding:8px 0;">No sessions created</div>';

    const drillsListHTML = standaloneDrills.length > 0
        ? standaloneDrills.slice(0, 20).map(d => {
            const date = d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
            return `<div class="activity-item"><span class="activity-title">${escapeHtml(d.title || 'Untitled')}</span><span class="activity-meta">${date}</span></div>`;
        }).join('')
        : '<div style="color:var(--plat-text-dim);font-size:0.8rem;padding:8px 0;">No standalone drills</div>';

    panel.style.display = '';
    panel.innerHTML = `
        <div class="user-activity-header">
            <h3><i class="fas fa-user"></i> ${escapeHtml(userName)} <span class="role-tag ${roleClass}" style="vertical-align:middle;margin-left:6px;">${user?.role || '-'}</span></h3>
            <button class="btn-close-activity" title="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="user-activity-stats">
            <div class="ua-stat"><strong>${userSessions.length}</strong> sessions</div>
            <div class="ua-stat"><strong>${userTemplates.length}</strong> templates</div>
            <div class="ua-stat"><strong>${userDrills.length}</strong> total drills</div>
            <div class="ua-stat"><strong>${standaloneDrills.length}</strong> standalone drills</div>
        </div>
        <div class="user-activity-lists">
            <div class="ua-list">
                <h4>Recent Sessions</h4>
                ${sessionsListHTML}
            </div>
            <div class="ua-list">
                <h4>Standalone Drills</h4>
                ${drillsListHTML}
            </div>
        </div>
    `;

    panel.querySelector('.btn-close-activity')?.addEventListener('click', () => {
        panel.style.display = 'none';
        document.querySelectorAll('.member-clickable').forEach(m => m.style.borderLeft = '');
    });

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Event Listeners ──

function setupEventListeners(profile) {
    const modal = document.getElementById('createClubModal');
    const btnCreate = document.getElementById('btnCreateClub');
    const btnCancel = document.getElementById('btnCancelCreate');
    const form = document.getElementById('createClubForm');

    btnCreate.addEventListener('click', () => modal.classList.add('active'));
    btnCancel.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Logo file preview in create form
    document.getElementById('newClubLogoFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('newClubLogoPreview');
        if (!file || !preview) return;
        if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2 MB'); e.target.value = ''; return; }
        preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Logo" style="width:100%;height:100%;object-fit:contain;">`;
    });

    // Search
    const searchInput = document.getElementById('clubSearch');
    searchInput.addEventListener('input', () => renderClubCards(searchInput.value));

    // Form submit — uses Edge Function to create club + send magic link invite
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btnSubmitCreate');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        const clubName = document.getElementById('newClubName').value.trim();
        const adminEmail = document.getElementById('newClubAdminEmail').value.trim();
        const adminName = document.getElementById('newClubAdminName').value.trim();
        const archetype = document.getElementById('newClubArchetype').value;
        const tier = document.getElementById('newClubTier').value;
        const logoFile = document.getElementById('newClubLogoFile')?.files?.[0] || null;

        try {
            // Upload logo first if provided (need the URL for the Edge Function)
            let logoUrl = '';
            if (logoFile) {
                if (logoFile.size > 2 * 1024 * 1024) throw new Error('Logo must be under 2 MB');
                const ext = logoFile.name.split('.').pop().toLowerCase();
                const filePath = `clubs/pending_${Date.now()}/logo.${ext}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, logoFile, { cacheControl: '3600', upsert: true, contentType: logoFile.type });
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
                logoUrl = publicUrl;
            }

            // Call Edge Function to create club + send magic link email
            const { data: session } = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/provision-club-admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.session.access_token}`,
                },
                body: JSON.stringify({
                    clubName,
                    adminEmail,
                    adminName,
                    archetype,
                    tier,
                    logoUrl: logoUrl || undefined,
                }),
            });

            const result = await response.json();
            if (!response.ok && response.status !== 207) {
                throw new Error(result.error || 'Failed to provision club');
            }

            // Success
            modal.classList.remove('active');
            form.reset();
            // Reset logo preview
            const preview = document.getElementById('newClubLogoPreview');
            if (preview) preview.innerHTML = '<i class="fas fa-image" style="font-size:1.1rem;color:var(--plat-muted);"></i>';

            if (response.status === 207) {
                alert(`Club "${clubName}" created, but the invite email failed to send.\n\n${result.fallbackMessage || 'Create a manual invite from the club detail view.'}`);
            } else if (result.existingUser) {
                alert(`Club "${clubName}" created!\n\n${adminEmail} already has an account — their profile has been updated to admin for this club.`);
            } else {
                alert(`Club "${clubName}" created!\n\nAn invite email has been sent to ${adminEmail}.\nThey'll click the link in their email to activate their admin account.`);
            }

            // Reload data
            await loadPlatformData();
            renderStats();
            renderClubCards();
        } catch (err) {
            console.error('Create club error:', err);
            showToast(friendlyError(err), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create Club';
        }
    });
}

// ── Default Settings by Archetype ──

function buildDefaultSettings(archetype, tier = 'free') {
    const tierOrder = ['free', 'basic', 'pro', 'elite'];
    const tierIdx = Math.max(0, tierOrder.indexOf(tier));
    const atLeast = (t) => tierIdx >= tierOrder.indexOf(t);

    const base = {
        archetype,
        tier,
        status: 'active',
        plan: tier === 'free' ? 'trial' : 'active',
        features: {
            session_planner:      atLeast('basic'),
            library:              atLeast('basic'),
            reports:              atLeast('basic'),
            match_planning:       atLeast('pro'),
            analytics_dashboard:  atLeast('pro'),
            player_assessments:   atLeast('pro'),
            video_analysis:       false,
            export_pdf:           atLeast('elite'),
            financials:           atLeast('elite'),
        },
        limits: {
            max_squads: 2,
            max_players: 50,
            max_storage_gb: 1,
        },
        branding: {
            primary_color: null,
            secondary_color: null,
            logo_url: null,
            club_display_name: null,
        },
    };

    if (archetype === 'academy') {
        base.modules = {
            squads: true,
            individual_clients: false,
            player_profiles: true,
            match_planning: true,
            assessments: true,
            scheduling: false,
            invoicing: false,
        };
        base.layout = {
            sidebar_order: ['dashboard', 'planner', 'library', 'reports', 'squad', 'matches', 'analytics'],
        };
    } else if (archetype === 'private_coaching') {
        base.modules = {
            squads: false,
            individual_clients: true,
            player_profiles: true,
            match_planning: false,
            assessments: true,
            scheduling: true,
            invoicing: true,
        };
        base.layout = {
            sidebar_order: ['dashboard', 'planner', 'squad', 'analytics'],
        };
        base.features.match_planning = false;
    }

    return base;
}

// ── Helpers ──

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
