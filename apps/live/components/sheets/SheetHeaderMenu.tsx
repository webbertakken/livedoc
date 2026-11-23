'use client';

// A header's menu (docs/specs/029-sheets/sheet.md "Rows and columns"; grid-and-editing.md "Rows, columns and cells",
// "Groups and the outline"): what the selected rows or columns can have done to them, by an Editor; Copy otherwise.
import { columnLetters, groupedWithin } from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { lineSpan } from '@/lib/spreadsheet/line-span';
import { useSheetController, type OpenMenu } from './sheet-controller';
import type { SheetActions } from './useSheetActions';
import { useSheetClipboard } from './useSheetClipboard';
import { Glyph } from './SheetCellMenu';
import { ClearFormatIcon, GroupIcon, SortIcon, UngroupIcon } from './sheet-icons';

export function SheetHeaderMenu({
  menu,
  actions,
  onClose,
}: {
  menu: Extract<OpenMenu, { kind: 'header' }>;
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const clip = useSheetClipboard();
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const rows = menu.axis === 'r';
  const g = c.selection.ranges[c.selection.ranges.length - 1]!;
  const n = rows ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
  const [a, z] = rows ? [g.r1, g.r2] : [g.c1, g.c2];
  const span = lineSpan(menu.axis, a, z);
  const what = rows ? (n > 1 ? `${n} Rows` : 'Row') : n > 1 ? `${n} Columns` : 'Column';
  return (
    <ContextMenu
      position={{ x: menu.x, y: menu.y }}
      label={rows ? 'Row menu' : 'Column menu'}
      onClose={onClose}
    >
      <MenuHeader title={rows ? `Row ${menu.index + 1}` : `Column ${columnLetters(menu.index)}`} />
      {c.canShape ? (
        <>
          <MenuActionRow
            label={`Insert ${n} ${rows ? 'Above' : 'Left'}`}
            icon={<Glyph t={rows ? '↥' : '↤'} />}
            onClick={act(() => actions.insert(menu.axis, 'before'))}
          />
          <MenuActionRow
            label={`Insert ${n} ${rows ? 'Below' : 'Right'}`}
            icon={<Glyph t={rows ? '↧' : '↦'} />}
            onClick={act(() => actions.insert(menu.axis, 'after'))}
          />
          <MenuActionRow
            label={`Delete ${what}`}
            icon={<Glyph t="−" />}
            onClick={act(() => actions.remove(menu.axis))}
          />
          <MenuActionRow
            label="Clear"
            icon={<ClearFormatIcon />}
            onClick={act(() => actions.clear('all'))}
          />
          <MenuActionRow
            label={`Hide ${what}`}
            icon={<Glyph t="◌" />}
            onClick={act(() => actions.hide(menu.axis, true))}
          />
          <MenuActionRow
            label="Fit to Data"
            icon={<Glyph t="⇔" />}
            onClick={act(() =>
              actions.autofit(menu.axis, range(rows ? g.r1 : g.c1, rows ? g.r2 : g.c2)),
            )}
          />
          <MenuActionRow
            label={`Group ${span}`}
            icon={<GroupIcon />}
            onClick={act(() => actions.group(menu.axis))}
          />
          {groupedWithin(c.sheet.layout, menu.axis, a, z) ? (
            <MenuActionRow
              label={`Ungroup ${span}`}
              icon={<UngroupIcon />}
              onClick={act(() => actions.ungroup(menu.axis))}
            />
          ) : null}
          <MenuActionRow
            label={`Resize ${lineSpan(menu.axis, rows ? g.r1 : g.c1, rows ? g.r2 : g.c2)}`}
            icon={<Glyph t="↔" />}
            onClick={() =>
              c.setMenu({
                kind: 'resize',
                axis: menu.axis,
                from: rows ? g.r1 : g.c1,
                to: rows ? g.r2 : g.c2,
              })
            }
          />
          {!rows ? (
            <>
              <ContextMenuDivider />
              <MenuActionRow
                label="Sort A to Z"
                icon={<SortIcon />}
                onClick={act(() => actions.sortColumn(true))}
              />
              <MenuActionRow
                label="Sort Z to A"
                icon={<SortIcon />}
                onClick={act(() => actions.sortColumn(false))}
              />
            </>
          ) : null}
        </>
      ) : (
        <MenuActionRow
          label="Copy"
          icon={<Glyph t="⧉" />}
          onClick={act(() => clip.copyNow(false))}
        />
      )}
    </ContextMenu>
  );
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
