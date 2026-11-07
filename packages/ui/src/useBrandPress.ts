import { useRef } from 'react';
import { STACK_STEP, ISO_COS } from './brand-mark-geometry';

// The logo's press (docs/specs/004-interface-design/brand-mark.md): the sheets draw a little
// toward the page and the art a touch smaller, then ease back. Small and quick, no overshoot.
export const BRAND_PRESS_IN_MS = 90;
export const BRAND_PRESS_OUT_MS = 160;
const PRESS_SCALE = 0.97;
const REDUCED_PRESS_OPACITY = 0.85;
const REDUCED_PRESS_MS = 100;

// A share of one step toward the page, in screen units.
const toward = (share: number) =>
  `translate(${(-share * STACK_STEP.along * ISO_COS).toFixed(2)}px, ${(share * (STACK_STEP.along / 2 + STACK_STEP.rise)).toFixed(2)}px)`;

const PRESSED: readonly [string, string][] = [
  ['[data-sheet-motion="sheet"]', toward(0.15)],
  ['[data-sheet-motion="plain"]', toward(0.07)],
  ['[data-mark-art]', `scale(${PRESS_SCALE})`],
];

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Handlers for the logo's root element. Each press animates the elements under it with the Web Animations API,
// so nothing re-renders; a release eases from wherever the press had got to.
export function useBrandPress() {
  const down = useRef(false);

  const press = (root: HTMLElement) => {
    if (down.current) return;
    down.current = true;
    if (reduced()) {
      root
        .querySelector('[data-mark-art]')
        ?.animate([{ opacity: 1 }, { opacity: REDUCED_PRESS_OPACITY }], {
          duration: REDUCED_PRESS_MS,
          easing: 'ease-out',
          fill: 'forwards',
        });
      return;
    }
    for (const [selector, transform] of PRESSED) {
      const el = root.querySelector(selector);
      el?.getAnimations().forEach((a) => a.cancel());
      el?.animate([{ transform: 'none' }, { transform }], {
        duration: BRAND_PRESS_IN_MS,
        easing: 'ease-out',
        fill: 'forwards',
      });
    }
  };

  const release = (root: HTMLElement) => {
    if (!down.current) return;
    down.current = false;
    if (reduced()) {
      const art = root.querySelector('[data-mark-art]');
      art?.getAnimations().forEach((a) => a.cancel());
      art?.animate([{ opacity: REDUCED_PRESS_OPACITY }, { opacity: 1 }], {
        duration: REDUCED_PRESS_MS,
        easing: 'ease-out',
      });
      return;
    }
    for (const [selector] of PRESSED) {
      const el = root.querySelector(selector);
      if (!el) continue;
      const from = getComputedStyle(el).transform;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ transform: from && from !== 'none' ? from : 'none' }, { transform: 'none' }], {
        duration: BRAND_PRESS_OUT_MS,
        easing: 'ease-out',
      });
    }
  };

  const isPressKey = (e: React.KeyboardEvent) => e.key === 'Enter' || e.key === ' ';
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button === 0) press(e.currentTarget);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => release(e.currentTarget),
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => release(e.currentTarget),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => release(e.currentTarget),
    onBlur: (e: React.FocusEvent<HTMLElement>) => release(e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (isPressKey(e) && !e.repeat) press(e.currentTarget);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLElement>) => {
      if (isPressKey(e)) release(e.currentTarget);
    },
  };
}
