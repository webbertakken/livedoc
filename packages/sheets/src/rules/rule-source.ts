// A Dropdown from a Range's range (docs/specs/029-sheets/data-validation.md "Rules"): on the rule's own sheet, or on
// another of the workbook's, by id (`s`), or by title (`st`) once copied to a spreadsheet that may not hold it, as a
// formula's reference is. Read and written as `A2:A20` or `Sheet2!A2:A20`.
import { formatRange, parseRangeText } from '../address';
import { idRangeOf, posRangeOf } from '../layout';
import { quoteSheet, type SheetsCtx } from '../formula/stored';
import type { RuleSource, SheetLayout } from '../sheet';

// The sheet a source reads: its title (null for the rule's own) and layout; null when that sheet is not there.
export type SourceSheet = { id: string; title: string | null; layout: SheetLayout };

export function sourceSheetOf(ctx: SheetsCtx, src: RuleSource): SourceSheet | null {
  if (src.s === undefined && src.st === undefined)
    return { id: ctx.own.id, title: null, layout: ctx.own.layout };
  const at = src.s !== undefined ? ctx.byId(src.s) : ctx.byTitle(src.st!);
  if (!at) return null;
  return at.id === ctx.own.id
    ? { id: at.id, title: null, layout: at.layout }
    : { id: at.id, title: at.title, layout: at.layout };
}

// `A2:A20`, or `Sheet2!A2:A20` on another sheet; '' when the source's sheet or cells are gone.
export function sourceText(sheet: SourceSheet | null, src: RuleSource): string {
  const p = sheet ? posRangeOf(sheet.layout, src) : null;
  if (!sheet || !p) return '';
  return `${sheet.title === null ? '' : `${quoteSheet(sheet.title)}!`}${formatRange(p)}`;
}

// `Sheet2!A2:A20` split at its sheet: the title (quotes undone) and the range text; no `!` is the own sheet.
export function splitSheetText(text: string): { title: string | null; range: string } {
  const t = text.trim();
  const at = t.lastIndexOf('!');
  if (at < 0) return { title: null, range: t };
  let title = t.slice(0, at).trim();
  if (title.length >= 2 && title.startsWith("'") && title.endsWith("'"))
    title = title.slice(1, -1).replace(/''/g, "'");
  return { title, range: t.slice(at + 1).trim() };
}

// A typed source as stored, or null when its sheet is not there or its range is not on it.
export function sourceFromText(ctx: SheetsCtx, text: string): RuleSource | null {
  const { title, range } = splitSheetText(text);
  const sheet = title === null ? ctx.own : ctx.byTitle(title);
  const g = sheet ? parseRangeText(range) : null;
  if (!sheet || !g || g.r2 >= sheet.layout.rows.length || g.c2 >= sheet.layout.cols.length)
    return null;
  const ids = idRangeOf(sheet.layout, g.r1, g.c1, g.r2, g.c2);
  if (!ids) return null;
  return sheet.id === ctx.own.id ? ids : { ...ids, s: sheet.id };
}
