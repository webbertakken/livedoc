'use client';

// Format > Paragraph styles > Borders and shading (docs/specs/034-text-documents/text-and-paragraphs.md "Borders and
// shading"): the positions as toggle buttons, then the width, dash and colour of their borders, the background and
// the padding, for the paragraphs the selection touches. A field shows what they share, blank where they differ; a
// blank field changes nothing. Reset sets the dialog to no borders, no background and no padding.
import { useId, useState } from 'react';
import { HoverCard } from '@livedoc/ui';
import type { BorderDash, BorderSide } from '@livedoc/text-documents';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { noColour } from '@/components/colour/colour-options';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';
import { readSpacingField } from './TextDocumentSpacingDialog';
import {
  BORDER_DASHES,
  BORDER_PADDING_MAX_PT,
  BORDER_WIDTHS,
  type BordersAndShading,
  type BordersChange,
} from '@/lib/text-document/text-document-borders';

export const BORDER_POSITIONS: readonly { side: BorderSide; label: string }[] = [
  { side: 'top', label: 'Top' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
  { side: 'between', label: 'Between' },
];
const ALL_SIDES = BORDER_POSITIONS.map((p) => p.side);
const PADDING_RANGE = { min: 0, max: BORDER_PADDING_MAX_PT } as const;
const NONE_ID = 'none';
const NO_THEME: readonly never[] = [];
/** Why Between is dimmed in an OpenDocument text document. */
export const NO_BETWEEN_IN_ODF = 'OpenDocument files have no line between paragraphs';

const CONTROL =
  'h-9 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

const shownNumber = (value: number | null) =>
  value === null ? '' : String(Math.round(value * 100) / 100);

function ColourField({
  label,
  value,
  leading,
  onPick,
}: {
  label: string;
  // `#rrggbb`, 'none' (the leading option), or null where the paragraphs differ.
  value: string | null;
  leading?: string;
  onPick: (value: string) => void;
}) {
  const yours = useDocumentColours();
  const none = value === NONE_ID || value === null;
  return (
    <ColourSwatchButton
      label={label}
      swatch={none ? 'transparent' : value}
      none={none}
      value={value ?? ''}
      leading={leading ? [noColour(NONE_ID, leading)] : []}
      theme={NO_THEME}
      standard={OFFICE_COLOUR_ROWS}
      yours={yours}
      className={`${CONTROL} flex w-28 items-center gap-2`}
      onPick={onPick}
    >
      <span
        aria-hidden="true"
        data-colour-chip={none ? 'none' : value}
        className="size-4 rounded-sm border border-(--office-line)"
        style={none ? undefined : { background: value }}
      />
      <span className="text-xs text-(--office-muted)">
        {value === null ? 'Mixed' : value === NONE_ID ? (leading ?? '') : ''}
      </span>
    </ColourSwatchButton>
  );
}

export function TextDocumentBordersDialog({
  open,
  read,
  odf,
  onApply,
  onClose,
}: {
  open: boolean;
  // What the paragraphs share over these positions.
  read: (sides: readonly BorderSide[]) => BordersAndShading;
  // An OpenDocument text document: Between is dimmed.
  odf: boolean;
  onApply: (change: BordersChange) => void;
  onClose: () => void;
}) {
  const ids = { width: useId(), dash: useId(), padding: useId(), error: useId() };
  const [sides, setSides] = useState<readonly BorderSide[]>(() =>
    odf ? ALL_SIDES.filter((s) => s !== 'between') : ALL_SIDES,
  );
  const [fields, setFields] = useState(() => {
    const now = read(sides);
    return { ...now, padding: shownNumber(now.padding) };
  });
  const toggleSide = (side: BorderSide) => {
    const next = sides.includes(side) ? sides.filter((s) => s !== side) : [...sides, side];
    setSides(next);
    // The pressed positions' own values show; the background and padding stay as typed.
    const now = read(next);
    setFields((f) => ({ ...f, width: now.width, dash: now.dash, color: now.color }));
  };
  const padding = readSpacingField(fields.padding, PADDING_RANGE);
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Borders and shading"
      secondary={{
        label: 'Reset',
        onPress: () => setFields((f) => ({ ...f, width: 0, padding: '0', shading: NONE_ID })),
      }}
      primary={{
        label: 'Apply',
        disabled: padding === 'invalid',
        onPress: () =>
          onApply({
            sides,
            width: fields.width,
            dash: fields.dash,
            color: fields.color,
            padding: typeof padding === 'number' ? padding : null,
            shading: fields.shading,
          }),
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-4 pt-1">
        <span className="text-sm" id={`${ids.width}-position`}>
          Position
        </span>
        <div
          role="group"
          aria-labelledby={`${ids.width}-position`}
          className="flex flex-wrap gap-1"
        >
          {BORDER_POSITIONS.map(({ side, label }) => {
            const dimmed = odf && side === 'between';
            const button = (
              <button
                key={side}
                type="button"
                aria-pressed={sides.includes(side)}
                aria-disabled={dimmed || undefined}
                onClick={() => {
                  if (!dimmed) toggleSide(side);
                }}
                className={`${CONTROL} aria-pressed:border-(--office-primary) aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink) aria-disabled:opacity-40`}
              >
                {label}
              </button>
            );
            return dimmed ? (
              <HoverCard key={side} title={label} description={NO_BETWEEN_IN_ODF}>
                {button}
              </HoverCard>
            ) : (
              button
            );
          })}
        </div>

        <label htmlFor={ids.width} className="text-sm">
          Border width
        </label>
        <select
          id={ids.width}
          value={fields.width === null ? '' : String(fields.width)}
          onChange={(e) => setFields((f) => ({ ...f, width: Number(e.target.value) }))}
          className={`${CONTROL} w-28 cursor-pointer [&>option]:bg-(--office-menu)`}
        >
          {fields.width === null || !BORDER_WIDTHS.includes(fields.width as never) ? (
            <option value={fields.width === null ? '' : String(fields.width)}>
              {fields.width === null ? 'Mixed' : `${fields.width} pt`}
            </option>
          ) : null}
          {BORDER_WIDTHS.map((w) => (
            <option key={w} value={String(w)}>
              {w} pt
            </option>
          ))}
        </select>

        <label htmlFor={ids.dash} className="text-sm">
          Border dash
        </label>
        <select
          id={ids.dash}
          value={fields.dash ?? ''}
          onChange={(e) => setFields((f) => ({ ...f, dash: e.target.value as BorderDash }))}
          className={`${CONTROL} w-28 cursor-pointer [&>option]:bg-(--office-menu)`}
        >
          {fields.dash === null ? <option value="">Mixed</option> : null}
          {BORDER_DASHES.map(({ dash, label }) => (
            <option key={dash} value={dash}>
              {label}
            </option>
          ))}
        </select>

        <span className="text-sm">Border colour</span>
        <ColourField
          label="Border colour"
          value={fields.color}
          onPick={(color) => setFields((f) => ({ ...f, color }))}
        />

        <span className="text-sm">Background colour</span>
        <ColourField
          label="Background colour"
          value={fields.shading}
          leading="None"
          onPick={(shading) => setFields((f) => ({ ...f, shading }))}
        />

        <label htmlFor={ids.padding} className="text-sm">
          Paragraph padding
        </label>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <input
              id={ids.padding}
              type="text"
              inputMode="decimal"
              aria-invalid={padding === 'invalid'}
              aria-describedby={padding === 'invalid' ? ids.error : undefined}
              value={fields.padding}
              onChange={(e) => setFields((f) => ({ ...f, padding: e.target.value }))}
              className={`${CONTROL} w-28 tabular-nums aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400`}
            />
            <span aria-hidden="true" className="text-sm text-(--office-muted)">
              pt
            </span>
          </span>
          {padding === 'invalid' ? (
            <span id={ids.error} className="text-xs text-red-700 dark:text-red-300">
              Enter a number from 0 to {BORDER_PADDING_MAX_PT}.
            </span>
          ) : null}
        </div>
      </div>
    </OfficeDialog>
  );
}
