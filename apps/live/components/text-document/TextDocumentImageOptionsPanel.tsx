'use client';

// The Image options side panel's body (docs/specs/034-text-documents/objects.md "Working with a picture"): its Size &
// rotation section, Width and Height in the person's unit, Scale width and height in percent of the picture's own size
// (dimmed while that is not known), Lock aspect ratio (on at first), Rotate (Angle and a quarter turn either way);
// Recolour and Adjustments (TextDocumentImageColours), dimmed for a drawing; then Reset. Each field applies on Enter or when left. Without a
// selected picture it says to select one.
import { useId, useState } from 'react';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import { lucideRotateCcwSquare, lucideRotateCwSquare } from '@livedoc/icons/lucide';
import type { PictureColouring } from '@livedoc/text-documents';
import type { IndentUnit } from '@/lib/text-document/indent-units';
import type { PictureColoursChange } from '@/lib/text-document/text-document-picture-edit';
import { ImageAdjustments, ImageRecolour } from './TextDocumentImageColours';
import { ImagePosition, ImageTextWrapping } from './TextDocumentImagePlacement';
import type { PicturePlacingControls } from './useTextDocumentPicturePlacing';
import {
  PICTURE_SCALE_MOST,
  type PictureSize,
  type PictureSizeChange,
} from '@/lib/text-document/text-document-picture-size';
import {
  PANEL_CHECK,
  PANEL_CHECK_ROW,
  PANEL_CONTROL,
  PANEL_LABEL,
  PanelAngleField,
  PanelLengthField,
  PanelPercentField,
  PanelSection,
} from './TextDocumentPanelFields';

/** What the panel shows of the selected picture: its size and own size in points, its turn in degrees clockwise. */
export type PictureSizing = PictureSize & {
  own: PictureSize | null;
  rotation: number;
  // Its recolour and adjustments (Recolour, Adjustments).
  colours: PictureColouring;
  // A drawing's picture: Recolour and Adjustments are dimmed (objects.md "Drawn").
  drawing: boolean;
};

// A drawing's Recolour and Adjustments: every control inside dimmed and out of reach.
const DIMMED_FIELDS = 'm-0 min-w-0 border-0 p-0 disabled:opacity-50';

/** A turn asked for: an angle typed, or a quarter turn either way (degrees clockwise). */
export type PictureTurn = { angle: number } | { by: number };

const QUARTER_TURN = 90;
const TurnLeftGlyph = lucideGlyph(lucideRotateCcwSquare, 18);
const TurnRightGlyph = lucideGlyph(lucideRotateCwSquare, 18);
// A square control of a field's height, its glyph at full size.
const ICON_BUTTON =
  'inline-flex size-field shrink-0 cursor-pointer items-center justify-center rounded-control border border-(--office-line) text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function TextDocumentImageOptionsPanel({
  picture,
  unit,
  onChange,
  onTurn,
  onReset,
  onColour,
  placing,
}: {
  // The selected picture's, or null.
  picture: PictureSizing | null;
  unit: IndentUnit;
  onChange: (change: PictureSizeChange, lock: boolean) => void;
  onTurn: (turn: PictureTurn) => void;
  onReset: () => void;
  onColour: (change: PictureColoursChange) => void;
  // Text wrapping and Position: the selected picture's placement and its writes.
  placing: PicturePlacingControls;
}) {
  const [lock, setLock] = useState(true);
  const rotateLabel = useId();
  if (!picture)
    return (
      <p className="px-2 pt-1 text-body text-(--office-muted)">
        Select an image to see its options.
      </p>
    );
  const { own } = picture;
  const scale = (side: 'width' | 'height') => (own ? (picture[side] / own[side]) * 100 : null);
  const percent = (label: string, field: 'scaleWidth' | 'scaleHeight', value: number | null) => (
    <div className="min-w-0 flex-1">
      <PanelPercentField
        key={`${field}:${value ?? 'unknown'}`}
        label={label}
        percent={value}
        least={1}
        most={PICTURE_SCALE_MOST}
        disabled={!own}
        onCommit={(v) => onChange({ field, value: v }, lock)}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-1 px-1 pt-1">
      <PanelSection title="Size & rotation">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <PanelLengthField
              key={`width:${picture.width}`}
              label="Width"
              pt={picture.width}
              unit={unit}
              start
              onCommit={(value) => onChange({ field: 'width', value }, lock)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <PanelLengthField
              key={`height:${picture.height}`}
              label="Height"
              pt={picture.height}
              unit={unit}
              onCommit={(value) => onChange({ field: 'height', value }, lock)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          {percent('Scale width', 'scaleWidth', scale('width'))}
          {percent('Scale height', 'scaleHeight', scale('height'))}
        </div>
        <label className={PANEL_CHECK_ROW}>
          <input
            type="checkbox"
            className={PANEL_CHECK}
            checked={lock}
            onChange={(e) => setLock(e.target.checked)}
          />
          Lock aspect ratio
        </label>
        <div role="group" aria-labelledby={rotateLabel} className="flex flex-col">
          <span id={rotateLabel} className={PANEL_LABEL}>
            Rotate
          </span>
          <div className="flex items-end gap-2">
            <PanelAngleField
              key={`angle:${picture.rotation}`}
              label="Angle"
              degrees={picture.rotation}
              onCommit={(angle) => onTurn({ angle })}
            />
            <Tooltip label="Rotate counter-clockwise 90°">
              <button
                type="button"
                aria-label="Rotate counter-clockwise 90°"
                onClick={() => onTurn({ by: -QUARTER_TURN })}
                className={ICON_BUTTON}
              >
                <TurnLeftGlyph />
              </button>
            </Tooltip>
            <Tooltip label="Rotate clockwise 90°">
              <button
                type="button"
                aria-label="Rotate clockwise 90°"
                onClick={() => onTurn({ by: QUARTER_TURN })}
                className={ICON_BUTTON}
              >
                <TurnRightGlyph />
              </button>
            </Tooltip>
          </div>
        </div>
      </PanelSection>
      {placing.placing ? (
        <>
          <PanelSection title="Text wrapping">
            <ImageTextWrapping
              placing={placing.placing}
              unit={unit}
              onWrap={placing.wrap}
              onMargin={placing.margin}
            />
          </PanelSection>
          <PanelSection title="Position">
            <ImagePosition
              placing={placing.placing}
              unit={unit}
              onMoves={placing.moves}
              onOffset={placing.offset}
            />
          </PanelSection>
        </>
      ) : null}
      <PanelSection title="Recolour">
        <fieldset disabled={picture.drawing} className={DIMMED_FIELDS}>
          <ImageRecolour recolour={picture.colours.recolour} onColour={onColour} />
        </fieldset>
      </PanelSection>
      <PanelSection title="Adjustments">
        <fieldset disabled={picture.drawing} className={DIMMED_FIELDS}>
          <ImageAdjustments colours={picture.colours} onColour={onColour} />
        </fieldset>
      </PanelSection>
      <div className="px-2 pt-2">
        <button
          type="button"
          disabled={!own}
          onClick={onReset}
          className={`${PANEL_CONTROL} cursor-pointer hover:bg-(--office-hover)`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
