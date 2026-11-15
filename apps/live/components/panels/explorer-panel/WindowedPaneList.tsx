'use client';

// A panel list of documents that may be long (docs/specs/013-workspace/explorer-structure.md "Long lists"): drawn as it
// comes into view in the pane that scrolls it, its rows saying their place to a screen reader, Up and Down moving
// between them as in every pane list.
import { useMemo, type ReactNode } from 'react';
import { nearestScroller } from '@/components/primitives/windowed-list/nearest-scroller';
import {
  useWindowedList,
  type ListPlaceOption,
} from '@/components/primitives/windowed-list/useWindowedList';
import { WindowGap, windowChildren } from '@/components/primitives/windowed-list/WindowGap';
import { paneListKeys } from './pane-parts';

// A pane row's height and the list's gap before one is measured.
const PANE_ROW_STRIDE_PX = 58;

export function WindowedPaneList<T extends { id: string }>({
  label,
  items,
  renderItem,
  place = null,
  scope = '',
}: {
  label?: string;
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  /** Where the list's place is kept, and whether to go back to it now. */
  place?: ListPlaceOption;
  /** The folder or section shown: a new one plays the cascade again. */
  scope?: string;
}) {
  const { attachList, segments, cascading, onFocus, onDragStart } = useWindowedList({
    keys: useIds(items),
    estimateStride: PANE_ROW_STRIDE_PX,
    scroller: nearestScroller,
    aria: { kind: 'list' },
    place,
    resetKey: scope,
  });
  return (
    <ul
      ref={attachList}
      aria-label={label}
      onKeyDown={paneListKeys}
      onFocus={onFocus}
      onDragStart={onDragStart}
      className={`${cascading ? 'lvd-cascade ' : ''}flex flex-col gap-1.5`}
    >
      {windowChildren(
        segments,
        (i) => renderItem(items[i]!),
        (height) => (
          <WindowGap as="li" height={height} />
        ),
      )}
    </ul>
  );
}

function useIds(items: readonly { id: string }[]): string[] {
  return useMemo(() => items.map((i) => i.id), [items]);
}
