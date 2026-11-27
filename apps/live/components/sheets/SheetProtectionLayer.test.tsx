// @vitest-environment jsdom
// data-tools.md "Protected ranges": View › Show › Protected Ranges hatches what the viewer may not write freely, a
// warning protection too, and nothing once the person turns it off.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Protection } from '@livedoc/sheets';
import { makeSheet, renderSheet, stubResizeObserver, SHEET_ID } from './sheet-ui-test-utils';
import { SheetProtectionLayer } from './SheetProtectionLayer';
import { ShowProtectedContext } from './show-protected';

beforeAll(stubResizeObserver);

const hatches = () => document.querySelectorAll('[data-sheet-protected] > span').length;

describe('SheetProtectionLayer', () => {
  it('hatches each protection the viewer may not write freely, and none when turned off', async () => {
    const h = await makeSheet();
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    const put = (p: Protection) =>
      h.store.write(SHEET_ID, {
        kind: 'layout',
        changes: [{ k: 'protection', id: p.id, protection: p }],
      });
    put({
      id: 'prot01',
      range: { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[1]! },
      can: 'editors',
    });
    put({
      id: 'prot02',
      range: { r1: rows[3]!, c1: cols[0]!, r2: rows[3]!, c2: cols[0]! },
      can: 'warn',
    });
    const { unmount } = renderSheet(h, () => <SheetProtectionLayer />, { canShape: true });
    // An Editor is admitted by Editors Only: only the warning is hatched.
    expect(hatches()).toBe(1);
    unmount();
    const participant = renderSheet(h, () => <SheetProtectionLayer />, { canShape: false });
    expect(hatches()).toBe(2);
    participant.unmount();
    renderSheet(
      h,
      () => (
        <ShowProtectedContext.Provider value={false}>
          <SheetProtectionLayer />
        </ShowProtectedContext.Provider>
      ),
      { canShape: false },
    );
    expect(hatches()).toBe(0);
  });
});
