// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { layOutPages, type LaidOutPage } from '@livedoc/document';
import { currentPageIdNow, setCurrentPageKind } from '@/lib/current-page-kind';
import { useOpeningPageKind } from './useOpeningPageKind';

// docs/specs/007-editor/toolbar-layout.md "Motion": the page someone opens on sets the palette's kind before the first
// frame. The pages layer that finds the page in view is a chunk of its own and comes later, so until it does the
// tab's opening page stands in: an article's strip is drawn as an article's from its first frame.

afterEach(() => {
  cleanup();
  setCurrentPageKind(null);
});

const article = layOutPages([{ id: 'a', orientation: 'portrait', kind: 'article' }]);
const two = layOutPages([
  { id: 'x', orientation: 'portrait', kind: 'article' },
  { id: 'y', orientation: 'portrait' },
]);

// What a later sibling's layout effect sees: what the frame is drawn with.
const none = () => null;

function seenBeforePaint(
  pages: readonly LaidOutPage[],
  on: boolean,
  remembered: (pages: readonly LaidOutPage[]) => LaidOutPage | null = none,
): string | null {
  let seen: string | null = null;
  function Editor() {
    useOpeningPageKind(pages, on, remembered);
    return null;
  }
  function Strip() {
    useLayoutEffect(() => {
      seen = currentPageIdNow();
    }, []);
    return null;
  }
  render(
    <>
      <Editor />
      <Strip />
    </>,
  );
  return seen;
}

describe('useOpeningPageKind', () => {
  it("sets the tab's opening page before the frame is drawn", () => {
    expect(seenBeforePaint(article, true)).toBe('a');
  });

  it('opens on the page someone was last on, where the view lands', () => {
    expect(seenBeforePaint(two, true, (pages) => pages[1] ?? null)).toBe('y');
  });

  it('keeps a page of this tab someone is already on', () => {
    setCurrentPageKind('infographic', 'y');
    expect(seenBeforePaint(two, true)).toBe('y');
  });

  it("replaces another tab's page", () => {
    setCurrentPageKind('logo', 'elsewhere');
    expect(seenBeforePaint(two, true)).toBe('x');
  });

  it('sets nothing off Pages mode', () => {
    expect(seenBeforePaint(article, false)).toBeNull();
  });
});
