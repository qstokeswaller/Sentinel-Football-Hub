/**
 * Translates raw technical/Supabase error messages into plain user-friendly text.
 * Always call this before showing err.message in a toast or UI element.
 * Ported verbatim from src/toast.js.
 */
export function friendlyError(err: unknown): string {
  const msg = ((err as any)?.message || String(err) || '').toLowerCase();

  // Auth errors
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email address first — check your inbox for a verification link.';
  if (msg.includes('user already registered') || msg.includes('already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('token has expired') || msg.includes('token expired') || msg.includes('otp_expired')) return 'This link has expired. Please request a new one.';
  if (msg.includes('password should be at least') || msg.includes('password must be at least')) return 'Password is too short. Use at least 8 characters.';
  if (msg.includes('unable to validate email') || (msg.includes('email') && msg.includes('invalid format'))) return 'Please enter a valid email address.';
  if (msg.includes('signup is disabled') || msg.includes('signups not allowed')) return 'New sign-ups are currently disabled. Please contact support.';
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || msg.includes('too many requests')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (msg.includes('invalid refresh token') || msg.includes('session_not_found')) return 'Your session has expired. Please sign in again.';

  // Permission / RLS errors
  if (msg.includes('row-level security') || msg.includes('rls')) return "You don't have permission to do this. Contact your club administrator.";
  if (msg.includes('permission denied')) return "You don't have permission to do this.";
  if (msg.includes('insufficient_privilege')) return "You don't have permission to perform this action.";

  // Network errors
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed')) return 'Connection error. Please check your internet and try again.';

  // DB constraint errors
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) return 'This record already exists.';
  if (msg.includes('foreign key constraint')) return 'This item is linked to other data and cannot be removed.';
  if (msg.includes('not-null constraint') || msg.includes('null value in column')) return 'Some required fields are missing. Please check and try again.';

  // Storage errors
  if (msg.includes('payload too large') || msg.includes('request entity too large')) return 'The file is too large to upload.';
  if (msg.includes('the resource already exists')) return 'A file with this name already exists.';
  if (msg.includes('object not found') || msg.includes('storage/object-not-found')) return 'File not found — it may have been deleted.';

  // Generic fallback — never expose raw Supabase internals
  return 'Something went wrong. Please try again. If the problem continues, contact support.';
}
