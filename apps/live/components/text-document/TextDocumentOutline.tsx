'use client';

// The outline's body (docs/specs/034-text-documents/links-and-navigation.md "The outline"): the current tab's
// headings, indented by level, following the writing as anyone changes it; a press puts the caret at a heading's start
// and brings it to the top of the view. The office shell's left panel frames it.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Style } from '@livedoc/text-documents';
import type { TextDocumentChanges } from '@/lib/text-document/text-document-changes';
import {
  textDocumentHeadings,
  type TextDocumentHeading,
} from '@/lib/text-document/text-document-outline';

export const OUTLINE_EMPTY = 'Headings you add to the document will appear here.';

// Indent per level below the first, in px.
const LEVEL_INDENT_PX = 12;

function goTo(view: EditorView, heading: TextDocumentHeading) {
  const { doc } = view.state;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, heading.pos)));
  const { node } = view.domAtPos(heading.pos);
  const element = node instanceof Element ? node : node.parentElement;
  element?.closest('p')?.scrollIntoView?.({ block: 'start' });
  view.focus();
}

export function TextDocumentOutline({
  view,
  changes,
  readStyles,
}: {
  view: EditorView | null;
  changes: TextDocumentChanges;
  // The live state's styles, read again as the writing changes.
  readStyles: () => readonly Style[];
}) {
  // The body as it is now, read again whenever anyone changes it; drawn with the panel, so its first heading can take
  // the focus the panel hands it.
  const doc = useSyncExternalStore(
    changes.subscribe,
    useCallback(() => view?.state.doc ?? null, [view]),
    () => null,
  );
  const headings = useMemo(
    () => (doc ? textDocumentHeadings(doc, readStyles()) : []),
    [doc, readStyles],
  );

  if (headings.length === 0)
    return <p className="px-2 py-1 text-sm text-(--office-muted)">{OUTLINE_EMPTY}</p>;
  return (
    <ul aria-label="Headings">
      {headings.map((heading) => (
        <li key={heading.pos}>
          <button
            type="button"
            onClick={() => view && goTo(view, heading)}
            style={{ paddingLeft: 8 + (heading.level - 1) * LEVEL_INDENT_PX }}
            className="block w-full truncate rounded py-1.5 pr-2 text-left text-sm outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          >
            {heading.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
