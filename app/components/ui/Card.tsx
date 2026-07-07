import * as React from 'react';
import { cn } from '../../lib/utils';

/** Card shell — white / sentinel-surface, rounded-xl, bordered, subtle shadow. */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('bg-white dark:bg-sentinel-surface rounded-xl border border-slate-200 dark:border-sentinel-border shadow-sm', className)} {...props} />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('px-5 py-4 border-b border-slate-100 dark:border-sentinel-border flex items-center justify-between gap-3', className)} {...props} />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h3 className={cn('text-sm font-bold text-slate-900 dark:text-white', className)} {...props} />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('p-5', className)} {...props} />
);
