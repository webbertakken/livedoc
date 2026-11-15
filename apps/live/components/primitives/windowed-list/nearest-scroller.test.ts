// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nearestScroller } from './nearest-scroller';

function box(overflowY: string, scrollHeight: number, clientHeight: number) {
  const el = document.createElement('div');
  el.style.overflowY = overflowY;
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight });
  return el;
}

describe('nearestScroller', () => {
  it('finds the nearest ancestor that scrolls and overflows', () => {
    const outer = box('auto', 5000, 600);
    const idle = box('auto', 300, 300);
    const list = document.createElement('ul');
    idle.append(list);
    outer.append(idle);
    document.body.append(outer);
    expect(nearestScroller(list)).toBe(outer);
  });

  it('answers the window (null) when nothing above scrolls', () => {
    const list = document.createElement('ul');
    document.body.append(list);
    expect(nearestScroller(list)).toBeNull();
  });
});
