'use client';

// What a mind map draws beyond its nodes (docs/specs/009-elements/mind-node.md "Numbered nodes", "Groups"): the
// number each numbered node shows, worked out once for the tab and read by its node, and every group's tinted box,
// drawn under the nodes. Pressing a group's box selects its members, so the group is dragged as one.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  MIND_GROUP_RADIUS,
  mindGroupBoxes,
  mindGroupColours,
  mindNumbers,
  type Element,
} from '@livedoc/document';
import { useCanvasSurface } from './CanvasSurfaceContext';

const MindNumbersContext = createContext<ReadonlyMap<string, number> | null>(null);

export function MindNumbersProvider({
  elements,
  children,
}: {
  elements: Element[];
  children: ReactNode;
}) {
  const numbers = useMemo(() => mindNumbers(elements), [elements]);
  return <MindNumbersContext.Provider value={numbers}>{children}</MindNumbersContext.Provider>;
}

/** The number a node is drawn with, or undefined when it is not numbered. */
export function useMindNumber(id: string): number | undefined {
  return useContext(MindNumbersContext)?.get(id);
}

export function MindGroupBackdrops({
  elements,
  onSelect,
}: {
  elements: Element[];
  // Selects the group's members; absent where nothing can be selected.
  onSelect?: (ids: Set<string>) => void;
}) {
  const surface = useCanvasSurface();
  const boxes = useMemo(() => mindGroupBoxes(elements), [elements]);
  if (boxes.length === 0) return null;
  return (
    <>
      {boxes.map((g) => {
        const { fill, stroke } = mindGroupColours(g.groupId, surface === 'dark' ? 'dark' : 'light');
        return (
          <div
            key={`${g.parentId}:${g.groupId}`}
            data-mind-group={g.groupId}
            aria-hidden
            className={`absolute ${onSelect ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            style={{
              left: g.x,
              top: g.y,
              width: g.width,
              height: g.height,
              borderRadius: MIND_GROUP_RADIUS,
              background: fill,
              border: `1px solid ${stroke}`,
            }}
            onPointerDown={
              onSelect
                ? (e) => {
                    e.stopPropagation();
                    onSelect(new Set(g.memberIds));
                  }
                : undefined
            }
          />
        );
      })}
    </>
  );
}
