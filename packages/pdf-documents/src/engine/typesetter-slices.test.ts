import { describe, expect, it, vi } from 'vitest';
import { MarkFaceSlices } from '../mark-face-slices';
import { markFaceFiles } from '../testing/fixtures';
import { loadTypesetter } from './typesetter';

const table = vi.hoisted(() => ({ fails: true }));
vi.mock('../mark-face-slices-sc', async (real) => {
  if (table.fails) throw new Error('the slices did not load');
  return real();
});

// marks.md "Loading": a region whose table of slices does not load stops the bake by the region's face.
describe('setting runs where a region slices do not load', () => {
  it('answers the region face as what did not load, and tries the table afresh next time', async () => {
    expect(
      await loadTypesetter([{ face: 'noto-sans-sc-400', text: '北京' }], markFaceFiles),
    ).toEqual({ ok: false, face: 'noto-sans-sc-400' });
    table.fails = false;
    expect((await MarkFaceSlices.load('sc')).length).toBeGreaterThan(50);
  });
});
