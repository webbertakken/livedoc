// Smart Fill in the grid (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D148 to D151): after a typed
// text is saved, the offer is worked out and announced; Ctrl+Enter or the card's Accept writes it as typed, in one
// undo step; anything else lets it go.
import { smartFillOffer, smartFillWrite } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import type { SheetController } from './sheet-controller';

type Grid = Pick<
  SheetController,
  'workbook' | 'sheet' | 'canEdit' | 'setSmartFill' | 'smartFill' | 'write' | 'announce'
>;

const cellsWord = (n: number) => `${n} cell${n === 1 ? '' : 's'}`;

/** After a typed text is saved at `at`: offer what the column's pattern fills, or nothing (and log why). */
export function offerSmartFill(c: Grid, at: { r: number; c: number }): void {
  if (!c.canEdit) return c.setSmartFill(null);
  const found = smartFillOffer(c.workbook, c.sheet.id, at);
  if ('miss' in found) {
    debugLog('[sheet] smart fill none', { miss: found.miss });
    return c.setSmartFill(null);
  }
  debugLog('[sheet] smart fill offer', { cells: found.cells.length });
  c.setSmartFill(found);
  c.announce(`Smart Fill: Ctrl+Enter fills ${cellsWord(found.cells.length)}`);
}

/** Ctrl+Enter or Accept: the offer written into the cells still empty; false when there was none to accept. */
export function acceptSmartFill(c: Grid): boolean {
  const offer = c.smartFill;
  if (!offer) return false;
  c.setSmartFill(null);
  const write = smartFillWrite(c.workbook, c.sheet.id, offer);
  debugLog('[sheet] smart fill accept', { written: !!write });
  if (write && c.write(write, 'SmartFill'))
    c.announce(
      `Smart Fill filled ${cellsWord((write as Extract<typeof write, { kind: 'cells' }>).cells.length)}`,
    );
  return true;
}
