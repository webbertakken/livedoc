// Going between what a version changed (docs/specs/034-text-documents/review.md "Version history", Show changes;
// review-surfaces.md "The keys"): ⌘⌥ N then R and ⌘⌥ P then R move to the next and previous change drawn, in reading
// order, scrolled into the middle of the view and marked; a change is an inserted or deleted stretch, or a whole block,
// never counted twice for the text inside it. Past the last or before the first nothing moves.

/** The change gone to, marked on its element. */
export const CURRENT_CHANGE = 'data-version-change-current';
const CHANGE = '[data-ychange]';

/** Every change drawn in `container`, in reading order: an element inside another change is that change. */
export function versionChanges(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(CHANGE)].filter(
    (element) => !element.parentElement?.closest(CHANGE),
  );
}

/** Goes to the next or previous change; where it went (1-based) and how many there are, or null when there are none. */
export function stepVersionChange(
  container: ParentNode,
  forward: boolean,
): { index: number; count: number } | null {
  const changes = versionChanges(container);
  if (changes.length === 0) return null;
  const at = changes.findIndex((c) => c.hasAttribute(CURRENT_CHANGE));
  const to =
    at < 0
      ? forward
        ? 0
        : changes.length - 1
      : Math.min(changes.length - 1, Math.max(0, at + (forward ? 1 : -1)));
  if (at >= 0) changes[at]!.removeAttribute(CURRENT_CHANGE);
  const target = changes[to]!;
  target.setAttribute(CURRENT_CHANGE, '');
  target.scrollIntoView?.({ block: 'center' });
  return { index: to + 1, count: changes.length };
}

/** What a screen reader hears on arriving (default copy). */
export const changeAnnouncement = ({ index, count }: { index: number; count: number }): string =>
  `Change ${index} of ${count}`;
