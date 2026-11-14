import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTurnReadout, setTurnReadout, subscribeTurnReadout } from './turn-readout';

// docs/specs/008-canvas/selection-transforms.md "Rotating by hand": the angle readout the drag publishes.
afterEach(() => setTurnReadout(null));

describe('the turn readout channel', () => {
  it('holds nothing until a turn publishes', () => {
    expect(getTurnReadout()).toBeNull();
  });

  it('publishes the angle and where the pointer is', () => {
    setTurnReadout({ angle: 45, clientX: 10, clientY: 20 });
    expect(getTurnReadout()).toEqual({ angle: 45, clientX: 10, clientY: 20 });
  });

  it('tells its reader only when the readout changes', () => {
    const told = vi.fn();
    const unsubscribe = subscribeTurnReadout(told);
    setTurnReadout({ angle: 45, clientX: 10, clientY: 20 });
    setTurnReadout({ angle: 45, clientX: 10, clientY: 20 });
    expect(told).toHaveBeenCalledTimes(1);
    setTurnReadout({ angle: 45, clientX: 11, clientY: 20 });
    setTurnReadout(null);
    setTurnReadout(null);
    expect(told).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
