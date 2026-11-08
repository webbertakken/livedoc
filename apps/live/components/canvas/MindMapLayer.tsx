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
  return <MindNumbersContext.Provider value={numbers}>{children}</MindNumbersContext.Provider>;
}

/** The number a node is drawn with, or undefined when it is not numbered. */
export function useMindNumber(id: string): number | undefined {
  return useContext(MindNumbersContext)?.get(id);
}
