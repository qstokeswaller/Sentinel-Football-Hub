# Football Performance Hub — SaaS Transition Plan

## Overview

Transitioning from a single-user local app (Express + SQLite) to a multi-tenant SaaS platform.

| Component | Current | Target |
|-----------|---------|--------|
| Database | SQLite (local file) | PostgreSQL (Supabase) |
| Auth | None | Supabase Auth (email/password) |
| API | Express.js REST server | Supabase Client (direct DB queries with RLS) |
| File Storage | Local disk (`/data/uploads/`) | Supabase Storage (5 buckets) |
| Video Storage | URL references only | Cloudflare R2 (presigned uploads) |
| Build Tool | Raw static HTML | Vite (multi-page app) |
| Multi-tenancy | None | Club-based with RLS |
| Roles | None | Admin, Coach, Viewer |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│          Vite + Vanilla JS + HTML                │
│                                                  │
│  supabase.js ─── Auth, DB queries, Storage       │
│  drill-builder.js ─── Canvas engine (unchanged)  │
│  managers/ ─── squad, match, video               │
│  pages/ ─── 12 HTML pages + login                │
└───────────┬──────────────┬───────────────────────┘
            │              │
            ▼              ▼
┌───────────────┐  ┌───────────────────┐
│   Supabase    │  │  Cloudflare R2    │
│               │  │                   │
│ PostgreSQL    │  │ Video file        │
│ Auth          │  │ storage           │
│ Storage       │  │                   │
│ Edge Funcs    │  │ Presigned URLs    │
│ RLS Policies  │  │ via Edge Function │
└───────────────┘  └───────────────────┘
```

## Multi-Tenancy Model

**Club-based**: Every data row has a `club_id`. Supabase RLS policies enforce isolation.

### Role Permissions

| Feature | Admin | Coach | Viewer |
|---------|-------|-------|--------|
| View all squads | Yes | Yes | Yes |
| Manage squads (CRUD) | Yes | No | No |
| View players (assigned squad) | Yes | Own squads | Own squads |
| Manage players | Yes | Own squads | No |
| View matches (assigned squad) | Yes | Own squads | Own squads |
| Manage matches | Yes | Own squads | No |
| Session library (shared) | Full CRUD | Full CRUD | Read only |
| Drill library (shared) | Full CRUD | Full CRUD | Read only |
| Create reports | Yes | Yes | No |
| Create assessments | Yes | Yes | No |
| View analytics | Yes | Own squads | Own squads |
| Match plans (shared) | Full CRUD | Full CRUD | Read only |
| Manage users / invites | Yes | No | No |
| Upload videos | Yes | Yes | No |
| Delete any content | Yes | Own only | No |

### Data Scoping

**Shared across club** (all members see):
- Sessions & Drills (library)
- Match Plans

**Scoped by squad assignment** (coaches see only assigned squads):
- Players
- Matches
- Assessments
- Dev Structures
- Reports
- Squad Assessments

## Files in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | Complete PostgreSQL schema — 15 tables, indexes, auth triggers |
| `rls-policies.sql` | Row Level Security policies + helper functions |
| `storage-policies.sql` | Supabase Storage bucket access policies |
| `edge-functions/get-upload-url.ts` | Generates Cloudflare R2 presigned upload URLs |
| `edge-functions/create-invite.ts` | Admin creates invite links for new users |
| `migration-checklist.md` | Step-by-step migration from SQLite → Supabase |
| `env-template` | Template `.env` file with all required variables |
| `vite.config.js` | Vite configuration for multi-page app |

## Database Schema Summary

15 tables total:

| # | Table | Key Relationships |
|---|-------|-------------------|
| 1 | `clubs` | Top-level tenant |
| 2 | `profiles` | extends `auth.users`, belongs to club |
| 3 | `squads` | belongs to club |
| 4 | `squad_coaches` | links coaches to squads (junction) |
| 5 | `players` | belongs to club + squad |
| 6 | `matches` | belongs to club + squad |
| 7 | `sessions` | belongs to club (SHARED) |
| 8 | `drills` | belongs to club + session (SHARED) |
| 9 | `reports` | belongs to club, links to session |
| 10 | `assessments` | belongs to club + player, optionally links to match |
| 11 | `dev_structures` | belongs to club + player |
| 12 | `match_plans` | belongs to club (SHARED), optionally links to match |
| 13 | `squad_assessments` | belongs to club + squad |
| 14 | `video_uploads` | belongs to club, links to player/match, stores R2 key |
| 15 | `club_invites` | belongs to club, admin-created invite tokens |

## Key Implementation Details

### Auth Flow

1. **Admin creates club** → Supabase creates club row + admin user
2. **Admin invites coach** → Edge Function generates invite link with token
3. **Coach clicks link** → Taken to signup page with club pre-filled
4. **Coach signs up** → `handle_new_user()` trigger auto-creates profile
5. **Every page load** → `requireAuth()` checks session, redirects to login if needed
6. **Supabase client** → All queries automatically scoped by RLS using the user's JWT

### Video Upload Flow (Cloudflare R2)

1. User selects video file in the UI
2. Frontend calls `supabase.functions.invoke('get-upload-url', { body: { filename, contentType, category, linkedId } })`
3. Edge Function validates auth, generates presigned PUT URL
4. Frontend uploads directly to R2: `fetch(uploadUrl, { method: 'PUT', body: file })`
5. Frontend inserts metadata into `video_uploads` table
6. Playback: `<video src="${publicUrl}">`

### File Storage (Supabase Storage)

Upload pattern:
```javascript
const { data, error } = await supabase.storage
    .from('report-attachments')
    .upload(`${clubId}/${filename}`, file);

const { data: { publicUrl } } = supabase.storage
    .from('report-attachments')
    .getPublicUrl(`${clubId}/${filename}`);
```

### Frontend Refactoring Pattern

Replace `fetch(API_BASE_URL + '...')` with Supabase client:

```javascript
// Squad Manager — BEFORE:
async getSquads() {
    const res = await fetch(`${API_BASE_URL}/squads`);
    return await res.json();
}

// Squad Manager — AFTER:
async getSquads() {
    const { data, error } = await supabase
        .from('squads')
        .select('*')
        .order('name');
    if (error) throw error;
    return data;
}
```

The `club_id` is automatically enforced by RLS — no need to filter manually.

### Supabase Client Singleton

```javascript
// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default supabase;
```

### Auth Guard

```javascript
// src/auth.js
import supabase from './supabase.js';

export async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/src/pages/login.html';
        return null;
    }
    return session.user;
}

export async function getProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from('profiles')
        .select('*, clubs(name, logo_url)')
        .eq('id', user.id)
        .single();
    return data;
}

export async function signIn(email, password) {
    return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, metadata) {
    return await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata }  // { club_id, full_name, role }
    });
}

export async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/src/pages/login.html';
}
```

## Implementation Phases

### Phase 1: Foundation (Day 1 Morning)
1. Create Supabase project
2. Run `schema.sql` + `rls-policies.sql` + `storage-policies.sql`
3. Create storage buckets in Supabase Dashboard
4. Set up `.env`
5. Init Vite project: `npm install vite @supabase/supabase-js`
6. Create `supabase.js`, `auth.js`, `login.html`
7. Create initial club + admin user

### Phase 2: Auth + Core Data (Day 1 Afternoon)
1. Add auth guard to all pages
2. Refactor `squad-manager.js` → Supabase
3. Refactor `match-manager.js` → Supabase
4. Update squad/player/match UIs
5. Test full CRUD flow

### Phase 3: Sessions & Drills (Day 2 Morning)
1. Refactor `planner.js` → Supabase
2. Refactor library page → Supabase
3. Move drill images to Supabase Storage
4. Test session create/save/load

### Phase 4: Reports & Assessments (Day 2 Afternoon)
1. Refactor `reports-ui.js` → Supabase
2. Move report attachments to Supabase Storage
3. Refactor `player-profile-ui.js` → Supabase
4. Refactor analytics → Supabase
5. Test reports + assessments + analytics

### Phase 5: Match Plans + Video + Invites (Day 3 Morning)
1. Refactor `match-plan-ui.js` → Supabase
2. Set up Cloudflare R2 bucket
3. Deploy Edge Functions
4. Add video upload UI
5. Create admin invite system
6. Test end-to-end

### Phase 6: Polish & Deploy (Day 3 Afternoon)
1. Role-based UI visibility
2. User management page (admin)
3. Vite build optimization
4. Deploy to hosting platform
5. End-to-end testing

## What Stays Unchanged

- `drill-builder.js` — Canvas engine works entirely client-side, no API calls
- All CSS — No styling changes needed
- HTML page structure — Same pages, just moved to `src/pages/`
- Canvas drawing, token placement, pitch rendering — All client-side
- PDF export (jsPDF) — Client-side, unchanged
- Session autosave (localStorage) — Client-side, unchanged
