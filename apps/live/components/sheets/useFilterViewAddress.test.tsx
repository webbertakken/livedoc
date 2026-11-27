// @vitest-environment jsdom
// data-tools.md "Links" (D474): an address naming a saved view of this sheet opens it, one deleted says so and is
// taken away; the address follows the open saved view, never a temporary one, nor another sheet's.
import { act, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  makeSheet,
  renderSheet,
  SHEET_ID,
  stubResizeObserver,
  type SheetParts,
} from './sheet-ui-test-utils';
import { useFilterViewAddress } from './useFilterViewAddress';
import { FILTER_VIEW_DELETED, forgetOpenFilterViews } from './useFilterViews';

beforeAll(stubResizeObserver);
afterEach(() => {
  forgetOpenFilterViews();
  window.history.replaceState({}, '', '/');
});

function Host({ c }: SheetParts) {
  useFilterViewAddress(c);
  return <output data-testid="open">{c.filterViews.open?.title ?? 'none'}</output>;
}

async function sheetWithView() {
  const h = await makeSheet({ cells: { A1: 'Fruit', A2: 'apple' } });
  const l = h.store.sheet(SHEET_ID)!.layout;
  const view = {
    id: 'fvaa',
    title: 'Shared',
    r1: l.rows[0]!,
    c1: l.cols[0]!,
    r2: l.rows[1]!,
    c2: l.cols[0]!,
    conds: {},
  };
  h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'fview', id: 'fvaa', view }] });
  return h;
}

describe('useFilterViewAddress', () => {
  it('opens the saved view an address names, and keeps the address in step', async () => {
    const h = await sheetWithView();
    window.history.replaceState({}, '', `/d/x?fview=${SHEET_ID}.fvaa#t=tab`);
    renderSheet(h, (p) => <Host {...p} />);
    expect(screen.getByTestId('open').textContent).toBe('Shared');
    act(() => h.ctl().filterViews.close());
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#t=tab');
    act(() => h.ctl().filterViews.openSaved('fvaa'));
    expect(window.location.search).toBe(`?fview=${SHEET_ID}.fvaa`);
    act(() =>
      h
        .ctl()
        .filterViews.openTemporary({ ...h.ctl().filterViews.open!, title: 'Temporary Filter 1' }),
    );
    expect(window.location.search).toBe('');
  });

  it('says a named view was deleted, taking it off the address', async () => {
    const h = await makeSheet();
    window.history.replaceState({}, '', `/d/x?fview=${SHEET_ID}.fvzz`);
    renderSheet(h, (p) => <Host {...p} />);
    expect(h.toast).toHaveBeenCalledWith(FILTER_VIEW_DELETED);
    expect(window.location.search).toBe('');
  });

  it("leaves another sheet's view in the address alone", async () => {
    const h = await sheetWithView();
    window.history.replaceState({}, '', '/d/x?fview=othersheet.fvaa');
    renderSheet(h, (p) => <Host {...p} />);
    expect(screen.getByTestId('open').textContent).toBe('none');
    expect(window.location.search).toBe('?fview=othersheet.fvaa');
  });
});
