// The grid's menus by pointer (docs/specs/029-sheets/sheet.md "Cell menu", "Rows and columns"): a right-click (or a
// held finger, useSheetTouch) selects what it is on unless the selection holds it, then opens the cell or header
// menu there. A right drag that panned opens nothing.
import { selectCols, selectRows, single } from '@livedoc/sheets';
import type { SheetController } from './sheet-controller';
import type { Hit } from './sheet-geometry';
import type { SheetPan } from './useSheetPan';

type MenuDeps = {
  // The controller as it is now (useLatest), read in the handlers only.
  controller: { readonly current: SheetController };
  local: (clientX: number, clientY: number) => { x: number; y: number };
  hitAt: (x: number, y: number) => Hit;
  pan: SheetPan;
};

export function sheetPointerMenu({ controller, local, hitAt, pan }: MenuDeps) {
  // What a menu (or a held finger) acts on: the cell or header under it, unless the selection already holds it.
  const selectFor = (h: Hit) => {
    const cc = controller.current;
    if (h.kind === 'cell') {
      const inSel = cc
        .selectionNow()
        .ranges.some((g) => h.r >= g.r1 && h.r <= g.r2 && h.c >= g.c1 && h.c <= g.c2);
      if (!inSel) cc.setSelection(single({ r: h.r, c: h.c }));
    } else if (h.kind === 'col' || h.kind === 'row') {
      const axis = h.kind === 'col' ? 'c' : 'r';
      const index = h.kind === 'col' ? h.c : h.r;
      const sel = cc.selectionNow().ranges[cc.selectionNow().ranges.length - 1]!;
      const [a, b] = axis === 'c' ? [sel.c1, sel.c2] : [sel.r1, sel.r2];
      // The selection stays only when it is whole lines of this axis holding the header (a column's cells are not
      // rows: right-clicking row 3 with column D selected selects row 3).
      const whole =
        axis === 'c'
          ? sel.r1 === 0 && sel.r2 >= cc.grid.rows - 1
          : sel.c1 === 0 && sel.c2 >= cc.grid.cols - 1;
      if (!whole || index < a || index > b)
        cc.setSelection(
          axis === 'c' ? selectCols(index, index, cc.grid) : selectRows(index, index, cc.grid),
        );
    }
  };

  const openMenu = (clientX: number, clientY: number) => {
    const cc = controller.current;
    const { x, y } = local(clientX, clientY);
    const h = hitAt(x, y);
    selectFor(h);
    if (h.kind === 'cell') cc.setMenu({ kind: 'cell', x: clientX, y: clientY });
    else if (h.kind === 'band') cc.setMenu({ kind: 'outline', axis: h.axis, x: clientX, y: clientY });
    else if (h.kind === 'col' || h.kind === 'row')
      cc.setMenu({
        kind: 'header',
        axis: h.kind === 'col' ? 'c' : 'r',
        index: h.kind === 'col' ? h.c : h.r,
        x: clientX,
        y: clientY,
      });
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const cc = controller.current;
    if (!cc.interactive) return;
    e.preventDefault();
    e.stopPropagation();
    // A finger's long press opens the menu on its release, unmoved (useSheetTouch), not on the browser's own.
    if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
    // A right drag that panned opens nothing; a right press still deciding (the menu arrives on press on a Mac)
    // opens the menu when it is released unmoved.
    if (pan.swallowContextMenu()) return;
    const { clientX, clientY } = e;
    if (pan.rightPending()) {
      pan.afterRightClick(() => openMenu(clientX, clientY));
      return;
    }
    openMenu(clientX, clientY);
  };

  return { selectFor, openMenu, onContextMenu };
}
