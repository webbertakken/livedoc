import { describe, expect, it } from 'vitest';
import { withDependents, type ArrowElement, type Element, type ShapeElement } from './index';

// docs/specs/008-canvas/arrow-to-arrow.md: deleting a target arrow cascade-deletes the arrows attached to it, and so
// does the arrow a deleted box takes with it.

const box = (id: string): ShapeElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
});
const link = (id: string, from: string, to: string, locked = false): ArrowElement => ({
  id,
  type: 'arrow',
  from: { kind: 'pinned', elementId: from, anchor: 'e' },
  to: { kind: 'pinned', elementId: to, anchor: 'w' },
  ...(locked ? { locked: true } : {}),
});
const hung = (id: string, onto: string): ArrowElement => ({
  id,
  type: 'arrow',
  from: { kind: 'free', x: 0, y: 0 },
  to: { kind: 'on-arrow', arrowId: onto, t: 0.5 },
});

describe('withDependents', () => {
  it("takes a box's connector and the arrows hung off that connector", () => {
    const els = [box('a'), box('b'), link('x', 'a', 'b'), hung('y', 'x'), hung('z', 'y')];
    expect([...withDependents(els, new Set(['a']))].sort()).toEqual(['a', 'x', 'y', 'z']);
  });

  it('leaves arrows attached to nothing that goes', () => {
    const els = [box('a'), box('b'), box('c'), link('x', 'b', 'c'), hung('y', 'x')];
    expect([...withDependents(els, new Set(['a']))]).toEqual(['a']);
  });

  it('stops at a protected arrow, and leaves what hangs off it', () => {
    const els = [box('a'), box('b'), link('x', 'a', 'b', true), hung('y', 'x')];
    const out = withDependents(els, new Set(['a']), (el) => el.locked === true);
    expect([...out]).toEqual(['a']);
  });

  it('walks a long chain in linear time', () => {
    // 5,000 arrows each hung off the one after it, listed so a pass-until-stable loop would need one pass each.
    const n = 5_000;
    const els: Element[] = [box('a')];
    for (let i = 0; i < n; i += 1)
      els.push(i === n - 1 ? link(`c${i}`, 'a', 'a') : hung(`c${i}`, `c${i + 1}`));
    const started = performance.now();
    const out = withDependents(els, new Set(['a']));
    expect(out.size).toBe(n + 1);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
