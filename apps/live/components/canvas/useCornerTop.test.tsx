// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCornerTop } from './useCornerTop';

// docs/specs/021-event-storming/suggestions.md "The suggestions corner": below a phone's strip.
afterEach(() => {
  document.body.innerHTML = '';
});

function mountStrip(rect: DOMRect) {
  const root = document.createElement('div');
  root.setAttribute('data-toolbar-palette', '');
  const card = document.createElement('div');
  card.setAttribute('data-tour-id', 'palette');
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect);
  root.append(card);
  document.body.append(root);
}

describe('useCornerTop', () => {
  it('is 64 px with no strip on screen', () => {
    expect(renderHook(() => useCornerTop()).result.current).toBe(64);
  });

  it('starts below a strip that reaches the corner', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    mountStrip(new DOMRect(12, 66, 366, 46));
    expect(renderHook(() => useCornerTop()).result.current).toBe(152);
    vi.restoreAllMocks();
  });
});
