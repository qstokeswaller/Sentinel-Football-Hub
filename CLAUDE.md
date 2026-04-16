# Sentinel Football Hub v5

## What This Is
This is **Football Hub v5** — upgraded from v4 to become the first product under the **Sentinel SportsTech** umbrella platform. It was copied from `Football-Hub-v4-local-UP` as the starting point.

## Owner
- Developer: stokeswallerq@gmail.com
- Football coach building AI video analysis SaaS

## Architecture
- **Frontend**: Vite + vanilla JS SPA, deployed on AWS Amplify
- **Backend**: Supabase (auth, database, RLS, edge functions)
- **No Railway/backend server yet** — everything runs client-side + Supabase

## Key Plan Files (READ THESE FIRST)
- `SAAS-PLATFORM-PLAN.md` — Multi-club SaaS architecture (archetypes, modules, per-club config via JSONB)
- `UMBRELLA-PLATFORM-PLAN.md` — Sentinel SportsTech umbrella platform (4 products, SSO, billing, deployment strategy)

## Current State (as of 2026-03-15)
- v4 code copied in, working locally and on Amplify
- Pending v4 fixes already in code but not yet deployed:
  - Invite URL fix (reads both `invite` and `token` params)
  - Signup page redesign (split name fields, confirm password, hidden invite token)
  - RBAC grey-out for viewers (restricted buttons greyed out with toast instead of hidden)
  - Role change confirmation popup in admin settings

## What To Do Next (Phase 0 — in order)
1. **Deploy pending v4 fixes to Amplify** — push current code, verify invite flow and RBAC works
2. **Test Sidwell's account** — verify name, role badge, team member visibility
3. **Add deployment platform recommendation to UMBRELLA-PLATFORM-PLAN.md** — Vercel for all Next.js, Amplify for this app, Railway for future backends
4. **Begin Phase 1 of SAAS-PLATFORM-PLAN.md** — add `club_id` column, RLS policies, multi-tenant database layer

## Deployment Strategy Summary
| Component | Platform | Status |
|-----------|----------|--------|
| Football Hub (this app) | AWS Amplify | LIVE |
| Umbrella Dashboard | Vercel (planned) | NOT STARTED |
| TrainerOS | Current host | LIVE |
| SportsCoder web | Vercel (planned) | IN DEV |
| Football AI frontend | Vercel (planned) | IN DEV |
| Football AI backend | Railway (planned) | IN DEV |
| ML worker | Railway GPU or Modal (planned) | IN DEV |

## Railway — Why It's Mentioned
Railway is recommended for **future backend services** (FastAPI, Celery workers, FFmpeg processing). It's NOT needed for Football Hub right now since everything runs on Supabase. Railway becomes relevant when:
- Football AI needs a persistent FastAPI server
- SportsCoder needs FFmpeg video processing workers
- Any app needs long-running backend processes that Supabase Edge Functions can't handle

## Tech Stack
- Build: Vite (`import.meta.env.VITE_*` for env vars, baked at build time)
- Auth: Supabase Auth
- DB: Supabase PostgreSQL with RLS
- Hosting: AWS Amplify (static SPA)
- Domain: TBD under sentinelsportstech.com

## Performance Rules (MUST follow for every new feature)
1. **No sequential awaits** — if two DB calls don't depend on each other, use `Promise.all()`
2. **Always add `.limit()`** to any query that could grow unbounded (sessions, drills, reports, attendance, invoices)
3. **Add date filters** to historical data queries (sessions: 6 months, events: 3 months each direction, attendance: by session IDs not date range)
4. **Don't re-fetch what's already cached** — managers accept `clubIdOverride` to skip redundant auth calls, `page-init.js` provides the profile
5. **Don't block page reveal** — only critical data (auth, profile, permissions) should block `.page-ready`. Non-critical data loads after reveal
6. **Sub-section loading** — individual tabs/modals should use their own loading spinners, not block the entire page
7. **Verify after building** — after any new page or feature, run `npx vite build` and check the page loads without console errors or blank states
8. **Sidebar preload sync** — `public/sidebar-preload.js` is the REAL preload file (Vite copies `public/` as-is to `dist/`). `src/sidebar-preload.js` is a backup. BOTH must stay in sync when adding nav items

## Key Source Paths
- `src/auth.js` — Authentication helpers with caching
- `src/rbac.js` — Role-based access control (grey-out system)
- `src/page-init.js` — Shared page initialization
- `src/toast.js` — Global toast notifications
- `src/pages/login.html` — Login/signup page
- `server/` — Legacy Express server (not used in production, Supabase handles backend)

## Four Sentinel SportsTech Products
1. **Football Hub** (this app) — Club management, squad, matches, analytics
2. **TrainerOS** — Sport science / wellness tracking
3. **SportsCoder** — Video analysis with tagging
4. **Football AI** — ML-powered match tracking (YOLO + ByteTrack)
