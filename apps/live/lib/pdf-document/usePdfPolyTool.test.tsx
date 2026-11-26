// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a corner tool's shape ends by a double press, Enter or a press
// on its first corner, handed over to be made; Backspace takes the last corner back; Escape or another tool lets it go;
// "Telemetry and observability": `[pdf] poly-ended`, `[pdf] poly-let-go`.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolyMarkKind } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { usePdfPolyTool } from './usePdfPolyTool';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const LINE = { width: 2, fill: '#fde293' };

function tool(kind: PolyMarkKind | null = 'polygon') {
  const onShape = vi.fn();
  const focusPages = vi.fn();
  const hook = renderHook(
    ({ inHand }: { inHand: PolyMarkKind | null }) =>
      usePdfPolyTool({ inHand, line: LINE, onShape, focusPages }),
    { initialProps: { inHand: kind } },
  );
  const press = (x: number, y: number, index = 1) =>
    act(() => hook.result.current.shaping!.press({ index, at: { x, y }, reach: 4 }));
  const key = (init: Partial<KeyboardEvent<HTMLElement>>) => {
    const event = { preventDefault: vi.fn(), ...init } as unknown as KeyboardEvent<HTMLElement>;
    let taken = false;
    act(() => {
      taken = hook.result.current.onKey(event);
    });
    return { taken, prevented: vi.mocked(event.preventDefault).mock.calls.length > 0 };
  };
  return { hook, onShape, press, key, focusPages };
}

beforeEach(() => vi.mocked(debugLog).mockClear());

describe('a corner tool’s shape', () => {
  it('is nothing the pages hold while another tool is in hand', () => {
    expect(tool(null).hook.result.current.shaping).toBeNull();
  });

  it('ends by a press on its first corner, made on its page in the tool’s line', () => {
    const { hook, onShape, press, focusPages } = tool('cloud');
    press(0, 0);
    // Each press gives the pages the keys, so Enter, Backspace and Escape reach the shape.
    expect(focusPages).toHaveBeenCalledTimes(1);
    press(40, 0);
    press(20, 30);
    expect(hook.result.current.shaping!.draft?.corners).toHaveLength(3);
    press(1, 1);
    expect(onShape).toHaveBeenCalledWith(1, {
      kind: 'cloud',
      corners: [0, 0, 40, 0, 20, 30],
      width: 2,
      fill: '#fde293',
    });
    expect(hook.result.current.shaping!.draft).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[pdf] poly-ended kind=cloud corners=3');
  });

  it('ends by Enter or a double press; too few corners hand over nothing', () => {
    const { hook, onShape, press, key } = tool('polyline');
    press(0, 0);
    press(40, 0);
    expect(key({ key: 'Enter' })).toEqual({ taken: true, prevented: true });
    expect(onShape).toHaveBeenLastCalledWith(1, {
      kind: 'polyline',
      corners: [0, 0, 40, 0],
      width: 2,
    });
    press(5, 5);
    act(() => hook.result.current.shaping!.end());
    expect(onShape).toHaveBeenLastCalledWith(1, null);
  });

  it('takes the last corner back with Backspace and lets the shape go with Escape', () => {
    const { hook, onShape, press, key } = tool();
    press(0, 0);
    press(40, 0);
    expect(key({ key: 'Backspace' }).taken).toBe(true);
    expect(hook.result.current.shaping!.draft?.corners).toEqual([{ x: 0, y: 0 }]);
    expect(key({ key: 'Escape' }).taken).toBe(true);
    expect(hook.result.current.shaping!.draft).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[pdf] poly-let-go kind=polygon');
    expect(onShape).not.toHaveBeenCalled();
    // With no shape in the making the keys are the surface's.
    expect(key({ key: 'Escape' }).taken).toBe(false);
    press(0, 0);
    expect(key({ key: 'Enter', ctrlKey: true }).taken).toBe(false);
    expect(key({ key: 'a' }).taken).toBe(false);
  });

  it('is let go when another tool is taken, and not back with its own', () => {
    const { hook, press } = tool();
    press(0, 0);
    hook.rerender({ inHand: 'cloud' });
    expect(hook.result.current.shaping!.draft).toBeNull();
    press(0, 0);
    act(() => hook.result.current.letGo());
    expect(hook.result.current.shaping!.draft).toBeNull();
  });
});
