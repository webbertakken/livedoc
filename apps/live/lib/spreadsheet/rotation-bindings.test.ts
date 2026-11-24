import { describe, expect, it, vi } from 'vitest';
import type { FormatPatch } from '@livedoc/sheets';
import { ROTATION_ITEMS, rotationBindings } from './rotation-bindings';

// docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation" (D211).
describe('rotationBindings', () => {
  it('sets each rotation, None clearing it', () => {
    const setFormat = vi.fn<(patch: FormatPatch) => void>();
    const b = rotationBindings({ format: undefined, setFormat, openCustomAngle: vi.fn() });
    for (const { id } of ROTATION_ITEMS) b[id]!.run();
    expect(setFormat.mock.calls.map(([patch]) => patch)).toEqual([
      { ro: null },
      { ro: 45 },
      { ro: -45 },
      { ro: 'v' },
      { ro: 90 },
      { ro: -90 },
    ]);
  });

  it('ticks the active cell’s rotation, None for none, nothing for a custom angle', () => {
    const ticked = (ro?: number | 'v') =>
      Object.entries(
        rotationBindings({
          format: ro === undefined ? undefined : { ro },
          setFormat: vi.fn(),
          openCustomAngle: vi.fn(),
        }),
      )
        .filter(([, action]) => action.checked)
        .map(([id]) => id);
    expect(ticked()).toEqual(['rotate-none']);
    expect(ticked(45)).toEqual(['rotate-tilt-up']);
    expect(ticked('v')).toEqual(['rotate-stack-vertically']);
    expect(ticked(-90)).toEqual(['rotate-down']);
    expect(ticked(30)).toEqual([]);
  });

  it('opens the Custom Angle dialog', () => {
    const openCustomAngle = vi.fn();
    rotationBindings({ format: undefined, setFormat: vi.fn(), openCustomAngle })[
      'rotate-custom-angle'
    ]!.run();
    expect(openCustomAngle).toHaveBeenCalledOnce();
  });
});
