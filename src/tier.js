// Central tier feature-flag module.
// All tier decisions go through here — never read settings.tier directly in page code.

const TIER_ORDER = ['free', 'basic', 'pro', 'elite'];

// Minimum tier required to access each feature.
// Keep in sync with tier-feature-plan.md — source of truth.
const FEATURE_MIN_TIER = {
  // ── Nav pages ──
  matches:           'free',
  squads:            'free',
  training:          'basic',   // Session Planner / Training Register
  library:           'basic',
  reports:           'basic',
  scouting:          'basic',
  analytics:         'pro',
  financials:        'elite',
  animated_builder:  'elite',   // Animated drill builder inside Session Planner

  // ── Match features ──
  match_stats:             'basic',   // Full stats events (cards, saves, etc.)
  match_reports:           'basic',   // Report tab inside match detail
  match_planning:          'pro',     // Planning tab + plan shortcuts on fixture cards
  player_watch:            'pro',     // Player Watch match type
  match_assessment_modal:  'pro',     // 4-pillar Assess button inside Stats tab
  media_tabs:              'pro',     // Media tab inside match/player/squad
  multi_video:             'elite',   // More than 1 video per match or player

  // ── Player profile features ──
  player_status:       'pro',    // Status column + indicator (Active/Injured/etc.)
  player_reports:      'basic',  // Reports tab (1 stored on Basic, unlimited on Elite)
  assessment_history:  'pro',    // Match Assessment history sub-tab (rolling 10 on Pro)
  radar_chart:         'pro',    // Radar / development history chart
  assessments:         'pro',    // Match assessments per player

  // ── Dashboard features ──
  quick_session:       'pro',    // Quick Session creation widget
  dashboard_shortcuts: 'pro',    // 4 shortcut cards above calendar
};

const TIER_LIMITS = {
  free: {
    squads:          5,
    players:         Infinity,
    admins:          2,
    staff:           20,
    seasons:         1,
    leagues_per_squad: 1,
    games_total:     40,
    games_per_squad: 30,
  },
  basic: {
    squads:          5,
    players:         Infinity,
    admins:          2,
    staff:           20,
    seasons:         1,
    leagues_per_squad: 3,
    games_total:     Infinity,
    games_per_squad: Infinity,
  },
  pro: {
    squads:          10,
    players:         Infinity,
    admins:          5,
    staff:           40,
    seasons:         2,
    leagues_per_squad: 5,
    games_total:     Infinity,
    games_per_squad: Infinity,
  },
  elite: {
    squads:          Infinity,
    players:         Infinity,
    admins:          10,
    staff:           Infinity,
    seasons:         Infinity,
    leagues_per_squad: Infinity,
    games_total:     Infinity,
    games_per_squad: Infinity,
  },
};

const TIER_LABELS = { free: 'Free', basic: 'Basic', pro: 'Pro', elite: 'Elite' };

// ── Tier resolution ──

export function getTier() {
  const settings = window._profile?.clubs?.settings;
  const raw = (settings?.tier || settings?.plan || 'free').toLowerCase();
  return TIER_ORDER.includes(raw) ? raw : 'free';
}

export function getTierLabel() {
  return TIER_LABELS[getTier()] ?? 'Free';
}

function _tierIndex(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx === -1 ? 0 : idx;
}

export function tierAtLeast(required) {
  return _tierIndex(getTier()) >= _tierIndex(required);
}

export function hasFeature(feature) {
  const min = FEATURE_MIN_TIER[feature];
  if (!min) return true;
  return tierAtLeast(min);
}

export function getLimit(key) {
  return TIER_LIMITS[getTier()]?.[key] ?? 0;
}

export function getRequiredTier(feature) {
  return FEATURE_MIN_TIER[feature] ?? 'pro';
}

// ── Toast helper ──

export function showUpgradeToast(requiredTier, featureLabel = 'this feature') {
  const label = TIER_LABELS[requiredTier] ?? 'Pro';
  if (window.showGlobalToast) {
    window.showGlobalToast(`Upgrade to ${label} to access ${featureLabel}`, 'info');
  }
}

// ── Upgrade card ──

export function renderUpgradeCard(container, { label = 'This Feature', description = '', requiredTier = 'pro' } = {}) {
  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier;
  container.innerHTML = `
    <div class="tier-upgrade-card">
      <div class="upgrade-icon"><i class="fas fa-lock"></i></div>
      <span class="upgrade-badge">${tierLabel} Feature</span>
      <h3>${label}</h3>
      ${description ? `<p>${description}</p>` : ''}
      <button class="dash-btn primary" onclick="window.location='/src/pages/settings.html#billing'">
        <i class="fas fa-arrow-right"></i> Upgrade to ${tierLabel}
      </button>
    </div>
  `;
}

// ── DOM gating ──

/**
 * Process data-tier-feature tab buttons and data-tier-gate content sections.
 *
 * Tab buttons:    <button class="tab-btn" data-tier-feature="assessments" data-tier-label="Assessments">
 * Content gates:  <div data-tier-gate="analytics" data-tier-label="Analytics" data-tier-description="...">
 */
export function applyTierGates() {
  // Lock tab buttons for unavailable features
  document.querySelectorAll('[data-tier-feature]').forEach(el => {
    const feature = el.dataset.tierFeature;
    const label = el.dataset.tierLabel || feature;
    if (hasFeature(feature)) return;
    const required = getRequiredTier(feature);
    el.classList.add('tier-locked');
    el.setAttribute('aria-disabled', 'true');
    el.title = `Upgrade to ${TIER_LABELS[required]} to access ${label}`;
    if (!el.querySelector('.tab-tier-badge')) {
      el.insertAdjacentHTML('beforeend', ` <span class="tab-tier-badge">${TIER_LABELS[required]}</span>`);
    }
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      showUpgradeToast(required, label);
    }, { capture: true });
  });

  // Replace locked content sections with upgrade cards
  document.querySelectorAll('[data-tier-gate]').forEach(el => {
    const feature = el.dataset.tierGate;
    if (hasFeature(feature)) return;
    const required = getRequiredTier(feature);
    renderUpgradeCard(el, {
      label: el.dataset.tierLabel || feature,
      description: el.dataset.tierDescription || '',
      requiredTier: required,
    });
  });
}

// ── Sidebar tier badge ──

export function injectSidebarTierBadge(profile) {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || document.getElementById('sidebarTierBadge')) return;
  const settings = profile?.clubs?.settings;
  const raw = (settings?.tier || settings?.plan || 'free').toLowerCase();
  const tier = ['free', 'basic', 'pro', 'elite'].includes(raw) ? raw : 'free';
  const badge = document.createElement('div');
  badge.id = 'sidebarTierBadge';
  badge.className = `tier-badge-sidebar ${tier}`;
  badge.innerHTML = `<span>${TIER_LABELS[tier]} Plan</span>`;
  // Insert before the user-info link so it sits at the top of the footer
  const userInfo = footer.querySelector('.sidebar-user-info');
  userInfo ? footer.insertBefore(badge, userInfo) : footer.prepend(badge);
}
