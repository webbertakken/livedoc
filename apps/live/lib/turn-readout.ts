'use client';

import { useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';

// The angle readout of a turn by hand (docs/specs/008-canvas/selection-transforms.md "Rotating by hand"): the angle
// the reference member lands on and where the pointer is, for the pill drawn beside it. Same discipline as
// `lane-preview.ts`: this channel never touches the document, it is module-level because a drag is global, single at
// a time and transient, and its one publisher (useEditorDrag) owns clearing it, on release and on cancel.

export type TurnReadoutValue = {
  // Whole degrees, clockwise, from 0 to 359.
  angle: number;
  clientX: number;
  clientY: number;
};

let readout: TurnReadoutValue | null = null;
const listeners = createListeners();

function same(a: TurnReadoutValue | null, b: TurnReadoutValue | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.angle === b.angle && a.clientX === b.clientX && a.clientY === b.clientY;
}

export function setTurnReadout(next: TurnReadoutValue | null): void {
  if (same(readout, next)) return;
  readout = next;
  listeners.notify();
}

export function getTurnReadout(): TurnReadoutValue | null {
  return readout;
}

export const subscribeTurnReadout = listeners.subscribe;

export function useTurnReadout(): TurnReadoutValue | null {
  return useSyncExternalStore(subscribeTurnReadout, getTurnReadout, () => null);
}
