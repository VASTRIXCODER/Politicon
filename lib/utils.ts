import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import type { Policy } from '@/types';

// Teach tailwind-merge the custom theme tokens so `text-meta` is treated as a
// font size (and not dropped as a conflicting text colour).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta'] }],
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
 * getStatusColor: gold proposed, cyan passed, emerald enacted, red for
 * repealed and rejected. Each entry is text + tint + border classes.
 */
export const STATUS_STYLES: Record<PolicyStatus, string> = {
  proposed: 'text-gold bg-gold/10 border-gold/20',
  passed: 'text-secondary bg-secondary/10 border-secondary/20',
  enacted: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  repealed: 'text-red-400 bg-red-400/10 border-red-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const STATUS_FALLBACK = 'text-text-muted bg-white/5 border-white/10';

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
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
