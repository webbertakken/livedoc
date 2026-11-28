// @vitest-environment jsdom
// Landing on a cell's link (docs/specs/029-sheets/inserted-objects.md "Get Link to This Cell", D641): the address's
// range is selected, cut to the sheet's edge, and leaves the address; none past the edge selects nothing.
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
} from '@/components/sheets/sheet-ui-test-utils';
import { useCellLinkLanding } from './useCellLinkLanding';

beforeAll(stubResizeObserver);
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

async function land(search: string) {
  window.history.replaceState({}, '', `/document/d1${search}#t=t1`);
  const h = await makeSheet({ rows: 6, cols: 4 });
  const goTo = vi.fn();
  renderSheet(h, (p) => {
    useCellLinkLanding(p.c, goTo);
    return null;
  });
  await act(async () => {});
  return goTo;
}

describe('useCellLinkLanding', () => {
  it('selects the range, cut to the sheet, and takes it out of the address', async () => {
    const goTo = await land('?s=code&range=C5:Z9');
    expect(goTo).toHaveBeenCalledWith({ r1: 4, c1: 2, r2: 5, c2: 3 });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/document/d1?s=code#t=t1',
    );
  });

  it('selects nothing for a range past the sheet, or none at all', async () => {
    expect(await land('?range=A99')).not.toHaveBeenCalled();
    cleanup();
    expect(await land('')).not.toHaveBeenCalled();
  });
});
