// @vitest-environment jsdom
// docs/specs/026-plan/plan-tabs.md "Its name in the active tab": the active tab segment's slot, which a Dashboard tab's
// name portals into, is known to whoever reads it while it is mounted, and forgotten once it goes.
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MenuNameSlot, setMenuNameSlot, useMenuNameSlot } from './menu-name-slot';

afterEach(cleanup);

describe('MenuNameSlot', () => {
  it('is the slot while mounted, and none once it goes', () => {
    const { result } = renderHook(() => useMenuNameSlot());
    expect(result.current).toBeNull();
    const view = render(<MenuNameSlot />);
    const slot = document.querySelector('[data-menu-name-slot]');
    expect(result.current).toBe(slot);
    view.unmount();
    expect(result.current).toBeNull();
  });

  it('tells no one when the same slot is set again', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useMenuNameSlot();
    });
    const el = document.createElement('span');
    act(() => setMenuNameSlot(el));
    const after = renders;
    act(() => setMenuNameSlot(el));
    expect(renders).toBe(after);
    act(() => setMenuNameSlot(null));
  });
});
