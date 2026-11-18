'use client';

// The Toolbar strip's slot for an article's formatting (docs/specs/007-editor/article-pages.md "The
// page toolbar"): while the palette's kind is Article the page toolbar renders its controls here,
// at the strip's own sizes, rather than over the page (lib/article/article-dock.ts). The controls
// come with the article's editor, a chunk of its own, after the strip is drawn: until they dock, the
// slot holds their place (ArticleDockReserve), so the strip never grows, or takes a row of its own,
// a moment after it opens (docs/specs/007-editor/toolbar-layout.md "Motion").
import { useCallback } from 'react';
import { setArticleDock, useArticleDockFilled } from '@/lib/article/article-dock';
import { STRIP_RAIL_SCROLL } from '@/components/chrome/toolbar-surface';
import { ArticleDockReserve } from '@/components/canvas/article/article-dock-row';

export function ArticleDockSlot() {
  const ref = useCallback((el: HTMLDivElement | null) => setArticleDock(el), []);
  const filled = useArticleDockFilled();
  // The strip's rail: on a phone's row it gives way and scrolls, as the category bar does. The
  // controls dock in the inner box, which lays them out as the rail's own (`contents`).
  return (
    <div
      data-article-dock=""
      data-strip-rail=""
      className={`flex items-center ${STRIP_RAIL_SCROLL}`}
    >
      <div ref={ref} className="contents" />
      {filled ? null : <ArticleDockReserve />}
    </div>
  );
}
