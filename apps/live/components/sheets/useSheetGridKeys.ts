// The grid's keys while it has focus (docs/specs/029-sheets/sheet.md "Keyboard"; grid-and-editing.md "Moving
// around"): sheetKey reads a key as a command, and this runs it on the open sheet. A spreadsheet adds what only a
// workbook has (the next sheet, the summary at the foot) through `surface`; a Plan Sheet has none and ignores them.
import {
  cycleInRange,
  farCorner,
  goTo,
  homeEndTarget,
  pageTarget,
  selectAll,
  selectCols,
  selectRows,
  selectsSeveral,
} from '@livedoc/sheets';
import { restorePlanElement } from '@/hooks/plan/maximised-plan';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { focusOpenEdit } from './focus-open-edit';
import { readSheetLine } from './sheet-cell-speech';
import { useSheetController } from './sheet-controller';
import { cellBox, pageCols, pageRows } from './sheet-geometry';
import { sheetKey } from './sheet-keys';
import type { SheetActions } from './useSheetActions';
import type { useSheetClipboard } from './useSheetClipboard';
import type { useSheetPointer } from './useSheetPointer';

/** What a spreadsheet's surface does for the grid's workbook keys. */
export type SheetSurfaceKeys = {
  // Alt+Up and Alt+Down, Ctrl+Shift+Page Up and Page Down: the previous or next sheet, none past either end.
  stepSheet: (step: -1 | 1) => void;
  // Alt+Shift+Q: focus to the selection's summary, while it shows.
  focusSummary: () => void;
  // Ctrl+Alt+Shift+M: focus out of the grid, to the toolbar (D137).
  leaveGrid: () => void;
  // F4 outside an edit: the person's timeline redoes (grid-and-editing.md "Formulas").
  redo: () => void;
};

export function useSheetGridKeys({
  elementId,
  actions,
  pan,
  clipboard,
  reveal,
  surface,
}: {
  elementId: string;
  actions: SheetActions;
  pan: ReturnType<typeof useSheetPointer>['pan'];
  clipboard: ReturnType<typeof useSheetClipboard>;
  // Ctrl+Backspace: the active cell scrolled back into view.
  reveal: () => void;
  surface: SheetSurfaceKeys | undefined;
}) {
  const bridge = useSheetsBridgeContext();
  const c = useSheetController();
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    // The grid holds focus while an edit stays open (a toolbar button pressed mid-way through a formula it could not
    // save): the key is the edit's, never lost. Escape gives it up; any other key goes on in it.
    if (c.editing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        actions.cancelEdit();
      } else focusOpenEdit(c.sheet.id);
      return;
    }
    // A bare Space is held for Space-drag panning; it types a space on release when no pan used it.
    if (pan.onKeyDown(e)) return;
    const cmd = sheetKey(e, currentOfficePlatform().platform);
    if (!cmd) return;
    // Copy, cut and paste arrive as clipboard events; undo and redo reach the canvas.
    e.preventDefault();
    e.stopPropagation();
    const sel = c.selectionNow();
    const range = sel.ranges[sel.ranges.length - 1]!;
    // A clicked merge is one cell, not a range to cycle through.
    const multi = selectsSeveral(sel, c.grid);
    switch (cmd.kind) {
      case 'move':
        return actions.move(cmd.dir, cmd.jump, cmd.extend);
      case 'tab':
        return multi
          ? c.setSelection(cycleInRange(sel, cmd.back ? 'prev-col' : 'next-col'))
          : actions.move(cmd.back ? 'left' : 'right');
      case 'enter':
        if (multi) return c.setSelection(cycleInRange(sel, cmd.back ? 'prev-row' : 'next-row'));
        return cmd.back ? actions.move('up') : actions.startEdit('cell');
      case 'edit':
        return actions.startEdit('cell');
      case 'type':
        return actions.startEdit('type', cmd.text);
      case 'home':
      case 'end': {
        const ext = c.workbook.extent(c.sheet.id);
        const from = cmd.extend ? farCorner(sel) : sel.active;
        const to = homeEndTarget(from, cmd.kind, cmd.toSheet, c.grid, {
          r: Math.max(0, ext.rows - 1),
          c: Math.max(0, ext.cols - 1),
        });
        return c.setSelection(goTo(sel, to, c.grid, cmd.extend));
      }
      case 'page': {
        const sign = cmd.up ? -1 : 1;
        const step = cmd.sideways
          ? { rows: 0, cols: sign * pageCols(c.geometry, c.view.width - c.geometry.headW) }
          : { rows: sign * pageRows(c.geometry, c.view.height - c.geometry.headH), cols: 0 };
        const from = cmd.extend ? farCorner(sel) : sel.active;
        return c.setSelection(goTo(sel, pageTarget(from, step, c.grid), c.grid, cmd.extend));
      }
      case 'reveal':
        return reveal();
      case 'sheet':
        return surface?.stepSheet(cmd.step);
      case 'summary':
        return surface?.focusSummary();
      case 'leave':
        return surface?.leaveGrid();
      case 'redo':
        return c.canEdit ? surface?.redo() : undefined;
      case 'selectAll':
        return c.setSelection(selectAll(sel, c.grid));
      case 'selectRow':
        return c.setSelection(selectRows(range.r1, range.r2, c.grid));
      case 'selectCol':
        return c.setSelection(selectCols(range.c1, range.c2, c.grid));
      case 'pasteValues':
        return void clipboard.pasteSpecial('values');
      case 'clear':
        return c.canEdit ? actions.clear('inputs') : undefined;
      case 'toggle':
        return c.canEdit ? actions.toggle(cmd.flag) : undefined;
      case 'now':
        return c.canEdit ? actions.typeNow(cmd.what) : undefined;
      case 'fill':
        return c.canEdit ? actions.fillEdge(cmd.dir) : undefined;
      case 'numberFormat':
        return c.canEdit ? actions.numberFormat(cmd.nf) : undefined;
      case 'find':
        return c.setFindOpen(cmd.replace && c.canEdit ? 'replace' : 'find');
      case 'menu': {
        const rect = c.gridEl?.getBoundingClientRect();
        const box = cellBox(c.geometry, sel.active.r, sel.active.c, c.scroll);
        if (rect)
          c.setMenu({
            kind: 'cell',
            x: rect.left + c.geometry.headW + box.x,
            y: rect.top + c.geometry.headH + box.y + box.h,
          });
        return;
      }
      case 'read': {
        // Emptied first, so a second press on the same cell is said again.
        const said = readSheetLine(c, cmd.axis, sel.active);
        c.announce('');
        requestAnimationFrame(() => c.announce(said));
        return;
      }
      case 'dropdown':
        // A cell without a dropdown: the next sheet (D136).
        if (!actions.openDropdown()) surface?.stepSheet(1);
        return;
      case 'escape':
        // Paint Format lets go first (sheet.md "Paint Format").
        if (c.rules.paint) return actions.paintStop();
        if (c.marquee) return c.setMarquee(null);
        if (c.findOpen) return c.setFindOpen(null);
        if (c.maximised) return restorePlanElement();
        // Out of the grid: the Sheet element is selected on the canvas, and the canvas has the keys again.
        c.gridEl?.blur();
        bridge?.selectElement(elementId);
        return;
    }
  };
}
