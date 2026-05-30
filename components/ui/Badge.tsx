import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'gold' | 'success' | 'danger' | 'warning';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  const variants = {
    default: 'bg-white/5 border-white/10 text-text-muted',
    primary: 'bg-primary/10 border-primary/20 text-primary',
    secondary: 'bg-secondary/10 border-secondary/20 text-secondary',
    gold: 'bg-gold/10 border-gold/20 text-gold',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    danger: 'bg-red-500/10 border-red-500/20 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };
  const sizes = {
    sm: 'px-2 py-0.5 text-[11px]',
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
