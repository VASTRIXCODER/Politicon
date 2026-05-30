'use client';

import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Only show on devices with fine pointer (desktop)
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    dot.style.opacity = '1';
    ring.style.opacity = '1';

    const onMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
      dot.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`;
    };

    let rafId: number;
    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function animate() {
      posRef.current.x = lerp(posRef.current.x, targetRef.current.x, 0.12);
      posRef.current.y = lerp(posRef.current.y, targetRef.current.y, 0.12);
      ring.style.transform = `translate(${posRef.current.x - 16}px, ${posRef.current.y - 16}px)`;
      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);

    const onHoverIn = () => {
      ring.style.width = '40px';
      ring.style.height = '40px';
      ring.style.marginLeft = '-4px';
      ring.style.marginTop = '-4px';
      ring.style.borderColor = 'rgba(123,97,255,0.8)';
    };
    const onHoverOut = () => {
      ring.style.width = '32px';
      ring.style.height = '32px';
      ring.style.marginLeft = '0';
      ring.style.marginTop = '0';
      ring.style.borderColor = 'rgba(123,97,255,0.4)';
    };

    const hoverTargets = document.querySelectorAll('a, button, [data-cursor-hover]');
    hoverTargets.forEach(el => {
      el.addEventListener('mouseenter', onHoverIn);
      el.addEventListener('mouseleave', onHoverOut);
    });

    window.addEventListener('mousemove', onMove);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('a, button, [data-cursor-hover]').forEach(el => {
        el.removeEventListener('mouseenter', onHoverIn);
        el.removeEventListener('mouseleave', onHoverOut);
        el.addEventListener('mouseenter', onHoverIn);
        el.addEventListener('mouseleave', onHoverOut);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 w-2 h-2 rounded-full bg-primary pointer-events-none z-[9999] opacity-0 transition-opacity"
        style={{ willChange: 'transform' }}
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 w-8 h-8 rounded-full border border-primary/40 pointer-events-none z-[9999] opacity-0"
        style={{ willChange: 'transform', transition: 'width 0.2s, height 0.2s, border-color 0.2s, margin 0.2s' }}
      />
    </>
  );
}
