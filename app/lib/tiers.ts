/**
 * Tier feature-flag module — pure helpers (ported from src/tier.js).
 * All tier decisions go through here. Reactive wrapper: hooks/useTier.
 */
import type { Profile } from '../services/databaseService';

export type Tier = 'free' | 'basic' | 'pro' | 'elite';

export const TIER_ORDER: Tier[] = ['free', 'basic', 'pro', 'elite'];

/** Minimum tier required to access each feature. Keep in sync with tier-feature-plan.md. */
export const FEATURE_MIN_TIER: Record<string, Tier> = {
  // Nav pages
  matches: 'free',
  squads: 'free',
  training: 'basic',
  library: 'basic',
  reports: 'basic',
  scouting: 'basic',
  analytics: 'pro',
  financials: 'elite',
  animated_builder: 'elite',
  // Match features
  match_stats: 'basic',
  match_reports: 'basic',
  match_planning: 'pro',
  player_watch: 'pro',
  match_assessment_modal: 'pro',
  media_tabs: 'pro',
  multi_video: 'elite',
  // Player profile features
  player_status: 'pro',
  player_reports: 'basic',
  assessment_history: 'pro',
  radar_chart: 'pro',
  assessments: 'pro',
  // Dashboard features
  quick_session: 'pro',
  dashboard_shortcuts: 'pro',
};

export const TIER_LIMITS: Record<Tier, Record<string, number>> = {
  free:  { squads: 5,        players: Infinity, admins: 2,  staff: 20,       seasons: 1,        leagues_per_squad: 1, games_total: 40,       games_per_squad: 30 },
  basic: { squads: 5,        players: Infinity, admins: 2,  staff: 20,       seasons: 1,        leagues_per_squad: 3, games_total: Infinity, games_per_squad: Infinity },
  pro:   { squads: 10,       players: Infinity, admins: 5,  staff: 40,       seasons: 2,        leagues_per_squad: 5, games_total: Infinity, games_per_squad: Infinity },
  elite: { squads: Infinity, players: Infinity, admins: 10, staff: Infinity, seasons: Infinity, leagues_per_squad: Infinity, games_total: Infinity, games_per_squad: Infinity },
};

export const TIER_LABELS: Record<Tier, string> = { free: 'Free', basic: 'Basic', pro: 'Pro', elite: 'Elite' };

/**
 * Resolve the effective tier from a profile. A platform admin gets elite on their own
 * Dev Workspace (so they can test every feature). But while "viewing as" a real club
 * (impersonation), reflect THAT club's real tier — so the dev sees exactly what the
 * club's users see, with higher-tier features hidden when the club doesn't have them.
 */
export function getTier(profile?: Profile | null): Tier {
  if (profile?.role === 'super_admin' && !profile?._impersonating) return 'elite';
  const settings = profile?.clubs?.settings;
  const raw = (settings?.tier || settings?.plan || 'free').toLowerCase();
  return (TIER_ORDER as string[]).includes(raw) ? (raw as Tier) : 'free';
}

export function tierIndex(tier: Tier): number {
  const idx = TIER_ORDER.indexOf(tier);
  return idx === -1 ? 0 : idx;
}

export function tierAtLeast(current: Tier, required: Tier): boolean {
  return tierIndex(current) >= tierIndex(required);
}

export function hasFeature(current: Tier, feature: string): boolean {
  const min = FEATURE_MIN_TIER[feature];
  if (!min) return true;
  return tierAtLeast(current, min);
}

export function getLimit(current: Tier, key: string): number {
  return TIER_LIMITS[current]?.[key] ?? 0;
}

export function getRequiredTier(feature: string): Tier {
  return FEATURE_MIN_TIER[feature] ?? 'pro';
}
