'use client';

// The Explorer page's list place (docs/specs/013-workspace/explorer-structure.md "Back"): kept per address for the
// tab's session, taken back only when the page was reached by Back or Forward. The scope is the address without the
// lens, so typing in the search keeps the list's cascade and pin while another view or folder starts afresh.
import { useState } from 'react';
import { sessionPlaces } from '@/components/primitives/windowed-list/list-places';
import {
  takeHistoryTraversal,
  watchHistoryTraversal,
} from '@/components/primitives/windowed-list/history-traversal';
import type { WindowedListOptions } from '@/components/primitives/windowed-list/useWindowedList';

watchHistoryTraversal();

const LENS_PARAM = 'q';

function addressNow(): { key: string; scope: string } {
  if (typeof window === 'undefined') return { key: '', scope: '' };
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  params.delete(LENS_PARAM);
  const rest = params.toString();
  return { key: `${pathname}${search}`, scope: rest ? `${pathname}?${rest}` : pathname };
}

export function useExplorerListPlace(): Pick<WindowedListOptions, 'place' | 'resetKey'> {
  const [restore] = useState(() => takeHistoryTraversal(addressNow().key));
  const { key, scope } = addressNow();
  if (!key) return { place: null, resetKey: '' };
  return { place: { key, store: sessionPlaces, restore }, resetKey: scope };
}
