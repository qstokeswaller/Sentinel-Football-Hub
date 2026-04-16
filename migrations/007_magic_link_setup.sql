-- ============================================================
-- Migration 007: Magic Link Admin Provisioning Setup
-- ============================================================
-- This migration supports the new magic link invite flow where
-- the Edge Function creates users via auth.admin.inviteUserByEmail().
-- The profile is pre-created by the Edge Function, but this trigger
-- ensures a profile always exists as a safety net.
-- ============================================================

-- Safety-net trigger: auto-create a profile row when a new auth user is created
-- (handles edge cases where the Edge Function's profile insert fails)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, club_id, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    (NEW.raw_user_meta_data->>'club_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'role', 'coach'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;  -- Don't overwrite if Edge Function already created it
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- IMPORTANT: Manual Steps After Running This SQL
-- ============================================================
--
-- 1. Deploy the Edge Function:
--    supabase functions deploy provision-club-admin
--
-- 2. Set the APP_URL secret (your LIVE domain, not localhost):
--    supabase secrets set APP_URL=https://your-amplify-domain.amplifyapp.com
--
-- 3. Configure Supabase Auth redirect URLs:
--    Go to: Supabase Dashboard > Authentication > URL Configuration
--    - Site URL: https://your-amplify-domain.amplifyapp.com
--    - Redirect URLs (add these):
--      https://your-amplify-domain.amplifyapp.com/src/pages/login.html
--      http://localhost:3001/src/pages/login.html  (for local dev)
--
-- 4. (Optional) Customize invite email template:
--    Go to: Supabase Dashboard > Authentication > Email Templates > Invite
--    Edit the template to include your branding / club name.
--
-- ============================================================
