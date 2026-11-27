'use client';

// How a table's chip on the grid opens Table Settings (docs/specs/029-sheets/data-tools.md "Tables"): the open sheet's
// parts hold the side panel and provide this; a grid without it (a Plan Sheet) draws no chips.
import { createContext } from 'react';

export const TableSettingsContext = createContext<((tableId: string) => void) | null>(null);
