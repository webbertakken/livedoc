// What View > Page display, Zoom and Go to run, and the Viewing toolbar's Page display list
// (docs/specs/035-pdf-documents/reading-surface.md "View", "The toolbar", "The pages", "The page bar"): one person's
// view, so every one is a Viewer's.
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN } from '@livedoc/pdf-documents';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  GO_TO_FIRST_PAGE,
  GO_TO_LAST_PAGE,
  GO_TO_NEXT_PAGE,
  GO_TO_PREVIOUS_PAGE,
  PAGE_DISPLAY_CONTINUOUS,
  PAGE_DISPLAY_COVER,
  PAGE_DISPLAY_MENU,
  PAGE_DISPLAY_SINGLE,
  PAGE_DISPLAY_TWO,
  PAGE_DISPLAY_TWO_CONTINUOUS,
  PDF_ZOOM_MENU_PERCENTS,
  ROTATE_VIEW_CLOCKWISE,
  ROTATE_VIEW_COUNTERCLOCKWISE,
  ZOOM_ACTUAL_SIZE,
  ZOOM_FIT_PAGE,
  ZOOM_FIT_WIDTH,
  ZOOM_IN,
  ZOOM_OUT,
  zoomPercentId,
} from './pdf-menus';
import { PAGE_DISPLAY_CONTROL } from './pdf-toolbar';
import { PdfView, type PdfPageDisplayName } from './pdf-view';
import type { PdfViewer } from './usePdfView';

const DISPLAYS: readonly (readonly [string, PdfPageDisplayName, string])[] = [
  [PAGE_DISPLAY_SINGLE, 'single', 'Single page'],
  [PAGE_DISPLAY_CONTINUOUS, 'continuous', 'Continuous'],
  [PAGE_DISPLAY_TWO, 'two', 'Two pages'],
  [PAGE_DISPLAY_TWO_CONTINUOUS, 'two-continuous', 'Two pages, continuous'],
];

// A scale this near a percentage is it: a zoom typed or stepped to is a quotient.
const SAME_SCALE = 1e-6;

type Viewer = Pick<
  PdfViewer,
  | 'view'
  | 'scale'
  | 'page'
  | 'count'
  | 'atFirst'
  | 'atLast'
  | 'zoomTo'
  | 'goToPage'
  | 'turn'
  | 'setDisplay'
  | 'setCover'
  | 'rotate'
>;

/** Every one but Go to > Page…, which is the page bar's field (the surface binds it). */
export function pdfViewActions(viewer: Viewer): { actions: OfficeActions; choices: OfficeChoices } {
  const { view, scale } = viewer;
  const shownAs = PdfView.displayName(view.display);
  const actions: OfficeActions = {
    ...Object.fromEntries(
      DISPLAYS.map(([id, name]) => [
        id,
        { run: () => viewer.setDisplay(name), checked: shownAs === name },
      ]),
    ),
    [PAGE_DISPLAY_COVER]: {
      run: () => viewer.setCover(!view.display.cover),
      checked: view.display.cover,
    },
    [ZOOM_IN]: {
      run: () => viewer.zoomTo(PdfView.stepIn(scale), 'In'),
      disabled: scale >= PDF_ZOOM_MAX,
    },
    [ZOOM_OUT]: {
      run: () => viewer.zoomTo(PdfView.stepOut(scale), 'Out'),
      disabled: scale <= PDF_ZOOM_MIN,
    },
    [ZOOM_FIT_WIDTH]: {
      run: () => viewer.zoomTo('fit-width', 'FitWidth'),
      checked: view.zoom === 'fit-width',
    },
    [ZOOM_FIT_PAGE]: {
      run: () => viewer.zoomTo('fit-page', 'FitPage'),
      checked: view.zoom === 'fit-page',
    },
    [ZOOM_ACTUAL_SIZE]: { run: () => viewer.zoomTo(1, 'Actual'), checked: view.zoom === 1 },
    ...Object.fromEntries(
      PDF_ZOOM_MENU_PERCENTS.map((percent) => [
        zoomPercentId(percent),
        {
          run: () => viewer.zoomTo(percent / 100, 'Custom'),
          checked:
            percent !== 100 &&
            typeof view.zoom === 'number' &&
            Math.abs(view.zoom - percent / 100) < SAME_SCALE,
        },
      ]),
    ),
    [ROTATE_VIEW_CLOCKWISE]: { run: () => viewer.rotate(1) },
    [ROTATE_VIEW_COUNTERCLOCKWISE]: { run: () => viewer.rotate(-1) },
    [GO_TO_FIRST_PAGE]: { run: () => viewer.goToPage(0), disabled: viewer.atFirst },
    [GO_TO_LAST_PAGE]: { run: () => viewer.goToPage(viewer.count - 1), disabled: viewer.atLast },
    [GO_TO_PREVIOUS_PAGE]: { run: () => viewer.turn(-1), disabled: viewer.atFirst },
    [GO_TO_NEXT_PAGE]: { run: () => viewer.turn(1), disabled: viewer.atLast },
  };
  const entries = PAGE_DISPLAY_MENU.kind === 'submenu' ? PAGE_DISPLAY_MENU.entries : [];
  return {
    actions,
    choices: {
      [PAGE_DISPLAY_CONTROL]: {
        read: () => DISPLAYS.find(([, name]) => name === shownAs)?.[2] ?? null,
        entries,
        actions,
      },
    },
  };
}
