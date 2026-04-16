# Sentinel SportsTech — Multi-Product Umbrella Platform Architecture

## Context

Sentinel SportsTech is an umbrella organization unifying four sports technology apps under shared identity, authentication, billing, and developer tooling. Each app is independently developed with its own stack, database, domain, and deployment — but they share users, organizations (clubs), and billing.

**Date**: 2026-03-15
**Status**: Planning — reference document for step-by-step implementation
**Existing deployed apps**: Football Hub (AWS Amplify), TrainerOS (deployed)
**In development**: SportsCoder, Football AI

---

## Table of Contents

1. The Four Products
2. Industry Comparison — Multi-Product SaaS
3. Database Strategy (Hybrid Recommendation)
4. Authentication & SSO
5. Deployment Strategy Per Product
6. Domain Strategy
7. Repository & Development Workflow
8. Umbrella Developer Dashboard (Level 1)
9. Per-Product Admin Dashboards (Level 2)
10. Billing Architecture (Paystack — Centralized)
11. Product Combination Strategy
12. Data Sharing Between Products
13. Developer-Managed Configuration Model
14. Implementation Roadmap (Phased)
15. Cost Projections
16. Risk Mitigation
17. Key Decisions Summary

---

## 1. The Four Products

| Product | Stack | Database | Deploy | Status |
|---------|-------|----------|--------|--------|
| **Sentinel Football Hub** | Vite + vanilla JS + Supabase | Supabase PostgreSQL | AWS Amplify | Live |
| **Sentinel TrainerOS** | React 19 + TS + Vite + Supabase | Supabase PostgreSQL | Deployed | Live |
| **Sentinel SportsCoder** | Next.js 15 + TS + Supabase + R2 + Redis + BullMQ | Supabase + Cloudflare R2 | TBD | In dev |
| **Sentinel Football AI** | FastAPI (Python) + Next.js + YOLO + ByteTrack | SQLAlchemy PostgreSQL | TBD | In dev |

### What Each App Does

- **Football Hub**: Club management, session planning, squads, matches, player profiles, assessments. Will absorb the Orion private coaching app as an archetype. Already has multi-tenant architecture with club_id RLS.
- **TrainerOS**: Sports science/performance platform — ACWR metrics, wellness monitoring, exercise management, performance tracking, questionnaires.
- **SportsCoder**: Video tagging, clip export, match coding/analysis. Has monorepo structure (apps/web, apps/electron, packages/shared, workers/ffmpeg-worker).
- **Football AI**: AI/ML video analysis — YOLO object detection, ByteTrack player tracking, event detection, speed/distance estimation, team assignment. Uses Celery + Redis for background ML processing.

### Project Locations

```
c:\Users\stoke\.gemini\antigravity\scratch\
+-- Vault_Football\Vault_football_hub\Football-Hub-v4-local-UP\   (Football Hub)
+-- Vault_traineros\Vault-TrainerOS-v4\                            (TrainerOS)
+-- Vault_Analysis\                                                 (SportsCoder)
+-- Vault_football_AI\                                              (Football AI)
```

---

## 2. Industry Comparison — Multi-Product SaaS

How companies with multiple products handle the umbrella architecture:

| Company | Strategy | Auth | Database | Billing |
|---------|----------|------|----------|---------|
| **Atlassian** (Jira, Confluence, Trello) | Separate apps, shared identity | Atlassian ID (SSO) | Separate DBs per product | Unified billing per workspace |
| **Google Workspace** (Gmail, Docs, Drive) | Separate apps, shared identity | Google Account (SSO) | Isolated per product | One bill per org |
| **Microsoft 365** (Teams, Word, SharePoint) | Separate apps, Azure AD | Azure AD (SSO) | Per-product databases | Unified M365 subscription |
| **HubSpot** (Marketing, Sales, Service) | Single app, product "hubs" | One login | Single database | Per-hub pricing, one bill |
| **Zoho** (CRM, Books, Projects, etc.) | Separate apps, shared IAM | Zoho Account (SSO) | Per-product databases | Per-product pricing |

**Universal pattern**: Shared identity/auth/billing + product-isolated data. Only HubSpot (which started as one product) uses a single database for everything.

**What this means for you**: Each app keeps its own database. You build a thin shared layer for auth, billing, and developer tooling on top.

---

## 3. Database Strategy

### Recommendation: Hybrid Architecture

```
SHARED PLATFORM (1 new Supabase project — "sentinel-platform")
+-- auth.users (SSO source of truth)
+-- organizations (a club/entity — replaces "clubs" at platform level)
+-- organization_members (user <-> org junction with platform role)
+-- product_subscriptions (which org has which products, on what plan)
+-- billing_events
+-- platform_admins (you and your partner)
+-- product_registry (which products exist)
+-- audit_log

PRODUCT: Football Hub (existing Supabase project)
+-- clubs, profiles, squads, players, sessions, matches, assessments
+-- All existing RLS stays intact
+-- Links to platform via org_id mapping table

PRODUCT: TrainerOS (existing Supabase project)
+-- exercises, sessions, wellness, ACWR data, questionnaires
+-- Existing schema stays intact
+-- Links to platform via org_id mapping table

PRODUCT: SportsCoder (own Supabase project or shares one)
+-- matches, tags, clips, projects
+-- Video metadata (actual files in Cloudflare R2)

PRODUCT: Football AI (Managed PostgreSQL on Railway)
+-- matches, analysis_results, player_match_stats, match_events
+-- SQLAlchemy + Alembic migrations
+-- No Supabase dependency (Python backend needs standard PostgreSQL)
```

### Why NOT One Giant Database for Everything

1. Football AI uses Python/SQLAlchemy with Celery — forcing it into Supabase Edge Functions would be a complete rewrite
2. Different products scale differently — video AI is compute-heavy and bursty; Hub is steady CRUD
3. Schema conflicts: `matches` means different things across products
4. RLS complexity explodes when four products share one schema
5. Each product can have its own migrations without breaking others
6. Supabase Pro is $25/project/month — affordable and gives clear cost attribution

### Why NOT Completely Separate with No Shared Layer

1. Users would log in separately to each product — terrible UX
2. No cross-product billing or metrics
3. Player data duplicated across products
4. No unified developer dashboard

### How Products Link to the Platform

Each product database keeps a simple mapping table:

```sql
-- In each product's database
CREATE TABLE platform_org_mapping (
    local_club_id UUID PRIMARY KEY REFERENCES clubs(id),
    platform_org_id UUID NOT NULL,  -- maps to organizations.id in platform DB
    synced_at TIMESTAMPTZ DEFAULT now()
);
```

### Platform Shared Tables

```sql
-- In the sentinel-platform Supabase project

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,       -- e.g., "tuks-fc"
    logo_url TEXT,
    country TEXT DEFAULT 'ZA',
    settings JSONB DEFAULT '{}',     -- branding, preferences
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES auth.users(id),
    role TEXT DEFAULT 'member',      -- 'owner', 'admin', 'member'
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE TABLE product_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    product TEXT NOT NULL,           -- 'football_hub', 'trainer_os', 'sportscoder', 'football_ai'
    plan TEXT DEFAULT 'trial',
    status TEXT DEFAULT 'active',
    trial_ends_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    paystack_subscription_code TEXT,
    settings JSONB DEFAULT '{}',     -- product-specific config for this org
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, product)
);
```

---

## 4. Authentication & SSO

### Architecture

```
                 +---------------------------+
                 |  sentinel-platform        |
                 |  Supabase Auth            |
                 |  (SSO source of truth)    |
                 +---------------------------+
                    |       |       |       |
                 JWT tokens with custom claims
                    |       |       |       |
           +--------+ +----+  +----+  +----+-------+
           | Hub    | | TO |  | SC |  | AI Backend |
           | (Supa) | |(Su)|  |(Su)|  | (FastAPI)  |
           +--------+ +----+  +----+  +------------+
```

### SSO Flow

1. User visits any product (e.g., `hub.sentinelsportstech.com`)
2. If not authenticated, redirect to `auth.sentinelsportstech.com`
3. User logs in once. Platform issues JWT with claims:
   ```json
   {
     "sub": "user-uuid",
     "email": "coach@tuks.ac.za",
     "org_id": "tuks-org-uuid",
     "org_role": "admin",
     "products": ["football_hub", "trainer_os"]
   }
   ```
4. JWT stored in HttpOnly cookie on `.sentinelsportstech.com` (shared across subdomains)
5. Each product validates the JWT using the platform project's JWT secret
6. No re-login when switching between products

### Football AI Auth Migration

The AI backend currently has custom JWT auth (`backend/auth.py` with python-jose). Migration:
1. Remove custom user/password system
2. Configure FastAPI to validate JWTs from platform Supabase using same JWT_SECRET
3. Extract `org_id` from JWT claims instead of local `users` table

---

## 5. Deployment Strategy

### Summary Table

| Component | Platform | Reason |
|-----------|----------|--------|
| **Platform Dashboard** | Vercel | Next.js SSR, free tier to start |
| **Football Hub** | AWS Amplify (keep) | Already deployed, working CI/CD |
| **TrainerOS** | Keep current platform | Already deployed |
| **SportsCoder (web)** | Vercel | Next.js 15 SSR, native support |
| **SportsCoder (FFmpeg worker)** | Railway | Long-running process, needs CPU |
| **Football AI (frontend)** | Vercel | Next.js frontend |
| **Football AI (backend)** | Railway | FastAPI + Celery, persistent process |
| **Football AI (ML worker)** | Railway (GPU) or Modal | YOLO inference needs GPU |
| **Video Storage** | Cloudflare R2 (keep) | Already used by SportsCoder, cheapest for large files |
| **Redis** | Railway or Upstash | BullMQ (SportsCoder) + Celery (AI) both need Redis |

### The Mental Model

```
FRONTENDS (what users see in browser)
  → Vercel    (Next.js apps — umbrella dashboard, SportsCoder, Football AI frontend)
  → Amplify   (Vite SPA — Football Hub)

BACKENDS (servers that process data)
  → Railway   (FastAPI, Celery workers, FFmpeg workers, Redis)

DATABASES
  → Supabase  (PostgreSQL + Auth + RLS for most apps)
  → Railway PostgreSQL (Football AI, if not using Supabase)

FILES
  → Cloudflare R2  (video storage)
  → Supabase Storage (images, documents)
```

### Why Vercel for All Next.js Frontends

Vercel is built by the same team that builds Next.js — native support for SSR, API routes, middleware, and edge functions with zero config.

**Why Vercel wins over Amplify for Next.js:**
- Amplify supports Next.js SSR but wraps it in Lambda@Edge — adds cold start latency and deployment quirks
- Next.js API routes on Amplify require extra configuration; on Vercel they just work
- Amplify builds are slower (~3-5 min vs Vercel's ~30 sec for Next.js)
- Vercel's dashboard, logs, and debugging tools are significantly better for Next.js

**Why keep Amplify for Football Hub:**
- Football Hub is a static Vite SPA, not Next.js — Amplify just serves static files, which it does well
- Already deployed with working CI/CD from GitHub
- No reason to migrate what's already working

**Vercel coverage:** One Vercel Pro account ($20/month) covers all Next.js apps — umbrella dashboard + SportsCoder web + Football AI frontend.

### Why Railway for All Backend Services

Railway is a cloud platform for deploying persistent backend processes — "Vercel but for servers and databases."

**What Railway handles that Vercel cannot:**

| Need | Vercel | Railway |
|------|--------|---------|
| Next.js frontend | Perfect | Overkill |
| API responding to requests | Good (serverless, 30s timeout) | Good (always-on) |
| FastAPI Python backend | Not supported | Perfect |
| Background workers (Celery, BullMQ) | Not possible | Perfect |
| GPU compute (ML/YOLO) | Not possible | Supported |
| Redis, PostgreSQL | Not supported | Built-in |
| Long-running tasks (video processing) | 30s timeout kills it | No timeout |

**Your Railway project would look like:**
```
Railway Project: "Sentinel Backend Services"
├── Football AI API        (FastAPI server, always-on)
├── Football AI ML Worker  (Celery worker, processes YOLO jobs)
├── FFmpeg Worker           (processes SportsCoder video clips)
├── Redis                   (shared queue for Celery + BullMQ)
└── PostgreSQL              (Football AI database, if not using Supabase)
```

**Developer workflow:** Connect GitHub repo → Railway auto-detects stack (Python, Node, Docker) → push to main → auto-rebuilds in ~60 seconds → gets a URL like `your-app.up.railway.app` → add custom domain `api.sentinelsportstech.com`.

**Railway vs alternatives:**

| Platform | Best For | Trade-off |
|----------|----------|-----------|
| **Railway** | Python backends, workers, Redis, databases | Slightly more expensive than serverless for simple APIs |
| **Fly.io** | Same as Railway, slightly cheaper | Harder to set up, less polished dashboard |
| **Render** | Same category, has free tier | Slower deploys, free tier sleeps after 15min inactivity |
| **AWS EC2/ECS** | Maximum control | Way more complex to manage, overkill for current scale |
| **Modal** | GPU-heavy ML workloads specifically | Only for compute jobs, not general hosting |

**Railway pricing:**
- Hobby plan: $5/month + usage (CPU/memory/bandwidth)
- Typical backend service: $5-15/month depending on usage
- GPU instances: $0.50-2/hour (only when running ML jobs)
- Redis: ~$5/month for small instance
- Estimated total for all backend services: **$20-50/month**

### Why NOT Self-Host Everything

No reason to manage servers (EC2, DigitalOcean) when Vercel + Railway handle your scale. Self-hosting only makes sense at enterprise scale (1000+ clubs) for cost optimization. Until then, managed platforms save hundreds of hours of DevOps work.

---

## 6. Domain Strategy

```
sentinelsportstech.com                 -- Marketing / landing page
auth.sentinelsportstech.com            -- SSO login page
admin.sentinelsportstech.com           -- Developer umbrella dashboard (Level 1)

hub.sentinelsportstech.com             -- Football Hub
trainer.sentinelsportstech.com         -- TrainerOS
coder.sentinelsportstech.com           -- SportsCoder
ai.sentinelsportstech.com              -- Football AI

api.sentinelsportstech.com/ai/         -- Football AI FastAPI (reverse proxy)
```

All subdomains share `.sentinelsportstech.com` cookies for SSO. Each product can also have white-label custom domains for enterprise clients later (e.g., `coaching.tuksfc.co.za`).

Each product maintains its **own branding and identity**:
- Own color scheme, logo, layout
- Own sidebar and navigation
- Feels like a standalone product when used alone
- The shared "Sentinel Bar" at the top connects them when a club uses multiple products

---

## 7. Repository & Development Workflow

### Multi-Repo with Shared Packages (Recommended)

**NOT a monorepo.** The four apps have radically different stacks (vanilla JS, React, Next.js, Python/FastAPI). A monorepo toolchain can't efficiently manage Python + Node.js together.

```
GitHub Organization: sentinel-sportstech
|
+-- sentinel-platform        (admin dashboard + shared auth config)
|     -> Vercel auto-deploy on push to main
|
+-- sentinel-football-hub    (Vite SPA)
|     -> Amplify auto-deploy on push to main
|
+-- sentinel-trainer-os      (React + Vite SPA)
|     -> Current deploy platform
|
+-- sentinel-sportscoder     (monorepo: Next.js + Electron + workers)
|     -> Vercel for web, Railway for workers
|
+-- sentinel-football-ai     (FastAPI + Next.js + ML)
|     -> Vercel for frontend, Railway for backend
|
+-- sentinel-shared          (shared npm packages)
      -> Published to GitHub Packages (private npm registry)
```

### Shared Packages

```
sentinel-shared/
+-- packages/
    +-- auth/           -- JWT validation, session helpers, SSO redirect
    +-- topbar/         -- Shared navigation bar component
    +-- types/          -- TypeScript interfaces (Organization, User, Subscription)
    +-- api-client/     -- HTTP client for platform API (getOrg, checkSubscription)
    +-- constants/      -- Product IDs, plan tiers, role definitions
```

Football Hub (vanilla JS) uses `@sentinel/auth`, `@sentinel/api-client`, `@sentinel/constants`.
React/Next.js products additionally use `@sentinel/topbar`.
Football AI (Python) validates JWTs inline (~30 lines, no npm dependency needed).

### Developer Workflow

```
Developer A: Works on Football Hub
  -> git clone sentinel-football-hub
  -> npm install (pulls @sentinel/auth, @sentinel/api-client)
  -> npm run dev
  -> Independent PR, independent deploy

Developer B: Works on TrainerOS
  -> git clone sentinel-trainer-os
  -> npm install
  -> npm run dev
  -> Independent PR, independent deploy

Developer C: Works on Football AI
  -> git clone sentinel-football-ai
  -> pip install -r requirements.txt && npm install (frontend/)
  -> uvicorn + npm run dev
  -> Independent PR, independent deploy
```

No developer ever needs to check out another product's repo. Changes to one app never break others. The shared packages are the only coordination point.

### Version Management

- Each product has independent versioning and releases
- Shared packages use semver, products pin to compatible ranges
- Breaking changes in shared packages require major version bump
- Use GitHub Releases + tags per product for traceability

---

## 8. Umbrella Developer Dashboard (Level 1)

This is `admin.sentinelsportstech.com` — only you and your partner access it.

### Layout

```
+----------------------------------------------------------+
|  Sentinel SportsTech — Platform Admin                     |
+----------------------------------------------------------+
|                                                           |
|  +----------+ +----------+ +----------+ +----------+     |
|  | 47 Orgs  | | 1,284    | | R58,200  | | 4 Apps   |     |
|  | Active   | | Users    | | MRR      | | Live     |     |
|  +----------+ +----------+ +----------+ +----------+     |
|                                                           |
|  +- Products Overview --------------------------------+   |
|  | Product        | Orgs | Users | MRR     | Status   |   |
|  |----------------|------|-------|---------|----------|   |
|  | Football Hub   | 32   | 847   | R23,400 | Healthy  |   |
|  | TrainerOS      | 18   | 284   | R12,600 | Healthy  |   |
|  | SportsCoder    | 12   | 96    | R15,200 | Healthy  |   |
|  | Football AI    | 5    | 57    | R7,000  | Healthy  |   |
|  +----------------------------------------------------+   |
|                                                           |
|  +- Recent Organizations ---+  +- Revenue Trend ------+  |
|  | Tuks FC — Hub+Trainer    |  | [line chart]         |  |
|  | Chiefs — Hub only        |  |                      |  |
|  | Orion — Hub (private)    |  |                      |  |
|  +---------------------------+  +----------------------+  |
|                                                           |
|  [+ Create Org]  [Platform Settings]                      |
+----------------------------------------------------------+
```

### Pages

- `/` — Dashboard overview (metrics, charts, recent activity)
- `/organizations` — All orgs, search/filter. Click into org detail:
  - Members, product subscriptions, storage usage
  - Feature flags per product
  - "Impersonate" button, "Suspend"/"Delete" actions
- `/products` — Product registry, each links to Level 2 admin
- `/billing` — Revenue, failed payments, churn metrics, Paystack link
- `/settings` — Default trial duration, maintenance mode, admin management

---

## 9. Per-Product Admin Dashboards (Level 2)

Each product has its own platform admin panel showing clubs using that specific product. Football Hub's Level 2 is already fully planned in SAAS-PLATFORM-PLAN.md.

```
Level 1 (admin.sentinelsportstech.com)
  "Football Hub: 32 orgs" -> [View Product Admin]
    -> hub.sentinelsportstech.com/platform-admin  (Level 2)
       Shows: all clubs using Football Hub, archetype configs, modules, templates

Level 1 (admin.sentinelsportstech.com)
  "TrainerOS: 18 orgs" -> [View Product Admin]
    -> trainer.sentinelsportstech.com/platform-admin  (Level 2)
       Shows: all clubs using TrainerOS, wellness configs, exercise libraries
```

Level 2 dashboards are product-specific:
- Football Hub L2: archetype config, assessment templates, session planner config
- TrainerOS L2: exercise libraries, ACWR thresholds, questionnaire templates
- SportsCoder L2: video storage quotas, export settings, tagging schemas
- Football AI L2: ML model versions, processing quotas, analysis configs

### Platform Admin UX Patterns (Based on Industry Research)

Researched: Vercel, Stripe Dashboard, Firebase Console, Clerk, Supabase Dashboard.

**Level 2 (Per-Product Admin) — Current State (Football Hub):**
- Standalone dark shell (separate from club sidebar UI)
- Stats cards row (4-across): clubs, users, coaches, players
- Club card grid (selectable tiles with avatar, name, archetype, metrics, status dot, plan badge)
- Click card → detail view (team members, feature flags, settings JSON)
- "Enter as Admin" impersonation → loads club sidebar layout with gold exit banner
- Login auto-redirect: platform admins → platform admin page, club users → dashboard
- Create Club modal with archetype selection + invite link generation

**Planned Enhancements (prioritized by impact):**

| Feature | Pattern Source | Priority | Description |
|---------|---------------|----------|-------------|
| Kebab overflow menu on club cards | Vercel project cards | Medium | Settings, Suspend/Activate, Change Plan, Delete actions per club |
| Tabbed club detail view | Supabase project dashboard | Medium | Tabs: Overview, Members, Subscription, Settings, Activity |
| Audit log for impersonation | Clerk, Stripe Connect | High | Log every action taken during impersonation with real admin identity |
| Cmd+K command palette | Vercel | Low | Quick navigation: search clubs, jump to actions, switch context |
| Activity sparklines in stats | Stripe Dashboard | Low | Mini trend charts on stat cards (7d/30d) |
| "Last active" on club cards | All platforms | Easy | Show when the club last had user activity |
| Subscription status breakdown | Stripe | Low | Pie/bar chart: trial vs active vs suspended clubs |
| Danger zone in club detail | Supabase, Vercel | Medium | Delete club confirmation (type name to confirm), transfer ownership |
| Bulk actions on card grid | Clerk | Low | Select multiple clubs → bulk suspend, bulk change plan |
| Notification bell | Vercel, Supabase | Low | Platform-level alerts: failed payments, new signups, approaching limits |

**Impersonation Best Practices (from Clerk + Stripe Connect):**
1. Persistent, highly visible banner (gold/orange) fixed to top of viewport
2. Banner shows: impersonated club name, admin role, "Exit" button
3. All actions during impersonation are audit-logged with `{ actor: platform_admin_id, on_behalf_of: club_id }`
4. Read-only mode option for safer browsing (toggle in banner)
5. Session-based (sessionStorage), auto-clears on logout
6. Exit returns to platform admin page, not club dashboard

**Level 1 (Umbrella Dashboard) — Planned (admin.sentinelsportstech.com):**

The Level 1 dashboard sits ABOVE all products. Based on industry patterns:

| Component | Pattern | Source |
|-----------|---------|--------|
| Top bar | Logo + org switcher dropdown + global search + notifications + avatar menu | Vercel |
| Product overview cards | Card per product showing: org count, user count, MRR, health status | Stripe |
| Organization card grid | Selectable tiles showing: name, products subscribed, plan, member count | Supabase + Firebase |
| Revenue dashboard | MRR, churn rate, failed payments, trend chart | Stripe |
| Cross-product search | Search across all orgs, all users, all products | Vercel Cmd+K |
| Org detail view | Tabbed: Overview, Members, Subscriptions, Billing, Settings, Danger Zone | Clerk |
| "View Product Admin" links | From org detail, jump to Level 2 admin for that product | Atlassian |

---

## 10. Billing Architecture (Paystack — Centralized)

Billing is centralized at the platform level. One invoice from Sentinel SportsTech per organization.

### Flow

```
Organization "Tuks FC"
+-- Subscription: Football Hub Pro    R499/mo
+-- Subscription: TrainerOS Pro       R399/mo
+-- Subscription: Analysis Suite      R899/mo (bundle: SportsCoder + AI)
    Total: R1,797/mo
    Billed as one Paystack charge
```

### Pricing Structure

| Product | Starter | Pro | Enterprise |
|---------|---------|-----|------------|
| Football Hub | R299/mo | R499/mo | Custom |
| TrainerOS | R199/mo | R399/mo | Custom |
| SportsCoder | R399/mo | R699/mo | Custom |
| Football AI | R499/mo | R899/mo | Custom |
| Club Manager Bundle (Hub + Trainer) | R399/mo | R799/mo | Custom |
| Analysis Suite (Coder + AI) | R699/mo | R1,299/mo | Custom |
| Total Football (all 4) | R999/mo | R1,999/mo | Custom |

### Subscription Enforcement

Platform API exposes an endpoint each product calls on page load:

```
GET /api/org/:org_id/access/:product
Response: { allowed: true, plan: "pro", features: {...}, limits: {...} }
```

Each product caches this for 5 minutes. If `allowed: false`, show upgrade prompt. Keeps enforcement centralized.

---

## 11. Product Combination Strategy

### Problem

A club using Football Hub + TrainerOS should feel like one platform, not two separate websites. SportsCoder + Football AI should merge into a unified analysis experience.

### Solution: Shared Top Bar + API-Level Data Sharing (NOT Code Merges)

Do NOT merge codebases. Create a unified navigation layer:

```
+----------------------------------------------------------------+
|  [Sentinel]  Hub | Trainer | Coder | AI    [Tuks FC] [Profile] |
+----------------------------------------------------------------+
|                                                                  |
|  Currently viewing: Football Hub                                 |
|  +------------------------------------------------------------+ |
|  | [Football Hub's own sidebar and content]                    | |
|  |                                                             | |
|  | Dashboard | Planner | Squad | Matches | Analytics           | |
|  |                                                             | |
|  +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

### Sentinel Bar

A shared `@sentinel/topbar` component included in every product:
- Shows org name and logo
- Tabs for all products the org subscribes to
- Clicking a tab navigates to that product's subdomain
- SSO cookie means no re-login
- Shows active product, user profile, logout

This is the same pattern as Google Workspace (app grid), Atlassian (top nav), HubSpot (hub tabs).

### Deep Integration: SportsCoder + Football AI

These two have the strongest case for integration — both deal with match video:

```
Current (separate):
  1. Coach uploads video to SportsCoder -> tags events manually
  2. Coach uploads SAME video to Football AI -> runs YOLO tracking

Integrated:
  1. Coach uploads video to SportsCoder
  2. SportsCoder offers "Run AI Analysis" button
  3. Button calls Football AI API: POST /api/analysis { video_url, match_id }
  4. Football AI processes, stores results
  5. SportsCoder displays AI tracking data alongside manual tags
  6. One upload, two products working on the same video
```

This is API-level integration, not a code merge. The video lives in R2, both products reference it by URL.

### Future: Combined Apps

If a club wants Hub + TrainerOS as ONE unified app, you have two options:

**Option A (Recommended)**: Enhanced Sentinel Bar with cross-product widgets
- Dashboard shows widgets from both products in one view
- "Session" page pulls from Hub (plan) + TrainerOS (load data) via APIs
- Still separate codebases, just smarter data sharing

**Option B (Later, if demand)**: Build a new "Club Manager" product
- New codebase that combines the best of Hub + TrainerOS
- Built from scratch using shared packages and both products' APIs
- Offered as a premium combined experience
- Original standalone products remain available separately

---

## 12. Data Sharing Between Products

### Shared Entities

```
PLAYERS (master in Football Hub)
  -> TrainerOS reads for wellness/performance tracking
  -> Football AI reads for tracking assignment
  -> SportsCoder reads for tagging

MATCHES (master in Football Hub)
  -> SportsCoder attaches video tags and clips
  -> Football AI attaches tracking/analysis data

SESSIONS (master in Football Hub)
  -> TrainerOS attaches load monitoring (RPE, ACWR)
```

### Sync Mechanism (Near-Term: Simple API)

Products query the platform API for shared entities on demand:

```
Platform API (Edge Functions on sentinel-platform Supabase):
  GET /api/org/:org_id/players     -- reads from Football Hub's DB
  GET /api/org/:org_id/matches     -- reads from Football Hub's DB
  GET /api/org/:org_id/sessions    -- reads from Football Hub's DB
```

Football Hub is the source of truth for player/match/session data. Other products read from it via API, never write directly to Hub's database.

### Future: Event-Driven Sync

When scale demands it, add webhooks:
```
Football Hub creates a player
  -> POST webhook to platform: { type: "player.created", org_id, payload }
  -> Platform notifies subscribed products
  -> TrainerOS auto-creates matching player record
```

---

## 13. Developer-Managed Configuration Model

All configuration is done by the development team, not by club admins.

### Level 1 (Umbrella)
- Developers create organizations in the platform dashboard
- Developers assign product subscriptions to each org
- Developers set platform-level settings (billing, features)

### Level 2 (Per Product)
- Developers configure each club's archetype, modules, templates within each product's admin
- This is the same model described in SAAS-PLATFORM-PLAN.md for Football Hub
- Each product has its own `clubs.settings` JSONB (or equivalent) managed by developers

### Club Admins Handle (basic stuff only)
- Their branding (name, logo, colors)
- Inviting/removing their own staff
- Simple preferences within the product

---

## 14. Implementation Roadmap

### Phase 0: Foundation (Weeks 1-2)

| Task | Effort |
|------|--------|
| Register sentinelsportstech.com domain | Small |
| Create sentinel-platform Supabase project | Small |
| Create organizations, organization_members, product_subscriptions tables | Small |
| Build minimal platform API (Edge Functions): create org, check access | Medium |
| Set up GitHub organization with separate repos | Small |
| Set up GitHub Packages for @sentinel/shared | Small |

### Phase 1: SSO (Weeks 3-4)

| Task | Effort |
|------|--------|
| Implement SSO cookie on .sentinelsportstech.com | Medium |
| Build @sentinel/auth shared package | Medium |
| Modify Football Hub to auth via platform Supabase | Medium |
| Modify TrainerOS to auth via platform Supabase | Medium |
| Modify Football AI to validate platform JWTs | Small |
| Test: login once, navigate to two products without re-login | Small |

### Phase 2: Umbrella Dashboard (Weeks 5-6)

| Task | Effort |
|------|--------|
| Build sentinel-platform Next.js admin dashboard | Medium |
| Organization CRUD, member management | Medium |
| Product subscription management (dev-managed) | Medium |
| Basic metrics (org count, user count) | Small |
| Link to per-product Level 2 admins | Small |

### Phase 3: Sentinel Bar (Week 7)

| Task | Effort |
|------|--------|
| Build @sentinel/topbar shared component | Medium |
| Integrate into all four products | Medium |
| Mobile-responsive design | Small |

### Phase 4: Centralized Billing (Weeks 8-10)

| Task | Effort |
|------|--------|
| Paystack account setup, plans, pricing | Small |
| Checkout Edge Function at platform level | Medium |
| Webhook handler for payment events | Medium |
| Access enforcement API (products call on load) | Medium |
| Billing page in umbrella dashboard | Medium |

### Phase 5: Data Sharing (Weeks 11-13)

| Task | Effort |
|------|--------|
| Platform API for shared entities (players, matches) | Medium |
| Football Hub as source of truth for rosters | Small |
| SportsCoder <-> Football AI video integration | Medium |
| TrainerOS reads player data from Hub via API | Medium |

### Phase 6: Polish & Scale (Ongoing)

| Task | When |
|------|------|
| Per-product Level 2 admin dashboards | As each product matures |
| Bundle pricing implementation | When clubs want multiple products |
| White-label domains per product | Enterprise demand |
| Mobile apps (Capacitor wraps) | 10+ clubs |
| Analytics and usage metrics | Ongoing |

### Priority Order

```
NOW
+-- Complete Football Hub SaaS plan (SAAS-PLATFORM-PLAN.md Phase 1)
+-- This is the most mature product and proves the pattern
|
NEXT (after Hub multi-tenant works)
+-- Phase 0-1: Platform foundation + SSO
+-- Connect Hub + TrainerOS to shared auth
|
THEN
+-- Phase 2-3: Umbrella dashboard + Sentinel Bar
+-- Phase 4: Centralized billing
|
THEN
+-- Phase 5: Data sharing between products
+-- Deploy SportsCoder and Football AI
|
ONGOING
+-- Phase 6: Scale, polish, new features
```

---

## 15. Cost Projections

### Monthly Infrastructure (Starting)

| Service | Cost | Notes |
|---------|------|-------|
| Supabase Pro x 3 (platform, hub, traineros) | $75/mo | $25/project |
| Supabase Free x 1 (sportscoder) | $0 | Until needs Pro |
| Vercel Pro x 1 | $20/mo | Covers all Next.js apps |
| AWS Amplify (Football Hub) | ~$5/mo | Static SPA hosting |
| Railway (Football AI backend + worker) | ~$20-50/mo | Depends on GPU usage |
| Railway (FFmpeg worker) | ~$10/mo | CPU-bound video processing |
| Cloudflare R2 | ~$5-15/mo | Video storage |
| Upstash Redis | $0-10/mo | Free tier initially |
| Domain | ~$12/year | sentinelsportstech.com |
| **Total** | **~$150-190/mo** | Before revenue |

Revenue from 3-4 paying clubs at R499-R999/mo covers infrastructure.

---

## 16. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SSO complexity delays everything | Start with simple shared cookie auth. Products keep own auth as fallback during migration |
| Football AI Python backend doesn't fit Supabase | Keep it on own PostgreSQL. Only integration is JWT validation + shared R2 URLs |
| Team of 2 can't maintain 4 products + platform | Prioritize Football Hub first. Other products stay independent until team grows |
| Data sync between products introduces bugs | Start with read-only API queries, no bidirectional sync. Hub is master for player data |
| Supabase vendor lock-in | DB is standard PostgreSQL (portable). Auth + RLS are main coupling points |
| Domain/DNS complexity | Use Cloudflare for DNS — easy subdomain management, free tier |

---

## 17. Key Decisions Summary

| Decision | Recommendation |
|----------|---------------|
| Single vs multiple databases | Hybrid: shared platform DB + per-product DBs |
| Monorepo vs multi-repo | Multi-repo with shared npm packages |
| Auth strategy | Platform Supabase Auth as SSO, shared cookie on parent domain |
| Billing | Centralized at platform level via Paystack |
| Product combination | Shared top-bar nav + API data sharing, NOT code merges |
| Football AI database | Keep on managed PostgreSQL (Railway), NOT Supabase |
| Development priority | Football Hub first (most mature), then platform foundation |
| Team workflow | Independent repos, independent deploys, shared packages only |

---

## Architecture Diagram — Full Picture

```
+-------------------------------------------------------------+
|              SENTINEL SPORTSTECH (Umbrella)                  |
|                                                              |
|  +----- Level 1: Developer Dashboard -------------------+   |
|  |  admin.sentinelsportstech.com                        |   |
|  |  All products, all orgs, revenue, billing            |   |
|  +------------------------------------------------------+   |
|                                                              |
|  +----- SSO & Auth -----------+  +---- Billing ----------+  |
|  | auth.sentinelsportstech.com|  | Paystack (centralized)|  |
|  | Platform Supabase Auth     |  | One invoice per org   |  |
|  | Shared JWT on parent domain|  | Bundle pricing        |  |
|  +----------------------------+  +-----------------------+  |
|                                                              |
+-------------------------------------------------------------+
|              PRODUCT LAYER (4 Apps)                          |
|                                                              |
|  +-------------+ +------------+ +----------+ +-----------+  |
|  | Football    | | TrainerOS  | | Sports   | | Football  |  |
|  | Hub         | |            | | Coder    | | AI        |  |
|  | hub.sst.com | | trainer.   | | coder.   | | ai.sst.   |  |
|  |             | | sst.com    | | sst.com  | | com       |  |
|  | Vite+JS     | | React+TS   | | Next.js  | | FastAPI+  |  |
|  | Amplify     | | Deployed   | | Vercel   | | Next.js   |  |
|  | Supabase    | | Supabase   | | Supabase | | Railway   |  |
|  |             | |            | | + R2     | | + GPU     |  |
|  | L2 Admin    | | L2 Admin   | | L2 Admin | | L2 Admin  |  |
|  +-------------+ +------------+ +----------+ +-----------+  |
|        |               |              |             |        |
|        +-------+-------+------+-------+------+------+       |
|                |              |              |               |
|  +--- Shared Data Flow (APIs) ---+                           |
|  | Players: Hub -> All products  |                           |
|  | Matches: Hub -> Coder + AI    |                           |
|  | Sessions: Hub -> TrainerOS    |                           |
|  | Video: R2 -> Coder + AI      |                           |
|  +-------------------------------+                           |
|                                                              |
+-------------------------------------------------------------+
|              INFRASTRUCTURE                                  |
|                                                              |
|  +------------------+ +--------+ +--------+ +------------+  |
|  | Supabase x 3-4   | | R2     | | Redis  | | Railway    |  |
|  | (platform + apps) | | Videos | | Queues | | AI backend |  |
|  +------------------+ +--------+ +--------+ +------------+  |
+-------------------------------------------------------------+
```

### Relationship to SAAS-PLATFORM-PLAN.md

The Football Hub SaaS plan (archetypes, modules, templates, per-club customization) operates at Level 2 — INSIDE Football Hub. This umbrella plan operates at Level 1 — ABOVE all products. They complement each other:

- SAAS-PLATFORM-PLAN.md = how Football Hub handles multiple clubs
- This plan = how Sentinel SportsTech handles multiple products, each with multiple clubs

Both plans are implemented step by step. Football Hub's SaaS features come first (it's the most mature product), then the umbrella platform wraps around all four products.

---

## How This Plan Relates to Active Development

### Making Changes to a Specific App

Each app is an independent repo with its own CI/CD. To update Football Hub:
1. Clone sentinel-football-hub
2. Make changes
3. Push to branch, open PR
4. Amplify auto-deploys preview
5. Merge to main, Amplify deploys to production
6. No other apps are affected

### Adding a New Feature to One Product

Just develop it in that product's repo. If it needs shared auth or billing checks, use the `@sentinel/shared` packages. No coordination with other products needed.

### Updating Shared Packages

1. Make change in sentinel-shared repo
2. Publish new version to GitHub Packages
3. Each product updates their dependency when ready
4. Products are never forced to update immediately

### Onboarding a New Developer

Give them access to ONE product repo. They don't need to understand the full umbrella architecture to be productive. The shared packages abstract away the platform integration.
