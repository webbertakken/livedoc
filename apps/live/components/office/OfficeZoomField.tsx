'use client';

// The toolbar's zoom (docs/specs/034-text-documents/editing-surface.md "Zoom"): a field with a list, as Google's. A
// typed whole number from 50 to 200 applies; the list holds Fit and the presets.
import { OfficeListField } from './OfficeListField';
import {
  parseZoomText,
  zoomLabel,
  ZOOM_PRESETS,
  type OfficeZoomValue,
} from '@/lib/office/office-zoom';

export type OfficeZoom = { value: OfficeZoomValue; onChange: (zoom: OfficeZoomValue) => void };

const OPTIONS = ZOOM_PRESETS.map((value) => ({ label: zoomLabel(value), value }));

export function OfficeZoomField({ zoom, tabIndex }: { zoom: OfficeZoom; tabIndex: number }) {
  return (
    <OfficeListField<OfficeZoomValue>
      label="Zoom"
      listLabel="Zoom levels"
      controlId="zoom"
      shown={zoomLabel(zoom.value)}
      options={OPTIONS}
      selected={ZOOM_PRESETS.indexOf(zoom.value)}
      parse={parseZoomText}
      onTake={(next) => {
        if (next !== zoom.value) zoom.onChange(next);
      }}
      tabIndex={tabIndex}
      inputClass="w-12 pl-2"
    />
  );
}
