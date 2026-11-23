'use client';

// Ctrl+Alt+= and Ctrl+Alt+- over cells (docs/specs/029-sheets/grid-and-editing.md "Rows, columns and cells", D157):
// a menu at the active cell with the four ways to insert, or to delete, as Google's.
import { ContextMenu } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { lineCount, lineSpan } from '@/lib/spreadsheet/line-span';
import { useSheetController } from './sheet-controller';
import { DeleteIcon, InsertColumnLeftIcon, InsertRowAboveIcon } from './sheet-icons';
import { Glyph } from './SheetCellMenu';
import type { SheetActions } from './useSheetActions';

export function SheetLinesMenu({
  op,
  at,
  actions,
  onClose,
}: {
  op: 'insert' | 'delete';
  at: { x: number; y: number };
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const g = c.selection.ranges[c.selection.ranges.length - 1]!;
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const rows = g.r2 - g.r1 + 1;
  const cols = g.c2 - g.c1 + 1;
  return (
    <ContextMenu
      position={at}
      label={op === 'insert' ? 'Insert menu' : 'Delete menu'}
      onClose={onClose}
    >
      {op === 'insert' ? (
        <>
          <MenuActionRow
            label="Insert cells and shift right"
            icon={<Glyph t="→" />}
            onClick={run(() => actions.shift('insertRight'))}
          />
          <MenuActionRow
            label="Insert cells and shift down"
            icon={<Glyph t="↓" />}
            onClick={run(() => actions.shift('insertDown'))}
          />
          <MenuActionRow
            label={`Insert ${lineCount('r', rows)} above`}
            icon={<InsertRowAboveIcon />}
            onClick={run(() => actions.insert('r', 'before'))}
          />
          <MenuActionRow
            label={`Insert ${lineCount('c', cols)} left`}
            icon={<InsertColumnLeftIcon />}
            onClick={run(() => actions.insert('c', 'before'))}
          />
        </>
      ) : (
        <>
          <MenuActionRow
            label={`Delete ${lineSpan('r', g.r1, g.r2)}`}
            icon={<DeleteIcon />}
            onClick={run(() => actions.remove('r'))}
          />
          <MenuActionRow
            label={`Delete ${lineSpan('c', g.c1, g.c2)}`}
            icon={<DeleteIcon />}
            onClick={run(() => actions.remove('c'))}
          />
          <MenuActionRow
            label="Delete cells and shift up"
            icon={<Glyph t="↑" />}
            onClick={run(() => actions.shift('deleteUp'))}
          />
          <MenuActionRow
            label="Delete cells and shift left"
            icon={<Glyph t="←" />}
            onClick={run(() => actions.shift('deleteLeft'))}
          />
        </>
      )}
    </ContextMenu>
  );
}
