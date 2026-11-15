'use client';

// The Explorer page's list place (docs/specs/013-workspace/explorer-structure.md "Back"): kept per view for the tab's
// session, and taken back only when the page was reached by Back or Forward. A view is its node (a folder, Recent);
// another view starts afresh, its cascade playing again.
import { useState } from 'react';
import { sessionPlaces } from '@/components/primitives/windowed-list/list-places';
import {
  takeHistoryTraversal,
  watchHistoryTraversal,
} from '@/components/primitives/windowed-list/history-traversal';
import type { WindowedListOptions } from '@/components/primitives/windowed-list/useWindowedList';

watchHistoryTraversal();

// Opening a document scrolls the page to its top before the Explorer's list goes: not a place to keep.
const onExplorerPage = () => window.location.pathname.startsWith('/explorer');

const addressNow = () =>
  typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`;

export function useExplorerListPlace(
  listKey: string | undefined,
): Pick<WindowedListOptions, 'place' | 'resetKey'> {
  // Read as each view is first shown: by then Back has landed on the address it went to.
  const [shown, setShown] = useState(() => ({
    listKey,
    restore: takeHistoryTraversal(addressNow()),
  }));
  if (shown.listKey !== listKey) setShown({ listKey, restore: takeHistoryTraversal(addressNow()) });
  const restore = shown.listKey === listKey && shown.restore;
  if (!listKey) return { place: null, resetKey: '' };
  return {
    place: { key: `explorer:${listKey}`, store: sessionPlaces, restore, writable: onExplorerPage },
    resetKey: listKey,
  };
}
