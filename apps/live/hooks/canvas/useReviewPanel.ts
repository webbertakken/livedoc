'use client';

import { useEffect, useMemo, useRef } from 'react';
import { isBoxed, termRename, type ElementId, type Tab } from '@livedoc/document';
import { readBoard, type StormReading } from '@livedoc/storm-reading';
import type { ReviewPanelActs } from '@/components/canvas/review/ReviewPanel';
import type { ReviewActions } from '@/hooks/canvas/useReviewActions';
import { useStableObject } from '@/hooks/ui/useStableObject';
import { debugLog } from '@/lib/debug-log';
import {
  closeReview,
  setReviewRings,
  setReviewTab,
  useReviewView,
  type ReviewTab,
  type ReviewView,
} from '@/lib/review-view';
import { openAnswer } from '@/lib/structure-view';
import {
  endSuggestionPreview,
  parsePreviewKey,
  previewSuggestion,
  suggestionViewFor,
  termKey,
} from '@/lib/suggestion-view';
import { track } from '@/lib/telemetry';

// The Review panel's working parts, whatever shell draws it (docs/specs/021-event-storming/board-review.md): the
// board's reading while the panel is open (never while it is closed), and what its tabs do to the person's view:
// ring notes and bring them into view, open a hotspot's answer, preview a renamed term. Its writes are the review
// acts'. The view is the person's own; nothing here is shared.

type Rect = { x: number; y: number; width: number; height: number };

export function useReviewPanel({
  tab,
  acts,
  inertIds,
  reveal,
}: {
  tab: Tab;
  acts: ReviewActions;
  // Elements that may not change: locked, or on a hidden or locked layer.
  inertIds: ReadonlySet<ElementId>;
  // Pans the board so a rectangle of it is in view.
  reveal: (rect: Rect) => void;
}): {
  view: ReviewView;
  // The board's reading while the panel is open; null while it is closed, when nothing is read.
  reading: StormReading | null;
  setTab: (tab: ReviewTab) => void;
  panelActs: ReviewPanelActs;
} {
  const view = useReviewView(tab.id);
  const reading = useMemo(() => (view.open ? readBoard(tab) : null), [view.open, tab]);
  // The panel goes with its board.
  useEffect(() => () => closeReview(tab.id), [tab.id]);
  // Walking the story counts once per opening of the Story tab.
  const walked = useRef(false);
  useEffect(() => {
    walked.current = false;
  }, [view.open, view.tab]);

  const boundsOf = (ids: readonly ElementId[]): Rect | null => {
    const wanted = new Set(ids);
    const boxes = tab.elements.filter(isBoxed).filter((el) => wanted.has(el.id));
    if (boxes.length === 0) return null;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    return {
      x: left,
      y: top,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - top,
    };
  };
  const bring = (ids: readonly ElementId[]) => {
    const rect = boundsOf(ids);
    if (rect) reveal(rect);
  };

  const panelActs = useStableObject<ReviewPanelActs>({
    ring: (ids, dim) => {
      setReviewRings(tab.id, ids, dim);
      bring(ids);
    },
    add: acts.addForGap,
    answer: (hotspotId) => {
      openAnswer(tab.id, hotspotId);
      bring([hotspotId]);
    },
    previewRename: (ask) => {
      if (ask) return previewSuggestion(tab.id, termKey(ask.from, ask.to, ask.scope));
      // Only a term's preview is this panel's to end: a suggestion pointed at keeps its own.
      if (parsePreviewKey(suggestionViewFor(tab.id).previewKey)?.type === 'term')
        endSuggestionPreview(tab.id);
    },
    renameWouldChange: ({ from, to, scope }) => {
      const change = termRename(tab.elements, from, to, scope, inertIds);
      return change.notes.length + change.contexts.length > 0;
    },
    rename: ({ from, to, scope }) => acts.renameTerm(from, to, scope),
    storyWalked: () => {
      if (walked.current) return;
      walked.current = true;
      track('Canvas', 'Used', 'StoryWalked');
      debugLog('[review] story walked');
    },
  });

  return { view, reading, setTab: (next) => setReviewTab(tab.id, next), panelActs };
}
