'use client';

// The formula bar's row on a spreadsheet (docs/specs/029-sheets/surface.md "Formula bar", "Layout", "Phone and
// tablet"): the formula bar, drawn on a phone only while a cell is edited so the grid has the room, and Full Screen's
// way back without a key (D187).
import { Button, useMediaQuery } from '@livedoc/ui';
import type { ComponentProps } from 'react';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { SheetFormulaBar } from '@/components/sheets/SheetFormulaBar';
import { PHONE_MEDIA_QUERY } from '@/lib/responsive';
import { useFullScreenContext } from './spreadsheet-full-screen';

export function SpreadsheetFormulaBarRow(props: ComponentProps<typeof SheetFormulaBar>) {
  const { editing } = useSheetController();
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  const fullScreen = useFullScreenContext();
  const bar = !phone || editing !== null;
  if (!bar && !fullScreen?.on) return null;
  return (
    <div data-region="formulabar" className="flex items-center">
      {bar ? (
        <div className="min-w-0 flex-1">
          <SheetFormulaBar {...props} />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {fullScreen?.on ? (
        <Button variant="secondary" size="xs" className="mx-2 shrink-0" onClick={fullScreen.exit}>
          Exit Full Screen
        </Button>
      ) : null}
    </div>
  );
}
