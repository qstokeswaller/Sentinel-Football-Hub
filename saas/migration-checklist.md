# Migration Checklist — SQLite to Supabase

## Pre-Migration Setup

- [ ] Create Supabase project at https://supabase.com
- [ ] Note down: Project URL, anon key, service role key
- [ ] Create Cloudflare account and R2 bucket (`football-hub-videos`)
- [ ] Generate R2 API tokens (Access Key ID + Secret)
- [ ] Copy `saas/env-template` to `.env` and fill in all values

## Phase 1: Database Setup

- [ ] Open Supabase SQL Editor
- [ ] Run `saas/schema.sql` — creates all 15 tables + indexes + triggers
- [ ] Run `saas/rls-policies.sql` — creates helper functions + all RLS policies
- [ ] Verify: check Tables tab, confirm all 15 tables exist
- [ ] Verify: check Database > Policies, confirm RLS is enabled on all tables

## Phase 2: Storage Setup

- [ ] Go to Storage in Supabase Dashboard
- [ ] Create bucket: `report-attachments` (Private, 50MB limit)
- [ ] Create bucket: `player-documents` (Private, 25MB limit)
- [ ] Create bucket: `drill-images` (Private, 10MB limit)
- [ ] Create bucket: `session-images` (Private, 10MB limit)
- [ ] Create bucket: `avatars` (Private, 5MB limit)
- [ ] Run `saas/storage-policies.sql` — applies access policies to all buckets

## Phase 3: Auth Setup

- [ ] Go to Authentication > Providers in Supabase Dashboard
- [ ] Ensure Email provider is enabled
- [ ] Enable "Confirm email" for new signups
- [ ] Set Site URL to your app URL (e.g., `http://localhost:5173`)
- [ ] Add redirect URLs: `http://localhost:5173/**`
- [ ] Test: create a user via Supabase Auth dashboard
- [ ] Verify: check `profiles` table — new row should auto-create via trigger

## Phase 4: Seed Data

- [ ] Create your club in the `clubs` table manually:
  ```sql
  INSERT INTO clubs (name) VALUES ('Your Club Name') RETURNING id;
  ```
- [ ] Note the returned club UUID
- [ ] Create admin user via Supabase Auth with metadata:
  ```sql
  -- Or use the Auth dashboard and set raw_user_meta_data:
  -- { "club_id": "<club_uuid>", "full_name": "Admin Name", "role": "admin" }
  ```
- [ ] Verify: admin profile exists in `profiles` table

## Phase 5: Project Restructure (Vite)

- [ ] Initialize new Vite project or convert existing:
  ```bash
  npm install vite @supabase/supabase-js
  ```
- [ ] Copy `saas/vite.config.js` to project root
- [ ] Copy `.env` to project root
- [ ] Create directory structure:
  ```
  src/
  ├── main.js
  ├── supabase.js
  ├── auth.js
  ├── managers/
  ├── pages/      (move HTML from docs/)
  ├── js/         (move JS from docs/js/)
  └── css/        (move CSS from docs/css/)
  ```
- [ ] Move HTML files from `docs/` to `src/pages/`
- [ ] Move JS files from `docs/js/` to `src/js/`
- [ ] Move CSS files from `docs/css/` to `src/css/`
- [ ] Update all HTML `<script src>` and `<link href>` paths
- [ ] Create `src/supabase.js` (Supabase client singleton)
- [ ] Create `src/auth.js` (login/signup/logout/guard functions)
- [ ] Create `src/pages/login.html` (login/signup page)
- [ ] Test: `npm run dev` — verify pages load

## Phase 6: Refactor API Calls

### Pattern: Replace fetch → Supabase client

Every file that does `fetch(API_BASE_URL + '/...')` needs to change:

```javascript
// BEFORE:
const res = await fetch(`${API_BASE_URL}/players?squadId=${id}`);
const players = await res.json();

// AFTER:
import supabase from '../supabase.js';
const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .eq('squad_id', id);
```

### Files to refactor (in order):

- [ ] `api-config.js` → DELETE (replaced by `supabase.js`)
- [ ] `squad-manager.js` → Supabase queries for squads + players
- [ ] `match-manager.js` → Supabase queries for matches
- [ ] `squad-ui.js` → Use refactored squad-manager
- [ ] `player-ui.js` → Use refactored squad-manager
- [ ] `player-profile-ui.js` → Supabase for assessments, dev_structures
- [ ] `match-ui.js` → Use refactored match-manager
- [ ] `match-plan-ui.js` → Supabase for match_plans
- [ ] `planner.js` → Supabase for sessions + drills
- [ ] `reports-ui.js` → Supabase for reports + file uploads to Storage
- [ ] `analytics-ui.js` → Supabase aggregate queries (or database functions)
- [ ] Dashboard JS → Supabase for stats/counts

### Key changes per manager:

**squad-manager.js:**
- `getSquads()` → `supabase.from('squads').select('*').eq('club_id', clubId)`
- `getPlayers()` → `supabase.from('players').select('*').eq('squad_id', id)`
- All CRUD → Supabase `.insert()`, `.update()`, `.delete()`

**match-manager.js:**
- `getMatches()` → `supabase.from('matches').select('*').eq('club_id', clubId)`

**planner.js:**
- `saveSession()` → Supabase transaction: insert session + insert drills
- `loadSession()` → `supabase.from('sessions').select('*, drills(*)').eq('id', id)`
- `listSessions()` → `supabase.from('sessions').select('*').eq('club_id', clubId)`

**reports-ui.js:**
- File uploads → Supabase Storage `.upload()` instead of base64 in body
- Report CRUD → Supabase queries

## Phase 7: Auth Guard

- [ ] Add to every HTML page (except login):
  ```html
  <script type="module">
  import { requireAuth } from '../auth.js';
  await requireAuth(); // Redirects to login if not authenticated
  </script>
  ```
- [ ] Add user menu to sidebar (name, role, logout button)
- [ ] Show/hide admin-only features based on `profile.role`

## Phase 8: Edge Functions

- [ ] Deploy `get-upload-url`:
  ```bash
  supabase functions deploy get-upload-url
  ```
- [ ] Set Edge Function secrets:
  ```bash
  supabase secrets set R2_ACCOUNT_ID=xxx R2_ACCESS_KEY_ID=xxx R2_SECRET_ACCESS_KEY=xxx R2_BUCKET_NAME=football-hub-videos R2_PUBLIC_DOMAIN=xxx
  ```
- [ ] Deploy `create-invite`:
  ```bash
  supabase functions deploy create-invite
  ```
- [ ] Set Edge Function secrets:
  ```bash
  supabase secrets set APP_URL=http://localhost:5173
  ```
- [ ] Test: call functions via `supabase.functions.invoke()`

## Phase 9: Data Migration (Optional)

If migrating existing SQLite data to Supabase:

- [ ] Export SQLite tables to JSON:
  ```bash
  sqlite3 data/data.db -json "SELECT * FROM squads" > squads.json
  sqlite3 data/data.db -json "SELECT * FROM players" > players.json
  # ... repeat for all tables
  ```
- [ ] Transform JSON: rename columns (camelCase → snake_case)
- [ ] Add `club_id` to every row
- [ ] Import via Supabase dashboard (Table Editor > Import) or SQL INSERT
- [ ] Map old TEXT IDs to new UUIDs (create a mapping table)

### Column name mapping:
| SQLite (camelCase) | PostgreSQL (snake_case) |
|--------------------|------------------------|
| squadId | squad_id |
| isPast | is_past |
| homeScore | home_score |
| awayScore | away_score |
| homeTeam | home_team |
| awayTeam | away_team |
| ourSide | our_side |
| startTime | start_time |
| playersCount | players_count |
| abilityLevel | ability_level |
| createdAt | created_at |
| sessionId | session_id |
| pitchType | pitch_type |
| drawingData | drawing_data |
| orderIndex | order_index |
| playerId | player_id |
| matchId | match_id |
| drillNotes | drill_notes |
| trainingLoad | training_load |
| absentPlayerIds | absent_player_ids |
| previousClubs | previous_clubs |
| analysisVideos | analysis_videos |
| updatedAt | updated_at |

## Phase 10: Deploy

- [ ] Build: `npm run build`
- [ ] Deploy to Vercel/Netlify/Supabase Hosting
- [ ] Update environment variables in deployment platform
- [ ] Update Supabase Auth Site URL + redirect URLs
- [ ] Update R2 CORS config if needed
- [ ] End-to-end smoke test on production
