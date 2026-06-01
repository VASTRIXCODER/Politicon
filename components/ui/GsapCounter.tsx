'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface GsapCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

// GSAP-driven count-up. Animates from 0 on mount and re-tweens whenever
// `value` changes (used for live-updating figures like cumulative impact).
export default function GsapCounter({
  value,
  duration = 1.6,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}: GsapCounterProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef({ v: 0 });

  useEffect(() => {
    const tween = gsap.to(ref.current, {
      v: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => setDisplay(ref.current.v),
    });
    return () => { tween.kill(); };
  }, [value, duration]);

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(display);

  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}
