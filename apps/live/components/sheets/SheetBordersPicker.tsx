'use client';

// The toolbar's Borders menu (docs/specs/029-sheets/sheet.md "Toolbar"): which borders, as a compact grid of drawn
// squares (the lines it sets in ink, the rest faint), then the line as drawn swatches (thin, medium, thick, dashed,
// dotted), the chosen one marked. Each is named by the shared tooltip and its accessible name.
import type { BorderMode, BorderStyle } from '@livedoc/sheets';
import { Tooltip } from '@livedoc/ui';
import { BorderLineGlyph, BorderPlacementGlyph } from '@/components/office/border-glyphs';

export type BorderLine = { label: string; w: 1 | 2 | 3; s: BorderStyle };

export const BORDER_LINES: readonly BorderLine[] = [
  { label: 'Thin', w: 1, s: 'solid' },
  { label: 'Medium', w: 2, s: 'solid' },
  { label: 'Thick', w: 3, s: 'solid' },
  { label: 'Dashed', w: 1, s: 'dashed' },
  { label: 'Dotted', w: 1, s: 'dotted' },
];

const MODES: readonly { mode: BorderMode; label: string }[] = [
  { mode: 'all', label: 'All Borders' },
  { mode: 'inner', label: 'Inner Borders' },
  { mode: 'outer', label: 'Outer Borders' },
  { mode: 'none', label: 'No Borders' },
  { mode: 'top', label: 'Top Border' },
  { mode: 'bottom', label: 'Bottom Border' },
  { mode: 'left', label: 'Left Border' },
  { mode: 'right', label: 'Right Border' },
];

const CELL =
  'flex cursor-pointer items-center justify-center rounded-control text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50';

export function SheetBordersPicker({
  line,
  onLine,
  onPick,
}: {
  line: BorderLine;
  onLine: (line: BorderLine) => void;
  onPick: (mode: BorderMode) => void;
}) {
  return (
    <div className="flex w-[11.5rem] flex-col gap-2 p-2">
      <div role="group" aria-label="Borders" className="grid grid-cols-4 gap-1">
        {MODES.map((m) => (
          <Tooltip key={m.mode} label={m.label}>
            <button
              type="button"
              role="menuitem"
              aria-label={m.label}
              className={`${CELL} h-field w-full`}
              onClick={() => onPick(m.mode)}
            >
              <BorderPlacementGlyph placement={m.mode} />
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="h-px bg-slate-200 dark:bg-slate-700" />
      <div role="radiogroup" aria-label="Line" className="grid grid-cols-5 gap-1">
        {BORDER_LINES.map((l) => {
          const on = l.label === line.label;
          return (
            <Tooltip key={l.label} label={l.label}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={on}
                aria-label={l.label}
                className={`${CELL} h-field w-full ${
                  on ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : ''
                }`}
                onClick={() => onLine(l)}
              >
                <BorderLineGlyph line={l} />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
