import { flushSync } from 'react-dom';
import { centreOnLine, type CentrePlacement } from './line-centre';

// The top line's side groups as the centre toolbar (the Palette strip, or Draw's dock at the top) measures them
// (docs/specs/007-editor/toolbar-layout.md "When a line runs out of room"): the brand group at the left
// (`[data-toolbar-menu]`), the actions group at the right (`[data-toolbar-actions]`). The placement itself is
// line-centre's, shared with the bottom line.

export const BRAND_GROUP_SELECTOR = '[data-toolbar-menu]';
export const ACTIONS_GROUP_SELECTOR = '[data-toolbar-actions]';

/** The side groups on the page, for a hook to observe. */
export function topLineGroups(): HTMLElement[] {
  return [BRAND_GROUP_SELECTOR, ACTIONS_GROUP_SELECTOR]
    .map((s) => document.querySelector<HTMLElement>(s))
    .filter((el): el is HTMLElement => el !== null);
}

/**
 * Runs `measure` whenever the centre toolbar's room may have changed: `boxes` (the toolbar's own, the editor's pane)
 * or the side groups resizing, a control joining or leaving a side group, or the window resizing. `sides: false`
 * leaves the side groups out (a phone's strip has a row of its own). Returns the cleanup.
 *
 * A control joining a side group (the Start Tour button once a tour is on offer, an account's button after the
 * session read) is a DOM change React makes in a commit. Its MutationObserver runs in the microtask straight after,
 * and applies the measure with flushSync, so the frame that first draws the control draws the toolbar's answer too.
 * A ResizeObserver's update is scheduled for a later task, after that frame is painted: the strip visibly refitted
 * a frame late, a layout shift as a board opens. It stays for what changes size without a DOM change (a font).
 */
export function observeTopLine(
  measure: () => void,
  boxes: readonly (Element | null | undefined)[],
  { sides = true }: { sides?: boolean } = {},
): () => void {
  const groups = sides ? topLineGroups() : [];
  const resize = new ResizeObserver(measure);
  for (const box of [...boxes, ...groups]) if (box) resize.observe(box);
  const joined = new MutationObserver(() => flushSync(measure));
  for (const group of groups)
    joined.observe(group, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', measure);
  return () => {
    resize.disconnect();
    joined.disconnect();
    window.removeEventListener('resize', measure);
  };
}

/** Where a centre toolbar `width` wide sits on the top line as drawn now, in the editor box `view`. */
export function measureTopLine(
  view: { left: number; width: number },
  width: number,
): CentrePlacement {
  const box = (s: string) =>
    document.querySelector<HTMLElement>(s)?.getBoundingClientRect() ?? null;
  return centreOnLine({
    view,
    start: box(BRAND_GROUP_SELECTOR),
    end: box(ACTIONS_GROUP_SELECTOR),
    width,
  });
}
