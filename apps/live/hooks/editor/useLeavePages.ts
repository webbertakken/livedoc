// Leaving Pages on a tab with articles (docs/specs/007-editor/article-pages.md "Leaving
// Pages"): Diagram and Draw draw no pages and no writing, so an editor's switch away asks
// first. Convert turns every article into Page elements (measured from the writing as laid out
// now) in the same tab edit as the switch; Keep switches with the articles left as they are, for Pages;
// Cancel stays. A tab with content but no articles asks a lighter question, a confirmation beside
// the mode switch (docs/specs/007-editor/editor-modes.md "Leaving Pages"): its pages do not
// show in Diagram or Draw, so what is on them may not look the same; Switch or Cancel. A visitor, a
// locked tab or an empty tab switches straight away. An article with a locked page is held as it is
// (docs/specs/007-editor/pages-mode.md "Locking a page"): Convert leaves it an article, and a
// tab whose articles are all held asks only the lighter question.
import { useCallback, useMemo, useState } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import {
  articlesOf,
  withArticleFlow,
  type ArticleBlock,
  type EditorMode,
  type Tab,
} from '@livedoc/document';
import { articleHandleOf } from '@/lib/article/article-editor-store';
import { articleLocked } from '@/lib/article/article-lock';
import { debugLog } from '@/lib/debug-log';
import { isKindFamilyLoaded, loadKindFamily, requireKindFamily } from '@/lib/element-kinds/store';
import { track } from '@/lib/telemetry';

export type LeavePages = {
  // The mode asked for while the articles question is open.
  pending: EditorMode | null;
  // The mode asked for while the lighter confirmation is open (pages, no articles).
  confirming: EditorMode | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  convert: () => void;
  keep: () => void;
  cancel: () => void;
};

export function useLeavePages<
  M extends { mode: EditorMode; setMode: (m: EditorMode, alsoChange?: (t: Tab) => Tab) => void },
>(
  editorMode: M,
  deps: { tab: Tab | undefined; canEdit: boolean },
): { editorMode: M; leave: LeavePages } {
  const { tab, canEdit } = deps;
  const [pending, setPending] = useState<EditorMode | null>(null);
  const [confirming, setConfirming] = useState<EditorMode | null>(null);
  const { mode, setMode: rawSet } = editorMode;
  // The tab as it is now, read when a switch is asked for: the mode's value keeps its identity through edits of the
  // tab, as the context around the canvas must (docs/specs/008-canvas/canvas-performance.md "The contexts around the
  // element layer hold still").
  const latest = useLatest({ mode, canEdit, tab });
  const setMode = useCallback(
    (next: EditorMode) => {
      const { mode, canEdit, tab } = latest.current;
      const leaving =
        mode === 'pages' && next !== 'pages' && canEdit && !!tab && tab.locked !== true;
      const flows = leaving ? Object.keys(articlesOf(tab)) : [];
      if (leaving && flows.some((flow) => !articleLocked(tab, flow))) setPending(next);
      else if (leaving && (tab.elements.length > 0 || flows.length > 0)) setConfirming(next);
      else rawSet(next);
    },
    [rawSet, latest],
  );
  const switchable = useMemo(() => ({ ...editorMode, setMode }), [editorMode, setMode]);
  // Turning articles into pages is the pages family's (docs/specs/016-platform/web-performance.md "An element kind's
  // code loads with the board that holds it"), in whenever the writing is drawn; the question stays open, and the
  // notice shows, if it cannot load.
  const convert = () => {
    if (!pending || !tab) return;
    if (isKindFamilyLoaded('pages-articles')) {
      turnIntoPages(pending, tab);
      return;
    }
    void loadKindFamily('pages-articles', 'element').then((loaded) => {
      if (loaded) turnIntoPages(pending, tab);
      else debugLog('[article] articles not turned into pages: the pages family did not load');
    });
  };
  const turnIntoPages = (to: EditorMode, from: Tab) => {
    const { withArticlesAsPages } = requireKindFamily('pages-articles');
    const splits = new Map<string, string[][]>();
    const typed = new Map<string, ArticleBlock[]>();
    for (const flow of Object.keys(articlesOf(from))) {
      // A held article stays as it is: its writing is neither taken nor turned.
      if (articleLocked(from, flow)) continue;
      const handle = articleHandleOf(flow);
      if (!handle) continue;
      // What is being typed goes into the pages too, in the same edit (one undo step).
      typed.set(flow, handle.takeBlocks());
      splits.set(flow, handle.blocksByPage());
    }
    track('Tab', 'Changed', 'ArticlesToPages');
    // The articles turned into pages and the switch are one tab edit: one undo puts the tab back in
    // Pages with its articles (docs/specs/007-editor/editor-modes.md "Where the mode lives").
    rawSet(to, (t) => {
      let next = t;
      for (const [flow, blocks] of typed) {
        const doc = articleLocked(next, flow) ? undefined : articlesOf(next)[flow];
        if (doc)
          next = withArticleFlow(next, flow, doc.style ? { blocks, style: doc.style } : { blocks });
      }
      return withArticlesAsPages(next, splits);
    });
    debugLog('[article] articles turned into pages', {
      tabId: from.id,
      articles: splits.size,
      held: Object.keys(articlesOf(from)).filter((flow) => articleLocked(from, flow)).length,
    });
    setPending(null);
  };
  const keep = () => {
    if (pending) rawSet(pending);
    setPending(null);
  };
  const cancel = () => setPending(null);
  const confirmSwitch = () => {
    if (confirming) {
      track('Editor', 'Changed', 'LeavePagesConfirmed');
      rawSet(confirming);
    }
    setConfirming(null);
  };
  const cancelSwitch = () => setConfirming(null);
  return {
    editorMode: switchable,
    leave: { pending, convert, keep, cancel, confirming, confirmSwitch, cancelSwitch },
  };
}
