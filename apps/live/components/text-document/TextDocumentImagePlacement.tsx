'use client';

// Image options' Text wrapping and Position (docs/specs/034-text-documents/objects.md "In the editor"), look and order
// (default) until a capture: the five wraps as one radio group, Margin from text under Wrap and Break (blank where a
// file's sides differ); Move with text or Fix position on page (dimmed pageless) and X and Y, all dimmed in line.
import { useId } from 'react';
import { PICTURE_MARGIN_MAX, PICTURE_OFFSET_MAX, type PictureMoves } from '@livedoc/text-documents';
import type { IndentUnit } from '@/lib/text-document/indent-units';
import {
  PICTURE_WRAP_CHOICES,
  evenMargin,
  wrapChoiceOf,
  type PictureWrapChoice,
} from '@/lib/text-document/text-document-picture-placing';
import { PANEL_CHECK, PANEL_CHECK_ROW, PanelLengthField } from './TextDocumentPanelFields';
import type { PicturePlacing } from './useTextDocumentPicturePlacing';

const MARGIN_RANGE = { least: 0, most: PICTURE_MARGIN_MAX };
const OFFSET_RANGE = { least: -PICTURE_OFFSET_MAX, most: PICTURE_OFFSET_MAX };
// Every control inside dimmed and out of reach.
const DIMMED_FIELDS = 'm-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-50';

const MOVES: readonly { id: PictureMoves; label: string }[] = [
  { id: 'with-text', label: 'Move with text' },
  { id: 'page', label: 'Fix position on page' },
];

export function ImageTextWrapping({
  placing,
  unit,
  onWrap,
  onMargin,
}: {
  placing: PicturePlacing;
  unit: IndentUnit;
  onWrap: (choice: PictureWrapChoice) => void;
  onMargin: (pt: number) => void;
}) {
  const name = useId();
  const { placement } = placing;
  const chosen = wrapChoiceOf(placement);
  const margin = placement ? evenMargin(placement) : null;
  return (
    <>
      <div role="radiogroup" aria-label="Text wrapping" className="flex flex-col">
        {PICTURE_WRAP_CHOICES.map((choice) => (
          <label key={choice.id} className={PANEL_CHECK_ROW}>
            <input
              type="radio"
              name={name}
              className={PANEL_CHECK}
              checked={chosen === choice.id}
              onChange={() => onWrap(choice.id)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {placement && (chosen === 'wrap' || chosen === 'break') ? (
        <PanelLengthField
          key={`margin:${margin ?? 'mixed'}`}
          label="Margin from text"
          pt={margin}
          unit={unit}
          range={MARGIN_RANGE}
          onCommit={onMargin}
        />
      ) : null}
    </>
  );
}

export function ImagePosition({
  placing,
  unit,
  onMoves,
  onOffset,
}: {
  placing: PicturePlacing;
  unit: IndentUnit;
  onMoves: (moves: PictureMoves) => void;
  onOffset: (axis: 'x' | 'y', pt: number) => void;
}) {
  const name = useId();
  const { placement, paged } = placing;
  const field = (axis: 'x' | 'y', label: string) => (
    <div className="min-w-0 flex-1">
      <PanelLengthField
        key={`${axis}:${placement?.[axis] ?? 'none'}`}
        label={label}
        pt={placement ? placement[axis] : null}
        unit={unit}
        range={OFFSET_RANGE}
        onCommit={(pt) => onOffset(axis, pt)}
      />
    </div>
  );
  return (
    <fieldset disabled={!placement} className={DIMMED_FIELDS}>
      <div role="radiogroup" aria-label="Position" className="flex flex-col">
        {MOVES.map((moves) => (
          <label key={moves.id} className={PANEL_CHECK_ROW}>
            <input
              type="radio"
              name={name}
              className={PANEL_CHECK}
              checked={placement?.moves === moves.id}
              disabled={moves.id === 'page' && !paged}
              onChange={() => onMoves(moves.id)}
            />
            {moves.label}
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        {field('x', 'X')}
        {field('y', 'Y')}
      </div>
    </fieldset>
  );
}
