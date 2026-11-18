'use client';

// What a mind map draws from its tree, worked out once for the tab: the number each numbered mind node shows
// (docs/specs/009-elements/mind-node.md "Numbered nodes") and the roots that wear a halo ("The root's halo"),
// each read by its node. The halo is the mind maps family's: worked out once the family is in, as its nodes are drawn.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { mindNumbers, type Element } from '@livedoc/document';
import { useKindFamilyLoaded } from '@/lib/element-kinds/react';
import { requireKindFamily } from '@/lib/element-kinds/store';

const noHaloRoots: ReadonlySet<string> = new Set();

const MindNumbersContext = createContext<ReadonlyMap<string, number> | null>(null);

export function MindNumbersProvider({
  elements,
  children,
}: {
  elements: Element[];
  children: ReactNode;
}) {
  const numbers = useMemo(() => mindNumbers(elements), [elements]);
  // Every element view reads this, so its identity holds while the numbers do: a document change that
  // leaves them as they were (a released drag) re-renders no element view through it.
  const key = [...numbers].map(([id, n]) => `${id}:${n}`).join();
  // oxlint-disable-next-line react/exhaustive-deps -- keyed on the entries, not the map
  const stable = useMemo(() => (key ? numbers : null), [key]);
  return <MindNumbersContext.Provider value={stable}>{children}</MindNumbersContext.Provider>;
}

/** The number a node is drawn with, or undefined when it is not numbered. */
export function useMindNumber(id: string): number | undefined {
  return useContext(MindNumbersContext)?.get(id);
}

// The roots drawn with a halo (docs/specs/009-elements/mind-node.md "The root's halo"), worked out once for the tab.
const MindHaloRootsContext = createContext<ReadonlySet<string> | null>(null);

export function MindHaloRootsProvider({
  elements,
  children,
}: {
  elements: Element[];
  children: ReactNode;
}) {
  const mindMapsIn = useKindFamilyLoaded('mind-maps');
  const roots = useMemo(
    () => (mindMapsIn ? requireKindFamily('mind-maps').mindHaloRoots(elements) : noHaloRoots),
    [elements, mindMapsIn],
  );
  // Its identity holds while the roots do, so a change that keeps every map's root re-renders no node through it.
  const key = [...roots].sort().join();
  // oxlint-disable-next-line react/exhaustive-deps -- keyed on the entries, not the set
  const stable = useMemo(() => (key ? roots : null), [key]);
  return <MindHaloRootsContext.Provider value={stable}>{children}</MindHaloRootsContext.Provider>;
}

/** Whether a node is a root drawn with its halo. */
export function useMindHaloRoot(id: string): boolean {
  return useContext(MindHaloRootsContext)?.has(id) ?? false;
}
