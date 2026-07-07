import * as React from 'react';

/**
 * Football-pitch icon (top-down) — lucide-compatible: same 24×24 viewBox, `currentColor`
 * stroke and rounded caps, so it inherits the sidebar's active/inactive colours exactly like
 * every other nav icon. Used for the "Designer" (session planner) item instead of a clipboard.
 */
export const PitchIcon: React.FC<{ size?: number | string; className?: string; strokeWidth?: number }> = ({
  size = 24, className, strokeWidth = 2,
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <line x1="12" y1="5" x2="12" y2="19" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M2 9h2.5v6H2" />
    <path d="M22 9h-2.5v6H22" />
  </svg>
);
