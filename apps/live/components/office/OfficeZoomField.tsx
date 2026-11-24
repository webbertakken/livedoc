'use client';

// The toolbar's zoom (docs/specs/034-text-documents/editing-surface.md "Zoom"): a field with a list, as Google's. A
// typed whole number from 50 to 200 applies; the list holds the zoom's presets (Fit and the levels by default).
import { OfficeListField } from './OfficeListField';
import {
  parseZoomText,
  zoomLabel,
  ZOOM_PRESETS,
  type OfficeZoomValue,
} from '@/lib/office/office-zoom';

export type OfficeZoom = {
  value: OfficeZoomValue;
  onChange: (zoom: OfficeZoomValue) => void;
  // The list's levels; a kind without pages (a spreadsheet) leaves out Fit.
  presets?: readonly OfficeZoomValue[];
};

export function OfficeZoomField({ zoom, tabIndex }: { zoom: OfficeZoom; tabIndex: number }) {
  const presets = zoom.presets ?? ZOOM_PRESETS;
  return (
    <OfficeListField<OfficeZoomValue>
      label="Zoom"
      listLabel="Zoom levels"
      controlId="zoom"
      shown={zoomLabel(zoom.value)}
      options={presets.map((value) => ({ label: zoomLabel(value), value }))}
      selected={presets.indexOf(zoom.value)}
      parse={parseZoomText}
      onTake={(next) => {
        if (next !== zoom.value) zoom.onChange(next);
      }}
      tabIndex={tabIndex}
      inputClass="h-row w-12 pl-2"
    />
  );
}
