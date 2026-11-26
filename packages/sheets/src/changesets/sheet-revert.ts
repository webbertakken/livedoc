// A sheet changeset's revert planned (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D266): its
// inverse, less what changed since it landed. A cell, chart, rule or banding that differs from the after-image is
// kept, as is a title renamed since; rows or columns it inserted are deleted only when no cell in them changed since;
// the rest of its layout goes back whole.
import type { LayoutChange } from '../store-layout';
import type { CellChange, SheetWrite } from '../store';
import { splitCellKey, type Sheet } from '../sheet';
import { cellImage, thingImage, thingKeyOf, type SheetChangesetAfter } from './after-image';

export type SheetRevertPlan = {
  writes: SheetWrite[];
  // What was kept: cell keys, thing keys (`object:<id>`, ...), `row:<id>`, `col:<id>` and `title`.
  kept: string[];
};

// The rows and columns holding a cell the changeset did not leave as it is now.
function dirtyAxes(
  current: Sheet,
  after: SheetChangesetAfter,
): { rows: Set<string>; cols: Set<string> } {
  const rows = new Set<string>();
  const cols = new Set<string>();
  for (const [key, cell] of current.cells) {
    if (after.cells[key] === cellImage(cell)) continue;
    const { r, c } = splitCellKey(key);
    rows.add(r);
    cols.add(c);
  }
  return { rows, cols };
}

export function planSheetRevert(
  current: Sheet,
  inverse: readonly SheetWrite[],
  after: SheetChangesetAfter,
): SheetRevertPlan {
  const kept = new Set<string>();
  const keptCells = new Set<string>();
  for (const [key, image] of Object.entries(after.cells))
    if (cellImage(current.cells.get(key)) !== image) keptCells.add(key);
  const keptThings = new Set<string>();
  for (const [key, image] of Object.entries(after.things))
    if (thingImage(current.layout, key) !== image) keptThings.add(key);
  let dirty: { rows: Set<string>; cols: Set<string> } | null = null;
  const axesDirty = () => (dirty ??= dirtyAxes(current, after));

  const cellsOf = (cells: readonly CellChange[]) =>
    cells.filter((ch) => {
      const key = `${ch.r}:${ch.c}`;
      if (!keptCells.has(key)) return true;
      kept.add(key);
      return false;
    });

  const changesOf = (changes: readonly LayoutChange[]) =>
    changes.flatMap((change): LayoutChange[] => {
      const thing = thingKeyOf(change);
      if (thing && keptThings.has(thing)) {
        kept.add(thing);
        return [];
      }
      if (change.k !== 'deleteRows' && change.k !== 'deleteCols') return [change];
      const rows = change.k === 'deleteRows';
      const held = rows ? axesDirty().rows : axesDirty().cols;
      const ids = change.ids.filter((id) => {
        if (!held.has(id)) return true;
        kept.add(`${rows ? 'row' : 'col'}:${id}`);
        return false;
      });
      return ids.length ? [{ ...change, ids }] : [];
    });

  const writes: SheetWrite[] = [];
  for (const write of inverse) {
    if (write.kind === 'title') {
      if (after.title !== undefined && current.title !== after.title) kept.add('title');
      else writes.push(write);
      continue;
    }
    const cells = cellsOf(write.cells ?? []);
    if (write.kind === 'cells') {
      if (cells.length) writes.push({ kind: 'cells', cells });
      continue;
    }
    const changes = changesOf(write.changes);
    if (changes.length || cells.length)
      writes.push({ kind: 'layout', changes, ...(cells.length ? { cells } : {}) });
  }
  return { writes, kept: [...kept] };
}
