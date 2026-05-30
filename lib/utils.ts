import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  // simple class merge without requiring clsx package
  return inputs
    .flat()
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function getStatusColor(status: string): string {
  switch (status) {
    case 'enacted': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 'passed': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'proposed': return 'text-gold bg-gold/10 border-gold/20';
    case 'rejected': return 'text-red-400 bg-red-400/10 border-red-400/20';
    default: return 'text-text-muted bg-white/5 border-white/10';
  }
}

export function getCategoryIcon(category: string): string {
  switch (category.toLowerCase()) {
    case 'taxes': return '💰';
    case 'healthcare': return '🏥';
    case 'housing': return '🏠';
    case 'employment': return '💼';
    case 'education': return '🎓';
    case 'energy': return '⚡';
    case 'social security': return '🛡️';
    default: return '📋';
  }
}

export function getImpactColor(direction: 'positive' | 'negative' | 'neutral'): string {
  switch (direction) {
    case 'positive': return 'text-emerald-400';
    case 'negative': return 'text-red-400';
    default: return 'text-text-muted';
  }
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
