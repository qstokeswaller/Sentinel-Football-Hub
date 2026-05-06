/**
 * R2 video upload helper.
 * All video files go to Cloudflare R2 via the get-upload-url edge function.
 * Images / photos stay on Supabase Storage (avatars bucket) — handled separately.
 */

const FUNCTIONS_URL = 'https://ocfycodijzcwupafrpzv.supabase.co/functions/v1';

/**
 * Upload a video file to R2 via presigned URL.
 * @param {File} file
 * @param {'match'|'player_highlight'|'player_analysis'|'drill'} category
 * @param {string|null} linkedId - matchId or playerId depending on category
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>} publicUrl
 */
export async function uploadToR2(file, category, linkedId, onProgress) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    onProgress?.(10);

    const resp = await fetch(`${FUNCTIONS_URL}/get-upload-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'video/mp4',
            category,
            linkedId: linkedId || null,
        }),
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get R2 upload URL');
    }

    const { uploadUrl, publicUrl } = await resp.json();
    if (!uploadUrl) throw new Error('No upload URL returned from edge function');

    onProgress?.(30);

    const uploadResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file,
    });

    if (!uploadResp.ok) throw new Error(`R2 upload failed (${uploadResp.status})`);

    onProgress?.(100);

    if (!publicUrl) {
        // R2_PUBLIC_DOMAIN not configured — upload succeeded but no playback URL
        throw new Error('Video uploaded to R2 but R2_PUBLIC_DOMAIN is not configured. Set this env var on the get-upload-url edge function.');
    }

    return publicUrl;
}

/**
 * Returns true if a URL points to a stored video file (R2 or direct file link)
 * as opposed to an external link (YouTube, Vimeo etc.)
 */
export function isStoredVideo(url) {
    if (!url) return false;
    return /\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i.test(url) ||
           url.includes('.r2.dev') ||
           url.includes('r2.cloudflarestorage.com');
}
