import { supabase } from '../lib/supabase';

/**
 * Supabase Storage helpers (avatars bucket). Player/club photos go here (R2 is
 * only for video, via the get-upload-url edge function). Ported from
 * squad-players-ui.js photo upload.
 */
export async function uploadAvatar(file: File, prefix = 'players'): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filePath = `${prefix}/new_${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('avatars').upload(filePath, file, {
    cacheControl: '3600', upsert: true, contentType: file.type,
  });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path);
  return publicUrl;
}
