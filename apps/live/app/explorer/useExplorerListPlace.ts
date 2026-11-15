'use client';

// The Explorer page's list place (docs/specs/013-workspace/explorer-structure.md "Back"): kept per view for the tab's
// session, and taken back only when the page was reached by Back or Forward. A view is its node (a folder, Recent);
// another view starts afresh, its cascade playing again. The address is read by the list's effects, never in render.
import { sessionPlaces } from '@/components/primitives/windowed-list/list-places';
import {
  takeHistoryTraversal,
  watchHistoryTraversal,
} from '@/components/primitives/windowed-list/history-traversal';
import type { WindowedListOptions } from '@/components/primitives/windowed-list/useWindowedList';

watchHistoryTraversal();

// Whether Back or Forward has just landed here: asked as the list first shows a view.
const reachedByTraversal = () =>
  takeHistoryTraversal(`${window.location.pathname}${window.location.search}`);

// Opening a document scrolls the page to its top before the Explorer's list goes: not a place to keep.
const onExplorerPage = () => window.location.pathname.startsWith('/explorer');

export function useExplorerListPlace(
  listKey: string | undefined,
): Pick<WindowedListOptions, 'place' | 'resetKey'> {
  if (!listKey) return { place: null, resetKey: '' };
  return {
    place: {
      key: `explorer:${listKey}`,
      store: sessionPlaces,
      restore: reachedByTraversal,
      writable: onExplorerPage,
    },
    resetKey: listKey,
  };
}
