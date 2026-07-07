import { supabase } from '../lib/supabase';

/**
 * R2 video upload — ported from src/js/r2-upload.js. Videos go to Cloudflare R2
 * via the get-upload-url edge function (presigned PUT). External links
 * (YouTube/Vimeo/direct) don't need this — they're saved as-is.
 */
const FUNCTIONS_URL = 'https://ocfycodijzcwupafrpzv.supabase.co/functions/v1';
export type VideoCategory = 'match' | 'player_highlight' | 'player_analysis' | 'drill';

export async function uploadVideoToR2(file: File, category: VideoCategory, linkedId: string | null, onProgress?: (pct: number) => void): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  onProgress?.(10);

  const resp = await fetch(`${FUNCTIONS_URL}/get-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'video/mp4', category, linkedId: linkedId || null }),
  });
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || 'Failed to get R2 upload URL'); }

  const { uploadUrl, publicUrl } = await resp.json();
  if (!uploadUrl) throw new Error('No upload URL returned from edge function');
  onProgress?.(30);

  const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
  if (!up.ok) throw new Error(`R2 upload failed (${up.status})`);
  onProgress?.(100);

  if (!publicUrl) throw new Error('Video uploaded to R2 but R2_PUBLIC_DOMAIN is not configured on the edge function.');
  return publicUrl;
}
