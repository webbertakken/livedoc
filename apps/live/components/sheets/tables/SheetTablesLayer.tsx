'use client';

// Each table's chip over the grid (docs/specs/029-sheets/data-tools.md "Tables"): its name above its header row's first
// cell (on it, when the header is the sheet's first row); pressing it puts the active cell in the table and opens
// Table Settings. Everyone sees it; the panel says what each may change.
import { useContext } from 'react';
import { posRangeOf } from '@livedoc/sheets';
import { useSheetController } from '../sheet-controller';
import { rectOf } from '../SheetSelectionLayer';
import { TableSettingsContext } from './table-settings-context';

const CHIP_HEIGHT = 20;

export function SheetTablesLayer() {
  const c = useSheetController();
  const open = useContext(TableSettingsContext);
  const tables = c.sheet.layout.tables;
  if (!open || !tables?.length) return null;
  return (
    <div data-sheet-tables="" className="pointer-events-none absolute inset-0">
      {tables.map((t) => {
        const p = posRangeOf(c.sheet.layout, t);
        if (!p) return null;
        const r = rectOf(c.geometry, { r1: p.r1, c1: p.c1, r2: p.r1, c2: p.c1 }, c.scroll);
        const top = r.y >= CHIP_HEIGHT ? r.y - CHIP_HEIGHT : r.y;
        return (
          <button
            key={t.id}
            type="button"
            aria-label={`${t.name} table settings`}
            className="pointer-events-auto absolute flex items-center gap-1 rounded-t border border-b-0 px-1.5 text-xs font-semibold shadow-sm"
            style={{
              left: r.x,
              top,
              height: CHIP_HEIGHT,
              background: c.palette.surface,
              color: c.palette.text,
              borderColor: c.palette.border,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              c.setSelection({
                ranges: [{ r1: p.r1, c1: p.c1, r2: p.r1, c2: p.c1 }],
                active: { r: p.r1, c: p.c1 },
                anchor: { r: p.r1, c: p.c1 },
              });
              open(t.id);
            }}
          >
            {t.name}
            <span aria-hidden>▾</span>
          </button>
        );
      })}
    </div>
  );
}
