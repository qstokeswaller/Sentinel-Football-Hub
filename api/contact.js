/**
 * Vercel Serverless Function — Contact form submission
 *
 * POST /api/contact
 * Body: { subject, name, email, organisation?, message }
 *
 * Sends a notification email to the support inbox via Resend, with reply_to set
 * to the submitter so hitting "Reply" in Zoho replies directly to them.
 *
 * Requires env var RESEND_API_KEY (server-side, no VITE_ prefix). Until that is
 * set in Vercel, the endpoint returns a clear "not configured" error so the
 * frontend can show a graceful message.
 *
 * Ported from Sentinel SportsLab (EMAIL-AUTH-CONTACT-SETUP-GUIDE.md §9).
 */

import { Resend } from 'resend';
import { renderEmail, escapeHtml, ICONS, BRAND } from './_email-template.js';

const SUBJECT_LABELS = {
  sales:   'Sales / Pilot enquiry',
  support: 'Support request',
  general: 'General support',
  bug:     'Report a bug',
  feature: 'Feature request',
  billing: 'Billing & plans',
  players: 'Player analysis enquiry',
  clubs:   'Club management enquiry',
};

const FROM_ADDRESS = `${BRAND.name} <noreply@${BRAND.support.split('@')[1]}>`;
const SUPPORT_INBOX = BRAND.support;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email service not configured yet. Please email us directly for now.' });
  }

  const { subject, name, email, organisation, message, meta } = req.body || {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long (max 5000 characters).' });
  }

  const subjectLabel = SUBJECT_LABELS[subject] || 'Contact form';
  const resend = new Resend(apiKey);

  const safeName = escapeHtml(name.trim());
  const safeEmail = escapeHtml(email.trim());
  const safeOrg = organisation?.trim() ? escapeHtml(organisation.trim()) : '—';
  const safeMessage = escapeHtml(message.trim()).replace(/\n/g, '<br>');

  // Optional context attached by the in-app support form (plan / role / page topic).
  const metaRow = (label, value) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:${BRAND.greenDark};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${escapeHtml(String(label))}</td><td style="padding:4px 0;font-size:14px;color:#0f172a;">${escapeHtml(String(value))}</td></tr>` : '';
  const metaRowsHtml = meta && typeof meta === 'object'
    ? metaRow('Plan', meta.tier) + metaRow('Role', meta.role) + metaRow('Context', meta.context)
    : '';

  // Support-side notification — no CTA (it's informational). Body in rich insert.
  const detailsHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(135deg,#e6f9f4 0%,#f0fdf9 100%);border:1px solid #a7f3d0;border-radius:14px;margin-bottom:14px;">
      <tr><td style="padding:16px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:${BRAND.greenDark};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;width:110px;">From</td>
              <td style="padding:4px 0;font-size:14px;color:#0f172a;"><strong>${safeName}</strong> &lt;${safeEmail}&gt;</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:${BRAND.greenDark};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Organisation</td>
              <td style="padding:4px 0;font-size:14px;color:#0f172a;">${safeOrg}</td></tr>
          ${metaRowsHtml}
        </table>
      </td></tr>
    </table>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:3px solid ${BRAND.green};padding:16px 20px;border-radius:10px;">
      <p style="margin:0;color:#0f172a;font-size:14px;line-height:1.65;">${safeMessage}</p>
    </div>
  `;

  const notificationHtml = renderEmail({
    preheader: `${name.trim()} — ${subjectLabel}`,
    hero: ICONS.message,
    eyebrow: 'New contact form submission',
    heading: subjectLabel,
    subheadingHtml: '',
    richInsertHtml: detailsHtml,
    securityCallout: {
      tone: 'info',
      html: `Hit <strong>Reply</strong> and your response will go directly to <strong>${safeEmail}</strong>.`,
    },
  });

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: SUPPORT_INBOX,
      replyTo: email.trim(),
      subject: `[${subjectLabel}] ${name.trim()}`,
      html: notificationHtml,
    });

    if (error) {
      console.error('[contact] Resend error:', error);
      return res.status(502).json({ error: `Could not send your message. Please try again or email ${SUPPORT_INBOX} directly.` });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] Unexpected error:', err);
    return res.status(500).json({ error: `Something went wrong. Please try again or email ${SUPPORT_INBOX} directly.` });
  }
}
