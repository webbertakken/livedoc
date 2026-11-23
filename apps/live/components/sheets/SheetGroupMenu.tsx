'use client';

// Alt+Shift+→ and ← over cells (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline", D160): a menu at
// the active cell offering the selection's rows and its columns, as Google's; Ungroup dimmed where none is grouped.
import { groupedWithin } from '@livedoc/sheets';
import { ContextMenu } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { lineSpan } from '@/lib/spreadsheet/line-span';
import { useSheetController } from './sheet-controller';
import { GroupIcon, UngroupIcon } from './sheet-icons';
import type { SheetActions } from './useSheetActions';

export function SheetGroupMenu({
  op,
  at,
  actions,
  onClose,
}: {
  op: 'group' | 'ungroup';
  at: { x: number; y: number };
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const g = c.selection.ranges[c.selection.ranges.length - 1]!;
  const verb = op === 'group' ? 'Group' : 'Ungroup';
  const row = (axis: 'r' | 'c', a: number, b: number) => (
    <MenuActionRow
      label={`${verb} ${lineSpan(axis, a, b)}`}
      icon={op === 'group' ? <GroupIcon /> : <UngroupIcon />}
      disabled={op === 'ungroup' && !groupedWithin(c.sheet.layout, axis, a, b)}
      onClick={() => {
        if (op === 'group') actions.group(axis);
        else actions.ungroup(axis);
        onClose();
      }}
    />
  );
  return (
    <ContextMenu position={at} label={`${verb} menu`} onClose={onClose}>
      {row('r', g.r1, g.r2)}
      {row('c', g.c1, g.c2)}
    </ContextMenu>
  );
}
