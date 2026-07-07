import { useEffect, RefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';

/** Rewrite the vanilla marketing links to React routes (applied to every page's HTML). */
export function rewriteMarketingLinks(html: string): string {
  return html
    .replace(/href="\/src\/pages\/login\.html\?mode=signup"/g, 'href="/login?mode=signup"')
    .replace(/href="\/src\/pages\/login\.html"/g, 'href="/login"')
    .replace(/href="\/src\/pages\/privacy-policy\.html"/g, 'href="/privacy"')
    .replace(/href="\/src\/pages\/terms-of-service\.html"/g, 'href="/terms"')
    .replace(/href="\/src\/pages\/cookie-policy\.html"/g, 'href="/cookies"')
    .replace(/href="\/src\/pages\/data-processing\.html"/g, 'href="/data-processing"')
    .replace(/href="\/landing\/clubs\.html"/g, 'href="/landing/clubs"')
    .replace(/href="\/landing\/players\.html"/g, 'href="/landing/players"')
    .replace(/href="\.\.\/index\.html"/g, 'href="/"')
    .replace(/href="\/index\.html"/g, 'href="/"')
    .replace(/href="index\.html"/g, 'href="/"');
}

/**
 * Wires every marketing-page behaviour generically (each guarded on the elements
 * existing, so one hook serves home/clubs/players): scoped CSS inject (mounted on
 * enter, removed on leave — never touches the app), nav hamburger, scroll fade-in,
 * nav scroll shadow, flip-cards, FAQ accordion, the contact form (→ /api/contact),
 * and internal-link SPA navigation.
 */
export function useMarketingPage(ref: RefObject<HTMLDivElement | null>, css: string, navigate: NavigateFunction, title: string) {
  useEffect(() => {
    if (title) document.title = title;
    const style = document.createElement('style');
    style.setAttribute('data-mkt', '1');
    // Robustness overrides appended to the page CSS:
    // 1) Reveal `.fade-up` via a CSS animation (runs on load, NO JS dependency) so
    //    content can never render blank — even if the observer/effect hiccups.
    // 2) Hide the contact error box until it actually contains an error message
    //    (it ships with `class="cf-msg error"` baked in → was showing as an empty red bar).
    style.textContent = css + `
      @keyframes mktReveal { to { opacity: 1; transform: none; } }
      .fade-up { animation: mktReveal .55s ease .05s both; }
      .cf-msg:empty { display: none !important; }`;
    document.head.appendChild(style);

    const root = ref.current;
    const cleanups: Array<() => void> = [];
    if (root) {
      const on = (el: Element | Window | null, ev: string, fn: EventListener, opts?: any) => { if (!el) return; el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); };

      // Nav hamburger
      const burger = root.querySelector('#hamburgerBtn');
      const icon = root.querySelector('#hamburgerIcon');
      const menu = root.querySelector('#mobileMenu');
      if (burger && menu) {
        on(burger, 'click', () => { const open = menu.classList.toggle('open'); if (icon) icon.className = open ? 'fas fa-xmark' : 'fas fa-bars'; });
        menu.querySelectorAll('a').forEach(a => on(a, 'click', () => { menu.classList.remove('open'); if (icon) icon.className = 'fas fa-bars'; }));
      }

      // Scroll fade-in
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
      root.querySelectorAll('.fade-up').forEach(el => io.observe(el));
      setTimeout(() => root.querySelectorAll('.hero .fade-up').forEach(el => el.classList.add('visible')), 80);
      cleanups.push(() => io.disconnect());
      // Failsafe: content must never stay hidden. If the observer hiccups (stale HMR,
      // slow device), reveal everything within 1.5s so the page can't render blank.
      const revealAll = setTimeout(() => root.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible')), 1500);
      cleanups.push(() => clearTimeout(revealAll));

      // Nav scroll shadow
      const nav = root.querySelector('#nav') as HTMLElement | null;
      on(window, 'scroll', () => { if (nav) nav.style.boxShadow = window.scrollY > 40 ? '0 2px 20px rgba(0,0,0,0.2)' : 'none'; }, { passive: true });

      // Delegated interactions (flip cards, FAQ accordion, internal links). Delegation
      // + the per-event guard make this idempotent even if StrictMode double-binds in dev.
      const handleActivate = (e: Event, fromKey: boolean) => {
        if ((e as any).__mktHandled) return;
        const target = e.target as HTMLElement;
        const card = target.closest('.flip-card');
        if (card) { (e as any).__mktHandled = true; if (fromKey) e.preventDefault(); card.classList.toggle('flipped'); return; }
        const faqBtn = target.closest('.faq-q');
        if (faqBtn) {
          (e as any).__mktHandled = true;
          const item = faqBtn.closest('.faq-item');
          const isOpen = item?.classList.contains('open');
          root.querySelectorAll('.faq-item.open').forEach(i => { i.classList.remove('open'); i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false'); });
          if (!isOpen && item) { item.classList.add('open'); faqBtn.setAttribute('aria-expanded', 'true'); }
          return;
        }
        const a = target.closest('a');
        if (a && !fromKey) {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('/') && !href.startsWith('//')) { (e as any).__mktHandled = true; e.preventDefault(); navigate(href); }
        }
      };
      on(root, 'click', (e) => handleActivate(e, false));
      on(root, 'keydown', (e) => { const ke = e as KeyboardEvent; if (ke.key === 'Enter' || ke.key === ' ') handleActivate(e, true); });

      // Contact form → /api/contact
      const form = root.querySelector('#contactForm') as HTMLFormElement | null;
      if (form) {
        const errEl = root.querySelector('#cfError') as HTMLElement;
        const btn = root.querySelector('#cfSubmit') as HTMLButtonElement;
        const success = root.querySelector('#cfSuccess') as HTMLElement;
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const val = (id: string) => (root.querySelector('#' + id) as HTMLInputElement)?.value.trim() || '';
        on(form, 'submit', async (e) => {
          e.preventDefault();
          if ((e as any).__mktHandled) return; (e as any).__mktHandled = true;
          errEl.style.display = 'none';
          const payload = { subject: (root.querySelector('#cfSubject') as HTMLSelectElement)?.value, name: val('cfName'), email: val('cfEmail'), organisation: val('cfOrg'), message: val('cfMessage') };
          if (!payload.name || !payload.email || !payload.message) { errEl.textContent = 'Please fill in your name, email and message.'; errEl.style.display = 'block'; return; }
          if (!emailRe.test(payload.email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; return; }
          btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Sending…';
          try {
            const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { form.style.display = 'none'; success.style.display = 'block'; }
            else { errEl.textContent = (data as any).error || 'Something went wrong. Please try again.'; errEl.style.display = 'block'; }
          } catch { errEl.textContent = 'Network error — please try again, or email us directly.'; errEl.style.display = 'block'; }
          finally { btn.disabled = false; btn.textContent = orig; }
        });
      }

      // Deep-link from "For Players"/"For Clubs" (and footer "Contact"): ?topic=… pre-selects
      // the subject and scrolls to the form; a #contact hash also scrolls. Lets any page hand
      // the contact form its context without needing its own form.
      const topicParam = new URLSearchParams(window.location.search).get('topic');
      const hash = window.location.hash;
      if (form && (topicParam || hash === '#contact' || hash === '#contactForm')) {
        const subjectEl = root.querySelector('#cfSubject') as HTMLSelectElement | null;
        if (topicParam && subjectEl && Array.from(subjectEl.options).some(o => o.value === topicParam)) subjectEl.value = topicParam;
        const target = (root.querySelector('#contactForm') || root.querySelector('#contact')) as HTMLElement | null;
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
      }
    }

    return () => { cleanups.forEach(fn => fn()); style.remove(); };
  }, [ref, css, navigate, title]);
}
