'use client';

// Image options' Recolour and Adjustments (docs/specs/034-text-documents/objects.md "Working with a picture"): a radio
// group of No recolour, then Light 1 to 8 and Dark 1 to 8, each drawn as its duotone, the arrows moving and choosing
// (by a row among the swatches with Up and Down); and a slider in percent for each adjustment, showing its value as it
// moves and written once let go. The look and order are LiveDoc's reading of Google's `(default)`.
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  PICTURE_ADJUSTMENTS,
  PICTURE_ADJUSTMENT_RANGES,
  type PictureAdjustment,
  type PictureColouring,
  type PictureRecolour,
} from '@livedoc/text-documents';
import { GRID_KEYS, gridStep, type GridKey } from '@/lib/office/grid-step';
import type { PictureColoursChange } from '@/lib/text-document/text-document-picture-edit';
import {
  PICTURE_RECOLOUR_COLOURS,
  PICTURE_RECOLOURS,
  pictureRecolourOf,
} from '@/lib/text-document/text-document-picture-recolour';

const SWATCHES = PICTURE_RECOLOURS.length - 1;
const COLUMNS = PICTURE_RECOLOUR_COLOURS.length;
const CHOICE =
  'cursor-pointer rounded-control outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-offset-1';
const CHECKED = 'ring-2 ring-(--office-primary) ring-offset-1';

const ADJUSTMENT_NAMES: Readonly<Record<PictureAdjustment, string>> = {
  transparency: 'Transparency',
  brightness: 'Brightness',
  contrast: 'Contrast',
};

/** The choice an arrow moves to from choice `at` (No recolour is 0, the swatches 1 to 16, a row of 8 each). */
function stepped(at: number, key: GridKey): number {
  const count = PICTURE_RECOLOURS.length;
  if (key === 'ArrowLeft') return (at - 1 + count) % count;
  if (key === 'ArrowRight') return (at + 1) % count;
  if (at === 0) return key === 'ArrowDown' ? 1 : 1 + COLUMNS;
  return gridStep(at - 1, SWATCHES, COLUMNS, key) + 1;
}

export function ImageRecolour({
  recolour,
  onColour,
}: {
  recolour: PictureRecolour | undefined;
  onColour: (change: PictureColoursChange) => void;
}) {
  const checked = pictureRecolourOf(recolour);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (at: number) => onColour({ recolour: PICTURE_RECOLOURS[at]!.recolour });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (!GRID_KEYS.includes(event.key)) return;
    event.preventDefault();
    const next = stepped(at, event.key as GridKey);
    choices.current[next]?.focus();
    choose(next);
  };
  // The checked choice is the one Tab reaches; with none checked, the first.
  const tabStop = Math.max(
    0,
    PICTURE_RECOLOURS.findIndex((c) => c.id === checked),
  );
  // One choice's radio: checked, the Tab stop, chosen by a press, moved from by the arrows.
  const choiceProps = (at: number) => ({
    ref: (button: HTMLButtonElement | null) => {
      choices.current[at] = button;
    },
    type: 'button' as const,
    role: 'radio',
    'aria-checked': PICTURE_RECOLOURS[at]!.id === checked,
    'aria-label': PICTURE_RECOLOURS[at]!.label,
    tabIndex: at === tabStop ? 0 : -1,
    onClick: () => choose(at),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, at),
  });
  const look = (at: number) => (PICTURE_RECOLOURS[at]!.id === checked ? CHECKED : '');
  return (
    <div role="radiogroup" aria-label="Recolour" className="flex flex-col gap-2">
      <button
        {...choiceProps(0)}
        className={`${CHOICE} min-h-prominent border border-(--office-line) px-3 text-left text-body text-(--office-ink) hover:bg-(--office-hover) ${look(0)}`}
      >
        {PICTURE_RECOLOURS[0]!.label}
      </button>
      <div className="grid grid-cols-8 gap-2">
        {PICTURE_RECOLOURS.slice(1).map(({ id, recolour: tone }, i) =>
          tone?.kind === 'duotone' ? (
            <button
              key={id}
              {...choiceProps(i + 1)}
              style={{ backgroundImage: `linear-gradient(135deg, ${tone.dark}, ${tone.light})` }}
              className={`${CHOICE} aspect-square w-full border border-(--office-line) ${look(i + 1)}`}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function AdjustmentSlider({
  name,
  value,
  onColour,
}: {
  name: PictureAdjustment;
  value: number;
  onColour: (change: PictureColoursChange) => void;
}) {
  const [draft, setDraft] = useState(value);
  // The value last written, so letting go twice writes once.
  const written = useRef(value);
  const [least, most] = PICTURE_ADJUSTMENT_RANGES[name];
  const label = ADJUSTMENT_NAMES[name];
  const letGo = () => {
    if (draft === written.current) return;
    written.current = draft;
    onColour({ adjustment: name, value: draft });
  };
  return (
    <label className="flex flex-col gap-1 text-body text-(--office-ink)">
      <span className="flex items-center justify-between">
        {label}
        <span aria-hidden className="text-(--office-muted) tabular-nums">
          {draft}%
        </span>
      </span>
      <input
        type="range"
        min={least}
        max={most}
        step={1}
        value={draft}
        aria-valuetext={`${draft}%`}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={letGo}
        onKeyUp={letGo}
        onBlur={letGo}
        className="w-full accent-(--office-primary)"
      />
    </label>
  );
}

export function ImageAdjustments({
  colours,
  onColour,
}: {
  colours: PictureColouring;
  onColour: (change: PictureColoursChange) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {PICTURE_ADJUSTMENTS.map((name) => {
        const value = Math.round(colours[name] ?? 0);
        // A value written elsewhere (an undo, someone else) starts the slider afresh.
        return (
          <AdjustmentSlider
            key={`${name}:${value}`}
            name={name}
            value={value}
            onColour={onColour}
          />
        );
      })}
    </div>
  );
}
