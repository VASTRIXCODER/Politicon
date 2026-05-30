'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  delay?: number;
  animate?: boolean;
}

export default function GlassCard({
  children,
  className,
  hover = true,
  glow = false,
  delay = 0,
  animate = true,
  ...props
}: GlassCardProps) {
  const base = 'glass relative overflow-hidden';

  if (!animate) {
    return (
      <div className={cn(base, className)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={
        hover
          ? {
              y: -4,
              boxShadow: glow
                ? '0 20px 60px rgba(123,97,255,0.35)'
                : '0 16px 48px rgba(123,97,255,0.2)',
              borderColor: 'rgba(255,255,255,0.16)',
              transition: { duration: 0.2 },
            }
          : undefined
      }
      className={cn(base, className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
