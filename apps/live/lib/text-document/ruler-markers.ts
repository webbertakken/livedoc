// The ruler's markers (docs/specs/034-text-documents/editing-surface.md "The ruler"): the margins, the indents and the
// tab stops, each placed in points from the page's left edge. The margins sit at the page's edges; the indents and stops
// are measured from the caret's column (its `origin` and `end`), which is the text area with one column.
import type { TabAlign, TabStop } from '@livedoc/text-documents';
import type { MarginSide } from './text-document-page';
import type { RulerFrame } from './ruler-frame';
import type { IndentMarker, RulerReading } from './text-document-ruler';

export type Marker =
  | { kind: 'margin'; side: MarginSide }
  | { kind: 'indent'; marker: IndentMarker }
  | { kind: 'stop'; stop: TabStop };

export const ALIGN_NAME: Record<TabAlign, string> = {
  start: 'Left',
  center: 'Centre',
  end: 'Right',
  decimal: 'Decimal',
};

/** The marker as its tooltip names it. */
export function markerName(marker: Marker): string {
  if (marker.kind === 'margin') return marker.side === 'left' ? 'Left margin' : 'Right margin';
  if (marker.kind === 'stop') return 'Tab stop';
  return { left: 'Left indent', first: 'First line indent', right: 'Right indent' }[marker.marker];
}

/** The marker as a screen reader names its slider: a tab stop by its alignment. */
export const sliderName = (marker: Marker): string =>
  marker.kind === 'stop' ? `${ALIGN_NAME[marker.stop.align]} tab stop` : markerName(marker);

export function markerKey(marker: Marker): string {
  if (marker.kind === 'margin') return `margin-${marker.side}`;
  if (marker.kind === 'indent') return `indent-${marker.marker}`;
  return `stop-${marker.stop.position}`;
}

export const sameMarker = (a: Marker, b: Marker): boolean => markerKey(a) === markerKey(b);

export function markerClass(marker: Marker): string {
  if (marker.kind === 'margin') return `margin ${marker.side}`;
  if (marker.kind === 'indent') return `indent ${marker.marker}`;
  return `stop ${marker.stop.align}`;
}

/** Where the marker sits, in points from the page's left edge. */
export function placeOf(marker: Marker, frame: RulerFrame, reading: RulerReading): number {
  const { width, margins, origin, end } = frame;
  if (marker.kind === 'margin')
    return marker.side === 'left' ? margins.left : width - margins.right;
  if (marker.kind === 'stop') return origin + marker.stop.position;
  if (marker.marker === 'left') return origin + reading.indentStart;
  if (marker.marker === 'first') return origin + reading.indentStart + reading.indentFirst;
  return end - reading.indentEnd;
}

/** The value a marker at `at` reads: a margin from its page edge, the right indent from the column's end, else its start. */
export function valueOf(marker: Marker, at: number, frame: RulerFrame): number {
  if (marker.kind === 'margin') return marker.side === 'left' ? at : frame.width - at;
  if (marker.kind === 'indent' && marker.marker === 'right') return frame.end - at;
  return at - frame.origin;
}
