import { useEffect } from 'react';

// How long the logo's assembly takes (docs/specs/004-interface-design/brand-mark.md): the
// last part, `Doc`, lands at 610 + 500ms, the fold at 760 + 360ms, the lines by 560 + 3 × 70 + 380ms; 1700 covers
// them all.
export const BRAND_ASSEMBLE_MS = 1700;

// Marks the page assembled once its header logo has played the assembly, so a header mounted later (a client
// navigation) is drawn whole: the assembly plays once per page load. The animation itself is CSS
// (brand-motion.css), so it starts with the first paint, before any script.
export function useBrandAssembled(assemble: boolean) {
  useEffect(() => {
    if (!assemble) return;
    const root = document.documentElement;
    if (root.hasAttribute('data-brand-assembled')) return;
    const timer = window.setTimeout(
      () => root.setAttribute('data-brand-assembled', ''),
      BRAND_ASSEMBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [assemble]);
}
