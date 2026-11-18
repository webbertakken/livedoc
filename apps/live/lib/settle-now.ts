import { flushSync } from 'react-dom';

// Applies what an observer reported (a MutationObserver's microtask, a ResizeObserver's callback) before the frame is
// drawn, with flushSync, so chrome placed from a measurement moves in the frame its cause does
// (docs/specs/007-editor/toolbar-layout.md "Motion"). Except during a View Transition: React commits one inside the
// browser's update callback, and a synchronous update in the middle of it left the transition with nothing to animate
// (a mode change in the start panel). The update then lands with React's own; it follows the person's own press, so
// it is no layout shift. A browser without `activeViewTransition` settles at once, as before.
export function settleNow(update: () => void): void {
  const transition = (document as Document & { activeViewTransition?: unknown })
    .activeViewTransition;
  if (transition) update();
  else flushSync(update);
}
