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
  // Tabs whose sheet is hidden, and each tab's colour.
  const hidden = new Set<string>();
  const colours = new Map<string, string>();
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
          ? [
              {
                id: `sheet${tabId}`,
                layout: {
                  ...(hidden.has(tabId) ? { hidden: true } : {}),
                  ...(colours.has(tabId) ? { tabColour: colours.get(tabId) } : {}),
                },
              } as never,
            ]
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
    hidden,
    colours,
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

  // pivot-tables.md "Making one": Create's new sheet is named for its pivot table, and told once it is there.
  it('adds a sheet by a given name and says where it landed once it is there', async () => {
    const s = setup();
    const placed = vi.fn();
    const ids = s.changes.add('afterOpen', { name: 'Pivot Table 1', onPlaced: placed });
    expect(ids).toEqual({ tabId: 'new1', sheetId: 'sheetNew1' });
    expect(placed).not.toHaveBeenCalled();
    await settle();
    expect(s.put.mock.calls[0]![0]).toMatchObject({ name: 'Pivot Table 1', after: 't1' });
    expect(placed).toHaveBeenCalledWith({ tabId: 'new1', sheetId: 'sheetNew1' });
  });

  // pivot-tables.md "Details" (D616): a sheet born with its cells; its redo puts the kept sheet back, cells and all.
  it('adds a seeded sheet, and redoes it as the kept sheet', async () => {
    const s = setup();
    const seed = { id: 'd', title: 'Details1', layout: { rows: ['r'], cols: ['c'] }, cells: [] };
    s.changes.add('afterOpen', { name: 'Details1', seed });
    await settle();
    expect(s.put.mock.calls[0]![0]).toMatchObject({ name: 'Details1', seed });
    s.steps[0]!.undo();
    await settle();
    s.steps[0]!.redo();
    await settle();
    expect(s.put.mock.calls[1]![0]).toMatchObject({ restore: true });
    expect(s.put.mock.calls[1]![0]).not.toHaveProperty('seed');
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
    expect(one.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet shown');
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
    expect(s.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet shown');
    expect(s.steps).toHaveLength(0);
  });
});

const look = (options: Record<string, unknown>) => ({
  kind: 'layout',
  changes: [{ k: 'options', ...options }],
});

describe("colouring a sheet's tab", () => {
  it('writes the colour through the store, and Reset takes it off (D177)', () => {
    const s = setup();
    s.changes.colour('t2', '#1a73e8');
    expect(s.write).toHaveBeenCalledWith('sheett2', look({ tabColour: '#1a73e8' }));
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'SheetColour');
    s.colours.set('t2', '#1a73e8');
    s.changes.colour('t2', null);
    expect(s.write).toHaveBeenLastCalledWith('sheett2', look({ tabColour: null }));
  });

  it('writes nothing for the colour it has, a store refusal, or a sheet not loaded', () => {
    const s = setup([
      { id: 't1', name: 'Sheet1' },
      { id: 'cold', name: 'Cold' },
    ]);
    s.changes.colour('t1', null);
    expect(s.write).not.toHaveBeenCalled();
    s.write.mockReturnValueOnce('write_invalid');
    s.changes.colour('t1', '#1a73e8');
    expect(track).not.toHaveBeenCalled();
    s.changes.colour('cold', '#1a73e8');
    expect(s.toast).toHaveBeenCalledWith('This sheet is still loading');
  });
});

describe('hiding and showing a sheet', () => {
  const three = [
    { id: 't1', name: 'Sheet1' },
    { id: 't2', name: 'Costs' },
    { id: 't3', name: 'Notes' },
  ];

  it('hides a sheet through the store, the open one opening the next shown (D179)', () => {
    const s = setup(three);
    s.hidden.add('t2');
    s.changes.hide('t1');
    expect(s.write).toHaveBeenCalledWith('sheett1', look({ hidden: true }));
    expect(s.opened).toEqual(['t3']);
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'HideSheet');
    s.changes.hide('t3');
    expect(s.write).toHaveBeenCalledTimes(2);
  });

  it('leaves the open sheet open when another is hidden', () => {
    const s = setup(three);
    s.changes.hide('t2');
    expect(s.write).toHaveBeenCalledWith('sheett2', look({ hidden: true }));
    expect(s.opened).toEqual([]);
  });

  it('never hides the last sheet shown, nor opens past a refused write', () => {
    const s = setup(three);
    s.hidden.add('t2');
    s.hidden.add('t3');
    s.changes.hide('t1');
    expect(s.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet shown');
    s.hidden.delete('t3');
    s.write.mockReturnValueOnce('sheet_last_visible');
    s.changes.hide('t1');
    expect(s.opened).toEqual([]);
    expect(s.write).toHaveBeenCalledTimes(1);
  });

  it('shows a hidden sheet and opens it; a shown one just opens (D180)', () => {
    const s = setup(three);
    s.hidden.add('t3');
    s.changes.show('t3');
    expect(s.write).toHaveBeenCalledWith('sheett3', look({ hidden: false }));
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'ShowSheet');
    expect(s.opened).toEqual(['t3']);
    s.changes.show('t2');
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.opened).toEqual(['t3', 't2']);
    s.write.mockReturnValueOnce('write_invalid');
    s.changes.show('t3');
    expect(s.opened).toEqual(['t3', 't2']);
  });

  it('never deletes the last sheet shown, and opens the next shown instead', async () => {
    const s = setup(three);
    s.hidden.add('t3');
    s.setOpen('t2');
    s.changes.remove('t2');
    await settle();
    expect(s.opened).toEqual(['t1']);
    s.hidden.add('t2');
    s.changes.remove('t1');
    expect(s.toast).toHaveBeenCalledWith('A spreadsheet keeps at least one sheet shown');
  });

  it('moves right and left over the hidden sheets (D181)', async () => {
    const s = setup(three);
    s.hidden.add('t2');
    s.changes.moveBy('t1', 1);
    s.changes.moveBy('t3', -1);
    await settle();
    expect(s.move.mock.calls.map((c) => c[0].after)).toEqual(['t3', null]);
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
