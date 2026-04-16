-- ============================================================
-- Migration 002: Platform Admin — UPDATE profiles (role changes)
-- Run this in Supabase SQL Editor.
--
-- Problem: Platform admins (super_admin + club_id IS NULL) cannot
-- update other users' profiles because the existing
-- profiles_update_admin policy uses get_my_club_id() which
-- returns NULL for platform admins, causing the club_id match
-- to fail.
-- ============================================================

-- Platform admins can UPDATE any profile (role changes, etc.)
CREATE POLICY "platform_admins_update_profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
        AND p.club_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
        AND p.club_id IS NULL
    )
  );
