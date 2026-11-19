// Whether a view the probe set is the one it asked for (docs/specs/008-canvas/canvas-performance.md "Measuring":
// a probe that cannot set a gesture up says why). An element left in text editing takes every key the probe presses
// next (a zoom shortcut, a tool key), so the rows after it would measure a board that never changed view. Pure: the
// probe reads the page and decides here.
import type { Measurement } from './budget';

export type ViewReading = {
  // The zoom readout's text ("21%"), or null when there is none.
  zoomLabel: string | null;
  // The accessible name of the element being edited, or null when nothing is.
  editing: string | null;
};

// What is wrong with the view, or null when it is the one asked for.
export function viewProblem(view: ViewReading, zoom: Measurement['zoom']): string | null {
  if (view.editing !== null)
    return `the ${zoom} view has an element in text editing (${view.editing})`;
  if (view.zoomLabel === null) return `the ${zoom} view shows no zoom readout`;
  if (zoom === '100%' && view.zoomLabel !== '100%') return `the 100% view reads ${view.zoomLabel}`;
  return null;
}
