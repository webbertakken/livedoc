// @vitest-environment jsdom
// A gallery picture's size, read to place a cell's picture over the cells (docs/specs/029-sheets/inserted-objects.md
// "Images in a cell", D632): its bytes at up to 4,000 px decoded, the URL given back; null when they do not come or
// do not decode.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pictureNaturalSize } from './picture-natural-size';

const fetchUrl = vi.fn<(...args: unknown[]) => Promise<string | null>>();
const release = vi.fn<(url: string) => void>();
vi.mock('@/lib/api-client', () => ({
  apiFetchImageBlobUrl: (...args: unknown[]) => fetchUrl(...args),
  releaseImageBlobUrl: (url: string) => release(url),
}));

let decodes = true;
class FakeImage {
  src = '';
  naturalWidth = 1200;
  naturalHeight = 600;
  decode() {
    return decodes ? Promise.resolve() : Promise.reject(new Error('EncodingError'));
  }
}

const access = { ownerId: 'o1', documentId: 'd1', shareCode: null };

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  decodes = true;
  fetchUrl.mockReset();
  release.mockReset();
  fetchUrl.mockResolvedValue('blob:p');
});
afterEach(() => vi.unstubAllGlobals());

describe('pictureNaturalSize', () => {
  it('decodes the bytes at up to 4,000 px and gives the URL back', async () => {
    expect(await pictureNaturalSize(access, 'g-1')).toEqual({ width: 1200, height: 600 });
    expect(fetchUrl).toHaveBeenCalledWith('o1', 'g-1', {
      documentId: 'd1',
      shareCode: null,
      maxEdge: 4000,
    });
    expect(release).toHaveBeenCalledWith('blob:p');
  });

  it('is null when the bytes do not come, the fetch fails, or they do not decode', async () => {
    fetchUrl.mockResolvedValueOnce(null);
    expect(await pictureNaturalSize(access, 'g-1')).toBeNull();
    fetchUrl.mockRejectedValueOnce(new Error('offline'));
    expect(await pictureNaturalSize(access, 'g-1')).toBeNull();
    decodes = false;
    expect(await pictureNaturalSize(access, 'g-1')).toBeNull();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
