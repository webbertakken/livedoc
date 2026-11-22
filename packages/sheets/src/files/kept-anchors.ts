// Kept content between a file and the model (docs/specs/029-sheets/standard-mapping.md "Unknown content", "Anchors by
// id"): positions become the ids of the sheet, row and column they name when a file is opened, and ids positions again
// when one is written; an anchor whose sheet, row or column is gone drops its item, counted, never silently.
import { layoutIndex } from '../layout';
import type { SheetLayout } from '../sheet';
import type { FileAt, KeptContent, KeptItem, KeptRelationship, StoredAt } from './kept-content';

/** A sheet as kept content is anchored to it: its id and its layout's rows' and columns' ids in order. */
export type KeptSheet = { id: string; layout: SheetLayout };

export type KeptMapped<At> = { kept: KeptContent<At>; dropped: number };

// An item mapped to another anchor, or null when what it is anchored to is not there.
function mapped<A, B>(kept: KeptContent<A>, map: (at: A) => B | null): KeptMapped<B> {
  let dropped = 0;
  const each = <T extends { at: A }>(list: readonly T[]): (Omit<T, 'at'> & { at: B })[] =>
    list.flatMap((entry) => {
      const at = map(entry.at);
      if (at === null) dropped++;
      return at === null ? [] : [{ ...entry, at }];
    });
  const items: KeptItem<B>[] = each(kept.items);
  const relationships: KeptRelationship<B>[] = each(kept.relationships);
  return { kept: { standard: kept.standard, items, parts: kept.parts, relationships }, dropped };
}

/** A file's kept content anchored by id to the sheets it made (in the file's order; fewer when some were cut). */
export function storedKept(
  kept: KeptContent<FileAt>,
  sheets: readonly KeptSheet[],
): KeptMapped<StoredAt> {
  return mapped(kept, (at): StoredAt | null => {
    if (at.sheet === undefined) return {};
    const sheet = sheets[at.sheet];
    if (!sheet) return null;
    if (at.r === undefined || at.c === undefined) return { sheet: sheet.id };
    const r = sheet.layout.rows[at.r];
    const c = sheet.layout.cols[at.c];
    return r === undefined || c === undefined ? null : { sheet: sheet.id, r, c };
  });
}

/** The model's kept content anchored by position in the sheets written (in tab order), its gone anchors dropped. */
export function fileKept(
  kept: KeptContent<StoredAt>,
  sheets: readonly KeptSheet[],
): KeptMapped<FileAt> {
  const indexes = new Map(
    sheets.map((sheet, i) => [sheet.id, { i, index: layoutIndex(sheet.layout) }]),
  );
  return mapped(kept, (at): FileAt | null => {
    if (at.sheet === undefined) return {};
    const sheet = indexes.get(at.sheet);
    if (!sheet) return null;
    if (at.r === undefined || at.c === undefined) return { sheet: sheet.i };
    const r = sheet.index.rowPos.get(at.r);
    const c = sheet.index.colPos.get(at.c);
    return r === undefined || c === undefined ? null : { sheet: sheet.i, r, c };
  });
}
