'use client';

// Where the sheet bar keeps room for the selection's summary (docs/specs/029-sheets/surface.md "Sheet bar"): the bar
// is drawn by the surface, the summary from inside the open sheet, which holds the selection it counts.
import { createContext, useContext } from 'react';

export const SummarySlotContext = createContext<HTMLElement | null>(null);

export const useSummarySlot = (): HTMLElement | null => useContext(SummarySlotContext);
