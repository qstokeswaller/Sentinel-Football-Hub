/**
 * Shared HTML wrapper for transactional emails sent via Resend.
 *
 * Sentinel Football Hub brand — navy→green gradient header strip, soft drop
 * shadow, wordmark, optional hero icon in a coloured circle, gradient CTA
 * button. Designed to render well in Gmail web/iOS, Apple Mail, Outlook 365.
 *
 * Filename starts with `_` so Vercel doesn't expose it as a serverless route.
 *
 * Ported from Sentinel SportsLab (EMAIL-AUTH-CONTACT-SETUP-GUIDE.md §8) and
 * re-branded to the Football Hub green identity.
 *
 * Usage:
 *   import { renderEmail, escapeHtml, ICONS } from './_email-template.js';
 *   const html = renderEmail({
 *     preheader: 'Confirm your email to get started',
 *     hero: ICONS.envelope,
 *     eyebrow: 'Welcome',
 *     heading: "You're almost in",
 *     subheadingHtml: '<p>Confirm your email to activate your account.</p>',
 *     cta: { url, label: 'Confirm email →' },
 *     fallbackLink: { url, expiryText: 'This link expires in 24 hours.' },
 *   });
 */

// ── Brand constants ─────────────────────────────────────────────────────────
// NOTE: update SITE_URL / BRAND_DOMAIN once the production domain is verified
// in Vercel + Zoho + Resend. Until then these are placeholders.
export const BRAND = {
  name: 'Sentinel Football Hub',
  tagline: 'Club management & player analysis for football',
  site: 'https://sentinelfootballhub.com',
  support: 'support@sentinelfootballhub.com',
  green: '#00C49A',
  greenDark: '#0f766e',
  navy: '#0D1B2A',
  ink: '#0f172a',
};

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline SVG icon presets paired with a soft gradient background colour.
// Each icon renders inside a 72x72 circle with the icon centred at 32x32.
export const ICONS = {
  envelope: {
    bgFrom: '#e6f9f4', bgTo: '#d1fae5', stroke: '#0f766e',
    svg: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  },
  key: {
    bgFrom: '#dbeafe', bgTo: '#bfdbfe', stroke: '#2563eb',
    svg: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  },
  lock: {
    bgFrom: '#fef3c7', bgTo: '#fde68a', stroke: '#d97706',
    svg: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  },
  atSign: {
    bgFrom: '#e6f9f4', bgTo: '#d1fae5', stroke: '#0f766e',
    svg: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
  },
  shield: {
    bgFrom: '#cffafe', bgTo: '#a5f3fc', stroke: '#0891b2',
    svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  },
  people: {
    bgFrom: '#d1fae5', bgTo: '#a7f3d0', stroke: '#059669',
    svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  },
  message: {
    bgFrom: '#e6f9f4', bgTo: '#d1fae5', stroke: '#0f766e',
    svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  },
  // Confirmation / "we just did this" — green check on emerald background.
  check: {
    bgFrom: '#d1fae5', bgTo: '#a7f3d0', stroke: '#059669',
    svg: '<polyline points="20 6 9 17 4 12"/>',
  },
  // Alert / "something changed, verify it was you" — amber triangle.
  alert: {
    bgFrom: '#fef3c7', bgTo: '#fde68a', stroke: '#d97706',
    svg: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  phone: {
    bgFrom: '#dbeafe', bgTo: '#bfdbfe', stroke: '#2563eb',
    svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  },
  link: {
    bgFrom: '#e6f9f4', bgTo: '#d1fae5', stroke: '#0f766e',
    svg: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  },
  unlink: {
    bgFrom: '#fee2e2', bgTo: '#fecaca', stroke: '#dc2626',
    svg: '<path d="M18 9V6a3 3 0 0 0-6 0v3"/><path d="M3 13h18"/><path d="M3 6h18"/>',
  },
};

/**
 * @param {object} opts
 * @param {string} [opts.preheader]
 * @param {{svg:string,bgFrom:string,bgTo:string,stroke:string}} [opts.hero]
 * @param {string} [opts.eyebrow] - small uppercase tagline above heading
 * @param {string} opts.heading
 * @param {string} [opts.subheadingHtml] - HTML for body intro under heading
 * @param {string} [opts.richInsertHtml] - HTML inserted before the CTA (e.g. inviter card)
 * @param {{url:string,label:string}} [opts.cta]
 * @param {{url:string,expiryText?:string}} [opts.fallbackLink]
 * @param {{html:string,tone?:'warning'|'info'}} [opts.securityCallout]
 * @param {string} [opts.footerExtra] - extra footer paragraph (e.g. "Invitation sent to X")
 */
export function renderEmail({
  preheader = '',
  hero = null,
  eyebrow = '',
  heading,
  subheadingHtml = '',
  richInsertHtml = '',
  cta = null,
  fallbackLink = null,
  securityCallout = null,
  footerExtra = '',
}) {
  const safePreheader = escapeHtml(preheader);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeHeading = escapeHtml(heading);

  const heroBlock = hero ? `
    <tr><td align="center" style="padding:24px 32px 8px;">
      <div style="display:inline-block;width:72px;height:72px;background:linear-gradient(135deg,${hero.bgFrom} 0%,${hero.bgTo} 100%);border-radius:50%;line-height:72px;text-align:center;">
        <span style="display:inline-block;vertical-align:middle;line-height:1;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${hero.stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">${hero.svg}</svg>
        </span>
      </div>
    </td></tr>
  ` : '';

  const eyebrowBlock = eyebrow ? `<p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:${BRAND.greenDark};">${safeEyebrow}</p>` : '';

  const ctaBlock = cta ? `
    <tr><td align="center" style="padding:24px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-radius:10px;background:linear-gradient(135deg,${BRAND.navy} 0%,${BRAND.greenDark} 55%,${BRAND.green} 100%);box-shadow:0 8px 20px -4px rgba(0,196,154,0.4);">
          <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:15px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">${escapeHtml(cta.label)}</a>
        </td></tr>
      </table>
    </td></tr>
  ` : '';

  const calloutBlock = securityCallout ? (() => {
    const tone = securityCallout.tone || 'warning';
    const palette = tone === 'info'
      ? { bg: '#e6f9f4', border: '#a7f3d0', text: '#065f46' }
      : { bg: '#fffbeb', border: '#fde68a', text: '#78350f' };
    return `
      <tr><td style="padding:8px 40px 16px;">
        <div style="background:${palette.bg};border:1px solid ${palette.border};border-radius:10px;padding:12px 16px;">
          <p style="margin:0;font-size:13px;line-height:1.55;color:${palette.text};">${securityCallout.html}</p>
        </div>
      </td></tr>
    `;
  })() : '';

  const fallbackBlock = fallbackLink ? `
    <tr><td style="padding:20px 40px 32px;text-align:center;">
      <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Button not working? Copy and paste this link:</p>
      <p style="margin:0;word-break:break-all;font-size:12px;"><a href="${escapeHtml(fallbackLink.url)}" style="color:${BRAND.greenDark};text-decoration:none;">${escapeHtml(fallbackLink.url)}</a></p>
      ${fallbackLink.expiryText ? `<p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">${escapeHtml(fallbackLink.expiryText)}</p>` : ''}
    </td></tr>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeHeading}</title>
  <style>
    body { margin:0; padding:0; background:#f0f5f4; }
    a { color:${BRAND.greenDark}; }
    @media (prefers-color-scheme: dark) {
      body, .e-card { background:#f0f5f4 !important; color:#0f172a !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;color:transparent;">${safePreheader}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f5f4;">
    <tr><td align="center" style="padding:40px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="e-card" style="max-width:580px;background:#ffffff;border-radius:20px;box-shadow:0 12px 40px -8px rgba(0,196,154,0.18),0 4px 14px -4px rgba(15,23,42,0.06);overflow:hidden;">

        <!-- Gradient stripe -->
        <tr><td style="background:linear-gradient(135deg,${BRAND.navy} 0%,${BRAND.greenDark} 50%,${BRAND.green} 100%);height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>

        <!-- Wordmark -->
        <tr><td align="center" style="background:linear-gradient(180deg,#f7fbfa 0%,#ffffff 100%);padding:24px 32px 8px;">
          <a href="${BRAND.site}" style="text-decoration:none;display:inline-block;">
            <span style="display:inline-block;vertical-align:middle;font-size:18px;font-weight:800;color:${BRAND.ink};letter-spacing:-0.015em;">Sentinel <span style="color:${BRAND.green};">Football Hub</span></span>
          </a>
        </td></tr>

        ${heroBlock}

        <!-- Heading + body intro -->
        <tr><td style="padding:16px 40px 8px;text-align:center;">
          ${eyebrowBlock}
          <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;line-height:1.25;color:#0f172a;letter-spacing:-0.02em;">${safeHeading}</h1>
          <div style="font-size:15px;line-height:1.6;color:#475569;">
            ${subheadingHtml}
          </div>
        </td></tr>

        ${richInsertHtml ? `<tr><td style="padding:8px 40px 8px;">${richInsertHtml}</td></tr>` : ''}

        ${ctaBlock}
        ${calloutBlock}
        ${fallbackBlock}

        <!-- Footer -->
        <tr><td style="padding:0 40px;"><div style="border-top:1px dashed #e2e8f0;height:1px;"></div></td></tr>
        <tr><td align="center" style="padding:24px 40px 32px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(BRAND.name)}</p>
          <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">${escapeHtml(BRAND.tagline)}</p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            <a href="${BRAND.site}" style="color:${BRAND.greenDark};text-decoration:none;font-weight:600;">${escapeHtml(BRAND.site.replace(/^https?:\/\//, ''))}</a>
            &nbsp;·&nbsp;
            <a href="${BRAND.site}/?topic=support#contact" style="color:${BRAND.greenDark};text-decoration:none;font-weight:600;">${escapeHtml(BRAND.support)}</a>
          </p>
          ${footerExtra ? `<p style="margin:14px 0 0;font-size:11px;color:#cbd5e1;">${footerExtra}</p>` : ''}
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}
