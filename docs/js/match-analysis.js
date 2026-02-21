/**
 * Match Analysis UI Logic (Multi-Item Support)
 */

let currentMatchId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    currentMatchId = params.get('id');

    if (!currentMatchId) {
        window.location.href = 'matches.html';
        return;
    }

    // Initialize Managers
    await Promise.all([
        squadManager.init(),
        matchManager.init()
    ]);

    const match = matchManager.getMatch(currentMatchId);
    if (!match) {
        console.error('Match not found');
        // window.location.href = 'matches.html';
        return;
    }

    renderHeader(match);
    renderClips(match);
    renderHighlights(match);
    renderMatchVideos(match);
    renderExternalLinks(match);

    // File Input Listener
    document.getElementById('videoUploadInput').addEventListener('change', handleVideoUpload);
    document.getElementById('highlightsUploadInput').addEventListener('change', handleHighlightsUpload);

    // Initialize Drag and Drop
    setupDragAndDrop('emptyHighlightsState', handleHighlightsDrop);
    setupDragAndDrop('emptyMatchVideoState', handleVideoDrop);
});

// ... (handleHighlightsUpload, renderHighlights, deleteHighlights, renderHeader remain same) ...

// Helper to calculate result (Win/Loss/Draw) for the primary team (UP-Tuks)
function calculateResult(home, away) {
    if (home > away) return 'Win';
    if (home < away) return 'Loss';
    return 'Draw';
}

// Helper to get squad name safely
function getSquadName(squadId) {
    if (!window.squadManager) return 'UP-Tuks';
    const squad = squadManager.getSquad(squadId);
    return squad ? squad.name : 'UP-Tuks';
}

function renderHeader(match) {
    const squadName = getSquadName(match.squadId);

    const opponentName = match.opponent || match.awayTeam || 'Opponent';

    // 1. Set the Title Text
    const titleEl = document.getElementById('matchTitle');
    if (titleEl) {
        titleEl.innerText = `${squadName} vs ${opponentName}`;
        titleEl.style.display = 'block';
        titleEl.style.fontSize = '0.9rem';
        titleEl.style.color = 'var(--text-medium)';
    }

    // 2. Render the Bubble via match-ui.js logic
    const scoreContainer = document.getElementById('scoreline-container');
    if (scoreContainer) {
        // Determine if match is played based on score existence (robust fallback)
        const isPlayed = (match.homeScore !== undefined && match.homeScore !== null && match.homeScore !== '');

        let centerContent = '';

        if (isPlayed) {
            const homeScore = parseInt(match.homeScore, 10);
            const awayScore = parseInt(match.awayScore, 10);
            const result = calculateResult(homeScore, awayScore);
            // Colors from match-ui.js
            const resultColor = result === 'Win' ? '#166534' : (result === 'Loss' ? '#991b1b' : '#475569');
            const resultBg = result === 'Win' ? '#dcfce7' : (result === 'Loss' ? '#fee2e2' : '#f1f5f9');

            centerContent = `
                <div style="
                    background: ${resultBg}; 
                    color: ${resultColor}; 
                    padding: 4px 12px; 
                    border-radius: 6px; 
                    font-weight: 800; 
                    font-size: 1.1rem; 
                    min-width: 60px; 
                    text-align: center;
                    letter-spacing: 1px;
                ">
                    ${homeScore} - ${awayScore}
                </div>
            `;
        } else {
            // Future / No Result
            centerContent = `
                <div style="
                    color: var(--text-medium); 
                    padding: 0px 8px; 
                    font-size: 0.9rem; 
                    font-weight: 700;
                ">
                    VS
                </div>
            `;
        }

        scoreContainer.innerHTML = `
            <div class="scoreline-bubble" style="
                background: white; 
                padding: 8px 20px; 
                border-radius: 9999px; 
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); 
                display: flex; 
                align-items: center; 
                gap: 16px; 
                border: 1px solid var(--border-light);
                font-family: 'Inter', sans-serif;
            ">
                <span style="font-weight: 700; color: var(--navy-dark); font-size: 1.05rem;">${squadName}</span>
                ${centerContent}
                <span style="font-weight: 700; color: var(--text-medium); font-size: 1.05rem;">${opponentName}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-medium); font-weight: 600; margin-left: 16px; margin-top: 2px;">
                ${match.date || ''}
            </div>
        `;
    }
}

function renderMatchVideos(match) {
    const container = document.getElementById('fullMatchContainer');
    const emptyState = document.getElementById('emptyMatchVideoState');

    // Clear existing content but keep empty state (or re-append it)
    container.innerHTML = '';
    container.appendChild(emptyState);

    if (match.videos && match.videos.length > 0) {
        emptyState.style.display = 'none';
        match.videos.forEach((video, index) => {
            const card = createVideoCard(video, index);
            container.appendChild(card);
        });
    } else {
        emptyState.style.display = 'flex';
    }
}

function renderExternalLinks(match) {
    const container = document.getElementById('externalLinksContainer');
    const emptyState = document.getElementById('emptyLinksState');

    container.innerHTML = '';
    container.appendChild(emptyState);

    const links = match.links || [];
    if (links.length > 0) {
        emptyState.style.display = 'none';
        links.forEach((link, index) => {
            const card = createLinkCard(link, index, 'new');
            container.appendChild(card);
        });
    } else {
        emptyState.style.display = 'flex';
    }
}

function createVideoCard(video, index) {
    const div = document.createElement('div');
    div.className = 'analysis-card';
    div.innerHTML = `
        <div class="analysis-preview">
            <i class="fas fa-play" style="color: white; font-size: 2rem; opacity: 0.8;"></i>
        </div>
        <div class="analysis-content">
            <span class="analysis-tag tag-video">Video File</span>
            <h4 class="analysis-title">${video.name}</h4>
            <p class="analysis-meta">${formatDate(video.lastModified)}</p>
            <div class="analysis-actions">
                <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">Play</button>
                <button class="btn-icon-soft" onclick="deleteVideo(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;

    // Add play functionality (simple object URL approach for now, assuming recently uploaded or generic placeholder)
    // Note: In a real persistent app, we'd need the file handle. Here, if it's a fresh upload, we might have the blob. 
    // If it's a reload, we just show metadata. 

    return div;
}

function createLinkCard(link, index, type = 'new') {
    const div = document.createElement('div');
    div.className = 'analysis-card';

    // Determine delete action
    const deleteAction = type === 'new' ? `deleteLink(${index})` : `deleteLegacyLink(${index})`;
    const tagClass = type === 'new' ? 'tag-link' : 'tag-legacy'; // Optionally style legacy differently if needed

    div.innerHTML = `
        <div class="analysis-preview link-preview">
            <i class="fas fa-external-link-alt link-icon"></i>
        </div>
            <div class="analysis-content">
                <span class="analysis-tag ${tagClass}">${link.platform || 'Link'}</span>
                <h4 class="analysis-title">${link.title || link.url}</h4>
                <p class="analysis-meta" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${link.url}</p>
                ${link.description ? `<p class="analysis-desc" style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${link.description}</p>` : ''}
                <div class="analysis-actions">
                    <a href="${link.url}" target="_blank" class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem; text-decoration: none;">Open</a>
                    <button class="btn-icon-soft" onclick="${deleteAction}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
    `;
    return div;
}

function setupDragAndDrop(elementId, dropHandler) {
    const el = document.getElementById(elementId);
    if (!el) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        el.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        el.addEventListener(eventName, () => el.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        el.addEventListener(eventName, () => el.classList.remove('drag-over'), false);
    });

    el.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        dropHandler(files);
    });
}

function handleHighlightsDrop(files) {
    if (files.length > 0) {
        // Create synthetic event-like object for existing handler, or just call logic directly
        // We'll mimic the event structure to reuse handleHighlightsUpload if possible, 
        // or refactor handleHighlightsUpload to accept a file directly.
        // Let's refactor the handle*Upload functions slightly to be more flexible, or just call logic here.

        const file = files[0];
        if (!file.type.startsWith('video/')) {
            alert('Please upload a video file.');
            return;
        }

        processHighlightsFile(file);
    }
}

function handleVideoDrop(files) {
    if (files.length > 0) {
        const file = files[0];
        if (!file.type.startsWith('video/')) {
            alert('Please upload a video file.');
            return;
        }
        processMatchVideoFile(file);
    }
}

// Refactored to separate file processing from event handling
function processHighlightsFile(file) {
    const match = matchManager.getMatch(currentMatchId);
    match.highlights = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
    };
    matchManager.updateMatchInfo(currentMatchId, { highlights: match.highlights });
    renderHighlights(match);
}

function keyClipDrop(files) { } // Placeholder

function processMatchVideoFile(file) {
    const match = matchManager.getMatch(currentMatchId);
    if (!match.videos) match.videos = [];

    match.videos.push({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
    });

    matchManager.updateMatchInfo(currentMatchId, { videos: match.videos });
    renderMatchVideos(matchManager.getMatch(currentMatchId));
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown Date';
    return new Date(timestamp).toLocaleDateString();
}

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    processMatchVideoFile(file);
    // Reset input
    event.target.value = '';
}

function handleHighlightsUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    processHighlightsFile(file);
    event.target.value = '';
}

// --- Video Delete ---
function deleteVideo(index) {
    if (confirm('Delete this video?')) {
        const match = matchManager.getMatch(currentMatchId);
        match.videos.splice(index, 1);
        matchManager.updateMatchInfo(currentMatchId, { videos: match.videos });
        renderMatchVideos(match);
    }
}

function deleteLink(index) {
    if (confirm('Remove this link?')) {
        const match = matchManager.getMatch(currentMatchId);
        if (match.links) {
            match.links.splice(index, 1);
            matchManager.updateMatchInfo(currentMatchId, { links: match.links });
            renderExternalLinks(match);
        }
    }
}

function deleteLegacyLink(index) {
    if (confirm('Remove this legacy clip? This cannot be undone.')) {
        const match = matchManager.getMatch(currentMatchId);
        if (match.stats && match.stats.key_clips) {
            match.stats.key_clips.splice(index, 1);
            // We must update 'stats' via updateMatchStats
            matchManager.updateMatchStats(currentMatchId, { key_clips: match.stats.key_clips }).then(() => {
                // Legacy clips were part of grid, now separate?
                // Wait, 'key_clips' are handled in renderClips, so this function might be redundant or needs to call renderClips?
                // Looking at previous code, renderClips handles key_clips.
                // Re-reading legacy logic:
                renderClips(matchManager.getMatch(currentMatchId));
            });
        }
    }
}

// --- Link Modal Logic ---

function openLinkModal() {
    document.getElementById('linkModal').style.display = 'flex';
}

function closeLinkModal() {
    document.getElementById('linkModal').style.display = 'none';
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkTitle').value = '';
    document.getElementById('linkDescription').value = '';
}

function saveLink() {
    const url = document.getElementById('linkUrl').value;
    const platform = document.getElementById('linkPlatform').value;
    const title = document.getElementById('linkTitle').value;
    const description = document.getElementById('linkDescription').value;

    if (!url) return;

    const match = matchManager.getMatch(currentMatchId);
    if (!match.links) match.links = [];

    match.links.push({
        url: url,
        platform: platform,
        title: title || platform + " Link",
        description: description
    });

    matchManager.updateMatchInfo(currentMatchId, { links: match.links });

    closeLinkModal();
    renderExternalLinks(matchManager.getMatch(currentMatchId));
}

// --- Key Clips Logic ---

function renderClips(match) {
    const grid = document.getElementById('clipsGrid');
    const emptyState = document.getElementById('emptyClipsState');
    grid.innerHTML = '';

    const clips = (match.stats && match.stats.key_clips) ? match.stats.key_clips : [];

    if (clips.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    clips.forEach((clip, index) => {
        const div = document.createElement('div');
        div.className = 'analysis-card';
        div.innerHTML = `
            <div class="analysis-preview link-preview" style="background: var(--navy-dark);">
                <span style="color: white; font-weight: 800; font-size: 1.2rem;">${clip.time || '00\''}</span>
            </div>
            <div class="analysis-content">
                <span class="analysis-tag tag-link" style="background: #e0f2fe; color: #0284c7;">${clip.tag || 'Clip'}</span>
                <h4 class="analysis-title">${clip.description || 'Key Moment'}</h4>
                <div class="analysis-actions">
                    <button class="btn-icon-soft" onclick="deleteClip(${index})"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
        grid.appendChild(div);
    });
}

function openClipModal() {
    document.getElementById('clipModal').style.display = 'flex';
}

function closeClipModal() {
    document.getElementById('clipModal').style.display = 'none';
    document.getElementById('clipTime').value = '';
    document.getElementById('clipDesc').value = '';
    document.getElementById('clipTag').value = 'Goal';
}

function saveClip() {
    const time = document.getElementById('clipTime').value;
    const desc = document.getElementById('clipDesc').value;
    const tag = document.getElementById('clipTag').value;

    if (!time && !desc) return; // Basic validation

    const match = matchManager.getMatch(currentMatchId);
    if (!match.stats) match.stats = {};
    if (!match.stats.key_clips) match.stats.key_clips = [];

    match.stats.key_clips.push({
        time: time,
        description: desc,
        tag: tag,
        url: '#' // Legacy compat if needed, or just omit
    });

    matchManager.updateMatchStats(currentMatchId, { key_clips: match.stats.key_clips }).then(() => {
        renderClips(matchManager.getMatch(currentMatchId));
        closeClipModal();
    });
}

function deleteClip(index) {
    if (confirm('Delete this clip?')) {
        const match = matchManager.getMatch(currentMatchId);
        if (match.stats && match.stats.key_clips) {
            match.stats.key_clips.splice(index, 1);
            matchManager.updateMatchStats(currentMatchId, { key_clips: match.stats.key_clips }).then(() => {
                renderClips(matchManager.getMatch(currentMatchId));
            });
        }
    }
}
