import { cn, getStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  /** proposed | passed | enacted | repealed | rejected (anything else renders neutral). */
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizes = {
  sm: 'px-2.5 py-0.5 text-meta',
  md: 'px-3 py-1 text-sm',
};

/**
 * Policy status pill. Colours come from STATUS_STYLES in lib/utils, the single
 * status token map; the label is always printed, so colour is never the only cue.
 */
export default function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-mono-data font-medium tracking-wide',
        sizes[size],
        getStatusColor(status),
        className
      )}
    >
      <span className="sr-only">Status: </span>
      {label}
    </span>
  );
}
