// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code": asked once however many ask, read
// synchronously once in, a needed failure shown and handed on, an idle one forgotten.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canvasCodeFailed,
  loadCanvasCode,
  loadedCanvasCode,
  resetCanvasCodeForTests,
  retryCanvasCode,
  setCanvasCodeFailureHandler,
  setCanvasCodeLoaderForTests,
  subscribeCanvasCode,
} from './canvas-code';

const fakeModule = { EditorCanvasHost: () => null, EditorCanvasChrome: () => null };

afterEach(() => resetCanvasCodeForTests());

describe('the canvas’s code', () => {
  it('is asked for once, however many ask at the same time', async () => {
    const loader = vi.fn(async () => fakeModule);
    setCanvasCodeLoaderForTests(loader);
    const [a, b] = await Promise.all([loadCanvasCode('open'), loadCanvasCode('tab')]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('is read synchronously once in, and never before', async () => {
    setCanvasCodeLoaderForTests(async () => fakeModule);
    expect(loadedCanvasCode()).toBeNull();
    await loadCanvasCode('open');
    expect(loadedCanvasCode()).toBe(fakeModule);
  });

  it('tells its listeners when it lands', async () => {
    setCanvasCodeLoaderForTests(async () => fakeModule);
    const listener = vi.fn();
    subscribeCanvasCode(listener);
    await loadCanvasCode('tab');
    expect(listener).toHaveBeenCalled();
  });

  it('shows a needed load that fails, hands it to the failure handler, and loads again on retry', async () => {
    const error = new Error('chunk');
    const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(fakeModule);
    setCanvasCodeLoaderForTests(loader);
    const handler = vi.fn();
    setCanvasCodeFailureHandler(handler);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadCanvasCode('tab')).toBe(false);
    expect(canvasCodeFailed()).toBe(true);
    expect(handler).toHaveBeenCalledWith(error);
    expect(await retryCanvasCode()).toBe(true);
    expect(canvasCodeFailed()).toBe(false);
    expect(loadedCanvasCode()).toBe(fakeModule);
  });

  it('forgets an idle prefetch that fails', async () => {
    setCanvasCodeLoaderForTests(vi.fn().mockRejectedValueOnce(new Error('offline')));
    const handler = vi.fn();
    setCanvasCodeFailureHandler(handler);
    expect(await loadCanvasCode('idle')).toBe(false);
    expect(canvasCodeFailed()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('shows an idle prefetch’s failure once something waits on it', async () => {
    let fail: (e: Error) => void = () => {};
    setCanvasCodeLoaderForTests(
      () => new Promise<typeof fakeModule>((_, reject) => (fail = reject)),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const idle = loadCanvasCode('idle');
    const needed = loadCanvasCode('tab');
    fail(new Error('chunk'));
    await Promise.all([idle, needed]);
    expect(canvasCodeFailed()).toBe(true);
  });
});
