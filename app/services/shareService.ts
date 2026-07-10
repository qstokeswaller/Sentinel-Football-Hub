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

/**
 * Player dossier share link scoped to a date range — appends ?from/&to so the public dossier
 * only includes reports within that season/range. Empty bounds = all-time.
 */
export async function copyPlayerDossierLink(playerId: string, existing: string | null, range?: { from?: string; to?: string }): Promise<string> {
  const token = await ensurePlayerShareToken(playerId, existing);
  let url = dossierUrl('player', token);
  const p = new URLSearchParams();
  if (range?.from) p.set('from', range.from);
  if (range?.to) p.set('to', range.to);
  const qs = p.toString();
  if (qs) url += `&${qs}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}

export async function ensureScoutShareToken(id: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('scouted_players').update({ share_token: token }).eq('id', id);
  if (error) throw error;
  return token;
}

/** Branded scout-report dossier link for a scouted player. */
export async function copyScoutShareLink(id: string, existing: string | null): Promise<string> {
  const token = await ensureScoutShareToken(id, existing);
  const url = `${window.location.origin}/dossier/scout?token=${token}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}

export async function ensureSessionReportShareToken(id: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('reports').update({ share_token: token }).eq('id', id);
  if (error) throw error;
  return token;
}

/** Branded public link for a training-session report (attendance, rating, notes). PDF lives on the page. */
export async function copySessionReportShareLink(id: string, existing: string | null): Promise<string> {
  const token = await ensureSessionReportShareToken(id, existing);
  const url = `${window.location.origin}/dossier/report?token=${token}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}
