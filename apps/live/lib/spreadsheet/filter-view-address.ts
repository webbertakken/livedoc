// A filter view's link (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D474): the address's
// `?fview=<sheet id>.<view id>` names a saved view, beside the editor's `#t=` naming the sheet's tab.

/** The query parameter naming an open filter view. */
export const FILTER_VIEW_PARAM = 'fview';

/** The address with its query naming this open view, or with none (`viewId` null), the rest as it was. */
export function filterViewAddress(href: string, sheetId: string, viewId: string | null): string {
  const url = new URL(href);
  if (viewId) url.searchParams.set(FILTER_VIEW_PARAM, `${sheetId}.${viewId}`);
  else url.searchParams.delete(FILTER_VIEW_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The view an address's query names, or null when it names none or not in this shape. */
export function filterViewOfSearch(search: string): { sheetId: string; viewId: string } | null {
  const named = new URLSearchParams(search).get(FILTER_VIEW_PARAM);
  const dot = named ? named.indexOf('.') : -1;
  if (!named || dot <= 0 || dot === named.length - 1) return null;
  return { sheetId: named.slice(0, dot), viewId: named.slice(dot + 1) };
}
