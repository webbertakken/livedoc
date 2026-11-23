'use client';

// The Image options side panel's body (docs/specs/034-text-documents/objects.md "Working with a picture"): its Size &
// rotation section, Width and Height in the person's unit, Scale width and height in percent of the picture's own size
// (dimmed while that is not known), Lock aspect ratio (on at first), and Reset. Each field applies on Enter or when
// left. Without a selected picture it says to select one.
import { useState } from 'react';
import type { IndentUnit } from '@/lib/text-document/indent-units';
import {
  PICTURE_SCALE_MOST,
  type PictureSize,
  type PictureSizeChange,
} from '@/lib/text-document/text-document-picture-size';
import {
  PANEL_CHECK,
  PANEL_CHECK_ROW,
  PANEL_CONTROL,
  PanelLengthField,
  PanelPercentField,
  PanelSection,
} from './TextDocumentPanelFields';

/** What the panel shows of the selected picture, in points. */
export type PictureSizing = PictureSize & { own: PictureSize | null };

export function TextDocumentImageOptionsPanel({
  picture,
  unit,
  onChange,
  onReset,
}: {
  // The selected picture's, or null.
  picture: PictureSizing | null;
  unit: IndentUnit;
  onChange: (change: PictureSizeChange, lock: boolean) => void;
  onReset: () => void;
}) {
  const [lock, setLock] = useState(true);
  if (!picture)
    return (
      <p className="px-2 pt-1 text-sm text-(--office-muted)">Select an image to see its options.</p>
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
        <div>
          <button
            type="button"
            disabled={!own}
            onClick={onReset}
            className={`${PANEL_CONTROL} cursor-pointer font-medium hover:bg-(--office-hover)`}
          >
            Reset
          </button>
        </div>
      </PanelSection>
    </div>
  );
}
