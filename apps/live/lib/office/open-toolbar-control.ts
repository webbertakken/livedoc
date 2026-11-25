// A menu item that opens a toolbar control (docs/specs/035-pdf-documents/marks.md "Changing a mark": Format > Colour
// opens the toolbar's Colour): the control is pressed where it shows, on the bar or in More; a control the bar has
// moved into More opens More first, then the control once More shows it.
import { debugLog } from '@/lib/debug-log';

const shownControl = (root: ParentNode, id: string): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>(`[data-office-control="${CSS.escape(id)}"]`)].find(
    (control) => control.closest('[hidden]') === null,
  ) ?? null;

/** Presses the toolbar's control `id`; answers whether it was found, on the bar or in More. */
export function openToolbarControl(
  id: string,
  root: ParentNode = document,
  later: (run: () => void) => void = requestAnimationFrame,
): boolean {
  const shown = shownControl(root, id);
  if (shown) {
    shown.click();
    return true;
  }
  const more = shownControl(root, 'more');
  if (!more || root.querySelector(`[data-office-control="${CSS.escape(id)}"]`) === null) {
    debugLog(`[office] control-missing id=${id}`);
    return false;
  }
  if (more.getAttribute('aria-expanded') !== 'true') more.click();
  later(() => {
    const moved = shownControl(root, id);
    if (moved) moved.click();
    else debugLog(`[office] control-missing id=${id}`);
  });
  return true;
}
