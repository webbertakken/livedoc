// A spreadsheet's sheet as a picture (docs/specs/029-sheets/plan-links.md "The Spreadsheet slot", D507): drawn from A1
// by the renderer a spreadsheet's previews use (@livedoc/plan-art spreadsheetSheetImage), so wherever a sheet is shown
// read-only (a Dashboard's Spreadsheet slot, its image export) it looks as it does to agents, and nothing in it can be
// edited. Images over cells show their alt text: another document's images are not served to this page. Pure.
import { renderElementsToSvg } from '@livedoc/document';
import { spreadsheetSheetImage } from '@livedoc/plan-art';
import type { Workbook } from '@livedoc/sheets';

// The room round the sheet's card, in px: the card's own edge and shadow, not the export's wide margin.
const PICTURE_PADDING = 12;

/** The sheet as a whole SVG document on no paper of its own (it sits on what shows it), or null when the workbook
 *  holds no such sheet. */
export function sheetPictureSvg(wb: Workbook, sheetId: string, name: string): string | null {
  const image = spreadsheetSheetImage(wb, sheetId, { id: sheetId, name });
  return image
    ? renderElementsToSvg(image.tab, {
        sheets: image.sheets,
        padding: PICTURE_PADDING,
        background: 'transparent',
      })
    : null;
}

/** The picture as an image address: a data URL, so no script or outside fetch rides in with it. */
export function sheetPictureSrc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
