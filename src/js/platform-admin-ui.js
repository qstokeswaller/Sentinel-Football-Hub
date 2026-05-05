/**
 * Platform Admin Dashboard UI
 *
 * Standalone platform shell — completely separate from the club sidebar layout.
 * Renders club cards, detail views, stats, and create-club functionality.
 * Platform admins can click a club card to view details or impersonate into it.
 */
import supabase from '../supabase.js';
import { startImpersonation } from '../auth.js';

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
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="club-status ${status}"><span class="dot"></span> ${capitalize(status)}</span>
                        <span class="club-plan-tag ${plan}">${plan.toUpperCase()}</span>
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
            const roleClass = u.role === 'admin' ? 'admin' : u.role === 'coach' ? 'coach' : 'viewer';
            const userSessions = clubSessions.filter(s => s.created_by === u.id).length;
            const userDrills = clubDrills.filter(d => d.created_by === u.id).length;
            return `
                <div class="member-item member-clickable" data-user-id="${u.id}" data-club-id="${clubId}" style="cursor:pointer;" title="Click to view activity">
                    <div>
                        <div class="name">${escapeHtml(u.full_name || 'Unknown')}</div>
                        <div class="email">${userSessions} sessions &middot; ${userDrills} drills</div>
                    </div>
                    <span class="role-tag ${roleClass}">${u.role}</span>
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
                    <h3><i class="fas fa-users"></i> Team Members (${clubUsers.length})</h3>
                    <div class="members-list">${membersHTML}</div>
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
            alert(`Failed to delete club: ${err.message}`);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i> Delete Club';
        }
    });

    // Member click → show user activity
    container.querySelectorAll('.member-clickable').forEach(el => {
        el.addEventListener('click', () => {
            const userId = el.dataset.userId;
            const userClubId = el.dataset.clubId;
            showUserActivity(userId, userClubId);
            // Highlight selected
            container.querySelectorAll('.member-clickable').forEach(m => m.style.borderLeft = '');
            el.style.borderLeft = '3px solid var(--plat-accent)';
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
            alert(`Failed to create club: ${err.message}`);
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
