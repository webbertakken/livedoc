// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Read mode": View > Read mode hides the chrome for one person, Escape
// leaves where nothing nearer takes it, and entering it is told to telemetry.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { READ_MODE } from './pdf-menus';
import { usePdfReadMode } from './usePdfReadMode';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const key = (name: string, prevented = false) => {
  const event = {
    key: name,
    defaultPrevented: prevented,
    preventDefault: vi.fn(),
  };
  return event as unknown as KeyboardEvent<HTMLElement> & { preventDefault: () => void };
};

beforeEach(() => vi.clearAllMocks());

describe('Read mode', () => {
  it('starts off, its item unchecked', () => {
    const { result } = renderHook(() => usePdfReadMode());
    expect(result.current.on).toBe(false);
    expect(result.current.actions[READ_MODE]?.checked).toBe(false);
  });

  it('turns on from its item, told to telemetry and logged, and off again from it', () => {
    const { result } = renderHook(() => usePdfReadMode());
    act(() => result.current.actions[READ_MODE]!.run());
    expect(result.current.on).toBe(true);
    expect(result.current.actions[READ_MODE]?.checked).toBe(true);
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'ReadMode');
    expect(debugLog).toHaveBeenCalledWith('[pdf] read-mode on=yes');
    act(() => result.current.actions[READ_MODE]!.run());
    expect(result.current.on).toBe(false);
    expect(debugLog).toHaveBeenCalledWith('[pdf] read-mode on=no');
    // Sent on entering, never on leaving.
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('is left by Escape, which it then takes', () => {
    const { result } = renderHook(() => usePdfReadMode());
    act(() => result.current.actions[READ_MODE]!.run());
    const escape = key('Escape');
    let taken = false;
    act(() => {
      taken = result.current.onKey(escape);
    });
    expect(taken).toBe(true);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(result.current.on).toBe(false);
  });

  it('leaves Escape to whatever is nearer, and to the rest of the surface while it is off', () => {
    const { result } = renderHook(() => usePdfReadMode());
    expect(result.current.onKey(key('Escape'))).toBe(false);
    act(() => result.current.actions[READ_MODE]!.run());
    expect(result.current.onKey(key('Escape', true))).toBe(false);
    expect(result.current.onKey(key('Enter'))).toBe(false);
    expect(result.current.on).toBe(true);
  });

  it('is left by its button', () => {
    const { result } = renderHook(() => usePdfReadMode());
    act(() => result.current.actions[READ_MODE]!.run());
    act(() => result.current.leave());
    expect(result.current.on).toBe(false);
  });
});
