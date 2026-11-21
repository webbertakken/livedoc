'use client';

// Tools > Line numbers (docs/specs/034-text-documents/page-layout.md "Line numbers", "The panel"): each section's line
// numbers and the section the caret is in, read again as the caret moves or the writing changes; a choice applied at
// once over the scope chosen, counted when it changed something. An Editor's only (the panel is offered to no other).
import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { LineNumbers, Section } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { sectionAt } from '@/lib/text-document/pagination/pagination-sections';
import {
  applyLineNumbers,
  sectionLineNumbers,
  type LineNumbersChoice,
} from '@/lib/text-document/text-document-line-numbers';

/** What the panel shows: each section's line numbers and the caret's section. */
export type LineNumbersState = {
  readonly own: readonly (LineNumbers | undefined)[];
  readonly section: number;
};

const NONE: LineNumbersState = { own: [undefined], section: 0 };

const sameState = (a: LineNumbersState, b: LineNumbersState) =>
  a.section === b.section && JSON.stringify(a.own) === JSON.stringify(b.own);

export function useTextDocumentLineNumbers({
  view,
  liveDoc,
  format,
  writes,
  first,
  subscribe,
}: {
  view: EditorView | null;
  liveDoc: RefObject<Y.Doc | null>;
  format: TextDocumentFormat;
  writes: boolean;
  // The first section, read live: its line numbers changing reads them again.
  first: Section;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
}) {
  const read = useCallback((): LineNumbersState => {
    const doc = liveDoc.current;
    if (!view || view.isDestroyed || !doc) return { ...NONE, own: [first.lineNumbers] };
    return {
      own: sectionLineNumbers(view, doc, format),
      section: sectionAt(view.state.doc, view.state.selection.from),
    };
  }, [view, liveDoc, format, first]);
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState((was) => (sameState(was, read()) ? was : read()));
    update();
    return subscribe(update);
  }, [read, subscribe]);

  const choose = useCallback(
    (choice: Omit<LineNumbersChoice, 'section'>) => {
      const doc = liveDoc.current;
      if (!writes || !doc || !view || view.isDestroyed) return;
      const section = sectionAt(view.state.doc, view.state.selection.from);
      if (applyLineNumbers(view, doc, format, { ...choice, section }) > 0)
        track('Tab', 'Changed', 'TextDocumentLineNumbers');
    },
    [liveDoc, view, format, writes],
  );

  return { state, choose };
}
