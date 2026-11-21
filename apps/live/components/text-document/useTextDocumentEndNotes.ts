// The notes drawn under the writing where there are no pages (docs/specs/034-text-documents/page-layout.md
// "Footnotes", "Pageless"): every mark's note in the order of the marks, at the writing's width; read again when the
// writing changes, and the same list while its notes and width are.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { EditorView } from 'prosemirror-view';
import { FOOTNOTE } from '@livedoc/text-documents';
import { storyKey } from '@/lib/text-document/pagination/pagination-headers';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';

const NONE: readonly PageNote[] = [];

/** Each mark's note in order, numbered from 1, at `width` (CSS pixels). */
export function endNotesOf(view: EditorView, width: number): PageNote[] {
  const notes: PageNote[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name !== FOOTNOTE) return true;
    const story = (node.attrs as { story: unknown }).story;
    if (typeof story === 'string')
      notes.push({ story, key: storyKey(story, width), number: notes.length + 1, left: 0, width });
    return false;
  });
  return notes;
}

const said = (notes: readonly PageNote[]) => notes.map((n) => n.key).join(',');

export function useTextDocumentEndNotes(
  view: EditorView | null,
  shown: boolean,
  subscribe: (listener: () => void) => () => void,
): readonly PageNote[] {
  const last = useRef<{ said: string; notes: readonly PageNote[] }>({ said: '', notes: NONE });
  const read = useCallback((): readonly PageNote[] => {
    if (!view || !shown || view.isDestroyed) return NONE;
    const width = Number.parseFloat(getComputedStyle(view.dom).width) || 0;
    const notes = endNotesOf(view, width);
    const now = said(notes);
    if (now !== last.current.said) last.current = { said: now, notes };
    return last.current.notes;
  }, [view, shown]);
  return useSyncExternalStore(subscribe, read, () => NONE);
}
