import { describe, expect, it } from 'vitest';
import { RoomWake } from './room-wake';

describe('RoomWake', () => {
  it('answers the time since the room started once, then nothing', () => {
    let now = 100;
    const wake = new RoomWake(() => now);
    now = 145;
    expect(wake.take()).toBe(45);
    now = 900;
    expect(wake.take()).toBeNull();
  });
});
