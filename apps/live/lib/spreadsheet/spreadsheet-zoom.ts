// The grid's zoom (docs/specs/029-sheets/surface.md "Grid", D133): the levels View › Zoom lists, as radio items, and
// their bindings to the person's zoom. The toolbar's field lists the same levels.
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { ZOOM_PERCENTS, zoomLabel } from '@/lib/office/office-zoom';

/** Every opening's zoom (D133). */
export const SPREADSHEET_ZOOM_DEFAULT = 100;

/** View › Zoom's items: each level's id and words. */
export const ZOOM_ITEMS: readonly { id: string; percent: number; label: string }[] =
  ZOOM_PERCENTS.map((percent) => ({ id: `zoom-${percent}`, percent, label: zoomLabel(percent) }));

/** View › Zoom bound to the zoom in force: the level ticked, a pick sets it. */
export function zoomBindings(zoom: OfficeZoom): OfficeActions {
  return Object.fromEntries(
    ZOOM_ITEMS.map((item) => [
      item.id,
      { run: () => zoom.onChange(item.percent), checked: item.percent === zoom.value },
    ]),
  );
}
