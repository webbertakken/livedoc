// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": add, duplicate, rename and delete, each one step on
// the person's one timeline, undone and redone with the sheet's ids (D170, D171, D173).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { track } from '@/lib/telemetry';
import { sheetBarChanges, type SheetBarDeps } from './sheet-bar-actions';
import type { SheetBarBackend, SheetBarEntry } from './sheet-bar-backend';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

type Tab = { id: string; name: string };

function setup(
  start: Tab[] = [
    { id: 't1', name: 'Sheet1' },
    { id: 't2', name: 'Costs' },
  ],
) {
  let tabs = start;
  let open = 't1';
  const steps: ItemUndoStep[] = [];
  const put = vi.fn(async (_: SheetBarEntry) => {});
  const take = vi.fn(async (_: Pick<SheetBarEntry, 'tabId' | 'sheetId'>) => {});
  const move = vi.fn(async (_: Pick<SheetBarEntry, 'tabId' | 'sheetId' | 'after'>) => {});
  const backend: SheetBarBackend = { put, take, move };
  const write = vi.fn((): string | null => null);
  const confirm = vi.fn(async () => true);
  const toast = vi.fn();
  const opened: string[] = [];
  let next = 0;
  const deps: SheetBarDeps = {
    tabs: () => tabs,
    openTabId: () => open,
    backend: () => backend,
    store: () => ({
      sheetsOn: (tabId: string) =>
        tabs.some((t) => t.id === tabId) && tabId !== 'cold'
          ? [{ id: `sheet${tabId}` } as never]
          : [],
      write: write as never,
    }),
    pushUndo: (step) => steps.push(step),
    toast,
    confirm,
    open: (id) => {
      opened.push(id);
      open = id;
    },
    newIds: () => ({ tabId: `new${++next}`, sheetId: `sheetNew${next}` }),
  };
  return {
    changes: sheetBarChanges(deps),
    deps,
    put,
    take,
    move,
    write,
    confirm,
    toast,
    steps,
    opened,
    setTabs: (t: Tab[]) => (tabs = t),
    setOpen: (id: string) => (open = id),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.mocked(track).mockClear());

describe('adding a sheet', () => {
  it('adds Sheet<n>, n from the count, after the last sheet and opens it, one undo step (D170)', async () => {
    const s = setup();
    s.changes.add('end');
    await settle();
    expect(s.put).toHaveBeenCalledWith({
      tabId: 'new1',
      sheetId: 'sheetNew1',
      name: 'Sheet3',
      after: 't2',
    });
    expect(s.opened).toEqual(['new1']);
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'AddSheet');
    expect(s.steps).toHaveLength(1);
  });

  it('adds after the open sheet from Insert › Sheet, and last when the open one is unknown', async () => {
    const s = setup();
    s.changes.add('afterOpen');
    await settle();
    expect(s.put.mock.calls[0]![0].after).toBe('t1');
    s.setOpen('gone');
    s.changes.add('afterOpen');
    await settle();
    expect(s.put.mock.calls[1]![0].after).toBe('t2');
  });

  it('undoes by taking the sheet out and redoes by putting it back with its ids', async () => {
    const s = setup();
    s.changes.add('end');
    await settle();
    s.setTabs([
      { id: 't1', name: 'Sheet1' },
      { id: 't2', name: 'Costs' },
      { id: 'new1', name: 'Sheet3' },
    ]);
    s.steps[0]!.undo();
    await settle();
    expect(s.take).toHaveBeenCalledWith({ tabId: 'new1', sheetId: 'sheetNew1' });
    s.setTabs([{ id: 't1', name: 'Sheet1' }]);
    s.steps[0]!.redo();
    await settle();
    // Costs went meanwhile: it goes back after the nearest tab still there.
    expect(s.put.mock.calls[1]![0]).toEqual({
      tabId: 'new1',
      sheetId: 'sheetNew1',
      name: 'Sheet3',
      after: 't1',
      restore: true,
    });
  });

  it('says a refusal, pushes no step, and says a refused undo too', async () => {
    const s = setup();
    s.put.mockRejectedValueOnce({ code: 'sheets_full' });
    s.changes.add('end');
    await settle();
    expect(s.toast).toHaveBeenCalledWith('A spreadsheet holds up to 200 sheets');
    expect(s.steps).toHaveLength(0);
    s.changes.add('end');
    await settle();
    s.take.mockRejectedValueOnce(undefined);
    s.steps[0]!.undo();
    await settle();
    expect(s.toast).toHaveBeenLastCalledWith("Couldn't save that change");
  });
});

describe('duplicating a sheet', () => {
  it('copies it after itself as Copy of <name>, opened, one undo step (D171)', async () => {
    const s = setup();
    s.changes.duplicate('t1');
    await settle();
    expect(s.put).toHaveBeenCalledWith({
      tabId: 'new1',
      sheetId: 'sheetNew1',
      name: 'Copy of Sheet1',
      after: 't1',
      copyOf: 'sheett1',
    });
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'DuplicateSheet');
    s.steps[0]!.redo();
    await settle();
    // Put back, never copied again.
    expect(s.put.mock.calls[1]![0]).not.toHaveProperty('copyOf');
  });

  it('says a sheet not loaded yet, or one not there', () => {
    const s = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 'cold', name: 'Cold' },
    ]);
    s.changes.duplicate('cold');
    s.changes.duplicate('gone');
    expect(s.toast).toHaveBeenCalledTimes(2);
    expect(s.toast).toHaveBeenCalledWith('This sheet is still loading');
    expect(s.put).not.toHaveBeenCalled();
  });
});

describe('renaming a sheet', () => {
  it('writes the title through the store, keeping an unchanged name as it is (D172)', () => {
    const s = setup();
    expect(s.changes.rename('t2', ' Costs ')).toBe(true);
    expect(s.write).not.toHaveBeenCalled();
    expect(s.changes.rename('t2', ' Q3 ')).toBe(true);
    expect(s.write).toHaveBeenCalledWith('sheett2', { kind: 'title', title: 'Q3' });
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'Title');
  });

  it('refuses a name the rules refuse, or another sheet’s, saying why', () => {
    const s = setup();
    expect(s.changes.rename('t2', 'sheet1')).toBe(false);
    expect(s.toast).toHaveBeenLastCalledWith('Another sheet in this spreadsheet is called that');
    expect(s.changes.rename('t2', 'a/b')).toBe(false);
    expect(s.toast).toHaveBeenLastCalledWith(
      "A sheet's name can't hold [ ] * ? / \\ : or start or end with '",
    );
    expect(s.write).not.toHaveBeenCalled();
  });

  it('is false when the store refuses, or the sheet is not loaded', () => {
    const s = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 'cold', name: 'Cold' },
    ]);
    s.write.mockReturnValueOnce('sheet_loading');
    expect(s.changes.rename('t1', 'Data')).toBe(false);
    expect(s.changes.rename('cold', 'Data')).toBe(false);
    expect(s.toast).toHaveBeenCalledWith('This sheet is still loading');
  });
});

describe('deleting a sheet', () => {
  it('asks first, opens the next sheet, and undoes by putting it back where it was (D173)', async () => {
    const s = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 't2', name: 'Costs' },
      { id: 't3', name: 'Notes' },
    ]);
    s.setOpen('t2');
    s.changes.remove('t2');
    await settle();
    expect(s.confirm).toHaveBeenCalledWith({
      title: 'Delete Costs?',
      message: 'Every reference to it becomes #REF!. Undo puts it back.',
      confirmLabel: 'Delete',
    });
    expect(s.opened).toEqual(['t3']);
    expect(s.take).toHaveBeenCalledWith({ tabId: 't2', sheetId: 'sheett2' });
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'DeleteSheet');
    s.setTabs([
      { id: 't1', name: 'Sheet1' },
      { id: 't3', name: 'Notes' },
    ]);
    s.steps[0]!.undo();
    await settle();
    expect(s.put).toHaveBeenCalledWith({
      tabId: 't2',
      sheetId: 'sheett2',
      name: 'Costs',
      after: 't1',
      restore: true,
    });
    s.steps[0]!.redo();
    await settle();
    expect(s.take).toHaveBeenCalledTimes(2);
  });

  it('goes back first when it was first, and leaves another open sheet open', async () => {
    const s = setup();
    s.setOpen('t2');
    s.changes.remove('t1');
    await settle();
    expect(s.opened).toEqual([]);
    s.steps[0]!.undo();
    await settle();
    expect(s.put.mock.calls[0]![0].after).toBeNull();
  });

  it('does nothing when the question is declined, or for a tab not there', async () => {
    const s = setup();
    s.confirm.mockResolvedValueOnce(false);
    s.changes.remove('t1');
    s.changes.remove('gone');
    await settle();
    expect(s.take).not.toHaveBeenCalled();
    expect(s.confirm).toHaveBeenCalledTimes(1);
  });

  it('never deletes the last sheet, nor one not loaded', () => {
    const one = setup([{ id: 't1', name: 'Sheet1' }]);
    one.changes.remove('t1');
    expect(one.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet');
    const cold = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 'cold', name: 'Cold' },
    ]);
    cold.changes.remove('cold');
    expect(cold.toast).toHaveBeenCalledWith('This sheet is still loading');
    expect(one.confirm).not.toHaveBeenCalled();
    expect(cold.confirm).not.toHaveBeenCalled();
  });

  it('opens nothing when no other sheet is left by the time it is answered', async () => {
    const s = setup();
    s.setOpen('t2');
    s.confirm.mockImplementationOnce(async () => {
      s.setTabs([{ id: 't2', name: 'Costs' }]);
      return true;
    });
    s.changes.remove('t2');
    await settle();
    expect(s.opened).toEqual([]);
    expect(s.take).toHaveBeenCalled();
  });

  it('says a refused delete and pushes no step', async () => {
    const s = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 't2', name: 'Costs' },
    ]);
    s.setOpen('t2');
    s.take.mockRejectedValueOnce({ code: 'sheet_last_visible' });
    s.changes.remove('t2');
    await settle();
    expect(s.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet');
    expect(s.steps).toHaveLength(0);
  });
});

describe('moving a sheet', () => {
  const three = [
    { id: 't1', name: 'Sheet1' },
    { id: 't2', name: 'Costs' },
    { id: 't3', name: 'Notes' },
  ];

  it('moves after the tab named, one undo step back after the tab it followed', async () => {
    const s = setup(three);
    s.changes.move('t1', 't3');
    await settle();
    expect(s.move).toHaveBeenCalledWith({ tabId: 't1', sheetId: 'sheett1', after: 't3' });
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'MoveSheet');
    s.setTabs([three[1]!, three[2]!, three[0]!]);
    s.steps[0]!.undo();
    await settle();
    expect(s.move).toHaveBeenLastCalledWith({ tabId: 't1', sheetId: 'sheett1', after: null });
    s.setTabs(three);
    s.steps[0]!.redo();
    await settle();
    expect(s.move).toHaveBeenLastCalledWith({ tabId: 't1', sheetId: 'sheett1', after: 't3' });
  });

  it('moves one place right or left, never past either end', async () => {
    const s = setup(three);
    s.changes.moveBy('t2', 1);
    s.changes.moveBy('t2', -1);
    s.changes.moveBy('t3', -1);
    s.changes.moveBy('t1', -1);
    s.changes.moveBy('t3', 1);
    s.changes.moveBy('gone', 1);
    await settle();
    expect(s.move.mock.calls.map((c) => c[0].after)).toEqual(['t3', null, 't1']);
  });

  it('does nothing where it already is, and says a sheet not loaded or a refusal', async () => {
    const s = setup([...three, { id: 'cold', name: 'Cold' }]);
    s.changes.move('t2', 't1');
    s.changes.move('t1', null);
    expect(s.move).not.toHaveBeenCalled();
    s.changes.move('cold', null);
    s.changes.move('gone', null);
    expect(s.toast).toHaveBeenCalledTimes(2);
    s.move.mockRejectedValueOnce({ code: 'tab_not_found' });
    s.changes.move('t1', 't3');
    await settle();
    expect(s.steps).toHaveLength(0);
    expect(s.toast).toHaveBeenLastCalledWith(
      'The sheet it went beside is no longer in this spreadsheet',
    );
  });
});
