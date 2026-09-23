'use client';

import { useEffect, useRef } from 'react';

/**
 * Renders a cursor-following radial gradient glow that tracks the pointer.
 * Layered as a fixed backdrop behind all page content.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf: number;
    let mx = -9999;
    let my = -9999;

    function onMove(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick() {
      el!.style.setProperty('--mx', `${mx}px`);
      el!.style.setProperty('--my', `${my}px`);
      raf = 0;
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
      style={{
        background:
          'radial-gradient(600px circle at var(--mx, -9999px) var(--my, -9999px), rgba(0,240,255,0.07), rgba(0,119,255,0.03) 40%, transparent 70%)',
      }}
    />
  );
}
