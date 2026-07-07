import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Button — Football Hub design system (shadcn/CVA pattern, mirrors SportsLab's
 * Button with the green brand). Primary/destructive are solid pills; secondary/
 * ghost/outline are rounded-lg. Always pass variant + size, not raw classes.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-[#0D1B2A] hover:bg-brand-light rounded-lg',
        secondary: 'border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg',
        ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-lg',
        destructive: 'bg-rose-600 text-white hover:bg-rose-500 rounded-lg',
        outline: 'border border-brand/40 text-brand hover:bg-brand/10 rounded-lg',
      },
      size: {
        default: 'h-9 px-5 text-sm',
        sm: 'h-7 px-3 text-xs',
        lg: 'h-11 px-8 text-base',
        icon: 'h-9 w-9 p-0',
        iconSm: 'h-7 w-7 p-0 rounded-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = 'Button';

export { buttonVariants };
