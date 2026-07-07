import { supabase } from '../lib/supabase';

/** Player media arrays (highlights / analysis_videos / gallery_photos jsonb). */
export type MediaColumn = 'highlights' | 'analysis_videos' | 'gallery_photos';

export async function savePlayerMediaArray(playerId: string, column: MediaColumn, array: any[]): Promise<void> {
  const { error } = await supabase.from('players').update({ [column]: array }).eq('id', playerId);
  if (error) throw error;
}
