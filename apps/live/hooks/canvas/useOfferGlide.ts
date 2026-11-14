'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// The glide of a whole board offered (docs/specs/021-event-storming/arrange.md "How a person arranges": "under
// reduced motion the notes jump rather than glide"): while a lane plan or Arrange and Reorder is previewed, and a
// beat after so the notes glide back too, the document wears `data-offer-glide`, which eases every element's place
// (app/canvas-motion.css). Never while a drag is in hand: a drag tracks the pointer exactly.

/** How long the glide outlives the offer, so putting the board back glides too: a little over the ease itself. */
export const OFFER_GLIDE_LINGER_MS = 200;

const ATTRIBUTE = 'data-offer-glide';

export function useOfferGlide(offered: boolean): void {
  const [lingering, setLingering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!offered) return;
    return () => {
      setLingering(true);
      timer.current = setTimeout(() => setLingering(false), OFFER_GLIDE_LINGER_MS);
    };
  }, [offered]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const gliding = offered || lingering;
  useLayoutEffect(() => {
    if (!gliding) return;
    document.documentElement.setAttribute(ATTRIBUTE, '');
    return () => document.documentElement.removeAttribute(ATTRIBUTE);
  }, [gliding]);
}
