import { useState, useEffect } from 'react';

/** Subscribe to a CSS media query and re-render when it changes. SSR-safe-ish. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const m = window.matchMedia(query);
    const fn = () => setMatches(m.matches);
    fn();
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return matches;
}

/** True when the device/viewport is wider than it is tall (e.g. a phone turned sideways). */
export const useLandscape = () => useMediaQuery('(orientation: landscape)');

/**
 * A smartphone is a phone in EITHER orientation — so we can't key off width alone (a phone
 * turned sideways is ~844px wide). Treat as a phone when the viewport is narrow (portrait phone)
 * OR a short landscape strip (a phone held sideways), but never a tablet/laptop (whose short side
 * stays ≥ 768 and whose landscape height stays well above a phone's).
 */
function isPhoneSize(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth, h = window.innerHeight;
  return w < 768 || (w > h && h < 500);
}
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhoneSize);
  useEffect(() => {
    const fn = () => setPhone(isPhoneSize());
    fn();
    window.addEventListener('resize', fn);
    window.addEventListener('orientationchange', fn);
    return () => { window.removeEventListener('resize', fn); window.removeEventListener('orientationchange', fn); };
  }, []);
  return phone;
}
