// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasProps } from './Canvas.types';

let settle: ((m: unknown) => void) | null = null;
const calls: string[] = [];
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    'avatar-mode': () => {
      calls.push('avatar-mode');
      return new Promise((resolve) => (settle = resolve));
    },
  },
  KIND_FAMILY_IDS: ['avatar-mode'],
}));

const { useCanvasAvatar } = await import('./useCanvasAvatar');
const { resetKindFamiliesForTests } = await import('@/lib/element-kinds/store');

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  calls.length = 0;
});

const props = (remoteAvatars: unknown[] = []) =>
  ({
    remoteAvatars,
    selfParticipant: { id: 'me', name: 'Me', color: '#0af' },
    activeTabId: 't',
    portalTabs: [],
  }) as unknown as CanvasProps;

const render = (canvasTool: CanvasProps['canvasTool'], remoteAvatars: unknown[] = []) =>
  renderHook(() =>
    useCanvasAvatar({
      props: props(remoteAvatars),
      canvasTool,
      elements: [],
      tabLayers: [],
      mainRef: createRef<HTMLElement>() as CanvasProps['mainRef'],
      wrapperRef: createRef<HTMLDivElement>(),
      viewportOffset: { x: 0, y: 0 },
      viewportZoom: 1,
      setViewportOffset: () => {},
      readZoom: () => 1,
    }),
  );

// docs/specs/016-platform/web-performance.md: Avatar mode loads on first use.
describe('useCanvasAvatar', () => {
  it('asks for nothing, and draws no Avatar mode face, off Avatar mode with nobody walking', () => {
    const { result } = render('select');
    expect(calls).toEqual([]);
    expect(result.current.avatarModeIn).toBe(false);
  });

  it('asks for the family on picking Avatar, its faces drawn once it lands', async () => {
    const { result } = render('avatar');
    expect(calls).toEqual(['avatar-mode']);
    expect(result.current.avatarModeIn).toBe(false);
    await act(async () => settle!({ fenceSegments: () => [] }));
    expect(result.current.avatarModeIn).toBe(true);
  });

  it('asks for the family for a peer’s character', () => {
    render('select', [{ name: 'Ann', color: '#f0a', avatar: { x: 0, y: 0 } }]);
    expect(calls).toEqual(['avatar-mode']);
  });
});
