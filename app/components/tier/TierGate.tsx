import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { useTier } from '../../hooks/useTier';
import { TIER_LABELS, type Tier } from '../../lib/tiers';

interface TierGateProps {
  /** Gate by named feature (preferred) … */
  feature?: string;
  /** … or by a minimum tier directly. */
  min?: Tier;
  label?: string;
  description?: string;
  /** 'card' (default) shows an upgrade card; 'hide' renders nothing. */
  mode?: 'card' | 'hide';
  children: React.ReactNode;
}

const UpgradeCard: React.FC<{ requiredTier: Tier; label?: string; description?: string }> = ({ requiredTier, label = 'This Feature', description }) => {
  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-8 text-center max-w-md mx-auto">
      <div className="mx-auto w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center mb-4">
        <Lock size={20} />
      </div>
      <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-brand mb-2">{tierLabel} Feature</span>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{label}</h3>
      {description && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      <a
        href="/settings#billing"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors"
      >
        Upgrade to {tierLabel} <ArrowRight size={15} />
      </a>
    </div>
  );
};

/** Tier/feature render gate — the React form of tier.js's data-tier-gate. */
export const TierGate: React.FC<TierGateProps> = ({ feature, min, label, description, mode = 'card', children }) => {
  const { hasFeature, tierAtLeast, getRequiredTier } = useTier();
  const allowed = feature ? hasFeature(feature) : min ? tierAtLeast(min) : true;

  if (allowed) return <>{children}</>;
  if (mode === 'hide') return null;

  const required = feature ? getRequiredTier(feature) : (min ?? 'pro');
  return <UpgradeCard requiredTier={required} label={label} description={description} />;
};
