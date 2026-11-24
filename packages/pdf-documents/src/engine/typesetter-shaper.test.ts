import { describe, expect, it, vi } from 'vitest';
import { markFaceFiles } from '../testing/fixtures';
import { loadTypesetter } from './typesetter';

vi.mock('harfbuzzjs', () => {
  throw new Error('the shaper did not load');
});

// marks.md "Loading": a face that does not load stops the bake by name; HarfBuzz is named `shaper`.
describe('setting runs where the shaper does not load', () => {
  it('answers the shaper as what did not load', async () => {
    expect(await loadTypesetter(['noto-sans-greek-400'], markFaceFiles)).toEqual({
      ok: false,
      face: 'shaper',
    });
  });
});
