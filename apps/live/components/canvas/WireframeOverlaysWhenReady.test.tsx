// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LaidOutPage } from '@livedoc/document';

let settle: ((m: unknown) => void) | null = null;
const calls: string[] = [];
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    wireframes: () => {
      calls.push('wireframes');
      return new Promise((resolve) => (settle = resolve));
    },
  },
  KIND_FAMILY_IDS: ['wireframes'],
}));

const { WireframeOverlaysWhenReady } = await import('./WireframeOverlaysWhenReady');
const { resetKindFamiliesForTests } = await import('@/lib/element-kinds/store');

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  calls.length = 0;
});

const page = (kind: string) => ({ id: kind, kind }) as unknown as LaidOutPage;

// docs/specs/016-platform/web-performance.md: a wireframe page's overlays are the wireframes family's.
describe('WireframeOverlaysWhenReady', () => {
  it('asks for nothing without a wireframe page', () => {
    const { container } = render(<WireframeOverlaysWhenReady pages={[page('sheet')]} />);
    expect(container.innerHTML).toBe('');
    expect(calls).toEqual([]);
  });

  it('asks for the family for a wireframe page and draws once it lands', async () => {
    const { container } = render(<WireframeOverlaysWhenReady pages={[page('wireframe')]} />);
    expect(calls).toEqual(['wireframes']);
    expect(container.innerHTML).toBe('');
    await act(async () =>
      settle!({ WireframeDeviceOverlays: () => <i data-testid="over">over</i> }),
    );
    expect(container.innerHTML).toContain('over');
  });
});
