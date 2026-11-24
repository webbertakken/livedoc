'use client';

// The families a spreadsheet's open sheet names that LiveDoc does not serve (docs/specs/029-sheets/formatting.md
// "Font"; docs/specs/004-interface-design/fonts.md "More fonts"): those Google Fonts has load from it where reachable,
// read once per change of the sheet and asked again only when the families named change.
import { useEffect, useMemo } from 'react';
import type { Cell } from '@livedoc/sheets';
import { loadGoogleFamilies } from '@/lib/document-fonts/google-families';
import { cellFamilies } from '@/lib/spreadsheet/spreadsheet-fonts';

export function useCellGoogleFonts(sheet: { cells: { values: () => Iterable<Cell> } }): void {
  const named = useMemo(() => cellFamilies(sheet.cells.values()).join('\n'), [sheet]);
  const families = useMemo(() => (named ? named.split('\n') : []), [named]);
  useEffect(() => {
    if (families.length > 0) void loadGoogleFamilies(families);
  }, [families]);
}
