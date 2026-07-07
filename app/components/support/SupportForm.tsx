import React, { useState, useEffect } from 'react';
import { AlertCircle, Lightbulb, LifeBuoy, CreditCard, Send, Check } from 'lucide-react';
import { Input, Textarea, Label } from '../ui/Input';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { TIER_LABELS, type Tier } from '../../lib/tiers';

/**
 * SupportForm — the in-app "Help & Support" contact form. Mirrors the Sentinel
 * SportsLab support panel: pick a category, your name + reply-to email are
 * pre-filled, and we auto-attach the org + plan + role (+ an optional page topic)
 * so we have context. Submits to the SAME backend as the marketing form
 * (POST /api/contact → Resend → BRAND.support). No new email plumbing needed —
 * set RESEND_API_KEY + BRAND.support and every form routes to that inbox.
 */
export type SupportCategory = 'bug' | 'feature' | 'general' | 'billing';

const CATEGORIES: { id: SupportCategory; label: string; desc: string; icon: React.ElementType }[] = [
  { id: 'bug',     label: 'Report a bug',    desc: 'Something is broken or behaving unexpectedly', icon: AlertCircle },
  { id: 'feature', label: 'Feature request', desc: 'An idea or improvement you would like to see',  icon: Lightbulb },
  { id: 'general', label: 'General support', desc: 'Help using a feature, your account, or data',   icon: LifeBuoy },
  { id: 'billing', label: 'Billing & plans', desc: 'Tier changes, invoices, seats, renewals',       icon: CreditCard },
];

export const SupportForm: React.FC<{ defaultCategory?: SupportCategory; contextLabel?: string }> = ({ defaultCategory = 'general', contextLabel }) => {
  const { user } = useAuth();
  const { profile, club, tier, role } = useAppState();
  const { showToast } = useToast();

  const [category, setCategory] = useState<SupportCategory>(defaultCategory);
  const [name, setName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { setCategory(defaultCategory); }, [defaultCategory]);
  useEffect(() => { if (profile?.full_name) setName(profile.full_name); }, [profile?.full_name]);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);

  const orgName = club?.settings?.branding?.club_display_name || club?.name || '';
  const planLabel = TIER_LABELS[tier as Tier] || tier;
  const chip = 'text-[11px] font-semibold rounded-full px-2.5 py-1';

  const send = async () => {
    if (!name.trim() || !email.trim()) { showToast('Your name and reply-to email are required.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { showToast('Please enter a valid reply-to email.', 'error'); return; }
    if (!message.trim()) { showToast('Please tell us what you need in the message.', 'error'); return; }
    setSending(true);
    try {
      const body = {
        subject: category,
        name: name.trim(),
        email: email.trim(),
        organisation: orgName,
        message: (subject.trim() ? `Subject: ${subject.trim()}\n\n` : '') + message.trim(),
        meta: { tier: planLabel, role: role || undefined, context: contextLabel || undefined },
      };
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setSent(true); }
      else showToast((data as any).error || 'Could not send your message. Please try again.', 'error');
    } catch {
      showToast('Network error — please try again, or email us directly.', 'error');
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center mx-auto mb-3"><Check size={24} /></div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Message sent</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Thanks — we'll reply to <strong className="text-slate-700 dark:text-slate-200">{email}</strong> within one business day.</p>
        <Button variant="secondary" className="mt-4" onClick={() => { setSent(false); setMessage(''); setSubject(''); }}>Send another message</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Help &amp; Support</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Reach us directly from the platform. We auto-attach your club + plan so we have context.</p>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {orgName && <span className={chip + ' bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}>Club: {orgName}</span>}
        <span className={chip + ' bg-brand/10 text-brand'}>{planLabel} plan</span>
        {role && <span className={chip + ' bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 capitalize'}>{role}</span>}
        {contextLabel && <span className={chip + ' bg-sky-500/10 text-sky-600 dark:text-sky-400'}>Re: {contextLabel}</span>}
      </div>

      {/* Category cards */}
      <Label className="mb-2">What's this about?</Label>
      <div className="grid sm:grid-cols-2 gap-2 mb-5">
        {CATEGORIES.map(c => {
          const Icon = c.icon; const active = category === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)}
              className={'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ' +
                (active ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'border-slate-200 dark:border-sentinel-border hover:border-brand/60')}>
              <Icon size={18} className={'shrink-0 mt-0.5 ' + (active ? 'text-brand' : 'text-slate-400')} />
              <div className="min-w-0">
                <div className={'text-sm font-semibold ' + (active ? 'text-brand' : 'text-slate-900 dark:text-white')}>{c.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{c.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div><Label>Your name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></div>
        <div><Label>Reply-to email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@club.com" /></div>
      </div>
      <div className="mb-3"><Label>Subject (optional)</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="A short headline for your message" /></div>
      <div className="mb-2">
        <Label>Message</Label>
        <Textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 5000))} rows={6} placeholder="Tell us what you need — the more detail, the faster we can help." />
        <div className="text-[11px] text-slate-400 text-right mt-1">{message.length}/5000</div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-400">We reply within one business day. Reply-to is set to your email.</p>
        <Button variant="primary" onClick={send} disabled={sending}><Send size={15} /> {sending ? 'Sending…' : 'Send Message'}</Button>
      </div>
    </div>
  );
};
