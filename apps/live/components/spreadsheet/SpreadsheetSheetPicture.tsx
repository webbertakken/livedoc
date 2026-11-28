'use client';

// A spreadsheet's sheet, read-only, as a picture (sheet-picture.ts, D507): at its own size from A1, scrolled inside
// its box when larger. The box is a labelled region that takes focus, so it scrolls from the keyboard too.
import { useMemo } from 'react';
import type { Workbook } from '@livedoc/sheets';
import { sheetPictureSrc, sheetPictureSvg } from './sheet-picture';

export function SpreadsheetSheetPicture({
  wb,
  sheetId,
  title,
  label,
  version,
}: {
  wb: Workbook;
  sheetId: string;
  // The sheet's name, drawn in the picture's header.
  title: string;
  // What the picture is, said for it ("Costs · Budget").
  label: string;
  // Counts up with each read of the workbook, so the picture is drawn again.
  version: number;
}) {
  const src = useMemo(
    () => {
      const svg = sheetPictureSvg(wb, sheetId, title);
      return svg ? sheetPictureSrc(svg) : null;
    },
    // The workbook changes with each read: `version` says when.
    // oxlint-disable-next-line react/exhaustive-deps
    [wb, sheetId, title, version],
  );
  if (!src) return null;
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="h-full w-full overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
    >
      <img src={src} alt={label} draggable={false} className="block max-w-none select-none" />
    </div>
  );
}
