// A spreadsheet's sheets loading behind their first rows (docs/specs/029-sheets/sheet-store.md "In a spreadsheet",
// Loading by viewport): what of each sheet is loaded, the pages that load the rest, and which writes must wait.
//
// What a sheet holds loaded is always a prefix of its rows, named by its first row not loaded (`nextRow`): an id stays
// put while someone else inserts or deletes rows above it, where a position would not. A page is asked from that
// row's position at the rev the sheet is confirmed at, and lands only if the page and the sheet are both still at that
// rev: equal revs mean equal orders, so the page's positions are the sheet's own.
import type { SheetCellDto, SheetCellsResponse } from '@livedoc/api-schema';
import { RowSpan, layoutIndex, type Sheet, type SheetWrite } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';

// A page at another rev than the sheet's is asked again this many times, then the whole sheet is fetched. 1 to 6.
export const SHEET_PAGE_RETRIES = 3;

export type RowPagesHost = {
  fetchCells: (sheetId: string, rows: RowSpan) => Promise<SheetCellsResponse>;
  // The sheet as the server confirmed it (pending writes aside), or undefined once it has gone.
  confirmed: (sheetId: string) => Sheet | undefined;
  // The sheet as this person sees it.
  view: (sheetId: string) => Sheet | undefined;
  // A page's cells, set over the confirmed sheet's.
  land: (sheetId: string, cells: readonly SheetCellDto[]) => void;
  // The whole sheet, fetched and adopted (which marks it whole).
  refetch: (sheetId: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  retryMs: number;
};

export class RowPages {
  // Each partly loaded sheet's first row not loaded.
  private readonly next = new Map<string, string>();
  private generation = 0;

  private readonly host: RowPagesHost;

  constructor(host: RowPagesHost) {
    this.host = host;
  }

  /** What a sheet arrived with: `rowsLoaded` of its rows, the rest to page in. */
  arrived(sheetId: string, rows: readonly string[], rowsLoaded: number): void {
    const nextRow = rows[rowsLoaded];
    if (nextRow === undefined) this.next.delete(sheetId);
    else this.next.set(sheetId, nextRow);
  }

  /** A sheet gone from the store: nothing of it left to load. */
  forget(sheetId: string): void {
    this.next.delete(sheetId);
  }

  isPartial(sheetId: string): boolean {
    return this.next.has(sheetId);
  }

  /** Page in every partial sheet, in the order given (the open one first); a later call stops an earlier one's. */
  run(order: readonly string[]): Promise<void> {
    const generation = ++this.generation;
    return (async () => {
      for (const sheetId of order) {
        if (generation !== this.generation) return;
        await this.loadRest(sheetId, generation);
      }
    })();
  }

  private async loadRest(sheetId: string, generation: number): Promise<void> {
    let misses = 0;
    while (generation === this.generation) {
      const nextRow = this.next.get(sheetId);
      const sheet = this.host.confirmed(sheetId);
      if (nextRow === undefined || !sheet) {
        this.next.delete(sheetId);
        return;
      }
      const from = layoutIndex(sheet.layout).rowPos.get(nextRow);
      if (from === undefined || misses >= SHEET_PAGE_RETRIES) {
        // Its first row not loaded was deleted, or the sheet keeps moving under the pages: take it whole.
        debugLog('[sheets] sheets.page.whole', { deleted: from === undefined });
        // Adopted whole, it is no longer partial; a fetch that failed leaves it partial until the next load.
        await this.host.refetch(sheetId);
        if (this.next.has(sheetId)) debugLog('[sheets] sheets.page.stuck', {});
        return;
      }
      const page = await this.ask(sheetId, RowSpan.page(from, sheet.layout.rows.length));
      if (generation !== this.generation) return;
      // Its positions are the order at the rev it was asked at: it lands only if the sheet is still there.
      const now = this.host.confirmed(sheetId);
      if (!page || !now || page.rev !== sheet.rev || now.rev !== sheet.rev) {
        misses++;
        await this.host.wait(this.host.retryMs);
        continue;
      }
      misses = 0;
      this.host.land(sheetId, page.cells);
      const after = now.layout.rows[page.to];
      if (after === undefined) this.next.delete(sheetId);
      else this.next.set(sheetId, after);
    }
  }

  private async ask(sheetId: string, rows: RowSpan): Promise<SheetCellsResponse | null> {
    try {
      return await this.host.fetchCells(sheetId, rows);
    } catch {
      debugLog('[sheets] sheets.page.failed', { from: rows.from });
      return null;
    }
  }

  /** Whether a write must wait for the sheets to load: it would read or undo cells not loaded yet. */
  holds(sheetId: string, write: SheetWrite): boolean {
    if (this.next.size === 0) return false;
    // A deletion shrinks the ranges every other sheet's formulas hold into it.
    if (
      write.kind === 'layout' &&
      write.changes.some((c) => c.k === 'deleteRows' || c.k === 'deleteCols')
    )
      return true;
    const nextRow = this.next.get(sheetId);
    if (nextRow === undefined || write.kind === 'title') return false;
    if (write.kind === 'layout') return true;
    const view = this.host.view(sheetId);
    if (!view) return false;
    const rowPos = layoutIndex(view.layout).rowPos;
    const loadedTo = rowPos.get(nextRow);
    if (loadedTo === undefined) return true;
    return write.cells.some((c) => {
      const at = rowPos.get(c.r);
      return at === undefined || at >= loadedTo;
    });
  }
}
