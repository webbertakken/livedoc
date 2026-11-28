// A spreadsheet's sheet tab drawn (docs/specs/029-sheets/sheet-store.md "Agents in a spreadsheet", Previews): its sheet
// laid out as a Plan Sheet tab is for an image (@livedoc/plan-art spreadsheetSheetImage), from A1 or a range's
// top-left, its images and charts over its cells, by the shared renderer. `GET .../tabs/:tabId/render.svg` answers it, so the
// CLI's `tab render` and the MCP's previews draw a spreadsheet as they draw everything else.
import { renderElementsToSvg } from '@livedoc/document';
import { resolveIconExportArt, resolveStickerArt } from '@livedoc/icons/resolve';
import { spreadsheetSheetImage } from '@livedoc/plan-art';
import { AGENT_LOCALE, SheetLimits, Workbook, type GridRange } from '@livedoc/sheets';
import { readWorkbook } from './db/workbook';
import { loadEmbeddedImages } from './thumbnail';
import { loadSpreadsheetSheets } from './routes/workbook-sheets-load';
import type { DocumentRouteContext } from './routes/context';
import { fillSpreadsheetCards } from './routes/spreadsheet-cards';

// The SVG, or null when the tab is no spreadsheet's sheet tab (drawn as any tab is). `scope` is the one tab a
// tab-scoped link reaches: the sheets it may not see are left out of the workbook, as the cells view leaves them.
export async function renderSpreadsheetTabSvg(
  ctx: DocumentRouteContext,
  documentId: string,
  tabId: string,
  opts: { range?: GridRange; scope: string | null },
): Promise<string | null> {
  const { env } = ctx;
  const workbook = await readWorkbook(env, documentId);
  if (!workbook) return null;
  const sheets = (await loadSpreadsheetSheets(env, documentId)).filter(
    (s) => opts.scope === null || s.tabId === opts.scope,
  );
  const sheet = sheets.find((s) => s.tabId === tabId);
  if (!sheet) return null;
  const wb = new Workbook({
    sheets,
    locale: AGENT_LOCALE,
    limits: SheetLimits.of(true),
    iteration: workbook.settings.iterate,
    timeZone: workbook.settings.timeZone,
  });
  // Card functions read the cards' document with the asker's own access (plan-links.md "The `CARD` functions").
  await fillSpreadsheetCards(wb, ctx, workbook);
  const image = spreadsheetSheetImage(
    wb,
    sheet.id,
    { id: tabId, name: sheet.title },
    opts.range ? { range: opts.range } : {},
  )!;
  // Its images over cells inlined as any tab's are, for the images the document may serve (D627).
  const images = await loadEmbeddedImages(env, documentId, image.tab);
  return renderElementsToSvg(image.tab, {
    sheets: image.sheets,
    resolveImageHref: (id) => images.get(id),
    resolveIconArt: resolveIconExportArt,
    resolveStickerArt,
  });
}
