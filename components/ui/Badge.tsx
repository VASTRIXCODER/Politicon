import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'gold' | 'success' | 'danger' | 'warning';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  const variants = {
    default: 'bg-fg/5 border-fg/10 text-text-muted',
    // primary-300 keeps violet text legible (AA) on the violet tint.
    primary: 'bg-primary/10 border-primary/20 text-primary-300',
    secondary: 'bg-secondary/10 border-secondary/20 text-secondary',
    gold: 'bg-gold/10 border-gold/20 text-gold',
    success: 'bg-gain/10 border-gain/20 text-gain',
    danger: 'bg-danger/10 border-danger/20 text-danger',
    warning: 'bg-caution/10 border-caution/20 text-caution',
  };
  const sizes = {
    sm: 'px-2 py-0.5 text-meta',
    md: 'px-3 py-1 text-xs',
  };
  return (
    <span className={cn(
      'inline-flex items-center border rounded-full font-medium font-mono-data tracking-wide',
      variants[variant],
      sizes[size],
      className
    )}>
      {children}
    </span>
  );
}
