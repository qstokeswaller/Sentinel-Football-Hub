-- ============================================================
-- Migration 004: Invite validation RPC functions
-- Already applied via SQL Editor. Saved here for reference.
--
-- Problem: Unauthenticated users (new invitees) cannot read
-- club_invites due to RLS — invite validation fails on signup.
-- Solution: SECURITY DEFINER RPCs that bypass RLS.
-- ============================================================

-- Validate invite token — returns club name, role, email
-- Safe for anonymous callers (only returns specific invite info)
CREATE OR REPLACE FUNCTION validate_invite(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'club_id', ci.club_id,
    'role', ci.role,
    'club_name', c.name,
    'email', ci.email
  ) INTO result
  FROM club_invites ci
  JOIN clubs c ON c.id = ci.club_id
  WHERE ci.token = invite_token
    AND ci.used_at IS NULL
    AND ci.expires_at > now();

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_invite(text) TO anon, authenticated;

-- Mark invite as used after signup (bypasses RLS)
CREATE OR REPLACE FUNCTION use_invite(invite_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE club_invites
  SET used_at = now()
  WHERE token = invite_token
    AND used_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION use_invite(text) TO anon, authenticated;
