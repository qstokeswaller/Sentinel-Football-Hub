import { supabase } from '../lib/supabase';

/**
 * Dossier share links. Ensures a share_token exists on the player/squad, then
 * builds the PUBLIC React dossier URL (/dossier/...). Replaces the vanilla
 * /player-dossier.html?token= links.
 */
export function dossierUrl(kind: 'player' | 'squad', token: string): string {
  return `${window.location.origin}/dossier/${kind}?token=${token}`;
}

export async function ensurePlayerShareToken(playerId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('players').update({ share_token: token }).eq('id', playerId);
  if (error) throw error;
  return token;
}

export async function ensureSquadShareToken(squadId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('squads').update({ share_token: token }).eq('id', squadId);
  if (error) throw error;
  return token;
}

/** Ensure token, build URL, copy to clipboard (with a non-clipboard fallback). */
export async function copyDossierLink(kind: 'player' | 'squad', id: string, existing: string | null): Promise<string> {
  const token = kind === 'player' ? await ensurePlayerShareToken(id, existing) : await ensureSquadShareToken(id, existing);
  const url = dossierUrl(kind, token);
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}
