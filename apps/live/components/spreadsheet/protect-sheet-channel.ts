'use client';

// How a sheet tab's Protect Sheet reaches the open sheet's side panel (docs/specs/029-sheets/data-tools.md "Protected
// ranges"): the sheet bar sits beside the open sheet's parts, which hold the panels, and asks through this channel.
import { createContext } from 'react';

export type ProtectSheetChannel = {
  // Opens Protect Sheets and Ranges on a new protection of the sheet on this tab.
  open: (tabId: string) => void;
  // The open sheet's parts listen while mounted.
  listen: (fn: ((tabId: string) => void) | null) => void;
};

export function createProtectSheetChannel(): ProtectSheetChannel {
  let listener: ((tabId: string) => void) | null = null;
  return {
    open: (tabId) => listener?.(tabId),
    listen: (fn) => {
      listener = fn;
    },
  };
}

export const ProtectSheetContext = createContext<ProtectSheetChannel | null>(null);
