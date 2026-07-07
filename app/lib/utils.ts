import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, de-duplicating conflicts (used by restyled components). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
