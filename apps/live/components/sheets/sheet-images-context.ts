'use client';

// The pictures a spreadsheet's IMAGE formulas show (docs/specs/029-sheets/imports.md "IMAGE"): the spreadsheet surface
// provides a loader once an Editor allowed access; without one (a Plan Sheet, access not allowed) none is drawn.
import { createContext, useContext, useEffect, useState } from 'react';
import { fetchSheetImage } from '@/lib/api/sheet-imports';
import type { SheetsScope } from '@/lib/api/sheets';
import { SheetImageLoader } from './sheet-image-loader';

export const SheetImagesContext = createContext<SheetImageLoader | null>(null);

export function useSheetImages(): SheetImageLoader | null {
  return useContext(SheetImagesContext);
}

/** A loader for the scope while its imports are allowed, let go when who asks, the document or the access changes. */
export function useSheetImageLoader(scope: SheetsScope, allowed: boolean): SheetImageLoader | null {
  const [loader, setLoader] = useState<SheetImageLoader | null>(null);
  const { documentId, ownerId, shareCode, tabId } = scope;
  useEffect(() => {
    if (!allowed) return;
    const asking: SheetsScope = { documentId, ownerId, shareCode, tabId };
    const made = new SheetImageLoader({ fetch: (url) => fetchSheetImage(asking, url) });
    setLoader(made);
    return () => {
      made.dispose();
      setLoader(null);
    };
  }, [documentId, ownerId, shareCode, tabId, allowed]);
  return loader;
}
