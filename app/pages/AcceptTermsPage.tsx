import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { TERMS_VERSION } from '../lib/terms';

/**
 * AcceptTermsPage — the first-run / terms-changed veil. Shown to any signed-in user
 * whose `accepted_terms_version` is below the current TERMS_VERSION (existing users,
 * invited users who onboarded before this, or anyone after the terms change). Blocks
 * the whole app until they agree; on accept we record the version on their profile.
 */
export const AcceptTermsPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { refetchProfile } = useAppState();
  const { showError } = useToast();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!agreed || !user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ accepted_terms_version: TERMS_VERSION }).eq('id', user.id);
    setSaving(false);
    if (error) { showError(error); return; }
    refetchProfile();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-sentinel-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl p-7 text-center">
        <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center mx-auto mb-4"><ShieldCheck size={24} /></div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Agree to continue</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          To keep using Sentinel Football Hub, please review and accept our terms. This protects you, your club, and the players whose data you manage.
        </p>
        <label className="flex items-start gap-2.5 text-left mt-5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand shrink-0" />
          <span>I have read and agree to the <a href="/terms" target="_blank" rel="noopener" className="text-brand font-medium hover:underline">Terms &amp; Conditions</a> and <a href="/privacy" target="_blank" rel="noopener" className="text-brand font-medium hover:underline">Privacy Policy</a>.</span>
        </label>
        <button onClick={accept} disabled={!agreed || saving} className="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Agree & Continue'}
        </button>
        <button onClick={signOut} className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Sign out</button>
      </div>
    </div>
  );
};
