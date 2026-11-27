'use client';

// The Separator chip under a split's last cell (docs/specs/029-sheets/data-tools.md "Split Text to Columns"): the
// separator as a choice, and for Custom a field that splits on Enter. Shown while the active cell stays in the split's
// range on its sheet; Escape puts it away.
import { useState, type KeyboardEvent } from 'react';
import { ChevronDownIcon } from '@livedoc/ui';
import { SEPARATOR_CHOICES, separatorOf, type SeparatorChoice } from '@/lib/spreadsheet/split-text';
import { useSheetController } from './sheet-controller';
import { cellBox, mergeAt } from './sheet-geometry';
import { SheetCellSlot } from './SheetCellSlot';
import { useSplitChip, type SplitChip, type SplitChipValue } from './sheet-split-chip-context';

const CHIP_GAP_PX = 4;

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function SheetSplitChip() {
  const split = useSplitChip();
  const c = useSheetController();
  const chip = split?.chip;
  if (!split || !chip || chip.sheetId !== c.sheet.id) return null;
  const { r, c: col } = c.selection.active;
  const { range } = chip;
  if (r < range.r1 || r > range.r2 || col < range.c1 || col > range.c2) return null;
  // A new split's chip starts afresh.
  return <SplitChipBody key={`${range.r1}:${range.r2}:${range.c1}`} split={split} chip={chip} />;
}

function SplitChipBody({ split, chip }: { split: SplitChipValue; chip: SplitChip }) {
  const c = useSheetController();
  const [custom, setCustom] = useState(chip.separator.kind === 'custom' ? chip.separator.text : '');
  const [kind, setKind] = useState<SeparatorChoice | null>(null);
  const { range } = chip;
  const shown = kind ?? chip.separator.kind;
  const g = c.geometry;
  const at = cellBox(g, range.r2, range.c1, c.scroll, mergeAt(g, range.r2, range.c1));
  const escape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    split.close();
    c.focusGrid();
  };
  return (
    <SheetCellSlot r={range.r2} c={range.c1}>
      <div
        role="group"
        aria-label="Split text to columns"
        data-split-chip
        className="absolute z-[8] flex items-center gap-2 rounded-full border py-0.5 pr-1 pl-3 text-body shadow-md"
        style={{
          left: Math.max(0, at.x),
          top: Math.max(0, at.y + at.h + CHIP_GAP_PX),
          backgroundColor: c.palette.surface,
          borderColor: c.palette.border,
        }}
        onPointerDown={stop}
        onDoubleClick={stop}
        onKeyDown={escape}
      >
        <label className="flex items-center gap-1">
          <span style={{ color: c.palette.muted }}>Separator:</span>
          <span className="relative inline-flex">
            <select
              className="h-chip cursor-pointer appearance-none rounded-control bg-transparent pr-6 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
              value={shown}
              onChange={(e) => {
                const next = e.target.value as SeparatorChoice;
                setKind(next);
                const separator = separatorOf(next, custom);
                if (separator) split.choose(separator);
              }}
            >
              {SEPARATOR_CHOICES.map((choice) => (
                <option key={choice.kind} value={choice.kind}>
                  {choice.label}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2"
            >
              <ChevronDownIcon size={14} />
            </span>
          </span>
        </label>
        {shown === 'custom' ? (
          <input
            type="text"
            aria-label="Custom separator"
            className="h-chip w-24 rounded-control border bg-transparent px-2 outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
            style={{ borderColor: c.palette.border }}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const separator = separatorOf('custom', custom);
              if (separator) split.choose(separator);
            }}
          />
        ) : null}
      </div>
    </SheetCellSlot>
  );
}
