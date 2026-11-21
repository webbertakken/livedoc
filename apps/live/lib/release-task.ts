// A gesture's release lands in a task of its own (docs/specs/008-canvas/canvas-performance.md "A release lands in a
// task of its own"). The browser finishes a pointer's release by laying the page out, inside the release's own task,
// whenever the release changed the page: a release that renders the editor there pays for its render and for laying
// out what it changed in one task. Handed here, the release's work runs in the next task instead, and its layout in
// the frame that shows it.
//
// The next input never overtakes it: a press, a move, a key or a wheel lands whatever is pending before anyone else
// hears of it (a capture listener on the window, added when this module loads, so before any gesture's own).

import { debugLog } from './debug-log';

const pending: (() => void)[] = [];
let posted = false;

// One port per page: a message is a task of its own, posted at once (a timeout's may wait behind a clamp).
let channel: MessageChannel | null = null;
function postTask(run: () => void) {
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => run();
  }
  channel.port2.postMessage(null);
}

// Runs everything pending now, in the order it was handed over, work handed over while landing included. One that
// throws is reported and the rest still land.
export function landReleases(): void {
  while (pending.length > 0) {
    const work = pending.shift()!;
    try {
      work();
    } catch (error) {
      // To the page's error handlers, as an uncaught error in a listener would be.
      reportError(error);
    }
  }
}

// Hands a release's work to the next task.
export function afterRelease(work: () => void): void {
  pending.push(work);
  if (posted) return;
  posted = true;
  postTask(() => {
    posted = false;
    landReleases();
  });
}

const OVERTAKING_INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
if (typeof window !== 'undefined') {
  for (const type of OVERTAKING_INPUTS)
    window.addEventListener(
      type,
      () => {
        if (pending.length === 0) return;
        debugLog('[release-task] landed before the next input', {
          input: type,
          pending: pending.length,
        });
        landReleases();
      },
      { capture: true, passive: true },
    );
}
