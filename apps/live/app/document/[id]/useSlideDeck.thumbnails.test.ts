// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

// docs/specs/016-platform/web-performance.md "Work only when it can change what shows": every editor holds the
// deck, but its slide pictures show only in the Slide Deck panel, so an edit with the panel closed draws none.
const drawn = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/lib/slide-thumb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/slide-thumb')>();
  return {
    ...actual,
    slideThumbFor: (...args: Parameters<typeof actual.slideThumbFor>) => {
      drawn.count += 1;
      return actual.slideThumbFor(...args);
    },
  };
});
vi.mock('@/lib/telemetry', () => ({ track: () => {} }));

import { useSlideDeck } from './useSlideDeck';

const tabWith = (x: number) =>
  [
    {
      id: 't',
      name: 'Tab',
      elements: [
        { id: 'a', type: 'shape', shape: 'square', x, y: 0, width: 100, height: 60, label: 'A' },
      ],
    },
  ] as unknown as Tab[];

describe('useSlideDeck slide pictures', () => {
  it('draws none as the board changes', () => {
    let tabs = tabWith(0);
    const { result, rerender } = renderHook(() =>
      useSlideDeck({
        prefs: {},
        commitPrefs: () => {},
        tabs,
        activeTabId: 't',
        setActiveId: () => {},
        readSelection: () => ({ selectedId: 'a', multiSelectedIds: new Set<string>() }) as never,
        setSelectedId: () => {},
        setMultiSelectedIds: () => {},
        isReadOnly: false,
      }),
    );
    act(() => result.current.newSlideFromSelection());
    expect(result.current.deck.slides).toHaveLength(1);
    for (let x = 10; x <= 50; x += 10) {
      tabs = tabWith(x);
      rerender();
    }
    expect(drawn.count).toBe(0);
    // The panel draws them from the deck's own tabs when it opens.
    expect(result.current.tabs).toBe(tabs);
  });
});
