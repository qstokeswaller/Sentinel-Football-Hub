/**
 * Session Share Page — public, no auth required
 * Renders a read-only view of a shared session with drills (static + animated).
 */
import supabase from '../supabase.js';

async function init() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
        showError('No share token provided. Check the link and try again.');
        return;
    }

    try {
        const { data, error } = await supabase.rpc('get_shared_session', { p_token: token });

        if (error) throw error;
        if (!data || !data.session) {
            showError('Session not found or this share link has been revoked.');
            return;
        }

        renderSession(data.session, data.drills || [], data.animations || []);
    } catch (e) {
        console.error('Share page error:', e);
        showError('Failed to load session. Please try again later.');
    }
}

function renderSession(session, drills, animations) {
    document.getElementById('shareLoading').style.display = 'none';
    document.getElementById('shareContent').style.display = '';

    // Update page title
    document.title = (session.title || 'Session Plan') + ' | Sentinel Football Hub';

    // Header
    const date = session.date
        ? new Date(session.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : '';

    document.getElementById('shareHeader').innerHTML = `
        <h1>${esc(session.title || 'Untitled Session')}</h1>
        <div class="share-meta">
            ${date ? `<span class="share-meta-item"><i class="fas fa-calendar-alt"></i> ${date}</span>` : ''}
            ${session.start_time ? `<span class="share-meta-item"><i class="fas fa-clock"></i> ${esc(session.start_time)}</span>` : ''}
            ${session.team ? `<span class="share-meta-item"><i class="fas fa-users"></i> ${esc(session.team)}</span>` : ''}
            ${session.author ? `<span class="share-meta-item"><i class="fas fa-user"></i> ${esc(session.author)}</span>` : ''}
        </div>
        ${session.venue || session.duration || session.equipment || session.purpose ? `
        <div class="share-details">
            ${session.venue ? `<div class="share-detail"><label>Venue</label><span>${esc(session.venue)}</span></div>` : ''}
            ${session.duration ? `<div class="share-detail"><label>Duration</label><span>${esc(session.duration)} min</span></div>` : ''}
            ${session.ability_level ? `<div class="share-detail"><label>Level</label><span>${esc(session.ability_level)}</span></div>` : ''}
            ${session.equipment ? `<div class="share-detail"><label>Equipment</label><span>${esc(session.equipment)}</span></div>` : ''}
            ${session.purpose ? `<div class="share-detail full"><label>Objectives</label><span>${esc(session.purpose)}</span></div>` : ''}
        </div>
        ` : ''}
    `;

    // Build animation lookup
    const animMap = new Map((animations || []).map(a => [a.id, a]));

    // Drills
    const sortedDrills = drills.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    document.getElementById('shareBody').innerHTML = sortedDrills.map((drill, i) => {
        const anim = drill.animation_id ? animMap.get(drill.animation_id) : null;
        const mediaHtml = anim
            ? renderAnimationMedia(anim)
            : (drill.image && (drill.image.startsWith('data:image/') || isSafeUrl(drill.image))
                ? `<img src="${esc(drill.image)}" class="share-drill-img" alt="${esc(drill.title)}">`
                : '');

        const descHtml = renderDescription(drill.description);
        const isSection = drill.category === 'Section';
        const badge = isSection ? 'Section' : 'Drill';
        const badgeClass = isSection ? 'section' : (anim ? 'animated' : 'static');

        return `
            <div class="share-drill-block">
                <div class="share-drill-header">
                    ${!isSection ? `<span class="share-drill-num">#${i + 1}</span>` : ''}
                    <span class="share-drill-badge ${badgeClass}">${badge}${anim ? ' (Animated)' : ''}</span>
                    <h3>${esc(drill.title || 'Untitled')}</h3>
                </div>
                ${mediaHtml}
                ${descHtml}
            </div>
        `;
    }).join('');
}

function isSafeUrl(url) {
    try { const u = new URL(url, window.location.origin); return u.protocol === 'https:' || u.protocol === 'http:'; }
    catch { return false; }
}

function renderAnimationMedia(anim) {
    // Prefer video_url if available (uploaded or linked video)
    if (anim.video_url) {
        const url = anim.video_url;
        if (!isSafeUrl(url)) return '<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Invalid video URL</p></div>';
        const safeUrl = esc(url);
        // YouTube
        const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
            return `<div class="share-drill-media"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen class="share-video-embed"></iframe></div>`;
        }
        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
            return `<div class="share-drill-media"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allowfullscreen class="share-video-embed"></iframe></div>`;
        }
        // Direct video
        if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
            return `<div class="share-drill-media"><video src="${safeUrl}" controls class="share-video-embed"></video></div>`;
        }
        // Fallback link
        return `<div class="share-drill-media"><a href="${safeUrl}" target="_blank" rel="noopener" class="share-video-link"><i class="fas fa-play-circle"></i> View Animation Video</a></div>`;
    }
    // Fallback to thumbnail (base64 data URIs or https URLs)
    if (anim.thumbnail) {
        const thumb = anim.thumbnail;
        const safeSrc = thumb.startsWith('data:image/') || isSafeUrl(thumb) ? thumb : '';
        if (!safeSrc) return '<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Animation — no preview available</p></div>';
        return `<img src="${esc(safeSrc)}" class="share-drill-img" alt="Animation preview">`;
    }
    return '<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Animation — no preview available</p></div>';
}

/** Strip all HTML tags except safe formatting ones from RTE */
function sanitizeHtml(html) {
    const safe = /^(b|i|u|strong|em|br|p|ul|ol|li|h[1-6]|span|div|a|blockquote)$/i;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Remove script/style/iframe elements entirely
    tmp.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,select,button').forEach(el => el.remove());
    // Strip event handlers and dangerous attributes from all elements
    tmp.querySelectorAll('*').forEach(el => {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || name === 'srcdoc' || (name === 'href' && !isSafeUrl(attr.value) && attr.value !== '#')) {
                el.removeAttribute(attr.name);
            }
        }
    });
    return tmp.innerHTML;
}

function renderDescription(desc) {
    if (!desc) return '';
    try {
        const sections = typeof desc === 'string' ? JSON.parse(desc) : desc;
        if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
            const keys = ['overview', 'setup', 'function', 'progressions', 'coaching'];
            const labels = { overview: 'Overview', setup: 'Setup', 'function': 'How It Works', progressions: 'Progressions', coaching: 'Coaching Points' };
            const html = keys
                .filter(k => sections[k] && sections[k].trim() && sections[k].trim() !== '<br>')
                .map(k => `
                    <div class="share-section">
                        <h4>${labels[k]}</h4>
                        <div class="share-section-content">${sanitizeHtml(sections[k])}</div>
                    </div>
                `).join('');
            if (html) return html;
        }
    } catch (e) { /* not JSON, render as raw */ }
    return `<div class="share-section"><div class="share-section-content">${sanitizeHtml(String(desc))}</div></div>`;
}

function showError(msg) {
    document.getElementById('shareLoading').style.display = 'none';
    document.getElementById('shareError').style.display = '';
    document.getElementById('shareErrorMsg').textContent = msg;
}

function esc(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
}

init();
