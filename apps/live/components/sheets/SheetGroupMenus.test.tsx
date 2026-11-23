// @vitest-environment jsdom
// The menus of groups (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"): Alt+Shift+→ and ← over
// cells (D160), a right-click on an outline band, and a header's Group and Ungroup.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { outlineOf } from '@livedoc/sheets';
import type { OpenMenu } from './sheet-controller';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from './sheet-ui-test-utils';
import { SheetMenus } from './SheetMenus';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('./useSheetClipboard', () => ({ useSheetClipboard: () => ({ copyNow: vi.fn() }) }));

beforeAll(stubResizeObserver);

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const no = (name: string | RegExp) => expect(screen.queryByRole('button', { name })).toBeNull();
const groups = (h: SheetHarness, axis: 'r' | 'c' = 'r') =>
  outlineOf(h.store.sheet(SHEET_ID)!.layout, axis).groups.map(
    (g) => `${g.depth}:${g.from}-${g.to}${g.collapsed ? '+' : ''}`,
  );

function show(h: SheetHarness, menu: OpenMenu, opts: { canShape?: boolean; at?: string } = {}) {
  renderSheet(h, ({ actions }) => <SheetMenus actions={actions} />, opts);
  act(() => h.ctl().setMenu(menu));
}

describe('the group and ungroup menus at the active cell (D160)', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    h = await makeSheet();
  });
  const menu = (op: 'group' | 'ungroup'): OpenMenu => ({ kind: 'group', op, x: 5, y: 5 });

  it('group the selection’s rows or its columns', () => {
    show(h, menu('group'), { at: 'B2:C4' });
    expect(screen.getByRole('dialog', { name: 'Group menu' })).toBeTruthy();
    fireEvent.click(btn('Group rows 2 - 4'));
    expect(groups(h)).toEqual(['1:1-3']);
    expect(h.ctl().menu).toBeNull();
    act(() => h.ctl().setMenu(menu('group')));
    fireEvent.click(btn('Group columns B - C'));
    expect(groups(h, 'c')).toEqual(['1:1-2']);
  });

  it('ungroup them, dimmed where none is grouped', () => {
    show(h, menu('group'), { at: 'B2:C4' });
    fireEvent.click(btn('Group rows 2 - 4'));
    act(() => h.ctl().setMenu(menu('ungroup')));
    no('Ungroup columns B - C');
    expect(screen.getByText('Ungroup columns B - C').closest('[aria-disabled]')).toBeTruthy();
    fireEvent.click(btn('Ungroup rows 2 - 4'));
    expect(groups(h)).toEqual([]);
  });
});

describe('the outline band’s menu', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    h = await makeSheet();
  });
  const band = (axis: 'r' | 'c'): OpenMenu => ({ kind: 'outline', axis, x: 5, y: 5 });
  const grouped = (at: string) => {
    show(h, { kind: 'group', op: 'group', x: 5, y: 5 }, { at });
    fireEvent.click(btn(/^Group rows/));
  };

  it('collapses and expands every row group', () => {
    grouped('A2:A3');
    act(() => h.ctl().setMenu(band('r')));
    expect(screen.getByRole('dialog', { name: 'Groups menu' })).toBeTruthy();
    fireEvent.click(btn('Collapse all row groups'));
    expect(groups(h)).toEqual(['1:1-2+']);
    act(() => h.ctl().setMenu(band('r')));
    fireEvent.click(btn('Expand all row groups'));
    expect(groups(h)).toEqual(['1:1-2']);
  });

  it('moves the controls to the bottom and back, the right and back, for an Editor', () => {
    show(h, band('r'));
    fireEvent.click(btn('Move +/- button to the bottom'));
    expect(h.store.sheet(SHEET_ID)!.layout.controlsAfter).toEqual({ r: true });
    act(() => h.ctl().setMenu(band('r')));
    fireEvent.click(btn('Move +/- button to the top'));
    act(() => h.ctl().setMenu(band('c')));
    fireEvent.click(btn('Move +/- button to the right'));
    act(() => h.ctl().setMenu(band('c')));
    expect(btn('Move +/- button to the left')).toBeTruthy();
    fireEvent.click(btn('Collapse all column groups'));
    act(() => h.ctl().setMenu(band('c')));
    fireEvent.click(btn('Expand all column groups'));
  });

  it('offers a Participant the folds alone (D163)', () => {
    show(h, band('r'), { canShape: false });
    expect(btn('Expand all row groups')).toBeTruthy();
    no(/Move/);
  });
});

describe('a header’s Group and Ungroup', () => {
  it('group the selected lines, and ungroup them once grouped', async () => {
    const h = await makeSheet();
    show(h, { kind: 'header', axis: 'r', index: 1, x: 5, y: 5 }, { at: 'A2:E3' });
    no('Ungroup rows 2 - 3');
    fireEvent.click(btn('Group rows 2 - 3'));
    expect(groups(h)).toEqual(['1:1-2']);
    act(() => h.ctl().setMenu({ kind: 'header', axis: 'r', index: 1, x: 5, y: 5 }));
    fireEvent.click(btn('Ungroup rows 2 - 3'));
    expect(groups(h)).toEqual([]);
  });
});
