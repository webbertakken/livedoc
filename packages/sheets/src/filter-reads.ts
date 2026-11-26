// What a sheet's filter reads from its workbook beyond the cells' values (docs/specs/029-sheets/data-tools.md
// "Filters, filter views and slicers"): today, for a date condition's period; the cells' drawn colours, for Filter by
// Colour; and Custom Formula Is, worked out in each row as if the formula were copied there from the first row.
import type { FilterReads } from './filter';
import { colourOfSheet } from './filter-colours';
import { shiftForCopy } from './formula/stored';
import type { StoredFormula } from './sheet';
import type { Workbook } from './engine/workbook';

export function workbookFilterReads(wb: Workbook, sheetId: string): FilterReads {
  // One shifted formula a row offset, for the life of one filter test.
  const moved = new Map<string, StoredFormula>();
  return {
    locale: wb.locale,
    today: wb.today(),
    colourOf: colourOfSheet(wb, sheetId),
    formulaMet: (fx, anchor, r, c) => {
      const dr = r - anchor.r;
      const dc = c - anchor.c;
      const key = `${fx.t}|${dr}|${dc}`;
      let at = moved.get(key);
      if (!at) {
        at = dr === 0 && dc === 0 ? fx : shiftForCopy(fx, dr, dc, wb.ctxFor(sheetId));
        moved.set(key, at);
      }
      const v = wb.evaluateAt(sheetId, r, c, at);
      return v === true || (typeof v === 'number' && v !== 0);
    },
  };
}
