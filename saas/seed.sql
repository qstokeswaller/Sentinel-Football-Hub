-- ============================================================
-- Football Performance Hub — Seed Data
-- Run AFTER schema.sql and rls-policies.sql
-- ============================================================
-- This creates your initial club. After running this:
-- 1. Note the club UUID from the output
-- 2. Create an admin user in Supabase Auth dashboard with:
--    raw_user_meta_data = { "club_id": "<UUID>", "full_name": "Your Name", "role": "admin" }
-- ============================================================

-- Create your club (change the name to your club)
INSERT INTO clubs (name)
VALUES ('UP Performance')
RETURNING id, name;

-- After creating your admin user via Supabase Auth dashboard,
-- verify the profile was auto-created:
-- SELECT * FROM profiles;

-- To manually fix a profile if the trigger didn't fire:
-- UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';
