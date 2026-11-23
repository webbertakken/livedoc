'use client';

// The Resize dialog (docs/specs/029-sheets/grid-and-editing.md "Rows, columns and cells", D158): the lines' size in
// pixels, or fit to their data, as Google's Resize row and Resize column do.
import { useId, useState } from 'react';
import {
  AXIS_SIZE_MAX,
  COLUMN_WIDTH_MIN,
  COLUMN_WIDTH_NEW,
  ROW_HEIGHT_MIN,
  ROW_HEIGHT_NEW,
} from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { lineSpan, type LineAxis } from '@/lib/spreadsheet/line-span';
import { useSheetController } from './sheet-controller';
import type { SheetActions } from './useSheetActions';

/** The pixels typed, taken within the line's bounds (D158); null without a digit. */
export function readResizeField(text: string, axis: LineAxis): number | null {
  if (!/^\d+$/.test(text)) return null;
  const min = axis === 'r' ? ROW_HEIGHT_MIN : COLUMN_WIDTH_MIN;
  return Math.min(AXIS_SIZE_MAX, Math.max(min, Number(text)));
}

const FIELD =
  'h-9 w-28 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function SheetResizeDialog({
  axis,
  from,
  to,
  actions,
  onClose,
}: {
  axis: LineAxis;
  from: number;
  to: number;
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const id = useId();
  const [fit, setFit] = useState(false);
  const [text, setText] = useState(() => String(Math.round(actions.sizeOf(axis, from))));
  const px = readResizeField(text, axis);
  const { layout } = c.sheet;
  const fallback =
    axis === 'r' ? (layout.rowHeight ?? ROW_HEIGHT_NEW) : (layout.colWidth ?? COLUMN_WIDTH_NEW);
  const words = `Enter a new ${axis === 'r' ? 'row height' : 'column width'} in pixels. (Default: ${fallback})`;
  const positions = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const span = lineSpan(axis, from, to);
  // What OK does: fit, or the size typed; nothing without a number.
  const apply = fit
    ? () => actions.autofit(axis, positions)
    : px === null
      ? null
      : () => actions.resize(axis, positions, px);
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title={`Resize ${span}`}
      primary={
        apply
          ? {
              label: 'OK',
              onPress: () => {
                apply();
                onClose();
              },
            }
          : { label: 'OK', disabled: true, onPress: onClose }
      }
    >
      <div role="radiogroup" aria-label={`Size of ${span}`} className="flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={id} checked={!fit} onChange={() => setFit(false)} />
          <span id={`${id}-size`}>{words}</span>
        </label>
        <input
          aria-labelledby={`${id}-size`}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
            setFit(false);
          }}
          className={`${FIELD} ml-6`}
        />
        <label className="flex items-center gap-2">
          <input type="radio" name={id} checked={fit} onChange={() => setFit(true)} />
          Fit to data
        </label>
      </div>
    </OfficeDialog>
  );
}
