// @vitest-environment jsdom
// A Participant's and a Viewer's own folds (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline", D163).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FoldChange, SheetLayout } from '@livedoc/sheets';
import { useSheetFolds } from './useSheetFolds';

const layout: SheetLayout = {
  rows: ['ra01', 'rb01', 'rc01'],
  cols: ['ca01'],
  rowDepth: { rb01: 1 },
};
const fold = (collapsed: boolean): FoldChange => ({
  k: 'collapse',
  axis: 'r',
  at: 'rb01',
  depth: 1,
  collapsed,
});

describe('useSheetFolds', () => {
  it('lays the latest fold of each group over the sheet’s, for this sheet only', () => {
    const hook = renderHook(
      (p: { id: string; canShape: boolean }) => useSheetFolds(p.id, layout, p.canShape),
      {
        initialProps: { id: 'sheeta', canShape: false },
      },
    );
    expect(hook.result.current.viewLayout).toBe(layout);
    act(() => hook.result.current.foldForSelf([fold(true)]));
    expect(hook.result.current.viewLayout.rowCollapsed).toEqual([{ at: 'rb01', depth: 1 }]);
    act(() => hook.result.current.foldForSelf([fold(false)]));
    expect(hook.result.current.viewLayout.rowCollapsed).toBeUndefined();
    act(() => hook.result.current.foldForSelf([fold(true)]));
    // An Editor sees the sheet's own; another sheet starts with none of these.
    hook.rerender({ id: 'sheeta', canShape: true });
    expect(hook.result.current.viewLayout).toBe(layout);
    hook.rerender({ id: 'sheetb', canShape: false });
    expect(hook.result.current.viewLayout).toBe(layout);
    act(() => hook.result.current.foldForSelf([fold(true)]));
    expect(hook.result.current.viewLayout.rowCollapsed).toHaveLength(1);
  });
});
