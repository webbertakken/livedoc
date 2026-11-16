'use client';

// Convert to Text (docs/specs/023-draw-mode/ink-to-text.md): the selected pen strokes, read by the photo import's
// reader, become one text element in the handwriting font, in one edit (one undo puts the ink back). An Editor's
// action, offered only on a selection of unlocked pen strokes; a failed or empty read changes nothing and says so.
import { useRef } from 'react';
import type { Element, Tab } from '@livedoc/document';
import { inkSelection } from '@/lib/ink-to-text/ink-selection';
import { track } from '@/lib/telemetry';
import { debugLog } from '@/lib/debug-log';
import { useLatest } from '@/hooks/ui/useLatest';

export type InkToTextDeps = {
  activeTab: Tab;
  // The selection's ids, read when asked (one stroke or a multi-selection).
  selectionIds: () => ReadonlySet<string>;
  // Elements on a hidden or locked layer (docs/specs/006-document/layers.md): never ink to convert.
  layerLockedIds: ReadonlySet<string>;
  commit: (mapElements: (els: Element[]) => Element[]) => void;
  readOnly: boolean;
  // Edits blocked, or the active layer hidden or locked: nothing may be created.
  createBlocked: boolean;
  // A model is configured: the hosted reader first, the device's when the budget is spent.
  aiEnabled: boolean;
  ownerId: string;
  toast: { info: (message: string) => void; error: (message: string) => void };
  // Selects the new text element alone.
  selectOnly: (id: string) => void;
};

const READING = 'Reading your handwriting…';
const NO_WORDS = 'No words could be read in that handwriting.';
const FAILED = 'The handwriting could not be read just now. Try again in a moment.';
const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const CHANGED = 'The handwriting changed while it was being read.';

export function useInkToText(deps: InkToTextDeps) {
  const live = useLatest(deps);
  const reading = useRef(false);

  const inkNow = () => {
    const d = live.current;
    if (d.readOnly || d.createBlocked) return null;
    return inkSelection(d.activeTab.elements, d.selectionIds(), d.layerLockedIds);
  };

  const fail = (message: string, why: string) => {
    console.warn(`[ink-to-text] ${why}`);
    track('Error', 'Warning', 'InkToText');
    live.current.toast.error(message);
  };

  const convertToText = async (): Promise<void> => {
    if (reading.current) return;
    const ink = inkNow();
    if (!ink) return;
    reading.current = true;
    const ids = new Set(ink.map((s) => s.id));
    try {
      // The picture, the reader and the edit load at the first conversion: out of the editor's first load.
      let lazy: typeof import('@/lib/ink-to-text/read-ink');
      try {
        lazy = await import('@/lib/ink-to-text/read-ink');
      } catch (err) {
        return fail(FAILED, `the reader did not load: ${reasonOf(err)}`);
      }
      const image = lazy.inkImage(lazy.inkPolylines(ink));
      if (!image) return fail(FAILED, 'no 2D canvas to draw the ink on');
      live.current.toast.info(READING);
      let words = '';
      try {
        const { read } = lazy.selectReader({
          aiEnabled: live.current.aiEnabled,
          ownerId: live.current.ownerId,
        });
        const result = await read([{ id: 1, image }], {});
        const answer = result.textById.get(1);
        if (!answer && result.failure) return fail(FAILED, `the reader failed: ${result.failure}`);
        words = answer?.legible ? answer.text.trim() : '';
      } catch (err) {
        return fail(FAILED, `the reader failed: ${reasonOf(err)}`);
      }
      if (!words) return fail(NO_WORDS, 'the reader found no words');
      // The ink as it is now: removed, locked or moved onto a locked layer while it was read, it is left alone.
      const d = live.current;
      const still = inkSelection(d.activeTab.elements, ids, d.layerLockedIds);
      if (!still || d.readOnly || d.createBlocked)
        return fail(CHANGED, 'the ink changed while it was read');
      const text = lazy.inkTextElement(still, words, crypto.randomUUID());
      d.commit((els) => lazy.replaceInk(els, ids, text));
      d.selectOnly(text.id);
      track('AI', 'Used', 'InkToText');
      debugLog(`[ink-to-text] converted ${ids.size} strokes into ${words.length} characters`);
    } finally {
      reading.current = false;
    }
  };

  return { canConvertToText: () => inkNow() !== null, convertToText };
}
