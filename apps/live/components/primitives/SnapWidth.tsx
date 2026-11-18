'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

// Rounds a content-sized box UP to a whole-pixel width, so whatever sits
// after it (or inside a centred parent) lands on the pixel grid.
//
// Text-sized controls are fractional wide (a label measures 61.39px), and in
// a row of icons that fraction pushes every later icon onto a sub-pixel
// position, where its 1.5px strokes anti-alias to a smear. Rounding the box
// that holds the text stops the fraction there.
//
// `matchParentParity` also nudges the width by a pixel so its parity matches
// the parent's: a box centred in its parent sits (parent - box) / 2 in, which
// is half a pixel off whenever one width is odd and the other even.
//
// The width is written straight onto the box, never held in React state: a ResizeObserver reports a resize before
// the frame is drawn, and a write then lands in that frame, where a state update lands a task later, after it. The
// box followed its content a frame late, and the palette strip it centres drew at its old width and then moved.
// React renders no `width` here, so nothing it does overwrites the one written.
//
// Chrome counts what a resize callback moves as a layout shift, even before the frame is drawn, so a box whose
// content changes in a React commit names that content in `contentKey`: a change re-measures in the commit itself.
export function SnapWidth({
  children,
  matchParentParity = false,
  className = '',
  contentKey,
}: {
  children: ReactNode;
  matchParentParity?: boolean;
  className?: string;
  // What the box holds, where it changes in a commit (the palette strip's tiles): a change re-measures in it.
  contentKey?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const parent = outer?.parentElement;
    if (!outer || !inner) return;
    const measure = () => {
      // Inside a UI-scaled surface (docs/specs/007-editor/ui-scale.md) the
      // rects are screen px and the width written is the zoomed box's own px.
      const zoom = currentZoom(inner);
      let w = Math.ceil(inner.getBoundingClientRect().width / zoom);
      if (matchParentParity && parent) {
        const pw = Math.round(parent.getBoundingClientRect().width / zoom);
        if ((pw - w) % 2 !== 0) w += 1;
      }
      const px = `${w}px`;
      if (outer.style.width !== px) outer.style.width = px;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    if (matchParentParity && parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [matchParentParity, contentKey]);

  return (
    <div ref={outerRef} className={`shrink-0 ${className}`}>
      <div ref={innerRef} className="w-max">
        {children}
      </div>
    </div>
  );
}

// The element's effective CSS zoom; 1 where the browser predates
// `currentCSSZoom`.
function currentZoom(el: HTMLElement): number {
  const zoom = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === 'number' && zoom > 0 ? zoom : 1;
}
