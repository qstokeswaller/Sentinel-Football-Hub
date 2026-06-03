/**
 * Vercel Serverless Function — Send a club / organisation invitation email.
 *
 * POST /api/send-org-invite
 * Body: {
 *   to:          string,   // recipient email (must be valid)
 *   role:        'admin' | 'member',
 *   acceptUrl:   string,   // full accept-invite URL (token embedded)
 *   orgName:     string,   // club name
 *   inviterName: string,
 * }
 *
 * Called after the invitation row + token already exist (created via your
 * invite RPC / flow). This endpoint's only job is to deliver the branded email.
 *
 * Failures here do NOT undo the invitation — the link is still valid and the
 * admin can copy it from the Settings UI as a fallback.
 *
 * Ported from Sentinel SportsLab (EMAIL-AUTH-CONTACT-SETUP-GUIDE.md §10).
 */

import { Resend } from 'resend';
import { renderEmail, escapeHtml, ICONS, BRAND } from './_email-template.js';

const FROM_ADDRESS = `${BRAND.name} <noreply@${BRAND.support.split('@')[1]}>`;

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[send-org-invite] RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { to, role, acceptUrl, orgName, inviterName } = req.body || {};

  if (!isValidEmail(to))    return res.status(400).json({ error: 'Invalid recipient email' });
  if (role !== 'admin' && role !== 'member') return res.status(400).json({ error: 'Invalid role' });
  if (!isHttpUrl(acceptUrl)) return res.status(400).json({ error: 'Invalid acceptUrl' });
  if (!orgName?.trim())     return res.status(400).json({ error: 'orgName required' });
  if (!inviterName?.trim()) return res.status(400).json({ error: 'inviterName required' });

  const safeOrg = escapeHtml(orgName.trim());
  const safeInviter = escapeHtml(inviterName.trim());
  const inviterInitial = escapeHtml((inviterName.trim()[0] || 'S').toUpperCase());
  const roleLabel = role === 'admin' ? 'Admin' : 'Member';
  const safeRoleLabel = escapeHtml(roleLabel);

  // Rich "inviter card" — gradient-bg panel with inviter's initial in a
  // gradient circle, then their name, the club name, and the assigned role.
  const inviterCardHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(135deg,#e6f9f4 0%,#f0fdf9 100%);border:1px solid #a7f3d0;border-radius:14px;">
      <tr><td style="padding:18px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;padding-right:14px;">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,${BRAND.navy},${BRAND.green});border-radius:50%;line-height:44px;text-align:center;color:#fff;font-weight:700;font-size:16px;">${inviterInitial}</div>
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 2px;font-size:14px;color:#475569;line-height:1.4;"><strong style="color:#0f172a;">${safeInviter}</strong> invited you to</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;line-height:1.3;">${safeOrg}</p>
              <p style="margin:2px 0 0;font-size:12px;color:${BRAND.greenDark};font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">As ${safeRoleLabel === 'Admin' ? 'an Admin' : 'a Member'}</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  `;

  const html = renderEmail({
    preheader: `${inviterName.trim()} invited you to join ${orgName.trim()} on ${BRAND.name}.`,
    hero: ICONS.people,
    eyebrow: "You're invited",
    heading: `Join ${orgName.trim()}`,
    subheadingHtml: '',
    richInsertHtml: inviterCardHtml + `
      <div style="text-align:center;padding-top:18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">Click the button below to accept. You'll be asked to create a password — your email is already linked to the invitation.</p>
      </div>
    `,
    cta: { url: acceptUrl, label: 'Accept invitation →' },
    fallbackLink: { url: acceptUrl, expiryText: 'This invitation expires in 7 days.' },
    footerExtra: `Invitation sent to ${escapeHtml(to.trim())}. Didn't expect this? You can safely ignore it.`,
  });

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: to.trim(),
      replyTo: BRAND.support,
      subject: `${inviterName.trim()} invited you to ${orgName.trim()}`,
      html,
    });

    if (error) {
      console.error('[send-org-invite] Resend error:', error);
      return res.status(502).json({ error: 'Could not send the invitation email. The link is still valid — copy it from the Settings page and send manually.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-org-invite] Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error sending invitation email.' });
  }
}
