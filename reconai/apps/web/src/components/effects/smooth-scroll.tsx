'use client';

import { ReactLenis } from 'lenis/react';
import { type ReactNode } from 'react';

/**
 * Wraps children with Lenis smooth scrolling.
 * Uses the React integration so the rAF loop is managed automatically.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
