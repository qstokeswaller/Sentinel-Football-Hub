/**
 * Match Analysis UI
 * Video analysis, links, uploads and notes for a specific match.
 */
import supabase from '../supabase.js';
import matchManager from '../managers/match-manager.js';
import { showToast, friendlyError } from '../toast.js';

let matchId = null;
let matchData = null;
let videos = [];
let links = [];
let clubId = null;

async function getClubId() {
    if (clubId) return clubId;
    // Impersonation takes priority for super_admin
    const imp = sessionStorage.getItem('impersonating_club_id');
    if (imp) { clubId = imp; return clubId; }
    clubId = window._profile?.club_id || null;
    return clubId;
}

export async function initMatchAnalysis() {
    await matchManager.init();

    const params = new URLSearchParams(window.location.search);
    matchId = params.get('id');

    if (!matchId) {
        showToast('No match specified', 'error');
        return;
    }

    await loadMatch();
}

async function loadMatch() {
    matchData = matchManager.matches.find(m => m.id === matchId);
    if (!matchData) {
        // Try fetching directly
        try {
            const { data, error } = await supabase
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();
            if (error) throw error;
            matchData = data;
        } catch (e) {
            showToast('Match not found', 'error');
            return;
        }
    }

    videos = Array.isArray(matchData.videos) ? [...matchData.videos] : [];
    links = Array.isArray(matchData.links) ? [...matchData.links] : [];

    // Populate banner
    const el = (id) => document.getElementById(id);
    const homeTeam = matchData.homeTeam || matchData.home_team || '?';
    const awayTeam = matchData.awayTeam || matchData.away_team || matchData.opponent || '?';
    const hasScore = matchData.homeScore != null || matchData.home_score != null;
    const hScore = matchData.homeScore ?? matchData.home_score ?? '-';
    const aScore = matchData.awayScore ?? matchData.away_score ?? '-';

    el('bannerHome').textContent = homeTeam;
    el('bannerAway').textContent = awayTeam;
    el('bannerScore').textContent = hasScore ? `${hScore} - ${aScore}` : 'vs';
    el('bannerDate').textContent = matchData.date || '--';
    el('bannerVenue').textContent = matchData.venue || '--';
    el('bannerComp').textContent = matchData.competition || '--';
    el('pageTitle').textContent = `Analysis: ${homeTeam} vs ${awayTeam}`;
    el('linkToReport').href = `match-details.html?id=${matchId}`;

    // Notes
    const notes = matchData.notes || matchData.analysis_notes || '';
    el('analysisNotes').value = notes;

    renderVideos();
    renderLinks();
}

/* -- Video rendering ------------------------------------------------ */
function getEmbedUrl(url) {
    if (!url || url === '#') return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Vimeo
    const vmMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`;
    return null;
}

function renderVideos() {
    const grid = document.getElementById('videoGrid');
    if (!videos.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">
            <i class="fas fa-film"></i>
            <p>No videos added yet</p>
            <p style="font-size: 0.8rem;">Add a YouTube or Vimeo link below</p>
        </div>`;
        return;
    }

    grid.innerHTML = videos.map((v, i) => {
        const embedUrl = getEmbedUrl(v.url);
        const isStorageFile = v.storagePath || (v.url && v.url !== '#' && !embedUrl && v.type !== 'link');
        const isVideoFile = isStorageFile && /\.(mp4|mov|avi|webm|mkv)/i.test(v.fileName || v.url || '');
        let embedHtml;
        if (embedUrl) {
            embedHtml = `<iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe>`;
        } else if (isVideoFile && v.url && v.url !== '#') {
            embedHtml = `<video src="${escH(v.url)}" controls preload="metadata" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;"></video>`;
        } else {
            const label = v.storagePath ? (v.fileName || 'Uploaded file') : (v.url === '#' ? 'Uploaded file' : 'No preview');
            embedHtml = `<div class="video-placeholder"><i class="fas fa-${v.storagePath ? 'cloud' : 'video'}"></i><span style="font-size:0.8rem;">${escH(label)}</span></div>`;
        }

        const typeClass = v.type === 'full' ? 'full' : v.type === 'highlights' ? 'highlights' : '';
        const typeLabel = v.type || 'video';

        return `<div class="video-card">
            <div class="video-embed">${embedHtml}</div>
            <div class="video-info">
                <span class="video-label">${escH(v.title || 'Untitled')}</span>
                <span class="video-type ${typeClass}">${typeLabel}</span>
            </div>
            <div class="video-actions">
                ${v.url && v.url !== '#' ? `<a href="${escH(v.url)}" target="_blank" class="dash-btn outline sm"><i class="fas fa-external-link-alt"></i> Open</a>` : ''}
                <button class="dash-btn outline sm danger" onclick="removeVideo(${i})" style="color:#ef4444;border-color:rgba(239,68,68,0.3);"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;
    }).join('');
}

function renderLinks() {
    const list = document.getElementById('linkList');
    if (!links.length) {
        list.innerHTML = `<div class="empty-state">
            <i class="fas fa-link"></i>
            <p>No links added yet</p>
        </div>`;
        return;
    }

    list.innerHTML = links.map((l, i) => {
        const iconMap = { report: 'fa-file-alt', file: 'fa-paperclip', scout: 'fa-binoculars' };
        const icon = iconMap[l.type] || 'fa-link';
        return `<div class="link-item">
            <div class="link-icon"><i class="fas ${icon}"></i></div>
            <div class="link-info">
                <div class="link-title">${escH(l.title || 'Untitled')}</div>
                <div class="link-url">${escH(l.url || '')}</div>
            </div>
            ${l.url && l.url !== '#' ? `<a href="${escH(l.url)}" target="_blank" class="dash-btn outline sm"><i class="fas fa-external-link-alt"></i></a>` : ''}
            <button class="dash-btn outline sm danger" onclick="removeLink(${i})" style="color:#ef4444;border-color:rgba(239,68,68,0.3);padding:6px 10px;"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    }).join('');
}

/* -- Add/Remove ---------------------------------------------------- */
function addVideo() {
    const url = document.getElementById('newVideoUrl').value.trim();
    const type = document.getElementById('newVideoType').value;
    if (!url) { showToast('Enter a video URL', 'error'); return; }

    const typeLabels = { full: 'Full Match', highlights: 'Highlights', training: 'Training', other: 'Video' };
    videos.push({ title: typeLabels[type] || 'Video', url, type });
    document.getElementById('newVideoUrl').value = '';
    renderVideos();
    showToast('Video added — remember to save', 'info');
}
window.addVideo = addVideo;

function removeVideo(index) {
    videos.splice(index, 1);
    renderVideos();
}
window.removeVideo = removeVideo;

function addLink() {
    const url = document.getElementById('newLinkUrl').value.trim();
    const title = document.getElementById('newLinkTitle').value.trim();
    if (!url) { showToast('Enter a link URL', 'error'); return; }

    links.push({ title: title || 'Link', url, type: 'link' });
    document.getElementById('newLinkUrl').value = '';
    document.getElementById('newLinkTitle').value = '';
    renderLinks();
    showToast('Link added — remember to save', 'info');
}
window.addLink = addLink;

function removeLink(index) {
    links.splice(index, 1);
    renderLinks();
}
window.removeLink = removeLink;

/* -- File Upload --------------------------------------------------- */
function setUploadProgress(barId, pct) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.style.display = pct > 0 && pct < 100 ? 'block' : 'none';
    const fill = bar.querySelector('.progress-fill');
    if (fill) fill.style.width = pct + '%';
}

async function uploadFile(file, folder) {
    const cid = await getClubId();
    if (!cid) { showToast('Could not determine club — please reload', 'error'); return null; }

    const ext = file.name.split('.').pop().toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${cid}/match-analysis/${matchId}/${folder}/${Date.now()}_${safeName}`;

    const { data, error } = await supabase.storage
        .from('report-attachments')
        .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    const { data: urlData } = supabase.storage
        .from('report-attachments')
        .getPublicUrl(data.path);

    return { url: urlData.publicUrl, path: data.path, fileName: file.name };
}

async function uploadVideoFile() {
    const input = document.getElementById('videoFileInput');
    if (!input.files.length) { showToast('Select a video file', 'error'); return; }

    const file = input.files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) { showToast('File too large (max 50MB)', 'error'); return; }

    const type = document.getElementById('uploadVideoType').value;
    const typeLabels = { full: 'Full Match', highlights: 'Highlights', training: 'Training', other: 'Video' };

    const btn = document.getElementById('btnUploadVideo');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    setUploadProgress('videoUploadProgress', 50);

    try {
        const result = await uploadFile(file, 'videos');
        if (!result) return;
        videos.push({ title: typeLabels[type] || file.name, url: result.url, type, storagePath: result.path, fileName: result.fileName });
        input.value = '';
        renderVideos();
        setUploadProgress('videoUploadProgress', 100);
        showToast('Video uploaded — remember to save', 'success');
    } catch (err) {
        console.error('Video upload failed:', err);
        showToast(friendlyError(err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
        setTimeout(() => setUploadProgress('videoUploadProgress', 0), 1500);
    }
}
window.uploadVideoFile = uploadVideoFile;

async function uploadDocFile() {
    const input = document.getElementById('docFileInput');
    if (!input.files.length) { showToast('Select a file', 'error'); return; }

    const file = input.files[0];
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) { showToast('File too large (max 25MB)', 'error'); return; }

    const title = document.getElementById('uploadDocTitle').value.trim() || file.name;

    const btn = document.getElementById('btnUploadDoc');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    setUploadProgress('docUploadProgress', 50);

    try {
        const result = await uploadFile(file, 'documents');
        if (!result) return;
        links.push({ title, url: result.url, type: 'file', storagePath: result.path, fileName: result.fileName });
        input.value = '';
        document.getElementById('uploadDocTitle').value = '';
        renderLinks();
        setUploadProgress('docUploadProgress', 100);
        showToast('Document uploaded — remember to save', 'success');
    } catch (err) {
        console.error('Document upload failed:', err);
        showToast(friendlyError(err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
        setTimeout(() => setUploadProgress('docUploadProgress', 0), 1500);
    }
}
window.uploadDocFile = uploadDocFile;

/* -- Save ---------------------------------------------------------- */
async function saveAnalysis() {
    if (!matchId) return;

    const notes = document.getElementById('analysisNotes').value;

    try {
        const { error } = await supabase
            .from('matches')
            .update({
                videos,
                links,
                notes
            })
            .eq('id', matchId);

        if (error) throw error;
        showToast('Analysis saved!', 'success');
    } catch (err) {
        console.error('Save failed:', err);
        showToast('Failed to save analysis', 'error');
    }
}
window.saveAnalysis = saveAnalysis;

/* -- Utility ------------------------------------------------------- */
function escH(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
