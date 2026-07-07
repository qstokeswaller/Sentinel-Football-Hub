import { supabase } from '../lib/supabase';

/**
 * Public dossier data — ported from src/pages/player-dossier.html /
 * squad-dossier.html. Reached via a share token (UUID); the SECURITY DEFINER RPC
 * returns a read-only snapshot for valid tokens. No auth required.
 */
export async function fetchPlayerDossier(token: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_player_dossier', { p_token: token });
  if (error) throw error;
  return data; // { player, squad, club, match_stats, latest_assessment }
}

export async function fetchSquadDossier(token: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_squad_dossier', { p_token: token });
  if (error) throw error;
  return data; // { squad, club, players }
}

/** A single player's dossier scoped to a squad's public token (no per-player token needed). */
export async function fetchSquadPlayerDossier(squadToken: string, playerId: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_squad_player_dossier', { p_squad_token: squadToken, p_player_id: playerId });
  if (error) throw error;
  return data; // { player, stats, season_matches, assessments, media }
}
