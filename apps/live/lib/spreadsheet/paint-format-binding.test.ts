import { describe, expect, it, vi } from 'vitest';
import { paintFormatBinding } from './paint-format-binding';

// docs/specs/029-sheets/formatting.md "Paint format and clearing": a click holds the formats for the next range, a
// double-click keeps it on, pressed again it lets go; pressed while it holds them.
describe('paintFormatBinding', () => {
  it('holds the formats for one range, keeps them on a double-click, and lets go when pressed again', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const idle = paintFormatBinding({ painting: false, start, stop });
    expect(idle.checked).toBe(false);
    idle.run();
    expect(start).toHaveBeenLastCalledWith(false);
    idle.double!();
    expect(start).toHaveBeenLastCalledWith(true);
    const held = paintFormatBinding({ painting: true, start, stop });
    expect(held.checked).toBe(true);
    held.run();
    expect(stop).toHaveBeenCalledOnce();
    held.double!();
    expect(start).toHaveBeenLastCalledWith(true);
  });
});
