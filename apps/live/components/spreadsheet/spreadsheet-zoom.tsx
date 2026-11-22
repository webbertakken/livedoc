'use client';

// The person's zoom on a spreadsheet (docs/specs/029-sheets/surface.md "Grid", D133): kept for the page as sheets are
// switched, never saved or sent; the title row's field and View › Zoom set it, and the open sheet's grid reads its
// scale through the context.
import { createContext, useContext, useMemo, useState } from 'react';
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import { ZOOM_PERCENTS } from '@/lib/office/office-zoom';
import { SPREADSHEET_ZOOM_DEFAULT } from '@/lib/spreadsheet/spreadsheet-zoom';
import { track } from '@/lib/telemetry';

const SpreadsheetZoomContext = createContext(1);

export const SpreadsheetZoomProvider = SpreadsheetZoomContext.Provider;

/** The open sheet's grid scale: 1 at 100%. */
export const useSpreadsheetZoomScale = (): number => useContext(SpreadsheetZoomContext);

/** The zoom in force and its setter, as the toolbar's field takes it, and its scale for the grid. */
export function useSpreadsheetZoom(): { zoom: OfficeZoom; scale: number } {
  const [percent, setPercent] = useState(SPREADSHEET_ZOOM_DEFAULT);
  const zoom = useMemo<OfficeZoom>(
    () => ({
      value: percent,
      presets: ZOOM_PERCENTS,
      onChange: (next) => {
        // The field parses whole numbers only, and a spreadsheet's list has no Fit.
        if (typeof next !== 'number' || next === percent) return;
        setPercent(next);
        track('UI', 'Changed', 'SpreadsheetZoom');
      },
    }),
    [percent],
  );
  return { zoom, scale: percent / 100 };
}
