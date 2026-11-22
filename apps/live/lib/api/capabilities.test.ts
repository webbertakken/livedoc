// The capabilities answer is deployment config, so a page asks once however many surfaces need
// it (the editor, the Drive mirror, each Settings open), and asks again only after a failure.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGetCapabilities, fileStorageRefused, resetCapabilitiesForTests } from './capabilities';

const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  resetCapabilitiesForTests();
  vi.unstubAllGlobals();
});

describe('apiGetCapabilities', () => {
  it('asks the api once for every caller on the page', async () => {
    const fetchSpy = answer({ aiEnabled: true, emailEnabled: true });
    vi.stubGlobal('fetch', fetchSpy);
    const [a, b] = await Promise.all([apiGetCapabilities(), apiGetCapabilities()]);
    const c = await apiGetCapabilities();
    expect(a.aiEnabled).toBe(true);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('answers closed on a failure, and asks again next time', async () => {
    vi.stubGlobal('fetch', answer({}, 500));
    expect(await apiGetCapabilities()).toEqual({ aiEnabled: false, emailEnabled: false });
    const fetchSpy = answer({ aiEnabled: true, emailEnabled: false });
    vi.stubGlobal('fetch', fetchSpy);
    expect((await apiGetCapabilities()).aiEnabled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('answers closed when the api cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await apiGetCapabilities()).toEqual({ aiEnabled: false, emailEnabled: false });
  });
});

// docs/specs/006-document/blob-store.md "Without object storage": a browser asks first.
describe('fileStorageRefused', () => {
  it('is true only where the host says it stores no files', async () => {
    vi.stubGlobal('fetch', answer({ aiEnabled: false, filesEnabled: false }));
    expect(await fileStorageRefused()).toBe(true);
  });

  it('is false where the host stores files', async () => {
    vi.stubGlobal('fetch', answer({ aiEnabled: false, filesEnabled: true }));
    expect(await fileStorageRefused()).toBe(false);
  });

  it('is false while the answer is not known: an older api, or a request that failed', async () => {
    vi.stubGlobal('fetch', answer({ aiEnabled: false }));
    expect(await fileStorageRefused()).toBe(false);
    resetCapabilitiesForTests();
    vi.stubGlobal('fetch', answer({}, 500));
    expect(await fileStorageRefused()).toBe(false);
  });
});
