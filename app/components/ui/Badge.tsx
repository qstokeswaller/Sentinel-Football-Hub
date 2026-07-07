import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Badge / pill — every semantic tag has a colored semi-transparent fill + matching
 * border + colored text (design-system rule). Pick `tone` by meaning, not looks.
 */
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border', {
  variants: {
    tone: {
      brand: 'bg-brand/10 border-brand/30 text-brand',
      emerald: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
      sky: 'bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300',
      amber: 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400',
      rose: 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400',
      violet: 'bg-violet-50 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300',
      slate: 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300',
    },
  },
  defaultVariants: { tone: 'slate' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({ className, tone, ...props }) => (
  <span className={cn(badgeVariants({ tone, className }))} {...props} />
);

export { badgeVariants };
