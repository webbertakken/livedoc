'use client';

// The number each numbered mind node shows (docs/specs/009-elements/mind-node.md "Numbered nodes"), worked out once
// for the tab and read by its node.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { mindNumbers, type Element } from '@livedoc/document';

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
