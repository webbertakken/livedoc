// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "What it is, and is not", "The setting", "Accessibility", "Telemetry and
// observability", "Errors": one setting, offered in the dark scheme alone and never under forced colours, live from
// wherever it is flipped, counted before it is kept, and said when it could not be kept.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAppearance } from '@livedoc/ui';
import { track } from '@/lib/telemetry';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';
import { DARK_PAGES } from './pdf-menus';
import { DARK_PAGES_NOT_SAVED_COPY, keepDarkPages, usePdfDarkPages } from './usePdfDarkPages';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let forced = false;
beforeEach(() => {
  localStorage.clear();
  forced = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(forced-colors: active)' ? forced : query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  setAppearance('dark');
  vi.mocked(track).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const render = (onProblem = vi.fn()) => ({
  onProblem,
  ...renderHook(() => usePdfDarkPages({ ownerId: null, onProblem })),
});

describe('the Dark pages setting', () => {
  it('stands unasked at first: offered in the dark scheme, the pages paper', () => {
    const { result } = render();
    expect(result.current.setting).toBeUndefined();
    expect(result.current.offered).toBe(true);
    expect(result.current.look).toBe('paper');
    expect(result.current.actions[DARK_PAGES]?.checked).toBe(false);
  });

  it('turns on from its item, counted before it is kept, and the pages show dark', () => {
    const { result } = render();
    act(() => result.current.actions[DARK_PAGES]!.run());
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'DarkPagesOn');
    expect(readUserPreferences().pdfDarkPages).toBe(true);
    expect(result.current.look).toBe('dark');
    expect(result.current.actions[DARK_PAGES]?.checked).toBe(true);
    act(() => result.current.actions[DARK_PAGES]!.run());
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'DarkPagesOff');
    expect(result.current.look).toBe('paper');
  });

  it('follows a flip made elsewhere (Settings, another tab) without a reload', () => {
    const { result } = render();
    act(() => writeUserPreferences({ ...readUserPreferences(), pdfDarkPages: true }));
    expect(result.current.look).toBe('dark');
  });

  it('is not offered in the light scheme, where the pages are paper whatever it says', () => {
    keepDarkPages(true, null);
    setAppearance('light');
    const { result } = render();
    expect(result.current.offered).toBe(false);
    expect(result.current.look).toBe('paper');
    expect(result.current.actions[DARK_PAGES]).toBeUndefined();
  });

  it('is not offered where the system forces its colours', () => {
    forced = true;
    keepDarkPages(true, null);
    const { result } = render();
    expect(result.current.offered).toBe(false);
    expect(result.current.look).toBe('paper');
  });

  it('keeps a choice that could not be saved for this open, and says so', () => {
    const { result, onProblem } = render();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    act(() => result.current.choose(true));
    setItem.mockRestore();
    expect(onProblem).toHaveBeenCalledWith(DARK_PAGES_NOT_SAVED_COPY);
    expect(result.current.look).toBe('dark');
    act(() => result.current.choose(false));
    expect(result.current.look).toBe('paper');
    expect(readUserPreferences().pdfDarkPages).toBe(false);
  });
});

describe('the page as first drawn', () => {
  it('shows paper before there is a browser to ask', () => {
    function Look() {
      return <i data-look={usePdfDarkPages({ ownerId: null, onProblem: () => {} }).look} />;
    }
    expect(renderToString(<Look />)).toContain('data-look="paper"');
  });
});
