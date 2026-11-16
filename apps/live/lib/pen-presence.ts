// Whether a pen is near the screen, touching it or hovering over it (docs/specs/023-draw-mode/draw-mode.md "Touch and
// pen input"): while one is, a touch is a resting palm and does nothing. A pen is near from its first hover or press
// until it leaves range (`pointerout` with nowhere to go) or the browser cancels it. Events, never timers.

type PenEvent = {
  type: string;
  pointerType: string;
  pointerId: number;
  relatedTarget?: EventTarget | null;
};

const ARRIVES = new Set(['pointerover', 'pointerenter', 'pointerdown', 'pointermove']);

/** The pens near after `e`, by pointer id: the same set when `e` changes nothing. */
export function pensNearAfter(near: ReadonlySet<number>, e: PenEvent): ReadonlySet<number> {
  if (e.pointerType !== 'pen') return near;
  if (ARRIVES.has(e.type)) {
    if (near.has(e.pointerId)) return near;
    return new Set(near).add(e.pointerId);
  }
  const leaves = e.type === 'pointercancel' || (e.type === 'pointerout' && !e.relatedTarget);
  if (!leaves || !near.has(e.pointerId)) return near;
  const next = new Set(near);
  next.delete(e.pointerId);
  return next;
}

// Module memory: there is one screen, and every canvas on it reads the same pens.
let near: ReadonlySet<number> = new Set();

export function penNear(): boolean {
  return near.size > 0;
}

/** A touch while a pen is near: a palm, which neither pans, pinches, draws nor selects. */
export function isPalmTouch(pointerType: string): boolean {
  return pointerType === 'touch' && penNear();
}

const WATCHED = ['pointerover', 'pointerdown', 'pointermove', 'pointerout', 'pointercancel'];

/** Follows the pens on `target` (the document, in the capture phase, so it knows before any canvas handler). */
export function watchPenPresence(target: Document): () => void {
  const note = (e: Event) => {
    near = pensNearAfter(near, e as PointerEvent);
  };
  for (const type of WATCHED) target.addEventListener(type, note, true);
  return () => {
    for (const type of WATCHED) target.removeEventListener(type, note, true);
  };
}

export function resetPenPresenceForTests(): void {
  near = new Set();
}

/** The fingers among `touches`: Chrome on Android reports a pen as a touch too, with `touchType: 'stylus'`. */
// (`touchType` is Chrome's, absent from the standard `Touch` type and from other browsers.)
export function fingerTouches<T extends object>(touches: ArrayLike<T>): T[] {
  return Array.from(touches).filter((t) => (t as { touchType?: string }).touchType !== 'stylus');
}
