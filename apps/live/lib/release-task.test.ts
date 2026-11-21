// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterRelease, landReleases } from './release-task';

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('afterRelease', () => {
  afterEach(() => landReleases());

  it('lands the work in a task of its own, not in the release', async () => {
    const work = vi.fn();
    afterRelease(work);
    expect(work).not.toHaveBeenCalled();
    await nextTask();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('lands queued work once each, in the order it was handed over', async () => {
    const order: string[] = [];
    afterRelease(() => order.push('first'));
    afterRelease(() => order.push('second'));
    await nextTask();
    await nextTask();
    expect(order).toEqual(['first', 'second']);
  });

  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel'])(
    'lands pending work before a %s reaches anyone else',
    (type) => {
      const order: string[] = [];
      const listener = () => order.push('input');
      window.addEventListener(type, listener, true);
      afterRelease(() => order.push('release'));
      window.dispatchEvent(new Event(type));
      window.removeEventListener(type, listener, true);
      expect(order).toEqual(['release', 'input']);
    },
  );

  it('lands nothing twice when the input lands it before its task', async () => {
    const work = vi.fn();
    afterRelease(work);
    landReleases();
    await nextTask();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('lands work handed over while landing in the same pass', () => {
    const order: string[] = [];
    afterRelease(() => {
      order.push('outer');
      afterRelease(() => order.push('inner'));
    });
    landReleases();
    expect(order).toEqual(['outer', 'inner']);
  });

  it('lands the rest when one throws, and reports the error', async () => {
    const reported = vi.fn();
    const onError = (e: ErrorEvent) => {
      e.preventDefault();
      reported(e.error);
    };
    window.addEventListener('error', onError);
    const after = vi.fn();
    const boom = new Error('boom');
    afterRelease(() => {
      throw boom;
    });
    afterRelease(after);
    landReleases();
    await nextTask();
    window.removeEventListener('error', onError);
    expect(after).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(boom);
  });
});
