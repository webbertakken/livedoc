// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerTouches,
  isPalmTouch,
  penNear,
  pensNearAfter,
  resetPenPresenceForTests,
  watchPenPresence,
} from './pen-presence';

// docs/specs/023-draw-mode/draw-mode.md "Touch and pen input": a pen near the screen rejects the palm, and a pen is
// never a finger.
const pen = (type: string, pointerId = 7, relatedTarget: EventTarget | null = null) => ({
  type,
  pointerType: 'pen',
  pointerId,
  relatedTarget,
});

describe('pensNearAfter', () => {
  const none: ReadonlySet<number> = new Set();

  it('counts a pen near from its first hover', () => {
    expect(pensNearAfter(none, pen('pointerover')).has(7)).toBe(true);
  });

  it('counts a pen near from its press, on a screen that cannot sense hover', () => {
    expect(pensNearAfter(none, pen('pointerdown')).has(7)).toBe(true);
  });

  it('counts a hovering pen that moves near', () => {
    expect(pensNearAfter(none, pen('pointermove')).has(7)).toBe(true);
  });

  it('keeps the same set while a near pen moves on', () => {
    const near = new Set([7]);
    expect(pensNearAfter(near, pen('pointermove'))).toBe(near);
  });

  it('keeps a pen near after it lifts, while it still hovers', () => {
    expect(pensNearAfter(new Set([7]), pen('pointerup')).has(7)).toBe(true);
  });

  it('keeps a pen near as it hovers from one element onto another', () => {
    const next = document.createElement('div');
    expect(pensNearAfter(new Set([7]), pen('pointerout', 7, next)).has(7)).toBe(true);
  });

  it('lets a pen go once it leaves range, out with nowhere to go', () => {
    expect(pensNearAfter(new Set([7]), pen('pointerout')).size).toBe(0);
  });

  it('lets a pen go when the browser cancels it', () => {
    expect(pensNearAfter(new Set([7]), pen('pointercancel')).size).toBe(0);
  });

  it('leaves the set alone for fingers and mice', () => {
    const near = new Set([7]);
    expect(pensNearAfter(near, { ...pen('pointerout'), pointerType: 'touch' })).toBe(near);
    expect(pensNearAfter(none, { ...pen('pointerdown'), pointerType: 'mouse' })).toBe(none);
  });
});

describe('isPalmTouch', () => {
  afterEach(resetPenPresenceForTests);

  it('is a finger while no pen is near', () => {
    expect(isPalmTouch('touch')).toBe(false);
  });

  it('is a palm while a pen hovers or touches', () => {
    const stop = watchPenPresence(document);
    document.body.dispatchEvent(
      Object.assign(new Event('pointerover', { bubbles: true }), {
        pointerType: 'pen',
        pointerId: 3,
      }),
    );

    expect(penNear()).toBe(true);
    expect(isPalmTouch('touch')).toBe(true);
    expect(isPalmTouch('pen')).toBe(false);
    expect(isPalmTouch('mouse')).toBe(false);
    stop();
  });

  it('is a finger again once the pen leaves range', () => {
    const stop = watchPenPresence(document);
    const send = (type: string) =>
      document.body.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerType: 'pen',
          pointerId: 3,
          relatedTarget: null,
        }),
      );
    send('pointerdown');
    send('pointerup');
    send('pointerout');

    expect(isPalmTouch('touch')).toBe(false);
    stop();
  });

  it('stops watching once told', () => {
    const stop = watchPenPresence(document);
    stop();
    document.body.dispatchEvent(
      Object.assign(new Event('pointerover', { bubbles: true }), {
        pointerType: 'pen',
        pointerId: 3,
      }),
    );

    expect(penNear()).toBe(false);
  });
});

describe('fingerTouches', () => {
  it('keeps fingers and drops a pen reported as a touch', () => {
    const finger = { touchType: 'direct' };
    const legacy = {};
    const stylus = { touchType: 'stylus' };

    expect(fingerTouches([finger, stylus, legacy])).toEqual([finger, legacy]);
  });
});
