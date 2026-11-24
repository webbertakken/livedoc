'use client';

// The colour and line the open spreadsheet's borders draw in (docs/specs/029-sheets/formatting.md "Borders", D209):
// chosen in the Borders panel, kept as sheets are switched until the page closes. A grid outside a spreadsheet's
// surface (a test's) keeps its own.
import { createContext, useContext, useState } from 'react';
import { BORDER_LINE_START, type BorderLineChoice } from '@/lib/spreadsheet/border-bindings';

export type BorderLineState = readonly [BorderLineChoice, (next: BorderLineChoice) => void];

export const BorderLineContext = createContext<BorderLineState | null>(null);

/** The spreadsheet's border line, black and thin to start. */
export function useBorderLineState(): BorderLineState {
  return useState<BorderLineChoice>(BORDER_LINE_START);
}

/** The border line of the spreadsheet the grid is in. */
export function useBorderLine(): BorderLineState {
  const shared = useContext(BorderLineContext);
  const own = useBorderLineState();
  return shared ?? own;
}
