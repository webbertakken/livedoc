'use client';

// A right-click on an outline band (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"): Expand all
// and Collapse all, for anyone (D163), and moving the +/- controls to the other side, an Editor's.
import { controlsAfter } from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { useSheetController } from './sheet-controller';
import { CollapseGroupsIcon, ExpandGroupsIcon } from './sheet-icons';
import { Glyph } from './SheetCellMenu';
import type { SheetActions } from './useSheetActions';

export function SheetOutlineMenu({
  axis,
  at,
  actions,
  onClose,
}: {
  axis: 'r' | 'c';
  at: { x: number; y: number };
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const noun = axis === 'r' ? 'row' : 'column';
  const after = controlsAfter(c.sheet.layout, axis);
  const side = axis === 'r' ? (after ? 'top' : 'bottom') : after ? 'left' : 'right';
  return (
    <ContextMenu position={at} label="Groups menu" onClose={onClose}>
      <MenuActionRow
        label={`Expand all ${noun} groups`}
        icon={<ExpandGroupsIcon />}
        onClick={run(() => actions.foldAll(axis, false))}
      />
      <MenuActionRow
        label={`Collapse all ${noun} groups`}
        icon={<CollapseGroupsIcon />}
        onClick={run(() => actions.foldAll(axis, true))}
      />
      {c.canShape ? (
        <>
          <ContextMenuDivider />
          <MenuActionRow
            label={`Move +/- button to the ${side}`}
            icon={<Glyph t="±" />}
            onClick={run(() => actions.setControls(axis, !after))}
          />
        </>
      ) : null}
    </ContextMenu>
  );
}
