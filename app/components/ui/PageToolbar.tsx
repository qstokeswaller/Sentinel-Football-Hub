import React from 'react';

/**
 * PageToolbar — the compact top-of-page bar that replaces the old two-row stack
 * of (big <h1> + description) + (separate tabs/filters row).
 *
 * On desktop (≥lg) the left sidebar already names the section, so the visible
 * page title is dropped to reclaim vertical space (the Linear / GitHub / Stripe
 * pattern): tabs sit inline on the left, filters + actions on the right. Below lg
 * the sidebar is behind the hamburger and the mobile top bar only shows the CLUB
 * name, so a compact page title is shown for wayfinding. A visually-hidden <h1> is
 * always present so the page stays semantically titled for screen readers.
 *
 *   left     — usually the page's <PillTabs/>. Omit on pages without tabs and a
 *              slim desktop title label is shown instead, so the page still has an
 *              anchor and doesn't start abruptly.
 *   children — the right-aligned cluster: filters + primary action(s).
 *   dataTour — walkthrough anchor; lands on the visible toolbar row.
 */
interface Props {
  title: string;
  description?: string;
  dataTour?: string;
  /** appended to the outer wrapper — e.g. "no-print" for print-export pages */
  className?: string;
  left?: React.ReactNode;
  children?: React.ReactNode;
}

export const PageToolbar: React.FC<Props> = ({ title, description, dataTour, className, left, children }) => (
  <div className={'mb-5' + (className ? ' ' + className : '')}>
    {/* Always-present semantic heading (kept for a11y even when visually hidden). */}
    <h1 className="sr-only">{title}</h1>

    {/* <lg only: the sidebar is hidden, so surface the page title for wayfinding. */}
    <div className="lg:hidden mb-3">
      <div className="text-xl font-bold text-slate-900 dark:text-white">{title}</div>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>

    {/* One toolbar row: tabs (or a slim desktop title) on the left, actions on the right. */}
    <div data-tour={dataTour} className="flex flex-wrap items-center justify-between gap-3">
      {left
        ? left
        : <h2 className="hidden lg:block text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>}
      {children && <div className="flex flex-wrap items-end gap-2 justify-end">{children}</div>}
    </div>
  </div>
);
