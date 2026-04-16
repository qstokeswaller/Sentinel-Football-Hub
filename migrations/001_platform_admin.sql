-- ============================================================
-- Migration 001: Platform Admin Support
-- Run this in Supabase SQL Editor BEFORE deploying the frontend.
-- ============================================================

-- 1. Allow super_admin profiles to have NULL club_id (platform-level users)
ALTER TABLE profiles ALTER COLUMN club_id DROP NOT NULL;

-- 2. Update the get_my_club_id() helper to handle platform admins
--    Platform admins (club_id IS NULL) should NOT match any club's RLS.
--    They get cross-club read access via separate policies below.
CREATE OR REPLACE FUNCTION get_my_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT club_id FROM profiles WHERE id = auth.uid();
$$;

-- 3. RLS policy: Platform admins (super_admin + NULL club_id) can read ALL clubs
CREATE POLICY "platform_admins_read_all_clubs"
  ON clubs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );

-- 4. RLS policy: Platform admins can read ALL profiles (cross-club)
CREATE POLICY "platform_admins_read_all_profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
        AND p.club_id IS NULL
    )
  );

-- 5. RLS policy: Platform admins can read ALL players (cross-club)
CREATE POLICY "platform_admins_read_all_players"
  ON players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );

-- 6. RLS policy: Platform admins can INSERT into clubs (create new clubs)
CREATE POLICY "platform_admins_insert_clubs"
  ON clubs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );

-- 7. RLS policy: Platform admins can INSERT club_invites (invite admins to new clubs)
CREATE POLICY "platform_admins_insert_invites"
  ON club_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );

-- ============================================================
-- MANUAL STEP: Set your own profile to platform admin
-- Replace YOUR_USER_ID with your auth.users UUID.
-- ============================================================
-- UPDATE profiles
-- SET club_id = NULL, role = 'super_admin'
-- WHERE id = 'YOUR_USER_ID';
-- ============================================================
