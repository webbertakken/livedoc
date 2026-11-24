import { describe, expect, it, vi } from 'vitest';
import { markFaceFiles } from '../testing/fixtures';
import { loadTypesetter } from './typesetter';

vi.mock('bidi-js', () => {
  throw new Error('the bidirectional algorithm did not load');
});

// marks.md "Loading": the shaper is HarfBuzz and bidi-js together; either not loading stops the bake as `shaper`.
describe('setting runs where bidi-js does not load', () => {
  it('answers the shaper as what did not load', async () => {
    expect(
      await loadTypesetter([{ face: 'noto-sans-greek-400', text: 'Ω' }], markFaceFiles),
    ).toEqual({
      ok: false,
      face: 'shaper',
    });
  });
});
