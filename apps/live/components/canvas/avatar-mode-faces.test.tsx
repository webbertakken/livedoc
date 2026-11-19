// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reaction } from '@livedoc/document';

let settle: ((m: unknown) => void) | null = null;
let fail: ((e: Error) => void) | null = null;
const calls: string[] = [];
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    'avatar-mode': () => {
      calls.push('avatar-mode');
      return new Promise((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
    },
  },
  KIND_FAMILY_IDS: ['avatar-mode'],
}));
vi.mock('@/lib/debug-log', () => ({ debugLog: () => {} }));

const { ReactionBurst } = await import('./avatar-mode-faces');
const { resetKindFamiliesForTests, setKindFamilyFailureHandler } = await import(
  '@/lib/element-kinds/store'
);

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  fail = null;
  calls.length = 0;
});

const burst = (onDone = vi.fn<() => void>()) => (
  <ReactionBurst reaction={'heart' as Reaction} seed={1} width={40} height={40} onDone={onDone} />
);

// docs/specs/016-platform/web-performance.md: Avatar mode loads on first use, a burst included.
describe('ReactionBurst', () => {
  it('asks for Avatar mode and plays once it lands', async () => {
    const { container } = render(burst());
    expect(calls).toEqual(['avatar-mode']);
    expect(container.innerHTML).toBe('');
    await act(async () => settle!({ ReactionBurst: () => <i>burst</i> }));
    expect(container.innerHTML).toBe('<i>burst</i>');
  });

  it('is over at once when its family cannot load, so it never plays late', async () => {
    setKindFamilyFailureHandler(() => {});
    const onDone = vi.fn<() => void>();
    const { container } = render(burst(onDone));
    await act(async () => fail!(new Error('offline')));
    expect(container.innerHTML).toBe('');
    expect(onDone).toHaveBeenCalled();
  });
});
