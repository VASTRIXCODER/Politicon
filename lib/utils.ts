import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import type { Policy } from '@/types';

// Teach tailwind-merge the custom theme scales (tailwind.config.ts), so a
// caller's class replaces the component default instead of both staying on
// the element: `text-meta`/`text-display-*` are font sizes (not text colours),
// `rounded-pane`/`rounded-tile` radii, `shadow-pane|lift|glow` shadows (not
// shadow colours), and the named z-index layers.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta', 'display-sm', 'display-md', 'display-lg'] }],
      rounded: [{ rounded: ['pane', 'tile'] }],
      shadow: [{ shadow: ['pane', 'lift', 'glow'] }],
      z: [{ z: ['stage', 'content', 'nav', 'overlay', 'modal', 'toast', 'skip'] }],
      ease: [{ ease: ['civic'] }],
    },
  },
});

/**
 * Joins class names (strings, arrays, `{ class: condition }` objects) and
 * resolves Tailwind conflicts so the caller's override wins:
 * cn('px-8 rounded-xl', 'px-3') → 'rounded-xl px-3'.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, showSign = true): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);

  if (showSign && amount !== 0) {
    return amount > 0 ? `+${formatted}` : `-${formatted}`;
  }
  return formatted;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export type PolicyStatus = Policy['status'];

/**
 * The one colour map for policy status, shared by StatusBadge and
 * getStatusColor. Status is a fact about the record, not good or bad news,
 * so it never uses the gain/loss colours: violet proposed, orchid passed,
 * archive gold enacted (it's the law), and a neutral grey for repealed and
 * rejected. Each entry is text + tint + border classes.
 */
export const STATUS_STYLES: Record<PolicyStatus, string> = {
  proposed: 'text-primary-300 bg-primary/10 border-primary/20',
  passed: 'text-accent bg-accent/10 border-accent/20',
  enacted: 'text-gold bg-gold/10 border-gold/25',
  repealed: 'text-text-muted bg-fg/5 border-fg/15',
  rejected: 'text-text-muted bg-fg/5 border-fg/15',
};

const STATUS_FALLBACK = 'text-text-muted bg-fg/5 border-fg/10';

export function isPolicyStatus(status: unknown): status is PolicyStatus {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS_STYLES, status);
}

export function getStatusColor(status: string): string {
  return isPolicyStatus(status) ? STATUS_STYLES[status] : STATUS_FALLBACK;
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  return `${Math.floor(diffDays / 30)} months ago`;
}
