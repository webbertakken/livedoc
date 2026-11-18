'use client';

// The page someone opens on, until the pages layer finds the page in view (docs/specs/007-editor/toolbar-layout.md
// "Motion"; docs/specs/007-editor/pages-mode.md "The palette's kind"). The palette's kind is the page someone is on's,
// and the pages layer that says which (useLogoPaletteSwitch) is a chunk of its own, loaded after the strip is drawn:
// without a page the strip was drawn as an infographic's, then changed to an article's dock a moment later. Set before
// the frame is drawn, from the tab's own pages, whenever the page known is not one of this tab's: the page the view
// lands on, the one someone was last on (`remembered`, useLastPage) or else the first. The pages layer still has
// the last word once the page in view is known.
import { useLayoutEffect } from 'react';
import { pageKindOf, type LaidOutPage } from '@livedoc/document';
import { currentPageIdNow, setCurrentPageKind } from '@/lib/current-page-kind';

export function useOpeningPageKind(
  pages: readonly LaidOutPage[],
  on: boolean,
  remembered: (pages: readonly LaidOutPage[]) => LaidOutPage | null | undefined,
): void {
  useLayoutEffect(() => {
    if (!on) return;
    const known = currentPageIdNow();
    if (known !== null && pages.some((p) => p.id === known)) return;
    const opening = remembered(pages) ?? pages[0];
    if (opening) setCurrentPageKind(pageKindOf(opening), opening.id);
  }, [pages, on, remembered]);
}
