// A cell's link in words, as agents and the link card read it (docs/specs/029-sheets/inserted-objects.md "Links, agents").
// Apart from cell-link.ts, which formats import, so a format never pulls in the formula grammar quoteSheet comes from.
import { formatRange } from './address';
import { sheetLinkOf } from './cell-link';
import { quoteSheet } from './formula/stored';

/**
 * A link in words, as agents read it: a sheet of this workbook by its title, and its range after it as a formula
 * names one (`'Ada''s sheet'!B2:C4`); any other link, and one to a sheet that is gone, as held.
 */
export function cellLinkText(
  link: string,
  titleOf: (sheetId: string) => string | undefined,
): string {
  const inBook = sheetLinkOf(link);
  const title = inBook ? titleOf(inBook.sheetId) : undefined;
  if (!inBook || title === undefined) return link;
  return inBook.range ? `${quoteSheet(title)}!${formatRange(inBook.range)}` : title;
}
