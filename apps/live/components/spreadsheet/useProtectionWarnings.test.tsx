// @vitest-environment jsdom
// data-tools.md "Protected ranges" (D346): the surface tells the store who this person is to the protections, and asks
// through Show a Warning's dialog: OK writes the change, Cancel leaves it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProtectionWarnHost, SheetStore } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { PROTECTION_WARNING } from './ProtectionWarningDialog';
import { useProtectionWarnings } from './useProtectionWarnings';

function Host({ store, bridge }: { store: SheetStore; bridge: SheetsBridge }) {
  return <>{useProtectionWarnings(store, bridge)}</>;
}

describe('useProtectionWarnings', () => {
  it('sets who writes, asks through the dialog, and lets go on unmount', () => {
    let host: ProtectionWarnHost | null = null;
    const setProtection = vi.fn((_caller: unknown, h: ProtectionWarnHost | null) => {
      host = h;
    });
    const store = { setProtection } as unknown as SheetStore;
    const bridge = { isOwner: true, canEdit: true, canShape: false } as SheetsBridge;
    const { unmount } = render(<Host store={store} bridge={bridge} />);
    expect(setProtection).toHaveBeenCalledWith(
      { owner: true, editor: false },
      expect.any(Function),
    );
    const proceed = vi.fn();
    act(() => host!([], proceed));
    expect(screen.getByText(PROTECTION_WARNING)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(proceed).not.toHaveBeenCalled();
    act(() => host!([], proceed));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(proceed).toHaveBeenCalledOnce();
    expect(screen.queryByText(PROTECTION_WARNING)).toBeNull();
    unmount();
    expect(setProtection).toHaveBeenLastCalledWith(null, null);
    // Not the owner, unless the bridge says so.
    render(<Host store={store} bridge={{ canEdit: true, canShape: true } as SheetsBridge} />);
    expect(setProtection).toHaveBeenLastCalledWith(
      { owner: false, editor: true },
      expect.any(Function),
    );
  });
});
