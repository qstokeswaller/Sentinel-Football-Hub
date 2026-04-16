-- ============================================================
-- Tuks Football Hub — Row Level Security Policies
-- Run AFTER schema.sql in Supabase SQL Editor
-- ============================================================


-- ── Helper Functions (in public schema) ─────────────────────
-- Note: Supabase does not allow creating functions in the auth schema.
-- We use public schema with SECURITY DEFINER so they can still read profiles.

-- Get the current user's club_id
CREATE OR REPLACE FUNCTION public.get_my_club_id()
RETURNS UUID AS $$
    SELECT club_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if the current user is a super_admin (developer-level access)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if the current user is an admin (includes super_admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if the current user has access to a specific squad
-- (admin/super_admin has access to all squads, coach/viewer only to assigned ones)
CREATE OR REPLACE FUNCTION public.has_squad_access(sq_id UUID)
RETURNS BOOLEAN AS $$
    SELECT
        -- Admins and super_admins can access all squads in their club
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
        OR
        -- Coaches/viewers can access assigned squads via squad_coaches
        EXISTS (
            SELECT 1 FROM squad_coaches
            WHERE coach_id = auth.uid() AND squad_id = sq_id
        )
        OR
        -- NULL squad_id = unassigned, accessible to club members
        sq_id IS NULL
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ── Enable RLS on all tables ────────────────────────────────

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_invites ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- CLUBS
-- Users can only see their own club
-- ============================================================

CREATE POLICY "clubs_select" ON clubs
    FOR SELECT USING (id = public.get_my_club_id());

-- Only service_role can create/update clubs (done via Edge Functions or admin panel)


-- ============================================================
-- PROFILES
-- Users can see all profiles in their club, update only their own
-- ============================================================

CREATE POLICY "profiles_select" ON profiles
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Admin can update any profile in their club (role changes, etc.)
CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE USING (club_id = public.get_my_club_id() AND public.is_admin());


-- ============================================================
-- SQUADS
-- All club members can see squads, only admins can manage
-- ============================================================

CREATE POLICY "squads_select" ON squads
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "squads_insert" ON squads
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id() AND public.is_admin());

CREATE POLICY "squads_update" ON squads
    FOR UPDATE USING (club_id = public.get_my_club_id() AND public.is_admin());

CREATE POLICY "squads_delete" ON squads
    FOR DELETE USING (club_id = public.get_my_club_id() AND public.is_admin());


-- ============================================================
-- SQUAD_COACHES
-- Admin manages assignments, coaches can see their own
-- ============================================================

CREATE POLICY "squad_coaches_select" ON squad_coaches
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM squads WHERE id = squad_id AND club_id = public.get_my_club_id())
    );

CREATE POLICY "squad_coaches_insert" ON squad_coaches
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM squads WHERE id = squad_id AND club_id = public.get_my_club_id())
        AND public.is_admin()
    );

CREATE POLICY "squad_coaches_delete" ON squad_coaches
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM squads WHERE id = squad_id AND club_id = public.get_my_club_id())
        AND public.is_admin()
    );


-- ============================================================
-- PLAYERS
-- Admin sees all, coaches see only assigned squads
-- ============================================================

CREATE POLICY "players_select" ON players
    FOR SELECT USING (
        club_id = public.get_my_club_id()
        AND public.has_squad_access(squad_id)
    );

CREATE POLICY "players_insert" ON players
    FOR INSERT WITH CHECK (
        club_id = public.get_my_club_id()
        AND public.has_squad_access(squad_id)
    );

CREATE POLICY "players_update" ON players
    FOR UPDATE USING (
        club_id = public.get_my_club_id()
        AND public.has_squad_access(squad_id)
    );

CREATE POLICY "players_delete" ON players
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND public.is_admin()
    );


-- ============================================================
-- MATCHES
-- Scoped by squad access
-- ============================================================

CREATE POLICY "matches_select" ON matches
    FOR SELECT USING (
        club_id = public.get_my_club_id()
        AND public.has_squad_access(squad_id)
    );

CREATE POLICY "matches_insert" ON matches
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "matches_update" ON matches
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "matches_delete" ON matches
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND public.is_admin()
    );


-- ============================================================
-- SESSIONS & DRILLS (SHARED — all club members can access)
-- ============================================================

CREATE POLICY "sessions_select" ON sessions
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "sessions_insert" ON sessions
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "sessions_update" ON sessions
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "sessions_delete" ON sessions
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND (public.is_admin() OR created_by = auth.uid())
    );

CREATE POLICY "drills_select" ON drills
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "drills_insert" ON drills
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "drills_update" ON drills
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "drills_delete" ON drills
    FOR DELETE USING (club_id = public.get_my_club_id());


-- ============================================================
-- REPORTS
-- Club-scoped, coaches can manage their own
-- ============================================================

CREATE POLICY "reports_select" ON reports
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "reports_insert" ON reports
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "reports_update" ON reports
    FOR UPDATE USING (
        club_id = public.get_my_club_id()
        AND (public.is_admin() OR created_by = auth.uid())
    );

CREATE POLICY "reports_delete" ON reports
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND (public.is_admin() OR created_by = auth.uid())
    );


-- ============================================================
-- ASSESSMENTS
-- Club-scoped
-- ============================================================

CREATE POLICY "assessments_select" ON assessments
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "assessments_insert" ON assessments
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "assessments_update" ON assessments
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "assessments_delete" ON assessments
    FOR DELETE USING (club_id = public.get_my_club_id());


-- ============================================================
-- DEV STRUCTURES
-- Club-scoped
-- ============================================================

CREATE POLICY "dev_structures_select" ON dev_structures
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "dev_structures_insert" ON dev_structures
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "dev_structures_update" ON dev_structures
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "dev_structures_delete" ON dev_structures
    FOR DELETE USING (club_id = public.get_my_club_id());


-- ============================================================
-- MATCH PLANS (SHARED within club)
-- ============================================================

CREATE POLICY "match_plans_select" ON match_plans
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "match_plans_insert" ON match_plans
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "match_plans_update" ON match_plans
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "match_plans_delete" ON match_plans
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND (public.is_admin() OR created_by = auth.uid())
    );


-- ============================================================
-- SQUAD ASSESSMENTS
-- Club-scoped
-- ============================================================

CREATE POLICY "squad_assessments_select" ON squad_assessments
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "squad_assessments_insert" ON squad_assessments
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "squad_assessments_update" ON squad_assessments
    FOR UPDATE USING (club_id = public.get_my_club_id());

CREATE POLICY "squad_assessments_delete" ON squad_assessments
    FOR DELETE USING (club_id = public.get_my_club_id());


-- ============================================================
-- VIDEO UPLOADS
-- Club-scoped, uploader or admin can delete
-- ============================================================

CREATE POLICY "video_uploads_select" ON video_uploads
    FOR SELECT USING (club_id = public.get_my_club_id());

CREATE POLICY "video_uploads_insert" ON video_uploads
    FOR INSERT WITH CHECK (club_id = public.get_my_club_id());

CREATE POLICY "video_uploads_delete" ON video_uploads
    FOR DELETE USING (
        club_id = public.get_my_club_id()
        AND (public.is_admin() OR uploaded_by = auth.uid())
    );


-- ============================================================
-- CLUB INVITES
-- Admin only
-- ============================================================

CREATE POLICY "invites_select" ON club_invites
    FOR SELECT USING (
        club_id = public.get_my_club_id() AND public.is_admin()
    );

CREATE POLICY "invites_insert" ON club_invites
    FOR INSERT WITH CHECK (
        club_id = public.get_my_club_id() AND public.is_admin()
    );

CREATE POLICY "invites_delete" ON club_invites
    FOR DELETE USING (
        club_id = public.get_my_club_id() AND public.is_admin()
    );
