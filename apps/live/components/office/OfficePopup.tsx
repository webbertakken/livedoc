'use client';

// A toolbar control's popup (docs/specs/004-interface-design/office-shell.md "Toolbar"): drawn at the top of the page,
// so the toolbar's clipping and scrolling never cut it off, under its control (or above it), inside the window. It
// carries the shell's look tokens with it, and marks itself so its control's outside-press check counts it as inside.
// It may open from a box instead of a control: the writing's caret, for the emoji colon list (objects.md "Emoji").
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Portal } from '@livedoc/ui';
import { popupPlace, type Box } from '@/lib/office/popup-place';

/** What a popup is marked with, for `useClickOutside`'s inside selector. */
export const OFFICE_POPUP = '[data-office-popup]';

export function OfficePopup({
  anchor,
  children,
}: {
  // The control it opens from, or a box in the window.
  anchor: HTMLElement | Box | null;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Measured once drawn, then placed before it is painted.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !anchor) return;
    const { left, top } = popupPlace(
      anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [anchor]);
  return (
    <Portal>
      <div className="office-shell">
        <div ref={box} data-office-popup="" className="fixed top-0 left-0 z-50">
          {children}
        </div>
      </div>
    </Portal>
  );
}
