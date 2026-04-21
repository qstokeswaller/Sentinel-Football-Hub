# PWA + Security + Responsive Audit Plan
**Sentinel Football Hub**
Date: 2026-04-21

---

## Part 1 — PWA (Installable App)

### What This Achieves
Coaches can install Sentinel Football Hub as a native-feeling app on:
- iPhone / Android (Add to Home Screen → full-screen, no browser chrome)
- iPad (great for sideline use)
- Windows / Mac desktop (Chrome/Edge "Install App" prompt)

The right approach is a **Progressive Web App (PWA)** — no app store required, instant updates via the web, works with the existing Vite + Supabase stack.

### PWA Requirements Checklist
- [ ] `manifest.json` — app name, icons, theme colour, display mode
- [ ] Service Worker — offline fallback + asset caching
- [ ] HTTPS — already live on Amplify + Vercel ✓
- [ ] `<link rel="manifest">` added to all HTML pages
- [ ] App icons at all required sizes (48, 72, 96, 144, 192, 512px)
- [ ] `apple-touch-icon` meta tag for iOS
- [ ] `theme-color` meta tag in all pages
- [ ] Install prompt in landing page (`beforeinstallprompt` event)
- [ ] Offline fallback page (`/offline.html`)

### Implementation Steps

#### Step 1 — App Icons
Generate a set of icons from the Sentinel logo/futbol icon at:
- 48x48, 72x72, 96x96, 144x144, 192x192, 512x512 (PNG)
- Place in `public/icons/`
- Also generate `favicon.ico` and `apple-touch-icon.png` (180x180)

#### Step 2 — manifest.json
Create `public/manifest.json`:
```json
{
  "name": "Sentinel Football Hub",
  "short_name": "SFH",
  "description": "Club management platform for football coaches",
  "start_url": "/src/pages/dashboard.html",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#080B0F",
  "theme_color": "#00C49A",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["sports", "productivity"],
  "screenshots": []
}
```

#### Step 3 — Service Worker (`public/sw.js`)
Strategy: **Cache-first for static assets, network-first for API calls**
- Cache shell: CSS, JS bundles, fonts, icons on install
- Network-first: all Supabase API requests (never cache auth/data)
- Offline fallback: serve `/offline.html` when network unavailable
- Update strategy: prompt user when new version available

#### Step 4 — Register Service Worker
Add to `public/theme-preload.js` or a new `public/pwa-register.js`:
```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          // Optionally prompt user: "Update available — reload?"
        });
      });
  });
}
```

Add `<script src="/pwa-register.js"></script>` to all HTML pages.

#### Step 5 — Add manifest link to all HTML pages
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#00C49A">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

Pages to update (all authenticated pages):
- `src/pages/dashboard.html`
- `src/pages/planner.html`
- `src/pages/squad.html`
- `src/pages/matches.html`
- `src/pages/analytics.html`
- `src/pages/scouting.html`
- `src/pages/settings.html`
- `src/pages/reports.html`
- `src/pages/library.html`
- `src/pages/login.html`

#### Step 6 — Install Prompt in Landing Page (index.html)
The landing page already has a CTA section. Add:
- "Install App" button that appears when `beforeinstallprompt` fires (Chrome/Edge/Android)
- iOS instructions section (since iOS doesn't support the prompt — user must use Share → Add to Home Screen)
- Download badges section linking to nothing (no app store needed — explain it's a web app)

```js
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('btnInstall').style.display = 'flex';
});
document.getElementById('btnInstall').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
});
```

#### Step 7 — Offline Page (`public/offline.html`)
Simple branded page shown when user has no connection:
- Sentinel logo + "You're offline" message
- "Retry" button that calls `window.location.reload()`
- Cached data tip: "Your last session data is still available"

---

## Part 2 — Security Audit

### Findings

#### CRITICAL — Fixed ✓
| Issue | File | Fix Applied |
|---|---|---|
| XSS via `inv.club_name` in `innerHTML` | `login.html:395` | Replaced with `textContent` on `<strong>` elements |
| `.upsert().catch()` crash | `quick-session.js:481` | Replaced with `await + destructured error` |

#### HIGH — Security Headers Missing
No `_headers` (Vercel) or custom headers file exists. All pages are served without:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

**Fix:** Create `public/_headers` (Vercel reads this) and configure Amplify custom headers.
See Part 2 → Security Headers section below.

#### MEDIUM — innerHTML with DB-sourced user data (no escaping)
These files interpolate database strings directly into `innerHTML`. The data originates from admin users within the same club (not public internet), so real-world risk is low but not zero — a compromised admin account could store a payload.

| File | Lines | Fields at risk |
|---|---|---|
| `squad-players-ui.js` | 763, 831, 879, 962, 1106 | `s.name`, `p.name`, `p.position` |
| `squad-ui.js` | 565, 755, 814 | `s.name`, `p.name` |
| `player-ui.js` | 552 | `s.name` |
| `reports-ui.js` | 1083 | `p.name` |

**Note:** All are inside `<option>` or `<span>` elements — browsers don't execute scripts in `<option>` content. However these should still be sanitised.

**Fix:** Add a shared `escHtml()` utility (already exists in `analytics-ui.js` and `calendar-ui.js` — extract to `src/utils.js`) and wrap all user-sourced strings.

#### LOW — animation-builder.js video URL in innerHTML
`animation-builder.js:2377` — video `src` from user input rendered via innerHTML. Video `src` doesn't execute JS, but the pattern is fragile.
**Fix:** Use `document.createElement('video')` and set `.src` directly.

#### GOOD — What's already correct
- No `eval()` anywhere ✓
- No `document.write()` ✓
- `analytics-ui.js` consistently uses `escHtml()` ✓
- `calendar-ui.js` uses `escHtml()` ✓
- `planner.js` uses `escHtml(url)` for video ✓
- Supabase RLS policies protect all data regardless of client ✓
- Auth uses `getSession()` (local JWT) not server roundtrip ✓
- Profile cache excludes impersonating super_admins ✓

### Security Headers to Add

#### `public/_headers` (Vercel picks this up from `public/`)
```
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-XSS-Protection: 1; mode=block
```

Note: A full CSP is deferred because the app uses:
- Inline `<script>` blocks in HTML pages (would require `unsafe-inline` or nonces)
- CDN scripts (FontAwesome, jsPDF, Cloudflare)
- Supabase API calls to `*.supabase.co`

A proper CSP requires migrating all inline scripts to external files first — a larger refactor tracked separately.

#### Amplify Custom Headers
In the Amplify console → App settings → Custom headers, add the same headers above. Or add `amplify.yml` with header rules.

---

## Part 3 — Responsive Audit

### Breakpoint Strategy (as implemented)
| Range | Layout |
|---|---|
| > 1024px | Full sidebar 260px, multi-col grids |
| 769–1024px | Icon-only sidebar 70px (CSS auto) ✓ Added 2026-04-21 |
| ≤ 768px | Hamburger overlay, mobile top bar |
| ≤ 480px | Small phone polish |

### Session Planner Page Audit

#### Existing responsive rules in `planner.css`
- `768px` — form grids collapse, mini-toolbar stacks ✓
- `900px` — partial adjustments ✓
- `600px` — further collapse ✓
- Animation builder has full mobile landscape fullscreen mode ✓

#### Missing: 769–1024px tablet zone for planner
The header action buttons bar (6 buttons: Load, Save as Template, Save Session, Export PDF, Share, New) will overflow horizontally on tablet with the new 70px icon rail reducing content width.

**Fix needed in `planner.css`:**
```css
@media screen and (min-width: 769px) and (max-width: 1024px) {
  /* Header actions — wrap to 2 rows on tablet */
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .header-actions { flex-wrap: wrap; gap: 8px; }
  .header-actions .dash-btn { flex: 1; min-width: 120px; }

  /* Planner tab bar — ensure tabs don't overflow */
  .planner-tab-bar { overflow-x: auto; }
  .planner-tab { white-space: nowrap; }
}
```

#### Other pages needing tablet review
- `src/pages/matches.html` — match card grid
- `src/pages/squad.html` — player grid
- `src/pages/scouting.html` — table layout
- `src/pages/analytics.html` — chart + table layout

### Landing Page — Install Section to Add
In `index.html` CTA section, add an "Install the App" subsection:
- Show `beforeinstallprompt` button for Chrome/Edge/Android
- Show iOS instruction card (Share icon → Add to Home Screen)
- Brief explainer: "No app store needed — installs directly from your browser"

---

## Execution Order

| Priority | Task | Effort |
|---|---|---|
| 1 | Security headers (`_headers` file) | 30 min |
| 2 | Planner tablet responsive fix | 1 hour |
| 3 | Extract shared `escHtml()` to `src/utils.js` + apply to missing files | 2 hours |
| 4 | App icons — generate from logo assets | 1 hour |
| 5 | `manifest.json` | 30 min |
| 6 | Service worker (`sw.js`) + offline page | 3 hours |
| 7 | PWA meta tags added to all HTML pages | 1 hour |
| 8 | Install prompt + iOS instructions in landing page | 1 hour |
| 9 | Amplify custom headers config | 30 min |
| 10 | Test PWA install on iOS Safari + Android Chrome + desktop Chrome | 1 hour |

**Total estimated effort:** ~11 hours across sessions
