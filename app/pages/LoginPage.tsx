import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { TERMS_VERSION } from '../lib/terms';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

/**
 * Full branded login — ported from src/pages/login.html (CSS-as-is via login.css).
 * Modes: sign in / sign up (sliding overlay), forgot-password, invite, and the
 * password-recovery set-new-password form. Redirects go through react-router.
 */

type Tier = 'free' | 'basic' | 'pro' | 'elite';
const TIERS: { id: Tier; name: string; price: string; popular?: boolean }[] = [
  { id: 'free',  name: 'Free',  price: 'R0/month' },
  { id: 'basic', name: 'Basic', price: 'R249/month', popular: true },
  { id: 'pro',   name: 'Pro',   price: 'R499/month' },
  { id: 'elite', name: 'Elite', price: 'R899/month' },
];
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', coach: 'Coach', viewer: 'Viewer' };

interface InviteInfo { club_id: string; club_name: string; role: string; email?: string; }

/** Public auth pages always render light (the vanilla login has no theme). Remove
 *  the app's [data-theme="dark"] while mounted, restore it on unmount. */
function useForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    const had = root.getAttribute('data-theme');
    if (had) root.removeAttribute('data-theme');
    return () => { if (had) root.setAttribute('data-theme', had); };
  }, []);
}

// ── Password-recovery form (shown when arriving via a recovery link) ──
const RecoveryForm: React.FC = () => {
  const { clearPasswordUpdate } = useAuth();
  const navigate = useNavigate();
  useForceLightMode();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ text: string; cls: 'error' | 'success' } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg({ text: 'Password must be at least 8 characters.', cls: 'error' });
    if (pw !== confirm) return setMsg({ text: 'Passwords do not match.', cls: 'error' });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setMsg({ text: friendlyError(error), cls: 'error' }); setBusy(false); return; }
    setMsg({ text: 'Password updated — redirecting to your dashboard…', cls: 'success' });
    setTimeout(() => { clearPasswordUpdate(); navigate('/dashboard', { replace: true }); }, 1200);
  };

  return (
    <div className="login-page">
      <div className="auth-wrapper" style={{ maxWidth: 440 }}>
        <div className="form-panel" style={{ flex: '1 1 100%' }}>
          <h1 className="panel-title">Set a new password</h1>
          <p className="panel-subtitle">Choose a new password for your account. You'll be signed in once it's saved.</p>
          {msg && <div className={`auth-msg ${msg.cls}`} style={{ display: 'block' }}>{msg.text}</div>}
          <form onSubmit={submit}>
            <div className="field-group">
              <label>New Password</label>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
            </div>
            <div className="field-group">
              <label>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" minLength={8} required />
            </div>
            <button type="submit" className="btn-submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

const LoginPage: React.FC = () => {
  const { needsPasswordUpdate } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [selectedTier, setSelectedTier] = useState<Tier>('basic');

  // Sign-in
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [signinMsg, setSigninMsg] = useState<{ text: string; cls: 'error' | 'success' } | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);

  // Sign-up
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [clubName, setClubName] = useState('');
  const [signupMsg, setSignupMsg] = useState<string | null>(null);
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupDone, setSignupDone] = useState<{ email: string; firstName: string; needsConfirm: boolean } | null>(null);

  // Invite
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteInvalid, setInviteInvalid] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // ── Invite flow: ?invite / ?token → switch to signup + validate ──
  useEffect(() => {
    const token = params.get('invite') || params.get('token');
    if (!token) return;
    setInviteToken(token);
    setMode('signup');
    (async () => {
      const { data: inv } = await supabase.rpc('validate_invite', { invite_token: token });
      if (inv) {
        setInviteInfo(inv as InviteInfo);
        if ((inv as InviteInfo).email) setSuEmail((inv as InviteInfo).email!);
        setClubName((inv as InviteInfo).club_name || '');
      } else {
        setInviteInvalid(true);
        setSignupMsg('This invite link is invalid or has expired. Contact your administrator for a new one.');
      }
    })();
  }, [params]);

  useForceLightMode();

  // Arriving via a recovery link → set-new-password form
  if (needsPasswordUpdate) return <RecoveryForm />;

  const handleForgot = useCallback(async () => {
    const email = siEmail.trim();
    if (!email) { setSigninMsg({ text: 'Enter your email address first, then click Forgot Password.', cls: 'error' }); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    if (error) setSigninMsg({ text: friendlyError(error), cls: 'error' });
    else setSigninMsg({ text: 'Password reset email sent — check your inbox.', cls: 'success' });
  }, [siEmail]);

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninMsg(null);
    setSigninBusy(true);
    try {
      if (!siEmail || !siPassword) throw new Error('Email and password are required.');
      const { error } = await supabase.auth.signInWithPassword({ email: siEmail.trim(), password: siPassword });
      if (error) throw error;
      // AuthContext picks up SIGNED_IN; route into the app.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setSigninMsg({ text: friendlyError(err), cls: 'error' });
      setSigninBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);
    setSignupBusy(true);
    try {
      if (!firstName.trim()) throw new Error('First name is required.');
      if (!surname.trim()) throw new Error('Surname is required.');
      if (!suEmail.trim()) throw new Error('Email address is required.');
      if (suPassword.length < 8) throw new Error('Password must be at least 8 characters.');
      if (suPassword !== suConfirm) throw new Error('Passwords do not match.');
      if (!agreed) throw new Error('Please agree to the Terms & Conditions and Privacy Policy to continue.');
      if (!clubName.trim() && !inviteToken) throw new Error('Club or organisation name is required.');

      const fullName = `${firstName} ${surname}`.trim();
      let clubId: string | null = null;
      let role = 'admin';
      let resolvedClubName = clubName.trim();

      if (inviteToken) {
        const { data: inv } = await supabase.rpc('validate_invite', { invite_token: inviteToken });
        if (!inv) throw new Error('Invalid or expired invite link. Contact your administrator.');
        clubId = (inv as InviteInfo).club_id;
        role = (inv as InviteInfo).role;
        resolvedClubName = (inv as InviteInfo).club_name;
      }

      const { data, error } = await supabase.auth.signUp({
        email: suEmail.trim(),
        password: suPassword,
        options: {
          data: {
            full_name: fullName,
            club_id: clubId,
            club_name: resolvedClubName,
            role,
            pending_tier: inviteToken ? null : selectedTier,
            terms_version: TERMS_VERSION,
          },
        },
      });
      if (error) throw error;

      if (inviteToken) await supabase.rpc('use_invite', { invite_token: inviteToken });

      if (data.user && !data.session) {
        // Email confirmation required
        setSignupDone({ email: suEmail.trim(), firstName: firstName.trim(), needsConfirm: true });
      } else {
        // Auto-confirmed → route in
        setSignupDone({ email: suEmail.trim(), firstName: firstName.trim(), needsConfirm: false });
        setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
      }
    } catch (err) {
      setSignupMsg(friendlyError(err));
      setSignupBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className={`auth-wrapper${mode === 'signup' ? ' signup-active' : ''}`}>

        {/* ── SIGN IN PANEL ── */}
        <div className="form-panel" id="signinPanel">
          <div>
            <h1 className="panel-title">Sign In</h1>
            <p className="panel-subtitle">Welcome back to your coaching dashboard</p>
            {signinMsg && <div className={`auth-msg ${signinMsg.cls}`} style={{ display: 'block' }}>{signinMsg.text}</div>}
            <form onSubmit={handleSignin} noValidate>
              <div className="field-group">
                <label>Email Address</label>
                <input type="email" value={siEmail} onChange={e => setSiEmail(e.target.value)} placeholder="coach@club.com" autoComplete="email" required />
              </div>
              <div className="field-group">
                <label>Password</label>
                <input type="password" value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required />
              </div>
              <a className="forgot-link" tabIndex={0} onClick={handleForgot}>Forgot your password?</a>
              <button type="submit" className="btn-submit" disabled={signinBusy}>
                <i className="fas fa-sign-in-alt" style={{ marginRight: 8 }} />{signinBusy ? 'Signing In…' : 'Sign In'}
              </button>
            </form>
            <div className="form-divider" style={{ marginTop: 20 }}>
              <span style={{ whiteSpace: 'nowrap', color: '#94a3b8' }}>Don't have an account?</span>
            </div>
            <button className="btn-overlay" onClick={() => setMode('signup')}
              style={{ width: '100%', background: 'transparent', border: '2px solid #e2e8f0', color: '#475569', borderRadius: 10, padding: 10, fontFamily: "'Inter',sans-serif", cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              Create an account
            </button>
          </div>
        </div>

        {/* ── SIGN UP PANEL ── */}
        <div className="form-panel" id="signupPanel">
          <div>
            {signupDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '3rem', color: '#00C49A', marginBottom: 16 }}>
                  <i className={`fas ${signupDone.needsConfirm ? 'fa-envelope-open-text' : 'fa-check-circle'}`} />
                </div>
                {signupDone.needsConfirm ? (
                  <>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Check your inbox!</h3>
                    <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.7, marginBottom: 16 }}>
                      We sent a confirmation email to <strong>{signupDone.email}</strong>.<br />Click the link to verify your account.
                    </p>
                    <button className="btn-submit" style={{ maxWidth: 200, margin: '0 auto' }} onClick={() => { setSignupDone(null); setMode('signin'); }}>Back to Sign In</button>
                  </>
                ) : (
                  <>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Welcome, {signupDone.firstName}!</h3>
                    <p style={{ fontSize: '0.85rem', color: '#475569' }}>Redirecting you now…</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <h1 className="panel-title">Create Account</h1>
                <p className="panel-subtitle">Start managing your club smarter today</p>
                {inviteInfo && (
                  <div className="invite-banner show">
                    <i className="fas fa-envelope-open-text" style={{ marginRight: 6, color: '#00C49A' }} />
                    You've been invited to join <strong>{inviteInfo.club_name}</strong> as <strong>{ROLE_LABELS[inviteInfo.role] || inviteInfo.role}</strong>.
                  </div>
                )}
                {signupMsg && <div className="auth-msg error" style={{ display: 'block' }}>{signupMsg}</div>}
                <form onSubmit={handleSignup} noValidate>
                  <div className="name-row">
                    <div className="field-group">
                      <label>First Name *</label>
                      <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" required />
                    </div>
                    <div className="field-group">
                      <label>Surname *</label>
                      <input type="text" value={surname} onChange={e => setSurname(e.target.value)} placeholder="Surname" autoComplete="family-name" required />
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Email Address *</label>
                    <input type="email" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="coach@club.com" autoComplete="email" readOnly={!!inviteInfo?.email} required />
                  </div>
                  <div className="name-row">
                    <div className="field-group">
                      <label>Password *</label>
                      <input type="password" value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" minLength={8} required />
                    </div>
                    <div className="field-group">
                      <label>Confirm Password *</label>
                      <input type="password" value={suConfirm} onChange={e => setSuConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" minLength={8} required />
                    </div>
                  </div>
                  {!inviteToken && (
                    <div className="field-group">
                      <label>Club / Organisation Name *</label>
                      <input type="text" value={clubName} onChange={e => setClubName(e.target.value)} placeholder="e.g. Northside FC" autoComplete="organization" required />
                    </div>
                  )}
                  {!inviteToken && (
                    <>
                      <div className="tier-label"><i className="fas fa-layer-group" style={{ marginRight: 5, color: '#00C49A' }} />Choose your plan</div>
                      <div className="tier-grid">
                        {TIERS.map(t => (
                          <div key={t.id} className={`tier-chip${selectedTier === t.id ? ' selected' : ''}`} onClick={() => setSelectedTier(t.id)}>
                            {t.popular && <span className="tier-popular">Popular</span>}
                            <span className="tier-chip-name">{t.name}</span>
                            <span className="tier-chip-price">{t.price}</span>
                            <div className="tier-chip-check"><i className="fas fa-check" /></div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '4px 0 14px', fontSize: '0.8rem', color: '#475569', cursor: 'pointer', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: '#00C49A', flexShrink: 0 }} />
                    <span>I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: '#00C49A', fontWeight: 600 }}>Terms &amp; Conditions</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: '#00C49A', fontWeight: 600 }}>Privacy Policy</a>.</span>
                  </label>
                  <button type="submit" className="btn-submit" disabled={signupBusy || inviteInvalid || !agreed}>
                    <i className="fas fa-shield-alt" style={{ marginRight: 8 }} />{signupBusy ? 'Creating Account…' : 'Create Account'}
                  </button>
                </form>
                <div className="form-divider" style={{ marginTop: 20 }}>
                  <span style={{ whiteSpace: 'nowrap', color: '#94a3b8' }}>Already have an account?</span>
                </div>
                <button className="btn-overlay" onClick={() => setMode('signin')}
                  style={{ width: '100%', background: 'transparent', border: '2px solid #e2e8f0', color: '#475569', borderRadius: 10, padding: 10, fontFamily: "'Inter',sans-serif", cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                  Sign in instead
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── SLIDING OVERLAY ── */}
        <div className="overlay-panel">
          <div className={`overlay-content${mode === 'signup' ? ' oc-hidden' : ''}`}>
            <div className="ov-brand"><i className="fas fa-shield-alt" /><span className="ov-brand-name">Sentinel Football Hub</span></div>
            <div className="ov-icon"><i className="fas fa-users" /></div>
            <h2 className="ov-title">Hey There!</h2>
            <p className="ov-subtitle">Begin your journey by creating an account.<br />Manage your squads, matches, and more — all in one place.</p>
            <button className="btn-overlay" onClick={() => setMode('signup')}>Get Started <i className="fas fa-arrow-right" style={{ marginLeft: 6, fontSize: '0.8em' }} /></button>
          </div>
          <div className={`overlay-content${mode === 'signin' ? ' oc-hidden' : ''}`}>
            <div className="ov-brand"><i className="fas fa-shield-alt" /><span className="ov-brand-name">Sentinel Football Hub</span></div>
            <div className="ov-icon"><i className="fas fa-shield-alt" /></div>
            <h2 className="ov-title">Welcome Back!</h2>
            <p className="ov-subtitle">Stay connected by signing in with your credentials and continue your coaching journey.</p>
            <button className="btn-overlay" onClick={() => setMode('signin')}>Sign In <i className="fas fa-arrow-right" style={{ marginLeft: 6, fontSize: '0.8em' }} /></button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
