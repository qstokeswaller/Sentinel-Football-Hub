import { supabase } from '../lib/supabase';

/**
 * Public session share. The SECURITY DEFINER `get_shared_session` RPC returns a
 * read-only, token-gated snapshot (session meta + drills + linked animations +
 * sharing-club branding) — no auth, no cross-club leakage. Mirrors the dossier flow.
 */
export async function fetchSharedSession(token: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_shared_session', { p_token: token });
  if (error) throw error;
  return data; // { session, club, drills, animations }
}

export async function ensureSessionShareToken(sessionId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  // Reuse a token already on the row so re-sharing never invalidates old links.
  const { data } = await supabase.from('sessions').select('share_token').eq('id', sessionId).maybeSingle();
  if (data?.share_token) return data.share_token;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('sessions').update({ share_token: token }).eq('id', sessionId);
  if (error) throw error;
  return token;
}

export function sessionShareUrl(token: string): string {
  return `${window.location.origin}/dossier/session?token=${token}`;
}

/** Ensure token, build URL, copy to clipboard (with a non-clipboard fallback). */
export async function copySessionShareLink(sessionId: string, existing: string | null): Promise<string> {
  const token = await ensureSessionShareToken(sessionId, existing);
  const url = sessionShareUrl(token);
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets url */ }
  return url;
}
