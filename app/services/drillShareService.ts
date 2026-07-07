import { supabase } from '../lib/supabase';

/**
 * Public per-drill share. The SECURITY DEFINER `get_shared_drill` RPC returns a
 * read-only, token-gated snapshot (drill meta + drawing + linked animation +
 * sharing-club branding) — no auth, no cross-club leakage. Mirrors the session share.
 * Static drills render an image; animated drills render a playable animation.
 */
export async function fetchSharedDrill(token: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_shared_drill', { p_token: token });
  if (error) throw error;
  return data; // { drill, club, animation }
}

export async function ensureDrillShareToken(drillId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  // Reuse a token already on the row so re-sharing never invalidates old links.
  const { data } = await supabase.from('drills').select('share_token').eq('id', drillId).maybeSingle();
  if (data?.share_token) return data.share_token;
  const token = crypto.randomUUID();
  const { error } = await supabase.from('drills').update({ share_token: token }).eq('id', drillId);
  if (error) throw error;
  return token;
}

export function drillShareUrl(token: string): string {
  return `${window.location.origin}/dossier/drill?token=${token}`;
}

/** Ensure token, build URL, copy to clipboard (with a non-clipboard fallback). */
export async function copyDrillShareLink(drillId: string, existing: string | null): Promise<string> {
  const token = await ensureDrillShareToken(drillId, existing);
  const url = drillShareUrl(token);
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets url */ }
  return url;
}
