# Sentinel Football Hub — Multi-Club SaaS Platform Plan

> **Date**: 2026-03-15
> **Status**: Planning — to be implemented step by step
> **First clubs**: Tuks FC (academy archetype) + Orion Football Program (private coaching archetype)

---

## Table of Contents

1. [Context & Goals](#context--goals)
2. [Industry Comparison](#industry-comparison)
3. [Current State (What's Already Built)](#current-state)
4. [Architecture: Single DB Multi-Tenancy](#architecture)
5. [The Missing Layer: Platform vs Club](#platform-vs-club)
6. [Roadmap & Phases](#roadmap)
   - Phase 1: Platform Foundation
   - Phase 2: Onboarding & Trial
   - Phase 3: Payments & Billing
   - Phase 4: Platform Admin Dashboard
   - Phase 5: Scale & Polish
7. [Platform Admin Panel — Deep Dive](#platform-admin-panel)
8. [Club Onboarding Flow — Deep Dive](#club-onboarding-flow)
9. [Billing & Payment Integration — Deep Dive](#billing--payment-integration)
10. [SA Payment Providers (Paystack vs Stripe)](#sa-payment-providers)
11. [Per-Club Frontend Customization (5 Levels)](#per-club-customization)
12. [Deep Functional Differences Per Club](#deep-functional-differences)
13. [Developer-Managed vs Self-Service Configuration](#developer-managed-model)
14. [Implementation Timeline & Effort](#implementation-timeline)
15. [Key Decision Points](#key-decision-points)
16. [Things You Might Not Have Considered](#things-to-consider)

---

## Context & Goals

Sentinel Football Hub was built for Tuks FC but needs to become a platform where any club can sign up and get their own isolated ecosystem. Two existing projects need to be combined as the first clubs:

- **Tuks FC** (Football-Hub-v4) — academy archetype with squads, players, match planning, assessments
- **Orion Football Program** — private coaching archetype with individual clients, 1-on-1 sessions

The goal: one codebase, one deployment, one database — where each club gets a completely different experience driven by configuration.

---

## Industry Comparison

| Platform | Model | Tenancy | Notes |
|----------|-------|---------|-------|
| **Hudl** | Single platform, multi-tenant | One DB, team-scoped data | Clubs sign up, get isolated workspace. Hudl staff have a separate internal admin panel |
| **Catapult/Playertek** | Single platform | One DB with org-level isolation | GPS/video data scoped per org. Enterprise clients get custom feature sets via feature flags |
| **Teamworks** | Single platform | One DB, org-scoped | Each college/club is an "organization". Platform admins are Teamworks staff, not club staff |
| **CoachPad / TacticalPad** | Single platform | One DB | Each coach/club gets their own workspace. No cross-club visibility |
| **Notion / Slack / Linear** | Single platform | One DB, workspace-scoped | Perfect analogy — each "workspace" = your "club" |

**Key takeaway**: Every successful SaaS uses **one database, one codebase, one deployment** with tenant isolation via the data layer. Nobody creates a new Supabase project per customer.

---

## Current State

The architecture is **already multi-tenant**. The foundation is solid:

- Every table has `club_id` foreign key
- RLS policies enforce isolation via `get_my_club_id()`
- Storage buckets use `{club_id}/` prefixing
- R2 video keys include `{club_id}/`
- Users belong to exactly one club via `profiles.club_id`
- `clubs.settings` JSONB column exists (ready for feature flags)
- Working invite system
- Deployed on AWS Amplify with CI/CD from GitHub
- Role-based access control (admin, coach, viewer)

**What's missing**: the **platform layer** above the clubs.

---

## Architecture

### One Supabase Project, One DB (RECOMMENDED)

```
One Supabase project
+-- clubs table (each row = one customer)
+-- All data scoped by club_id + RLS
+-- One R2 bucket with {club_id}/ prefixes
+-- One deployment on Amplify/Vercel
```

**Pros:**
- Already have this architecture
- One codebase, one deployment, one bill
- Easy to query across clubs (for platform metrics)
- Schema changes apply to all clubs instantly
- Simple ops — one thing to monitor, back up, scale

**Do NOT** create separate Supabase projects per club — this is an operational nightmare (50 bills, 50 sets of env vars, can't query across clubs, schema changes applied 50x manually).

---

## Platform vs Club

Current role hierarchy:
```
super_admin -> admin -> coach -> viewer
```

The problem: `super_admin` is a role inside a club. What's needed is a **platform operator** role that sits ABOVE all clubs:

```
PLATFORM LEVEL (developers/operators)
+-- Platform Admin dashboard (separate from club dashboards)
+-- Can see ALL clubs, ALL users, ALL metrics
+-- Can create/delete clubs
+-- Can impersonate club admins for support
+-- Manages billing, subscriptions, feature flags
+-- Configures each club's archetype, modules, templates
|
CLUB LEVEL (each customer)
+-- Club Admin (highest role within a club)
+-- Coach (squad-scoped)
+-- Viewer (read-only)
```

**Implementation**: Platform admins have `club_id = NULL` and `role = 'super_admin'` — they float above all clubs.

```sql
-- Allow super_admin profiles to have NULL club_id
ALTER TABLE profiles ALTER COLUMN club_id DROP NOT NULL;
```

---

## Roadmap

### Phase 1: Platform Foundation (1-2 weeks)

**Goal**: Separate platform operators from club admins, enable managing multiple clubs.

| Task | Effort | What It Involves |
|------|--------|------------------|
| Make `super_admin` platform-level | Small | ALTER profiles to allow NULL club_id, update RLS helper functions, update rbac.js |
| Platform admin page (basic) | Medium | New HTML page with clubs list, user counts, create club form |
| Create club Edge Function | Medium | `create-club.ts` — creates club + admin user + sends welcome email |
| Club branding from settings | Small | Read `clubs.settings.branding` in page-init.js, set CSS variables |
| Feature flags from settings | Small | Read `clubs.settings.features`, hide disabled nav items and buttons |

**After Phase 1**: You can create new clubs from a platform admin page, each club gets their own isolated workspace with basic customization.

### Phase 2: Onboarding & Trial (1-2 weeks)

**Goal**: New clubs can sign up themselves, get a 14-day trial, and start using the platform.

| Task | Effort | What It Involves |
|------|--------|------------------|
| Public signup/landing page | Medium | New page (no auth) — club name, admin email, create account |
| Subscription table + migration | Small | SQL migration to add `subscriptions` table |
| Trial logic | Small | Check trial_ends_at, show warnings, enforce read-only on expiry |
| Welcome email template | Small | Branded email via Supabase or Resend |
| Guided setup wizard | Medium | First-login flow: create squads / invite coaches / done |
| Limit enforcement | Medium | Check max_players, max_squads, max_storage before allowing actions |

**After Phase 2**: A new club can sign up and start using the platform within 5 minutes. They get 14 days free, then need to pay.

### Phase 3: Payments & Billing (2-3 weeks)

**Goal**: Clubs can pay for subscriptions. Revenue generation begins.

| Task | Effort | What It Involves |
|------|--------|------------------|
| Paystack account setup | Small | Register, verify, get API keys |
| Create Paystack plans | Small | Set up Pro Monthly, Pro Annual pricing |
| Checkout Edge Function | Medium | `create-checkout.ts` — initiates Paystack payment |
| Webhook Edge Function | Medium | `paystack-webhook.ts` — handles payment events, updates subscription status |
| Billing section in settings | Medium | Current plan, upgrade button, usage stats, manage payment link |
| Invoice/receipt handling | Small | Paystack handles this — just link to their portal |
| Grace period logic | Small | When payment fails: warning / 7 day grace / read-only |

**After Phase 3**: Clubs pay R499/mo, payments are in ZAR to SA bank account.

### Phase 4: Platform Admin Dashboard (1-2 weeks)

**Goal**: Professional management of all clubs from one place.

| Task | Effort | What It Involves |
|------|--------|------------------|
| Platform dashboard metrics | Medium | Total clubs, users, MRR, growth charts |
| Club detail view | Medium | Click into any club — see users, storage, activity, subscription |
| Impersonation | Medium | "View as admin" button, session override, exit banner |
| Activity/audit log | Medium | New `audit_log` table, log key actions |
| Platform settings page | Small | Default trial duration, default features, maintenance mode |

### Phase 5: Scale & Polish (Ongoing)

| Task | Effort | When |
|------|--------|------|
| Mobile app (Capacitor wrap) | Large | When you have 10+ clubs |
| White-label domains | Medium | When enterprise clients ask |
| Custom fields per club | Medium | When clubs request it |
| API access for integrations | Large | When enterprise clients need it |
| Data export / POPIA compliance | Medium | Before 20+ clubs |
| Notifications (email alerts) | Medium | When coaches request it |

### Suggested Order of Work

```
NOW (current sessions)
+-- Deploy the invite/signup/RBAC fixes we just built
+-- Test with Sidwell's fixed account
|
NEXT (Phase 1 -- foundation)
+-- Platform admin separation
+-- Basic platform admin page
+-- Create-club Edge Function
+-- Branding + feature flags
|
THEN (Phase 2 -- onboarding)
+-- Public signup page
+-- Subscription table
+-- Trial logic + limits
|
THEN (Phase 3 -- revenue)
+-- Paystack integration
+-- Billing UI
|
ONGOING (Phase 4-5)
+-- Platform admin dashboard polish
+-- Scale features as needed
```

---

## Platform Admin Panel

A separate section of the app that only platform operators (developers) can access. Club admins never see it.

### Main Dashboard Layout

```
+----------------------------------------------------------+
|  Sentinel Platform Admin                                  |
+----------------------------------------------------------+
|                                                           |
|  +----------+ +----------+ +----------+ +----------+     |
|  | 12 Clubs | | 847      | | 52       | | R24,450  |     |
|  | Active   | | Users    | | Coaches  | | MRR      |     |
|  +----------+ +----------+ +----------+ +----------+     |
|                                                           |
|  +- All Clubs ----------------------------------------+   |
|  | Club Name      | Plan   | Users | Storage | Status |   |
|  |----------------|--------|-------|---------|--------|   |
|  | UP Tuks FC     | Pro    | 14    | 12.4 GB | Active |   |
|  | Orion Football | Pro    | 3     | 0.2 GB  | Active |   |
|  | Chiefs Academy | Trial  | 8     | 5.1 GB  | Active |   |
|  +----------------------------------------------------+   |
|                                                           |
|  [+ Create Club]  [Export Data]  [Platform Settings]      |
+----------------------------------------------------------+
```

### Club Detail View (click into a club)
- All users in that club with roles
- Subscription status & billing history
- Storage usage breakdown
- Activity log (last login, sessions created, matches logged)
- Feature flags toggle (enable/disable features per club)
- **Archetype & module configuration** (set by developers)
- **Assessment template editor** (set by developers)
- "Login as Admin" button (impersonation for support)
- "Suspend Club" / "Delete Club" actions

### Access Control
```js
// Platform admins have role = 'super_admin' AND club_id = NULL
const isPlatformAdmin = profile.role === 'super_admin' && !profile.club_id;
```

### Impersonation (for support)
```js
// Platform admin clicks "View as Club Admin" on a club
sessionStorage.setItem('impersonating_club_id', clubId);
// All queries use this override instead of profile.club_id
// A banner shows: "Viewing as: Tuks FC Admin [Exit]"
```

---

## Club Onboarding Flow

### Option A: Self-Service (for scale)

1. Landing page — "Start your 14-day free trial"
2. Backend Edge Function creates: club row + auth user + profile + subscription
3. Admin receives welcome email with password setup link
4. Admin sets password, lands in dashboard, gets guided setup wizard

### Option B: Manual (developers create clubs via Platform Admin)

1. Developer clicks "Create Club" in platform admin
2. Enter club name + admin email + archetype selection
3. Developer configures modules, templates, features for this club
4. System creates everything, admin gets invite email

### Edge Function: `create-club`

```typescript
Deno.serve(async (req) => {
    const { clubName, adminEmail, adminName } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Create club with archetype-specific default settings
    const { data: club } = await supabase
        .from('clubs')
        .insert({
            name: clubName,
            settings: {
                archetype: 'academy', // or 'private_coaching'
                features: { /* default feature set */ },
                limits: { max_squads: 2, max_players: 50, max_storage_gb: 1 }
            }
        })
        .select().single();

    // 2. Create auth user
    const { data: authUser } = await supabase.auth.admin.createUser({
        email: adminEmail,
        email_confirm: true,
        user_metadata: { full_name: adminName, club_id: club.id, role: 'admin' }
    });

    // 3. Create subscription
    await supabase.from('subscriptions').insert({
        club_id: club.id, plan: 'trial', status: 'active',
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString()
    });

    // 4. Generate password reset link + send welcome email
    const { data: resetData } = await supabase.auth.admin
        .generateLink({ type: 'recovery', email: adminEmail });

    return new Response(JSON.stringify({ success: true, clubId: club.id }));
});
```

### Subscription Table

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID UNIQUE REFERENCES clubs(id),
    plan TEXT NOT NULL DEFAULT 'trial',
    status TEXT NOT NULL DEFAULT 'active',
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    paystack_customer_id TEXT,
    paystack_subscription_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Subscription Tiers

| Tier | Price | Squads | Players | Storage | Features |
|------|-------|--------|---------|---------|----------|
| Free/Trial | R0 | 2 | 50 | 1 GB | Basic |
| Pro | R499/mo | 10 | 300 | 50 GB | All features |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | All + custom branding + API |

---

## Billing & Payment Integration

### Flow

```
Your App <-> Paystack <-> Customer's Card/Bank
                |
          Webhook events
                |
       Supabase Edge Function
                |
         Update subscriptions table
```

### Checkout Flow

```js
// Frontend: redirect to Paystack Checkout
const response = await fetch('/functions/v1/create-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ planCode: 'PLN_xxx', clubId: club.id })
});
const { authorization_url } = await response.json();
window.location.href = authorization_url;
```

### Webhook Handler

```typescript
// Edge Function handles these Paystack events:
// - charge.success -> activate subscription
// - subscription.create -> record subscription
// - subscription.disable -> mark cancelled
// - invoice.payment_failed -> mark past_due

Deno.serve(async (req) => {
    const body = await req.json();
    const event = body.event;

    switch (event) {
        case 'charge.success': {
            // Activate subscription, update club settings with Pro limits
            break;
        }
        case 'invoice.payment_failed': {
            // Grace period -- don't cut off immediately
            // Send email: "Payment failed, please update card"
            break;
        }
        case 'subscription.disable': {
            // Downgrade to free limits
            break;
        }
    }
});
```

### Enforcing Limits

Frontend:
```js
const limits = profile.clubs?.settings?.limits || {};
const currentCount = squadManager.getPlayers({}).length;
if (limits.max_players && currentCount >= limits.max_players) {
    showToast(`Player limit reached (${limits.max_players}). Upgrade your plan.`, 'error');
    return;
}
```

RLS (server-side):
```sql
CREATE POLICY "enforce_squad_limit" ON squads
FOR INSERT WITH CHECK (
    (SELECT count(*) FROM squads WHERE club_id = get_my_club_id())
    < (SELECT (settings->'limits'->>'max_squads')::int FROM clubs WHERE id = get_my_club_id())
);
```

### Billing Page in Club Settings
- Current plan + status
- "Upgrade" / "Change Plan" button
- "Manage Payment Method" link (Paystack portal)
- Usage stats (X of Y players, X of Y GB storage)

---

## SA Payment Providers

### Recommended: Paystack (Best for SA SaaS)

| Feature | Paystack | Stripe | Yoco | Peach Payments |
|---------|----------|--------|------|----------------|
| Recurring billing | Yes | Yes | No | Yes |
| SA card support | Excellent | Good | Excellent | Excellent |
| EFT/bank transfer | Yes | No | No | Yes |
| Instant Settlement | Yes (SA banks) | 2-7 days | Next day | 2-3 days |
| API quality | Excellent | Excellent | Basic | Good |
| Pricing | 2.9% + R1 | 2.9% + R0.50 | 2.6% + R0.30 | 3.5% |
| Webhooks | Yes | Yes | Limited | Yes |
| Subscription API | Yes | Yes | No | Yes |
| Customer Portal | Yes | Yes | No | No |
| Currency | ZAR native | USD primary | ZAR | ZAR |

**Why Paystack wins:**
- Built for Africa (acquired by Stripe, API design is similar)
- Native ZAR support — no currency conversion fees
- Supports recurring subscriptions out of the box
- Supports EFT (bank transfer) — important for SA clubs who don't use cards
- Instant settlement to SA bank accounts
- Debit order support (automatic monthly deductions)

```typescript
// Paystack Subscription API
const plan = await paystack.plan.create({
    name: 'Sentinel Pro',
    amount: 49900, // R499 in kobo (cents)
    interval: 'monthly',
    currency: 'ZAR'
});

const subscription = await paystack.subscription.create({
    customer: customerCode,
    plan: plan.data.plan_code,
});
```

---

## Per-Club Customization

### Level 1: Branding (CSS Variables)

```json
{
    "branding": {
        "primary_color": "#00C49A",
        "secondary_color": "#0D1B2A",
        "accent_color": "#FFD700",
        "logo_url": "https://r2.../tuks-logo.png",
        "club_display_name": "Tuks FC"
    }
}
```

```js
// In page-init.js
const branding = profile.clubs?.settings?.branding || {};
const root = document.documentElement;
if (branding.primary_color) root.style.setProperty('--accent', branding.primary_color);
if (branding.secondary_color) root.style.setProperty('--sidebar-bg', branding.secondary_color);
if (branding.logo_url) {
    document.querySelector('.sidebar-logo img')?.setAttribute('src', branding.logo_url);
}
```

### Level 2: Feature Toggles (Conditional Rendering)

```json
{
    "features": {
        "video_analysis": true,
        "match_planning": true,
        "player_assessments": true,
        "analytics_dashboard": false,
        "export_pdf": false
    }
}
```

```js
// In sidebar.js -- conditionally include nav items
// In page-init.js -- hide elements with data-feature attribute
document.querySelectorAll('[data-feature]').forEach(el => {
    if (features[el.dataset.feature] === false) el.style.display = 'none';
});
```

### Level 3: Custom Fields (JSONB Schema)

```json
{
    "custom_fields": {
        "player": [
            { "key": "id_number", "label": "SA ID Number", "type": "text" },
            { "key": "medical_aid", "label": "Medical Aid", "type": "text" }
        ]
    }
}
```

Data stored in `players.custom_data` JSONB column.

### Level 4: White-Label Domains (Enterprise)

```js
const hostname = window.location.hostname;
if (!hostname.includes('sentinelhub')) {
    const { data: club } = await supabase
        .from('clubs')
        .select('settings')
        .eq('settings->>custom_domain', hostname)
        .single();
    // Apply that club's branding
}
```

### Level 5: Archetypes & Modules (Drastic Layout Differences)

```json
{
    "archetype": "academy",
    "modules": {
        "squads": true,
        "individual_clients": false,
        "player_profiles": true,
        "match_planning": true,
        "assessments": true,
        "scheduling": false,
        "invoicing": false
    },
    "layout": {
        "sidebar_order": ["dashboard", "planner", "squad", "matches", "analytics"],
        "dashboard_widgets": ["calendar", "upcoming_matches", "recent_sessions"],
        "player_profile_sections": ["bio", "stats", "assessments", "videos"]
    }
}
```

```js
// sidebar.js -- dynamic nav based on modules
const modules = profile.clubs?.settings?.modules || {};
const sidebarOrder = profile.clubs?.settings?.layout?.sidebar_order || defaultOrder;

const allNavItems = {
    dashboard: { href: '...', icon: 'fa-th-large', label: 'Dashboard' },
    planner: { href: '...', icon: 'fa-clipboard-list', label: 'Session Planner' },
    squad: { href: '...', icon: 'fa-user-friends', label: 'Squad & Players' },
    individual_clients: { href: '...', icon: 'fa-user', label: 'Clients' },
    matches: { href: '...', icon: 'fa-futbol', label: 'Matches' },
};

const navItems = sidebarOrder
    .filter(id => modules[id] !== false)
    .map(id => allNavItems[id])
    .filter(Boolean);
```

---

## Deep Functional Differences

This section covers how two clubs using the same app can have **completely different workflows, templates, evaluation systems, and logic** — not just different visible buttons, but different behavior.

### The Core Pattern: Data-Driven Logic

Every deep functional difference follows the same 4-step pattern:

1. **One table** in the DB with flexible columns (nullable FKs + JSONB for variable-shaped data)
2. **One page** in the frontend that reads the club's config from `clubs.settings`
3. **Branching logic** where behavior differs — driven by `archetype` or `modules` config
4. **Dynamic form rendering** — form fields come from the club's JSONB template, not hardcoded HTML

Think of it like a game engine: same engine, different config files produce completely different games.

### Example 1: Custom Evaluation Templates

**Problem**: Club A evaluates players on passing/shooting/fitness (1-10 scale). Club B evaluates clients on technique/coordination/progress (percentage-based).

**Database**:
```sql
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id),
    player_id UUID REFERENCES players(id),
    template_key TEXT NOT NULL,
    scores JSONB NOT NULL,       -- flexible: holds ANY shape of evaluation data
    assessed_by UUID REFERENCES profiles(id),
    assessed_at TIMESTAMPTZ DEFAULT now()
);
```

**Club A config** (Academy):
```json
{
  "assessment_templates": {
    "match_eval": {
      "name": "Match Performance Review",
      "criteria": [
        { "key": "passing", "label": "Passing Accuracy", "type": "rating_1_10", "weight": 2 },
        { "key": "shooting", "label": "Shooting", "type": "rating_1_10", "weight": 1.5 },
        { "key": "fitness", "label": "Match Fitness", "type": "rating_1_10", "weight": 1 },
        { "key": "notes", "label": "Coach Notes", "type": "textarea" }
      ],
      "scoring": "weighted_average"
    }
  }
}
```

**Club B config** (Private Coach):
```json
{
  "assessment_templates": {
    "session_progress": {
      "name": "Session Progress Tracker",
      "criteria": [
        { "key": "technique", "label": "Ball Control", "type": "percentage" },
        { "key": "coordination", "label": "Coordination", "type": "rating_1_5_stars" },
        { "key": "effort", "label": "Effort Level", "type": "emoji_scale", "options": ["lazy", "ok", "strong", "fire"] },
        { "key": "goals_met", "label": "Session Goals Met", "type": "checklist", "items": ["Dribbling drill", "First touch", "Weak foot"] },
        { "key": "parent_note", "label": "Note for Parent", "type": "textarea" }
      ],
      "scoring": "none"
    }
  }
}
```

**Frontend** — one assessment page, dynamic rendering:
```js
const templates = profile.clubs?.settings?.assessment_templates || {};
const template = templates[selectedTemplateKey];

template.criteria.forEach(criterion => {
    switch (criterion.type) {
        case 'rating_1_10': renderSlider(criterion.key, criterion.label, 1, 10); break;
        case 'percentage': renderPercentageInput(criterion.key, criterion.label); break;
        case 'rating_1_5_stars': renderStarRating(criterion.key, criterion.label, 5); break;
        case 'emoji_scale': renderEmojiPicker(criterion.key, criterion.label, criterion.options); break;
        case 'checklist': renderChecklist(criterion.key, criterion.label, criterion.items); break;
        case 'textarea': renderTextarea(criterion.key, criterion.label); break;
    }
});

// On save -- scores go into JSONB column
const scores = collectFormValues();
await supabase.from('assessments').insert({
    club_id: profile.club_id, player_id: selectedPlayerId,
    template_key: selectedTemplateKey, scores: scores, assessed_by: profile.id
});
```

### Example 2: Session Planning — Squads vs Individual Clients

**Database** — flexible columns handle both:
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id),
    title TEXT NOT NULL,
    date DATE,
    squad_id UUID REFERENCES squads(id),   -- NULL for private coaching
    player_ids UUID[],                      -- NULL for academy
    plan JSONB,
    duration_minutes INT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Frontend logic branches by archetype**:
```js
const archetype = profile.clubs?.settings?.archetype;

if (archetype === 'private_coaching') {
    renderClientPicker();        // Multi-select from player list
    // Duration defaults to 60min, no squad dropdown
    // Plan template: warm-up -> main activity -> cool-down
} else {
    renderSquadSelector();       // Squad dropdown -> auto-loads players
    // Duration defaults to 90min, can split into groups
    // Plan template: warm-up -> technical -> tactical -> match play -> cool-down
}

async function saveSession(formData) {
    const session = {
        club_id: profile.club_id, title: formData.title,
        date: formData.date, duration_minutes: formData.duration,
        plan: formData.plan, created_by: profile.id,
    };
    if (archetype === 'private_coaching') {
        session.player_ids = formData.selectedPlayerIds;
    } else {
        session.squad_id = formData.selectedSquadId;
    }
    await supabase.from('sessions').insert(session);
}
```

### Example 3: Training Register — Different Logic Per Archetype

Academy view:
```js
// Group by squad -> show each session -> mark who attended
// Renders: Squad name | Date | 18/22 attended | [View Details]
```

Private coaching view:
```js
// Group by client -> show their session history -> include payment status
// Renders: Client name | Sessions this month: 4/4 | Paid: R1200/R1600 | [Log Session]
```

### Example 4: Player Profiles — Completely Different Sections

```json
// Academy:
{ "player_profile_sections": ["bio", "stats", "match_history", "assessments", "development", "videos"] }

// Private coaching:
{ "player_profile_sections": ["bio", "parent_contact", "session_history", "progress_chart", "invoices", "goals"] }
```

```js
const sections = profile.clubs?.settings?.layout?.player_profile_sections || defaultSections;
const sectionRenderers = {
    bio: renderBioSection,
    stats: renderStatsSection,
    match_history: renderMatchHistorySection,
    parent_contact: renderParentContactSection,
    session_history: renderSessionHistorySection,
    progress_chart: renderProgressChartSection,
    invoices: renderInvoiceSection,
};
sections.forEach(sectionId => {
    const renderer = sectionRenderers[sectionId];
    if (renderer) container.appendChild(renderer(playerData));
});
```

### What Stays Constant vs What Differs

| Same for everyone | Different per club |
|-------------------|--------------------|
| Auth (login, signup, roles) | Which sidebar items appear (modules config) |
| Database tables (structure) | Form fields in assessments (assessment_templates config) |
| RLS policies (always filter by club_id) | Session planner workflow (branched by archetype) |
| API layer (Supabase queries) | Register display logic (branched by archetype) |
| Page HTML shells | Player profile sections (layout config) |
| Sidebar shell, toast, permissions | Branding colors, logo (branding config) |
| | Feature limits (limits config) |

---

## Developer-Managed Model

**Important clarification**: The configuration described above is managed by the **development team**, not by club admins. This is how most SaaS platforms work early on.

### Who Does What

**Developers (you and your partner) handle:**
- Which archetype a club uses
- Which modules are active
- Evaluation template definitions
- Session planner workflow configuration
- Layout and section ordering
- Building new features when a club requests something new
- Adjusting configs when clubs request changes
- Setting up `clubs.settings` via Supabase dashboard or Platform Admin panel

**Club admins handle (basic stuff only):**
- Their club name, logo, colors (branding)
- Inviting/removing their own coaches and viewers
- Maybe toggling a few simple preferences

### How This Works in Practice

1. A new club signs up (or you onboard them manually)
2. You talk to them, understand what they need
3. You set their archetype and configure their `clubs.settings` JSONB
4. If they need features that don't exist yet, you build them
5. When they request changes, you adjust the config or build new code
6. The `clubs.settings` JSONB is edited by developers, not club admins
7. The code reads the config the same way regardless of who wrote it

### For Your Two Existing Projects

- **Tuks FC** (Football-Hub-v4) -> `archetype: "academy"` — current app features
- **Orion Football Program** -> `archetype: "private_coaching"` — private coaching features

You merge both codebases into one app. The branching logic runs the right code for each. New clubs get configured based on what they need.

### Future: Self-Service (Optional, Later)

Eventually you could build a template builder UI where club admins customize their own evaluation templates, section ordering, etc. But this is not needed now — it's a Phase 5+ feature. For now, developer-managed configuration is simpler, faster, and gives you full control over the quality of each club's experience.

---

## Implementation Timeline

### What You Have Today (Already Done)
- Multi-tenant database with RLS isolation per club
- Role-based access control (admin, coach, viewer)
- File storage isolation (R2 + Supabase Storage with club_id prefixing)
- Working invite system
- Deployed on AWS Amplify with CI/CD from GitHub
- `clubs.settings` JSONB column exists

### Phase Timeline

| Phase | Goal | Duration |
|-------|------|----------|
| 1: Platform Foundation | Separate platform operators, manage multiple clubs | 1-2 weeks |
| 2: Onboarding & Trial | Self-service signup, 14-day trial | 1-2 weeks |
| 3: Payments & Billing | Paystack integration, revenue | 2-3 weeks |
| 4: Platform Admin | Professional club management dashboard | 1-2 weeks |
| 5: Scale & Polish | Mobile app, white-label, custom fields, API | Ongoing |

---

## Key Decision Points

1. **When to start charging**: After Phase 2. Get 3-5 clubs using the free trial first — their feedback will be invaluable.

2. **Pricing strategy**: Start simple. One plan (Pro) at R499/mo. Add tiers later when you understand what features different clubs value most.

3. **First paying customers**: Reach out to clubs you know personally. Offer a "founding member" discount (e.g., R299/mo locked in forever) in exchange for feedback.

4. **When to build mobile**: Not until you have 10+ active clubs. The web app works on mobile browsers already.

5. **When to hire**: When you hit ~20 active paying clubs and support requests exceed what you and your partner can handle part-time.

---

## Things to Consider

1. **Rate limiting** — One club shouldn't overwhelm the API. Supabase has built-in rate limiting.
2. **Audit logging** — Who changed what, when. Add an `audit_log` table.
3. **Data export** — Clubs will want to leave with their data. Build CSV/JSON export.
4. **White-labeling** — Enterprise clubs may want their own domain (e.g., `coaching.chiefsfc.com`).
5. **Mobile app** — Vite SPA can be wrapped in Capacitor/Ionic for a quick mobile app.
6. **Notifications** — Email alerts for upcoming matches, session reminders.
7. **API access** — Enterprise clients may want API access to pull data.
8. **Terms of Service / Privacy Policy** — Required before accepting paying customers.
9. **Uptime SLA** — Enterprise customers will ask. Supabase Pro plan offers 99.9%.
10. **Multi-club users** — A coach might work at two clubs. Future: junction table `user_clubs`.

---

## Architecture Diagram — Target State

```
+-----------------------------------------------------+
|           PLATFORM LAYER (Developers)                |
|  +-----------------------------------------------+  |
|  |  Platform Admin Panel                          |  |
|  |  - All clubs overview                          |  |
|  |  - Create/manage clubs + configure archetypes  |  |
|  |  - Billing/subscription management             |  |
|  |  - Platform analytics                          |  |
|  |  - Support tools (impersonation)               |  |
|  +-----------------------------------------------+  |
+-----------------------------------------------------+
|           CLUB LAYER (Each Customer)                 |
|                                                      |
|  +-----------+ +-----------+ +-----------+           |
|  | Tuks FC   | | Orion FC  | | Chiefs FC |           |
|  | (academy) | | (private) | | (academy) |           |
|  | admin     | | admin     | | admin     |           |
|  | coaches   | | coach     | | coaches   |           |
|  | viewers   | |           | | viewers   |           |
|  | --------- | | --------- | | --------- |           |
|  | squads    | | clients   | | squads    |           |
|  | players   | | sessions  | | players   |           |
|  | matches   | | progress  | | matches   |           |
|  | sessions  | | invoices  | | sessions  |           |
|  +-----------+ +-----------+ +-----------+           |
+-----------------------------------------------------+
|           DATA LAYER (Shared Infrastructure)         |
|  +------------------------+ +------------------+    |
|  | Supabase (1 project)   | | Cloudflare R2    |    |
|  | - PostgreSQL + RLS     | | - 1 bucket       |    |
|  | - Auth                 | | - {club_id}/     |    |
|  | - Edge Functions       | |   prefixed       |    |
|  | - Storage (5 buckets)  | |                  |    |
|  +------------------------+ +------------------+    |
|  +------------------------+ +------------------+    |
|  | Amplify (1 app)        | | Paystack         |    |
|  | - Vite build           | | - Subscriptions  |    |
|  | - Static SPA           | | - ZAR billing    |    |
|  +------------------------+ +------------------+    |
+-----------------------------------------------------+
```
