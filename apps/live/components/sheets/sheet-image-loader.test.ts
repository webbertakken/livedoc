// The page's pictures (docs/specs/029-sheets/imports.md "IMAGE"): each address fetched once, a few at once, shown or
// failed, kept while drawn and let go past the bound or when the spreadsheet closes.
import { describe, expect, it, vi } from 'vitest';
import { IMAGES_AT_ONCE, SHEET_IMAGES_KEPT, SheetImageLoader } from './sheet-image-loader';

function setup() {
  const waiting = new Map<string, (blob: Blob | null) => void>();
  const fetch = vi.fn(
    (url: string) => new Promise<Blob | null>((resolve) => waiting.set(url, resolve)),
  );
  const revoke = vi.fn();
  let made = 0;
  const loader = new SheetImageLoader({ fetch, objectUrl: () => `blob:${++made}`, revoke });
  const settle = async (url: string, blob: Blob | null) => {
    waiting.get(url)!(blob);
    waiting.delete(url);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { loader, fetch, revoke, settle, waiting };
}

const png = new Blob([new Uint8Array([1])], { type: 'image/png' });

describe('SheetImageLoader', () => {
  it('fetches an address once, loading until it is shown, and tells who listens', async () => {
    const { loader, fetch, settle } = setup();
    const heard = vi.fn();
    loader.subscribe('a', heard);
    loader.subscribe('a', vi.fn())();
    expect(loader.state('a')).toEqual({ status: 'loading' });
    loader.want('a');
    loader.want('a');
    expect(fetch).toHaveBeenCalledTimes(1);
    await settle('a', png);
    expect(loader.state('a')).toEqual({ status: 'shown', src: 'blob:1' });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('fails an address not fetched, never asking again', async () => {
    const { loader, fetch, settle } = setup();
    loader.want('a');
    await settle('a', null);
    loader.want('a');
    expect(loader.state('a')).toEqual({ status: 'failed' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it(`fetches ${IMAGES_AT_ONCE} at once, the rest in turn`, async () => {
    const { loader, fetch, settle } = setup();
    for (let i = 0; i <= IMAGES_AT_ONCE; i++) loader.want(`u${i}`);
    expect(fetch).toHaveBeenCalledTimes(IMAGES_AT_ONCE);
    await settle('u0', png);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(IMAGES_AT_ONCE + 1);
  });

  it(`keeps ${SHEET_IMAGES_KEPT}, letting go of the least recently drawn no cell draws`, async () => {
    const { loader, revoke, settle, waiting } = setup();
    loader.want('first');
    await settle('first', png);
    const stop = loader.subscribe('first', () => {});
    loader.want('second');
    await settle('second', png);
    for (let i = 0; i < SHEET_IMAGES_KEPT - 1; i++) loader.want(`u${i}`);
    // "first" is drawn (it has a listener), so "second" goes.
    expect(loader.state('first')).toMatchObject({ status: 'shown' });
    expect(loader.state('second')).toEqual({ status: 'loading' });
    expect(revoke).toHaveBeenCalledWith('blob:2');
    stop();
    loader.want('late');
    expect(revoke).toHaveBeenCalledWith('blob:1');
    // Let go while on its way (u0 is fetched): its answer is not kept.
    loader.want('later');
    for (const url of [...waiting.keys()]) await settle(url, null);
    expect(loader.state('u0')).toEqual({ status: 'loading' });
  });

  it('lets every picture go when the spreadsheet closes, and keeps nothing arriving after', async () => {
    const { loader, revoke, settle } = setup();
    loader.want('a');
    loader.want('b');
    await settle('a', png);
    loader.dispose();
    expect(revoke).toHaveBeenCalledWith('blob:1');
    await settle('b', png);
    expect(loader.state('b')).toEqual({ status: 'loading' });
  });

  it('draws from the browser’s object URLs by default', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const loader = new SheetImageLoader({ fetch: async () => png });
    loader.want('a');
    return vi.waitFor(() => {
      expect(loader.state('a')).toEqual({ status: 'shown', src: 'blob:x' });
      loader.dispose();
      expect(create).toHaveBeenCalled();
      expect(revoke).toHaveBeenCalledWith('blob:x');
    });
  });
});
