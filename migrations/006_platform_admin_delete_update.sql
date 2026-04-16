-- ============================================================
-- Migration 006: Platform Admin DELETE + UPDATE on clubs
-- Run this in Supabase SQL Editor.
-- Allows super_admins (platform admins) to delete and update clubs.
-- ============================================================

-- 1. Platform admins can DELETE clubs
CREATE POLICY "platform_admins_delete_clubs"
  ON clubs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );

-- 2. Platform admins can UPDATE clubs (settings, name, branding)
CREATE POLICY "platform_admins_update_clubs"
  ON clubs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.club_id IS NULL
    )
  );
