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
  wholeLines,
} from '@livedoc/sheets';
import { restorePlanElement } from '@/hooks/plan/maximised-plan';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { focusOpenEdit } from './focus-open-edit';
import { readSheetLine } from './sheet-cell-speech';
import { useSheetController } from './sheet-controller';
import { cellBox, pageCols, pageRows } from './sheet-geometry';
import { isClipboardChord, sheetKey } from './sheet-keys';
import type { SheetActions } from './useSheetActions';
import type { useSheetClipboard } from './useSheetClipboard';
import type { useSheetPointer } from './useSheetPointer';

/** What a spreadsheet's surface does for the grid's workbook keys. */

// Keys pressed on their way to a chord (Ctrl before Enter), which leave a Smart Fill offer standing.
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);

export type SheetSurfaceKeys = {
  // Alt+Up and Alt+Down, Ctrl+Shift+Page Up and Page Down: the previous or next sheet, none past either end.
  stepSheet: (step: -1 | 1) => void;
  // Alt+Shift+Q: focus to the selection's summary, while it shows.
  focusSummary: () => void;
  // Ctrl+Alt+Shift+M: focus out of the grid, to the toolbar (D137).
  leaveGrid: () => void;
  // F4 outside an edit: the person's timeline redoes (grid-and-editing.md "Formulas").
  redo: () => void;
  // Alt+1: the open sheet's tab becomes its name's field (spreadsheet.md "Sheets in the sheet bar").
  renameSheet: () => void;
  // Alt+Shift+K: All Sheets opens, for anyone (surface.md "Sheet bar").
  listSheets: () => void;
  // Escape, once nothing else takes it: Full Screen ends (surface.md "Layout"); true when it did.
  escape: () => boolean;
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
    // A Smart Fill offer (D150): Escape dismisses it, Ctrl+Enter accepts it below, any other key ends it.
    if (c.smartFill && !MODIFIER_KEYS.has(e.key)) {
      const offered = sheetKey(e, currentOfficePlatform().platform)?.kind;
      if (offered === 'escape') {
        e.preventDefault();
        return c.setSmartFill(null);
      }
      if (offered !== 'fillRange') c.setSmartFill(null);
    }
    // A bare Space is held for Space-drag panning; it types a space on release when no pan used it.
    if (pan.onKeyDown(e)) return;
    // Copy, cut and paste arrive as clipboard events, the browser's: kept from the editor's own chords only.
    if (isClipboardChord(e)) return e.stopPropagation();
    const cmd = sheetKey(e, currentOfficePlatform().platform);
    if (!cmd) return;
    // Undo and redo reach the editor.
    e.preventDefault();
    e.stopPropagation();
    const sel = c.selectionNow();
    const range = sel.ranges[sel.ranges.length - 1]!;
    // A clicked merge is one cell, not a range to cycle through.
    const multi = selectsSeveral(sel, c.grid);
    // Below the active cell, on the screen: where a menu opened by a key stands.
    const activeCellPoint = () => {
      // The grid that heard the key: always there, unlike a ref read later.
      const rect = e.currentTarget.getBoundingClientRect();
      const box = cellBox(c.geometry, sel.active.r, sel.active.c, c.scroll);
      return {
        x: rect.left + c.geometry.headW + box.x,
        y: rect.top + c.geometry.headH + box.y + box.h,
      };
    };
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
      case 'renameSheet':
        return c.canShape ? surface?.renameSheet() : undefined;
      case 'summary':
        return surface?.focusSummary();
      case 'listSheets':
        return surface?.listSheets();
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
      case 'fillRange':
        return c.canEdit ? void actions.acceptSmartFill() : undefined;
      case 'fill':
        return c.canEdit ? actions.fillEdge(cmd.dir) : undefined;
      case 'numberFormat':
        return c.canEdit ? actions.numberFormat(cmd.nf) : undefined;
      case 'find':
        return c.setFindOpen(cmd.replace && c.canEdit ? 'replace' : 'find');
      case 'menu':
        return c.setMenu({ kind: 'cell', ...activeCellPoint() });
      // Whole lines act at once; cells open the four ways at the active cell (D157).
      case 'lines': {
        if (!c.canShape) return;
        const whole = wholeLines(sel, c.grid);
        if (whole)
          return cmd.op === 'insert' ? actions.insert(whole, 'before') : actions.remove(whole);
        return c.setMenu({ kind: 'lines', op: cmd.op, ...activeCellPoint() });
      }
      case 'hide':
        return c.canShape ? actions.hide(cmd.axis, cmd.hidden) : undefined;
      // Whole lines group at once; cells open the rows and the columns at the active cell (D160).
      case 'group': {
        if (!c.canShape) return;
        const whole = wholeLines(sel, c.grid);
        if (whole) return cmd.op === 'group' ? actions.group(whole) : actions.ungroup(whole);
        return c.setMenu({ kind: 'group', op: cmd.op, ...activeCellPoint() });
      }
      // Anyone folds: an Editor for everyone, anyone else for themselves (D163).
      case 'fold':
        return actions.foldAtActive(cmd.collapse);
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
        if (surface?.escape()) return;
        if (c.maximised) return restorePlanElement();
        // Out of the grid: the Sheet element is selected on the canvas, and the canvas has the keys again.
        c.gridEl?.blur();
        bridge?.selectElement(elementId);
        return;
    }
  };
}
