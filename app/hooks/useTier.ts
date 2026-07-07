import { useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import {
  tierAtLeast, hasFeature, getLimit, getRequiredTier, TIER_LABELS, type Tier,
} from '../lib/tiers';

/**
 * Reactive tier gating. Reads the effective tier from AppStateContext (which
 * already resolves super_admin ⇒ elite and impersonated-club tier).
 */
export function useTier() {
  const { tier } = useAppState();
  return useMemo(() => ({
    tier,
    tierLabel: TIER_LABELS[tier],
    tierAtLeast: (required: Tier) => tierAtLeast(tier, required),
    hasFeature: (feature: string) => hasFeature(tier, feature),
    getLimit: (key: string) => getLimit(tier, key),
    getRequiredTier: (feature: string) => getRequiredTier(feature),
  }), [tier]);
}
