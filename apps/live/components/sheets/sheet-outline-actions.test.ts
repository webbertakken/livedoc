// What groups do (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"), with nothing to change: no
// write and no fold.
import { describe, expect, it, vi } from 'vitest';
import { emptySheet, single, type Sheet } from '@livedoc/sheets';
import type { SheetController } from './sheet-controller';
import { sheetOutlineActions } from './sheet-outline-actions';

function controller(canShape: boolean) {
  const sheet: Sheet = emptySheet({
    id: 'sheet0001',
    tabId: 't',
    title: 'S',
    layout: { rows: ['ra01', 'rb01'], cols: ['ca01'] },
  });
  const c = {
    sheet,
    viewLayout: sheet.layout,
    canShape,
    grid: { rows: 2, cols: 1 },
    selectionNow: () => single({ r: 0, c: 0 }),
    write: vi.fn(() => true),
    foldForSelf: vi.fn(),
    toast: vi.fn(),
  };
  return { c, actions: sheetOutlineActions(c as unknown as SheetController) };
}

describe('sheetOutlineActions with nothing to change', () => {
  it('writes and folds nothing', () => {
    const { c, actions } = controller(true);
    actions.ungroup('r');
    actions.setControls('r', false);
    actions.foldAll('c', true);
    actions.foldAtActive(true);
    actions.foldAtActive(false);
    // A selection past the sheet's lines groups none.
    c.selectionNow = () => single({ r: 5, c: 0 });
    actions.group('r');
    expect(c.write).not.toHaveBeenCalled();
    expect(c.foldForSelf).not.toHaveBeenCalled();
  });

  it('writes an Editor’s controls, and keeps a Participant’s folds to themselves', () => {
    const editor = controller(true);
    editor.actions.setControls('c', true);
    expect(editor.c.write).toHaveBeenCalledWith(
      { kind: 'layout', changes: [{ k: 'controls', axis: 'c', after: true }] },
      'Group',
    );
    const participant = controller(false);
    participant.actions.group('r');
    participant.c.viewLayout = { ...participant.c.sheet.layout, rowDepth: { ra01: 1 } };
    participant.actions.foldAll('r', true);
    expect(participant.c.foldForSelf).toHaveBeenCalledWith([
      { k: 'collapse', axis: 'r', at: 'ra01', depth: 1, collapsed: true },
    ]);
  });
});
