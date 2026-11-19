// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const drawMarkerFace = vi.fn();
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: { sketches: () => Promise.resolve({ drawMarkerFace }) },
  KIND_FAMILY_IDS: ['sketches'],
}));

const { useFaceFinishPass } = await import('./useFaceFinishPass');
const { loadKindFamily, resetKindFamiliesForTests } = await import('@/lib/element-kinds/store');

afterEach(() => {
  resetKindFamiliesForTests();
  drawMarkerFace.mockClear();
});

const root = () => ({ current: document.createElement('div') });

// docs/specs/008-canvas/finish.md "Faces": a face's parts in a hand-drawn finish draw through the sketches family
// (docs/specs/016-platform/web-performance.md).
describe('useFaceFinishPass', () => {
  it('draws a hand-drawn face at once when the family is in', async () => {
    await loadKindFamily('sketches', 'open');
    const ref = root();
    renderHook(() => useFaceFinishPass(ref, 'marker', 'el'));
    expect(drawMarkerFace).toHaveBeenCalledWith(ref.current, 'el', 'marker', false);
  });

  it('draws a face drawn before the family once it lands, in pencil under Sketch', async () => {
    const ref = root();
    renderHook(() => useFaceFinishPass(ref, 'sketch', 'el', { page: true }));
    expect(drawMarkerFace).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(drawMarkerFace).toHaveBeenCalledWith(ref.current, 'el', 'pencil', true),
    );
  });

  it('asks nothing of the family for Professional', () => {
    const ref = root();
    ref.current.innerHTML = '<svg><rect width="40" height="10" rx="5"></rect></svg>';
    renderHook(() => useFaceFinishPass(ref, 'professional', 'el'));
    expect(drawMarkerFace).not.toHaveBeenCalled();
  });
});
