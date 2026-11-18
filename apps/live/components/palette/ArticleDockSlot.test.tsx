// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArticleDockSlot } from './ArticleDockSlot';
import { setArticleDockFilled, useArticleDock } from '@/lib/article/article-dock';
import { ARTICLE_DOCK_ROW } from '@/components/canvas/article/article-dock-row';

// docs/specs/007-editor/toolbar-layout.md "Motion": the article's formatting arrives with its editor, a chunk of its
// own, after the strip is drawn. The slot holds the row's place, invisible, until then, and lets it go in the commit
// the controls dock: the strip is drawn at its final width from the first frame.

afterEach(() => {
  cleanup();
  act(() => setArticleDockFilled(false));
});

const reserve = () => document.querySelector<HTMLElement>('[data-article-dock-reserve]');

// A stand-in for the page toolbar docking: its controls in the slot, and the slot told so before the frame is drawn.
function Toolbar() {
  const dock = useArticleDock();
  useLayoutEffect(() => {
    if (!dock) return;
    setArticleDockFilled(true);
    return () => setArticleDockFilled(false);
  }, [dock]);
  return dock ? createPortal(<div data-page-toolbar="">controls</div>, dock) : null;
}

describe('ArticleDockSlot', () => {
  it("holds the row's place, invisible and out of reach, until the controls dock", () => {
    render(<ArticleDockSlot />);
    const held = reserve()!;
    expect(held).not.toBeNull();
    expect(held.className).toContain('invisible');
    expect(held.getAttribute('aria-hidden')).toBe('true');
    expect(held.hasAttribute('inert')).toBe(true);
    // Every place of the docked row, in its order.
    const places = [...held.children].map((c) => (c as HTMLElement).dataset.reserve ?? 'divider');
    expect(places).toEqual([...ARTICLE_DOCK_ROW]);
  });

  it('lets the place go in the commit the controls dock, and holds it again when they leave', () => {
    const view = render(
      <>
        <ArticleDockSlot />
        <Toolbar />
      </>,
    );
    expect(document.querySelector('[data-article-dock] [data-page-toolbar]')).not.toBeNull();
    expect(reserve()).toBeNull();
    view.rerender(<ArticleDockSlot />);
    expect(reserve()).not.toBeNull();
  });
});
